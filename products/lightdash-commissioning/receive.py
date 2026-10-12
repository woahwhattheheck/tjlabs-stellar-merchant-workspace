#!/usr/bin/env python3
"""Own one complete archive extraction and included-application reopen, without provider work."""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import uuid

SCHEMA = "stellar-forge.lightdash-handover-receiving.v1"
PRODUCT = "products/lightdash-commissioning"
def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
def digest(value):
    return hashlib.sha256(value).hexdigest()
def identity(file):
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise ValueError("Use a regular original selected file")
    h = hashlib.sha256()
    with file.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    after = file.lstat()
    if (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
        raise ValueError("The complete selected file changed")
    return {"bytes": info.st_size, "sha256": h.hexdigest()}
def verify(file, item):
    if identity(file) != {"bytes": item["bytes"], "sha256": item["sha256"]}:
        raise ValueError("Original source or archive changed: " + str(file))
def read(file):
    identity(file)
    return json.loads(file.read_bytes())
def sync(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
def save(file, value):
    temporary = file.with_name(file.name + "." + str(uuid.uuid4()) + ".partial")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write((json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, file)
        sync(file.parent)
    finally:
        if temporary.exists():
            temporary.unlink()
def relative(value):
    if not isinstance(value, str) or not value or value.startswith("/") or "\\" in value or "\0" in value or any(x in ("", ".", "..") for x in value.split("/")):
        raise ValueError("Use the original relative source member")
    return value
def canonical_directory(directory):
    if not directory.is_absolute() or directory.resolve() != directory or not stat.S_ISDIR(directory.lstat().st_mode):
        raise ValueError("Use the original canonical private directory")
def run_child(command, environment, lease, directory, name):
    child = None
    handlers = {}
    try:
        with (directory / (name + ".stdout.log")).open("ab", buffering=0) as output, (directory / (name + ".stderr.log")).open("ab", buffering=0) as error:
            os.chmod(output.name, 0o600)
            os.chmod(error.name, 0o600)
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=error,
                                     env=environment, pass_fds=(lease,), start_new_session=True)
            def forward(number, frame):
                if child.poll() is None:
                    os.killpg(child.pid, number)
            for number in (signal.SIGTERM, signal.SIGINT):
                handlers[number] = signal.signal(number, forward)
            save(directory / "process.json", {"schema": SCHEMA, "phase": name, "pid": child.pid, "command": command})
            code = child.wait()
            os.fsync(output.fileno())
            os.fsync(error.fileno())
            if code != 0:
                raise RuntimeError("Original receiving child ended " + str(code) + "; retain " + name + " logs")
    finally:
        # An acquired child is drained even if its process receipt could not be persisted.
        if child is not None and child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                child.wait(timeout=30)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
        for number, handler in handlers.items():
            signal.signal(number, handler)
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    item = read(args.input)
    basis = {key: value for key, value in item.items() if key != "inputSha256"}
    if item.get("schema") != SCHEMA or digest(canonical(basis).encode()) != item["inputSha256"]:
        raise ValueError("The retained complete receiving selection changed")
    directory = Path(item["directory"])
    canonical_directory(directory)
    if args.input != directory / "receiving.json":
        raise ValueError("Use the original retained receiving path")
    source = Path(item["source"]["directory"])
    manifest_file = Path(item["source"]["manifestFile"])
    if identity(manifest_file)["sha256"] != item["source"]["manifestSha256"]:
        raise ValueError("The original selected runtime manifest changed")
    manifest = read(manifest_file)
    selected = {entry["path"]: entry for entry in manifest["files"]}
    for name in ("receive.py", "receive-open.mjs", "common.mjs"):
        verify(source / PRODUCT / name, selected[PRODUCT + "/" + name])
    if Path(__file__).resolve() != source / PRODUCT / "receive.py":
        raise ValueError("Execute the selected original installed receiver")
    application = Path(item["application"]["directory"])
    app_manifest = Path(item["application"]["manifestFile"])
    if identity(app_manifest)["sha256"] != item["application"]["manifestSha256"]:
        raise ValueError("The selected original application manifest changed")
    for entry in read(app_manifest)["files"]:
        verify(application / relative(entry["path"]), entry)
    for file in (item["archive"], item["requestFile"]):
        verify(Path(file["file"]), file)
    lockfile = directory / "receiving.lock"
    lease = os.open(lockfile, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(lease)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError("Use the permanent original receiving lease")
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        identity_value = {"device": info.st_dev, "inode": info.st_ino, "operationId": item["operationId"], "inputSha256": item["inputSha256"]}
        os.ftruncate(lease, 0)
        os.write(lease, (canonical(identity_value) + "\n").encode())
        os.fsync(lease)
        environment = dict(os.environ)
        environment["LDW_RECEIVING_LEASE_FD"] = str(lease)
        environment["LDW_RECEIVING_LEASE_IDENTITY"] = canonical(identity_value)
        received = directory / "received"
        opened = directory / "open-intent.json"
        if not opened.exists():
            command = [item["python"], "-B", str(application / "receiving/handover.py"),
                       "--app", str(application), "--application-manifest-sha256", item["application"]["manifestSha256"],
                       "--archive", item["archive"]["file"], "--archive-bytes", str(item["archive"]["bytes"]),
                       "--archive-sha256", item["archive"]["sha256"], "--destination", str(received),
                       "--operation-id", item["operationId"], "--input-sha256", item["inputSha256"]]
            run_child(command, environment, lease, directory, "extract")
            extraction = received / "extraction.json"
            retained = read(extraction)
            if retained.get("state") != "COMPLETE" or retained.get("inputSha256") != item["inputSha256"]:
                raise ValueError("The original complete extractor has not finished")
            save(opened, {"schema": SCHEMA, "inputSha256": item["inputSha256"], "extraction": {"file": str(extraction), **identity(extraction)}})
        else:
            retained = read(opened)
            if retained.get("inputSha256") != item["inputSha256"] or Path(retained["extraction"]["file"]) != received / "extraction.json":
                raise ValueError("The original archive open intent changed")
            verify(Path(retained["extraction"]["file"]), retained["extraction"])
        run_child([item["node"], str(source / PRODUCT / "receive-open.mjs"), "--input", str(args.input)],
                  environment, lease, directory, "open")
        result = read(directory / "result.json")
        if result.get("state") != "COMPLETE" or result.get("inputSha256") != item["inputSha256"]:
            raise ValueError("The included original application has not completed receiving")
        print(json.dumps(result, ensure_ascii=False))
        return 0
    finally:
        os.close(lease)
if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"state": "INCOMPLETE", "error": {"type": type(error).__name__, "message": str(error)}}), file=sys.stderr)
        raise SystemExit(3)
