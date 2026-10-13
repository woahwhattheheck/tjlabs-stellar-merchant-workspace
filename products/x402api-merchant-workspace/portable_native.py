#!/usr/bin/env python3
"""Snapshot, inspect and receive a complete original merchant project.

The maintained source_bundle_archive module owns ZIP serialization, validation
and extraction. The maintained runtime-unpack module validates source.tgz.
This module selects original files, uses SQLite online backup, and relocates
only the two current result-storage JSON paths in an independent runtime copy.
The complete result tree and native SF31 reservation states are received before
that runtime is published, preserving later native progress on receiving replay.
"""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
from copy import deepcopy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import stat
import subprocess
import sys
import time
from urllib.parse import quote
import uuid

REQUEST_SCHEMA = "stellar-forge.merchant-portable-request.v1"
MANIFEST_SCHEMA = "stellar-forge.merchant-portable-project.v1"
RESULT_SCHEMA = "stellar-forge.merchant-portable-result.v1"
STORE_APPLICATION = 0x58344D31
STORE_VERSION = 1
CHUNK = 1024 * 1024
MAX_JSON = 4 * CHUNK
MAX_FILE = 8 * 1024 * CHUNK
MAX_PROJECT = 32 * 1024 * CHUNK
PRODUCT = "products/x402api-merchant-workspace/"
HERE = Path(__file__).resolve().parent
SOURCE_ROOT = HERE.parents[1]
ARCHIVE_PATH = SOURCE_ROOT / "stellar/scf-starforge-20261009/sf30-seller-sdk/source_bundle_archive.py"
UNPACK_PATH = SOURCE_ROOT / "stellar/scf-starforge-20261009/distribution/runtime-unpack.py"
ARCHIVE_SHA = "934f29399f12349e2836e1c4fd890b67eb023e3735fc5707a50c98ce5cb3b7a8"
UNPACK_SHA = "683c241e74d2ef4c6bbf1502a8aa58af40195bb53e70fb0b7731191c53795d5f"
REQUIRED_PRODUCT = (
    "portable_native.py", "portable.mjs", "portable-directory.mjs",
    "portable-reservations.mjs", "server.mjs", "workspace.mjs",
    "store.mjs", "protocol.mjs", "provider.mjs", "application-inputs.mjs",
    "fulfillment/file-delivery.mjs", "web/index.html", "web/app.mjs", "web/style.css",
)
EXPECTED_TABLES = {
    "merchant_meta", "merchant_runtimes", "merchant_orders", "merchant_history",
    "merchant_exchanges", "merchant_events", "merchant_fulfillments",
}
os.umask(0o077)
sys.dont_write_bytecode = True
archive_engine = None
source_unpacker = None
policy = None


class PortableError(Exception):
    def __init__(self, code, message, details=None):
        super().__init__(message)
        self.code, self.details = code, details


def need(value, code, message, details=None):
    if not value:
        raise PortableError(code, message, details)


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()


def parse_json(raw, label):
    def pairs(items):
        value = {}
        for key, item in items:
            need(key not in value, "JSON_DUPLICATE_KEY", "Keep the original unambiguous " + label + ".")
            value[key] = item
        return value
    try:
        return json.loads(raw, object_pairs_hook=pairs,
                          parse_constant=lambda value: (_ for _ in ()).throw(
                              PortableError("JSON_NUMBER_INVALID", "Use finite JSON in " + label + ".")))
    except (UnicodeError, ValueError) as error:
        raise PortableError("JSON_INVALID", "Read the complete original " + label + ".") from error


def absolute(value):
    need(isinstance(value, str) and value and "\0" not in value,
         "PATH_INVALID", "Select an original absolute path.")
    path = Path(value)
    need(path.is_absolute() and str(path) == value and ".." not in path.parts,
         "PATH_INVALID", "Select a normalized original absolute path.")
    return path


def relative(value):
    need(isinstance(value, str) and value and not value.startswith("/") and
         "\\" not in value and "\0" not in value and
         all(part not in ("", ".", "..") for part in value.split("/")) and
         str(PurePosixPath(value)) == value,
         "PATH_INVALID", "Select an exact relative project member.")
    return value


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private_directory(path):
    path = absolute(str(path))
    if path.exists():
        info = path.lstat()
        need(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode)
             and path.resolve() == path and not info.st_mode & 0o077
             and info.st_uid == os.getuid(),
             "PRIVATE_DIRECTORY_REQUIRED", "Use the original private project directory: " + str(path))
        sync_directory(path)
        sync_directory(path.parent)
        return path
    parent = path.parent
    need(parent != path, "DIRECTORY_REQUIRED", "Use an existing filesystem root.")
    if not parent.exists():
        private_directory(parent)
    need(parent.resolve() == parent and stat.S_ISDIR(parent.lstat().st_mode),
         "PATH_INVALID", "Keep the original real project parent.")
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        return private_directory(path)
    sync_directory(path)
    sync_directory(parent)
    return path


def stamp(info):
    return tuple(getattr(info, name) for name in
                 ("st_dev", "st_ino", "st_size", "st_mode", "st_uid", "st_gid", "st_mtime_ns", "st_ctime_ns"))


@contextmanager
def opened_regular(path, *, private=False, maximum=MAX_FILE):
    path = absolute(str(path))
    parent_fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    fd = None
    try:
        for part in path.parts[1:-1]:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
            os.close(parent_fd)
            parent_fd = following
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        before = os.fstat(fd)
        named = os.stat(path.name, dir_fd=parent_fd, follow_symlinks=False)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= maximum
             and (before.st_dev, before.st_ino) == (named.st_dev, named.st_ino),
             "REGULAR_FILE_REQUIRED", "Read the selected original regular file: " + str(path))
        if private:
            need(before.st_nlink == 1 and not before.st_mode & 0o077 and before.st_uid == os.getuid(),
                 "PRIVATE_FILE_REQUIRED", "Read the original private merchant file: " + str(path))
        yield fd, before
        after = os.fstat(fd)
        named = path.lstat()
        need(stamp(before) == stamp(after) and (named.st_dev, named.st_ino) == (before.st_dev, before.st_ino)
             and stat.S_ISREG(named.st_mode) and path.resolve() == path,
             "ORIGINAL_FILE_CHANGED", "The original selected file changed during its read: " + str(path))
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent_fd)


def read_bytes(path, *, maximum=MAX_JSON, private=False):
    with opened_regular(path, private=private, maximum=maximum) as (fd, info):
        with os.fdopen(fd, "rb", closefd=False) as stream:
            raw = stream.read(maximum + 1)
        need(len(raw) == info.st_size and len(raw) <= maximum,
             "ORIGINAL_FILE_CHANGED", "Read the complete original file.")
        return raw


def read_json(path, *, optional=False, maximum=32 * CHUNK):
    try:
        return parse_json(read_bytes(path, maximum=maximum), str(path))
    except FileNotFoundError:
        if optional:
            return None
        raise


def file_hash(path, *, maximum=MAX_FILE):
    with opened_regular(path, maximum=maximum) as (fd, info):
        h = hashlib.sha256()
        size = 0
        with os.fdopen(fd, "rb", closefd=False) as stream:
            for block in iter(lambda: stream.read(CHUNK), b""):
                size += len(block)
                h.update(block)
        need(size == info.st_size, "ORIGINAL_FILE_CHANGED", "Hash the complete original file.")
        return {"bytes": str(size), "sha256": h.hexdigest()}


def pin(value, *, maximum=MAX_FILE):
    need(isinstance(value, dict) and isinstance(value.get("bytes"), str)
         and re.fullmatch(r"0|[1-9][0-9]{0,15}", value["bytes"])
         and int(value["bytes"]) <= maximum
         and isinstance(value.get("sha256"), str) and re.fullmatch(r"[0-9a-f]{64}", value["sha256"]),
         "FILE_IDENTITY_INVALID", "Use an exact file size string and SHA-256.")
    return {"bytes": value["bytes"], "sha256": value["sha256"]}


def archive_pin(value):
    return pin(value, maximum=MAX_PROJECT + 16 * CHUNK)


def durable_file(path, expected=None, *, maximum=MAX_FILE):
    if expected is not None:
        need(file_hash(path, maximum=maximum) == pin(expected, maximum=maximum),
             "FILE_IDENTITY_CHANGED", "Keep the exact retained file: " + str(path))
    with opened_regular(path, maximum=maximum) as (fd, _info):
        os.fsync(fd)
    sync_directory(path.parent)


def write_bytes(path, body, *, replace=False, mode=0o600):
    private_directory(path.parent)
    if not replace and path.exists():
        need(read_bytes(path, maximum=max(len(body), 1)) == body,
             "RETAINED_FILE_CONFLICT", "Keep the original retained file: " + str(path))
        with opened_regular(path, maximum=max(len(body), 1)) as (fd, _info):
            os.fsync(fd)
        sync_directory(path.parent)
        return
    temporary = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".partial")
    fd = None
    created = False
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
        created = True
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(body)
            stream.flush()
        os.fchmod(fd, mode)
        os.fsync(fd)
        os.close(fd)
        fd = None
        if replace:
            os.replace(temporary, path)
        else:
            try:
                os.link(temporary, path, follow_symlinks=False)
            except FileExistsError:
                need(read_bytes(path, maximum=max(len(body), 1)) == body,
                     "RETAINED_FILE_CONFLICT", "The published original target differs.")
            temporary.unlink()
        sync_directory(path.parent)
    finally:
        try:
            if fd is not None:
                os.close(fd)
        finally:
            if created:
                try:
                    temporary.unlink()
                except FileNotFoundError:
                    pass
                else:
                    sync_directory(path.parent)


def write_json(path, value, *, replace=False):
    write_bytes(path, encoded(value), replace=replace)


def copy_file(source, target, expected, *, mode=0o600):
    expected = pin(expected)
    private_directory(target.parent)
    temporary = target.with_name("." + target.name + ".merchant-portable.partial")
    if target.exists():
        need(file_hash(target) == expected, "RETAINED_FILE_CONFLICT", "Keep the original copied file: " + str(target))
        durable_file(target)
        if temporary.exists():
            final, staged = target.lstat(), temporary.lstat()
            same = (final.st_dev, final.st_ino) == (staged.st_dev, staged.st_ino)
            need(stat.S_ISREG(staged.st_mode) and not stat.S_ISLNK(staged.st_mode)
                 and staged.st_uid == os.getuid() and not staged.st_mode & 0o077
                 and (staged.st_nlink == 2 if same else staged.st_nlink == 1)
                 and file_hash(temporary) == expected,
                 "STAGE_CHANGED", "Keep the original completed copied-file stage.")
            temporary.unlink()
            sync_directory(temporary.parent)
        return
    if temporary.exists():
        info = temporary.lstat()
        need(stat.S_ISREG(info.st_mode) and not temporary.is_symlink()
             and info.st_uid == os.getuid() and info.st_nlink == 1 and not info.st_mode & 0o077,
             "STAGE_CHANGED", "Keep the original private ordinary project stage.")
        if file_hash(temporary) == expected:
            with opened_regular(temporary) as (fd, _info):
                need(stat.S_IMODE(_info.st_mode) == mode,
                     "STAGE_CHANGED", "Keep the original copied-file stage mode.")
                os.fsync(fd)
        else:
            temporary.unlink()
            sync_directory(temporary.parent)
    if not temporary.exists():
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
        try:
            h = hashlib.sha256()
            size = 0
            with opened_regular(source) as (source_fd, _before), os.fdopen(
                    descriptor, "wb", closefd=False) as output, os.fdopen(source_fd, "rb", closefd=False) as original:
                for block in iter(lambda: original.read(CHUNK), b""):
                    output.write(block)
                    h.update(block)
                    size += len(block)
                    need(size <= int(expected["bytes"]), "ORIGINAL_FILE_CHANGED", "The selected source grew.")
                output.flush()
                need({"bytes": str(size), "sha256": h.hexdigest()} == expected,
                     "ORIGINAL_FILE_CHANGED", "The complete selected source bytes differ.")
                os.fchmod(descriptor, mode)
                os.fsync(descriptor)
        except BaseException:
            try:
                temporary.unlink()
                sync_directory(temporary.parent)
            except FileNotFoundError:
                pass
            raise
        finally:
            os.close(descriptor)
    try:
        os.link(temporary, target, follow_symlinks=False)
    except FileExistsError:
        need(file_hash(target) == expected, "RETAINED_FILE_CONFLICT", "The original destination differs.")
    sync_directory(target.parent)
    temporary.unlink()
    sync_directory(temporary.parent)


@contextmanager
def lock_file(path, *, inherited=None, create=False):
    private_directory(path.parent)
    fd = None
    if inherited is None:
        flags = os.O_RDWR | os.O_NOFOLLOW
        if create:
            flags |= os.O_CREAT
        fd = os.open(path, flags, 0o600)
    else:
        need(type(inherited) is int and inherited == 3,
             "LEASE_DESCRIPTOR_INVALID", "Inherit the original merchant lease on fd 3.")
        fd = os.dup(inherited)
    try:
        info, named = os.fstat(fd), path.lstat()
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and not info.st_mode & 0o077
             and info.st_uid == os.getuid()
             and (info.st_dev, info.st_ino) == (named.st_dev, named.st_ino),
             "LEASE_CHANGED", "Hold the original private merchant lease inode.")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise PortableError("MERCHANT_BUSY", "The original merchant has another owning runtime.") from error
        yield fd
    finally:
        # An inherited descriptor shares the parent's open file description.
        # Closing this duplicate must never LOCK_UN the parent's live lease.
        os.close(fd)


