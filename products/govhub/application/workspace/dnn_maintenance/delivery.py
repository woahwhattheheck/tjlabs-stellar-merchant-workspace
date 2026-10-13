"""Complete source and private workspace delivery over the existing streamed backup."""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import tempfile
import zipfile

from .model import canonical, digest, ordinary, read_member, zip_members, SHA

ROOT = Path(__file__).resolve().parent
PREFIX = "DNN_Maintenance_Desk"
PRODUCT_FILES = (
    "__init__.py", "model.py", "service.py", "desk.py", "delivery.py", "archive_custody.py", "build.py",
    "native.ps1", "native-host.ps1", "native-upgrade.ps1", "CONNECTION_TEMPLATE.json",
    "README.md", "NATIVE_OPERATOR.md", "RECEIVING.md", "PRIMARY_SOURCES.json",
    "engine-lock.json", "LICENSE.txt", "THIRD_PARTY_NOTICES.md",
    "web/index.html", "web/desk.js", "web/desk.css",
)
COMMERCIAL_FILES = ("WORKSHARE_SCOPE.md", "RECEIVING_INPUT_MAP.md", "receiving-inputs.json")

def utc():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def fail(message):
    raise ValueError(message)

def file_hash(path):
    h, count = hashlib.sha256(), 0
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
            count += len(block)
    return h.hexdigest(), count

