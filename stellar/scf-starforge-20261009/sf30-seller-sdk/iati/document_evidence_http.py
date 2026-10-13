"""MIT. Document evidence on the original private authenticated IATI server."""
from __future__ import annotations
import os
import shutil
from iati_source import InputError
from workspace import file_digest, load_json
from organisation_http import fields, integer
from document_evidence.operating_source import operating_source

PREFIX = "/api/iati/document-evidence/"
MAX_METADATA = 64 * 1024 * 1024
MAX_PACKET = 4 * 1024 * 1024 * 1024


def get(handler, path, query):
    if not path.startswith(PREFIX):
        return False
    route, workspace = path[len(PREFIX):], handler.server.workspace
    work = workspace.document_evidence
    if route == "status":
        fields(query)
        handler._json(work.status())
    elif route == "request":
        fields(query, {"requestId"})
        handler._json(work.request(query["requestId"]))
    elif route in {"observation", "comparison", "history"}:
        fields(query, {"id"})
        result = getattr(work, route)(query["id"])
        handler._json({"history": result} if route == "history" else result)
    elif route == "operating-source":
        fields(query, {"id"}, {"revision"})
        handler._json(operating_source(work, query["id"], integer(query.get("revision"))))
    elif route == "plan":
        fields(query, {"id"}, {"revision"})
        handler._json(work.plan(query["id"], integer(query.get("revision"))))
    elif route in {"rows", "detail"}:
        fields(query, {"id", "revision"} | ({"rowId"} if route == "detail" else set()),
            {"expectedSnapshot"} | ({"offset", "limit"} if route == "rows" else set()))
        value = {**query, "revision": integer(query["revision"])}
        if route == "rows":
            value["offset"] = integer(query.get("offset"), 0, 0)
            value["limit"] = integer(query.get("limit"), 100, 1, 500)
        handler._json(getattr(work, route)(value))
    elif route == "correction":
        fields(query, {"id", "revision"})
        handler._json(work.correction(query["id"], integer(query["revision"])))
    elif route == "body":
        fields(query, {"observationId"})
        handler._download_original(work.body(query["observationId"]))
    elif route == "file":
        fields(query, {"id", "revision", "kind"})
        handler._download_original(work.file({**query, "revision": integer(query["revision"])}))
    elif route == "export":
        fields(query, {"id"}, {"revision"})
        with workspace.mutex, workspace.scratch() as temporary:
            path = temporary / "IATI_Document_Evidence.zip"
            value = {"id": query["id"], "output": path}
            if "revision" in query:
                value["revision"] = integer(query["revision"])
            result = work.export(value)
            handler._download_original({"path": path, "name": path.name, "media": "application/zip",
                                        "bytes": result["bytes"], "sha256": result["sha256"]})
    else:
        handler._json({"error": "Unknown document-evidence read"}, 404)
    return True


def post(handler, path):
    if not path.startswith(PREFIX):
        return False
    route, workspace = path[len(PREFIX):], handler.server.workspace
    work = workspace.document_evidence
    if route == "receive":
        with workspace.scratch() as temporary:
            path = temporary / "document-evidence.zip"
            with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
                shutil.copyfileobj(handler._body(MAX_PACKET), output, 65536)
                output.flush()
                os.fsync(output.fileno())
            handler._json(work.receive({"path": path}), 201)
        return True
    if route not in {"save", "note", "observe", "review", "compare"}:
        handler._json({"error": "Unknown document-evidence action"}, 404)
        return True
    value = load_json(handler._body(MAX_METADATA).read())
    if not isinstance(value, dict):
        raise InputError("Use the complete original document-evidence action object")
    # Observe reserves under the original mutex, releases it for its one public
    # request and reacquires it to commit. Do not hold an outer HTTP mutex while
    # fetching: status/request and stop-after-current controls must stay usable.
    result = getattr(work, route)(value)
    handler._json(result, 202 if isinstance(result, dict) and result.get("state") == "ACQUIRING" else 201)
    return True
