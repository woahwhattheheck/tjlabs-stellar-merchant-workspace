"""Original NetCDF workspace HTTP owner and streamed original receiving. MIT."""
from __future__ import annotations
import hashlib, http.cookies, http.server, json, os, pathlib, secrets, tempfile, urllib.parse, uuid
from netcdf_workspace import Workspace, WorkspaceError, canonical, now, require

class Server(http.server.ThreadingHTTPServer):
    daemon_threads = False
    block_on_close = True
    def __init__(self, workspace, port=0, receive_root=None, token_file=None):
        self.workspace = workspace
        self.receive_root = pathlib.Path(receive_root or workspace.directory.parent / "received").resolve()
        self.receive_root.mkdir(parents=True, mode=0o700, exist_ok=True)
        self.token_file = pathlib.Path(token_file or workspace.directory / ".browser-key").resolve()
        if not self.token_file.exists():
            self.token_file.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(self.token_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, "w") as stream: stream.write(secrets.token_urlsafe(32))
        require(self.token_file.is_file() and not self.token_file.is_symlink(), "Select a private browser key file")
        require(not self.token_file.stat().st_mode & 0o077, "The browser key file must be private")
        self.token = self.token_file.read_text().strip(); require(len(self.token) >= 32, "The browser key is too short")
        self.sessions = set(); self.instance_id = str(uuid.uuid4()); self.started_at = now()
        self.cookie_name = "nc_" + hashlib.sha256(str(workspace.directory).encode()).hexdigest()[:16]
        super().__init__(("127.0.0.1", port), Handler)
        self.url = "http://127.0.0.1:" + str(self.server_address[1])

    def startup(self, private=False):
        result = {"schema": "stellar-forge.netcdf-startup.v1", "state": "LISTENING", "url": self.url, "binding": self.workspace.binding(), "instanceId": self.instance_id, "startedAt": self.started_at}
        if private: result["tokenFile"] = str(self.token_file)
        return result

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *args): pass
    def parsed(self): return urllib.parse.urlparse(self.path)
    def json_response(self, value, status=200, cookie=None):
        body = canonical(value).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie: self.send_header("Set-Cookie", cookie)
        self.end_headers(); self.wfile.write(body)

    def authorized(self):
        origin = self.headers.get("Origin")
        require(origin in [None, self.server.url], "The browser request origin differs from this original workspace")
        bearer = self.headers.get("Authorization", "")
        if bearer.startswith("Bearer ") and secrets.compare_digest(bearer[7:], self.server.token): return
        cookie = http.cookies.SimpleCookie()
        try: cookie.load(self.headers.get("Cookie", ""))
        except http.cookies.CookieError: pass
        value = cookie.get(self.server.cookie_name)
        require(value is not None and value.value in self.server.sessions, "Connect with the private browser key", "NETCDF_AUTH")

    def length(self):
        text = self.headers.get("Content-Length", "")
        require(text.isdecimal(), "A complete original Content-Length is required")
        return int(text)

    def body_json(self):
        length = self.length(); require(length <= 32 * 1024 * 1024, "Use streamed source/object receiving for complete large files")
        body = self.rfile.read(length); require(len(body) == length, "The complete request body was interrupted")
        return json.loads(body)

    def stream_input(self):
        length = self.length(); fd, name = tempfile.mkstemp(prefix="netcdf-original-", dir=self.server.workspace.directory)
        try:
            with os.fdopen(fd, "wb") as target:
                remaining = length
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining)); require(chunk, "The complete original upload was interrupted")
                    target.write(chunk); remaining -= len(chunk)
                target.flush(); os.fsync(target.fileno())
            return pathlib.Path(name)
        except BaseException:
            os.unlink(name); raise

    def error_response(self, error):
        if isinstance(error, WorkspaceError): code, message = error.code, str(error)
        elif isinstance(error, (ValueError, KeyError, TypeError, OSError)): code, message = "NETCDF_INVALID", str(error)
        else: code, message = "NETCDF_ERROR", "The original native operation failed: " + str(error)
        self.close_connection = True
        self.json_response({"error": {"code": code, "message": message}}, 401 if code == "NETCDF_AUTH" else 409 if "CONFLICT" in code else 400)

    def do_GET(self):
        try:
            parsed = self.parsed(); path = parsed.path
            if path == "/api/launch": return self.json_response(self.server.startup())
            if path.startswith("/api/"):
                self.authorized()
                if path == "/api/state": return self.json_response(self.server.workspace.invoke("overview"))
                if path.startswith("/api/object/"):
                    sha = path.rsplit("/", 1)[-1]; original = self.server.workspace.object_path(sha)
                    query = urllib.parse.parse_qs(parsed.query); name = query.get("name", [sha])[0]
                    name = pathlib.Path(name.replace("\\", "/")).name.replace('"', "").replace("\r", "").replace("\n", "")
                    self.send_response(200); self.send_header("Content-Type", "application/octet-stream")
                    self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(name)); self.send_header("Content-Length", str(original.stat().st_size))
                    self.send_header("Cache-Control", "no-store"); self.send_header("X-Content-Type-Options", "nosniff"); self.end_headers()
                    with open(original, "rb") as stream:
                        for chunk in iter(lambda: stream.read(1024 * 1024), b""): self.wfile.write(chunk)
                    return
                raise WorkspaceError("NETCDF_MISSING", "The requested native resource does not exist")
            root = pathlib.Path(__file__).parent / "ui"
            name = "index.html" if path == "/" else path.lstrip("/")
            require(name in ["index.html", "app.js", "style.css"], "The application asset does not exist", "NETCDF_MISSING")
            body = (root / name).read_bytes(); self.send_response(200)
            self.send_header("Content-Type", {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}[pathlib.Path(name).suffix])
            self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store"); self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'")
            self.end_headers(); self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError): pass
        except BaseException as error: self.error_response(error)

    def do_POST(self):
        temp = None
        try:
            parsed = self.parsed(); path = parsed.path
            require(self.headers.get("Origin") in [None, self.server.url], "The request origin differs from this workspace")
            if path == "/api/session":
                value = self.body_json(); require(isinstance(value.get("token"), str) and secrets.compare_digest(value["token"], self.server.token), "The private browser key differs", "NETCDF_AUTH")
                session = secrets.token_urlsafe(32); self.server.sessions.add(session)
                return self.json_response({"connected": True, "project": self.server.workspace.state()["project"]}, cookie=self.server.cookie_name + "=" + session + "; HttpOnly; SameSite=Strict; Path=/")
            self.authorized()
            if path == "/api/invoke":
                value = self.body_json(); method = value.get("method"); params = value.get("params", {})
                # Browser paths stay within the original upload/object receiving
                # operations. Native clients choose their host-selected files.
                require(method not in ["import", "receive"], "Use complete browser source/archive receiving")
                if method == "export": params = {}  # browser cannot select an arbitrary host output path.
                return self.json_response(self.server.workspace.invoke(method, params))
            query = urllib.parse.parse_qs(parsed.query)
            if path in ["/api/sources", "/api/receive"]:
                temp = self.stream_input(); name = pathlib.Path(query.get("name", ["original.nc"])[0]).name
                if path == "/api/sources":
                    p = {"path": str(temp), "name": name, "reference": query.get("reference", [""])[0]}
                    if query.get("request_id"):
                        # A retry is bound to the complete wire identity, not
                        # the transient spool filename created for each upload.
                        file_sha = hashlib.sha256()
                        with open(temp, "rb") as original:
                            for chunk in iter(lambda: original.read(1024 * 1024), b""): file_sha.update(chunk)
                        stable = self.server.workspace.directory / ("upload-" + file_sha.hexdigest())
                        os.replace(temp, stable); temp = stable
                        p["path"] = str(stable); p["request_id"] = query["request_id"][0]
                    return self.json_response(self.server.workspace.invoke("import", p), 201)
                expected = query.get("expected_sha", [None])[0]
                destination = self.server.receive_root / ("project-" + (expected[:16] if isinstance(expected, str) else uuid.uuid4().hex))
                return self.json_response(Workspace.receive(temp, destination, expected), 201)
            raise WorkspaceError("NETCDF_MISSING", "The requested native operation does not exist")
        except (BrokenPipeError, ConnectionResetError): pass
        except BaseException as error: self.error_response(error)
        finally:
            if temp is not None: temp.unlink(missing_ok=True)
