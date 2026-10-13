"""Dataverse operation receipts inside the original grant-portfolio workspace.

The original Workspace retains its lock, SQLite connection, request IDs,
revisions, source records, reviews and receiving implementation. These additive
tables hold native ALM evidence; they are not another business-state store.
"""
from __future__ import annotations

import io
import uuid
from dataverse_contract import (
    DataverseError, require, clone, parse_json, json_bytes, identity, sha256, guid,
    identifier, profile, public_profile, validate_exchange, validate_snapshot,
    target_identity, binary, pack, MAX_JSON, exact_keys, instant,
)
from dataverse_client import DataverseClient, NativeResultUnknown, capture_target, request_key, now
from dataverse_solution import validate_spec, compile_solution, verify_plan, validate_settings
from dataverse_runtime import apply_solution
from dataverse_packages import export_solution, import_solution, configure_target, inspect_solution

DATAVERSE_ACTIONS = (
    "dataverse.spec.save", "dataverse.profile.save", "dataverse.preflight",
    "dataverse.plan", "dataverse.apply", "dataverse.export", "dataverse.import",
    "dataverse.configure", "dataverse.delivery.prepare", "dataverse.delivery.receive",
)
ACTIONS = DATAVERSE_ACTIONS
# The maintained staff capture and reviewed pilot use this same native journal.
# Their own handlers retain read-only capture versus explicitly admitted commands.
NATIVE_PARENT_ACTIONS = DATAVERSE_ACTIONS + ("dataverse.staff.capture", "dataverse.staff.programme")
WORKSPACE_EXTENSION_SCHEMA = "tjlabs.pmrs.dataverse-workspace/v1"

class NativePending(DataverseError):
    def __init__(self, result_id, message="The original native job is retained and remains pending."):
        super().__init__("NATIVE_OPERATION_PENDING", message, result_id=result_id, uncertain=True)
        self.retryable = True

def initialize(workspace):
    with workspace.transaction():
        for statement in (
            "CREATE TABLE IF NOT EXISTS dataverse_records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,operation_id TEXT NOT NULL,portfolio_id TEXT,portfolio_revision INTEGER,body_sha256 TEXT NOT NULL,body TEXT NOT NULL)",
            "CREATE INDEX IF NOT EXISTS dataverse_records_portfolio ON dataverse_records(portfolio_id,portfolio_revision,kind,id)",
            "CREATE TABLE IF NOT EXISTS dataverse_native_requests(operation_id TEXT NOT NULL,request_id TEXT NOT NULL,intent_sha256 TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(operation_id,request_id))",
            "CREATE TABLE IF NOT EXISTS dataverse_steps(operation_id TEXT NOT NULL,key TEXT NOT NULL,body_sha256 TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(operation_id,key))",
            "CREATE TABLE IF NOT EXISTS dataverse_events(operation_id TEXT NOT NULL,sequence INTEGER NOT NULL,previous_sha256 TEXT,sha256 TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(operation_id,sequence))",
            "CREATE TABLE IF NOT EXISTS dataverse_originals(origin TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,body_sha256 TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(origin,kind,id))",
        ):
            workspace.db.execute(statement)

def _parse_row(row, field="body"):
    if row is None:
        return None
    return parse_json(row[field].encode("utf-8"), maximum=256 * 1024 * 1024)

def _read_native(workspace, operation_id, request_id):
    row = workspace.db.execute("SELECT body FROM dataverse_native_requests WHERE operation_id=? AND request_id=?",
                               (operation_id, request_id)).fetchone()
    return _parse_row(row)

def _store_native(workspace, operation_id, row):
    original = workspace.db.execute(
        "SELECT intent_sha256 FROM dataverse_native_requests WHERE operation_id=? AND request_id=?",
        (operation_id, row["request_id"])).fetchone()
    digest = identity(row["intent"])
    require(original is None or original["intent_sha256"] == digest, "NATIVE_REQUEST_CONFLICT",
            "The original provider request identity cannot change.")
    workspace.db.execute(
        "INSERT INTO dataverse_native_requests VALUES(?,?,?,?) ON CONFLICT(operation_id,request_id) DO UPDATE SET body=excluded.body",
        (operation_id, row["request_id"], digest, json_bytes(row).decode("utf-8")))