def regular(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        fail("Use the original regular source file: " + str(path))
    return path

def git_blob(path):
    path = regular(path)
    h = hashlib.sha1(("blob " + str(path.stat().st_size) + "\0").encode())
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def source_entries(engine):
    engine = Path(engine).resolve()
    lock = json.loads(regular(ROOT / "engine-lock.json").read_bytes())
    entries = {}
    for item in lock["files"]:
        name = ordinary(item["path"])
        source = regular(engine / name)
        if source.stat().st_size != item["bytes"] or git_blob(source) != item["git_blob"]:
            fail("Install the exact maintained engine source for " + name)
        entries["application/engine/" + name] = source
    auditor = regular(engine.parent / "cutover.py")
    if git_blob(auditor) != lock["auditor"]["git_blob"]:
        fail("Install the original source's matching cutover.py dependency.")
    entries["application/cutover.py"] = auditor
    for name in PRODUCT_FILES:
        entries["application/engine/dnn_maintenance/" + name] = regular(ROOT / name)
    installed_commercial = engine.parent / "commercial"
    commercial = installed_commercial
    for name in COMMERCIAL_FILES:
        if (commercial / name).is_file():
            entries["application/commercial/" + name] = regular(commercial / name)
    entries["README.md"] = regular(ROOT / "README.md")
    entries["RECEIVING.md"] = regular(ROOT / "RECEIVING.md")
    return entries, lock

def add_file(archive, member, path):
    regular(path)
    before = path.stat()
    h, count = hashlib.sha256(), 0
    # Stored raw parts remain shared bytes when a later handover itself enters custody.
    entry = member
    if member.startswith(PREFIX + "/handover/parts/"):
        entry = zipfile.ZipInfo(member)
        entry.compress_type = zipfile.ZIP_STORED
    with path.open("rb") as source, archive.open(entry, "w", force_zip64=True) as target:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            target.write(block)
            h.update(block)
            count += len(block)
        after = os.fstat(source.fileno())
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or count != before.st_size:
        fail("An original source changed during its streamed handover: " + str(path))
    return {"path": member, "bytes": count, "sha256": h.hexdigest()}

def sync_dir(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)

def atomic_json(path, value, exclusive=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".pending", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(canonical(value))
            stream.flush()
            os.fsync(stream.fileno())
        if exclusive:
            os.link(temporary, path)
        else:
            os.replace(temporary, path)
        sync_dir(path.parent)
    finally:
        Path(temporary).unlink(missing_ok=True)

def archive_info(path):
    path = regular(path)
    with zipfile.ZipFile(path) as archive:
        members = dict(zip_members(archive, max_entries=200000, max_total=512 * 1024**3))
        manifest_name = PREFIX + "/DELIVERY_MANIFEST.json"
        if manifest_name not in members:
            fail("Choose the original complete DNN delivery ZIP.")
        manifest = json.loads(read_member(archive, members[manifest_name], 64 * 1024**2))
        if manifest.get("schema") != "commons.dnn-delivery/v1":
            fail("The delivery format is not supported by this receiver.")
        declared = {manifest_name}
        for item in manifest.get("files", []):
            name = ordinary(item["path"])
            if not name.startswith(PREFIX + "/") or name in declared or name not in members or not SHA.fullmatch(str(item.get("sha256", ""))):
                fail("The delivery manifest repeats or omits an original member.")
            declared.add(name)
            h, count = hashlib.sha256(), 0
            with archive.open(members[name]) as source:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    h.update(block)
                    count += len(block)
            if count != item["bytes"] or h.hexdigest() != item["sha256"]:
                fail("The original delivery member changed: " + name)
        if set(members) != declared:
            fail("The complete delivery has unindexed members.")
    sha, count = file_hash(path)
    return {"path": str(path), "filename": path.name, "sha256": sha, "bytes": count, "manifest": manifest}

def write_archive(path, entries, metadata):
    path = Path(path)
    if not path.is_absolute() or path.exists():
        fail("Choose a new absolute complete archive path.")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".pending", dir=path.parent)
    os.close(descriptor)
    try:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
            manifest = {"schema": "commons.dnn-delivery/v1", "created_at": utc(), **metadata, "files": []}
            for name, source in sorted(entries.items()):
                manifest["files"].append(add_file(archive, PREFIX + "/" + ordinary(name), source))
            source_rows = [row for row in manifest["files"] if row["path"].startswith(PREFIX + "/application/")]
            manifest["source_digest"] = digest(source_rows)
            archive.writestr(PREFIX + "/DELIVERY_MANIFEST.json", canonical(manifest))
        with Path(temporary).open("rb") as stream:
            os.fsync(stream.fileno())
        os.link(temporary, path)
        sync_dir(path.parent)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return archive_info(path)

def build_source(engine, output):
    entries, lock = source_entries(engine)
    return write_archive(output, entries, {"kind": "source", "engine_commit": lock["commit"]})

def export_workspace(workspace, engine, output, operation=None):
    output = Path(output)
    if not output.is_absolute() or output.exists():
        fail("Choose a new absolute workspace handover ZIP.")
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if output.parent.resolve().is_relative_to(workspace.root):
        fail("Save complete workspace handovers outside the live workspace directory.")
    entries, lock = source_entries(engine)
    with tempfile.TemporaryDirectory(prefix="dnn-handover-", dir=output.parent) as temporary:
        backup = Path(temporary) / "workspace"
        workspace.backup(backup)
        with sqlite3.connect("file:" + str(backup / "assessment.sqlite3") + "?mode=ro", uri=True) as db:
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                fail("The original coherent workspace copy did not reopen.")
            metadata = {key: json.loads(value) for key, value in db.execute("SELECT key,value FROM meta")}
            objects = db.execute("SELECT COUNT(*) FROM govhub_objects").fetchone()[0]
            original_files = db.execute("SELECT COUNT(*) FROM files").fetchone()[0]
            handovers = [dict(json.loads(row[1]), id=row[0]) for row in db.execute(
                "SELECT id,data FROM govhub_objects WHERE kind='dnn_handoff' ORDER BY seq")]
        from .archive_custody import export_entries
        export_entries(entries, workspace.root.parent / "dnn-handoffs" / metadata["workspace"]["id"],
                       handovers, metadata["workspace"]["id"])
        for directory, folders, names in os.walk(backup, followlinks=False):
            parent = Path(directory)
            if any((parent / name).is_symlink() for name in folders):
                fail("The original workspace copy contains a directory link.")
            for name in names:
                path = regular(parent / name)
                entries["workspace/" + path.relative_to(backup).as_posix()] = path
        result = write_archive(output, entries, {"kind": "workspace", "workspace": metadata["workspace"],
            "workspace_head": metadata["head"], "object_count": objects, "original_file_count": original_files,
            "engine_commit": lock["commit"], "historical_handovers": len(handovers), "operation": operation})
    return result

def restore_archive(archive_path, destination, intake):
    destination, intake = Path(destination), Path(intake)
    if not destination.is_absolute() or destination.exists() or not intake.is_absolute():
        fail("Choose a new absolute workspace and its separate intake directory.")
    if intake == destination or intake.is_relative_to(destination) or destination.is_relative_to(intake):
        fail("Keep the source intake outside the restored private workspace.")
    checked = archive_info(archive_path)
    manifest = checked["manifest"]
    if manifest.get("kind") != "workspace":
        fail("Restore the complete workspace edition of this delivery.")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix="dnn-restore-", dir=destination.parent) as temporary:
        root = Path(temporary)
        with zipfile.ZipFile(archive_path) as archive:
            for item in manifest["files"]:
                relative = item["path"][len(PREFIX) + 1:]
                path = root / ordinary(relative)
                path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                h, count = hashlib.sha256(), 0
                with archive.open(item["path"]) as source, path.open("xb") as output:
                    os.chmod(path, 0o600)
                    for block in iter(lambda: source.read(1024 * 1024), b""):
                        output.write(block)
                        h.update(block)
                        count += len(block)
                    output.flush()
                    os.fsync(output.fileno())
                if count != item["bytes"] or h.hexdigest() != item["sha256"]:
                    fail("A delivery member changed between inspection and receiving.")
        working = root / "workspace"
        with sqlite3.connect(working / "assessment.sqlite3") as db:
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                fail("The actual received SQLite workspace failed to reopen.")
            metadata = {key: json.loads(value) for key, value in db.execute("SELECT key,value FROM meta")}
            if metadata["workspace"]["id"] != manifest["workspace"]["id"] or metadata["head"] != manifest["workspace_head"]:
                fail("The received workspace identity differs from this original generation.")
            for sha, length in db.execute("SELECT DISTINCT sha256,bytes FROM files"):
                if file_hash(working / "sources" / sha) != (sha, length):
                    fail("A retained original workspace file does not match its source index.")
            handovers = [dict(json.loads(row[1]), id=row[0]) for row in db.execute(
                "SELECT id,data FROM govhub_objects WHERE kind='dnn_handoff' ORDER BY seq")]
            from .archive_custody import restore_entries
            restore_entries(root / "handover", destination.parent / "dnn-handoffs" / metadata["workspace"]["id"],
                            handovers, metadata["workspace"]["id"])
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='govhub_http_sessions'").fetchone():
                db.execute("DELETE FROM govhub_http_sessions")
            db.commit()
        application = destination.parent / ("DNN_Application_" + manifest["source_digest"][:16])
        if application.exists():
            for item in manifest["files"]:
                prefix = PREFIX + "/application/"
                if item["path"].startswith(prefix):
                    target = regular(application / ordinary(item["path"][len(prefix):]))
                    if file_hash(target) != (item["sha256"], item["bytes"]):
                        fail("A different receiving source occupies this application edition.")
        else:
            os.rename(root / "application", application)
            sync_dir(application.parent)
        os.chmod(working, 0o700)
        receipt = {"schema": "commons.dnn-restored/v1", "archive_sha256": checked["sha256"],
                   "workspace_id": metadata["workspace"]["id"], "workspace_head": metadata["head"],
                   "source_digest": manifest["source_digest"], "application": str(application),
                   "restored_at": utc(), "original_file_count": manifest["original_file_count"]}
        atomic_json(working / "dnn-restored.json", receipt, exclusive=True)
        # Destination stays unpublished until every original source and the SQLite generation match.
        os.rename(working, destination)
        sync_dir(destination.parent)
    intake.mkdir(mode=0o700, parents=True, exist_ok=True)
    return {**receipt, "workspace": str(destination), "intake": str(intake),
            "command": ["python3", str(application / "engine/dnn_maintenance/desk.py"),
                        "--workspace", str(destination), "--intake", str(intake), "serve"]}

