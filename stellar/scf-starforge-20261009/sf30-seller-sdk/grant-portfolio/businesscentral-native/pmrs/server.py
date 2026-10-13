"""Authenticated local operator HTTP server with drained original action ownership."""
import hashlib
import hmac
import http.server
import os
import secrets
import threading
import urllib.parse
from pathlib import Path
from .canonical import decode, encode, ui_value, read_bytes
from .errors import PMRSError, require
from .workspace import Workspace

MAX_REQUEST_BYTES = 8 * 1024 * 1024
MAX_RESPONSE_BYTES = 64 * 1024 * 1024

class LocalHTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = False
    block_on_close = True
    allow_reuse_address = True

def _int(value, default=None):
    if value is None: return default
    require(isinstance(value, str) and value.isdigit(), "PAGE_VALUE", "Page values must be non-negative integers.")
    return int(value)

def start_server(workspace, *, host="127.0.0.1", port=0, token=None, web_root=None):
    require(isinstance(workspace, Workspace), "WORKSPACE_REQUIRED", "Select the original operator workspace.")
    require(host in {"127.0.0.1", "localhost"}, "LOCAL_BIND", "The private operator binds to loopback.")
    require(type(port) is int and 0 <= port <= 65535, "PORT", "Invalid local port.")
    token = token or secrets.token_urlsafe(48)
    require(isinstance(token, str) and len(token) >= 32 and not any(c.isspace() for c in token),
            "SERVER_TOKEN", "Use a private operator token with at least 32 characters.")
    web = Path(web_root).absolute() if web_root else workspace.source_root / "web"
    workspace.open()
    owner = {"closing": False}
    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def setup(self):
            super().setup()
            self.connection.settimeout(30)
        def log_message(self, *_): pass

        def _headers(self, status, mime, length, **extra):
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            for key, value in extra.items(): self.send_header(key.replace("_", "-"), str(value))
            self.end_headers()

        def _json(self, value, status=200):
            envelope = {"ok": True, "value": value} if status < 400 else {"ok": False, **value}
            data = encode(ui_value(envelope))
            require(len(data) <= MAX_RESPONSE_BYTES, "HTTP_RESPONSE_LIMIT",
                    "Use the explicit pages or complete retained file for this response.")
            self._headers(status, "application/json; charset=utf-8", len(data))
            self.wfile.write(data)

        def _error(self, error):
            if isinstance(error, PMRSError):
                status = error.status
                if error.code in {"ACTION_NOT_FOUND", "RECORD_NOT_FOUND", "OPERATION_NOT_FOUND", "FILE_NOT_FOUND"}: status = 404
                elif error.code in {"ACTION_REQUEST_CHANGED", "REQUEST_CHANGED", "OPERATION_BUSY", "WORKSPACE_CLOSED"}: status = 409
                body = error.public()
            else:
                status = 500
                body = {"code": type(error).__name__, "message": "The original operator request did not complete.",
                        "details": {"recovery": "read_same_saved_request"}}
            self._json({"error": body}, status)

        def _target(self):
            require(self.headers.get("Host") == self.server.expected_host, "HTTP_HOST", "Use the selected operator origin.")
            url = urllib.parse.urlsplit(self.path)
            require(not url.scheme and not url.netloc and not url.fragment and "\\" not in url.path,
                    "HTTP_PATH", "Invalid local route.")
            return urllib.parse.unquote(url.path), urllib.parse.parse_qs(url.query, keep_blank_values=True)

        def _auth(self, *, mutation=False):
            expected = "Bearer " + token
            actual = self.headers.get("Authorization", "")
            if not hmac.compare_digest(actual, expected):
                raise PMRSError("OPERATOR_AUTHENTICATION", "Use this operator's private access token.", status=401)
            if mutation:
                require(self.headers.get("Origin") == self.server.origin, "HTTP_ORIGIN", "Use the same selected operator origin.")
                require(not owner["closing"], "WORKSPACE_CLOSED", "The original operator is closing.")

        @staticmethod
        def _query(params, allowed):
            require(set(params) <= set(allowed) and all(len(values) == 1 for values in params.values()),
                    "HTTP_QUERY", "Unknown or repeated query field.")
            return {k: v[0] for k, v in params.items()}

        def do_GET(self):
            try:
                path, params = self._target()
                if path in {"/", "/app.js", "/style.css"}:
                    require(not params, "HTTP_QUERY", "Static assets take no query.")
                    filename = "index.html" if path == "/" else path[1:]
                    data = read_bytes(web / filename, limit=4 * 1024 * 1024)
                    mime = {"index.html": "text/html; charset=utf-8", "app.js": "text/javascript; charset=utf-8",
                            "style.css": "text/css; charset=utf-8"}[filename]
                    self._headers(200, mime, len(data)); self.wfile.write(data); return
                self._auth()
                if path == "/api/state":
                    require(not params, "HTTP_QUERY", "State takes no query.")
                    return self._json(workspace.state())
                if path == "/api/records":
                    q = self._query(params, {"kind", "before", "limit"})
                    return self._json(workspace.store.list_records(q.get("kind"), before=_int(q.get("before")), limit=_int(q.get("limit"), 25)))
                if path == "/api/actions":
                    q = self._query(params, {"offset", "limit"})
                    return self._json(workspace.commands(offset=_int(q.get("offset"), 0), limit=_int(q.get("limit"), 25)))
                if path == "/api/target-schema":
                    q = self._query(params, {"connection", "entity"})
                    return self._json(workspace.target_schema(q.get("connection"), q.get("entity")))
                parts = path.strip("/").split("/")
                if len(parts) == 3 and parts[:2] == ["api", "records"]:
                    require(not params, "HTTP_QUERY", "Record takes no query.")
                    return self._json(workspace.record_view(parts[2]))
                if len(parts) == 4 and parts[:2] == ["api", "records"] and parts[3] == "delivery":
                    require(not params, "HTTP_QUERY", "Delivery ownership takes no query.")
                    return self._json(workspace.store.delivery_for_review(parts[2]))
                if len(parts) == 4 and parts[:2] == ["api", "records"]:
                    q = self._query(params, {"offset", "limit"})
                    return self._json(workspace.record_page(parts[2], parts[3], offset=_int(q.get("offset"), 0), limit=_int(q.get("limit"), 25)))
                if len(parts) == 4 and parts[:2] == ["api", "sources"]:
                    q = self._query(params, {"offset", "limit"})
                    return self._json(workspace.source_page(parts[2], parts[3], offset=_int(q.get("offset"), 0), limit=_int(q.get("limit"), 25)))
                if len(parts) == 3 and parts[:2] == ["api", "actions"]:
                    require(not params, "HTTP_QUERY", "Action takes no query.")
                    return self._json(workspace.command(parts[2]))
                if len(parts) == 3 and parts[:2] == ["api", "operations"]:
                    require(not params, "HTTP_QUERY", "Operation takes no query.")
                    return self._json(workspace.store.operation(parts[2]))
                if len(parts) == 5 and parts[:2] == ["api", "files"]:
                    require(not params, "HTTP_QUERY", "Original file routes take no query.")
                    descriptor = workspace.file(parts[2], parts[3], parts[4])
                    with open(descriptor["path"], "rb") as stream:
                        before = os.fstat(stream.fileno())
                        require(before.st_size == descriptor["bytes"]
                                and hashlib.file_digest(stream, "sha256").hexdigest() == descriptor["sha256"],
                                "FILE_CHANGED", "Selected original file differs.")
                        stream.seek(0)
                        self._headers(200, descriptor["mime"], descriptor["bytes"],
                            Content_Disposition="attachment; filename=" + urllib.parse.quote(descriptor["name"], safe=""),
                            X_Content_SHA256=descriptor["sha256"], ETag='"' + descriptor["sha256"] + '"')
                        while True:
                            block = stream.read(1024 * 1024)
                            if not block: break
                            self.wfile.write(block)
                    return
                raise PMRSError("ROUTE_NOT_FOUND", "No such operator route.", status=404)
            except (BrokenPipeError, ConnectionResetError): pass
            except Exception as error:
                try: self._error(error)
                except (BrokenPipeError, ConnectionResetError): pass

        def do_POST(self):
            try:
                path, params = self._target()
                require(not params, "HTTP_QUERY", "Native operator actions take no query.")
                self._auth(mutation=True)
                require(self.headers.get_content_type() == "application/json", "HTTP_CONTENT_TYPE", "Send the complete original JSON body.")
                length = self.headers.get("Content-Length")
                require(length and length.isdigit() and 0 <= int(length) <= MAX_REQUEST_BYTES
                        and not self.headers.get("Transfer-Encoding"), "HTTP_BODY_LIMIT", "Supply a bounded Content-Length JSON body.")
                data = self.rfile.read(int(length))
                require(len(data) == int(length), "HTTP_BODY_INCOMPLETE", "The original request body ended early.")
                body = decode(data, limit=MAX_REQUEST_BYTES)
                if path == "/api/actions":
                    return self._json(workspace.submit(body), 202)
                parts = path.strip("/").split("/")
                if len(parts) == 4 and parts[:2] == ["api", "actions"] and parts[3] == "cancel":
                    require(body == {}, "ACTION_CANCEL", "Cancellation takes an empty JSON object.")
                    return self._json(workspace.cancel(parts[2]))
                if path == "/api/shutdown":
                    require(body == {}, "ACTION_SHUTDOWN", "Shutdown takes an empty JSON object.")
                    owner["closing"] = True
                    workspace.stop_admission()
                    self._json({"state": "CLOSING", "workspace_id": workspace.store.identity["workspace_id"]})
                    thread = threading.Thread(target=self.server.shutdown, name="pmrs-http-stop")
                    owner["stop_thread"] = thread; thread.start()
                    return
                raise PMRSError("ROUTE_NOT_FOUND", "No such operator action route.", status=404)
            except (BrokenPipeError, ConnectionResetError): pass
            except Exception as error:
                self.close_connection = True
                try: self._error(error)
                except (BrokenPipeError, ConnectionResetError): pass

    server = None
    try:
        server = LocalHTTPServer((host, port), Handler)
        actual_port = server.server_address[1]
        server.expected_host = host + ":" + str(actual_port)
        server.origin = "http://" + server.expected_host
        finished = threading.Event()
        def serve():
            try: server.serve_forever(poll_interval=0.2)
            finally: finished.set()
        thread = threading.Thread(target=serve, name="pmrs-http")
        thread.start()
    except BaseException:
        if server is not None: server.server_close()
        workspace.close()
        raise

    class Owner:
        url = server.origin
        access_token = token
        workspace_id = workspace.store.identity["workspace_id"]
        def wait(self, seconds=None): return finished.wait(seconds)
        def close(self):
            owner["closing"] = True
            workspace.stop_admission()
            server.shutdown()
            thread.join()
            stop_thread = owner.get("stop_thread")
            if stop_thread is not None: stop_thread.join()
            server.server_close()
            workspace.close()
        def __enter__(self): return self
        def __exit__(self, *_): self.close()
    return Owner()
