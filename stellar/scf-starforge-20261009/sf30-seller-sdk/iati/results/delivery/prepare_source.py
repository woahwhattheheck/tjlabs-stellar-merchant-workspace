#!/usr/bin/env python3
"""Materialize the exact IATI application and continue its original receiving.

This is a source installer and foreground command, not a job scheduler. It never
changes the XML selected by an operator or creates another receiving case.
"""
from __future__ import annotations
import argparse
import ast
import base64
import binascii
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.request

SOURCE_COMMIT = "7f010cbc26344f840c8b864ea59edbabec5d02d5"
PACKET_COMMIT = "c4cbb88ac0e0bbca596bad7bec0430ff19cc5722"
RELATIVE = "stellar/scf-starforge-20261009/sf30-seller-sdk/iati"
PACKET_URL = ("https://raw.githubusercontent.com/woahwhattheheck/"
              "tjlabs-stellar-merchant-workspace/" + PACKET_COMMIT + "/" +
              RELATIVE + "/results/delivery/complete-source-7f010cbc.json.gz")
PACKET_BYTES = 607463
PACKET_SHA256 = "9958ed8f0883c38a7c9f2e3f6e4a4576d7b3bbffecf8015d0eddae52c1663f41"
DECODED_BYTES = 2855136
DECODED_SHA256 = "61daa005c5f6ef900e0dcbbb1bcc7affa5c2f896a6887b4fd77ea5d594ba6be3"
SCHEMA = "stellar-forge.iati-results-complete-source.v1"
FILE_COUNT = 142
SOURCE_BYTES = 2703727
BINARY_COUNT = 1
BINARY_BYTES = 17001

def digest(data):
    return hashlib.sha256(data).hexdigest()

def require(condition, message):
    if not condition:
        raise ValueError(message)

def private_directory(path):
    path = Path(path)
    require(path.is_absolute(), "Use an absolute owned destination")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(path.resolve() == path, "The destination must not traverse aliases")
    st = path.lstat()
    require(stat.S_ISDIR(st.st_mode) and not path.is_symlink(),
            "The destination is not a regular directory")
    require(st.st_uid == os.getuid() and not st.st_mode & 0o077,
            "Use an owned private directory (0700)")
    return path

def regular_bytes(path, maximum):
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        first = os.fstat(fd)
        require(stat.S_ISREG(first.st_mode) and first.st_size <= maximum,
                "Input must be a bounded regular file")
        data = bytearray()
        while True:
            block = os.read(fd, min(1024 * 1024, maximum + 1 - len(data)))
            if not block:
                break
            data.extend(block)
            require(len(data) <= maximum, "Input exceeds its pinned byte limit")
        last = os.fstat(fd)
        require((first.st_dev, first.st_ino, first.st_size, first.st_mtime_ns,
                 first.st_ctime_ns) ==
                (last.st_dev, last.st_ino, last.st_size, last.st_mtime_ns,
                 last.st_ctime_ns), "Input changed while being read")
        return bytes(data)
    finally:
        os.close(fd)

