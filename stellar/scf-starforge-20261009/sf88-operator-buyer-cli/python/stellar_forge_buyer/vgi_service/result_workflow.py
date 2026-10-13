"""Acquired-result workflow over the original buyer, DuckDB and VGI engines.

This module never initiates a purchase or interprets a payment receipt as a new
settlement. It retains exact operator intents in the original warehouse, joins
complete native lineage, and delegates every data/publication operation to its
maintained engine. Native warehouse backups retain these workflow records.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import json
import re

from ..duckdb_dataset import SCHEMA as WORKSPACE_SCHEMA, _json as native_json, _name, _type
from ..errors import StateError
from ..storage import parse

SCHEMA = "stellar-forge.vgi-result-workflow.v1"
_HEX = re.compile(r"[0-9a-f]{64}")
_REQUEST = re.compile(r"[0-9a-f]{32}")
_ACTIONS = {
    "review": ({"report_path", "expected_source"}, {"columns", "keys"}),
    "import": ({"review_id"}, set()),
    "activate": ({"name", "edition_id", "expected_revision"}, set()),
    "save-query": ({"name", "sql", "expected_revision"}, {"parameters"}),
    "export": ({"query_id", "expected_revision", "expected_views"}, set()),
    "source-handoff": ({"edition_id"}, set()),
    "warehouse-handoff": (set(), set()),
    "publish": ({"table_name", "export_id", "review_sha256", "expected_head_revision"}, set()),
}


def _need(condition, code):
    if not condition:
        raise StateError("VGI_WORKFLOW_" + code)


def _fields(value, required=(), optional=()):
    _need(isinstance(value, dict) and set(required) <= set(value)
          and not set(value) - set(required) - set(optional), "FIELDS_INVALID")
    return value


def _integer(value, minimum=0, maximum=1_000_000_000):
    _need(type(value) is int and minimum <= value <= maximum, "INTEGER_INVALID")
    return value


def _hex(value):
    _need(isinstance(value, str) and _HEX.fullmatch(value), "SOURCE_ID_INVALID")
    return value


def _request_id(value):
    _need(isinstance(value, str) and _REQUEST.fullmatch(value), "REQUEST_ID_INVALID")
    return value


def _json(value):
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False,
                          sort_keys=True, separators=(",", ":"))
    except (TypeError, ValueError, UnicodeError):
        raise StateError("VGI_WORKFLOW_JSON_INVALID") from None


def _sha(value):
    return hashlib.sha256(value).hexdigest()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _safe_error(error):
    code = getattr(error, "code", "")
    return code if isinstance(code, str) and re.fullmatch(r"[A-Z0-9_]{1,160}", code) \
        else type(error).__name__


def _rejected(record, error, kind):
    value = {**record, "state": "REJECTED",
             "result": {"error": {"code": _safe_error(error)}, "no_effect": True},
             "reconciliation": {"kind": kind}, "completed_at": _now()}
    value.pop("last_error", None)
    return value


class ResultWorkflow:
    """One additive operator workflow; the supplied original operator owns it."""

    def __init__(self, vgi_operator):
        self.vgi = vgi_operator
        self.original = vgi_operator.original
        self.workspace = self.original.workspace
        self.service = vgi_operator.service
        with self.original.mutex, self.workspace._guard(), \
                self.workspace._connection(writeable=True) as db:
            db.execute("CREATE TABLE IF NOT EXISTS sf_vgi_workflow_requests("
                       "id VARCHAR PRIMARY KEY,sequence BIGINT UNIQUE NOT NULL,"
                       "request_sha256 VARCHAR NOT NULL,record VARCHAR NOT NULL)")

    def _identity(self, value):
        identity = self.workspace.identity()["workspace_id"]
        _need(value == identity, "WORKSPACE_CHANGED")
        return identity

    @staticmethod
    def _decode(row):
        if row is None:
            raise StateError("VGI_WORKFLOW_REQUEST_NOT_FOUND")
        value = parse(row[0].encode())
        _need(value.get("schema") == SCHEMA + ".request", "REQUEST_RECORD_CHANGED")
        _need(_sha(_json(value["request"]).encode()) == value["request_sha256"],
              "REQUEST_RECORD_CHANGED")
        return value

    def _get_request(self, db, request_id):
        return self._decode(db.execute(
            "SELECT record FROM sf_vgi_workflow_requests WHERE id=?",
            [_request_id(request_id)]).fetchone())

    def request(self, request_id):
        with self.original.mutex, self.workspace._guard(), self.workspace._connection() as db:
            value = self._get_request(db, request_id)
        self._identity(value["workspace_id"])
        return value

    @staticmethod
    def _put(db, value):
        db.execute("UPDATE sf_vgi_workflow_requests SET record=? WHERE id=?",
                   [_json(value), value["request_id"]])

    def history(self, *, before=None, limit=50):
        _integer(limit, 1, 100)
        if before is not None:
            _integer(before, 1)
        with self.original.mutex, self.workspace._guard(), self.workspace._connection() as db:
            rows = db.execute("SELECT record FROM sf_vgi_workflow_requests "
                              "WHERE (? IS NULL OR sequence<?) ORDER BY sequence DESC LIMIT ?",
                              [before, before, limit + 1]).fetchall()
            records = [self._decode(row) for row in rows[:limit]]
            return {"requests": records,
                    "next_before": records[-1]["sequence"] if len(rows) > limit else None}

    def state(self, *, before=None, limit=50):
        _integer(limit, 1, 100)
        with self.original.mutex:
            page = self.workspace.editions(limit=limit, before=before)
            return {"schema": SCHEMA, "workspace_id": self.workspace.identity()["workspace_id"],
                    "workspace_schema": WORKSPACE_SCHEMA, **page,
                    "views": self.workspace.views(),
                    "queries": self.workspace.queries()["queries"],
                    "exports": self.workspace.exports()["exports"],
                    "service": self.service.state(), "runtime": self.vgi.runtime.state(),
                    "installed_runtime": self.vgi.installed_runtime,
                    "requests": self.history(limit=50)}

    def _edition(self, edition_id):
        edition_id = _hex(edition_id)
        edition = self.workspace.edition(edition_id)
        with self.workspace._guard(), self.workspace._connection() as db:
            files = [{"name": name, "bytes": size, "sha256": sha}
                     for name, size, sha in db.execute(
                         "SELECT name,bytes,sha256 FROM sf_files WHERE edition_id=? ORDER BY name",
                         [edition_id]).fetchall()]
        source = edition.get("source", {})
        native = source.get("native")
        manifest = source.get("manifest")
        return {"edition": edition, "members": files,
                "payment": {"interpretation": "ORIGINAL_VALUES_ONLY",
                            "native_payment_status": native.get("paymentStatus") if isinstance(native, dict) else None,
                            "manifest_payment_status": manifest.get("paymentStatus") if isinstance(manifest, dict) else None,
                            "native_status": native.get("nativeStatus") if isinstance(native, dict) else None,
                            "source_binding_sha256": source.get("source_binding_sha256"),
                            "input_report_sha256": source.get("input_report_sha256"),
                            "manifest_sha256": source.get("manifest_sha256")},
                "source_custody": "RETAINED_IN_ORIGINAL_WAREHOUSE"}

    def lineage(self, *, edition_id=None, export_id=None, publication_id=None):
        _need(any((edition_id, export_id, publication_id)), "SOURCE_SELECTION_REQUIRED")
        with self.original.mutex:
            publication = self.service.publication(_hex(publication_id)) if publication_id else None
            if publication:
                bound = publication["source"]["export_id"]
                _need(export_id is None or export_id == bound, "PUBLICATION_EXPORT_CHANGED")
                export_id = bound
            exported = None
            if export_id:
                export_id = _hex(export_id)
                exported = next((item for item in self.workspace.exports()["exports"]
                                 if item["export_id"] == export_id), None)
                _need(exported is not None and exported.get("state") == "COMPLETE",
                      "COMPLETE_EXPORT_REQUIRED")
            snapshot_ids = []
            views = []
            if exported:
                views = exported["views"]
                snapshot_ids = sorted({view["edition_id"] for view in views})
                _need(snapshot_ids == sorted(exported["source_editions"]),
                      "EXPORT_SOURCE_MEMBERSHIP_CHANGED")
                if publication:
                    _need(publication["source"]["views"] == views
                          and sorted(publication["source"]["source_editions"]) == snapshot_ids
                          and publication["source"]["query_id"] == exported["query"]["query_id"]
                          and publication["source"]["query_revision"] == exported["query"]["revision"],
                          "PUBLICATION_SOURCE_BINDING_CHANGED")
                _need(edition_id is None or edition_id in snapshot_ids,
                      "EDITION_OUTSIDE_EXPORT_SNAPSHOT")
            if edition_id:
                _hex(edition_id)
                if edition_id not in snapshot_ids:
                    snapshot_ids.append(edition_id)
            selected = [self._edition(identity) for identity in snapshot_ids]
            return {"schema": SCHEMA + ".lineage",
                    "workspace_id": self.workspace.identity()["workspace_id"],
                    "edition": next((item for item in selected
                                     if item["edition"]["edition_id"] == edition_id), None),
                    "export": exported, "publication": publication,
                    "snapshot_editions": selected,
                    "query": exported["query"] if exported else None, "views": views,
                    "source_meanings": exported.get("source_meanings") if exported else None,
                    "membership": "COMPLETE_RETAINED_VIEW_SNAPSHOT_NOT_INFERRED_SQL_DEPENDENCIES",
                    "availability": {
                        "edition_sources": "RETAINED_IN_ORIGINAL_WAREHOUSE",
                        "query_export": "RECORDED_NATIVE_EXPORT" if exported else None,
                        "publication": "RETAINED_NATIVE_ARROW_BATCHES" if publication else None},
                    "next": {"source_handoff_action": "source-handoff",
                             "publication_operator": "/vgi/",
                             "sql_handover_owner": "original-selected-result-client"}}

    def source(self, edition_id, name, *, offset=0, limit=65536):
        """Validate the whole original member, then return one exact byte page."""
        edition_id = _hex(edition_id)
        _need(isinstance(name, str) and name and len(name.encode()) <= 4096, "MEMBER_NAME_INVALID")
        _integer(offset, 0, 1 << 50)
        _integer(limit, 1, 1_048_576)
        workspace_id = self.workspace.identity()["workspace_id"]
        with self.original.mutex, self.workspace._guard(), self.workspace._connection() as db:
            metadata = db.execute("SELECT bytes,sha256 FROM sf_files WHERE edition_id=? AND name=?",
                                  [edition_id, name]).fetchone()
            _need(metadata is not None, "MEMBER_NOT_FOUND")
            total, expected = metadata
            _integer(total, 0, 1 << 50)
            _hex(expected)
            _need(offset <= total, "MEMBER_OFFSET_INVALID")
            checksum, observed, index, selected = hashlib.sha256(), 0, 0, bytearray()
            cursor = db.execute("SELECT part,content FROM sf_file_chunks "
                                "WHERE edition_id=? AND name=? ORDER BY part", [edition_id, name])
            while row := cursor.fetchone():
                part, raw = row
                _need(part == index and isinstance(raw, bytes), "MEMBER_CHUNKS_CHANGED")
                checksum.update(raw)
                start = max(offset - observed, 0)
                end = min(offset + limit - observed, len(raw))
                if end > start:
                    selected.extend(raw[start:end])
                observed += len(raw)
                index += 1
            _need(observed == total and checksum.hexdigest() == expected, "MEMBER_BYTES_CHANGED")
            end = offset + len(selected)
            _need(len(selected) == min(limit, total - offset), "MEMBER_PAGE_CHANGED")
            return {"schema": SCHEMA + ".source-page",
                    "workspace_id": workspace_id,
                    "edition_id": edition_id, "name": name, "bytes": total, "sha256": expected,
                    "offset": offset, "end": end, "next_offset": end if end < total else None,
                    "encoding": "base64", "data": base64.b64encode(selected).decode("ascii")}

    def inspect(self, body):
        _fields(body, ("workspace_id", "report_path"))
        with self.original.mutex:
            self._identity(body["workspace_id"])
            return self.workspace.inspect_delivery(body["report_path"])

    def preview(self, body):
        _fields(body, ("workspace_id", "sql", "expected_views"), ("parameters", "max_rows"))
        with self.original.mutex:
            self._identity(body["workspace_id"])
            return self.workspace.query(body["sql"], parameters=body.get("parameters", []),
                max_rows=_integer(body.get("max_rows", 100), 1, 1000),
                expected_views=body["expected_views"])

    def _validate_command(self, body):
        _fields(body, ("workspace_id", "request_id", "action", "args"))
        self._identity(body["workspace_id"])
        _request_id(body["request_id"])
        action, args = body["action"], body["args"]
        _need(isinstance(action, str) and action in _ACTIONS, "ACTION_INVALID")
        required, optional = _ACTIONS[action]
        _fields(args, required, optional)
        _json(body)
        for name in ("edition_id", "review_id", "query_id", "export_id", "review_sha256"):
            if name in args:
                _hex(args[name])
        for name in ("expected_revision", "expected_head_revision"):
            if name in args:
                _integer(args[name], 1 if action == "export" else 0)
        if action in {"activate", "save-query"}:
            _name(args["name"])
        if action == "publish":
            _name(args["table_name"])
        if action == "export":
            _need(isinstance(args["expected_views"], list), "VIEW_SNAPSHOT_REQUIRED")

    def _basis(self, body):
        """Retain enough original evidence to receive a lost native reply."""
        action, args = body["action"], body["args"]
        if action == "review":
            expected = _fields(args["expected_source"],
                               ("manifest_sha256", "source_binding_sha256", "input_report_sha256"))
            for value in expected.values():
                _hex(value)
            inspected = self.workspace.inspect_delivery(args["report_path"])
            _need(all(inspected[key] == value for key, value in expected.items()),
                  "INSPECTED_DELIVERY_CHANGED")
            columns = args.get("columns", inspected["default_columns"])
            _need(isinstance(columns, list), "COLUMN_MAPPING_REQUIRED")
            mapped = []
            for item in columns:
                _fields(item, ("source", "name", "type"), ("nullable",))
                mapped.append({"source": item["source"], "name": item["name"],
                               "type": _type(item["type"]), "nullable": item.get("nullable", True)})
            identity = {"schema": WORKSPACE_SCHEMA, "manifest_sha256": inspected["manifest_sha256"],
                        "source_binding_sha256": inspected["source_binding_sha256"],
                        "columns": mapped, "keys": args.get("keys", [])}
            return {"review_id": _sha(native_json(identity).encode()), "identity": identity,
                    "input_report_sha256": inspected["input_report_sha256"],
                    "expected_source": expected}
        if action == "import":
            # Bind to the complete workflow review, not only the native review ID:
            # native IDs deliberately exclude report transport bytes and paths.
            with self.workspace._guard(), self.workspace._connection() as db:
                rows = db.execute("SELECT record FROM sf_vgi_workflow_requests "
                                  "ORDER BY sequence DESC").fetchall()
            completed = [self._decode(row) for row in rows]
            selected = [item for item in completed if item["action"] == "review"
                        and item["state"] == "COMPLETE"
                        and item["basis"].get("review_id") == args["review_id"]]
            _need(bool(selected), "COMPLETE_WORKFLOW_REVIEW_REQUIRED")
            expected = selected[0]["request"]["args"]["expected_source"]
            _need(all(item["request"]["args"]["expected_source"] == expected
                      for item in selected), "REVIEW_INPUT_IDENTITY_AMBIGUOUS")
            return {"review_request_id": selected[0]["request_id"],
                    "review_id": args["review_id"], "expected_source": expected}
        if action == "activate":
            # The native writer checks this CAS again at execution.
            edition = self.workspace.edition(args["edition_id"])
            current = next((row for row in self.workspace.views()
                            if row["name"].casefold() == args["name"].casefold()), None)
            revision = current["revision"] if current else 0
            _need(revision == args["expected_revision"], "VIEW_CHANGED")
            unchanged = None
            if current and current["edition_id"] == args["edition_id"]:
                # Original activate() returns its stored native edition record.
                with self.workspace._guard(), self.workspace._connection() as db:
                    raw = db.execute("SELECT record FROM sf_editions WHERE id=?",
                                     [args["edition_id"]]).fetchone()
                unchanged = {"name": current["name"], "revision": revision,
                             "edition": parse(raw[0].encode()), "activation_status": "UNCHANGED"}
            return {"previous": current, "unchanged_result": unchanged,
                    "selected_edition": edition["edition_id"]}
        return {}

    def _begin(self, body):
        request_id = body["request_id"]
        checksum = _sha(_json(body).encode())
        with self.workspace._guard(), self.workspace._connection() as db:
            row = db.execute("SELECT record FROM sf_vgi_workflow_requests WHERE id=?",
                             [request_id]).fetchone()
        if row is not None:
            record = self._decode(row)
            _need(record["request_sha256"] == checksum and record["request"] == body,
                  "ORIGINAL_REQUEST_CHANGED")
            return record
        basis_error = None
        try:
            basis = self._basis(body)
        except StateError as error:
            # _basis is read-only. Record this exact intent and authoritative
            # rejection, so an operator can correct inputs without an orphan.
            basis, basis_error = {}, error
        with self.workspace._guard(), self.workspace._connection(writeable=True) as db:
            db.execute("BEGIN")
            try:
                row = db.execute("SELECT record FROM sf_vgi_workflow_requests WHERE id=?",
                                 [request_id]).fetchone()
                if row is not None:
                    record = self._decode(row)
                    _need(record["request_sha256"] == checksum and record["request"] == body,
                          "ORIGINAL_REQUEST_CHANGED")
                    db.commit()
                    return record
                sequence = db.execute("SELECT coalesce(max(sequence),0)+1 FROM sf_vgi_workflow_requests").fetchone()[0]
                record = {"schema": SCHEMA + ".request", "workspace_id": body["workspace_id"],
                          "request_id": request_id, "sequence": sequence, "action": body["action"],
                          "request": body, "request_sha256": checksum, "basis": basis,
                          "state": "PENDING", "created_at": _now(), "attempts": 0,
                          "result": None, "reconciliation": None}
                if basis_error is not None:
                    record = _rejected(record, basis_error, "READ_ONLY_BASIS_REJECTED")
                db.execute("INSERT INTO sf_vgi_workflow_requests VALUES(?,?,?,?)",
                           [request_id, sequence, checksum, _json(record)])
                db.commit()
                return record
            except BaseException:
                db.rollback()
                raise

    def _receive_original(self, record):
        action, args = record["action"], record["request"]["args"]
        if action == "review":
            with self.workspace._guard(), self.workspace._connection() as db:
                row = db.execute("SELECT record FROM sf_reviews WHERE id=?",
                                 [record["basis"]["review_id"]]).fetchone()
            if row is not None:
                native = parse(row[0].encode())
                identity = record["basis"]["identity"]
                _need(all(native.get(key) == value for key, value in identity.items()),
                      "REVIEW_IDENTITY_CHANGED")
                # The ID omits input-report bytes. Check the original retained
                # edition or the review's actual report before receiving it.
                with self.workspace._guard(), self.workspace._connection() as db:
                    self.workspace._review_source_binding(
                        db, native, args["expected_source"])
                return native, {"kind": "ORIGINAL_RETAINED_REVIEW",
                                "expected_source": args["expected_source"]}
        if action == "activate":
            basis = record["basis"]
            if basis.get("unchanged_result") is not None:
                return basis["unchanged_result"], {"kind": "ORIGINAL_UNCHANGED_SELECTION"}
            with self.workspace._guard(), self.workspace._connection() as db:
                row = db.execute("SELECT record FROM sf_view_history "
                                 "WHERE lower(name)=lower(?) AND revision=?",
                                 [args["name"], args["expected_revision"] + 1]).fetchone()
            if row:
                native = parse(row[0].encode())
                previous = basis["previous"]
                _need(native["edition"]["edition_id"] == args["edition_id"]
                      and native.get("previous_edition") == (previous["edition_id"] if previous else None),
                      "ORIGINAL_VIEW_TRANSITION_CHANGED")
                return native, {"kind": "ORIGINAL_RETAINED_VIEW_TRANSITION"}
        return None

    def _finish(self, record, result, reconciliation, *, db=None):
        value = {**record, "state": "COMPLETE", "result": result,
                 "reconciliation": reconciliation, "completed_at": _now()}
        value.pop("last_error", None)
        if db is not None:
            self._put(db, value)
        else:
            with self.workspace._guard(), self.workspace._connection(writeable=True) as target:
                self._put(target, value)
        return value

    def command(self, body):
        # Validate and copy before admission; caller mutation cannot change its input.
        body = parse(_json(body).encode())
        with self.original.mutex:
            self._validate_command(body)
            record = self._begin(body)
            if record["state"] in {"COMPLETE", "REJECTED"}:
                return record
            record["attempts"] += 1
            record["last_attempt_at"] = _now()
            with self.workspace._guard(), self.workspace._connection(writeable=True) as db:
                self._put(db, record)
            try:
                recovered = self._receive_original(record)
                if recovered is not None:
                    return self._finish(record, recovered[0], recovered[1])
                action, args = record["action"], body["args"]
                if action == "save-query":
                    # Same native writer and one original database transaction:
                    # neither a saved query nor its receipt can escape alone.
                    with self.workspace._guard(), self.workspace._connection(writeable=True) as db:
                        db.execute("BEGIN")
                        commit_attempted = False
                        try:
                            result = self.workspace._save_query_on(db, args["name"], args["sql"],
                                args.get("parameters", []), args["expected_revision"])
                            value = self._finish(record, result, {"kind": "ORIGINAL_ATOMIC_QUERY_WRITER"}, db=db)
                            commit_attempted = True
                            db.commit()
                            return value
                        except StateError as error:
                            db.rollback()
                            if commit_attempted:
                                raise
                            value = _rejected(record, error, "ORIGINAL_QUERY_TRANSACTION_ROLLED_BACK")
                            self._put(db, value)
                            return value
                        except BaseException:
                            db.rollback()
                            raise
                if action == "review":
                    result = self.workspace.review_import(args["report_path"],
                        columns=args.get("columns"), keys=args.get("keys"),
                        expected_source=record["basis"]["expected_source"])
                    _need(result["review_id"] == record["basis"]["review_id"],
                          "REVIEW_SOURCE_CHANGED_DURING_ADMISSION")
                elif action == "import":
                    expected = record["basis"]["expected_source"]
                    result = self.workspace.import_review(args["review_id"],
                                                          expected_source=expected)
                    _need(all(result["source"].get(key) == value
                              for key, value in expected.items()),
                          "IMPORTED_SOURCE_IDENTITY_CHANGED")
                elif action == "activate":
                    result = self.workspace.activate(args["name"], args["edition_id"],
                                                     args["expected_revision"])
                elif action == "export":
                    result = self.original.perform("/api/exports", {**args, "request_id": body["request_id"]})
                elif action == "source-handoff":
                    result = self.original.perform("/api/source-handoffs", {**args, "request_id": body["request_id"]})
                elif action == "warehouse-handoff":
                    result = self.original.perform("/api/handoffs", {"request_id": body["request_id"]})
                elif action == "publish":
                    result = self.service.publish({**args, "request_id": body["request_id"]})
                else:
                    raise StateError("VGI_WORKFLOW_ACTION_INVALID")
                return self._finish(record, result, {"kind": "ORIGINAL_NATIVE_OPERATION"})
            except Exception as error:
                record["last_error"] = {"code": _safe_error(error), "at": _now(),
                                        "meaning": "Receive this exact original request before replacing it."}
                with self.workspace._guard(), self.workspace._connection(writeable=True) as db:
                    # Never replace an already committed complete outcome with a
                    # secondary transport/serialization error.
                    current = self._get_request(db, record["request_id"])
                    if current["state"] not in {"COMPLETE", "REJECTED"}:
                        self._put(db, record)
                raise

    def read(self, path, parameters):
        prefix = "/api/vgi/workflow/"
        _need(path.startswith(prefix), "ROUTE_NOT_FOUND")
        tail = path[len(prefix):]
        if tail in {"state", "history"}:
            _need(not set(parameters) - {"before", "limit"}, "PARAMETERS_INVALID")
            before = int(parameters["before"][0]) if "before" in parameters else None
            limit = int(parameters.get("limit", ["50"])[0])
            return self.state(before=before, limit=limit) if tail == "state" \
                else self.history(before=before, limit=limit)
        if tail == "lineage":
            _need(not set(parameters) - {"edition_id", "export_id", "publication_id"}, "PARAMETERS_INVALID")
            return self.lineage(**{key: value[0] for key, value in parameters.items()})
        if tail == "source":
            _need({"edition_id", "name"} <= set(parameters)
                  and not set(parameters) - {"edition_id", "name", "offset", "limit"}, "PARAMETERS_INVALID")
            return self.source(parameters["edition_id"][0], parameters["name"][0],
                offset=int(parameters.get("offset", ["0"])[0]), limit=int(parameters.get("limit", ["65536"])[0]))
        if tail.startswith("requests/") and "/" not in tail[len("requests/"):]:
            _need(not parameters, "PARAMETERS_INVALID")
            return self.request(tail[len("requests/"):])
        raise StateError("VGI_WORKFLOW_ROUTE_NOT_FOUND")

    def perform(self, path, body):
        if path == "/api/vgi/workflow/inspect":
            return self.inspect(body)
        if path == "/api/vgi/workflow/preview":
            return self.preview(body)
        if path == "/api/vgi/workflow/command":
            return self.command(body)
        raise StateError("VGI_WORKFLOW_ROUTE_NOT_FOUND")
