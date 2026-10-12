#!/usr/bin/env python3
# MIT License. Receive the complete original merchant source, then own its run.
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tty
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("--root", type=Path, required=True)
parser.add_argument("--bytes", type=int, required=True)
parser.add_argument("--sha256", required=True)
args = parser.parse_args()
os.umask(0o077)
if args.bytes < 1 or args.bytes > 8 * 1024 * 1024:
    raise RuntimeError("Use the complete bounded original source frame.")
root = args.root
if not root.is_absolute() or root.resolve() != root:
    raise RuntimeError("Use the original absolute private root.")

def sync(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)

def directory(path):
    if path.exists():
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or path.resolve() != path:
            raise RuntimeError("Preserve the original real directory.")
        if (path == root or root in path.parents) and info.st_mode & 0o077:
            raise RuntimeError("Preserve the original private source directory.")
        return
    directory(path.parent)
    path.mkdir(mode=0o700)
    sync(path)
    sync(path.parent)

def exact(path, body):
    directory(path.parent)
    if path.exists():
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_size != len(body):
                raise RuntimeError("Preserve the selected original source target.")
            with os.fdopen(descriptor, "rb", closefd=False) as stream:
                if stream.read() != body:
                    raise RuntimeError("Keep the exact original source bytes: " + str(path))
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        sync(path.parent)
        return
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".partial")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as stream:
            stream.write(body)
            stream.flush()
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    try:
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            exact(path, body)
        temporary.unlink()
        sync(path.parent)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass

if sys.stdin.isatty():
    tty.setraw(sys.stdin.fileno())
print(json.dumps({"state": "MERCHANT_SOURCE_FRAME_READY", "pid": os.getpid(), "root": str(root), "bytes": args.bytes}), flush=True)
blocks = []
count = 0
while count < args.bytes:
    block = os.read(0, min(16384, args.bytes - count))
    if not block:
        raise RuntimeError("The complete original source frame was not received.")
    blocks.append(block)
    count += len(block)
    print(json.dumps({"state": "SOURCE_FRAME_BYTES", "bytes": count}), flush=True)
body = b"".join(blocks)
if hashlib.sha256(body).hexdigest() != args.sha256:
    raise RuntimeError("The complete source frame hash changed.")
frame = json.loads(body)
if frame.get("operation") != "SCF-X402API-MERCHANT-COMMISSIONING-7DE2-20261012" or frame.get("root") != str(root):
    raise RuntimeError("Keep the original native receiving operation.")
files = frame["selection"]["files"]
if not isinstance(files, list) or len(files) > 128:
    raise RuntimeError("Keep the complete original source inventory.")
seen = set()
for row in [*files, *frame["support_files"]]:
    relative = row["path"]
    if relative in seen or relative.startswith("/") or "\\" in relative or any(p in ("", ".", "..") for p in relative.split("/")):
        raise RuntimeError("Keep the original unique source paths.")
    seen.add(relative)
    data = row["source"].encode("utf-8")
    if len(data) != row["bytes"] or hashlib.sha256(data).hexdigest() != row["sha256"]:
        raise RuntimeError("The full source member changed: " + relative)
    if relative.endswith(".py"):
        compile(data, relative, "exec")
directory(root)
directory(root / "control")
descriptor = os.open(root / "control/operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
try:
    if not stat.S_ISREG(os.fstat(descriptor).st_mode):
        raise RuntimeError("Use the original operation lock.")
    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    exact(root / "control/input.json", body)
    for row in files:
        exact(root / "source" / row["path"], row["source"].encode("utf-8"))
    for row in frame["support_files"]:
        exact(root / row["path"], row["source"].encode("utf-8"))
    manifest = {key: value for key, value in frame["selection"].items() if key != "files"}
    manifest["files"] = [{key: value for key, value in row.items() if key != "source"} for row in files]
    exact(root / "control/SOURCE_MANIFEST.json", (json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode())
    print(json.dumps({"state": "MERCHANT_COMPLETE_SOURCE_RECEIVED", "files": len(files), "support_files": len(frame["support_files"]), "frame_sha256": args.sha256}), flush=True)
finally:
    os.close(descriptor)
os.execv(sys.executable, [sys.executable, "-B", "-u", str(root / "source/products/x402api-merchant-workspace/run-native-receiving.py"), "--root", str(root)])
