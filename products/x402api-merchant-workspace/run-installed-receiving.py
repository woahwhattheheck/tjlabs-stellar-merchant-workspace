#!/usr/bin/env python3
# MIT License. Receive the original installed merchant and retain its full delivery.
"""One retained source, application, process-family and artifact receiving."""
from __future__ import annotations
import argparse
import base64
from collections import Counter
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path, PurePosixPath
import select
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import time
import uuid
import zipfile

OPERATION = "SCF-X402API-MERCHANT-INSTALLED-7DE2-20261012"
ORIGINAL_OPERATION = "SCF-X402API-MERCHANT-COMMISSIONING-7DE2-20261012"
REPOSITORY = "woahwhattheheck/tjlabs-stellar-merchant-workspace"
EXPECTED_ROOT = Path("/dev/x402api-merchant-installed-7de2-20261012")
ORIGINAL = Path("/dev/x402api-merchant-7de2-20261012")
ORIGINAL_IDENTITY = {
    "libraryFileId": "libfile_e72f624b66e08191a1c84aeabfc5ecb1",
    "fileId": "file_00000000b15082109c537bd99d92b094", "version": 0,
    "bytes": 505232, "members": 121,
    "sha256": "8275abdb2768178cd10685d3631996ec90f9ec3f41227850921eea54dfea354d",
}
PRODUCT = "products/x402api-merchant-workspace/"
GIT_RECEIVER_PATH = "stellar/scf-starforge-20261009/distribution/git-object-receiving.py"
GIT_RECEIVER_SHA = "dfc4b853a0c44d1a2971caba1254ef0635dc3f268e82d45fa88b4eee2bdcd83d"
SDK_PINS = {
    "library_upload.py": "5bc473dadefe1f68ee8797baaed19d6662642d0ea4bcba128fa12938faa0d767",
    "library_file_transfer.py": "5e1557817be17db06e2375f8c34ed83e948d520242e5ee4cb50a30c7a4c83378",
    "library_hosted_apps.py": "97d029b097ace62b744c82dfde20ef6921ed543a33a771ecf6452bd655d11b59",
}
BOOTSTRAP_PATHS = {
    "support/run-installed-receiving.py": PRODUCT + "run-installed-receiving.py",
    "support/process_family.py": PRODUCT + "process_family.py",
    "support/git-object-receiving.py": GIT_RECEIVER_PATH,
    **{"support/official/" + name: None for name in SDK_PINS},
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--root", type=Path, default=EXPECTED_ROOT)
args = parser.parse_args()
ROOT = args.root
if ROOT != EXPECTED_ROOT or ROOT.resolve() != ROOT:
    raise RuntimeError("Use the original installed merchant directory.")
CONTROL = ROOT / "control"
SOURCE = ROOT / "source"
CACHE = ROOT / "source-cache"
INCOMING = ROOT / "incoming-objects"
RECEIVING = ROOT / "receiving"
SUPPORT = ROOT / "support"
DRIVER = SOURCE / (PRODUCT + "installed-receiving.mjs")
ORIGINAL_ZIP = ROOT / "delivery/inputs/SCF_X402API_Merchant_Complete_Native_Receiving_20261012.zip"
ARCHIVE = ROOT / "delivery/SCF_X402API_Merchant_Installed_Application_20261012.zip"
ORIGINAL_WORKSPACE = ORIGINAL / "receiving/workspace"
os.umask(0o077)
sys.dont_write_bytecode = True
pending_stop = []
custody_mode = False
state = None
selected = None
input_sha256 = None
metadata = None
entries = None
git_receiver = None
family_module = None
operation_descriptor = None
original_descriptor = None
active_family = None
active_child = None
native_phase_ended = False

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def announce(value):
    try:
        print(json.dumps(value, ensure_ascii=False), flush=True)
    except OSError:
        pass

def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)

def directory(path):
    if path.exists():
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or path.resolve() != path:
            raise RuntimeError("The original directory changed: " + str(path))
        if path == ROOT or ROOT in path.parents:
            if info.st_mode & 0o077:
                raise RuntimeError("Use the original private operation directory.")
        sync_directory(path)
        sync_directory(path.parent)
        return
    directory(path.parent)
    path.mkdir(mode=0o700)
    sync_directory(path)
    sync_directory(path.parent)

def raw(path, maximum=16 * 1024 * 1024):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        first = os.fstat(descriptor)
        if not stat.S_ISREG(first.st_mode) or first.st_size > maximum:
            raise RuntimeError("The original bounded regular file is required: " + str(path))
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            body = stream.read(maximum + 1)
        last = os.fstat(descriptor)
        if len(body) > maximum or (first.st_dev, first.st_ino, first.st_size, first.st_mtime_ns) != (last.st_dev, last.st_ino, last.st_size, last.st_mtime_ns):
            raise RuntimeError("The original file changed during its read.")
        return body
    finally:
        os.close(descriptor)

def load(path):
    try:
        return json.loads(raw(path))
    except FileNotFoundError:
        return None

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()

def digest(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        first = os.fstat(descriptor)
        if not stat.S_ISREG(first.st_mode):
            raise RuntimeError("Hash the selected original regular file.")
        hasher = hashlib.sha256()
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            while True:
                block = stream.read(1024 * 1024)
                if not block:
                    break
                hasher.update(block)
        last = os.fstat(descriptor)
        if (first.st_dev, first.st_ino, first.st_size, first.st_mtime_ns) != (last.st_dev, last.st_ino, last.st_size, last.st_mtime_ns):
            raise RuntimeError("The selected artifact changed while hashing.")
        return {"bytes": first.st_size, "sha256": hasher.hexdigest()}
    finally:
        os.close(descriptor)

def write(path, body, *, original=False):
    directory(path.parent)
    if not isinstance(body, bytes):
        body = encoded(body)
    if original and path.exists():
        if raw(path, max(len(body), 1)) != body:
            raise RuntimeError("Keep the original retained bytes: " + str(path))
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        sync_directory(path.parent)
        return
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".partial")
    descriptor = None
    created = False
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        created = True
        with os.fdopen(descriptor, "wb", closefd=False) as stream:
            stream.write(body)
            stream.flush()
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        if original:
            try:
                os.link(temporary, path, follow_symlinks=False)
            except FileExistsError:
                if raw(path, max(len(body), 1)) != body:
                    raise RuntimeError("Keep the original immutable target.")
            temporary.unlink()
        else:
            os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if created:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass
            else:
                sync_directory(path.parent)

def memory():
    result = {}
    base = Path("/sys/fs/cgroup")
    for name in ("memory.current", "memory.max", "memory.events", "memory.stat"):
        try:
            value = (base / name).read_text()[:32768]
            if name == "memory.stat":
                keep = {"anon", "file", "shmem", "file_mapped", "file_dirty", "file_writeback", "inactive_file", "active_file"}
                value = {line.split()[0]: int(line.split()[1]) for line in value.splitlines() if line.split()[0] in keep}
            result[name] = value
        except (OSError, ValueError, IndexError) as error:
            result[name] = {"error": type(error).__name__}
    return result

def tail(path, limit=4000):
    try:
        with path.open("rb") as stream:
            size = os.fstat(stream.fileno()).st_size
            stream.seek(max(0, size - limit))
            return stream.read(limit).decode("utf-8", errors="replace")
    except OSError as error:
        return "[" + type(error).__name__ + "]"

def progress():
    state["updated_at"] = now()
    write(CONTROL / "state.json", state)

def stop(number, _frame):
    pending_stop.append(number)
    raise SystemExit(128 + number)

def defer_stop(number, _frame):
    pending_stop.append(number)

def protected():
    handler = signal.SIG_IGN if custody_mode else defer_stop
    for number in (signal.SIGINT, signal.SIGTERM):
        signal.signal(number, handler)

def install_stop():
    for number in (signal.SIGINT, signal.SIGTERM):
        signal.signal(number, stop)
    if pending_stop:
        raise SystemExit(128 + pending_stop[0])


