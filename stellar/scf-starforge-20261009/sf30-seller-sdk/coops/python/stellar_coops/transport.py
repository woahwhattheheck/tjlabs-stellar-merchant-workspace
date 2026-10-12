# MIT. Standard-library transport for the original loopback CO-OPS console.
from __future__ import annotations
import contextlib
import hashlib
import http.client
import json
import os
import re
import stat
import uuid
from pathlib import Path
from urllib.parse import urlsplit

MAX_JSON = 64 * 1024 * 1024
BLOCK = 256 * 1024
SHA = re.compile(r"^[a-f0-9]{64}$")
IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{8,100}$")


class ReceivingError(Exception):
    def __init__(self, code, message, *, status=None, operation_id=None, detail=None):
        super().__init__(message)
        self.code, self.status = code, status
        self.operation_id, self.detail = operation_id, detail

    def as_dict(self):
        return {k: v for k, v in {
            "error": self.code, "message": str(self), "status": self.status,
            "operationId": self.operation_id, "detail": self.detail
        }.items() if v is not None}


def require(condition, code, message):
    if not condition:
        raise ReceivingError(code, message)


def stable(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def decode_json(data):
    def object_pairs(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "COOPS_PY_JSON", "The selected JSON contains a duplicate key.")
            result[key] = value
        return result

    def invalid_constant(_):
        raise ReceivingError("COOPS_PY_JSON", "The selected JSON contains a nonfinite number.")
    try:
        return json.loads(data, object_pairs_hook=object_pairs, parse_constant=invalid_constant)
    except (ValueError, UnicodeError) as exc:
        raise ReceivingError("COOPS_PY_JSON", "The selected complete JSON could not be decoded.") from exc


def canonical_path(path):
    selected = Path(os.path.abspath(os.fspath(path)))
    require(selected.resolve() == selected, "COOPS_PY_PATH",
            "Use the original canonical path; a selected parent or file is a symbolic link.")
    return selected


def private_directory(path):
    selected = canonical_path(path)
    selected.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = selected.lstat()
    require(stat.S_ISDIR(info.st_mode), "COOPS_PY_DIRECTORY", "Select a directory for this receiver.")
    if os.name != "nt":
        require(not (info.st_mode & 0o077) and info.st_uid == os.getuid(),
                "COOPS_PY_PRIVATE", "Use an owned receiving directory with mode 0700.")
    return selected


@contextlib.contextmanager
def regular_file(path, mode="rb", *, private=True, create=False):
    path = canonical_path(path)
    flags = os.O_RDWR if "+" in mode else os.O_WRONLY if mode.startswith("w") else os.O_RDONLY
    flags |= getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)
    if create:
        flags |= os.O_CREAT | os.O_EXCL
    fd = os.open(path, flags, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode), "COOPS_PY_FILE", "Select an ordinary file.")
        if private and os.name != "nt":
            require(not (info.st_mode & 0o077) and info.st_uid == os.getuid(),
                    "COOPS_PY_PRIVATE", "Retained files and console credentials must be owned and mode 0600.")
        with os.fdopen(fd, mode) as handle:
            fd = None
            yield handle
    finally:
        if fd is not None:
            os.close(fd)


def sync_directory(path):
    if os.name != "nt":
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def atomic_json(path, value):
    path = canonical_path(path)
    if path.exists():
        with regular_file(path):
            pass
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with regular_file(temporary, "wb", create=True) as handle:
            handle.write(json_bytes(value))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def read_json(path, *, maximum=MAX_JSON, private=True):
    with regular_file(path, private=private) as handle:
        data = handle.read(maximum + 1)
    require(len(data) <= maximum, "COOPS_PY_SIZE", "The selected JSON exceeds its bounded reading limit.")
    return decode_json(data)


def file_identity(path, *, private=True, maximum=1024 * 1024 * 1024):
    size, h = 0, hashlib.sha256()
    with regular_file(path, private=private) as handle:
        before = os.fstat(handle.fileno())
        for part in iter(lambda: handle.read(BLOCK), b""):
            size += len(part)
            require(size <= maximum, "COOPS_PY_SIZE", "The complete selected file exceeds its native limit.")
            h.update(part)
        after = os.fstat(handle.fileno())
    require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) and size == before.st_size,
            "COOPS_PY_FILE_CHANGED", "The selected file changed while its original identity was being read.")
    return {"bytes": size, "sha256": h.hexdigest()}


