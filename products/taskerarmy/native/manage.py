#!/usr/bin/env python3
"""Install, snapshot and receive the original TaskerArmy notification application."""
from __future__ import annotations
import argparse, contextlib, datetime as dt, fcntl, hashlib, importlib.util, json, os
import pathlib, shutil, sqlite3, stat, subprocess, sys, time, uuid
from urllib.parse import quote
sys.dont_write_bytecode = True
import archive as package

INSTALL_SCHEMA = "taskerarmy.installation.v1"
SOURCE_SCHEMA = "taskerarmy.application-source.v1"
SNAPSHOT_SCHEMA = "taskerarmy.workspace-snapshot.v1"
RECEIVE_SCHEMA = "taskerarmy.receiving.v1"
_COPY_DIRECTORY = None
REQUIRED_SOURCE = {"notification_outbox.py", "README.md", "operator_server.py", "operator.html", "OPERATOR.md", "native/archive.py", "native/manage.py"}

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def read_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))

def binding(directory):
    directory = pathlib.Path(directory).resolve(strict=True)
    info = directory.stat()
    return {"directory": str(directory), "device": info.st_dev, "inode": info.st_ino}

def ordinary(path, directory=False):
    path = pathlib.Path(path).absolute()
    if path.is_symlink() or not path.exists() or (not path.is_dir() if directory else not path.is_file()):
        raise ValueError("Select an existing ordinary " + ("directory" if directory else "file") + ": " + str(path))
    return path.resolve(strict=True)

def private_directory(path):
    path = pathlib.Path(path).absolute()
    if path.is_symlink():
        raise ValueError("A selected installation directory cannot be a link")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not path.is_dir():
        raise ValueError("The selected installation root is not a directory")
    return path.resolve(strict=True)

@contextlib.contextmanager
def locked(root, name=".native.lock"):
    global _COPY_DIRECTORY
    root = private_directory(root)
    prior_copy_directory = _COPY_DIRECTORY
    _COPY_DIRECTORY = root / ".copy-partials"
    path = root / name
    fd = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield root
    except BlockingIOError as exc:
        raise RuntimeError("The original installation operation still owns this directory") from exc
    finally:
        _COPY_DIRECTORY = prior_copy_directory
        os.close(fd)

