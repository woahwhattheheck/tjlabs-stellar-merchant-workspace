#!/usr/bin/env python3
"""Continue the original Zurich customer workbook with its complete maintained engine."""
from __future__ import annotations
import argparse
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import signal
import stat
import subprocess
import sys
import tempfile
import urllib.request

OPERATION = "LIIP-CKAN-WORKSHARE-814B-20261013"
PREFIX = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/"
REPOSITORY = "woahwhattheheck/tjlabs-stellar-merchant-workspace"
PACKET_COMMIT = "07be25ede5d9bb9b5c953d8a1a78502265571eb7"
PACKET_PATH = "operations/ckan-datastore-acquisition-814b-20261013/source-packet.json"
PACKET_BLOB = "0ac2cd11b4d90c20430a55a73ac9dd4c1de2b70e"
PACKET_BYTES = 6139200
SUCCESSOR_COMMIT = "eceae7e36e212940c56cf22da386a5badc9d0dce"
OVERRIDES = {
    PREFIX + "stellar_forge_buyer/analysis_workbooks.py": ("b1ae65392dd860e4180349d7b8d3b507a288557c", 60995),
    PREFIX + "examples/zurich_portal_workbook_presentation.py": ("b9ade5f4b16c8ccfc000b7911773445881d74a06", 13898),
}
ARCHIVE_BYTES = 5166994
ARCHIVE_SHA256 = "8023daaa5f2d8f9fb40a55bf222dadcff20da9d3ed4aa944fa7677b259e4243f"


def require(value, message):
    if not value:
        raise RuntimeError(message)


def blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe_path(value):
    path = PurePosixPath(value)
    require(isinstance(value, str) and not path.is_absolute() and str(path) == value
            and ".." not in path.parts and "\\" not in value and "\0" not in value,
            "Invalid source path")
    return path


def private_directory(path, root=None):
    path = Path(path).absolute()
    if root is not None:
        path.relative_to(root)
        # Walk from the already selected original root, never chmod its ancestors.
        parts = [root]
        cursor = root
        for name in path.relative_to(root).parts:
            cursor = cursor / name
            parts.append(cursor)
    else:
        require(path.parent.is_dir() and path.parent.resolve() == path.parent,
                "Select an existing real parent for the original private work directory")
        parts = [path]
    for part in parts:
        try:
            part.mkdir(mode=0o700)
        except FileExistsError:
            pass
        info = part.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid(),
                "An owned real directory is required: " + str(part))
        os.chmod(part, 0o700)
    return path


def publish(source, target):
    libc = ctypes.CDLL(None, use_errno=True)
    require(sys.platform.startswith("linux") and hasattr(libc, "renameat2"),
            "This portable receiving command requires Linux renameat2")
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(source), -100, os.fsencode(target), 1):
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code), str(target))
    descriptor = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def retain(root, relative, raw):
    relative = safe_path(relative)
    target = root / str(relative)
    private_directory(target.parent, root)
    def existing():
        info = target.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
                and not info.st_mode & 0o077 and info.st_size == len(raw),
                "Original retained file identity differs: " + str(relative))
        require(digest(target) == hashlib.sha256(raw).hexdigest(),
                "Original retained file bytes differ: " + str(relative))
        return target
    if os.path.lexists(target):
        return existing()
    descriptor, name = tempfile.mkstemp(prefix=".receiving-", dir=target.parent)
    staged = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        try:
            publish(staged, target)
        except FileExistsError:
            return existing()
    finally:
        staged.unlink(missing_ok=True)
    return existing()


def fetch(commit, path, maximum):
    url = "https://raw.githubusercontent.com/" + REPOSITORY + "/" + commit + "/" + path
    with urllib.request.urlopen(url, timeout=120) as response:
        raw = response.read(maximum + 1)
    require(len(raw) <= maximum, "Source response exceeds its exact bound")
    return raw