@contextmanager
def export_lease(workspace):
    from .service import problem
    descriptor = os.open(workspace.root / "dnn-export.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    locked = False
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            locked = True
        except BlockingIOError:
            problem("The original workspace handover is still building. Retry this same request after it finishes.", "DNN_EXPORT_ACTIVE", 503)
        yield
    finally:
        if locked:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)

def export_action(workspace, engine, payload, actor):
    from .service import text, _new
    label = text(payload.get("label", ""), 500, True)
    keyed = dict(payload, dnn_action="workspace.export")
    with export_lease(workspace):
        with workspace.connect(write=True) as db:
            key, fingerprint, previous = workspace._request(db, keyed, actor)
            if previous is not None:
                return previous
            identity = workspace.meta(db)["workspace"]["id"]
        # Exact raw ZIP parts and recipes live beside the database. A subsequent handover
        # carries each referenced part once, preserving old downloads without nested archives.
        directory = workspace.root.parent / "dnn-handoffs" / identity
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        name = "DNN_Workspace_" + digest({"key": key, "fingerprint": fingerprint})[:24] + ".zip"
        target = directory / name
        operation = {"request_key": key, "fingerprint": fingerprint, "actor": actor["name"],
                     "workspace_id": identity, "label": label}
        if target.exists():
            result = archive_info(target)
            if result["manifest"].get("operation") != operation:
                fail("The retained complete archive belongs to another original export request.")
        else:
            result = export_workspace(workspace, engine, target, operation)
        from .archive_custody import retain_archive
        retain_archive(directory, target, {"filename": name, "archive_sha256": result["sha256"],
            "bytes": result["bytes"], "operation": operation}, identity)
        with workspace.connect(write=True) as db:
            key, fingerprint, previous = workspace._request(db, keyed, actor)
            if previous is not None:
                return previous
            record = _new(workspace, db, "dnn_handoff", {"label": label, "filename": name,
                "archive_sha256": result["sha256"], "bytes": result["bytes"],
                "workspace_head": result["manifest"]["workspace_head"], "source_digest": result["manifest"]["source_digest"],
                "operation": operation}, actor)
            file = {"filename": name, "sha256": result["sha256"], "bytes": result["bytes"],
                    "download_url": "/api/dnn/download/" + record["id"]}
            answer = {"handoff": record, "file": file}
            workspace._remember(db, key, fingerprint, answer, actor)
            workspace._changed(db, actor, "DNN complete workspace handover", details={"request_key": key, "archive_sha256": result["sha256"]})
        return answer

def download_handoff(workspace, identity):
    with workspace.connect(snapshot=True) as db:
        record = workspace._get(db, "dnn_handoff", identity)
        workspace_id = workspace.meta(db)["workspace"]["id"]
    from .archive_custody import reopen_archive
    path = reopen_archive(workspace.root.parent / "dnn-handoffs" / workspace_id, record, workspace_id)
    return {"path": str(path), "name": record["filename"], "sha256": record["archive_sha256"], "size": record["bytes"]}
