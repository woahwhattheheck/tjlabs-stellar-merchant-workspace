#!/usr/bin/env python3
"""Download and assemble the published federal-awards installed source carrier."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import urllib.request
import uuid

OPERATION = "SCF-USASPENDING-AWARD-TRANSACTIONS-64B7-20261012"
CARRIER_COMMIT = "e72ce40bf9fcb0e6b6b7927d411c0b69c35db434"
BASE = (
    "https://raw.githubusercontent.com/woahwhattheheck/"
    "tjlabs-stellar-merchant-workspace/" + CARRIER_COMMIT
    + "/operations/federal-awards-installed-64b7-20261012/binary/"
)
CONTROLS = {
    "archive-transfer.json": {
        "bytes": 8858,
        "gitBlob": "27fa4f3e1294806cbef36b5d98cded6369b21162",
    },
    "assemble-installed-source.py": {
        "bytes": 6076,
        "gitBlob": "92694266429235a5318da2f334f027903549aa19",
    },
}


def check(body, expected, name):
    blob = hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()
    if len(body) != expected["bytes"] or blob != expected["gitBlob"]:
        raise ValueError("Published source differs: " + name)
    if "sha256" in expected and hashlib.sha256(body).hexdigest() != expected["sha256"]:
        raise ValueError("Published source digest differs: " + name)
    return body


def retained(path, expected):
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode):
        raise ValueError("Expected an original regular source file: " + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as handle:
        body = handle.read(expected["bytes"] + 1)
        after = os.fstat(handle.fileno())
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
        after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
    ):
        raise ValueError("Retained source changed while reading: " + str(path))
    return check(body, expected, str(path))


def receive(directory, name, expected, timeout):
    if Path(name).name != name or name in ("", ".", ".."):
        raise ValueError("Expected the original carrier basename")
    target = directory / name
    if target.exists() or target.is_symlink():
        return retained(target, expected)
    request = urllib.request.Request(BASE + name, headers={"User-Agent": "SCF-installed-source-receiver/1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = check(response.read(expected["bytes"] + 1), expected, name)
    temporary = directory / ("." + name + ".download-" + str(uuid.uuid4()))
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, target, follow_symlinks=False)
        except FileExistsError:
            retained(target, expected)
    finally:
        temporary.unlink(missing_ok=True)
    return body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, help="Owned stable directory for the exact ZIP and extracted source")
    parser.add_argument("--timeout", type=float, default=45, help="Timeout in seconds for each public source request")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    directory = Path(args.directory).absolute()
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if (not stat.S_ISDIR(info.st_mode) or directory.is_symlink()
            or directory.resolve() != directory or info.st_uid != os.getuid()
            or info.st_mode & 0o077):
        raise ValueError("Use an owned private directory on the receiving host")
    for name, expected in CONTROLS.items():
        receive(directory, name, expected, args.timeout)
    manifest = json.loads((directory / "archive-transfer.json").read_bytes())
    if (manifest.get("schema") != "stellar-forge.federal-awards-installed-archive.v1"
            or manifest.get("operation") != OPERATION):
        raise ValueError("Expected the original installed source manifest")
    parts = manifest["parts"]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for _ in pool.map(lambda part: receive(directory, part["path"], part, args.timeout), parts):
            pass
    # The unchanged original assembler validates all nine parts, the complete ZIP,
    # and every original archive member before extracting the canonical packet.
    completed = subprocess.run([
        sys.executable, str(directory / "assemble-installed-source.py"),
        "--manifest", str(directory / "archive-transfer.json"),
        "--directory", str(directory),
        "--extract", str(directory / "source"),
    ])
    return completed.returncode


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError) as error:
        print(json.dumps({"operation": OPERATION, "error": type(error).__name__, "message": str(error)}), file=sys.stderr)
        raise SystemExit(1)