def need(condition, message):
    if not condition:
        raise RuntimeError(message)

def safe_relative(value):
    need(isinstance(value, str) and value and "\0" not in value and "\\" not in value
         and not value.startswith("/") and all(part not in ("", ".", "..") for part in value.split("/")),
         "Use an exact original relative member.")
    return value

def exact_identity(path, identity):
    actual = digest(path)
    need(actual == {"bytes": identity["bytes"], "sha256": identity["sha256"]},
         "The original selected bytes differ: " + str(path))
    return actual

def import_file(name, path):
    specification = importlib.util.spec_from_file_location(name, path)
    need(specification is not None and specification.loader is not None, "Open the retained source module.")
    module = importlib.util.module_from_spec(specification)
    sys.modules[name] = module
    specification.loader.exec_module(module)
    return module

@contextmanager
def held_file(path):
    directory(path.parent)
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        opened = os.fstat(descriptor)
        need(stat.S_ISREG(opened.st_mode) and opened.st_nlink == 1 and not opened.st_mode & 0o077,
             "Use the original private, single-link regular operation lock.")
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield descriptor
    finally:
        os.close(descriptor)

def retain(label, action):
    previous = {number: signal.getsignal(number) for number in (signal.SIGINT, signal.SIGTERM)}
    protected()
    prior = None
    try:
        while True:
            try:
                return action()
            except BaseException as error:
                notice = (type(error).__name__, str(error))
                if notice != prior:
                    announce({"state": label, "operation": OPERATION, "root": str(ROOT),
                              "error": {"type": notice[0], "message": notice[1]}, "memory": memory()})
                    prior = notice
                time.sleep(2)
    finally:
        for number, handler in previous.items():
            signal.signal(number, handler)

def validate_input():
    global selected, input_sha256, metadata, entries, git_receiver, family_module
    body = raw(CONTROL / "input.json", 8 * 1024 * 1024)
    input_sha256 = hashlib.sha256(body).hexdigest()
    selected = json.loads(body)
    need(selected.get("schema") == "stellar-forge.merchant-installed-foreground-input.v1"
         and selected.get("operation") == OPERATION and selected.get("root") == str(ROOT)
         and selected.get("originalRoot") == str(ORIGINAL), "Keep the original installed receiving input.")
    need(selected.get("originalArchive") == ORIGINAL_IDENTITY, "Keep the exact saved original workspace.")
    source = selected["source"]
    need(source.get("metadataPath") == "control/git-metadata.json",
         "Use the retained full Git metadata path.")
    source_body = raw(ROOT / source["metadataPath"], 32 * 1024 * 1024)
    need(len(source_body) == source["metadataBytes"]
         and hashlib.sha256(source_body).hexdigest() == source["metadataSha256"],
         "The complete original Git metadata changed.")
    rows = selected.get("bootstrap")
    need(isinstance(rows, list) and len(rows) == len(BOOTSTRAP_PATHS), "Receive the whole foreground support.")
    by_path = {}
    for row in rows:
        relative = safe_relative(row["path"])
        need(relative in BOOTSTRAP_PATHS and relative not in by_path
             and row.get("sourcePath") == BOOTSTRAP_PATHS[relative],
             "Keep the selected original support paths.")
        exact_identity(ROOT / relative, row)
        by_path[relative] = row
    need(Path(__file__).absolute() == SUPPORT / "run-installed-receiving.py",
         "Run the selected complete foreground source.")
    need(by_path["support/git-object-receiving.py"]["sha256"] == GIT_RECEIVER_SHA,
         "Use the complete maintained Git object receiver.")
    for name, pin in SDK_PINS.items():
        need(by_path["support/official/" + name]["sha256"] == pin,
             "Use the original official file SDK: " + name)
    git_receiver = import_file("merchant_original_git_receiver", SUPPORT / "git-object-receiving.py")
    metadata = json.loads(source_body)
    authority, entries, required, _objects = git_receiver.validate_metadata(metadata)
    need(authority.get("repository") == REPOSITORY and authority["commit"] == source["commit"],
         "The retained commit belongs to the original repository selection.")
    required_paths = {row["path"] for row in required}
    required_bootstrap = {
        PRODUCT + "installed-receiving.mjs",
        *("stellar/scf-starforge-20261009/distribution/" + name for name in (
            "build.mjs", "git-source.mjs", "browser-assets.mjs", "product-package.mjs",
            "specification.mjs", "source-selection.mjs", "build-state.mjs",
            "runtime-install.mjs", "runtime-profile.mjs", "runtime-unpack.py",
            "runtime-workspace/storage.mjs")),
    }
    need(required_bootstrap <= required_paths,
         "Select the complete original installed programme's bootstrap import closure.")
    for relative, row in by_path.items():
        source_path = row["sourcePath"]
        if source_path is None:
            continue
        original = entries.get(source_path)
        body = raw(ROOT / relative, 2 * 1024 * 1024)
        need(source_path in required_paths and original["type"] == "blob"
             and original["mode"] in ("100644", "100755")
             and original["size"] == len(body)
             and git_receiver.object_id("blob", body) == original["sha"],
             "The foreground support is not the selected original Git object: " + source_path)
    family_module = import_file("merchant_original_process_family", SUPPORT / "process_family.py")
    need(hasattr(family_module, "ProcessFamily"), "Use the original process-family implementation.")
    for kind in ("repositories", "sources"):
        paths = selected.get("donors", {}).get(kind, [])
        need(isinstance(paths, list) and len(paths) == len(set(paths)), "Keep the named original source donors.")
        for value in paths:
            path = Path(value)
            need(path.is_absolute() and str(path) == value and ".." not in path.parts,
                 "Use an original absolute source donor.")
    runtime = selected["runtime"]
    need(set(runtime) == {"node", "playwright", "chromium"}, "Keep the original selected native runtime paths.")
    for name, value in runtime.items():
        path = Path(value)
        need(path.is_absolute() and str(path) == value and ".." not in path.parts,
             "Use the actual installed " + name + " path.")
    write(CONTROL / "input-identity.json",
          {"operation": OPERATION, "input_sha256": input_sha256,
           "sourceCommit": source["commit"], "metadataSha256": source["metadataSha256"],
           "originalArchive": ORIGINAL_IDENTITY}, original=True)

def check_bootstrap():
    for row in selected["bootstrap"]:
        exact_identity(ROOT / row["path"], row)

def family_receipt(path, report):
    write(path, report)

def close_owned_family(family, path):
    protected()
    if family is None or not family.entered:
        return None
    # Keep this exact entered family, including already acquired pidfds, until
    # every adopted descendant is closed and the original subreaper is restored.
    report = retain("RETAINING_ORIGINAL_PROCESS_FAMILY", family.close)
    need(family.closed, "Close the selected process family before publishing its workspace.")
    retain("RETAINING_ORIGINAL_FAMILY_RECEIPT", lambda: write(path, report))
    return report

def close_main_child(process):
    protected()
    if process is None:
        return None
    if process.poll() is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            process.wait()
    # Popen retains its actual main-child status before ProcessFamily can reap
    # the newly adopted grandchildren. Never ask both wait owners for this PID.
    return process.wait()

