#!/usr/bin/env python3
"""Read one complete LZW16 source carrier into a private native receiving run."""
import argparse
import ast
import base64
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import tty

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--payload-length", type=int, required=True)
parser.add_argument("--payload-sha256", required=True)
parser.add_argument("--packet-sha256", required=True)
parser.add_argument("--node", required=True)
parser.add_argument("--node-modules", required=True)
parser.add_argument("--chromium", required=True)
parser.add_argument("--parent", type=Path, required=True)
args = parser.parse_args()
os.umask(0o077)
if not 1 <= args.payload_length <= 32 * 1024 * 1024:
    raise ValueError("Select the complete carrier's actual base64 length")
if not args.parent.is_absolute() or not args.parent.is_dir():
    raise ValueError("Use an actual existing absolute receiving parent")
if sys.stdin.isatty():
    tty.setraw(sys.stdin.fileno())
print("SCF_COMPLETE_SOURCE_READY", flush=True)
remaining = args.payload_length
chunks = []
while remaining:
    chunk = os.read(sys.stdin.fileno(), min(65536, remaining))
    if not chunk:
        raise ValueError("Complete source transfer ended before its original byte count")
    chunks.append(chunk)
    remaining -= len(chunk)
encoded = b"".join(chunks)
if hashlib.sha256(encoded).hexdigest() != args.payload_sha256:
    raise ValueError("Original encoded carrier differs")
raw = base64.b64decode(encoded, validate=True)
if len(raw) % 2:
    raise ValueError("Original LZW16 carrier has an incomplete code")
table = [bytes([number]) for number in range(256)] + [None]
previous = b""
parts = []
for (code,) in struct.iter_unpack(">H", raw):
    if code == 256:
        table = [bytes([number]) for number in range(256)] + [None]
        previous = b""
        continue
    if code < len(table):
        entry = table[code]
    elif code == len(table) and previous:
        entry = previous + previous[:1]
    else:
        raise ValueError("Invalid complete source code")
    parts.append(entry)
    if previous:
        table.append(previous + entry[:1])
    previous = entry
packet_bytes = b"".join(parts)
if hashlib.sha256(packet_bytes).hexdigest() != args.packet_sha256:
    raise ValueError("Original decoded complete source packet differs")
packet = json.loads(packet_bytes)
if packet.get("schema") != "stellar-forge.complete-current-receiving-source.v1":
    raise ValueError("Select the complete current SCF source")
stage = Path(tempfile.mkdtemp(prefix="scf-source-81cf-", dir=args.parent))
packet_path = stage / "complete-source-packet.json"
packet_path.write_bytes(packet_bytes)
rows = [row for row in packet["runtime"] if row["path"] == "receive_current.py"]
if len(rows) != 1:
    raise ValueError("Retain the original complete native producer")
body = rows[0]["content"].encode("utf-8")
if len(body) != rows[0]["bytes"] or hashlib.sha256(body).hexdigest() != rows[0]["sha256"]:
    raise ValueError("Original complete native producer differs")
ast.parse(body, filename="receive_current.py")
producer = stage / "receive_current.py"
producer.write_bytes(body)
print("SCF_COMPLETE_SOURCE_STAGED " + json.dumps({
    "sourceFiles": len(packet["files"]), "sourceCommit": packet["sourceCommit"],
    "packetBytes": len(packet_bytes), "packetSha256": args.packet_sha256,
    "stageDirectory": str(stage)}), flush=True)
command = [sys.executable, "-B", str(producer), "--packet", str(packet_path),
           "--expected-packet-sha256", args.packet_sha256,
           "--node", args.node, "--node-modules", args.node_modules,
           "--chromium", args.chromium, "--parent", str(args.parent)]
raise SystemExit(subprocess.run(command, cwd=stage).returncode)
