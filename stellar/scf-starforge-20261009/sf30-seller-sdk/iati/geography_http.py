"""MIT. Geography review routes on the original authenticated IATI HTTP server."""
from __future__ import annotations

import os
from pathlib import Path
import shutil

from geography import exact_object
from iati_workspace import InputError, MAX_METADATA, MAX_PACKET
from workspace import load_json

PREFIX = "/api/iati/geography/"

def fields(value, required=(), optional=()):
    if not set(required) <= set(value) or set(value) - set(required) - set(optional):
        raise InputError("Select the documented complete geography route fields")

def integer(value, default=None, minimum=1, maximum=None):
    if value is None:
        return default
    if (not isinstance(value, str) or not value.isascii() or not value.isdecimal() or
            str(int(value)) != value or int(value) < minimum or
            maximum is not None and int(value) > maximum):
        raise InputError("Use an exact positive geography revision or page number")
    return int(value)

def get(handler, path, query):
    if not path.startswith(PREFIX):
        return False
    route = path[len(PREFIX):].split("/")
    work = handler.server.workspace.geography
    if route == ["state"]:
        fields(query)
        handler._json(work.state())
    elif len(route) == 2 and route[0] == "requests":
        fields(query)
        handler._json(work.request(route[1]))
    elif len(route) in {2, 3} and route[0] == "reviews":
        if len(route) == 2:
            fields(query, optional=("revision",))
            handler._json(work.review(route[1], integer(query.get("revision"))))
        elif route[2] == "history":
            fields(query, optional=("revision",))
            handler._json(work.history(route[1], integer(query.get("revision"))))
        elif route[2] == "report":
            fields(query, optional=("revision",))
            handler._json(work.report(route[1], integer(query.get("revision"))))
        else:
            handler._json({"error": "Unknown geography review read"}, 404)
    elif len(route) == 2 and route[0] == "comparisons":
        fields(query)
        handler._json(work.comparison(route[1]))
    elif len(route) == 3 and route[0] == "comparisons" and route[2] == "changes":
        fields(query, required=("native",), optional=("offset", "limit"))
        handler._json(work.changes(route[1], query["native"],
                                  integer(query.get("offset"), 0, 0),
                                  integer(query.get("limit"), 50, 1, 250)))
    elif len(route) == 2 and route[0] == "download":
        fields(query)
        value = work.download(route[1])
        handler._download_original({**value, "name": value["filename"], "media": value["contentType"]})
    else:
        handler._json({"error": "Unknown geography read"}, 404)
    return True

def post(handler, path):
    if not path.startswith(PREFIX):
        return False
    route = path[len(PREFIX):]
    workspace = handler.server.workspace
    work = workspace.geography
    media = handler.headers.get_content_type()
    if route == "receive" and media in {"application/zip", "application/octet-stream"}:
        with workspace.mutex, workspace.scratch() as temporary:
            path = temporary / "geography.zip"
            with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as stream:
                shutil.copyfileobj(handler._body(MAX_PACKET), stream, 65536)
                stream.flush(); os.fsync(stream.fileno())
            handler._json(work.receive({"path": path}), 201)
        return True
    actions = {"reviews": work.save, "rows": work.rows,
               "points": lambda value: work.rows(value, points=True),
               "compare": work.compare, "export": work.export, "receive": work.receive}
    if route not in actions:
        handler._json({"error": "Unknown geography action"}, 404)
        return True
    if media != "application/json":
        raise InputError("Send a complete geography JSON object, or upload an application/zip packet to receive")
    value = load_json(handler._body(MAX_METADATA).read())
    if not isinstance(value, dict):
        raise InputError("Use a complete geography action object")
    result = actions[route](value)
    handler._json(result, 200 if route in {"rows", "points"} else 201)
    return True
