#!/usr/bin/env python3
# MIT. Publish one already-bound empty setup root without replacing a destination.
# Reuses the original host-adoption descriptor and Linux no-replace primitives.
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys

source = Path(__file__).with_name("host-adoption-files.py")
spec = importlib.util.spec_from_file_location("original_host_adoption_files", source)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
need = native.need
SCHEMA = "stellar-forge.recovery-host-setup.v1"


def read_bound_record(controls, expected):
    fd = os.open("root.json", native.RF, dir_fd=controls)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
             and stat.S_IMODE(before.st_mode) == 0o600
             and 0 < before.st_size <= 2 * 1024 * 1024,
             "HOST_SETUP_ROOT_RECORD_INVALID")
        aliases = []
        for name in os.listdir(controls):
            if re.fullmatch(r"\.setup-part-[0-9a-f-]{36}", name):
                info = native.named(controls, name)
                if info is not None and native.same_node(before, info):
                    aliases.append(info)
        need(before.st_nlink == len(aliases) + 1, "HOST_SETUP_ROOT_RECORD_LINKED")
        chunks, total = [], 0
        while True:
            part = os.read(fd, min(65536, before.st_size + 1 - total))
            if not part:
                break
            chunks.append(part)
            total += len(part)
            need(total <= before.st_size, "HOST_SETUP_ROOT_RECORD_CHANGED")
        after, named = os.fstat(fd), native.named(controls, "root.json")
        need(total == before.st_size and native.file_unchanged(before, after)
             and named is not None and native.file_unchanged(before, named)
             and before.st_nlink == after.st_nlink == named.st_nlink,
             "HOST_SETUP_ROOT_RECORD_CHANGED")
        need(json.loads(b"".join(chunks).decode("utf-8")) == expected,
             "HOST_SETUP_ROOT_BINDING_CHANGED")
    finally:
        os.close(fd)


def main(request):
    need(isinstance(request, dict) and set(request) == {"controls", "root"},
         "HOST_SETUP_ROOT_REQUEST_INVALID")
    root = request["root"]
    need(isinstance(root, dict) and set(root) == {
        "schema", "directory", "stage", "device", "inode", "intentSha256"
    } and root.get("schema") == SCHEMA
         and re.fullmatch(r"[a-f0-9]{64}", root.get("intentSha256", ""))
         and re.fullmatch(r"[0-9]+", root.get("device", ""))
         and re.fullmatch(r"[0-9]+", root.get("inode", "")),
         "HOST_SETUP_ROOT_BINDING_CHANGED")
    controls_path = native.absolute(request["controls"])
    destination = native.absolute(root["directory"])
    stage = native.absolute(root["stage"])
    need(os.path.dirname(stage) == controls_path
         and re.fullmatch(r"\.setup-root-[0-9a-f-]{36}", os.path.basename(stage))
         and os.path.dirname(controls_path) == os.path.dirname(destination),
         "HOST_SETUP_ROOT_PATH_CHANGED")
    controls = native.open_directory(controls_path, True)
    parent = native.open_directory(os.path.dirname(destination))
    try:
        native.check_lease(controls)
        read_bound_record(controls, root)
        expected = {"dev": root["device"], "ino": root["inode"]}
        current = native.named(parent, os.path.basename(destination))
        if current is None:
            staged = native.named(controls, os.path.basename(stage))
            need(staged is not None and native.identity(staged) == expected,
                 "HOST_SETUP_STAGED_ROOT_CHANGED")
            handle = native.open_directory(stage, True)
            try:
                need(native.identity(os.fstat(handle)) == expected
                     and os.listdir(handle) == [],
                     "HOST_SETUP_STAGED_ROOT_CHANGED")
                os.fsync(handle)
                native.named_directory(controls_path, controls)
                native.named_directory(os.path.dirname(destination), parent)
                native.check_lease(controls)
                # This is the unchanged original renameat2(RENAME_NOREPLACE).
                # An unrelated destination, including an empty directory, wins
                # its own name and is never adopted or replaced.
                native.rename_new(controls, os.path.basename(stage),
                                  parent, os.path.basename(destination))
                current = native.named(parent, os.path.basename(destination))
                need(current is not None and native.identity(current) == expected,
                     "HOST_SETUP_ROOT_CHANGED")
            finally:
                os.close(handle)
        else:
            need(stat.S_ISDIR(current.st_mode)
                 and native.identity(current) == expected,
                 "HOST_SETUP_ROOT_CHANGED")
        final = native.open_directory(destination, True)
        try:
            need(native.identity(os.fstat(final)) == expected,
                 "HOST_SETUP_ROOT_CHANGED")
            os.fsync(final)
        finally:
            os.close(final)
        os.fsync(controls)
        os.fsync(parent)
        read_bound_record(controls, root)
        native.named_directory(controls_path, controls)
        native.named_directory(os.path.dirname(destination), parent)
        native.check_lease(controls)
        return {"directory": destination, "device": root["device"], "inode": root["inode"]}
    finally:
        os.close(parent)
        os.close(controls)


if __name__ == "__main__":
    try:
        need(sys.platform.startswith("linux"), "HOST_SETUP_REQUIRES_LINUX")
        parent_pid = int(sys.argv[1])
        need(native.libc.prctl(1, signal.SIGTERM, 0, 0, 0) == 0,
             "HOST_SETUP_PARENT_GUARD_FAILED")
        need(os.getppid() == parent_pid, "HOST_SETUP_PARENT_GONE")
        raw = sys.stdin.buffer.read(65537)
        need(len(raw) <= 65536, "HOST_SETUP_ROOT_REQUEST_LIMIT")
        result = main(json.loads(raw.decode("utf-8")))
        sys.stdout.buffer.write(native.raw_json({"ok": True, "value": result}))
    except BaseException as error:
        code = str(error) if isinstance(error, RuntimeError) else "HOST_SETUP_" + type(error).__name__.upper()
        sys.stdout.buffer.write(native.raw_json({"ok": False, "code": code}))
        sys.exit(1)
