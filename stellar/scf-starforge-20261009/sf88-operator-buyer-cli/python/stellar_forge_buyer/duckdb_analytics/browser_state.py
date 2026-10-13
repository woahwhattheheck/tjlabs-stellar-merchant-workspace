"""Saved complete browser workspaces inside the original analytical warehouse."""
from __future__ import annotations

from copy import deepcopy
import base64
import hashlib
import json

from ..duckdb_agent import read_identity
from ..duckdb_dataset import _hex, _json, _now
from ..storage import parse
from .contracts import SCHEMA, fail, fields, integer, page, request_id, text

STATE_SCHEMA = SCHEMA + ".browser-state"
RECORD_SCHEMA = SCHEMA + ".browser-workspace"
MAX_STATE_BYTES = 8 * 1024 * 1024
_TABLE = "sf_analytics_browser_workspaces"
_HISTORY = _TABLE + "_history"
_ACTIONS = {"analyses", "run", "compare", "workbooks", "publish", "exports", "browser-workspaces"}


def _bytes(value):
    try:
        raw = _json(value).encode("utf-8")
        # The native JSON encoder and strict parser reject non-finite numbers.
        json.dumps(value, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError, OverflowError, RecursionError, UnicodeError):
        fail("BROWSER_STATE_JSON_INVALID")
    if len(raw) > MAX_STATE_BYTES:
        fail("BROWSER_STATE_TOO_LARGE")
    return raw


def validate_state(value, workspace_id):
    """Retain incomplete raw controls; execution still uses the original review."""
    fields(value, ("schema", "workspace_id", "form", "rows", "pages", "context",
                   "selection", "pending", "receipts", "updated_at"))
    if value["schema"] != STATE_SCHEMA or value["workspace_id"] != request_id(workspace_id):
        fail("BROWSER_WORKSPACE_ID_CHANGED")
    for key in ("form", "rows", "context", "selection", "pending", "receipts"):
        if not isinstance(value[key], dict):
            fail("BROWSER_STATE_FIELDS_INVALID")
    if not isinstance(value["pages"], list):
        fail("BROWSER_STATE_PAGES_INVALID")
    for key in ("dimensions", "measures", "filters", "pivots"):
        if not isinstance(value["rows"].get(key), list):
            fail("BROWSER_STATE_ROWS_INVALID")
    for key, item in value["form"].items():
        if not isinstance(key, str) or not isinstance(item, (str, bool)):
            fail("BROWSER_STATE_CONTROL_INVALID")
    context = value["context"]
    fields(context, ("source_edition", "analysis_source_edition", "analysis", "analysis_expected", "workbook",
                     "workbook_expected", "analysis_baseline", "workbook_baseline", "review", "review_definition"))
    for key in ("source_edition", "analysis_source_edition"):
        if context[key] is not None:
            _hex(context[key])
    for key in ("analysis", "workbook"):
        retained = context[key]
        if retained is not None:
            if not isinstance(retained, dict):
                fail("BROWSER_STATE_CONTEXT_INVALID")
            _hex(retained.get("id"))
            integer(retained.get("revision"), 1)
    for key in ("analysis", "workbook"):
        baseline = context[key + "_baseline"]
        if baseline is not None:
            fields(baseline, ("id", "revision", "definition"))
            _hex(baseline["id"])
            integer(baseline["revision"], 1)
            if (not isinstance(baseline["definition"], dict) or context[key] is None
                    or baseline["id"] != context[key]["id"]
                    or baseline["revision"] != context[key]["revision"]):
                fail("BROWSER_STATE_BASELINE_INVALID")
    integer(context["analysis_expected"])
    integer(context["workbook_expected"])
    if context["review"] is not None and not isinstance(context["review"], dict):
        fail("BROWSER_STATE_REVIEW_INVALID")
    if context["review_definition"] is not None and not isinstance(context["review_definition"], dict):
        fail("BROWSER_STATE_REVIEW_INVALID")
    for identity, original in value["pending"].items():
        request_id(identity)
        if not isinstance(original, dict) or original.get("request_id") != identity:
            fail("BROWSER_ORIGINAL_REQUEST_INVALID")
        if original.get("route") not in {"/api/analytics/" + action for action in _ACTIONS}:
            fail("BROWSER_ORIGINAL_REQUEST_ROUTE_INVALID")
        if not isinstance(original.get("original"), dict):
            fail("BROWSER_ORIGINAL_REQUEST_INVALID")
        if not original.get("exported") and original["original"].get("workspace_id") != workspace_id:
            fail("BROWSER_ORIGINAL_REQUEST_WORKSPACE_CHANGED")
        # A saved workspace cannot recursively contain its own pending save.
        if original["route"] == "/api/analytics/browser-workspaces":
            fail("BROWSER_RECURSIVE_REQUEST_INVALID")
    text(value["updated_at"], maximum=100)
    _bytes(value)
    return deepcopy(value)


def _exists(db):
    return db.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name=?", [_TABLE]
    ).fetchone()[0] == 1


def _schema(db):
    db.execute("CREATE TABLE IF NOT EXISTS " + _TABLE
               + "(id VARCHAR PRIMARY KEY,title VARCHAR NOT NULL,revision BIGINT NOT NULL,"
                 "record VARCHAR NOT NULL,sha256 VARCHAR NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS " + _HISTORY
               + "(id VARCHAR,revision BIGINT,record VARCHAR NOT NULL,sha256 VARCHAR NOT NULL,"
                 "PRIMARY KEY(id,revision))")


