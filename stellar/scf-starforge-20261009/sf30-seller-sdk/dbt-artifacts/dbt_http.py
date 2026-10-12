"""Private loopback owner, resumable intake and durable native jobs. MIT."""
from __future__ import annotations
import base64
import concurrent.futures
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import signal
import threading
import uuid
from urllib.parse import urlsplit, parse_qs, unquote
from dbt_core import Project
from dbt_store import ProjectError, require, identity, sha, stamp, text, hash_id, json_bytes, create_file, regular_open, private_dir, fsync_dir
from dbt_portable import file_digest
from operations import invoke, READ_ACTIONS, WRITE_ACTIONS
from browser_state import BrowserDrafts

STARTUP = "stellar-forge.dbt-workspace-startup.v1"
OP = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$")
ROOT = Path(__file__).parent


def atomic_json(path: Path, value):
    temporary = path.with_name("." + path.name + "." + uuid.uuid4().hex)
    create_file(temporary, json_bytes(value))
    os.replace(temporary, path)
    fsync_dir(path.parent)


def operation_id(value):
    require(isinstance(value, str) and OP.fullmatch(value), "INVALID_OPERATION_ID")
    return value


def binding(project: Project):
    value = {"schema": "stellar-forge.dbt-project-binding.v1", "directory": str(project.root), "projectId": project.info["id"]}
    return {**value, "sha256": identity(value)}


