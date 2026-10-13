#!/usr/bin/env python3
"""Recover complete original customer receiving files from an exported job log."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile

PREFIX = "SCF_CUSTOMER_"
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+")
SHA = re.compile(r"^[a-f0-9]{64}$")
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")
MARKERS = ("SCF_CUSTOMER_FILE ", "SCF_CUSTOMER_CHUNK ", "SCF_CUSTOMER_FILE_END ")

def need(value, message):
    if not value:
        raise ValueError(message)

def name(value):
    need(isinstance(value, str) and NAME.fullmatch(value), "Invalid retained file name")
    parts = PurePosixPath(value).parts
    need(parts and not value.startswith("/") and all(part not in ("", ".", "..") for part in value.split("/")),
         "Invalid retained file path")
    return value

def integer(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0

def recover(logs, output):
    """Read only emitted frames; write exact complete files into a new private directory."""
    logs = logs.resolve(strict=True)
    need(logs.is_file(), "Select the complete original job log")
    need(not output.exists(), "Use a new output directory; retained files are never overwritten")
    output.parent.resolve(strict=True)
    output.mkdir(mode=0o700)
    active = None
    retained = {}
    log_hash = hashlib.sha256()
    try:
        with logs.open("rb") as stream:
            for line_number, raw in enumerate(stream, 1):
                log_hash.update(raw)
                line = TIMESTAMP.sub("", raw.decode("utf-8", errors="strict").rstrip("\r\n"))
                marker = next((item for item in MARKERS if line.startswith(item)), None)
                if marker is None:
                    continue
                frame = json.loads(line[len(marker):])
                need(isinstance(frame, dict), "Invalid receiving frame at line " + str(line_number))
                path = name(frame.get("path"))
                if marker == "SCF_CUSTOMER_FILE ":
                    need(active is None, "Previous original file is missing its end frame")
                    need(path not in retained, "Repeated original file header: " + path)
                    need(integer(frame.get("bytes")) and integer(frame.get("chunks")) and
                         isinstance(frame.get("sha256"), str) and SHA.fullmatch(frame["sha256"]) and
                         frame.get("encoding") == "base64", "Invalid original file identity: " + path)
                    expected_chunks = ((frame["bytes"] + 2) // 3 * 4 + 8191) // 8192
                    need(frame["chunks"] == expected_chunks, "Original chunk count differs: " + path)
                    destination = output.joinpath(*PurePosixPath(path).parts)
                    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    handle = tempfile.NamedTemporaryFile(mode="wb", prefix=".receiving-", dir=destination.parent, delete=False)
                    os.chmod(handle.name, 0o600)
                    active = {"path": path, "identity": frame, "handle": handle,
                              "temporary": Path(handle.name), "destination": destination,
                              "hash": hashlib.sha256(), "bytes": 0, "next": 0}
                elif marker == "SCF_CUSTOMER_CHUNK ":
                    need(active is not None and active["path"] == path, "Chunk has no matching original header: " + path)
                    need(integer(frame.get("index")) and frame["index"] == active["next"] and
                         active["next"] < active["identity"]["chunks"], "Missing, duplicate or out-of-order chunk: " + path)
                    encoded = frame.get("data")
                    need(isinstance(encoded, str) and 0 < len(encoded) <= 8192 and len(encoded) % 4 == 0,
                         "Invalid original chunk encoding: " + path)
                    if active["next"] + 1 < active["identity"]["chunks"]:
                        need(len(encoded) == 8192 and "=" not in encoded, "Truncated intermediate chunk: " + path)
                    value = base64.b64decode(encoded, validate=True)
                    need(base64.b64encode(value).decode("ascii") == encoded, "Noncanonical original encoding: " + path)
                    active["handle"].write(value)
                    active["hash"].update(value)
                    active["bytes"] += len(value)
                    active["next"] += 1
                    need(active["bytes"] <= active["identity"]["bytes"], "Original file exceeds declared size: " + path)
                else:
                    need(active is not None and active["path"] == path, "End frame has no matching original header: " + path)
                    identity = active["identity"]
                    need(active["next"] == identity["chunks"] and active["bytes"] == identity["bytes"],
                         "Incomplete original file: " + path)
                    digest = active["hash"].hexdigest()
                    need(digest == identity["sha256"] == frame.get("sha256"), "Original file SHA256 differs: " + path)
                    active["handle"].flush()
                    os.fsync(active["handle"].fileno())
                    active["handle"].close()
                    os.link(active["temporary"], active["destination"])
                    active["temporary"].unlink()
                    descriptor = os.open(active["destination"].parent, os.O_RDONLY | os.O_DIRECTORY)
                    try:
                        os.fsync(descriptor)
                    finally:
                        os.close(descriptor)
                    retained[path] = {"path": path, "bytes": active["bytes"], "sha256": digest}
                    active = None
        need(active is None, "Job log ended before the complete original file was returned")
        need(retained, "No complete customer receiving files were present in the job log")
        result = {"schema": "stellar-forge.customer-log-recovery.v1",
                  "log": {"path": str(logs), "bytes": logs.stat().st_size, "sha256": log_hash.hexdigest()},
                  "directory": str(output.resolve()), "files": list(retained.values()),
                  "fileCount": len(retained), "totalBytes": sum(item["bytes"] for item in retained.values())}
        target = output / "LOG_RECOVERY.json"
        need("LOG_RECOVERY.json" not in retained, "Original output conflicts with recovery receipt")
        with target.open("x", encoding="utf-8") as handle:
            json.dump(result, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        target.chmod(0o600)
        descriptor = os.open(output, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        return result
    finally:
        if active is not None:
            active["handle"].close()
            # A partial transfer keeps its private temporary bytes for recovery.
            # It never acquires the original final filename.

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--logs", type=Path, required=True, help="Complete downloaded original job log")
    parser.add_argument("--out", type=Path, required=True, help="New private recovery directory")
    args = parser.parse_args()
    result = recover(args.logs, args.out.absolute())
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
