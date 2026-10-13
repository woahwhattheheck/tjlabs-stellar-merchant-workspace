"""One retained operator lifecycle over the original source and conditional delivery modules."""
import concurrent.futures
import contextlib
import hashlib
import itertools
import os
import threading
from pathlib import Path
from .canonical import (atomic, decode, digest, encode, full_sha, json_file, now,
                        private_directory, read_bytes, request_id, sha_bytes, stable_text)
from .connection import Configuration, parsed
from .dataverse import Dataverse, NativeReads
from .delivery import review_target, publish, accept_observation
from .errors import PMRSError, ProviderError, require
from .package import export_workspace, receive_workspace, inspect_archive, _source_files
from .reconcile import save_mapping, reconcile
from .reports import report_html, totals_csv
from .source import Source, capture, CUSTOM_RESOURCES, STANDARD_RESOURCES
from .store import Store, file_lock

COMMAND_SCHEMA = "commons.pmrs-command.v1"
TERMINAL = {"COMPLETE", "FAILED", "CANCELLED"}
KINDS = {
    "capture": ({"connection", "profile"}, set()),
    "mapping": ({"source_id", "profile"}, set()),
    "reconcile": ({"mapping_id"}, set()),
    "target-review": ({"connection", "reconciliation_id", "profile"}, set()),
    "deliver": ({"connection", "review_id"}, set()),
    "recover": ({"delivery_id"}, set()),
    "continue-delivery": ({"delivery_id"}, set()),
    "accept-observation": ({"delivery_id", "row_id", "observation_sha256", "reviewer", "note"}, set()),
    "export": (set(), {"label"}),
}

class GuardedHTTP:
    def __init__(self, original, stopped):
        self.original, self.stopped = original, stopped
        self.public, self.roots = original.public, original.roots
    def _check(self):
        require(not self.stopped(), "OPERATION_CANCELLED", "The original operation stopped before its next provider request.")
    def request(self, method, url, **options):
        self._check()
        admitted = options.get("admit")
        if admitted is not None:
            def admit():
                self._check(); admitted()
            options["admit"] = admit
        return self.original.request(method, url, **options)
    def get(self, url): return self.request("GET", url)

class _MemoryObjects:
    def __init__(self): self.values = {}
    def put_bytes(self, body):
        key = sha_bytes(body); self.values[key] = body
        return {"sha256": key, "bytes": len(body)}
    def get_bytes(self, descriptor, **_):
        body = self.values[descriptor["sha256"]]
        require(len(body) == descriptor["bytes"] and sha_bytes(body) == descriptor["sha256"],
                "MEMORY_OBSERVATION_CHANGED", "A live metadata observation differs.")
        return body

def page(value, offset=0, limit=25):
    require(type(offset) is int and offset >= 0 and type(limit) is int and 1 <= limit <= 100,
            "PAGE_LIMIT", "Choose an offset and 1–100 records.")
    items = value[offset:offset + limit]
    return {"items": items, "page": {"offset": offset, "limit": limit, "total": len(value),
            "next_offset": offset + len(items) if offset + len(items) < len(value) else None}}

