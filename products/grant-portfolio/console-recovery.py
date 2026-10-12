#!/usr/bin/env python3
"""MIT. Retain one original console process before exec and control that exact Linux process."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import select
import signal
import stat
import sys
import tempfile
import time

SCHEMA = "stellar-forge.grant-portfolio-console-process.v1"


class CustodyError(ValueError):
    code = "GRANT_PRODUCT_CONSOLE_CUSTODY_CHANGED"


def require(value, message):
    if not value:
        raise CustodyError(message)


def encode(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=False,
                       separators=(",", ":"), allow_nan=False) + "\n").encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def private_directory(path):
    path = Path(path).expanduser().absolute()
    info = path.lstat()
    require(path.resolve(strict=True) == path and stat.S_ISDIR(info.st_mode)
            and info.st_uid == os.getuid() and not info.st_mode & 0o077,
            "Use the original private process-custody directory")
    return path


def valid_link_count(path, info):
    if info.st_nlink == 1:
        return True
    if info.st_nlink != 2:
        return False
    # Atomic publication briefly keeps the complete private temporary inode.
    # That alias may also survive the publishing process. Never unlink an
    # active publisher's temporary path from a reader.
    for sibling in path.parent.iterdir():
        if not sibling.name.startswith(".console-process-"):
            continue
        try:
            alias = sibling.lstat()
        except FileNotFoundError:
            continue
        if (alias.st_dev, alias.st_ino) == (info.st_dev, info.st_ino) and \
                stat.S_ISREG(alias.st_mode) and alias.st_uid == os.getuid() and \
                not alias.st_mode & 0o077:
            return True
    # The writer can finish unlinking between fstat and the directory read.
    attached = path.lstat()
    return (attached.st_dev, attached.st_ino) == (info.st_dev, info.st_ino) and attached.st_nlink == 1


def read(path, optional=False):
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        if optional:
            return None
        raise
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and valid_link_count(path, before)
                and before.st_uid == os.getuid() and not before.st_mode & 0o077
                and before.st_size <= 65536, "Use complete private process metadata")
        data = stream.read(65537)
        after = os.fstat(stream.fileno())
    attached = path.lstat()
    require(len(data) == before.st_size and
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) and
            (before.st_ctime_ns == after.st_ctime_ns or
             before.st_nlink == 2 and after.st_nlink == 1) and valid_link_count(path, after) and
            (attached.st_dev, attached.st_ino) == (before.st_dev, before.st_ino),
            "The original process metadata changed")
    return data


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def retain(path, value, *, exclusive=False):
    data = encode(value)
    previous = read(path, True)
    if previous is not None:
        require(not exclusive and previous == data, "Retain the first original process record")
        return value
    descriptor, name = tempfile.mkstemp(prefix=".console-process-", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            previous = read(path)
            require(not exclusive and previous == data, "Another original bootstrap already retained this intent")
        temporary.unlink()
        sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)
    return value


def load(directory):
    directory = private_directory(directory)
    raw = read(directory / "intent.json")
    intent = json.loads(raw)
    required = {"schema", "operationId", "recoveryId", "stage", "attemptId", "directory",
                "pythonExecutable", "cli", "workspace", "workspaceId", "bindingSha256",
                "connectionFile", "sourceCommit", "stateSha256"}
    require(isinstance(intent, dict) and set(intent) == required and intent["schema"] == SCHEMA
            and intent["stage"] in ("first", "reopened") and intent["directory"] == str(directory),
            "Use the original complete console launch intent")
    for key in ("pythonExecutable", "cli", "workspace", "connectionFile"):
        require(isinstance(intent[key], str) and Path(intent[key]).is_absolute(),
                "The original process uses absolute paths")
    require(Path(intent["cli"]).name == "cli.py" and Path(intent["cli"]).parent.name == "grant-portfolio",
            "Execute the original grant-portfolio CLI")
    argv = [intent["pythonExecutable"], intent["cli"], "--workspace", intent["workspace"],
            "serve", "--port", "0", "--expected-binding", intent["bindingSha256"],
            "--connection-file", intent["connectionFile"]]
    return directory, intent, digest(raw), argv


def identity(root="/proc/self"):
    text = Path(root, "stat").read_text()
    end = text.rfind(")")
    require(end > 0, "Read the original Linux process stat")
    fields = text[end + 2:].split()
    status = {}
    for line in Path(root, "status").read_text().splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            status[key] = value.strip()
    ids = [int(value) for value in status["NSpid"].split()]
    host_pid = int(text.split(" ", 1)[0])
    require(ids and ids[0] == host_pid and int(status["Tgid"]) == host_pid
            and fields[19].isdigit(), "Read the original process namespace and start identity")
    executable = os.path.realpath(Path(root, "exe"))
    arguments = [os.fsdecode(value) for value in Path(root, "cmdline").read_bytes().split(b"\0") if value]
    again = Path(root, "stat").read_text()
    again_end = again.rfind(")")
    again_fields = again[again_end + 2:].split()
    require(int(again.split(" ", 1)[0]) == host_pid and again_fields[19] == fields[19],
            "The original process changed while its identity was read")
    return {"pid": ids[-1], "hostPid": host_pid, "namespacePids": ids,
            "pidNamespace": os.readlink(Path(root, "ns/pid")), "startTicks": fields[19],
            "state": fields[0], "uid": [int(value) for value in status["Uid"].split()],
            "executable": executable, "argv": arguments}


def boot():
    return Path("/proc/sys/kernel/random/boot_id").read_text().strip()


def process_record(directory, intent_sha):
    raw = read(directory / "process.json", True)
    if raw is None:
        return None, None
    value = json.loads(raw)
    require(value.get("schema") == SCHEMA and value.get("intentSha256") == intent_sha
            and isinstance(value.get("identity"), dict), "The process belongs to another retained launch")
    return value, digest(raw)


def examine(directory, intent, intent_sha, argv):
    record, record_sha = process_record(directory, intent_sha)
    if record is None:
        return {"schema": SCHEMA, "state": "PENDING", "intentSha256": intent_sha}
    saved = record["identity"]
    require(record.get("nativeArgv") == argv and
            isinstance(record.get("bootstrapArgv"), list) and
            record["bootstrapArgv"][:1] == argv[:1] and
            isinstance(saved.get("pid"), int) and saved["pid"] > 0 and
            isinstance(saved.get("hostPid"), int) and saved["hostPid"] > 0,
            "Retain the complete original process and executable binding")
    base = {"schema": SCHEMA, "intentSha256": intent_sha, "processSha256": record_sha,
            "identity": saved}
    current_self = identity()
    if record["bootId"] != boot() or saved["pidNamespace"] != current_self["pidNamespace"]:
        return {**base, "state": "FOREIGN", "reason": "original_host_or_pid_namespace"}
    try:
        current = identity("/proc/" + str(saved["hostPid"]))
    except FileNotFoundError:
        return {**base, "state": "EXITED", "reason": "original_process_ended"}
    if current["state"] in ("Z", "X", "x"):
        return {**base, "state": "EXITED", "reason": "original_process_ended"}
    keys = ("pid", "hostPid", "namespacePids", "pidNamespace", "startTicks")
    if any(current[key] != saved[key] for key in keys):
        return {**base, "state": "EXITED", "reason": "original_pid_reused"}
    require(current["uid"] == saved["uid"] and current["uid"][0] == os.getuid()
            and current["executable"] == saved["executable"]
            and current["argv"] in (record["bootstrapArgv"], argv),
            "The original process changed its executable or command")
    return {**base, "state": "RUNNING",
            "command": "native" if current["argv"] == argv else "bootstrap"}


def run(directory, intent, intent_sha, argv):
    current = identity()
    require(current["pid"] == os.getpid() and current["uid"][0] == os.getuid()
            and current["executable"] == os.path.realpath(intent["pythonExecutable"]),
            "Use the selected original Python in its actual PID namespace")
    record = {"schema": SCHEMA, "intentSha256": intent_sha, "bootId": boot(),
              "identity": {key: value for key, value in current.items() if key not in ("state", "argv")},
              "bootstrapArgv": current["argv"], "nativeArgv": argv}
    # A losing duplicate bootstrap exits here. Native CLI exec can only follow
    # successful publication of this original attempt's unique process record.
    retain(directory / "process.json", record, exclusive=True)
    try:
        os.execv(intent["pythonExecutable"], argv)
    except BaseException as error:
        retain(directory / "exec-error.json", {"schema": SCHEMA, "intentSha256": intent_sha,
            "code": type(error).__name__, "errno": getattr(error, "errno", None)})
        raise


def sent_receipt(directory, original):
    raw = read(directory / (original["signal"] + "-sent.json"), True)
    if raw is not None:
        require(raw == encode({**original, "state": "SENT"}),
                "Retain the first binding-valid original signal receipt")
    return raw is not None


def finish_exit(directory, original, process_identity):
    # Delivery is a separate receipt: an earlier helper may still be publishing
    # it after this helper has observed the same original process terminate.
    # Both helpers retain identical terminal bytes, whatever that timing is.
    ended = {**original, "state": "EXITED"}
    retain(directory / (original["signal"] + "-ended.json"), ended)
    return {**ended, "dispatch": "SENT" if sent_receipt(directory, original)
            else "ORIGINAL_INTENT_RECONCILED", "identity": process_identity}


def stop(directory, intent, intent_sha, argv, name):
    number = {"SIGTERM": signal.SIGTERM, "SIGKILL": signal.SIGKILL}[name]
    current = examine(directory, intent, intent_sha, argv)
    require(current["state"] != "PENDING", "Wait for the original bootstrap's retained custody")
    require(current["state"] != "FOREIGN", "Control the original process from its retained host namespace")
    original = {"schema": SCHEMA, "intentSha256": intent_sha,
                "processSha256": current["processSha256"], "signal": name}
    retain(directory / (name + "-intent.json"), original)
    sent = sent_receipt(directory, original)
    if current["state"] == "EXITED":
        return finish_exit(directory, original, current["identity"])
    require(hasattr(os, "pidfd_open") and hasattr(signal, "pidfd_send_signal"),
            "Use the native Linux pidfd process-control interface")
    try:
        descriptor = os.pidfd_open(current["identity"]["pid"])
    except ProcessLookupError:
        return finish_exit(directory, original, current["identity"])
    try:
        confirmed = examine(directory, intent, intent_sha, argv)
        if confirmed["state"] == "EXITED":
            return finish_exit(directory, original, current["identity"])
        require(confirmed["state"] == "RUNNING" and
                confirmed["processSha256"] == current["processSha256"],
                "The original process changed before its retained signal")
        if not sent:
            # pidfd binds the checked original even if its PID is later reused.
            try:
                signal.pidfd_send_signal(descriptor, number)
            except ProcessLookupError:
                return finish_exit(directory, original, current["identity"])
            retain(directory / (name + "-sent.json"), {**original, "state": "SENT"})
        watcher = select.poll()
        watcher.register(descriptor, select.POLLIN | select.POLLHUP | select.POLLERR)
        if not watcher.poll(30000):
            return {**original, "state": "RUNNING", "dispatch": "SENT",
                    "identity": current["identity"]}
    finally:
        os.close(descriptor)
    return finish_exit(directory, original, current["identity"])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("run", "inspect", "stop"))
    parser.add_argument("--directory", required=True)
    parser.add_argument("--signal", choices=("SIGTERM", "SIGKILL"))
    args = parser.parse_args()
    os.umask(0o077)
    directory, intent, intent_sha, argv = load(args.directory)
    if args.command == "run":
        run(directory, intent, intent_sha, argv)
        return
    if args.command == "stop":
        require(args.signal is not None, "Select the original stop signal")
        value = stop(directory, intent, intent_sha, argv, args.signal)
    else:
        require(args.signal is None, "Inspect the original process without a signal")
        value = examine(directory, intent, intent_sha, argv)
    sys.stdout.buffer.write(encode(value))
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stdout.buffer.write(encode({"schema": SCHEMA, "state": "ERROR",
            "code": getattr(error, "code", type(error).__name__)}))
        sys.stdout.buffer.flush()
        sys.exit(1)