def _event(workspace, operation_id, kind, value):
    old = workspace.db.execute("SELECT sequence,sha256 FROM dataverse_events WHERE operation_id=? ORDER BY sequence DESC LIMIT 1",
                               (operation_id,)).fetchone()
    seq = old["sequence"] + 1 if old else 1
    previous = old["sha256"] if old else None
    body = {"schema": WORKSPACE_EXTENSION_SCHEMA + ".event", "operation_id": operation_id,
            "sequence": seq, "previous_sha256": previous, "kind": kind, "recorded_at": now(), "value": clone(value)}
    digest = identity(body)
    workspace.db.execute("INSERT INTO dataverse_events VALUES(?,?,?,?,?)",
                         (operation_id, seq, previous, digest, json_bytes(body).decode("utf-8")))
    return {"sequence": seq, "sha256": digest}

def _parent(workspace, operation_id, input_sha=None):
    request = workspace.request(operation_id)
    require(request["action"] in NATIVE_PARENT_ACTIONS and request["input"]["operationId"] == operation_id,
            "NATIVE_PARENT", "Provider work must belong to its original admitted Dataverse action.")
    if input_sha is not None:
        require(request["inputSha256"] == input_sha, "NATIVE_PARENT_CHANGED", "The original admitted action input changed.")
    return request

