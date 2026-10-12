#!/usr/bin/env python3
"""CouchDB workspace snapshots through the original source archive receiver."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys

SPEC = importlib.util.spec_from_file_location("couchdb_original_source_archive", Path(__file__).resolve().parent.parent / "source_bundle_archive.py")
native = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(native)
SCHEMA = "stellar-forge.couchdb-workspace-handover.v1"
POLICY = native.ArchivePolicy(SCHEMA, max_expanded_bytes=8 * 1024**3, max_members=100000,
                             max_manifest_bytes=32 * 1024**2, max_file_bytes=512 * 1024**2,
                             receipt_name="received-handover.json", prefix="COUCHDB_ARCHIVE")

def fail(code):
    POLICY.fail(code)

def root(value):
    path = Path(value)
    if not path.is_absolute() or path.resolve() != path:
        fail("PATH_INVALID")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
        fail("PRIVATE_DIRECTORY_REQUIRED")
    return path

def pin(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_uid != os.getuid():
        fail("PRIVATE_FILE_REQUIRED")
    return native.file_hash(path, POLICY, maximum=POLICY.max_file_bytes)

def store(path, raw):
    if path.exists():
        if pin(path) != {"bytes": str(len(raw)), "sha256": hashlib.sha256(raw).hexdigest()}:
            fail("SNAPSHOT_CHANGED")
        return
    temporary = path.parent / ("." + path.name + ".couchdb-snapshot")
    if temporary.exists():
        pin(temporary)
        partial = temporary.read_bytes()
        if len(partial) > len(raw) or raw[:len(partial)] != partial:
            fail("SNAPSHOT_STAGE_CHANGED")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as out:
            out.write(raw)
            out.flush()
            os.fsync(out.fileno())
    finally:
        os.close(fd)
    os.replace(temporary, path)
    native._sync(path.parent)

def copy(original, target, expected):
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    root(target.parent)
    if target.exists():
        if pin(target) != expected:
            fail("SNAPSHOT_CHANGED")
        return
    if pin(original) != expected:
        fail("ORIGINAL_CHANGED")
    temporary = target.parent / ("." + target.name + ".couchdb-copy")
    if temporary.exists():
        partial = pin(temporary)
        if int(partial["bytes"]) > int(expected["bytes"]):
            fail("SNAPSHOT_STAGE_CHANGED")
        with original.open("rb") as original_prefix, temporary.open("rb") as retained_prefix:
            for part in iter(lambda: retained_prefix.read(1024**2), b""):
                if original_prefix.read(len(part)) != part:
                    fail("SNAPSHOT_STAGE_CHANGED")
    in_fd = os.open(original, os.O_RDONLY | os.O_NOFOLLOW)
    out_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    try:
        checksum, count = hashlib.sha256(), 0
        with os.fdopen(in_fd, "rb", closefd=False) as src, os.fdopen(out_fd, "wb", closefd=False) as dst:
            for chunk in iter(lambda: src.read(1024**2), b""):
                count += len(chunk)
                if count > int(expected["bytes"]):
                    fail("ORIGINAL_CHANGED")
                checksum.update(chunk)
                dst.write(chunk)
            dst.flush()
            os.fsync(dst.fileno())
        if {"bytes": str(count), "sha256": checksum.hexdigest()} != expected or pin(original) != expected:
            fail("ORIGINAL_CHANGED")
        os.replace(temporary, target)
        native._sync(target.parent)
    finally:
        os.close(in_fd)
        os.close(out_fd)

def snapshot(data):
    source, destination = root(data["source"]), root(data["destination"])
    if source == destination or source.is_relative_to(destination) or not destination.is_relative_to(source / "exports"):
        fail("SNAPSHOT_DIRECTORY_INVALID")
    saved = destination / "snapshot-manifest.json"
    if saved.exists():
        pin(saved)
        manifest = json.loads(saved.read_text("utf-8"))
        if manifest.get("schema") != SCHEMA or manifest.get("operationId") != data["operationId"] or manifest.get("workspace") != data["workspace"] or manifest.get("originalDirectory") != str(source):
            fail("SNAPSHOT_REQUEST_CHANGED")
    else:
        files, total = [], 0
        def walk(folder, relative=""):
            nonlocal total
            root(folder)
            for entry in sorted(folder.iterdir(), key=lambda item: item.name):
                name = relative + entry.name
                if entry.name.startswith(".") or entry.name.endswith(".lock") or entry.name == "writer.lease":
                    continue
                if name in ("exports", "receiving", "uploads", "connection.json") or name == "operations/" + data["operationId"]:
                    continue
                info = entry.lstat()
                if stat.S_ISSOCK(info.st_mode):
                    continue
                if stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                    walk(entry, name + "/")
                else:
                    descriptor = {"path": name, **pin(entry)}
                    files.append(descriptor)
                    total += int(descriptor["bytes"])
                    if total > POLICY.max_expanded_bytes or len(files) + 1 > POLICY.max_members:
                        fail("SIZE_LIMIT")
        walk(source)
        manifest = {"schema": SCHEMA, "workspace": data["workspace"], "operationId": data["operationId"],
                    "originalDirectory": str(source), "files": files}
        native._manifest(manifest, POLICY)
        store(saved, (native.encoded(manifest) + "\n").encode("utf-8"))
    frozen = root(destination / "source")
    for item in manifest["files"]:
        parts = native._relative(item["path"], POLICY)
        target, original = frozen / parts, source / parts
        if target.resolve() != target or original.resolve() != original:
            fail("PATH_INVALID")
        copy(original, target, {"bytes": item["bytes"], "sha256": item["sha256"]})
    return {"manifest": manifest, "directory": str(frozen)}

def restore_live(data):
    source, destination = root(data["source"]), root(data["destination"])
    manifest = data["manifest"]
    native._manifest(manifest, POLICY)
    if source == destination or source.is_relative_to(destination) is False:
        fail("RECEIVING_SOURCE_REQUIRED")
    original = Path(manifest["originalDirectory"])
    for item in manifest["files"]:
        name = native._relative(item["path"], POLICY)
        if name in ("receive-intent.json", "received-project.json"):
            target = destination / "original-receipts" / data["archiveSha256"] / name
        elif name.startswith("releases/"):
            target = destination / "original-releases" / data["archiveSha256"] / name[len("releases/"):]
        else:
            target = destination / name
        if target.resolve() != target:
            fail("PATH_INVALID")
        if name.startswith("publishers/") and name.endswith("/workspace.json") and len(Path(name).parts) == 3:
            product = Path(name).parts[1]
            raw = (source / name).read_bytes()
            if pin(source / name) != {"bytes": item["bytes"], "sha256": item["sha256"]}:
                fail("ORIGINAL_CHANGED")
            settings = json.loads(raw)
            if settings.get("schema") != "stellar-forge.couchdb-publisher-workspace.v1" or settings.get("sourceFile") != str(original / "products" / product / "current-source.json") or settings.get("targetDirectory") != str(original / "datasets" / product):
                fail("PUBLISHER_BINDING_CHANGED")
            settings["sourceFile"] = str(destination / "products" / product / "current-source.json")
            settings["targetDirectory"] = str(destination / "datasets" / product)
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            store(target, (json.dumps(settings, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        else:
            copy(source / name, target, {"bytes": item["bytes"], "sha256": item["sha256"]})
    return {"workspaceId": manifest["workspace"]["id"], "originalDirectory": str(original),
            "directory": str(destination), "files": len(manifest["files"]), "originalReleases": str(destination / "original-releases" / data["archiveSha256"])}

def reconcile_link(final, stage, expected):
    if not final.exists() or not stage.exists():
        return
    one, two = final.lstat(), stage.lstat()
    if (one.st_dev, one.st_ino) != (two.st_dev, two.st_ino):
        return
    if not stat.S_ISREG(one.st_mode) or stat.S_ISLNK(two.st_mode) or one.st_nlink != 2 or one.st_mode & 0o077 or one.st_uid != os.getuid():
        fail("RECEIVING_LINK_CHANGED")
    if native.file_hash(final, POLICY, maximum=POLICY.max_archive_bytes) != expected:
        fail("RECEIVING_LINK_CHANGED")
    again, pending = final.lstat(), stage.lstat()
    fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink")
    if any(getattr(one, key) != getattr(again, key) for key in fields) or (pending.st_dev, pending.st_ino) != (one.st_dev, one.st_ino):
        fail("RECEIVING_LINK_CHANGED")
    stage.unlink()
    native._sync(stage.parent)
    if final.lstat().st_nlink != 1:
        fail("RECEIVING_LINK_CHANGED")

def archive_operation(command, data):
    result = getattr(native, command)(data, policy=POLICY)
    if command == "archive":
        path = Path(data["destination"])
        raw = native._manifest(data["manifest"], POLICY)[1]
        with native._owner(path.parent, path.name, POLICY):
            reconcile_link(path, native._stage(path, hashlib.sha256(raw).hexdigest()), result["archive"])
    elif command == "extract":
        destination = Path(data["destination"])
        with native._owner(destination, "extract", POLICY):
            manifest = result["manifest"]
            for item in manifest["files"]:
                path = destination / item["path"]
                reconcile_link(path, native._stage(path, item["sha256"], root=destination),
                               {"bytes": item["bytes"], "sha256": item["sha256"]})
            raw = native._manifest(manifest, POLICY)[1]
            receipt = destination / POLICY.receipt_name
            digest = hashlib.sha256(raw).hexdigest()
            reconcile_link(receipt, native._stage(receipt, digest), {"bytes": str(len(raw)), "sha256": digest})
    return result

def main():
    # pathlib creates intermediate parents with the process umask, not mkdir(mode).
    # Keep every new snapshot/receiving directory inside this private operation 0700.
    os.umask(0o077)
    raw = sys.stdin.buffer.read(32 * 1024**2 + 1)
    if len(raw) > 32 * 1024**2:
        fail("REQUEST_TOO_LARGE")
    data = json.loads(raw.decode("utf-8"))
    command = data.pop("command")
    if command == "snapshot":
        result = snapshot(data)
    elif command == "restore-live":
        result = restore_live(data)
    elif command in ("archive", "inspect", "extract"):
        result = archive_operation(command, data)
    else:
        fail("COMMAND_INVALID")
    print(native.encoded(result), flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": getattr(error, "code", "COUCHDB_ARCHIVE_FAILED"), "message": str(error)}, ensure_ascii=False), file=sys.stderr, flush=True)
        sys.exit(1)
