#!/usr/bin/env python3
"""Build and run the complete CanadaBuys bidder application and preserve the working delivery."""
from __future__ import annotations
import ast
import codecs
import gc
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import traceback
import uuid
import zipfile

OPERATION = "CANADABUYS-BIDDER-DESK-6BA15-20261012"
STARTED = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
TASK = uuid.uuid4().hex
ROOT = None
CHILD = None

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def event(name, **values):
    print(json.dumps({"event": name, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **values}, ensure_ascii=False), flush=True)

def runtime_resources(stage, child_pid=None):
    """Retain this operation's actual process and cgroup memory readings."""
    value = {"stage": stage, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
             "namespacePid": os.getpid(), "childNamespacePid": child_pid}
    paths = {"bootId": "/proc/sys/kernel/random/boot_id", "processCgroup": "/proc/self/cgroup",
             "memoryCurrent": "/sys/fs/cgroup/memory.current", "memoryMax": "/sys/fs/cgroup/memory.max",
             "memoryPeak": "/sys/fs/cgroup/memory.peak", "memoryEvents": "/sys/fs/cgroup/memory.events"}
    for key, name in paths.items():
        try:
            value[key] = Path(name).read_text().strip()
        except OSError as error:
            value[key] = {"error": str(error)}
    for label, pid in (("python", os.getpid()), ("node", child_pid)):
        if pid is None:
            continue
        try:
            value[label] = {line.split(":", 1)[0]: line.split(":", 1)[1].strip()
                            for line in Path("/proc/" + str(pid) + "/status").read_text().splitlines()
                            if line.startswith(("Name:", "State:", "VmPeak:", "VmSize:", "VmHWM:", "VmRSS:"))}
        except OSError as error:
            value[label] = {"error": str(error)}
    if ROOT is not None:
        try:
            with (ROOT / "resource-history.jsonl").open("ab") as output:
                output.write((json.dumps(value, ensure_ascii=False) + "\n").encode("utf-8"))
                output.flush()
                os.fsync(output.fileno())
        except OSError as error:
            value["resourceHistoryError"] = str(error)
    event("CANADABUYS_RUNTIME_RESOURCES", **value)
    return value

def pin(raw, expected, label):
    if len(raw) != expected["bytes"] or digest(raw) != expected["sha256"]:
        raise RuntimeError(label + " differs from its complete source")
    return raw