def _read(db, identity, revision=None):
    request_id(identity)
    if not _exists(db):
        fail("BROWSER_WORKSPACE_NOT_FOUND")
    table, parameters = _TABLE, [identity]
    if revision is not None:
        integer(revision, 1)
        table = _HISTORY
        parameters.append(revision)
    row = db.execute("SELECT record,sha256 FROM " + table + " WHERE id=?"
                     + (" AND revision=?" if revision is not None else ""), parameters).fetchone()
    if row is None:
        fail("BROWSER_WORKSPACE_NOT_FOUND")
    if hashlib.sha256(row[0].encode("utf-8")).hexdigest() != row[1]:
        fail("BROWSER_WORKSPACE_RECORD_CHANGED")
    result = parse(row[0].encode("utf-8"))
    state = validate_state(result["state"], read_identity(db))
    raw = _bytes(state)
    if len(raw) != result["state_bytes"] or hashlib.sha256(raw).hexdigest() != result["state_sha256"]:
        fail("BROWSER_WORKSPACE_STATE_CHANGED")
    return result


def catalog(workspace, *, offset=0, limit=25):
    offset, limit = page(offset, limit)
    with workspace._guard(), workspace._connection() as db:
        rows, total = [], 0
        if _exists(db):
            total = db.execute("SELECT count(*) FROM " + _TABLE).fetchone()[0]
            identities = db.execute(
                "SELECT id FROM " + _TABLE + " ORDER BY id LIMIT ? OFFSET ?", [limit, offset]
            ).fetchall()
            for (identity,) in identities:
                record = _read(db, identity)
                rows.append({key: record[key] for key in
                             ("id", "title", "revision", "created_at", "updated_at",
                              "workspace_id", "state_sha256", "state_bytes")})
        return {"workspaces": rows, "offset": offset, "limit": limit, "total": total,
                "next_offset": offset + len(rows) if offset + len(rows) < total else None}


def read(workspace, identity, revision=None):
    with workspace._guard(), workspace._connection() as db:
        return _read(db, identity, revision)


def save(native, db, body):
    """Execute under Analytics._mutate's original guard, journal and transaction."""
    fields(body, ("request_id", "workspace_id", "id", "title", "expected_revision", "state"))
    identity = request_id(body["id"])
    workspace_id = read_identity(db)
    if body["workspace_id"] != workspace_id:
        fail("BROWSER_WORKSPACE_ID_CHANGED")
    title = text(body["title"], maximum=200)
    expected = integer(body["expected_revision"])
    state = validate_state(body["state"], workspace_id)
    raw = _bytes(state)
    _schema(db)
    present = db.execute("SELECT revision FROM " + _TABLE + " WHERE id=?", [identity]).fetchone()
    revision = present[0] if present else 0
    if expected != revision:
        fail("BROWSER_WORKSPACE_REVISION_CHANGED")
    previous = _read(db, identity) if present else None
    if previous and previous["title"] == title and previous["state"] == state:
        return {**previous, "file": file_metadata(previous)}
    now = _now()
    record = {"schema": RECORD_SCHEMA, "id": identity, "workspace_id": workspace_id,
              "title": title, "revision": revision + 1,
              "created_at": previous["created_at"] if previous else now, "updated_at": now,
              "state_sha256": hashlib.sha256(raw).hexdigest(), "state_bytes": len(raw), "state": state}
    encoded = _json(record)
    checksum = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    db.execute("INSERT INTO " + _TABLE + " VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
               "title=excluded.title,revision=excluded.revision,record=excluded.record,sha256=excluded.sha256",
               [identity, title, revision + 1, encoded, checksum])
    db.execute("INSERT INTO " + _HISTORY + " VALUES(?,?,?,?)",
               [identity, revision + 1, encoded, checksum])
    return {**record, "file": file_metadata(record)}

def _transfer(record):
    value = {"schema": SCHEMA + ".browser-transfer", "workspace_id": record["workspace_id"],
             "browser": {key: record[key] for key in ("id", "revision", "title")}, "state": record["state"]}
    return (_json(value) + "\n").encode("utf-8")


def file_metadata(record):
    raw = _transfer(record)
    return {"name": "browser-workspace-" + record["id"] + "-r" + str(record["revision"]) + ".json",
            "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
            "mime": "application/json", "id": record["id"], "revision": record["revision"],
            "workspace_id": record["workspace_id"]}


def file_part(workspace, identity, *, revision, sha256, offset=0, length=131072):
    """Read all saved raw controls through exact, bounded original-file chunks."""
    integer(revision, 1)
    integer(offset)
    integer(length, 1, 131072)
    # A literal SHA is checked, never recomputed from the caller's string.
    if not isinstance(sha256, str) or len(sha256) != 64:
        fail("BROWSER_FILE_SHA_REQUIRED")
    try:
        bytes.fromhex(sha256)
    except ValueError:
        fail("BROWSER_FILE_SHA_REQUIRED")
    with workspace._guard(), workspace._connection() as db:
        record = _read(db, identity, revision)
        raw = _transfer(record)
        metadata = file_metadata(record)
        if metadata["sha256"] != sha256:
            fail("BROWSER_FILE_CHANGED")
        if offset > len(raw):
            fail("BROWSER_FILE_OFFSET_INVALID")
        data = raw[offset:offset + length]
        end = offset + len(data)
        return {"schema": SCHEMA + ".browser-file", **metadata, "offset": offset,
                "next_offset": end if end < len(raw) else None, "complete": end == len(raw),
                "encoding": "base64", "data_base64": base64.b64encode(data).decode("ascii")}

def export_selection(workspace, value):
    fields(value, ("id", "revision", "state_sha256"))
    record = read(workspace, value["id"], integer(value["revision"], 1))
    if record["state_sha256"] != value["state_sha256"]:
        fail("BROWSER_EXPORT_SELECTION_CHANGED")
    return record
