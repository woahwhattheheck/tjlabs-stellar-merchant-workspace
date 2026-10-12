"""Local private operator for receiving, source review, watchlists and complete handover."""
from __future__ import annotations

import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import threading
from typing import Any
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import uuid

from .client import PaidReceiver, atomic_usdc, drain
from .delivery import export_workspace
from .model import WorkspaceError, decode, encode, error_details, now
from .workspace import Workspace


def retain_metadata(workspace: Workspace) -> dict[str, Any]:
    """Read only the provider's free public metadata endpoint."""
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, *_: Any, **__: Any) -> None:
            return None
    url = workspace.configuration["base"] + "/v1/meta"
    opener = build_opener(NoRedirect())
    try:
        response = opener.open(Request(url, headers={"Accept": "application/json", "Accept-Encoding": "identity"}), timeout=30)
    except HTTPError as error:
        response = error
    with response:
        ident = workspace.begin_response(None, url=url, status=response.status,
                                         headers=dict(response.headers), purpose="provider-meta")
        while chunk := response.read(65536):
            workspace.append(ident, chunk)
        retained = workspace.finish_response(ident)
    if retained["status"] != 200:
        raise WorkspaceError("METADATA_RESPONSE", f"The provider metadata returned HTTP {retained['status']}.")
    metadata = decode(workspace.body(ident))
    if not isinstance(metadata, dict) or not isinstance(metadata.get("data"), dict):
        raise WorkspaceError("METADATA_FORMAT", "The free metadata response does not contain a data object.")
    return {"response": retained, "data": metadata["data"]}


