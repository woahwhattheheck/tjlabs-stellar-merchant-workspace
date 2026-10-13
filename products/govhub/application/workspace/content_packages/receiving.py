#!/usr/bin/env python3
"""Receive original Content Packages imports into a complete GovHub handover."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
import threading
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import add_paths, open_store
from cli import password
from govhub import open_workspace, packed
import build_application as application

SCHEMA = "govhub.content-packages.receiving-operation.v1"
CHUNK = 1024 * 1024
MODULE_SHA256 = "94b7eb054cfeb53029a6ccb26898d7e8b7599e273eb4365171892852455b993c"
REQUIRED_SOURCE = {
    "workspace/content_packages/__init__.py", "workspace/content_packages/model.py",
    "workspace/content_packages/service.py", "workspace/content_packages/native.py",
    "workspace/content_packages/native/run.php", "workspace/content_packages/native/shutdown.php",
    "workspace/content_packages/delivery.py", "workspace/content_packages/receiving.py",
    "workspace/content_packages/README.md",
    "workspace/web/packages.js", "workspace/web/packages.css",
}


def identity(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError("Choose an original regular file: " + str(path))
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as source:
        for block in iter(lambda: source.read(CHUNK), b""):
            h.update(block)
            size += len(block)
    return {"bytes": size, "sha256": h.hexdigest()}


def retained_json(path, value):
    raw = (packed(value) + "\n").encode()
    if path.exists():
        if path.is_symlink() or path.read_bytes() != raw:
            raise ValueError("The original receiving record differs: " + path.name)
        return
    application.publish_bytes(path, raw)


def copy_original(source, target, expected):
    """Resume a completed original copy; publish each new file only when full."""
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if target.exists() or target.is_symlink():
        if identity(target) != expected:
            raise ValueError("A different file occupies the receiving destination: " + str(target))
        return
    descriptor, temporary = tempfile.mkstemp(prefix=".receiving-copy-", dir=target.parent)
    temporary = Path(temporary)
    try:
        h, size = hashlib.sha256(), 0
        with Path(source).open("rb") as original, os.fdopen(descriptor, "wb") as output:
            before = os.fstat(original.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise ValueError("Receive only an original regular source.")
            for block in iter(lambda: original.read(CHUNK), b""):
                h.update(block)
                size += len(block)
                output.write(block)
            after = os.fstat(original.fileno())
            if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                raise ValueError("The original receiving source changed during transfer.")
            output.flush()
            os.fsync(output.fileno())
        if {"bytes": size, "sha256": h.hexdigest()} != expected:
            raise ValueError("The original receiving source differs from its selected bytes.")
        os.link(temporary, target)
        descriptor = os.open(target.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def receiver_lease(destination):
    descriptor = os.open(destination / "receiving.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def package_source(args):
    path = application.absolute(args.application_zip, True)
    result = application.verify_package(path, args.application_sha256)
    with zipfile.ZipFile(path) as archive:
        manifest = json.loads(archive.read(application.ROOT + "/APPLICATION_SOURCE.json"))
    locked = application.entries(manifest)
    if REQUIRED_SOURCE - set(locked):
        raise ValueError("The selected complete application must include the Content Packages operator and editor.")
    project = ROOT.parent
    for name, expected in locked.items():
        if name in {"workspace/vendor/assessment-core/workspace.py", "workspace/vendor/assessment-core/schema.py"}:
            source = Path(args.assessment_core) / Path(name).name
        else:
            source = project / name
        with application.source_file(source.parent, source.name) as stream:
            h, size = hashlib.sha256(), 0
            for block in iter(lambda: stream.read(CHUNK), b""):
                h.update(block)
                size += len(block)
        if h.hexdigest() != expected["sha256"] or size != expected["bytes"]:
            raise ValueError("The operated application differs from the selected complete source: " + name)
    return path, result


def wait_original(workspace, operation_ids, actor, timeout):
    """Use the existing queue and its original native storage/worker leases."""
    deadline = time.monotonic() + timeout
    workspace.start_worker()
    try:
        while True:
            rows = [workspace.dispatch("packages.operations.get", {"operation_id": item}, actor)["operation"]
                    for item in operation_ids]
            if all(row["state"] not in {"QUEUED", "RUNNING"} for row in rows):
                return rows
            if time.monotonic() >= deadline:
                raise ValueError("The original receiving operation remains queued/running. Reopen its saved operation after its native result returns.")
            threading.Event().wait(0.5)
    finally:
        workspace.stop_worker()


def transfer_handover(workspace, export, target):
    target.mkdir(mode=0o700, exist_ok=True)
    for file in export["files"]:
        source = workspace.export_file(export["id"], file["name"])
        copy_original(source["path"], target / file["name"],
                      {"bytes": file["size"], "sha256": file["sha256"]})


def workspace_projection(workspace, family_ids, operation_ids, actor):
    with workspace.connect(snapshot=True) as db:
        meta = workspace.meta(db)
    return {
        "workspace": meta["workspace"], "head": meta["head"],
        "families": [workspace.dispatch("packages.families.get", {"family_id": value}, actor)
                     for value in family_ids],
        "operations": [workspace.dispatch("packages.operations.get", {"operation_id": value}, actor)
                       for value in operation_ids],
    }


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def receiving_backup(workspace, args, destination, content, family_ids, operation_ids, actor, secret):
    """Resume this receiving operation using the original complete-backup API."""
    backup_path = content / "private-workspace"
    attempts = destination / "backup-attempts"
    selected_path = destination / "workspace-backup.json"
    if attempts.is_symlink():
        raise ValueError("Keep original backup attempts in their receiving directory.")
    attempts.mkdir(mode=0o700, exist_ok=True)
    sync_directory(destination)

    def read_projection(path):
        identity(path)
        return json.loads(path.read_bytes())

    def reopen(path, projection_path):
        if path.is_symlink() or not path.is_dir() or (path / "BACKUP_INCOMPLETE").exists():
            raise ValueError("The selected original workspace backup is incomplete.")
        expected = read_projection(projection_path)
        restored = open_workspace(path, args.source_root, args.assessment_core)
        received_actor = restored.authenticate(args.username, secret)
        if not received_actor:
            raise ValueError("The original workspace account did not reopen in the received backup.")
        actual = workspace_projection(restored, family_ids, operation_ids, received_actor)
        return actual, packed(actual) == packed(expected)

    def publish(candidate):
        if backup_path.exists() or backup_path.is_symlink():
            raise ValueError("Another original workspace occupies the selected receiving destination.")
        os.rename(candidate, backup_path)
        sync_directory(candidate.parent)
        sync_directory(content)

    def changed(attempt, actual):
        retained_json(attempt / "SNAPSHOT_CHANGED", {
            "reason": "The live workspace changed between projection and original backup.",
            "backup_workspace": actual["workspace"], "backup_head": actual["head"],
        })

    # Selection is durable before the directory move. A process interruption on
    # either side of rename therefore resumes the same completed backup.
    if selected_path.exists():
        selected = read_projection(selected_path)
        if (selected.get("schema") != "govhub.content-packages.receiving-backup.v1"
                or not re.fullmatch(r"attempt-[0-9]{8}", selected.get("attempt", ""))):
            raise ValueError("The retained original backup selection is invalid.")
        attempt = attempts / selected["attempt"]
        if attempt.is_symlink():
            raise ValueError("Keep the selected original backup attempt in its receiving directory.")
        projection_path = attempt / "projection.json"
        if identity(projection_path) != selected["projection"]:
            raise ValueError("The selected original workspace projection differs.")
        candidate = attempt / "workspace"
        if backup_path.exists():
            if candidate.exists() or candidate.is_symlink():
                raise ValueError("Both original locations contain the selected workspace backup.")
        else:
            actual, equal = reopen(candidate, projection_path)
            if not equal:
                raise ValueError("The selected completed workspace backup changed.")
            publish(candidate)
        actual, equal = reopen(backup_path, projection_path)
        if not equal:
            raise ValueError("The received workspace changed after its original backup selection.")
        return actual

    # Older receiving versions wrote directly into content/. Preserve that
    # attempt outside the deliverable before using a fresh original destination.
    if backup_path.exists() or backup_path.is_symlink():
        if backup_path.is_symlink() or not backup_path.is_dir():
            raise ValueError("The retained original workspace backup must be a directory.")
        projection_path = destination / "workspace-projection.json"
        if not (backup_path / "BACKUP_INCOMPLETE").exists():
            actual, equal = reopen(backup_path, projection_path)
            if equal:
                return actual
        legacy = attempts / "initial"
        if legacy.is_symlink():
            raise ValueError("Keep the initial original backup attempt in its receiving directory.")
        legacy.mkdir(mode=0o700, exist_ok=True)
        sync_directory(attempts)
        if projection_path.exists():
            copy_original(projection_path, legacy / "projection.json", identity(projection_path))
        target = legacy / "workspace"
        if target.exists() or target.is_symlink():
            raise ValueError("The initial original backup is already retained at another location.")
        os.rename(backup_path, target)
        sync_directory(legacy)
        sync_directory(content)

    chosen, actual, highest = None, None, 0
    for attempt in sorted(attempts.iterdir()):
        if not re.fullmatch(r"attempt-[0-9]{8}", attempt.name):
            continue
        if attempt.is_symlink() or not attempt.is_dir():
            raise ValueError("An original receiving backup attempt is not a directory.")
        highest = max(highest, int(attempt.name.split("-")[1]))
        candidate = attempt / "workspace"
        if (attempt / "SNAPSHOT_CHANGED").exists() or not candidate.exists():
            continue
        if (candidate / "BACKUP_INCOMPLETE").exists():
            continue
        actual, equal = reopen(candidate, attempt / "projection.json")
        if equal:
            chosen = attempt
            break
        changed(attempt, actual)

    if chosen is None:
        if highest >= 99999999:
            raise ValueError("The original receiving backup attempt counter is exhausted.")
        chosen = attempts / ("attempt-" + format(highest + 1, "08d"))
        chosen.mkdir(mode=0o700)
        sync_directory(attempts)
        projection = workspace_projection(workspace, family_ids, operation_ids, actor)
        retained_json(chosen / "projection.json", projection)
        # The original API requires a new, absent absolute directory. Failed
        # attempts retain their own incomplete marker and are never overwritten.
        workspace.dispatch("workspace.backup", {"destination": str(chosen / "workspace")}, actor)
        actual, equal = reopen(chosen / "workspace", chosen / "projection.json")
        if not equal:
            changed(chosen, actual)
            raise ValueError("The live workspace changed during this original backup. Repeat the same receiving command to capture its current completed records; the previous attempt is retained.")

    selected = {
        "schema": "govhub.content-packages.receiving-backup.v1",
        "attempt": chosen.name, "projection": identity(chosen / "projection.json"),
    }
    retained_json(selected_path, selected)
    publish(chosen / "workspace")
    return actual


def build_delivery(root, content):
    destination = root / "GovHub_Content_Packages_Receiving.zip"
    files = []
    for path in sorted(content.rglob("*")):
        if path.is_symlink():
            raise ValueError("Resolve the original receiving artifact before packaging: " + str(path))
        if path.is_file():
            relative = path.relative_to(content).as_posix()
            if any(part.startswith(".") for part in PurePosixPath(relative).parts):
                raise ValueError("An incomplete temporary file remains in the receiving content.")
            files.append({"path": relative, **identity(path)})
    index = {"schema": "govhub.content-packages.receiving-package.v1", "files": files}
    if not destination.exists():
        descriptor, temporary = tempfile.mkstemp(prefix=".receiving-archive-", suffix=".zip", dir=root)
        os.close(descriptor)
        temporary = Path(temporary)
        try:
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                for row in files:
                    path = content / row["path"]
                    info = zipfile.ZipInfo(row["path"], (2026, 10, 12, 0, 0, 0))
                    info.create_system = 3
                    info.external_attr = (stat.S_IFREG | 0o600) << 16
                    info.compress_type = zipfile.ZIP_STORED if path.suffix.lower() in {".zip", ".gz", ".jpg", ".png"} else zipfile.ZIP_DEFLATED
                    with path.open("rb") as original, archive.open(info, "w", force_zip64=True) as output:
                        shutil.copyfileobj(original, output, CHUNK)
                archive.writestr("RECEIVING_PACKAGE.json", (packed(index) + "\n").encode())
            with temporary.open("rb") as original:
                os.fsync(original.fileno())
            os.link(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)
    with zipfile.ZipFile(destination) as archive:
        names = archive.namelist()
        if len(set(names)) != len(names) or set(names) != {row["path"] for row in files} | {"RECEIVING_PACKAGE.json"}:
            raise ValueError("The complete receiving ZIP has different original members.")
        if json.loads(archive.read("RECEIVING_PACKAGE.json")) != index:
            raise ValueError("The receiving ZIP identifies another original handover.")
        for row in files:
            h, size = hashlib.sha256(), 0
            with archive.open(row["path"]) as original:
                for block in iter(lambda: original.read(CHUNK), b""):
                    h.update(block)
                    size += len(block)
            if {"bytes": size, "sha256": h.hexdigest()} != {key: row[key] for key in ("bytes", "sha256")}:
                raise ValueError("The complete receiving ZIP changed a member: " + row["path"])
    return {"path": str(destination), **identity(destination), "members": len(files) + 1}


def receive(args):
    source_zip, application_result = package_source(args)
    module_archive = application.absolute(args.module_archive, True)
    module_identity = identity(module_archive)
    if module_identity["sha256"] != MODULE_SHA256:
        raise ValueError("Select the retained original Content Packages 1.3.1 release archive.")
    destination = application.absolute(args.destination)
    if destination.is_relative_to(Path(args.workspace).resolve()):
        raise ValueError("Keep the receiving handover outside the live workspace.")
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    family_ids = sorted(set(args.family_id))
    import_ids = sorted(set(args.import_operation_id))
    if len(family_ids) != len(args.family_id) or len(import_ids) != len(args.import_operation_id):
        raise ValueError("Select every original family and import operation once.")
    secret = password(args)
    workspace = open_store(args)
    actor = workspace.authenticate(args.username, secret)
    if not actor:
        raise ValueError("The existing workspace account was not recognized.")
    workspace._authorize(actor, "admin")
    with receiver_lease(destination), workspace.service_lease():
        intent = {
            "schema": SCHEMA, "operation_key": args.operation_key,
            "family_ids": family_ids, "import_operation_ids": import_ids,
            "application": {key: application_result[key] for key in ("sha256", "bytes", "source_commit", "source_files")},
            "module_archive": module_identity, "actor": actor["name"],
            "name": args.name, "workspace": str(workspace.root),
        }
        retained_json(destination / "receiving-intent.json", intent)
        marker = destination / "RECEIVING_INCOMPLETE"
        if not marker.exists() and not (destination / "receiving-complete.json").exists():
            application.publish_bytes(marker, b"Original receiving in progress.\n")
        content = destination / "content"
        content.mkdir(mode=0o700, exist_ok=True)
        requests, receive_ids = [], []
        for operation_id in import_ids:
            original = workspace.dispatch("packages.operations.get", {"operation_id": operation_id}, actor)["operation"]
            if original["type"] != "PACKAGE_IMPORT" or original["package_family_id"] not in family_ids:
                raise ValueError("Each original import must belong to the explicitly selected workshare.")
            request = {
                "request_key": args.operation_key + "/read/" + operation_id,
                "family_id": original["package_family_id"], "import_operation_id": operation_id,
                "reason": "Receiving engineer reads the original committed Content Packages import.",
            }
            retained_json(destination / (operation_id + ".request.json"), request)
            created = workspace.dispatch("packages.receiving.create", request, actor)
            receive_ids.append(created["operation"]["id"])
            requests.append(request)
        rows = wait_original(workspace, receive_ids, actor, args.timeout) if receive_ids else []
        for row in rows:
            native = (row.get("native_result") or {}).get("observations", {}).get("package_result", {})
            if row["state"] != "COMPLETE" or not native.get("receipt") or not native.get("receiving"):
                raise ValueError("The original native import still needs its retained recovery before this handover: " + row["id"])
        retained_json(content / "native-receiving.json", {"requests": requests, "operations": rows})
        request = {
            "request_key": args.operation_key + "/handover",
            "name": args.name, "package_family_ids": family_ids, "include_sources": True,
        }
        created = workspace.dispatch("packages.handovers.create", request, actor)
        export = created["export"]
        transfer_handover(workspace, export, content / "handover")
        retained_json(content / "handover-record.json", export)
        actual = receiving_backup(workspace, args, destination, content,
                                  family_ids, import_ids + receive_ids, actor, secret)
        reopened = {
            "schema": "govhub.content-packages.workspace-receiving.v1",
            "workspace": actual["workspace"], "head": actual["head"],
            "family_ids": family_ids, "import_operation_ids": import_ids,
            "receiving_operation_ids": receive_ids, "original_records_equal": True,
        }
        retained_json(content / "workspace-reopened.json", reopened)
        del secret
        copy_original(source_zip, content / "GovHub_Application.zip",
                      {key: application_result[key] for key in ("bytes", "sha256")})
        copy_original(module_archive, content / "content_packages-1.3.1.tar.gz", module_identity)
        guide = f"""# Open the received Content Packages workshare