def owned_command(label, command, *, timeout, cwd=SOURCE):
    global active_child, active_family
    # Consume a deferred stop only after the preceding command's exact outcome
    # and process family are durable, and before this next launch can start.
    install_stop()
    check_bootstrap()
    attempt = uuid.uuid4().hex
    slot = CONTROL / "attempts" / attempt
    directory(slot)
    stdout_path, stderr_path = slot / "stdout.log", slot / "stderr.log"
    row = {"schema": "stellar-forge.merchant-installed-owned-command.v1",
           "operation": OPERATION, "input_sha256": input_sha256,
           "sourceCommit": selected["source"]["commit"], "attempt": attempt,
           "phase": label, "argv": [str(item) for item in command], "cwd": str(cwd),
           "stdout": str(stdout_path), "stderr": str(stderr_path),
           "state": "PREPARED", "started_at": now(), "memory_before": memory()}
    write(slot / "intent.json", row, original=True)
    state.setdefault("attempts", []).append(row)
    progress()
    process = None
    family = family_module.ProcessFamily(OPERATION + ":" + label + ":" + attempt,
                                         publish=lambda report: family_receipt(slot / "family.json", report))
    error = None
    ended_code = None
    out = err = None
    try:
        out = stdout_path.open("xb", buffering=0)
        err = stderr_path.open("xb", buffering=0)
        for number in (signal.SIGINT, signal.SIGTERM):
            signal.signal(number, defer_stop)
        active_family = family
        family.__enter__()
        if pending_stop:
            raise SystemExit(128 + pending_stop[0])
        inherited = tuple(fd for fd in (operation_descriptor, original_descriptor) if fd is not None)
        process = subprocess.Popen(row["argv"], cwd=cwd, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                                   stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                                   start_new_session=True, pass_fds=inherited)
        active_child = process
        row.update(state="RUNNING", pid=process.pid)
        install_stop()
        announce({"state": "ORIGINAL_COMMAND_STARTED", "phase": label, "attempt": attempt,
                  "pid": process.pid, "memory": memory()})
        progress()
        started = time.monotonic()
        next_notice = started + 5
        while process.poll() is None:
            if timeout is not None and time.monotonic() - started > timeout:
                raise TimeoutError("The original command reached its retained waiting bound: " + label)
            if time.monotonic() >= next_notice:
                announce({"state": "ORIGINAL_COMMAND_PROGRESS", "phase": label, "attempt": attempt,
                          "pid": process.pid, "elapsed_seconds": round(time.monotonic() - started, 1),
                          "stdout": tail(stdout_path), "stderr": tail(stderr_path), "memory": memory()})
                next_notice = time.monotonic() + 5
            time.sleep(0.25)
        ended_code = process.wait()
    except BaseException as caught:
        error = caught
    finally:
        protected()
        if process is not None:
            ended_code = retain("RETAINING_ORIGINAL_MAIN_CHILD", lambda: close_main_child(process))
        report = close_owned_family(family, slot / "family.json")
        active_child = None
        active_family = None
        row.update(state="ENDED" if process is not None else "NOT_STARTED", exitCode=ended_code,
                   ended_at=now(), family=report, memory_after=memory())
        if error is not None:
            row["interruption"] = {"type": type(error).__name__, "message": str(error)}
        def persist():
            for stream in (out, err):
                if stream is not None:
                    stream.flush()
                    os.fsync(stream.fileno())
            write(slot / "ended.json", row, original=True)
            progress()
        retain("RETAINING_ORIGINAL_COMMAND_OUTCOME", persist)
        for stream in (out, err):
            if stream is not None:
                stream.close()
    install_stop()
    announce({"state": "ORIGINAL_COMMAND_RETURNED", "phase": label, "attempt": attempt,
              "exitCode": ended_code, "stdout": tail(stdout_path), "stderr": tail(stderr_path)})
    if error is not None:
        raise error
    return row


def sdk_modules():
    directory(SUPPORT / "official")
    for name, pin in SDK_PINS.items():
        need(digest(SUPPORT / "official" / name)["sha256"] == pin,
             "Keep the exact original official file helper.")
    if str(SUPPORT / "official") not in sys.path:
        sys.path.insert(0, str(SUPPORT / "official"))
    from library_file_transfer import LibraryFileMaterializer, LibraryFileTransfer
    return LibraryFileMaterializer, LibraryFileTransfer

def verify_original_archive():
    exact_identity(ORIGINAL_ZIP, ORIGINAL_IDENTITY)
    with zipfile.ZipFile(ORIGINAL_ZIP) as archive:
        names = archive.namelist()
        need(len(names) == ORIGINAL_IDENTITY["members"] and len(set(names)) == len(names),
             "Retain all 121 original members exactly once.")
        manifest_info = archive.getinfo("DELIVERY_MANIFEST.json")
        need(manifest_info.file_size <= 2 * 1024 * 1024, "Keep the original bounded inventory.")
        manifest = json.loads(archive.read(manifest_info))
        need(manifest.get("operation") == ORIGINAL_OPERATION and isinstance(manifest.get("files"), list),
             "Select the original complete merchant delivery manifest.")
        rows = manifest["files"]
        paths = [safe_relative(row["path"]) for row in rows]
        need(len(set(paths)) == len(paths) and set(names) == {"DELIVERY_MANIFEST.json"} | set(paths),
             "The original complete archive inventory differs.")
        for row in rows:
            info = archive.getinfo(row["path"])
            mode = info.external_attr >> 16
            need(not info.is_dir() and stat.S_IFMT(mode) in (0, stat.S_IFREG)
                 and info.file_size == row["bytes"], "The original regular archive member changed.")
            hashed = hashlib.sha256()
            size = 0
            with archive.open(info) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    size += len(block)
                    hashed.update(block)
            need(size == row["bytes"] and hashed.hexdigest() == row["sha256"],
                 "The original archive member hash differs: " + row["path"])
        complete = json.loads(archive.read("receiving/complete.json"))
        need(complete.get("operation") == ORIGINAL_OPERATION and complete.get("state") == "COMPLETE"
             and len(complete.get("orders", [])) == 5, "Retain the five completed original invoices.")
    return manifest