def selected_sources(options):
    raw = Path(options.source_packet).read_bytes() if options.source_packet else fetch(PACKET_COMMIT, PACKET_PATH, PACKET_BYTES)
    require(len(raw) == PACKET_BYTES and blob(raw) == PACKET_BLOB,
            "Select the complete original 365-file source packet")
    packet = json.loads(raw)
    require(packet["schema"] == "commons.original-source-packet.v1"
            and packet["operation"] == "CKAN-DATASTORE-ACQUISITION-814B-20261013"
            and packet["selectedRepository"] == REPOSITORY and len(packet["files"]) == 365,
            "Original source packet identity differs")
    sources, seen = {}, set()
    for member in packet["files"]:
        path = str(safe_path(member["path"]))
        require(path not in seen, "Duplicate original source member")
        seen.add(path)
        body = member["content"].encode("utf-8")
        require(blob(body) == member["blobSha"], "Original source member differs: " + path)
        if path.startswith(PREFIX):
            sources[path] = body
    require(len(sources) == 47, "Original complete Python component required")
    for path, (expected, size) in OVERRIDES.items():
        body = (Path(options.successor_source) / path).read_bytes() if options.successor_source else fetch(SUCCESSOR_COMMIT, path, size)
        require(len(body) == size and blob(body) == expected, "Readable successor source differs: " + path)
        sources[path] = body
    require(len(sources) == 48, "Complete successor Python component required")
    return sources


def run(options):
    require(sys.version_info >= (3, 11), "Python 3.11 or newer is required")
    os.umask(0o077)
    root = private_directory(Path(options.work_directory).absolute())
    lock_fd = os.open(root / "continuation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, "r+b") as lock:
        info = os.fstat(lock.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and not info.st_mode & 0o077,
                "Private original continuation lock required")
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        sources = selected_sources(options)
        source_root = private_directory(root / "source", root)
        for path, body in sources.items():
            retain(source_root, path, body)
        archive = Path(options.archive).absolute()
        require(archive.is_file() and archive.stat().st_size == ARCHIVE_BYTES and digest(archive) == ARCHIVE_SHA256,
                "Select the complete original 98958 customer archive")
        selected_archive = retain(root, "original-customer-workspace.zip", archive.read_bytes())
        temporary = private_directory(root / "tmp", root)
        output = private_directory(root / "delivery", root)
        python = str(Path(options.python).absolute())
        require(Path(python).is_file() and os.access(python, os.X_OK), "Select an existing Python executable")
        environment = {**os.environ, "PYTHONPATH": str(source_root / PREFIX), "TMPDIR": str(temporary),
                       "PYTHONUNBUFFERED": "1", "PYTHONDONTWRITEBYTECODE": "1"}
        command = [python, str(source_root / PREFIX / "examples/zurich_portal_workbook_presentation.py"),
                   "--archive", str(selected_archive), "--out", str(output)]
        if options.retry_workbook:
            command.append("--retry-workbook")
        print(json.dumps({"operation": OPERATION, "phase": "workbook-presentation",
                          "host": os.uname().nodename, "controllerPid": os.getpid(),
                          "sourceFiles": len(sources), "workDirectory": str(root)}), flush=True)
        process = None
        original_handlers = {}
        def stop(signum, frame):
            raise KeyboardInterrupt("Original controller received signal " + str(signum))
        try:
            for signum in (signal.SIGTERM, signal.SIGINT):
                original_handlers[signum] = signal.signal(signum, stop)
            with (root / "workbook-presentation.log").open("ab", buffering=0) as log:
                process = subprocess.Popen(command, cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT,
                                           start_new_session=True)
                print(json.dumps({"phase": "original-child", "pid": process.pid}), flush=True)
                result = process.wait(timeout=1800)
        finally:
            if process is not None and process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            for signum, handler in original_handlers.items():
                signal.signal(signum, handler)
        record_path = output / "workbook-presentation-programme.json"
        record = json.loads(record_path.read_text()) if record_path.is_file() else None
        complete = result == 0 and record is not None and record.get("state") == "COMPLETE"
        print(json.dumps({"phase": "original-workbook-result", "returncode": result,
                          "complete": complete, "record": record}), flush=True)
        return 0 if complete else (result or 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, help="Original 5,166,994-byte customer workspace ZIP")
    parser.add_argument("--work-directory", required=True, help="One owned private directory, reused on continuation")
    parser.add_argument("--source-packet", help="Complete retained original source-packet.json; otherwise fetch its pinned public commit")
    parser.add_argument("--successor-source", help="Retained repository root containing the two exact successor source files")
    parser.add_argument("--python", default=sys.executable, help="Existing Python 3.11+ with openpyxl installed")
    parser.add_argument("--retry-workbook", action="store_true", help="Explicit new child after a terminal failed workbook attempt")
    options = parser.parse_args()
    raise SystemExit(run(options))


if __name__ == "__main__":
    main()
