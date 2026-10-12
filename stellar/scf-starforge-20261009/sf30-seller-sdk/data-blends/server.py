"""Loopback operator; same CLI actions, source uploads and complete downloads."""
from __future__ import annotations
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import shutil
import threading
from urllib.parse import parse_qs, urlsplit
import uuid
from cli import invoke, error_record
from engine import Workspace, BlendError, canonical, require, uid, now

MAX_BODY = 20 * 1024 * 1024
ASSETS = {"/": ("index.html", "text/html; charset=utf-8"),
          "/app.js": ("app.js", "text/javascript; charset=utf-8"),
          "/style.css": ("style.css", "text/css; charset=utf-8")}
BROWSER_ACTIONS = {"state", "source.rows", "recipe.save", "recipe.read", "run", "edition", "rows", "review", "export", "backup", "operation", "resume", "dismiss"}

class OperatorServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, workspace: Workspace, port: int = 0, receive_root: str | None = None):
        require(type(port) is int and 0 <= port <= 65535, "Invalid port.")
        self.workspace = workspace
        self.token = secrets.token_hex(32)
        self.instance = uid()
        self.receive_root = Path(receive_root).resolve() if receive_root else workspace.root.parent
        require(self.receive_root.is_dir(), "Receiving parent must exist.")
        self.received: dict[str, Workspace] = {}
        super().__init__(("127.0.0.1", port), Handler)
        self.origin = f"http://127.0.0.1:{self.server_address[1]}"
        self.ready = {"schema": "stellar-forge.data-blends-startup.v1", "state": "LISTENING", "url": self.origin,
                      "instanceId": self.instance, "startedAt": now(), "binding": workspace.binding()}

    @property
    def launch_url(self):
        return self.origin + "/#" + self.token

