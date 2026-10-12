"""Loopback HTTP/JSON interface for the complete original reading workspace."""
from __future__ import annotations

from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import shutil
import tempfile
from urllib.parse import parse_qs, quote, urlsplit

from .reading_workspace import ReadingWorkspace, ReadingError
from .reading_delivery import export_project, export_report
from .reading_ui import HTML, CSS, JS

MAX_REQUEST = 16 * 1024 * 1024


def create_server(workspace: ReadingWorkspace, *, port=0, library=None, token=None):
    """Return an unstarted local server. The caller owns workspace/library lifetime.

    The initial fragment token is exchanged for an HTTP-only, same-site session
    cookie. Normal file downloads contain no credentials in their URL. The API
    also accepts the same token in an Authorization header for native clients.
    """
    token = token or secrets.token_urlsafe(32)
    cookie_name = "starforge_reading_" + secrets.token_hex(8)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_):
            pass

        def _origin(self):
            allowed = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            if self.headers.get("Host", "") not in allowed:
                return False
            origin = self.headers.get("Origin")
            return not origin or origin in {"http://" + h for h in allowed}

        def _authenticated(self):
            authorization = self.headers.get("Authorization", "")
            if authorization.startswith("Bearer ") and secrets.compare_digest(authorization[7:], token):
                return True
            try:
                cookie = SimpleCookie(self.headers.get("Cookie", ""))
                supplied = cookie[cookie_name].value if cookie_name in cookie else ""
                return secrets.compare_digest(supplied, token)
            except Exception:
                return False

        def _headers(self, code, mime, length, *, filename=None, session=False):
            self.send_response(code)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
            if filename:
                self.send_header("Content-Disposition", "attachment; filename=\"reading-download\"; filename*=UTF-8''" + quote(filename, safe=""))
            if session:
                self.send_header("Set-Cookie", f"{cookie_name}={token}; HttpOnly; SameSite=Strict; Path=/")
            self.end_headers()

        def _bytes(self, data, mime="application/json; charset=utf-8", *, code=200, session=False):
            self._headers(code, mime, len(data), session=session)
            if self.command != "HEAD":
                self.wfile.write(data)

        def _json(self, value, *, code=200, session=False):
            self._bytes(json.dumps(value, ensure_ascii=False, allow_nan=False).encode(), code=code, session=session)

        def _error(self, exc):
            code = getattr(exc, "code", "REQUEST_FAILED")
            retry = code == "CANCELLED" or (not isinstance(exc, (ReadingError, ValueError, TypeError, KeyError)) and getattr(exc, "status", None) is None)
            status = 503 if retry else 409 if "CONFLICT" in code or code == "SELECTION_CHANGED" else 400
            message = getattr(exc, "detail", "") or {
                "QUERY_QUOTES": "Close the quotation marks around a phrase.",
                "INVALID_INPUT": "Check the fields and try again.",
                "ORIGINAL_UNAVAILABLE": "The original file is not present in this reading project.",
                "PASSAGE_NOT_FOUND": "This passage is not available. Refresh the source selection.",
                "NOT_CONNECTED": "Launch with an existing resource library to use this operation.",
                "REQUEST_FAILED": "The request did not complete. Reopen the saved operation before retrying.",
            }.get(code, code.replace("_", " ").capitalize())
            self._json({"error": code, "detail": message, "retry_same_operation": retry}, code=status)

        def do_GET(self):
            try:
                if not self._origin():
                    self._json({"error": "ORIGIN_NOT_ALLOWED"}, code=403)
                    return
                url = urlsplit(self.path)
                assets = {"/": (HTML, "text/html; charset=utf-8"), "/reading.css": (CSS, "text/css; charset=utf-8"), "/reading.js": (JS, "text/javascript; charset=utf-8")}
                if url.path in assets:
                    data, mime = assets[url.path]
                    self._bytes(data.encode(), mime)
                    return
                if not self._authenticated():
                    self._json({"error": "SESSION_REQUIRED", "detail": "Open the current launch URL to connect this browser."}, code=401)
                    return
                q = {k: v[0] for k, v in parse_qs(url.query, max_num_fields=20).items()}
                snapshot = q.get("snapshot") or None
                offset, limit = int(q.get("offset", 0)), int(q.get("limit", 30))
                if url.path == "/api/status":
                    result = {**workspace.status(), "connected": library is not None}
                elif url.path == "/api/resources":
                    result = workspace.resources(snapshot=snapshot, offset=offset, limit=limit)
                elif url.path == "/api/search":
                    result = workspace.search(q.get("q", ""), snapshot=snapshot, resource_id=q.get("resource"), offset=offset, limit=limit)
                elif url.path == "/api/passage":
                    result = workspace.passage(q["resource"], int(q["ordinal"]))
                    with workspace._db() as db:
                        result["has_next"] = bool(db.execute("SELECT 1 FROM passages WHERE sha=? AND ordinal=?", (result["sha"], result["ordinal"] + 1)).fetchone())
                elif url.path == "/api/record":
                    result = workspace.head(q["kind"], q["id"], revision=int(q["revision"]) if q.get("revision") else None)
                elif url.path == "/api/history":
                    result = workspace.history(q["kind"], q["id"])
                elif url.path.startswith("/download/"):
                    self._download(url.path, q)
                    return
                else:
                    self._json({"error": "NOT_FOUND"}, code=404)
                    return
                self._json(result)
            except (BrokenPipeError, ConnectionResetError):
                return
            except Exception as exc:
                self._error(exc)

        do_HEAD = do_GET

        def _download(self, route, q):
            temporary = None
            try:
                if route == "/download/source":
                    path, metadata = workspace.source_file(q["resource"])
                    name, mime = metadata.get("name", "original-file"), "application/octet-stream"
                elif route in ("/download/project", "/download/report"):
                    temporary = tempfile.mkdtemp(prefix="reading-download-")
                    if route == "/download/project":
                        name, mime = "reading-project.zip", "application/zip"
                        path = Path(temporary) / name
                        export_project(workspace, path)
                    else:
                        fmt = q.get("format", "html")
                        if fmt not in ("html", "json", "csv"):
                            raise ReadingError("REPORT_FORMAT")
                        name = "reading-list." + fmt
                        mime = {"html": "text/html; charset=utf-8", "json": "application/json", "csv": "text/csv; charset=utf-8"}[fmt]
                        path = Path(temporary) / name
                        export_report(workspace, path, format=fmt, list_id=q.get("list"), list_revision=int(q["revision"]) if q.get("revision") else None,
                                      query=q.get("q"), snapshot=q.get("snapshot"), resource_id=q.get("resource"))
                else:
                    self._json({"error": "NOT_FOUND"}, code=404)
                    return
                self._headers(200, mime, path.stat().st_size, filename=name)
                if self.command != "HEAD":
                    with path.open("rb") as stream:
                        shutil.copyfileobj(stream, self.wfile, 64 * 1024)
            finally:
                if temporary:
                    shutil.rmtree(temporary)

        def do_POST(self):
            try:
                if not self._origin():
                    self._json({"error": "ORIGIN_NOT_ALLOWED"}, code=403)
                    return
                if not self._authenticated():
                    self._json({"error": "SESSION_REQUIRED"}, code=401)
                    return
                path = urlsplit(self.path).path
                if path == "/api/session":
                    self._json({"connected": True}, session=True)
                    return
                if self.headers.get_content_type() != "application/json" or self.headers.get("Transfer-Encoding"):
                    raise ReadingError("JSON_BODY_REQUIRED")
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > MAX_REQUEST:
                    raise ReadingError("REQUEST_SIZE", "Use a JSON request no larger than 16 MiB.")
                body = json.loads(self.rfile.read(length).decode("utf-8", "strict"))
                if not isinstance(body, dict):
                    raise ReadingError("JSON_OBJECT_REQUIRED")
                if path == "/api/search/save":
                    result = workspace.save_search(**body)
                elif path == "/api/list/save":
                    result = workspace.save_list(**body)
                elif path == "/api/sync":
                    if library is None:
                        raise ReadingError("NOT_CONNECTED")
                    result = workspace.sync(library, **body)
                elif path == "/api/collection":
                    if library is None:
                        raise ReadingError("NOT_CONNECTED")
                    result = workspace.publish_collection(library, **body)
                else:
                    self._json({"error": "NOT_FOUND"}, code=404)
                    return
                self._json(result)
            except (BrokenPipeError, ConnectionResetError):
                return
            except Exception as exc:
                self._error(exc)

    class Server(ThreadingHTTPServer):
        daemon_threads = True

    server = Server(("127.0.0.1", port), Handler)
    server.reading_url = f"http://127.0.0.1:{server.server_port}/#{token}"
    server.reading_token = token
    return server
