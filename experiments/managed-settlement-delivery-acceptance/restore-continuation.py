#!/usr/bin/env python3
"""Restore the exact saved merchant-delivery output; never execute its contents."""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import PurePosixPath
import re
import stat
import sys
import uuid
import zipfile

FORMAT = "merchant-delivery-continuation/v2"
OPERATION = "SCF-MANAGED-SF98-DELIVERY-E49D-20261012"
HELPERS = {
    "RESTORE.py": "experiments/managed-settlement-delivery-acceptance/restore-continuation.py",
    "RESTORE.md": "experiments/managed-settlement-delivery-acceptance/RESTORING.md",
}
KINDS = {"file": stat.S_IFREG, "directory": stat.S_IFDIR, "symlink": stat.S_IFLNK}
EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW
CHUNK = 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def stable(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns,
            info.st_ctime_ns, info.st_mode)


def pairs(items):
    value = {}
    for key, item in items:
        require(key not in value, "Duplicate JSON field: " + key)
        value[key] = item
    return value


def absolute(value):
    require(isinstance(value, str) and value.startswith("/") and not value.startswith("//") and value != "/",
            "Use the exact original absolute output path")
    require("\x00" not in value and "\\" not in value
            and str(PurePosixPath(value)) == value
            and all(part not in (".", "..") for part in value.split("/")[1:]),
            "The original output must be a canonical absolute Linux path")
    return value


def within(root, path):
    return path == root or path.startswith(root + "/")


def destination(output, path):
    return output if path == "output" else output + path[len("output"):]


def hash_stream(handle):
    checksum, size = hashlib.sha256(), 0
    while True:
        raw = handle.read(CHUNK)
        if not raw:
            return size, checksum.hexdigest()
        checksum.update(raw)
        size += len(raw)


def small_member(archive, name, limit):
    info = archive.getinfo(name)
    require(not info.flag_bits & 1 and info.file_size <= limit,
            "Encrypted or oversized metadata member: " + name)
    require(stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFREG),
            "Metadata must be a regular ZIP member: " + name)
    raw = archive.read(info)
    require(len(raw) == info.file_size, "Metadata length changed: " + name)
    return raw


def link_target(output, row):
    scope = output + "/installation-receiving"
    path = destination(output, row["path"])
    target = row["target"]
    require(isinstance(target, str) and target and "\x00" not in target,
            "A retained link has no literal target")
    result = os.path.normpath(target if target.startswith("/")
                              else os.path.join(os.path.dirname(path), target))
    require(within(scope, result), "A retained link escapes the owned installation: " + row["path"])
    return result


def validate_links(output, rows):
    scope = output + "/installation-receiving"
    links = {destination(output, row["path"]): row for row in rows.values()
             if row["type"] == "symlink"}
    for origin, row in links.items():
        require(origin.startswith(scope + "/"), "Links are allowed only inside installation-receiving")
        require(row["mode"] == 0o777, "This Linux restore cannot preserve a nonstandard symlink mode")
        pending, visited = link_target(output, row), set()
        for _ in range(64):
            require(pending not in visited, "A retained symbolic-link chain cycles: " + row["path"])
            visited.add(pending)
            components = pending[len(scope):].strip("/").split("/") if pending != scope else []
            changed = False
            for index in range(len(components)):
                prefix = scope + "/" + "/".join(components[:index + 1])
                if prefix in links:
                    tail = components[index + 1:]
                    pending = os.path.normpath(os.path.join(link_target(output, links[prefix]), *tail))
                    require(within(scope, pending), "A retained link chain escapes the installation")
                    changed = True
                    break
            if not changed:
                break
        else:
            raise ValueError("A retained link chain exceeds the supported traversal depth")
        # Include any existing, unlisted target components in the read-only check.
        require(within(scope, os.path.realpath(pending)),
                "An existing link target escapes the owned installation: " + row["path"])


