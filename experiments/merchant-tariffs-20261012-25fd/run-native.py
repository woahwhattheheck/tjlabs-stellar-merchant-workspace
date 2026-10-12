#!/usr/bin/env python3
"""Receive and run one complete original merchant tariff operation."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import zipfile

OPERATION = "SCF-MERCHANT-TARIFFS-25FD-20261012"

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def exact_write(path, body):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("xb") as stream:
        stream.write(body)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(path, 0o600)

def git_blob(body):
    return hashlib.sha1(b"blob " + str(len(body)).encode("ascii") + b"\0" + body).hexdigest()

def checked_source(item):
    path = item["path"]
    relative = PurePosixPath(path)
    if not path or relative.is_absolute() or relative.as_posix() != path or any(part in ("", ".", "..") for part in relative.parts):
        raise ValueError("Unsupported original source path: " + repr(path))
    body = item["content"].encode("utf-8")
    if len(body) != item["bytes"] or git_blob(body) != item["gitBlob"]:
        raise ValueError("Original source bytes changed: " + path)
    return relative, body

def archive_directory(root, destination):
    pending = destination.with_suffix(destination.suffix + ".partial")
    entries = [path for path in sorted(root.rglob("*")) if path not in (destination, pending)]
    with zipfile.ZipFile(pending, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as output:
        for path in entries:
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                raise ValueError("A native operation returned an unexpected symbolic link: " + str(path))
            if stat.S_ISREG(mode):
                output.write(path, path.relative_to(root).as_posix())
    pending.rename(destination)
    body = destination.read_bytes()
    return {"path": str(destination), "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", required=True)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    os.umask(0o077)
    raw_packet = Path(args.packet).read_bytes()
    packet = json.loads(raw_packet)
    if packet.get("schema") != "commons.merchant-tariff-native-source.v1" or packet.get("operation") != OPERATION:
        raise ValueError("Use the complete original tariff source packet.")
    node = shutil.which(args.node)
    if not node:
        raise ValueError("Choose the existing Node executable.")
    node = str(Path(node).resolve(strict=True))
    checked, names = [], set()
    for item in packet["files"]:
        relative, body = checked_source(item)
        if str(relative) in names:
            raise ValueError("Duplicate original source path: " + str(relative))
        names.add(str(relative))
        checked.append((relative, body))
    if packet["fileCount"] != len(checked):
        raise ValueError("The complete source packet file count changed.")
    programs = packet["programs"]
    for item in programs:
        checked_source(item)
    root = Path(args.directory).absolute()
    if root != Path(os.path.realpath(root)):
        raise ValueError("Use an absolute real private output path.")
    root.mkdir(mode=0o700)
    source = root / "source"
    source.mkdir(mode=0o700)
    record = {
        "schema": "stellar-forge.merchant-tariff-native-receiving.v1",
        "operation": OPERATION,
        "startedAt": now(),
        "sourceRepository": packet["repository"],
        "sourceCommit": packet["sourceCommit"],
        "packetSha256": hashlib.sha256(raw_packet).hexdigest(),
        "node": node,
        "sourceFiles": len(checked),
        "sourceBytes": sum(len(body) for _, body in checked),
        "runs": [],
    }
    exact_write(root / "source-packet.json", raw_packet)
    for relative, body in checked:
        exact_write(source.joinpath(*relative.parts), body)
    for item in programs:
        relative, body = checked_source(item)
        exact_write(root.joinpath(*relative.parts), body)
    exact_write(root / "source-materialized.json", encoded(record))
    source_root = source / "stellar/scf-starforge-20261009/sf97-merchant-revenue-ops"
    native_output = root / "native"
    commands = [{
        "name": "original-tariff-workflow",
        "argv": [node, str(root / "native-workflow.mjs"),
                 "--source-root", str(source_root), "--output", str(native_output)],
    }]
    outcome = 0
    for command in commands:
        run = {"name": command["name"], "argv": command["argv"], "startedAt": now()}
        exact_write(root / (run["name"] + "-request.json"), encoded(run))
        with (root / (run["name"] + "-stdout.txt")).open("xb") as stdout, (root / (run["name"] + "-stderr.txt")).open("xb") as stderr:
            try:
                child = subprocess.Popen(command["argv"], cwd=source, stdout=stdout, stderr=stderr)
                run["pid"] = child.pid
                exact_write(root / (run["name"] + "-process.json"), encoded(run))
                outcome = child.wait()
                run["exitCode"] = outcome
                run["status"] = "COMPLETED" if outcome == 0 else "FAILED"
            except OSError as error:
                outcome = 1
                run.update(status="PROCESS_NOT_CREATED", error=str(error))
        run["finishedAt"] = now()
        record["runs"].append(run)
        exact_write(root / (run["name"] + "-result.json"), encoded(run))
        if outcome:
            break
    record.update(finishedAt=now(), status="COMPLETED" if outcome == 0 else "FAILED")
    exact_write(root / "native-receiving-result.json", encoded(record))
    artifact = archive_directory(root, root / "Merchant_Tariffs_Original_Operation.zip")
    print(json.dumps({"operation": OPERATION, "status": record["status"], "directory": str(root), "runs": record["runs"], "artifact": artifact}, indent=2))
    return 0 if outcome == 0 else 1

if __name__ == "__main__":
    raise SystemExit(main())
