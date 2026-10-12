"""MIT. Saved publisher refresh on the original authenticated IATI HTTP server."""
from pathlib import Path
import os
import shutil

from refresh import InputError, KINDS, MAX_PACKET, page
from workspace import load_json
from publishing_http import integer, fields

PREFIX = "/api/iati/refresh/"


def paged(items, q):
    return page(items, integer(q.get("offset"), 0, 0), integer(q.get("limit"), 50),
                q.get("snapshot"))


def get(handler, path, q):
    if not path.startswith(PREFIX):
        return False
    route = path[len(PREFIX):]
    ws, work = handler.server.workspace, handler.server.workspace.refresh
    pages = {"offset", "limit", "snapshot"}
    if route == "context":
        fields(q, ()); handler._json(work.context())
    elif route == "status":
        fields(q, {"plan"}); handler._json(work.status(q["plan"]))
    elif route == "plans":
        fields(q, (), pages); handler._json(paged(work.plans(), q))
    elif route == "plan":
        fields(q, {"id"}, {"revision"}); handler._json(work.plan(q["id"], integer(q.get("revision"))))
    elif route == "history":
        fields(q, {"plan"}, pages); handler._json(paged(work.history(q["plan"]), q))
    elif route == "runs":
        fields(q, {"plan"}, pages); handler._json(paged(work.runs(q["plan"]), q))
    elif route == "run":
        fields(q, {"plan", "id"}, {"revision"}); handler._json(work.run(q["plan"], q["id"], integer(q.get("revision"))))
    elif route == "run-history":
        fields(q, {"plan", "id"}, pages); handler._json(paged(work.run_history(q["plan"], q["id"]), q))
    elif route == "request":
        fields(q, {"requestId"}); handler._json(work.request(q["requestId"]))
    elif route == "export":
        fields(q, {"plan"}, {"snapshot"})
        with ws.mutex, ws.scratch() as temp:
            target = temp / "IATI_Publisher_Refresh.zip"
            work.export(q["plan"], target, q.get("snapshot"))
            handler._download(target, target.name, "application/zip")
    else:
        handler._json({"error": "Unknown original publisher-refresh read"}, 404)
    return True


def post(handler, path):
    if not path.startswith(PREFIX):
        return False
    route = path[len(PREFIX):]
    ws, work = handler.server.workspace, handler.server.workspace.refresh
    if route == "receive":
        with ws.mutex, ws.scratch() as temp:
            target = temp / "publisher-refresh.zip"
            with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as stream:
                shutil.copyfileobj(handler._body(MAX_PACKET), stream, 65536)
                stream.flush(); os.fsync(stream.fileno())
            handler._json(work.receive(target), 201)
        return True
    payload = load_json(handler._body(131072).read())
    if not isinstance(payload, dict):
        raise InputError("Use the complete original refresh object")
    if route == "preview":
        handler._json(work.preview(payload))
    elif route == "resume":
        fields(payload, {"requestId"}); handler._json(work.resume(payload["requestId"]), 201)
    elif route in KINDS:
        handler._json(work.save(route, payload), 201)
    else:
        handler._json({"error": "Unknown original publisher-refresh action"}, 404)
    return True
