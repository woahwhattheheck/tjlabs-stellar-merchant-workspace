#!/usr/bin/env python3
"""MIT. Operate retained FCDO financial coverage through the original IATI product.

The operation imports the actual full publisher files, retains the original
organisation and native activity engines, and carries one financial case through
dated comparison, review, changed selection, reporting, export and receiving.
"""
from __future__ import annotations

import argparse
from contextlib import ExitStack, contextmanager, redirect_stdout
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
import fcntl
import gzip
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import threading
import uuid
import xml.etree.ElementTree as ET
import zipfile

IATI = Path(__file__).resolve().parent
sys.path.insert(0, str(IATI))
from iati_workspace import IatiWorkspace, json_bytes, load_json
from cli import published_connection
from server import OperatorServer
from managed import inspect_binding
from organisation.portable import source_files as organisation_source_files

OPERATION = "fcdo-financial-reconciliation-cb2a-20261012"
SCHEMA = "stellar-forge.iati-financial-reconciliation-receiving.v1"
ORG_SOURCE = {
    "bytes": 99013,
    "sha256": "c18e63db2d543eaeb5525a4df21cd16561f0316dab831789bfdd176e1accdfce",
    "url": "https://iati.fcdo.gov.uk/iati_files/organisation.xml",
}
ACTIVITY_SOURCE = {
    "bytes": 8496890,
    "sha256": "98a6bad80d60aa8deaa35fe1a593313515649a9fae7456895d1bfed4ac4a756d",
    "url": "https://iati.fcdo.gov.uk/iati_files/solr/FCDO-set-20.xml",
}
CHILD = "GB-GOV-1-400043-401"
REPORTER = "GB-GOV-1"
PERIOD = {"start": "2026-04-01", "end": "2027-03-31"}
EXPECTED_QUARTERS = (
    ("2026-04-01", "2026-06-30", "103192"),
    ("2026-07-01", "2026-09-30", "164543"),
    ("2026-10-01", "2026-12-31", "723056"),
    ("2027-01-01", "2027-03-31", "509209"),
)
DEFAULT_ACTOR = "Commons financial receiving operator CB2A"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest_file(path):
    digest, count = hashlib.sha256(), 0
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
            count += len(chunk)
    return {"bytes": count, "sha256": digest.hexdigest()}


def plain_source(path):
    path = Path(path).expanduser().resolve()
    with path.open("rb") as source:
        compressed = source.read(2) == b"\x1f\x8b"
    return gzip.open(path, "rb") if compressed else path.open("rb")


def source_identity(path):
    digest, count = hashlib.sha256(), 0
    with plain_source(path) as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
            count += len(chunk)
    return {"bytes": count, "sha256": digest.hexdigest()}


def private_directory(path):
    path = Path(path).expanduser().absolute()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(not path.is_symlink() and path.resolve() == path and path.is_dir(),
            "Select a real private receiving directory")
    os.chmod(path, 0o700)
    return path