def copy_file(source, destination, expected=None):
    source = ordinary(source)
    destination = pathlib.Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if destination.is_symlink():
        raise ValueError("A receiving file cannot replace a link")
    before = source.stat()
    digest = package.digest_file(source)
    if expected is not None and digest != expected:
        raise ValueError("The original selected file changed: " + str(source))
    if destination.exists():
        if not destination.is_file() or destination.stat().st_size != before.st_size or package.digest_file(destination) != digest:
            raise ValueError("A retained receiving file differs: " + str(destination))
        return
    if _COPY_DIRECTORY is None:
        raise RuntimeError("Copy original files inside the selected installation operation")
    temporary_directory = private_directory(_COPY_DIRECTORY)
    temporary = temporary_directory / ("copy-" + uuid.uuid4().hex + ".partial")
    with open(source, "rb") as src, open(temporary, "xb") as out:
        shutil.copyfileobj(src, out, 1024 * 1024)
        out.flush()
        os.fsync(out.fileno())
    os.chmod(temporary, 0o700 if before.st_mode & 0o111 else 0o600)
    after = source.stat()
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or package.digest_file(temporary) != digest:
        raise ValueError("The selected file changed during receiving: " + str(source))
    try:
        os.link(temporary, destination)
    except FileExistsError:
        if destination.is_symlink() or not destination.is_file() or package.digest_file(destination) != digest:
            raise ValueError("A concurrently received original file differs")
    else:
        directory_fd = os.open(destination.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    temporary.unlink()

def copy_directory(source, destination, allowed_extra_roots=()):
    source = ordinary(source, True)
    destination = private_directory(destination)
    rows = package.inventory(source)
    for row in sorted(rows, key=lambda item: (item["kind"] == "symlink", item["path"])):
        target = package.ordinary_parents(destination, row["path"])
        if row["kind"] == "directory":
            if target.is_symlink() or (target.exists() and not target.is_dir()):
                raise ValueError("A selected directory changed type")
            target.mkdir(exist_ok=True, mode=0o700)
        elif row["kind"] == "symlink":
            if target.is_symlink():
                if os.readlink(target) != row["target"]:
                    raise ValueError("A received link differs")
            elif target.exists():
                raise ValueError("A received link has an existing ordinary file")
            else:
                os.symlink(row["target"], target)
        else:
            copy_file(source / row["path"], target, row["sha256"])
    received = {row["path"]: row for row in package.inventory(destination)}
    expected = {row["path"]: row for row in rows}
    if any(received.get(name) != row for name, row in expected.items()):
        raise ValueError("Complete directory receiving differs from its original selection")
    permitted = set(allowed_extra_roots)
    if any(name.split("/", 1)[0] in permitted for name in expected):
        raise ValueError("A current receiving lineage repeats an original prior lineage identity")
    if any(name not in expected and name.split("/", 1)[0] not in permitted for name in received):
        raise ValueError("Complete directory receiving contains an unrelated additional member")
    return rows

def source_manifest(application, manifest_path=None):
    application = ordinary(application, True)
    manifest = read_json(manifest_path) if manifest_path else None
    rows = [row for row in package.inventory(application, exclude_root=("SOURCE_FILES.json", ".git"))
            if row["kind"] != "directory"]
    if any(row["kind"] != "file" for row in rows):
        raise ValueError("The selected Python application source must contain ordinary files")
    by_path = {row["path"]: row for row in rows}
    if not REQUIRED_SOURCE.issubset(by_path):
        raise ValueError("The complete original worker and native source are required")
    if manifest is None:
        manifest = {"schema": SOURCE_SCHEMA, "files": [
            {key: row[key] for key in ("path", "bytes", "sha256", "mode")} for row in rows]}
    if manifest.get("schema") != SOURCE_SCHEMA or not isinstance(manifest.get("files"), list):
        raise ValueError("Select the complete TaskerArmy application source manifest")
    declared = {}
    for row in manifest["files"]:
        name = str(package.relative_name(row["path"]))
        if name in declared or type(row.get("bytes")) is not int or row["bytes"] < 0:
            raise ValueError("Invalid or repeated application source member")
        actual = by_path.get(name)
        if not actual or row["bytes"] != actual["bytes"] or row.get("sha256") != actual["sha256"]:
            raise ValueError("The selected source manifest differs: " + name)
        declared[name] = row
    if set(declared) != set(by_path):
        raise ValueError("The complete source selection and original manifest differ")
    return manifest

def copy_selected_source(application, destination, manifest):
    destination = private_directory(destination)
    for row in manifest["files"]:
        copy_file(pathlib.Path(application) / row["path"],
                  package.ordinary_parents(destination, row["path"]), row["sha256"])
    # Validate the complete copy, not just the files named by the caller.
    current = source_manifest(destination)
    if {r["path"]: (r["sha256"], r["bytes"]) for r in current["files"]} != {
            r["path"]: (r["sha256"], r["bytes"]) for r in manifest["files"]}:
        raise ValueError("Complete installed source differs")
    return destination

def worker_module(application):
    filename = ordinary(pathlib.Path(application) / "notification_outbox.py")
    name = "taskerarmy_original_" + hashlib.sha256(str(filename).encode()).hexdigest()[:20]
    spec = importlib.util.spec_from_file_location(name, filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def python_identity(executable):
    executable = ordinary(pathlib.Path(executable).resolve(strict=True))
    command = [str(executable), "-c", "import json,sys;print(json.dumps({'version':list(sys.version_info[:3]),'executable':sys.executable}))"]
    result = subprocess.run(command, text=True, capture_output=True, check=True, timeout=20)
    value = json.loads(result.stdout)
    if tuple(value["version"][:2]) < (3, 11):
        raise ValueError("TaskerArmy requires Python 3.11 or later")
    return {"path": str(executable), "version": value["version"]}

def source_locations(root, value):
    root = pathlib.Path(root)
    edition = value.get("source_edition")
    if edition is not None and (not isinstance(edition, str) or len(edition) != 64
                               or any(c not in "0123456789abcdef" for c in edition)):
        raise ValueError("The selected source edition identity is invalid")
    selected = root / "source-editions" / edition if edition is not None else root
    return {"original": selected / "original-source", "application": selected / "application",
            "manifest": selected / "source-manifest.json"}

def installation(directory):
    root = ordinary(directory, True)
    value = read_json(root / "installation.json")
    if value.get("schema") != INSTALL_SCHEMA or value.get("binding") != binding(root):
        raise ValueError("The selected installation identity or directory changed")
    selected = source_locations(root, value)
    expected = {"directory": str(root), "application": str(selected["application"]),
                "configuration": str(root / "state" / "notices.json"),
                "database": str(root / "state" / "notices.sqlite3")}
    if value.get("paths") != expected:
        raise ValueError("The selected installation paths differ from their original binding")
    for key in ("application",):
        ordinary(value["paths"][key], True)
    for key in ("configuration", "database"):
        ordinary(value["paths"][key])
    return value

def outbox_for(value):
    module = worker_module(value["paths"]["application"])
    return module, module.Outbox(value["paths"]["database"], value["paths"]["configuration"])

def prepare(application, configuration, directory, manifest_path=None, python=None, operation_id=None):
    application = ordinary(application, True)
    configuration = ordinary(configuration)
    manifest = source_manifest(application, manifest_path)
    source_id = hashlib.sha256(canonical(manifest).encode()).hexdigest()
    config_hash = package.digest_file(configuration)
    selected_python = python_identity(python or sys.executable)
    module = worker_module(application)
    module.load_config(configuration)
    request = {"schema": "taskerarmy.installation-request.v1",
               "source_identity": source_id, "configuration_sha256": config_hash,
               "python": selected_python, "operation_id": operation_id or "taskerarmy-installation"}
    root = pathlib.Path(directory).absolute()
    if root == application or application in root.parents or root in application.parents:
        raise ValueError("Select a separate private installation directory")
    with locked(root):
        request_path = root / "prepare-request.json"
        if request_path.exists():
            if read_json(request_path) != request:
                raise ValueError("This installation directory belongs to another original selection")
        else:
            existing = [p.name for p in root.iterdir() if p.name != ".native.lock"]
            if existing:
                raise ValueError("The first installation requires a new selected directory")
            package.atomic_json(request_path, request)
        if (root / "installation.json").exists():
            existing = installation(root)
            if existing["source_identity"] != source_id:
                raise ValueError("The completed installation has another source selection")
            return {**existing, "replayed": True}
        copy_selected_source(application, root / "original-source", manifest)
        copy_selected_source(application, root / "application", manifest)
        copy_file(configuration, root / "state" / "notices.json", config_hash)
        module = worker_module(root / "application")
        outbox = module.Outbox(root / "state" / "notices.sqlite3", root / "state" / "notices.json")
        summary = database_summary(outbox.database)
        package.atomic_json(root / "source-manifest.json", manifest)
        value = {"schema": INSTALL_SCHEMA, "installation_id": str(uuid.uuid4()), "created_at": utc(),
                 "operation_id": request["operation_id"], "binding": binding(root),
                 "source_identity": source_id, "python": selected_python,
                 "paths": {"directory": str(root), "application": str(root / "application"),
                           "configuration": str(root / "state" / "notices.json"),
                           "database": str(root / "state" / "notices.sqlite3")},
                 "lineage": [], "initial_database": summary}
        package.atomic_json(root / "installation.json", value)
        return value

def adopt_source(directory, application, manifest_path=None, operation_id=None):
    if not isinstance(operation_id, str) or not operation_id.strip():
        raise ValueError("Select the original source-adoption operation ID")
    application = ordinary(application, True)
    manifest = source_manifest(application, manifest_path)
    source_id = hashlib.sha256(canonical(manifest).encode()).hexdigest()
    adoption_id = hashlib.sha256(canonical({"operation_id": operation_id, "source_identity": source_id}).encode()).hexdigest()
    with locked(directory) as root:
        current = installation(root)
        working = root / "source-adoptions" / adoption_id
        working.mkdir(parents=True, exist_ok=True, mode=0o700)
        request_path = working / "request.json"
        if request_path.exists():
            request = read_json(request_path)
            if (request.get("schema") != "taskerarmy.source-adoption-request.v1"
                    or request["operation_id"] != operation_id or request["source_identity"] != source_id
                    or request["application"] != str(application)
                    or request["installation_id"] != current["installation_id"]
                    or request["prior_installation"]["binding"] != binding(root)):
                raise ValueError("The retained source adoption belongs to another original selection")
        else:
            request = {"schema": "taskerarmy.source-adoption-request.v1", "operation_id": operation_id,
                       "adoption_id": adoption_id, "created_at": utc(), "application": str(application),
                       "source_identity": source_id, "installation_id": current["installation_id"],
                       "prior_installation": current}
            package.atomic_json(request_path, request)
        previous = request["prior_installation"]
        prior_paths = source_locations(root, previous)
        edition = root / "source-editions" / adoption_id
        updated = json.loads(canonical(previous))
        updated["source_identity"] = source_id
        updated["source_edition"] = adoption_id
        updated["paths"]["application"] = str(edition / "application")
        updated["lineage"] = list(previous.get("lineage", [])) + [{
            "source_adoption_id": adoption_id, "operation_id": operation_id,
            "created_at": request["created_at"], "previous_source_identity": previous["source_identity"],
            "source_identity": source_id}]
        if current != previous and current != updated:
            raise ValueError("Another source edition was selected after this original adoption")
        result_path = working / "result.json"
        if result_path.exists():
            result = read_json(result_path)
            if result.get("installation") != updated or current != updated:
                raise ValueError("This completed source adoption is no longer the selected installation")
            return {**result, "replayed": True}
        if current == previous:
            prior_manifest = read_json(prior_paths["manifest"])
            source_manifest(prior_paths["original"], prior_paths["manifest"])
            if hashlib.sha256(canonical(prior_manifest).encode()).hexdigest() != previous["source_identity"]:
                raise ValueError("The previous original source edition differs")
            retained = root / "lineage" / "source-adoptions" / adoption_id
            copy_directory(prior_paths["original"], retained / "original-source")
            copy_directory(prior_paths["application"], retained / "application")
            copy_file(prior_paths["manifest"], retained / "source-manifest.json")
            package.atomic_json(retained / "installation.json", previous)
            package.atomic_json(retained / "adoption-request.json", request)
        manifest_path = edition / "source-manifest.json"
        if current == previous:
            copy_selected_source(application, edition / "original-source", manifest)
            copy_selected_source(application, edition / "application", manifest)
            if manifest_path.exists() and read_json(manifest_path) != manifest:
                raise ValueError("The retained successor source manifest differs")
            package.atomic_json(manifest_path, manifest)
        elif source_manifest(edition / "original-source", manifest_path) != manifest:
            raise ValueError("The completed successor original source differs")
        # The original routing and SQLite paths/bytes are never rewritten by source adoption.
        # All prior and successor source files are complete before the selected pointer changes.
        if installation(root) not in (previous, updated):
            raise ValueError("The selected installation changed during source receiving")
        package.atomic_json(root / "installation.json", updated)
        result = {"schema": "taskerarmy.source-adoption-result.v1", "adoption_id": adoption_id,
                  "operation_id": operation_id, "installation": updated,
                  "previous_source_identity": previous["source_identity"],
                  "retained_previous_source": str(root / "lineage" / "source-adoptions" / adoption_id)}
        package.atomic_json(result_path, result)
        return result

def db_connection(path, readonly=True):
    path = ordinary(path)
    if readonly:
        connection = sqlite3.connect("file:" + quote(str(path)) + "?mode=ro", uri=True, timeout=10)
    else:
        connection = sqlite3.connect(path, timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=10000")
    return connection

def sql_identifier(value):
    return '"' + value.replace('"', '""') + '"'

def database_summary(path):
    with contextlib.closing(db_connection(path)) as db:
        db.execute("BEGIN")
        integrity = [row[0] for row in db.execute("PRAGMA integrity_check")]
        if integrity != ["ok"]:
            raise ValueError("The retained SQLite workspace is not readable: " + repr(integrity))
        schema = [dict(row) for row in db.execute(
            "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")]
        table_names = [row["name"] for row in schema if row["type"] == "table"]
        required = {"schema_version", "events", "jobs", "deliveries", "channels", "route_failures"}
        if not required.issubset(table_names):
            raise ValueError("The original notification tables are incomplete")
        versions = [r[0] for r in db.execute("SELECT version FROM schema_version")]
        if versions != [1]:
            raise ValueError("Unsupported original Outbox database version")
        tables = []
        for name in table_names:
            columns = [r[1] for r in db.execute("PRAGMA table_info(" + sql_identifier(name) + ")")]
            order = ",".join(sql_identifier(c) for c in columns)
            h = hashlib.sha256()
            count = 0
            for row in db.execute("SELECT * FROM " + sql_identifier(name) + " ORDER BY " + order):
                values = [({"bytes_base64": __import__("base64").b64encode(v).decode()} if isinstance(v, bytes) else v)
                          for v in row]
                body = canonical(values).encode()
                h.update(str(len(body)).encode() + b":" + body)
                count += 1
            tables.append({"name": name, "columns": columns, "rows": count, "sha256": h.hexdigest()})
        for row in db.execute("SELECT event_id,payload_hash,event_json FROM events"):
            if hashlib.sha256(row["event_json"].encode()).hexdigest() != row["payload_hash"]:
                raise ValueError("An original retained event body differs: " + row["event_id"])
            json.loads(row["event_json"])
        for row in db.execute("SELECT id,event_json,message_json,message_sha256 FROM deliveries"):
            if hashlib.sha256(row["message_json"].encode()).hexdigest() != row["message_sha256"]:
                raise ValueError("An original retained Slack message differs: " + str(row["id"]))
            json.loads(row["event_json"])
            json.loads(row["message_json"])
        if db.execute("""SELECT COUNT(*) FROM deliveries d LEFT JOIN events e
            ON e.tenant_id=d.tenant_id AND e.event_id=d.event_id
            WHERE e.event_id IS NULL OR e.event_json<>d.event_json
            OR e.job_id<>d.job_id OR e.version<>d.version""").fetchone()[0]:
            raise ValueError("A retained delivery differs from its original event")
        if db.execute("""SELECT COUNT(*) FROM jobs j LEFT JOIN events e
            ON e.tenant_id=j.tenant_id AND e.event_id=j.event_id
            WHERE e.event_id IS NULL OR e.job_id<>j.job_id OR e.version<>j.version""").fetchone()[0]:
            raise ValueError("A retained job differs from its current original event")
        db.rollback()
    return {"schema_sha256": hashlib.sha256(canonical(schema).encode()).hexdigest(),
            "tables": tables, "integrity": "ok"}

def backup_database(source, destination):
    source = ordinary(source)
    destination = pathlib.Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if destination.exists() or destination.is_symlink():
        raise FileExistsError(destination)
    with contextlib.closing(db_connection(source)) as original, \
            contextlib.closing(sqlite3.connect(destination)) as target:
        original.backup(target, pages=256, sleep=0.02)
        target.execute("PRAGMA journal_mode=DELETE")
        target.commit()
    os.chmod(destination, 0o600)
    with open(destination, "rb") as stream:
        os.fsync(stream.fileno())
    return database_summary(destination)

def inspect(directory):
    value = installation(directory)
    module, outbox = outbox_for(value)
    paths = source_locations(pathlib.Path(value["paths"]["directory"]), value)
    manifest = read_json(paths["manifest"])
    selected = source_manifest(paths["original"])
    if hashlib.sha256(canonical(manifest).encode()).hexdigest() != value["source_identity"]:
        raise ValueError("The selected original source manifest identity changed")
    if {r["path"]: (r["sha256"], r["bytes"]) for r in selected["files"]} != {
            r["path"]: (r["sha256"], r["bytes"]) for r in manifest["files"]}:
        raise ValueError("The complete original installed source changed")
    return {"schema": "taskerarmy.installation-inspection.v1", "installation": value,
            "configuration": module.load_config(value["paths"]["configuration"]),
            "configuration_sha256": package.digest_file(value["paths"]["configuration"]),
            "application_files": package.inventory(value["paths"]["application"]),
            "database": database_summary(outbox.database), "outbox": outbox.status(limit=1000)}

def receive_published_snapshot(output, operation_id, installation_id):
    output = ordinary(output)
    with __import__("tarfile").open(output, "r:gz") as stream:
        manifest, raw, members = package.checked_manifest(stream)
        snapshot = json.load(stream.extractfile(members["snapshot.json"]))
        original = json.load(stream.extractfile(members["installation.json"]))
        source = json.load(stream.extractfile(members["source-manifest.json"]))
        source_bytes = stream.extractfile(members["source-manifest.json"]).read()
    meta = manifest.get("metadata", {})
    if (snapshot.get("schema") != SNAPSHOT_SCHEMA or snapshot.get("operation_id") != operation_id
            or snapshot.get("installation_id") != installation_id
            or original != snapshot.get("original_installation")
            or original.get("installation_id") != installation_id
            or original.get("source_identity") != snapshot.get("source_identity")
            or meta.get("snapshot_id") != snapshot.get("snapshot_id")
            or meta.get("operation_id") != operation_id
            or meta.get("installation_id") != installation_id
            or meta.get("source_identity") != snapshot.get("source_identity")):
        raise ValueError("The existing output belongs to another original snapshot, installation or source")
    if (source.get("schema") != SOURCE_SCHEMA
            or hashlib.sha256(source_bytes).hexdigest() != snapshot["source_manifest_sha256"]
            or hashlib.sha256(canonical(source).encode()).hexdigest() != snapshot["source_identity"]):
        raise ValueError("The existing handover has another complete source identity")
    expected = {row["path"]: (row["bytes"], row["sha256"]) for row in source["files"]}
    actual = {row["path"].removeprefix("original-source/"): (row["bytes"], row["sha256"])
              for row in manifest["files"]
              if row["kind"] == "file" and row["path"].startswith("original-source/")}
    if actual != expected:
        raise ValueError("The existing handover does not carry its complete original source")
    configuration = next((row for row in manifest["files"] if row["path"] == "state/notices.json"), None)
    if not configuration or configuration["sha256"] != snapshot["configuration_sha256"]:
        raise ValueError("The existing handover has another routing source")
    archived = {"schema": package.SCHEMA, "path": str(output), "bytes": output.stat().st_size,
                "sha256": package.digest_file(output), "manifest_sha256": hashlib.sha256(raw).hexdigest(),
                "files": sum(row["kind"] != "directory" for row in manifest["files"]),
                "uncompressed_bytes": sum(row.get("bytes", 0) for row in manifest["files"])}
    return {"schema": "taskerarmy.snapshot-result.v1", "snapshot": snapshot, "archive": archived,
            "attempt": None, "recovered_original_output": True}

def snapshot(directory, output, operation_id):
    root = ordinary(directory, True)
    output = pathlib.Path(output).absolute()
    if output == root or root in output.parents:
        raise ValueError("Write the handover archive outside the active installation")
    operation_name = hashlib.sha256(operation_id.encode()).hexdigest()
    with locked(root):
        value = installation(root)
        working = root / "snapshots" / operation_name
        working.mkdir(parents=True, exist_ok=True, mode=0o700)
        request = {"schema": "taskerarmy.snapshot-request.v1",
                   "operation_id": operation_id, "installation_id": value["installation_id"],
                   "output": str(output)}
        request_path = working / "request.json"
        if request_path.exists() and read_json(request_path) != request:
            raise ValueError("This snapshot operation belongs to another original request")
        if not request_path.exists():
            package.atomic_json(request_path, request)
        if (working / "result.json").exists():
            prior = read_json(working / "result.json")
            if ordinary(prior["archive"]["path"]).stat().st_size != prior["archive"]["bytes"] or \
                    package.digest_file(prior["archive"]["path"]) != prior["archive"]["sha256"]:
                raise ValueError("The completed original handover archive differs")
            return {**prior, "replayed": True}
        if output.exists() or output.is_symlink():
            result = receive_published_snapshot(output, operation_id, value["installation_id"])
            package.atomic_json(working / "result.json", result)
            return result
        attempts = working / "attempts"
        attempts.mkdir(exist_ok=True, mode=0o700)
        number = 1
        while (attempts / str(number)).exists():
            number += 1
        attempt = attempts / str(number)
        attempt.mkdir(mode=0o700)
        payload = attempt / "payload"
        payload.mkdir(mode=0o700)
        config_hash = package.digest_file(value["paths"]["configuration"])
        module = worker_module(value["paths"]["application"])
        module.load_config(value["paths"]["configuration"])
        # Original-source validation is independent from the customer's editable application.
        selected = source_locations(root, value)
        original_manifest = read_json(selected["manifest"])
        current_original = source_manifest(selected["original"])
        if hashlib.sha256(canonical(original_manifest).encode()).hexdigest() != value["source_identity"]:
            raise ValueError("The selected original source manifest identity changed")
        if {r["path"]: (r["sha256"], r["bytes"]) for r in original_manifest["files"]} != {
                r["path"]: (r["sha256"], r["bytes"]) for r in current_original["files"]}:
            raise ValueError("The original application source baseline changed")
        copy_directory(selected["original"], payload / "original-source")
        copy_directory(selected["application"], payload / "application")
        copy_file(selected["manifest"], payload / "source-manifest.json")
        copy_file(root / "installation.json", payload / "installation.json")
        copy_file(value["paths"]["configuration"], payload / "state" / "notices.json", config_hash)
        database = backup_database(value["paths"]["database"], payload / "state" / "notices.sqlite3")
        if config_hash != package.digest_file(value["paths"]["configuration"]):
            raise ValueError("Routing changed during the selected snapshot; the original attempt is retained")
        if (root / "lineage").exists():
            copy_directory(root / "lineage", payload / "lineage")
        original_configuration = module.load_config(payload / "state" / "notices.json")
        captured = {"schema": SNAPSHOT_SCHEMA, "snapshot_id": str(uuid.uuid4()),
                    "operation_id": operation_id, "created_at": utc(),
                    "installation_id": value["installation_id"], "source_identity": value["source_identity"],
                    "original_installation": value, "configuration_sha256": config_hash,
                    "configuration": original_configuration, "database": database,
                    "source_manifest_sha256": package.digest_file(payload / "source-manifest.json")}
        package.atomic_json(payload / "snapshot.json", captured)
        archive_result = package.write_bundle(payload, output,
            {"operation_id": operation_id, "installation_id": value["installation_id"],
             "snapshot_id": captured["snapshot_id"], "source_identity": value["source_identity"]})
        result = {"schema": "taskerarmy.snapshot-result.v1", "snapshot": captured,
                  "archive": archive_result, "attempt": number}
        package.atomic_json(working / "result.json", result)
        return result

def receive(archive_path, directory, python=None):
    archive_path = ordinary(archive_path)
    checksum = package.digest_file(archive_path)
    selected_python = python_identity(python or sys.executable)
    root = pathlib.Path(directory).absolute()
    with locked(root, ".receive.lock"):
        request_path = root / "receiving-request.json"
        request = {"schema": "taskerarmy.receiving-request.v1", "archive_sha256": checksum,
                   "archive_bytes": archive_path.stat().st_size, "python": selected_python}
        if request_path.exists():
            if read_json(request_path) != request:
                raise ValueError("This receiving directory belongs to another original archive or Python selection")
        else:
            existing = [p.name for p in root.iterdir() if p.name != ".receive.lock"]
            if existing:
                raise ValueError("The first receiving requires a new private directory")
            package.atomic_json(request_path, request)
        if (root / "receiving.json").exists():
            existing = read_json(root / "receiving.json")
            current = installation(existing["installation"]["paths"]["directory"])
            if current["installation_id"] != existing["installation"]["installation_id"]:
                raise ValueError("The original received installation identity changed")
            return {**existing, "replayed": True}
        received = package.receive_bundle(archive_path, root / "payload", root / ".receiving-temporary")
        payload = root / "payload"
        snap = read_json(payload / "snapshot.json")
        if snap.get("schema") != SNAPSHOT_SCHEMA:
            raise ValueError("This archive is not a TaskerArmy workspace handover")
        previous = read_json(payload / "installation.json")
        meta = received["manifest"].get("metadata", {})
        if (snap["installation_id"] != previous.get("installation_id")
                or snap["source_identity"] != previous.get("source_identity")
                or snap["original_installation"] != previous
                or meta.get("snapshot_id") != snap["snapshot_id"]
                or meta.get("operation_id") != snap["operation_id"]
                or meta.get("installation_id") != snap["installation_id"]
                or meta.get("source_identity") != snap["source_identity"]):
            raise ValueError("The original installation, snapshot and source lineage differ")
        source_manifest_path = payload / "source-manifest.json"
        if package.digest_file(source_manifest_path) != snap["source_manifest_sha256"]:
            raise ValueError("The original complete source manifest differs")
        manifest = source_manifest(payload / "original-source", source_manifest_path)
        if hashlib.sha256(canonical(manifest).encode()).hexdigest() != snap["source_identity"]:
            raise ValueError("The original source identity differs")
        if package.digest_file(payload / "state" / "notices.json") != snap["configuration_sha256"]:
            raise ValueError("The original routing bytes differ")
        module = worker_module(payload / "application")
        if module.load_config(payload / "state" / "notices.json") != snap["configuration"]:
            raise ValueError("The original routing configuration differs")
        if database_summary(payload / "state" / "notices.sqlite3") != snap["database"]:
            raise ValueError("The complete original database tables differ")
        runtime = private_directory(root / "installation")
        copy_directory(payload / "original-source", runtime / "original-source")
        copy_directory(payload / "application", runtime / "application")
        copy_file(source_manifest_path, runtime / "source-manifest.json")
        copy_file(payload / "state" / "notices.json", runtime / "state" / "notices.json")
        preparation_path = root / "receiving-preparation.json"
        if preparation_path.exists():
            preparation = read_json(preparation_path)
        else:
            preparation = {"receiving_id": str(uuid.uuid4()), "installation_id": str(uuid.uuid4()),
                           "created_at": utc(), "archive_sha256": checksum}
            package.atomic_json(preparation_path, preparation)
        if preparation["archive_sha256"] != checksum:
            raise ValueError("The retained receiving preparation names another original archive")
        # Earlier completed lineage and this receiving's retained partial lineage coexist.
        if (payload / "lineage").exists():
            copy_directory(payload / "lineage", runtime / "lineage",
                           allowed_extra_roots=(preparation["receiving_id"],))
        database = runtime / "state" / "notices.sqlite3"
        if not database.exists():
            copy_file(payload / "state" / "notices.sqlite3", database)
        lineage = runtime / "lineage" / preparation["receiving_id"]
        lineage.mkdir(parents=True, exist_ok=True, mode=0o700)
        copy_file(payload / "snapshot.json", lineage / "original-snapshot.json")
        package.atomic_json(lineage / "original-archive-manifest.json", received["manifest"])
        # A lease belongs to the original host. Preserve it in the original payload and
        # receive the same delivery as uncertain in the new workspace, without a transmit.
        recovery_path = lineage / "dispatch-receiving.json"
        if recovery_path.exists():
            recovery = read_json(recovery_path)
        else:
            with contextlib.closing(db_connection(database, readonly=False)) as db:
                db.execute("BEGIN IMMEDIATE")
                dispatched = [dict(row) for row in db.execute(
                    "SELECT id,status,lease_token,lease_until,last_error,updated_at FROM deliveries WHERE status='dispatching'")]
                # Journal the exact original rows before changing the copied workspace.
                recovery = {"schema": "taskerarmy.dispatch-receiving.v1",
                            "at": utc(), "original_installation_id": previous["installation_id"],
                            "received_installation_id": preparation["installation_id"],
                            "deliveries": dispatched}
                package.atomic_json(recovery_path, recovery)
                db.execute("""UPDATE deliveries SET status='uncertain',last_error='installation_received',
                    lease_token=NULL,lease_until=NULL,updated_at=? WHERE status='dispatching'""", (time.time(),))
                db.commit()
        # A result-journal write may precede the SQLite commit. Finish only those same rows.
        with contextlib.closing(db_connection(database, readonly=False)) as db:
            db.execute("BEGIN IMMEDIATE")
            for row in recovery["deliveries"]:
                current = db.execute("SELECT status,lease_token FROM deliveries WHERE id=?", (row["id"],)).fetchone()
                if not current:
                    raise ValueError("An original dispatch row disappeared during receiving")
                if current["status"] == "dispatching" and current["lease_token"] == row["lease_token"]:
                    db.execute("""UPDATE deliveries SET status='uncertain',last_error='installation_received',
                        lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?""", (time.time(), row["id"]))
                elif current["status"] != "uncertain":
                    raise ValueError("The partially received delivery changed before receiving completed")
            db.commit()
        value = {"schema": INSTALL_SCHEMA, "installation_id": preparation["installation_id"],
                 "created_at": preparation["created_at"], "operation_id": previous["operation_id"],
                 "binding": binding(runtime), "source_identity": previous["source_identity"],
                 "python": selected_python,
                 "paths": {"directory": str(runtime), "application": str(runtime / "application"),
                           "configuration": str(runtime / "state" / "notices.json"), "database": str(database)},
                 "lineage": list(previous.get("lineage", [])) + [{
                     "receiving_id": preparation["receiving_id"], "archive_sha256": checksum,
                     "snapshot_id": snap["snapshot_id"], "original_installation_id": previous["installation_id"]}],
                 "initial_database": database_summary(database)}
        package.atomic_json(runtime / "installation.json", value)
        result = {"schema": RECEIVE_SCHEMA, "receiving_id": preparation["receiving_id"],
                  "received_at": preparation["created_at"], "archive": received["archive"],
                  "manifest_sha256": received["manifest_sha256"],
                  "original_payload": str(payload), "original_snapshot": snap,
                  "installation": value, "recovered_dispatches": [r["id"] for r in recovery["deliveries"]]}
        package.atomic_json(root / "receiving.json", result)
        return result

def command(directory, arguments):
    value = installation(directory)
    if not arguments:
        raise ValueError("Select an original worker command")
    module = worker_module(value["paths"]["application"])
    # Validate routing before the selected original CLI owns any operation.
    module.load_config(value["paths"]["configuration"])
    argv = [value["python"]["path"], "-B", str(pathlib.Path(value["paths"]["application"]) / "notification_outbox.py"),
            "--db", value["paths"]["database"], "--config", value["paths"]["configuration"], *arguments]
    return subprocess.call(argv, cwd=value["paths"]["application"], env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("manifest")
    p.add_argument("--application", required=True)
    p.add_argument("--output", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("--application", required=True)
    p.add_argument("--configuration", required=True)
    p.add_argument("--directory", required=True)
    p.add_argument("--source-manifest")
    p.add_argument("--python", default=sys.executable)
    p.add_argument("--operation-id")
    p = sub.add_parser("adopt-source")
    p.add_argument("--directory", required=True)
    p.add_argument("--application", required=True)
    p.add_argument("--source-manifest")
    p.add_argument("--operation-id", required=True)
    p = sub.add_parser("inspect")
    p.add_argument("--directory", required=True)
    p = sub.add_parser("export")
    p.add_argument("--directory", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--operation-id", required=True)
    p = sub.add_parser("receive")
    p.add_argument("--archive", required=True)
    p.add_argument("--directory", required=True)
    p.add_argument("--python", default=sys.executable)
    p = sub.add_parser("run")
    p.add_argument("--directory", required=True)
    p.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    if args.command == "manifest":
        result = source_manifest(args.application)
        output = pathlib.Path(args.output)
        if output.exists():
            if read_json(output) != result:
                raise ValueError("The selected manifest output already contains another source edition")
        else:
            package.atomic_json(output, result)
    elif args.command == "prepare":
        result = prepare(args.application, args.configuration, args.directory, args.source_manifest,
                         args.python, args.operation_id)
    elif args.command == "adopt-source":
        result = adopt_source(args.directory, args.application, args.source_manifest, args.operation_id)
    elif args.command == "inspect":
        result = inspect(args.directory)
    elif args.command == "export":
        result = snapshot(args.directory, args.output, args.operation_id)
    elif args.command == "receive":
        result = receive(args.archive, args.directory, args.python)
    else:
        arguments = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
        return command(args.directory, arguments)
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, sqlite3.Error, subprocess.SubprocessError) as exc:
        print(json.dumps({"error": type(exc).__name__, "detail": str(exc)}), file=sys.stderr, flush=True)
        raise SystemExit(2)
