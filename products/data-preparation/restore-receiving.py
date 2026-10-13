#!/usr/bin/env python3
"""MIT. Receive a closed original managed PREP12 operation on another Linux host."""
from __future__ import annotations
import argparse
import contextlib
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
import uuid
import zipfile

HERE = Path(__file__).resolve().parent
FILE_SCHEMA = "stellar-forge.data-preparation-managed-customer-files.v1"
PROGRESS_SCHEMA = "stellar-forge.data-preparation-managed-continuation.v1"
RESTORE_SCHEMA = "stellar-forge.data-preparation-managed-restore.v1"
HASH = re.compile(r"^[a-f0-9]{64}$")
ATTEMPT = re.compile(r"^[a-f0-9]{32}$")
PACKAGE_SHA = "38b52c9837c81177d691127e07587894de7ae52bd6ef74013b02a18578814577"
PROJECT_SHA = "8fbdb47b26da8c5742f573a28dd603635a661e99122807a41c04276871d03779"

def need(value, message):
    if not value:
        raise ValueError(message)

def sha_file(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def canonical(path):
    need(path.is_absolute() and path == path.resolve(), "Use a canonical absolute destination")
    return path

def private_directory(path):
    canonical(path)
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid()
         and stat.S_IMODE(info.st_mode) == 0o700, "Use an owned private directory with mode 0700")
    return path

def safe_name(value, *, directory=False):
    need(isinstance(value, str) and value, "A complete archive member needs its original name")
    name = value[:-1] if directory and value.endswith("/") else value
    pure = PurePosixPath(name)
    need(not pure.is_absolute() and pure.parts and ".." not in pure.parts
         and str(pure) == name and "\\" not in name,
         "Use the original relative archive member names")
    need((value.endswith("/")) == directory, "Keep file and directory entries distinct")
    return name

