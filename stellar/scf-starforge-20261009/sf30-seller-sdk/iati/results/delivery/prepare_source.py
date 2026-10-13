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

SOURCE_COMMIT = None
SOURCE_SELECTION_SHA256 = "3bbeeb3cef95dd159343ec298b5595ffa4e970dd1606469ed03f5152f475d873"
PACKET_COMMIT = "9bfca6df8ebbd8e6c4583557df1978accd015a23"
RELATIVE = "stellar/scf-starforge-20261009/sf30-seller-sdk/iati"
PACKET_URL = ("https://raw.githubusercontent.com/woahwhattheheck/"
              "tjlabs-stellar-merchant-workspace/" + PACKET_COMMIT + "/" +
              "artifacts/iati-cumulative-financial-20261012/complete-source.json.gz")
PACKET_BYTES = 1539216
PACKET_SHA256 = "2ee3332f9e254d40076fad1a0f5bd8dc8c5c3f3286383d64296c830183f1b952"
DECODED_BYTES = 4952476
DECODED_SHA256 = "600a4ad86a698d68e0ee3f582dfef1fd0ae008e12a37f2f91d393c4c698ed3be"
SCHEMA = "stellar-forge.iati-results-complete-source.v2"
FILE_COUNT = 201
SOURCE_BYTES = 3846277
BINARY_COUNT = 2
BINARY_BYTES = 664228

# The complete packet remains the original source authority. These three exact
# repository files are the subsequent receiving corrections, pinned separately.
RECEIVING_SOURCE_COMMIT = "32c27f5fa8ac6df7240dfac21505ff8cf6daa1f6"
RECEIVING_SOURCE_BASE_URL = (
    "https://raw.githubusercontent.com/woahwhattheheck/"
    "tjlabs-stellar-merchant-workspace/" + RECEIVING_SOURCE_COMMIT + "/")
RECEIVING_SOURCES = [
    {
        "path": "stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/receiving.py",
        "baseBytes": 23807,
        "baseSha256": "cbac8499564aa82d85fbc2f8c9f881014a22a61be4944748245aae0f1fedd791",
        "bytes": 24069,
        "sha256": "df718f79bf34b3c1ca50abb0beb2d422ef46c31f1ffc5054666de79fec836530",
        "gitBlob": "c4d6d3e7bb94d3009aef8f39e0fc4320d5912a9a"
    },
    {
        "path": "stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/receiving_console.py",
        "baseBytes": 7186,
        "baseSha256": "c3792086e398c83938400f079974018ba3b83ee0a152a71dcaf50e1ca2c194b5",
        "bytes": 7776,
        "sha256": "e9abe778e2b4087423393f293bb7e36e6541c297bb01448447b3c988379f642c",
        "gitBlob": "990d20c818f8c2a4c9313bbb9748b05fa1f55800"
    },
    {
        "path": "stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/browser_receiving.mjs",
        "baseBytes": 15621,
        "baseSha256": "313551b0751329ba25796412d250c416248a9997890b48e322a4848be46cd6e1",
        "bytes": 18314,
        "sha256": "a49589190608b927323780bc46a7dbb54e727e090b5be76816796238ef0aeaf1",
        "gitBlob": "08169d45df9b4c34587e14e093cc9bfdd1a0a280"
    }
]

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
            envelope.get("sourceCommit") == SOURCE_COMMIT and
            envelope.get("sourceSelectionSha256") == SOURCE_SELECTION_SHA256,
            "The source envelope names another application")
    records = envelope.get("files")
    require(isinstance(records, list) and len(records) == FILE_COUNT + BINARY_COUNT,
            "The complete application and original binary source closure is required")
    files = {}
    source_total = binary_total = source_count = binary_count = 0
    for record in records:
        require(isinstance(record, dict) and
                (set(record) == {"path", "content", "bytes", "sha256"} or
                 set(record) == {"path", "content", "encoding", "bytes", "sha256"}
                 and record.get("encoding") == "base64"),
                "Invalid complete source record")
        name = record["path"]
        require(isinstance(name, str) and name and "\\" not in name and
                not any(ord(c) < 32 for c in name), "Unsafe source member name")
        p = PurePosixPath(name)
        require(not p.is_absolute() and p.as_posix() == name and
                all(part not in ("", ".", "..") for part in p.parts) and
                name not in files, "Duplicate or escaping source member")
        require(isinstance(record["content"], str),
                "Source must retain its complete encoded bytes")
        if record.get("encoding") == "base64":
            try:
                data = base64.b64decode(record["content"], validate=True)
            except (ValueError, binascii.Error) as exc:
                raise ValueError("Binary source encoding is invalid") from exc
            require(base64.b64encode(data).decode("ascii") == record["content"],
                    "Binary source must retain canonical complete base64")
            binary_count += 1
            binary_total += len(data)
        else:
            data = record["content"].encode("utf-8")
            source_count += 1
            source_total += len(data)
        require(type(record["bytes"]) is int and len(data) == record["bytes"] and
                digest(data) == record["sha256"], "Source member identity mismatch")
        files[name] = data
    require(source_count == FILE_COUNT and source_total == SOURCE_BYTES,
            "The complete text source inventory differs")
    require(binary_count == BINARY_COUNT and binary_total == BINARY_BYTES,
            "The complete original binary source inventory differs")
    return compressed, decoded, files


