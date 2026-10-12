"""Analytical workbook routes on the original private DuckDB operator."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote

from ..duckdb_dataset import _hex
from ..storage import read
from .contracts import fail, fields, integer, request_id
from .model import Analytics
from .package import export_report

BASE = "/api/analytics"
_ASSETS = {
    "/analytics": ("index.html", "text/html;charset=utf-8"),
    "/analytics/": ("index.html", "text/html;charset=utf-8"),
    "/analytics/app.js": ("app.js", "text/javascript;charset=utf-8"),
    "/analytics/style.css": ("style.css", "text/css;charset=utf-8"),
    "/analytics/OPERATING.md": ("OPERATING.md", "text/plain;charset=utf-8"),
}


def asset(path):
    selected = _ASSETS.get(path)
    if selected is None:
        return None
    name, mime = selected
    root = Path(__file__).parent
    path = root / name if name == "OPERATING.md" else root / "public" / name
    return read(path, 2 * 1024 * 1024), mime


def model(operator):
    return Analytics(operator.workspace)


def _parts(path):
    if not path.startswith(BASE + "/"):
        fail("ROUTE_NOT_FOUND")
    return [unquote(part) for part in path[len(BASE)+1:].split("/")]


def _parameters(parameters, allowed=()):
    if set(parameters) - set(allowed) or any(not isinstance(value, list) or len(value) != 1 for value in parameters.values()):
        fail("PARAMETERS_INVALID")
    return {key: value[0] for key, value in parameters.items()}


def _number(value):
    if not isinstance(value, str) or not value.isascii() or not value.isdigit() or len(value) > 12:
        fail("PARAMETERS_INVALID")
    return integer(int(value))


def _paging(values):
    return {"offset": _number(values.get("offset", "0")), "limit": _number(values.get("limit", "25"))}


def get(operator, path, parameters):
    parts, native = _parts(path), model(operator)
    if parts == ["status"]:
        _parameters(parameters)
        return native.status()
    kinds = {"analyses", "workbooks", "results", "comparisons", "reports", "operations"}
    if len(parts) == 1 and parts[0] in kinds:
        return native.catalog(parts[0], **_paging(_parameters(parameters, ("offset", "limit"))))
    if len(parts) == 2 and parts[0] in kinds - {"operations"}:
        values = _parameters(parameters, ("revision",) if parts[0] in {"analyses", "workbooks"} else ())
        revision = _number(values["revision"]) if "revision" in values else None
        return native.record(parts[0], parts[1], revision)
    if len(parts) == 3 and parts[0] in {"results", "comparisons"} and parts[2] == "rows":
        return native.grid(parts[0], parts[1], **_paging(_parameters(parameters, ("offset", "limit"))))
    if len(parts) == 2 and parts[0] == "sources":
        values = _parameters(parameters, ("column", "offset", "limit"))
        return native.source(parts[1], column=values.get("column"), **_paging(values))
    if len(parts) == 2 and parts[0] == "requests":
        _parameters(parameters)
        return native.request(parts[1])
    fail("ROUTE_NOT_FOUND")


def validate_export(body):
    fields(body, ("request_id", "report_id"))
    request_id(body["request_id"])
    _hex(body["report_id"])


def export(operator, body, directory):
    validate_export(body)
    return export_report(operator.workspace, body, directory)


def perform(operator, path, body):
    parts, native = _parts(path), model(operator)
    if parts == ["review"]:
        fields(body, ("definition",))
        return native.review(body["definition"])
    if len(parts) == 1 and parts[0] in {"analyses", "run", "compare", "workbooks", "publish"}:
        return native.perform(parts[0], body)
    if len(parts) == 3 and parts[0] == "requests" and parts[2] == "resume":
        fields(body, ("workspace_id",))
        return native.resume(parts[1], body["workspace_id"])
    if parts == ["exports"]:
        return operator._retained_action(path, body)
    fail("ROUTE_NOT_FOUND")
