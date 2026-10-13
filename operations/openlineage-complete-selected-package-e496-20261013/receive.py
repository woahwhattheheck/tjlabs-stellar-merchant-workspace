#!/usr/bin/env python3
"""Receive the complete pinned OpenLineage package through its original verifier."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys

SOURCE_COMMIT = "09a13eab2f6cd302ca4d6b1ad2222dc09154aa8d"
ARCHIVE_NAME = "tokenjunkielabs-starforge-merchant-0.1.0-source.g09a13eab2f6c.selection.openlineage-operations.tgz"
ARCHIVE_SHA256 = "a739bbcb03447cdd8eade1d97d033944313c4f09a1266938cfdf40c624df947b"
ARCHIVE_BYTES = 3234205
MANIFEST_SHA256 = "7cda4b8e47a5f850e2ef923186a89b4ccd4fc0a29cfb52f318f93b3da00e723f"
VERIFIER_SHA256 = "683c241e74d2ef4c6bbf1502a8aa58af40195bb53e70fb0b7731191c53795d5f"
OPERATION = "OPENLINEAGE-PACKAGE-EFFICIENCY-E496-20261012"

def regular(path, maximum):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.is_symlink() or info.st_size > maximum:
        raise ValueError("Expected a bounded ordinary file: " + str(path))
    return info

def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()

def run(command):
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode:
        sys.stderr.write(completed.stderr)
        sys.stderr.write(completed.stdout)
        raise RuntimeError("Original receiving command failed with exit " + str(completed.returncode))
    value = json.loads(completed.stdout)
    return value

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=Path(__file__).resolve().parent / ARCHIVE_NAME)
    parser.add_argument("--out", type=Path, required=True, help="New or already received package directory")
    parser.add_argument("--resume", action="store_true", help="Verify the full original existing directory")
    parser.add_argument("--prepare-runtime", type=Path, help="Prepare the maintained original installation profile")
    parser.add_argument("--node", help="Existing Node 22.16+ executable; otherwise the existing PATH is used")
    args = parser.parse_args()
    archive = args.archive.absolute()
    verifier = Path(__file__).resolve().parent / "runtime-unpack.py"
    target = args.out.absolute()
    if regular(archive, 64 * 1024 * 1024).st_size != ARCHIVE_BYTES or digest(archive) != ARCHIVE_SHA256:
        raise ValueError("The prepared package differs from the published complete archive")
    regular(verifier, 64 * 1024)
    if digest(verifier) != VERIFIER_SHA256:
        raise ValueError("The original runtime receiver has changed")
    if target.exists() and not args.resume:
        raise ValueError("The original directory exists; use --resume to verify its complete contents")
    if args.resume and not target.exists():
        raise ValueError("The original received directory is absent; receive into a new directory")
    command = [sys.executable, str(verifier), "--archive", str(archive), "--sha256", ARCHIVE_SHA256, "--out", str(target)]
    if args.resume:
        command.append("--verify")
    received = run(command)
    if (received.get("sourceCommit") != SOURCE_COMMIT or received.get("sourceFiles") != 889 or
        received.get("manifestSha256") != MANIFEST_SHA256):
        raise ValueError("Original receiver returned a different complete source")
    result = {
        "schema": "commons.openlineage.prepared-package-receiving.v1",
        "operationId": OPERATION,
        "sourceCommit": SOURCE_COMMIT,
        "archive": str(archive), "sha256": ARCHIVE_SHA256, "bytes": ARCHIVE_BYTES,
        "manifestSha256": MANIFEST_SHA256, "sourceFiles": 889,
        "packageDirectory": str(target), "sourceRoot": str(target / "source"),
        "receiving": received
    }
    if args.prepare_runtime:
        node = args.node or shutil.which("node")
        if not node:
            raise ValueError("Select the existing Node 22.16+ executable with --node")
        cli = target / "source/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs"
        result["runtimePreparation"] = run([
            node, str(cli), "prepare", "--dir", str(args.prepare_runtime.absolute()),
            "--archive", str(archive), "--sha256", ARCHIVE_SHA256,
            "--native", "--feature", "schema", "--feature", "openapi", "--feature", "mcp", "--operator"
        ])
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(json.dumps({"operationId": OPERATION, "error": str(error)}), file=sys.stderr)
        raise SystemExit(1)
