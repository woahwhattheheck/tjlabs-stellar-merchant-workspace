"""Private local browser, large-file intake and original BLS operating API."""
from __future__ import annotations
import contextlib
import hashlib
import hmac
import json
import mimetypes
import os
from pathlib import Path
import secrets
import signal
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
from model import HERE, SCHEMA, encoded, identifier, require, write_json, read_json, file_pin, atomic_bytes
from managed import binding, STARTUP_SCHEMA

REQUEST_LIMIT = 8 * 1024**2
UPLOAD_LIMIT = 8 * 1024**3
ASSETS = {"/": ("index.html", "text/html; charset=utf-8"),
          "/browser.mjs": ("browser.mjs", "text/javascript; charset=utf-8"),
          "/regional-browser.mjs": ("regional-browser.mjs", "text/javascript; charset=utf-8"),
          "/regional-chart.mjs": ("regional-chart.mjs", "text/javascript; charset=utf-8"),
          "/regional-guide.md": ("REGIONAL_ANALYSIS.md", "text/plain; charset=utf-8"),
          "/style.css": ("style.css", "text/css; charset=utf-8")}


def serve(workspace, port=0, expected_binding=None):
    selected = binding(workspace.directory)
    require(expected_binding is None or selected["sha256"] == expected_binding,
            "The original source or workspace changed after application review.")
    token = secrets.token_hex(16)
    instance_id = secrets.token_hex(16)
    upload_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def setup(self):
            super().setup()
            self.connection.settimeout(60)

        def log_message(self, *_):
            return

        def response(self, status, body, content_type="application/json; charset=utf-8", filename=None):
            raw = body if isinstance(body, bytes) else (encoded(body) + "\n").encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            self.send_header("X-BLS-Instance", instance_id)
            if filename:
                self.send_header("Content-Disposition", 'attachment; filename="' + filename.replace('"', "") + '"')
            self.end_headers()
            self.wfile.write(raw)

        def route(self):
            require(len(self.path.encode("utf-8")) <= 65536, "The query is too long.")
            parsed = urlsplit(self.path)
            require(not parsed.scheme and not parsed.netloc, "Use the original local route.")
            query = parse_qs(parsed.query, keep_blank_values=True)
            require(all(len(values) == 1 for values in query.values()), "Duplicate query parameters.")
            return parsed.path, {key: values[0] for key, values in query.items()}

        def authenticate(self):
            require(not server.closing, "The original workspace listener is closing.")
            require(self.headers.get("Host") == origin.split("://", 1)[1], "Use the original local workspace address.")
            require(hmac.compare_digest(self.headers.get("X-BLS-Session", ""), token),
                    "Open this workspace from its current Applications link or connection file.")
            request_origin = self.headers.get("Origin")
            require(request_origin is None or request_origin == origin, "Use the original workspace origin.")

        def read_body(self, maximum=REQUEST_LIMIT):
            require(not self.headers.get("Transfer-Encoding"), "Use a complete request with its byte length.")
            raw_length = self.headers.get("Content-Length", "")
            require(raw_length.isdigit(), "The request byte length is required.")
            length = int(raw_length)
            require(length <= maximum, "The request exceeds its byte limit.")
            self.connection.settimeout(60)
            raw = self.rfile.read(length)
            require(len(raw) == length, "The original request ended before its complete body.")
            return raw

        def do_GET(self):
            try:
                path, query = self.route()
                if path in ASSETS:
                    name, media = ASSETS[path]
                    self.response(200, (HERE / name).read_bytes(), media)
                    return
                self.authenticate()
                if path == "/api/launch":
                    require(binding(workspace.directory)["sha256"] == selected["sha256"], "The original installed source changed; reopen its current listener.")
                    return self.response(200, announcement)
                if path == "/api/state":
                    return self.response(200, workspace.state(int(query.get("offset", "0")), int(query.get("limit", "100"))))
                if path == "/api/default-selection":
                    return self.response(200, workspace.contract["selection"])
                if path == "/api/edition":
                    return self.response(200, workspace.edition(query["id"]))
                if path == "/api/observations":
                    return self.response(200, workspace.observations(query["edition"], query["projection"],
                        json.loads(query.get("filters", "{}")), int(query.get("offset", "0")), int(query.get("limit", "100"))))
                if path == "/api/note":
                    return self.response(200, workspace.note(query["subject"]))
                if path == "/api/regional-definition":
                    return self.response(200, read_json(workspace.file("report", query["id"], "regional-definition.json")))
                if path == "/api/report":
                    return self.response(200, workspace.report_rows(query["id"], int(query.get("offset", "0")),
                                                                    int(query.get("limit", "100"))))
                if path == "/api/operation-lookup":
                    operation_id = identifier(query["id"])
                    with workspace.db_lock:
                        row = workspace.db.execute("SELECT id FROM operations WHERE id=?", (operation_id,)).fetchone()
                        found = {"found": False, "workspace_id": workspace.marker["workspace_id"]} if row is None else {
                            "found": True, "workspace_id": workspace.marker["workspace_id"],
                            "operation": workspace.operation(operation_id), "request": workspace.request(operation_id)}
                    return self.response(200, found)
                if path == "/api/operation":
                    return self.response(200, workspace.operation(query["id"]))
                if path == "/api/native-state":
                    return self.response(200, workspace.native_state(query["id"]))
                if path == "/api/request":
                    return self.response(200, workspace.request(query["id"]))
                if path == "/api/upload":
                    upload_id = identifier(query["id"])
                    receipt = read_json(workspace.directory / "outgoing" / "uploads" / (upload_id + ".json"))
                    require(file_pin(Path(receipt["path"]), maximum=UPLOAD_LIMIT) == {"bytes": receipt["bytes"], "sha256": receipt["sha256"]},
                            "The retained uploaded file changed.")
                    return self.response(200, receipt)
                if path == "/api/file":
                    file = workspace.file(query["kind"], query["id"], query.get("name", ""))
                    return self.send_file(file)
                self.response(404, {"error": "Unknown BLS workspace route."})
            except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
                self.response(400, {"error": str(error)})
            except BaseException as error:
                self.response(500, {"error": str(error)[:3000]})

        def do_POST(self):
            try:
                self.authenticate()
                path, query = self.route()
                require(not query and path in ("/api/operation", "/api/regional-definition/receive", "/api/native-stop"), "Use an original workspace route.")
                require(self.headers.get("Content-Type", "").split(";", 1)[0].strip() == "application/json",
                        "Use a JSON operation body.")
                request = json.loads(self.read_body().decode("utf-8"),
                                    parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON.")))
                require(not server.closing, "The original workspace listener is closing.")
                if path == "/api/native-stop":
                    require(isinstance(request, dict) and set(request) == {"id"}, "Select the original native operation.")
                    return self.response(200, workspace.stop_native_operation(request["id"]))
                require(binding(workspace.directory)["sha256"] == selected["sha256"], "The original installed source changed; reopen its current listener.")
                if path == "/api/regional-definition/receive":
                    from regional_workspace import definition_request
                    return self.response(200, definition_request(workspace, request))
                result = workspace.begin(request, background=True)
                self.response(200 if result["state"] == "complete" else 202, result)
            except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
                self.close_connection = True
                self.response(409, {"error": str(error)})
            except BaseException as error:
                self.response(500, {"error": str(error)[:3000]})

        def do_PUT(self):
            acquired = False
            temporary = None
            try:
                self.authenticate()
                path, query = self.route()
                require(path == "/api/upload" and set(query) <= {"id", "name"} and "id" in query,
                        "Use an original upload ID and optional filename.")
                upload_id = identifier(query["id"])
                require(not self.headers.get("Transfer-Encoding"), "A complete file upload requires its byte length.")
                raw_length = self.headers.get("Content-Length", "")
                require(raw_length.isdigit() and 0 < int(raw_length) <= UPLOAD_LIMIT, "Select a complete file up to 8 GiB.")
                length = int(raw_length)
                expected_sha256 = self.headers.get("X-Content-SHA256")
                require(expected_sha256 is None or len(expected_sha256) == 64 and all(c in "0123456789abcdef" for c in expected_sha256),
                        "Supply the original complete upload SHA-256.")
                acquired = upload_lock.acquire(blocking=False)
                require(acquired, "The original source upload is still running.")
                root = workspace.directory / "outgoing" / "uploads"
                root.mkdir(mode=0o700, parents=True, exist_ok=True)
                destination = root / (upload_id + ".bin")
                temporary = root / (upload_id + ".partial")
                self.connection.settimeout(60)
                digest, remaining = hashlib.sha256(), length
                descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0), 0o600)
                with os.fdopen(descriptor, "wb") as output:
                    while remaining:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        require(bool(chunk), "The original source upload ended early; retry the same upload ID and file.")
                        output.write(chunk)
                        digest.update(chunk)
                        remaining -= len(chunk)
                    output.flush()
                    os.fsync(output.fileno())
                pin = {"bytes": length, "sha256": digest.hexdigest()}
                require(expected_sha256 is None or pin["sha256"] == expected_sha256,
                        "The original upload differs from its selected source SHA-256.")
                if destination.exists():
                    require(file_pin(destination, maximum=UPLOAD_LIMIT) == pin, "That upload ID belongs to different original file bytes.")
                    temporary.unlink()
                else:
                    os.replace(temporary, destination)
                temporary = None
                receipt = {"id": upload_id, "name": query.get("name", ""), "path": str(destination), **pin}
                require(len(receipt["name"]) <= 500, "The filename is too long.")
                write_json(root / (upload_id + ".json"), receipt)
                self.response(201, receipt)
            except (ValueError, OSError, KeyError) as error:
                self.close_connection = True
                self.response(409, {"error": str(error)})
            finally:
                if temporary:
                    temporary.unlink(missing_ok=True)
                if acquired:
                    upload_lock.release()

        def send_file(self, file):
            pin = file_pin(file, maximum=UPLOAD_LIMIT)
            length = pin["bytes"]
            media = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", media)
            self.send_header("Content-Length", str(length))
            self.send_header("X-Content-SHA256", pin["sha256"])
            self.send_header("Content-Disposition", 'attachment; filename="' + file.name.replace('"', "") + '"')
            self.send_header("X-BLS-Instance", instance_id)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            with file.open("rb") as source:
                while True:
                    data = source.read(1024 * 1024)
                    if not data:
                        break
                    self.wfile.write(data)

    class Server(ThreadingHTTPServer):
        daemon_threads = False
        block_on_close = True
        closing = False

    server = Server(("127.0.0.1", port), Handler)
    origin = "http://127.0.0.1:" + str(server.server_address[1])
    console = origin + "/#" + token
    announcement = {"schema": STARTUP_SCHEMA, "status": "BLS_WORKSPACE_READY", "workspace": str(workspace.directory),
                    "workspaceId": workspace.marker["workspace_id"], "instanceId": instance_id, "pid": os.getpid(),
                    "bindingSha256": selected["sha256"], "sourceRoot": selected["sourceRoot"],
                    "python": selected["python"], "url": console, "console": console}
    connection_path = workspace.directory / "bls.connection.json"
    write_json(connection_path, {"schema": "stellar-forge.bls-workspace-connection.v1",
                                 "workspaceId": workspace.marker["workspace_id"], "instanceId": instance_id,
                                 "origin": origin, "token": token, "workspace": str(workspace.directory),
                                 "bindingSha256": selected["sha256"], "pid": os.getpid(), "launch": announcement})
    print(encoded(announcement), flush=True)
    def shutdown(_signal, _frame):
        server.closing = True
        threading.Thread(target=server.shutdown, name="bls-shutdown", daemon=True).start()
    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGTERM, shutdown)
        signal.signal(signal.SIGINT, shutdown)
    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        server.closing = True
        try:
            server.server_close()
            try:
                current = read_json(connection_path)
                if current.get("instanceId") == instance_id and current.get("token") == token:
                    connection_path.unlink(missing_ok=True)
            except FileNotFoundError:
                pass
        finally:
            workspace.close()
