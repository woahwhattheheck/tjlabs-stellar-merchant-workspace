#!/usr/bin/env python3
"""Run the original programme journey inside the unchanged owned-process scope."""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time
import uuid

OPERATION = "SCF-SPC-PMRS-PROGRAMME-RECEIVING-7DE2-20261013"
FAMILY_SHA = "8522835d848533ff66b8fad6900c5c0c781eaae4967a5b5ac2f9dac1ed458412"
FAMILY_BYTES = 13765
sys.dont_write_bytecode = True


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private(path):
    if not path.is_absolute() or path.resolve() != path:
        raise ValueError("Use the original absolute receiving directory")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
        raise ValueError("Keep the original operator-owned private directory")
    sync_dir(path)
    sync_dir(path.parent)
    return path


def info(path, maximum=4 * 1024 * 1024 * 1024):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > maximum:
            raise ValueError("Use a bounded original regular file")
        digest = hashlib.sha256()
        while block := os.read(fd, 1024 * 1024):
            digest.update(block)
        after, attached = os.fstat(fd), path.lstat()
        identity = lambda value: (value.st_dev, value.st_ino, value.st_size,
                                  value.st_mtime_ns, value.st_ctime_ns)
        if identity(before) != identity(after) or (attached.st_dev, attached.st_ino) != (before.st_dev, before.st_ino):
            raise ValueError("The original selected file changed")
        os.fsync(fd)
        return {"path": str(path), "bytes": before.st_size, "sha256": digest.hexdigest()}
    finally:
        os.close(fd)


def read_json(path, optional=False):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        if optional:
            return None
        raise
    with os.fdopen(fd, "rb") as stream:
        value = os.fstat(stream.fileno())
        if not stat.S_ISREG(value.st_mode) or value.st_size > 64 * 1024 * 1024:
            raise ValueError("Use the bounded original receiving record")
        body = stream.read(64 * 1024 * 1024 + 1)
        if len(body) != value.st_size:
            raise ValueError("The original receiving record changed")
    return json.loads(body)


def save(path, value, immutable=False):
    body = encoded(value)
    if immutable and path.exists():
        if read_json(path) != value:
            raise ValueError("The completed original foreground receipt differs")
        info(path)
        sync_dir(path.parent)
        return
    temporary = path.with_name(path.name + ".pending-" + uuid.uuid4().hex)
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        if immutable:
            try:
                os.link(temporary, path, follow_symlinks=False)
            except FileExistsError:
                if read_json(path) != value:
                    raise ValueError("The completed original foreground receipt differs")
                info(path)
        else:
            os.replace(temporary, path)
        sync_dir(path.parent)
    finally:
        try:
            temporary.unlink()
            sync_dir(temporary.parent)
        except FileNotFoundError:
            pass


def observe(value):
    try:
        print(json.dumps(value), flush=True)
    except OSError:
        pass


