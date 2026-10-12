"""One local project operation surface shared by CLI, browser and native clients. MIT."""
from __future__ import annotations
import base64
import json
from pathlib import Path
from typing import Any
from dbt_core import Project
from dbt_store import ProjectError, require, hash_id, json_bytes, create_file, text
from dbt_portable import export_project, receive_project, file_digest

READ_ACTIONS = frozenset(("status", "binding", "artifacts", "artifact", "editions", "edition", "nodes", "node", "lineage", "compare", "reviews", "review", "object.describe", "object.read"))
WRITE_ACTIONS = frozenset(("import", "edition.create", "review.save", "result.bind", "report", "export", "receive"))
ACTIONS = READ_ACTIONS | WRITE_ACTIONS


def invoke(project: Project, action: str, input: dict | None = None, *, cancel=None) -> Any:
    require(action in ACTIONS and isinstance(input or {}, dict), "UNKNOWN_OPERATION")
    value = dict(input or {})
    if action == "binding":
        require(not value, "UNKNOWN_INPUT")
        from dbt_http import binding
        return binding(project)
    if action == "status":
        require(not value, "UNKNOWN_INPUT")
        return project.status()
    if action in ("artifacts", "editions"):
        require(not value, "UNKNOWN_INPUT")
        return getattr(project, action)()
    if action in ("artifact", "edition", "review"):
        require(set(value) == {"id"}, "UNKNOWN_INPUT")
        return getattr(project, action)(value["id"])
    if action == "reviews":
        require(set(value) <= {"name"}, "UNKNOWN_INPUT")
        return project.reviews(**value)
    if action in ("nodes", "node", "lineage"):
        eid = value.pop("edition")
        return getattr(project, action)(eid, **value)
    if action == "compare":
        return project.compare(**value)
    if action in ("object.describe", "object.read"):
        aid = hash_id(value.pop("sha256"))
        descriptor = project.verify_object(aid)
        if action == "object.describe":
            require(not value, "UNKNOWN_INPUT")
            return descriptor
        offset, limit = value.pop("offset", 0), value.pop("limit", 65536)
        require(not value and type(offset) is int and 0 <= offset <= descriptor["bytes"] and
                type(limit) is int and 1 <= limit <= 65536, "INVALID_READ_RANGE")
        from dbt_store import regular_open
        with regular_open(project.object_path(aid)) as src:
            src.seek(offset)
            body = src.read(limit)
        return {**descriptor, "offset": offset, "data_base64": base64.b64encode(body).decode("ascii"),
                "next_offset": offset + len(body) if offset + len(body) < descriptor["bytes"] else None}
    if action == "import":
        require(set(value) <= {"file", "expected_sha", "name"} and "file" in value, "UNKNOWN_INPUT")
        result = project.import_file(value["file"], value.get("expected_sha"), cancel)
        if value.get("name"):
            filename = text(value["name"], "filename", 256)
            # Human label only; digest and source bytes remain the identity.
            with project.transaction() as db:
                db.execute("UPDATE artifacts SET name=? WHERE id=?", (filename, result["id"]))
            result = project.artifact(result["id"])
        return result
    if action == "edition.create":
        return project.create_edition(**value)
    if action == "review.save":
        return project.save_review(**value)
    if action == "result.bind":
        return project.bind_result(**value)
    if action == "report":
        output = value.pop("output", None)
        body, mime = project.report(**value)
        descriptor = project.put_bytes(body, "dbt-review." + value.get("format", "json"))
        if output:
            create_file(Path(output).absolute(), body)
        return {**descriptor, "mime": mime, **({"path": str(Path(output).absolute())} if output else {})}
    if action == "export":
        require(set(value) <= {"output", "expected_archive_sha"} and "output" in value, "UNKNOWN_INPUT")
        result = export_project(project, **value)
        descriptor = project.put_file(result["path"], result["sha256"], cancel)
        return {**result, "object": descriptor}
    if action == "receive":
        require(set(value) == {"archive_file", "destination", "expected_sha"}, "UNKNOWN_INPUT")
        return receive_project(**value)
    raise ProjectError("UNKNOWN_OPERATION")
