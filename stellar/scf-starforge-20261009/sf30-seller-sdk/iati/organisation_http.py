"""MIT. Organisation planning on the original authenticated IATI HTTP server."""
from __future__ import annotations
from pathlib import Path
import shutil
from iati_source import InputError
from workspace import file_digest, load_json

PREFIX = "/api/iati/organisation/"
MAX_METADATA = 64 * 1024 * 1024
MAX_PACKET = 4 * 1024 * 1024 * 1024


def fields(value, required=(), optional=()):
    if not set(required) <= set(value) or set(value) - set(required) - set(optional):
        raise InputError("Select the complete organisation route fields")


def integer(value, default=None, minimum=1, maximum=None):
    if value is None:
        return default
    if (not isinstance(value, str) or not value.isascii() or not value.isdecimal()
            or str(int(value)) != value or int(value) < minimum
            or maximum is not None and int(value) > maximum):
        raise InputError("Use an exact organisation page or revision number")
    return int(value)


def selection(value, *, detail=False):
    required = {"rowId"} if detail else {"section"}
    optional = {"sourceId", "id", "revision", "view", "organisationKey", "expectedSnapshot"}
    if detail:
        optional.add("targetId")
    if not detail:
        optional |= {"offset", "limit"}
    fields(value, required, optional)
    if "sourceId" in value:
        if "id" in value or "revision" in value:
            raise InputError("Select one original source or one saved plan revision")
    elif "id" not in value or "revision" not in value:
        raise InputError("Select the exact saved plan and revision")
    result = dict(value)
    if "revision" in result:
        result["revision"] = integer(result["revision"])
    if not detail:
        result["offset"] = integer(result.get("offset"), 0, 0)
        result["limit"] = integer(result.get("limit"), 50, 1, 250)
    return result


def get(handler, path, query):
    if not path.startswith(PREFIX):
        return False
    route = path[len(PREFIX):]
    workspace = handler.server.workspace
    work = workspace.organisation
    with workspace.mutex:
        if route == "status":
            fields(query)
            handler._json(work.status())
        elif route == "profile":
            fields(query, {"sourceId"})
            handler._json(work.profile(query["sourceId"]))
        elif route == "request":
            fields(query, {"requestId"})
            handler._json(work.request(query["requestId"]))
        elif route == "plan":
            fields(query, {"id"}, {"revision"})
            handler._json(work.plan(query["id"], integer(query.get("revision"))))
        elif route == "history":
            fields(query, {"id"})
            handler._json({"history": work.history(query["id"])})
        elif route == "rows":
            handler._json(work.rows(selection(query)))
        elif route == "detail":
            handler._json(work.detail(selection(query, detail=True)))
        elif route == "export":
            fields(query, {"id"}, {"revision"})
            with workspace.scratch() as temporary:
                target = temporary / "IATI_Organisation_Planning.zip"
                value = {"id": query["id"], "output": target}
                if "revision" in query:
                    value["revision"] = integer(query["revision"])
                work.export(value)
                handler._download_original({
                    "path": target, "name": target.name, "media": "application/zip",
                    "bytes": target.stat().st_size, "sha256": file_digest(target, MAX_PACKET),
                })
        elif route == "file":
            fields(query, {"id", "kind"}, {"revision"})
            value = dict(query)
            if "revision" in value:
                value["revision"] = integer(value["revision"])
            handler._download_original(work.file(value))
        else:
            handler._json({"error": "Unknown organisation planning read"}, 404)
    return True


def post(handler, path):
    if not path.startswith(PREFIX):
        return False
    route = path[len(PREFIX):]
    workspace = handler.server.workspace
    work = workspace.organisation
    if route == "receive":
        with workspace.mutex, workspace.scratch() as temporary:
            target = temporary / "organisation-planning.zip"
            with target.open("xb") as stream:
                target.chmod(0o600)
                shutil.copyfileobj(handler._body(MAX_PACKET), stream, 65536)
            handler._json(work.receive({"path": target}), 201)
        return True
    actions = {"save": work.save, "review": work.review, "release": work.release, "compare": work.compare}
    if route not in actions:
        handler._json({"error": "Unknown organisation planning action"}, 404)
        return True
    value = load_json(handler._body(MAX_METADATA).read())
    if not isinstance(value, dict):
        raise InputError("Use a complete organisation action object")
    with workspace.mutex:
        handler._json(actions[route](value), 201)
    return True
