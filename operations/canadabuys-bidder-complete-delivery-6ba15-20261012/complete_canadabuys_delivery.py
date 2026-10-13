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

def event(event_name, **values):
    print(json.dumps({"event": event_name, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **values}, ensure_ascii=False), flush=True)

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

    def process_stat(path):
        raw = Path(path).read_text()
        opening, closing = raw.index("("), raw.rfind(")")
        fields = raw[closing + 2:].split()
        if closing <= opening or len(fields) <= 19:
            raise ValueError("Incomplete original process stat")
        return {"hostPid": int(raw[:opening].strip()), "hostParentPid": int(fields[1]),
                "startTicks": int(fields[19]), "state": fields[0]}

    def process_status(path):
        return {line.split(":", 1)[0]: line.split(":", 1)[1].strip()
                for line in Path(path).read_text().splitlines() if ":" in line}

    observer = None
    try:
        observer = process_stat("/proc/self/stat")
        status = process_status("/proc/self/status")
        namespace_ids = [int(part) for part in status.get("NSpid", "").split()]
        value["python"] = {key: status[key] for key in
                           ("Name", "State", "VmPeak", "VmSize", "VmHWM", "VmRSS") if key in status}
        value["python"]["processIdentity"] = {**observer, "namespacePid": os.getpid(),
                                               "namespaceIds": namespace_ids}
    except (OSError, ValueError) as error:
        value["python"] = {"observationStatus": "UNRESOLVED", "error": str(error)}

    if child_pid is not None:
        selected = {"observationStatus": "UNRESOLVED", "namespacePid": child_pid}
        value["node"] = selected
        try:
            if CHILD is None or CHILD.pid != child_pid:
                raise ValueError("The requested child is not this invocation's acquired Popen")
            code = CHILD.poll()
            retained = getattr(CHILD, "_canadabuys_resource_identity", None)
            if code is not None:
                selected.update(observationStatus="ORIGINAL_POPEN_EXITED", returnCode=code,
                                lastVerifiedProcessIdentity=retained)
            else:
                if observer is None or not isinstance(value.get("bootId"), str):
                    raise ValueError("The original parent procfs identity is unavailable")
                own_namespace = os.readlink("/proc/self/ns/pid")
                own_ids = value["python"]["processIdentity"]["namespaceIds"]
                if not own_ids or own_ids[-1] != os.getpid():
                    raise ValueError("The observer namespace PID geometry is unresolved")
                if not isinstance(CHILD.args, (list, tuple)) or not CHILD.args:
                    raise ValueError("The acquired Node argv is not an exact sequence")
                expected_command = b"\0".join(os.fsencode(part) for part in CHILD.args) + b"\0"
                children_path = Path("/proc/self/task") / str(observer["hostPid"]) / "children"
                children = [int(part) for part in children_path.read_text().split()]
                if len(children) > 1024:
                    raise ValueError("The original parent's child inventory exceeded its bound")
                matches = []
                for host_pid in children:
                    child_root = Path("/proc") / str(host_pid)
                    try:
                        before = process_stat(child_root / "stat")
                        if before["hostPid"] != host_pid or before["hostParentPid"] != observer["hostPid"]:
                            continue
                        if os.readlink(child_root / "ns/pid") != own_namespace:
                            continue
                        status = process_status(child_root / "status")
                        ids = [int(part) for part in status.get("NSpid", "").split()]
                        if len(ids) != len(own_ids) or ids[-1] != child_pid:
                            continue
                        if (child_root / "cmdline").read_bytes() != expected_command:
                            continue
                        after = process_stat(child_root / "stat")
                        if any(before[key] != after[key] for key in ("hostPid", "hostParentPid", "startTicks")):
                            continue
                        identity = {"hostPid": host_pid, "namespacePid": child_pid,
                                    "hostParentPid": observer["hostPid"],
                                    "parentStartTicks": observer["startTicks"],
                                    "startTicks": before["startTicks"], "bootId": value["bootId"],
                                    "commandSha256": digest(expected_command), "namespaceIds": ids}
                        if retained is not None and retained != identity:
                            continue
                        matches.append((identity, status))
                    except (FileNotFoundError, ProcessLookupError):
                        continue
                if len(matches) != 1 or CHILD.poll() is not None:
                    raise ValueError("The acquired Node process has no unique live procfs binding")
                identity, status = matches[0]
                CHILD._canadabuys_resource_identity = identity
                selected.update({key: status[key] for key in
                                 ("Name", "State", "VmPeak", "VmSize", "VmHWM", "VmRSS") if key in status})
                selected.update(observationStatus="MATCHED_ORIGINAL_POPEN", processIdentity=identity)
        except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
            selected["error"] = str(error)
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