def receiving_sources(files, source_root=None):
    """Read the selected original repository files before writing any source.

    An explicit local root or a checkout containing this preparer is authoritative:
    a different local file is rejected, rather than silently replaced by a download.
    A standalone preparer reads only the exact pinned public commit.
    """
    if source_root is None:
        relative = Path(RELATIVE) / "results" / "delivery" / "prepare_source.py"
        here = Path(__file__).absolute()
        if here.parts[-len(relative.parts):] == relative.parts:
            source_root = here.parents[len(relative.parts) - 1]
    if source_root is not None:
        source_root = Path(source_root)
        require(source_root.is_absolute() and source_root.resolve(strict=True) == source_root,
                "Select an absolute receiving-source root without aliases")
        require(source_root.is_dir() and not source_root.is_symlink(),
                "Receiving-source root must be a regular directory")
    result = dict(files)
    for record in RECEIVING_SOURCES:
        name = record["path"]
        base = files.get(name)
        require(base is not None and len(base) == record["baseBytes"] and
                digest(base) == record["baseSha256"],
                "The original packet receiving source differs: " + name)
        if source_root is not None:
            path = source_root / name
            require(path.resolve(strict=True) == path,
                    "Selected receiving source must not traverse aliases: " + name)
            data = regular_bytes(path, record["bytes"])
        else:
            request = urllib.request.Request(RECEIVING_SOURCE_BASE_URL + name, headers={
                "User-Agent": "IATI-results-source-receiving/1.0",
                "Accept": "application/octet-stream"})
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read(record["bytes"] + 1)
        require(len(data) == record["bytes"] and digest(data) == record["sha256"],
                "Selected receiving source differs from its pinned SHA256/size: " + name)
        require(hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
                == record["gitBlob"], "Selected receiving source Git identity differs: " + name)
        result[name] = data
    return result

def installed_selection(files):
    """Identity of every installed member, independent of the local destination."""
    inventory = [{"path": name, "bytes": len(files[name]), "sha256": digest(files[name])}
                 for name in sorted(files)]
    encoded = (json.dumps(inventory, sort_keys=True, ensure_ascii=False,
                          separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
    return digest(encoded)

def prepare(root, *, packet_file=None, node=None, receiving_source_root=None):
    root = private_directory(Path(root))
    compressed, decoded, original_files = read_packet(packet_file)
    files = receiving_sources(original_files, receiving_source_root)
    installed_bytes = sum(map(len, files.values()))
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
        "sourceSelectionSha256": SOURCE_SELECTION_SHA256,
        "installedSourceSelectionSha256": installed_selection(files),
        "receivingSourceCommit": RECEIVING_SOURCE_COMMIT,
        "receivingSources": RECEIVING_SOURCES,
        "packetSha256": PACKET_SHA256, "source": str(source),
        "files": len(files), "sourceFiles": FILE_COUNT,
        "baseSourceBytes": SOURCE_BYTES, "sourceBytes": installed_bytes - BINARY_BYTES,
        "binaryFiles": BINARY_COUNT, "binaryBytes": BINARY_BYTES, "bytes": installed_bytes,
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
    parser.add_argument("--receiving-source-root", help="Absolute local repository root containing the three exact pinned receiving files; a standalone preparer otherwise reads their pinned public commit")
    parser.add_argument("--receiving-config", help="Run the original programme with this exact private selection")
    parser.add_argument("--playwright", help="Existing Playwright module directory for the same-case console continuation")
    parser.add_argument("--chromium", help="Existing Chromium executable for the same-case console continuation")
    parser.add_argument("--reviewer", help="Named reviewer of the exact selected source")
    parser.add_argument("--review-note", help="Explicit basis of the same-case browser review")
    args = parser.parse_args(argv)
    receipt = prepare(args.root, packet_file=args.packet_file, node=args.node,
                      receiving_source_root=args.receiving_source_root)
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