class WorkspaceJournal:
    def __init__(self, workspace, original_operation):
        self.workspace, self.operation_id = workspace, original_operation["id"]
        self.input_sha = original_operation["inputSha256"]
        _parent(workspace, self.operation_id, self.input_sha)

    def _check(self):
        return _parent(self.workspace, self.operation_id, self.input_sha)

    def reserve_request(self, request_id, intent):
        identifier(request_id, "key")
        with self.workspace.transaction():
            self._check()
            row = _read_native(self.workspace, self.operation_id, request_id)
            if row is not None:
                require(row["intent"] == intent, "NATIVE_REQUEST_CONFLICT",
                        "The same original provider request selected another intent.")
                return row
            row = {"request_id": request_id, "operation_id": self.operation_id,
                   "parent_input_sha256": self.input_sha, "intent": clone(intent),
                   "state": "RESERVED", "created_at": now(), "exchange": None}
            _store_native(self.workspace, self.operation_id, row)
            _event(self.workspace, self.operation_id, "native.request.reserved",
                   {"request_id": request_id, "intent_sha256": identity(intent)})
            return clone(row)

    def before_dispatch(self, request_id):
        with self.workspace.transaction():
            self._check()
            row = _read_native(self.workspace, self.operation_id, request_id)
            require(row is not None and row["state"] in ("RESERVED", "NOT_DISPATCHED"),
                    "NATIVE_ALREADY_DISPATCHED", "The original native request cannot be dispatched twice.")
            row.update(state="DISPATCHED", dispatched_at=now())
            _store_native(self.workspace, self.operation_id, row)
            _event(self.workspace, self.operation_id, "native.request.dispatched", {"request_id": request_id})

    @staticmethod
    def _verify_return(row, exchange):
        validate_exchange(exchange)
        require(exchange["request_id"] == row["request_id"]
                and exchange["request"] == row["intent"]["request"]
                and target_identity(exchange["profile"]) == target_identity(row["intent"]["profile"]),
                "NATIVE_RETURN_IDENTITY", "The complete native return belongs to another original request.")

    def returned(self, request_id, exchange):
        with self.workspace.transaction():
            self._check()
            row = _read_native(self.workspace, self.operation_id, request_id)
            require(row is not None and row["state"] not in ("RESERVED", "NOT_DISPATCHED"),
                    "NATIVE_RETURN_WITHOUT_DISPATCH", "A native return needs its original durable dispatch.")
            self._verify_return(row, exchange)
            if row.get("exchange") is not None:
                require(row["exchange"] == exchange, "NATIVE_RETURN_CONFLICT", "A different original response was supplied.")
                return
            row.update(state="RETURNED", exchange=clone(exchange), received_at=exchange["received_at"])
            _store_native(self.workspace, self.operation_id, row)
            _event(self.workspace, self.operation_id, "native.response.returned",
                   {"request_id": request_id, "exchange_sha256": identity(exchange)})

    def failed(self, request_id, error):
        with self.workspace.transaction():
            self._check()
            row = _read_native(self.workspace, self.operation_id, request_id)
            require(row is not None and row["state"] not in ("RESERVED", "NOT_DISPATCHED"),
                    "NATIVE_FAILURE_WITHOUT_DISPATCH", "A transport failure needs its original dispatch.")
            complete = error.get("complete_exchange")
            if complete is not None:
                self._verify_return(row, complete)
                require(row.get("exchange") is None or row["exchange"] == complete,
                        "NATIVE_RETURN_CONFLICT", "A recovered full native response differs from the original.")
                row.update(state="RETURNED", exchange=clone(complete), received_at=complete["received_at"])
            elif row.get("exchange") is None:
                row.update(state="UNKNOWN")
            # Every failure is retained as its own original event. It cannot
            # erase a complete response, including a COMMIT-then-return error.
            row["last_failure_sha256"] = identity(error)
            _store_native(self.workspace, self.operation_id, row)
            _event(self.workspace, self.operation_id, "native.response.failure",
                   {"request_id": request_id, "failure": clone(error)})

    def request(self, request_id):
        with self.workspace.mutex:
            self._check()
            return _read_native(self.workspace, self.operation_id, request_id)

    def reconcile(self, request_id, evidence, result):
        with self.workspace.transaction():
            self._check()
            row = _read_native(self.workspace, self.operation_id, request_id)
            require(row is not None and row["state"] not in ("RESERVED", "NOT_DISPATCHED"),
                    "NATIVE_RECONCILIATION", "Reconcile the actual original dispatched request.")
            value = {"request_id": request_id, "evidence": clone(evidence), "result": clone(result),
                     "original_transport_state": row["state"]}
            digest = identity(value)
            previous = self.workspace.db.execute(
                "SELECT body FROM dataverse_events WHERE operation_id=? AND body LIKE ?",
                (self.operation_id, "%" + digest + "%")).fetchall()
            # Event equality is checked rather than inferred from a matching
            # text fragment. A repeated exact observation is harmless history.
            for item in previous:
                candidate = _parse_row(item)
                if candidate.get("kind") == "native.reconciled" and candidate.get("value", {}).get("identity") == digest:
                    return clone(value)
            _event(self.workspace, self.operation_id, "native.reconciled", {"identity": digest, **value})
            return clone(value)

    def result(self, key):
        identifier(key, "key")
        with self.workspace.mutex:
            self._check()
            row = self.workspace.db.execute("SELECT body_sha256,body FROM dataverse_steps WHERE operation_id=? AND key=?",
                                            (self.operation_id, key)).fetchone()
            if row is None:
                return None
            value = _parse_row(row)
            require(identity(value) == row["body_sha256"], "NATIVE_STEP_CHANGED", "The original native step bytes changed.")
            return value

    def retain_result(self, key, value):
        identifier(key, "key")
        with self.workspace.transaction():
            self._check()
            previous = self.workspace.db.execute("SELECT body_sha256,body FROM dataverse_steps WHERE operation_id=? AND key=?",
                                                 (self.operation_id, key)).fetchone()
            digest = identity(value)
            if previous:
                require(previous["body_sha256"] == digest and _parse_row(previous) == value,
                        "NATIVE_STEP_CONFLICT", "The original native step already retains another complete result.")
                return clone(value)
            self.workspace.db.execute("INSERT INTO dataverse_steps VALUES(?,?,?,?)",
                (self.operation_id, key, digest, json_bytes(value).decode("utf-8")))
            _event(self.workspace, self.operation_id, "native.step.retained", {"key": key, "body_sha256": digest})
            return clone(value)