def configure_library_save():
    """Use the exercised file tool with exact staged bytes and its original reply."""
    bridge = ROOT / "programme" / "official_library_save_bridge.py"
    raw = pin(bridge.read_bytes(), PAYLOAD["libraryBridgePin"], "Supported Library transport")
    shared = Path(PAYLOAD["sharedDirectory"]) / TASK
    shared.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not shared.is_absolute() or shared.is_symlink():
        raise RuntimeError("The owned artifact staging directory differs")

    def require(value, message):
        if not value:
            raise RuntimeError(message)

    def same(expected, path):
        found = record(Path(path))
        require(found["bytes"] == expected["bytes"] and found["sha256"] == expected["sha256"],
                "The retained artifact bytes differ: " + str(path))

    def copy_exact(source, destination, expected):
        source, destination = Path(source), Path(destination)
        require(destination.parent == shared / "official-save-source",
                "The selected artifact stage differs")
        same(expected, source)
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        require(not destination.parent.is_symlink(), "The artifact stage is a link")
        if not destination.exists():
            fd, temporary = tempfile.mkstemp(prefix=".canadabuys-save-", dir=str(destination.parent))
            try:
                with source.open("rb") as original, os.fdopen(fd, "wb") as output:
                    shutil.copyfileobj(original, output, 262144)
                    output.flush()
                    os.fsync(output.fileno())
                same(expected, Path(temporary))
                try:
                    os.link(temporary, destination)
                except FileExistsError:
                    same(expected, destination)
            finally:
                try:
                    os.unlink(temporary)
                except FileNotFoundError:
                    pass
        same(expected, source)
        same(expected, destination)

    def historical_finish(path, kept, reused):
        raise RuntimeError("A saved artifact selected a different retained transport")

    namespace = {"__name__": "canadabuys_official_library_transport"}
    exec(compile(raw, str(bridge), "exec"), namespace)
    adapter = {"ROOT": ROOT, "SHARED": shared, "OP": OPERATION,
               "finish_saved_artifact": historical_finish, "record": record, "require": require,
               "readjson": lambda path: json.loads(Path(path).read_bytes()),
               "encoded": encoded, "sha": digest, "publish": write_once,
               "pubjson": lambda path, value: write_once(Path(path), encoded(value)),
               "same": same, "copy_exact": copy_exact,
               "now": lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "emit": event}
    namespace["install_original_library_tool_bridge"](adapter)
    event("CANADABUYS_SUPPORTED_LIBRARY_SELECTED", source=record(bridge), stagingRoot=str(shared),
          tool="library_create_library_file")
    return adapter["save_artifact"]

def save_delivery(paths):
    save = configure_library_save()
    receipts = [save(Path(path)) for path in paths]
    value = {"schema": "commons.canadabuys.finalized-delivery-saves.v1",
             "operationId": OPERATION, "results": [item["result"] for item in receipts],
             "receipts": receipts}
    write_once(ROOT / "library-save-result.json", encoded(value))
    event("CANADABUYS_LIBRARY_SAVED", results=value["results"])
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
