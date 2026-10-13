#!/usr/bin/env python3
"""Receive the completed Study Flow handoff and continue its original saved dossier."""
from __future__ import annotations
import argparse, fcntl, hashlib, json, os, pathlib, signal, stat, subprocess, sys, tempfile, zipfile

SOURCE_SHA = "aeb44fe395890ce3b404f3ac7fbf2daa68d03c216bd2582aadb50111357ece5e"
SOURCE_BYTES = 6224643
ARCHIVE_SHA = "41803ffd17f47f9f55ddff16d9f9cc0568122d9b449010e6e4a486e63880d418"
ARCHIVE_BYTES = 192327
OPERATION = "STUDY-FLOW-ORIGINAL-RIS-63DD-20261012"
HERE = pathlib.Path(__file__).resolve().parent
PREFIX = pathlib.Path("operations/research-study-flow-63dd-20261012")

def digest(body):
    return hashlib.sha256(body).hexdigest()

def exact_bytes(path, size, sha):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size != size:
        raise ValueError("Expected exact regular input: " + str(path))
    body = path.read_bytes()
    if len(body) != size or digest(body) != sha:
        raise ValueError("Input identity changed: " + str(path))
    return body

def directory(path):
    path = path.absolute()
    chain = [path, *path.parents]
    for item in reversed(chain):
        if item.exists() or item.is_symlink():
            if item.is_symlink() or not item.is_dir():
                raise ValueError("Expected an owned regular directory: " + str(item))
        else:
            item.mkdir(mode=0o700)
    return path

def relative(value):
    item = pathlib.PurePosixPath(value)
    if not value or item.is_absolute() or "\\" in value or any(x in ("", ".", "..") for x in value.split("/")):
        raise ValueError("Invalid retained relative path")
    return pathlib.Path(*item.parts)

def keep(path, body):
    directory(path.parent)
    if path.exists() or path.is_symlink():
        if not stat.S_ISREG(path.lstat().st_mode) or path.read_bytes() != body:
            raise ValueError("Existing retained bytes differ: " + str(path))
        return
    fd, name = tempfile.mkstemp(prefix=path.name + ".incoming-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(body)
            out.flush()
            os.fsync(out.fileno())
        try:
            os.link(name, path, follow_symlinks=False)
        except FileExistsError:
            if not stat.S_ISREG(path.lstat().st_mode) or path.read_bytes() != body:
                raise ValueError("Concurrent source changed: " + str(path))
    finally:
        os.unlink(name)
    if path.read_bytes() != body:
        raise ValueError("Retained file readback changed: " + str(path))

def json_bytes(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

def child(command, cwd):
    worker = subprocess.Popen(command, cwd=cwd, start_new_session=True)
    prior = {}
    def forward(number, frame):
        if worker.poll() is None:
            os.killpg(worker.pid, number)
    for number in (signal.SIGINT, signal.SIGTERM):
        prior[number] = signal.signal(number, forward)
    try:
        code = worker.wait()
        if code:
            raise subprocess.CalledProcessError(code, command)
    finally:
        for number, handler in prior.items():
            signal.signal(number, handler)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-carrier", type=pathlib.Path, default=HERE / "RECEIVING_SOURCE.json")
    parser.add_argument("--handoff", type=pathlib.Path, required=True)
    parser.add_argument("--source-root", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--playwright-module", required=True)
    parser.add_argument("--chromium", required=True)
    args = parser.parse_args()
    source_body = exact_bytes(args.source_carrier, SOURCE_BYTES, SOURCE_SHA)
    exact_bytes(args.handoff, ARCHIVE_BYTES, ARCHIVE_SHA)
    packet = json.loads(source_body)
    if packet.get("schema") != "commons.study-flow-receiving-source/v2" or len(packet.get("files", [])) != 380:
        raise ValueError("Wrong original receiving source selection")
    root, out = directory(args.source_root), directory(args.out)
    lock_path = out / ".receiving-continuation.lock"
    lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, "a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        files = []
        seen = set()
        for record in packet["files"]:
            path = relative(record["path"])
            if str(path) in seen:
                raise ValueError("Duplicate source leaf")
            seen.add(str(path))
            body = record["content"].encode("utf-8")
            blob = hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()
            if len(body) != record["bytes"] or digest(body) != record["sha256"] or blob != record["gitBlob"]:
                raise ValueError("Invalid complete source leaf: " + str(path))
            keep(root / path, body)
            files.append({k: v for k, v in record.items() if k != "content"})
        # The two complete receiving helpers are part of this reviewed source kit.
        for name in ("receive-original.py", "restore-portable.mjs"):
            body = (HERE / name).read_bytes()
            keep(root / PREFIX / name, body)
        archive_files = []
        with zipfile.ZipFile(args.handoff) as archive:
            members = archive.infolist()
            if len(members) != 35 or len({x.filename for x in members}) != 35:
                raise ValueError("Original 35-file handoff membership changed")
            for member in members:
                if member.is_dir() or stat.S_ISLNK(member.external_attr >> 16):
                    raise ValueError("Original handoff must contain regular files")
                path = relative(member.filename)
                body = archive.read(member)
                keep(out / path, body)
                archive_files.append({"path": str(path), "bytes": len(body), "sha256": digest(body)})
        baseline = json.loads((out / "result.json").read_bytes())
        if baseline.get("operationId") != OPERATION or baseline.get("native", {}).get("revision") != 15:
            raise ValueError("Wrong original completed dossier")
        identity = {"schema": "commons.study-flow-receiving-placement/v1", "operationId": OPERATION,
                    "originalSource": packet["source"], "sourceCarrier": {"bytes": SOURCE_BYTES, "sha256": SOURCE_SHA},
                    "handoff": {"bytes": ARCHIVE_BYTES, "sha256": ARCHIVE_SHA}, "sourceRoot": str(root),
                    "operationDirectory": str(out), "sources": files, "archiveFiles": archive_files}
        keep(out / "receiving-placement.json", json_bytes(identity))
        print(json.dumps({"phase": "source-and-original-handoff-ready", "files": len(files), "operationId": OPERATION}), flush=True)
        command = [args.node, str(root / PREFIX / "restore-portable.mjs"), "--source-root", str(root), "--out", str(out)]
        child(command, root)
        child([args.node, str(root / PREFIX / "browser-receiving.mjs"), "--source-root", str(root), "--out", str(out),
               "--playwright-module", str(pathlib.Path(args.playwright_module).resolve()),
               "--chromium", str(pathlib.Path(args.chromium).resolve())], root)
        print(json.dumps({"operationId": OPERATION, "state": "complete", "mcpResult": str(out / "mcp-receiving/result.json"),
                          "browserResult": str(out / "browser-receiving/result.json")}), flush=True)
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"operationId": OPERATION, "state": "interrupted", "error": type(error).__name__,
                          "message": str(error)}), file=sys.stderr, flush=True)
        raise SystemExit(1)
