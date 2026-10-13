#!/usr/bin/env python3
"""Private multi-site service operations using the original assessment engine."""
from __future__ import annotations
import argparse
import hashlib
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import sqlite3
import threading
import time
from urllib.parse import parse_qs, quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parent
COOKIE = "govhub_service_session"
MAX_BODY = 180 * 1024 * 1024


def open_store(args, create=False):
    from govhub import open_workspace
    return open_workspace(args.workspace, args.source_root, args.assessment_core, create=create,
                          name=getattr(args, "name", "GovHub cutover operations"),
                          mode=getattr(args, "mode", "SUPPLIED"))


def add_paths(parser):
    parser.add_argument("--workspace", type=Path, required=True, help="Absolute private workspace directory.")
    parser.add_argument("--source-root", type=Path, required=True, help="Absolute local supplied-input directory.")
    parser.add_argument("--assessment-core", type=Path,
                        default=Path(os.environ.get("GOVHUB_ASSESSMENT_CORE", ROOT / "vendor" / "assessment-core")),
                        help="Original unchanged assessment workspace.py and schema.py directory.")


class HttpProblem(Exception):
    def __init__(self, message, status=422, fields=None):
        super().__init__(message)
        self.status, self.fields = status, fields or {}


class Sessions:
    """Opaque session credentials stay hashed in the same private SQLite store."""
    def __init__(self, workspace):
        self.workspace = workspace
        self.lock = threading.Lock()
        self.failures = {}
        with workspace.connect(write=True) as db:
            db.execute("CREATE TABLE IF NOT EXISTS govhub_http_sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL,expires REAL NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS govhub_disabled_users(username TEXT PRIMARY KEY,disabled INTEGER NOT NULL)")

    def disabled(self, name):
        with self.workspace.connect() as db:
            row = db.execute("SELECT disabled FROM govhub_disabled_users WHERE username=?", (name,)).fetchone()
        return bool(row and row["disabled"])

    def login_allowed(self, address):
        with self.lock:
            at = time.monotonic()
            recent = [x for x in self.failures.get(address, []) if at - x < 60]
            self.failures = {k: v for k, v in self.failures.items() if v and at - v[-1] < 60}
            if len(recent) >= 12:
                raise HttpProblem("Wait one minute before another sign-in attempt.", 429)
            self.failures[address] = recent + [at]

    def create(self, name):
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode()).hexdigest()
        with self.workspace.connect(write=True) as db:
            db.execute("DELETE FROM govhub_http_sessions WHERE expires<=?", (time.time(),))
            db.execute("INSERT INTO govhub_http_sessions VALUES(?,?,?)", (digest, name, time.time() + 28800))
        return token

    def lookup(self, token):
        if not token:
            return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        with self.workspace.connect() as db:
            row = db.execute("SELECT username FROM govhub_http_sessions WHERE token_hash=? AND expires>?", (digest, time.time())).fetchone()
        if not row or self.disabled(row["username"]):
            return None
        return self.workspace.user(row["username"])

    def delete(self, token):
        with self.workspace.connect(write=True) as db:
            db.execute("DELETE FROM govhub_http_sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))

    def staff(self, user):
        if user["role"] != "admin":
            raise HttpProblem("A workspace administrator manages staff access.", 403)
        with self.workspace.connect() as db:
            return [dict(r) for r in db.execute("SELECT u.name,u.role,COALESCE(d.disabled,0) AS disabled FROM users u LEFT JOIN govhub_disabled_users d ON d.username=u.name ORDER BY u.name")]

    def save_staff(self, payload, actor):
        with self.lock:
            return self._save_staff(payload, actor)

    def _save_staff(self, payload, actor):
        self.staff(actor)
        name, role = payload.get("name", ""), payload.get("role", "")
        password, disabled = payload.get("password"), payload.get("disabled", False)
        if not isinstance(disabled, bool) or role not in ("operator", "reviewer", "admin"):
            raise HttpProblem("Choose a staff role and access state.")
        current = self.workspace.user(name)
        if not current and not password:
            raise HttpProblem("Set the new staff member's password.")
        if password:
            if not isinstance(password, str) or not 12 <= len(password) <= 1024:
                raise HttpProblem("Use a password of 12–1024 characters.")
        with self.workspace.connect(write=True) as db:
            administrators = db.execute("SELECT u.name FROM users u LEFT JOIN govhub_disabled_users d ON d.username=u.name WHERE u.role='admin' AND COALESCE(d.disabled,0)=0").fetchall()
            if current and current["role"] == "admin" and (disabled or role != "admin") and {r["name"] for r in administrators} <= {name}:
                raise HttpProblem("Keep at least one active workspace administrator.")
        if password:
            self.workspace.add_user(name, password, role)
        with self.workspace.connect(write=True) as db:
            db.execute("UPDATE users SET role=? WHERE name=?", (role, name))
            db.execute("INSERT INTO govhub_disabled_users VALUES(?,?) ON CONFLICT(username) DO UPDATE SET disabled=excluded.disabled", (name, int(disabled)))
            db.execute("DELETE FROM govhub_http_sessions WHERE username=?", (name,))
            self.workspace.log(db, actor["name"], "Workspace staff access changed", details={"name": name, "role": role, "disabled": disabled, "password_replaced": bool(password)})
        return {"staff": self.staff(actor)}


class Server(ThreadingHTTPServer):
    daemon_threads = False
    allow_reuse_address = True

    def __init__(self, workspace, port):
        self.workspace, self.sessions = workspace, Sessions(workspace)
        self.sockets, self.socket_lock = set(), threading.Lock()
        super().__init__(("127.0.0.1", port), Handler)
        self.origin = f"http://127.0.0.1:{self.server_port}"

    def process_request(self, request, address):
        with self.socket_lock:
            self.sockets.add(request)
        super().process_request(request, address)

    def close_request(self, request):
        with self.socket_lock:
            self.sockets.discard(request)
        super().close_request(request)

    def server_close(self):
        with self.socket_lock:
            sockets = tuple(self.sockets)
        for connection in sockets:
            try:
                connection.shutdown(socket.SHUT_RD)
            except OSError:
                pass
        super().server_close()


class Handler(BaseHTTPRequestHandler):
    server_version = "CutoverWorkspace/1"

    def log_message(self, *args):
        pass

    def boundary(self, writing=False):
        host = self.headers.get("Host", "")
        if host not in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"):
            raise HttpProblem("Open this workspace at its local address.", 403)
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            raise HttpProblem("Open the local workspace before using its records.", 403)
        if writing and self.headers.get("Origin") != "http://" + host:
            raise HttpProblem("Open the local workspace before changing records.", 403)

    def token(self):
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get("Cookie", ""))
            return cookies[COOKIE].value if COOKIE in cookies else ""
        except Exception:
            return ""

    def user(self, required=True):
        actor = self.server.sessions.lookup(self.token())
        if required and not actor:
            raise HttpProblem("Sign in to the private operations workspace.", 401)
        return actor

    def send(self, data, status=200, mime="application/json; charset=utf-8", headers=None):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        for key, value in {"Content-Type": mime, "Content-Length": len(data), "Cache-Control": "no-store",
                           "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
                           "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
                           **(headers or {})}.items():
            self.send_header(key, str(value))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def download(self, data, name, mime="application/octet-stream"):
        self.send(data, mime=mime, headers={"Content-Disposition": "attachment; filename*=UTF-8''" + quote(name, safe="")})

    def download_file(self, item):
        """Verify and stream the same retained file descriptor for large archives."""
        with Path(item["path"]).open("rb") as source:
            digest = hashlib.sha256()
            length = 0
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
                length += len(block)
            if digest.hexdigest() != item["sha256"] or length != item.get("size", length):
                raise HttpProblem("The selected retained file changed.", 503)
            source.seek(0)
            self.send_response(200)
            for key, value in {
                "Content-Type": item.get("mime", "application/octet-stream"),
                "Content-Length": str(length),
                "Content-Disposition": "attachment; filename*=UTF-8''" + quote(item["name"], safe=""),
                "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
                "Content-Security-Policy": "default-src 'none'; sandbox",
            }.items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != "HEAD":
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    self.wfile.write(block)

    def body(self):
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            raise HttpProblem("Send a JSON request.", 415)
        if self.headers.get("Transfer-Encoding"):
            raise HttpProblem("Use a fixed request length.", 411)
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            raise HttpProblem("A request length is required.", 411)
        if not 0 < length <= MAX_BODY:
            raise HttpProblem("The request exceeds the source transfer limit.", 413)
        self.connection.settimeout(90)
        data = self.rfile.read(length)
        if len(data) != length:
            raise HttpProblem("The upload was interrupted. Retry the same source file.")
        def unique(pairs):
            obj = {}
            for key, value in pairs:
                if key in obj:
                    raise ValueError("Duplicate key")
                obj[key] = value
            return obj
        try:
            result = json.loads(data, object_pairs_hook=unique, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite number")))
        except (ValueError, UnicodeError):
            raise HttpProblem("The request is not valid JSON.")
        if not isinstance(result, dict):
            raise HttpProblem("Send a JSON object.")
        return result

    def fail(self, error):
        if isinstance(error, (BrokenPipeError, ConnectionResetError)):
            return
        if hasattr(error, "status"):
            self.send({"error": str(error), "fields": getattr(error, "fields", {})}, error.status)
        else:
            self.send({"error": "The local workspace could not complete this operation. Reopen the saved record and retry."}, 503)

    def parts(self):
        path = urlsplit(self.path)
        return [unquote(p) for p in path.path.strip("/").split("/") if p], {k: v[-1] for k, v in parse_qs(path.query).items()}

    def do_GET(self):
        try:
            self.boundary()
            parts, query = self.parts()
            if not parts or parts == ["index.html"]:
                self.send((ROOT / "web" / "index.html").read_bytes(), mime="text/html; charset=utf-8")
                return
            if len(parts) == 2 and parts[0] == "govhub-static" and parts[1] in ("visitor.css", "visitor.js"):
                self.send((ROOT / "visitor_journeys" / "web" / parts[1]).read_bytes(), mime="text/css; charset=utf-8" if parts[1].endswith(".css") else "text/javascript; charset=utf-8")
                return
            if len(parts) == 2 and parts[0] == "govhub-static" and parts[1] in ("style.css", "app.js", "packages.css", "packages.js", "skpr.css", "skpr.js", "upsun.css", "upsun.js", "castor.css", "castor.js"):
                self.send((ROOT / "web" / parts[1]).read_bytes(), mime="text/css; charset=utf-8" if parts[1].endswith(".css") else "text/javascript; charset=utf-8")
                return
            if len(parts) == 2 and parts[0] == "release-static" and parts[1] in ("static.css", "static.js"):
                self.send((ROOT / "static_releases" / "web" / parts[1]).read_bytes(), mime="text/css; charset=utf-8" if parts[1].endswith(".css") else "text/javascript; charset=utf-8")
                return
            if len(parts) == 2 and parts[0] == "content-static" and parts[1] in ("content.css", "content.js"):
                self.send((ROOT / "content_consolidation" / "web" / parts[1]).read_bytes(), mime="text/css; charset=utf-8" if parts[1].endswith(".css") else "text/javascript; charset=utf-8")
                return
            if len(parts) == 2 and parts[0] == "pots-static" and parts[1] in ("pots.css", "pots.js"):
                self.send((ROOT / "pots" / "web" / parts[1]).read_bytes(), mime="text/css; charset=utf-8" if parts[1].endswith(".css") else "text/javascript; charset=utf-8")
                return
            if len(parts) == 2 and parts[0] == "playbook-static" and parts[1] in ("playbook.css", "playbook.js"):
                self.send((ROOT / "editorial_playbook" / "web" / parts[1]).read_bytes(), mime="text/css; charset=utf-8" if parts[1].endswith(".css") else "text/javascript; charset=utf-8")
                return
            if parts == ["api", "session"]:
                self.send({"user": self.user(False)})
                return
            actor = self.user()
            workspace = self.server.workspace
            if parts == ["api", "govhub", "snapshot"]:
                self.send(workspace.snapshot())
            elif len(parts) == 4 and parts[:2] == ["api", "entities"]:
                self.send(workspace.record(parts[2], parts[3], query.get("revision")))
            elif parts == ["api", "activity"]:
                self.send(workspace.activity(query.get("offset", 0)))
            elif parts == ["api", "staff"]:
                self.send({"staff": self.server.sessions.staff(actor)})
            elif len(parts) == 3 and parts[:2] == ["api", "files"]:
                metadata = workspace.file(parts[2])
                source = workspace.blobs / metadata["sha256"]
                if source.is_symlink() or not source.is_file():
                    raise HttpProblem("The original retained source is unavailable.", 503)
                self.download_file({"path": str(source), "name": metadata["filename"],
                                    "sha256": metadata["sha256"], "size": metadata["bytes"]})
            elif len(parts) == 4 and parts[0] == "api" and parts[1] in ("exports", "operations"):
                method = workspace.export_file if parts[1] == "exports" else workspace.operation_file
                self.download_file(method(parts[2], parts[3]))
            else:
                raise HttpProblem("This workspace view does not exist.", 404)
        except Exception as error:
            self.fail(error)

    do_HEAD = do_GET

    def do_POST(self):
        try:
            self.boundary(True)
            parts, _ = self.parts()
            payload = self.body()
            workspace, sessions = self.server.workspace, self.server.sessions
            if parts == ["api", "login"]:
                sessions.login_allowed(self.client_address[0])
                actor = workspace.authenticate(payload.get("name"), payload.get("password"))
                if not actor or sessions.disabled(actor["name"]):
                    raise HttpProblem("Username or password was not recognized.", 401)
                sessions.delete(self.token())
                token = sessions.create(actor["name"])
                self.send({"user": actor}, headers={"Set-Cookie": f"{COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800"})
                return
            if parts == ["api", "logout"]:
                sessions.delete(self.token())
                self.send({"user": None}, headers={"Set-Cookie": f"{COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"})
                return
            actor = self.user()
            if len(parts) == 4 and parts[:2] == ["api", "entities"]:
                self.send(workspace.save(parts[2], parts[3], payload, actor))
            elif parts == ["api", "files"]:
                self.send(workspace.upload(payload, actor), 201)
            elif parts == ["api", "staff"]:
                self.send(sessions.save_staff(payload, actor))
            elif len(parts) >= 3 and parts[:2] == ["api", "govhub"]:
                self.send(workspace.dispatch("/".join(parts[2:]), payload, actor))
            else:
                raise HttpProblem("This workspace action does not exist.", 404)
        except Exception as error:
            self.fail(error)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_paths(parser)
    parser.add_argument("--port", type=int, default=8792)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("Choose a local port from 0 through 65535.")
    os.umask(0o077)
    workspace = open_store(args)
    with workspace.service_lease():
        server = Server(workspace, args.port)
        workspace.start_worker()
        print(json.dumps({"url": server.origin + "/", "workspace": str(args.workspace)}), flush=True)
        def stop(_signal, _frame):
            threading.Thread(target=server.shutdown, daemon=True).start()
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        try:
            server.serve_forever(poll_interval=0.2)
        finally:
            workspace.stop_worker()
            server.server_close()


if __name__ == "__main__":
    main()
