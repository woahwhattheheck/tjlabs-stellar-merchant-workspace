#!/usr/bin/env python3
"""Receive the exact current runtime and retained public files, then run one course.

No HTTP acquisition is performed. Use the original connected file receiving route
to materialize the named retained Notion attachments before this command. The
first preparation returns actual CSV date spellings for explicit operator review.
"""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import signal
import stat
import subprocess
import sys
import tempfile

OPERATION = "CSE-DELAWARE-PUBLIC-REFERENCE-814B-20261013"
REPOSITORY = "woahwhattheheck/tjlabs-stellar-merchant-workspace"
COMMIT = "4655211dc5feab86553a1425e71950ad8eb4d0ca"
PACKET_BLOB = "58d67bf48531ab38906a9e06f736c040fd16c4b7"
PROGRAMME_BLOB = "d4b13be858a17e0f6b24d7df45343ef3011cb7e8"
PROGRAMME_SOURCE_URL = "https://raw.githubusercontent.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/0b5fcaa696edfebf5c20ead453b2d380916b84df/operations/delaware-public-reference-814b-20261013/delaware_public_reference.py"
PREFIX = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/"
REQUEST = "https://data.delaware.gov/resource/8z8z-di7f.csv?$limit=10000&$order=%3Aid"
ROLES = ("csv", "metadata", "count", "header", "acceptance")
ORIGINS = {
    "csv": "notion:file-upload:3f8dd772-3100-810b-9580-00b2b0725ed6",
    "metadata": "notion:file-upload:3f8dd772-3100-81ef-914b-00b2b0779699",
    "count": "notion:file-upload:3f8dd772-3100-8185-87a0-00b2e7a80378",
    "header": "notion:file-upload:3f8dd772-3100-8122-b486-00b29f1a652b",
    "acceptance": "notion:file-upload:3f8dd772-3100-8108-a2a9-00b2dfbffefb"
}


def need(condition, message):
    if not condition:
        raise RuntimeError(message)