def validate_archive(archive, output):
    infos = archive.infolist()
    names = [item.filename for item in infos]
    name_set = set(names)
    require(len(names) == len(name_set), "Duplicate ZIP member")
    raw = small_member(archive, "CONTINUATION.json", 64 * 1024 * 1024)
    manifest = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs)
    require(isinstance(manifest, dict) and manifest.get("format") == FORMAT,
            "Unsupported continuation format")
    require(manifest.get("operation") == OPERATION, "This is another receiving operation")
    require(absolute(manifest.get("originalOutput")) == output,
            "--output must equal the saved originalOutput exactly")
    helpers = manifest.get("helpers")
    require(isinstance(helpers, dict) and set(helpers) == set(HELPERS),
            "The continuation must identify exactly RESTORE.py and RESTORE.md")
    for name, source_path in HELPERS.items():
        row = helpers[name]
        require(isinstance(row, dict) and row.get("sourcePath") == source_path,
                "Unexpected restore helper source: " + name)
        body = small_member(archive, name, 4 * 1024 * 1024)
        require(type(row.get("bytes")) is int and row["bytes"] == len(body)
                and row.get("sha256") == digest(body), "Restore helper bytes differ: " + name)
        blob = hashlib.sha1(b"blob " + str(len(body)).encode("ascii") + b"\0" + body).hexdigest()
        require(row.get("gitBlob") == blob, "Restore helper Git identity differs: " + name)
    require(isinstance(manifest.get("files"), list) and manifest["files"], "No retained output entries")
    rows, expected = {}, {"CONTINUATION.json", *HELPERS}
    for row in manifest["files"]:
        require(isinstance(row, dict), "Invalid retained entry")
        path, kind = row.get("path"), row.get("type")
        require(isinstance(path, str) and (path == "output" or path.startswith("output/"))
                and "\x00" not in path and "\\" not in path and str(PurePosixPath(path)) == path
                and all(part not in ("", ".", "..") for part in path.split("/")),
                "Unsafe or noncanonical output member")
        require(path not in rows and kind in KINDS, "Duplicate path or unsupported output type: " + path)
        require(type(row.get("mode")) is int and 0 <= row["mode"] <= 0o777,
                "Unsupported special permission bits: " + path)
        require(type(row.get("bytes")) is int and row["bytes"] >= 0
                and isinstance(row.get("sha256"), str)
                and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]),
                "Invalid retained byte identity: " + path)
        require((kind == "symlink") == ("target" in row), "Unexpected or missing link target: " + path)
        member = path + "/" if kind == "directory" else path
        require(member in name_set, "Missing retained ZIP member: " + member)
        info = archive.getinfo(member)
        require(info.create_system == 3 and stat.S_IFMT(info.external_attr >> 16) == KINDS[kind]
                and stat.S_IMODE(info.external_attr >> 16) == row["mode"]
                and not info.flag_bits & 1 and info.file_size == row["bytes"],
                "ZIP type, mode or length differs from its manifest: " + path)
        if kind == "directory":
            require(row["bytes"] == 0 and row["sha256"] == EMPTY_SHA256,
                    "A directory has nonempty content: " + path)
        with archive.open(info) as handle:
            size, checksum = hash_stream(handle)
        require(size == row["bytes"] and checksum == row["sha256"],
                "Retained output bytes differ: " + path)
        if kind == "symlink":
            require(isinstance(row["target"], str)
                    and archive.read(info) == row["target"].encode("utf-8"),
                    "The literal link target differs: " + path)
        rows[path] = row
        expected.add(member)
    require(name_set == expected, "ZIP membership differs from the complete continuation manifest")
    require(rows.get("output", {}).get("type") == "directory", "The original output root is missing")
    for path in rows:
        parent = str(PurePosixPath(path).parent)
        while parent != ".":
            require(rows.get(parent, {}).get("type") == "directory",
                    "A retained parent is absent or is not a directory: " + parent)
            parent = str(PurePosixPath(parent).parent)
    validate_links(output, rows)
    return manifest, rows


