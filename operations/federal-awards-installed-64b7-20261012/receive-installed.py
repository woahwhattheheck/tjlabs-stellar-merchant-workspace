#!/usr/bin/env python3
"""Continue the original federal-awards operation through its installed product."""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
from datetime import datetime, timezone
import uuid
import zipfile

OPERATION = "SCF-USASPENDING-AWARD-TRANSACTIONS-64B7-20261012"
SCHEMA = "stellar-forge.federal-awards-installed-source.v1"
ROOT_PACKET = "9cfce7aae075c3c5f4cbc470bd85fd447e6aeacc"
DIST = "stellar/scf-starforge-20261009/distribution"
APP = "stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/application-native.mjs"

def need(ok, message):
    if not ok:
        raise ValueError(message)

def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def path_name(value):
    need(isinstance(value, str) and value and "\\" not in value and "\0" not in value,
         "Invalid original source path")
    p = PurePosixPath(value)
    need(not p.is_absolute() and all(part not in ("", ".", "..") for part in value.split("/")),
         "Use a contained original source path")
    return value

def regular(path, maximum=40 * 1024 * 1024):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and not path.is_symlink() and info.st_size <= maximum,
         "Expected an original regular file: " + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as handle:
        data = handle.read(maximum + 1)
        after = os.fstat(handle.fileno())
    need(len(data) == info.st_size and len(data) <= maximum and
         (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns) ==
         (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns),
         "Original file changed while reading: " + str(path))
    return data

def private(path, create=False):
    need(path.is_absolute() and path.resolve(strict=not create) == path,
         "Use the existing canonical private path: " + str(path))
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and
         info.st_mode & 0o077 == 0 and info.st_uid == os.getuid(),
         "An owned private directory is required: " + str(path))
    return path

def retained(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    need(path.parent.resolve() == path.parent, "Source directory was redirected")
    if path.exists() or path.is_symlink():
        need(regular(path) == data, "An original retained file differs: " + str(path))
        return
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())

