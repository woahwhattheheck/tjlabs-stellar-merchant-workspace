#!/usr/bin/env python3
"""Restore a delivered native SCF backup into a new private workspace."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import sys


SCHEMA = "stellar-forge.scf-calendar-customer-manifest.v1"
BACKUP = "native/calendar-workspace.sqlite3"
BACKUPS = {SCHEMA: BACKUP,
           "stellar-forge.scf-planning-customer-manifest.v1": "native/planning-workspace.sqlite3"}


def file_sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_package(root: Path) -> tuple[Path, dict, int]:
    manifest = json.loads((root / "MANIFEST.json").read_text(encoding="utf-8"))
    backup_name = BACKUPS.get(manifest.get("schema"))
    if backup_name is None:
        raise ValueError("Choose the complete grant-calendar or planning customer handover.")
    rows = manifest.get("files")
    if not isinstance(rows, list) or not rows:
        raise ValueError("The customer manifest contains no files.")
    seen = set()
    backup_row = None
    for row in rows:
        relative = row.get("path")
        if not isinstance(relative, str):
            raise ValueError("The customer manifest contains an invalid path.")
        parts = PurePosixPath(relative)
        if parts.is_absolute() or ".." in parts.parts or relative in seen or "\\" in relative:
            raise ValueError("The customer manifest contains a duplicate or unsafe path.")
        seen.add(relative)
        path = root / parts
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root):
            raise ValueError("A delivered file is missing or replaced: " + relative)
        if path.stat().st_size != row.get("bytes") or file_sha(path) != row.get("sha256"):
            raise ValueError("A delivered file differs from its manifest: " + relative)
        if relative == backup_name:
            backup_row = row
    if backup_row is None:
        raise ValueError("The original native SQLite backup is missing from the manifest.")
    backup = root / backup_name
    with sqlite3.connect(backup.as_uri() + "?mode=ro&immutable=1", uri=True) as connection:
        check = connection.execute("PRAGMA integrity_check").fetchall()
    if check != [("ok",)]:
        raise ValueError("The original native SQLite backup failed its integrity check.")
    return backup, backup_row, len(rows)


def restore(root: Path, destination: Path) -> dict:
    backup, row, count = verify_package(root)
    destination.mkdir(mode=0o700)
    pending = destination / "planning.sqlite3.pending"
    final = destination / "planning.sqlite3"
    try:
        with pending.open("xb") as output, backup.open("rb") as original:
            os.fchmod(output.fileno(), 0o600)
            shutil.copyfileobj(original, output, 1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
        if file_sha(pending) != row["sha256"]:
            raise ValueError("The restored backup differs from its original bytes.")
        os.replace(pending, final)
        directory = os.open(destination, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except BaseException:
        pending.unlink(missing_ok=True)
        if not final.exists():
            try:
                destination.rmdir()
            except OSError:
                pass
        raise
    return {"stage": "RESTORED", "workspace": str(destination), "database": str(final),
            "sha256": row["sha256"], "verifiedFiles": count}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, default=Path(__file__).resolve().parent,
                        help="Extracted complete customer handover; defaults beside this helper")
    parser.add_argument("--destination", type=Path, required=True,
                        help="New private workspace directory; its parent must already exist")
    args = parser.parse_args(argv)
    try:
        root = args.package.expanduser().resolve(strict=True)
        destination = args.destination.expanduser().absolute()
        result = restore(root, destination)
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as exc:
        print(json.dumps({"stage": "ERROR", "message": str(exc)}), file=sys.stderr)
        return 1
    print(json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