def selected_portfolio(workspace, payload):
    selected = payload.get("portfolio")
    exact_keys(selected, ["id", "revision", "snapshot"], ["id", "revision", "snapshot"])
    actual = workspace.portfolio(selected["id"], selected["revision"])
    require(actual["snapshot"] == selected["snapshot"], "PORTFOLIO_SOURCE_CHANGED",
            "The selected original grant portfolio snapshot differs.")
    return actual

def object_json(workspace, digest):
    path = workspace.object(digest)
    require(path.stat().st_size <= MAX_JSON, "ALM_OBJECT_SIZE", "The complete native JSON object exceeds 64 MiB.")
    raw = path.read_bytes()
    require(sha256(raw) == digest, "ALM_OBJECT_CHANGED", "The original uploaded native object changed.")
    return parse_json(raw)

def record(workspace, ident, kind=None):
    identifier(ident, "key")
    with workspace.mutex:
        row = workspace.db.execute("SELECT * FROM dataverse_records WHERE id=?", (ident,)).fetchone()
        require(row is not None and (kind is None or row["kind"] == kind), "ALM_RECORD_MISSING",
                "The original selected ALM record was not found.", record_id=ident)
        result = _parse_row(row)
        require(identity(result) == row["body_sha256"], "ALM_RECORD_CHANGED", "The complete original ALM record changed.")
        return result

def record_identity(kind, value, workspace_id, portfolio):
    return "alm-" + identity({"kind": kind, "workspace_id": workspace_id,
                              "portfolio": portfolio, "value_sha256": identity(value)})

def put_record(workspace, original_request, kind, value, selected=None):
    selected_ref = ({"id": selected["id"], "revision": selected["revision"], "snapshot": selected["snapshot"]}
                    if selected else None)
    ident = record_identity(kind, value, workspace.marker["workspaceId"], selected_ref)
    result = {"schema": WORKSPACE_EXTENSION_SCHEMA + ".record", "id": ident, "kind": kind,
              "operation_id": original_request["id"], "parent_input_sha256": original_request["inputSha256"],
              "workspace_id": workspace.marker["workspaceId"], "created_at": original_request["createdAt"],
              "portfolio": selected_ref, "value": clone(value)}
    digest = identity(result)
    with workspace.transaction():
        previous = workspace.db.execute("SELECT body_sha256,body FROM dataverse_records WHERE id=?", (ident,)).fetchone()
        if previous:
            retained = _parse_row(previous)
            require(identity(retained) == previous["body_sha256"]
                    and retained["id"] == ident and retained["kind"] == kind
                    and retained["workspace_id"] == workspace.marker["workspaceId"]
                    and retained["portfolio"] == selected_ref and retained["value"] == value,
                    "ALM_RECORD_CONFLICT", "The retained original ALM identity has another complete body.")
            # Identical input reuse preserves the first complete native/source
            # record and its original operation; it does not rewrite attribution.
            result, digest = retained, previous["body_sha256"]
        else:
            workspace.db.execute("INSERT INTO dataverse_records VALUES(?,?,?,?,?,?,?)",
                (ident, kind, original_request["id"], selected["id"] if selected else None,
                 selected["revision"] if selected else None, digest, json_bytes(result).decode("utf-8")))
    return {"id": ident, "kind": kind, "sha256": digest, "state": value.get("state", "COMPLETE"),
            "portfolio": result["portfolio"]}

def _value(workspace, ident, kind=None, selected=None):
    result = record(workspace, ident, kind)
    if kind == "profile":
        require(result["workspace_id"] == workspace.marker["workspaceId"], "LOCAL_TARGET_PROFILE_REQUIRED",
                "Save an explicit local administrator target profile before a new native tenant action.")
    if selected is not None:
        require(result["portfolio"] == {"id": selected["id"], "revision": selected["revision"], "snapshot": selected["snapshot"]},
                "ALM_PORTFOLIO_BINDING", "The selected native record belongs to another saved portfolio revision.")
    return result["value"]