def module_source(name, path, expected):
    body = read_bytes(path)
    need(sha_bytes(body) == expected, "ARCHIVE_ENGINE_CHANGED", "Use the selected maintained archive source.")
    spec = importlib.util.spec_from_loader(name, loader=None, origin=str(path))
    module = importlib.util.module_from_spec(spec)
    module.__file__ = str(path)
    sys.modules[name] = module
    exec(compile(body, str(path), "exec"), module.__dict__)
    return module


def engines():
    global archive_engine, source_unpacker, policy
    if archive_engine is not None:
        return
    archive_engine = module_source("merchant_portable_source_archive", ARCHIVE_PATH, ARCHIVE_SHA)
    source_unpacker = module_source("merchant_portable_runtime_unpack", UNPACK_PATH, UNPACK_SHA)
    policy = archive_engine.ArchivePolicy(
        MANIFEST_SCHEMA, max_expanded_bytes=MAX_PROJECT, max_file_bytes=MAX_FILE,
        max_members=100000, max_manifest_bytes=32 * CHUNK,
        receipt_name="received-handover.json", prefix="MERCHANT_PORTABLE")


def sql_name(value):
    return '"' + value.replace('"', '""') + '"'


def connect_readonly(path):
    need(path.resolve() == path, "DATABASE_PATH_CHANGED", "Use the original database path.")
    with opened_regular(path, private=True) as (_fd, _info):
        pass
    db = sqlite3.connect("file:" + quote(str(path), safe="/") + "?mode=ro", uri=True, timeout=5)
    db.execute("PRAGMA query_only=ON")
    db.execute("PRAGMA cache_size=-2048")
    db.execute("PRAGMA mmap_size=0")
    return db


def store_identity(db, expected=None):
    version = db.execute("PRAGMA user_version").fetchone()[0]
    application = db.execute("PRAGMA application_id").fetchone()[0]
    names = {row[0] for row in db.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
    need(version == STORE_VERSION and application == STORE_APPLICATION and EXPECTED_TABLES <= names,
         "MERCHANT_SCHEMA_CHANGED", "Open the complete original merchant schema.")
    rows = db.execute("SELECT singleton,schema_version,store_id,created_at FROM merchant_meta").fetchall()
    need(len(rows) == 1 and rows[0][0] == 1 and rows[0][1] == STORE_VERSION,
         "MERCHANT_SCHEMA_CHANGED", "Keep the original merchant identity row.")
    need(expected is None or rows[0][2] == expected, "STORE_ID_CHANGED", "The selected directory holds another merchant store.")
    return {"storeId": rows[0][2], "schemaVersion": version, "applicationId": application,
            "createdAt": rows[0][3]}


def check_database(db):
    rows = db.execute("PRAGMA integrity_check").fetchmany(20)
    need(rows == [("ok",)], "DATABASE_INTEGRITY", "Preserve and repair the original database before exporting.",
         {"messages": [str(row[0]) for row in rows]})
    foreign = db.execute("PRAGMA foreign_key_check").fetchmany(20)
    need(not foreign, "DATABASE_FOREIGN_KEYS", "Keep the complete original merchant relationships.",
         {"rows": foreign})


def framed(h, tag, value):
    h.update(tag)
    h.update(len(value).to_bytes(8, "big"))
    h.update(value)


def database_summary(db, *, originals=None):
    identity = store_identity(db)
    schemas = [list(row) for row in db.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name")]
    schema_sha = sha_bytes(encoded(schemas))
    tables = []
    blobs = {}
    all_hash, business_hash = hashlib.sha256(), hashlib.sha256()
    framed(all_hash, b"S", encoded(schemas))
    framed(business_hash, b"S", encoded(schemas))
    for (name,) in db.execute("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"):
        info = db.execute("PRAGMA table_info(" + sql_name(name) + ")").fetchall()
        columns = [row[1] for row in info]
        expressions = []
        for column in columns:
            q = sql_name(column)
            expressions.extend(["typeof(" + q + ")", "CASE WHEN typeof(" + q + ")='blob' THEN length(" + q + ") ELSE " + q + " END"])
        h = hashlib.sha256()
        framed(h, b"T", encoded({"name": name, "columns": [list(row) for row in info]}))
        count = 0
        statement = "SELECT rowid," + ",".join(expressions) + " FROM " + sql_name(name) + " ORDER BY rowid"
        for row in db.execute(statement):
            rowid = row[0]
            framed(h, b"R", str(rowid).encode("ascii"))
            count += 1
            for ordinal, column in enumerate(columns):
                kind, value = row[1 + 2 * ordinal:3 + 2 * ordinal]
                replacement = None if originals is None else originals.get((name, rowid, column))
                if replacement is not None:
                    need(kind == "text" and value == replacement["after"],
                         "RUNTIME_RESULT_CHANGED", "Only the recorded result path may differ from the original snapshot.")
                    value = replacement["before"]
                if kind == "null":
                    framed(h, b"N", b"")
                elif kind == "integer":
                    framed(h, b"I", str(value).encode("ascii"))
                elif kind == "real":
                    framed(h, b"F", float(value).hex().encode("ascii"))
                elif kind == "text":
                    framed(h, b"T", value.encode("utf-8"))
                elif kind == "blob":
                    size = int(value)
                    h.update(b"B")
                    h.update(size.to_bytes(8, "big"))
                    blob_hash = hashlib.sha256()
                    with db.blobopen(name, column, rowid, readonly=True) as stream:
                        read = 0
                        while True:
                            block = stream.read(CHUNK)
                            if not block:
                                break
                            read += len(block)
                            h.update(block)
                            blob_hash.update(block)
                    need(read == size, "DATABASE_BLOB_CHANGED", "Keep every complete original SQLite BLOB.")
                    blobs[(name, rowid, column)] = {"bytes": str(size), "sha256": blob_hash.hexdigest()}
                else:
                    raise PortableError("DATABASE_TYPE", "Unsupported original SQLite value type.")
        row = {"name": name, "rows": str(count), "sha256": h.hexdigest(),
               "columns": [{"name": item[1], "type": item[2], "notNull": bool(item[3]),
                            "default": item[4], "primaryKeyOrdinal": item[5]} for item in info]}
        tables.append(row)
        framed(all_hash, b"T", encoded(row))
        if name != "merchant_runtimes":
            framed(business_hash, b"T", encoded(row))
    checks = [
        ("merchant_orders", "charge_request", "charge_request_bytes", "charge_request_sha256"),
        ("merchant_orders", "signature", None, "signature_sha256"),
        ("merchant_exchanges", "raw", "raw_bytes", "raw_sha256"),
        ("merchant_events", "raw", "raw_bytes", "raw_sha256"),
        ("merchant_fulfillments", "returned", "returned_bytes", "returned_sha256"),
    ]
    for table, column, size_column, hash_column in checks:
        select_size = sql_name(size_column) if size_column else "length(" + sql_name(column) + ")"
        for rowid, size, digest in db.execute(
                "SELECT rowid," + select_size + "," + sql_name(hash_column) + " FROM " + sql_name(table)):
            actual = blobs.get((table, rowid, column))
            need((actual is None and size is None and digest is None) or
                 (actual is not None and actual == {"bytes": str(size), "sha256": digest}),
                 "DATABASE_ORIGINAL_BYTES", "An original request, signature, response, event or return no longer matches its retained hash.")
    states = {str(row[0]): str(row[1]) for row in db.execute(
        "SELECT state,count(*) FROM merchant_orders GROUP BY state ORDER BY state")}
    return {**identity, "schemaSha256": schema_sha, "allRowsSha256": all_hash.hexdigest(),
            "businessSha256": business_hash.hexdigest(), "tables": tables, "orderStates": states}


def operation_id(value):
    need(isinstance(value, str), "OPERATION_REQUIRED", "Use the original operation UUID.")
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError) as error:
        raise PortableError("OPERATION_REQUIRED", "Use the original operation UUID.") from error
    need(str(parsed) == value, "OPERATION_REQUIRED", "Use the canonical original operation UUID.")
    return value


def validate_request(value):
    need(isinstance(value, dict) and value.get("schema") == REQUEST_SCHEMA,
         "REQUEST_SCHEMA", "Use the complete merchant portable request.")
    operation_id(value.get("operation"))
    action = value.get("action")
    need(action in ("export", "inspect", "receive"), "ACTION_INVALID", "Select export, inspect or receive.")
    normalized = deepcopy(value)
    normalized.pop("leaseFd", None)
    if action == "export":
        for key in ("directory", "config", "sourceArchive", "outputDirectory"):
            absolute(value.get(key))
        need(re.fullmatch(r"[0-9a-f]{64}", value.get("sourceSha256", "")),
             "SOURCE_IDENTITY_REQUIRED", "Select the complete source archive SHA-256.")
        original = absolute(value["directory"])
        output = absolute(value["outputDirectory"])
        need(output != original and original not in output.parents,
             "EXPORT_DESTINATION", "Keep exported projects outside the original merchant workspace.")
        if "expectedStoreId" in value:
            need(isinstance(value["expectedStoreId"], str) and value["expectedStoreId"],
                 "STORE_ID_REQUIRED", "Use the actual original store identity.")
        inputs = value.get("inputFiles", [])
        need(isinstance(inputs, list) and len(inputs) <= 100000,
             "INPUT_FILES_INVALID", "Select the explicit original reviewed input files.")
        seen = {}
        for row in inputs:
            need(isinstance(row, dict), "INPUT_FILES_INVALID", "Use full input file descriptors.")
            path = str(absolute(row.get("path")))
            selected = pin(row)
            role = row.get("role", "reviewed-input")
            need(isinstance(role, str) and 0 < len(role) <= 128 and "\0" not in role,
                 "INPUT_ROLE_INVALID", "Keep the original input file role.")
            if path in seen:
                need(seen[path] == selected, "INPUT_IDENTITY_CONFLICT", "One original path has conflicting input identities.")
            seen[path] = selected
        if "leaseFd" in value:
            need(type(value["leaseFd"]) is int and value["leaseFd"] == 3,
                 "LEASE_DESCRIPTOR_INVALID", "Inherit the original merchant lease on fd 3.")
    else:
        absolute(value.get("archive"))
        need(re.fullmatch(r"[0-9a-f]{64}", value.get("archiveSha256", "")),
             "ARCHIVE_IDENTITY_REQUIRED", "Use the original complete project archive SHA-256.")
        if action == "receive":
            absolute(value.get("destination"))
    return normalized


def selected_source(path, expected_sha, *, match_current, reservation_state=False):
    actual = file_hash(path, maximum=64 * CHUNK)
    need(actual["sha256"] == expected_sha, "SOURCE_ARCHIVE_CHANGED", "Keep the exact original distribution source.tgz.")
    manifest, expected, contents, manifest_sha = source_unpacker.inspect(path, expected_sha)
    needed = [PRODUCT + name for name in REQUIRED_PRODUCT]
    if reservation_state:
        needed.append(PRODUCT + "portable-reservation-bridge.mjs")
    needed.extend([str(ARCHIVE_PATH.relative_to(SOURCE_ROOT)), str(UNPACK_PATH.relative_to(SOURCE_ROOT))])
    proof = []
    for relative_path in needed:
        key = "source/" + relative_path
        need(key in expected, "PORTABLE_SOURCE_INCOMPLETE",
             "The complete source archive must include the same portable-capable application: " + relative_path)
        digest, size, _mode = expected[key]
        if match_current:
            need(file_hash(SOURCE_ROOT / relative_path, maximum=4 * CHUNK) ==
                 {"bytes": str(size), "sha256": digest},
                 "PORTABLE_SOURCE_EDITION_CHANGED",
                 "Build the complete source archive from the exact portable application that is exporting: " + relative_path)
        proof.append({"path": relative_path, "bytes": str(size), "sha256": digest})
    return {"bytes": actual["bytes"], "sha256": expected_sha,
            "sourceCommit": manifest["sourceCommit"], "packageName": manifest["packageName"],
            "packageVersion": manifest["packageVersion"], "manifestSha256": manifest_sha,
            "sourceFiles": str(len(manifest["files"])), "requiredSource": proof}, (manifest, expected, contents)


def input_member(path):
    return "inputs/tree/" + str(path).lstrip("/")


def environment_references(config):
    values = [config.get("tenantCredentialEnv"), config.get("operatorTokenEnv")]
    webhook = config.get("webhook") or {}
    if isinstance(webhook, dict):
        versions = webhook.get("secretEnvironmentByVersion") or {}
        if isinstance(versions, dict):
            values.extend(versions.values())
    references = []
    for value in values:
        if value is None:
            continue
        need(isinstance(value, str) and re.fullmatch(r"[A-Z][A-Z0-9_]{0,127}", value),
             "ENVIRONMENT_REFERENCE_INVALID", "Retain environment reference names rather than secret values.")
        references.append(value)
    return sorted(set(references))


def delivery_selection(entry):
    need(isinstance(entry, dict) and type(entry.get("bytes")) is int
         and 0 <= entry["bytes"] <= 1024 * CHUNK
         and re.fullmatch(r"[0-9a-f]{64}", entry.get("sha256", ""))
         and isinstance(entry.get("contentType"), str)
         and re.fullmatch(r"[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+", entry["contentType"])
         and isinstance(entry.get("fileName"), str)
         and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}", entry["fileName"]),
         "DELIVERY_FILE_INVALID", "Keep the complete original file-delivery edition.")
    selected = {key: entry[key] for key in ("bytes", "sha256", "contentType", "fileName")}
    selected["contentType"] = selected["contentType"].lower()
    binding = "sha256:" + sha_bytes(encoded(selected)[:-1])
    return selected, binding