def directory_fd(path, create=False):
    """Walk from / with O_NOFOLLOW; return None at the first absent directory."""
    descriptor = os.open("/", DIRECTORY_FLAGS)
    try:
        for name in path.split("/")[1:]:
            if not name:
                continue
            try:
                child = os.open(name, DIRECTORY_FLAGS, dir_fd=descriptor)
            except FileNotFoundError:
                if not create:
                    os.close(descriptor)
                    return None
                os.mkdir(name, 0o700, dir_fd=descriptor)
                os.fsync(descriptor)
                child = os.open(name, DIRECTORY_FLAGS, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


@contextlib.contextmanager
def parent_fd(path, create=False):
    descriptor = directory_fd(os.path.dirname(path), create)
    try:
        yield descriptor, os.path.basename(path)
    finally:
        if descriptor is not None:
            os.close(descriptor)


def existing(parent, name, row):
    if parent is None:
        return False
    try:
        info = os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return False
    require(stat.S_IFMT(info.st_mode) == KINDS[row["type"]],
            "Existing entry has another type: " + row["path"])
    if row["type"] == "symlink":
        require(os.readlink(name, dir_fd=parent) == row["target"],
                "Existing link has another literal target: " + row["path"])
        require(stat.S_IMODE(info.st_mode) == row["mode"], "Existing link mode cannot be preserved")
    elif row["type"] == "file":
        descriptor = os.open(name, FILE_FLAGS, dir_fd=parent)
        with os.fdopen(descriptor, "rb") as handle:
            before = os.fstat(handle.fileno())
            require(stat.S_ISREG(before.st_mode) and stable(before) == stable(info),
                    "Existing file changed while it was opened: " + row["path"])
            size, checksum = hash_stream(handle)
            require(stable(os.fstat(handle.fileno())) == stable(before)
                    and size == row["bytes"] and checksum == row["sha256"],
                    "Existing file conflicts with the continuation: " + row["path"])
            require(before.st_nlink == 1 or stat.S_IMODE(before.st_mode) == row["mode"],
                    "Refusing a mode change through an existing hard link: " + row["path"])
    return True


def preflight(output, rows):
    # Opening every parent also rejects existing symlink ancestors before writes.
    for row in rows.values():
        with parent_fd(destination(output, row["path"])) as (parent, name):
            existing(parent, name, row)
    validate_links(output, rows)


def set_file_mode(parent, name, row):
    descriptor = os.open(name, FILE_FLAGS, dir_fd=parent)
    with os.fdopen(descriptor, "rb") as handle:
        info = os.fstat(handle.fileno())
        require(stat.S_ISREG(info.st_mode), "Restored file type changed")
        size, checksum = hash_stream(handle)
        require(stable(os.fstat(handle.fileno())) == stable(info)
                and size == row["bytes"] and checksum == row["sha256"],
                "Existing file changed before its mode could be restored: " + row["path"])
        if stat.S_IMODE(info.st_mode) != row["mode"]:
            require(info.st_nlink == 1, "Refusing a mode change through a hard link")
            os.fchmod(handle.fileno(), row["mode"])
        os.fsync(handle.fileno())

def restore_file(archive, output, row):
    path = destination(output, row["path"])
    with parent_fd(path) as (parent, name):
        require(parent is not None, "The retained file parent disappeared")
        if existing(parent, name, row):
            set_file_mode(parent, name, row)
            return False
        temporary = ".continuation-restore-" + uuid.uuid4().hex
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=parent)
        try:
            with os.fdopen(descriptor, "wb") as output_file, archive.open(row["path"]) as incoming:
                checksum, size = hashlib.sha256(), 0
                for raw in iter(lambda: incoming.read(CHUNK), b""):
                    output_file.write(raw)
                    checksum.update(raw)
                    size += len(raw)
                require(size == row["bytes"] and checksum.hexdigest() == row["sha256"],
                        "Archive changed while restoring: " + row["path"])
                output_file.flush()
                os.fchmod(output_file.fileno(), row["mode"])
                os.fsync(output_file.fileno())
            try:
                # Same-directory link publication is atomic and never overwrites a target.
                os.link(temporary, name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
                created = True
            except FileExistsError:
                existing(parent, name, row)
                set_file_mode(parent, name, row)
                created = False
            os.unlink(temporary, dir_fd=parent)
            os.fsync(parent)
            return created
        finally:
            try:
                os.unlink(temporary, dir_fd=parent)
                os.fsync(parent)
            except FileNotFoundError:
                pass


def apply_restore(archive, output, rows):
    directories = sorted((row for row in rows.values() if row["type"] == "directory"),
                         key=lambda row: (row["path"].count("/"), row["path"]))
    counts = {"createdFiles": 0, "reusedFiles": 0, "createdLinks": 0, "reusedLinks": 0,
              "directories": len(directories)}
    opened = []
    try:
        # Temporary owner access lets a retained read-only directory receive its children.
        for row in directories:
            path = destination(output, row["path"])
            with parent_fd(path) as (parent, name):
                require(parent is not None, "The retained directory parent disappeared")
                if not existing(parent, name, row):
                    os.mkdir(name, 0o700, dir_fd=parent)
                    os.fsync(parent)
                descriptor = os.open(name, DIRECTORY_FLAGS, dir_fd=parent)
                try:
                    info = os.fstat(descriptor)
                    opened.append((path, row, info.st_dev, info.st_ino))
                    if stat.S_IMODE(info.st_mode) & 0o700 != 0o700:
                        os.fchmod(descriptor, stat.S_IMODE(info.st_mode) | 0o700)
                finally:
                    os.close(descriptor)
        for row in rows.values():
            if row["type"] == "file":
                created = restore_file(archive, output, row)
                counts["createdFiles" if created else "reusedFiles"] += 1
        for row in rows.values():
            if row["type"] != "symlink":
                continue
            with parent_fd(destination(output, row["path"])) as (parent, name):
                require(parent is not None, "The retained link parent disappeared")
                if existing(parent, name, row):
                    counts["reusedLinks"] += 1
                else:
                    os.symlink(row["target"], name, dir_fd=parent)
                    os.fsync(parent)
                    counts["createdLinks"] += 1
        validate_links(output, rows)
    finally:
        # Restore directory metadata even after a partial, safely retryable copy.
        errors = []
        for path, row, device, inode in reversed(opened):
            descriptor = None
            try:
                descriptor = directory_fd(path)
                require(descriptor is not None, "A retained directory disappeared during restore")
                info = os.fstat(descriptor)
                require((info.st_dev, info.st_ino) == (device, inode),
                        "A retained directory changed during restore: " + row["path"])
                os.fchmod(descriptor, row["mode"])
                os.fsync(descriptor)
            except (OSError, ValueError) as error:
                errors.append(error)
            finally:
                if descriptor is not None:
                    os.close(descriptor)
        if errors:
            raise errors[0]
    return counts


def restore(archive_path, expected_sha256, output):
    require(sys.platform.startswith("linux"), "Use Linux to preserve the retained Unix metadata")
    require(re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha256 or "") is not None,
            "Supply the externally recorded archive SHA256")
    expected_sha256 = expected_sha256.lower()
    output = absolute(output)
    descriptor = os.open(archive_path, FILE_FLAGS)
    with os.fdopen(descriptor, "rb") as source:
        original = os.fstat(source.fileno())
        require(stat.S_ISREG(original.st_mode), "The archive must be a regular file")
        size, checksum = hash_stream(source)
        require(checksum == expected_sha256 and stable(os.fstat(source.fileno())) == stable(original),
                "Archive SHA256 or original file identity does not match")
        source.seek(0)
        with zipfile.ZipFile(source) as archive:
            manifest, rows = validate_archive(archive, output)
            preflight(output, rows)
            require(stable(os.fstat(source.fileno())) == stable(original), "Archive changed during validation")
            # All metadata, bytes, paths, links and existing conflicts have now been checked.
            parent = directory_fd(os.path.dirname(output), create=True)
            try:
                # Serialize participating restores without adding a lock file to saved state.
                fcntl.flock(parent, fcntl.LOCK_EX | fcntl.LOCK_NB)
                preflight(output, rows)
                counts = apply_restore(archive, output, rows)
                preflight(output, rows)
                for row in rows.values():
                    with parent_fd(destination(output, row["path"])) as (entry_parent, name):
                        info = os.stat(name, dir_fd=entry_parent, follow_symlinks=False)
                        require(stat.S_IMODE(info.st_mode) == row["mode"], "Restored permission mode differs")
                require(stable(os.fstat(source.fileno())) == stable(original), "Archive changed during restoration")
                os.fsync(parent)
            finally:
                os.close(parent)
    return {"status": "RESTORED", "format": FORMAT, "operation": manifest["operation"],
            "originalOutput": output, "archiveSha256": checksum, "archiveBytes": size,
            "entries": len(rows), **counts, "applicationsStarted": False,
            "sourceRetrieval": manifest.get("sourceRetrieval")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--output", required=True, help="The exact saved originalOutput absolute path")
    args = parser.parse_args()
    result = restore(args.archive, args.expected_sha256, args.output)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, zipfile.BadZipFile) as error:
        print(json.dumps({"status": "RESTORE_FAILED", "error": str(error),
                          "applicationsStarted": False}), file=sys.stderr)
        sys.exit(1)
