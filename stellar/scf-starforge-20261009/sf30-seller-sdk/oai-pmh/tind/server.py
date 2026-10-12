"""MIT. Private industrial TIND operator desk over the original workspace."""
from __future__ import annotations
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import mimetypes
import os
from pathlib import Path
import secrets
import shutil
import tempfile
import threading
from urllib.parse import parse_qs, urlsplit
from bridge import InputError
from harvest import jbytes, decode, sha, stamp
from managed import require_binding, startup
from migration import Migration, MAX_JSON
from native import native_tables, search_export, send_exact
from source_cases import list_collections, view_collection, plan_many, reviews, review_document, collection

HERE = Path(__file__).resolve().parent
ASSETS = {"index.html": "text/html; charset=utf-8", "browser.mjs": "text/javascript; charset=utf-8", "style.css": "text/css; charset=utf-8"}

class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, workspace, port, binding, token):
        super().__init__(("127.0.0.1", port), Handler)
        self.workspace, self.binding, self.token = workspace, binding, token
        self.cookie_name = "tind_" + str(self.server_port)
        self.announcement = startup(self, binding, token)
        self.native_jobs = {}
        self.job_lock = threading.Lock()

    def job(self, request):
        if not isinstance(request, dict) or set(request) != {"operationId", "projectId", "expectedRevision", "task", "input"}:
            raise InputError("Supply the complete native task request")
        identity = request["operationId"]
        if not isinstance(identity, str) or not identity or len(identity) > 128:
            raise InputError("Supply a stable native operation ID")
        digest = sha(jbytes(request))
        with self.job_lock:
            old = self.native_jobs.get(identity)
            if old:
                if old["requestSha256"] != digest:
                    raise InputError("This native operation ID has different inputs")
                resumable = request["task"] == "search" and old["status"] != "running" and old.get("result", {}).get("status") == "ready"
                if not resumable:
                    return old
            if any(item["status"] == "running" for item in self.native_jobs.values()):
                raise InputError("Continue the current native transfer before starting another")
            if request["task"] not in {"search", "send"} or not isinstance(request["input"], dict):
                raise InputError("Choose native search or the exact native send contract")
            with self.workspace.mutex:
                table = "tind_native_searches" if request["task"] == "search" else "tind_native_transfers"
                previous = self.workspace.db.execute("SELECT body FROM " + table + " WHERE id=?", (identity,)).fetchone()
                project = self.workspace.project(request["projectId"])
                if previous is None and request["expectedRevision"] != project["revision"]:
                    raise InputError("Reload the current migration revision before native transfer")
            value = {"operationId": identity, "projectId": project["id"], "requestSha256": digest, "task": request["task"],
                     "status": "running", "startedAt": stamp(), "request": request}
            self.native_jobs[identity] = value
            def work():
                try:
                    data = request["input"]
                    if request["task"] == "search":
                        output = search_export(self.workspace, project["id"], identity, data.get("selection", {}),
                                               authorization_env=data.get("authorizationEnvironment"),
                                               interval=data.get("interval", 2.1), page_size=data.get("pageSize", 100),
                                               export_context=data.get("exportContext"))
                    else:
                        output = send_exact(self.workspace, project["id"], identity, data["request"],
                                            authorization_env=data.get("authorizationEnvironment"))
                    with self.job_lock:
                        value["status"] = "returned"; value["result"] = output; value["finishedAt"] = stamp()
                except Exception as error:
                    with self.job_lock:
                        value["status"] = "error"; value["error"] = str(error); value["finishedAt"] = stamp()
            threading.Thread(target=work, name="tind-native-" + identity[:32], daemon=True).start()
            return dict(value)