def resolve_input(base, name):
    need(isinstance(name, str) and name and "\0" not in name,
         "INPUT_PATH_INVALID", "Keep the original configured input path.")
    value = Path(os.path.normpath(str(base / name)))
    return absolute(str(value))


def stage_inputs(request, payload, source_info, source_parts):
    config_path = absolute(request["config"])
    config_raw = read_bytes(config_path, maximum=CHUNK, private=True)
    config = parse_json(config_raw, "merchant configuration")
    need(isinstance(config, dict) and isinstance(config.get("fulfillmentModule"), str),
         "CONFIGURATION_INVALID", "Keep the original complete merchant configuration.")
    files = {}
    by_original = {}
    declared = {}
    for row in request.get("inputFiles", []):
        path = str(absolute(row["path"]))
        selected = pin(row)
        prior = declared.get(path)
        if prior is not None:
            need(prior["pin"] == selected, "INPUT_IDENTITY_CONFLICT", "Keep one original input identity.")
            prior["roles"].add(row.get("role", "reviewed-input"))
        else:
            declared[path] = {"pin": selected, "roles": {row.get("role", "reviewed-input")}}

    def retain(path, role, *, target=None, maximum=MAX_FILE, original_bytes=None):
        path = absolute(str(path))
        name = str(path)
        if name in by_original:
            row = by_original[name]
            row["roles"] = sorted(set(row["roles"]) | {role})
            return row
        identity = ({"bytes": str(len(original_bytes)), "sha256": sha_bytes(original_bytes)}
                    if original_bytes is not None else file_hash(path, maximum=maximum))
        if name in declared:
            need(identity == declared[name]["pin"], "REVIEWED_INPUT_CHANGED",
                 "The original reviewed input changed: " + name)
        member = relative(target or input_member(path))
        need(member not in files, "INPUT_MEMBER_CONFLICT", "Keep distinct original input members.")
        if original_bytes is None:
            copy_file(path, payload / member, identity)
        else:
            write_bytes(payload / member, original_bytes)
        roles = {role} | (declared.get(name) or {}).get("roles", set())
        row = {"originalPath": name, "path": member, **identity, "roles": sorted(roles)}
        by_original[name] = row
        files[member] = {"path": member, **identity, "role": role, "originalPath": name}
        return row

    configuration = retain(config_path, "configuration", target="configuration/merchant.json",
                           maximum=CHUNK, original_bytes=config_raw)
    module_path = resolve_input(config_path.parent, config["fulfillmentModule"])
    module = retain(module_path, "fulfillment-module", maximum=4 * CHUNK)
    _, source_expected, _source_contents = source_parts
    builtin_entry = source_expected["source/" + PRODUCT + "fulfillment/file-delivery.mjs"]
    builtin = module["sha256"] == builtin_entry[0] and module["bytes"] == str(builtin_entry[1])
    manifests = []
    bindings = {}
    manifest_paths = []
    options = config.get("fulfillmentOptions") or {}
    if isinstance(options, dict) and options.get("manifest") is not None:
        manifest_paths.append(resolve_input(config_path.parent, options["manifest"]))
    for name, selected in declared.items():
        if "delivery-manifest" in selected["roles"]:
            manifest_paths.append(absolute(name))
    for manifest_path in dict.fromkeys(manifest_paths):
        raw = read_bytes(manifest_path, maximum=CHUNK)
        row = retain(manifest_path, "delivery-manifest", maximum=CHUNK, original_bytes=raw)
        value = parse_json(raw, "fulfillment manifest")
        if not isinstance(value, dict) or value.get("schema") != "stellar-forge.merchant-file-delivery.v1":
            need(not builtin, "DELIVERY_MANIFEST_INVALID", "Use the original file-delivery manifest.")
            continue
        entries = value.get("files")
        need(isinstance(entries, dict) and entries, "DELIVERY_MANIFEST_INVALID", "Retain every declared delivery edition.")
        manifests.append({**row, "schema": value["schema"]})
        for binding, entry in entries.items():
            selected, actual_binding = delivery_selection(entry)
            need(binding == actual_binding, "DELIVERY_BINDING_CHANGED", "Keep the original delivery binding.")
            original_path = resolve_input(manifest_path.parent, entry.get("path"))
            received = retain(original_path, "delivery-edition", maximum=1024 * CHUNK)
            need(pin(received) == {"bytes": str(selected["bytes"]), "sha256": selected["sha256"]},
                 "DELIVERY_FILE_CHANGED", "The original pinned delivery file changed.")
            value = {"binding": binding, "file": received["path"], "originalPath": str(original_path),
                     "entry": deepcopy(entry), "manifest": row["path"]}
            if binding in bindings:
                prior_selected, _ = delivery_selection(bindings[binding]["entry"])
                need(prior_selected == selected, "DELIVERY_BINDING_CONFLICT", "One original binding has conflicting file editions.")
            else:
                bindings[binding] = value
    if builtin:
        need(manifests and config.get("fulfillmentBinding") in bindings,
             "DELIVERY_EDITION_REQUIRED", "Keep the configured original delivery edition.")
    for name, selected in declared.items():
        for role in sorted(selected["roles"]):
            retain(absolute(name), role, maximum=MAX_FILE)
    source_path = absolute(request["sourceArchive"])
    source = retain(source_path, "complete-source-archive", target="source/source.tgz", maximum=64 * CHUNK)
    need(pin(source) == pin(source_info), "SOURCE_ARCHIVE_CHANGED", "Keep the complete verified source archive.")
    configuration = {**configuration, "environmentReferences": environment_references(config),
                     "fulfillment": {"kind": "file" if builtin else "custom", "module": module,
                                     "manifests": manifests, "bindings": [bindings[key] for key in sorted(bindings)]}}
    return config, configuration, list(by_original.values()), files, {**source_info, "path": source["path"]}


