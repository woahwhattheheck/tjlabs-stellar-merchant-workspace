"""MIT. Results routes within the existing authenticated IATI HTTP handler."""
from __future__ import annotations

import os
from pathlib import Path
import shutil

from iati_source import InputError
from workspace import load_json
from iati_workspace import MAX_PACKET
from . import get_results
from .workspace import MAX_BODY

PREFIX = "/api/iati/results"
ASSETS = {"/results.js": ("app.js", "text/javascript; charset=utf-8"),
          "/results.css": ("style.css", "text/css; charset=utf-8")}


def asset(handler, path):
    if path not in ASSETS:
        return False
    handler._gate(api=False)
    filename, media = ASSETS[path]
    data = (Path(__file__).resolve().parent / "ui" / filename).read_bytes()
    handler._headers(200, media, len(data))
    handler.wfile.write(data)
    return True


def number(raw, name, *, minimum=0):
    if not isinstance(raw, str) or not raw.isdecimal() or str(int(raw)) != raw or int(raw) < minimum:
        raise InputError("Use one original integer " + name)
    return int(raw)


def query_fields(q, allowed, required=()):
    if set(q) - set(allowed) or set(required) - set(q):
        raise InputError("Use the documented original results query fields")


def get(handler, path, q):
    if path != PREFIX and not path.startswith(PREFIX + "/"):
        return False
    handler._gate()
    api = get_results(handler.server.workspace)
    suffix = path[len(PREFIX):]
    if suffix in ("", "/inventory"):
        query_fields(q, ())
        handler._json(api.inventory())
    elif suffix == "/operation":
        query_fields(q, {"requestId"}, {"requestId"})
        handler._json(api.operation(q["requestId"]))
    elif suffix == "/indicators":
        query_fields(q, {"projection", "offset", "limit", "search", "measure"}, {"projection"})
        handler._json(api.browse(q["projection"], offset=number(q.get("offset", "0"), "offset"),
            limit=number(q.get("limit", "50"), "limit", minimum=1),
            search=q.get("search", ""), measure=q.get("measure", "")))
    elif suffix == "/indicator":
        query_fields(q, {"projection", "key"}, {"projection", "key"})
        handler._json(api.indicator(q["projection"], q["key"]))
    elif suffix == "/history":
        query_fields(q, {"id"}, {"id"})
        handler._json(api.history(q["id"]))
    elif suffix == "/comparisons":
        query_fields(q, {"id"}, {"id"})
        handler._json({"comparisons": api.comparisons(q["id"])})
    elif suffix in ("/project", "/report", "/export", "/report/export"):
        query_fields(q, {"id", "revision"}, {"id"})
        revision = number(q["revision"], "revision", minimum=1) if "revision" in q else None
        if suffix == "/project":
            handler._json(api.project(q["id"], revision))
        elif suffix == "/report":
            handler._json(api.report(q["id"], revision))
        else:
            with api.ws.mutex, api.ws.scratch() as temp:
                path_out = temp / ("iati-results-report.zip" if suffix == "/report/export" else "iati-results-project.zip")
                api.export(q["id"], path_out, revision, report_only=suffix == "/report/export")
                handler._download(path_out, path_out.name, "application/zip")
    elif suffix == "/source/download":
        query_fields(q, {"source"}, {"source"})
        handler._download(api._source_file(q["source"]), "iati-publisher-" + q["source"][:16] + ".xml",
                          "application/xml")
    else:
        handler._json({"error": "Unknown original results read"}, 404)
    return True


def post(handler, path):
    if not path.startswith(PREFIX + "/"):
        return False
    handler._gate()
    api = get_results(handler.server.workspace)
    suffix = path[len(PREFIX):]
    if suffix == "/receive":
        sha = handler.headers.get("X-IATI-Results-Sha256")
        raw_bytes = handler.headers.get("X-IATI-Results-Bytes")
        count = number(raw_bytes, "complete archive byte count") if raw_bytes is not None else None
        with api.ws.mutex, api.ws.scratch() as temp:
            original = temp / "received-results.zip"
            with original.open("xb") as out:
                os.chmod(original, 0o600)
                shutil.copyfileobj(handler._body(MAX_PACKET), out, 65536)
                out.flush()
                os.fsync(out.fileno())
            handler._json(api.receive(original, expected_sha256=sha, expected_bytes=count), 201)
        return True
    body = load_json(handler._body(MAX_BODY).read())
    if not isinstance(body, dict):
        raise InputError("Use an original results object payload")
    if suffix == "/source":
        if set(body) != {"source"}:
            raise InputError("Choose one complete original retained source")
        handler._json(api.project_source(body["source"]), 201)
    elif suffix == "/preview":
        handler._json(api.preview(body))
    elif suffix == "/cancel":
        handler._json(api.cancel(body), 201)
    elif suffix == "/save":
        handler._json(api.save(body), 201)
    elif suffix == "/compare":
        handler._json(api.compare(body), 201)
    elif suffix == "/adopt":
        handler._json(api.adopt(body), 201)
    else:
        handler._json({"error": "Unknown original results action"}, 404)
    return True
