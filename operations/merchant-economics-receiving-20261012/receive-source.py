#!/usr/bin/env python3
"""Receive the complete pinned SF97 MCP source without a job or dependency install.

The JSON parts preserve the original UTF-8 bytes. Existing matching source is
reused; a differing original is never overwritten. Python 3.10+, POSIX, stdlib.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import uuid

SOURCE_PIN = "c46001aff910fa0356bbccc7410c4626e1ea9544"
MANIFEST_SHA256 = "7786426b72019bf6747091155e5c597a595a61fa858449e5f6466071f4b9140b"
INITIAL_MANIFEST_SHA256 = "ed13140527daba2029b4b550f17319879a7acda115e12ad408453e44962ba626"
TRANSFER_SHA256 = "79a0c518673d181e2ca96758fe1a1031041ef760c4a140e0061a8f3bbe24e0b4"
FILE_COUNT = 1095
SOURCE_BYTES = 15535816
PART_LIMIT = 750000
FILE_LIMIT = 2 * 1024 * 1024
RECEIPT_SCHEMA = "commons.sf97.source-receiving.v1"


class ReceivingError(Exception):
    pass


def need(condition, message):
    if not condition:
        raise ReceivingError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def relative(value):
    need(isinstance(value, str) and value and "\\" not in value and "\0" not in value,
         "A source path must be a relative POSIX path")
    path = PurePosixPath(value)
    need(not path.is_absolute() and all(part not in ("", ".", "..") for part in value.split("/")),
         "A source path cannot traverse its selected directory")
    return value


def absolute(value, exists=True):
    path = Path(value)
    need(path.is_absolute() and path.resolve(strict=exists) == path,
         "Use an absolute path without redirected parents")
    return path


def regular(path, maximum, executable=None):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and 0 <= before.st_size <= maximum,
             "Expected a bounded regular file: " + str(path))
        if executable is not None:
            need(bool(before.st_mode & 0o111) == executable,
                 "Existing source executable class differs: " + str(path))
        with os.fdopen(fd, "rb", closefd=False) as handle:
            data = handle.read(maximum + 1)
        after = os.fstat(fd)
        identity = lambda st: (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns, st.st_mode)
        need(len(data) == before.st_size and identity(before) == identity(after),
             "Original file changed while being read: " + str(path))
        return data
    finally:
        os.close(fd)


def parent_path(root, name, create=False):
    parts = relative(name).split("/")
    current = root
    for part in parts[:-1]:
        current = current / part
        if create:
            current.mkdir(mode=0o700, exist_ok=True)
        try:
            state = current.lstat()
        except FileNotFoundError:
            need(not create, "Could not create selected source parent")
            return root / name
        need(stat.S_ISDIR(state.st_mode), "A source parent is redirected or is not a directory")
    return root / name


def fsync_parent(path):
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def same(path, data, executable=None):
    try:
        return regular(path, max(FILE_LIMIT, len(data)), executable) == data
    except FileNotFoundError:
        return False


def create_only(path, data, mode=0o600):
    if os.path.lexists(path):
        need(same(path, data, bool(mode & 0o111)), "Existing original differs: " + str(path))
        return False
    temporary = path.with_name(".source-receiving-" + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb", closefd=False) as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            need(same(path, data, bool(mode & 0o111)), "Concurrent original differs: " + str(path))
            return False
        fsync_parent(path)
        return True
    finally:
        os.close(fd)
        temporary.unlink(missing_ok=True)


def replace_owned(path, data, allowed_digests):
    if os.path.lexists(path):
        previous = regular(path, 1024 * 1024)
        if previous == data:
            return
        need(digest(previous) in allowed_digests, "The owned receiving record changed")
    temporary = path.with_name(".source-receiving-" + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        fsync_parent(path)
    finally:
        os.close(fd)
        temporary.unlink(missing_ok=True)


def original_rows(part, record, expected, seen):
    need(part.get("schema") == "commons.sf97.source-transfer-part.v1" and
         part.get("sourcePin") == SOURCE_PIN and part.get("part") == record["part"],
         "A source part has a different identity")
    rows = part.get("files")
    need(isinstance(rows, list) and len(rows) == record["fileCount"], "A source part is incomplete")
    total = 0
    for row in rows:
        need(isinstance(row, dict), "Invalid source part row")
        name = relative(row.get("path"))
        need(name in expected and name not in seen, "Duplicate or unexpected source path: " + name)
        target = expected[name]
        need(all(row.get(key) == target.get(key) for key in ("path", "gitBlob", "bytes", "mode")),
             "A source row differs from the complete original manifest: " + name)
        need(isinstance(row.get("content"), str), "Original source content is not UTF-8 text")
        data = row["content"].encode("utf-8")
        need(len(data) == target["bytes"] and len(data) <= FILE_LIMIT and
             git_blob(data) == target["gitBlob"] and digest(data) == row.get("sha256"),
             "Original source bytes differ: " + name)
        seen.add(name)
        total += len(data)
        yield target, data
    need(total == record["sourceBytes"], "A source part's original byte total differs")


def read_part(directory, record):
    path = parent_path(directory, record["path"])
    data = regular(path, PART_LIMIT)
    need(len(data) == record["bytes"] and digest(data) == record["sha256"],
         "Source part bytes changed: " + record["path"])
    return json.loads(data)


def receive(args):
    transfer_path = absolute(args.transfer)
    transfer_bytes = regular(transfer_path, 1024 * 1024)
    need(digest(transfer_bytes) == TRANSFER_SHA256, "Use the exact published source-transfer index")
    index = json.loads(transfer_bytes)
    manifest_path = parent_path(transfer_path.parent, index["manifest"]["path"])
    manifest_bytes = regular(manifest_path, 1024 * 1024)
    need(digest(manifest_bytes) == MANIFEST_SHA256 == index["manifest"]["sha256"],
         "Use the complete original 1,095-file source manifest")
    manifest = json.loads(manifest_bytes)
    need(index.get("schema") == "commons.sf97.source-transfer.v1" and
         index.get("sourcePin") == manifest.get("sourcePin") == SOURCE_PIN and
         index.get("repository") == manifest.get("repository") == "woahwhattheheck/public-commons-sprint-2026",
         "Source transfer and original source selection differ")
    expected = {}
    for row in manifest["files"]:
        name = relative(row["path"])
        need(name not in expected and row.get("mode") in ("100644", "100755") and
             re.fullmatch(r"[a-f0-9]{40}", row.get("gitBlob", "")) and
             type(row.get("bytes")) is int and 0 <= row["bytes"] <= FILE_LIMIT,
             "The complete original manifest has an invalid source row")
        expected[name] = row
    need(len(expected) == manifest.get("fileCount") == index.get("fileCount") == FILE_COUNT and
         sum(row["bytes"] for row in expected.values()) == manifest.get("bytes") == index.get("sourceBytes") == SOURCE_BYTES,
         "The complete original source totals differ")
    parts = index["parts"]
    need(isinstance(parts, list) and len(parts) == 24, "The source transfer requires all 24 original parts")
    names = set()
    for number, record in enumerate(parts, 1):
        name = relative(record["path"])
        need(record["part"] == number and name not in names and
             0 < record["bytes"] <= PART_LIMIT and re.fullmatch(r"[a-f0-9]{64}", record["sha256"]),
             "The source part index has changed")
        names.add(name)
    need(sum(row["fileCount"] for row in parts) == FILE_COUNT and
         sum(row["sourceBytes"] for row in parts) == SOURCE_BYTES, "The source part totals differ")

    # All carrier content is checked before creating or modifying the source root.
    seen = set()
    for record in parts:
        for _ in original_rows(read_part(transfer_path.parent, record), record, expected, seen):
            pass
    need(seen == set(expected), "The source transfer omitted original paths")

    root = absolute(args.directory, exists=False)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    need(root.resolve(strict=True) == root and stat.S_ISDIR(root.lstat().st_mode), "Invalid selected source directory")
    lock = os.open(root / ".source-receiving.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        saved_manifest = root / "SOURCE-MANIFEST.json"
        initial_bytes = regular(saved_manifest, 1024 * 1024) if os.path.lexists(saved_manifest) else None
        need(initial_bytes is None or digest(initial_bytes) in (MANIFEST_SHA256, INITIAL_MANIFEST_SHA256),
             "A different source manifest already occupies this directory")
        receipt_path = root / "SOURCE-RECEIVING.json"
        prior_bytes = regular(receipt_path, 1024 * 1024) if os.path.lexists(receipt_path) else None
        prior = json.loads(prior_bytes) if prior_bytes is not None else None
        if prior is not None:
            need(prior.get("schema") == RECEIPT_SCHEMA and prior.get("sourcePin") == SOURCE_PIN and
                 prior.get("manifestSha256") == MANIFEST_SHA256 and prior.get("transferSha256") == TRANSFER_SHA256,
                 "Resume this source directory using its original receiving selection")

        # Check every existing target before writing any missing source file.
        existing = 0
        for name, row in expected.items():
            target = parent_path(root, name)
            if not os.path.lexists(target):
                continue
            data = regular(target, FILE_LIMIT, row["mode"] == "100755")
            need(len(data) == row["bytes"] and git_blob(data) == row["gitBlob"],
                 "Retained source differs; its original was preserved: " + name)
            existing += 1
        dependency = None
        if args.dependencies:
            dependency = absolute(args.dependencies)
            need(dependency.is_dir(), "Use the already installed dependency directory")
            link = root / "node_modules"
            if os.path.lexists(link):
                need(link.is_symlink() and link.resolve(strict=True) == dependency,
                     "Preserve the current dependency path; it differs from this selection")

        bound = {"schema": RECEIPT_SCHEMA, "sourcePin": SOURCE_PIN, "manifestSha256": MANIFEST_SHA256,
                 "transferSha256": TRANSFER_SHA256, "directory": str(root), "fileCount": FILE_COUNT,
                 "bytes": SOURCE_BYTES, "dependencyInstallPerformed": False, "jobStarted": False}
        progress = {**bound, "status": "RECEIVING", "startedAt": prior.get("startedAt") if prior else
                    dt.datetime.now(dt.timezone.utc).isoformat(), "filesPresentAtStart": existing}
        allowed = set() if prior_bytes is None else {digest(prior_bytes)}
        replace_owned(receipt_path, canonical(progress), allowed)
        if initial_bytes is not None and digest(initial_bytes) == INITIAL_MANIFEST_SHA256:
            create_only(root / "SOURCE-MANIFEST.c460-initial.json", initial_bytes)
        written = 0
        seen = set()
        for record in parts:
            for row, data in original_rows(read_part(transfer_path.parent, record), record, expected, seen):
                destination = parent_path(root, row["path"], create=True)
                written += create_only(destination, data, 0o755 if row["mode"] == "100755" else 0o644)
        if dependency is not None and not os.path.lexists(root / "node_modules"):
            os.symlink(str(dependency), root / "node_modules", target_is_directory=True)
            fsync_parent(root / "node_modules")
        for name, row in expected.items():
            data = regular(parent_path(root, name), FILE_LIMIT, row["mode"] == "100755")
            need(len(data) == row["bytes"] and git_blob(data) == row["gitBlob"],
                 "Source changed before the complete source receipt: " + name)
        if initial_bytes is None:
            create_only(saved_manifest, manifest_bytes)
        else:
            replace_owned(saved_manifest, manifest_bytes, {INITIAL_MANIFEST_SHA256, MANIFEST_SHA256})
        complete = {**progress, "status": "SOURCE_READY", "completedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "filesWritten": written, "filesReused": FILE_COUNT - written,
                    "dependencyDirectory": str(dependency) if dependency else None}
        replace_owned(receipt_path, canonical(complete), {digest(canonical(progress))})
        print(json.dumps(complete, separators=(",", ":")))
        return complete
    finally:
        os.close(lock)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transfer", required=True, help="Absolute source-transfer.json beside all original parts")
    parser.add_argument("--directory", required=True, help="New or original selected source directory")
    parser.add_argument("--dependencies", help="Existing installed node_modules directory; no install is performed")
    args = parser.parse_args()
    try:
        receive(args)
        return 0
    except (ReceivingError, OSError, ValueError, KeyError, TypeError, UnicodeError) as error:
        print(json.dumps({"status": "ERROR", "code": type(error).__name__, "message": str(error)[:1400]}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