def retain(path, data):
    """Create once; recover only an identical existing complete object."""
    path = Path(path)
    private_directory(path.parent)
    if path.exists() or path.is_symlink():
        require(regular_bytes(path, len(data)) == data,
                "An existing destination contains different bytes: " + str(path))
        require(path.lstat().st_uid == os.getuid() and
                not path.lstat().st_mode & 0o077,
                "Existing source is not owned private custody")
        return
    fd, name = tempfile.mkstemp(prefix=".source-", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as out:
            os.fchmod(out.fileno(), 0o600)
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            require(regular_bytes(path, len(data)) == data,
                    "Another writer selected different source bytes")
    finally:
        temporary.unlink(missing_ok=True)

def read_packet(packet_file=None):
    if packet_file:
        compressed = regular_bytes(Path(packet_file), PACKET_BYTES)
    else:
        request = urllib.request.Request(PACKET_URL, headers={
            "User-Agent": "IATI-results-source-receiving/1.0",
            "Accept": "application/octet-stream"})
        with urllib.request.urlopen(request, timeout=45) as response:
            compressed = response.read(PACKET_BYTES + 1)
    require(len(compressed) == PACKET_BYTES and digest(compressed) == PACKET_SHA256,
            "Complete source packet does not match its pinned SHA256/size")
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as packed:
        decoded = packed.read(DECODED_BYTES + 1)
    require(len(decoded) == DECODED_BYTES and digest(decoded) == DECODED_SHA256,
            "Decoded source envelope does not match its pinned identity")
    envelope = json.loads(decoded)
    require(envelope.get("schema") == SCHEMA and
            envelope.get("sourceCommit") == SOURCE_COMMIT,
            "The source envelope names another application")
    records = envelope.get("files")
    require(isinstance(records, list) and len(records) == FILE_COUNT,
            "The complete application file closure is required")
    files = {}
    for record in records:
        require(isinstance(record, dict) and set(record) ==
                {"path", "content", "bytes", "sha256"}, "Invalid source record")
        name = record["path"]
        require(isinstance(name, str) and name and "\\" not in name and
                not any(ord(c) < 32 for c in name), "Unsafe source member name")
        p = PurePosixPath(name)
        require(not p.is_absolute() and p.as_posix() == name and
                all(part not in ("", ".", "..") for part in p.parts) and
                name not in files, "Duplicate or escaping source member")
        require(isinstance(record["content"], str), "Source must retain text bytes")
        data = record["content"].encode("utf-8")
        require(type(record["bytes"]) is int and len(data) == record["bytes"] and
                digest(data) == record["sha256"], "Source member identity mismatch")
        files[name] = data
    require(sum(map(len, files.values())) == SOURCE_BYTES,
            "The complete source byte inventory differs")
    binary = envelope.get("binaryFiles")
    require(isinstance(binary, list) and len(binary) == BINARY_COUNT,
            "The exact original binary source package is required")
    binary_total = 0
    for record in binary:
        require(isinstance(record, dict) and set(record) ==
                {"path", "base64", "bytes", "sha256"}, "Invalid binary source record")
        name = record["path"]
        require(isinstance(name, str) and name and "\\" not in name and
                not any(ord(c) < 32 for c in name), "Unsafe binary source member name")
        p = PurePosixPath(name)
        require(not p.is_absolute() and p.as_posix() == name and
                all(part not in ("", ".", "..") for part in p.parts) and
                name not in files, "Duplicate or escaping binary source member")
        require(isinstance(record["base64"], str), "Binary source must retain exact base64")
        try:
            data = base64.b64decode(record["base64"], validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError("Binary source encoding is invalid") from exc
        require(type(record["bytes"]) is int and len(data) == record["bytes"] and
                digest(data) == record["sha256"], "Binary source identity mismatch")
        files[name] = data
        binary_total += len(data)
    require(binary_total == BINARY_BYTES, "Original binary source byte inventory differs")
    return compressed, decoded, files

def prepare(root, *, packet_file=None, node=None):
    root = private_directory(Path(root))
    compressed, decoded, files = read_packet(packet_file)
    source = private_directory(root / "source")
    retain(root / "complete-source.json.gz", compressed)
    retain(root / "complete-source.json", decoded)
    for name, data in files.items():
        retain(source / name, data)
    python_files = []
    javascript_files = []
    for name in sorted(files):
        path = source / name
        if path.suffix == ".py":
            ast.parse(files[name].decode("utf-8"), filename=name)
            python_files.append(name)
        elif path.suffix in (".js", ".mjs"):
            javascript_files.append(name)
    selected_node = node or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    require(selected_node is not None, "Select the existing Node executable")
    selected_node = str(Path(selected_node).resolve(strict=True))
    require(os.access(selected_node, os.X_OK), "Selected Node is not executable")
    for name in javascript_files:
        subprocess.run([selected_node, "--check", str(source / name)], check=True,
                       stdin=subprocess.DEVNULL)
    result = {
        "schema": "stellar-forge.iati-results-source-preparation.v1",
        "sourceCommit": SOURCE_COMMIT, "packetCommit": PACKET_COMMIT,
        "packetSha256": PACKET_SHA256, "source": str(source),
        "files": len(files), "sourceFiles": FILE_COUNT,
        "sourceBytes": SOURCE_BYTES, "binaryFiles": BINARY_COUNT,
        "binaryBytes": BINARY_BYTES, "bytes": SOURCE_BYTES + BINARY_BYTES,
        "pythonParsed": python_files, "javascriptParsed": javascript_files,
        "node": selected_node,
        "receivingExecuted": False,
    }
    # Source preparation is immutable. Native outcome is retained separately by
    # the original programme, not inferred from syntax or this source receipt.
    retain(root / "source-preparation.json",
           (json.dumps(result, sort_keys=True, ensure_ascii=False, indent=2) + "\n").encode())
    return result

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Absolute owned private source/receiving destination")
    parser.add_argument("--packet-file", help="Exact locally retained complete source gzip, if already available")
    parser.add_argument("--node", help="Existing Node executable; no installation is performed")
    parser.add_argument("--receiving-config", help="Run the original programme with this exact private selection")
    parser.add_argument("--playwright", help="Existing Playwright module directory for the same-case console continuation")
    parser.add_argument("--chromium", help="Existing Chromium executable for the same-case console continuation")
    parser.add_argument("--reviewer", help="Named reviewer of the exact selected source")
    parser.add_argument("--review-note", help="Explicit basis of the same-case browser review")
    args = parser.parse_args(argv)
    receipt = prepare(args.root, packet_file=args.packet_file, node=args.node)
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True), flush=True)
    if args.receiving_config:
        configuration = Path(args.receiving_config)
        require(configuration.is_absolute(), "Select an absolute private receiving configuration")
        selected = json.loads(regular_bytes(configuration, 1024 * 1024))
        receiving_root = Path(selected["root"])
        require(receiving_root.is_absolute(), "Use the original absolute receiving root")
        app = Path(receipt["source"]) / RELATIVE
        subprocess.run([sys.executable, "-B", str(app / "results/receiving.py"),
                        "--config", str(configuration)], check=True, stdin=subprocess.DEVNULL)
        options = (args.playwright, args.chromium, args.reviewer, args.review_note)
        if any(options):
            require(all(options), "The console continuation needs all four explicit browser/review selections")
            subprocess.run([
                sys.executable, "-B", str(app / "results/receiving_console.py"),
                "--root", str(receiving_root), "--node", receipt["node"],
                "--playwright", args.playwright, "--chromium", args.chromium,
                "--merchant-root", str(Path(receipt["source"]) /
                                       "stellar-forge/mcp-merchant-operator"),
                "--reviewer", args.reviewer, "--review-note", args.review_note],
                check=True, stdin=subprocess.DEVNULL)
    elif any((args.playwright, args.chromium, args.reviewer, args.review_note)):
        raise ValueError("A browser continuation must follow the selected original receiving programme")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)},
                         ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)