1. Extract GovHub_Application.zip, preserving its complete govhub-operations directory.
2. Keep private-workspace/ as the same editable workspace. It already contains the original staff accounts, archive editions, decisions, sources and native operation journals.
3. Create a separate empty supplied-input directory and open the installed application:
   python govhub-operations/workspace/server.py --workspace /absolute/private-workspace --source-root /absolute/supplied-input
4. Sign in with the original workspace account and open Content packages. The selected families are {", ".join(family_ids)}.
5. Read workspace/content_packages/README.md in the application for native graph export, comparison, exact review, import and original-operation recovery. handover/handover.html is the retained source-linked delivery view.

The original imported operations are {", ".join(import_ids)}. native-receiving.json contains the actual destination read and any changes made since each saved import. workspace-reopened.json records the same original records reopened from this backup.

The complete application source is {application_result["source_commit"]}. Its existing builder can verify every installed source member. content_packages-1.3.1.tar.gz is the original native Drupal module release; its source archive SHA-256 is {MODULE_SHA256}. Its GPL license and upstream documentation remain inside the archive. Install it with its original declared dependencies on the selected equipped Drupal site.

The editable backup retains native host references. Use the original selected site's equipped PHP/Drush runtime to continue an import; a new Drupal destination requires its own configured environment and native preview. The same completed import can always be reopened from its retained result and receipt. Original whole-site cutover/rollback plans and source backups are retained with the selected family.

