#!/usr/bin/env python3
"""Retain real public IATI Solr replies for the unmodified Zimmerman DQA client."""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import signal
import socket
import stat
import ssl
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit

SCHEMA = "commons.iati.dqa.public-solr.v1"
UPSTREAM = "https://datastore.iati.cloud/api/v2/activity/"
HEALTH_QUERY = "q=*%3A*&rows=0&fl=iati-identifier&wt=json"
ENGINE_COMMIT = "61a5e02420b936a39ebaf79dea7212fc0ce36683"
PYSOLR_COMMIT = "9243537cb34c69c4325c61f70732b64a4a1a8f7e"
HOP_HEADERS = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
               "te", "trailer", "transfer-encoding", "upgrade"}
SAFE_REQUEST_HEADERS = {"accept", "content-type", "user-agent"}

def utc() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{time.time_ns() // 1_000_000 % 1000:03d}Z"

def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def encoded(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()

def sync_dir(directory: Path) -> None:
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def write_new(file: Path, value: bytes) -> None:
    """A completed name is published once, after the complete bytes are synced."""
    temporary = file.with_name(file.name + "." + uuid.uuid4().hex + ".partial")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, file, follow_symlinks=False)
        except FileExistsError:
            retained = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(retained, "rb") as stream:
                if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode) or stream.read(len(value) + 1) != value:
                    raise ValueError("Different retained bytes already exist: " + str(file))
        sync_dir(file.parent)
    finally:
        temporary.unlink(missing_ok=True)

def load_json(file: Path, limit: int = 2 * 1024 * 1024):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= limit:
            raise ValueError("Choose a complete JSON file within the declared size limit")
        body = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
        if (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns) != (
                after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise ValueError("The original JSON file changed while reading")
    return json.loads(body)

def private_directory(value: str | Path) -> Path:
    candidate = Path(value).absolute()
    candidate.mkdir(parents=True, exist_ok=True, mode=0o700)
    if candidate.resolve() != candidate or candidate.is_symlink() or candidate.stat().st_mode & 0o077:
        raise ValueError("Use a canonical private directory: " + str(candidate))
    return candidate

def checked_profile(value: dict) -> dict:
    allowed = {"schema", "listen_host", "listen_port", "upstream_url", "timeout_seconds",
               "request_limit_bytes", "response_limit_bytes"}
    if not isinstance(value, dict) or set(value) - allowed or value.get("schema") != SCHEMA:
        raise ValueError("Select the documented public Solr transport profile")
    result = {
        "schema": SCHEMA, "listen_host": value.get("listen_host", "127.0.0.1"),
        "listen_port": value.get("listen_port", 18765),
        "upstream_url": value.get("upstream_url", UPSTREAM),
        "timeout_seconds": value.get("timeout_seconds", 8),
        "request_limit_bytes": value.get("request_limit_bytes", 4 * 1024 * 1024),
        "response_limit_bytes": value.get("response_limit_bytes", 64 * 1024 * 1024),
    }
    if result["listen_host"] != "127.0.0.1" or result["upstream_url"] != UPSTREAM:
        raise ValueError("This profile binds loopback and the documented public activity endpoint")
    for name, low, high in [("listen_port", 1, 65535),
                            ("request_limit_bytes", 1, 16 * 1024 * 1024),
                            ("response_limit_bytes", 1024, 512 * 1024 * 1024)]:
        if type(result[name]) is not int or not low <= result[name] <= high:
            raise ValueError("Invalid " + name)
    if isinstance(result["timeout_seconds"], bool) or not isinstance(result["timeout_seconds"], (int, float)) \
            or not 0 < result["timeout_seconds"] <= 9:
        raise ValueError("The upstream timeout must be positive and below the original ten-second DQA timeout")
    return result

def solr_summary(file: Path) -> dict:
    """Observation only: the forwarded response is never re-serialized."""
    try:
        with file.open("rb") as stream:
            value = json.load(stream)
        response = value.get("response")
        header = value.get("responseHeader", {})
        if not isinstance(response, dict) or not isinstance(response.get("docs"), list):
            return {"parsed": True, "solr_response": False, "header_status": header.get("status")}
        return {"parsed": True, "solr_response": True, "header_status": header.get("status"),
                "num_found": response.get("numFound"), "num_found_exact": response.get("numFoundExact"),
                "start": response.get("start"), "returned_docs": len(response["docs"]),
                "partial_results": header.get("partialResults"),
                "next_cursor_mark": value.get("nextCursorMark")}
    except (UnicodeError, ValueError, TypeError, AttributeError) as error:
        return {"parsed": False, "error": type(error).__name__}


def file_observation(root: Path, file: Path) -> dict:
    """Hash an ordinary, stable original without loading full responses into memory."""
    if file.parent.resolve() != file.parent:
        raise ValueError("Use original canonical source paths")
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("Selected source evidence must be an ordinary file")
        digest, count = hashlib.sha256(), 0
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
            count += len(chunk)
        after = os.fstat(stream.fileno())
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
                after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) or count != before.st_size:
            raise ValueError("Source evidence changed during its original read")
    return {"path": str(file.relative_to(root)), "bytes": count, "sha256": digest.hexdigest()}

