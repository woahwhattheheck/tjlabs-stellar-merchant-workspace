"""Local industrial operator and gateway-side API for original source workflows."""
from __future__ import annotations

import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import secrets
import sys
import threading
from urllib.parse import parse_qs, quote, unquote, urlsplit
import webbrowser

from workflow_engine import (SCHEMA, Workflow, WorkflowError, atomic_json, canonical,
                             file_descriptor, read_json)

HERE = Path(__file__).resolve().parent
MAX_BODY = 32 * 1024 * 1024


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, workspace, configuration, port):
        self.workspace = Path(workspace).expanduser().absolute()
        self.configuration = configuration
        self.capability = secrets.token_urlsafe(32)
        self.jobs, self.job_lock = {}, threading.Lock()
        super().__init__(("127.0.0.1", port), Handler)
        self.origin = "http://127.0.0.1:" + str(self.server_port)

    def start_job(self, request_id, action, function):
        key = (request_id, action)
        with self.job_lock:
            running = self.jobs.get(key)
            if running is not None and running.is_alive():
                return False

            def operate():
                try:
                    with Workflow(self.workspace) as workflow:
                        function(workflow)
                except Exception as error:
                    print(canonical({"schema": SCHEMA, "requestId": request_id,
                                     "operation": action, "error": getattr(error, "code", type(error).__name__),
                                     "message": str(error)}), file=sys.stderr, flush=True)
                finally:
                    with self.job_lock:
                        self.jobs.pop(key, None)

            thread = threading.Thread(target=operate, name="source-workflow-" + action, daemon=True)
            self.jobs[key] = thread
            thread.start()
        return True


