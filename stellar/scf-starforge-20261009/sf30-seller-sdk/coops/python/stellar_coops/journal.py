# MIT. Original request identities and one operating-system lease per local receiver.
from __future__ import annotations
import base64
import contextlib
import hashlib
import os
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode
from .transport import (ConsoleSession, ReceivingError, atomic_json, canonical_path,
                        decode_json, digest, json_bytes, private_directory, read_json,
                        regular_file, require, stable)


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class ReceiverJournal:
    def __init__(self, directory, startup_file=None, *, adopt_origin=False, origin_note="", wait_seconds=60):
        self.directory = private_directory(directory)
        self.startup_file = startup_file
        self.adopt_origin, self.origin_note = adopt_origin, origin_note
        self.wait_seconds = max(0, min(float(wait_seconds), 3600))
        self.session = None
        self.binding = None
        self._lock_context = None
        self._lock = None

    def __enter__(self):
        lock_path = self.directory / "receiver.lock"
        try:
            with regular_file(lock_path, "w+b", create=True) as handle:
                handle.write(b"0")
                handle.flush()
                os.fsync(handle.fileno())
        except FileExistsError:
            pass
        self._lock_context = regular_file(lock_path, "r+b")
        self._lock = self._lock_context.__enter__()
        try:
            if os.name == "nt":
                import msvcrt
                self._lock.seek(0)
                msvcrt.locking(self._lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            path = self.directory / "receiver.json"
            self.binding = read_json(path) if path.exists() else None
            if self.binding is not None:
                require(self.binding.get("schema") == "stellar-forge.coops-python-receiver.v1",
                        "COOPS_PY_STATE", "This directory belongs to another receiving format.")
            if self.startup_file is not None:
                self.connect(self.startup_file, adopt_origin=self.adopt_origin, note=self.origin_note)
            else:
                require(self.binding is not None, "COOPS_PY_SESSION", "Open the original console once before offline receiving.")
            private_directory(self.directory / "operations")
            return self
        except Exception:
            self._lock_context.__exit__(None, None, None)
            self._lock_context = self._lock = None
            raise

    def __exit__(self, *_):
        self.session = None
        if self._lock_context is not None:
            self._lock_context.__exit__(None, None, None)
            self._lock_context = self._lock = None

    def connect(self, startup_file, *, adopt_origin=False, note=""):
        session = ConsoleSession(startup_file)
        schema = session.schema()
        if self.binding is None:
            self.binding = {"schema": "stellar-forge.coops-python-receiver.v1",
                            "receiverId": str(uuid.uuid4()), "workspaceId": schema["workspaceId"],
                            "origin": session.origin, "createdAt": now(), "originHistory": []}
            atomic_json(self.directory / "receiver.json", self.binding)
        else:
            require(self.binding["workspaceId"] == schema["workspaceId"],
                    "COOPS_PY_WORKSPACE", "This receiver is pinned to another original workspace. Keep its saved intents separate.")
            if self.binding["origin"] != session.origin:
                require(adopt_origin and isinstance(note, str) and note.strip(),
                        "COOPS_PY_ORIGIN", "The original workspace is now at another loopback origin. Explicitly adopt that origin with a note.")
                prior = self.binding["origin"]
                self.binding["origin"] = session.origin
                self.binding["originHistory"].append({"from": prior, "to": session.origin, "at": now(), "note": note})
                atomic_json(self.directory / "receiver.json", self.binding)
        self.session = session
        return schema

    def online(self):
        require(self.session is not None, "COOPS_PY_SESSION", "Select the current original console startup file for this online operation.")
        return self.session

    def view(self):
        result = self.online().json("/api/view")
        require(result.get("schema") == "stellar-forge.coops-workspace-view.v1" and
                result.get("workspaceId") == self.binding["workspaceId"] and type(result.get("revision")) is int,
                "COOPS_PY_WORKSPACE", "The original state response changed its workspace identity.")
        return result

    def local_key(self, key):
        require(isinstance(key, str) and 1 <= len(key) <= 300 and not any(ord(c) < 32 for c in key),
                "COOPS_PY_INTENT", "Give the receiving operation one stable named intent.")
        return hashlib.sha256(key.encode("utf-8")).hexdigest()

    def operation_path(self, key):
        return self.directory / "operations" / (self.local_key(key) + ".json")

    def saved_action(self, key):
        path = self.operation_path(key)
        return read_json(path) if path.exists() else None

    def _complete(self, record, result, native):
        record["state"] = "COMPLETE"
        record["result"] = result
        record["localResultSha256"] = digest(stable(result).encode("utf-8"))
        record["completedAt"] = native.get("completedAt") or now()
        record["native"] = {k: native[k] for k in
                            ("operationId", "action", "requestSha256", "resultSha256", "completedAt", "state", "reused")
                            if k in native}
        request = decode_json(record["requestBody"])
        if request["action"] == "study.return.chunk":
            data = base64.b64decode(request["payload"]["base64"], validate=True)
            record["requestMetadata"] = {
                **{k: request[k] for k in ("action", "operationId", "expectedRevision")},
                "payload": {"uploadId": request["payload"]["uploadId"], "offset": request["payload"]["offset"],
                            "bytes": len(data), "sha256": digest(data)}}
            del record["requestBody"]
        record.pop("lastError", None)
        atomic_json(self.operation_path(record["key"]), record)
        return result

    def action(self, key, action, payload):
        """Persist once, then reconcile/dispatch that exact original native envelope."""
        allowed = {
            "study.dataset.prepare": {"releaseId", "name"}, "dataset.query": {"datasetId", "query"},
            "study.return.start": {"releaseId", "format", "filename", "bytes", "note"},
            "study.return.chunk": {"uploadId", "offset", "base64"},
            "study.return.finish": {"uploadId"},
            "study.receive": {"returnId", "comparisonSha256", "expectedDecisionId", "status", "actor", "note"}}
        require(action in allowed and isinstance(payload, dict) and set(payload) <= allowed[action],
                "COOPS_PY_ACTION", "Choose one original coastal receiving or query action.")
        require(all(isinstance(v, str) or type(v) is int for v in payload.values()),
                "COOPS_PY_ACTION", "Keep the original receiving fields as strings or exact integers.")
        call_sha = digest(stable({"action": action, "payload": payload}).encode("utf-8"))
        path = self.operation_path(key)
        record = self.saved_action(key)
        if record:
            require(record.get("key") == key and record.get("workspaceId") == self.binding["workspaceId"] and
                    record.get("callSha256") == call_sha,
                    "COOPS_PY_INTENT_CHANGED", "This intent already names another original request. Keep it and explicitly choose a new intent for changed work.")
            if record["state"] == "COMPLETE":
                require(record.get("localResultSha256") == digest(stable(record["result"]).encode("utf-8")),
                        "COOPS_PY_JOURNAL", "The retained original action result changed.")
                return record["result"]
        else:
            view = self.view()
            operation_id = "py-" + digest((self.binding["receiverId"] + "\n" + key).encode("utf-8"))[:48]
            request = {"action": action, "payload": payload, "expectedRevision": view["revision"], "operationId": operation_id}
            record = {"schema": "stellar-forge.coops-python-operation.v1", "key": key,
                      "workspaceId": self.binding["workspaceId"], "operationId": operation_id,
                      "action": action, "callSha256": call_sha, "createdAt": now(), "state": "PREPARED",
                      "requestBody": json_bytes(request).decode("utf-8"),
                      "requestBodySha256": digest(json_bytes(request)), "attempts": 0}
            atomic_json(path, record)
        operation_id = record["operationId"]
        body = record.get("requestBody", "").encode("utf-8")
        require(record.get("requestBodySha256") == digest(body), "COOPS_PY_JOURNAL", "The retained original request bytes changed.")
        request = decode_json(body)
        require(request.get("action") == action and request.get("operationId") == operation_id and
                type(request.get("expectedRevision")) is int and
                digest(stable({"action": action, "payload": request.get("payload")}).encode("utf-8")) == call_sha,
                "COOPS_PY_JOURNAL", "The original issued request changed its action, payload or identity.")

        def observed():
            item = self.online().json("/api/operation?" + urlencode({"operationId": operation_id}))
            require(item.get("operationId") == operation_id,
                    "COOPS_PY_OPERATION", "The console returned another operation identity.")
            if item.get("state") != "NOT_RESERVED":
                require(item.get("action") == action and item.get("requestSha256") == call_sha,
                        "COOPS_PY_OPERATION", "The original reserved action differs from this retained request.")
            record["lastNativeState"] = item.get("state")
            return item

        try:
            item = observed()
            if item.get("state") == "COMPLETE":
                return self._complete(record, item["result"], item)
            if item.get("state") == "FAILED" and not item.get("error", {}).get("retryable"):
                error = item.get("error", {})
                raise ReceivingError(error.get("code", "COOPS_PY_NATIVE_FAILED"),
                                     error.get("message", "The original native operation requires a new reviewed intent."),
                                     status=error.get("status"), operation_id=operation_id)
            record["state"] = "DISPATCHING"
            record["attempts"] += 1
            record["lastDispatchedAt"] = now()
            atomic_json(path, record)
            response = self.online().json("/api/action", body=record["requestBody"].encode("utf-8"))
            require(response.get("operationId") == operation_id and
                    response.get("view", {}).get("workspaceId") == self.binding["workspaceId"],
                    "COOPS_PY_OPERATION", "The action response changed its original operation or workspace.")
            if "result" in response:
                return self._complete(record, response["result"], {
                    "operationId": operation_id, "action": action, "requestSha256": call_sha,
                    "state": "COMPLETE", "reused": response.get("reused", False)})
            require(response.get("state") == "RUNNING", "COOPS_PY_OPERATION", "The action returned no completion or running state.")
            deadline = time.monotonic() + self.wait_seconds
            while time.monotonic() < deadline:
                time.sleep(min(1, max(0, deadline - time.monotonic())))
                item = observed()
                if item.get("state") == "COMPLETE":
                    return self._complete(record, item["result"], item)
                if item.get("state") == "FAILED":
                    error = item.get("error", {})
                    raise ReceivingError(error.get("code", "COOPS_PY_NATIVE_FAILED"),
                                         error.get("message", "The original operation remains retained for explicit resume."),
                                         status=error.get("status"), operation_id=operation_id)
            raise ReceivingError("COOPS_PY_PENDING", "The original operation is still running. Resume this same intent after its retained state advances.",
                                 operation_id=operation_id)
        except ReceivingError as error:
            record["state"] = "INCOMPLETE"
            record["lastError"] = {**error.as_dict(), "at": now()}
            atomic_json(path, record)
            if error.operation_id is None:
                error.operation_id = operation_id
            raise

    def operation_summary(self):
        result = []
        for path in sorted((self.directory / "operations").glob("*.json")):
            item = read_json(path)
            result.append({k: item[k] for k in ("key", "action", "operationId", "state", "lastNativeState", "lastError")
                           if k in item})
        return result