def close_exchange(folder: Path) -> None:
    selected = sorted(file for file in folder.iterdir() if file.name != "closed.json")
    files = [file_observation(folder, file) for file in selected]
    write_new(folder / "closed.json", encoded({
        "schema": "commons.iati.dqa.solr-closed-exchange.v1", "closed_at": utc(), "files": files
    }))

class Journal:
    def __init__(self, directory: Path, profile: dict):
        self.directory = private_directory(directory)
        self.lock = os.open(self.directory / "transport.lock",
                            os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            os.close(self.lock)
            raise RuntimeError("The original transport journal already has a live owner")
        self.exchanges = self.directory / "exchanges"
        self.exchanges.mkdir(exist_ok=True, mode=0o700)
        self.profile = profile
        self.identity = {
            "schema": "commons.iati.dqa.public-solr-journal.v1",
            "profile": profile, "engine_commit": ENGINE_COMMIT,
            "pysolr_version": "3.11.0", "pysolr_commit": PYSOLR_COMMIT,
            "health_query": HEALTH_QUERY,
            "transport_sha256": sha(Path(__file__).read_bytes()),
        }
        write_new(self.directory / "transport.json", encoded(self.identity))

    def begin(self, method: str, target: str, kind: str, query: str, headers: list, body: bytes) -> Path:
        folder = self.exchanges / ("exchange-" + str(time.time_ns()) + "-" + uuid.uuid4().hex[:12])
        folder.mkdir(mode=0o700)
        write_new(folder / "request.body", body)
        write_new(folder / "request.json", encoded({
            "schema": "commons.iati.dqa.solr-request.v1", "started_at": utc(),
            "route": kind, "method": method, "incoming_target": target,
            "upstream_url": UPSTREAM + ("?" + query if query else ""),
            "forwarded_headers": headers, "request_body": "request.body",
            "request_bytes": len(body), "request_sha256": sha(body),
        }))
        return folder

    def close(self):
        os.close(self.lock)

class Server(HTTPServer):
    allow_reuse_address = True
    request_queue_size = 8

    def __init__(self, profile: dict, journal: Journal):
        self.profile, self.journal = profile, journal
        super().__init__((profile["listen_host"], profile["listen_port"]), Handler)

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        # Full source requests belong in the private native journal, not stderr.
        pass

    def do_GET(self):
        self.relay()

    def do_POST(self):
        self.relay()

    def do_PUT(self):
        self.local_error(405, "This transport only exposes original query and health reads")

    do_PATCH = do_DELETE = do_PUT

    def local_error(self, status: int, message: str):
        body = encoded({"error": {"source": "local-public-solr-transport", "message": message}})
        self.close_connection = True
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def relay(self):
        folder = None
        connection = None
        started = time.monotonic()
        try:
            self.connection.settimeout(10)
            if self.client_address[0] != "127.0.0.1":
                return self.local_error(403, "Use the original local upstream service")
            if self.headers.get("Authorization") or self.headers.get("Cookie"):
                return self.local_error(400, "Public Solr queries do not accept credentials or cookies")
            if self.headers.get("Transfer-Encoding"):
                return self.local_error(411, "The original client supplies Content-Length")
            values = self.headers.get_all("Content-Length") or []
            if len(values) > 1 or (values and not values[0].isdigit()):
                return self.local_error(400, "Supply one valid Content-Length")
            length = int(values[0]) if values else 0
            if self.command == "POST" and not values:
                return self.local_error(411, "The original form request needs Content-Length")
            if length > self.server.profile["request_limit_bytes"]:
                return self.local_error(413, "The original query exceeds its declared request limit")
            target = urlsplit(self.path)
            if target.scheme or target.netloc or target.fragment:
                return self.local_error(400, "Use an origin-form local Solr request")
            if target.path in ("/solr/activity/admin/ping", "/solr/activity/admin/ping/"):
                if self.command != "GET" or length or target.query:
                    return self.local_error(400, "The pinned DQA startup uses an empty GET ping")
                kind, query = "native-public-query-health", HEALTH_QUERY
            elif target.path in ("/solr/activity/select", "/solr/activity/select/"):
                kind, query = "unchanged-native-search", target.query
                if self.command == "GET" and length:
                    return self.local_error(400, "The original GET search has no body")
                if self.command == "POST" and not self.headers.get("Content-Type", "").lower().startswith(
                        "application/x-www-form-urlencoded"):
                    return self.local_error(415, "Use the pinned client's original form search")
            else:
                return self.local_error(404, "Only the selected activity search and startup ping are exposed")
            body = self.rfile.read(length) if length else b""
            if len(body) != length:
                return self.local_error(400, "The original request body was interrupted")
            headers = [(name, value) for name, value in self.headers.items()
                       if name.lower() in SAFE_REQUEST_HEADERS]
            # Avoid changing compressed wire bytes into a reconstructed body.
            headers.append(("Accept-Encoding", "identity"))
            folder = self.server.journal.begin(self.command, self.path, kind, query, headers, body)
            destination = "/api/v2/activity/" + ("?" + query if query else "")
            connection = http.client.HTTPSConnection(
                "datastore.iati.cloud", timeout=self.server.profile["timeout_seconds"],
                context=ssl.create_default_context())
            connection.request(self.command, destination, body=body if self.command == "POST" else None,
                               headers=dict(headers))
            response = connection.getresponse()
            response_headers = response.getheaders()
            write_new(folder / "upstream-response-headers.json", encoded({
                "received_at": utc(), "status": response.status, "reason": response.reason,
                "http_version": response.version, "headers": response_headers,
            }))
            partial = folder / "response.body.partial"
            fd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            digest, size = hashlib.sha256(), 0
            with os.fdopen(fd, "wb") as stream:
                while True:
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > self.server.profile["response_limit_bytes"]:
                        raise ValueError("The native response exceeds the declared complete-response limit")
                    digest.update(chunk)
                    stream.write(chunk)
                stream.flush()
                os.fsync(stream.fileno())
            announced = response.getheader("Content-Length")
            if announced is not None and (not announced.isdigit() or int(announced) != size):
                raise ValueError("The original response Content-Length did not match its complete body")
            os.rename(partial, folder / "response.body")
            sync_dir(folder)
            metadata = {
                "schema": "commons.iati.dqa.solr-response.v1", "completed_at": utc(),
                "status": response.status, "reason": response.reason, "headers": response_headers,
                "bytes": size, "sha256": digest.hexdigest(), "body": "response.body",
                "elapsed_seconds": round(time.monotonic() - started, 6), "complete_http": True,
                "solr": solr_summary(folder / "response.body"),
            }
            write_new(folder / "response.json", encoded(metadata))
            excluded = set(HOP_HEADERS) | {"content-length", "location", "set-cookie"}
            for name, value in response_headers:
                if name.lower() == "connection":
                    excluded.update(part.strip().lower() for part in value.split(","))
            self.close_connection = True
            self.send_response_only(response.status, response.reason)
            for name, value in response_headers:
                if name.lower() not in excluded:
                    self.send_header(name, value)
            self.send_header("Content-Length", str(size))
            self.send_header("Connection", "close")
            self.end_headers()
            with (folder / "response.body").open("rb") as stream:
                while chunk := stream.read(64 * 1024):
                    self.wfile.write(chunk)
            self.wfile.flush()
            write_new(folder / "delivery.json", encoded({"completed_at": utc(), "bytes": size}))
        except (BrokenPipeError, ConnectionResetError):
            if folder:
                with contextlib.suppress(Exception):
                    write_new(folder / "client-disconnected.json", encoded({"at": utc()}))
        except BaseException as error:
            if folder:
                with contextlib.suppress(Exception):
                    write_new(folder / "error.json", encoded({
                        "at": utc(), "type": type(error).__name__, "message": str(error),
                        "complete_http": False,
                    }))
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            with contextlib.suppress(Exception):
                self.local_error(502, "The actual source request did not complete; inspect the original journal")
        finally:
            if connection:
                connection.close()
            if folder:
                close_exchange(folder)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--journal", required=True)
    args = parser.parse_args()
    profile = checked_profile(load_json(Path(args.profile)))
    journal = Journal(Path(args.journal), profile)
    server = None
    try:
        server = Server(profile, journal)
        owner = {"schema": "commons.iati.dqa.public-solr-owner.v1", "started_at": utc(),
                 "pid": os.getpid(), "hostname": socket.gethostname(),
                 "address": server.server_address, "journal": str(journal.directory),
                 "transport_identity_sha256": sha(encoded(journal.identity))}
        owners = journal.directory / "owners"
        owners.mkdir(exist_ok=True, mode=0o700)
        write_new(owners / (str(time.time_ns()) + ".json"), encoded(owner))
        print(json.dumps({"state": "LISTENING", "solr_url": f"http://127.0.0.1:{profile['listen_port']}/solr/activity",
                          "journal": str(journal.directory)}), flush=True)
        def interrupted(_signum, _frame):
            raise KeyboardInterrupt()
        signal.signal(signal.SIGTERM, interrupted)
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print(json.dumps({"state": "STOPPED", "journal": str(journal.directory)}), flush=True)
    finally:
        if server:
            server.server_close()
        journal.close()

if __name__ == "__main__":
    main()
