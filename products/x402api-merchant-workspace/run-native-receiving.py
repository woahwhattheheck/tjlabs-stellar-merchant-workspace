#!/usr/bin/env python3
# MIT License. One native merchant receiving operation and its complete artifact.
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import select
import shutil
import signal
import stat
import subprocess
import sys
import time
import uuid
import zipfile

OPERATION = "SCF-X402API-MERCHANT-COMMISSIONING-7DE2-20261012"
PHASES = ("initialize", "original", "handler-interrupt", "handler-resume", "result-interrupt", "result-resume", "payment-return", "incomplete-success", "verify")
BOUNDARIES = {"handler-interrupt": "HANDLER_RETURN_BEFORE_STORE", "result-interrupt": "SF31_ORIGINAL_RESERVATION"}
SDK_ORIGINAL = Path("/workspace/scratch/7de2cd02ad5f/newton-corpus-continuation/library-native-20261012")
SDK_PINS = {
 "library_upload.py": "5bc473dadefe1f68ee8797baaed19d6662642d0ea4bcba128fa12938faa0d767",
 "library_file_transfer.py": "5e1557817be17db06e2375f8c34ed83e948d520242e5ee4cb50a30c7a4c83378",
 "library_hosted_apps.py": "97d029b097ace62b744c82dfde20ef6921ed543a33a771ecf6452bd655d11b59",
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--root", type=Path, required=True)
args = parser.parse_args()
ROOT = args.root
if not ROOT.is_absolute() or ROOT.resolve() != ROOT:
    raise RuntimeError("Use the original absolute native directory.")
CONTROL = ROOT / "control"
SOURCE = ROOT / "source"
RECEIVING = ROOT / "receiving"
DRIVER = SOURCE / "products/x402api-merchant-workspace/native-receiving.mjs"
ARCHIVE = ROOT / "delivery/SCF_X402API_Merchant_Complete_Native_Receiving_20261012.zip"
os.umask(0o077)
pending_stop = []
child = None
node = None
state = None
selected = None
operation_descriptor = None

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
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as stream:
            stream.write(body)
            stream.flush()
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    try:
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
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass

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

def protected():
    for number in (signal.SIGINT, signal.SIGTERM):
        signal.signal(number, signal.SIG_IGN)

def install_stop():
    for number in (signal.SIGINT, signal.SIGTERM):
        signal.signal(number, stop)

def live_group(group):
    for entry in Path("/proc").iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
        except (FileNotFoundError, ProcessLookupError):
            continue
        if int(fields[2]) == group and fields[0] not in ("Z", "X"):
            return True
    return False

def drain(original):
    protected()
    try:
        os.killpg(original.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    deadline = time.monotonic() + 5
    while live_group(original.pid) and time.monotonic() < deadline:
        time.sleep(0.05)
    if live_group(original.pid):
        try:
            os.killpg(original.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    while live_group(original.pid):
        time.sleep(0.05)
    original.wait()

def phase_accepted(row):
    if row.get("state") != "ENDED" or row.get("operation") != OPERATION or row.get("source_sha256") != selected["source_sha256"]:
        return False
    phase = row["phase"]
    if phase in BOUNDARIES:
        marker = row.get("boundary")
        return (row.get("exit_code") == -9 and isinstance(marker, dict)
            and marker.get("schema") == "stellar-forge.merchant-native-interruption.v1"
            and marker.get("operation") == OPERATION and marker.get("sourceSha256") == selected["source_sha256"]
            and marker.get("phase") == phase and marker.get("attempt") == row["attempt"]
            and marker.get("pid") == row.get("pid") and marker.get("kind") == BOUNDARIES[phase]
            and marker.get("workspace") == str(RECEIVING / "workspace"))
    return row.get("exit_code") == 0

def persist_ended(row, outputs=()):
    protected()
    last_notice = None
    while True:
        try:
            for stream in outputs:
                stream.flush()
                os.fsync(stream.fileno())
            write(CONTROL / "attempts" / (row["attempt"] + ".json"), row)
            progress()
            return
        except (OSError, ValueError) as error:
            notice = (type(error).__name__, str(error))
            if notice != last_notice:
                announce({"state": "RETAINING_ORIGINAL_CHILD_OUTCOME", "phase": row["phase"], "attempt": row["attempt"], "exit_code": row.get("exit_code"), "error": notice})
                last_notice = notice
            time.sleep(2)

def run_phase(phase):
    global child
    if any(row["phase"] == phase and phase_accepted(row) for row in state["attempts"]):
        announce({"state": "ORIGINAL_PHASE_REUSED", "phase": phase})
        return
    if pending_stop:
        raise SystemExit(128 + pending_stop[0])
    attempt = uuid.uuid4().hex
    # The native driver retains conventional UUID spelling.
    attempt = str(uuid.UUID(attempt))
    folder = CONTROL / "attempts"
    directory(folder)
    stdout = folder / (attempt + ".stdout")
    stderr = folder / (attempt + ".stderr")
    command = [node, "--max-old-space-size=192", str(DRIVER), "--directory", str(RECEIVING), "--phase", phase]
    row = {"operation": OPERATION, "source_sha256": selected["source_sha256"], "phase": phase,
        "attempt": attempt, "state": "PREPARED", "started_at": now(), "argv": command,
        "driver": digest(DRIVER), "stdout": str(stdout), "stderr": str(stderr), "memory_before": memory()}
    state["attempts"].append(row)
    state["state"] = "RUNNING"
    write(folder / (attempt + ".intent.json"), row, original=True)
    progress()
    child = None
    outcome = None
    interruption = None
    previous = {number: signal.getsignal(number) for number in (signal.SIGINT, signal.SIGTERM)}
    deferred = []
    def defer(number, _frame):
        deferred.append(number)
    env = {**os.environ, "MERCHANT_COMMISSION_SOURCE_SHA256": selected["source_sha256"],
        "MERCHANT_COMMISSION_ATTEMPT": attempt, "PYTHONDONTWRITEBYTECODE": "1"}
    with stdout.open("xb", buffering=0) as out, stderr.open("xb", buffering=0) as err:
        try:
            for number in previous:
                signal.signal(number, defer)
            child = subprocess.Popen(command, cwd=SOURCE, env=env, stdin=subprocess.DEVNULL,
                stdout=out, stderr=err, start_new_session=True, pass_fds=(operation_descriptor,))
            row.update(state="RUNNING", pid=child.pid)
            for number in previous:
                signal.signal(number, stop)
            if deferred:
                pending_stop.extend(deferred)
                raise SystemExit(128 + deferred[0])
            progress()
            announce({"state": "NATIVE_PHASE_STARTED", "phase": phase, "attempt": attempt, "pid": child.pid})
            deadline = time.monotonic() + 240
            next_notice = time.monotonic() + 20
            while child.poll() is None:
                if time.monotonic() >= deadline:
                    raise TimeoutError("The original native phase exceeded its 240-second receiving bound.")
                if time.monotonic() >= next_notice:
                    announce({"state": "NATIVE_PHASE_RUNNING", "phase": phase, "attempt": attempt,
                        "stdout_tail": tail(stdout, 2000), "stderr_tail": tail(stderr, 2000), "memory": memory()})
                    next_notice = time.monotonic() + 20
                time.sleep(0.1)
            outcome = child.wait()
        except BaseException as error:
            interruption = {"kind": type(error).__name__, "message": str(error), "at": now()}
            if child is not None:
                drain(child)
                outcome = child.returncode
        finally:
            protected()
            if child is not None and child.poll() is None:
                drain(child)
                outcome = child.returncode
            child = None
            row.update(state="ENDED", exit_code=outcome, ended_at=now(), interruption=interruption,
                memory_after=memory(), stdout_tail=tail(stdout), stderr_tail=tail(stderr))
            # Keep the actual returned outcome in RAM through all output and
            # marker publication errors before releasing this original phase.
            while True:
                try:
                    marker = load(RECEIVING / "boundaries" / (attempt + ".json"))
                    if marker is not None:
                        row["boundary"] = marker
                    break
                except (OSError, ValueError) as marker_error:
                    announce({"state": "RETAINING_BOUNDARY_READ", "attempt": attempt, "exit_code": outcome, "error": str(marker_error)})
                    time.sleep(2)
            persist_ended(row, (out, err))
    announce({"state": "NATIVE_PHASE_ENDED", "phase": phase, "attempt": attempt, "exit_code": outcome,
        "accepted": phase_accepted(row), "boundary": row.get("boundary"), "stdout_tail": row["stdout_tail"], "stderr_tail": row["stderr_tail"]})
    install_stop()
    if not phase_accepted(row):
        raise RuntimeError("Continue the original failed phase and its retained native outcome: " + phase)
    if pending_stop:
        raise SystemExit(128 + pending_stop[0])

def check_source():
    amendments = state.get("source_amendments", [])
    current = {row["path"]: row for row in selected["files"]}
    for change in amendments:
        current[change["path"]] = {**current[change["path"]], "bytes": change["postimage"]["bytes"], "sha256": change["postimage"]["sha256"]}
    for relative, row in current.items():
        got = digest(SOURCE / relative)
        if got != {"bytes": row["bytes"], "sha256": row["sha256"]}:
            raise RuntimeError("The original selected source differs: " + relative)

def operate():
    check_source()
    for phase in PHASES:
        run_phase(phase)
    complete = load(RECEIVING / "complete.json")
    if not isinstance(complete, dict) or complete.get("operation") != OPERATION or complete.get("sourceSha256") != selected["source_sha256"] or complete.get("state") != "COMPLETE" or len(complete.get("orders", [])) != 5:
        raise RuntimeError("Retain the complete original native merchant result.")
    state.update(state="NATIVE_COMPLETE", native_result=complete, native_completed_at=now())
    progress()
    return complete

def artifact_members():
    members = []
    for family in ("source", "receiving", "control"):
        base = ROOT / family
        for path in sorted(base.rglob("*")):
            info = path.lstat()
            if stat.S_ISDIR(info.st_mode):
                continue
            if not stat.S_ISREG(info.st_mode) or path.is_symlink():
                raise RuntimeError("Keep the original regular artifact members.")
            relative = path.relative_to(ROOT).as_posix()
            if relative in {"control/operation.lock", "control/state.json"}:
                continue
            if ".partial" in path.name:
                raise RuntimeError("A pending original artifact member needs reconciliation: " + relative)
            members.append((relative, path, digest(path)))
    return members

def verify_archive():
    with zipfile.ZipFile(ARCHIVE) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise RuntimeError("The complete artifact has duplicate members.")
        manifest = json.loads(archive.read("DELIVERY_MANIFEST.json"))
        if manifest.get("operation") != OPERATION or manifest.get("source_sha256") != selected["source_sha256"]:
            raise RuntimeError("Use the original complete artifact.")
        rows = manifest["files"]
        if set(names) != {"DELIVERY_MANIFEST.json"} | {row["path"] for row in rows}:
            raise RuntimeError("The complete artifact inventory changed.")
        for row in rows:
            hasher = hashlib.sha256()
            size = 0
            with archive.open(row["path"]) as stream:
                while True:
                    block = stream.read(1024 * 1024)
                    if not block:
                        break
                    size += len(block)
                    hasher.update(block)
            if size != row["bytes"] or hasher.hexdigest() != row["sha256"]:
                raise RuntimeError("The complete artifact member changed: " + row["path"])
        complete = json.loads(archive.read("receiving/complete.json"))
        if complete.get("state") != "COMPLETE" or complete.get("operation") != OPERATION or len(complete.get("orders", [])) != 5:
            raise RuntimeError("The artifact must contain the whole native result.")
    return {"path": str(ARCHIVE), **digest(ARCHIVE), "members": len(names)}

def build_artifact():
    if ARCHIVE.exists():
        result = verify_archive()
        write(CONTROL / "artifact.json", result, original=True)
        return result
    directory(ARCHIVE.parent)
    snapshot_path = CONTROL / "native-complete-state.json"
    retained = load(snapshot_path)
    if retained is None:
        write(snapshot_path, state, original=True)
    elif retained.get("operation") != OPERATION or retained.get("source_sha256") != selected["source_sha256"] or retained.get("native_result") != state["native_result"]:
        raise RuntimeError("Keep the original closed native project state.")
    members = artifact_members()
    manifest = {"schema": "stellar-forge.merchant-complete-native-delivery.v1", "operation": OPERATION,
        "source_sha256": selected["source_sha256"], "mode": "LOCAL_NATIVE_COMMISSIONING",
        "native_result": state["native_result"], "source_amendments": state.get("source_amendments", []),
        "files": [{"path": name, **identity} for name, _, identity in members]}
    temporary = ARCHIVE.with_name(ARCHIVE.name + ".original.partial")
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for relative, path, identity in members:
            before = digest(path)
            if before != identity:
                raise RuntimeError("A selected member changed before packaging.")
            archive.write(path, relative)
            if digest(path) != identity:
                raise RuntimeError("A selected member changed during packaging.")
        archive.writestr("DELIVERY_MANIFEST.json", encoded(manifest))
    descriptor = os.open(temporary, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    try:
        os.link(temporary, ARCHIVE, follow_symlinks=False)
    except FileExistsError:
        pass
    result = verify_archive()
    temporary.unlink()
    sync_directory(ARCHIVE.parent)
    write(CONTROL / "artifact.json", result, original=True)
    return result

def saved_ok(result, archive):
    rows = result.get("results") if isinstance(result, dict) else None
    if not isinstance(rows, list) or len(rows) != 1:
        return False
    row = rows[0]
    return isinstance(row, dict) and row.get("status") == "succeeded" and row.get("local_path") == archive["path"] and bool(row.get("library_file_id") or row.get("file_id"))

def sdk():
    for directory_path in (ROOT / "publish-support/official", SDK_ORIGINAL):
        if all((directory_path / name).is_file() for name in SDK_PINS):
            for name, pin in SDK_PINS.items():
                if digest(directory_path / name)["sha256"] != pin:
                    raise RuntimeError("Use the complete selected official Library helper: " + name)
            sys.path.insert(0, str(directory_path))
            from library_upload import LibraryUploadWorkflow, SignedUrlUploader
            from library_file_transfer import LibraryFileMaterializer
            from library_hosted_apps import HostedAppsClient
            state_parent = ROOT / "publish-support/state"
            directory(state_parent)
            return LibraryUploadWorkflow(apps_client=HostedAppsClient(), materializer=LibraryFileMaterializer(),
                uploader=SignedUrlUploader(), state_parent=state_parent)
    raise FileNotFoundError("The original official Library SDK is not present in this native generation.")

def artifact_custody():
    protected()
    returned = None
    started_save = False
    last_notice = None
    archive = None
    while True:
        try:
            if archive is None:
                archive = build_artifact()
            if digest(ARCHIVE) != {"bytes": archive["bytes"], "sha256": archive["sha256"]}:
                raise RuntimeError("Preserve the original complete native archive.")
            state.update(state="ARTIFACT_READY", archive=archive)
            progress()
            result_path = CONTROL / "library-result.json"
            result = returned or load(result_path)
            if result is None:
                acknowledgement = load(CONTROL / "library-custody-ack.json")
                if isinstance(acknowledgement, dict) and acknowledgement.get("archive") == archive:
                    result = acknowledgement.get("result")
            if saved_ok(result, archive):
                write(result_path, result, original=True)
                custody = {"schema": "stellar-forge.merchant-native-artifact-custody.v1", "operation": OPERATION,
                    "source_sha256": selected["source_sha256"], "archive": archive, "result": result}
                write(CONTROL / "custody.json", custody, original=True)
                state.update(state="COMPLETE", custody=custody, completed_at=state.get("completed_at") or now())
                progress()
                announce({"state": "COMPLETE", "operation": OPERATION, "archive": archive, "library_result": result,
                    "native_result": state["native_result"]})
                return 0
            intent_path = CONTROL / "library-save-intent.json"
            intent = load(intent_path)
            if intent is not None:
                if intent.get("operation") != OPERATION or intent.get("archive") != archive or intent.get("source_sha256") != selected["source_sha256"]:
                    raise RuntimeError("Keep the original one-save intent.")
            elif not started_save:
                workflow = sdk()
                intent = {"operation": OPERATION, "archive": archive, "source_sha256": selected["source_sha256"], "started_at": now()}
                write(intent_path, intent, original=True)
                started_save = True
                state["state"] = "SAVING"
                progress()
                announce({"state": "ORIGINAL_FILE_SAVE_STARTED", "archive": archive})
                returned = workflow.run({"uploads": [{"local_path": archive["path"], "purpose": "create_library_file", "library_artifact_type": "other"}]})
                # Keep this exact returned object in the held foreground until
                # every local custody record is durable; never repeat the save.
                write(result_path, returned, original=True)
                continue
            state.update(state="AWAITING_ORIGINAL_FILE_SAVE", ack_path=str(CONTROL / "library-custody-ack.json"))
            progress()
        except BaseException as error:
            state.update(state="AWAITING_ARTIFACT_CUSTODY", recovery={"kind": type(error).__name__, "message": str(error), "at": now()})
            try:
                progress()
            except (OSError, ValueError):
                pass
        notice = (state["state"], json.dumps(state.get("recovery"), sort_keys=True))
        if notice != last_notice:
            announce({"state": state["state"], "archive": archive, "recovery": state.get("recovery"),
                "control": str(CONTROL), "original_save_pending": started_save or (CONTROL / "library-save-intent.json").exists()})
            last_notice = notice
        # A completed private project remains owned even after terminal stdin EOF.
        time.sleep(3)

def source_adoption(command):
    if command.get("operation") != OPERATION or command.get("source_sha256") != selected["source_sha256"]:
        raise RuntimeError("Continue the original retained source operation.")
    files = command.get("files")
    if not isinstance(files, list) or not files:
        raise RuntimeError("Use a complete selected source amendment.")
    selected_paths = {row["path"] for row in selected["files"]}
    for row in files:
        relative = row["path"]
        if relative not in selected_paths or Path(relative).is_absolute() or any(part in ("", ".", "..") for part in relative.split("/")):
            raise RuntimeError("Keep the original selected source path.")
        body = row["source"].encode()
        post = {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
        if post != row["postimage"]:
            raise RuntimeError("The complete source amendment changed.")
        target = SOURCE / relative
        current = digest(target)
        old = row["preimage"]
        if current not in (old, post):
            raise RuntimeError("The original source preimage changed.")
        adoption = {"path": relative, "preimage": old, "postimage": post}
        history_path = CONTROL / "source-amendments" / (post["sha256"] + ".json")
        history = load(history_path)
        if history is None:
            if current != old:
                raise RuntimeError("Retain the original source preimage before adoption.")
            history = {**adoption, "operation": OPERATION, "source_sha256": selected["source_sha256"],
                "preimage_source": raw(target).decode(), "postimage_source": row["source"], "at": now()}
            write(history_path, history, original=True)
        elif any(history.get(key) != value for key, value in adoption.items()):
            raise RuntimeError("Keep the original source amendment history.")
        if current == old:
            write(target, body)
        if adoption not in state.setdefault("source_amendments", []):
            state["source_amendments"].append(adoption)
        progress()
    announce({"state": "ORIGINAL_SOURCE_AMENDMENT_RETAINED", "files": [row["path"] for row in files]})

def await_continuation(error):
    protected()
    state.update(state="AWAITING_NATIVE_CONTINUATION", failure={"kind": type(error).__name__, "message": str(error), "at": now()}, pending_stop=pending_stop[:])
    try:
        progress()
    except (OSError, ValueError):
        pass
    announce({"state": state["state"], "operation": OPERATION, "root": str(ROOT), "failure": state["failure"],
        "commands": ["observe", "source_adoption", "resume"], "attempts": state["attempts"][-1:]})
    eof = False
    while True:
        if eof:
            time.sleep(3)
            continue
        ready, _, _ = select.select([sys.stdin], [], [], 3)
        if not ready:
            continue
        line = sys.stdin.readline()
        if not line:
            eof = True
            continue
        try:
            command = json.loads(line)
            if command.get("action") == "observe":
                announce({"state": state["state"], "root": str(ROOT), "memory": memory(), "last_attempt": state["attempts"][-1:]})
            elif command.get("action") == "source_adoption":
                source_adoption(command)
            elif command.get("action") == "resume":
                if command.get("operation") != OPERATION or command.get("source_sha256") != selected["source_sha256"]:
                    raise RuntimeError("Resume the same original operation and input.")
                pending_stop.clear()
                install_stop()
                return
            else:
                raise RuntimeError("Use the original continuation command.")
        except (ValueError, KeyError, OSError, RuntimeError) as command_error:
            announce({"state": "CONTINUATION_REJECTED", "error": str(command_error)})

def finish_native(result):
    protected()
    last_notice = None
    while True:
        try:
            complete = result or load(RECEIVING / "complete.json")
            accepted = all(any(row["phase"] == phase and phase_accepted(row) for row in state["attempts"]) for phase in PHASES)
            if isinstance(complete, dict) and complete.get("state") == "COMPLETE" and complete.get("operation") == OPERATION and complete.get("sourceSha256") == selected["source_sha256"] and accepted:
                state["native_result"] = complete
                return artifact_custody()
            return None
        except BaseException as error:
            notice = (type(error).__name__, str(error))
            if notice != last_notice:
                announce({"state": "RETAINING_ORIGINAL_NATIVE_RESULT", "error": notice, "root": str(ROOT)})
                last_notice = notice
            time.sleep(3)

def main():
    global state, selected, node, operation_descriptor
    directory(ROOT)
    directory(CONTROL)
    descriptor = os.open(CONTROL / "operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise RuntimeError("Use the original operation lock.")
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        operation_descriptor = descriptor
        frame = load(CONTROL / "input.json")
        if not frame or frame.get("operation") != OPERATION or frame.get("root") != str(ROOT):
            raise RuntimeError("Use the original complete native source input.")
        selected = frame["selection"]
        if selected.get("source_sha256") != hashlib.sha256(encoded(selected["identity"])).hexdigest():
            raise RuntimeError("The original source selection identity changed.")
        state = load(CONTROL / "state.json") or load(CONTROL / "native-complete-state.json") or {"schema": "stellar-forge.merchant-native-operation.v1", "operation": OPERATION,
            "source_sha256": selected["source_sha256"], "root": str(ROOT), "started_at": now(), "attempts": [], "source_amendments": []}
        if state.get("operation") != OPERATION or state.get("source_sha256") != selected["source_sha256"]:
            raise RuntimeError("Keep the original native operation state.")
        if state.get("state") == "COMPLETE":
            if not saved_ok(state.get("custody", {}).get("result"), state["archive"]):
                raise RuntimeError("The original complete custody changed.")
            announce(state)
            return 0
        node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
        if not node or not shutil.which("flock"):
            raise RuntimeError("Use the original installed Node and kernel flock.")
        version = subprocess.run([node, "--version"], check=True, capture_output=True, text=True).stdout.strip()
        if not version.startswith("v24."):
            raise RuntimeError("The original merchant requires native Node 24: " + version)
        state["runtime"] = {"node": node, "node_version": version, "python": sys.executable, "python_version": sys.version, "memory": memory()}
        progress()
        announce({"state": "NATIVE_SOURCE_READY", "operation": OPERATION, "source_sha256": selected["source_sha256"],
            "files": len(selected["files"]), "root": str(ROOT), "runtime": state["runtime"]})
        install_stop()
        while True:
            result = None
            failure = None
            try:
                result = operate()
            except BaseException as error:
                failure = error
            finally:
                protected()
                # A signal just after the original verify return must recognize
                # and retain the actual complete result before any further work.
                finished = finish_native(result)
                if finished is not None:
                    return finished
            await_continuation(failure or RuntimeError("Retain the original native continuation."))
    finally:
        os.close(descriptor)

if __name__ == "__main__":
    raise SystemExit(main())