def write_json(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    private(path.parent, create=True)
    temp = path.with_name("." + path.name + "." + uuid.uuid4().hex)
    retained(temp, data)
    os.replace(temp, path)

def command(args, cwd, stage, journal, journal_path, environment):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    logs = journal_path.parent / "logs"
    private(logs, create=True)
    stdout = logs / (stage + "-" + stamp + ".stdout")
    stderr = logs / (stage + "-" + stamp + ".stderr")
    attempt = {"stage": stage, "command": args, "startedAt": now(),
               "stdout": str(stdout), "stderr": str(stderr)}
    journal["attempts"].append(attempt)
    journal["phase"] = stage
    write_json(journal_path, journal)
    print(json.dumps({"operation": OPERATION, **attempt}), flush=True)
    with stdout.open("xb") as output, stderr.open("xb") as error:
        result = subprocess.run(args, cwd=cwd, stdout=output, stderr=error,
                                shell=False, env=environment)
    stdout.chmod(0o600)
    stderr.chmod(0o600)
    attempt.update(completedAt=now(), exitCode=result.returncode)
    write_json(journal_path, journal)
    if result.returncode:
        detail = regular(stderr, 16 * 1024 * 1024)[-12000:].decode("utf-8", "replace")
        print(detail, file=sys.stderr, flush=True)
        raise RuntimeError("Original " + stage + " returned " + str(result.returncode) +
                           "; retain " + str(stderr))
    return stdout

def bundle(root):
    destination = root.parent / (root.name + "-installed-federal-awards.zip")
    temporary = destination.with_name(destination.name + "." + uuid.uuid4().hex)
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(root.rglob("*")):
            relative = path.relative_to(root)
            if any(part in ("node_modules", ".npm", ".git") for part in relative.parts):
                continue
            if path.is_symlink() or not path.is_file():
                continue
            archive.write(path, root.name + "/" + relative.as_posix())
    os.replace(temporary, destination)
    destination.chmod(0o600)
    data = regular(destination, 512 * 1024 * 1024)
    return {"archive": str(destination), "archiveBytes": len(data), "archiveSha256": sha(data)}

def run(args):
    root = private(Path(args.directory).absolute())
    node = Path(args.node).absolute()
    need(node.is_file() and os.access(node, os.X_OK), "Use an existing executable Node 22.16+")
    packet_path = Path(args.packet).absolute()
    packet_raw = regular(packet_path, 2 * 1024 * 1024)
    packet = json.loads(packet_raw)
    need(packet.get("schema") == SCHEMA and packet.get("operation") == OPERATION,
         "Use the declared installed-source continuation")
    source = packet["source"]
    need(source.get("repository") == "woahwhattheheck/tjlabs-stellar-merchant-workspace" and
         len(source.get("commit", "")) == 40, "Use the canonical original product source")
    root_packet = regular(root / "original-source-packet.json")
    need(git_blob(root_packet) == ROOT_PACKET, "Continue the original root source packet")
    original_raw = regular(root / "native" / "receiving-result.json")
    original = json.loads(original_raw)
    need(original.get("schema") == "usaspending-transactions.native-receiving.v1",
         "Complete the original root receiving stage")
    merchant_raw = regular(root / "mcp-native" / "operation.json")
    merchant = json.loads(merchant_raw)
    need(merchant.get("status") == "complete" and merchant.get("operationId") == OPERATION,
         "Complete the original merchant receiving stage")
    application_raw = regular(root / "applications-source" / "application-receiving-result.json")
    application = json.loads(application_raw)
    need(application.get("schema") == "usaspending.application-native-receiving.v1" and
         application.get("operation") == OPERATION and
         application.get("mode") == "original-source-application" and
         application.get("originalCaptureId") == original.get("captureId"),
         "Complete the original source Applications receiving stage")
    metadata_path = packet_path.parent / path_name(packet["metadata"]["path"])
    metadata_raw = regular(metadata_path, 8 * 1024 * 1024)
    need(git_blob(metadata_raw) == packet["metadata"]["gitBlob"],
         "Original Git source metadata changed")
    metadata = json.loads(metadata_raw)
    need(metadata.get("source", {}).get("commit") == source["commit"] and
         metadata.get("source", {}).get("tree") == source["tree"],
         "The original source commit/tree changed")
    entries = {row["path"]: row for row in metadata["tree"]["tree"]}
    files, part_bytes = {}, []
    for part in packet["parts"]:
        raw = regular(packet_path.parent / path_name(part["path"]), 2 * 1024 * 1024)
        need(len(raw) == part["bytes"] and git_blob(raw) == part["gitBlob"],
             "Original source part changed: " + part["path"])
        value = json.loads(raw)
        need(value.get("schema") == "stellar-forge.federal-awards-source-part.v1" and
             value.get("operation") == OPERATION and value.get("sourceCommit") == source["commit"],
             "Source part belongs to another product")
        count, total = 0, 0
        for item in value["files"]:
            path = path_name(item["path"])
            need(path not in files and isinstance(item.get("content"), str),
                 "Duplicate or invalid original source body")
            data = item["content"].encode("utf-8")
            entry = entries.get(path, {})
            need(entry.get("type") == "blob" and entry.get("mode") in ("100644", "100755") and
                 item["mode"] == entry["mode"] and item["gitBlob"] == entry.get("sha") and
                 len(data) == item["bytes"] == entry.get("size") and git_blob(data) == item["gitBlob"],
                 "Source body differs from the original Git object: " + path)
            files[path] = (item, data)
            count += 1
            total += len(data)
        need(count == part["sourceFiles"] and total == part["sourceBytes"],
             "Original source-part totals changed")
        part_bytes.append((part["path"], raw))
    need(set(files) == set(metadata["requiredPaths"]) and len(files) == packet["sourceFiles"] and
         sum(len(value[1]) for value in files.values()) == packet["sourceBytes"],
         "Receive the complete declared original source cache")
    for path in (DIST + "/git-object-receiving.py", DIST + "/build.mjs",
                 DIST + "/runtime-install.mjs", APP):
        need(path in files, "Original receiving implementation missing: " + path)
    helper_raw = regular(packet_path.parent / path_name(packet["driver"]["path"]), 256 * 1024)
    need(git_blob(helper_raw) == packet["driver"]["gitBlob"], "Installed continuation driver changed")
    installation = private(root / "installed-federal-awards", create=True)
    lock_fd = os.open(installation / "operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(lock_fd)
        raise RuntimeError("The original installed continuation is already running") from None
    try:
        inputs = {"sourcePacket": sha(packet_raw), "sourceCommit": source["commit"],
                  "originalRoot": sha(original_raw), "merchant": sha(merchant_raw),
                  "sourceApplications": sha(application_raw)}
        journal_path = installation / "operation.json"
        journal = json.loads(regular(journal_path)) if journal_path.exists() else {
            "schema": "stellar-forge.federal-awards-installed-operation.v1", "operation": OPERATION,
            "directory": str(root), "inputs": inputs, "createdAt": now(), "attempts": []}
        need(journal.get("operation") == OPERATION and journal.get("directory") == str(root) and
             journal.get("inputs") == inputs, "Resume this operation with its original source and native input")
        delivery = private(installation / "delivery", create=True)
        retained(delivery / "source-transfer.json", packet_raw)
        retained(delivery / packet["metadata"]["path"], metadata_raw)
        retained(delivery / packet["driver"]["path"], helper_raw)
        retained(delivery / "receive-installed.py", regular(Path(__file__).absolute(), 256 * 1024))
        for name, raw in part_bytes:
            retained(delivery / name, raw)
        incoming = private(installation / "objects", create=True)
        for item, data in files.values():
            retained(incoming / (item["gitBlob"] + ".blob"), data)
        receiver = installation / "git-object-receiving.py"
        retained(receiver, files[DIST + "/git-object-receiving.py"][1])
        cache, native_source = installation / "git-source", installation / "source"
        environment = dict(os.environ)
        environment["PATH"] = str(node.parent) + os.pathsep + environment.get("PATH", "")
        command([sys.executable, str(receiver), "--metadata", str(delivery / packet["metadata"]["path"]),
                 "--commit", source["commit"], "--directory", str(cache), "--git", args.git,
                 "--incoming", str(incoming), "--materialize", str(native_source)],
                root, "receive-original-git", journal, journal_path, environment)
        config = {"operation": OPERATION, "sourceCommit": source["commit"],
                  "directory": str(root), "sourceRoot": str(native_source),
                  "repository": str(cache / "repository.git"), "directoryForInstall": str(installation),
                  "python": sys.executable, "npm": args.npm, "offline": args.offline,
                  "cache": str(Path(args.cache).absolute()) if args.cache else None,
                  "nodeHeaders": str(Path(args.node_headers).absolute()) if args.node_headers else None,
                  "adoptExisting": args.adopt_existing}
        write_json(installation / "request.json", config)
        try:
            output = command([str(node), str(delivery / packet["driver"]["path"]),
                              "--request", str(installation / "request.json")],
                             native_source, "build-install-managed-applications", journal,
                             journal_path, environment)
            result = json.loads(regular(installation / "installed-receiving-result.json"))
            need(result.get("operation") == OPERATION and result.get("sourceCommit") == source["commit"] and
                 result.get("status") == "complete", "Original installed programme did not complete")
            journal.update(phase="complete", completedAt=now(), result=str(installation / "installed-receiving-result.json"))
            journal.pop("error", None)
            write_json(journal_path, journal)
            print(json.dumps({**result, **bundle(root)}), flush=True)
            return 0
        except BaseException as error:
            journal.update(phase="interrupted", updatedAt=now(),
                           error={"type": type(error).__name__, "message": str(error)})
            write_json(journal_path, journal)
            raise
    finally:
        os.close(lock_fd)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", required=True)
    parser.add_argument("--directory", required=True, help="Same original ROOT after root, MCP and source Applications")
    parser.add_argument("--node", required=True, help="Existing Node 22.16+ executable")
    parser.add_argument("--git", default="git", help="Existing Git with --no-lazy-fetch support")
    parser.add_argument("--npm", default="npm")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--cache")
    parser.add_argument("--node-headers")
    parser.add_argument("--adopt-existing", action="store_true",
                        help="Use the original installer to adopt an already retained complete dependency graph")
    args = parser.parse_args()
    try:
        return run(args)
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(json.dumps({"operation": OPERATION, "status": "interrupted",
                          "error": type(error).__name__, "message": str(error)}), file=sys.stderr, flush=True)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
