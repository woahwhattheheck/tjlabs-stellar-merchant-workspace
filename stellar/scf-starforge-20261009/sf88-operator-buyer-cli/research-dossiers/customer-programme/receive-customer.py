#!/usr/bin/env python3
"""Package and receive a complete customer Research programme with its original engine."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import uuid
import zipfile

SCHEMA = "sf88.research-customer-package.v1"
MAX_MANIFEST = 16 * 1024 * 1024
MAX_FILE = 256 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024
MAX_MEMBERS = 20000
BLOCK = 1024 * 1024
MANIFEST = "PACKAGE_MANIFEST.json"
RECEIVER = "engine/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-programme/receiving.mjs"


def need(value, code):
    if not value:
        raise ValueError(code)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def member(value):
    need(isinstance(value, str) and 0 < len(value) <= 1024 and
         not re.search(r"[\\\x00-\x1f\x7f]", value), "CUSTOMER_PACKAGE_MEMBER_INVALID")
    path = PurePosixPath(value)
    need(not path.is_absolute() and str(path) == value and
         all(part not in {"", ".", ".."} for part in value.split("/")),
         "CUSTOMER_PACKAGE_MEMBER_INVALID")
    return value


def absolute(value):
    path = Path(value)
    need(path.is_absolute() and str(path.absolute()) == str(path) and
         ".." not in path.parts, "CUSTOMER_PACKAGE_ABSOLUTE_PATH_REQUIRED")
    return path


def folder(value):
    path = absolute(value)
    missing, parent = [], path
    while not os.path.lexists(parent):
        missing.append(parent)
        parent = parent.parent
    for created in reversed(missing):
        created.mkdir(mode=0o700)
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and
         path.resolve() == path and info.st_mode & 0o077 == 0 and
         (not hasattr(os, "getuid") or info.st_uid == os.getuid()),
         "CUSTOMER_PACKAGE_PRIVATE_DIRECTORY_REQUIRED")
    return path


@contextmanager
def ordinary(path):
    path = absolute(path)
    need(path.resolve() == path, "CUSTOMER_PACKAGE_SOURCE_SYMLINK")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode), "CUSTOMER_PACKAGE_ORDINARY_FILE_REQUIRED")
        yield stream


def pin(path, maximum=MAX_FILE):
    with ordinary(path) as stream:
        size, digest = 0, hashlib.sha256()
        for data in iter(lambda: stream.read(BLOCK), b""):
            size += len(data)
            need(size <= maximum, "CUSTOMER_PACKAGE_FILE_TOO_LARGE")
            digest.update(data)
    return {"file": str(path), "bytes": size, "sha256": digest.hexdigest()}


def checked(path, row):
    actual = pin(path)
    need(actual["bytes"] == row["bytes"] and actual["sha256"] == row["sha256"],
         "CUSTOMER_PACKAGE_SELECTED_FILE_CHANGED")
    return actual


def read(path, maximum=MAX_MANIFEST):
    with ordinary(path) as stream:
        body = stream.read(maximum + 1)
    need(len(body) <= maximum, "CUSTOMER_PACKAGE_RECORD_TOO_LARGE")
    return body


def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def retain(path, body):
    path = absolute(path)
    folder(path.parent)
    if os.path.lexists(path):
        need(read(path, max(len(body), MAX_MANIFEST)) == body, "CUSTOMER_PACKAGE_RETAINED_FILE_CHANGED")
        return pin(path)
    temporary = path.with_name("." + path.name + ".receiving-" + uuid.uuid4().hex)
    try:
        with temporary.open("xb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            need(read(path, max(len(body), MAX_MANIFEST)) == body, "CUSTOMER_PACKAGE_RETAINED_FILE_CHANGED")
        sync(path.parent)
    finally:
        temporary.unlink(missing_ok=True)
    return pin(path)


@contextmanager
def lock(path):
    folder(path)
    with (path / ".customer-package.lock").open("a+") as stream:
        os.fchmod(stream.fileno(), 0o600)
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def validate_manifest(value):
    need(isinstance(value, dict) and value.get("schema") == SCHEMA and
         isinstance(value.get("files"), list) and 0 < len(value["files"]) <= MAX_MEMBERS,
         "CUSTOMER_PACKAGE_MANIFEST_INVALID")
    names, total = set(), 0
    for row in value["files"]:
        need(isinstance(row, dict), "CUSTOMER_PACKAGE_MEMBER_INVALID")
        name = member(row.get("path"))
        need(name not in names and name != MANIFEST, "CUSTOMER_PACKAGE_MEMBER_REPEATED")
        need(type(row.get("bytes")) is int and 0 <= row["bytes"] <= MAX_FILE and
             isinstance(row.get("sha256"), str) and re.fullmatch("[a-f0-9]{64}", row["sha256"]) and
             row.get("mode") in {"100644", "100755"} and isinstance(row.get("kind"), str),
             "CUSTOMER_PACKAGE_MEMBER_DESCRIPTOR_INVALID")
        names.add(name)
        total += row["bytes"]
    need(total <= MAX_TOTAL and total == value.get("sourceBytes") and
         len(names) == value.get("sourceFiles"), "CUSTOMER_PACKAGE_TOTAL_CHANGED")
    need(not any(str(parent) in names for name in names for parent in PurePosixPath(name).parents
                 if str(parent) != "."), "CUSTOMER_PACKAGE_MEMBER_PATH_COLLISION")
    native = value.get("native")
    need(isinstance(native, dict) and
         all(native.get(name) in names for name in ("portable", "metadata", "history")) and
         RECEIVER in names, "CUSTOMER_PACKAGE_ORIGINAL_RECEIVER_MISSING")
    return names


def inspect_archive(path, *, expected_sha256=None, maximum=MAX_FILE, expected_manifest=None):
    actual = pin(path, maximum)
    if expected_sha256 is not None:
        need(actual["sha256"] == expected_sha256, "CUSTOMER_PACKAGE_ARCHIVE_CHANGED")
    with ordinary(path) as source, zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        need(len(names) == len(set(names)) and 1 < len(names) <= MAX_MEMBERS + 1 and
             MANIFEST in names, "CUSTOMER_PACKAGE_ARCHIVE_MEMBERS_INVALID")
        manifest_entry = archive.getinfo(MANIFEST)
        need(manifest_entry.file_size <= MAX_MANIFEST, "CUSTOMER_PACKAGE_MANIFEST_TOO_LARGE")
        raw = archive.read(MANIFEST)
        value = json.loads(raw)
        selected = validate_manifest(value)
        need(set(names) == selected | {MANIFEST}, "CUSTOMER_PACKAGE_ARCHIVE_MEMBERSHIP_CHANGED")
        if expected_manifest is not None:
            need(raw == expected_manifest, "CUSTOMER_PACKAGE_ARCHIVE_SELECTION_CHANGED")
        declared = {row["path"]: row for row in value["files"]}
        for entry in entries:
            member(entry.filename)
            mode = entry.external_attr >> 16
            need(not entry.is_dir() and not stat.S_ISLNK(mode) and
                 (stat.S_IFMT(mode) in {0, stat.S_IFREG}) and not entry.flag_bits & 1 and
                 entry.compress_type in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED},
                 "CUSTOMER_PACKAGE_ARCHIVE_ENTRY_INVALID")
            row = declared.get(entry.filename)
            if row is None:
                continue
            need(entry.file_size == row["bytes"], "CUSTOMER_PACKAGE_ARCHIVE_FILE_CHANGED")
            digest, size = hashlib.sha256(), 0
            with archive.open(entry) as stream:
                for data in iter(lambda: stream.read(BLOCK), b""):
                    size += len(data)
                    need(size <= row["bytes"], "CUSTOMER_PACKAGE_ARCHIVE_FILE_CHANGED")
                    digest.update(data)
            need(size == row["bytes"] and digest.hexdigest() == row["sha256"],
                 "CUSTOMER_PACKAGE_ARCHIVE_FILE_CHANGED")
    return {"archive": actual, "manifest": value, "manifestSha256": hashlib.sha256(raw).hexdigest(), "manifestBytes": len(raw)}


def build(request_file, expected_sha256):
    raw = read(request_file)
    need(hashlib.sha256(raw).hexdigest() == expected_sha256, "CUSTOMER_PACKAGE_BUILD_SELECTION_CHANGED")
    request = json.loads(raw)
    need(request.get("schema") == "sf88.research-customer-package-build.v1", "CUSTOMER_PACKAGE_BUILD_REQUIRED")
    output = absolute(request["output"])
    maximum = request["maximumArchiveBytes"]
    need(type(maximum) is int and 0 < maximum <= MAX_FILE, "CUSTOMER_PACKAGE_MAXIMUM_INVALID")
    manifest = {"schema": SCHEMA, "operationId": request["operationId"],
        "selectionSha256": request["selectionSha256"], "customerLabel": request["customerLabel"],
        "native": request["native"], "engine": request["engine"],
        "files": [{k: row[k] for k in ("path", "bytes", "sha256", "mode", "kind")} for row in request["files"]]}
    manifest["sourceFiles"] = len(manifest["files"])
    manifest["sourceBytes"] = sum(row["bytes"] for row in manifest["files"])
    validate_manifest(manifest)
    manifest_raw = encoded(manifest)
    need(len(manifest_raw) <= MAX_MANIFEST, "CUSTOMER_PACKAGE_MANIFEST_TOO_LARGE")
    with lock(output.parent):
        for row in request["files"]:
            checked(absolute(row["file"]), row)
        if not os.path.lexists(output):
            temporary = output.with_name("." + output.name + ".building-" + uuid.uuid4().hex)
            try:
                with zipfile.ZipFile(temporary, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                    for row in request["files"]:
                        info = zipfile.ZipInfo(row["path"], date_time=(1980, 1, 1, 0, 0, 0))
                        info.create_system = 3
                        info.compress_type = zipfile.ZIP_DEFLATED
                        info.external_attr = (stat.S_IFREG | (0o700 if row["mode"] == "100755" else 0o600)) << 16
                        digest, size = hashlib.sha256(), 0
                        with ordinary(absolute(row["file"])) as source, archive.open(info, "w") as target:
                            for data in iter(lambda: source.read(BLOCK), b""):
                                size += len(data)
                                need(size <= row["bytes"], "CUSTOMER_PACKAGE_SOURCE_CHANGED_DURING_BUILD")
                                digest.update(data)
                                target.write(data)
                        need(size == row["bytes"] and digest.hexdigest() == row["sha256"],
                             "CUSTOMER_PACKAGE_SOURCE_CHANGED_DURING_BUILD")
                    info = zipfile.ZipInfo(MANIFEST, date_time=(1980, 1, 1, 0, 0, 0))
                    info.create_system = 3
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = (stat.S_IFREG | 0o600) << 16
                    archive.writestr(info, manifest_raw)
                temporary.chmod(0o600)
                with ordinary(temporary) as stream:
                    os.fsync(stream.fileno())
                inspect_archive(temporary, maximum=maximum, expected_manifest=manifest_raw)
                try:
                    os.link(temporary, output, follow_symlinks=False)
                except FileExistsError:
                    inspect_archive(output, maximum=maximum, expected_manifest=manifest_raw)
                sync(output.parent)
            finally:
                temporary.unlink(missing_ok=True)
        result = inspect_archive(output, maximum=maximum, expected_manifest=manifest_raw)
        public = {"schema": "sf88.research-customer-package-built.v1", "operationId": request["operationId"],
            "selectionSha256": request["selectionSha256"], "archive": result["archive"],
            "manifestSha256": result["manifestSha256"], "manifestBytes": result["manifestBytes"],
            "files": len(manifest["files"]), "originalBytes": manifest["sourceBytes"]}
        retain(absolute(request["resultFile"]), encoded(public))
        return public


def extract(archive_path, expected_sha256, directory, node, result_file, python):
    directory = folder(directory)
    inspection = inspect_archive(archive_path, expected_sha256=expected_sha256)
    manifest = inspection["manifest"]
    with lock(directory):
        retain(directory / "archive-selection.json", encoded({
            "archive": inspection["archive"], "manifestSha256": inspection["manifestSha256"]}))
        package = folder(directory / "package")
        staging = folder(directory / "receiving-files")
        allowed = {row["path"] for row in manifest["files"]} | {MANIFEST}
        allowed_dirs = {str(parent) for name in allowed for parent in PurePosixPath(name).parents if str(parent) != "."}
        for root, dirs, files in os.walk(package, followlinks=False):
            parent = Path(root)
            for name in dirs:
                child = parent / name
                need(not child.is_symlink() and child.relative_to(package).as_posix() in allowed_dirs,
                     "CUSTOMER_PACKAGE_RECEIVING_DIRECTORY_CHANGED")
            for name in files:
                child = parent / name
                need(child.relative_to(package).as_posix() in allowed,
                     "CUSTOMER_PACKAGE_RECEIVING_MEMBERSHIP_CHANGED")
        with ordinary(archive_path) as source, zipfile.ZipFile(source) as archive:
            rows = manifest["files"] + [{"path": MANIFEST, "bytes": inspection["manifestBytes"],
                "sha256": inspection["manifestSha256"], "mode": "100644"}]
            for row in rows:
                path = package.joinpath(*PurePosixPath(row["path"]).parts)
                folder(path.parent)
                if os.path.lexists(path):
                    checked(path, row)
                    continue
                temporary = staging / (hashlib.sha256(row["path"].encode("utf-8")).hexdigest() + ".partial")
                if os.path.lexists(temporary):
                    # This exact receiving directory is already bound to the
                    # immutable archive selection. Retire only this helper\'s
                    # own ordinary partial copy, then re-read the retained ZIP.
                    with ordinary(temporary) as previous:
                        info = os.fstat(previous.fileno())
                        need(info.st_uid == os.getuid() and info.st_mode & 0o077 == 0 and info.st_nlink == 1,
                             "CUSTOMER_PACKAGE_PARTIAL_FILE_CHANGED")
                    temporary.unlink()
                try:
                    digest, size = hashlib.sha256(), 0
                    with archive.open(row["path"]) as source, temporary.open("xb") as target:
                        os.fchmod(target.fileno(), 0o700 if row["mode"] == "100755" else 0o600)
                        for data in iter(lambda: source.read(BLOCK), b""):
                            size += len(data)
                            need(size <= row["bytes"], "CUSTOMER_PACKAGE_RECEIVING_FILE_CHANGED")
                            digest.update(data)
                            target.write(data)
                        target.flush()
                        os.fsync(target.fileno())
                    need(size == row["bytes"] and digest.hexdigest() == row["sha256"],
                         "CUSTOMER_PACKAGE_RECEIVING_FILE_CHANGED")
                    try:
                        os.link(temporary, path, follow_symlinks=False)
                    except FileExistsError:
                        checked(path, row)
                    sync(path.parent)
                finally:
                    temporary.unlink(missing_ok=True)
        # Use the engine that was actually extracted from this archive.
        # The editable native workspace is outside the immutable received tree.
        receiver = package.joinpath(*PurePosixPath(RECEIVER).parts)
        cold_receipt = directory / "native-cold-receiving.json"
        command = [node, str(receiver), "--open", "--package-directory", str(package),
            "--workspace-directory", str(directory / "editable-research"),
            "--manifest-sha256", inspection["manifestSha256"], "--receipt-file", str(cold_receipt),
            "--python", python]
        subprocess.run(command, check=True, stdin=subprocess.DEVNULL)
        native = json.loads(read(cold_receipt))
        need(native["manifestSha256"] == inspection["manifestSha256"] and
             native["dossierId"] == manifest["native"]["dossierId"] and
             native["selectedRevision"] == manifest["native"]["revision"],
             "CUSTOMER_PACKAGE_EXTRACTED_ENGINE_RECEIVING_CHANGED")
        result = {"schema": "sf88.research-customer-package-received.v1",
            "archive": inspection["archive"], "manifestSha256": inspection["manifestSha256"],
            "packageDirectory": str(package), "native": native,
            "engineExecuted": str(receiver), "receivedMembers": len(manifest["files"]) + 1}
        retain(result_file, encoded(result))
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    create = sub.add_parser("build")
    create.add_argument("--request", required=True)
    create.add_argument("--sha256", required=True)
    receive = sub.add_parser("receive")
    for name in ("archive", "sha256", "directory", "result"):
        receive.add_argument("--" + name, required=True)
    receive.add_argument("--node", default="node")
    receive.add_argument("--python", default=sys.executable)
    inspect = sub.add_parser("inspect")
    inspect.add_argument("--archive", required=True)
    inspect.add_argument("--sha256")
    args = parser.parse_args()
    if args.action == "build":
        result = build(absolute(args.request), args.sha256)
    elif args.action == "receive":
        result = extract(absolute(args.archive), args.sha256, absolute(args.directory),
                         args.node, absolute(args.result), args.python)
    else:
        received = inspect_archive(absolute(args.archive), expected_sha256=args.sha256)
        result = {k: v for k, v in received.items() if k != "manifest"}
        result["members"] = len(received["manifest"]["files"]) + 1
    print(json.dumps(result, ensure_ascii=False, allow_nan=False, sort_keys=True, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        print(json.dumps({"state": "INCOMPLETE", "error": str(error)}, sort_keys=True), file=sys.stderr)
        raise SystemExit(1)