def original_archive():
    if ORIGINAL_ZIP.exists():
        return verify_original_archive()
    directory(ORIGINAL_ZIP.parent)
    prepared_path = ROOT / "transport/original-archive.json"
    transfer = load(prepared_path)
    need(isinstance(transfer, dict), "Supply the original prepared artifact materialization.")
    need(transfer.get("library_file_id") in (None, ORIGINAL_IDENTITY["libraryFileId"]),
         "The original materialization names another artifact.")
    materializer_type, transfer_type = sdk_modules()
    prepared = transfer_type.parse(transfer)
    pending = ORIGINAL_ZIP.with_name(ORIGINAL_ZIP.name + ".received")
    if pending.exists():
        exact_identity(pending, ORIGINAL_IDENTITY)
    else:
        # The unchanged official materializer owns its temporary download.
        # It never replaces the already-published original archive path.
        materializer_type().materialize(prepared, pending)
        exact_identity(pending, ORIGINAL_IDENTITY)
    descriptor = os.open(pending, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    try:
        os.link(pending, ORIGINAL_ZIP, follow_symlinks=False)
    except FileExistsError:
        exact_identity(ORIGINAL_ZIP, ORIGINAL_IDENTITY)
    sync_directory(ORIGINAL_ZIP.parent)
    manifest = verify_original_archive()
    pending.unlink()
    sync_directory(ORIGINAL_ZIP.parent)
    return manifest

def restore_file(archive, info, destination, expected):
    directory(destination.parent)
    if destination.exists():
        exact_identity(destination, expected)
        descriptor = os.open(destination, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        sync_directory(destination.parent)
        return
    temporary = destination.with_name(destination.name + "." + uuid.uuid4().hex + ".restoring")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        hasher = hashlib.sha256()
        size = 0
        with archive.open(info) as source, os.fdopen(descriptor, "wb", closefd=False) as target:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                size += len(block)
                hasher.update(block)
                target.write(block)
            target.flush()
        need(size == expected["bytes"] and hasher.hexdigest() == expected["sha256"],
             "The original receiving member changed.")
        mode = (info.external_attr >> 16) & 0o777
        need(not mode & 0o022, "Keep the original non-writable delivery source modes.")
        os.fchmod(descriptor, mode or 0o600)
        os.fsync(descriptor)
        try:
            os.link(temporary, destination, follow_symlinks=False)
        except FileExistsError:
            exact_identity(destination, expected)
        sync_directory(destination.parent)
    finally:
        os.close(descriptor)
        temporary.unlink(missing_ok=True)
        sync_directory(destination.parent)

def restore_original():
    manifest = original_archive()
    receipt_path = CONTROL / "original-restoration.json"
    previous = load(receipt_path)
    selected_restore = {"schema": "stellar-forge.merchant-original-workspace-restoration.v1",
                        "operation": OPERATION, "originalOperation": ORIGINAL_OPERATION,
                        "originalRoot": str(ORIGINAL), "archive": ORIGINAL_IDENTITY}
    if previous is not None:
        write(ROOT / "delivery/inputs/original-saved-identity.json", ORIGINAL_IDENTITY, original=True)
        need(all(previous.get(key) == value for key, value in selected_restore.items()),
             "Keep the completed original restoration and its current workspace.")
        original_complete = load(ORIGINAL / "receiving/complete.json")
        need((ORIGINAL_WORKSPACE / "merchant.sqlite3").is_file()
             and isinstance(original_complete, dict) and original_complete.get("operation") == ORIGINAL_OPERATION,
             "The already-restored original workspace is unavailable; preserve its retained history.")
        return
    directory(ORIGINAL)
    # The native application will acquire this same kernel lease after restore.
    # It is released before launch and acquired again before final packaging.
    with held_file(ORIGINAL_WORKSPACE / "merchant-owner.lock"):
        with zipfile.ZipFile(ORIGINAL_ZIP) as archive:
            rows = {row["path"]: row for row in manifest["files"]}
            for info in archive.infolist():
                name = safe_relative(info.filename)
                if name == "DELIVERY_MANIFEST.json":
                    body = archive.read(info)
                    expected = {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
                else:
                    expected = rows[name]
                restore_file(archive, info, ORIGINAL / name, expected)
        receipt = {**selected_restore, "members": ORIGINAL_IDENTITY["members"], "restored_at": now()}
        write(receipt_path, receipt, original=True)
    write(ROOT / "delivery/inputs/original-saved-identity.json", ORIGINAL_IDENTITY, original=True)
    announce({"state": "ORIGINAL_WORKSPACE_RESTORED", "operation": OPERATION,
              "originalRoot": str(ORIGINAL), "members": ORIGINAL_IDENTITY["members"],
              "sha256": ORIGINAL_IDENTITY["sha256"]})

def seed_original_support():
    directory(INCOMING)
    for row in selected["bootstrap"]:
        source_path = row["sourcePath"]
        if source_path is not None:
            body = raw(ROOT / row["path"], 2 * 1024 * 1024)
            original = entries[source_path]
            need(git_receiver.object_id("blob", body) == original["sha"],
                 "Keep the selected full support object.")
            write(INCOMING / (original["sha"] + ".blob"), body, original=True)

def selected_additional_paths():
    record = load(CONTROL / "source-additions.json")
    if record is None:
        return []
    need(record.get("operation") == OPERATION and record.get("input_sha256") == input_sha256,
         "Keep the same source receiving additions.")
    paths = record["paths"]
    need(isinstance(paths, list) and len(paths) == len(set(paths)), "Keep unique original added paths.")
    for path in paths:
        row = entries.get(path)
        need(row and row["type"] == "blob" and row["mode"] in ("100644", "100755"),
             "The added source path is outside the retained original tree.")
    return paths

def durable_selected_source():
    paths = list(dict.fromkeys([*metadata["requiredPaths"], *selected_additional_paths()]))
    directories = set()
    for relative in paths:
        row = entries[relative]
        body = raw(SOURCE / relative, 2 * 1024 * 1024)
        need(len(body) == row["size"] and git_receiver.object_id("blob", body) == row["sha"],
             "The selected materialized source differs: " + relative)
        descriptor = os.open(SOURCE / relative, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        directories.add((SOURCE / relative).parent)
    for path in sorted(directories, key=lambda item: len(item.parts), reverse=True):
        sync_directory(path)
        sync_directory(path.parent)
    # Complete the original receiver's local object/metadata durability without
    # altering its algorithm, state, selected commit or donor repositories.
    for path in CACHE.rglob("*"):
        info = path.lstat()
        if stat.S_ISREG(info.st_mode):
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        elif not stat.S_ISDIR(info.st_mode):
            raise RuntimeError("Keep the original regular Git cache and directories.")
    for path in sorted([CACHE, *[p for p in CACHE.rglob("*") if p.is_dir()]],
                       key=lambda item: len(item.parts), reverse=True):
        sync_directory(path)
        sync_directory(path.parent)
    write(CONTROL / "source-ready.json",
          {"operation": OPERATION, "input_sha256": input_sha256,
           "sourceCommit": selected["source"]["commit"], "tree": metadata["source"]["tree"],
           "metadataSha256": selected["source"]["metadataSha256"],
           "repository": str(CACHE / "repository.git"), "files": paths}, original=False)

def receive_source():
    seed_original_support()
    command = [sys.executable, "-B", str(SUPPORT / "git-object-receiving.py"),
               "--metadata", str(CONTROL / "git-metadata.json"),
               "--commit", selected["source"]["commit"], "--directory", str(CACHE),
               "--incoming", str(INCOMING), "--materialize", str(SOURCE)]
    donors = []
    for kind, flag in (("repositories", "--donor-repository"), ("sources", "--donor-source")):
        for value in selected.get("donors", {}).get(kind, []):
            path = Path(value)
            present = path.is_dir() and not path.is_symlink() and path.resolve() == path
            donors.append({"kind": kind, "path": value, "present": present})
            if present:
                command.extend((flag, value))
    if (ORIGINAL / "source").is_dir():
        command.extend(("--donor-source", str(ORIGINAL / "source")))
    for path in selected_additional_paths():
        command.extend(("--additional-path", path))
    write(CONTROL / "source-donor-observation.json", {"operation": OPERATION, "donors": donors})
    result = owned_command("original-git-source-receiving", command, timeout=900, cwd=ROOT)
    receipt = load(CACHE / "source-receiving.json")
    need(isinstance(receipt, dict) and receipt.get("source") == metadata["source"],
         "Retain the original source receiver's returned selection.")
    if result["exitCode"] == 2 and receipt.get("phase") == "SOURCE_NEEDED":
        missing = load(CACHE / "missing-objects.json")
        announce({"state": "SOURCE_NEEDED", "operation": OPERATION, "input_sha256": input_sha256,
                  "sourceCommit": selected["source"]["commit"], "missing": missing})
        raise RuntimeError("Supply the exact missing objects to this original source receiving.")
    need(result["exitCode"] == 0 and receipt.get("phase") == "OBJECTS_AVAILABLE",
         "The complete original source receiving did not finish.")
    durable_selected_source()
    announce({"state": "COMPLETE_SELECTED_SOURCE_READY", "operation": OPERATION,
              "sourceCommit": selected["source"]["commit"], "repository": str(CACHE / "repository.git")})

def requested_missing_objects():
    requested = {}
    original = load(CACHE / "missing-objects.json")
    if isinstance(original, dict):
        need(original.get("source") == metadata["source"], "Keep the original missing-source record.")
        for row in original.get("objects", []):
            for path in row.get("paths", []):
                entry = entries.get(path)
                need(entry and entry["sha"] == row["sha"] and entry.get("size") == row["size"],
                     "The original missing object differs from its retained tree.")
                requested[path] = entry
    failure = load(RECEIVING / "failure.json")
    if isinstance(failure, dict) and failure.get("operation") == OPERATION:
        # The distribution builder reports missing objects with their selected
        # source paths. Accept only paths and full identities in the frozen tree.
        missing = failure.get("missingGitObjects", [])
        if missing:
            need(failure.get("sourceCommit") == selected["source"]["commit"],
                 "The native package requested source from another commit.")
        for oid in missing:
            need(isinstance(oid, str) and len(oid) == 40
                 and all(character in "0123456789abcdef" for character in oid),
                 "Retain the original builder's exact blob identifier.")
            matches = [entry for entry in entries.values()
                       if entry["sha"] == oid and entry["type"] == "blob"
                       and entry["mode"] in ("100644", "100755")]
            need(matches, "The original package requested a blob outside its retained regular source tree.")
            for entry in matches:
                requested[entry["path"]] = entry
    return requested

def supply_objects(command):
    requested = requested_missing_objects()
    files = command.get("files")
    need(isinstance(files, list) and files and len(files) <= 32, "Supply complete original requested blobs.")
    staged = []
    for row in files:
        paths = row.get("paths")
        need(isinstance(paths, list) and paths and len(paths) == len(set(paths)),
             "Keep each object's exact requested paths.")
        oid = row.get("sha")
        body = base64.b64decode(row.get("base64", ""), validate=True)
        need(base64.b64encode(body).decode("ascii") == row["base64"] and len(body) <= 2 * 1024 * 1024,
             "Use complete canonical source bytes within the original receiver bound.")
        need(len(body) == row.get("bytes") and hashlib.sha256(body).hexdigest() == row.get("sha256")
             and git_receiver.object_id("blob", body) == oid, "The complete supplied blob identity changed.")
        for path in paths:
            entry = requested.get(path)
            need(entry and entry["sha"] == oid and entry["size"] == len(body),
                 "Supply only exact objects requested by this original source/package operation.")
        staged.append((row, body))
    previous = selected_additional_paths()
    additions = sorted(set(previous) | {path for row, _body in staged for path in row["paths"]
                                      if path not in metadata["requiredPaths"]})
    receipt = {"operation": OPERATION, "input_sha256": input_sha256,
               "sourceCommit": selected["source"]["commit"],
               "files": [{key: row[key] for key in ("sha", "bytes", "sha256", "paths")} for row, _ in staged]}
    receipt_id = hashlib.sha256(encoded(receipt)).hexdigest()
    write(CONTROL / "object-receipts" / (receipt_id + ".json"), receipt, original=True)
    for row, body in staged:
        write(INCOMING / (row["sha"] + ".blob"), body, original=True)
    write(CONTROL / "source-additions.json",
          {"operation": OPERATION, "input_sha256": input_sha256, "paths": additions})
    announce({"state": "ORIGINAL_OBJECT_BYTES_RETAINED", "objects": len(staged),
              "input_sha256": input_sha256, "receipt": receipt_id})

def executable(path):
    value = Path(path)
    need(value.is_file() and os.access(value, os.X_OK), "Use the selected installed executable: " + path)
    return path

def native_arguments():
    runtime = selected["runtime"]
    executable(runtime["node"])
    executable(runtime["chromium"])
    need(Path(runtime["playwright"]).is_file(), "Open the selected installed Playwright module.")
    need(shutil.which("flock") is not None, "Use the existing kernel-lock runtime.")
    return [runtime["node"], "--max-old-space-size=256", str(DRIVER),
            "--repo", str(CACHE / "repository.git"), "--source-commit", selected["source"]["commit"],
            "--original", str(ORIGINAL), "--root", str(RECEIVING),
            "--playwright", runtime["playwright"], "--chromium", runtime["chromium"]]

def sqlite_value(value):
    if isinstance(value, int):
        return {"integer": str(value)}
    if isinstance(value, bytes):
        return {"base64": base64.b64encode(value).decode("ascii")}
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value

def comparable(value):
    if isinstance(value, dict):
        return ("object", tuple((key, comparable(item)) for key, item in sorted(value.items())))
    if isinstance(value, list):
        return ("array", tuple(comparable(item) for item in value))
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return ("number", float(value).hex())
    return (type(value).__name__, value)

def verify_original_business(complete):
    snapshot = load(RECEIVING / "snapshots/after-reopen.private.json")
    need(isinstance(snapshot, dict) and snapshot.get("businessSha256") == complete["afterBusinessSha256"],
         "Keep the complete native customer snapshot.")
    business = snapshot["business"]
    # The native snapshot's rows retain JSON strings with exact integer and
    # BLOB lexemes. This reopens the same tables read-only and compares every
    # typed value; it does not reconstruct or apply merchant business state.
    native_encoding = (json.dumps(business, ensure_ascii=False, indent=2,
                                 separators=(",", ": "), allow_nan=False) + "\n").encode()
    need(hashlib.sha256(native_encoding).hexdigest() == complete["afterBusinessSha256"],
         "The retained full native customer snapshot changed.")
    database = ORIGINAL_WORKSPACE / "merchant.sqlite3"
    need(database.is_file() and not database.is_symlink(), "Keep the original received merchant database.")
    connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
    try:
        connection.execute("BEGIN")
        app_id = connection.execute("PRAGMA application_id").fetchone()[0]
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        need(app_id == business["applicationId"] == 0x58344D31 and version == business["userVersion"] == 1,
             "Keep the original merchant database identity.")
        definitions = connection.execute(
            "SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
        expected_tables = {row["name"]: row for row in business["tables"]}
        need(set(expected_tables) == {name for name, _sql in definitions if name != "merchant_runtimes"},
             "The original customer table set changed.")
        for name, sql in definitions:
            if name == "merchant_runtimes":
                continue
            expected = expected_tables[name]
            need(expected["sql"] == sql, "The original customer schema changed: " + name)
            cursor = connection.execute('SELECT * FROM "' + name.replace('"', '""') + '"')
            columns = [column[0] for column in cursor.description]
            actual = Counter(comparable(dict(zip(columns, (sqlite_value(value) for value in row))))
                             for row in cursor)
            retained = Counter(comparable(json.loads(row)) for row in expected["rows"])
            need(actual == retained, "The original customer records changed: " + name)
        connection.execute("ROLLBACK")
    finally:
        connection.close()

def verify_native_complete(*, lock_held=False):
    complete = load(RECEIVING / "complete.json")
    if complete is None:
        return None
    need(complete.get("schema") == "stellar-forge.merchant-installed-receiving-result.v1"
         and complete.get("operation") == OPERATION and complete.get("state") == "COMPLETE"
         and complete.get("originalOperation") == ORIGINAL_OPERATION
         and complete.get("originalArchiveSha256") == ORIGINAL_IDENTITY["sha256"]
         and complete.get("sourceCommit") == selected["source"]["commit"],
         "Keep the complete original installed receiving result.")
    need(isinstance(complete.get("invoices"), list) and len(complete["invoices"]) == 5
         and len({row["merchantOrderId"] for row in complete["invoices"]}) == 5
         and len({row["paymentId"] for row in complete["invoices"]}) == 5,
         "Retain exactly the five original completed invoices.")
    before, after = complete.get("beforeBusinessSha256"), complete.get("afterBusinessSha256")
    need(isinstance(before, str) and len(before) == 64 and before == after
         and complete.get("providerCalls") == [] and complete.get("createdInvoices") == 0
         and complete.get("submittedPayments") == 0, "Keep the unchanged original customer outcome.")
    browser = complete["browser"]
    need(isinstance(browser.get("browser"), str) and browser["browser"]
         and len(browser.get("images", [])) >= 3 and len(browser.get("downloads", [])) == 5
         and browser.get("pageErrors") == [] and browser.get("consoleErrors") == [],
         "Retain the actual complete browser and download result.")
    files = [*browser["images"], *browser["downloads"]]
    files.extend(row["download"] for row in complete["invoices"])
    for row in files:
        path = Path(row["path"])
        need(path.is_absolute() and RECEIVING in path.parents and path.parent.resolve() == path.parent,
             "Keep each original installed output in its receiving directory.")
        exact_identity(path, row)
    for row in complete["invoices"]:
        original = Path(row["resultPath"])
        need(original.is_absolute() and ORIGINAL_WORKSPACE in original.parents
             and original.parent.resolve() == original.parent, "Keep the original delivered result path.")
        exact_identity(original, row)
    if lock_held:
        verify_original_business(complete)
    else:
        with held_file(ORIGINAL_WORKSPACE / "merchant-owner.lock"):
            verify_original_business(complete)
    observations = load(RECEIVING / "provider-observation.json")
    need(observations is None or observations.get("requests") == [],
         "Preserve every original provider observation.")
    write(CONTROL / "native-result.json", complete, original=True)
    return complete

def operate():
    global native_phase_ended
    restore_original()
    receive_source()
    complete = verify_native_complete()
    if complete is not None:
        announce({"state": "ORIGINAL_INSTALLED_RESULT_REOPENED", "operation": OPERATION,
                  "sourceCommit": selected["source"]["commit"], "invoices": 5})
        return complete
    version = owned_command("original-node-version", [selected["runtime"]["node"], "--version"],
                            timeout=30, cwd=ROOT)
    need(version["exitCode"] == 0, "The original Node executable did not return its version.")
    version_text = raw(Path(version["stdout"]), 256).decode().strip()
    need(version_text.startswith("v") and int(version_text[1:].split(".")[0]) >= 24,
         "The original merchant requires Node 24 or newer.")
    state["runtime"] = {**selected["runtime"], "nodeVersion": version_text,
                        "python": sys.executable, "pythonVersion": sys.version}
    progress()
    native_phase_ended = False
    try:
        ended = owned_command("original-installed-merchant", native_arguments(), timeout=None)
        native_phase_ended = True
    finally:
        # owned_command has retained its actual main-child outcome and closed
        # its exact family before this complete-result recognition is reached.
        complete = verify_native_complete()
    if complete is not None:
        return complete
    need(ended["exitCode"] == 0, "The original installed application has an unfinished retained outcome.")
    raise RuntimeError("The original application returned without its complete receiving receipt.")

def file_stamp(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns,
            info.st_ctime_ns, stat.S_IMODE(info.st_mode))

def inventory_tree(prefix, base, excluded=()):
    result = []
    excluded = set(excluded)
    if not base.exists():
        return result
    def visit(path, relative):
        name = prefix + ("/" + relative if relative else "")
        if relative in excluded:
            return
        info = path.lstat()
        mode = stat.S_IMODE(info.st_mode)
        if stat.S_ISLNK(info.st_mode):
            target = os.readlink(path)
            resolved = (path.parent / target).resolve() if not Path(target).is_absolute() else Path(target).resolve()
            need(resolved == ROOT or ROOT in resolved.parents or resolved == ORIGINAL or ORIGINAL in resolved.parents,
                 "An original runtime link points outside the complete received project: " + name)
            body = os.fsencode(target)
            result.append({"path": name, "source": str(path), "kind": "symlink", "mode": mode,
                           "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "target": target})
        elif stat.S_ISDIR(info.st_mode):
            result.append({"path": name, "source": str(path), "kind": "directory", "mode": mode})
            for child_path in sorted(path.iterdir()):
                child_relative = child_path.name if not relative else relative + "/" + child_path.name
                visit(child_path, child_relative)
        elif stat.S_ISREG(info.st_mode):
            result.append({"path": name, "source": str(path), "kind": "file", "mode": mode, **digest(path)})
        else:
            raise RuntimeError("Close the original runtime special member before packaging: " + name)
    visit(base, "")
    return result

def artifact_manifest(complete):
    frozen_path = CONTROL / "package-selection.json"
    prior = load(frozen_path)
    if prior is not None:
        need(prior.get("operation") == OPERATION and prior.get("input_sha256") == input_sha256
             and prior.get("nativeResult") == complete, "Keep the first original package selection.")
        return prior
    # This snapshot is selected once. Subsequent resource/save observations
    # stay outside it, including recovery after final archive publication.
    snapshot = load(CONTROL / "package-state.json")
    if snapshot is None:
        snapshot = {"schema": "stellar-forge.merchant-installed-package-state.v1",
                    "operation": OPERATION, "input_sha256": input_sha256,
                    "sourceCommit": selected["source"]["commit"],
                    "nativeResult": complete, "attempts": state.get("attempts", []),
                    "closed_at": now()}
        write(CONTROL / "package-state.json", snapshot, original=True)
    else:
        need(snapshot.get("operation") == OPERATION and snapshot.get("input_sha256") == input_sha256
             and snapshot.get("sourceCommit") == selected["source"]["commit"]
             and snapshot.get("nativeResult") == complete, "Keep the first closed native package state.")
    files = []
    for prefix, base in (("source", SOURCE), ("source-cache", CACHE), ("receiving", RECEIVING), ("support", SUPPORT)):
        files.extend(inventory_tree(prefix, base))
    excluded = ("operation.lock", "state.json", "package-selection.json", "artifact.json",
                "library-save-intent.json", "library-result.json", "library-custody-ack.json", "custody.json")
    files.extend(inventory_tree("control", CONTROL, excluded))
    files.extend(inventory_tree("original-workspace", ORIGINAL, ("control/operation.lock",)))
    for name in ("SCF_X402API_Merchant_Complete_Native_Receiving_20261012.zip", "original-saved-identity.json"):
        path = ROOT / "delivery/inputs" / name
        need(path.is_file(), "Retain the original artifact and saved identity in the complete delivery.")
        files.append({"path": "inputs/" + name, "source": str(path), "kind": "file",
                      "mode": stat.S_IMODE(path.stat().st_mode), **digest(path)})
    names = [row["path"] for row in files]
    need(len(names) == len(set(names)), "Keep one exact selected member for every original path.")
    frozen = {"schema": "stellar-forge.merchant-installed-package-selection.v1",
              "operation": OPERATION, "input_sha256": input_sha256,
              "sourceCommit": selected["source"]["commit"], "nativeResult": complete, "files": files}
    write(frozen_path, frozen, original=True)
    return frozen

def zip_name(row):
    return row["path"] + ("/" if row["kind"] == "directory" else "")

def public_manifest(frozen):
    return {"schema": "stellar-forge.merchant-installed-application-delivery.v1",
            "operation": OPERATION, "originalOperation": ORIGINAL_OPERATION,
            "input_sha256": input_sha256, "sourceCommit": selected["source"]["commit"],
            "sourceTree": metadata["source"]["tree"], "originalArchive": ORIGINAL_IDENTITY,
            "nativeResult": frozen["nativeResult"],
            "restoreRoots": {"installed": str(ROOT), "original-workspace": str(ORIGINAL)},
            "files": [{key: value for key, value in row.items() if key != "source"} for row in frozen["files"]]}

def verify_artifact(path, expected=None):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        need(len(names) == len(set(names)), "The complete installed archive has duplicate members.")
        info = archive.getinfo("DELIVERY_MANIFEST.json")
        need(info.file_size <= 16 * 1024 * 1024, "Keep the complete bounded delivery inventory.")
        manifest = json.loads(archive.read(info))
        need(manifest.get("operation") == OPERATION and manifest.get("input_sha256") == input_sha256
             and manifest.get("sourceCommit") == selected["source"]["commit"]
             and manifest.get("originalArchive") == ORIGINAL_IDENTITY,
             "Keep the original complete installed archive selection.")
        if expected is not None:
            need(manifest == public_manifest(expected), "The original frozen archive selection differs.")
        rows = manifest["files"]
        paths = [safe_relative(row["path"]) for row in rows]
        need(len(paths) == len(set(paths)) and set(names) == {"DELIVERY_MANIFEST.json"} | {zip_name(row) for row in rows},
             "The complete installed archive inventory changed.")
        for row in rows:
            info = archive.getinfo(zip_name(row))
            kind = row["kind"]
            mode = info.external_attr >> 16
            expected_type = {"file": stat.S_IFREG, "directory": stat.S_IFDIR, "symlink": stat.S_IFLNK}[kind]
            need(stat.S_IFMT(mode) == expected_type and stat.S_IMODE(mode) == row["mode"],
                 "The original archived type/mode changed: " + row["path"])
            if kind == "directory":
                need(info.file_size == 0 and info.is_dir(), "Keep the exact original directory member.")
                continue
            hasher = hashlib.sha256()
            size = 0
            with archive.open(info) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    size += len(block)
                    hasher.update(block)
            need(size == row["bytes"] and hasher.hexdigest() == row["sha256"],
                 "The complete archived member differs: " + row["path"])
            if kind == "symlink":
                need(archive.read(info) == os.fsencode(row["target"]), "Keep the exact original link target.")
        complete = json.loads(archive.read("receiving/complete.json"))
        need(complete == manifest["nativeResult"] and complete.get("state") == "COMPLETE"
             and complete.get("providerCalls") == [] and len(complete.get("invoices", [])) == 5,
             "The whole original installed result is absent from its artifact.")
    return {"path": str(ARCHIVE), **digest(path), "members": len(names)}

def stream_member(archive, row):
    info = zipfile.ZipInfo(zip_name(row), date_time=(1980, 1, 1, 0, 0, 0))
    info.create_system = 3
    info.compress_type = zipfile.ZIP_DEFLATED
    kind = row["kind"]
    file_type = {"directory": stat.S_IFDIR, "symlink": stat.S_IFLNK, "file": stat.S_IFREG}[kind]
    info.external_attr = (file_type | row["mode"]) << 16
    if kind == "directory":
        info.external_attr |= 0x10
        archive.writestr(info, b"")
        return
    path = Path(row["source"])
    if kind == "symlink":
        need(path.is_symlink() and os.readlink(path) == row["target"], "The original link changed before packaging.")
        archive.writestr(info, os.fsencode(row["target"]))
        return
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        first = os.fstat(descriptor)
        need(stat.S_ISREG(first.st_mode) and first.st_size == row["bytes"]
             and stat.S_IMODE(first.st_mode) == row["mode"], "The original package member changed.")
        hasher = hashlib.sha256()
        size = 0
        with os.fdopen(descriptor, "rb", closefd=False) as source, archive.open(info, "w", force_zip64=True) as target:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                hasher.update(block)
                size += len(block)
                target.write(block)
        need(file_stamp(os.fstat(descriptor)) == file_stamp(first)
             and size == row["bytes"] and hasher.hexdigest() == row["sha256"],
             "The original package member changed during its complete read.")
    finally:
        os.close(descriptor)

def build_artifact(complete):
    need(active_child is None and active_family is None, "Close the same native family before packaging.")
    frozen = load(CONTROL / "package-selection.json")
    if ARCHIVE.exists():
        result = verify_artifact(ARCHIVE, frozen)
        descriptor = os.open(ARCHIVE, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        sync_directory(ARCHIVE.parent)
        write(CONTROL / "artifact.json", result, original=True)
        return result
    directory(ARCHIVE.parent)
    with held_file(ORIGINAL_WORKSPACE / "merchant-owner.lock"):
        verified = verify_native_complete(lock_held=True)
        need(verified == complete, "Keep the original completed receiving result.")
        frozen = artifact_manifest(complete)
        temporary = ARCHIVE.with_name(ARCHIVE.name + ".original.partial")
        finished = None
        if temporary.exists():
            try:
                finished = verify_artifact(temporary, frozen)
            except (OSError, ValueError, RuntimeError, KeyError, zipfile.BadZipFile, EOFError):
                # The one same-name unpublished partial is the original builder's
                # output. Rebuild it only against its unchanged frozen members.
                need(temporary.is_file() and not temporary.is_symlink(), "Keep the owned regular archive partial.")
        if finished is None:
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                for row in frozen["files"]:
                    stream_member(archive, row)
                manifest_info = zipfile.ZipInfo("DELIVERY_MANIFEST.json", date_time=(1980, 1, 1, 0, 0, 0))
                manifest_info.create_system = 3
                manifest_info.external_attr = (stat.S_IFREG | 0o600) << 16
                manifest_info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(manifest_info, encoded(public_manifest(frozen)))
            verify_artifact(temporary, frozen)
        descriptor = os.open(temporary, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        try:
            os.link(temporary, ARCHIVE, follow_symlinks=False)
        except FileExistsError:
            pass
        sync_directory(ARCHIVE.parent)
        result = verify_artifact(ARCHIVE, frozen)
        temporary.unlink()
        sync_directory(ARCHIVE.parent)
        write(CONTROL / "artifact.json", result, original=True)
        return result

def saved_ok(result, archive):
    rows = result.get("results") if isinstance(result, dict) else None
    if not isinstance(rows, list) or len(rows) != 1:
        return False
    row = rows[0]
    return (isinstance(row, dict) and row.get("status") == "succeeded"
            and row.get("local_path") == archive["path"]
            and bool(row.get("library_file_id") or row.get("file_id")))

def upload_workflow():
    sdk_modules()
    from library_upload import LibraryUploadWorkflow, SignedUrlUploader
    from library_file_transfer import LibraryFileMaterializer
    from library_hosted_apps import HostedAppsClient
    parent = ROOT / "publish-support/state"
    directory(parent)
    return LibraryUploadWorkflow(apps_client=HostedAppsClient(), materializer=LibraryFileMaterializer(),
                                 uploader=SignedUrlUploader(), state_parent=parent)

command_buffer = bytearray()
command_eof = False

def next_command(timeout=3):
    global command_eof
    if b"\n" in command_buffer:
        line, _, remainder = command_buffer.partition(b"\n")
        command_buffer[:] = remainder
        return json.loads(line)
    if command_eof:
        time.sleep(timeout)
        return None
    try:
        ready, _, _ = select.select([sys.stdin.fileno()], [], [], timeout)
        if not ready:
            return None
        block = os.read(sys.stdin.fileno(), 65536)
    except (OSError, ValueError):
        command_eof = True
        time.sleep(timeout)
        return None
    if not block:
        command_eof = True
        return None
    command_buffer.extend(block)
    need(len(command_buffer) <= 8 * 1024 * 1024, "Use bounded complete source-continuation frames.")
    if b"\n" in command_buffer:
        return next_command(0)
    return None

def validate_command(command):
    need(isinstance(command, dict) and command.get("operation") == OPERATION
         and command.get("input_sha256") == input_sha256, "Continue the same original receiving input.")

def handle_command(command, *, saving=False):
    validate_command(command)
    action = command.get("action")
    if action == "observe":
        announce({"state": state.get("state"), "operation": OPERATION, "input_sha256": input_sha256,
                  "root": str(ROOT), "memory": memory(), "last_attempt": state.get("attempts", [])[-1:],
                  "archive": state.get("archive")})
    elif action == "custody_ack":
        archive = load(CONTROL / "artifact.json")
        intent = load(CONTROL / "library-save-intent.json")
        need(isinstance(archive, dict) and isinstance(intent, dict) and intent.get("archive") == archive
             and command.get("archive") == archive and saved_ok(command.get("result"), archive),
             "Acknowledge only the returned identity of this original save.")
        write(CONTROL / "library-custody-ack.json",
              {"operation": OPERATION, "input_sha256": input_sha256,
               "archive": archive, "result": command["result"]}, original=True)
        announce({"state": "ORIGINAL_SAVE_ACK_RETAINED", "operation": OPERATION})
    elif saving:
        raise RuntimeError("The completed original artifact is awaiting only its original save result.")
    elif action == "supply_objects":
        supply_objects(command)
    elif action == "refresh_materialization":
        need(not ORIGINAL_ZIP.exists(), "The complete original artifact is already retained.")
        transfer = command.get("transfer")
        need(isinstance(transfer, dict)
             and transfer.get("library_file_id") in (None, ORIGINAL_IDENTITY["libraryFileId"]),
             "Refresh only the original saved-file materialization.")
        _materializer, transfer_type = sdk_modules()
        transfer_type.parse(transfer)
        path = ROOT / "transport/original-archive.json"
        if path.exists():
            body = raw(path)
            write(ROOT / "transport/history" / (hashlib.sha256(body).hexdigest() + ".json"), body, original=True)
        write(path, transfer)
        announce({"state": "ORIGINAL_MATERIALIZATION_RETAINED", "operation": OPERATION,
                  "archiveSha256": ORIGINAL_IDENTITY["sha256"]})
    elif action == "continue":
        pending_stop.clear()
        return True
    else:
        raise RuntimeError("Use the original observe, source, materialization, continue or save-ACK action.")
    return False

def await_continuation(error):
    protected()
    state.update(state="AWAITING_ORIGINAL_CONTINUATION",
                 failure={"type": type(error).__name__, "message": str(error), "at": now()},
                 pending_stop=list(pending_stop))
    try:
        progress()
    except (OSError, ValueError):
        pass
    announce({"state": state["state"], "operation": OPERATION, "input_sha256": input_sha256,
              "root": str(ROOT), "failure": state["failure"],
              "commands": ["observe", "supply_objects", "refresh_materialization", "continue"]})
    while True:
        try:
            command = next_command()
            if command is not None and handle_command(command):
                return
        except BaseException as caught:
            protected()
            announce({"state": "ORIGINAL_CONTINUATION_REJECTED", "operation": OPERATION,
                      "error": {"type": type(caught).__name__, "message": str(caught)}})

def artifact_custody(complete):
    global custody_mode
    # The complete native result or verified archive is now retained. Repeated
    # stop signals cannot abandon its sole original artifact/save custody.
    custody_mode = True
    protected()
    returned = None
    prepared_intent = None
    invoked = False
    workflow = None
    archive = None
    last_notice = None
    while True:
        try:
            if archive is None:
                archive = build_artifact(complete)
            exact_identity(ARCHIVE, archive)
            state.update(state="ARTIFACT_READY", archive=archive, native_result=complete)
            progress()
            result_path = CONTROL / "library-result.json"
            result = returned or load(result_path)
            acknowledgement = load(CONTROL / "library-custody-ack.json")
            if result is None and isinstance(acknowledgement, dict):
                need(acknowledgement.get("operation") == OPERATION
                     and acknowledgement.get("input_sha256") == input_sha256
                     and acknowledgement.get("archive") == archive, "Keep the original saved-artifact acknowledgement.")
                result = acknowledgement.get("result")
            if saved_ok(result, archive):
                write(result_path, result, original=True)
                custody = {"schema": "stellar-forge.merchant-installed-artifact-custody.v1",
                           "operation": OPERATION, "input_sha256": input_sha256,
                           "sourceCommit": selected["source"]["commit"], "archive": archive, "result": result}
                write(CONTROL / "custody.json", custody, original=True)
                state.update(state="COMPLETE", custody=custody, completed_at=state.get("completed_at") or now())
                progress()
                announce({"state": "COMPLETE", "operation": OPERATION, "archive": archive,
                          "library_result": result, "sourceCommit": selected["source"]["commit"],
                          "invoices": 5, "providerCalls": [], "root": str(ROOT)})
                return 0
            intent_path = CONTROL / "library-save-intent.json"
            existing = load(intent_path)
            if existing is not None:
                need(existing.get("operation") == OPERATION and existing.get("input_sha256") == input_sha256
                     and existing.get("archive") == archive, "Keep the original one-save intent.")
            if existing is None and prepared_intent is None:
                workflow = upload_workflow()
                prepared_intent = {"operation": OPERATION, "input_sha256": input_sha256,
                                   "archive": archive, "started_at": now()}
            if prepared_intent is not None and not invoked:
                need(existing is None or existing == prepared_intent, "Keep this foreground's exact save intent.")
                write(intent_path, prepared_intent, original=True)
                # No fallible journal or notification sits between this durable
                # intent and its one invocation. If intent durability failed,
                # this same process retains that it has not invoked the helper.
                invoked = True
                returned = workflow.run({"uploads": [{"local_path": archive["path"],
                                                      "purpose": "create_library_file",
                                                      "library_artifact_type": "other"}]})
                write(result_path, returned, original=True)
                continue
            state.update(state="AWAITING_ORIGINAL_FILE_SAVE",
                         ack_path=str(CONTROL / "library-custody-ack.json"))
            progress()
        except BaseException as caught:
            protected()
            state.update(state="AWAITING_ORIGINAL_ARTIFACT_CUSTODY",
                         recovery={"type": type(caught).__name__, "message": str(caught), "at": now()})
            try:
                progress()
            except (OSError, ValueError):
                pass
        recovery = state.get("recovery")
        notice = (state["state"], json.dumps(recovery, sort_keys=True) if recovery else None)
        if notice != last_notice:
            announce({"state": state["state"], "operation": OPERATION, "input_sha256": input_sha256,
                      "archive": archive, "recovery": recovery,
                      "original_save_invoked_here": invoked, "control": str(CONTROL)})
            last_notice = notice
        try:
            command = next_command()
            if command is not None:
                handle_command(command, saving=True)
        except BaseException as caught:
            protected()
            announce({"state": "ORIGINAL_CUSTODY_COMMAND_REJECTED", "error": str(caught)})
        # Stdin EOF and local journal failures do not abandon the private archive.

def archived_result():
    if not ARCHIVE.exists():
        return None
    frozen = load(CONTROL / "package-selection.json")
    archive = verify_artifact(ARCHIVE, frozen)
    with zipfile.ZipFile(ARCHIVE) as selected_archive:
        complete = json.loads(selected_archive.read("receiving/complete.json"))
    state.update(native_result=complete, archive=archive)
    return complete

def main():
    global state, operation_descriptor, original_descriptor
    directory(ROOT)
    directory(CONTROL)
    with held_file(CONTROL / "operation.lock") as descriptor:
        operation_descriptor = descriptor
        validate_input()
        state = load(CONTROL / "state.json") or {
            "schema": "stellar-forge.merchant-installed-foreground.v1",
            "operation": OPERATION, "input_sha256": input_sha256,
            "sourceCommit": selected["source"]["commit"], "root": str(ROOT),
            "started_at": now(), "state": "PREPARED", "attempts": []}
        need(state.get("operation") == OPERATION and state.get("input_sha256") == input_sha256
             and state.get("sourceCommit") == selected["source"]["commit"],
             "Keep the original installed receiving state.")
        protected()
        if state.get("state") == "COMPLETE":
            custody = load(CONTROL / "custody.json")
            need(isinstance(custody, dict) and custody == state.get("custody")
                 and custody.get("operation") == OPERATION and custody.get("input_sha256") == input_sha256
                 and saved_ok(custody.get("result"), custody.get("archive", {})),
                 "Keep the actual completed original saved-file identity.")
            if ARCHIVE.exists():
                exact_identity(ARCHIVE, custody["archive"])
            announce({"state": "COMPLETE", "reused": True, "operation": OPERATION,
                      "archive": custody["archive"], "library_result": custody["result"]})
            return 0
        # A published complete archive is sufficient for its pending original
        # save even if a later namespace no longer holds its unpacked copies.
        completed_archive = retain("RETAINING_ORIGINAL_ARCHIVE_READBACK", archived_result)
        if completed_archive is not None:
            return artifact_custody(completed_archive)
        with held_file(ORIGINAL / "control/operation.lock") as original_lock:
            original_descriptor = original_lock
            while True:
                result = None
                failure = None
                try:
                    install_stop()
                    result = operate()
                except BaseException as caught:
                    failure = caught
                finally:
                    protected()
                    # Keep the exact completed return, including a return whose
                    # later ordinary progress write failed. No child/family is
                    # left active when operate reaches this boundary.
                    if active_child is not None or active_family is not None:
                        retain("RETAINING_ORIGINAL_NATIVE_LIFETIME",
                               lambda: need(active_child is None and active_family is None,
                                            "The original owned child/family has not returned."))
                    if result is None and (RECEIVING / "complete.json").exists():
                        result = retain("RETAINING_ORIGINAL_COMPLETE_RESULT", verify_native_complete)
                    if result is not None:
                        state["native_result"] = result
                        return artifact_custody(result)
                await_continuation(failure or RuntimeError("Continue the same original installed receiving."))
        original_descriptor = None
    operation_descriptor = None

if __name__ == "__main__":
    raise SystemExit(main())