def write(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with path.open("xb") as stream:
        os.chmod(path, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())

def replace(path, data):
    temporary = path.with_name("." + path.name + "-" + uuid.uuid4().hex)
    try:
        write(temporary, data)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

def rename_new(staging, destination):
    """Publish one verified directory atomically without replacing another operation."""
    try:
        renameat2 = ctypes.CDLL(None, use_errno=True).renameat2
    except AttributeError as exc:
        raise RuntimeError("This Linux receiver needs libc renameat2 for create-only publication") from exc
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                         ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    parent = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        result = renameat2(parent, os.fsencode(staging.name), parent, os.fsencode(destination.name), 1)
        if result:
            number = ctypes.get_errno()
            raise OSError(number, os.strerror(number), str(destination))
    finally:
        os.close(parent)

def seal_directories(directory):
    """Keep implicit archive parents private and sync each complete directory before publish."""
    selected = [directory, *(path for path in directory.rglob("*") if path.is_dir())]
    for path in reversed(selected):
        info = path.lstat()
        need(stat.S_ISDIR(info.st_mode), "Receive only original directories")
        os.chmod(path, 0o700)
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def read_progress(directory):
    path = directory / "managed-receiving-progress.json"
    if not path.exists():
        return None, None
    raw = path.read_bytes()
    progress = json.loads(raw)
    need(progress.get("schema") == PROGRESS_SCHEMA, "Keep the original complete receiving progress")
    need(progress.get("packageSha256") == PACKAGE_SHA and progress.get("projectSha256") == PROJECT_SHA,
         "The receiving progress belongs to another original project")
    need(isinstance(progress.get("operationId"), str) and progress["operationId"],
         "Retain the original managed receiving operation identity")
    return progress, raw

def original_location(progress, selected):
    if selected is not None:
        value = str(selected)
    elif progress and isinstance(progress.get("operationDirectory"), str):
        value = progress["operationDirectory"]
    elif progress and isinstance(progress.get("preparation"), dict):
        path = progress["preparation"].get("archives", {}).get("project")
        need(isinstance(path, str), "Select the original operation directory for this saved preparation")
        pure = PurePosixPath(path)
        need(pure.name == "project.zip" and pure.parent.name == "downloads",
             "Retain the original complete preparation project path")
        owner = pure.parent.parent
        if owner.parent.name == "receiving-attempts":
            need(ATTEMPT.fullmatch(owner.name), "Retain the original receiving attempt identity")
            owner = owner.parent.parent
        value = str(owner)
    else:
        return None
    pure = PurePosixPath(value)
    need(pure.is_absolute() and str(pure) == value and ".." not in pure.parts,
         "Use the recorded canonical original operation directory")
    return pure

def relocate_progress(progress, previous, destination, members, directories):
    """Change only execution-owned artifact locations; saved customer data stays exact."""
    locations = []
    def relocate(value, *, directory=False):
        need(isinstance(value, str), "Retain the complete original artifact path")
        need(previous is not None, "Select the original operation directory for retained artifact paths")
        original = PurePosixPath(value)
        need(original.is_absolute() and str(original) == value and ".." not in original.parts,
             "The retained artifact path is not canonical")
        try:
            relative = original.relative_to(previous).as_posix()
        except ValueError as exc:
            raise ValueError("An artifact is outside the selected original operation") from exc
        need(relative not in ("", "."), "Select a complete artifact within the original operation")
        if directory:
            need(relative + "/" in directories or any(key.startswith(relative + "/") for key in members),
                 "The complete saved directory is absent from this checkpoint")
        else:
            need(relative in members, "The complete saved artifact is absent from this checkpoint: " + relative)
        current = str(destination / relative)
        locations.append({"original": value, "current": current, "member": relative, "directory": directory})
        return current
    preparation = progress.get("preparation")
    if preparation is not None:
        need(isinstance(preparation, dict), "Retain the complete preparation result")
        archives = preparation.get("archives")
        need(isinstance(archives, dict), "Retain every completed preparation project archive")
        for name, path in archives.items():
            archives[name] = relocate(path)
        preparation["merchantArchive"] = relocate(preparation["merchantArchive"])
        captures = preparation.get("browser", {}).get("captures", [])
        need(isinstance(captures, list), "Retain the original browser capture records")
        for capture in captures:
            need(isinstance(capture, dict), "Retain the complete original capture record")
            capture["path"] = relocate(capture["path"])
    if progress.get("completed") is not None:
        need(isinstance(progress["completed"], dict), "Retain the original completion record")
        progress["completed"]["attempt"] = relocate(progress["completed"]["attempt"], directory=True)
    progress["operationDirectory"] = str(destination)
    return locations

def inspect_archive(archive):
    entries = archive.infolist()
    names = [item.filename for item in entries]
    need(len(names) == len(set(names)), "The checkpoint has duplicate member names")
    need("files.json" in names, "Select the complete closed customer checkpoint")
    need(archive.getinfo("files.json").file_size <= 64 * 1024 * 1024, "The original file inventory is too large")
    raw = archive.read("files.json")
    inventory = json.loads(raw)
    need(inventory.get("schema") == FILE_SCHEMA and isinstance(inventory.get("members"), dict),
         "Use the original managed customer file inventory")
    members = inventory["members"]
    need("files.json" not in members, "The file inventory cannot inventory itself")
    directory_list = inventory.get("directories", [])
    need(isinstance(directory_list, list) and len(directory_list) == len(set(directory_list)),
         "Retain each original directory once")
    directories = set(directory_list)
    need("files.json/" not in directories, "The file inventory cannot be a directory")
    need(set(names) == {"files.json", *members, *directories},
         "Receive the whole exact original checkpoint inventory")
    for name, record in members.items():
        safe_name(name)
        need(isinstance(record, dict) and type(record.get("bytes")) is int and record["bytes"] >= 0
             and isinstance(record.get("sha256"), str) and HASH.fullmatch(record["sha256"]),
             "Retain each original complete file size and SHA-256")
        entry = archive.getinfo(name)
        mode = entry.external_attr >> 16
        need(not entry.is_dir() and (stat.S_IFMT(mode) in (0, stat.S_IFREG)),
             "Only original regular files can be received")
        need(entry.file_size == record["bytes"], "The original file length changed: " + name)
    for name in directories:
        safe_name(name, directory=True)
        entry = archive.getinfo(name)
        need(entry.is_dir() and entry.file_size == 0 and
             stat.S_IFMT(entry.external_attr >> 16) in (0, stat.S_IFDIR),
             "Retain the original empty directory entries")
    for name in members:
        need(name + "/" not in directories, "A path cannot be both a file and directory")
    for name in [*members, *directories]:
        for parent in PurePosixPath(name).parents:
            need(str(parent) not in members, "A file cannot own another archive path")
    for filename, expected in [("original-package.zip", PACKAGE_SHA), ("original-project.zip", PROJECT_SHA)]:
        need(members.get(filename, {}).get("sha256") == expected,
             "The checkpoint does not contain the unchanged original PREP12 package")
    return inventory, raw

def verify_original_inputs(directory):
    need(sha_file(directory / "original-package.zip") == PACKAGE_SHA, "The original package changed")
    need(sha_file(directory / "original-project.zip") == PROJECT_SHA, "The original native project changed")
    spec = importlib.util.spec_from_file_location("_managed_preparation_receiver", HERE / "receiving.py")
    need(spec is not None and spec.loader is not None, "Keep this helper with the current complete receiver")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    original = module.verify_project(directory / "original-project.zip")
    need(sum(item["rows"] for item in original["workspace"]["sources"]) == 120012,
         "Retain the complete original source population")

def restore(args):
    destination = canonical(args.directory)
    private_directory(destination.parent)
    need(HASH.fullmatch(args.expected_sha256), "Use the complete selected checkpoint SHA-256")
    checkpoint = args.checkpoint.resolve()
    need(checkpoint.is_file() and sha_file(checkpoint) == args.expected_sha256,
         "The complete checkpoint differs from its selected SHA-256")
    receipt_path = destination / "managed-receiving-restore.json"
    if destination.exists():
        private_directory(destination)
        need(receipt_path.is_file() and not receipt_path.is_symlink(),
             "Use a new private receiving directory or this original completed restore")
        receipt = json.loads(receipt_path.read_text())
        need(receipt.get("schema") == RESTORE_SCHEMA and receipt.get("archiveSha256") == args.expected_sha256
             and receipt.get("directory") == str(destination), "The destination belongs to another restore")
        verify_original_inputs(destination)
        progress, _ = read_progress(destination)
        if receipt.get("operationId") is not None:
            need(progress is not None and progress["operationId"] == receipt["operationId"],
                 "The original operation identity changed after restore")
        return {**receipt, "reused": True}
    staging = Path(tempfile.mkdtemp(prefix=".preparation-checkpoint-", dir=destination.parent))
    os.chmod(staging, 0o700)
    published = False
    try:
        with zipfile.ZipFile(checkpoint) as archive:
            inventory, inventory_raw = inspect_archive(archive)
            members, directories = inventory["members"], set(inventory.get("directories", []))
            for name in sorted(directories, key=lambda value: (len(PurePosixPath(value).parts), value)):
                (staging / safe_name(name, directory=True)).mkdir(mode=0o700, parents=True, exist_ok=True)
            for name, record in members.items():
                target = staging / name
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with archive.open(name) as original, target.open("xb") as output:
                    os.chmod(target, 0o600)
                    found, hasher = 0, hashlib.sha256()
                    while block := original.read(1024 * 1024):
                        output.write(block)
                        hasher.update(block)
                        found += len(block)
                    output.flush()
                    os.fsync(output.fileno())
                need(found == record["bytes"] and hasher.hexdigest() == record["sha256"],
                     "The complete original member changed: " + name)
        verify_original_inputs(staging)
        progress, original_progress = read_progress(staging)
        previous = original_location(progress, args.original_directory)
        restore_id = uuid.uuid4().hex
        history = staging / "receiving-restorations" / restore_id
        history.mkdir(mode=0o700, parents=True)
        write(history / "source-files.json", inventory_raw)
        prior_receipt = staging / "managed-receiving-restore.json"
        if prior_receipt.exists():
            write(history / "original-restore.json", prior_receipt.read_bytes())
        locations = []
        if progress is not None:
            write(history / "original-progress.json", original_progress)
            locations = relocate_progress(progress, previous, destination, members, directories)
            replace(staging / "managed-receiving-progress.json", encoded(progress))
        receipt = {
            "schema": RESTORE_SCHEMA, "restoreId": restore_id,
            "archiveSha256": args.expected_sha256, "archiveBytes": checkpoint.stat().st_size,
            "sourceInventorySha256": hashlib.sha256(inventory_raw).hexdigest(),
            "directory": str(destination), "originalDirectory": str(previous) if previous else None,
            "operationId": progress["operationId"] if progress is not None else None,
            "originalPackageSha256": PACKAGE_SHA, "originalProjectSha256": PROJECT_SHA,
            "originalInputRows": 120012, "files": len(members), "directories": len(directories),
            "restoredFileBytes": sum(item["bytes"] for item in members.values()),
            "artifactLocations": locations,
            "originalProgressSha256": hashlib.sha256(original_progress).hexdigest() if original_progress else None,
            "workingProgressSha256": sha_file(staging / "managed-receiving-progress.json") if progress else None,
            "historyDirectory": "receiving-restorations/" + restore_id,
        }
        write(history / "restore.json", encoded(receipt))
        replace(staging / "managed-receiving-restore.json", encoded(receipt))
        seal_directories(staging)
        rename_new(staging, destination)
        published = True
        descriptor = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        return {**receipt, "reused": False}
    finally:
        if not published:
            with contextlib.suppress(FileNotFoundError):
                shutil.rmtree(staging)


def saved_runtime(directory, manifest):
    """Select one complete frozen runtime from the restored original invocation."""
    need(manifest.get("schema") == "stellar-forge.data-preparation-managed-receiving-source.v1",
         "Keep the complete maintained source manifest beside this receiver")
    files = manifest.get("files")
    need(isinstance(files, dict) and files, "Select the complete maintained runtime inventory")
    for name, record in files.items():
        safe_name(name)
        need(isinstance(record, dict) and type(record.get("bytes")) is int and record["bytes"] >= 0
             and isinstance(record.get("sha256"), str) and HASH.fullmatch(record["sha256"])
             and isinstance(record.get("blob"), str) and re.fullmatch(r"[a-f0-9]{40}", record["blob"]),
             "Retain the selected source byte length, SHA-256 and Git blob identity")
    for source in sorted(directory.glob("receiving-attempts/*/source")):
        if not ATTEMPT.fullmatch(source.parent.name) or source != source.resolve() or not source.is_dir():
            continue
        selection = source.parent / "receiving-source.json"
        if selection.is_symlink() or not selection.is_file():
            continue
        try:
            recorded = json.loads(selection.read_bytes())
        except (ValueError, OSError):
            continue
        if (not isinstance(recorded, dict)
                or recorded.get("sourceCommit") != manifest.get("sourceCommit")
                or recorded.get("files") != files):
            continue
        complete = True
        for name, expected in files.items():
            path = source / name
            if path != path.resolve() or not path.is_file():
                complete = False
                break
            data = path.read_bytes()
            if (len(data) != expected["bytes"]
                    or hashlib.sha256(data).hexdigest() != expected["sha256"]
                    or hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
                    != expected["blob"]):
                complete = False
                break
        if complete:
            return source
    raise ValueError("This checkpoint has no complete saved runtime matching receiving-source.json; "
                     "supply --source-root for the complete selected source edition")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", required=True, type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--original-directory", type=Path,
        help="Recorded old operation directory when this earlier checkpoint needs an explicit location")
    parser.add_argument("--restore-only", action="store_true",
        help="Receive and verify this complete original case without starting its customer continuation")
    parser.add_argument("--source-root", type=Path,
        help="Complete selected source; by default reuse a matching frozen runtime from the restored case")
    parser.add_argument("--source-commit",
        help="Selected runtime commit; defaults to the adjacent receiving-source.json")
    parser.add_argument("--node", default="node")
    parser.add_argument("--playwright-module")
    parser.add_argument("--chromium")
    parser.add_argument("--save-helper", type=Path)
    parser.add_argument("--timeout-seconds", type=int, default=600)
    args = parser.parse_args()
    if not args.restore_only:
        need(args.playwright_module and args.chromium,
             "Supply the actual Node/Playwright and installed Chromium for the whole continuation")
        manifest = json.loads((HERE / "receiving-source.json").read_bytes())
        need(manifest.get("schema") == "stellar-forge.data-preparation-managed-receiving-source.v1"
             and isinstance(manifest.get("sourceCommit"), str)
             and re.fullmatch(r"[a-f0-9]{40}", manifest["sourceCommit"]),
             "Keep the complete selected source manifest beside this receiver")
        source_commit = args.source_commit or manifest["sourceCommit"]
        need(source_commit == manifest["sourceCommit"],
             "Select the exact immutable source commit in receiving-source.json")
    receipt = restore(args)
    print(json.dumps({"stage": "ORIGINAL_MANAGED_CHECKPOINT_RECEIVED", **receipt}), flush=True)
    if args.restore_only:
        return 0
    source_root = args.source_root.resolve() if args.source_root is not None else saved_runtime(args.directory, manifest)
    print(json.dumps({"stage": "ORIGINAL_MANAGED_RUNTIME_SELECTED",
        "sourceRoot": str(source_root), "sourceCommit": source_commit,
        "fromSavedCase": args.source_root is None, "files": len(manifest["files"])}), flush=True)
    command = [sys.executable, str(HERE / "receiving.py"),
        "--source-root", str(source_root), "--source-commit", source_commit,
        "--package", str(args.directory / "original-package.zip"),
        "--directory", str(args.directory), "--continue",
        "--node", args.node, "--playwright-module", args.playwright_module,
        "--chromium", args.chromium, "--timeout-seconds", str(args.timeout_seconds)]
    if args.save_helper is not None:
        command += ["--save-helper", str(args.save_helper)]
    os.execv(sys.executable, command)
    raise AssertionError("Original receiving exec returned")

if __name__ == "__main__":
    sys.exit(main())