def retain(label, action):
    notice = None
    while True:
        try:
            return action()
        except OSError as error:
            current = (type(error).__name__, str(error))
            if current != notice:
                observe({"operation": OPERATION, "state": "AWAITING_LOCAL_RETENTION",
                         "label": label, "error": current})
                notice = current
            time.sleep(2)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("programme_arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    forwarded = args.programme_arguments
    if forwarded[:1] == ["--"]:
        forwarded = forwarded[1:]
    if len(forwarded) % 2 or any(forwarded.count(flag) != 1 for flag in ("--out", "--sdk")):
        raise ValueError("Pass the original complete receiving arguments after --")
    selected = dict(zip(forwarded[::2], forwarded[1::2]))
    root = private(Path(selected["--out"]))
    private(root / "private")
    support = private(root / "private" / "foreground")
    source = Path(__file__).resolve()
    family_path = source.with_name("process_family.py")
    family_info = info(family_path)
    if family_info["bytes"] != FAMILY_BYTES or family_info["sha256"] != FAMILY_SHA:
        raise ValueError("Use the complete unchanged original process-family helper")
    node = args.node
    if not node.is_absolute() or node.resolve() != node:
        raise ValueError("Use the selected original Node executable")
    programme = source.with_name("programme-receiving.mjs")
    if programme != Path(selected["--sdk"]) / "grant-portfolio/examples/spc/programme-receiving.mjs":
        raise ValueError("Run the foreground beside its complete selected programme")
    input_info = info(Path(selected["--input"]), 2 * 1024 * 1024)
    selection = {"schema": "stellar-forge.programme-foreground-selection.v1",
                 "operation": OPERATION, "root": str(root), "node": info(node),
                 "arguments": forwarded, "programme": info(programme),
                 "family": family_info, "foreground": info(source), "input": input_info}
    selection_sha = hashlib.sha256(encoded(selection)).hexdigest()
    lock = os.open(support / "worker.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    lock_info = os.fstat(lock)
    if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_nlink != 1 or lock_info.st_mode & 0o077 or lock_info.st_uid != os.getuid():
        os.close(lock)
        raise ValueError("Keep the original private foreground lock")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    handlers = {}
    child = scope = None
    stopped = []
    output = error_output = None
    try:
        retain("original foreground selection", lambda: save(support / "selection.json", selection, True))
        completion_path = root / "foreground-complete.json"
        completed = read_json(completion_path, True)
        if completed:
            if completed.get("selectionSha256") != selection_sha or completed.get("state") != "COMPLETE":
                raise ValueError("Preserve the original completed foreground selection")
            if completed["family"]["state"] != "CLOSED" or completed["main"]["exitCode"] != 0:
                raise ValueError("The original process family did not complete")
            for row in completed["files"]:
                actual = info(Path(row["path"]))
                if actual != row:
                    raise ValueError("The complete original receiving output changed")
            print(json.dumps({"operation": OPERATION, "state": "COMPLETE",
                              "receipt": str(completion_path), "reopened": True}), flush=True)
            return 0
        active_path = support / "current.json"
        previous = read_json(active_path, True)
        if previous:
            if (previous.get("schema") != "stellar-forge.programme-foreground-attempt.v1"
                    or previous.get("operation") != OPERATION
                    or previous.get("selectionSha256") != selection_sha
                    or not isinstance(previous.get("attempt"), str)
                    or len(previous["attempt"]) != 32
                    or any(char not in "0123456789abcdef" for char in previous["attempt"])):
                raise ValueError("The retained original foreground selection differs")
            closed_path = support / previous["attempt"] / "closed.json"
            recorded = read_json(closed_path, True)
            closed = recorded or (previous if previous.get("state") == "CLOSED" else None)
            if closed is None:
                raise RuntimeError("Reconcile the original foreground and its family before another invocation")
            for key in ("schema", "operation", "selectionSha256", "attempt", "startedAt"):
                if closed.get(key) != previous.get(key):
                    raise ValueError("The original completed foreground receipt differs")
            if closed.get("state") != "CLOSED":
                raise ValueError("The original foreground has no completed closure")
            main_return, family_return = closed.get("main"), closed.get("family")
            if main_return is not None:
                if (not isinstance(main_return, dict) or type(main_return.get("pid")) is not int
                        or main_return["pid"] <= 0 or type(main_return.get("exitCode")) is not int
                        or not isinstance(family_return, dict)):
                    raise ValueError("Keep the actual original main-child return")
                if previous.get("pid") is not None and previous["pid"] != main_return["pid"]:
                    raise ValueError("The original foreground child identity changed")
            elif not closed.get("failure"):
                raise ValueError("Keep the original prelaunch failure")
            if family_return is not None and (
                    family_return.get("schema") != "commons.process-family.v1"
                    or family_return.get("label") != OPERATION
                    or family_return.get("state") != "CLOSED"):
                raise ValueError("The original owned process family has not closed")
            if previous.get("state") == "CLOSED" and previous != closed:
                raise ValueError("The original current and completed closure differ")
            # The immutable closure can precede its current-state publication.
            # Adopt that exact return before considering another invocation.
            closed = json.loads(encoded(closed))
            retain("recover original closed attempt", lambda: save(closed_path, closed, True))
            retain("recover original foreground closure", lambda: save(active_path, closed))
        attempt = uuid.uuid4().hex
        attempt_root = private(support / attempt)
        state = {"schema": "stellar-forge.programme-foreground-attempt.v1",
                 "operation": OPERATION, "selectionSha256": selection_sha,
                 "attempt": attempt, "state": "PREPARED", "startedAt": now()}
        retain("original foreground intent", lambda: save(active_path, state))
        spec = importlib.util.spec_from_file_location("original_programme_process_family", family_path)
        family = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(family)

        def stop(number, _frame):
            stopped.append({"signal": number, "at": now()})
            if child is not None and child.poll() is None:
                try:
                    child.send_signal(signal.SIGTERM)
                except ProcessLookupError:
                    pass

        for number in (signal.SIGINT, signal.SIGTERM):
            handlers[number] = signal.getsignal(number)
            signal.signal(number, stop)
        failure = None
        main_result = None
        family_report = None
        try:
            scope = family.ProcessFamily(OPERATION)
            scope.__enter__()
            if stopped:
                raise RuntimeError("Stop requested before the original programme launch")
            output = open(attempt_root / "stdout.log", "xb", buffering=0)
            error_output = open(attempt_root / "stderr.log", "xb", buffering=0)
            environment = dict(os.environ, PYTHONDONTWRITEBYTECODE="1",
                               SCF_PROGRAMME_FOREGROUND_PID=str(os.getpid()),
                               SCF_PROGRAMME_FOREGROUND_SELECTION=selection_sha,
                               SCF_PROGRAMME_FOREGROUND_HELPER_SHA256=FAMILY_SHA)
            child = subprocess.Popen([str(node), str(programme), *forwarded],
                                     cwd=selected["--sdk"], env=environment,
                                     stdin=subprocess.DEVNULL, stdout=output, stderr=error_output)
            state.update(state="RUNNING", pid=child.pid)
            retain("original programme PID", lambda: save(active_path, state))
            if stopped and child.poll() is None:
                try:
                    child.send_signal(signal.SIGTERM)
                except ProcessLookupError:
                    pass
            # No elapsed-time kill: the original caller retains actual returns
            # through local receipt failures and owns its normal cancellation.
            child.wait()
        except BaseException as error:
            failure = {"type": type(error).__name__, "message": str(error)}
        finally:
            # Popen reaps its own main child before the unchanged family scope
            # discovers, closes and reaps newly adopted descendants.
            if child is not None:
                if failure and child.poll() is None:
                    try:
                        child.send_signal(signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                while True:
                    try:
                        child.wait()
                        break
                    except BaseException as error:
                        observe({"operation": OPERATION, "state": "AWAITING_ORIGINAL_CHILD_CLOSE",
                                 "error": type(error).__name__})
                        time.sleep(2)
                main_result = {"pid": child.pid, "exitCode": child.returncode, "endedAt": now()}
            if scope is not None and scope.entered:
                while not scope.closed:
                    try:
                        scope.close()
                    except BaseException as error:
                        observe({"operation": OPERATION, "state": "AWAITING_ORIGINAL_FAMILY_CLOSE",
                                 "error": type(error).__name__})
                        time.sleep(2)
                family_report = scope.report
            for stream in (output, error_output):
                if stream is not None:
                    retain("closed original programme output", lambda stream=stream: os.fsync(stream.fileno()))
                    retain("close original output descriptor", stream.close)
            state.update(state="CLOSED", completedAt=now(), main=main_result,
                         family=family_report, failure=failure, stops=stopped)
            closed = json.loads(encoded(state))
            retain("actual programme and family return", lambda: save(attempt_root / "closed.json", closed, True))
            retain("original foreground closure", lambda: save(active_path, closed))
        if failure or not main_result or main_result["exitCode"] != 0 or not family_report or family_report["state"] != "CLOSED":
            print(json.dumps({"operation": OPERATION, "state": "INCOMPLETE",
                              "closed": str(attempt_root / "closed.json"), "main": main_result,
                              "failure": failure}), flush=True)
            return 1
        actual_path = root / "complete.json"
        actual = read_json(actual_path)
        if (actual.get("state") != "COMPLETE" or actual.get("operation") != OPERATION
                or actual["binding"]["inputSha256"] != input_info["sha256"]
                or actual["binding"].get("foregroundSelectionSha256") != selection_sha
                or actual["resources"].get("closed") is not True):
            raise ValueError("The original programme has no matching complete result")
        files = [info(actual_path)]
        for row in (actual["customer"], actual["reexport"], *actual["images"]):
            observed = info(Path(row["path"]))
            if observed["bytes"] != row["bytes"] or observed["sha256"] != row["sha256"]:
                raise ValueError("The original full receiving output changed")
            files.append(observed)
        completed = {"schema": "stellar-forge.programme-foreground-complete.v1",
                     "operation": OPERATION, "state": "COMPLETE", "completedAt": now(),
                     "selectionSha256": selection_sha, "main": main_result,
                     "family": family_report, "files": files, "stops": stopped}
        completed = json.loads(encoded(completed))
        retain("complete programme custody", lambda: save(completion_path, completed, True))
        print(json.dumps({"operation": OPERATION, "state": "COMPLETE",
                          "receipt": str(completion_path), "result": str(actual_path),
                          "customer": actual["customer"], "reexport": actual["reexport"]}), flush=True)
        return 0
    finally:
        for number, handler in handlers.items():
            signal.signal(number, handler)
        fcntl.flock(lock, fcntl.LOCK_UN)
        os.close(lock)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({"operation": OPERATION, "state": "INCOMPLETE",
                          "error": {"type": type(error).__name__, "message": str(error)}}), flush=True)
        sys.exit(1)
