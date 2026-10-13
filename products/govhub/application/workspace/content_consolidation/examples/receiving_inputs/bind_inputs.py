#!/usr/bin/env python3
"""Bind an explicit receiving recipe to complete existing original input files."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from content_consolidation.examples.native_receiving import SCHEMA, read_json, packed


def source_file(root, relative):
    path = Path(relative)
    if path.is_absolute() or not path.parts or any(p in {".", ".."} for p in path.parts) or "\\" in relative:
        raise ValueError("Select ordinary relative paths inside the original source root.")
    current = root
    for component in path.parts:
        current = current / component
        if current.is_symlink():
            raise ValueError("Original source intake does not traverse symbolic links.")
    if not current.is_file():
        raise ValueError("The original source file is unavailable: " + relative)
    descriptor = os.open(current, os.O_RDONLY | os.O_NOFOLLOW)
    digest, size = hashlib.sha256(), 0
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("Select an ordinary original file.")
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
            size += len(block)
        after = os.fstat(stream.fileno())
    if any(getattr(before, field) != getattr(after, field)
           for field in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")):
        raise ValueError("The source changed while its identity was being retained.")
    return {"sha256": digest.hexdigest(), "bytes": size}


def bind(recipe, source_root):
    if recipe.get("schema") != SCHEMA:
        raise ValueError("Select the complete original receiving-case recipe.")
    root = Path(source_root)
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise ValueError("Select the existing absolute source root.")
    root = root.resolve()
    result = json.loads(packed(recipe))
    counts = {"stages": 0, "files": 0, "bytes": 0}
    for stage in result["stages"]:
        counts["stages"] += 1
        for item in stage.get("files", []):
            if item.get("file_id"):
                if not item.get("sha256") or not isinstance(item.get("bytes"), int):
                    raise ValueError("Existing retained file IDs must already have their original hash and size.")
            else:
                actual = source_file(root, item["path"])
                for field in ("sha256", "bytes"):
                    if item.get(field) is not None and item[field] != actual[field]:
                        raise ValueError("The declared original " + field + " differs for " + item["path"])
                    item[field] = actual[field]
            counts["files"] += 1
            counts["bytes"] += item["bytes"]
    return result, counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recipe", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        case, counts = bind(read_json(args.recipe), args.source_root)
        target = args.out
        if not target.is_absolute() or target.exists() or target.is_symlink() or not target.parent.is_dir():
            raise ValueError("Choose a new absolute case filename in an existing directory.")
        payload = (packed(case) + "\n").encode("utf-8")
        temp = target.with_name("." + target.name + "-" + uuid.uuid4().hex)
        try:
            fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "wb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            os.link(temp, target)
        finally:
            temp.unlink(missing_ok=True)
        fd = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        print(json.dumps({"id": case["id"], "schema": SCHEMA, "counts": counts,
                          "case_sha256": hashlib.sha256(packed(case).encode()).hexdigest()}))
        return 0
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