class Application:
    def __init__(self, project, token_file=None, receive_root=None, max_upload=8 * 1024**3):
        self.project = project
        self.directory = private_dir(project.root / "http", create=True)
        self.uploads = private_dir(self.directory / "uploads", create=True)
        self.jobs = private_dir(self.directory / "jobs", create=True)
        self.exports = private_dir(self.directory / "exports", create=True)
        self.receive_root = private_dir(Path(receive_root).absolute() if receive_root else project.root.parent / "dbt-received", create=True)
        require(type(max_upload) is int and max_upload > 0, "INVALID_UPLOAD_LIMIT")
        self.max_upload = max_upload
        self.token_path = Path(token_file).absolute() if token_file else self.directory / "token"
        if not self.token_path.exists():
            require(token_file is None, "TOKEN_FILE_MISSING")
            create_file(self.token_path, (secrets.token_urlsafe(32) + "\n").encode())
        with regular_open(self.token_path) as src:
            mode = os.fstat(src.fileno()).st_mode
            require(os.name != "posix" or mode & 0o077 == 0, "TOKEN_FILE_NOT_PRIVATE")
            self.token = src.read(256).decode().strip()
        require(len(self.token) >= 32, "TOKEN_TOO_SHORT")
        self.lock_fd = os.open(self.directory / "owner.lock", os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
        if os.name == "posix":
            import fcntl
            try:
                fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                os.close(self.lock_fd)
                raise ProjectError("APPLICATION_ALREADY_RUNNING", "Rejoin the original application owner.", 409) from exc
        self.mutex = threading.RLock()
        self.pool = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="dbt-original-job")
        self.active = {}
        self.events = {}
        self.instance = str(uuid.uuid4())
        self.cookie = "dbt_session_" + identity(str(project.root))[:24]
        self.children = {}
        self.started = stamp()
        self.ready = None
        self.closing = False
        self.browser_drafts = BrowserDrafts(self)
        # An interrupted process cannot keep a job falsely marked as running.
        for path in self.jobs.glob("*.json"):
            value = json.loads(path.read_bytes())
            if value.get("state") in ("queued", "running"):
                value.update(state="interrupted", updated_at=stamp())
                atomic_json(path, value)

    def authenticate(self, headers):
        authorization = headers.get("Authorization", "")
        candidate = authorization[7:] if authorization.startswith("Bearer ") else ""
        if not candidate:
            for part in headers.get("Cookie", "").split(";"):
                key, sep, value = part.strip().partition("=")
                if key == self.cookie and sep:
                    candidate = value
        return hmac.compare_digest(candidate.encode(), self.token.encode())

    def upload_status(self, uid):
        path = self.uploads / (operation_id(uid) + ".json")
        require(path.exists(), "UPLOAD_NOT_FOUND", status=404)
        value = json.loads(path.read_bytes())
        if value["state"] != "complete":
            partial = self.uploads / (uid + ".part")
            if partial.exists():
                # Bytes past the last fsynced recorded offset are uncommitted.
                with open(partial, "r+b") as out:
                    if os.fstat(out.fileno()).st_size > value["offset"]:
                        out.truncate(value["offset"])
        return value

    def start_upload(self, value):
        require(isinstance(value, dict) and set(value) <= {"id", "name", "bytes", "expected_sha"}, "INVALID_UPLOAD")
        uid = operation_id(value.get("id"))
        text(value.get("name"), "filename", 256)
        expected = hash_id(value.get("expected_sha"))
        size = value.get("bytes")
        require(type(size) is int and 0 <= size <= self.max_upload, "UPLOAD_LIMIT", status=413)
        payload = {"id": uid, "name": value["name"], "bytes": size, "expected_sha": expected}
        with self.mutex:
            path = self.uploads / (uid + ".json")
            if path.exists():
                old = self.upload_status(uid)
                require(old["input_sha"] == identity(payload), "UPLOAD_ID_REUSED", status=409)
                return old
            value = {**payload, "input_sha": identity(payload), "offset": 0, "state": "uploading", "created_at": stamp()}
            create_file(self.uploads / (uid + ".part"), b"")
            create_file(path, json_bytes(value))
            return self.append_upload(uid, 0, b"") if size == 0 else value

    def append_upload(self, uid, offset, body):
        with self.mutex:
            record = self.upload_status(uid)
            require(type(offset) is int and 0 <= offset <= record["offset"], "UPLOAD_OFFSET_CONFLICT", status=409)
            require(offset + len(body) <= record["bytes"], "UPLOAD_LENGTH_EXCEEDED")
            path = self.project.object_path(record["expected_sha"]) if record["state"] == "complete" else self.uploads / (uid + ".part")
            if offset < record["offset"] or record["state"] == "complete":
                require(offset + len(body) <= record["offset"], "UPLOAD_OVERLAP", status=409)
                with regular_open(path) as src:
                    src.seek(offset)
                    require(src.read(len(body)) == body, "UPLOAD_REPLAY_CHANGED", status=409)
                return record
            with open(path, "r+b") as dst:
                dst.seek(offset)
                dst.write(body)
                dst.flush()
                os.fsync(dst.fileno())
            record["offset"] += len(body)
            record["updated_at"] = stamp()
            if record["offset"] == record["bytes"]:
                actual = file_digest(path)
                if actual["sha256"] != record["expected_sha"]:
                    record.update(state="digest-mismatch", offset=0)
                    with open(path, "wb"):
                        pass
                    atomic_json(self.uploads / (uid + ".json"), record)
                    raise ProjectError("UPLOAD_DIGEST_MISMATCH", "Resend the original complete file under the same upload ID.", 409)
                result = self.project.put_file(path, record["expected_sha"])
                result["name"] = record["name"]
                record.update(state="complete", object=result)
                # Keep the committed journal until after final CAS publication.
            atomic_json(self.uploads / (uid + ".json"), record)
            if record["state"] == "complete":
                path.unlink(missing_ok=True)
            return record

    def prepare_input(self, action, value, uid):
        """HTTP/MCP mutations reference retained objects, never arbitrary paths."""
        value = dict(value)
        if action == "import":
            require(set(value) <= {"sha256", "name"} and "sha256" in value, "INVALID_IMPORT")
            digest = hash_id(value.pop("sha256"))
            value.update(file=str(self.project.object_path(digest)), expected_sha=digest)
        elif action == "result.bind":
            for param in ("file", "query_file", "provenance_file"):
                value[param] = str(self.project.object_path(hash_id(value[param])))
        elif action == "export":
            require(not value, "INVALID_EXPORT_INPUT")
            path = self.exports / (uid + ".zip")
            value["output"] = str(path)
            if path.exists():
                # The path is selected by this durable original job, not supplied
                # by a browser. Lost completion reuses its exact complete archive.
                value["expected_archive_sha"] = file_digest(path)["sha256"]
        elif action == "report":
            require("output" not in value, "OUTPUT_SELECTED_BY_OWNER")
        elif action == "receive":
            require(set(value) == {"sha256", "name"}, "INVALID_RECEIVING_INPUT")
            name = operation_id(value["name"])
            digest = hash_id(value["sha256"])
            value = {"archive_file": str(self.project.object_path(digest)), "expected_sha": digest,
                     "destination": str(self.receive_root / name)}
        if action in ("edition.create", "review.save", "result.bind"):
            require("request_id" not in value or value["request_id"] == uid, "REQUEST_ID_MISMATCH")
            value["request_id"] = uid
        return value

    def job(self, uid):
        path = self.jobs / (operation_id(uid) + ".json")
        require(path.exists(), "JOB_NOT_FOUND", status=404)
        return json.loads(path.read_bytes())

    def start_job(self, value):
        require(isinstance(value, dict) and set(value) == {"id", "action", "input"}, "INVALID_JOB")
        uid = operation_id(value["id"])
        require(value["action"] in WRITE_ACTIONS and isinstance(value["input"], dict), "INVALID_JOB_ACTION")
        payload = {"action": value["action"], "input": value["input"]}
        with self.mutex:
            require(not self.closing, "APPLICATION_DRAINING", status=409)
            path = self.jobs / (uid + ".json")
            if path.exists():
                record = self.job(uid)
                require(record["input_sha"] == identity(payload), "JOB_ID_REUSED", status=409)
                if record["state"] == "complete" or uid in self.active:
                    return record
            else:
                record = {"id": uid, **payload, "input_sha": identity(payload), "created_at": stamp()}
            record.update(state="queued", updated_at=stamp())
            record.pop("error", None)
            atomic_json(path, record)
            event = threading.Event()
            self.events[uid] = event
            self.active[uid] = self.pool.submit(self._run, record, event)
            return record

    def _run(self, record, event):
        uid = record["id"]
        path = self.jobs / (uid + ".json")
        try:
            with self.mutex:
                record.update(state="running", updated_at=stamp())
                atomic_json(path, record)
            require(not event.is_set(), "CANCELLED", status=409)
            value = self.prepare_input(record["action"], record["input"], uid)
            result = invoke(self.project, record["action"], value, cancel=event)
            record.update(state="complete", result=result, updated_at=stamp())
        except Exception as exc:
            record.update(state="cancelled" if getattr(exc, "code", None) == "CANCELLED" else "failed",
                          error={"code": getattr(exc, "code", "OPERATION_FAILED"), "message": str(exc)}, updated_at=stamp())
        finally:
            with self.mutex:
                atomic_json(path, record)
                self.active.pop(uid, None)
                self.events.pop(uid, None)
        return record

    def cancel(self, uid):
        with self.mutex:
            value = self.job(uid)
            if uid in self.events:
                self.events[uid].set()
                value["cancellation_requested"] = True
            return value

    def open_received(self, name):
        name = operation_id(name)
        destination = self.receive_root / name
        require((destination / "receiving.json").is_file(), "RECEIVED_PROJECT_NOT_FOUND", status=404)
        with self.mutex:
            require(not self.closing, "APPLICATION_DRAINING", status=409)
            if name not in self.children:
                server = start_server(Project(destination), receive_root=str(self.receive_root))
                thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True)
                thread.start()
                self.children[name] = server, thread
            return self.children[name][0].application

    def close(self):
        with self.mutex:
            self.closing = True
        # The original operation owns its completion. Shutdown drains it instead
        # of killing an export/receive halfway through a final publication.
        self.pool.shutdown(wait=True, cancel_futures=False)
        for server, thread in self.children.values():
            server.shutdown()
            thread.join()
            server.server_close()
            server.application.close()
        os.close(self.lock_fd)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "StarforgeDbt/1"

    @property
    def app(self):
        return self.server.application

    def log_message(self, *args):
        pass  # No authorization headers, raw request URLs, query or source bodies.

    def headers_out(self, code, length, mime, extra=None):
        self.send_response(code)
        self.send_header("Content-Length", str(length))
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()

    def reply(self, value, code=200, extra=None):
        body = json_bytes(value)
        self.headers_out(code, len(body), "application/json; charset=utf-8", extra)
        if self.command != "HEAD":
            self.wfile.write(body)

    def body(self, maximum=2 * 1024 * 1024):
        require("Transfer-Encoding" not in self.headers, "CONTENT_LENGTH_REQUIRED", status=411)
        lengths = self.headers.get_all("Content-Length", [])
        require(len(lengths) == 1 and lengths[0].isdigit(), "CONTENT_LENGTH_REQUIRED", status=411)
        length = int(lengths[0])
        require(length <= maximum, "REQUEST_TOO_LARGE", status=413)
        self.connection.settimeout(60)
        result = self.rfile.read(length)
        require(len(result) == length, "INCOMPLETE_REQUEST", status=400)
        return result

    def json_body(self):
        value = json.loads(self.body())
        require(isinstance(value, dict), "OBJECT_INPUT_REQUIRED")
        return value

    def check_boundary(self):
        port = self.server.server_address[1]
        expected = "127.0.0.1:" + str(port)
        require(self.headers.get_all("Host", []) == [expected], "HOST_MISMATCH", status=403)
        origin = self.headers.get("Origin")
        require(origin is None or origin == "http://" + expected, "ORIGIN_MISMATCH", status=403)
        require(self.headers.get("Sec-Fetch-Site") not in ("cross-site",), "CROSS_SITE_REQUEST", status=403)

    def route(self):
        self.check_boundary()
        split = urlsplit(self.path)
        path, query = split.path, parse_qs(split.query, strict_parsing=False)
        if path == "/api/launch" and self.command in ("GET", "HEAD"):
            return self.reply(self.app.ready)
        if path == "/api/session" and self.command == "POST":
            token = self.json_body().get("token", "")
            require(isinstance(token, str) and hmac.compare_digest(token.encode(), self.app.token.encode()), "UNAUTHORIZED", status=401)
            return self.reply({"authenticated": True}, extra={"Set-Cookie": self.app.cookie + "=" + self.app.token + "; HttpOnly; SameSite=Strict; Path=/"})
        if path in ("/", "/app.js", "/sha256.js", "/recovery.js", "/style.css") and self.command in ("GET", "HEAD"):
            name = "index.html" if path == "/" else path[1:]
            body = (ROOT / "ui" / name).read_bytes()
            mime = {"index.html": "text/html; charset=utf-8", "style.css": "text/css; charset=utf-8"}.get(name, "text/javascript; charset=utf-8")
            self.headers_out(200, len(body), mime)
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        require(self.app.authenticate(self.headers), "UNAUTHORIZED", status=401)
        if path == "/api/browser" and self.command == "GET":
            return self.reply(self.app.browser_drafts.list())
        if path.startswith("/api/browser/"):
            uid = operation_id(path.rsplit("/", 1)[1])
            if self.command == "GET":
                return self.reply(self.app.browser_drafts.get(uid))
            if self.command == "PUT":
                return self.reply(self.app.browser_drafts.save(uid, self.json_body()))
        if path.startswith("/api/objects/") and self.command in ("GET", "HEAD"):
            digest = hash_id(path.rsplit("/", 1)[1])
            descriptor = self.app.project.verify_object(digest)
            start, end, code = 0, descriptor["bytes"] - 1, 200
            if self.headers.get("Range"):
                match = re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers["Range"])
                require(match is not None, "INVALID_RANGE", status=416)
                start = int(match[1]); end = min(end, int(match[2]) if match[2] else end)
                require(0 <= start <= end < descriptor["bytes"], "INVALID_RANGE", status=416)
                code = 206
            name = query.get("name", ["dbt-source.bin"])[0]
            name = re.sub(r"[^A-Za-z0-9._-]", "_", name)[:128] or "dbt-source.bin"
            extra = {"ETag": '"' + digest + '"', "Accept-Ranges": "bytes", "Content-Disposition": 'attachment; filename="' + name + '"'}
            if code == 206:
                extra["Content-Range"] = f"bytes {start}-{end}/{descriptor['bytes']}"
            self.headers_out(code, end - start + 1, "application/octet-stream", extra)
            if self.command != "HEAD":
                with regular_open(self.app.project.object_path(digest)) as src:
                    src.seek(start)
                    remaining = end - start + 1
                    while remaining:
                        block = src.read(min(1024 * 1024, remaining))
                        require(block, "OBJECT_TRUNCATED")
                        self.wfile.write(block); remaining -= len(block)
            return
        if path == "/api/received/open" and self.command == "POST":
            value = self.json_body()
            require(set(value) == {"name"}, "INVALID_RECEIVED_SELECTION")
            child = self.app.open_received(value["name"])
            return self.reply(child.ready, extra={"Set-Cookie": child.cookie + "=" + child.token + "; HttpOnly; SameSite=Strict; Path=/"})
        if path == "/api/read" and self.command == "POST":
            value = self.json_body()
            require(set(value) == {"action", "input"} and value["action"] in READ_ACTIONS, "READ_ACTION_REQUIRED")
            return self.reply(invoke(self.app.project, value["action"], value["input"]))
        if path == "/api/uploads/start" and self.command == "POST":
            return self.reply(self.app.start_upload(self.json_body()), 201)
        if path.startswith("/api/uploads/"):
            uid = operation_id(path.rsplit("/", 1)[1])
            if self.command == "GET":
                with self.app.mutex:
                    return self.reply(self.app.upload_status(uid))
            if self.command == "PUT":
                offset = int(query.get("offset", ["-1"])[0])
                return self.reply(self.app.append_upload(uid, offset, self.body(8 * 1024 * 1024)))
        if path == "/api/jobs" and self.command == "GET":
            return self.reply([json.loads(p.read_bytes()) for p in sorted(self.app.jobs.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)])
        if path == "/api/jobs" and self.command == "POST":
            return self.reply(self.app.start_job(self.json_body()), 202)
        if path.startswith("/api/jobs/"):
            parts = path.split("/")
            uid = operation_id(parts[3])
            if len(parts) == 4 and self.command == "GET":
                return self.reply(self.app.job(uid))
            if len(parts) == 5 and parts[4] == "cancel" and self.command == "POST":
                self.json_body()
                return self.reply(self.app.cancel(uid))
        raise ProjectError("NOT_FOUND", status=404)

    def handle_request(self):
        try:
            self.route()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            self.close_connection = True
            self.reply({"error": getattr(exc, "code", "INVALID_REQUEST"), "message": str(exc)}, getattr(exc, "status", 400))

    do_GET = do_HEAD = do_POST = do_PUT = handle_request


