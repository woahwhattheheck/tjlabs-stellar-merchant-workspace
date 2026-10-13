#!/usr/bin/env python3
"""Run the original retained Quality follow-up course on an equipped Linux host."""
import argparse
import base64
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import signal
import shlex
import time
import subprocess
import sys
import traceback
import uuid
import zipfile
import zlib

OPERATION = "OPENLINEAGE-QUALITY-FOLLOWUP-9EEA-20261013"
SOURCE_COMMIT = "c84f1f1641bf370da3a7bac248c53218774aeac2"
SOURCE_BYTES = 1334527
SOURCE_SHA = "7151fe91b827c5c3410814cf8bb8ce89a3b08f567ac836cd579d4f9d97053600"

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def identity(path):
    path = Path(path)
    return {"bytes": path.stat().st_size, "sha256": digest(path)}

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def publish(path, data, immutable=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError("Refuse a linked output: " + str(path))
    if immutable and path.exists():
        if path.read_bytes() != data:
            raise ValueError("Retain the original file: " + str(path))
        return
    temporary = path.with_name(path.name + ".pending-" + uuid.uuid4().hex)
    try:
        with temporary.open("xb") as stream:
            os.chmod(temporary, 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if immutable:
            try:
                os.link(temporary, path)
            except FileExistsError:
                if path.read_bytes() != data:
                    raise ValueError("Original retained output differs: " + str(path))
        else:
            os.replace(temporary, path)
        parent = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if temporary.exists():
            temporary.unlink()

def save(path, value, immutable=False):
    publish(path, encoded(value), immutable)

def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def load_source(path):
    raw = Path(path).read_bytes()
    if len(raw) > 4000000:
        raise ValueError("Selected source carrier exceeds its complete source capacity")
    packet = json.loads(raw)
    if packet.get("encoding") == "gzip-base64":
        if packet.get("bytes") != SOURCE_BYTES or packet.get("sha256") != SOURCE_SHA:
            raise ValueError("The selected complete source identity differs")
        compressed = base64.b64decode(packet["contentBase64"], validate=True)
        decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
        raw = decoder.decompress(compressed, SOURCE_BYTES + 1)
        if len(raw) != SOURCE_BYTES or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
            raise ValueError("Incomplete or oversized complete source")
        packet = json.loads(raw)
    if len(raw) != SOURCE_BYTES or hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
        raise ValueError("Use the exact complete reviewed 94-file source")
    if packet.get("operation") != OPERATION or packet.get("commit") != SOURCE_COMMIT:
        raise ValueError("The source operation/commit differs")
    files = packet.get("files")
    if not isinstance(files, list) or len(files) != 94:
        raise ValueError("The complete application must contain all 94 original files")
    names = set()
    for item in files:
        name = item.get("path")
        if not isinstance(name, str) or PurePosixPath(name).is_absolute() or len(PurePosixPath(name).parts) != 1 or name in names:
            raise ValueError("Unsafe or duplicate application member")
        names.add(name)
        body = item["content"].encode("utf-8")
        if len(body) != item["bytes"] or hashlib.sha256(body).hexdigest() != item["sha256"]:
            raise ValueError("Complete source member differs: " + name)
    return raw, packet

def actual_runtime(path):
    value = read(path)
    if not isinstance(value, dict):
        raise ValueError("Runtime selection must be an object")
    result = {}
    for key in ("node", "playwrightModule", "executablePath"):
        text = value.get(key)
        if not isinstance(text, str) or not Path(text).is_absolute():
            raise ValueError("Configure an actual absolute runtime path: " + key)
        selected = Path(text)
        if not selected.is_file():
            raise ValueError("Selected runtime file is absent: " + str(selected))
        if key != "playwrightModule" and not os.access(selected, os.X_OK):
            raise ValueError("Selected runtime is not executable: " + str(selected))
        result[key] = str(selected.resolve())
    args = value.get("args", [])
    if not isinstance(args, list) or any(not isinstance(arg, str) or "\0" in arg for arg in args):
        raise ValueError("Browser arguments must be literal strings")
    result["args"] = args
    result["nodeVersion"] = subprocess.check_output([result["node"], "--version"], text=True, timeout=30).strip()
    result["browserVersion"] = subprocess.check_output([result["executablePath"], "--version"], text=True, timeout=30).strip()
    probe = 'import {pathToFileURL} from "node:url";const p=await import(pathToFileURL(process.argv[1]).href);if(!p.chromium?.launchPersistentContext)throw Error("Selected module is not Playwright chromium");console.log("Playwright chromium available")'
    result["playwrightRead"] = subprocess.check_output(
        [result["node"], "--input-type=module", "-e", probe, result["playwrightModule"]],
        text=True, timeout=30).strip()
    result["python"] = sys.executable
    result["pythonVersion"] = sys.version.split()[0]
    return result


def need(value, message):
    if not value:
        raise RuntimeError(message)

def proc_fields(pid):
    try:
        raw = Path("/proc", str(pid), "stat").read_text()
    except FileNotFoundError:
        return None
    return raw[raw.rfind(")") + 2:].split()

def owned_members(receipt):
    need(receipt.get("bootId") == Path("/proc/sys/kernel/random/boot_id").read_text().strip()
         and receipt.get("pidNamespace") == os.readlink("/proc/self/ns/pid"),
         "Reconcile the original recorded process host before signalling.")
    pid = receipt.get("procPid")
    need(type(pid) is int and pid > 1 and receipt.get("procPgid") == pid
         and receipt.get("procSession") == pid
         and type(receipt.get("namespacePgid")) is int and receipt["namespacePgid"] > 1
         and str(receipt.get("startTicks", "")).isdigit(),
         "Retain the actual private process group and original start ticks.")
    leader = proc_fields(pid)
    if leader is not None:
        need(leader[19] == receipt["startTicks"], "The original process PID was reused.")
    members = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        row = proc_fields(entry.name)
        if row is None or int(row[2]) != pid or row[0] == "Z":
            continue
        try:
            namespace = os.readlink(entry / "ns/pid")
        except (FileNotFoundError, ProcessLookupError):
            continue
        need(namespace == receipt["pidNamespace"] and int(row[3]) == pid
             and int(row[19]) >= int(receipt["startTicks"]),
             "The original process group contains an unbound member.")
        again = proc_fields(entry.name)
        if again is None or again[19] != row[19] or int(again[2]) != pid or again[0] == "Z":
            continue
        members.append({"procPid": int(entry.name), "startTicks": row[19]})
    return members

def close_receipt(receipt):
    first = owned_members(receipt)
    for selected_signal in (signal.SIGTERM, signal.SIGKILL):
        if not owned_members(receipt):
            break
        try:
            os.killpg(receipt["namespacePgid"], selected_signal)
        except ProcessLookupError:
            pass
        end = time.monotonic() + 10
        while time.monotonic() < end and owned_members(receipt):
            time.sleep(.05)
    need(not owned_members(receipt), "The original recorded process group is still active.")
    return {"groupAbsent": True, "initialMembers": first, "at": stamp()}

def process_launcher():
    # This exact file is also the child executable. No engine or request is replaced.
    configuration = Path(sys.argv[2]).resolve()
    selected = read(configuration)
    need(selected.get("schema") == "commons.openlineage.local-process-launch.v1"
         and selected.get("operation") == OPERATION and selected.get("sourceSha256") == SOURCE_SHA,
         "Use the original source-bound launch configuration.")
    gate_path = Path(selected["gate"])
    with gate_path.with_suffix(".lock").open("a+b") as gate_lock:
        fcntl.flock(gate_lock, fcntl.LOCK_SH)
        gate = read(gate_path)
        if gate.get("status") != "OPEN" or gate.get("invocation") != selected["invocation"]:
            raise RuntimeError("This original phase has already closed dispatch.")
        raw = Path("/proc/self/stat").read_text()
        visible = int(raw[:raw.index(" ")])
        fields = raw[raw.rfind(")") + 2:].split()
        need(int(fields[2]) == visible and int(fields[3]) == visible
             and os.getpgrp() == os.getpid(), "The actual child must own its private group/session.")
        receipt = {
            "schema": "commons.openlineage.local-process-receipt.v1",
            "operation": OPERATION, "sourceSha256": SOURCE_SHA,
            "invocation": selected["invocation"], "phase": selected["phase"],
            "kind": selected["kind"], "configuration": identity(configuration),
            "procPid": visible, "procPgid": int(fields[2]), "procSession": int(fields[3]),
            "namespacePid": os.getpid(), "namespacePgid": os.getpgrp(),
            "startTicks": fields[19], "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
            "pidNamespace": os.readlink("/proc/self/ns/pid"), "at": stamp()}
        name = selected["kind"] + "-" + str(visible) + "-" + fields[19] + ".process.json"
        save(Path(selected["receipts"]) / name, receipt, immutable=True)
        # The gate covers receipt publication. Closing it prevents any later wrapper
        # from entering the engine; already recorded private groups are reconciled.
    command = selected["command"] + sys.argv[3:]
    os.execv(command[0], command)

def close_phase_directory(directory, process=None):
    directory = Path(directory)
    gate_path = directory / "dispatch.json"
    gate = read(gate_path)
    with gate_path.with_suffix(".lock").open("a+b") as gate_lock:
        fcntl.flock(gate_lock, fcntl.LOCK_EX)
        gate["status"] = "CLOSED"
        save(gate_path, gate)
    errors = []
    # Close Node before the browser census, so it cannot ask Playwright to launch
    # again while the actual recorded Chromium groups are being reconciled.
    rows = sorted(directory.glob("*.process.json"),
                  key=lambda path: (not path.name.startswith("node-"), path.name))
    for path in rows:
        try:
            receipt = read(path)
            need(receipt.get("operation") == OPERATION and receipt.get("sourceSha256") == SOURCE_SHA
                 and receipt.get("invocation") == gate["invocation"]
                 and receipt.get("phase") == gate["phase"],
                 "Retain the exact original phase process receipt.")
            config = directory / (receipt["kind"] + "-launch.json")
            need(receipt.get("configuration") == identity(config),
                 "Retain the exact original process command selection.")
            pin = identity(path)
            closed_path = path.with_suffix(".closed.json")
            if closed_path.exists():
                saved = read(closed_path)
                need(saved.get("receipt") == pin and saved.get("groupAbsent") is True,
                     "Retain the original exact process closure.")
            else:
                saved = close_receipt(receipt)
                saved.update(receipt=pin, operation=OPERATION, sourceSha256=SOURCE_SHA)
                save(closed_path, saved, immutable=True)
        except BaseException as error:
            errors.append({"path": str(path), "error": str(error), "type": type(error).__name__})
    if process is not None:
        try:
            process.wait(timeout=20)
        except BaseException as error:
            errors.append({"resource": "original-node", "error": str(error)})
    need(not errors, "Original phase closure is incomplete: " + json.dumps(errors))
    # A wrapper without a receipt never entered its selected executable. All late
    # wrappers see CLOSED under this same gate; recorded engines are proved absent.
    closure = {"operation": OPERATION, "sourceSha256": SOURCE_SHA,
               "invocation": gate["invocation"], "phase": gate["phase"],
               "dispatchClosed": True, "groupsAbsent": True,
               "receipts": [{"path": p.name, **identity(p)} for p in rows]}
    save(directory / "PHASE_CLOSED.json", closure, immutable=True)
    return closure

def require_linux_process_runtime():
    if not sys.platform.startswith("linux"):
        raise RuntimeError("This receiver requires Linux /proc process-group custody.")
    if sys.version_info < (3, 11):
        raise RuntimeError("Use Python 3.11 or later for this original receiver.")
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    if str(uuid.UUID(boot)) != boot:
        raise RuntimeError("Read the actual Linux boot identity before receiving.")
    namespace = os.readlink("/proc/self/ns/pid")
    raw = Path("/proc/self/stat").read_text()
    visible = int(raw[:raw.index(" ")])
    fields = raw[raw.rfind(")") + 2:].split()
    if (not namespace.startswith("pid:[") or not namespace.endswith("]")
            or visible <= 0 or len(fields) < 20 or not fields[19].isdigit()):
        raise RuntimeError("Read the actual Linux PID namespace and process start ticks.")
    current = proc_fields(visible)
    if current is None or current[19] != fields[19]:
        raise RuntimeError("The declared /proc mount does not expose this receiving process.")
    with os.scandir("/proc") as entries:
        if not any(entry.name == str(visible) for entry in entries):
            raise RuntimeError("Read the actual process table before receiving.")
    return {"bootId": boot, "pidNamespace": namespace, "procPid": visible,
            "namespacePid": os.getpid(), "startTicks": fields[19]}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="The complete selected-source.json carrier or its exact expanded packet")
    parser.add_argument("--runtime", required=True, help="Actual Node/Playwright/Chromium runtime JSON")
    parser.add_argument("--root", required=True, help="One persistent private directory for this original course")
    opts = parser.parse_args()
    process_runtime = require_linux_process_runtime()
    raw, packet = load_source(opts.source)
    runtime = actual_runtime(opts.runtime)
    runtime["processHost"] = process_runtime
    root = Path(opts.root).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    outer = root / "original-course.lock"
    if outer.is_symlink():
        raise ValueError("Original receiving lock cannot be a symlink")
    with outer.open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        binding = {"schema": "commons.openlineage.quality-followup.local-receiver.v1",
                   "operation": OPERATION, "root": str(root), "sourceCommit": SOURCE_COMMIT,
                   "sourceBytes": SOURCE_BYTES, "sourceSha256": SOURCE_SHA}
        binding_path = root / "RECEIVER_IDENTITY.json"
        if not binding_path.exists():
            unexpected = [path.name for path in root.iterdir() if path != outer]
            if unexpected:
                raise ValueError("Use the original initialized course directory or an empty directory: " + repr(unexpected))
        save(binding_path, binding, immutable=True)
        application = root / "application"
        course = root / "receiving"
        deliveries = root / "deliveries"
        reports = root / "receiver-reports"
        for path in (application, course, deliveries, reports):
            path.mkdir(exist_ok=True, mode=0o700)
        publish(root / "selected-source.json", raw, immutable=True)
        for item in packet["files"]:
            publish(application / item["path"], item["content"].encode("utf-8"), immutable=True)
        save(root / "source-manifest.json", [{k: item[k] for k in ("path", "bytes", "sha256")} for item in packet["files"]], immutable=True)
        del raw, packet
        receiver_source = root / "original-local-receiver.py"
        publish(receiver_source, Path(__file__).read_bytes(), immutable=True)
        quiescent = False
        invocation = uuid.uuid4().hex
        save(reports / ("runtime-" + invocation + ".json"), runtime, immutable=True)
        save(root / "actual-runtime.json", runtime)

        def event(kind, **fields):
            value = {"at": stamp(), "event": kind, "invocation": invocation, **fields}
            with (reports / "progress.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(value, ensure_ascii=False) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
            print("QUALITY_RECEIVER " + json.dumps(value, ensure_ascii=False), flush=True)

        def checkpoint(label, result=None):
            if not quiescent:
                raise RuntimeError("Retain the original live phase before creating its complete checkpoint.")
            stable_key = hashlib.sha256(encoded({"label": label, "result": result})).hexdigest()
            selected_path = reports / ("checkpoint-" + stable_key + ".json")

            def inspect_archive(archive):
                with zipfile.ZipFile(archive) as saved:
                    names = saved.namelist()
                    if len(names) != len(set(names)):
                        raise ValueError("Keep unique complete case archive members.")
                    manifest = json.loads(saved.read("COMPLETE_CASE_MANIFEST.json"))
                    if (manifest.get("schema") != "commons.openlineage.quality-followup.complete-case.v1"
                            or manifest.get("operation") != OPERATION
                            or manifest.get("sourceSha256") != SOURCE_SHA
                            or manifest.get("label") != label or manifest.get("result") != result):
                        raise ValueError("The prepared complete archive belongs to another selection.")
                    inventory = manifest["files"]
                    expected = {"COMPLETE_CASE_MANIFEST.json"}
                    for entry in inventory:
                        name = entry["path"]
                        path = PurePosixPath(name)
                        if path.is_absolute() or str(path) != name or any(part in ("", ".", "..") for part in name.split("/")) or name in expected:
                            raise ValueError("Keep original safe unique case members.")
                        expected.add(name)
                        size = 0
                        value = hashlib.sha256()
                        with saved.open(name) as member:
                            while True:
                                chunk = member.read(1024 * 1024)
                                if not chunk:
                                    break
                                size += len(chunk)
                                value.update(chunk)
                        if size != entry["bytes"] or value.hexdigest() != entry["sha256"]:
                            raise ValueError("Complete case archive member differs: " + name)
                    if set(names) != expected:
                        raise ValueError("Retain every declared complete case member.")
                return manifest

            def finish(archive):
                inspect_archive(archive)
                handoff = {"schema": "commons.openlineage.quality-followup.local-output.v1",
                           "operation": OPERATION, "status": "READY_FOR_TRANSFER",
                           "path": str(archive), **identity(archive), "stage": label, "result": result}
                save(archive.with_suffix(".json"), handoff, immutable=True)
                return handoff

            if selected_path.exists():
                selected = read(selected_path)
                if selected.get("operation") != OPERATION or selected.get("sourceSha256") != SOURCE_SHA or selected.get("key") != stable_key:
                    raise ValueError("Retain the original checkpoint selection.")
                archive = Path(selected["path"])
                if archive.parent != deliveries or not archive.name.startswith("OpenLineage_Quality_Followup_"):
                    raise ValueError("Keep the original selected delivery path.")
                if archive.exists():
                    return finish(archive)
                pending = archive.with_suffix(".zip.pending")
                if pending.exists():
                    try:
                        inspect_archive(pending)
                    except (ValueError, KeyError, zipfile.BadZipFile, EOFError):
                        # Preserve a partial producer output; no completed archive is replaced.
                        os.replace(pending, pending.with_name(pending.name + ".interrupted-" + uuid.uuid4().hex))
                    else:
                        os.replace(pending, archive)
                        return finish(archive)
            else:
                # An older caller may have finished ZIP closure before its JSON handoff.
                # Adopt that exact complete archive after full manifest/byte verification.
                for previous in sorted(deliveries.glob("OpenLineage_Quality_Followup_" + label + "-*.zip")):
                    try:
                        inspect_archive(previous)
                    except (ValueError, KeyError, zipfile.BadZipFile, EOFError):
                        continue
                    selected = {"operation": OPERATION, "sourceSha256": SOURCE_SHA,
                                "key": stable_key, "path": str(previous)}
                    save(selected_path, selected, immutable=True)
                    return finish(previous)
                archive = deliveries / ("OpenLineage_Quality_Followup_" + label + "-" + uuid.uuid4().hex + ".zip")
                selected = {"operation": OPERATION, "sourceSha256": SOURCE_SHA,
                            "key": stable_key, "path": str(archive)}
                save(selected_path, selected, immutable=True)
            pending = archive.with_suffix(".zip.pending")
            inventory = []
            with zipfile.ZipFile(pending, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as output:
                os.chmod(pending, 0o600)
                for path in sorted(root.rglob("*")):
                    relative = path.relative_to(root)
                    if relative.parts[0] == "deliveries" or path == outer:
                        continue
                    if path.is_symlink() or not path.is_file():
                        continue
                    descriptor = {"path": relative.as_posix(), **identity(path)}
                    output.write(path, relative.as_posix())
                    inventory.append(descriptor)
                manifest = {"schema": "commons.openlineage.quality-followup.complete-case.v1",
                            "operation": OPERATION, "sourceSha256": SOURCE_SHA, "createdAt": stamp(),
                            "label": label, "result": result, "files": inventory}
                output.writestr("COMPLETE_CASE_MANIFEST.json", encoded(manifest))
            inspect_archive(pending)
            with pending.open("rb") as stream:
                os.fsync(stream.fileno())
            os.replace(pending, archive)
            directory_fd = os.open(deliveries, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
            handoff = finish(archive)
            event("complete_case_retained", handoff=handoff)
            return handoff

        def retire_owned_lock(pid, phase, closure):
            path = course / "receiving.lock"
            if not path.exists():
                return
            saved = read(path)
            if saved.get("pid") != pid:
                raise RuntimeError("Another original receiving lock is present; preserve and reconcile it")
            closure_file = reports / ("process-closed-" + phase + "-" + invocation + ".json")
            save(closure_file, closure, immutable=True)
            target = reports / ("retired-original-lock-" + phase + "-" + invocation + ".json")
            publish(target, path.read_bytes(), immutable=True)
            path.unlink()

        def run_phase(phase, filename, extra=()):
            nonlocal quiescent
            command = [runtime["node"], "--max-old-space-size=512", str(application / filename), str(course), *map(str, extra)]
            log = reports / (phase + "-" + invocation + ".log")
            directory = reports / ("phase-" + phase + "-" + invocation)
            directory.mkdir(mode=0o700)
            gate = directory / "dispatch.json"
            save(gate, {"operation": OPERATION, "invocation": invocation, "phase": phase, "status": "OPEN"})
            common = {"schema": "commons.openlineage.local-process-launch.v1",
                      "operation": OPERATION, "sourceSha256": SOURCE_SHA,
                      "invocation": invocation, "phase": phase, "gate": str(gate),
                      "receipts": str(directory)}
            if phase == "browser":
                browser_selection = {**common, "kind": "browser", "command": [runtime["executablePath"]]}
                browser_config = directory / "browser-launch.json"
                save(browser_config, browser_selection, immutable=True)
                shell = directory / "browser-executable"
                wrapper = "#!/bin/sh\nexec " + shlex.quote(sys.executable) + " " + shlex.quote(str(receiver_source)) + " --owned-process " + shlex.quote(str(browser_config)) + ' "$@"\n'
                publish(shell, wrapper.encode(), immutable=True)
                os.chmod(shell, 0o700)
                phase_runtime = {**runtime, "executablePath": str(shell),
                                 "originalExecutablePath": runtime["executablePath"]}
                runtime_path = directory / "runtime.json"
                save(runtime_path, phase_runtime, immutable=True)
                command[-1] = str(runtime_path)
            node_config = directory / "node-launch.json"
            save(node_config, {**common, "kind": "node", "command": command}, immutable=True)
            event("phase_start", phase=phase, command=command)
            process = None
            primary = None
            quiescent = False
            try:
                with log.open("xb", buffering=0) as stream:
                    process = subprocess.Popen([sys.executable, str(receiver_source), "--owned-process", str(node_config)],
                                               cwd=application, stdout=stream, stderr=subprocess.STDOUT,
                                               start_new_session=True)
                    save(directory / "PARENT_DISPATCH.json",
                         {"pid": process.pid, "phase": phase, "command": command, "at": stamp()}, immutable=True)
                    code = process.wait()
            except BaseException as error:
                primary = error
            cleanup_error = None
            # Signals must not interrupt the one exact owned-group closure half way.
            handlers = {number: signal.signal(number, signal.SIG_IGN) for number in (signal.SIGINT, signal.SIGTERM)}
            try:
                closure = close_phase_directory(directory, process)
                quiescent = True
                if process is not None and (primary is not None or process.returncode):
                    retire_owned_lock(process.pid, phase,
                                      {"pid": process.pid, "exitCode": process.returncode, "groupAbsent": True,
                                       "at": stamp(), "reason": "Original phase stopped",
                                       "phaseClosure": identity(directory / "PHASE_CLOSED.json")})
            except BaseException as error:
                cleanup_error = error
            finally:
                for number, handler in handlers.items():
                    signal.signal(number, handler)
            if cleanup_error is not None:
                save(directory / "CLOSURE_INTERRUPTION.json",
                     {"operation": OPERATION, "error": str(cleanup_error), "at": stamp(),
                      "primaryError": str(primary) if primary is not None else None})
                if primary is not None:
                    raise RuntimeError("Original phase failed: " + str(primary) + "; owned cleanup: " + str(cleanup_error)) from primary
                raise cleanup_error
            if primary is not None:
                raise primary
            event("phase_exit", phase=phase, exitCode=code, log=str(log))
            if code:
                raise RuntimeError("Original " + phase + " programme failed; read its retained log " + str(log))

        def recover_original_writer():
            lock_path = course / "workspace" / "writer.lock"
            if lock_path.exists():
                raw_lock = lock_path.read_bytes()
            else:
                pending = [path for path in reports.glob("writer-recovery-*/ORIGINAL_RECOVERY.json")
                           if not (path.parent / "RESULT.json").exists()]
                if not pending:
                    return
                need(len(pending) == 1, "Reconcile the unique original unfinished writer recovery.")
                previous = read(pending[0])
                need(previous.get("operation") == OPERATION and previous.get("sourceSha256") == SOURCE_SHA
                     and previous.get("workspace") == str(course / "workspace"),
                     "Keep the exact original unfinished writer recovery.")
                original_path = pending[0].parent / "ORIGINAL_WRITER_LOCK.json"
                need(previous.get("originalLock") == {"path": str(original_path), **identity(original_path)},
                     "Keep the original writer-lock bytes after an interrupted recovery result.")
                raw_lock = original_path.read_bytes()
            need(quiescent, "Prove the original phases closed before writer-lock recovery.")
            saved_lock = json.loads(raw_lock)
            need(isinstance(saved_lock.get("id"), str) and saved_lock["id"]
                 and type(saved_lock.get("pid")) is int and saved_lock["pid"] > 1,
                 "Retain the complete original store writer-lock identity.")
            created = datetime.datetime.fromisoformat(saved_lock["createdAt"].replace("Z", "+00:00"))
            need(created.tzinfo is not None, "Retain the original writer-lock creation timestamp.")
            matches = []
            for directory in sorted(reports.glob("phase-*")):
                parent_path = directory / "PARENT_DISPATCH.json"
                phase_closed = directory / "PHASE_CLOSED.json"
                if not parent_path.exists() or not phase_closed.exists():
                    continue
                parent = read(parent_path)
                if parent.get("phase") not in ("native", "browser") or parent.get("pid") != saved_lock["pid"]:
                    continue
                closure = read(phase_closed)
                need(closure.get("groupsAbsent") is True and closure.get("dispatchClosed") is True,
                     "Keep the proved original writer phase closure.")
                for receipt_path in directory.glob("node-*.process.json"):
                    receipt = read(receipt_path)
                    if receipt.get("namespacePid") != saved_lock["pid"]:
                        continue
                    closed_path = receipt_path.with_suffix(".closed.json")
                    closed = read(closed_path)
                    started = datetime.datetime.fromisoformat(receipt["at"].replace("Z", "+00:00"))
                    stopped = datetime.datetime.fromisoformat(closed["at"].replace("Z", "+00:00"))
                    if not started <= created <= stopped:
                        continue
                    pin = {"path": receipt_path.name, **identity(receipt_path)}
                    need(pin in closure["receipts"] and closed.get("receipt") == identity(receipt_path)
                         and closed.get("groupAbsent") is True,
                         "The original writer lock requires its exact closed Node receipt.")
                    matches.append({"phase": parent["phase"], "pid": parent["pid"],
                                    "parentDispatch": {"path": str(parent_path), **identity(parent_path)},
                                    "processReceipt": {"path": str(receipt_path), **identity(receipt_path)},
                                    "processClosure": {"path": str(closed_path), **identity(closed_path)},
                                    "phaseClosure": {"path": str(phase_closed), **identity(phase_closed)}})
            need(len(matches) == 1, "Select the unique proved original writer process before its maintained recovery.")
            lock_sha = hashlib.sha256(raw_lock).hexdigest()
            recovery = reports / ("writer-recovery-" + lock_sha)
            recovery.mkdir(exist_ok=True, mode=0o700)
            original = recovery / "ORIGINAL_WRITER_LOCK.json"
            publish(original, raw_lock, immutable=True)
            selection = {"schema": "commons.openlineage.original-writer-recovery.v1",
                         "operation": OPERATION, "sourceSha256": SOURCE_SHA,
                         "workspace": str(course / "workspace"), "store": str(application / "store.mjs"),
                         "originalLock": {"path": str(original), **identity(original)},
                         "lockId": saved_lock["id"], "lockPid": saved_lock["pid"],
                         "closedOriginalProcess": matches[0], "result": str(recovery / "RESULT.json")}
            intent = recovery / "ORIGINAL_RECOVERY.json"
            save(intent, selection, immutable=True)
            script = recovery / "recover-original-writer.mjs"
            source = r'''import assert from "node:assert/strict";
import {promises as fs} from "node:fs";
import {createHash,randomUUID} from "node:crypto";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
const intent=JSON.parse(await fs.readFile(process.argv[3],"utf8"));
const root=resolve(process.argv[2]);
assert.equal(intent.schema,"commons.openlineage.original-writer-recovery.v1");
assert.equal(intent.operation,"OPENLINEAGE-QUALITY-FOLLOWUP-9EEA-20261013");
assert.equal(intent.workspace,join(root,"workspace"));
const original=await fs.readFile(intent.originalLock.path);
assert.equal(original.length,intent.originalLock.bytes);
assert.equal(createHash("sha256").update(original).digest("hex"),intent.originalLock.sha256);
const selected=JSON.parse(original.toString("utf8"));
assert.equal(selected.id,intent.lockId);assert.equal(selected.pid,intent.lockPid);
const path=join(intent.workspace,"writer.lock");
const readLock=()=>fs.readFile(path).catch(error=>{if(error.code==="ENOENT")return null;throw error;});
const prior=await fs.readFile(intent.result,"utf8").then(JSON.parse,error=>{if(error.code==="ENOENT")return null;throw error;});
if(prior){
 assert.equal(prior.operation,intent.operation);assert.equal(prior.lockId,intent.lockId);
 assert.equal(prior.originalLockSha256,intent.originalLock.sha256);
 assert.equal(await readLock(),null,"An original writer lock remains after its retained recovery result");
 console.log(JSON.stringify(prior));
}else{
 const current=await readLock();let recovery;
 if(current){
  assert.ok(current.equals(original),"The original writer lock changed before recovery");
  const {LineageWorkspace}=await import(pathToFileURL(intent.store).href);
  recovery=await new LineageWorkspace(intent.workspace).recoverLock(intent.lockId);
  assert.equal(recovery.recovered,intent.lockId);
 }else recovery={status:"ORIGINAL_LOCK_ALREADY_ABSENT_AFTER_RECORDED_RECOVERY"};
 assert.equal(await readLock(),null,"The original writer recovery must leave that lock absent");
 const result={operation:intent.operation,sourceSha256:intent.sourceSha256,
  lockId:intent.lockId,originalLockSha256:intent.originalLock.sha256,recovery};
 const bytes=Buffer.from(JSON.stringify(result,null,2)+"\n"),temporary=intent.result+".pending-"+randomUUID();
 const handle=await fs.open(temporary,"wx",0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 try{await fs.link(temporary,intent.result);}catch(error){if(error.code!=="EEXIST")throw error;assert.ok((await fs.readFile(intent.result)).equals(bytes));}
 finally{await fs.unlink(temporary);}
 console.log(JSON.stringify(result));
}
'''
            publish(script, source.encode("utf-8"), immutable=True)
            # The exact original store API performs the dead-PID check and lock-ID
            # compare. This wrapper never unlinks a writer lock directly.
            run_phase("writer-recovery", str(script), [intent])
            result = read(recovery / "RESULT.json")
            need(result.get("operation") == OPERATION and result.get("lockId") == saved_lock["id"]
                 and result.get("originalLockSha256") == lock_sha and not lock_path.exists(),
                 "Receive the exact original writer-lock recovery result.")
            event("original_writer_reconciled", result=result, originalLock=str(original))

        def interrupted(signum, frame):
            raise InterruptedError("Receiver signal " + str(signum))

        old_signals = {name: signal.signal(name, interrupted) for name in (signal.SIGINT, signal.SIGTERM)}
        phase = "native"
        try:
            # Reconcile only this original wrapper's retained phase configurations.
            # A closed receipt remains portable; unresolved groups require their
            # actual original host/namespace/start ticks before any new phase.
            for directory in sorted(reports.glob("phase-*")):
                if not directory.is_dir() or not (directory / "dispatch.json").exists():
                    continue
                closure = close_phase_directory(directory)
                parent_dispatch = directory / "PARENT_DISPATCH.json"
                retained_lock = course / "receiving.lock"
                if parent_dispatch.exists() and retained_lock.exists():
                    parent = read(parent_dispatch)
                    if read(retained_lock).get("pid") == parent["pid"]:
                        retire_owned_lock(parent["pid"], parent["phase"], closure)
            if (course / "receiving.lock").exists():
                raise RuntimeError("Reconcile the original receiving lock before restarting its course.")
            quiescent = True
            phase = "writer_recovery"
            recover_original_writer()
            phase = "native"
            event("admitted", pid=os.getpid(), root=str(root), runtime=runtime)
            run_phase("native", "QUALITY_FOLLOWUP_RECEIVING.mjs")
            native = read(course / "NATIVE_RESULT.json")
            if native.get("nativeStatus") != "COMPLETE":
                raise ValueError("Original native course has not completed")
            native_checkpoint = reports / "native-checkpoint.json"
            if native_checkpoint.exists():
                retained = read(native_checkpoint)
                path = Path(retained["path"])
                if not path.is_file() or identity(path) != {k: retained[k] for k in ("bytes", "sha256")}:
                    raise ValueError("Retain the original complete native checkpoint")
            else:
                save(native_checkpoint, checkpoint("Native", native), immutable=True)
            phase = "browser"
            run_phase("browser", "QUALITY_FOLLOWUP_BROWSER.mjs", [root / "actual-runtime.json"])
            browser = read(course / "browser" / "BROWSER_RESULT.json")
            if browser.get("status") != "COMPLETE" or browser.get("workspaceId") != native["workspaceId"]:
                raise ValueError("Original browser completion does not match the native case")
            phase = "complete_delivery"
            existing = reports / "LOCAL_RECEIVING_HANDOFF.json"
            if existing.exists():
                handoff = read(existing)
                if handoff.get("sourceSha256") != SOURCE_SHA or handoff.get("workspaceId") != native["workspaceId"]:
                    raise ValueError("Retain the original complete receiving handoff")
                descriptor = handoff["archive"]
                if identity(descriptor["path"]) != {k: descriptor[k] for k in ("bytes", "sha256")}:
                    raise ValueError("Retain the original complete receiving archive")
                event("retained_complete_handoff", handoff=handoff)
                return 0
            result = {"workspaceId": native["workspaceId"], "nativeRevision": native["revision"],
                      "browserRevision": browser["revision"], "native": identity(course / "NATIVE_RESULT.json"),
                      "browser": identity(course / "browser" / "BROWSER_RESULT.json"),
                      "captures": browser.get("captures", []), "downloads": browser.get("downloads", [])}
            archive = checkpoint("Complete", result)
            handoff = {"operation": OPERATION, "sourceSha256": SOURCE_SHA, "workspaceId": native["workspaceId"],
                       "status": "READY_FOR_TRANSFER", "archive": archive, "result": result}
            save(existing, handoff, immutable=True)
            event("ready_for_transfer", handoff=handoff)
            return 0
        except BaseException as error:
            failure = {"operation": OPERATION, "phase": phase, "at": stamp(), "error": str(error),
                       "errorType": type(error).__name__, "traceback": traceback.format_exc()}
            save(reports / ("interruption-" + invocation + ".json"), failure, immutable=True)
            if quiescent:
                try:
                    checkpoint("Interrupted_" + phase, failure)
                except BaseException as save_error:
                    event("checkpoint_interruption", error=str(save_error))
            else:
                event("checkpoint_pending", reason="Original owned process closure is not proved; preserve the live case and recorded receipts.")
            event("interrupted", **failure)
            return 1
        finally:
            for name, handler in old_signals.items():
                signal.signal(name, handler)

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--owned-process":
        process_launcher()
    else:
        raise SystemExit(main())