class Operator:
    def __init__(self, workspace: Workspace, *, port: int = 0, token: str | None = None,
                 receiver_factory: Any = PaidReceiver) -> None:
        self.workspace, self.token = workspace, token or secrets.token_urlsafe(32)
        self.receiver_factory = receiver_factory
        self._worker: threading.Thread | None = None
        self._cancel = threading.Event()
        self._mutex = threading.Lock()
        self.job: dict[str, Any] = {"state": "idle"}
        self.exports = workspace.root / "exports"
        self.exports.mkdir(exist_ok=True, mode=0o700)
        owner = self
        public = Path(__file__).parent / "public"

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_: Any) -> None:
                pass

            def authorized(self) -> bool:
                supplied = self.headers.get("Authorization", "")
                expected = "Bearer " + owner.token
                if not hmac.compare_digest(supplied.encode(), expected.encode()):
                    self.answer(401, {"error": "Open the private operator link from its receiving process."})
                    return False
                origin = self.headers.get("Origin")
                if origin and origin != owner.origin:
                    self.answer(403, {"error": "Use the operator's own page for this action."})
                    return False
                return True

            def headers_for(self, status: int, kind: str, length: int, filename: str | None = None) -> None:
                self.send_response(status)
                self.send_header("Content-Type", kind)
                self.send_header("Content-Length", str(length))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Referrer-Policy", "no-referrer")
                self.send_header("Content-Security-Policy",
                                 "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                                 "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
                if filename:
                    self.send_header("Content-Disposition", 'attachment; filename="' + filename + '"')
                self.end_headers()

            def answer(self, status: int, value: Any) -> None:
                body = (encode(value) + "\n").encode()
                self.headers_for(status, "application/json; charset=utf-8", len(body))
                self.wfile.write(body)

            def fail(self, error: Exception) -> None:
                self.answer(400, {"error": str(error), "code": getattr(error, "code", type(error).__name__)})

            def json_body(self) -> Any:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 <= length <= 2 * 1024 * 1024:
                    raise WorkspaceError("REQUEST_SIZE", "The operator request is too large.")
                if self.headers.get("Content-Type", "").split(";", 1)[0].strip() != "application/json":
                    raise WorkspaceError("REQUEST_TYPE", "Send this operation as JSON.")
                return decode(self.rfile.read(length))

            def do_GET(self) -> None:
                path = urlsplit(self.path)
                try:
                    if path.path == "/" or path.path in ("/assets/app.js", "/assets/style.css"):
                        file = public / ("index.html" if path.path == "/" else path.path.rsplit("/", 1)[1])
                        body = file.read_bytes()
                        kind = "text/html; charset=utf-8" if path.path == "/" else (
                            "text/javascript; charset=utf-8" if file.suffix == ".js" else "text/css; charset=utf-8")
                        self.headers_for(200, kind, len(body))
                        self.wfile.write(body)
                        return
                    if not self.authorized():
                        return
                    query = parse_qs(path.query)
                    if path.path == "/api/snapshot":
                        self.answer(200, owner.snapshot(query.get("edition", [None])[0]))
                    elif path.path == "/api/timeline":
                        snap = owner.workspace.snapshot(edition_id=query.get("edition", [None])[0], include_timelines=True)
                        self.answer(200, {"events": snap["timelines"].get(query.get("catalyst", [""])[0], [])})
                    elif path.path.startswith("/api/response/"):
                        ident = path.path.rsplit("/", 1)[1]
                        response = owner.workspace.freeze_response(ident)
                        length, hasher = 0, hashlib.sha256()
                        for chunk in owner.workspace.iter_body(ident, through_ordinal=response["last_chunk"]):
                            hasher.update(chunk)
                            length += len(chunk)
                        if length != response["length"] or (response["complete"] and hasher.hexdigest() != response["sha256"]):
                            raise WorkspaceError("RESPONSE_CHANGED", "The retained response failed verification.")
                        extension = "json" if response["complete"] else "partial"
                        self.headers_for(200, "application/octet-stream", length, "event-response." + extension)
                        for chunk in owner.workspace.iter_body(ident, through_ordinal=response["last_chunk"]):
                            self.wfile.write(chunk)
                    elif path.path.startswith("/api/export/"):
                        name = path.path.rsplit("/", 1)[1]
                        file = owner.exports / name
                        if not name.startswith("event-workspace-") or not name.endswith(".zip") or not file.is_file() or file.is_symlink():
                            raise WorkspaceError("EXPORT_NOT_FOUND", "The retained export is not present.")
                        self.headers_for(200, "application/zip", file.stat().st_size, name)
                        with file.open("rb") as stream:
                            while chunk := stream.read(65536):
                                self.wfile.write(chunk)
                    else:
                        self.answer(404, {"error": "The requested operator page is not present."})
                except (BrokenPipeError, ConnectionResetError):
                    return
                except Exception as error:
                    self.fail(error)

            def do_POST(self) -> None:
                if not self.authorized():
                    return
                try:
                    body = self.json_body()
                    if not isinstance(body, dict):
                        raise WorkspaceError("REQUEST_BODY", "The operation must be an object.")
                    path = urlsplit(self.path).path
                    if path == "/api/watchlist":
                        self.answer(200, {"watchlist": owner.workspace.set_watchlist(body["tickers"])})
                    elif path == "/api/name":
                        owner.workspace.rename(body["name"])
                        self.answer(200, {"name": owner.workspace.configuration["name"]})
                    elif path == "/api/receive":
                        self.answer(202, owner.receive(
                            key=body.get("operation_key") or uuid.uuid4().hex,
                            max_pages=body["max_pages"], max_amount=atomic_usdc(body["max_usdc"]),
                            max_page_amount=atomic_usdc(body.get("max_page_usdc", "0.05")),
                            refresh=body.get("refresh", False)))
                    elif path == "/api/stop":
                        owner._cancel.set()
                        self.answer(200, {"state": "Stopping after the current response"})
                    elif path == "/api/replay":
                        self.answer(200, owner.workspace.replay(body.get("edition")))
                    elif path == "/api/preview":
                        self.answer(200, owner.workspace.preview(
                            body["body"].encode("utf-8"),
                            source_url=owner.workspace.configuration["base"] + "/v1/events/sample",
                            operation_key=body.get("operation_key", "provider-public-preview")))
                    elif path == "/api/metadata":
                        self.answer(200, retain_metadata(owner.workspace))
                    elif path == "/api/export":
                        name = "event-workspace-" + uuid.uuid4().hex + ".zip"
                        result = export_workspace(owner.workspace, owner.exports / name)
                        self.answer(200, {"filename": name, "bytes": result["bytes"], "sha256": result["sha256"],
                                          "members": result["members"], "download": "/api/export/" + name})
                    else:
                        self.answer(404, {"error": "The requested operation is not present."})
                except (BrokenPipeError, ConnectionResetError):
                    return
                except Exception as error:
                    self.fail(error)

        self.server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.server.daemon_threads = True
        self.origin = "http://127.0.0.1:" + str(self.server.server_port)
        self.url = self.origin + "/#token=" + self.token
        self._thread: threading.Thread | None = None

    def snapshot(self, edition: str | None = None) -> dict[str, Any]:
        snapshot = self.workspace.snapshot(edition_id=edition)
        snapshot["job"] = dict(self.job)
        snapshot["payment_ready"] = bool(os.environ.get("PAYER_PRIVATE_KEY")) or self.receiver_factory is not PaidReceiver
        snapshot["exports"] = [
            {"filename": file.name, "bytes": file.stat().st_size, "download": "/api/export/" + file.name}
            for file in sorted(self.exports.glob("event-workspace-*.zip"))
            if file.is_file() and not file.is_symlink()
        ]
        metadata = next((r for r in reversed(snapshot["responses"]) if
                         r["purpose"] == "provider-meta" and r["complete"] and r["status"] == 200), None)
        if metadata:
            try:
                snapshot["provider"] = decode(self.workspace.body(metadata["id"]))["data"]
            except (ValueError, KeyError, TypeError):
                pass
        return snapshot

    def receive(self, *, key: str, max_pages: int, max_amount: int,
                max_page_amount: int, refresh: bool) -> dict[str, Any]:
        with self._mutex:
            if self._worker is not None and self._worker.is_alive():
                if self.job.get("operation") == key:
                    return dict(self.job)
                raise WorkspaceError("RECEIVER_ACTIVE", "A receiving operation is already running.")
            self._cancel.clear()
            self.job = {"state": "receiving", "operation": key, "started": now()}

            def work() -> None:
                try:
                    with self.receiver_factory(self.workspace) as receiver:
                        result = drain(self.workspace, receiver, operation_key=key, max_pages=max_pages,
                                       max_amount=max_amount, max_page_amount=max_page_amount,
                                       refresh=refresh, cancelled=self._cancel)
                    self.job = {"state": result["run"]["state"], "operation": key, "result": result, "finished": now()}
                except Exception as error:
                    self.job = {"state": "failed", "operation": key, "error": str(error),
                                "code": getattr(error, "code", type(error).__name__), "finished": now()}

            self._worker = threading.Thread(target=work, name="event-receiver", daemon=False)
            self._worker.start()
            return dict(self.job)

    def start(self) -> "Operator":
        self._thread = threading.Thread(target=self.server.serve_forever, name="event-operator", daemon=True)
        self._thread.start()
        return self

    def close(self) -> None:
        self._cancel.set()
        if self._thread:
            self.server.shutdown()
            self._thread.join(5)
        self.server.server_close()
        if self._worker and self._worker.is_alive():
            self._worker.join(70)

    def __enter__(self) -> "Operator":
        return self.start()

    def __exit__(self, *_: Any) -> None:
        self.close()