def validate_action(workspace, value):
    action, payload = value["action"], value["payload"]
    require(action in DATAVERSE_ACTIONS and isinstance(payload, dict), "ALM_ACTION", "Select a complete native ALM action.")
    common = ["actor", "portfolio"]
    fields = {
        "dataverse.spec.save": ["object"], "dataverse.profile.save": ["object"],
        "dataverse.preflight": ["specId", "profileId"], "dataverse.plan": ["specId", "snapshotId"],
        "dataverse.apply": ["planId", "profileId"],
        "dataverse.export": ["snapshotId", "profileId", "solutionName", "managed"],
        "dataverse.import": ["snapshotId", "profileId", "archiveObject", "options"],
        "dataverse.configure": ["snapshotId", "profileId", "settingsObject", "solutionName"],
        "dataverse.delivery.prepare": ["recordIds"],
        "dataverse.delivery.receive": ["object"],
    }[action]
    if action == "dataverse.delivery.receive":
        common = ["actor"]
    exact_keys(payload, common + fields, common + fields)
    require(isinstance(payload["actor"], str) and 0 < len(payload["actor"].strip()) <= 300,
            "ALM_ACTOR", "Retain the actual native operator identity.")
    if "portfolio" in payload:
        selected_portfolio(workspace, payload)

def observation(workspace, original):
    """One admitted observation, distinct from every stable provider write."""
    with workspace.transaction():
        current = _parent(workspace, original["id"], original["inputSha256"])
        context = current.setdefault("context", {})
        history = context.setdefault("dataverseObservations", [])
        value = {"id": str(uuid.uuid4()), "createdAt": now(), "sequence": len(history) + 1}
        history.append(value)
        workspace._store_request(current)
    original["context"] = clone(current["context"])
    return value["id"]