class Handler(BaseHTTPRequestHandler):
    server: OperatorServer
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(600)

    def _headers(self, status, mime, length):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")

    def send(self, status, data, mime="application/json; charset=utf-8"):
        body = canonical(data).encode() if mime.startswith("application/json") else data
        self._headers(status, mime, len(body)); self.end_headers(); self.wfile.write(body)

    def check_origin(self):
        require(self.headers.get("Host") == urlsplit(self.server.origin).netloc and self.headers.get("Origin", self.server.origin) == self.server.origin and self.headers.get("Sec-Fetch-Site") != "cross-site", "Open this operator's own loopback address.", "BLEND_ORIGIN", 403)

    def auth(self):
        from http.cookies import SimpleCookie
        cookies = SimpleCookie(self.headers.get("Cookie", ""))
        item = cookies.get("blend_" + str(self.server.server_address[1]))
        cookie = item.value if item else ""
        require(secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + self.server.token) or secrets.compare_digest(cookie, self.server.token), "Use the private launch URL from the terminal.", "BLEND_AUTH", 401)

    def workspace(self):
        query = parse_qs(urlsplit(self.path).query)
        key = self.headers.get("X-Blend-Workspace", query.get("workspace", ["original"])[0])
        if key == "original":
            return self.server.workspace
        require(key in self.server.received, "Received workspace is not open in this session.", "BLEND_NOT_FOUND", 404)
        return self.server.received[key]

    def body(self):
        require(self.headers.get("Content-Type", "").split(";")[0] == "application/json" and not self.headers.get("Transfer-Encoding"), "Send application/json with a content length.", status=415)
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            raise BlendError("Invalid content length.") from None
        require(0 <= length <= MAX_BODY, "Upload exceeds the 20 MiB browser control limit. Use the CLI for larger CSVs and backups.", status=413)
        raw = self.rfile.read(length)
        require(len(raw) == length, "Upload ended before all bytes arrived.")
        data = json.loads(raw)
        require(isinstance(data, dict), "Expected a JSON object.")
        return data

    def do_GET(self):
        try:
            self.check_origin()
            parsed = urlsplit(self.path)
            if parsed.path in ASSETS:
                file, mime = ASSETS[parsed.path]
                self.send(200, (Path(__file__).parent / "ui" / file).read_bytes(), mime); return
            if parsed.path == "/api/launch":
                self.send(200, self.server.ready); return
            self.auth()
            if parsed.path == "/api/state":
                query = parse_qs(parsed.query)
                result = self.workspace().state(int(query.get("offset", [0])[0]), int(query.get("limit", [100])[0]))
                self.send(200, result); return
            if parsed.path.startswith("/api/download/"):
                path = self.workspace().locate_export(parsed.path.rsplit("/", 1)[1])
                mime = "application/zip" if path.suffix == ".zip" else "application/octet-stream"
                self._headers(200, mime, path.stat().st_size)
                filename = "data-blending-workspace.zip" if path.name.endswith(".workspace.zip") else {".zip": "blended-dataset.zip", ".csv": "blended-data.csv", ".sqlite": "blended-data.sqlite"}[path.suffix]
                self.send_header("Content-Disposition", 'attachment; filename="' + filename + '"'); self.end_headers()
                with path.open("rb") as f:
                    shutil.copyfileobj(f, self.wfile, 1024 * 1024)
                return
            raise BlendError("Unknown endpoint.", "BLEND_NOT_FOUND", 404)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            self.send(getattr(error, "status", 422), {"error": error_record(error)})

    def do_POST(self):
        try:
            self.check_origin(); self.auth()
            data = self.body()
            if self.path == "/api/session":
                body = b'{"state":"ready"}'
                self._headers(200, "application/json", len(body))
                self.send_header("Set-Cookie", "blend_" + str(self.server.server_address[1]) + "=" + self.server.token + "; HttpOnly; SameSite=Strict; Path=/")
                self.end_headers(); self.wfile.write(body); return
            workspace = self.workspace()
            if self.path == "/api/action":
                require(data.get("action") in BROWSER_ACTIONS, "This action is not available to the browser.")
                result = invoke(workspace, data["action"], data.get("input", {}))
            elif self.path in ["/api/import", "/api/receive"]:
                request = uid(data.get("request"))
                raw = base64.b64decode(data.get("contentBase64", ""), validate=True)
                require(len(raw) <= 12 * 1024 * 1024, "Use the CLI for files larger than 12 MiB.", status=413)
                sha = hashlib.sha256(raw).hexdigest()
                require(data.get("sha256") == sha, "Upload digest differs from the selected file.")
                # Upload staging is independent of the mutation journal and cannot
                # replace another request's file while its writer is still active.
                upload = workspace.root / "staging" / (str(uuid.uuid4()) + ".upload")
                try:
                    with upload.open("xb") as f:
                        os.chmod(upload, 0o600); f.write(raw)
                    if self.path == "/api/import":
                        result = workspace.import_csv(str(upload), data.get("label", ""), request, data.get("delimiter", ","), data.get("nullToken"), sha, data.get("reference", ""))
                    else:
                        leaf = data.get("name", "")
                        require(isinstance(leaf, str) and __import__('re').fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", leaf), "Use a new folder name with letters, digits, hyphens or underscores.")
                        received = Workspace.receive(str(upload), str(self.server.receive_root / leaf), sha)
                        key = uid(); self.server.received[key] = received
                        result = {"sessionWorkspace": key, "directoryName": leaf, "state": received.state()}
                finally:
                    upload.unlink(missing_ok=True)
            else:
                raise BlendError("Unknown endpoint.", "BLEND_NOT_FOUND", 404)
            self.send(200, result)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            self.send(getattr(error, "status", 422), {"error": error_record(error)})

def serve(workspace: Workspace, port=0, expected_binding_sha256=None, receive_root=None):
    require(expected_binding_sha256 is None or workspace.binding()["sha256"] == expected_binding_sha256, "The selected workspace binding changed.")
    server = OperatorServer(workspace, port, receive_root)
    print(canonical(server.ready), flush=True)
    print("Private data-blending workspace: " + server.launch_url, flush=True)
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
