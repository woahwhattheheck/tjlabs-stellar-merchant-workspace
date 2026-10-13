"""Owned source and whole-archive I/O for partner workbench installations."""
from __future__ import annotations
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import uuid
import zipfile

MAX_SOURCE_FILE = 16 * 1024 * 1024
MAX_SOURCE_BYTES = 128 * 1024 * 1024
MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 100000


class WorkbenchError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def need(value, code, message):
    if not value:
        raise WorkbenchError(code, message)


def exact(value, allowed, required=()):
    need(isinstance(value, dict) and set(value) <= set(allowed) and set(required) <= set(value),
         "invalid_fields", "Use every required field and only the declared fields.")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()


def decode(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            need(key not in out, "duplicate_json_key", "The selected JSON document repeats a key.")
            out[key] = value
        return out
    def invalid(value):
        raise WorkbenchError("invalid_json_number", "Use finite JSON numbers.")
    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=invalid)


def identifier(value):
    need(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}", value),
         "invalid_operation_id", "Retain the original operation identifier.")
    return value


def relative(value):
    need(isinstance(value, str) and value and "\\" not in value and "\x00" not in value,
         "invalid_relative_path", "Select an ordinary relative source path.")
    path = PurePosixPath(value)
    need(not path.is_absolute() and str(path) == value and all(x not in (".", "..", "") for x in path.parts),
         "invalid_relative_path", "Keep every source path inside its selected root.")
    return value


def absolute(value):
    need(isinstance(value, (str, Path)) and str(value) and not any(x in str(value) for x in ("\x00", "\r", "\n")),
         "invalid_path", "Select the complete original host path.")
    path = Path(value)
    need(path.is_absolute() and path == Path(os.path.normpath(path)),
         "invalid_path", "Use an absolute normalized host path.")
    return path


def no_links(path):
    path = absolute(path)
    for item in reversed((path, *path.parents)):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        need(not stat.S_ISLNK(info.st_mode), "source_link", "A selected original path is a symbolic link.")
    return path


def directory(path, *, create=False, private=False, empty=False):
    path = no_links(path)
    if create:
        missing = []
        parent = path
        while not parent.exists():
            missing.append(parent)
            parent = parent.parent
        for item in reversed(missing):
            try:
                item.mkdir(mode=0o700)
            except FileExistsError:
                pass
        no_links(path)
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode), "invalid_directory", "Select an ordinary source directory.")
    if private:
        need(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) & 0o077 == 0,
             "private_directory_required", "Use an owned private installation directory.")
    if empty:
        need(not any(path.iterdir()), "directory_not_empty", "Select a new empty receiving directory.")
    return path