def regular(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError("Expected original regular file: " + str(path))
    return info

def member(root, name):
    part = PurePosixPath(name)
    if part.is_absolute() or not part.parts or any(x in ("", ".", "..") for x in part.parts):
        raise RuntimeError("Invalid source member: " + name)
    return root.joinpath(*part.parts)

def write_once(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        regular(path)
        if path.read_bytes() != raw:
            raise RuntimeError("Existing source or result differs: " + str(path))
        return
    with path.open("xb") as output:
        output.write(raw)
        output.flush()
        os.fsync(output.fileno())

def record(path, root=None):
    regular(path)
    with path.open("rb") as source:
        before = os.fstat(source.fileno())
        hash_value = hashlib.sha256()
        size = 0
        for block in iter(lambda: source.read(262144), b""):
            size += len(block)
            hash_value.update(block)
        after = os.fstat(source.fileno())
    for field in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns"):
        if getattr(before, field) != getattr(after, field):
            raise RuntimeError("Working file changed while preserving it: " + str(path))
    if size != before.st_size:
        raise RuntimeError("Working file length changed: " + str(path))
    return {"path": path.relative_to(root).as_posix() if root else str(path),
            "bytes": size, "sha256": hash_value.hexdigest()}

def select_root():
    attempts = []
    for value in PAYLOAD["directoryParents"]:
        parent = Path(value)
        try:
            info = os.statvfs(parent)
            if info.f_bavail * info.f_frsize < 32 * 1024 * 1024 or (info.f_favail != 0 and info.f_favail < 256):
                attempts.append({"parent": str(parent), "reason": "insufficient free space for the complete source and workspaces",
                                 "freeBytes": info.f_bavail * info.f_frsize, "freeInodes": info.f_favail})
                continue
            root = Path(tempfile.mkdtemp(prefix="canadabuys-bidder-6ba15-", dir=str(parent)))
            write_once(root / "operation.json", encoded({"schema": "commons.canadabuys.native-delivery.v1",
                "operationId": OPERATION, "runId": TASK, "started": STARTED,
                "sourceCommit": PAYLOAD["sourceCommit"], "applicationPacket": PAYLOAD["applicationPacketPin"]}))
            return root, attempts
        except OSError as error:
            attempts.append({"parent": str(parent), "reason": str(error)})
    raise RuntimeError("Complete application directory could not be created: " + json.dumps(attempts))

def selected_runtime(key):
    path = Path(PAYLOAD["runtime"][key]).resolve(strict=True)
    regular(path)
    if key in ("node", "chromium") and not os.access(path, os.X_OK):
        raise RuntimeError("Selected runtime is not executable: " + str(path))
    return path

def run_node(command, environment):
    global CHILD
    output_path = ROOT / "native-output.log"
    decoder = codecs.getincrementaldecoder("utf-8")("replace")
    with output_path.open("xb") as log:
        CHILD = subprocess.Popen(command, cwd=str(ROOT), env=environment, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True, bufsize=0)
        event("CANADABUYS_NATIVE_STARTED", namespacePid=CHILD.pid, command=command)
        runtime_resources("native-started", CHILD.pid)
        fd = CHILD.stdout.fileno()
        os.set_blocking(fd, False)
        selector = selectors.DefaultSelector()
        selector.register(fd, selectors.EVENT_READ)
        last_heartbeat = time.monotonic()
        try:
            while selector.get_map():
                for key, _ in selector.select(timeout=10):
                    raw = os.read(key.fd, 65536)
                    if not raw:
                        selector.unregister(key.fd)
                        break
                    log.write(raw)
                    log.flush()
                    text_value = decoder.decode(raw)
                    if text_value:
                        sys.stdout.write(text_value)
                        sys.stdout.flush()
                if time.monotonic() - last_heartbeat >= 30:
                    event("CANADABUYS_NATIVE_RUNNING", namespacePid=CHILD.pid)
                    runtime_resources("native-running", CHILD.pid)
                    last_heartbeat = time.monotonic()
            remainder = decoder.decode(b"", final=True)
            if remainder:
                sys.stdout.write(remainder)
                sys.stdout.flush()
            code = CHILD.wait()
            os.fsync(log.fileno())
        finally:
            selector.close()
            CHILD.stdout.close()
            if CHILD.poll() is None:
                os.killpg(CHILD.pid, signal.SIGTERM)
                try:
                    CHILD.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(CHILD.pid, signal.SIGKILL)
                    CHILD.wait()
    runtime_resources("native-exited", CHILD.pid)
    event("CANADABUYS_NATIVE_EXITED", namespacePid=CHILD.pid, exitCode=code)
    return code

def result_success(value):
    selected = value
    for key in PAYLOAD["receiving"]["successPath"]:
        if not isinstance(selected, dict) or key not in selected:
            return False
        selected = selected[key]
    return selected == PAYLOAD["receiving"]["successValue"]

def save_delivery(paths):
    caller = ROOT / "programme" / "library_upload_private_state.py"
    request = {"uploads": [{"local_path": str(path), "purpose": "create_library_file",
                           "library_artifact_type": "other"} for path in paths]}
    environment = dict(os.environ)
    environment["AZCOPY_CONCURRENCY_VALUE"] = "1"
    if PAYLOAD["runtime"].get("libraryHelper"):
        environment["COMMONS_CANONICAL_LIBRARY_UPLOAD_HELPER"] = PAYLOAD["runtime"]["libraryHelper"]
    environment["COMMONS_LIBRARY_UPLOAD_STATE_PARENT"] = str(ROOT / "library-state")
    environment["TMPDIR"] = str(ROOT / "library-state" / "tmp")
    Path(environment["TMPDIR"]).mkdir(parents=True, exist_ok=True, mode=0o700)
    completed = subprocess.run([sys.executable, "-B", str(caller)], input=encoded(request),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=str(ROOT), env=environment, check=False)
    write_once(ROOT / "library-save.stdout", completed.stdout)
    write_once(ROOT / "library-save.stderr", completed.stderr)
    if completed.returncode != 0:
        raise RuntimeError("Complete delivery save failed: " + completed.stderr.decode("utf-8", "replace")[-1600:])
    value = json.loads(completed.stdout)
    write_once(ROOT / "library-save-result.json", encoded(value))
    results = value.get("results", value.get("uploads"))
    if not isinstance(results, list) or len(results) != len(paths) or any(x.get("status") != "succeeded" for x in results):
        raise RuntimeError("The complete delivery save did not finalize every artifact: " + json.dumps(value))
    event("CANADABUYS_LIBRARY_SAVED", results=results)
    return value

def preserve(status):
    if ROOT is None:
        raise RuntimeError("No working application directory was created")
    write_once(ROOT / "execution.json", encoded(status))
    members = []
    excluded = []
    for path in sorted(ROOT.rglob("*")):
        relative = path.relative_to(ROOT).as_posix()
        if path.is_dir() and not path.is_symlink():
            continue
        if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
            excluded.append({"path": relative, "kind": "nonregular runtime member"})
            continue
        members.append(record(path, ROOT))
    manifest = {"schema": "commons.canadabuys.complete-delivery-members.v1", "operationId": OPERATION,
                "runId": TASK, "sourceCommit": PAYLOAD["sourceCommit"], "outcome": status["outcome"],
                "files": members, "nonregularRuntimeMembers": excluded}
    write_once(ROOT / "member-manifest.json", encoded(manifest))
    outcome_name = "Receiving" if status["outcome"] == "PASS" else "Checkpoint"
    destination = ROOT.parent / ("CanadaBuys_Bidder_Desk_" + outcome_name + "_" + TASK[:16] + ".zip")
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for item in members:
            archive.write(ROOT / item["path"], item["path"])
        archive.write(ROOT / "member-manifest.json", "member-manifest.json")
    with zipfile.ZipFile(destination) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or len(names) != len(members) + 1:
            raise RuntimeError("The complete native archive member count differs")
        for item in members:
            pin(archive.read(item["path"]), item, "Archived member " + item["path"])
    archive_pin = record(destination)
    event("CANADABUYS_ARCHIVE_COMPLETE", **archive_pin, memberCount=len(members) + 1, outcome=status["outcome"])
    guide = ROOT / "application-source" / PAYLOAD["applicationPrefix"] / "BIDDER_DESK.md"
    runtime_resources("before-artifact-save")
    uploads = save_delivery([destination, guide, ROOT / "execution.json"])
    event("CANADABUYS_DELIVERY_COMPLETE", outcome=status["outcome"], directory=str(ROOT),
          archive=archive_pin, sourceCommit=PAYLOAD["sourceCommit"], uploads=uploads)
    return uploads

def main():
    global ROOT
    status = {"schema": "commons.canadabuys.native-delivery-result.v1", "operationId": OPERATION,
        "runId": TASK, "started": STARTED, "sourceCommit": PAYLOAD["sourceCommit"], "outcome": "FAILED"}
    failure = None
    try:
        packet_raw = pin(PAYLOAD["applicationPacketText"].encode("utf-8"), PAYLOAD["applicationPacketPin"], "Complete CanadaBuys source packet")
        packet = json.loads(packet_raw)
        if packet["operationId"] != OPERATION or len(packet["files"]) != 37 or len(packet["originalV1"]) != 5:
            raise RuntimeError("Complete original application packet selection differs")
        node = selected_runtime("node")
        playwright = selected_runtime("playwright")
        chromium = selected_runtime("chromium")
        ROOT, directory_attempts = select_root()
        event("CANADABUYS_DIRECTORY_READY", directory=str(ROOT), directoryAttempts=directory_attempts)
        status["resourcesAtStart"] = runtime_resources("directory-ready")
        write_once(ROOT / "programme" / "complete_canadabuys_delivery.py", PAYLOAD["program"].encode("utf-8"))
        write_once(ROOT / "programme" / "input.json", encoded(PAYLOAD))
        write_once(ROOT / "source-packet.json", packet_raw)
        source_root = ROOT / "application-source"
        for item in packet["files"]:
            write_once(member(source_root, item["path"]), pin(item["content"].encode("utf-8"), item, item["path"]))
        legacy_root = ROOT / "original-v1"
        for item in packet["originalV1"]:
            write_once(member(legacy_root, item["path"]), pin(item["content"].encode("utf-8"), item, item["path"]))
        for item in PAYLOAD["programmeFiles"]:
            write_once(member(ROOT / "programme", item["path"]), pin(item["content"].encode("utf-8"), item, item["path"]))
        caller = pin(PAYLOAD["libraryCaller"]["content"].encode("utf-8"), PAYLOAD["libraryCaller"], "Original private upload caller")
        write_once(ROOT / "programme" / "library_upload_private_state.py", caller)
        app = member(source_root, PAYLOAD["applicationPrefix"])
        out = ROOT / "working-delivery"
        out.mkdir(mode=0o700)
        for item in PAYLOAD["historyFiles"]:
            write_once(member(ROOT / "history", item["path"]),
                       pin(item["content"].encode("utf-8"), item, "Original history " + item["path"]))
        recovery = PAYLOAD["priorAttemptRecovery"]
        recovery_raw = pin(recovery["content"].encode("utf-8"), recovery, "Actual original receiving attempt")
        recovery_value = json.loads(recovery_raw)
        if recovery_value.get("operationId") != "CANADABUYS-BIDDER-DESK-RECEIVING-6BA15-20261012":
            raise RuntimeError("Prior attempt belongs to another receiving operation")
        write_once(out / "original-attempt-recovery.json", recovery_raw)
        status["priorAttemptRecovery"] = record(out / "original-attempt-recovery.json")
        status["sourceTransition"] = record(ROOT / "history" / "integrated-source-selection.json")
        temp = ROOT / "runtime-tmp"
        temp.mkdir(mode=0o700)
        environment = dict(os.environ)
        environment.update({"TMPDIR": str(temp), "TMP": str(temp), "TEMP": str(temp),
                            "PYTHONDONTWRITEBYTECODE": "1", "CANADABUYS_RECEIVING_OWNER": TASK})
        version = subprocess.run([str(node), "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        status["runtime"] = {"node": str(node), "nodeVersion": version.stdout.decode().strip(),
                             "playwright": record(playwright), "chromium": record(chromium),
                             "python": sys.version, "pythonExecutable": sys.executable}
        values = {"application": str(app), "legacy-application": str(legacy_root), "output": str(out),
                  "playwright": str(playwright), "chromium": str(chromium),
                  "fixture": str(member(ROOT / "programme", PAYLOAD["receiving"]["fixtureFile"]))}
        command = [str(node), "--no-warnings", str(member(ROOT / "programme", PAYLOAD["receiving"]["runnerFile"]))]
        for option in PAYLOAD["receiving"]["argumentNames"]:
            command.extend(["--" + option, values[option]])
        status["command"] = command
        status["sourcePacket"] = record(ROOT / "source-packet.json")
        status["applicationSourceFiles"] = len(packet["files"])
        status["legacySourceFiles"] = len(packet["originalV1"])
        # Full source and inputs are already retained on disk; release their duplicate buffers.
        PAYLOAD["retainedCompleteInput"] = record(ROOT / "programme" / "input.json")
        for key in ("program", "applicationPacketText", "programmeFiles", "historyFiles",
                    "priorAttemptRecovery", "libraryCaller"):
            PAYLOAD.pop(key, None)
        del packet, packet_raw, caller, recovery, recovery_raw, recovery_value, item
        gc.collect()
        status["resourcesBeforeNative"] = runtime_resources("source-buffers-released")
        code = run_node(command, environment)
        status["resourcesAfterNative"] = runtime_resources("native-result")
        status["nativeExitCode"] = code
        result_path = member(out, PAYLOAD["receiving"]["resultFile"])
        if result_path.exists():
            status["receivingResult"] = record(result_path)
            result = json.loads(result_path.read_bytes())
            status["receivingOutcome"] = result
        else:
            result = None
        if code != 0:
            raise RuntimeError("CanadaBuys native receiving exited with code " + str(code))
        if result is None or not result_success(result):
            raise RuntimeError("The final receiving result does not report the selected successful outcome")
        status["outcome"] = "PASS"
    except BaseException as error:
        failure = error
        status["error"] = {"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
        status["resourcesAtFailure"] = runtime_resources("delivery-failure", CHILD.pid if CHILD else None)
        event("CANADABUYS_DELIVERY_FAILURE", **status["error"])
    finally:
        if CHILD is not None and CHILD.poll() is None:
            os.killpg(CHILD.pid, signal.SIGTERM)
            try:
                CHILD.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(CHILD.pid, signal.SIGKILL)
                CHILD.wait()
        globals()["delivery_status"] = status
        status["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        if ROOT is not None:
            try:
                preserve(status)
            except BaseException as error:
                event("CANADABUYS_PRESERVATION_FAILURE", type=type(error).__name__,
                      message=str(error), traceback=traceback.format_exc(), directory=str(ROOT))
                if failure is None:
                    failure = error
    return 0 if failure is None and status["outcome"] == "PASS" else 1

def command_loop(exit_code):
    """Keep the owned delivery alive for image review, a concrete repair or handoff."""
    event("AWAITING_SAME_OPERATION_COMMAND", namespacePid=os.getpid(),
          directory=str(ROOT) if ROOT else None, deliveryExitCode=exit_code)
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            raise SystemExit(exit_code if exit_code else 1)
        header = json.loads(line)
        if header.get("stop"):
            selected = int(header.get("exit_code", exit_code))
            event("ORIGINAL_CONTEXT_RELEASED", exitCode=selected)
            raise SystemExit(selected)
        expected_bytes = int(header["bytes"])
        raw = bytearray()
        while len(raw) < expected_bytes:
            part = sys.stdin.buffer.read(min(65536, expected_bytes - len(raw)))
            if not part:
                raise RuntimeError("Original continuation input ended early")
            raw.extend(part)
        if len(raw) != expected_bytes or digest(raw) != header["sha256"]:
            raise RuntimeError("Original continuation input digest differs")
        action = json.loads(raw)
        try:
            ast.parse(action["program"], filename="<canadabuys-original-continuation>")
            if ROOT is not None:
                write_once(ROOT / "controller-commands" / (header["sha256"] + ".json"), bytes(raw))
            exec(compile(action["program"], "<canadabuys-original-continuation>", "exec"), globals())
            event("ORIGINAL_COMMAND_COMPLETE", commandSha256=header["sha256"])
        except BaseException as error:
            event("ORIGINAL_COMMAND_FAILED", commandSha256=header["sha256"],
                  type=type(error).__name__, message=str(error), traceback=traceback.format_exc())

if __name__ == "__main__":
    code = main()
    if PAYLOAD.get("keepAlive", False):
        command_loop(code)
    raise SystemExit(code)