class Handler(BaseHTTPRequestHandler):
    server_version = "TINDWorkspace/1"
    sys_version = ""

    def log_message(self, *_):
        pass

    def valid_host(self):
        return self.headers.get("Host") == "127.0.0.1:" + str(self.server.server_port)

    def authenticated(self):
        supplied = self.headers.get("X-Tind-Session", "")
        if isinstance(supplied, str) and hmac.compare_digest(supplied, self.server.token):
            return True
        try:
            cookies = SimpleCookie(self.headers.get("Cookie", ""))
            value = cookies.get(self.server.cookie_name)
            return value is not None and hmac.compare_digest(value.value, self.server.token)
        except Exception:
            return False

    def respond(self, status, value, content_type="application/json; charset=utf-8", download=None):
        data = value if isinstance(value, bytes) else jbytes(value)
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.common_headers()
        if download:
            self.send_header("Content-Disposition", 'attachment; filename="' + download + '"')
        self.end_headers()
        self.wfile.write(data)

    def common_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
        if self.authenticated():
            self.send_header("Set-Cookie", self.server.cookie_name + "=" + self.server.token + "; HttpOnly; SameSite=Strict; Path=/")

    def route(self):
        parsed = urlsplit(self.path)
        values = parse_qs(parsed.query, keep_blank_values=True)
        if any(len(value) != 1 for value in values.values()):
            raise InputError("Use one value per request parameter")
        return parsed.path, {key: value[0] for key, value in values.items()}

    def require(self, write=False):
        if not self.valid_host():
            self.respond(421, {"error": "Open the selected local operator address"})
            return False
        if not self.authenticated():
            self.respond(401, {"error": "Open the full local launch link to sign in"})
            return False
        if write:
            allowed = "http://127.0.0.1:" + str(self.server.server_port)
            if self.headers.get("Origin") not in {None, allowed}:
                self.respond(403, {"error": "Use this local operator desk for the saved request"})
                return False
        return True

    def do_GET(self):
        try:
            path, query = self.route()
            if not self.valid_host():
                self.respond(421, {"error": "Open the selected local operator address"}); return
            asset = "index.html" if path == "/" else path.removeprefix("/assets/") if path.startswith("/assets/") else None
            if asset in ASSETS:
                self.respond(200, (HERE / asset).read_bytes(), ASSETS[asset]); return
            if not self.require():
                return
            owner = self.server.workspace
            if path == "/api/launch":
                self.respond(200, self.server.announcement)
            elif path == "/api/state":
                result = owner.state(query.get("project"))
                with self.server.job_lock:
                    result["nativeJobs"] = list(self.server.native_jobs.values())
                self.respond(200, result)
            elif path == "/api/history":
                with owner.mutex:
                    result = owner.ws.history(query["kind"], int(query.get("offset", "0")), int(query.get("limit", "100")))
                self.respond(200, result)
            elif path == "/api/records":
                with owner.mutex:
                    result = owner.records(query["project"], int(query.get("offset", "0")), int(query.get("limit", "50")), query.get("query", ""))
                self.respond(200, result)
            elif path == "/api/files":
                with owner.mutex:
                    result = owner.files(query["project"], int(query.get("offset", "0")), int(query.get("limit", "50")), query.get("query", ""))
                self.respond(200, result)
            elif path == "/api/file-history":
                with owner.mutex:
                    result = owner.file_history(query["project"], query["identifier"], query["file"],
                                                int(query.get("offset", "0")), int(query.get("limit", "50")))
                self.respond(200, result)
            elif path == "/download/file-receipt":
                with owner.mutex:
                    result = owner.file_receipt(query["project"], query["id"])
                self.respond(200, result, download="tind-file-observation.json")
            elif path == "/api/source-cases":
                with owner.mutex:
                    result = list_collections(owner, query["project"], int(query.get("offset", "0")), int(query.get("limit", "50")))
                self.respond(200, result)
            elif path == "/api/source-case":
                with owner.mutex:
                    result = view_collection(owner, query["project"], query["id"])
                self.respond(200, result)
            elif path == "/api/source-case-reviews":
                with owner.mutex:
                    result = reviews(owner, query["project"], query["id"], int(query.get("offset", "0")), int(query.get("limit", "50")))
                self.respond(200, result)
            elif path == "/download/source-cases":
                with owner.mutex:
                    item, _ = collection(owner, query["project"], query["id"])
                    result = owner.object_path(item["original"]).read_bytes()
                self.respond(200, result, download="tind-source-cases.json")
            elif path == "/download/source-case-review":
                with owner.mutex:
                    result = review_document(owner, query["project"], query["id"])
                self.respond(200, result, download="tind-source-case-review.json")
            elif path == "/api/record":
                with owner.mutex:
                    result = owner.preview(owner.project(query["project"]), query["identifier"])
                self.respond(200, result)
            elif path == "/api/original":
                with owner.mutex:
                    result = owner.ws.observation(query["observation"])
                self.respond(200, result)
            elif path == "/download/record":
                with owner.mutex:
                    result = owner.preview(owner.project(query["project"]), query["identifier"])
                self.respond(200, result, download="tind-working-record.json")
            elif path == "/download/batch":
                self.download(lambda file: owner.export_batch(query["batch"], file), "tind-" + query["batch"][:16] + ".zip")
            elif path == "/download/handover":
                self.download(lambda file: owner.handover(file, include_files=query.get("files", "true") == "true"), "tind-editable-handover.zip")
            elif path == "/download/batch-file":
                with owner.mutex:
                    batch = owner.batch(query["batch"])
                    item = next((entry for entry in batch["files"] if entry["name"] == query["file"]), None)
                    if item is None:
                        raise InputError("Select a retained batch file")
                    content = owner.object_path(item).read_bytes()
                self.respond(200, content, "application/xml; charset=utf-8" if item["kind"] == "marcxml" else "application/x-ndjson; charset=utf-8", item["name"])
            else:
                self.respond(404, {"error": "Operator route was not found"})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except (InputError, OSError, ValueError, KeyError) as error:
            self.respond(400, {"error": str(error)})

    def download(self, create, filename):
        owner = self.server.workspace
        with tempfile.TemporaryDirectory(dir=owner.area / "tmp") as directory:
            path = Path(directory) / "download.zip"
            result = create(path)
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(result["bytes"]))
            self.send_header("Content-Disposition", 'attachment; filename="' + filename + '"')
            self.common_headers()
            self.end_headers()
            with path.open("rb") as source:
                shutil.copyfileobj(source, self.wfile, 1024 * 1024)

    def do_POST(self):
        if not self.require(write=True):
            return
        try:
            path, query = self.route()
            if self.headers.get("Transfer-Encoding"):
                raise InputError("Send the complete encoded save body with its byte length")
            raw_length = self.headers.get("Content-Length", "")
            if not raw_length.isdecimal() or not 0 < int(raw_length) <= MAX_JSON:
                raise InputError("The complete encoded request must fit within 8 MiB")
            if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
                raise InputError("Send application/json")
            data = self.rfile.read(int(raw_length))
            if len(data) != int(raw_length):
                raise InputError("The complete request body was not received")
            request = decode(data)
            if path == "/api/apply":
                result = self.server.workspace.apply(request)
                self.respond(200, result)
            elif path == "/api/source-cases/plan":
                if not isinstance(request, dict) or set(request) != {"projectId", "collectionId", "choices"}:
                    raise InputError("Choose the source collection and actual record identities")
                with self.server.workspace.mutex:
                    result = plan_many(self.server.workspace, request["projectId"], request["collectionId"], request["choices"])
                self.respond(200, result)
            elif path == "/api/native":
                result = self.server.job(request)
                self.respond(202, result)
            elif path == "/api/session":
                self.respond(200, {"ready": True})
            else:
                self.respond(404, {"error": "Operator route was not found"})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except (InputError, OSError, ValueError, KeyError) as error:
            self.respond(400, {"error": str(error)})

def serve(directory, port=0, expected_binding=None, startup_format=None):
    if type(port) is not int or not 0 <= port <= 65535:
        raise InputError("Choose a local port from 0 to 65535")
    binding = require_binding(directory, expected_binding)
    owner = Migration(directory)
    native_tables(owner)
    token = secrets.token_hex(16)
    server = Server(owner, port, binding, token)
    print(jbytes(server.announcement).decode(), end="", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        owner.close()