def read(path, maximum=256 * 1024 * 1024):
    path = Path(path).expanduser().absolute()
    need(path.resolve() == path, "Canonical original file required")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= maximum, "Original regular file required")
        data = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
        key = lambda info: (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
        need(key(before) == key(after) and len(data) == before.st_size, "Original file changed while receiving")
    return data


def metadata(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()


def folder(path):
    path = Path(path).expanduser().absolute()
    missing, current = [], path
    while not os.path.lexists(current):
        missing.append(current)
        current = current.parent
    need(current.resolve() == current and stat.S_ISDIR(current.lstat().st_mode), "Real receiving parent required")
    for item in reversed(missing):
        item.mkdir(mode=0o700)
    info = path.lstat()
    need(path.resolve() == path and stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and not info.st_mode & 0o077,
         "Owned private receiving directory required")
    return path


def publish(staged, target):
    import ctypes
    libc = ctypes.CDLL(None, use_errno=True)
    need(sys.platform.startswith("linux") and hasattr(libc, "renameat2"), "Linux atomic no-replace receiving required")
    call = libc.renameat2
    call.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    call.restype = ctypes.c_int
    if call(-100, os.fsencode(staged), -100, os.fsencode(target), 1):
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(target))
    fd = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def keep(path, data):
    folder(path.parent)
    if os.path.lexists(path):
        need(read(path) == data, "Existing received file changed: " + str(path))
        return
    fd, name = tempfile.mkstemp(prefix=".receiving-", dir=path.parent)
    staged = Path(name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            publish(staged, path)
        except FileExistsError:
            need(read(path) == data, "Concurrent receiving differs")
    finally:
        if staged.exists():
            staged.unlink()


def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def source(root, packet_path, programme_path):
    raw = read(packet_path, 4 * 1024 * 1024)
    need(len(raw) == 1899340 and git_blob(raw) == PACKET_BLOB, "Complete current runtime packet changed")
    packet = json.loads(raw)
    need(packet["schema"] == "commons.analysis-runtime-source-closure.v1" and
         packet["selectedRepository"] == REPOSITORY and packet["selectedCommit"] == COMMIT and
         len(packet["files"]) == 79, "Original 79-file runtime selection required")
    paths = set()
    for item in packet["files"]:
        relative = PurePosixPath(item["path"])
        need(not relative.is_absolute() and ".." not in relative.parts and
             item["path"].startswith(PREFIX) and item["path"] not in paths, "Unsafe or duplicate runtime member")
        paths.add(item["path"])
        body = item["content"].encode("utf-8")
        need(len(body) == item["bytes"] and git_blob(body) == item["blobSha"], "Runtime member identity changed")
        keep(root / "source" / item["path"], body)
    programme = read(programme_path, 4 * 1024 * 1024)
    need(git_blob(programme) == PROGRAMME_BLOB, "Independently reviewed complete programme changed")
    target = root / "source" / PREFIX / "python/examples/delaware_public_reference.py"
    keep(target, programme)
    keep(root / "runtime-source-packet.json", raw)
    return target, programme, root / "source" / PREFIX / "python"


def originals(root, selection_path):
    selection_raw = read(selection_path, 1024 * 1024)
    selection = json.loads(selection_raw)
    need(selection.get("schema") == "stellar-forge.delaware-retained-file-selection.v1" and
         selection.get("operation") == OPERATION and set(selection.get("files", {})) == set(ROLES),
         "Exact previously retained source selection required")
    received = {}
    origins = {}
    for role in ROLES:
        item = selection["files"][role]
        need(item.get("origin") == ORIGINS[role], "The exact original retained Notion identity is required")
        data = read(item["path"])
        need(metadata(data) == {key: item[key] for key in ("bytes", "sha256")}, "Selected original attachment changed: " + role)
        destination = root / "originals" / (role + (".csv" if role in ("csv", "header") else ".json"))
        keep(destination, data)
        received[role] = {"path": str(destination), **metadata(data)}
        origins[role] = item["origin"]
    need(received["csv"]["bytes"] == 927011, "Original whole CSV is required")
    path = root / "originals" / "materialization-receipt.json"
    invariant = {"schema": "stellar-forge.delaware-source-materialization.v1", "operation": OPERATION,
                 "sourceRequest": REQUEST, "originalHttpCapturedAt": None,
                 "origin": origins, "files": {role: {key: received[role][key] for key in ("bytes", "sha256")} for role in ROLES}}
    if path.exists():
        receipt = json.loads(read(path))
        need(all(receipt.get(key) == value for key, value in invariant.items()), "Original materialization receipt changed")
    else:
        receipt = {**invariant, "materializedAt": datetime.now(timezone.utc).isoformat(),
                   "event": "Exact retained Notion files received into this original owned operation; upstream HTTP capture time unavailable."}
        keep(path, encoded(receipt))
    received["receipt"] = {"path": str(path), **metadata(read(path))}
    keep(root / "retained-file-selection.json", selection_raw)
    return received


def stop(child):
    if child is None:
        return
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        child.wait(timeout=15)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait()


def main():
    need(sys.version_info >= (3, 11), "Python 3.11 or later required")
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-packet", required=True)
    parser.add_argument("--programme", required=True)
    parser.add_argument("--programme-source-url", default=PROGRAMME_SOURCE_URL, help="Exact retained immutable programme URL")
    parser.add_argument("--sources", required=True, help="Actual retained-file selection JSON, with full hashes and stable Notion identities")
    parser.add_argument("--work-directory", required=True)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--date-format", help="Explicitly reviewed format of the actual received CSV date strings")
    parser.add_argument("--retry-terminal", action="store_true")
    args = parser.parse_args()
    need(args.programme_source_url == PROGRAMME_SOURCE_URL, "Reviewed immutable programme source URL changed")
    root = folder(args.work_directory)
    lock_fd = os.open(root / "original-controller.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    child = None
    try:
        info = os.fstat(lock_fd)
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.getuid() and not info.st_mode & 0o077,
             "Original private receiving lock required")
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        programme, program_bytes, python_root = source(root, args.source_packet, args.programme)
        files = originals(root, args.sources)
        if args.prepare_only:
            values = list(csv.DictReader(io.StringIO(read(files["csv"]["path"]).decode("utf-8-sig"), newline="")))
            dates = list(dict.fromkeys(row["date_of_purchase"] for row in values))
            print(json.dumps({"operation": OPERATION, "state": "RECEIVED_FOR_DATE_FORMAT_REVIEW",
                "rows": len(values), "dateExamples": dates[:12], "lastDateExamples": dates[-5:],
                "csv": files["csv"], "receipt": files["receipt"],
                "note": "Review the actual CSV spellings; this preparation did not open an Analysis workspace."}), flush=True)
            return
        need(args.date_format, "Run --prepare-only, inspect original date spellings, then supply --date-format")
        need(importlib.util.find_spec("openpyxl") is not None, "Existing openpyxl runtime is required")
        input_ = {"schema": "stellar-forge.delaware-public-reference-input.v1", "operation": OPERATION,
                  "programmeSha256": hashlib.sha256(program_bytes).hexdigest(),
                  "programmeSourceUrl": args.programme_source_url,
                  "dateFormatReviewed": True, "dateFormat": args.date_format, "files": files}
        input_path = root / "course-input.json"
        keep(input_path, encoded(input_))
        temporary = folder(root / "temporary-build")
        need(os.statvfs(temporary).f_bavail * os.statvfs(temporary).f_frsize > 256 * 1024 * 1024,
             "At least 256 MiB of writable private temporary capacity required")
        env = dict(os.environ, PYTHONPATH=str(python_root), PYTHONUNBUFFERED="1", TMPDIR=str(temporary))
        command = [sys.executable, str(programme), "--input", str(input_path),
                   "--work-directory", str(root / "course")]
        if args.retry_terminal:
            command.append("--retry-terminal")
        previous = {}
        def interrupted(number, frame):
            raise KeyboardInterrupt("Original receiving interrupted by signal " + str(number))
        for number in (signal.SIGINT, signal.SIGTERM):
            previous[number] = signal.signal(number, interrupted)
        try:
            child = subprocess.Popen(command, env=env, cwd=root, start_new_session=True)
            status = child.wait()
            need(status == 0, "Original public-reference programme exited " + str(status))
        finally:
            stop(child)
            child = None
            for number, handler in previous.items():
                signal.signal(number, handler)
        result = json.loads(read(root / "course" / "programme.json", 16 * 1024 * 1024))
        need(result["state"] == "DATA_COMPLETE", "Native data course did not complete")
        print(json.dumps({"operation": OPERATION, "state": result["state"],
                          "delivery": str(root / "course" / "delivery"),
                          "visualInspection": result["visualInspection"]}), flush=True)
    finally:
        stop(child)
        os.close(lock_fd)


if __name__ == "__main__":
    main()