def prepare_action(workspace, original):
    """Called only by the original Workspace.execute while its lock is held."""
    initialize(workspace)
    value = original["input"]
    validate_action(workspace, value)
    payload, action = value["payload"], value["action"]
    selected = selected_portfolio(workspace, payload) if "portfolio" in payload else None
    journal = WorkspaceJournal(workspace, original)
    if action == "dataverse.delivery.receive":
        from dataverse_portable import prepare_receiving
        return prepare_receiving(workspace, original, payload["object"])
    completed = journal.result(request_key(original["id"], "action-complete"))
    if completed is not None:
        return completed
    obs = observation(workspace, original)
    if action == "dataverse.spec.save":
        source = object_json(workspace, payload["object"])
        validated = validate_spec(source)
        value = {"id": "spec-" + identity(validated), "schema": validated["schema"], "state": "COMPLETE",
                 "object": payload["object"], "spec": validated}
        result = put_record(workspace, original, "spec", value, selected)
    elif action == "dataverse.profile.save":
        source = object_json(workspace, payload["object"])
        validated = profile(source)
        value = {"id": "profile-" + identity(validated), "schema": validated["schema"], "state": "COMPLETE",
                 "object": payload["object"], "profile": validated}
        result = put_record(workspace, original, "profile", value, selected)
    elif action == "dataverse.plan":
        source = _value(workspace, payload["specId"], "spec", selected)["spec"]
        snapshot = _value(workspace, payload["snapshotId"], "snapshot", selected)
        plan = compile_solution(source, snapshot)
        value = {"id": plan["id"], "state": "COMPLETE", "plan": plan,
                 "spec_record_id": payload["specId"], "snapshot_record_id": payload["snapshotId"]}
        result = put_record(workspace, original, "plan", value, selected)
    elif action in ("dataverse.delivery.prepare", "dataverse.delivery.receive"):
        from dataverse_portable import prepare_delivery, prepare_receiving
        result = (prepare_delivery(workspace, original, selected, payload["recordIds"])
                  if action.endswith(".prepare") else prepare_receiving(workspace, original, payload["object"]))
    else:
        source_profile = _value(workspace, payload["profileId"], "profile", selected)["profile"]
        client = DataverseClient(source_profile, journal)
        if action == "dataverse.preflight":
            spec = _value(workspace, payload["specId"], "spec", selected)["spec"]
            snapshot = capture_target(client, spec, request_key(original["id"], "capture", obs),
                                      created_at=original["createdAt"])
            result = put_record(workspace, original, "snapshot", snapshot, selected)
        elif action == "dataverse.apply":
            saved = _value(workspace, payload["planId"], "plan", selected)
            snapshot = _value(workspace, saved["snapshot_record_id"], "snapshot", selected)
            result_value = apply_solution(client, saved["plan"], snapshot, original["id"], obs, created_at=original["createdAt"])
            result = put_record(workspace, original, "deployment", result_value, selected)
        elif action in ("dataverse.export", "dataverse.import", "dataverse.configure"):
            snapshot = _value(workspace, payload["snapshotId"], "snapshot", selected)
            if action == "dataverse.export":
                result_value = export_solution(client, snapshot, original["id"], obs,
                    solution_name=payload["solutionName"], managed=payload["managed"], created_at=original["createdAt"])
                raw = binary(result_value["archive"], "native export")
                uploaded = workspace.upload(io.BytesIO(raw), len(raw))
                result_value = {**result_value, "archive_object": uploaded}
                result = put_record(workspace, original, "export", result_value, selected)
            elif action == "dataverse.import":
                path = workspace.object(payload["archiveObject"])
                require(path.stat().st_size <= 40 * 1024 * 1024, "NATIVE_PACKAGE_SIZE", "The original native ZIP exceeds the selected profile.")
                archive = pack(path.read_bytes())
                require(archive["sha256"] == payload["archiveObject"], "NATIVE_PACKAGE_CHANGED", "The retained original native ZIP changed.")
                result_value = import_solution(client, snapshot, archive, original["id"], obs,
                    options=payload["options"], created_at=original["createdAt"])
                result = put_record(workspace, original, "import", result_value, selected)
                if result_value["state"] == "PENDING":
                    raise NativePending(result["id"])
                require(result_value["state"] == "COMPLETE", "NATIVE_IMPORT_FAILED",
                        "The original native import completed with a retained failure.", result_id=result["id"])
            else:
                settings = object_json(workspace, payload["settingsObject"])
                result_value = configure_target(client, snapshot, original["id"], obs, settings=settings,
                    solution_name=payload["solutionName"], created_at=original["createdAt"])
                result = put_record(workspace, original, "configuration", result_value, selected)
        else:
            raise DataverseError("ALM_ACTION", "The native action has no maintained original handler.")
    # An action result is fixed before the original Workspace commits its
    # request completion. Re-entry recovers this exact result without HTTP.
    return journal.retain_result(request_key(original["id"], "action-complete"), result)

def commit_action(workspace, original, prepared):
    """Inside the original Workspace transaction; no network or nested BEGIN."""
    if original["action"] == "dataverse.delivery.receive":
        from dataverse_portable import commit_receiving
        return commit_receiving(workspace, original, prepared)
    return clone(prepared)

def list_records(workspace, *, portfolio_id=None, revision=None, kind=None, offset=0, limit=50):
    require(isinstance(offset, int) and not isinstance(offset, bool) and offset >= 0
            and isinstance(limit, int) and not isinstance(limit, bool) and 1 <= limit <= 250,
            "ALM_PAGE", "Use a nonnegative offset and a 1–250 row page.")
    terms, args = [], []
    for field, value in (("portfolio_id", portfolio_id), ("portfolio_revision", revision), ("kind", kind)):
        if value is not None:
            terms.append(field + "=?")
            args.append(value)
    where = " WHERE " + " AND ".join(terms) if terms else ""
    with workspace.reader() as db:
        total = db.execute("SELECT COUNT(*) FROM dataverse_records" + where, args).fetchone()[0]
        rows = db.execute("SELECT id,kind,operation_id,portfolio_id,portfolio_revision,body_sha256 FROM dataverse_records"
                          + where + " ORDER BY rowid LIMIT ? OFFSET ?", [*args, limit, offset]).fetchall()
    return {"rows": [dict(x) for x in rows], "total": total, "offset": offset,
            "nextOffset": offset + len(rows) if offset + len(rows) < total else None}
