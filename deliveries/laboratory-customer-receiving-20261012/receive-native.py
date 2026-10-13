#!/usr/bin/env python3
"""Restore the exact customer-result source and continue its original native job.

This is a source installer and the existing 62c14 foreground entry. The original
native controller owns admission, command execution, cancellation and artifacts.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tempfile
import zlib

OPERATION = "LAB-RESULT-CUSTOMER-RECEIVING-9F77-20261012"
CAPSULE_SHA256 = "81de8b10e2102dbd7eee302b55e522b995ecfd8471d7f00e8dacc4434df7dabc"
RAW_SHA256 = "6d2b45dba7c1b899b93f6a41e021384e93ff9a58100d10ea3f6663248527eb48"
RAW_BYTES = 502726
SOURCE_COMMIT = "0c422d12288849eb38466b4e36e9288e4383d0e8"
LAB = "stellar/scf-starforge-20261009/sf30-seller-sdk/lab-edd"
MAX_INPUT = 4 * 1024 * 1024

def digest(data):
    return hashlib.sha256(data).hexdigest()

def held(path, maximum=MAX_INPUT):
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or before.st_size > maximum:
            raise ValueError("Use an owned bounded regular source file.")
        chunks = []
        count = 0
        while True:
            block = os.read(fd, min(131072, maximum + 1 - count))
            if not block:
                break
            chunks.append(block)
            count += len(block)
            if count > maximum:
                raise ValueError("Source file exceeds its complete bound.")
        after = os.fstat(fd)
        fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if any(getattr(before, field) != getattr(after, field) for field in fields) or count != before.st_size:
            raise ValueError("The original source file changed during its held read.")
        return b"".join(chunks)
    finally:
        os.close(fd)

def folder(path):
    path = Path(os.path.abspath(path))
    if path == Path("/") or path.resolve() != path:
        raise ValueError("Select a real private receiving directory.")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    observed = path.lstat()
    if not stat.S_ISDIR(observed.st_mode) or observed.st_uid != os.geteuid() or observed.st_mode & 0o077:
        raise ValueError("Keep receiving directories private and owned.")
    return path

def publish(path, data):
    folder(path.parent)
    try:
        if held(path, max(MAX_INPUT, len(data))) != data:
            raise ValueError("Different bytes already occupy an original receiving path: " + str(path))
        return
    except FileNotFoundError:
        pass
    fd, temporary = tempfile.mkstemp(prefix=".receive-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            if held(path, max(MAX_INPUT, len(data))) != data:
                raise ValueError("Concurrent original publication differs: " + str(path))
    finally:
        os.unlink(temporary)
    directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)

def receive_input(path):
    capsule_bytes = held(path)
    if digest(capsule_bytes) != CAPSULE_SHA256:
        raise ValueError("Select the complete original published input capsule.")
    capsule = json.loads(capsule_bytes)
    if capsule.get("schema") != "commons.complete-lab-customer-receiving/v1" or capsule.get("operationId") != OPERATION:
        raise ValueError("The original customer receiving identity differs.")
    body = capsule["content"]
    compressed = base64.b64decode(body["data"], validate=True)
    if len(compressed) != body["compressedBytes"] or digest(compressed) != body["compressedSha256"]:
        raise ValueError("The complete input transport differs.")
    decoder = zlib.decompressobj(-15)
    raw = decoder.decompress(compressed, RAW_BYTES + 1)
    if len(raw) != RAW_BYTES or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail or digest(raw) != RAW_SHA256:
        raise ValueError("The original complete receiving input differs.")
    payload = json.loads(raw)
    if payload.get("operationId") != OPERATION or payload.get("sourceCommit") != SOURCE_COMMIT or len(payload["sourceFiles"]) != 26:
        raise ValueError("The selected complete source edition differs.")
    files = []
    paths = set()
    for item in payload["sourceFiles"]:
        relative = PurePosixPath(item["path"])
        if relative.is_absolute() or str(relative) != item["path"] or any(part in ("", ".", "..") for part in relative.parts) or item["path"] in paths:
            raise ValueError("A selected source path is invalid or repeated.")
        paths.add(item["path"])
        data = item["content"].encode("utf-8")
        git_blob = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
        if len(data) != item["bytes"] or digest(data) != item["sha256"] or git_blob != item["gitBlob"]:
            raise ValueError("An original source member differs: " + item["path"])
        files.append((relative, data))
    for name in paths:
        if any(str(parent) in paths for parent in PurePosixPath(name).parents if str(parent) != "."):
            raise ValueError("A source file collides with a source directory.")
    result = payload["result"]
    result_bytes = base64.b64decode(result["content"], validate=True)
    if len(result_bytes) != result["bytes"] or digest(result_bytes) != result["sha256"]:
        raise ValueError("The original complete result ZIP differs.")
    return payload, files, result_bytes

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--records-root", default="/workspace/shared/swarm/jobs/native")
    parser.add_argument("--memory-reservations-root", default="/workspace/shared/swarm/capacity/memory")
    parser.add_argument("--disk-reservations-root", default="/workspace/shared/swarm/capacity/disk")
    parser.add_argument("--stage-only", action="store_true",
                        help="Restore and verify only; return the exact command without registering native work.")
    args = parser.parse_args()
    os.umask(0o077)
    payload, files, result_bytes = receive_input(args.input)
    root = Path(os.path.abspath(args.directory))
    source = root / "source"
    original = root / "input" / payload["result"]["filename"]
    node = str(Path(args.node).resolve(strict=True))
    if not os.path.isfile(node) or not os.access(node, os.X_OK):
        raise ValueError("Select the existing absolute Node 24 executable.")
    command = [node, "--max-old-space-size=192", str(source / LAB / "received-result-receiving.mjs"),
               "--file", str(original), "--directory", str(root / "receiving"),
               "--expected-result-sha256", payload["result"]["sha256"],
               "--source-kind", payload["result"]["sourceKind"], "--operation-id", OPERATION]
    # The original parser supplies every maintained launch default.
    host = Path(args.host).resolve(strict=True)
    sys.path.insert(0, str(host))
    from native_foreground import load_native, ForegroundLaunch, resume_foreground
    native = load_native(host)
    record = native.run_path(OPERATION, args.records_root)
    prior = native.read_json(record / "request.json")
    if prior and (prior["intent"]["project"] != str(root) or prior["intent"]["command"] != command):
        raise ValueError("Preserve the original native request and selected paths; this input does not replace it.")
    folder(root)
    preparation = {"schema": "commons.lab-result-customer-preparation/v1",
                   "operationId": OPERATION, "inputSha256": CAPSULE_SHA256, "sourceCommit": SOURCE_COMMIT,
                   "directory": str(root), "command": command, "record": str(record),
                   "sourceFiles": [{key: value for key, value in item.items() if key != "content"}
                                   for item in payload["sourceFiles"]],
                   "result": {key: value for key, value in payload["result"].items() if key != "content"}}
    publish(root / "preparation.json", (json.dumps(preparation, sort_keys=True, indent=2) + "\n").encode())
    for relative, data in files:
        publish(source / relative, data)
    publish(original, result_bytes)
    if args.stage_only:
        print(json.dumps({"status": "SOURCE_READY", **preparation}), flush=True)
        return 0
    launch_parser = argparse.ArgumentParser(add_help=False)
    native.launch_options(launch_parser)
    launch_args = launch_parser.parse_args([
        "9F77", "--operation-id", OPERATION, "--project", str(root),
        "--records-root", args.records_root,
        "--memory-mib", "256", "--memory-reserve-mib", "256",
        "--memory-reclaim", "none", "--memory-storage", "included",
        "--memory-reservations-root", args.memory_reservations_root,
        "--disk-space", str(root) + "=16", "--disk-space", args.records_root + "=8",
        "--disk-inodes", str(root) + "=512", "--disk-inodes", args.records_root + "=256",
        "--disk-reserve-mib", "16", "--disk-reserve-inodes", "128",
        "--disk-reservations-root", args.disk_reservations_root,
        "--artifact-on-success", "receiving", "--retain-artifacts",
        "--runtime-path", str(source), "--runtime-path", node,
        "--report-format", "summary"])
    launch_args.command = command
    launch = ForegroundLaunch(native)
    try:
        report = native.start(launch_args, launcher=launch)
        print(json.dumps(native.report_value(report, "summary")), flush=True)
        if report.get("reused") and not report.get("supervisor_alive") and not report.get("process_alive"):
            report = resume_foreground(native, OPERATION, args.records_root,
                                       action="resume-capacity", report_format="summary")
            print(json.dumps(native.report_value(report, "summary")), flush=True)
    finally:
        code = launch.handoff()
        if code is not None:
            raise SystemExit(code)
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, ImportError) as error:
        print(json.dumps({"status": "RECEIVING_PENDING", "operationId": OPERATION,
                          "error": type(error).__name__, "message": str(error)}), file=sys.stderr)
        raise SystemExit(2)
