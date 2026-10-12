#!/usr/bin/env python3
"""MIT. Receive one complete geography source edition and run its original workflow."""
from __future__ import annotations
import argparse
import ast
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys

SCHEMA = "stellar-forge.iati-geography-complete-source.v1"
CARRIER = "stellar-forge.iati-geography-source-carrier.v1"

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def write_original(path, raw, executable=False):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_file() or path.read_bytes() != raw:
            raise ValueError("The selected source member differs: " + str(path))
        return
    with path.open("xb") as stream:
        os.fchmod(stream.fileno(), 0o700 if executable else 0o600)
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())

def receive(carrier_path, destination):
    body = carrier_path.read_bytes()
    if len(body) > 64 * 1024 * 1024:
        raise ValueError("The complete source carrier exceeds its declared file limit")
    carrier = json.loads(body)
    if carrier.get("schema") != CARRIER or carrier.get("encoding") != "gzip+base64":
        raise ValueError("Select the original complete geography source carrier")
    encoded = base64.b64decode(carrier["content"], validate=True)
    if len(encoded) != carrier["gzipBytes"] or digest(encoded) != carrier["gzipSha256"]:
        raise ValueError("The complete compressed source differs")
    raw = gzip.decompress(encoded)
    if len(raw) != carrier["jsonBytes"] or digest(raw) != carrier["sha256"]:
        raise ValueError("The complete source edition differs")
    selected = json.loads(raw)
    if selected.get("schema") != SCHEMA:
        raise ValueError("The complete geography source selection is unavailable")
    root = destination / carrier["sha256"]
    repo = root / "repo"
    repo.mkdir(mode=0o700, parents=True, exist_ok=True)
    names, total = set(), 0
    inventory = []
    for member in selected["files"]:
        name = member["path"]
        parsed = PurePosixPath(name)
        if (not name or parsed.is_absolute() or str(parsed) != name or "\\" in name or
                "\0" in name or any(part in {".", ".."} for part in parsed.parts) or name in names):
            raise ValueError("A complete source member has an invalid path")
        names.add(name)
        source = member["content"].encode("utf-8") if member["encoding"] == "utf-8" else base64.b64decode(member["content"], validate=True)
        if len(source) != member["bytes"] or digest(source) != member["sha256"]:
            raise ValueError("The complete original member differs: " + name)
        if member.get("gitBlob"):
            actual = hashlib.sha1(("blob " + str(len(source)) + "\0").encode() + source).hexdigest()
            if actual != member["gitBlob"]:
                raise ValueError("The full source body differs from its Git object: " + name)
        write_original(repo / name, source, member.get("mode") == "100755")
        if name.endswith(".py"):
            ast.parse(source, filename=str(repo / name))
        total += len(source)
        inventory.append({key: value for key, value in member.items() if key != "content"})
    manifest = {"schema": SCHEMA, "sha256": carrier["sha256"], "files": len(names),
                "bytes": total, "sourceRoot": str(repo), "base": selected["base"],
                "operation": selected["operation"], "source": selected["publisherSource"]}
    write_original(root / "source-selection.json", (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode())
    write_original(root / "source-files.json", (json.dumps(inventory, sort_keys=True, separators=(",", ":")) + "\n").encode())
    print(json.dumps({"status": "SOURCE_PREPARED", **manifest}), flush=True)
    return root, repo, selected

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--carrier", required=True)
    parser.add_argument("--destination", required=True, help="Existing private native work destination")
    parser.add_argument("--node", help="Original installed Node 22+ executable")
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    root, repo, selected = receive(Path(args.carrier).absolute(), Path(args.destination).absolute())
    if args.prepare_only:
        return
    native = repo / "stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/geography.py"
    argv = [sys.executable, "-B", str(native), "--output", str(root / "receiving")]
    if selected.get("browserDriver"):
        argv += ["--browser-driver", str(repo / selected["browserDriver"])]
    environment = dict(os.environ)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    if args.node:
        environment["SF30_XML_NODE"] = str(Path(args.node).absolute())
    os.execve(sys.executable, argv, environment)

if __name__ == "__main__":
    main()