class ConsoleSession:
    """Original HTTP API only. No redirects, proxies, provider calls or stored token."""
    def __init__(self, startup_file, *, timeout=90):
        startup = read_json(startup_file, maximum=65536)
        require(isinstance(startup, dict) and
                startup.get("schema") == "stellar-forge.coops-workspace-startup.v1" and
                startup.get("status") == "COOPS_READY",
                "COOPS_PY_STARTUP", "Select the current original console startup JSON.")
        try:
            url = urlsplit(startup["url"])
            port = url.port
        except (KeyError, TypeError, ValueError) as exc:
            raise ReceivingError("COOPS_PY_STARTUP", "The original startup address is invalid.") from exc
        require(url.scheme == "http" and url.hostname == "127.0.0.1" and port is not None and
                1 <= port <= 65535 and url.path in ("", "/") and not url.query and
                url.username is None and url.password is None and
                re.fullmatch(r"[A-Za-z0-9_-]{32,128}", url.fragment or ""),
                "COOPS_PY_STARTUP", "Use the private URL from the original loopback console.")
        require(isinstance(startup.get("workspaceId"), str) and startup["workspaceId"],
                "COOPS_PY_STARTUP", "The original startup record must identify its workspace.")
        self.origin = "http://127.0.0.1:" + str(port)
        self.port, self._token, self.timeout = port, url.fragment, timeout
        self.workspace_id = startup["workspaceId"]

    @contextlib.contextmanager
    def response(self, path, *, body=None):
        require(isinstance(path, str) and path.startswith("/api/") and
                not any(c in path for c in ("\r", "\n", "#")),
                "COOPS_PY_ROUTE", "Select an original console API route.")
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=self.timeout)
        try:
            headers = {"Authorization": "Bearer " + self._token, "Origin": self.origin,
                       "Accept": "application/json", "Connection": "close"}
            if body is not None:
                headers["Content-Type"] = "application/json"
            connection.request("POST" if body is not None else "GET", path, body=body, headers=headers)
            response = connection.getresponse()
            if response.status != 200:
                raw = response.read(MAX_JSON + 1)
                try:
                    error = decode_json(raw) if len(raw) <= MAX_JSON else {}
                except ReceivingError:
                    error = {}
                if not isinstance(error, dict):
                    error = {}
                message = error.get("message", "The original console request did not complete.")
                message = str(message).replace(self._token, "[private token]")
                raise ReceivingError(error.get("error", "COOPS_PY_HTTP"), message,
                                     status=response.status, operation_id=error.get("operationId"),
                                     detail={k: error[k] for k in ("currentRevision", "retryAt") if k in error})
            yield response
        except ReceivingError:
            raise
        except (OSError, http.client.HTTPException) as exc:
            raise ReceivingError("COOPS_PY_CONNECTION",
                                 "The original console response was interrupted. Reopen its startup record and resume the same receiving intent.") from exc
        finally:
            connection.close()

    def json(self, path, *, body=None):
        with self.response(path, body=body) as response:
            data = response.read(MAX_JSON + 1)
        require(len(data) <= MAX_JSON, "COOPS_PY_SIZE", "The original response exceeds the client JSON limit; retain the existing intent.")
        return decode_json(data)

    def schema(self):
        schema = self.json("/api/schema")
        require(isinstance(schema, dict) and
                schema.get("schema") == "stellar-forge.coops-workspace-schema.v1" and
                schema.get("workspaceId") == self.workspace_id,
                "COOPS_PY_WORKSPACE", "The running console does not match the selected original startup workspace.")
        return schema

    def download(self, path, destination, expected):
        """Resume by comparing the complete original stream against the retained prefix."""
        destination = canonical_path(destination)
        expected_size, expected_sha = expected.get("bytes"), expected.get("sha256")
        require(type(expected_size) is int and 0 <= expected_size <= 1024 * 1024 * 1024 and
                isinstance(expected_sha, str) and SHA.fullmatch(expected_sha),
                "COOPS_PY_RECEIPT", "Keep the exact native export byte count and SHA-256.")
        if destination.exists():
            require(file_identity(destination) == {"bytes": expected_size, "sha256": expected_sha},
                    "COOPS_PY_FILE_CHANGED", "An already received file differs from its original receipt.")
            return {"path": str(destination), "bytes": expected_size, "sha256": expected_sha}
        partial = destination.with_name(destination.name + ".part")
        existed = partial.exists()
        with regular_file(partial, "r+b" if existed else "w+b", create=not existed) as output:
            prefix = os.fstat(output.fileno()).st_size
            require(prefix <= expected_size, "COOPS_PY_PARTIAL", "The retained partial file is longer than the original export.")
            count, h = 0, hashlib.sha256()
            try:
                with self.response(path) as response:
                    length = response.getheader("Content-Length")
                    require(length is None or length.isdigit() and int(length) == expected_size,
                            "COOPS_PY_RECEIPT", "The original server changed the selected file size.")
                    while True:
                        part = response.read(min(BLOCK, expected_size - count + 1))
                        if not part:
                            break
                        require(count + len(part) <= expected_size,
                                "COOPS_PY_RECEIPT", "The selected export grew beyond its pinned size.")
                        old_length = min(len(part), max(0, prefix - count))
                        if old_length:
                            output.seek(count)
                            require(output.read(old_length) == part[:old_length],
                                    "COOPS_PY_PARTIAL", "The retained prefix differs from the original export. Preserve it for comparison before replacing this partial file.")
                        if old_length < len(part):
                            output.seek(count + old_length)
                            output.write(part[old_length:])
                        count += len(part)
                        h.update(part)
                require(count == expected_size and h.hexdigest() == expected_sha,
                        "COOPS_PY_RECEIPT", "The complete downloaded file does not match its original byte/hash receipt.")
            finally:
                output.flush()
                os.fsync(output.fileno())
        os.replace(partial, destination)
        sync_directory(destination.parent)
        return {"path": str(destination), "bytes": count, "sha256": expected_sha}