class Handler(BaseHTTPRequestHandler):
    server_version = "SourceWorkflow"
    sys_version = ""

    def log_message(self, *args):
        return

    def _headers(self, status, content_type, size):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; script-src 'self'; style-src 'self'; "
                         "object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

    def _json(self, value, status=200):
        raw = canonical(value).encode()
        self._headers(status, "application/json; charset=utf-8", len(raw))
        self.end_headers()
        self.wfile.write(raw)

    def _authorize(self):
        supplied = self.headers.get("X-Workflow-Capability", "")
        if not hmac.compare_digest(supplied, self.server.capability):
            raise WorkflowError("WORKFLOW_CAPABILITY", "Open this operator's complete original local URL.")
        origin = self.headers.get("Origin")
        if origin is not None and origin != self.server.origin:
            raise WorkflowError("WORKFLOW_ORIGIN", "Use the original local operator or configured server-to-server gateway.")
        if self.headers.get("Sec-Fetch-Site") in {"cross-site"}:
            raise WorkflowError("WORKFLOW_ORIGIN", "Open the original local operator.")

    def _body(self):
        length = self.headers.get("Content-Length", "")
        if not length.isdecimal() or not 0 < int(length) <= MAX_BODY:
            raise WorkflowError("WORKFLOW_REQUEST_SIZE", "Submit the original JSON request within the configured body size.")
        raw = self.rfile.read(int(length))
        if len(raw) != int(length):
            raise WorkflowError("WORKFLOW_REQUEST_INCOMPLETE", "Send the complete original request.")
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise WorkflowError("WORKFLOW_REQUEST_OBJECT", "Use an original JSON object.")
        return value

    def _parts(self):
        return [unquote(p) for p in urlsplit(self.path).path.split("/") if p]

    def _error(self, error):
        code = getattr(error, "code", type(error).__name__)
        status = 401 if code == "WORKFLOW_CAPABILITY" else 403 if code == "WORKFLOW_ORIGIN" else (
            404 if code in {"WORKFLOW_NOT_FOUND", "WORKFLOW_FILE_NOT_FOUND", "WORKFLOW_ROUTE"} else 409
            if code in {"WORKFLOW_RUNNING", "WORKFLOW_REQUEST_CHANGED", "WORKFLOW_CONFIGURATION_CHANGED"} else 400)
        self._json({"schema": SCHEMA, "error": code, "message": str(error),
                    "requestId": getattr(error, "request_id", None)}, status)

    def do_GET(self):
        try:
            path = urlsplit(self.path).path
            static = {"/": ("workflow_app.html", "text/html; charset=utf-8"),
                      "/workflow_app.mjs": ("workflow_app.mjs", "text/javascript; charset=utf-8"),
                      "/workflow_app.css": ("workflow_app.css", "text/css; charset=utf-8")}
            if path in static:
                name, kind = static[path]
                raw = (HERE / name).read_bytes()
                self._headers(200, kind, len(raw))
                self.end_headers()
                self.wfile.write(raw)
                return
            self._authorize()
            parts = self._parts()
            with Workflow(self.server.workspace) as workflow:
                if parts == ["api", "configuration"]:
                    cfg = self.server.configuration or {}
                    query = cfg.get("analysis", {}).get("query", {})
                    return self._json({"schema": SCHEMA, "configured": bool(cfg),
                                       "profile": cfg.get("profile"), "title": cfg.get("title", cfg.get("profile")),
                                       "sourceKind": cfg.get("source", {}).get("kind"),
                                       "query": {k: query[k] for k in ("name", "title", "sql", "parameterNames", "maxRows") if k in query},
                                       "sourceArchive": bool(cfg.get("sourceArchive")),
                                       "jms": bool(cfg.get("delivery", {}).get("jms")),
                                       "callback": bool(cfg.get("delivery", {}).get("callback"))})
                if parts == ["api", "requests"]:
                    return self._json(workflow.status())
                if parts == ["api", "inbox"]:
                    rows = workflow.db.execute(
                        "SELECT receipt_json FROM workflow_received_results ORDER BY received_at DESC").fetchall()
                    return self._json({"schema": SCHEMA, "results": [json.loads(r["receipt_json"]) for r in rows]})
                if len(parts) >= 3 and parts[:2] == ["api", "requests"]:
                    request_id = parts[2]
                    if len(parts) == 3:
                        history = parse_qs(urlsplit(self.path).query).get("history") == ["true"]
                        return self._json(workflow.status(request_id, history=history))
                    if len(parts) == 4 and parts[3] == "envelope":
                        return self._json(workflow.envelope(request_id))
                    if len(parts) == 5 and parts[3] == "files":
                        selected = workflow.original_file(request_id, parts[4])
                        file = file_descriptor(selected["path"], name=selected["name"],
                                               expected_sha256=selected["sha256"],
                                               expected_bytes=selected["bytes"])
                        kind = selected.get("contentType", "application/octet-stream")
                        if not isinstance(kind, str) or not re.fullmatch(r"[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+", kind):
                            kind = "application/octet-stream"
                        self._headers(200, kind, file["bytes"])
                        self.send_header("X-Content-SHA256", file["sha256"])
                        self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + quote(file["name"], safe=""))
                        self.end_headers()
                        with open(file["path"], "rb") as stream:
                            while block := stream.read(1024 * 1024):
                                self.wfile.write(block)
                        return
            raise WorkflowError("WORKFLOW_ROUTE", "Select an original workflow route.")
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as error:
            self._error(error)

    def do_POST(self):
        try:
            self._authorize()
            body, parts = self._body(), self._parts()
            with Workflow(self.server.workspace) as workflow:
                if parts == ["api", "requests"]:
                    return self._json(workflow.accept(body.get("request", body),
                                                      execution_id=body.get("executionId"),
                                                      transport=body.get("transport")), 201)
                if parts == ["api", "results"]:
                    return self._json(workflow.receive_result(body))
                if len(parts) != 4 or parts[:2] != ["api", "requests"]:
                    raise WorkflowError("WORKFLOW_ROUTE", "Select an original workflow operation.")
                request_id, action = parts[2], parts[3]
                row = workflow._row(request_id)
                if action == "run":
                    cfg = self.server.configuration
                    if cfg is None:
                        raise WorkflowError("WORKFLOW_CONFIGURATION", "Start this operator with its installed configuration.")
                    with workflow.lock(request_id):
                        workflow._bind(row, cfg)
                    self.server.start_job(request_id, "run", lambda w: w.run(request_id, cfg))
                    return self._json(workflow.status(request_id), 202)
                if action == "callback":
                    attempt = body.get("attemptId")
                    self.server.start_job(request_id, "callback", lambda w: w.callback(request_id, attempt))
                    return self._json(workflow.status(request_id), 202)
                if action == "publish":
                    return self._json(workflow.publish(request_id, body.get("attemptId")))
                if action == "published":
                    return self._json(workflow.published(request_id, body.get("attemptId"),
                                                         count=body.get("messagesCount"), response=body.get("response")))
                if action == "acknowledge":
                    return self._json(workflow.acknowledge(request_id, body))
                if action == "export":
                    name = "Source_Workflow_" + row["run_id"] + "_" + row["result_sha"][:12] + ".zip" if row["result_sha"] else None
                    if name is None:
                        raise WorkflowError("WORKFLOW_RESULT_PENDING", "Continue the native source and report operation.")
                    destination = workflow._directory(row) / "exports" / name
                    return self._json(workflow.export(request_id, destination))
            raise WorkflowError("WORKFLOW_ROUTE", "Select an original workflow operation.")
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as error:
            self._error(error)


def serve(workspace, *, configuration_path=None, port=0, open_browser=False):
    configuration = read_json(configuration_path) if configuration_path else None
    with Workflow(workspace):
        pass
    server = Server(workspace, configuration, port)
    launch = {"schema": SCHEMA, "url": server.origin + "/#" + server.capability,
              "workspace": str(server.workspace), "profile": (configuration or {}).get("profile")}
    atomic_json(server.workspace / "source-workflow-launch.json", launch)
    print(canonical(launch), flush=True)
    if open_browser:
        webbrowser.open(launch["url"])
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