def start_server(project, *, port=0, token_file=None, receive_root=None, expected_binding=None, max_upload=8 * 1024**3):
    require(type(port) is int and 0 <= port <= 65535, "INVALID_PORT")
    selected = binding(project)
    require(expected_binding is None or expected_binding == selected["sha256"], "PROJECT_BINDING_CHANGED", status=409)
    app = Application(project, token_file, receive_root, max_upload)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except Exception:
        app.close()
        raise
    server.application = app
    app.ready = {"schema": STARTUP, "state": "LISTENING", "url": f"http://127.0.0.1:{server.server_address[1]}/",
                 "binding": selected, "instanceId": app.instance, "startedAt": app.started,
                 "tokenFile": str(app.token_path), "receiveRoot": str(app.receive_root)}
    return server


def serve(project, **options):
    server = start_server(project, **options)
    import sys
    print(json.dumps(server.application.ready, separators=(",", ":")), flush=True)
    stopped = threading.Event()
    def stop(*_):
        if not stopped.is_set():
            stopped.set()
            threading.Thread(target=server.shutdown, daemon=True).start()
    previous = {}
    for sig in (signal.SIGTERM, signal.SIGINT):
        previous[sig] = signal.signal(sig, stop)
    try:
        server.serve_forever(poll_interval=0.1)
    finally:
        server.server_close()
        server.application.close()
        for sig, value in previous.items():
            signal.signal(sig, value)
    return 0
