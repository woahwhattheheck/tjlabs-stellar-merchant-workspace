#!/usr/bin/env python3
"""Assemble the complete canonical federal-awards installed source archive."""
from __future__ import annotations
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

OPERATION = "SCF-USASPENDING-AWARD-TRANSACTIONS-64B7-20261012"

def need(value, message):
    if not value:
        raise ValueError(message)

def regular(path, limit):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_size <= limit, "Expected a complete regular source file: " + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as handle:
        body = handle.read(limit + 1)
        after = os.fstat(handle.fileno())
    need(len(body) == info.st_size and (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns) ==
         (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns), "Original source changed during reading")
    return body

def sha256(body):
    return hashlib.sha256(body).hexdigest()

def git_blob(body):
    return hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()

def relative(value):
    need(isinstance(value, str) and value and "\\" not in value and "\0" not in value,
         "Invalid original archive path")
    need(not PurePosixPath(value).is_absolute() and all(x not in ("", ".", "..") for x in value.split("/")),
         "Use the original contained archive paths")
    return value

def retain(path, body):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    need(path.parent.resolve() == path.parent, "Destination directory was redirected")
    if path.exists() or path.is_symlink():
        need(regular(path, len(body)) == body, "An existing source file differs: " + str(path))
        return
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(body)
        handle.flush()
        os.fsync(handle.fileno())

def run(args):
    manifest_path = Path(args.manifest).absolute()
    manifest = json.loads(regular(manifest_path, 1024 * 1024))
    need(manifest.get("schema") == "stellar-forge.federal-awards-installed-archive.v1" and
         manifest.get("operation") == OPERATION, "Use the original installed-source archive manifest")
    directory = Path(args.directory).absolute() if args.directory else manifest_path.parent
    parts = manifest["parts"]
    archive = manifest["archive"]
    need(0 < len(parts) <= 64 and archive["bytes"] <= 64 * 1024 * 1024, "Unexpected original archive size")
    data = bytearray()
    for part in parts:
        name = relative(part["path"])
        body = regular(directory / (name + ".b64" if args.base64 else name), 2 * 1024 * 1024)
        if args.base64:
            body = base64.b64decode(b"".join(body.split()), validate=True)
        need(part["offset"] == len(data) and len(body) == part["bytes"] and
             sha256(body) == part["sha256"] and git_blob(body) == part["gitBlob"],
             "A source archive part differs: " + name)
        data.extend(body)
    need(len(data) == archive["bytes"] and sha256(data) == archive["sha256"] and git_blob(data) == archive["gitBlob"],
         "The complete original archive differs")
    expected = {relative(item["path"]): item for item in manifest["sourceFiles"]}
    members = {}
    with zipfile.ZipFile(io.BytesIO(data)) as source:
        need(len(source.infolist()) == len(expected), "Unexpected source archive members")
        for info in source.infolist():
            name = relative(info.filename)
            item = expected.get(name)
            need(item is not None and name not in members and not info.is_dir() and
                 stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFREG) and
                 info.file_size == item["bytes"], "An original archive member differs")
            body = source.read(info)
            need(len(body) == item["bytes"] and git_blob(body) == item["gitBlob"],
                 "Original source bytes differ: " + name)
            members[name] = body
    output = Path(args.output).absolute() if args.output else directory / archive["filename"]
    retain(output, bytes(data))
    result = {"operation": OPERATION, "archive": str(output), "bytes": len(data),
              "sha256": archive["sha256"], "sourceCommit": archive["sourceCommit"],
              "sourceFiles": len(members)}
    if args.extract:
        destination = Path(args.extract).absolute()
        if not destination.exists():
            destination.mkdir(mode=0o700, parents=True)
        info = destination.lstat()
        need(stat.S_ISDIR(info.st_mode) and not destination.is_symlink() and
             destination.resolve() == destination and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0,
             "Use an owned private source extraction directory")
        for name, body in members.items():
            retain(destination / name, body)
        result["sourceDirectory"] = str(destination / "federal-awards-installed")
    print(json.dumps(result, indent=2), flush=True)
    return 0

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--directory", help="Directory containing the original binary archive parts")
    parser.add_argument("--base64", action="store_true", help="Read each unchanged Git file content from PART_NAME.b64")
    parser.add_argument("--output", help="Retain the exact complete ZIP at this path")
    parser.add_argument("--extract", help="Extract all original source files into this private directory")
    args = parser.parse_args()
    try:
        return run(args)
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as error:
        print(json.dumps({"operation": OPERATION, "error": type(error).__name__, "message": str(error)}),
              file=sys.stderr, flush=True)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