@contextmanager
def operation_guard(output):
    """Keep one producer across preparation, independent receiving and reports."""
    descriptor = os.open(
        output / ".reconciliation-receiving.lock",
        os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError(
                "This original receiving operation already has an active producer") from error
        yield
    finally:
        os.close(descriptor)


@contextmanager
def complete_retained_file(path, expected):
    """Publish a complete file only after its bytes are closed and verified."""
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name("." + path.name + ".incoming-" + uuid.uuid4().hex)
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            yield stream
            stream.flush()
            os.fsync(stream.fileno())
        require(digest_file(temporary) == expected,
                "The complete retained output changed before publication: " + path.name)
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            require(not path.is_symlink() and path.is_file()
                    and digest_file(path) == expected,
                    "A retained operation file belongs to another result: " + path.name)
        directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        # Only this invocation's exclusively created, unpublished temporary file.
        temporary.unlink(missing_ok=True)


def retained(path, value):
    path = Path(path)
    data = value if isinstance(value, bytes) else json_bytes(value)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists() or path.is_symlink():
        require(not path.is_symlink() and path.is_file() and path.read_bytes() == data,
                "A retained operation file belongs to another result: " + path.name)
        return path
    expected = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    with complete_retained_file(path, expected) as stream:
        stream.write(data)
    return path


def retained_copy(path, source):
    path, source = Path(path), Path(source)
    identity = digest_file(source)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists() or path.is_symlink():
        require(not path.is_symlink() and path.is_file() and digest_file(path) == identity,
                "An existing complete output differs: " + path.name)
        return identity
    with complete_retained_file(path, identity) as target, source.open("rb") as original:
        shutil.copyfileobj(original, target, 1024 * 1024)
    return identity


def checkpoint(path, value):
    temporary = Path(path).with_name("." + Path(path).name + ".next")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(value if isinstance(value, bytes) else json_bytes(value))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def phase(output, state, name, **details):
    state.update(details)
    state["phase"] = name
    state["updatedAt"] = datetime.now(timezone.utc).isoformat()
    if name not in state["stages"]:
        state["stages"].append(name)
    checkpoint(output / "operation-state.json", state)
    print(json.dumps({"operation": OPERATION, "phase": name, **{
        k: state[k] for k in ("caseId", "finalRevision") if k in state
    }}, sort_keys=True), flush=True)


CHECKPOINT_SCHEMA = "stellar-forge.iati-financial-reconciliation-checkpoint.v1"
CHECKPOINT_MAX_BYTES = 8 * 1024 * 1024 * 1024
CHECKPOINT_MAX_FILES = 50000


def checkpoint_member_name(name):
    require(isinstance(name, str) and name and len(name) <= 1024
            and "\\" not in name and "\x00" not in name and ":" not in name
            and all(part not in ("", ".", "..") for part in name.split("/"))
            and not name.startswith("/"),
            "A receiving checkpoint member must use its original relative path")
    return name


def checkpoint_excluded(relative):
    parts = relative.parts
    return (
        parts[0] in ("connections", "temporary")
        or relative.name in (".reconciliation-receiving.lock", ".lock", ".checkpoint-restore.json")
        or relative.name == "source-workspace-connection.json"
        or (parts[0] == "merchant-exports"
            and relative.name.startswith((".partial-", ".record-")))
        or (parts[0] in ("sender-workspace", "receiver-workspace")
            and len(parts) > 2 and parts[1] == "tmp")
        or (relative.name.startswith(".") and (
            ".incoming-" in relative.name or relative.name.endswith(".next")))
    )


@contextmanager
def closed_native_leases(output):
    """Borrow the original closed workspace locks without starting a runtime."""
    descriptors = []
    try:
        for name in ("sender-workspace", "receiver-workspace"):
            root = output / name
            require(root.is_dir() and not root.is_symlink(),
                    "Complete original independent receiving before retaining the closed case")
            descriptor = os.open(root / ".lock",
                                 os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
            descriptors.append(descriptor)
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise RuntimeError(
                    "The original " + name + " is still in use; retain it after that owner closes") from error
        yield
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


def checkpoint_destination(args, output):
    destination = private_directory(
        args.checkpoint_directory or output.with_name(output.name + "-checkpoints"))
    require(destination != output and output not in destination.parents,
            "Keep the closed-case checkpoints outside the operation they retain")
    require(all(destination != root and root not in destination.parents
                for root in (IATI, (IATI.parent / "xml").resolve())),
            "Keep the closed-case checkpoints outside the installed source trees")
    return destination


def checkpoint_state_identity(state):
    return {key: state[key] for key in ("operation", "caseId", "finalRevision", "sourceEdition")}


def saved_case_checkpoint(args, output, state, stage):
    """Stream one complete, closed operation before the expensive continuation."""
    require(state.get("caseId") and state.get("nativePacket") and state.get("receiving"),
            "Retain the completed native case and its independent receiver together")
    destination = checkpoint_destination(args, output)
    state_path = output / "operation-state.json"
    checkpoint(state_path, state)
    source_state = state_path.read_bytes()
    identity = checkpoint_state_identity(state)
    # This checkpoint is already complete for the same original preparation.
    # Failed attempts have their own checkpoint containing the actual diagnostic.
    existing = next((item for item in reversed(state.get("closedCaseCheckpoints", []))
                     if stage != "continuation-ended"
                     and item.get("stage") == stage and item.get("identity") == identity), None)
    if existing:
        path = Path(existing["path"])
        if path.parent == destination and path.is_file() and not path.is_symlink():
            require(digest_file(path) == {key: existing[key] for key in ("bytes", "sha256")},
                    "The original closed-case checkpoint changed")
            return existing

    temporary = destination / (".receiving-checkpoint.incoming-" + uuid.uuid4().hex)
    files, directories, total = {}, [], 0
    try:
        with closed_native_leases(output):
            # Keep empty native directories as well as data. A restored original
            # workspace needs its sources/plans/builds/comparisons/tmp directories.
            members = []
            for root, child_directories, child_files in os.walk(output, followlinks=False):
                root = Path(root)
                for name in sorted(child_directories.copy()):
                    path = root / name
                    relative = path.relative_to(output)
                    if checkpoint_excluded(relative):
                        child_directories.remove(name)
                        continue
                    require(not path.is_symlink() and path.is_dir(),
                            "The closed operation contains a changed directory: " + str(relative))
                    directories.append(checkpoint_member_name(relative.as_posix()))
                for name in sorted(child_files):
                    path = root / name
                    relative = path.relative_to(output)
                    if checkpoint_excluded(relative):
                        continue
                    require(not path.is_symlink() and stat.S_ISREG(path.lstat().st_mode),
                            "The closed operation contains a changed file: " + str(relative))
                    members.append((checkpoint_member_name(relative.as_posix()), path))
            require(len(members) <= CHECKPOINT_MAX_FILES and len(directories) <= CHECKPOINT_MAX_FILES,
                    "The receiving checkpoint exceeds the complete operation member limit")
            with temporary.open("xb") as sink:
                os.chmod(temporary, 0o600)
                with zipfile.ZipFile(sink, "w", compression=zipfile.ZIP_DEFLATED,
                                     compresslevel=1, allowZip64=True) as archive:
                    for name, path in sorted(members):
                        before = path.stat()
                        info = zipfile.ZipInfo("operation/" + name, date_time=(1980, 1, 1, 0, 0, 0))
                        info.create_system = 3
                        info.external_attr = (stat.S_IFREG | 0o600) << 16
                        info.compress_type = (zipfile.ZIP_STORED if path.suffix.lower() in
                                              (".zip", ".gz", ".png", ".jpg", ".jpeg", ".webp")
                                              else zipfile.ZIP_DEFLATED)
                        digest, count = hashlib.sha256(), 0
                        with path.open("rb") as source, archive.open(info, "w", force_zip64=True) as target:
                            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                                count += len(chunk)
                                total += len(chunk)
                                require(total <= CHECKPOINT_MAX_BYTES,
                                        "The receiving checkpoint exceeds its complete byte limit")
                                target.write(chunk)
                                digest.update(chunk)
                        after = path.stat()
                        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
                                == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
                                and count == before.st_size,
                                "An original closed case member changed while it was retained: " + name)
                        files[name] = {"bytes": count, "sha256": digest.hexdigest()}
                    require(files.get("operation-state.json") == {
                        "bytes": len(source_state), "sha256": hashlib.sha256(source_state).hexdigest()},
                        "The complete checkpoint must retain the exact closed operation state")
                    manifest = {
                        "schema": CHECKPOINT_SCHEMA, "identity": identity, "stage": stage,
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                        "originOutput": str(output), "files": files,
                        "directories": sorted(directories), "sourceBytes": total,
                    }
                    archive.writestr("checkpoint.json", json_bytes(manifest))
                sink.flush()
                os.fsync(sink.fileno())
        archive_identity = digest_file(temporary)
        path = destination / ("FCDO_Financial_Closed_Case_" + archive_identity["sha256"] + ".zip")
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            require(not path.is_symlink() and path.is_file()
                    and digest_file(path) == archive_identity,
                    "The complete closed-case checkpoint path belongs to another archive")
        parent = os.open(destination, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
        descriptor = {
            "path": str(path), **archive_identity, "identity": identity, "stage": stage,
            "files": len(files), "sourceBytes": total,
            "manifestSha256": hashlib.sha256(json_bytes(manifest)).hexdigest(),
            "attempts": list(state.get("continuationAttempts", [])),
        }
        state.setdefault("closedCaseCheckpoints", []).append(descriptor)
        checkpoint(state_path, state)
        print(json.dumps({"operation": OPERATION, "phase": "closed-case-checkpoint-retained",
                          "checkpoint": descriptor}, sort_keys=True), flush=True)
        return descriptor
    finally:
        temporary.unlink(missing_ok=True)


def upload_case_checkpoint(args, output, state, descriptor):
    """Use the unchanged official uploader in the producing namespace, if selected."""
    if not args.checkpoint_upload_helper:
        return
    helper = Path(args.checkpoint_upload_helper).expanduser().resolve(strict=True)
    require(helper.name == "library_upload.py" and helper.is_file()
            and all((helper.parent / name).is_file() for name in
                    ("library_hosted_apps.py", "library_file_transfer.py")),
            "Supply the current complete official Library upload helper and both companion files")
    path = Path(descriptor["path"])
    require(digest_file(path) == {key: descriptor[key] for key in ("bytes", "sha256")},
            "The complete closed-case archive changed before its original upload")
    uploads = state.setdefault("checkpointUploads", {})
    previous = uploads.get(descriptor["sha256"], {})
    if previous.get("status") == "succeeded":
        print(json.dumps({"operation": OPERATION, "phase": "closed-case-checkpoint-saved",
                          "checkpointSha256": descriptor["sha256"],
                          "libraryFileId": previous["libraryFileId"]}, sort_keys=True), flush=True)
        return
    request = {"uploads": [{"local_path": str(path), "purpose": "create_library_file",
                            "library_artifact_type": "other"}]}
    # One invocation processes one complete batch from closed stdin. Its helper
    # owns prepare, transfer and finalize; the programme does not recreate them.
    result = subprocess.run([sys.executable, str(helper)], input=json.dumps(request),
                            text=True, capture_output=True)
    receipt = {"returncode": result.returncode}
    try:
        response = json.loads(result.stdout)
    except (ValueError, TypeError):
        response = None
    items = response.get("results", []) if isinstance(response, dict) else []
    item = items[0] if len(items) == 1 and isinstance(items[0], dict) else {}
    if result.returncode == 0 and item.get("local_path") == str(path) \
            and item.get("status") == "succeeded" and item.get("library_file_id"):
        receipt.update(status="succeeded", libraryFileId=item["library_file_id"],
                       fileId=item.get("file_id"), fileName=item.get("file_name"),
                       currentVersionNumber=item.get("current_version_number"))
        # Preserve the unchanged helper's own application receipt after its
        # matching successful file result. Its private transport diagnostics
        # remain inside that helper invocation.
        prefix = "__OPENAI_LIBRARY_FILE_WRITE_RECEIPT_V1__="
        for line in result.stderr.splitlines():
            if not line.startswith(prefix):
                continue
            try:
                delivered = json.loads(line[len(prefix):])
            except (ValueError, TypeError):
                continue
            if (isinstance(delivered, dict)
                    and set(delivered) == {"sandbox_path", "file_id", "library_file_id"}
                    and delivered["sandbox_path"] == str(path)
                    and delivered["file_id"] == item.get("file_id")
                    and delivered["library_file_id"] == item["library_file_id"]):
                print(line, file=sys.stderr, flush=True)
    else:
        # The helper's per-file status is authoritative even when it exits zero.
        # Retain only its public structured failure; signed transport URLs and
        # borrowed runtime credentials never enter the operation's deliverables.
        receipt.update(status="failed", errorCode=item.get("error_code", "uploader_incomplete"),
                       message=item.get("message", "The original uploader returned no complete file receipt"))
    uploads[descriptor["sha256"]] = receipt
    checkpoint(output / "operation-state.json", state)
    print(json.dumps({"operation": OPERATION, "phase": "closed-case-checkpoint-upload",
                      "checkpointSha256": descriptor["sha256"], "result": receipt}, sort_keys=True), flush=True)
    require(receipt["status"] == "succeeded",
            "The closed-case archive is retained at " + str(path) + "; its original upload returned "
            + receipt.get("errorCode", "incomplete") + ": " + receipt.get("message", ""))
    return receipt



# The original complete receiving archive predates checkpoint.json. Its whole
# saved-file identity anchors this one legacy import; current archives use the
# complete per-member checkpoint manifest above.
ORIGINAL_COMPLETE_ARCHIVE = {
    "bytes": 21928589,
    "sha256": "08ea94052fe0f676a9cb0f88910b9887028aa0452996b77094647c992d64e639",
    "operationPrefix": "fcdo-financial-operation/",
    "caseId": "5fa5c6d7736b4f100d04b00c19d86bfbf58c9f8d619dfefa7b12e54c44390ecd",
    "finalRevision": 5,
    "sourceEdition": "516e9460a85a727c2e43d582614d245ec31a28b569c783ad0b7b70c9b7faea56",
}
COMPLETE_ARCHIVE_SCHEMA = "stellar-forge.iati-complete-receiving-archive.v1"


def restore_original_complete_archive(output, source, archive_identity):
    """Adopt the completed original case and retain its captured runtime/source."""
    require(archive_identity == {key: ORIGINAL_COMPLETE_ARCHIVE[key]
                                 for key in ("bytes", "sha256")},
            "Select the exact original complete receiving archive or a current closed-case checkpoint")
    prefix = ORIGINAL_COMPLETE_ARCHIVE["operationPrefix"]
    provenance = "restored-complete-archives/" + archive_identity["sha256"]
    state_path = output / "operation-state.json"
    marker_path = output / ".checkpoint-restore.json"
    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        names = [item.filename for item in entries]
        require(len(entries) <= CHECKPOINT_MAX_FILES and len(names) == len(set(names)),
                "The original complete receiving archive must retain unique members")
        require(all(not (item.flag_bits & 1)
                    and item.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                    for item in entries),
                "The original complete receiving archive encoding changed")
        state_member = prefix + "operation-state.json"
        require(state_member in names and archive.getinfo(state_member).file_size <= 16 * 1024 * 1024,
                "The complete original receiving archive must contain its operation state")
        original_state_raw = archive.read(state_member)
        original = load_json(original_state_raw)
        identity = {"operation": OPERATION, **{key: ORIGINAL_COMPLETE_ARCHIVE[key]
                                              for key in ("caseId", "finalRevision", "sourceEdition")}}
        require(original.get("schema") == SCHEMA and checkpoint_state_identity(original) == identity
                and original.get("state") == "COMPLETE",
                "Adopt the completed original case, revision and captured source edition")
        require(prefix + "reports/requests.json" in names and prefix + "reports/final-case.json" in names,
                "The original complete receiving archive must retain its requests and reviewed case")
        final = load_json(archive.read(prefix + "reports/final-case.json"))
        require(final.get("id") == identity["caseId"] and final.get("revision") == identity["finalRevision"],
                "The captured final report belongs to another financial case")
        files, directories, members, excluded, total = {}, set(), {}, {}, 0
        for info in entries:
            name = info.filename.rstrip("/") if info.is_dir() else info.filename
            checkpoint_member_name(name)
            mode = (info.external_attr >> 16) & 0o170000
            require(mode in ((0, stat.S_IFDIR) if info.is_dir() else (0, stat.S_IFREG)),
                    "The complete original receiving archive contains a non-native file member")
            if info.is_dir():
                descriptor = {"kind": "directory"}
            else:
                digest, count = hashlib.sha256(), 0
                with archive.open(info) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        count += len(chunk)
                        total += len(chunk)
                        require(total <= CHECKPOINT_MAX_BYTES,
                                "The complete original receiving archive exceeds its byte limit")
                        digest.update(chunk)
                require(count == info.file_size,
                        "An original complete archive member differs from its retained byte count")
                descriptor = {"kind": "file", "bytes": count, "sha256": digest.hexdigest()}
            members[info.filename] = descriptor
            if info.filename.startswith(prefix):
                relative = info.filename[len(prefix):].rstrip("/")
                if not relative:
                    continue
                checkpoint_member_name(relative)
                if checkpoint_excluded(Path(relative)):
                    excluded[info.filename] = descriptor
                    continue
                destination = relative
            else:
                destination = provenance + "/source/" + name
            checkpoint_member_name(destination)
            parts = destination.split("/")
            directories.update("/".join(parts[:index]) for index in range(1, len(parts)))
            if info.is_dir():
                require(destination not in files, "An original archive directory collides with a file")
                directories.add(destination)
            else:
                require(destination not in files and destination not in directories,
                        "An original archive file collides with another member")
                files[destination] = {"member": info.filename,
                                      **{key: descriptor[key] for key in ("bytes", "sha256")}}
        require(set(files).isdisjoint(directories)
                and "sender-workspace" in directories and "receiver-workspace" in directories,
                "Keep both complete original workspaces and their original directory structure")
        manifest = {
            "schema": COMPLETE_ARCHIVE_SCHEMA, "archive": archive_identity,
            "identity": identity, "operationPrefix": prefix,
            "members": members, "files": files, "directories": sorted(directories),
            "inactiveRuntimeMembers": excluded, "sourceBytes": total,
        }
        manifest_raw = json_bytes(manifest)
        restore = {"schema": COMPLETE_ARCHIVE_SCHEMA, **archive_identity,
                   "identity": identity, "manifestSha256": hashlib.sha256(manifest_raw).hexdigest(),
                   "provenanceDirectory": provenance}
        if marker_path.exists():
            require(not marker_path.is_symlink() and load_json(marker_path.read_bytes()) == restore,
                    "Continue the original complete receiving archive that began restoring here")
        else:
            require(all(path.name == ".reconciliation-receiving.lock" for path in output.iterdir()),
                    "Adopt the original complete case into a new private operation directory")
            retained(marker_path, restore)
        for name in sorted(directories, key=lambda value: (value.count("/"), value)):
            private_directory(output / name)
        for name, descriptor in sorted(files.items()):
            if name == "operation-state.json":
                continue
            target = output / name
            expected = {key: descriptor[key] for key in ("bytes", "sha256")}
            if target.exists() or target.is_symlink():
                require(not target.is_symlink() and target.is_file() and digest_file(target) == expected,
                        "An existing original receiving member differs: " + name)
                continue
            with archive.open(descriptor["member"]) as incoming, complete_retained_file(target, expected) as sink:
                shutil.copyfileobj(incoming, sink, 1024 * 1024)
        manifest_path = output / provenance / "archive-members.json"
        original_state_path = output / provenance / "original-operation-state.json"
        retained(manifest_path, manifest_raw)
        retained(original_state_path, original_state_raw)
        if state_path.exists() or state_path.is_symlink():
            require(not state_path.is_symlink() and state_path.is_file()
                    and state_path.read_bytes() == original_state_raw,
                    "The destination already contains a different original operating state")
        else:
            retained(state_path, original_state_raw)
        original["restoredCheckpoint"] = restore
        original.setdefault("adoptedCompleteArchives", {})[archive_identity["sha256"]] = {
            "archive": archive_identity, "identity": identity,
            "manifestFile": str(manifest_path.relative_to(output)),
            "originalStateFile": str(original_state_path.relative_to(output)),
            "members": len(members), "sourceBytes": total,
        }
        checkpoint(state_path, original)
        marker_path.unlink(missing_ok=True)
        directory = os.open(output, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        print(json.dumps({"operation": OPERATION, "phase": "original-complete-case-restored",
                          "checkpoint": restore, "output": str(output)}, sort_keys=True), flush=True)


def restore_case_checkpoint(output, source):
    """Receive one exact saved operation, with a resumable, non-overwriting copy."""
    source = Path(source).expanduser().resolve(strict=True)
    require(source.is_file(), "Select the complete closed-case ZIP")
    archive_identity = digest_file(source)
    state_path = output / "operation-state.json"
    marker_path = output / ".checkpoint-restore.json"
    require(not state_path.is_symlink() and (not state_path.exists() or state_path.is_file()),
            "The checkpoint destination state must be an original regular file")
    if state_path.is_file():
        current = load_json(state_path.read_bytes())
        prior = current.get("restoredCheckpoint")
        if prior and prior.get("sha256") == archive_identity["sha256"]:
            require(current.get("schema") == SCHEMA and current.get("operation") == OPERATION,
                    "The restored checkpoint must continue the original receiving operation")
            return
    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        names = [item.filename for item in entries]
        require(len(entries) <= CHECKPOINT_MAX_FILES + 1 and len(names) == len(set(names)),
                "The closed-case ZIP must have a complete unique member list")
        require(all(not (item.flag_bits & 1)
                    and item.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                    for item in entries),
                "The closed-case ZIP must use the original complete archive encoding")
        if "checkpoint.json" not in names:
            return restore_original_complete_archive(output, source, archive_identity)
        require("checkpoint.json" in names and archive.getinfo("checkpoint.json").file_size <= 16 * 1024 * 1024,
                "The closed-case ZIP must retain its complete checkpoint manifest")
        manifest_raw = archive.read("checkpoint.json")
        manifest = load_json(manifest_raw)
        require(manifest.get("schema") == CHECKPOINT_SCHEMA
                and manifest.get("identity", {}).get("operation") == OPERATION,
                "Select this original financial receiving operation's closed checkpoint")
        files, directories = manifest.get("files"), manifest.get("directories")
        require(isinstance(files, dict) and isinstance(directories, list)
                and len(directories) == len(set(directories))
                and len(directories) <= CHECKPOINT_MAX_FILES,
                "The closed-case checkpoint must retain its exact files and directories")
        for name in [*files, *directories]:
            checkpoint_member_name(name)
            require(not checkpoint_excluded(Path(name)),
                    "Private live connections and temporary runtime paths do not belong in a closed checkpoint")
        require(set(files).isdisjoint(directories)
                and set(names) == {"checkpoint.json", *("operation/" + name for name in files)},
                "The closed-case manifest must describe every original archive member")
        directory_set = set(directories)
        for name in [*files, *directories]:
            parts = name.split("/")
            require(all("/".join(parts[:index]) in directory_set for index in range(1, len(parts))),
                    "The closed-case manifest must preserve every parent directory")
        total = 0
        for name, identity in files.items():
            require(isinstance(identity, dict) and type(identity.get("bytes")) is int
                    and identity["bytes"] >= 0
                    and re.fullmatch(r"[0-9a-f]{64}", str(identity.get("sha256", ""))),
                    "Every original closed-case file requires its exact size and SHA256")
            info = archive.getinfo("operation/" + name)
            mode = (info.external_attr >> 16) & 0o170000
            require(info.file_size == identity["bytes"] and not info.is_dir()
                    and mode in (0, stat.S_IFREG) and not (info.flag_bits & 1),
                    "The complete closed-case ZIP contains a changed member descriptor")
            total += info.file_size
        require(total == manifest.get("sourceBytes") and total <= CHECKPOINT_MAX_BYTES,
                "The complete closed-case byte count differs from its manifest")
        require("operation-state.json" in files and "sender-workspace" in directories
                and "receiver-workspace" in directories and "reports/requests.json" in files,
                "Receive both original workspaces, operation state and complete original request set")
        require(files["operation-state.json"]["bytes"] <= 16 * 1024 * 1024,
                "The complete original operation state exceeds its descriptor limit")
        original_state_raw = archive.read("operation/operation-state.json")
        require(files["operation-state.json"] == {
                    "bytes": len(original_state_raw), "sha256": hashlib.sha256(original_state_raw).hexdigest()},
                "The restored operation state differs from the complete original manifest")
        original = load_json(original_state_raw)
        require(original.get("schema") == SCHEMA
                and checkpoint_state_identity(original) == manifest["identity"],
                "The restored case, revision and source edition must match the original closed operation")
        restore = {"schema": CHECKPOINT_SCHEMA, **archive_identity,
                   "manifestSha256": hashlib.sha256(manifest_raw).hexdigest(),
                   "identity": manifest["identity"]}
        existing = list(output.iterdir())
        if marker_path.exists():
            require(not marker_path.is_symlink() and load_json(marker_path.read_bytes()) == restore,
                    "Continue the exact original checkpoint that began restoring here")
        else:
            require(all(path.name == ".reconciliation-receiving.lock" for path in existing),
                    "Restore into a new private operation directory")
            retained(marker_path, restore)
        for name in sorted(directories, key=lambda value: (value.count("/"), value)):
            private_directory(output / name)
        # State is published last. An interrupted restore resumes these immutable
        # byte copies through its original restore marker without resetting work.
        for name, identity in sorted(files.items()):
            if name == "operation-state.json":
                continue
            path = output / name
            if path.exists() or path.is_symlink():
                require(not path.is_symlink() and path.is_file() and digest_file(path) == identity,
                        "An existing restore member belongs to another case: " + name)
                continue
            with archive.open("operation/" + name) as original_file, complete_retained_file(path, identity) as target:
                shutil.copyfileobj(original_file, target, 1024 * 1024)
        if state_path.exists() or state_path.is_symlink():
            require(not state_path.is_symlink() and state_path.is_file()
                    and state_path.read_bytes() == original_state_raw,
                    "The destination already contains a different operating state")
        else:
            retained(state_path, original_state_raw)
        original["restoredCheckpoint"] = restore
        checkpoint(state_path, original)
        marker_path.unlink(missing_ok=True)
        print(json.dumps({"operation": OPERATION, "phase": "closed-case-checkpoint-restored",
                          "checkpoint": restore, "output": str(output)}, sort_keys=True), flush=True)


def installed_source_edition(output):
    """Use the original managed and nested packet source inventories verbatim."""
    binding = inspect_binding(output / "sender-workspace")
    files = {
        "application": binding["source"],
        "organisation": {name: digest_file(path)
                         for name, path in organisation_source_files().items()},
    }
    return {"schema": "stellar-forge.iati-receiving-source-edition.v1",
            "sha256": hashlib.sha256(json_bytes(files)).hexdigest(), "files": files}


def require_source_edition(output, edition):
    require(installed_source_edition(output) == edition,
            "The installed source changed during this operation; rerun the same command and output directory")


def edition_record(state):
    return state["sourceEditions"][state["sourceEdition"]]


def edition_directory(output, state, kind):
    return private_directory(output / kind / "editions" / state["sourceEdition"])


def edition_phase(output, state, name, **details):
    entry = edition_record(state)
    entry.update(details)
    entry["updatedAt"] = datetime.now(timezone.utc).isoformat()
    if name not in entry["stages"]:
        entry["stages"].append(name)
    phase(output, state, name, **details)


def activate_source_edition(output, state, edition):
    identifier = edition["sha256"]
    if not state.get("sourceEdition") and state.get("nativePacket"):
        # Earlier programme editions used one delivery path. Keep their actual
        # outputs available while the same saved case receives a current export.
        previous = {key: deepcopy(state[key]) for key in (
            "nativePacket", "files", "deliveryIndex", "receiving", "operatorResult"
        ) if key in state}
        state.setdefault("previousDeliveries", {}).setdefault(
            state["nativePacket"]["sha256"], previous)
    state.setdefault("sourceEditions", {}).setdefault(identifier, {
        "sha256": identifier, "stages": [], "state": "IN_PROGRESS",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    state["sourceEdition"] = identifier
    report = edition_directory(output, state, "reports") / "installed-source.json"
    retained(report, edition)
    edition_record(state)["installedSource"] = str(report.relative_to(output))
    checkpoint(output / "operation-state.json", state)


def local_tag(element):
    return element.tag.rsplit("}", 1)[-1]


def child(element, name):
    return next((x for x in element if local_tag(x) == name), None)


def raw_budget(node):
    value = child(node, "value")
    start, end = child(node, "period-start"), child(node, "period-end")
    return {
        "attributes": dict(node.attrib),
        "period": {"start": start.get("iso-date") if start is not None else None,
                   "end": end.get("iso-date") if end is not None else None},
        "value": {"amount": "".join(value.itertext()).strip() if value is not None else None,
                  "currency": value.get("currency") if value is not None else None,
                  "valueDate": value.get("value-date") if value is not None else None},
        "narratives": ["".join(x.itertext()).strip() for x in node if local_tag(x) == "narrative"],
    }


def inspect_original_inputs(args, output):
    organisation = Path(args.organisation_source).expanduser().resolve()
    activity = Path(args.activity_source).expanduser().resolve()
    for path, expected in ((organisation, ORG_SOURCE), (activity, ACTIVITY_SOURCE)):
        actual = source_identity(path)
        require(actual == {k: expected[k] for k in ("bytes", "sha256")},
                "Select the exact complete retained publisher XML: " + str(path))
    acquisition = load_json(Path(args.organisation_acquisition).read_bytes())
    org_receipt = next((r for r in acquisition.get("original_receipts", [])
                        if r.get("name") == "publisher/fcdo-organisation.xml"), None)
    require(org_receipt is not None and org_receipt.get("status") == 200
            and org_receipt.get("actual_bytes", org_receipt.get("bytes")) == ORG_SOURCE["bytes"]
            and org_receipt.get("actual_sha256", org_receipt.get("sha256")) == ORG_SOURCE["sha256"],
            "Retain the original successful organisation publisher receipt")
    activity_receipt = load_json(Path(args.activity_receipt).read_bytes())
    require(activity_receipt.get("http_status") == 200
            and activity_receipt.get("bytes") == ACTIVITY_SOURCE["bytes"]
            and activity_receipt.get("sha256") == ACTIVITY_SOURCE["sha256"],
            "Retain the original successful activity publisher receipt")
    with plain_source(organisation) as source:
        root = ET.parse(source).getroot()
    org_nodes = [x for x in root if local_tag(x) == "iati-organisation"]
    require(len(org_nodes) == 1, "The retained organisation source must contain one FCDO organisation")
    raw_org = [raw_budget(x) for x in org_nodes[0] if local_tag(x) == "total-budget"]
    selected_org = [x for x in raw_org if x["period"] == PERIOD]
    require(len(selected_org) == 1, "Select the original FY2026/27 organisation total budget")
    selected_org = selected_org[0]
    require(selected_org["value"] == {
        "amount": "6815000000", "currency": "GBP", "valueDate": "2026-03-31"
    } and selected_org["attributes"].get("status") == "1",
            "The complete original organisation financial context differs")
    qualification = "\n\n".join(selected_org["narratives"])
    require("Collated Planning Budgets" in qualification and "pipeline" in qualification
            and "not yet been allocated" in qualification,
            "Retain the publisher's original planning-budget qualification")
    activity_count, selected_child = 0, None
    with plain_source(activity) as source:
        for _, node in ET.iterparse(source, events=("end",)):
            if local_tag(node) != "iati-activity":
                continue
            activity_count += 1
            identifier = child(node, "iati-identifier")
            if identifier is not None and "".join(identifier.itertext()).strip() == CHILD:
                require(selected_child is None, "The original publisher repeats the selected child activity")
                selected_child = {
                    "id": CHILD, "attributes": dict(node.attrib),
                    "budgets": [raw_budget(x) for x in node if local_tag(x) == "budget"],
                    "transactionCount": sum(local_tag(x) == "transaction" for x in node),
                }
            node.clear()
    require(activity_count == 1332 and selected_child is not None
            and len(selected_child["budgets"]) == 6 and selected_child["transactionCount"] == 11,
            "Read the complete original activity publication and selected WADI child")
    selected_quarters = sorted(
        (x for x in selected_child["budgets"]
         if x["period"]["start"] >= PERIOD["start"] and x["period"]["end"] <= PERIOD["end"]),
        key=lambda x: x["period"]["start"])
    require([(x["period"]["start"], x["period"]["end"], x["value"]["amount"])
             for x in selected_quarters] == list(EXPECTED_QUARTERS)
            and all(x["attributes"].get("type") == "1" and "status" not in x["attributes"]
                    and x["value"]["currency"] == "GBP" and x["value"]["valueDate"] == "2025-09-18"
                    for x in selected_quarters),
            "Preserve the four actual quarters, their reported type, absent status attribute and value date")
    source = {
        "organisation": {**ORG_SOURCE, "generatedAt": root.get("generated-datetime"),
                         "retrievedAt": org_receipt.get("observed_at"),
                         "selectedRecord": selected_org},
        "activity": {**ACTIVITY_SOURCE, "retrievedAt": activity_receipt["retrieved_at"],
                     "activities": activity_count, "selectedChild": selected_child},
        "selectedQuarters": selected_quarters,
        "nativeBudgetStatus": {"effective": "1", "label": "Indicative", "source": "standard-default"},
        "publisherQualification": qualification,
        "acquisitionFiles": {"organisation": str(Path(args.organisation_acquisition).resolve()),
                             "activity": str(Path(args.activity_receipt).resolve())},
    }
    retained(output / "publisher" / "source-context.json", source)
    retained(output / "publisher" / "organisation-acquisition.json", acquisition)
    retained(output / "publisher" / "activity-receipt.json", activity_receipt)
    return organisation, activity, org_receipt, source


def all_catalog(work, selection, section):
    rows, snapshot, total = [], None, None
    while total is None or len(rows) < total:
        raw = {**selection, "section": section, "offset": len(rows), "limit": 250}
        if snapshot is not None:
            raw["expectedSnapshot"] = snapshot
        page = work.catalog(raw)
        if total is None:
            snapshot, total = page["snapshotSha256"], page["total"]
        require(page["snapshotSha256"] == snapshot and page["total"] == total
                and page["offset"] == len(rows), "The original financial register changed while paging")
        require(page["rows"] or len(rows) == total, "The original financial register did not advance")
        rows.extend(page["rows"])
    require(len(rows) == total and len({r["id"] for r in rows}) == total,
            "The complete selected financial register has missing or repeated rows")
    return rows


def original_portfolio(workspace, activity, output, actor):
    with plain_source(activity) as source:
        entry = workspace.add_source(source, "FCDO original full activity publication, 24 September 2026",
                                     "FCDO-set-20.xml")
    require(entry["id"] == ACTIVITY_SOURCE["sha256"], "The complete original activity source changed")
    request = {
        "requestId": OPERATION + "-activity-portfolio",
        "name": "WADI child 401 — complete FY2026/27 original budgets",
        "notes": "The full original FCDO publisher XML is retained. Select child GB-GOV-1-400043-401, "
                 "GBP and the four whole FY2026/27 original quarterly budgets. Native status 1 is the "
                 "IATI standard default because each raw budget omits its status attribute.",
        "sources": [ACTIVITY_SOURCE["sha256"]],
        "selection": {"activityIds": [CHILD], "currencies": ["GBP"], "budgetTypes": ["1"],
                      "dateFrom": PERIOD["start"], "dateTo": PERIOD["end"]},
        "review": {"status": "draft", "reviewer": "", "note": "Financial coverage review follows in the linked comparison."},
    }
    retained(output / "requests" / "activity-portfolio.json", request)
    portfolio = workspace.save_portfolio(request)
    require(portfolio["report"]["counts"]["activities"] == 1
            and portfolio["report"]["counts"]["budgets"] == 4,
            "The original native portfolio must retain all four selected quarterly budgets")
    retained(output / "reports" / "original-activity-portfolio.json", portfolio)
    return portfolio


def original_organisation(workspace, organisation, receipt, output, args):
    if args.organisation_packet:
        packet = Path(args.organisation_packet).expanduser().resolve()
        result = workspace.organisation.receive({"path": packet})
        plan = result["plan"]
        require(plan["sourceId"] == ORG_SOURCE["sha256"],
                "The received original organisation plan belongs to another publisher edition")
        profile = workspace.organisation.profile(plan["sourceId"])
        matches = [x for x in profile["organisations"] if x["identifier"] == REPORTER]
        require(len(matches) == 1 and matches[0]["key"] in plan["organisationKeys"],
                "Select FCDO from the received original organisation plan")
        key = matches[0]["key"]
        retained(output / "publisher" / "organisation-original-packet.json", {
            **digest_file(packet), "planId": plan["id"], "revision": plan["revision"],
            "sourceId": plan["sourceId"], "candidateSha256": plan["candidateSha256"],
        })
    else:
        with plain_source(organisation) as source:
            entry = workspace.add_source(source, "FCDO original organisation publication, 15 June 2026",
                                         "fcdo-organisation.xml")
        require(entry["id"] == ORG_SOURCE["sha256"], "The complete original organisation source changed")
        profile = workspace.organisation.profile(entry["id"])
        matches = [x for x in profile["organisations"] if x["identifier"] == REPORTER]
        require(len(matches) == 1 and profile["budgetCount"] == 148 and profile["documentCount"] == 80,
                "The original organisation assessment must retain the complete publisher register")
        key = matches[0]["key"]
        request = {
            "requestId": OPERATION + "-organisation-baseline",
            "name": "FCDO original planning baseline for financial coverage",
            "sourceId": ORG_SOURCE["sha256"], "organisationKeys": [key],
            "assessment": {"asOf": "2026-10-12", "fiscalYearStart": "2026-04-01",
                           "forwardYears": 3, "methodology": "pwyf2026"},
            "acquisition": {
                "sourceUrl": receipt["final_url"], "retrievedAt": receipt["observed_at"],
                "licence": "UK Open Government Licence",
                "licenceUrl": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
                "notes": "Use the complete original FCDO source and retained successful HTTP acquisition."
            },
            "edits": [], "actor": args.actor,
            "notes": "An assessed, unedited planning baseline for explicit financial coverage. "
                     "The complete original document and methodology findings remain with this source.",
        }
        retained(output / "requests" / "organisation-baseline.json", request)
        plan = workspace.organisation.save(request)
    retained(output / "reports" / "original-organisation-plan.json", plan)
    return plan, key


def amount_equal(value, expected):
    return value is not None and Decimal(value) == Decimal(expected)


def comparison_context(report):
    require(len(report["comparisons"]) == 1, "Retain one explicit original organisation comparison")
    return report["comparisons"][0]


def decision_note(code, scope, source, selected_rows):
    if code == "nominal-value-date":
        return "Compare the original GBP nominal amounts explicitly: activity value date 2025-09-18; organisation value date 2026-03-31. Both dates remain visible."
    if code == "selected-coverage":
        return scope
    if code == "period-coverage":
        return "The current scope intentionally selects the first three quarters. The original 2027-01-01 to 2027-03-31 quarter remains retained in the linked native portfolio and earlier reviewed comparison."
    if code == "activity-source-review":
        codes = sorted({str(issue.get("code", "original-source-finding"))
                        for row in selected_rows for issue in row["originalIssues"]})
        return ("Reviewed the original publisher findings carried with these selected activity rows. "
                "Original issue codes: " + ", ".join(codes) +
                ". Each complete finding and owning source row remains in the retained JSON report.")
    if code == "organisation-source-review":
        return "Retain the original organisation finding and its complete assessed source. The selected value is an indicative collated planning budget; the original publisher qualification is reproduced in the scope."
    return "Reviewed the complete original comparison finding and source records in the retained report. Scope: " + scope


def decided_definition(work, definition, actor, source, selected_rows):
    preview = work.preview(definition)
    errors = [x for x in preview["issues"] if x["severity"] == "error"]
    require(not errors, "Resolve original source/calculation errors before approving financial coverage: "
            + json.dumps(errors, ensure_ascii=False))
    decisions = [{
        "issueId": item["id"], "decision": "acknowledge", "actor": actor,
        "note": decision_note(item["code"], definition["comparisons"][0]["scopeStatement"], source, selected_rows)
    } for item in preview["issues"]]
    return {**definition, "decisions": decisions}


def save_request(work, output, label, request, lost_ack=False):
    retained(output / "requests" / (label + ".json"), request)
    if lost_ack:
        # Deliberately discard the write reply; recover its exact committed result
        # through the product's original request readback before taking another step.
        work.save(request)
        record = work.request(request["requestId"])
        require(record["state"] == "RECORDED", "Recover the committed comparison from its original request ID")
        result = record["case"]
    else:
        result = work.save(request)
    retained(output / "reports" / (label + ".json"), result)
    return result


def review_request(work, output, label, case, actor, note):
    request = {
        "requestId": OPERATION + "-" + label, "id": case["id"],
        "expectedRevision": case["revision"], "decision": "approve",
        "actor": actor, "note": note,
        "acknowledgedIssueIds": [x["id"] for x in case["report"]["issues"] if x["severity"] != "information"],
    }
    retained(output / "requests" / (label + ".json"), request)
    result = work.review(request)
    retained(output / "reports" / (label + ".json"), result)
    return result, request


def report_files(work, output, name, case, directory=None):
    result = {}
    for kind, extension in (("report", "html"), ("csv", "csv"), ("json", "json")):
        descriptor = work.file({"id": case["id"], "revision": case["revision"], "kind": kind})
        target = (directory or output / "delivery") / (name + "." + extension)
        identity = retained_copy(target, descriptor["path"])
        require(identity == {k: descriptor[k] for k in ("bytes", "sha256")},
                "The complete original report descriptor differs")
        result[kind] = {"file": str(target.relative_to(output)),
                        **{k: descriptor[k] for k in ("bytes", "sha256", "media", "name")}}
    return result


def delivery_index(output, source, full_year, current, directory, link_prefix="", current_index=False):
    escape = lambda value: html.escape(str(value), quote=True)
    full, changed = comparison_context(full_year["report"]), comparison_context(current["report"])
    rows = []
    for label, stem, case, comparison in (
        ("Reviewed full financial year", "FCDO_WADI_Full_Year_Reviewed", full_year, full),
        ("Current reviewed three-quarter selection", "FCDO_WADI_Current_Selection_Reviewed", current, changed),
    ):
        amount = format(Decimal(comparison["selectedAmount"]), ",f")
        links = " · ".join('<a href="' + escape(link_prefix + stem + "." + suffix) + '">' + label + "</a>"
                           for suffix, label in (("html", "Read report"), ("csv", "CSV"), ("json", "Complete JSON")))
        rows.append("<tr><th scope=\"row\">" + escape(label) + "</th><td>" + str(case["revision"])
                    + "</td><td>GBP " + escape(amount) + "</td><td>" + str(comparison["eligibleCount"])
                    + "</td><td>" + links + "</td></tr>")
    page = (
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>FCDO · WADI financial coverage review</title><style>"
        "*{box-sizing:border-box}body{margin:0;background:#fff;color:#161616;"
        "font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}"
        "main{max-width:1080px;margin:auto;padding:32px 20px 64px}h1{font-size:30px;line-height:1.2}"
        "h2{font-size:21px;margin:32px 0 12px}p{max-width:84ch}a{color:inherit;text-underline-offset:3px}"
        "table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:12px;text-align:left;"
        "vertical-align:top;border:1px solid #d6d6d6}th{font-weight:600}.scroll{overflow:auto}"
        ".source{padding:16px;border:1px solid #d6d6d6;background:#fafafa}"
        "code{overflow-wrap:anywhere}li{margin:8px 0}a:focus-visible{outline:2px solid #161616;outline-offset:4px}"
        "@media(max-width:600px){main{padding:20px 14px}h1{font-size:25px}th,td{padding:10px}}"
        "</style><main><p>Retained IATI financial review</p><h1>FCDO · WADI financial coverage</h1>"
        "<p>Open either reviewed scope below. Both use the complete original FCDO organisation and activity "
        "publications and preserve the same underlying organisation plan and four-quarter native activity portfolio.</p>"
        "<div class=\"scroll\"><table><thead><tr><th scope=\"col\">Scope</th><th scope=\"col\">Revision</th>"
        "<th scope=\"col\">Selected nominal amount</th><th scope=\"col\">Whole quarters</th><th scope=\"col\">Files</th>"
        "</tr></thead><tbody>" + "".join(rows) + "</tbody></table></div>"
        "<h2>Financial context</h2><p>The organisation's FY2026/27 indicative planning budget is GBP "
        + escape(format(Decimal(full["organisationAmount"]), ",f"))
        + ". The selected activity is <code>" + escape(CHILD) + "</code>. Its values are dated 18 September 2025; "
        "the organisation value is dated 31 March 2026. These reviews expressly compare the reported GBP nominal "
        "amounts while retaining both dates and the selected scope.</p>"
        "<p>Organisation budget status 1 is reported. The four activity budgets omit status in their original XML; "
        "the original native mapper applies indicative status 1 with standard-default provenance.</p>"
        "<p>The current selection contains the first three whole quarters. The fourth quarter remains retained "
        "in the original portfolio and earlier full-year review. The numerical difference is interpreted within "
        "the selected child and periods.</p>"
        "<h2>Original publisher qualification</h2><div class=\"source\"><p>"
        + escape(source["publisherQualification"]).replace("\n\n", "</p><p>") + "</p></div>"
        "<h2>Open the complete retained work</h2><p><a href=\"" + escape(link_prefix + "FCDO_WADI_Financial_Reconciliation.zip") + "\">"
        "Download the complete financial receiving packet</a>. It carries all five comparison revisions, "
        "their original requests and named reviews, and both complete original organisation and activity packets.</p>"
        "<p>Case <code>" + escape(current["id"]) + "</code>. Named internal reviewer: "
        + escape(current["review"]["actor"]) + ".</p>"
        "<ul><li><a href=\"" + escape(ORG_SOURCE["url"]) + "\">Original FCDO organisation publication</a></li>"
        "<li><a href=\"" + escape(ACTIVITY_SOURCE["url"]) + "\">Original complete FCDO activity publication</a></li></ul>"
        "<p>The packet retains the exact source editions used for these reports.</p></main></html>"
    ).encode("utf-8")
    path = directory / "index.html"
    if current_index:
        require(not path.is_symlink(), "The current delivery index must be an original regular file")
        if path.exists() and path.read_bytes() != page:
            retained(directory / ("index-before-" + digest_file(path)["sha256"] + ".html"), path.read_bytes())
        checkpoint(path, page)
    else:
        retained(path, page)
    return {"file": str(path.relative_to(output)), **digest_file(path)}



def prepare(args, output, state):
    organisation_path, activity_path, org_receipt, source = inspect_original_inputs(args, output)
    phase(output, state, "complete-original-publisher-intake",
          sourceIdentities={"organisation": ORG_SOURCE, "activity": ACTIVITY_SOURCE})
    sender = output / "sender-workspace"
    with IatiWorkspace(sender, create=not sender.exists()) as workspace:
        organisation, key = original_organisation(workspace, organisation_path, org_receipt, output, args)
        portfolio = original_portfolio(workspace, activity_path, output, args.actor)
        selection = {
            "organisation": {"id": organisation["id"], "revision": organisation["revision"], "organisationKey": key},
            "portfolios": [{"id": portfolio["id"], "revision": portfolio["revision"]}],
        }
        phase(output, state, "original-assessed-organisation-and-native-activity-portfolio",
              selector=selection, organisationValidation=organisation.get("validation"),
              activityPortfolio={"id": portfolio["id"], "revision": portfolio["revision"], "counts": portfolio["report"]["counts"]})
        work = workspace.reconciliation
        organisation_rows = all_catalog(work, selection, "organisation")
        activity_rows = all_catalog(work, selection, "activity")
        org_matches = [x for x in organisation_rows if x["family"] == "total-budget"
                       and x["period"]["start"] == PERIOD["start"] and x["period"]["end"] == PERIOD["end"]]
        require(len(org_matches) == 1, "Find the exact original fiscal-year total budget in the retained candidate")
        org_row = org_matches[0]
        require(org_row["calculation"]["eligible"] is True
                and amount_equal(org_row["calculation"]["amount"], "6815000000")
                and org_row["value"]["currency"] == "GBP" and org_row["value"]["valueDate"] == "2026-03-31"
                and org_row["status"]["effective"] == "1",
                "The native organisation financial assessment differs from the actual original record")
        quarters = sorted((x for x in activity_rows if x["collection"] == "budgets"
                           and x["activityId"] == CHILD), key=lambda x: x["period"]["start"])
        require(len(quarters) == 4 and
                [(x["period"]["start"], x["period"]["end"], x["amount"]) for x in quarters] == list(EXPECTED_QUARTERS)
                and all(x["eligibility"] and x["currency"] == "GBP" and x["valueDate"] == "2025-09-18"
                        and x["budgetType"] == "1" and x["budgetStatus"] == "1"
                        and x["sourceId"] == ACTIVITY_SOURCE["sha256"] for x in quarters),
                "The original activity engine must preserve the four actual source quarters and effective status")
        require(sum((Decimal(x["amount"]) for x in quarters), Decimal(0)) == Decimal("1500000"),
                "The complete original quarterly nominal amount differs")
        retained(output / "reports" / "selected-native-records.json", {
            "organisation": org_row, "activity": quarters,
            "rawBudgetStatus": {"present": False, "native": source["nativeBudgetStatus"]},
        })
        prefix = (
            "Selected coverage: WADI child GB-GOV-1-400043-401 only, original GBP budgets, "
            "one child hierarchy, full retained FCDO publisher edition. "
            "The organisation record is the FY2026/27 GBP6,815,000,000 indicative planning budget "
            "dated 2026-03-31. Activity budgets are dated 2025-09-18. "
            "Organisation status 1 is reported; each activity budget omits its status attribute, "
            "so the original mapper supplies indicative status 1 with standard-default provenance. "
            "The difference describes this selected scope; it is not a whole-organisation funding gap. "
            "Publisher qualification: " + source["publisherQualification"]
        )
        full_scope = prefix + " Selected periods: all four complete quarters, 2026-04-01 through 2027-03-31."
        definition = {
            **selection, "name": "FCDO — WADI selected financial coverage, FY2026/27",
            "notes": "Actual retained source operation. Native source eligibility, whole budget periods, "
                     "reported decimals and original default provenance remain with each selected row.",
            "comparisons": [{"organisationRowId": org_row["id"], "activityRowIds": [r["id"] for r in quarters],
                             "coverage": "selected", "scopeStatement": full_scope, "valueDatePolicy": "separate"}],
            "decisions": [],
        }
        separate_request = {**definition, "requestId": OPERATION + "-separate-dates"}
        separate = save_request(work, output, "separate-dates", separate_request)
        comparison = comparison_context(separate["report"])
        require(comparison["selectedAmount"] is None and comparison["difference"] is None
                and comparison["eligibleCount"] == 0 and comparison["excludedCount"] == 4
                and all("value-date" in x["reasons"] for x in comparison["excludedRows"]),
                "Separate dated contexts must retain and exclude all four differing-date activity amounts")
        nominal_definition = deepcopy(definition)
        nominal_definition["comparisons"][0]["valueDatePolicy"] = "nominal"
        nominal_definition = decided_definition(work, nominal_definition, args.actor, source, quarters)
        nominal_request = {**nominal_definition, "requestId": OPERATION + "-nominal-dates",
                           "id": separate["id"], "expectedRevision": separate["revision"]}
        nominal = save_request(work, output, "nominal-dates", nominal_request)
        comparison = comparison_context(nominal["report"])
        require(amount_equal(comparison["selectedAmount"], "1500000")
                and amount_equal(comparison["difference"], "6813500000")
                and comparison["eligibleCount"] == 4 and comparison["excludedCount"] == 0
                and comparison["valueDates"] == ["2025-09-18", "2026-03-31"],
                "Explicit nominal comparison must preserve the exact four-quarter sum and both original dates")
        reviewed, full_review_request = review_request(
            work, output, "full-year-review", nominal, args.actor,
            "Reviewed the four actual original WADI quarterly budgets and the complete retained organisation "
            "planning qualification. The selected nominal GBP comparison retains both value dates, the "
            "original indicative status provenance and partial organisation coverage.")
        require(work.save(nominal_request) == nominal and work.review(full_review_request) == reviewed,
                "Original save and review requests must reopen their exact historical replies")
        phase(output, state, "separate-and-explicit-nominal-review-with-original-request-replay",
              caseId=reviewed["id"], separateRevision=separate["revision"],
              nominalRevision=nominal["revision"], reviewedRevision=reviewed["revision"])
        changed_definition = deepcopy(nominal_definition)
        changed_definition["decisions"] = []
        changed_definition["comparisons"][0]["activityRowIds"] = [r["id"] for r in quarters[:3]]
        changed_definition["comparisons"][0]["scopeStatement"] = (
            prefix + " Current selection: three complete quarters, 2026-04-01 through 2026-12-31. "
            "The fourth quarter remains retained in the original portfolio and the earlier full-year review."
        )
        changed_definition = decided_definition(work, changed_definition, args.actor, source, quarters[:3])
        changed_request = {**changed_definition, "requestId": OPERATION + "-changed-selection",
                           "id": reviewed["id"], "expectedRevision": reviewed["revision"]}
        changed = save_request(work, output, "changed-selection", changed_request, lost_ack=True)
        comparison = comparison_context(changed["report"])
        require(amount_equal(comparison["selectedAmount"], "990791")
                and comparison["eligibleCount"] == 3
                and any(x["code"] == "period-coverage" for x in changed["report"]["issues"]),
                "Changed selection must retain the actual three-quarter amount and its explicit period gap")
        final, changed_review_request = review_request(
            work, output, "changed-selection-review", changed, args.actor,
            "Reviewed the deliberate first-three-quarter scope and the original period-coverage finding. "
            "The fourth quarter and the complete full-year reviewed comparison remain available in the "
            "same retained source history; the publisher XML and activity portfolio are unchanged.")
        compare_request = {
            "before": {"id": reviewed["id"], "revision": reviewed["revision"]},
            "after": {"id": final["id"], "revision": final["revision"]},
        }
        historical = work.compare(compare_request)
        require(historical["sourceChanges"]["before"] == historical["sourceChanges"]["after"]
                and historical["summary"]["changed"] == 1 and not historical["ambiguous"],
                "Historical comparison must identify selection change over the same original source editions")
        retained(output / "requests" / "historical-comparison.json", compare_request)
        retained(output / "reports" / "historical-comparison.json", historical)
        require(work.request(changed_request["requestId"])["case"] == changed
                and work.save(changed_request) == changed
                and work.request(full_review_request["requestId"])["case"] == reviewed,
                "Lost-ack and historical requests must retain their original revision after later review")
        requests = {"separate": separate_request, "nominal": nominal_request,
                    "fullReview": full_review_request, "changed": changed_request,
                    "changedReview": changed_review_request, "compare": compare_request}
        retained(output / "reports" / "requests.json", requests)
        retained(output / "reports" / "final-case.json", final)
        phase(output, state, "changed-selection-comparison-saved",
              changedRevision=changed["revision"], finalRevision=final["revision"],
              reviewActor=args.actor, selectionChange=historical["summary"])

    return requests


def publish_source_edition(output, state, edition):
    entry = edition_record(state)
    completed = "changed-selection-comparison-and-complete-nested-export" in entry["stages"]
    if completed:
        for key in ("files", "deliveryIndex", "currentDeliveryIndex", "nativePacket"):
            state[key] = entry[key]
        packet = output / entry["nativePacket"]["file"]
        files_present = all((output / descriptor["file"]).is_file()
                            and not (output / descriptor["file"]).is_symlink()
                            for scope in entry["files"].values() for descriptor in scope.values())
        if packet.is_file() and not packet.is_symlink() and files_present:
            require(digest_file(packet) == {key: entry["nativePacket"][key]
                                           for key in ("bytes", "sha256")},
                    "The retained complete source-edition packet changed")
            source = load_json((output / "publisher" / "source-context.json").read_bytes())
            full_year = load_json((output / "reports" / "full-year-review.json").read_bytes())
            final = load_json((output / "reports" / "final-case.json").read_bytes())
            current = delivery_index(output, source, full_year, final, private_directory(output / "delivery"),
                                     "editions/" + state["sourceEdition"] + "/", current_index=True)
            entry["currentDeliveryIndex"] = state["currentDeliveryIndex"] = current
            checkpoint(output / "operation-state.json", state)
            return

    require_source_edition(output, edition)
    delivery = edition_directory(output, state, "delivery")
    source = load_json((output / "publisher" / "source-context.json").read_bytes())
    with IatiWorkspace(output / "sender-workspace") as workspace:
        work = workspace.reconciliation
        full_year = work.plan(state["caseId"], state["reviewedRevision"])
        final = work.plan(state["caseId"], state["finalRevision"])
        require(full_year == load_json((output / "reports" / "full-year-review.json").read_bytes())
                and final == load_json((output / "reports" / "final-case.json").read_bytes()),
                "Export the original saved reviews and request history without creating a new comparison revision")
        files = {
            "fullYear": report_files(work, output, "FCDO_WADI_Full_Year_Reviewed", full_year, delivery),
            "currentSelection": report_files(work, output, "FCDO_WADI_Current_Selection_Reviewed", final, delivery),
        }
        packet = delivery / "FCDO_WADI_Financial_Reconciliation.zip"
        exported = work.export({"id": final["id"], "revision": final["revision"], "output": packet})
        require(exported["state"] == "COMPLETE", "Finish the complete original nested financial receiving archive")
        with zipfile.ZipFile(packet) as archive:
            names = archive.namelist()
            require("history.json" in names and "requests.json" in names
                    and len([x for x in names if x.startswith("sources/") and x.endswith(".zip")]) == 2,
                    "Retain both complete original organisation and activity packets in the financial archive")
            history = load_json(archive.read("history.json"))
            require(history[-1] == final and history[full_year["revision"] - 1] == full_year,
                    "The complete original reviewed history must survive export")
        require_source_edition(output, edition)
        index = delivery_index(output, source, full_year, final, delivery)
        current = delivery_index(output, source, full_year, final, private_directory(output / "delivery"),
                                 "editions/" + state["sourceEdition"] + "/", current_index=True)
        edition_phase(output, state, "changed-selection-comparison-and-complete-nested-export",
              files=files, deliveryIndex=index, currentDeliveryIndex=current,
              nativePacket={**digest_file(packet), "file": str(packet.relative_to(output)),
                            "members": len(names), "sourceRefs": exported["sourceRefs"],
                            "sourceEdition": state["sourceEdition"]})


def cli_call(workspace, arguments):
    from cli import main
    output = io.StringIO()
    with redirect_stdout(output):
        main(["--workspace", str(workspace), *arguments])
    return load_json(output.getvalue())


def closed_workspace_receiving(output, state, requests):
    reports = edition_directory(output, state, "reports")
    delivery = edition_directory(output, state, "delivery")
    sender, receiver = output / "sender-workspace", output / "receiver-workspace"
    final = load_json((output / "reports" / "final-case.json").read_bytes())
    current = cli_call(sender, ["reconciliation", "plan", "--id", state["caseId"],
                                "--revision", str(state["finalRevision"])])
    require(current == final, "The original CLI must reopen the same complete retained comparison")
    lost_ack = cli_call(sender, ["reconciliation", "request", "--request-id", requests["changed"]["requestId"]])
    require(lost_ack["state"] == "RECORDED" and lost_ack["case"]["revision"] == state["changedRevision"],
            "The original request readback must survive complete workspace close/reopen")
    retained(reports / "sender-cli-plan.json", current)
    retained(reports / "sender-cli-lost-ack.json", lost_ack)
    if not receiver.exists():
        with IatiWorkspace(receiver, create=True):
            pass
    result = cli_call(receiver, ["reconciliation", "receive", "--input",
                                str(output / state["nativePacket"]["file"])])
    require(result["state"] == "COMPLETE" and result["case"] == final
            and result["organisationEditions"] == 1 and result["activityEditions"] == 1,
            "Receive the complete original nested organisation and activity editions into the second workspace")
    reopened = cli_call(receiver, ["reconciliation", "plan", "--id", state["caseId"],
                                   "--revision", str(state["finalRevision"])])
    require(reopened == final, "The independent receiving workspace must reopen the same complete comparison")
    with IatiWorkspace(receiver) as workspace:
        full = workspace.reconciliation.plan(state["caseId"], state["reviewedRevision"])
        require(full == load_json((output / "reports" / "full-year-review.json").read_bytes()),
                "The independent receiver must preserve the earlier complete full-year review")
        record = workspace.reconciliation.request(requests["changedReview"]["requestId"])
        require(record["state"] == "RECORDED" and record["case"] == final,
                "The receiving workspace must retain the committed final named-review request")
        receiver_files = report_files(workspace.reconciliation, output, "Received_FCDO_WADI_Current_Selection", final, delivery)
    require({k: {x: v[x] for x in ("bytes", "sha256")} for k, v in receiver_files.items()} ==
            {k: {x: v[x] for x in ("bytes", "sha256")} for k, v in state["files"]["currentSelection"].items()},
            "The complete HTML, CSV and JSON outputs must reproduce after independent receiving")
    retained(reports / "receiver-cli-plan.json", reopened)
    edition_phase(output, state, "original-cli-close-reopen-and-independent-native-receiving",
          receiving={"caseId": final["id"], "revision": final["revision"],
                     "historyRevisions": result["revisions"], "organisationEditions": result["organisationEditions"],
                     "activityEditions": result["activityEditions"], "files": receiver_files})


# The complete original typed-client/MCP/browser continuation is embedded here so
# this operation remains one additive Python programme and one runnable guide.
NODE_CONTINUATION = r'''// MIT. Continue one original financial reconciliation through its equipped public surfaces.
// Run: node reconciliation-continuation.mjs /private/operation-config.json
import { readFile, writeFile, mkdir, open, rename, chmod, stat, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve, isAbsolute, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const configPath = resolve(process.argv[2] || '');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const required = ['iatiDirectory','mcpDirectory','senderConnectionFile','receiverConnectionFile','exportsDirectory','outputDirectory','caseId','selector','finalRevision','saveRequests','reviewRequests','compareRequest','currentCase','packetPath','sourceIdentity'];
for (const key of required) if (config[key] === undefined) throw new Error('Missing original operation configuration: ' + key);
for (const key of ['iatiDirectory','mcpDirectory','senderConnectionFile','receiverConnectionFile','exportsDirectory','outputDirectory','packetPath'])
  if (typeof config[key] !== 'string' || !isAbsolute(config[key])) throw new Error('Use the original absolute path for ' + key);
needSourceIdentity(config.sourceIdentity);
function needSourceIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.sourceEdition !== 'string' || !value.sourceEdition ||
      !value.manifest || typeof value.manifest.file !== 'string' ||
      !Number.isSafeInteger(value.manifest.bytes) || value.manifest.bytes < 1 ||
      !/^[0-9a-f]{64}$/.test(value.manifest.sha256 || ''))
    throw new Error('Retain the original installed-source edition and complete manifest descriptor.');
}
const output = resolve(config.outputDirectory);
for (const directory of [output, config.exportsDirectory, join(output,'client'), join(output,'mcp'), join(output,'browser')]) {
  await mkdir(directory, { recursive:true, mode:0o700 });
  const info = await stat(directory);
  if (!info.isDirectory() || process.platform !== 'win32' && (info.mode & 0o077)) throw new Error('Original operation output directory must be private.');
}
const observations = { schema:'stellar-forge.iati-reconciliation-public-operation.v1', state:'RUNNING',
  caseId:config.caseId, revision:config.finalRevision, client:{}, mcp:{}, browser:{} };
const need = (condition, message) => { if (!condition) throw new Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const identity = data => ({bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
const publishedArtifacts = new Map();
const syncDirectory = async path => {
  const directory=await open(path,'r');
  try { await directory.sync(); } finally { await directory.close(); }
};
async function atomicJson(name,value) {
  const path=join(output,name),temporary=join(dirname(path),'.'+basename(path)+'.incoming-'+randomUUID());
  const data=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  let handle;
  try {
    handle=await open(temporary,'wx',0o600);
    await handle.writeFile(data); await handle.sync(); await handle.close(); handle=undefined;
    await rename(temporary,path); await syncDirectory(dirname(path));
  } catch(error) {
    await handle?.close().catch(()=>{});
    await unlink(temporary).catch(()=>{});
    throw error;
  }
  return {path,...identity(data)};
}
const jsonFile = async (name,value) => {
  const descriptor=await atomicJson(name,value);
  publishedArtifacts.set(name,descriptor);
  return descriptor.path;
};
const checkCase = (value, revision, label) => {
  need(value?.id===config.caseId && value.revision===revision, label+' returned a different saved case revision.');
  need(typeof value.report?.snapshotSha256==='string', label+' omitted the original report snapshot.');
  return value;
};
const requestRows = [
  ['separate','save',config.saveRequests.separate,config.separateRevision],
  ['nominal','save',config.saveRequests.nominal,config.nominalRevision],
  ['fullReview','review',config.reviewRequests.fullReview,config.reviewedRevision],
  ['changed','save',config.saveRequests.changed,config.changedRevision],
  ['changedReview','review',config.reviewRequests.changedReview,config.finalRevision]
];
for (const [label,,input,revision] of requestRows)
  need(input && typeof input.requestId==='string' && Number.isSafeInteger(revision), 'Original '+label+' request/revision is missing.');
let sender,receiver,merchant,browser;
const secrets = [];
const phaseStartedAt=new Date().toISOString(),attemptId=randomUUID();
const phaseHistory=[];
let activePhase='initializing',lastCompletedPhase=null;
async function checkpoint(phase, phaseState='COMPLETE') {
  activePhase=phase;
  if(phaseState==='COMPLETE')lastCompletedPhase=phase;
  const at=new Date().toISOString();
  const processMemory=process.memoryUsage();
  phaseHistory.push({phase,state:phaseState,at,processMemory});
  const value={
    schema:'stellar-forge.iati-reconciliation-public-progress.v1',
    state:observations.state,attemptId,startedAt:phaseStartedAt,updatedAt:at,
    phase,phaseState,lastCompletedPhase,pid:process.pid,processMemory,
    caseId:config.caseId,revision:config.finalRevision,
    reportSha256:config.currentCase.report.snapshotSha256,
    sourceIdentity:config.sourceIdentity,
    originalRequests:requestRows.map(([label,action,input,revision])=>({label,action,requestId:input.requestId,revision})),
    history:phaseHistory,
    artifacts:Object.fromEntries(publishedArtifacts),
    client:{revisions:observations.client.revisions??[],replays:observations.client.replays??[],
      comparisonSummary:observations.client.comparison?.summary??null,
      files:observations.client.files??{},packet:observations.client.packet??null,
      receive:observations.client.receive??null},
    mcp:{files:observations.mcp.files??{},packet:observations.mcp.packet??null,
      receive:observations.mcp.receive??null},
    browser:observations.browser,
    ...(observations.error?{error:observations.error}:{})
  };
  await atomicJson('operation-progress.json',value);
}
function redacted(error) {
  let text=String(error?.message || error);
  for (const secret of secrets) if (secret) text=text.split(secret).join('[private console]');
  return text.replace(/http:\/\/127\.0\.0\.1:\d+\/#[A-Za-z0-9_-]+/g,'[private console]');
}
async function saveResponse(openResponse, name) {
  const target=join(output,name),temporary=join(dirname(target),'.'+basename(target)+'.incoming-'+randomUUID());
  const handle=await open(temporary,'wx',0o600);
  const hash=createHash('sha256'); let received=0,expected,sha;
  try {
    const response=await openResponse();
    need(response.ok,'The complete native file was rejected.');
    sha=response.headers.get('x-content-sha256');
    const length=response.headers.get('content-length');
    need(/^[0-9a-f]{64}$/.test(sha||'') && /^(0|[1-9][0-9]*)$/.test(length||''),'The native download descriptor is incomplete.');
    expected=Number(length);
    need(Number.isSafeInteger(expected) && expected<=4*1024*1024*1024,'Native file size exceeds the original packet capacity.');
    for await (const chunk of response.body || []) {
      received+=chunk.length; need(received<=expected,'Native file grew past its declared byte count.');
      hash.update(chunk); await handle.writeFile(chunk);
    }
    need(received===expected && hash.digest('hex')===sha,'Complete native file differs from its original descriptor.');
    await handle.sync();
  } finally { await handle.close(); }
  await rename(temporary,target); await syncDirectory(dirname(target));
  const descriptor={path:target,bytes:received,sha256:sha};
  publishedArtifacts.set(name,descriptor);
  return descriptor;
}
async function allPages(iterator, name) {
  let snapshot,total,offset=0; const rows=[];
  for await (const page of iterator) {
    if (snapshot===undefined) {snapshot=page.snapshotSha256;total=page.total;}
    need(page.snapshotSha256===snapshot && page.total===total && page.offset===offset,'The '+name+' register changed while paging.');
    need(Array.isArray(page.rows),'The '+name+' register omitted its original rows.');
    rows.push(...page.rows); offset+=page.rows.length;
  }
  need(offset===total,'The '+name+' register was not completely received.');
  return {rows,total,snapshotSha256:snapshot};
}
async function readRetained(exported, name) {
  need(/^[0-9a-f]{64}$/.test(exported.exportId||''),'MCP omitted the retained export identity.');
  const path=join(output,name),temporary=join(dirname(path),'.'+basename(path)+'.incoming-'+randomUUID());
  const handle=await open(temporary,'wx',0o600),hash=createHash('sha256');
  let offset=0,readId,descriptor,completed=false;
  try {
    for (;;) {
      const chunk=await merchant.call('merchant_source_file_read',{workspace:'sender',exportId:exported.exportId,
        offset,limit:196608,...(readId?{readId}:{})});
      need(chunk.encoding==='base64' && typeof chunk.data==='string' && chunk.offset===offset,'The retained file chunk is not the requested byte range.');
      if (!descriptor) descriptor=chunk.file;
      need(same(chunk.file,descriptor) && chunk.file?.sha256===exported.exportId,'The retained file descriptor changed.');
      if(readId) need(chunk.readId===readId,'The original file reader changed.');
      readId=chunk.readId;
      const data=Buffer.from(chunk.data,'base64');
      need(data.length===chunk.bytesRead,'The retained file chunk is incomplete.');
      hash.update(data); await handle.writeFile(data); offset+=data.length;
      if(chunk.nextOffset===null){completed=true;break;}
      need(chunk.nextOffset===offset && data.length>0,'The retained file page did not advance.');
    }
    need(offset===descriptor.bytes && offset===exported.bytes && hash.digest('hex')===exported.exportId,'The complete MCP file differs from its retained bytes.');
    await handle.sync();
  } finally {
    await handle.close();
    if(!completed && readId) await merchant.call('merchant_source_file_release',{workspace:'sender',readId}).catch(()=>{});
  }
  await rename(temporary,path); await syncDirectory(dirname(path));
  const result={path,bytes:offset,sha256:exported.exportId};
  publishedArtifacts.set(name,result);
  return result;
}
async function mcpRegister(action, input, name) {
  const rows=[];let snapshot,total,offset=0;
  for (;;) {
    const page=(await merchant.call('merchant_source_iati_reconciliation_'+action,{workspace:'sender',...input,
      offset,limit:250,...(snapshot?{expectedSnapshot:snapshot}:{})})).native;
    if(snapshot===undefined){snapshot=page.snapshotSha256;total=page.total;}
    need(page.snapshotSha256===snapshot && page.total===total && page.offset===offset,'MCP '+name+' register changed.');
    rows.push(...page.rows);offset+=page.rows.length;
    if(offset===total)break;
    need(page.rows.length>0 && offset<total,'MCP '+name+' register is incomplete.');
  }
  return {rows,total,snapshotSha256:snapshot};
}
try {
  await checkpoint('client-open','STARTED');
  for(const path of [config.senderConnectionFile,config.receiverConnectionFile]){
    const privateUrl=(await readFile(path,'utf8')).trim();secrets.push(privateUrl,new URL(privateUrl).hash.slice(1));
  }
  const {connectIatiWorkspace}=await import(pathToFileURL(join(config.iatiDirectory,'client.mjs')));
  sender=await connectIatiWorkspace({consoleUrlFile:config.senderConnectionFile,timeoutMs:900000});
  receiver=await connectIatiWorkspace({consoleUrlFile:config.receiverConnectionFile,timeoutMs:900000});
  const client=sender.organisationReconciliation,receivingClient=receiver.organisationReconciliation;
  need(client && receivingClient,'The maintained typed client has no organisationReconciliation namespace.');
  const original=checkCase(await client.plan(config.caseId,{revision:config.finalRevision}),config.finalRevision,'Typed client');
  need(same(original,config.currentCase),'The saved case changed after the native operation.');
  const beforeHistory=(await client.history(config.caseId)).history;
  need(beforeHistory.length===config.finalRevision,'The original complete case history has an unexpected revision count.');
  observations.client.status=await client.status();
  observations.client.revisions=[];
  for(const revision of [...new Set(requestRows.map(row=>row[3]))]){
    const saved=checkCase(await client.plan(config.caseId,{revision}),revision,'Typed historical read');
    observations.client.revisions.push({revision,reportSha256:saved.report.snapshotSha256,review:saved.review?.decision??null});
  }
  const catalogs={};
  for(const section of ['organisation','activity']){
    catalogs[section]=await allPages(client.catalogPages({...config.selector,section},{limit:250}),section);
    await jsonFile('client/catalog-'+section+'.json',catalogs[section]);
  }
  for(const section of ['comparisons','activity','issues','decisions']){
    const page=await allPages(client.rowPages(config.caseId,{revision:config.finalRevision,section},{limit:250}),section);
    const expected=section==='activity'?original.report.activityRows:original.report[section];
    need(same(page.rows,expected),'Typed '+section+' rows differ from the original full report.');
    await jsonFile('client/'+section+'.json',page);
  }
  await checkpoint('client-registers');
  const replays=[];
  for(const [label,action,input,revision] of requestRows){
    const saved=checkCase(await client[action](input),revision,'Typed original '+label+' replay');
    const recovered=await client.request(input.requestId);
    need(recovered.state==='RECORDED' && same(recovered.case,saved),'Typed lost-ack readback returned another result.');
    replays.push({label,action,requestId:input.requestId,revision,reportSha256:saved.report.snapshotSha256});
  }
  need(same((await client.history(config.caseId)).history,beforeHistory),'Replaying original requests added a case revision.');
  observations.client.replays=replays;
  const comparison=await client.compare(config.compareRequest);
  observations.client.comparison=comparison;
  await jsonFile('client/revision-comparison.json',comparison);
  await checkpoint('client-request-replay');
  observations.client.files={};
  for(const [kind,extension] of [['report','html'],['csv','csv'],['json','json']]){
    await checkpoint('client-file-'+kind,'STARTED');
    observations.client.files[kind]=await saveResponse(()=>client.file(config.caseId,kind,{revision:config.finalRevision}),'client/reconciliation.'+extension);
    await checkpoint('client-file-'+kind);
  }
  await checkpoint('client-packet','STARTED');
  observations.client.packet=await saveResponse(()=>client.export(config.caseId,{revision:config.finalRevision}),'client/reconciliation.zip');
  await checkpoint('client-packet');
  await checkpoint('client-receive','STARTED');
  const packetInfo=await stat(config.packetPath);
  const typedReceived=await receivingClient.receive({body:createReadStream(config.packetPath),bytes:packetInfo.size});
  need(typedReceived.state==='COMPLETE','Typed original packet receiving did not complete.');
  checkCase(typedReceived.case,config.finalRevision,'Typed packet receive');
  checkCase(await receivingClient.plan(config.caseId,{revision:config.finalRevision}),config.finalRevision,'Typed receiver reopen');
  observations.client.receive={state:typedReceived.state,reused:typedReceived.reused,revision:typedReceived.currentCase.revision};
  await checkpoint('client-receive');

  await checkpoint('mcp-open','STARTED');
  const {MerchantSourceWorkspaces,readSourceWorkspaceConfiguration,SOURCE_WORKSPACE_CONNECTION_SCHEMA}
    =await import(pathToFileURL(join(config.mcpDirectory,'source-workspace.mjs')));
  const sourceConfigPath=await jsonFile('source-workspace-connection.json',{schema:SOURCE_WORKSPACE_CONNECTION_SCHEMA,
    workspaces:{
      sender:{label:'Original reconciliation sender',format:'iati',consoleUrlFile:config.senderConnectionFile,files:{}},
      receiver:{label:'Original reconciliation receiver',format:'iati',consoleUrlFile:config.receiverConnectionFile,
        files:{packet:{kind:'packet',path:config.packetPath}}}
    }});
  const originalConfig={sourceWorkspaces:await readSourceWorkspaceConfiguration(sourceConfigPath),exportsDirectory:config.exportsDirectory};
  merchant=new MerchantSourceWorkspaces(originalConfig);
  observations.mcp.status=(await merchant.call('merchant_source_iati_reconciliation_status',{workspace:'sender'})).native;
  for(const section of ['organisation','activity']){
    const received=await mcpRegister('catalog',{definition:config.selector,section},section);
    need(same(received,catalogs[section]),'MCP '+section+' catalogue differs from the typed native catalogue.');
  }
  for(const section of ['comparisons','activity','issues','decisions']){
    const received=await mcpRegister('rows',{id:config.caseId,revision:config.finalRevision,section},section);
    const expected=section==='activity'?original.report.activityRows:original.report[section];
    need(same(received.rows,expected),'MCP '+section+' register differs from the original report.');
  }
  await checkpoint('mcp-registers');
  for(const [label,action,input,revision] of requestRows){
    const saved=checkCase((await merchant.call('merchant_source_iati_reconciliation_'+action,{workspace:'sender',definition:input})).native,
      revision,'MCP original '+label+' replay');
    const request=(await merchant.call('merchant_source_iati_reconciliation_request',{workspace:'sender',requestId:input.requestId})).native;
    need(request.state==='RECORDED' && same(request.case,saved),'MCP original request readback returned another revision.');
  }
  const mcpComparison=(await merchant.call('merchant_source_iati_reconciliation_compare',{workspace:'sender',...config.compareRequest})).native;
  need(same(mcpComparison,comparison),'MCP historical comparison differs from the typed original comparison.');
  await checkpoint('mcp-request-replay');
  observations.mcp.files={};
  for(const [kind,extension] of [['report','html'],['csv','csv'],['json','json']]){
    await checkpoint('mcp-file-'+kind,'STARTED');
    const exported=await merchant.call('merchant_source_iati_reconciliation_file',{workspace:'sender',id:config.caseId,revision:config.finalRevision,kind});
    const file=await readRetained(exported,'mcp/reconciliation.'+extension);
    need(file.sha256===observations.client.files[kind].sha256,'MCP '+kind+' download differs from the native full file.');
    observations.mcp.files[kind]=file;
    await checkpoint('mcp-file-'+kind);
  }
  await checkpoint('mcp-packet','STARTED');
  const retained=await merchant.call('merchant_source_iati_reconciliation_export',{workspace:'sender',id:config.caseId,revision:config.finalRevision});
  observations.mcp.packet=await readRetained(retained,'mcp/reconciliation.zip');
  await checkpoint('mcp-packet');
  await merchant.close();
  merchant=new MerchantSourceWorkspaces(originalConfig);
  await checkpoint('mcp-receive','STARTED');
  const received=(await merchant.call('merchant_source_iati_reconciliation_receive',
    {workspace:'receiver',fromWorkspace:'sender',exportId:retained.exportId})).native;
  need(received.state==='COMPLETE','MCP complete retained packet receiving did not complete after reopen.');
  checkCase(received.case,config.finalRevision,'MCP receiver');
  const reopened=(await merchant.call('merchant_source_iati_reconciliation_plan',
    {workspace:'receiver',id:config.caseId,revision:config.finalRevision})).native;
  need(same(reopened,original),'MCP receiving changed the full original case.');
  observations.mcp.receive={state:received.state,reused:received.reused,exportId:retained.exportId,revision:received.currentCase.revision};
  const receivingRequest=(await merchant.call('merchant_source_iati_reconciliation_request',
    {workspace:'receiver',requestId:config.reviewRequests.changedReview.requestId})).native;
  need(receivingRequest.state==='RECORDED' && same(receivingRequest.case,original),'Received complete packet lost original request replay custody.');
  need(same((await client.history(config.caseId)).history,beforeHistory),'Public-surface operation added a source revision.');
  await checkpoint('mcp-receive');

  // Publish the complete consumed client/MCP outputs before Chromium starts.
  await checkpoint('browser-launch','STARTED');
  need(config.playwright && config.chromium,'The original browser continuation needs its installed Playwright and Chromium paths.');
  const {chromium}=await import(pathToFileURL(config.playwright));
  browser=await chromium.launch({executablePath:config.chromium,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(900000);
  const browserErrors=[],views=[],downloads=[];
  observations.browser={state:'RUNNING',views,downloads,errors:browserErrors};
  page.on('pageerror',error=>browserErrors.push(redacted(error)));
  page.on('response',response=>{
    const url=new URL(response.url());
    if(url.hostname==='127.0.0.1' && response.status()>=400 &&
      (url.pathname.startsWith('/api/') || /\.(?:m?js|css)$/.test(url.pathname)))
      browserErrors.push(response.status()+' '+url.pathname);
  });
  const idle=async()=>{
    await page.waitForFunction(()=>document.getElementById('main')?.getAttribute('aria-busy')==='false');
    need(!await page.locator('#status.error').count(),'The original operator reported: '+await page.locator('#status').innerText());
  };
  await page.goto((await readFile(config.senderConnectionFile,'utf8')).trim(),{waitUntil:'domcontentloaded'});
  await idle();
  await page.locator('#rec-open-view').click();
  await page.locator('#rec-case-select').selectOption(config.caseId);
  await page.locator('#rec-open').click();await idle();
  need((await page.locator('#rec-case-state').innerText()).includes('Revision '+config.finalRevision),'Browser did not reopen the final original revision.');
  for(const stage of ['sources','matches','review','history']){
    await page.locator('[data-rec-tab="'+stage+'"]').click();
    const path=join(output,'browser','reconciliation-'+stage+'.png');
    const screenshot=await page.screenshot({path,fullPage:false});
    const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}
    await syncDirectory(dirname(path));
    const descriptor={path,...identity(screenshot)};
    publishedArtifacts.set('browser/reconciliation-'+stage+'.png',descriptor);
    views.push({stage,revision:config.finalRevision,...descriptor});
    await checkpoint('browser-'+stage);
  }
  await page.locator('#rec-revision').selectOption(String(config.separateRevision));
  await page.locator('#rec-open-revision').click();await idle();
  need((await page.locator('#rec-case-state').innerText()).includes('Revision '+config.separateRevision),'Browser historical revision did not reopen.');
  await page.locator('[data-rec-tab="review"]').click();
  const historicalPath=join(output,'browser','separate-value-dates.png');
  const historicalScreenshot=await page.screenshot({path:historicalPath,fullPage:false});
  const historicalHandle=await open(historicalPath,'r');try{await historicalHandle.sync();}finally{await historicalHandle.close();}
  await syncDirectory(dirname(historicalPath));
  publishedArtifacts.set('browser/separate-value-dates.png',{path:historicalPath,...identity(historicalScreenshot)});
  await checkpoint('browser-historical-revision');
  await page.locator('#rec-revision').selectOption(String(config.finalRevision));
  await page.locator('#rec-open-revision').click();await idle();
  await page.locator('[data-rec-tab="history"]').click();
  await page.locator('#rec-compare-before').selectOption(String(config.compareRequest.before.revision));
  await page.locator('#rec-compare-after').selectOption(String(config.compareRequest.after.revision));
  await page.locator('#rec-compare-submit').click();await idle();
  need((await page.locator('#rec-history-comparison').innerText()).trim().length>0,'Browser omitted the original revision comparison.');
  await checkpoint('browser-revision-comparison');
  for(const [kind,extension] of [['report','html'],['csv','csv'],['json','json']]){
    const pending=page.waitForEvent('download');
    await page.locator('#rec-file-'+kind).click();
    const download=await pending;
    const path=join(output,'browser','reconciliation.'+extension);await download.saveAs(path);
    need(!await download.failure(),'The original browser download failed.');
    const actual=identity(await readFile(path));
    need(actual.sha256===observations.client.files[kind].sha256,'Browser '+kind+' differs from the original native file.');
    const downloadHandle=await open(path,'r');try{await downloadHandle.sync();}finally{await downloadHandle.close();}
    await syncDirectory(dirname(path));
    const descriptor={kind,path,...actual};
    downloads.push(descriptor);publishedArtifacts.set('browser/reconciliation.'+extension,descriptor);
    await idle();await checkpoint('browser-file-'+kind);
  }
  await page.locator('#rec-request-id').fill(config.reviewRequests.changedReview.requestId);
  await page.locator('#rec-request-form button[type="submit"]').click();await idle();
  need((await page.locator('#rec-case-state').innerText()).includes('Revision '+config.finalRevision),'Browser request recovery did not reopen the original result.');
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-rec-tab="review"]').click();
  const mobilePath=join(output,'browser','reconciliation-mobile.png');
  const mobileScreenshot=await page.screenshot({path:mobilePath,fullPage:false});
  const mobileHandle=await open(mobilePath,'r');try{await mobileHandle.sync();}finally{await mobileHandle.close();}
  await syncDirectory(dirname(mobilePath));
  publishedArtifacts.set('browser/reconciliation-mobile.png',{path:mobilePath,...identity(mobileScreenshot)});
  await checkpoint('browser-request-recovery');
  await checkpoint('browser-receive','STARTED');
  await page.goto((await readFile(config.receiverConnectionFile,'utf8')).trim(),{waitUntil:'domcontentloaded'});await idle();
  await page.locator('#rec-open-view').click();
  await page.locator('#rec-case-select').selectOption(config.caseId);await page.locator('#rec-open').click();await idle();
  await page.locator('[data-rec-tab="history"]').click();
  await page.locator('#rec-receive-file').setInputFiles(observations.mcp.packet.path);
  await page.locator('#rec-receive-form button[type="submit"]').click();await idle();
  need((await page.locator('#rec-case-state').innerText()).includes('Revision '+config.finalRevision),'Browser receiving did not reopen the original complete revision.');
  need(browserErrors.length===0,'Original browser reported '+browserErrors.length+' errors: '+browserErrors.join('; '));
  observations.browser={state:'COMPLETE',views,downloads,errors:browserErrors,receivedRevision:config.finalRevision};
  await checkpoint('browser-receive');
  observations.state='COMPLETE';
  observations.completedAt=new Date().toISOString();
  await jsonFile('operation-result.json',observations);
  await checkpoint('complete');
} catch(error) {
  observations.state='INCOMPLETE';observations.error=redacted(error);
  await checkpoint(activePhase,'INTERRUPTED').catch(()=>{});
  await jsonFile('operation-result.json',observations).catch(()=>{});
  throw new Error(observations.error);
} finally {
  await browser?.close().catch(()=>{});
  await merchant?.close().catch(()=>{});
  await sender?.dispose().catch(()=>{});
  await receiver?.dispose().catch(()=>{});
}
'''


def continue_operator(args, output, state, requests):
    require(NODE_CONTINUATION.strip(), "Install the complete receiving programme with its original operator continuation")
    private = private_directory(output / "connections")
    temporary = edition_directory(output, state, "temporary")
    exports = edition_directory(output, state, "merchant-exports")
    merchant_output = edition_directory(output, state, "merchant")
    reports = edition_directory(output, state, "reports")
    driver_body = NODE_CONTINUATION.encode("utf-8")
    driver_name = "reconciliation-continuation-" + hashlib.sha256(driver_body).hexdigest() + ".mjs"
    driver = retained(output / driver_name, driver_body)
    with ExitStack() as stack:
        sender = stack.enter_context(IatiWorkspace(output / "sender-workspace"))
        receiver = stack.enter_context(IatiWorkspace(output / "receiver-workspace"))
        secret_tokens = []
        for name, workspace in (("sender", sender), ("receiver", receiver)):
            connection = private / (name + ".url")
            # Both original exclusive workspace locks are now held here. An old
            # connection file therefore belongs to an ended owner of this same
            # operation and can be replaced by the new private connection.
            if connection.exists() or connection.is_symlink():
                require(not connection.is_symlink() and connection.is_file()
                        and connection.stat().st_size < 1024,
                        "The operation's previous private connection changed")
                require(re.fullmatch(r"http://127\.0\.0\.1(?::[0-9]+)?/#[A-Za-z0-9_-]{43}\n?",
                                     connection.read_text()) is not None,
                        "The operation's previous connection is not an original local console")
                connection.unlink()
            server = OperatorServer(workspace)
            secret_tokens.append(server.token)
            stack.callback(server.server_close)
            thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.2}, daemon=True)
            thread.start()
            stack.callback(thread.join, 10)
            stack.callback(server.shutdown)
            stack.enter_context(published_connection(private / (name + ".url"), server.url))
        binding = inspect_binding(sender.root)
        binding_name = "installed-source-binding-" + hashlib.sha256(json_bytes(binding)).hexdigest() + ".json"
        retained(reports / binding_name, binding)
        state.setdefault("installedSourceBindings", [])
        binding_file = str((reports / binding_name).relative_to(output))
        if binding_file not in state["installedSourceBindings"]:
            state["installedSourceBindings"].append(binding_file)
        checkpoint(output / "operation-state.json", state)
        config = {
            "iatiDirectory": str(IATI),
            "mcpDirectory": str(Path(args.mcp_directory).expanduser().resolve()),
            "senderConnectionFile": str(private / "sender.url"),
            "receiverConnectionFile": str(private / "receiver.url"),
            "exportsDirectory": str(exports), "outputDirectory": str(merchant_output),
            "caseId": state["caseId"], "selector": state["selector"],
            "sourceIdentity": {"sourceEdition": state["sourceEdition"],
                "manifest": {"file": edition_record(state)["installedSource"],
                             **digest_file(output / edition_record(state)["installedSource"])}},
            "separateRevision": state["separateRevision"], "nominalRevision": state["nominalRevision"],
            "reviewedRevision": state["reviewedRevision"], "changedRevision": state["changedRevision"],
            "finalRevision": state["finalRevision"], "saveRequests": {k: requests[k] for k in ("separate", "nominal", "changed")},
            "reviewRequests": {k: requests[k] for k in ("fullReview", "changedReview")},
            "compareRequest": requests["compare"],
            "currentCase": load_json((output / "reports" / "final-case.json").read_bytes()),
            "packetPath": str(output / state["nativePacket"]["file"]),
            "playwright": args.playwright, "chromium": args.chromium,
        }
        config_name = "continuation-" + hashlib.sha256(json_bytes(config)).hexdigest() + ".json"
        config_path = retained(private / config_name, config)
        result = subprocess.run([args.node, str(driver), str(config_path)], text=True, capture_output=True,
                                env={**os.environ, "TMPDIR": str(temporary)})
        # Console URLs are borrowed from private files; they never enter public
        # receipts. Redact a bearer fragment if a provider diagnostic echoes one.
        def clean(value):
            for token in secret_tokens:
                value = value.replace(token, "[redacted]")
            return re.sub(r"#[A-Za-z0-9_-]{32,256}", "#[redacted]", value)
        observation = {
            "returncode": result.returncode,
            "stdout": clean(result.stdout), "stderr": clean(result.stderr),
        }
        receipt_name = "operator-continuation-" + hashlib.sha256(json_bytes(observation)).hexdigest() + ".json"
        retained(reports / receipt_name, observation)
        state.setdefault("continuationAttempts", [])
        receipt_file = str((reports / receipt_name).relative_to(output))
        if receipt_file not in state["continuationAttempts"]:
            state["continuationAttempts"].append(receipt_file)
        checkpoint(output / "operation-state.json", state)
        require(result.returncode == 0,
                "The original operator returned " + str(result.returncode)
                + ". Continue this saved operation from its retained phase: " + clean(result.stderr[-4000:]))
        operator = load_json((merchant_output / "operation-result.json").read_bytes())
        require(operator["state"] == "COMPLETE" and operator["caseId"] == state["caseId"]
                and operator["revision"] == state["finalRevision"],
                "The original operator continuation must finish this exact retained case")
        edition_phase(output, state, "original-http-client-mcp-and-applications-continuation",
              operatorResult=operator,
              operatorResultFile=str((merchant_output / "operation-result.json").relative_to(output)))
    request = cli_call(output / "receiver-workspace", [
        "reconciliation", "request", "--request-id", requests["changedReview"]["requestId"]])
    require(request["state"] == "RECORDED"
            and request["case"] == load_json((output / "reports" / "final-case.json").read_bytes()),
            "Final native request readback must survive operator connection disposal and workspace reopen")
    retained(reports / "receiver-final-request.json", request)
    edition_phase(output, state, "final-independent-request-reopen",
                  finalRequestFile=str((reports / "receiver-final-request.json").relative_to(output)))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Operate actual FCDO financial coverage and complete independent receiving")
    parser.add_argument("--organisation-source", help="Original complete 99,013-byte FCDO organisation XML, required for initial preparation")
    parser.add_argument("--organisation-acquisition", help="Original organisation acquisition JSON, required for initial preparation")
    parser.add_argument("--activity-source", help="Original complete FCDO-set-20.xml or its retained gzip, required for initial preparation")
    parser.add_argument("--activity-receipt", help="Original publisher-receipt.json, required for initial preparation")
    parser.add_argument("--organisation-packet", help="Receive the existing original assessed organisation packet")
    parser.add_argument("--output", required=True, help="Private operation directory; reuse this directory to resume")
    parser.add_argument("--restore-checkpoint", help="Complete closed-case ZIP or the original completed receiving archive, restored into this new private output")
    parser.add_argument("--checkpoint-directory", help="Existing persistent destination outside output; defaults to an adjacent checkpoints directory")
    parser.add_argument("--checkpoint-upload-helper", help="Current complete official Library library_upload.py, used in this same live namespace before the operator and after completion")
    parser.add_argument("--mcp-directory", required=True, help="Original composed mcp-merchant-operator directory")
    parser.add_argument("--actor", default=DEFAULT_ACTOR, help="The actual internal receiving/review operator")
    parser.add_argument("--node", default=os.environ.get("SF30_XML_NODE", "node"))
    parser.add_argument("--playwright", required=True, help="Existing absolute installed Playwright module entry path")
    parser.add_argument("--chromium", required=True, help="Existing absolute installed Chromium executable path")
    args = parser.parse_args(argv)
    output = private_directory(args.output)
    with operation_guard(output):
        require(all(output != root and root not in output.parents
                    for root in (IATI, (IATI.parent / "xml").resolve())),
                "Keep the private receiving operation outside the installed IATI and XML source trees")
        if args.restore_checkpoint:
            restore_case_checkpoint(output, args.restore_checkpoint)
        state_path = output / "operation-state.json"
        state = load_json(state_path.read_bytes()) if state_path.exists() else {
            "schema": SCHEMA, "operation": OPERATION, "state": "IN_PROGRESS",
            "createdAt": datetime.now(timezone.utc).isoformat(), "stages": [], "continuationAttempts": [],
        }
        require(state.get("schema") == SCHEMA and state.get("operation") == OPERATION,
                "Use this operation's original receiving directory")
        state["state"] = "IN_PROGRESS"
        checkpoint(state_path, state)
        continuation_started = False
        try:
            sender = output / "sender-workspace"
            if not sender.exists():
                with IatiWorkspace(sender, create=True):
                    pass
            edition = installed_source_edition(output)
            activate_source_edition(output, state, edition)
            if not any(stage in state["stages"] for stage in (
                    "changed-selection-comparison-saved", "changed-selection-comparison-and-complete-nested-export")):
                require(all(getattr(args, name) for name in (
                    "organisation_source", "organisation_acquisition", "activity_source", "activity_receipt")),
                    "Initial preparation requires all four original publisher inputs; a complete restored case uses its retained sources and requests")
                requests = prepare(args, output, state)
            else:
                requests = load_json((output / "reports" / "requests.json").read_bytes())
            publish_source_edition(output, state, edition)
            entry = edition_record(state)
            if "original-cli-close-reopen-and-independent-native-receiving" not in entry["stages"]:
                closed_workspace_receiving(output, state, requests)
            else:
                state["receiving"] = entry["receiving"]
            if "final-independent-request-reopen" not in entry["stages"]:
                prepared = saved_case_checkpoint(args, output, state, "before-operator")
                upload_case_checkpoint(args, output, state, prepared)
                continuation_started = True
                continue_operator(args, output, state, requests)
                continuation_started = False
            else:
                state["operatorResult"] = entry["operatorResult"]
                state["operatorResultFile"] = entry["operatorResultFile"]
                state["finalRequestFile"] = entry["finalRequestFile"]
            require_source_edition(output, edition)
            state.pop("lastError", None)
            state.pop("lastCheckpointError", None)
            state["state"] = "COMPLETE"
            entry["state"] = "COMPLETE"
            edition_phase(output, state, "complete", completedSourceEdition=state["sourceEdition"])
            completed = saved_case_checkpoint(args, output, state, "complete")
            upload_case_checkpoint(args, output, state, completed)
            print(json.dumps({"state": "COMPLETE", "operation": OPERATION,
                "caseId": state["caseId"], "fullYearReviewedRevision": state["reviewedRevision"],
                "currentReviewedRevision": state["finalRevision"], "receiving": state["receiving"],
                "sourceEdition": state["sourceEdition"], "packet": state["nativePacket"],
                "operatorResultFile": state["operatorResultFile"], "output": str(output),
                "checkpoint": completed,
                "checkpointUpload": state.get("checkpointUploads", {}).get(completed["sha256"])},
                sort_keys=True), flush=True)
            return 0
        except Exception as error:
            state["state"] = "CONTINUE"
            if state.get("sourceEdition") in state.get("sourceEditions", {}):
                edition_record(state)["state"] = "CONTINUE"
            state["lastError"] = {"type": type(error).__name__, "message":
                                 re.sub(r"#[A-Za-z0-9_-]{32,256}", "#[redacted]", str(error))}
            checkpoint(state_path, state)
            if continuation_started and state.get("receiving"):
                try:
                    ended = saved_case_checkpoint(args, output, state, "continuation-ended")
                    upload_case_checkpoint(args, output, state, ended)
                except Exception as preservation_error:
                    state["lastCheckpointError"] = {
                        "type": type(preservation_error).__name__,
                        "message": re.sub(r"#[A-Za-z0-9_-]{32,256}", "#[redacted]",
                                          str(preservation_error)),
                    }
                    checkpoint(state_path, state)
                    print(json.dumps({"operation": OPERATION, "phase": "closed-case-checkpoint-continuation",
                                      "error": state["lastCheckpointError"],
                                      "checkpoints": state.get("closedCaseCheckpoints", [])},
                                     sort_keys=True), flush=True)
            raise


if __name__ == "__main__":
    raise SystemExit(main())
