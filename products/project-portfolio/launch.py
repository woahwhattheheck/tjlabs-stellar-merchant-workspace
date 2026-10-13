#!/usr/bin/env python3
"""Managed lifetime over the original Project Portfolio desk and workspaces."""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import sys
import tempfile
import threading
import time
import uuid

HERE = Path(__file__).resolve().parent
READY = "stellar-forge.project-portfolio-ready.v1"
SELECTION = "stellar-forge.project-portfolio-selection.v1"
SOURCE_COMMIT = "bb1214f14e6df3068784845c589242713d21242a"
SOURCE_TREE = "3851466b3b489ed1d6e3aae1654ae1d04436ff27"


def need(value, message):
    if not value:
        raise ValueError(message)


def canonical(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=False,
                       separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def stamp(value):
    return {"dev": str(value.st_dev), "ino": str(value.st_ino), "bytes": str(value.st_size),
            "mtimeNs": str(value.st_mtime_ns), "ctimeNs": str(value.st_ctime_ns)}


def file_bytes(path, maximum):
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and 0 <= before.st_size <= maximum,
             "Use the complete selected regular source file.")
        with os.fdopen(fd, "rb") as stream:
            fd = None
            value = stream.read(maximum + 1)
            need(len(value) == before.st_size and stamp(before) == stamp(os.fstat(stream.fileno()))
                 == stamp(path.stat(follow_symlinks=False)), "The selected source changed during reading.")
            return value
    finally:
        if fd is not None:
            os.close(fd)


def private_directory(path):
    path = Path(path)
    need(path.is_absolute() and str(path) == os.path.abspath(path), "Select an absolute original directory.")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    value = path.stat(follow_symlinks=False)
    need(path.resolve(strict=True) == path and stat.S_ISDIR(value.st_mode) and
         value.st_uid == os.getuid() and not value.st_mode & 0o077,
         "Keep the original operator-owned private directory.")
    return path


