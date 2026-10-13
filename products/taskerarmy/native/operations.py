#!/usr/bin/env python3
"""JSON/CLI operations for the installed TaskerArmy notification application.

The original Outbox and operator configuration writer own business changes.
Named request results live in that same SQLite database and travel through its
original complete SQLite backup and independent receiving implementation.
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import sqlite3
import sys
import tempfile
import time

sys.dont_write_bytecode = True
import manage
import archive as package

REQUEST_SCHEMA = "taskerarmy.operation-request.v1"
RESULT_SCHEMA = "taskerarmy.operation-result.v1"
MAX_REQUEST = 2 * 1024 * 1024
JOURNAL = "taskerarmy_operation_requests"
REQUEST_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
JSON_SAFE_INTEGER = 2**53 - 1
SOURCE = pathlib.Path(__file__).resolve()
ADAPTER_SHA256 = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
ARGUMENTS = {
    "installation.prepare": {"application", "configuration", "directory", "manifest_path", "python", "operation_id"},
    "installation.inspect": set(),
    "installation.adopt_source": {"application", "manifest_path", "operation_id"},
    "installation.snapshot": {"output", "operation_id"},
    "installation.receive": {"archive_path", "directory", "python"},
    "configuration.read": set(),
    "configuration.save": {"revision", "configuration"},
    "queue.status": {"tenant", "limit"},
    "queue.list": {"tenant", "status", "route_id", "job_id", "before_id", "limit"},
    "queue.get": {"delivery_id"},
    "jobs.history": {"tenant", "job", "before_version", "limit"},
    "events.receive": {"tenant", "event", "ttl_seconds"},
    "events.render": {"tenant", "event"},
    "deliveries.resolve": {"delivery_id", "outcome", "note"},
    "routes.resume": {"route_id"},
    "requests.get": {"request_id", "installation_id"},
    "commands.describe": {"roles", "operator_port", "ingress_port", "worker_interval", "ready_file", "operator_token_env"},
}
NAMED_MUTATIONS = {"configuration.save", "events.receive", "deliveries.resolve", "routes.resume"}
QUEUE_FIELDS = (
    "id", "tenant_id", "route_id", "event_id", "job_id", "version",
    "channel_key", "message_sha256", "status", "attempts", "due_at",
    "expires_at", "created_at", "updated_at", "http_status", "last_error",
    "sent_at", "resolution",
)
JOURNAL_COLUMNS = {
    "installation_id", "request_id", "operation", "request_sha256",
    "request_json", "state", "result_json", "created_at", "completed_at",
    "source_identity", "adapter_sha256",
}


class OperationError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def fail(code, message):
    raise OperationError(code, message)


def exact(value, fields, label):
    if not isinstance(value, dict):
        fail("invalid_request", label + " must be an object")
    extra = set(value) - fields
    if extra:
        fail("invalid_request", label + " contains unsupported fields: " + ", ".join(sorted(extra)))
    return value


def identifier(value, label="request_id"):
    if not isinstance(value, str) or not REQUEST_ID.fullmatch(value):
        fail("invalid_request", label + " must be a nonempty plain identifier of at most 200 characters")
    return value


def integer(value, label, low=1, high=1000):
    if type(value) is not int or not low <= value <= high:
        fail("invalid_request", label + " must be an integer from " + str(low) + " through " + str(high))
    return value


def absolute(value, label):
    if not isinstance(value, str) or not value or "\x00" in value:
        fail("invalid_request", label + " must be an absolute local path")
    path = pathlib.Path(value)
    if not path.is_absolute():
        fail("invalid_request", label + " must be an absolute local path")
    # Preserve nonexistent selected destinations; existing ancestors are ordinary.
    for part in [path, *path.parents]:
        if part.is_symlink():
            fail("linked_path", label + " cannot traverse a symbolic link")
    return str(path)


def saved_integer(value, label, low=1, high=2**63 - 1):
    if isinstance(value, str) and re.fullmatch(r"[0-9]+", value):
        parsed = int(value)
    elif type(value) is int and abs(value) <= JSON_SAFE_INTEGER:
        parsed = value
    else:
        fail("invalid_request", label + " must be an exact decimal string or a safe JSON integer")
    return integer(parsed, label, low, high)


def event_document(value):
    if not isinstance(value, dict):
        fail("invalid_request", "event must be the original event object")
    result = dict(value)
    result["version"] = saved_integer(result.get("version"), "event.version")
    return result


def configuration_document(value):
    if not isinstance(value, dict):
        fail("invalid_request", "configuration must be an object")
    result = dict(value)
    if isinstance(result.get("routes"), list):
        result["routes"] = [
            {**row, "generation": saved_integer(row.get("generation"), "route.generation")}
            if isinstance(row, dict) else row for row in result["routes"]
        ]
    return result


def precise_json(value):
    if isinstance(value, dict):
        return {key: precise_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [precise_json(item) for item in value]
    if type(value) is int and abs(value) > JSON_SAFE_INTEGER:
        return str(value)
    return value


def queue_record(value, field=None):
    # Match the original operator's exact SQLite key/revision transport and
    # extend it to this adapter's descending delivery cursor.
    if isinstance(value, dict):
        return {key: queue_record(item, key) for key, item in value.items()}
    if isinstance(value, list):
        return [queue_record(item) for item in value]
    if type(value) is int and field in {"id", "delivery_id", "version", "next_before_version", "next_before_id"}:
        return str(value)
    return value


def public_result(name, value):
    if name in {"queue.status", "queue.list", "queue.get", "jobs.history", "deliveries.resolve"}:
        value = queue_record(value)
    elif name == "installation.inspect":
        value = {**value, "outbox": queue_record(value["outbox"])}
    elif name == "requests.get" and value.get("request") is not None:
        saved = value["request"]
        value = {"request": {**saved, "result": public_result(saved["operation"], saved["result"])
                            if saved["state"] == "completed" else saved["result"]}}
    return precise_json(value)


def optional_path(args, key):
    return absolute(args[key], key) if args.get(key) is not None else None


def request(value):
    exact(value, {"schema", "operation", "installation", "arguments", "request_id", "binding"}, "Request")
    if value.get("schema") != REQUEST_SCHEMA:
        fail("invalid_schema", "Select " + REQUEST_SCHEMA)
    name = value.get("operation")
    if name not in ARGUMENTS:
        fail("unknown_operation", "Select a declared TaskerArmy operation")
    args = exact(value.get("arguments", {}), ARGUMENTS[name], "Operation arguments")
    rid = value.get("request_id")
    if rid is not None:
        identifier(rid)
    if name in NAMED_MUTATIONS and rid is None:
        fail("request_id_required", "Retain a request_id before this mutation")
    binding = value.get("binding")
    if binding is not None:
        exact(binding, {"installation_id", "source_identity"}, "Installation binding")
        if not binding or any(not isinstance(v, str) or not v for v in binding.values()):
            fail("invalid_binding", "Installation binding values must be nonempty strings")
        if "source_identity" in binding and not SHA256.fullmatch(binding["source_identity"]):
            fail("invalid_binding", "source_identity must be the selected 64-character SHA-256")
    return {**value, "arguments": args, "request_id": rid}


def identity(value):
    selected = {key: value[key] for key in (
        "installation_id", "operation_id", "source_identity", "paths", "python", "binding"
    ) if key in value}
    if isinstance(selected.get("binding"), dict):
        selected["binding"] = {
            key: str(item) if key in {"device", "inode"} and type(item) is int else item
            for key, item in selected["binding"].items()
        }
    return selected


def original_adoption_transition(req, value, expected_source):
    if req["operation"] != "installation.adopt_source":
        return False
    args = req["arguments"]
    operation_id = identifier(args.get("operation_id", req.get("request_id")), "operation_id")
    application = manage.ordinary(absolute(args.get("application"), "application"), True)
    manifest = manage.source_manifest(application, optional_path(args, "manifest_path"))
    source_id = hashlib.sha256(manage.canonical(manifest).encode("utf-8")).hexdigest()
    adoption_id = hashlib.sha256(manage.canonical({
        "operation_id": operation_id, "source_identity": source_id,
    }).encode("utf-8")).hexdigest()
    if value["source_identity"] != source_id or value.get("source_edition") != adoption_id:
        return False
    root = pathlib.Path(value["paths"]["directory"])
    working = root / "source-adoptions" / adoption_id
    record_path = working / "request.json"
    if not record_path.exists():
        return False
    record = manage.read_json(manage.ordinary(absolute(str(record_path), "original adoption request")))
    previous = record.get("prior_installation")
    if (record.get("schema") != "taskerarmy.source-adoption-request.v1"
            or record.get("operation_id") != operation_id
            or record.get("adoption_id") != adoption_id
            or record.get("source_identity") != source_id
            or record.get("application") != str(application)
            or record.get("installation_id") != value["installation_id"]
            or not isinstance(previous, dict)
            or previous.get("installation_id") != value["installation_id"]
            or previous.get("binding") != value["binding"]
            or previous.get("source_identity") != expected_source):
        return False
    # Check the complete original before/after transition. This reconstructs
    # the original selection for comparison only; the selected native adoption
    # method remains the sole writer and completed-result receiver.
    updated = json.loads(manage.canonical(previous))
    updated["source_identity"] = source_id
    updated["source_edition"] = adoption_id
    updated["paths"]["application"] = str(root / "source-editions" / adoption_id / "application")
    updated["lineage"] = list(previous.get("lineage", [])) + [{
        "source_adoption_id": adoption_id, "operation_id": operation_id,
        "created_at": record["created_at"],
        "previous_source_identity": expected_source, "source_identity": source_id,
    }]
    if updated != value:
        return False
    result_path = working / "result.json"
    if result_path.exists():
        result = manage.read_json(manage.ordinary(absolute(str(result_path), "original adoption result")))
        if (result.get("schema") != "taskerarmy.source-adoption-result.v1"
                or result.get("adoption_id") != adoption_id
                or result.get("operation_id") != operation_id
                or result.get("previous_source_identity") != expected_source
                or result.get("installation") != value):
            return False
    return True


def checked_installation(req):
    root = absolute(req.get("installation"), "installation")
    value = manage.installation(root)
    binding = req.get("binding") or {}
    if "installation_id" in binding and value["installation_id"] != binding["installation_id"]:
        fail("installation_changed", "The selected installation installation_id changed")
    recovery = False
    if "source_identity" in binding and value["source_identity"] != binding["source_identity"]:
        recovery = original_adoption_transition(req, value, binding["source_identity"])
        if not recovery:
            fail("installation_changed", "The selected installation source_identity changed")
    return value, recovery


def selected_module(path, prefix):
    path = manage.ordinary(path)
    key = prefix + hashlib.sha256(str(path).encode("utf-8") + path.read_bytes()).hexdigest()[:24]
    spec = importlib.util.spec_from_file_location(key, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[key] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(key, None)
        raise
    return module


@contextlib.contextmanager
def installed_sources(req):
    """Keep the original owner lock while using its selected native modules."""
    global manage, package
    bootstrap_manage, bootstrap_package = manage, package
    root = bootstrap_manage.ordinary(absolute(req.get("installation"), "installation"), True)
    with bootstrap_manage.locked(root):
        value, adoption_recovery = checked_installation(req)
        native = pathlib.Path(value["paths"]["application"]) / "native"
        old_path = list(sys.path)
        prior_archive = sys.modules.get("archive")
        prior_manage = sys.modules.get("manage")
        selected_manage = None
        selected_lock = None
        prior_copy = None
        try:
            sys.path.insert(0, str(native))
            selected_archive = selected_module(native / "archive.py", "taskerarmy_selected_archive_")
            sys.modules["archive"] = selected_archive
            selected_manage = selected_module(native / "manage.py", "taskerarmy_selected_manage_")
            if selected_manage.INSTALL_SCHEMA != bootstrap_manage.INSTALL_SCHEMA:
                fail("native_source_incompatible", "The selected installation requires another native operation adapter")
            if selected_manage.installation(root) != value:
                fail("native_source_identity", "The selected native implementation resolves another installation")
            selected_lock = selected_manage.locked
            prior_copy = selected_manage._COPY_DIRECTORY

            @contextlib.contextmanager
            def original_owned_lock(directory, name=".native.lock"):
                selected = pathlib.Path(directory).resolve(strict=True)
                if selected == root and name == ".native.lock":
                    # This exact original flock remains held by the outer
                    # owner. Re-enter its scope without opening a second flock.
                    yield root
                else:
                    with selected_lock(directory, name) as other:
                        yield other

            selected_manage._COPY_DIRECTORY = root / ".copy-partials"
            selected_manage.locked = original_owned_lock
            manage, package = selected_manage, selected_archive
            sys.modules["manage"] = selected_manage
            yield value, adoption_recovery
        finally:
            manage, package = bootstrap_manage, bootstrap_package
            if selected_manage is not None and selected_lock is not None:
                selected_manage.locked = selected_lock
                selected_manage._COPY_DIRECTORY = prior_copy
            if prior_archive is None:
                sys.modules.pop("archive", None)
            else:
                sys.modules["archive"] = prior_archive
            if prior_manage is None:
                sys.modules.pop("manage", None)
            else:
                sys.modules["manage"] = prior_manage
            sys.path[:] = old_path


def operator_module(value, worker):
    path = manage.ordinary(pathlib.Path(value["paths"]["application"]) / "operator_server.py")
    name = "taskerarmy_selected_operator_" + hashlib.sha256(str(path).encode()).hexdigest()[:16]
    prior = sys.modules.get("notification_outbox")
    sys.modules["notification_outbox"] = worker
    try:
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        if prior is None:
            sys.modules.pop("notification_outbox", None)
        else:
            sys.modules["notification_outbox"] = prior


def response(req, value, result, replayed=False):
    return {
        "schema": RESULT_SCHEMA, "ok": True, "operation": req["operation"],
        "request_id": req.get("request_id"),
        "installation": identity(value) if value else None,
        "result": public_result(req["operation"], result), "replayed": bool(replayed),
        "adapter_sha256": ADAPTER_SHA256,
    }


def journal_schema(db):
    db.execute("""CREATE TABLE IF NOT EXISTS taskerarmy_operation_requests (
        installation_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        request_sha256 TEXT NOT NULL,
        request_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('prepared','completed')),
        result_json TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        source_identity TEXT NOT NULL,
        adapter_sha256 TEXT NOT NULL,
        PRIMARY KEY (installation_id, request_id)
    )""")
    columns = {row["name"] for row in db.execute("PRAGMA table_info(taskerarmy_operation_requests)")}
    if not JOURNAL_COLUMNS.issubset(columns):
        fail("request_schema_changed", "The original named-operation table has an incompatible schema")


def named_request(req, value):
    # Include the reviewed binding and original path in the original request.
    body = {**req, "installation": value["paths"]["directory"]}
    encoded = manage.canonical(body)
    return encoded, hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def existing_request(db, req, value, checksum):
    row = db.execute(
        "SELECT * FROM taskerarmy_operation_requests WHERE installation_id=? AND request_id=?",
        (value["installation_id"], req["request_id"]),
    ).fetchone()
    if row is not None and (row["request_sha256"] != checksum or row["operation"] != req["operation"]):
        fail("request_conflict", "This request_id already names another complete operation")
    return dict(row) if row is not None else None


def completed_value(record):
    value = json.loads(record["result_json"])
    if isinstance(value, dict) and value.get("schema") == "taskerarmy.operation-rejection.v1":
        error = value["error"]
        fail(error["code"], error["message"])
    return value


def start_request(db, req, value, encoded, checksum, preparation=None):
    db.execute("""INSERT INTO taskerarmy_operation_requests(
        installation_id,request_id,operation,request_sha256,request_json,state,
        result_json,created_at,completed_at,source_identity,adapter_sha256
    ) VALUES(?,?,?,?,?,'prepared',?,?,NULL,?,?)""", (
        value["installation_id"], req["request_id"], req["operation"], checksum,
        encoded, manage.canonical(preparation) if preparation is not None else None,
        manage.utc(), value["source_identity"], ADAPTER_SHA256,
    ))


def complete_request(db, req, value, result):
    db.execute("""UPDATE taskerarmy_operation_requests
        SET state='completed',result_json=?,completed_at=?
        WHERE installation_id=? AND request_id=?""", (
        manage.canonical(result), manage.utc(), value["installation_id"], req["request_id"],
    ))


def atomic_outbox_request(req, value, worker, outbox):
    args = req["arguments"]
    name = req["operation"]
    encoded, checksum = named_request(req, value)
    original_transaction = outbox.transaction
    with original_transaction() as db:
        journal_schema(db)
        previous = existing_request(db, req, value, checksum)
        if previous is not None:
            if previous["state"] == "completed":
                return completed_value(previous), True
            fail("incomplete_atomic_request", "The original atomic request has an unexpected incomplete state")
        # Receive a committed original result before consulting later routing.
        # New authored inputs still pass the unchanged original validators
        # before any durable named request is inserted.
        if name == "events.receive":
            tenant = worker.identifier(args.get("tenant"), "tenant")
            ttl = integer(args.get("ttl_seconds", 86400), "ttl_seconds", 60, 604800)
            event = event_document(args.get("event"))
            worker.validate_event(tenant, event, worker.load_config(outbox.config_path), time.time())
            action = lambda: outbox.record(tenant, event, ttl)
        elif name == "deliveries.resolve":
            delivery = saved_integer(args.get("delivery_id"), "delivery_id")
            outcome = args.get("outcome")
            if outcome not in {"sent", "retry", "cancelled"}:
                fail("invalid_request", "outcome must be sent, retry, or cancelled")
            note = worker.text_value(args.get("note"), "resolution note", 300)
            action = lambda: outbox.resolve(delivery, outcome, note)
        elif name == "routes.resume":
            route = worker.identifier(args.get("route_id"), "route_id")
            action = lambda: outbox.resume_route(route)
        else:
            fail("unknown_operation", "This operation is not an atomic Outbox mutation")
        start_request(db, req, value, encoded, checksum)

        @contextlib.contextmanager
        def same_original_transaction():
            yield db

        # Invoke the original business method inside its original SQLite
        # transaction. Its queue change and this result have one commit.
        outbox.transaction = same_original_transaction
        try:
            result = action()
        finally:
            outbox.transaction = original_transaction
        complete_request(db, req, value, result)
    return result, False

def checked_configuration(args, path, operator, worker):
    revision = args.get("revision")
    if not isinstance(revision, str) or not SHA256.fullmatch(revision):
        fail("invalid_request", "revision must be the exact configuration revision that was opened")
    incoming = configuration_document(args.get("configuration"))
    operator.checked_document(incoming)
    raw = (json.dumps(incoming, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(raw) > operator.MAX_BODY:
        fail("configuration_too_large", "The original configuration limit is 262144 bytes")
    # The original loader validates environment-reference names and every
    # tenant/route field. No supplied secret value is retained before validation.
    fd, name = tempfile.mkstemp(prefix=".operation-configuration-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
        worker.load_config(name)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(name)
    return incoming, hashlib.sha256(raw).hexdigest()


def configuration_request(req, value, worker, outbox, operator):
    args = req["arguments"]
    path = pathlib.Path(value["paths"]["configuration"])
    encoded, checksum = named_request(req, value)
    with outbox.transaction() as db:
        journal_schema(db)
        previous = existing_request(db, req, value, checksum)
        if previous is not None and previous["state"] == "completed":
            return completed_value(previous), True
        if previous is None:
            incoming, target = checked_configuration(args, path, operator, worker)
            current = package.digest_file(path)
            if current != args["revision"]:
                fail("configuration_changed", "Configuration changed. Read it and compose the selected edit.")
            start_request(db, req, value, encoded, checksum, {
                "previous_revision": args["revision"], "target_revision": target,
            })
        else:
            # This exact named request passed document validation before its
            # prepared record committed. The original writer still owns
            # transition checks. Reconciliation needs these retained bytes,
            # not another temporary document-validation file.
            incoming = configuration_document(args["configuration"])
            raw = (json.dumps(incoming, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            target = hashlib.sha256(raw).hexdigest()
            preparation = json.loads(previous["result_json"])
            if preparation != {"previous_revision": args["revision"], "target_revision": target}:
                fail("request_conflict", "The retained original configuration selection differs")
    current = package.digest_file(path)
    if previous is not None and current == target:
        # The original atomic file replacement committed before the result
        # write. Receive the already-selected source, without another write.
        pass
    elif current == args["revision"]:
        try:
            selected = operator.save_configuration(path, args["revision"], incoming)
        except (operator.InputError, operator.OperatorError) as exc:
            # These original validation/CAS refusals occur before replacement.
            # Retain that actual terminal outcome; an I/O failure may happen
            # after replacement and therefore keeps the prepared selection.
            code = getattr(exc, "code", "configuration_rejected")
            if not isinstance(code, str):
                code = "configuration_rejected"
            rejection = {
                "schema": "taskerarmy.operation-rejection.v1",
                "error": {"code": code, "message": str(exc)[:1000]},
                "previous_revision": args["revision"], "target_revision": target,
            }
            with outbox.transaction() as db:
                journal_schema(db)
                saved = existing_request(db, req, value, checksum)
                if saved is None:
                    fail("request_missing", "The original configuration request disappeared")
                if saved["state"] == "completed":
                    return completed_value(saved), True
                complete_request(db, req, value, rejection)
            fail(code, rejection["error"]["message"])
        if selected != target:
            fail("configuration_identity", "The original configuration writer returned another revision")
    else:
        fail("configuration_outcome_changed",
             "The current configuration differs from both retained revisions; inspect this request and current configuration.")
    result = {
        "revision": target, "configuration": incoming,
        "credentials": {
            "tenants": {key: bool(os.environ.get(row["ingress_token_env"]))
                        for key, row in incoming["tenants"].items()},
            "routes": {row["id"]: bool(os.environ.get(row["webhook_env"]))
                       for row in incoming["routes"]},
        },
    }
    with outbox.transaction() as db:
        journal_schema(db)
        saved = existing_request(db, req, value, checksum)
        if saved is None:
            fail("request_missing", "The original configuration request disappeared")
        if saved["state"] == "completed":
            return completed_value(saved), True
        complete_request(db, req, value, result)
    return result, previous is not None

def list_queue(args, worker, outbox):
    limit = integer(args.get("limit", 100), "limit")
    where, values = [], []
    for key, column in (
        ("tenant", "tenant_id"), ("status", "status"),
        ("route_id", "route_id"), ("job_id", "job_id"),
    ):
        if args.get(key) is not None:
            value = worker.identifier(args[key], key)
            where.append(column + "=?")
            values.append(value)
    filters = " WHERE " + " AND ".join(where) if where else ""
    before = args.get("before_id")
    if before is not None:
        before = saved_integer(before, "before_id")
    page_where = list(where)
    page_values = list(values)
    if before is not None:
        page_where.append("id<?")
        page_values.append(before)
    page_filter = " WHERE " + " AND ".join(page_where) if page_where else ""
    with contextlib.closing(outbox.connect()) as db:
        # Counts and this full page refer to one original SQLite read snapshot.
        db.execute("BEGIN")
        counts = [dict(row) for row in db.execute(
            "SELECT status,COUNT(*) AS count FROM deliveries" + filters + " GROUP BY status ORDER BY status",
            values,
        )]
        rows = [dict(row) for row in db.execute(
            "SELECT " + ",".join(QUEUE_FIELDS) + " FROM deliveries" + page_filter +
            " ORDER BY id DESC LIMIT ?", [*page_values, limit + 1],
        )]
        db.rollback()
    more = len(rows) > limit
    rows = rows[:limit]
    return {
        "deliveries": rows, "counts": counts,
        "total": sum(row["count"] for row in counts),
        "next_before_id": rows[-1]["id"] if more else None,
        "filters": {key: args[key] for key in ("tenant", "status", "route_id", "job_id") if args.get(key) is not None},
    }


@contextlib.contextmanager
def original_journal(value):
    # A completed request remains receivable even when a later configuration
    # edit is invalid or new temporary files cannot be created.
    path = manage.ordinary(value["paths"]["database"])
    db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA query_only=ON")
        yield db
    finally:
        db.close()


def journal_exists(db):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (JOURNAL,)).fetchone() is not None


def completed_request(req, value):
    _, checksum = named_request(req, value)
    with original_journal(value) as db:
        if not journal_exists(db):
            return None
        saved = existing_request(db, req, value, checksum)
    if saved is not None and saved["state"] == "completed":
        return completed_value(saved), True
    return None


def get_request(args, value):
    rid = identifier(args.get("request_id"))
    installation_id = args.get("installation_id", value["installation_id"])
    identifier(installation_id, "installation_id")
    with original_journal(value) as db:
        if not journal_exists(db):
            return {"request": None}
        row = db.execute(
            "SELECT * FROM taskerarmy_operation_requests WHERE installation_id=? AND request_id=?",
            (installation_id, rid),
        ).fetchone()
    if row is None:
        return {"request": None}
    item = dict(row)
    item["request"] = json.loads(item["request_json"])
    saved = item.pop("result_json")
    item["result"] = json.loads(saved) if saved else None
    return {"request": item}

def describe_commands(args, value, worker):
    roles = args.get("roles", ["operator", "ingress", "worker"])
    if (not isinstance(roles, list) or not roles
            or any(not isinstance(role, str) or role not in {"operator", "ingress", "worker"} for role in roles)
            or len(set(roles)) != len(roles)):
        fail("invalid_request", "roles must select distinct operator, ingress, or worker services")
    operator_port = integer(args.get("operator_port", 0), "operator_port", 0, 65535)
    ingress_port = integer(args.get("ingress_port", 8094), "ingress_port", 1, 65535)
    interval = args.get("worker_interval", 2.0)
    if isinstance(interval, bool) or not isinstance(interval, (int, float)) or not 0.1 <= interval <= 60:
        fail("invalid_request", "worker_interval must be from 0.1 through 60 seconds")
    token_env = args.get("operator_token_env", "TASKER_OPERATOR_TOKEN")
    if not isinstance(token_env, str) or not worker.ENV.fullmatch(token_env):
        fail("invalid_request", "operator_token_env must be an environment-reference name")
    ready = absolute(args.get("ready_file"), "ready_file") if "operator" in roles else None
    app = pathlib.Path(value["paths"]["application"])
    executable = str(manage.ordinary(value["python"]["path"]))
    worker_path = str(manage.ordinary(app / "notification_outbox.py"))
    config = worker.load_config(value["paths"]["configuration"])
    references = {
        "operator": [token_env],
        "ingress": sorted({row["ingress_token_env"] for row in config["tenants"].values()}),
        "worker": sorted({row["webhook_env"] for row in config["routes"] if row["enabled"]}),
    }
    common = [executable, "-B", worker_path, "--db", value["paths"]["database"],
              "--config", value["paths"]["configuration"]]
    commands = []
    for role in roles:
        if role == "operator":
            script = str(manage.ordinary(app / "native" / "launch_operator.py"))
            argv = [executable, "-B", script, "--directory", value["paths"]["directory"],
                    "--ready-file", ready, "--port", str(operator_port), "--token-env", token_env]
            health = {"kind": "private-ready-file", "path": ready,
                      "schema": "taskerarmy.operator-process.v1"}
        elif role == "ingress":
            script = worker_path
            argv = common + ["serve", "--host", "127.0.0.1", "--port", str(ingress_port)]
            health = {"kind": "http", "url": "http://127.0.0.1:" + str(ingress_port) + "/healthz"}
        else:
            script = worker_path
            argv = common + ["run", "--interval", str(interval)]
            health = {"kind": "managed-process"}
        commands.append({
            "role": role, "executable": executable, "argv": argv, "cwd": str(app),
            "script": script, "script_sha256": package.digest_file(script),
            "ready_file": ready if role == "operator" else None,
            "health": health,
            "environment_references": [
                {"name": name, "present": bool(os.environ.get(name))} for name in references[role]
            ],
        })
    return {"commands": commands, "installation": identity(value)}


def perform(raw):
    req = request(raw)
    name, args = req["operation"], req["arguments"]
    if name == "installation.prepare":
        operation_id = identifier(args.get("operation_id", req.get("request_id")), "operation_id")
        result = manage.prepare(
            absolute(args.get("application"), "application"),
            absolute(args.get("configuration"), "configuration"),
            absolute(args.get("directory"), "directory"),
            optional_path(args, "manifest_path"), optional_path(args, "python"), operation_id,
        )
        value = result.get("installation", result)
        if value.get("schema") != manage.INSTALL_SCHEMA:
            value = manage.installation(args["directory"])
        return response(req, value, result, result.get("replayed", False))
    if name == "installation.receive":
        result = manage.receive(
            absolute(args.get("archive_path"), "archive_path"),
            absolute(args.get("directory"), "directory"), optional_path(args, "python"),
        )
        return response(req, result["installation"], result, result.get("replayed", False))

    # The selected archive/manage/worker/operator all come from this actual
    # installed application. Its original flock spans selection and operation.
    with installed_sources(req) as selected:
        value, adoption_recovery = selected
        root = value["paths"]["directory"]
        if name == "installation.inspect":
            return response(req, value, manage.inspect(root))
        if name == "installation.adopt_source":
            operation_id = identifier(args.get("operation_id", req.get("request_id")), "operation_id")
            result = manage.adopt_source(
                root, absolute(args.get("application"), "application"),
                optional_path(args, "manifest_path"), operation_id,
            )
            return response(req, manage.installation(root), result, adoption_recovery or result.get("replayed", False))
        if name == "installation.snapshot":
            operation_id = identifier(args.get("operation_id", req.get("request_id")), "operation_id")
            result = manage.snapshot(root, absolute(args.get("output"), "output"), operation_id)
            replayed = result.get("replayed", False) or result.get("recovered_original_output", False)
            return response(req, value, result, replayed)
        if name in NAMED_MUTATIONS:
            completed = completed_request(req, value)
            if completed is not None:
                return response(req, value, completed[0], completed[1])
        if name == "requests.get":
            return response(req, value, get_request(args, value))

        worker, outbox = manage.outbox_for(value)
        operator = operator_module(value, worker)
        if name == "configuration.read":
            result = operator.public_configuration(pathlib.Path(value["paths"]["configuration"]))
        elif name == "configuration.save":
            result, replayed = configuration_request(req, value, worker, outbox, operator)
            return response(req, value, result, replayed)
        elif name in {"events.receive", "deliveries.resolve", "routes.resume"}:
            result, replayed = atomic_outbox_request(req, value, worker, outbox)
            return response(req, value, result, replayed)
        elif name == "queue.status":
            tenant = worker.identifier(args["tenant"], "tenant") if args.get("tenant") is not None else None
            result = outbox.status(tenant, integer(args.get("limit", 100), "limit"))
        elif name == "queue.list":
            result = list_queue(args, worker, outbox)
        elif name == "queue.get":
            result = operator.safe_delivery(outbox.inspect(saved_integer(args.get("delivery_id"), "delivery_id")))
        elif name == "jobs.history":
            limit = integer(args.get("limit", 100), "limit")
            before = args.get("before_version")
            if before is not None:
                before = saved_integer(before, "before_version")
            result = outbox.job_timeline(
                worker.identifier(args.get("tenant"), "tenant"),
                worker.identifier(args.get("job"), "job"), before, limit,
            )
        elif name == "events.render":
            config = worker.load_config(outbox.config_path)
            event, _ = worker.validate_event(
                worker.identifier(args.get("tenant"), "tenant"), event_document(args.get("event")), config, time.time(),
            )
            result = worker.slack_payload(event, config["product_name"])
        elif name == "commands.describe":
            result = describe_commands(args, value, worker)
        else:
            fail("unknown_operation", "Select a declared TaskerArmy operation")
    return response(req, value, result)


def decode_request(raw):
    if len(raw) > MAX_REQUEST:
        fail("request_too_large", "Operation requests are limited to 2097152 bytes")

    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                fail("duplicate_json_field", "The operation request contains a repeated JSON field")
            result[key] = value
        return result

    def constant(_):
        fail("invalid_json_number", "JSON numbers must be finite")

    return json.loads(raw.decode("utf-8"), object_pairs_hook=unique, parse_constant=constant)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", help="One UTF-8 JSON request file; omit or use - for stdin")
    args = parser.parse_args(argv)
    req = None
    try:
        if args.request and args.request != "-":
            path = manage.ordinary(absolute(args.request, "request"))
            with path.open("rb") as stream:
                raw = stream.read(MAX_REQUEST + 1)
        else:
            raw = sys.stdin.buffer.read(MAX_REQUEST + 1)
        req = decode_request(raw)
        result = perform(req)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
        return 0
    except Exception as exc:
        code = getattr(exc, "code", None)
        if not isinstance(code, str):
            if isinstance(exc, sqlite3.Error):
                code = "database_operation_failed"
            elif isinstance(exc, (OSError, IOError)):
                code = "local_source_operation_failed"
            elif isinstance(exc, (json.JSONDecodeError, UnicodeError, ValueError, TypeError)):
                code = "invalid_request"
            else:
                code = "operation_failed"
        # Exceptions from these original validators name fields and local
        # source operations. Never print an environment, request body or traceback.
        result = {
            "schema": RESULT_SCHEMA, "ok": False,
            "operation": req.get("operation") if isinstance(req, dict) and isinstance(req.get("operation"), str) else None,
            "request_id": req.get("request_id") if isinstance(req, dict) and isinstance(req.get("request_id"), str) else None,
            "error": {"code": code, "message": str(exc)[:1000]},
            "adapter_sha256": ADAPTER_SHA256,
        }
        print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