GovHub exports destination-owned draft content by default. Supplied external archives retain their own publication mode. The native preview shows publication and references before the exact decision; excluded packages remain on the destination. Drupal's own editor and scheduler control publication.
"""
        retained_json(content / "receiving-intent.json", intent)
        guide_path = content / "START_CONTENT_PACKAGES.md"
        if guide_path.exists():
            if guide_path.read_bytes() != guide.encode():
                raise ValueError("The original receiving startup guide differs from this operation.")
        else:
            application.publish_bytes(guide_path, guide.encode())
        final = build_delivery(destination, content)
        completed = {"schema": SCHEMA, "operation_key": args.operation_key,
                     "application": application_result, "handover_id": export["id"],
                     "receiving": reopened, "delivery": final}
        retained_json(destination / "receiving-complete.json", completed)
        marker.unlink(missing_ok=True)
        return completed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_paths(parser)
    parser.add_argument("--username", required=True)
    credentials = parser.add_mutually_exclusive_group()
    credentials.add_argument("--password-env")
    credentials.add_argument("--password-stdin", action="store_true")
    parser.add_argument("--operation-key", required=True)
    parser.add_argument("--family-id", action="append", required=True)
    parser.add_argument("--import-operation-id", action="append", required=True)
    parser.add_argument("--application-zip", required=True)
    parser.add_argument("--application-sha256", required=True)
    parser.add_argument("--module-archive", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--name", default="Content Packages engineer receiving")
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}", args.operation_key):
        parser.error("Choose a stable original receiving operation key of at most 96 characters.")
    if not 1 <= args.timeout <= 86400:
        parser.error("Use a receiving timeout between 1 and 86400 seconds.")
    os.umask(0o077)
    try:
        result = receive(args)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 0
    except Exception as error:
        print(json.dumps({"error": str(error), "operation_key": args.operation_key,
                          "destination": args.destination}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
