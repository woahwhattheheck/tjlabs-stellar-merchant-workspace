#!/usr/bin/env python3
"""Receive the six exact private inputs for the existing SF97 MCP02 operation.

This prepares files only. It does not register an operation, start a service,
change a pricing edition, or perform a purchase. Python 3.10+, POSIX.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile
import tempfile

OPERATION = "BC08-SF97-COST-MCP-RECEIVING-20261012-02"
VERSION = "8852829e-2636-4135-b8a4-82edf1ffe1b7"
BACKUP = "output/pricing-workspace/economics/exports/2778d971-f352-4f10-a958-af6e299fa10a.tar"
CONTRACT = {
    "output/economics-journey.json": (21783, "541fe36fbd691c3c5ced478cda2dd995ea10218b488fa821e33d7d41518a02cd"),
    "output/cost-mcp-journey.json": (2114, "a2f3ce7a7e78fdad06f81f047ddec0eebe8aa9acf3762f7c256025b360f43759"),
    "output/native/linkup-native-journey.json": (5034, "22ec17eab5f5dc34d70e57a114be36df55eaa4d164e4b01bda03038fce20d9cb"),
    "output/native/pricing-seller.json": (2891, "125e6660abfd9d7e0597f81ea2d05cfdcd0686b61230825b7aeb25a79146ef96"),
    "output/native/pricing-traffic.json": (106082, "03e10410fd225b7c69d54f8bd186739860d312f6317cc268e1adfc2b36267b5f"),
    BACKUP: (422912, "df938ab5a61d87a9871934b487dcda5e5b12b79b3f4a02ffd46ca2e409c2a81d"),
}
MEMBERS = {
    "output/native/pricing-seller.json": "versions/" + VERSION + "/seller.json",
    "output/native/pricing-traffic.json": "versions/" + VERSION + "/snapshot.json",
}


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def regular(path: Path, maximum: int) -> bytes:
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > maximum:
            raise ValueError("A selected input is not a regular file within its byte limit.")
        data = stream.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("A selected input grew beyond its byte limit.")
    return data


def exact(name: str, data: bytes) -> bytes:
    size, expected = CONTRACT[name]
    if len(data) != size or digest(data) != expected:
        raise ValueError("Original input bytes or SHA-256 differ: " + name)
    return data


def envelope_files(path: Path) -> dict[str, bytes]:
    text = regular(path, 2 * 1024 * 1024).decode("utf-8")
    # A native Canvas read may expose the JSON fence and nonbreaking indentation.
    # Encoded file content is ASCII base64; this does not alter any file bytes.
    marker = chr(96) * 3 + "json"
    if marker in text:
        start = text.index(marker) + len(marker)
        end = text.find(chr(96) * 3, start)
        if end < 0:
            raise ValueError("The input envelope JSON fence is incomplete.")
        text = text[start:end]
    value = json.loads(text.replace("\u00a0", " "))
    if (not isinstance(value, dict)
            or value.get("schema") != "commons.sf97.original-receiving-inputs.v1"
            or value.get("operation") != OPERATION
            or not isinstance(value.get("files"), list)):
        raise ValueError("Use the original MCP02 receiving-input envelope.")
    result = {}
    for entry in value["files"]:
        if not isinstance(entry, dict):
            raise ValueError("An input envelope entry is not an object.")
        name = entry.get("path")
        if not isinstance(name, str) or name not in CONTRACT or name == BACKUP or name in result:
            raise ValueError("The input envelope has an unknown or duplicate file.")
        if (entry.get("encoding") != "base64"
                or (entry.get("bytes"), entry.get("sha256")) != CONTRACT[name]
                or not isinstance(entry.get("content"), str)):
            raise ValueError("An input envelope entry differs from the original contract.")
        try:
            data = base64.b64decode(entry["content"], validate=True)
        except (ValueError, binascii.Error) as error:
            raise ValueError("An input envelope contains invalid base64.") from error
        result[name] = exact(name, data)
    return result


def original_members(backup: bytes) -> dict[str, bytes]:
    exact(BACKUP, backup)
    observed = []
    names = set()
    wanted = set(MEMBERS.values())
    selected = {}
    manifest = None
    descriptor_seen = False
    with tarfile.open(fileobj=io.BytesIO(backup), mode="r:") as archive:
        for member in archive:
            name = member.name
            relative = PurePosixPath(name)
            if (name in names or len(names) >= 100 or not member.isfile()
                    or relative.is_absolute() or ".." in relative.parts
                    or "\\" in name or "\x00" in name
                    or member.size < 0 or member.size > len(backup)):
                raise ValueError("The original backup member set is invalid.")
            if manifest is not None:
                raise ValueError("The original backup manifest is not the final member.")
            if not descriptor_seen and name != "bundle.json":
                raise ValueError("The original backup descriptor is absent.")
            names.add(name)
            stream = archive.extractfile(member)
            if stream is None:
                raise ValueError("A regular backup member cannot be read.")
            with stream:
                data = stream.read(member.size + 1)
            if len(data) != member.size:
                raise ValueError("An original backup member is truncated.")
            if name == "bundle.json":
                descriptor_seen = True
                json.loads(data.decode("utf-8"))
            elif name == "manifest.json":
                manifest = json.loads(data.decode("utf-8"))
            else:
                observed.append({"name": name, "bytes": len(data), "sha256": digest(data)})
                if name in wanted:
                    selected[name] = data
    if (len(observed) != 42 or not isinstance(manifest, dict)
            or manifest.get("schema") != "stellar-forge.merchant-cost-bundle-manifest.v1"
            or manifest.get("files") != observed or set(selected) != wanted):
        raise ValueError("The complete original backup or its two selected source members differ.")
    return {name: exact(name, selected[member]) for name, member in MEMBERS.items()}


def private_directory(path: Path) -> None:
    if not path.is_absolute():
        raise ValueError("Use an absolute private operation directory.")
    current = Path(path.anchor)
    for part in path.parts[1:]:
        if part in (".", ".."):
            raise ValueError("The operation directory contains an ambiguous path component.")
        current /= part
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            pass
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode):
            raise ValueError("An operation-directory component is not a real directory.")


def retain(path: Path, data: bytes) -> bool:
    private_directory(path.parent)
    if path.exists() or path.is_symlink():
        if regular(path, len(data)) != data:
            raise ValueError("An existing receiving input differs; preserve it for explicit review.")
        return False
    descriptor, temporary = tempfile.mkstemp(prefix=".receiving-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
            created = True
        except FileExistsError:
            if regular(path, len(data)) != data:
                raise ValueError("A concurrently retained receiving input differs.")
            created = False
        parent = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
        return created
    finally:
        os.unlink(temporary)


def prepare(directory: Path, envelope: Path, archive: Path) -> dict:
    if not directory.is_absolute() or directory == Path("/") or ".." in directory.parts:
        raise ValueError("Use an absolute private operation directory without '..'.")
    # Complete byte validation happens before the first retained input is written.
    backup = regular(archive, CONTRACT[BACKUP][0])
    recovered = original_members(backup)
    inputs = envelope_files(envelope)
    for name, data in recovered.items():
        if name in inputs and inputs[name] != data:
            raise ValueError("An envelope source differs from its original saved pricing version.")
        inputs[name] = data
    inputs[BACKUP] = exact(BACKUP, backup)
    if set(inputs) != set(CONTRACT):
        raise ValueError("The exact completed, predecessor, and native reports must be in the input envelope.")
    private_directory(directory)
    lock = os.open(directory / "receiving-inputs.lock",
                   os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        created = 0
        for name in sorted(inputs):
            created += int(retain(directory / name, inputs[name]))
        files = [{"path": name, "bytes": CONTRACT[name][0], "sha256": CONTRACT[name][1]}
                 for name in sorted(CONTRACT)]
        receipt = {
            "schema": "commons.sf97.original-receiving-inputs-ready.v1",
            "operation": OPERATION,
            "state": "INPUTS_READY",
            "files": files,
            "sourceVersion": VERSION,
            "recoveredMembers": MEMBERS,
            "execution": "This helper prepares original inputs and does not dispatch the MCP operation.",
        }
        encoded = (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        retain(directory / "receiving-inputs.json", encoded)
        return {**receipt, "directory": str(directory), "newFiles": created,
                "reusedFiles": len(inputs) - created, "receiptSha256": digest(encoded)}
    finally:
        os.close(lock)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", required=True, type=Path, help="Absolute private operation directory.")
    parser.add_argument("--envelope", required=True, type=Path, help="Original internal JSON envelope or its Canvas markdown.")
    parser.add_argument("--backup", required=True, type=Path, help="Exact original 422,912-byte full workspace TAR.")
    options = parser.parse_args()
    try:
        result = prepare(options.case, options.envelope, options.backup)
    except (OSError, ValueError, UnicodeError, tarfile.TarError) as error:
        print(json.dumps({"status": "INPUTS_NOT_PREPARED", "error": type(error).__name__,
                          "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