def save_json(path, value):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + "-", suffix=".incoming", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(canonical(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)


def verify_selection(envelope):
    need(isinstance(envelope, dict) and set(envelope) == {"selection", "selectionSha256"},
         "Receive the original selected launch input.")
    selected = envelope["selection"]
    need(isinstance(selected, dict) and selected.get("schema") == SELECTION and
         isinstance(selected.get("sourceDirectory"), str) and selected.get("sourceCommit") == SOURCE_COMMIT and
         selected.get("sourceTree") == SOURCE_TREE and digest(canonical(selected)) == envelope["selectionSha256"],
         "The selected complete product source changed.")
    selected_root = Path(selected["sourceDirectory"])
    need(selected_root.is_absolute() and selected_root.resolve(strict=True) == selected_root and
         selected_root.is_dir(), "Keep the reviewed original source directory.")
    python = selected["python"]
    executable = Path(sys.executable).resolve(strict=True)
    invoked = Path(python["path"])
    need(invoked.is_absolute() and invoked.resolve(strict=True) == executable and
         str(executable) == python["realPath"],
         "Use the original selected Python executable path.")
    # Exact executable bytes bind across Node and Python; their stat inode
    # representations can differ in signedness on the same host filesystem.
    executable_bytes = file_bytes(executable, 256 * 1024 * 1024)
    need(len(executable_bytes) == int(python["bytes"]) and
         digest(executable_bytes) == python["sha256"],
         "The complete selected Python executable changed.")
    configuration = python.get("configuration")
    if configuration:
        path = Path(configuration["path"])
        need(path == invoked.parent.parent / "pyvenv.cfg" and
             Path(sys.prefix).resolve(strict=True) == path.parent.resolve(strict=True),
             "Open the original selected Python virtual environment.")
        raw = file_bytes(path, 65536)
        need(len(raw) == configuration["bytes"] and digest(raw) == configuration["sha256"],
             "The selected Python virtual environment configuration changed.")
    need(sys.version_info >= (3, 12), "Project Portfolio requires Python 3.12 or later.")
    seen = set()
    for item in selected["files"]:
        path = Path(item["path"])
        need(path.is_absolute() and path.resolve(strict=True) == path and selected_root in path.parents and
             path not in seen, "Keep every original selected product source without aliases.")
        raw = file_bytes(path, 16 * 1024 * 1024)
        need(len(raw) == item["bytes"] and digest(raw) == item["sha256"],
             "The complete selected product file changed: " + str(path))
        if selected_root != HERE:
            executing = HERE / path.relative_to(selected_root)
            copied = file_bytes(executing, 16 * 1024 * 1024)
            need(len(copied) == item["bytes"] and digest(copied) == item["sha256"],
                 "The complete executing release source changed: " + str(executing))
        seen.add(path)
    adoption = json.loads(file_bytes(HERE / "SOURCE_ADOPTION.json", 65536))
    required = {selected_root / "source" / item["path"] for item in adoption["files"]}
    required.update(selected_root / name for name in (
        "SOURCE_ADOPTION.json", "workspace.mjs", "launch.py", "client.mjs", "client.d.mts",
        "cli.mjs", "merchant-catalog.mjs", "merchant.mjs", "merchant-provider.mjs",
        "application-provider.mjs"))
    need(seen == required and len(adoption["files"]) == 63,
         "Keep the entire original source and installed customer interfaces.")
    workspace = Path(selected["workspaceDirectory"])
    control = Path(selected["controlDirectory"])
    need(workspace.is_absolute() and control.is_absolute() and control != workspace and workspace not in control.parents,
         "Keep the private host connection outside the portable project.")
    profiles = selected.get("profiles")
    if profiles:
        path = Path(profiles["path"])
        need(path.is_absolute() and path.resolve(strict=True) == path and workspace not in path.parents,
             "Keep target credentials in the original private profile file.")
        info = path.stat(follow_symlinks=False)
        need(info.st_uid == os.getuid() and not info.st_mode & 0o077,
             "Keep target credentials private to the selected operator.")
        raw = file_bytes(path, 2 * 1024 * 1024)
        need(len(raw) == profiles["bytes"] and digest(raw) == profiles["sha256"],
             "The selected target profile changed before opening.")
    return selected


def process_identity():
    # A container may expose procfs from an enclosing PID namespace. Retain the
    # PID and start time from that same observable proc entry for its readers.
    text = Path("/proc/self/stat").read_text()
    fields = text[text.rfind(")") + 2:].split()
    return {"pid": int(text[:text.find("(")].strip()), "ppid": int(fields[1]),
            "processStart": fields[19], "runtimePid": os.getpid(), "runtimePpid": os.getppid()}


def run(envelope, port):
    selected = verify_selection(envelope)
    workspace = private_directory(selected["workspaceDirectory"])
    control = private_directory(selected["controlDirectory"])
    launches = private_directory(control / "launches")
    lease = os.open(control / "operator.lock", os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    desk = None
    thread = None
    entry = None
    first_error = None
    stop = threading.Event()
    handlers = {}

    def request_stop(signum, frame):
        stop.set()
        if desk is not None:
            desk.stop_requests()

    try:
        need(stat.S_ISREG(os.fstat(lease).st_mode), "Keep the original operator ownership file.")
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for name in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            handlers[name] = signal.signal(name, request_stop)
        sys.path.insert(0, str(HERE / "source"))
        sys.path.insert(0, str(HERE / "source" / "operator"))
        from portfolio_target.server import start_desk
        if stop.is_set():
            return 0
        desk = start_desk(workspace, profile_config=(selected.get("profiles") or {}).get("path"), port=port)
        instance = str(uuid.uuid4())
        entry = {"schema": READY, "state": "LISTENING", "instanceId": instance,
                 **process_identity(),
                 "sourceCommit": SOURCE_COMMIT, "sourceTree": SOURCE_TREE,
                 "sourceDirectory": selected["sourceDirectory"], "executionSourceDirectory": str(HERE),
                 "selectionSha256": envelope["selectionSha256"],
                 "workspaceDirectory": str(workspace), "controlDirectory": str(control),
                 "workspaceId": desk.workspace_id, "origin": desk.origin,
                 "url": desk.origin + "/#token=" + desk.token, "openedAt": time.time()}
        if stop.is_set():
            return 0
        thread = threading.Thread(target=desk.server.serve_forever,
                                  kwargs={"poll_interval": 0.25},
                                  name="project-portfolio-http", daemon=False)
        thread.start()
        save_json(launches / (instance + ".json"), entry)
        save_json(control / "entry.json", entry)
        sys.stdout.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
        sys.stdout.flush()
        while not stop.wait(0.25):
            if not thread.is_alive():
                raise RuntimeError("The original Project Portfolio listener stopped.")
    except BaseException as error:
        first_error = error
    finally:
        if desk is not None:
            try:
                desk.stop_requests()
                if thread is not None and thread.is_alive():
                    desk.server.shutdown()
                desk.server.server_close()
                desk.executor.shutdown(wait=True, cancel_futures=False)
                if thread is not None and thread.ident is not None:
                    thread.join()
            except BaseException as error:
                first_error = first_error or error
        if entry is not None:
            closed = {**entry, "state": "CLOSED", "url": None, "closedAt": time.time(),
                      "error": {"code": type(first_error).__name__, "message": str(first_error)} if first_error else None}
            try:
                save_json(launches / (entry["instanceId"] + ".json"), closed)
                current_path = control / "entry.json"
                if current_path.exists():
                    current = json.loads(file_bytes(current_path, 65536))
                    if current.get("instanceId") == entry["instanceId"]:
                        save_json(current_path, closed)
            except BaseException as error:
                first_error = first_error or error
        for name, handler in handlers.items():
            signal.signal(name, handler)
        os.close(lease)
    if first_error:
        raise first_error
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    need(0 <= args.port <= 65535, "Choose a local port from 0 through 65535.")
    raw = sys.stdin.buffer.read(262145)
    need(len(raw) <= 262144, "Receive the complete original source selection within its input limit.")
    try:
        return run(json.loads(raw.decode("utf-8")), args.port)
    except BaseException as error:
        try:
            sys.stdout.write(json.dumps({"error": {"code": getattr(error, "code", type(error).__name__),
                                                   "message": str(error)}}) + "\n")
            sys.stdout.flush()
        except (BrokenPipeError, OSError):
            pass
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