def snapshot_database(request, request_sha, operation_root, payload):
    capture_path = operation_root / "control/snapshot-captured.json"
    destination = payload / "workspace/merchant.sqlite3"
    temporary = operation_root / "control/snapshot.sqlite3.partial"
    retained = read_json(capture_path, optional=True)
    if retained is not None:
        need(retained.get("requestSha256") == request_sha and retained.get("operation") == request["operation"],
             "SNAPSHOT_SELECTION_CHANGED", "Keep this operation's original SQLite snapshot.")
        if destination.exists():
            need(file_hash(destination) == retained["file"], "SNAPSHOT_CHANGED", "Keep the selected original snapshot.")
            durable_file(destination)
            if temporary.exists():
                final, staged = destination.lstat(), temporary.lstat()
                need(stat.S_ISREG(staged.st_mode) and not stat.S_ISLNK(staged.st_mode)
                     and (final.st_dev, final.st_ino) == (staged.st_dev, staged.st_ino)
                     and final.st_nlink == 2 and staged.st_nlink == 2,
                     "SNAPSHOT_STAGE_CHANGED", "Reconcile only the original published backup stage.")
                temporary.unlink()
                sync_directory(temporary.parent)
            return retained
        need(temporary.exists() and file_hash(temporary) == retained["file"],
             "SNAPSHOT_MISSING", "Retain the original completed backup stage.")
    else:
        # These deterministic files are only this export's unfinished backup,
        # never the live merchant database. No selected capture exists yet.
        for unfinished in (temporary.with_name(temporary.name + "-journal"),
                           temporary.with_name(temporary.name + "-wal"),
                           temporary.with_name(temporary.name + "-shm"), temporary):
            if unfinished.exists():
                info = unfinished.lstat()
                need(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode)
                     and info.st_uid == os.getuid() and info.st_nlink == 1 and not info.st_mode & 0o077,
                     "SNAPSHOT_STAGE_CHANGED", "Keep the original private unfinished backup stage.")
                unfinished.unlink()
                sync_directory(unfinished.parent)
        # A capture receipt is durable before publishing the final snapshot.
        need(not destination.exists(), "SNAPSHOT_SELECTION_MISSING",
             "Reconcile the original published snapshot selection before another backup.")
        fd = os.open(temporary, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        sync_directory(temporary.parent)
        source_path = absolute(request["directory"]) / "merchant.sqlite3"
        source = connect_readonly(source_path)
        target = None
        try:
            identity = store_identity(source, request.get("expectedStoreId"))
            target = sqlite3.connect(temporary, timeout=5)
            target.execute("PRAGMA synchronous=FULL")
            target.execute("PRAGMA cache_size=-2048")
            source.backup(target, pages=256, sleep=0.01)
            target.execute("PRAGMA journal_mode=DELETE")
            check_database(target)
            summary = database_summary(target)
            need(summary["storeId"] == identity["storeId"],
                 "STORE_ID_CHANGED", "The committed SQLite snapshot belongs to the original store.")
            target.close()
            target = None
            durable_file(temporary)
            retained = {"operation": request["operation"], "requestSha256": request_sha,
                        "selectedAt": now(), "file": file_hash(temporary), "summary": summary}
            write_json(capture_path, retained)
        finally:
            if target is not None:
                target.close()
            source.close()
    private_directory(destination.parent)
    try:
        os.link(temporary, destination, follow_symlinks=False)
    except FileExistsError:
        need(file_hash(destination) == retained["file"], "SNAPSHOT_CHANGED", "The original snapshot target differs.")
    sync_directory(destination.parent)
    temporary.unlink(missing_ok=True)
    sync_directory(temporary.parent)
    durable_file(destination)
    return retained


def result_metadata(value, directory, *, required=False):
    if not isinstance(value, dict) or not {"path", "bytes", "sha256"} <= set(value):
        need(not required, "RESULT_METADATA_INVALID", "Keep the complete original result-file metadata.")
        return None
    path_value = value.get("path")
    if not isinstance(path_value, str):
        need(not required, "RESULT_METADATA_INVALID", "Keep the original result path.")
        return None
    prefix = str(directory / "results") + "/"
    if not path_value.startswith(prefix):
        need(not required, "RESULT_PATH_CHANGED", "A merchant result must remain beneath its original results directory.")
        return None
    path = absolute(path_value)
    need(type(value.get("bytes")) is int and 0 <= value["bytes"] <= MAX_FILE
         and re.fullmatch(r"[0-9a-f]{64}", value.get("sha256", "")),
         "RESULT_METADATA_INVALID", "Keep the original result's exact bytes and SHA-256.")
    relative_path = str(path.relative_to(directory))
    relative(relative_path)
    return {"originalPath": path_value, "relativePath": relative_path,
            "path": "workspace/" + relative_path, "bytes": str(value["bytes"]),
            "sha256": value["sha256"],
            **{key: value[key] for key in ("contentType", "fileName") if key in value}}


def validate_result_origins(value, directory, store_id):
    need(isinstance(value, dict)
         and value.get("schema") == "stellar-forge.merchant-portable-result-origins.v1"
         and value.get("storeId") == store_id and value.get("workspaceDirectory") == str(directory)
         and isinstance(value.get("results"), list),
         "RESULT_ORIGINS_CHANGED", "Keep the same received store's original result-path map.")
    selected = {}
    files = set()
    for row in value["results"]:
        need(isinstance(row, dict), "RESULT_ORIGINS_CHANGED", "Keep complete original result origins.")
        name = relative(row.get("relativePath"))
        need(name.startswith("results/") and name not in files,
             "RESULT_ORIGINS_CHANGED", "Map only distinct retained result files within this workspace.")
        files.add(name)
        pin(row)
        paths = row.get("paths")
        need(isinstance(paths, list) and paths and all(isinstance(path, str) for path in paths)
             and paths == sorted(set(paths)),
             "RESULT_ORIGINS_CHANGED", "Keep unique exact historical result paths.")
        for path in paths:
            absolute(path)
            need(path not in selected, "RESULT_ORIGINS_CHANGED", "A historical path names one original result edition.")
            selected[path] = row
    return selected


def read_result_origins(path, directory, store_id, *, optional=False):
    if optional and not path.exists():
        return None, {}
    raw = read_bytes(path, private=True, maximum=32 * CHUNK)
    value = parse_json(raw, "received result origins")
    return {"bytes": str(len(raw)), "sha256": sha_bytes(raw)}, validate_result_origins(value, directory, store_id)


def received_result_origins(manifest, workspace, request, manifest_sha):
    rows = []
    for row in manifest["results"]:
        paths = sorted({row["originalPath"], str(workspace / row["relativePath"]),
                        *row.get("historicalPaths", [])})
        rows.append({"relativePath": row["relativePath"], **pin(row), "paths": paths})
    value = {"schema": "stellar-forge.merchant-portable-result-origins.v1",
             "storeId": manifest["original"]["storeId"], "workspaceDirectory": str(workspace),
             "exportOperation": manifest["operation"], "receiveOperation": request["operation"],
             "manifestSha256": manifest_sha, "results": rows}
    validate_result_origins(value, workspace, manifest["original"]["storeId"])
    return value


def reservation_bridge(action, **values):
    """Use the same native SF31 reader/restorer as the directory handover."""
    schema = "stellar-forge.merchant-portable-reservation-bridge.v1"
    request = {"schema": schema, "action": action, **values}
    node = os.environ.get("MERCHANT_PORTABLE_NODE") or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or "node"
    try:
        result = subprocess.run(
            [node, str(HERE / "portable-reservation-bridge.mjs")], input=encoded(request),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    except OSError as error:
        raise PortableError("RESERVATION_RUNTIME_REQUIRED",
                            "Use the installed Node runtime for the original file reservation recovery.") from error
    need(result.returncode == 0, "RESERVATION_STATE_INVALID",
         "Keep the complete original SF31 reservation state.",
         {"nativeError": result.stderr[-8192:].decode("utf-8", errors="replace")})
    need(len(result.stdout) <= 32 * CHUNK, "RESERVATION_STATE_TOO_LARGE",
         "Keep the complete reservation inventory within the original project limit.")
    response = parse_json(result.stdout, "native reservation response")
    need(isinstance(response, dict) and response.get("schema") == schema and response.get("action") == action
         and isinstance(response.get("result"), list),
         "RESERVATION_RESPONSE_INVALID", "Read the complete original native reservation response.")
    return response["result"]


def result_state_files(workspace):
    """Retain every result file, including empty-lock and unlinked-prefix states."""
    root = workspace / "results"
    if not root.exists():
        return []
    files = []
    def walk(directory):
        private_directory(directory)
        for path in sorted(directory.iterdir()):
            info = path.lstat()
            if stat.S_ISDIR(info.st_mode):
                walk(path)
            else:
                with opened_regular(path) as (_fd, selected):
                    # A native final/partial pair may still share its original inode.
                    need(selected.st_uid == os.getuid() and not selected.st_mode & 0o077
                         and selected.st_nlink >= 1,
                         "PRIVATE_FILE_REQUIRED", "Retain the original private result or reservation file.")
                    identity = file_hash(path)
                files.append({"path": "workspace/" + str(path.relative_to(workspace)), **identity})
                need(len(files) <= 100000, "PROJECT_RESULTS_TOO_LARGE",
                     "Keep the complete original result inventory within the project member limit.")
    walk(root)
    return sorted(files, key=lambda row: row["path"])


def snapshot_result_state(database_path, directory, payload, control, request_sha, snapshot):
    selected_path = control / "result-state-selection.json"
    selected = read_json(selected_path, optional=True)
    if selected is None:
        files = result_state_files(directory)
        mappings = reservation_bridge("inspect", database=str(database_path),
                                      directory=str(directory), recordedDirectory=str(directory))
        # Every byte identity is fixed before copying or publishing any member.
        need(result_state_files(directory) == files, "RESULT_STATE_CHANGED",
             "Retain one complete original result and reservation selection.")
        selected = {"schema": "stellar-forge.merchant-portable-result-state-selection.v1",
                    "requestSha256": request_sha, "snapshot": pin(snapshot),
                    "directory": str(directory),
                    "state": {"schema": "stellar-forge.merchant-portable-result-state.v1",
                              "files": files, "reservationMappings": mappings}}
        write_json(selected_path, selected)
    need(selected.get("schema") == "stellar-forge.merchant-portable-result-state-selection.v1"
         and selected.get("requestSha256") == request_sha and selected.get("snapshot") == pin(snapshot)
         and selected.get("directory") == str(directory),
         "RESULT_STATE_SELECTION_CHANGED", "Keep this snapshot's original complete result selection.")
    state = selected["state"]
    for row in state["files"]:
        copy_file(directory / row["path"][len("workspace/"):], payload / row["path"], row)
    need(result_state_files(payload / "workspace") == state["files"],
         "RESULT_STATE_CHANGED", "Keep the complete selected result state without extra or missing files.")
    actual = reservation_bridge("inspect", database=str(database_path),
                                directory=str(payload / "workspace"), recordedDirectory=str(directory))
    need(actual == state["reservationMappings"], "RESERVATION_STATE_CHANGED",
         "Keep every original reservation, partial prefix and finalized response.")
    return state


def validate_result_state(manifest, inventory, member):
    state = manifest.get("reservationState")
    if state is None:
        return set()
    need(isinstance(state, dict) and set(state) == {"schema", "files", "reservationMappings"}
         and state.get("schema") == "stellar-forge.merchant-portable-result-state.v1"
         and isinstance(state.get("files"), list) and isinstance(state.get("reservationMappings"), list),
         "RESULT_STATE_INVALID", "Use the complete original result and reservation inventory.")
    names = []
    for row in state["files"]:
        name = member(row)
        need(set(row) == {"path", "bytes", "sha256"} and name.startswith("workspace/results/"),
             "RESULT_STATE_INVALID", "Retain exact files beneath the original results directory.")
        names.append(name)
    selected_names = set(names)
    need(names == sorted(selected_names) and all(row["path"] in selected_names for row in manifest["results"]),
         "RESULT_STATE_INVALID", "Keep every original result in the complete unique state inventory.")
    for row in state["reservationMappings"]:
        need(isinstance(row, dict) and row.get("schema") ==
             "stellar-forge.x402api-merchant-file-reservation.v1"
             and row.get("relativePath") in selected_names
             and row.get("recordedDirectory") == manifest["original"]["directory"],
             "RESULT_STATE_INVALID", "Keep each native reservation in its original workspace.")
    return set(names)


def verify_original_result_state(original, manifest):
    state = manifest.get("reservationState")
    if state is None:
        return
    need(result_state_files(original / "workspace") == state["files"],
         "RESULT_STATE_CHANGED", "Verify the complete original result inventory.")
    actual = reservation_bridge("inspect", database=str(original / "workspace/merchant.sqlite3"),
                                directory=str(original / "workspace"),
                                recordedDirectory=manifest["original"]["directory"])
    need(actual == state["reservationMappings"], "RESERVATION_STATE_CHANGED",
         "Verify the original reservation records against the unchanged snapshot and returned bytes.")


def materialize_result_state(original, runtime, control, manifest, request_sha):
    """Publish once before the runtime database; later native progress stays live."""
    state = manifest.get("reservationState")
    if state is None:
        return None
    workspace = runtime / "workspace"
    receipt_path = control / "result-state-published.json"
    identity = {"schema": "stellar-forge.merchant-portable-result-state-publication.v1",
                "requestSha256": request_sha, "stateSha256": sha_bytes(encoded(state)),
                "workspace": str(workspace)}
    published = read_json(receipt_path, optional=True)
    if published is not None:
        need(all(published.get(key) == value for key, value in identity.items())
             and isinstance(published.get("files"), list)
             and isinstance(published.get("reservationRelocations"), list),
             "RESULT_STATE_PUBLICATION_CHANGED", "Keep the original result-state publication.")
        # The received merchant can consume its original locks or advance partials.
        # This receipt owns the initial publication; a replay never recreates them.
        return published
    need(not (workspace / "merchant.sqlite3").exists(), "RESULT_STATE_PUBLICATION_MISSING",
         "Reconcile the original result-state publication before opening an existing runtime.")
    relocated_path = control / "result-state-relocated.json"
    relocated = read_json(relocated_path, optional=True)
    if relocated is None:
        # A killed native relocation may leave a private temporary file. Retain
        # that unfinished stage and prepare a fresh private copy; no live
        # merchant file is replaced and no partial stage becomes authoritative.
        stage = private_directory(control / ("result-state-stage." + str(uuid.uuid4())))
        staged_workspace = private_directory(stage / "workspace")
        for row in state["files"]:
            copy_file(original / row["path"], stage / row["path"], row)
        need(result_state_files(staged_workspace) == state["files"], "RESULT_STATE_STAGE_CHANGED",
             "Keep the exact complete original result stage.")
        relocations = reservation_bridge("restore", stage=str(stage), directory=str(runtime),
                                         database=str(original / "workspace/merchant.sqlite3"),
                                         recordedDirectory=manifest["original"]["directory"],
                                         reservations=state["reservationMappings"])
        relocated = {**identity, "stage": str(stage), "files": result_state_files(staged_workspace),
                     "reservationRelocations": relocations}
        write_json(relocated_path, relocated)
    stage = absolute(relocated.get("stage"))
    need(stage.parent == control and stage.name.startswith("result-state-stage.")
         and str(uuid.UUID(stage.name[len("result-state-stage."):])) == stage.name[len("result-state-stage."):],
         "RESULT_STATE_STAGE_CHANGED", "Keep the original private selected relocation stage.")
    staged_workspace = stage / "workspace"
    need(all(relocated.get(key) == value for key, value in identity.items())
         and result_state_files(staged_workspace) == relocated.get("files")
         and isinstance(relocated.get("reservationRelocations"), list),
         "RESULT_STATE_STAGE_CHANGED", "Keep the original complete relocated result stage.")
    for row in relocated["files"]:
        copy_file(stage / row["path"], runtime / row["path"], row)
    need(result_state_files(workspace) == relocated["files"], "RESULT_STATE_PUBLICATION_CHANGED",
         "Publish the complete original result state before its native database.")
    write_json(receipt_path, relocated)
    return relocated


def reopen_result_state(control, workspace, manifest, request_sha, received):
    state = manifest.get("reservationState")
    if state is None:
        return
    published = read_json(control / "result-state-published.json")
    need(isinstance(published, dict) and published.get("schema") ==
         "stellar-forge.merchant-portable-result-state-publication.v1"
         and published.get("requestSha256") == request_sha
         and published.get("stateSha256") == sha_bytes(encoded(state))
         and published.get("workspace") == str(workspace)
         and received.get("resultStatePublication") == published,
         "RESULT_STATE_PUBLICATION_CHANGED", "Keep the original complete result-state publication.")
    # Original archive members are checked separately. Live reservation files
    # remain exactly as the native merchant has progressed them since receiving.


def snapshot_results(database, directory, configuration, origins=None):
    origins = origins or {}
    results = {}
    def retain(value, reference, *, required=False):
        recorded_path = value.get("path") if isinstance(value, dict) else None
        origin = origins.get(recorded_path) if isinstance(recorded_path, str) else None
        has_identity = isinstance(value, dict) and {"path", "bytes", "sha256"} <= set(value)
        candidate = value
        if origin is not None and has_identity:
            candidate = {**value, "path": str(directory / origin["relativePath"])}
        result = result_metadata(candidate, directory, required=required)
        if result is None:
            return
        if origin is not None:
            need(pin(result) == pin(origin), "RESULT_ORIGINS_CHANGED",
                 "The historical result must match its same retained file edition.")
        aliases = set(origin["paths"]) if origin is not None else set()
        if recorded_path != result["originalPath"]:
            aliases.add(recorded_path)
            reference = {**reference, "recordedPath": recorded_path}
        aliases.discard(result["originalPath"])
        key = result["originalPath"]
        if key in results:
            need(pin(results[key]) == pin(result), "RESULT_IDENTITY_CONFLICT",
                 "A snapshot references conflicting editions at one result path.")
            aliases.update(results[key]["historicalPaths"])
            results[key]["historicalPaths"] = sorted(aliases)
        else:
            results[key] = {**result, "historicalPaths": sorted(aliases), "references": []}
        if reference not in results[key]["references"]:
            results[key]["references"].append(reference)
    def visit(value, reference, depth=0):
        need(depth <= 64, "HISTORY_DEPTH", "Keep bounded original result history.")
        if isinstance(value, dict):
            retain(value, reference)
            for item in value.values():
                visit(item, reference, depth + 1)
        elif isinstance(value, list):
            for item in value:
                visit(item, reference, depth + 1)
    bindings = {row["binding"] for row in configuration["fulfillment"]["bindings"]}
    for rowid, order_id, frozen_text, data_text in database.execute(
            "SELECT rowid,id,frozen_json,data_json FROM merchant_orders ORDER BY rowid"):
        frozen = parse_json(frozen_text, "frozen invoice")
        data = parse_json(data_text, "original invoice data")
        need(isinstance(frozen, dict) and isinstance(data, dict), "ORDER_JSON_INVALID", "Keep original invoice objects.")
        if configuration["fulfillment"]["kind"] == "file":
            need(frozen.get("fulfillmentBinding") in bindings, "FROZEN_DELIVERY_EDITION_MISSING",
                 "Retain every snapshot invoice's original delivery binding and file edition.")
        if data.get("result") is not None:
            retain(data["result"], {"table": "merchant_orders", "id": order_id, "column": "data_json.result"}, required=True)
        visit(data, {"table": "merchant_orders", "id": order_id})
    for rowid, payment_id, order_id, state, data, size, digest in database.execute(
            "SELECT rowid,payment_id,order_id,state,result_file_json,returned_bytes,returned_sha256 FROM merchant_fulfillments ORDER BY rowid"):
        if data is not None:
            value = parse_json(data, "original fulfillment result")
            result = result_metadata(value, directory, required=True)
            need(pin(result) == {"bytes": str(size), "sha256": digest},
                 "FULFILLMENT_RESULT_CHANGED", "The saved result differs from its original returned bytes.")
            retain(value, {"table": "merchant_fulfillments", "paymentId": payment_id,
                           "orderId": order_id, "column": "result_file_json"}, required=True)
        need(state != "COMPLETE" or data is not None, "FULFILLMENT_RESULT_MISSING", "Keep the original completed fulfillment file.")
    for sequence, order_id, data in database.execute("SELECT sequence,order_id,data_json FROM merchant_history ORDER BY sequence"):
        visit(parse_json(data, "original invoice history"),
              {"table": "merchant_history", "sequence": str(sequence), "orderId": order_id})
    return [results[key] for key in sorted(results)]


def export_project(request, normalized):
    engines()
    operation_root = private_directory(absolute(request["outputDirectory"]) / request["operation"])
    control = private_directory(operation_root / "control")
    payload = private_directory(operation_root / "files")
    request_bytes = encoded(normalized)
    request_sha = sha_bytes(request_bytes)
    archive_path = operation_root / ("Merchant_Project_" + request["operation"] + ".zip")
    result_path = control / "result.json"
    with lock_file(control / "export.lock", create=True):
        write_bytes(control / "request.json", request_bytes)
        complete = read_json(result_path, optional=True, maximum=64 * CHUNK)
        if complete is not None:
            need(complete.get("schema") == RESULT_SCHEMA and complete.get("action") == "export"
                 and complete.get("operation") == request["operation"]
                 and complete.get("requestSha256") == request_sha and complete.get("state") == "COMPLETE",
                 "EXPORT_REQUEST_CHANGED", "Reuse the same original completed export.")
            observed = archive_engine.inspect({"archive": str(archive_path)}, policy=policy)
            need(complete.get("archive") == {"path": str(archive_path), **observed["archive"], "members": observed["members"]}
                 and complete.get("manifest") == observed["manifest"]
                 and sha_bytes(encoded(observed["manifest"])) == complete["manifestSha256"],
                 "EXPORTED_ARCHIVE_CHANGED", "Keep the exact complete project archive.")
            return {**complete, "reused": True}
        selected = read_json(control / "selection.json", optional=True)
        if selected is None:
            selected = {"operation": request["operation"], "requestSha256": request_sha, "createdAt": now()}
            write_json(control / "selection.json", selected)
        need(selected["requestSha256"] == request_sha, "EXPORT_REQUEST_CHANGED", "Keep the selected export inputs.")
        manifest_path = control / "manifest.json"
        manifest = read_json(manifest_path, optional=True)
        if manifest is None:
            directory = private_directory(absolute(request["directory"]))
            with lock_file(directory / "merchant-owner.lock", inherited=request.get("leaseFd")):
                source_info, source_parts = selected_source(absolute(request["sourceArchive"]),
                                                            request["sourceSha256"], match_current=True,
                                                            reservation_state=True)
                source_db = connect_readonly(directory / "merchant.sqlite3")
                try:
                    original_identity = store_identity(source_db, request.get("expectedStoreId"))
                finally:
                    source_db.close()
                config, configuration, inputs, inventory, source = stage_inputs(
                    request, payload, source_info, source_parts)
                del source_parts
                snapshot = snapshot_database(request, request_sha, operation_root, payload)
                need(snapshot["summary"]["storeId"] == original_identity["storeId"],
                     "STORE_ID_CHANGED", "Keep this operation's original merchant store.")
                origins_path = directory / "portable-result-origins.json"
                origins_pin, origins = read_result_origins(
                    origins_path, directory, original_identity["storeId"], optional=True)
                origins_member = None
                if origins_pin is not None:
                    origins_member = {"path": "provenance/result-origins.json", **origins_pin}
                    copy_file(origins_path, payload / origins_member["path"], origins_pin)
                    inventory[origins_member["path"]] = {**origins_member, "role": "received-result-origins"}
                database = connect_readonly(payload / "workspace/merchant.sqlite3")
                try:
                    results = snapshot_results(database, directory, configuration, origins)
                finally:
                    database.close()
                result_state = snapshot_result_state(payload / "workspace/merchant.sqlite3", directory,
                                                     payload, control, request_sha, snapshot["file"])
                selected_results = {row["path"]: row for row in result_state["files"]}
                for row in result_state["files"]:
                    inventory[row["path"]] = {**row, "role": "retained-result-state"}
                for row in results:
                    need(row["path"] in selected_results and pin(selected_results[row["path"]]) == pin(row),
                         "RESULT_STATE_CHANGED", "Keep the original result in the selected complete state.")
                    inventory[row["path"]] = {"path": row["path"], **pin(row), "role": "original-result",
                                              "originalPath": row["originalPath"]}
                inventory["workspace/merchant.sqlite3"] = {
                    "path": "workspace/merchant.sqlite3", **snapshot["file"], "role": "sqlite-snapshot",
                    "originalPath": str(directory / "merchant.sqlite3")}
                write_bytes(payload / "provenance/export-request.json", request_bytes)
                inventory["provenance/export-request.json"] = {
                    "path": "provenance/export-request.json", "bytes": str(len(request_bytes)),
                    "sha256": request_sha, "role": "export-request"}
                manifest = {
                    "schema": MANIFEST_SCHEMA, "operation": request["operation"],
                    "createdAt": selected["createdAt"], "requestSha256": request_sha,
                    "original": {"directory": str(directory), "configPath": request["config"], **original_identity},
                    "snapshot": {"path": "workspace/merchant.sqlite3", **snapshot["file"],
                                 "selectedAt": snapshot["selectedAt"], **snapshot["summary"]},
                    "configuration": configuration, "source": source, "results": results,
                    "resultOrigins": origins_member, "reservationState": result_state,
                    "inputFiles": sorted(inputs, key=lambda row: row["originalPath"]),
                    "files": [inventory[key] for key in sorted(inventory)],
                    "engines": {"archive": {"path": str(ARCHIVE_PATH.relative_to(SOURCE_ROOT)), "sha256": ARCHIVE_SHA},
                                "source": {"path": str(UNPACK_PATH.relative_to(SOURCE_ROOT)), "sha256": UNPACK_SHA}},
                    "receiving": {"defaultMode": "review", "changesBusinessState": False,
                                  "productionActivation": "original-application-configuration-and-recovery"}}
                write_json(manifest_path, manifest)
        need(manifest.get("requestSha256") == request_sha,
             "EXPORT_REQUEST_CHANGED", "Keep the frozen original project inventory.")
        validate_manifest(manifest)
        result = archive_engine.archive({"source": str(payload), "destination": str(archive_path),
                                         "manifest": manifest, "inventory": manifest["files"]}, policy=policy)
        observed = archive_engine.inspect({"archive": str(archive_path)}, policy=policy)
        need(observed["archive"] == result["archive"] and observed["manifest"] == manifest,
             "EXPORTED_ARCHIVE_CHANGED", "Reopen the complete original project archive.")
        durable_file(archive_path, maximum=policy.max_archive_bytes)
        for row in manifest["files"]:
            durable_file(payload / row["path"], row)
        complete = {"schema": RESULT_SCHEMA, "action": "export", "operation": request["operation"],
                    "state": "COMPLETE", "requestSha256": request_sha, "reused": bool(result.get("reused")),
                    "archive": {"path": str(archive_path), **observed["archive"], "members": observed["members"]},
                    "manifest": manifest, "manifestSha256": sha_bytes(encoded(manifest)),
                    "receiptPath": str(result_path)}
        write_json(result_path, complete)
        return complete


def validate_manifest(manifest):
    need(isinstance(manifest, dict) and manifest.get("schema") == MANIFEST_SCHEMA,
         "PROJECT_SCHEMA", "Inspect the complete original merchant project.")
    operation_id(manifest.get("operation"))
    need(re.fullmatch(r"[0-9a-f]{64}", manifest.get("requestSha256", "")),
         "PROJECT_REQUEST_INVALID", "Keep the original export request identity.")
    inventory = {}
    for row in manifest.get("files", []):
        need(isinstance(row, dict), "PROJECT_INVENTORY_INVALID", "Use the complete original file inventory.")
        name = relative(row.get("path"))
        need(name not in inventory, "PROJECT_MEMBER_DUPLICATE", "Keep unique original project members.")
        pin(row)
        inventory[name] = row
    need(inventory, "PROJECT_INVENTORY_INVALID", "Keep the complete original project inventory.")

    def member(row, expected_path=None):
        need(isinstance(row, dict), "PROJECT_REFERENCE_INVALID", "Use a complete original file reference.")
        name = relative(row.get("path"))
        need((expected_path is None or name == expected_path) and name in inventory
             and pin(inventory[name]) == pin(row),
             "PROJECT_REFERENCE_INVALID", "Every project reference must match its original inventory member.")
        return name

    original = manifest.get("original")
    need(isinstance(original, dict) and original.get("schemaVersion") == STORE_VERSION
         and original.get("applicationId") == STORE_APPLICATION
         and isinstance(original.get("storeId"), str) and original["storeId"],
         "PROJECT_STORE_INVALID", "Keep the original merchant store identity.")
    directory = absolute(original.get("directory"))
    absolute(original.get("configPath"))
    snapshot = manifest.get("snapshot")
    member(snapshot, "workspace/merchant.sqlite3")
    need(all(snapshot.get(key) == original.get(key) for key in
             ("storeId", "schemaVersion", "applicationId", "createdAt"))
         and all(re.fullmatch(r"[0-9a-f]{64}", snapshot.get(key, "")) for key in
                 ("schemaSha256", "allRowsSha256", "businessSha256")),
         "PROJECT_SNAPSHOT_INVALID", "Keep the complete original snapshot identity and row proof.")
    table_rows = snapshot.get("tables")
    need(isinstance(table_rows, list) and EXPECTED_TABLES <= {row.get("name") for row in table_rows
                                                          if isinstance(row, dict)},
         "PROJECT_SNAPSHOT_INVALID", "Keep every original merchant table.")
    table_names = set()
    for row in table_rows:
        need(isinstance(row, dict) and isinstance(row.get("name"), str) and row["name"] not in table_names
             and isinstance(row.get("rows"), str) and re.fullmatch(r"0|[1-9][0-9]*", row["rows"])
             and re.fullmatch(r"[0-9a-f]{64}", row.get("sha256", ""))
             and isinstance(row.get("columns"), list),
             "PROJECT_SNAPSHOT_INVALID", "Keep the original typed table inventory.")
        table_names.add(row["name"])
    source = manifest.get("source")
    member(source, "source/source.tgz")
    needed = {PRODUCT + name for name in REQUIRED_PRODUCT}
    if manifest.get("reservationState") is not None:
        needed.add(PRODUCT + "portable-reservation-bridge.mjs")
    needed |= {str(ARCHIVE_PATH.relative_to(SOURCE_ROOT)), str(UNPACK_PATH.relative_to(SOURCE_ROOT))}
    proof = source.get("requiredSource")
    need(isinstance(proof, list) and len(proof) == len(needed)
         and {row.get("path") for row in proof if isinstance(row, dict)} == needed,
         "PORTABLE_SOURCE_INCOMPLETE", "Keep the complete portable-capable source edition.")
    for row in proof:
        relative(row["path"])
        pin(row)
    need(manifest.get("engines") == {
        "archive": {"path": str(ARCHIVE_PATH.relative_to(SOURCE_ROOT)), "sha256": ARCHIVE_SHA},
        "source": {"path": str(UNPACK_PATH.relative_to(SOURCE_ROOT)), "sha256": UNPACK_SHA}},
        "PROJECT_ENGINE_CHANGED", "Use the original maintained archive and distribution readers.")
    inputs = manifest.get("inputFiles")
    need(isinstance(inputs, list), "PROJECT_INPUTS_INVALID", "Retain all original declared input files.")
    by_original = {}
    for row in inputs:
        name = member(row)
        path = str(absolute(row.get("originalPath")))
        need(path not in by_original and name in
             {input_member(absolute(path)), "configuration/merchant.json", "source/source.tgz"}
             and isinstance(row.get("roles"), list) and row["roles"]
             and all(isinstance(role, str) and role for role in row["roles"]),
             "PROJECT_INPUTS_INVALID", "Keep original input identities and their relative directory topology.")
        by_original[path] = row
    configuration = manifest.get("configuration")
    member(configuration, "configuration/merchant.json")
    need(configuration.get("originalPath") == original["configPath"]
         and original["configPath"] in by_original
         and pin(by_original[original["configPath"]]) == pin(configuration),
         "PROJECT_CONFIGURATION_INVALID", "Keep the exact original configuration bytes.")
    fulfillment = configuration.get("fulfillment")
    need(isinstance(fulfillment, dict) and fulfillment.get("kind") in ("file", "custom")
         and isinstance(fulfillment.get("manifests"), list)
         and isinstance(fulfillment.get("bindings"), list),
         "PROJECT_FULFILLMENT_INVALID", "Keep the declared original fulfillment source and editions.")
    module = fulfillment.get("module")
    member(module)
    need(module.get("originalPath") in by_original
         and by_original[module["originalPath"]]["path"] == module["path"],
         "PROJECT_FULFILLMENT_INVALID", "Keep the original declared handler module.")
    manifest_paths = set()
    for row in fulfillment["manifests"]:
        member(row)
        need(row.get("originalPath") in by_original and row["path"] not in manifest_paths,
             "PROJECT_FULFILLMENT_INVALID", "Keep the original delivery manifest inventory.")
        manifest_paths.add(row["path"])
    bindings = set()
    for row in fulfillment["bindings"]:
        need(isinstance(row, dict) and row.get("manifest") in manifest_paths
             and row.get("file") in inventory and row.get("originalPath") in by_original,
             "PROJECT_FULFILLMENT_INVALID", "Keep every original delivery edition and source manifest.")
        selected, binding = delivery_selection(row.get("entry"))
        need(row.get("binding") == binding and binding not in bindings
             and by_original[row["originalPath"]]["path"] == row["file"]
             and pin(inventory[row["file"]]) ==
             {"bytes": str(selected["bytes"]), "sha256": selected["sha256"]},
             "PROJECT_FULFILLMENT_INVALID", "Keep every distinct original frozen delivery binding.")
        bindings.add(binding)
    results = manifest.get("results")
    need(isinstance(results, list), "PROJECT_RESULTS_INVALID", "Keep the original snapshot result inventory.")
    result_names = set()
    for row in results:
        name = member(row)
        expected = result_metadata({"path": row.get("originalPath"), "bytes": int(pin(row)["bytes"]),
                                    "sha256": row["sha256"]}, directory, required=True)
        need(row.get("relativePath") == expected["relativePath"] and name == expected["path"]
             and row["originalPath"] not in result_names and isinstance(row.get("references"), list),
             "PROJECT_RESULTS_INVALID", "Keep the exact original result paths and references.")
        aliases = row.get("historicalPaths")
        need(isinstance(aliases, list) and all(isinstance(path, str) for path in aliases)
             and aliases == sorted(set(aliases)) and row["originalPath"] not in aliases,
             "PROJECT_RESULTS_INVALID", "Keep the original historical result-path aliases.")
        for path in aliases:
            absolute(path)
        result_names.add(row["originalPath"])
    origins = manifest.get("resultOrigins")
    if origins is not None:
        member(origins, "provenance/result-origins.json")
    request_row = inventory.get("provenance/export-request.json")
    need(request_row is not None and request_row["sha256"] == manifest["requestSha256"],
         "PROJECT_REQUEST_INVALID", "Retain the original complete export request.")
    expected_names = {row["path"] for row in inputs} | {row["path"] for row in results} | {
        "workspace/merchant.sqlite3", "source/source.tgz",
        "configuration/merchant.json", "provenance/export-request.json"}
    if origins is not None:
        expected_names.add(origins["path"])
    expected_names |= validate_result_state(manifest, inventory, member)
    need(set(inventory) == expected_names,
         "PROJECT_INVENTORY_INVALID", "Keep only the complete explicitly selected project members.")
    need(manifest.get("receiving") == {
        "defaultMode": "review", "changesBusinessState": False,
        "productionActivation": "original-application-configuration-and-recovery"},
        "PROJECT_RECEIVING_INVALID", "Open the original received project for offline review first.")
    return inventory, by_original


def inspect_project(request, normalized):
    engines()
    archive_path = absolute(request["archive"])
    with opened_regular(archive_path, maximum=policy.max_archive_bytes):
        observed = archive_engine.inspect({"archive": str(archive_path)}, policy=policy)
    need(observed["archive"]["sha256"] == request["archiveSha256"],
         "ARCHIVE_IDENTITY_CHANGED", "Select the exact complete original project archive.")
    validate_manifest(observed["manifest"])
    return {"schema": RESULT_SCHEMA, "action": "inspect", "operation": request["operation"],
            "state": "COMPLETE", "requestSha256": sha_bytes(encoded(normalized)), "reused": False,
            "archive": {"path": str(archive_path), **observed["archive"], "members": observed["members"]},
            "manifest": observed["manifest"], "manifestSha256": sha_bytes(encoded(observed["manifest"]))}


def settle_received(original, manifest):
    directories = {original}
    for row in manifest["files"]:
        target = original / row["path"]
        durable_file(target, row)
        current = target.parent
        while current != original:
            need(original in current.parents, "PROJECT_PATH_INVALID", "Keep original files beneath their received root.")
            directories.add(current)
            current = current.parent
    for directory in sorted(directories, key=lambda value: len(value.parts), reverse=True):
        private_directory(directory)
    sync_directory(original.parent)


def received_configuration(original, manifest, source_expected):
    configuration = manifest["configuration"]
    config = parse_json(read_bytes(original / configuration["path"], maximum=CHUNK), "original merchant configuration")
    need(isinstance(config, dict) and environment_references(config) == configuration["environmentReferences"],
         "PROJECT_CONFIGURATION_INVALID", "Keep the original environment reference names.")
    fulfillment = configuration["fulfillment"]
    module = fulfillment["module"]
    expected_module = resolve_input(absolute(manifest["original"]["configPath"]).parent, config.get("fulfillmentModule"))
    need(str(expected_module) == module["originalPath"],
         "PROJECT_HANDLER_CHANGED", "Keep the original configured handler source.")
    builtin = source_expected["source/" + PRODUCT + "fulfillment/file-delivery.mjs"]
    need((module["sha256"] == builtin[0] and module["bytes"] == str(builtin[1])) ==
         (fulfillment["kind"] == "file"),
         "PROJECT_HANDLER_CHANGED", "Keep the original handler implementation and receiving mode.")
    inputs = {row["originalPath"]: row for row in manifest["inputFiles"]}
    actual_bindings = set()
    manifest_values = {}
    for row in fulfillment["manifests"]:
        value = parse_json(read_bytes(original / row["path"], maximum=CHUNK), "original file-delivery manifest")
        need(isinstance(value, dict) and value.get("schema") == "stellar-forge.merchant-file-delivery.v1"
             and isinstance(value.get("files"), dict) and value["files"],
             "PROJECT_FULFILLMENT_INVALID", "Keep the complete original file-delivery manifest.")
        manifest_values[row["path"]] = (row, value)
        for binding, entry in value["files"].items():
            selected, actual = delivery_selection(entry)
            asset = str(resolve_input(absolute(row["originalPath"]).parent, entry.get("path")))
            need(binding == actual and asset in inputs
                 and pin(inputs[asset]) == {"bytes": str(selected["bytes"]), "sha256": selected["sha256"]},
                 "PROJECT_FULFILLMENT_INVALID", "Retain every original manifest entry and exact file.")
            actual_bindings.add(binding)
    need(actual_bindings == {row["binding"] for row in fulfillment["bindings"]},
         "PROJECT_FULFILLMENT_INVALID", "Retain all pinned editions across the original manifests.")
    for row in fulfillment["bindings"]:
        selected_manifest, value = manifest_values[row["manifest"]]
        need(value["files"].get(row["binding"]) == row["entry"]
             and str(resolve_input(absolute(selected_manifest["originalPath"]).parent, row["entry"]["path"])) ==
             row["originalPath"],
             "PROJECT_FULFILLMENT_INVALID", "Preserve the exact original binding entry and relative path.")
    if fulfillment["kind"] == "file":
        options = config.get("fulfillmentOptions")
        need(isinstance(options, dict) and isinstance(options.get("manifest"), str),
             "PROJECT_FULFILLMENT_INVALID", "Keep the configured file-delivery manifest.")
        main_manifest = str(resolve_input(absolute(manifest["original"]["configPath"]).parent, options["manifest"]))
        need(main_manifest in {row["originalPath"] for row in fulfillment["manifests"]}
             and config.get("fulfillmentBinding") in actual_bindings,
             "PROJECT_FULFILLMENT_INVALID", "Keep the configured original delivery binding.")
    return config


def source_mode(path, mode):
    need(mode in (0o644, 0o755), "SOURCE_MODE_INVALID", "Keep original distribution source file modes.")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(descriptor)
        named = path.lstat()
        need(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
             and (before.st_dev, before.st_ino) == (named.st_dev, named.st_ino),
             "SOURCE_TARGET_CHANGED", "Keep the original received source file inode.")
        if stat.S_IMODE(before.st_mode) != mode:
            need(before.st_nlink == 1, "SOURCE_TARGET_CHANGED", "Keep source mode changes on the owned single-link target.")
            os.fchmod(descriptor, mode)
        os.fsync(descriptor)
        after = os.fstat(descriptor)
        need((before.st_dev, before.st_ino, before.st_size) == (after.st_dev, after.st_ino, after.st_size)
             and stat.S_IMODE(after.st_mode) == mode,
             "SOURCE_TARGET_CHANGED", "Finish the exact original source file mode.")
    finally:
        os.close(descriptor)
    sync_directory(path.parent)


def materialize_source(runtime, expected, contents):
    source_root = private_directory(runtime / "source")
    package_root = private_directory(runtime / "package")
    inventory = []
    for name in sorted(expected):
        digest, size, mode = expected[name]
        if name.startswith("source/"):
            target = source_root / relative(name[len("source/"):])
        else:
            target = package_root / relative(name)
        body = contents[name]
        need(len(body) == size and sha_bytes(body) == digest,
             "SOURCE_ARCHIVE_CHANGED", "Keep only the maintained unpacker's verified original bytes.")
        write_bytes(target, body, mode=mode)
        source_mode(target, mode)
        inventory.append({"path": str(target.relative_to(runtime)), "bytes": str(size),
                          "sha256": digest, "mode": mode})
    return source_root, inventory


def materialize_inputs(original, runtime, manifest):
    paths = {}
    for row in manifest["inputFiles"]:
        if row["path"] in ("configuration/merchant.json", "source/source.tgz"):
            continue
        target = runtime / row["path"]
        copy_file(original / row["path"], target, row)
        paths[row["originalPath"]] = str(target)
    return paths


def materialize_configurations(runtime, source_root, config, manifest, input_paths):
    review = deepcopy(config)
    review["operatorTokenEnv"] = "MERCHANT_REVIEW_OPERATOR_TOKEN"
    review_path = runtime / "review-config.json"
    write_json(review_path, review)
    activation = deepcopy(config)
    fulfillment = manifest["configuration"]["fulfillment"]
    if fulfillment["kind"] == "file":
        relocated_manifest = {"schema": "stellar-forge.merchant-file-delivery.v1", "files": {}}
        for row in fulfillment["bindings"]:
            entry = deepcopy(row["entry"])
            entry["path"] = input_paths[row["originalPath"]]
            relocated_manifest["files"][row["binding"]] = entry
        manifest_path = runtime / "inputs/portable-delivery-files.json"
        write_json(manifest_path, relocated_manifest)
        activation["fulfillmentModule"] = str(source_root / PRODUCT / "fulfillment/file-delivery.mjs")
        options = deepcopy(config.get("fulfillmentOptions") or {})
        options["manifest"] = str(manifest_path)
        activation["fulfillmentOptions"] = options
        action = {"state": "CONFIGURATION_REVIEW_REQUIRED", "handler": "file",
                  "manifestPath": str(manifest_path),
                  "bindings": sorted(relocated_manifest["files"]),
                  "originalDeploymentMustBeStopped": True}
    else:
        original_module = fulfillment["module"]["originalPath"]
        need(original_module in input_paths, "PROJECT_HANDLER_MISSING", "Retain the original custom handler module.")
        activation["fulfillmentModule"] = input_paths[original_module]
        action = {"state": "CUSTOM_INPUT_BINDING_REQUIRED", "handler": "custom",
                  "modulePath": input_paths[original_module],
                  "inputs": [{"originalPath": row["originalPath"],
                              "path": input_paths[row["originalPath"]], **pin(row),
                              "roles": row["roles"]}
                             for row in manifest["inputFiles"] if row["originalPath"] in input_paths],
                  "originalDeploymentMustBeStopped": True}
    activation_path = runtime / "activation-config.json"
    write_json(activation_path, activation)
    return review_path, activation_path, action


def json_path_span(text, keys):
    decoder = json.JSONDecoder()
    length = len(text)

    def whitespace(at):
        while at < length and text[at] in " \t\r\n":
            at += 1
        return at

    def descend(at, remaining):
        at = whitespace(at)
        need(at < length and text[at] == "{", "RESULT_JSON_INVALID", "Keep the original result object.")
        at += 1
        while True:
            at = whitespace(at)
            need(at < length, "RESULT_JSON_INVALID", "Keep complete original result JSON.")
            if text[at] == "}":
                break
            key, ending = decoder.raw_decode(text, at)
            need(isinstance(key, str), "RESULT_JSON_INVALID", "Keep original result member names.")
            at = whitespace(ending)
            need(at < length and text[at] == ":", "RESULT_JSON_INVALID", "Keep the original result member separator.")
            start = whitespace(at + 1)
            value, ending = decoder.raw_decode(text, start)
            if key == remaining[0]:
                if len(remaining) == 1:
                    need(isinstance(value, str), "RESULT_JSON_INVALID", "Relocate only the original result path string.")
                    return start, ending, value
                return descend(start, remaining[1:])
            at = whitespace(ending)
            need(at < length and text[at] in ",}", "RESULT_JSON_INVALID", "Keep the complete result object.")
            if text[at] == "}":
                break
            at += 1
        raise PortableError("RESULT_JSON_INVALID", "The original current result path is missing.")
    need(keys, "RESULT_JSON_INVALID", "Select the exact current result storage path.")
    parse_json(text, "original result JSON")
    return descend(0, keys)


def relocation_plan(database, manifest, workspace):
    results = {row["originalPath"]: row for row in manifest["results"]}
    changes = []
    selections = (
        ("merchant_orders", "id", "data_json", ("result", "path")),
        ("merchant_fulfillments", "payment_id", "result_file_json", ("path",)),
    )
    for table, identifier, column, keys in selections:
        for rowid, identity, text in database.execute(
                "SELECT rowid," + sql_name(identifier) + "," + sql_name(column) +
                " FROM " + sql_name(table) + " ORDER BY rowid"):
            if text is None:
                continue
            value = parse_json(text, "current result metadata")
            if table == "merchant_orders" and value.get("result") is None:
                continue
            start, ending, original_path = json_path_span(text, keys)
            need(original_path in results, "RESULT_INVENTORY_MISSING", "Retain the snapshot's complete current result file.")
            target = str(workspace / results[original_path]["relativePath"])
            replacement = json.dumps(target, ensure_ascii=False, separators=(",", ":"))
            after = text[:start] + replacement + text[ending:]
            # Every other byte of JSON, including exact large numeric lexemes,
            # remains the original text; historical JSON is never rewritten.
            updated = parse_json(after, "relocated current result")
            original_value = deepcopy(value)
            selected = original_value
            for key in keys[:-1]:
                selected = selected[key]
            selected[keys[-1]] = target
            need(updated == original_value, "RESULT_RELOCATION_INVALID", "Change only the selected result storage path.")
            changes.append({"table": table, "rowid": str(rowid), "id": identity,
                            "column": column, "originalPath": original_path, "path": target,
                            "beforeSha256": sha_bytes(text.encode("utf-8")),
                            "afterSha256": sha_bytes(after.encode("utf-8"))})
    return changes


def change_values(row, original_database):
    table, column = row["table"], row["column"]
    need((table, column) in {("merchant_orders", "data_json"),
                           ("merchant_fulfillments", "result_file_json")},
         "RELOCATION_PLAN_CHANGED", "Use only the two original current result columns.")
    selected = original_database.execute("SELECT " + sql_name(column) + " FROM " + sql_name(table) +
                                         " WHERE rowid=?", (int(row["rowid"]),)).fetchone()
    need(selected is not None and isinstance(selected[0], str),
         "RELOCATION_PLAN_CHANGED", "Keep the original snapshot result row.")
    before = selected[0]
    keys = ("result", "path") if table == "merchant_orders" else ("path",)
    start, ending, original_path = json_path_span(before, keys)
    after = before[:start] + json.dumps(row["path"], ensure_ascii=False, separators=(",", ":")) + before[ending:]
    need(original_path == row["originalPath"]
         and sha_bytes(before.encode("utf-8")) == row["beforeSha256"]
         and sha_bytes(after.encode("utf-8")) == row["afterSha256"],
         "RELOCATION_PLAN_CHANGED", "Keep the exact original JSON and its sole path replacement.")
    return {"before": before, "after": after}


class OriginalResultValues:
    def __init__(self, changes, database):
        self.selected = {(row["table"], int(row["rowid"]), row["column"]): row for row in changes}
        self.database = database

    def get(self, key):
        row = self.selected.get(key)
        # Read one original JSON value at a time. Large retained receipt bodies
        # stay in SQLite, rather than being duplicated in a whole-project plan.
        return None if row is None else change_values(row, self.database)


def same_snapshot(summary, snapshot):
    return all(summary.get(key) == snapshot.get(key) for key in
               ("storeId", "schemaVersion", "applicationId", "createdAt",
                "schemaSha256", "allRowsSha256", "businessSha256", "tables", "orderStates"))


def apply_relocations(stage, changes, snapshot, original_path):
    with opened_regular(stage, private=True):
        pass
    original_db = connect_readonly(original_path)
    db = None
    try:
        db = sqlite3.connect(stage, timeout=5)
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA journal_mode=DELETE")
        db.execute("PRAGMA cache_size=-2048")
        db.execute("PRAGMA mmap_size=0")
        db.execute("PRAGMA foreign_keys=ON")
        store_identity(db, snapshot["storeId"])
        db.execute("BEGIN IMMEDIATE")
        try:
            for row in changes:
                table, column = row["table"], row["column"]
                need((table, column) in {("merchant_orders", "data_json"),
                                       ("merchant_fulfillments", "result_file_json")},
                     "RELOCATION_PLAN_CHANGED", "Relocate only the two original current result columns.")
                values = change_values(row, original_db)
                current = db.execute("SELECT " + sql_name(column) + " FROM " + sql_name(table) +
                                     " WHERE rowid=?", (int(row["rowid"]),)).fetchone()
                need(current is not None and current[0] in (values["before"], values["after"]),
                     "RELOCATION_PLAN_CHANGED", "Keep the exact selected original result record.")
                if current[0] == values["before"]:
                    changed = db.execute("UPDATE " + sql_name(table) + " SET " + sql_name(column) +
                                         "=? WHERE rowid=? AND " + sql_name(column) + "=?",
                                         (values["after"], int(row["rowid"]), values["before"]))
                    need(changed.rowcount == 1, "RELOCATION_PLAN_CHANGED", "Update the one selected original result path.")
            check_database(db)
            normalized = database_summary(db, originals=OriginalResultValues(changes, original_db))
            need(same_snapshot(normalized, snapshot),
                 "RELOCATED_ROWS_CHANGED", "Every original SQLite value must match apart from the recorded result paths.")
            current = database_summary(db)
            db.commit()
        except BaseException:
            db.rollback()
            raise
    finally:
        if db is not None:
            db.close()
        original_db.close()
    durable_file(stage)
    return normalized, current


def read_runtime_identity(path, expected, expected_inode):
    # An activated runtime can be writing through its own original lease.
    # Check only immutable identity here; do not hash a changing live database,
    # claim its lease, reclassify its runtime, or replace any of its rows.
    need(path.resolve() == path, "RUNTIME_PUBLICATION_CHANGED", "Keep the original runtime database path.")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(descriptor)
        named = path.lstat()
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
             and before.st_uid == os.getuid() and not before.st_mode & 0o077
             and (before.st_dev, before.st_ino) == (named.st_dev, named.st_ino)
             and {"device": str(before.st_dev), "number": str(before.st_ino)} == expected_inode,
             "RUNTIME_PUBLICATION_CHANGED", "Reopen the same private independent runtime inode.")
        db = connect_readonly(path)
        try:
            db.execute("BEGIN")
            identity = store_identity(db, expected["storeId"])
            need(all(identity.get(key) == expected.get(key) for key in
                     ("storeId", "schemaVersion", "applicationId", "createdAt")),
                 "RUNTIME_PUBLICATION_CHANGED", "Keep the original received merchant identity.")
            db.rollback()
        finally:
            db.close()
        after, named = os.fstat(descriptor), path.lstat()
        need(stat.S_ISREG(after.st_mode) and after.st_nlink == 1
             and after.st_uid == os.getuid() and not after.st_mode & 0o077
             and (after.st_dev, after.st_ino) == (before.st_dev, before.st_ino)
             and (named.st_dev, named.st_ino) == (before.st_dev, before.st_ino)
             and stat.S_ISREG(named.st_mode) and path.resolve() == path,
             "RUNTIME_PUBLICATION_CHANGED", "The independent runtime changed identity during its reopen.")
        return identity
    finally:
        os.close(descriptor)


def validate_runtime_preparation(prepared, control, workspace, request_sha, manifest, plan_raw):
    need(isinstance(prepared, dict)
         and prepared.get("schema") == "stellar-forge.merchant-portable-runtime-prepared.v1"
         and prepared.get("requestSha256") == request_sha
         and prepared.get("planSha256") == sha_bytes(plan_raw)
         and prepared.get("storeId") == manifest["original"]["storeId"]
         and prepared.get("path") == str(workspace / "merchant.sqlite3")
         and prepared.get("stage") == str(control / "runtime.sqlite3.partial")
         and prepared.get("originalRowsSha256") == manifest["snapshot"]["allRowsSha256"]
         and all(isinstance(prepared.get(key), str) and re.fullmatch(r"[0-9a-f]{64}", prepared[key])
                 for key in ("relocatedRowsSha256", "relocatedBusinessSha256")),
         "RUNTIME_PREPARATION_CHANGED", "Keep this operation's complete independent runtime preparation.")
    pin(prepared.get("file"))
    inode = prepared.get("inode")
    need(isinstance(inode, dict) and set(inode) == {"device", "number"}
         and all(isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]*", value) for value in inode.values()),
         "RUNTIME_PREPARATION_CHANGED", "Keep the original prepared runtime inode.")


def validate_runtime_publication(published, prepared, request_sha, changes):
    need(isinstance(published, dict)
         and published.get("schema") == "stellar-forge.merchant-portable-runtime-published.v1"
         and published.get("requestSha256") == request_sha
         and published.get("preparedSha256") == sha_bytes(encoded(prepared))
         and published.get("storeId") == prepared["storeId"] and published.get("path") == prepared["path"]
         and published.get("inode") == prepared["inode"]
         and published.get("originalRowsSha256") == prepared["originalRowsSha256"]
         and published.get("initialRelocatedRowsSha256") == prepared["relocatedRowsSha256"]
         and published.get("pathRelocations") == str(len(changes))
         and isinstance(published.get("observedRowsSha256"), str)
         and re.fullmatch(r"[0-9a-f]{64}", published["observedRowsSha256"]),
         "RUNTIME_PUBLICATION_CHANGED", "Keep the complete original runtime publication.")


def prepare_runtime_database(control, original, workspace, request_sha, manifest, changes):
    stage = control / "runtime.sqlite3.partial"
    target = workspace / "merchant.sqlite3"
    prepared_path = control / "runtime-prepared.json"
    published_path = control / "runtime-published.json"
    plan = {"operation": manifest["operation"], "requestSha256": request_sha,
            "originalSnapshot": pin(manifest["snapshot"]), "storeId": manifest["original"]["storeId"],
            "workspace": str(workspace), "changes": changes}
    plan_raw = encoded(plan)
    write_bytes(control / "relocation-plan.json", plan_raw)
    prepared = read_json(prepared_path, optional=True)
    published = read_json(published_path, optional=True)
    need(published is None or prepared is not None, "RUNTIME_PUBLICATION_CHANGED",
         "Retain the original preparation behind the published runtime.")
    if prepared is None:
        need(not target.exists(), "RUNTIME_ALREADY_PRESENT",
             "Preserve an existing runtime until its original receiving publication is reconciled.")
        if not stage.exists():
            copy_file(original / "workspace/merchant.sqlite3", stage, manifest["snapshot"])
        normalized, current = apply_relocations(stage, changes, manifest["snapshot"], original / "workspace/merchant.sqlite3")
        stage_info = stage.lstat()
        prepared = {"schema": "stellar-forge.merchant-portable-runtime-prepared.v1",
                    "requestSha256": request_sha, "storeId": manifest["original"]["storeId"],
                    "planSha256": sha_bytes(plan_raw), "path": str(target),
                    "stage": str(stage), "file": file_hash(stage),
                    "inode": {"device": str(stage_info.st_dev), "number": str(stage_info.st_ino)},
                    "originalRowsSha256": normalized["allRowsSha256"],
                    "relocatedRowsSha256": current["allRowsSha256"],
                    "relocatedBusinessSha256": current["businessSha256"], "preparedAt": now()}
        write_json(prepared_path, prepared)
    validate_runtime_preparation(prepared, control, workspace, request_sha, manifest, plan_raw)
    expected_inode = prepared["inode"]
    if published is not None:
        validate_runtime_publication(published, prepared, request_sha, changes)
        read_runtime_identity(target, manifest["original"], expected_inode)
        return published
    if not target.exists():
        need(stage.exists() and file_hash(stage) == pin(prepared["file"]),
             "RUNTIME_STAGE_MISSING", "Retain the exact prepared independent runtime database.")
        info = stage.lstat()
        need({"device": str(info.st_dev), "number": str(info.st_ino)} == expected_inode and info.st_nlink == 1,
             "RUNTIME_STAGE_CHANGED", "Keep the same prepared original runtime inode.")
        durable_file(stage, prepared["file"])
        os.link(stage, target, follow_symlinks=False)
        sync_directory(target.parent)
    target_info = target.lstat()
    need(stat.S_ISREG(target_info.st_mode) and not stat.S_ISLNK(target_info.st_mode)
         and {"device": str(target_info.st_dev), "number": str(target_info.st_ino)} == expected_inode,
         "RUNTIME_PUBLICATION_CHANGED", "Reconcile the same published runtime without replacing it.")
    if stage.exists():
        staged = stage.lstat()
        need((staged.st_dev, staged.st_ino) == (target_info.st_dev, target_info.st_ino)
             and staged.st_nlink == 2 and target_info.st_nlink == 2,
             "RUNTIME_STAGE_CHANGED", "Only the original published runtime hard-link stage may be retired.")
        with opened_regular(target) as (fd, _info):
            os.fsync(fd)
        sync_directory(target.parent)
        stage.unlink()
        sync_directory(stage.parent)
    need(target.lstat().st_nlink == 1, "RUNTIME_PUBLICATION_CHANGED", "Keep the independent runtime's single original inode.")
    current_db = connect_readonly(target)
    try:
        store_identity(current_db, manifest["original"]["storeId"])
        check_database(current_db)
        current_summary = database_summary(current_db)
    finally:
        current_db.close()
    durable_file(target)
    publication = {"schema": "stellar-forge.merchant-portable-runtime-published.v1",
                   "requestSha256": request_sha, "preparedSha256": sha_bytes(encoded(prepared)),
                   "storeId": prepared["storeId"], "path": str(target), "inode": expected_inode,
                   "originalRowsSha256": prepared["originalRowsSha256"],
                   "initialRelocatedRowsSha256": prepared["relocatedRowsSha256"],
                   "observedRowsSha256": current_summary["allRowsSha256"],
                   "runtimeProgressPreserved": current_summary["allRowsSha256"] != prepared["relocatedRowsSha256"],
                   "pathRelocations": str(len(changes)), "publishedAt": now()}
    write_json(published_path, publication)
    return publication


def reopen_received_complete(destination, complete, request, request_sha, manifest, manifest_sha):
    original, runtime = destination / "original", destination / "runtime"
    workspace, control = runtime / "workspace", destination / "control"
    received = complete.get("received")
    paths = {"sourceDirectory": str(runtime / "source"), "workspaceDirectory": str(workspace),
             "sourceArchive": str(runtime / "source.tgz"),
             "reviewConfigPath": str(runtime / "review-config.json"),
             "activationConfigPath": str(runtime / "activation-config.json"),
             "receiptPath": str(control / "result.json"), "originalDirectory": str(original)}
    need(isinstance(received, dict) and all(received.get(key) == value for key, value in paths.items())
         and received.get("mode") == "review"
         and received.get("storeId") == manifest["original"]["storeId"]
         and received.get("originalRowsSha256") == manifest["snapshot"]["allRowsSha256"]
         and received.get("sourceSha256") == manifest["source"]["sha256"],
         "RECEIVED_PROJECT_CHANGED", "Reopen the same original project and its recorded opening paths.")
    # These are immutable retained inputs. Reopen every original selected file,
    # but never regenerate a missing runtime or overwrite operator configuration.
    for path in (original, runtime, workspace, runtime / "source"):
        need(path.exists(), "RECEIVED_PROJECT_MISSING", "Keep the complete received project: " + str(path))
        private_directory(path)
    settle_received(original, manifest)
    verify_original_result_state(original, manifest)
    reopen_result_state(control, workspace, manifest, request_sha, received)
    durable_file(runtime / "source.tgz", manifest["source"], maximum=64 * CHUNK)
    source_record = received.get("sourceInstallation")
    need(isinstance(source_record, dict) and source_record.get("path") == str(control / "source-installation.json"),
         "RECEIVED_SOURCE_CHANGED", "Keep the original received source installation record.")
    source_raw = read_bytes(control / "source-installation.json", private=True, maximum=32 * CHUNK)
    need({"bytes": str(len(source_raw)), "sha256": sha_bytes(source_raw)} == pin(source_record),
         "RECEIVED_SOURCE_CHANGED", "The full received source inventory changed.")
    source = parse_json(source_raw, "received source installation")
    need(source.get("requestSha256") == request_sha and source.get("source") == manifest["source"]
         and source.get("sourceArchive") == {"path": "source.tgz", **pin(manifest["source"])}
         and isinstance(source.get("files"), list)
         and received.get("sourceFiles") == str(len(source["files"])),
         "RECEIVED_SOURCE_CHANGED", "Keep the same complete source and distribution archive.")
    selected = {}
    for row in source["files"]:
        need(isinstance(row, dict), "RECEIVED_SOURCE_CHANGED", "Keep the full original source inventory.")
        name = relative(row.get("path"))
        need(name.startswith(("source/", "package/")) and name not in selected and row.get("mode") in (0o644, 0o755),
             "RECEIVED_SOURCE_CHANGED", "Keep the original source paths and modes.")
        target = runtime / name
        durable_file(target, row, maximum=4 * CHUNK)
        need(stat.S_IMODE(target.lstat().st_mode) == row["mode"],
             "RECEIVED_SOURCE_CHANGED", "Keep the original received source mode.")
        selected[name] = row
    for row in manifest["source"]["requiredSource"]:
        need("source/" + row["path"] in selected
             and pin(selected["source/" + row["path"]]) == pin(row),
             "RECEIVED_SOURCE_CHANGED", "Keep the complete original portable application edition.")
    config = parse_json(read_bytes(original / manifest["configuration"]["path"], private=True, maximum=CHUNK),
                        "original merchant configuration")
    review = deepcopy(config)
    review["operatorTokenEnv"] = "MERCHANT_REVIEW_OPERATOR_TOKEN"
    review_raw = encoded(review)
    durable_file(runtime / "review-config.json", {"bytes": str(len(review_raw)), "sha256": sha_bytes(review_raw)})
    # Production activation may have been explicitly configured after receiving.
    # Its existing valid private JSON remains exactly as that operator left it.
    activation = parse_json(read_bytes(runtime / "activation-config.json", private=True, maximum=CHUNK),
                            "received activation configuration")
    need(isinstance(activation, dict), "RECEIVED_CONFIGURATION_CHANGED", "Keep the received activation configuration.")
    for row in manifest["inputFiles"]:
        if row["path"] not in ("configuration/merchant.json", "source/source.tgz"):
            durable_file(runtime / row["path"], row)
    for row in manifest["results"]:
        durable_file(workspace / row["relativePath"], row)
    origins_raw = encoded(received_result_origins(manifest, workspace, request, manifest_sha))
    durable_file(workspace / "portable-result-origins.json",
                 {"bytes": str(len(origins_raw)), "sha256": sha_bytes(origins_raw)})
    plan_raw = read_bytes(control / "relocation-plan.json", private=True, maximum=32 * CHUNK)
    plan = parse_json(plan_raw, "original runtime relocation plan")
    need(isinstance(plan, dict) and plan.get("operation") == manifest["operation"]
         and plan.get("requestSha256") == request_sha and plan.get("originalSnapshot") == pin(manifest["snapshot"])
         and plan.get("storeId") == manifest["original"]["storeId"] and plan.get("workspace") == str(workspace)
         and isinstance(plan.get("changes"), list),
         "RUNTIME_PREPARATION_CHANGED", "Keep the original independent result-path relocation plan.")
    prepared = read_json(control / "runtime-prepared.json")
    published = read_json(control / "runtime-published.json")
    validate_runtime_preparation(prepared, control, workspace, request_sha, manifest, plan_raw)
    validate_runtime_publication(published, prepared, request_sha, plan["changes"])
    need(received.get("runtimePublication") == published,
         "RUNTIME_PUBLICATION_CHANGED", "Keep the same saved independent runtime publication.")
    with opened_regular(workspace / "merchant-owner.lock", private=True):
        pass
    read_runtime_identity(workspace / "merchant.sqlite3", manifest["original"], prepared["inode"])
    return {**complete, "reused": True}


def receive_project(request, normalized):
    inspected = inspect_project(request, normalized)
    manifest = inspected["manifest"]
    destination = absolute(request["destination"])
    original_workspace = absolute(manifest["original"]["directory"])
    need(destination != original_workspace and original_workspace not in destination.parents,
         "RECEIVE_DESTINATION", "Receive an independent project outside the original merchant workspace.")
    destination = private_directory(destination)
    control = private_directory(destination / "control")
    request_raw = encoded(normalized)
    request_sha = sha_bytes(request_raw)
    result_path = control / "result.json"
    with lock_file(control / "receive.lock", create=True):
        write_bytes(control / "request.json", request_raw)
        complete = read_json(result_path, optional=True, maximum=64 * CHUNK)
        if complete is not None:
            need(complete.get("schema") == RESULT_SCHEMA and complete.get("action") == "receive"
                 and complete.get("operation") == request["operation"]
                 and complete.get("state") == "COMPLETE" and complete.get("requestSha256") == request_sha
                 and complete.get("manifestSha256") == inspected["manifestSha256"]
                 and complete.get("manifest") == manifest and complete.get("archive") == inspected["archive"],
                 "RECEIVE_REQUEST_CHANGED", "Reuse the same completed original project receiving.")
            return reopen_received_complete(destination, complete, request, request_sha,
                                             manifest, inspected["manifestSha256"])
        original = private_directory(destination / "original")
        extraction = archive_engine.extract({"archive": request["archive"], "destination": str(original)}, policy=policy)
        need(extraction["archive"] == archive_pin(inspected["archive"]) and extraction["manifest"] == manifest,
             "PROJECT_EXTRACTION_CHANGED", "Retain the exact inspected original project.")
        settle_received(original, manifest)
        verify_original_result_state(original, manifest)
        export_request = parse_json(read_bytes(original / "provenance/export-request.json"), "original export request")
        validate_request(export_request)
        need(export_request.get("action") == "export" and export_request["operation"] == manifest["operation"]
             and export_request["directory"] == manifest["original"]["directory"]
             and export_request["config"] == manifest["original"]["configPath"]
             and export_request["sourceSha256"] == manifest["source"]["sha256"]
             and sha_bytes(encoded(export_request)) == manifest["requestSha256"],
             "PROJECT_REQUEST_CHANGED", "Keep the complete original export input selection.")
        source, source_parts = selected_source(original / manifest["source"]["path"],
                                               manifest["source"]["sha256"], match_current=False,
                                               reservation_state=manifest.get("reservationState") is not None)
        need({**source, "path": manifest["source"]["path"]} == manifest["source"],
             "SOURCE_ARCHIVE_CHANGED", "Keep the full originally selected portable source edition.")
        _source_manifest, expected, contents = source_parts
        config = received_configuration(original, manifest, expected)
        original_db = connect_readonly(original / "workspace/merchant.sqlite3")
        runtime = private_directory(destination / "runtime")
        workspace = private_directory(runtime / "workspace")
        try:
            check_database(original_db)
            summary = database_summary(original_db)
            need(same_snapshot(summary, manifest["snapshot"]),
                 "PROJECT_SNAPSHOT_CHANGED", "Verify every original table, row and retained binary value.")
            origins = {}
            if manifest.get("resultOrigins") is not None:
                origins_pin, origins = read_result_origins(
                    original / manifest["resultOrigins"]["path"], original_workspace, manifest["original"]["storeId"])
                need(origins_pin == pin(manifest["resultOrigins"]), "RESULT_ORIGINS_CHANGED",
                     "Keep the exact result origins captured by this snapshot.")
            actual_results = snapshot_results(original_db, original_workspace, manifest["configuration"], origins)
            need(actual_results == manifest["results"],
                 "PROJECT_RESULTS_CHANGED", "Verify every original snapshot result and historical reference.")
            changes = relocation_plan(original_db, manifest, workspace)
        finally:
            original_db.close()
        with lock_file(workspace / "merchant-owner.lock", create=True):
            source_root, source_inventory = materialize_source(runtime, expected, contents)
            del contents, source_parts
            source_archive = runtime / "source.tgz"
            copy_file(original / manifest["source"]["path"], source_archive, manifest["source"])
            input_paths = materialize_inputs(original, runtime, manifest)
            review_path, activation_path, activation = materialize_configurations(
                runtime, source_root, config, manifest, input_paths)
            result_state_publication = materialize_result_state(original, runtime, control, manifest, request_sha)
            if result_state_publication is None:
                for row in manifest["results"]:
                    copy_file(original / row["path"], workspace / row["relativePath"], row)
            write_json(workspace / "portable-result-origins.json",
                       received_result_origins(manifest, workspace, request, inspected["manifestSha256"]))
            publication = prepare_runtime_database(control, original, workspace, request_sha, manifest, changes)
        source_installation = {"requestSha256": request_sha, "source": manifest["source"],
                               "sourceArchive": {"path": "source.tgz", **pin(manifest["source"])},
                               "files": source_inventory}
        source_installation_raw = encoded(source_installation)
        source_installation_path = control / "source-installation.json"
        write_bytes(source_installation_path, source_installation_raw)
        received = {
            "sourceDirectory": str(source_root), "workspaceDirectory": str(workspace),
            "sourceArchive": str(source_archive), "sourceSha256": manifest["source"]["sha256"],
            "sourceInstallation": {"path": str(source_installation_path),
                                   "bytes": str(len(source_installation_raw)), "sha256": sha_bytes(source_installation_raw)},
            "reviewConfigPath": str(review_path), "activationConfigPath": str(activation_path),
            "receiptPath": str(result_path), "originalDirectory": str(original),
            "mode": "review", "activation": activation, "storeId": manifest["original"]["storeId"],
            "originalRowsSha256": manifest["snapshot"]["allRowsSha256"],
            "runtimePublication": publication, "sourceFiles": str(len(source_inventory)),
            **({"resultStatePublication": result_state_publication} if result_state_publication is not None else {})}
        complete = {"schema": RESULT_SCHEMA, "action": "receive", "operation": request["operation"],
                    "state": "COMPLETE", "requestSha256": request_sha, "reused": False,
                    "archive": inspected["archive"], "manifest": manifest,
                    "manifestSha256": inspected["manifestSha256"],
                    "receiptPath": str(result_path), "received": received}
        write_json(result_path, complete)
        return complete


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, help="Original request JSON file, or - for standard input.")
    args = parser.parse_args()
    try:
        if args.request == "-":
            raw = sys.stdin.buffer.read(MAX_JSON + 1)
            need(len(raw) <= MAX_JSON, "REQUEST_TOO_LARGE", "Keep a bounded original portable request.")
        else:
            raw = read_bytes(absolute(args.request), maximum=MAX_JSON, private=True)
        request = parse_json(raw, "merchant portable request")
        normalized = validate_request(request)
        if request["action"] == "export":
            result = export_project(request, normalized)
        elif request["action"] == "inspect":
            result = inspect_project(request, normalized)
        else:
            result = receive_project(request, normalized)
        sys.stdout.write(encoded(result).decode("utf-8"))
        sys.stdout.flush()
        return 0
    except Exception as error:
        value = {"schema": RESULT_SCHEMA, "state": "ERROR",
                 "error": {"code": getattr(error, "code", "PORTABLE_OPERATION_FAILED"),
                           "type": type(error).__name__, "message": str(error)}}
        if isinstance(error, PortableError) and error.details is not None:
            value["error"]["details"] = error.details
        sys.stderr.write(encoded(value).decode("utf-8"))
        sys.stderr.flush()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
