"""Commercial customer billing routes within the original authenticated HTTP server."""
from __future__ import annotations

import base64
import re
from urllib.parse import unquote

from model import Problem
from operations_commercial_adapter import commercial_store, CommercialConnectionAdapter

_CASE = re.compile(r"operation-[a-f0-9]{32}")
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}")


def handle(handler, parsed, operations, method):
    root = "/api/operations/"
    if not parsed.path.startswith(root):
        return False
    parts = [unquote(item) for item in parsed.path[len(root):].split("/")]
    if parts[0] == "commercial-connections":
        adapter = CommercialConnectionAdapter(operations.workspace)
        if len(parts) == 1 and method == "GET":
            result = adapter.endpoints()
        elif len(parts) == 1 and method == "POST":
            result = adapter.configure(handler.json_body())
        elif len(parts) == 3 and parts[2] == "customers" and method == "GET" and _ID.fullmatch(parts[1]):
            result = adapter("customers", {"endpointId": parts[1]})
        else:
            raise Problem("Commercial connection route not found.", 404, "NOT_FOUND")
        handler.send(200, result)
        return True
    if len(parts) < 2 or parts[1] != "commercial":
        return False
    if not _CASE.fullmatch(parts[0]) or any(not _ID.fullmatch(item) for item in parts[2:]):
        raise Problem("Commercial billing route not found.", 404, "NOT_FOUND")
    case_id, rest = parts[0], parts[2:]
    billing = commercial_store(operations)
    if method == "GET":
        if not rest:
            result = billing.list(case_id)
        elif len(rest) == 1:
            result = billing.get(case_id, rest[0])
        elif len(rest) == 2 and rest[1] == "export.zip":
            exported = billing.export_bundle(case_id, rest[0])
            raw = base64.b64decode(exported["contentBase64"], validate=True)
            handler.send(200, raw, exported["mediaType"], exported["filename"])
            return True
        else:
            raise Problem("Commercial billing page not found.", 404, "NOT_FOUND")
    elif method == "POST":
        body = handler.json_body()
        if len(rest) == 1 and rest[0] in ("schedule", "prepare"):
            result = getattr(billing, rest[0])(case_id, body)
        elif len(rest) == 2 and rest[1] == "refresh":
            result = billing.refresh(case_id, rest[0])
        elif len(rest) == 4 and rest[1] == "milestones" and rest[3] in ("draft", "preview", "issue"):
            operation = billing.preview_issue if rest[3] == "preview" else getattr(billing, rest[3])
            result = operation(case_id, rest[0], rest[2], body)
        else:
            raise Problem("Commercial billing operation not found.", 404, "NOT_FOUND")
    else:
        return False
    handler.send(200, result)
    return True
