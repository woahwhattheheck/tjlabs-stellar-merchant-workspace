"""MIT. Financial reconciliation through the existing private IATI HTTP carrier."""
from pathlib import Path
import shutil
from organisation_http import integer
from organisation_reconciliation import fields
from workspace import load_json, file_digest
from iati_workspace import InputError, MAX_PACKET, MAX_METADATA

PREFIX = "/api/iati/reconciliation/"

def get(handler, path, query):
    if not path.startswith(PREFIX):
        return False
    action = path[len(PREFIX):]
    ws = handler.server.workspace
    work = ws.reconciliation
    with ws.mutex:
        if action == "status":
            fields(query)
            handler._json(work.status())
        elif action == "request":
            fields(query, {"requestId"})
            handler._json(work.request(query["requestId"]))
        elif action == "history":
            fields(query, {"id"})
            handler._json({"history": work.history(query["id"])})
        elif action == "plan":
            fields(query, {"id"}, {"revision"})
            handler._json(work.plan(query["id"], integer(query.get("revision"))))
        elif action == "rows":
            fields(query, {"id", "revision", "section"}, {"offset", "limit", "expectedSnapshot"})
            value = dict(query)
            value["revision"] = integer(value["revision"])
            value["offset"] = integer(value.get("offset"), 0, 0)
            value["limit"] = integer(value.get("limit"), 50, 1, 250)
            handler._json(work.rows(value))
        elif action == "file":
            fields(query, {"id", "kind"}, {"revision"})
            value = dict(query)
            if "revision" in value:
                value["revision"] = integer(value["revision"])
            handler._download_original(work.file(value))
        elif action == "export":
            fields(query, {"id"}, {"revision"})
            with ws.scratch() as temporary:
                target = temporary / "IATI_Financial_Comparison.zip"
                value = {"id": query["id"], "output": target}
                if "revision" in query:
                    value["revision"] = integer(query["revision"])
                work.export(value)
                handler._download_original({"path": target, "name": target.name, "media": "application/zip",
                    "bytes": target.stat().st_size, "sha256": file_digest(target, MAX_PACKET)})
        else:
            handler._json({"error": "Unknown IATI financial comparison read"}, 404)
    return True

def post(handler, path):
    if not path.startswith(PREFIX):
        return False
    action = path[len(PREFIX):]
    ws = handler.server.workspace
    work = ws.reconciliation
    if action == "receive":
        with ws.mutex, ws.scratch() as temporary:
            target = temporary / "financial-comparison.zip"
            with target.open("xb") as output:
                target.chmod(0o600)
                shutil.copyfileobj(handler._body(MAX_PACKET), output, 65536)
            handler._json(work.receive({"path": target}), 201)
        return True
    methods = {"catalog": work.catalog, "preview": work.preview, "save": work.save,
               "review": work.review, "compare": work.compare}
    if action not in methods:
        handler._json({"error": "Unknown IATI financial comparison action"}, 404)
        return True
    raw = load_json(handler._body(MAX_METADATA).read())
    if not isinstance(raw, dict):
        raise InputError("Use the complete financial comparison action object")
    handler._json(methods[action](raw), 200 if action in {"catalog", "preview", "compare"} else 201)
    return True