def file_identity(path, maximum=MAX_ARCHIVE_BYTES):
    path = no_links(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= maximum,
             "invalid_source_file", "Select a complete regular source file within the declared size limit.")
        value = hashlib.sha256()
        size = 0
        with os.fdopen(os.dup(fd), "rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                size += len(block)
                need(size <= maximum, "source_file_limit", "The selected file exceeds its original size limit.")
                value.update(block)
        after = os.fstat(fd)
        named = path.lstat()
        keys = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        need(all(getattr(before, k) == getattr(after, k) for k in keys) and
             stat.S_ISREG(named.st_mode) and named.st_dev == before.st_dev and named.st_ino == before.st_ino and
             named.st_mtime_ns == before.st_mtime_ns and size == before.st_size,
             "source_changed", "The selected original file changed while it was being received.")
        return {"path": str(path), "bytes": size, "sha256": value.hexdigest(),
                "device": str(before.st_dev), "inode": str(before.st_ino)}
    finally:
        os.close(fd)


def read(path, maximum=MAX_SOURCE_FILE):
    identity = file_identity(path, maximum)
    raw = Path(path).read_bytes()
    need(len(raw) == identity["bytes"] and digest(raw) == identity["sha256"],
         "source_changed", "The selected original bytes changed during the read.")
    return raw


def read_json(path, maximum=MAX_SOURCE_FILE):
    return decode(read(path, maximum))


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic(path, raw):
    path = absolute(path)
    directory(path.parent, create=True, private=True)
    no_links(path)
    fd, name = tempfile.mkstemp(prefix=".partner-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        sync_directory(path.parent)
    finally:
        Path(name).unlink(missing_ok=True)


def save(path, value):
    atomic(path, encoded(value))


def once(path, raw):
    path = absolute(path)
    try:
        existing = read(path, max(MAX_SOURCE_FILE, len(raw)))
    except FileNotFoundError:
        directory(path.parent, create=True, private=True)
        fd, name = tempfile.mkstemp(prefix=".partner-", dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(raw); stream.flush(); os.fsync(stream.fileno())
            try:
                os.link(name, path)
            except FileExistsError:
                need(read(path, max(MAX_SOURCE_FILE, len(raw))) == raw, "retained_output_changed",
                     "An existing output belongs to another complete source selection.")
            sync_directory(path.parent)
        finally:
            Path(name).unlink(missing_ok=True)
    else:
        need(existing == raw, "retained_output_changed", "Keep the existing original output unchanged.")
    return file_identity(path)


def copy_file(source, target, expected=None):
    source = absolute(source); target = absolute(target)
    identity = file_identity(source)
    if expected:
        need(identity["bytes"] == expected["bytes"] and identity["sha256"] == expected["sha256"],
             "source_changed", "A selected complete source member differs from its original manifest.")
    if target.exists():
        current = file_identity(target)
        need(current["bytes"] == identity["bytes"] and current["sha256"] == identity["sha256"],
             "retained_output_changed", "The existing received member has different original bytes.")
        return current
    directory(target.parent, create=True, private=True)
    fd, temporary = tempfile.mkstemp(prefix=".partner-copy-", dir=target.parent)
    try:
        with source.open("rb") as src, os.fdopen(fd, "wb") as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024); dst.flush(); os.fsync(dst.fileno())
        copied = file_identity(temporary)
        need(copied["bytes"] == identity["bytes"] and copied["sha256"] == identity["sha256"],
             "source_changed", "The source changed while its complete copy was written.")
        try:
            os.link(temporary, target)
        except FileExistsError:
            existing = file_identity(target)
            need(existing["bytes"] == identity["bytes"] and existing["sha256"] == identity["sha256"],
                 "retained_output_changed", "A concurrent receive selected different bytes.")
        sync_directory(target.parent)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return file_identity(target)


@contextlib.contextmanager
def locked(path, *, shared=False, wait=False):
    path = absolute(path)
    directory(path.parent, create=True, private=True)
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        mode = fcntl.LOCK_SH if shared else fcntl.LOCK_EX
        try:
            fcntl.flock(fd, mode | (0 if wait else fcntl.LOCK_NB))
        except BlockingIOError:
            raise WorkbenchError("original_operation_running", "The original installation or service still owns this operation.")
        yield fd
    finally:
        os.close(fd)


def inventory(root, *, skip=(), maximum=MAX_ARCHIVE_BYTES):
    root = directory(root)
    rows = []
    total = 0
    for base, dirs, names in os.walk(root, followlinks=False):
        dirs.sort(); names.sort()
        for name in list(dirs):
            path = Path(base) / name
            rel = path.relative_to(root).as_posix()
            if rel in skip:
                dirs.remove(name)
            else:
                need(not path.is_symlink(), "source_link", "The selected full source contains a directory link.")
        for name in names:
            path = Path(base) / name
            rel = path.relative_to(root).as_posix()
            if rel in skip:
                continue
            item = file_identity(path, maximum)
            total += item["bytes"]
            need(total <= maximum, "source_total_limit", "The whole selected source exceeds its declared limit.")
            rows.append({"path": rel, "bytes": item["bytes"], "sha256": item["sha256"]})
    return rows


def zip_index(archive, *, maximum=MAX_ARCHIVE_BYTES):
    infos = archive.infolist()
    need(len(infos) <= MAX_ARCHIVE_MEMBERS, "archive_member_limit", "The complete archive has too many members.")
    names = set(); total = 0
    for info in infos:
        name = info.filename.rstrip("/") if info.is_dir() else info.filename
        relative(name)
        need(name not in names, "archive_duplicate", "The archive repeats an original path.")
        names.add(name)
        mode = stat.S_IFMT(info.external_attr >> 16)
        need(mode in (0, stat.S_IFREG, stat.S_IFDIR) and
             (mode in (0, stat.S_IFDIR) if info.is_dir() else mode in (0, stat.S_IFREG)),
             "archive_special_member", "The complete archive must contain ordinary files and directories.")
        need(not info.flag_bits & 1, "archive_encrypted", "Receive the original ordinary unencrypted archive.")
        total += info.file_size
        need(total <= maximum, "archive_size_limit", "The expanded complete archive exceeds its declared limit.")
    return infos


def verify_zip(archive_path, index_name="FILES.json", *, schema=None):
    with zipfile.ZipFile(archive_path) as archive:
        infos = zip_index(archive)
        index = decode(archive.read(index_name))
        if schema:
            need(index.get("schema") == schema, "archive_schema", "Select the complete original package schema.")
        rows = index.get("files")
        need(isinstance(rows, list), "archive_manifest", "The complete package has no original file manifest.")
        named = {item.filename for item in infos if not item.is_dir()}
        selected = set()
        for row in rows:
            exact(row, ("path", "bytes", "sha256"), ("path", "bytes", "sha256"))
            name = relative(row["path"])
            need(name != index_name and name not in selected and name in named and
                 isinstance(row["bytes"], int) and row["bytes"] >= 0 and
                 re.fullmatch(r"[a-f0-9]{64}", str(row["sha256"])),
                 "archive_manifest", "An original package manifest entry is invalid.")
            selected.add(name)
            value = hashlib.sha256(); size = 0
            with archive.open(name) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    value.update(block); size += len(block)
            need(size == row["bytes"] and value.hexdigest() == row["sha256"],
                 "archive_changed", "A complete archived source member differs from its original manifest.")
        need(selected | {index_name} == named, "archive_members_changed", "The package contains an unindexed member.")
        return index


def extract_zip(archive_path, target, *, allowed=None):
    target = directory(target, create=True, private=True)
    with zipfile.ZipFile(archive_path) as archive:
        infos = zip_index(archive)
        for info in infos:
            name = info.filename.rstrip("/") if info.is_dir() else info.filename
            if allowed is not None and name not in allowed:
                continue
            destination = target / relative(name)
            if info.is_dir():
                directory(destination, create=True, private=True)
                continue
            directory(destination.parent, create=True, private=True)
            if destination.exists():
                current = file_identity(destination)
                with archive.open(info) as src:
                    value = hashlib.sha256()
                    for block in iter(lambda: src.read(1024 * 1024), b""):
                        value.update(block)
                need(current["bytes"] == info.file_size and current["sha256"] == value.hexdigest(),
                     "received_member_changed", "Preserve the different existing member before receiving this original.")
                continue
            fd, name_tmp = tempfile.mkstemp(prefix=".partner-unzip-", dir=destination.parent)
            try:
                with archive.open(info) as src, os.fdopen(fd, "wb") as out:
                    shutil.copyfileobj(src, out, 1024 * 1024); out.flush(); os.fsync(out.fileno())
                try:
                    os.link(name_tmp, destination)
                except FileExistsError:
                    need(file_identity(name_tmp)["sha256"] == file_identity(destination)["sha256"],
                         "received_member_changed", "A concurrent receive selected different member bytes.")
                sync_directory(destination.parent)
            finally:
                Path(name_tmp).unlink(missing_ok=True)
    return target


def write_zip(output, root, rows, header):
    output = absolute(output); root = directory(root)
    index = {**header, "files": rows}
    with tempfile.NamedTemporaryFile(prefix=".partner-archive-", suffix=".zip",
                                     dir=directory(output.parent, create=True, private=True), delete=False) as tmp:
        name = Path(tmp.name)
    try:
        with zipfile.ZipFile(name, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for row in rows:
                source = root / relative(row["path"])
                check = file_identity(source)
                need(check["bytes"] == row["bytes"] and check["sha256"] == row["sha256"],
                     "archive_source_changed", "The original source changed during complete archive preparation.")
                archive.write(source, row["path"])
            archive.writestr("FILES.json", encoded(index))
        with name.open("rb") as stream:
            os.fsync(stream.fileno())
        verify_zip(name, schema=header["schema"])
        copy_file(name, output)
        return file_identity(output)
    finally:
        name.unlink(missing_ok=True)
