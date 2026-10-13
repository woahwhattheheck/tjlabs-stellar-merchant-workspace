"""MIT. AMP commissioning in the original IATI HTTP handler."""
from __future__ import annotations
from pathlib import Path
import shutil
from iati_source import InputError
from workspace import file_digest
from amp.codec import loads, fields, integer, MAX_JSON

PREFIX = "/api/iati/amp/"
MAX_PACKET = 4 * 1024 * 1024 * 1024


def number(raw, default=None, minimum=1, maximum=2**63 - 1):
    if raw is None:
        return default
    if not isinstance(raw, str) or not raw.isascii() or not raw.isdecimal() or str(int(raw)) != raw:
        raise InputError("Use an exact original AMP revision or page number")
    return integer(int(raw), "AMP selection", minimum, maximum)


def get(handler, path, query):
    if not path.startswith(PREFIX):
        return False
    route, work = path[len(PREFIX):], handler.server.workspace.amp
    if route == "status":
        fields(query); handler._json(work.status())
    elif route == "capture":
        fields(query, {"id"}); handler._json(work.capture(query["id"]))
    elif route == "plan":
        fields(query, {"id"}, {"revision"})
        handler._json(work.plan(query["id"], number(query.get("revision"))))
    elif route == "history":
        fields(query, {"id"}); handler._json({"history": work.history(query["id"])})
    elif route == "rows":
        fields(query, {"id"}, {"revision", "offset", "limit", "state"})
        handler._json(work.rows(query["id"], number(query.get("revision")),
                                number(query.get("offset"), 0, 0, 1000000),
                                number(query.get("limit"), 50, 1, 250), query.get("state")))
    elif route == "runs":
        fields(query, (), {"id"}); handler._json({"runs": work.runs(query.get("id"))})
    elif route == "run":
        fields(query, {"id"}); handler._json(work.run(query["id"]))
    elif route == "events":
        fields(query, {"id"}, {"after", "limit"})
        handler._json(work.events(query["id"], number(query.get("after"), 0, 0),
                                  number(query.get("limit"), 100, 1, 250)))
    elif route == "request":
        fields(query, {"requestId"}); handler._json(work.request(query["requestId"]))
    elif route == "asset":
        fields(query, {"sha256"}); handler._download_original(work.asset(query["sha256"]))
    elif route == "file":
        fields(query, {"id", "kind"}, {"revision"})
        handler._download_original(work.file(query["id"], number(query.get("revision")), query["kind"]))
    elif route == "export":
        fields(query, {"id"}, {"revision"})
        ws = handler.server.workspace
        with ws.mutex, ws.scratch() as temporary:
            target = temporary / "AMP_Commissioning.zip"
            work.export(query["id"], target, number(query.get("revision")))
            handler._download_original({"path": target, "name": target.name, "media": "application/zip",
                                        "bytes": target.stat().st_size, "sha256": file_digest(target, MAX_PACKET)})
    else:
        handler._json({"error": "Unknown AMP commissioning read"}, 404)
    return True


def post(handler, path):
    if not path.startswith(PREFIX):
        return False
    route, ws = path[len(PREFIX):], handler.server.workspace
    work = ws.amp
    if route == "receive":
        with ws.mutex, ws.scratch() as temporary:
            target = temporary / "AMP_Commissioning.zip"
            with target.open("xb") as stream:
                target.chmod(0o600)
                shutil.copyfileobj(handler._body(MAX_PACKET), stream, 65536)
            handler._json(work.receive(target), 201)
        return True
    value = loads(handler._body(MAX_JSON).read())
    if not isinstance(value, dict):
        raise InputError("Use the complete original AMP action object")
    credentials = None
    if route in {"native/capture", "native/start", "native/continue", "native/reconcile"}:
        credentials = value.pop("credentials", None)
        if not isinstance(credentials, dict):
            raise InputError("Enter the existing installed AMP login for this native operation")
    try:
        if route == "capture":
            result = work.retain_capture(value)
        elif route == "plan":
            result = work.save(value)
        elif route == "decision/preview":
            result = work.decision_preview(value)
        elif route == "decision/apply":
            result = work.apply_decisions(value)
        elif route == "advance":
            result = work.advance(value)
        elif route == "review":
            result = work.review(value)
        elif route == "prepare":
            result = work.prepare(value)
        elif route == "native/capture":
            result = work.native_capture(value, credentials)
        elif route == "native/start":
            result = work.start_run(value)
            result = {**result, **work.launch(result["runId"], dict(credentials))}
        elif route == "native/continue":
            fields(value, {"runId"})
            result = work.launch(value["runId"], dict(credentials))
        elif route == "native/reconcile":
            result = work.reconcile(value, credentials)
        else:
            handler._json({"error": "Unknown AMP commissioning action"}, 404)
            return True
        handler._json(result, 201)
    finally:
        if credentials is not None:
            credentials.clear()
    return True