class Workspace:
    def __init__(self, directory, *, source_root=None, connections=None, create=True):
        self.root = Path(directory).absolute()
        parent_receipt = self.root.parent / "receiving.json"
        if self.root.name == "workspace" and parent_receipt.is_file():
            receipt = decode(read_bytes(parent_receipt))
            if receipt.get("schema") == "commons.pmrs-receiving.v1":
                require(receipt.get("state") == "COMPLETE", "RECEIVING_INCOMPLETE",
                        "Complete the original archive receiving before opening its working copy.")
        self.store = Store(self.root, create=create)
        self.source_root = Path(source_root).absolute() if source_root else Path(__file__).resolve().parents[2]
        self.configuration = Configuration(connections, self.root) if connections else None
        self.command_root = private_directory(self.root / "commands")
        self._guard = threading.RLock()
        self._executor = None
        self._lease = None
        self._closed = False
        self._active = {}
        self._futures = {}

    def open(self):
        with self._guard:
            require(not self._closed, "WORKSPACE_CLOSED", "This operator lifecycle has closed.")
            if self._executor is not None: return self
            lease = file_lock(self.root / "locks" / "service.lock", nonblocking=True)
            lease.__enter__()
            try:
                # The previous owner has released the kernel lock. Its unfinished
                # wrapper may be resumed explicitly; no provider call starts here.
                with self.store.locked():
                    for path in self.command_root.glob("*.json"):
                        value = self._read_command_path(path)
                        if value["state"] in {"QUEUED", "RUNNING"}:
                            value["state"] = "INTERRUPTED"
                            value["updated_at"] = now()
                            value.setdefault("history", []).append({"at": now(), "event": "PREVIOUS_SERVICE_ENDED"})
                            json_file(path, value, replace=True)
                self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="pmrs-original")
                self._lease = lease
            except BaseException:
                lease.__exit__(None, None, None); raise
        return self

    def stop_admission(self):
        with self._guard:
            self._closed = True
            for stop in self._active.values(): stop.set()

    def close(self):
        with self._guard:
            if self._executor is None and self._lease is None:
                self._closed = True
                return
            self._closed = True
            for stop in self._active.values(): stop.set()
            executor, lease = self._executor, self._lease
        if executor is not None: executor.shutdown(wait=True, cancel_futures=False)
        if lease is not None: lease.__exit__(None, None, None)
        with self._guard:
            self._executor, self._lease = None, None

    def __enter__(self): return self.open()
    def __exit__(self, *_): self.close()

    def _path(self, identifier): return self.command_root / (request_id(identifier) + ".json")
    def _read_command_path(self, path):
        value = decode(read_bytes(path))
        require(value.get("schema") == COMMAND_SCHEMA and value["id"] == path.stem
                and value["request_sha256"] == digest(value["request"])
                and value["request"]["id"] == value["id"] and value["request"]["kind"] == value["kind"],
                "COMMAND_CHANGED", "The original saved command changed.")
        return value
    def command(self, identifier):
        path = self._path(identifier)
        require(path.exists(), "ACTION_NOT_FOUND", "The original action is absent.", id=identifier)
        with self.store.locked(): value = self._read_command_path(path)
        if value.get("result") and isinstance(value["result"], dict) and "operation" in value["result"]:
            value["result"] = {k: v for k, v in value["result"].items() if k != "operation"}
        if value["kind"] in {"deliver", "recover", "continue-delivery", "accept-observation"}:
            delivery_id = value["id"] if value["kind"] == "deliver" else value["request"]["arguments"]["delivery_id"]
            try: value["operation"] = self.store.operation(delivery_id)
            except PMRSError as error:
                if error.code != "OPERATION_NOT_FOUND": raise
        return value
    def _save_command(self, identifier, **changes):
        with self.store.locked():
            path = self._path(identifier); value = self._read_command_path(path)
            require(not (set(changes) & {"id", "kind", "request", "request_sha256", "created_at", "schema"}),
                    "COMMAND_IDENTITY", "Original command identity is immutable.")
            value.update(changes); value["updated_at"] = now()
            json_file(path, value, replace=True)
            return value
    def commands(self, *, offset=0, limit=25):
        with self.store.locked():
            values = [self._read_command_path(p) for p in self.command_root.glob("*.json")]
        values.sort(key=lambda x: (x["created_at"], x["id"]), reverse=True)
        result = page(values, offset, limit)
        result["items"] = [{k: row[k] for k in ("id", "kind", "state", "created_at", "updated_at")} |
            ({"result": {key: value for key, value in row["result"].items()
                        if key in {"record_id", "ready", "delivery_id", "export", "download"}},
              "full_result_url": "/api/actions/" + row["id"]} if row.get("result") else {}) |
            ({"error": row["error"]} if row.get("error") else {}) for row in result["items"]]
        return result

    @staticmethod
    def normalize_command(body):
        require(isinstance(body, dict) and set(body) == {"id", "kind", "arguments"},
                "ACTION_REQUEST", "Supply the original action ID, kind and complete arguments.")
        request_id(body["id"])
        require(body["kind"] in KINDS and isinstance(body["arguments"], dict),
                "ACTION_KIND", "Unsupported operator action.")
        required, optional = KINDS[body["kind"]]
        require(required <= set(body["arguments"]) <= required | optional,
                "ACTION_ARGUMENTS", "The selected action has missing or unknown arguments.")
        require(len(encode(body)) <= 8 * 1024 * 1024, "ACTION_LIMIT", "The saved action exceeds 8 MiB.")
        return body

    def submit(self, body):
        body = self.normalize_command(body)
        with self._guard:
            require(not self._closed and self._executor is not None, "WORKSPACE_CLOSED",
                    "The original operator service is not accepting work.")
            with self.store.locked():
                path = self._path(body["id"])
                value = self._read_command_path(path) if path.exists() else None
                if value is not None:
                    require(value["request"] == body and value["request_sha256"] == digest(body),
                            "ACTION_REQUEST_CHANGED", "This action ID already belongs to another complete request.")
                    if value["state"] in TERMINAL or body["id"] in self._active: return value
                if body["kind"] == "deliver":
                    require(self.configuration is not None, "CONNECTION_CONFIGURATION", "Select the private connection configuration.")
                    review = self.store.record(body["arguments"]["review_id"], "target-review")
                    selected = self.configuration.selected(body["arguments"]["connection"], "dataverse")["public"]
                    require(review["body"]["connection"] == selected, "TARGET_CONNECTION_CHANGED",
                            "This connection differs from the exact reviewed target.")
                    self.store.claim_delivery(review["id"], body["id"], selected, already_locked=True)
                if value is None:
                    value = {"schema": COMMAND_SCHEMA, "id": body["id"], "kind": body["kind"],
                             "request": body, "request_sha256": digest(body), "state": "QUEUED",
                             "created_at": now(), "updated_at": now(), "history": [], "cancel_requested": False}
                    json_file(path, value)
                value["state"] = "QUEUED"; value["cancel_requested"] = False; value.pop("error", None)
                value["updated_at"] = now()
                json_file(path, value, replace=True)
            stop = threading.Event()
            self._active[body["id"]] = stop
            try: self._futures[body["id"]] = self._executor.submit(self._run, body["id"], stop)
            except BaseException:
                self._active.pop(body["id"], None)
                self._save_command(body["id"], state="INTERRUPTED")
                raise
        return self.command(body["id"])

    def run(self, body):
        self.submit(body)
        with self._guard: future = self._futures.get(body["id"])
        if future is not None: future.result()
        return self.command(body["id"])

    def cancel(self, identifier):
        with self._guard:
            value = self.command(identifier)
            if value["state"] in TERMINAL: return value
            stop = self._active.get(identifier)
            if stop is not None:
                stop.set()
                return self._save_command(identifier, cancel_requested=True)
            # There is no admitted in-process task under this sole service lease.
            return self._save_command(identifier, cancel_requested=True, state="CANCELLED")

    def _run(self, identifier, stop):
        try:
            value = self.command(identifier)
            if stop.is_set():
                self._save_command(identifier, state="CANCELLED" if value.get("cancel_requested") else "INTERRUPTED")
                return
            self._save_command(identifier, state="RUNNING")
            result = self._dispatch(value["request"], stop.is_set)
            # An authoritative native/result receipt survives a late cancel.
            self._save_command(identifier, state="COMPLETE", result=result, error=None)
        except BaseException as error:
            try:
                code = getattr(error, "code", type(error).__name__)
                if code == "OPERATION_CANCELLED":
                    state = "CANCELLED" if self.command(identifier).get("cancel_requested") else "INTERRUPTED"
                elif isinstance(error, (ProviderError, OSError)) or code in {
                    "OPERATION_BUSY", "OBJECT_LIMIT", "JSON_LIMIT", "WORKSPACE_CLOSED"}:
                    state = "INTERRUPTED"
                else: state = "FAILED" if isinstance(error, PMRSError) else "INTERRUPTED"
                public = error.public() if isinstance(error, PMRSError) else {
                    "code": code, "message": "The original operation ended before its complete local receipt.",
                    "details": {"resume": "same_saved_request"}}
                self._save_command(identifier, state=state, error=public)
            except Exception: pass
        finally:
            with self._guard: self._active.pop(identifier, None)

    def _http(self, alias, kind, stopped):
        require(self.configuration is not None, "CONNECTION_CONFIGURATION", "Select the launcher-owned private connection configuration.")
        return GuardedHTTP(self.configuration.http(alias, kind), stopped)

    def _contract(self):
        path = self.source_root / "businesscentral" / "contract" / "native-api.json"
        body = read_bytes(path)
        native = decode(body)
        require(native.get("schema") == "commons.businesscentral.native-api-contract.v1",
                "BC_NATIVE_CONTRACT", "Use the complete selected native Business Central contract.")
        source_manifest = decode(read_bytes(self.source_root / "source-manifest.json"))
        descriptor = source_manifest["files"].get("businesscentral/contract/native-api.json")
        require(descriptor == {"bytes": len(body), "sha256": sha_bytes(body)},
                "BC_NATIVE_CONTRACT_CHANGED", "Native contract differs from the selected complete product source.")
        return {"schema": native["schema"], "contract_version": native["contractVersion"],
                "object": self.store.put_bytes(body), "source_member": "businesscentral/contract/native-api.json"}

    def _delivery(self, delivery_id, stopped):
        original = self.store.operation(request_id(delivery_id))
        require(original["kind"] == "target-delivery", "DELIVERY_KIND", "Select an original target delivery operation.")
        selected = original["request"]["connection"]
        http = self._http(selected["alias"], "dataverse", stopped)
        require(http.public == selected, "TARGET_CONNECTION_CHANGED",
                "The launcher connection differs from the original delivery.")
        return original, http

    def _dispatch(self, body, stopped):
        identifier, kind, args = body["id"], body["kind"], body["arguments"]
        if kind == "capture":
            record = capture(self.store, self._http(args["connection"], "businesscentral", stopped),
                             identifier, args["profile"], self._contract())
            return {"record_id": record["id"]}
        if kind == "mapping":
            record = save_mapping(self.store, identifier, args["source_id"], args["profile"])
            return {"record_id": record["id"]}
        if kind == "reconcile":
            record = reconcile(self.store, identifier, args["mapping_id"])
            return {"record_id": record["id"], "ready": record["body"]["summary"]["ready"]}
        if kind == "target-review":
            record = review_target(self.store, self._http(args["connection"], "dataverse", stopped),
                                   identifier, args["reconciliation_id"], args["profile"])
            return {"record_id": record["id"]}
        if kind == "deliver":
            operation = publish(self.store, self._http(args["connection"], "dataverse", stopped),
                                identifier, args["review_id"], execute=True, stopped=stopped)
            return {"delivery_id": identifier, "operation": operation}
        if kind in {"recover", "continue-delivery"}:
            original, http = self._delivery(args["delivery_id"], stopped)
            operation = publish(self.store, http, original["id"], original["request"]["review_id"],
                                execute=kind == "continue-delivery", continue_same=kind == "continue-delivery", stopped=stopped)
            return {"delivery_id": original["id"], "operation": operation}
        if kind == "accept-observation":
            operation = accept_observation(self.store, identifier, args["delivery_id"], args["row_id"],
                args["observation_sha256"], reviewer=args["reviewer"], note=args["note"])
            return {"delivery_id": args["delivery_id"], "acceptance": operation,
                    "operation": self.store.operation(args["delivery_id"])}
        if kind == "export":
            result = export_workspace(self.store, self.source_root, identifier,
                                      label=args.get("label", "Project and grant finance handover"))
            return {"export": result, "download": {"name": result["name"], "sha256": result["sha256"],
                    "bytes": result["bytes"], "url": "/api/files/export/" + identifier + "/pmrs-handover.zip"}
                    if result["available"] else None}
        raise PMRSError("ACTION_KIND", "Unsupported operator action.")

    def state(self):
        actions = self.commands(limit=100)
        return {"workspace": self.store.identity,
                "connections": self.configuration.public() if self.configuration else [],
                "records": self.store.list_records(limit=25), "actions": actions["items"],
                "actions_page": actions["page"]}

    def record_view(self, identifier):
        record = self.store.record(identifier)
        if record["kind"] == "source":
            body = {k: v for k, v in record["body"].items() if k != "parts"}
            body["page_count"] = sum(len(part["pages"]) for part in record["body"]["parts"])
            body["raw_record_url"] = "/api/files/record/" + record["id"] + "/record.json"
            return {**record, "body": body}
        if record["kind"] == "reconciliation":
            body = {**record["body"], "summary": dict(record["body"]["summary"])}
            for key in ("totals", "findings"):
                whole = body["summary"][key]
                body["summary"][key] = whole[:25]
                body["summary"][key + "_count"] = len(whole)
                body["summary"][key + "_partial"] = len(whole) > 25
            return {**record, "body": body}
        return record

    def record_page(self, identifier, field, *, offset=0, limit=25):
        require(field in {"totals", "findings"}, "RECORD_PAGE", "Choose totals or findings.")
        record = self.store.record(identifier, "reconciliation")
        return page(record["body"]["summary"][field], offset, limit)

    def source_page(self, identifier, resource, *, offset=0, limit=25):
        require(resource in ("company",) + CUSTOM_RESOURCES + STANDARD_RESOURCES,
                "SOURCE_RESOURCE", "Unsupported retained source collection.")
        page([], offset, limit)
        source = Source(self.store, identifier)
        items = list(itertools.islice(source.rows(resource), offset, offset + limit))
        total = source.body["counts"][resource]
        return {"items": items, "page": {"offset": offset, "limit": limit, "total": total,
                "next_offset": offset + len(items) if offset + len(items) < total else None}}

    def target_schema(self, alias, entity):
        with self._guard:
            require(not self._closed, "WORKSPACE_CLOSED", "This operator is closing.")
        http = self._http(alias, "dataverse", lambda: False)
        reads = NativeReads(_MemoryObjects(), http, {"reads": {}}, lambda: None)
        native = Dataverse(http, reads)
        actor = native.identity()
        result = native.entity(entity)
        return {"entity": result["entity"], "attributes": result["attributes"],
                "relationships": result["relationships"], "organization_id": actor["OrganizationId"],
                "observation": "live_selection_metadata; exact write review retains its own original observations"}

    def file(self, family, identifier, filename):
        if family == "export":
            operation = self.store.operation(request_id(identifier))
            require(operation["kind"] == "workspace-export" and operation.get("result")
                    and filename == "pmrs-handover.zip", "FILE_NOT_FOUND", "The completed original export is unavailable.")
            path = self.root / "exports" / identifier / filename
            require(path.is_file(), "FILE_EXTERNAL", "This historical archive remains with its original delivery.")
            expected = operation["result"]
            return self._file_descriptor(path, filename, "application/zip", expected)
        require(family == "record", "FILE_NOT_FOUND", "Unsupported file collection.")
        record = self.store.record(full_sha(identifier))
        cache = private_directory(self.root / "exports" / "views" / identifier)
        if filename == "rows.jsonl" and record["kind"] == "reconciliation":
            descriptor = record["body"]["rows"]; path = self.store.verify_object(descriptor)
            return self._file_descriptor(path, filename, "application/x-ndjson", descriptor)
        if filename == "record.json": body, mime = encode(record), "application/json"
        elif filename == "report.html": body, mime = report_html(record), "text/html; charset=utf-8"
        elif filename == "totals.csv" and record["kind"] == "reconciliation":
            body, mime = totals_csv(record["body"]), "text/csv; charset=utf-8"
        else: raise PMRSError("FILE_NOT_FOUND", "The selected record has no such native report.")
        path = cache / filename; atomic(path, body)
        return self._file_descriptor(path, filename, mime, {"sha256": sha_bytes(body), "bytes": len(body)})

    @staticmethod
    def _file_descriptor(path, name, mime, expected):
        path = Path(path)
        require(path.is_file() and not path.is_symlink() and path.stat().st_size == expected["bytes"],
                "FILE_CHANGED", "Original download size differs.")
        with path.open("rb") as stream: actual = hashlib.file_digest(stream, "sha256").hexdigest()
        require(actual == expected["sha256"], "FILE_CHANGED", "Original download hash differs.")
        return {"path": path, "name": name, "mime": mime, "bytes": expected["bytes"], "sha256": actual}
