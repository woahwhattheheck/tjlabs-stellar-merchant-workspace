"""Authenticated read/file views over the same original Dataverse evidence."""
from __future__ import annotations

import io
from dataverse_contract import require, json_bytes, identifier
from dataverse_workspace import NATIVE_PARENT_ACTIONS as ACTIONS, record, list_records, _parse_row
from dataverse_solution import compiler_contract

def _integer(query, name, default):
    value = query.get(name)
    if value is None:
        return default
    require(isinstance(value, str) and value.isascii() and value.isdigit()
            and (value == "0" or not value.startswith("0")) and len(value) <= 10,
            "ALM_QUERY", "Use an ordinary nonnegative integer for " + name + ".")
    return int(value)

def _file(workspace, body, filename):
    raw = json_bytes(body)
    uploaded = workspace.upload(io.BytesIO(raw), len(raw))
    path = workspace.object(uploaded["sha256"])
    return {"kind": "file", "path": path,
            "descriptor": {"bytes": uploaded["bytes"], "sha256": uploaded["sha256"], "filename": filename},
            "content_type": "application/json; charset=utf-8"}

def record_file(workspace, record_id):
    saved = record(workspace, record_id)
    return _file(workspace, saved, "Dataverse_Record_" + saved["id"] + ".json")

def record_view(workspace, record_id):
    saved = record(workspace, record_id)
    complete = record_file(workspace, record_id)
    value = saved["value"]
    return {"schema": "tjlabs.pmrs.dataverse-record-view/v1", "id": saved["id"], "kind": saved["kind"],
            "operationId": saved["operation_id"], "workspaceId": saved["workspace_id"],
            "portfolio": saved["portfolio"], "createdAt": saved["created_at"],
            "nativeId": value.get("id"), "nativeSchema": value.get("schema"),
            "state": value.get("state", "COMPLETE"), "file": complete["descriptor"],
            "completeRecordUrl": "/api/dataverse/record-file?id=" + saved["id"],
            "meaning": "Complete native values retain exact JSON numbers in the SHA-pinned original file."}

def evidence_file(workspace, operation_id, kind, key):
    identifier(operation_id, "key")
    mapping = {
        "native-request": ("dataverse_native_requests", "request_id"),
        "step": ("dataverse_steps", "key"),
        "event": ("dataverse_events", "sequence"),
    }
    require(kind in mapping, "ALM_EVIDENCE_KIND", "Select an original native-request, step or event.")
    if kind == "event":
        require(isinstance(key, str) and key.isascii() and key.isdigit() and len(key) <= 12 and int(key) > 0,
                "ALM_EVENT_SEQUENCE", "Select the original positive event sequence.")
        key = int(key)
    else:
        identifier(key, "key")
    table, field = mapping[kind]
    with workspace.reader() as db:
        row = db.execute("SELECT * FROM " + table + " WHERE operation_id=? AND " + field + "=?",
                         (operation_id, key)).fetchone()
        require(row is not None, "ALM_EVIDENCE_MISSING", "The original native evidence was not found.")
        value = dict(row)
        value["body"] = _parse_row(row)
    from dataverse_contract import identity
    if kind in ("event", "step"):
        require(identity(value["body"]) == value["sha256" if kind == "event" else "body_sha256"],
                "ALM_EVIDENCE_CHANGED", "The complete original evidence changed.")
    else:
        require(identity(value["body"]["intent"]) == value["intent_sha256"],
                "ALM_EVIDENCE_CHANGED", "The original native request intent changed.")
    return _file(workspace, value, "Dataverse_Evidence_" + identity(value) + ".json")

def events_view(workspace, operation_id, offset=0, limit=50):
    identifier(operation_id, "key")
    require(type(offset) is int and offset >= 0 and type(limit) is int and 1 <= limit <= 250,
            "ALM_PAGE", "Use an original 1–250 row page.")
    with workspace.reader() as db:
        count = db.execute("SELECT COUNT(*) FROM dataverse_events WHERE operation_id=?", (operation_id,)).fetchone()[0]
        rows = db.execute("SELECT sequence,sha256,body FROM dataverse_events WHERE operation_id=? ORDER BY sequence LIMIT ? OFFSET ?",
                          (operation_id, limit, offset)).fetchall()
    values = []
    for row in rows:
        body = _parse_row(row)
        from dataverse_contract import identity
        require(identity(body) == row["sha256"], "ALM_EVENT_CHANGED", "The retained original event changed.")
        values.append({"sequence": row["sequence"], "sha256": row["sha256"], "kind": body["kind"],
                       "recordedAt": body["recorded_at"], "previousSha256": body["previous_sha256"]})
    return {"rows": values, "total": count, "offset": offset,
            "nextOffset": offset + len(values) if offset + len(values) < count else None}

def read_http(workspace, path, query):
    if not path.startswith("/api/dataverse/"):
        return None
    if path == "/api/dataverse/schema":
        require(not query, "ALM_QUERY", "The contract route has no selectors.")
        return {"kind": "json", "value": {"actions": list(ACTIONS), "compiler": compiler_contract(),
                 "recordRowsMaximum": 250, "nativeRecords": "SHA-pinned complete JSON files; exact numeric text retained",
                 "deliveryFormats": ["managed", "unmanaged"], "receivedHistory": "original evidence; no provider replay"}}
    if path == "/api/dataverse/records":
        require(set(query) <= {"portfolioId", "revision", "kind", "offset", "limit"}, "ALM_QUERY", "Use documented native-record filters.")
        return {"kind": "json", "value": list_records(workspace, portfolio_id=query.get("portfolioId"),
            revision=_integer(query, "revision", None), kind=query.get("kind"),
            offset=_integer(query, "offset", 0), limit=_integer(query, "limit", 50))}
    if path in ("/api/dataverse/record", "/api/dataverse/record-file"):
        require(set(query) == {"id"}, "ALM_QUERY", "Select one original native record ID.")
        return (record_file(workspace, query["id"]) if path.endswith("-file")
                else {"kind": "json", "value": record_view(workspace, query["id"])})
    if path == "/api/dataverse/events":
        require(set(query) <= {"operationId", "offset", "limit"} and "operationId" in query,
                "ALM_QUERY", "Select one original native operation and page.")
        return {"kind": "json", "value": events_view(workspace, query["operationId"],
            _integer(query, "offset", 0), _integer(query, "limit", 50))}
    if path == "/api/dataverse/evidence":
        require(set(query) == {"operationId", "kind", "key"}, "ALM_QUERY", "Select the exact original native evidence key.")
        return evidence_file(workspace, query["operationId"], query["kind"], query["key"])
    if path == "/api/dataverse/delivery":
        require(set(query) == {"id"}, "ALM_QUERY", "Select the original completed handover record.")
        from dataverse_portable import delivery_file
        value = delivery_file(workspace, query["id"])
        return {"kind": "file", "path": value["path"],
                "descriptor": {k: value[k] for k in ("bytes", "sha256", "filename")}, "content_type": value["content_type"]}
    return None

def static_routes():
    return {}
