"""Durable original-provider operations composed with GovHubWorkspace."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import fcntl
import importlib
import json
import os
import tempfile
import threading


from target_expectations import TargetExpectationsMixin


class OperationsMixin(TargetExpectationsMixin):
    @contextmanager
    def _native_storage_lease(self, exclusive=False):
        """Keep a native command and its journal in the same backup generation."""
        descriptor = os.open(self.root / "native-snapshot.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        held = False
        try:
            try:
                fcntl.flock(descriptor, (fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH) | fcntl.LOCK_NB)
                held = True
            except BlockingIOError:
                pass
            yield held
        finally:
            if held:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)

    def _workspace_relocations(self):
        """Resolve old private paths at use time; immutable journals stay original."""
        from govhub import GovHubError
        metadata = self.root / "backup.json"
        if not metadata.exists():
            return []
        if metadata.is_symlink() or not metadata.is_file():
            raise GovHubError("BACKUP_METADATA", "The retained backup metadata must be an original regular file.", 409)
        try:
            native = json.loads(metadata.read_bytes()).get("native_storage", {})
            roots = native.get("original_roots", [])
            if not isinstance(roots, list) or any(not isinstance(root, str) or not Path(root).is_absolute() or ".." in Path(root).parts for root in roots):
                raise ValueError("Invalid original workspace roots")
        except (ValueError, TypeError, AttributeError) as exc:
            raise GovHubError("BACKUP_METADATA", "The retained native backup relocation metadata is invalid.", 409) from exc
        return [{"from": root.rstrip("/"), "to": str(self.root)} for root in roots if root.rstrip("/") != str(self.root)]

    def _native(self):
        try:
            return importlib.import_module("native_adapter")
        except ImportError as exc:
            from govhub import GovHubError
            raise GovHubError("NATIVE_ADAPTER", "Install the original native_adapter.py with this workspace.", 503) from exc

    def _config(self, db, environment_id):
        from govhub import GovHubError
        row = db.execute("SELECT revision,data FROM govhub_config WHERE environment_id=?", (environment_id,)).fetchone()
        if not row:
            raise GovHubError("NATIVE_PROFILE", "Configure the actual operating environment's native profile first.")
        return {"revision": row[0], "config": json.loads(row[1])}

    def _operations_configure(self, payload, actor):
        from govhub import GovHubError, digest, packed, text
        self._authorize(actor, "admin")
        config = payload.get("config")
        providers = self._native().configuration_schema()["providers"]
        if not isinstance(config, dict) or config.get("source_kind") not in {item["value"] for item in providers}:
            raise GovHubError("NATIVE_CONFIG", "Choose a documented native provider profile.")
        definition = next(item for item in self._native().configuration_schema()["providers"] if item["value"] == config["source_kind"])
        fields = {item["name"]: item for item in definition["fields"]}
        allowed = {"source_kind", "api_base", "target_fingerprint", *fields}
        if set(config) - allowed:
            raise GovHubError("NATIVE_CONFIG", "The native profile contains unsupported fields: " + ", ".join(sorted(set(config) - allowed)))
        config = dict(config)
        for key, value in list(config.items()):
            field = fields.get(key, {})
            if field.get("type") == "boolean":
                if not isinstance(value, bool):
                    raise GovHubError("NATIVE_BOOLEAN", "Use a boolean value for " + field.get("label", key) + ".")
            elif field.get("type") == "integer":
                if value in (None, "") and not field.get("required"):
                    config.pop(key)
                    continue
                if isinstance(value, bool) or not isinstance(value, int) or value < field.get("minimum", 1) or value > field.get("maximum", 2**53 - 1):
                    raise GovHubError("NATIVE_INTEGER", "Use a whole value within the configured range for " + field.get("label", key) + ".")
            else:
                config[key] = text(value, field.get("max_length", 4000), key == "source_kind" or field.get("required", False))
        for key, field in fields.items():
            if field.get("required") and not config.get(key):
                raise GovHubError("NATIVE_REQUIRED", "Supply the native " + field.get("label", key) + ".", fields={key: "Required native profile field."})
        if config.get("access_token_env"):
            import re
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", config["access_token_env"]):
                raise GovHubError("TOKEN_REFERENCE", "Supply only the name of the existing token environment variable.")
        if config.get("api_base") and config["api_base"].rstrip("/") != "https://cloud.acquia.com/api":
            raise GovHubError("API_ORIGIN", "Use Acquia's documented native API origin.")
        with self.connect(write=True) as db:
            target = self._record_db(db, "environments", payload.get("environment_id"))
            self._expected(target, payload)
            if target["archived"]:
                raise GovHubError("TARGET_ARCHIVED", "Choose an active operating environment.")
            if not target["data"]["provider_resource_id"] or target["data"]["provider_resource_id"] != config["environment_id"]:
                raise GovHubError("TARGET_IDENTITY", "The profile's native environment ID must match the retained target environment record exactly.", 409)
            revision = digest(packed(config))
            previous = db.execute("SELECT revision FROM govhub_config WHERE environment_id=?", (target["id"],)).fetchone()
            if not previous or previous[0] != revision:
                self._object(db, "native_profile", {"environment_id": target["id"], "environment_revision": target["revision"], "config": config, "config_sha256": revision}, parent=target["id"], actor=actor["name"])
                db.execute("INSERT INTO govhub_config VALUES(?,?,?) ON CONFLICT(environment_id) DO UPDATE SET revision=excluded.revision,data=excluded.data", (target["id"], revision, packed(config)))
                data = dict(target["data"], native_profile=revision)
                self._write(db, "environments", target["id"], data, actor, target["revision"], "Native profile configured for the exact target")
                self._changed(db, actor, "Native environment profile configured", "environments", target["id"], {"config_sha256": revision})
            return {"environment": self._record_db(db, "environments", target["id"]), "profile": {"revision": revision, "config": config}}

    def _operations_capabilities(self, payload):
        native = self._native()
        if not payload.get("environment_id"):
            return {"configuration_schema": native.configuration_schema(), "configured": False}
        with self.connect() as db:
            environment = self._record_db(db, "environments", payload["environment_id"])
            configured = db.execute("SELECT 1 FROM govhub_config WHERE environment_id=?", (environment["id"],)).fetchone()
            if not configured:
                return {"environment": environment, "current_config": {}, "configuration_schema": native.configuration_schema(), "configured": False}
            profile = self._config(db, environment["id"])
        result = native.discover_capabilities(profile["config"], runtime_bindings=payload.get("runtime_bindings")) if "runtime_bindings" in payload else native.discover_capabilities(profile["config"])
        result["operation_actions"] = {kind: native.operation_actions(profile["config"], kind)
                                       for kind in ("CAPTURE", "PREVIEW", "BACKUP_CREATE", "BACKUP_DOWNLOAD", "REHEARSAL", "CUTOVER", "ROLLBACK")}
        return {"environment": environment, "profile": profile, "current_config": profile["config"], "configured": True, "capabilities": result, "configuration_schema": native.configuration_schema()}

    def _operation(self, db, operation_id):
        from govhub import GovHubError
        row = db.execute("SELECT data FROM govhub_operations WHERE id=?", (operation_id,)).fetchone()
        if not row:
            raise GovHubError("OPERATION_NOT_FOUND", "The selected native operation does not exist.", 404)
        return json.loads(row[0])

    def _write_operation(self, db, operation, actor, event, details=None):
        from govhub import ident, now, packed
        value = dict(operation, revision=ident("operation-version-"), updated_at=now())
        db.execute("INSERT INTO govhub_operations VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,state=excluded.state,data=excluded.data", (value["id"], value["revision"], value["state"], packed(value)))
        self._object(db, "operation_event", {"operation_id": value["id"], "operation_revision": value["revision"], "event": event, "state": value["state"], "details": details or {}}, parent=value["id"], actor=actor["name"] if isinstance(actor, dict) else actor)
        self._changed(db, actor, event, "operation", value["id"], details)
        return value

    @staticmethod
    def _operation_summary(value):
        keys = ("id", "revision", "plan_id", "plan_revision", "content_family_id", "content_plan_id", "type", "native_action", "state", "environment_id", "source_snapshot_id", "agency_ids", "created_at", "updated_at", "author", "progress", "error")
        return {key: value.get(key) for key in keys}

    def _operations_create(self, payload, actor, capture=False):
        from govhub import GovHubError, ident, now, text
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            target = self._record_db(db, "environments", payload.get("environment_id"))
            if target["archived"]:
                raise GovHubError("TARGET_ARCHIVED", "Choose an active native operating environment.")
            profile = self._config(db, target["id"])
            if payload.get("environment_revision") and payload["environment_revision"] != target["revision"]:
                raise GovHubError("TARGET_CHANGED", "The operating environment changed. Reopen its current native configuration before queuing this action.", 409)
            if payload.get("config_sha256") and payload["config_sha256"] != profile["revision"]:
                raise GovHubError("PROFILE_CHANGED", "The native profile changed. Reopen its current selections before queuing this action.", 409)
            if target["data"]["provider_resource_id"] != profile["config"]["environment_id"] or target["data"]["native_profile"] != profile["revision"]:
                raise GovHubError("TARGET_CHANGED", "The actual environment or native profile changed. Reconfigure the exact target before execution.", 409)
            if not target["data"]["authorization_reference"]:
                raise GovHubError("TARGET_AUTHORITY", "Retain the target operating authorization.")
            plan = source = review = audit = None
            operation_type = "CAPTURE" if capture else payload.get("type")
            available = self._native().operation_actions(profile["config"], operation_type)
            if not available:
                raise GovHubError("OPERATION_TYPE", "Choose an operation purpose supported by this native provider.")
            native_action = payload.get("native_action") or available[0]["value"]
            if native_action not in {item["value"] for item in available}:
                raise GovHubError("NATIVE_ACTION", "Choose the documented action for this provider and operation purpose.")
            if operation_type not in {"CAPTURE", "PREVIEW", "BACKUP_CREATE", "BACKUP_DOWNLOAD"}:
                plan = self._plan(db, payload.get("plan_id"))
                self._expected(plan, payload)
                if operation_type == "REHEARSAL" and target["data"]["purpose"] != "Rehearsal":
                    raise GovHubError("REHEARSAL_TARGET", "Choose the explicitly designated rehearsal environment for rehearsal work.")
                audit = self._current_audit(db, plan)
                review = self._current_review(db, plan, audit)
                if operation_type == "CUTOVER" and (not audit or audit["status"] != "PASS" or not review or review["decision"] != "APPROVE"):
                    raise GovHubError("CURRENT_REVIEW", "Complete the original comparison and reviewer approval for this exact cutover revision.", 409)
                source = self._get(db, "snapshot", plan["candidate_id"] if operation_type == "CUTOVER" else plan["baseline_id"])
                self._verify_snapshot(db, source)
            expectation_pin = self._target_expectation_pin(db, payload, plan, source, target, profile, operation_type) if plan else {}
            if not plan and payload.get("target_expectation_id"):
                raise GovHubError("EXPECTATION_PURPOSE", "Target expectations belong to restore operations with a selected cohort.")
            timestamp = now()
            value = {"id": ident("operation-"), "type": operation_type, "state": "QUEUED", "plan_id": plan["id"] if plan else "", "plan_revision": plan["revision"] if plan else "", "plan": plan, "audit_id": audit["id"] if audit else None, "review_id": review["id"] if review else None, "environment_id": target["id"], "environment": target, "profile": profile, "source_snapshot_id": source["id"] if source else "", "source_snapshot": source, "source_snapshot_sha256": source["sha256"] if source else "", "authorization_reference": text(payload.get("authorization_reference", target["data"]["authorization_reference"]), 8000, True), "created_at": timestamp, "updated_at": timestamp, "author": actor["name"], "progress": {"completed": 0, "total": 1, "stage": "QUEUED", "detail": "Queued for the selected native environment"}, "error": None, "cancel_requested": False, "native_attempted": False, "checkpoint": None, "resume_checkpoint": None, "native_capture_file_id": None, "native_result": None, "result_snapshot_id": None, "actual_started_at": None, "actual_finished_at": None}
            value.update(expectation_pin)
            value["native_action"] = native_action
            value["provider_environment_id"] = profile["config"]["environment_id"]
            selected = payload.get("agency_ids", plan["agency_ids"] if plan else [])
            if not isinstance(selected, list) or (plan and not selected) or any(not isinstance(item, str) for item in selected) or len(set(selected)) != len(selected) or (plan and not set(selected) <= set(plan["agency_ids"])):
                raise GovHubError("OPERATION_COHORT", "Choose a unique, nonempty subset of this plan's original comparison IDs for the exact native environment.")
            value["agency_ids"] = sorted(selected)
            value["target_fingerprint"] = text(payload.get("target_fingerprint", profile["config"].get("target_fingerprint", "")), 4000)
            if payload.get("backup_sha256"):
                import re
                if not isinstance(payload["backup_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", payload["backup_sha256"]):
                    raise GovHubError("BACKUP_IDENTITY", "Choose an exact retained SHA-256 backup identity.")
                value["backup_sha256"] = payload["backup_sha256"]
            operation = self._write_operation(db, value, actor, "Native source capture queued" if capture else "Native cohort operation queued", {"source_snapshot_id": value["source_snapshot_id"], "environment_revision": target["revision"], "config_sha256": profile["revision"]})
            result = {"operation": operation}
            self._remember(db, key, fingerprint, result, actor)
        self._worker_wake.set()
        return result

    def _operations_get(self, payload):
        with self.connect(snapshot=True) as db:
            value = self._operation(db, payload.get("operation_id"))
            return {"operation": value, "events": self._objects(db, "operation_event", value["id"]), "observations": self._objects(db, "operation_observation", value["id"]), "files": self._output_list(db, "operation", value["id"])}

    def _operations_cancel(self, payload, actor):
        from govhub import GovHubError, text
        reason = text(payload.get("reason", ""), 8000, True)
        with self.connect(write=True) as db:
            bound = dict(payload, operation_action="operations.cancel")
            key, fingerprint, prior = self._request(db, bound, actor, required=False)
            if prior is not None:
                return prior
            value = self._operation(db, payload.get("operation_id"))
            self._expected(value, payload)
            if value["state"] in {"COMPLETE", "CANCELLED"}:
                result = {"operation": value}
                self._remember(db, key, fingerprint, result, actor)
                return result
            value["cancel_requested"] = True
            if value["state"] == "RUNNING":
                value["progress"] = dict(value["progress"], detail="Cancellation requested; preserving the current native command or provider result")
            elif value["type"] in {"STATIC_PUBLISH", "STATIC_ROLLBACK"} and self._static_unresolved(value):
                value["state"] = "QUEUED"
                value["progress"] = dict(value["progress"], stage="RECONCILE_NATIVE", detail="Cancellation retained; inspect the original selection before resolving its outcome")
            elif value.get("native_attempted") and not value.get("native_result"):
                value["state"] = "WAITING_NATIVE"
                value["progress"] = dict(value["progress"], stage="RECONCILE_NATIVE", detail="Cancellation retained; reconcile the already attempted native action")
            else:
                value["state"] = "CANCELLED"
            value = self._write_operation(db, value, actor, "Operation cancellation requested", {"reason": reason})
            result = {"operation": value}
            self._remember(db, key, fingerprint, result, actor)
        self._worker_wake.set()
        return result

    def _operations_resume(self, payload, actor):
        from govhub import GovHubError, text
        reason = text(payload.get("reason", ""), 8000, True)
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            value = self._operation(db, payload.get("operation_id"))
            self._expected(value, payload)
            if value["state"] in {"QUEUED", "RUNNING", "COMPLETE"}:
                raise GovHubError("OPERATION_STATE", "This operation is already active or complete.", 409)
            if (value.get("native_result") or {}).get("status") == "COMPLETE":
                raise GovHubError("OBSERVATION_REQUIRED", "The native action completed. Attach its actual observed result inventory to complete reconciliation.", 409)
            if value["type"] != "CAPTURE" and value.get("native_attempted") and not value.get("resume_checkpoint") and not (value.get("checkpoint") or {}).get("safe_to_retry"):
                raise GovHubError("NATIVE_RECONCILIATION", "Reconcile the original native action with its retained execution capture before starting another restore.", 409)
            if payload.get("native_task_id") is not None:
                native_task_id = payload["native_task_id"]
                if (value.get("native_action") != "lagoon-switch-active-standby"
                        or isinstance(native_task_id, bool) or not isinstance(native_task_id, int)
                        or native_task_id < 1):
                    raise GovHubError("NATIVE_TASK", "Supply the actual positive Lagoon task ID for this original switch.")
                existing = self._native().lagoon_task_id(value.get("resume_checkpoint") or value.get("checkpoint"))
                if existing and existing != native_task_id:
                    raise GovHubError("NATIVE_TASK_CHANGED", "A different task cannot replace the retained original task.", 409)
                value["native_task_id"] = native_task_id
            if (payload.get("native_workflow_id") or payload.get("native_backup_files")
                    or "runtime_bindings" in payload or payload.get("skpr_native_request_id")
                    or "skpr_snapshot_choices" in payload or payload.get("tugboat_job_id")
                    or payload.get("upsun_activity_id") or payload.get("upsun_activity_ids_json")
                    or payload.get("castor_command_receipt")):
                try:
                    value.update(self._native().native_resume_fields(value, payload, reason))
                except ValueError as exc:
                    code = "CASTOR_CONTINUATION" if str(value.get("native_action", "")).startswith("castor-") else "UPSUN_CONTINUATION" if str(value.get("native_action", "")).startswith("upsun-") else "TUGBOAT_CONTINUATION" if str(value.get("native_action", "")).startswith("tugboat-") else "SKPR_CONTINUATION" if str(value.get("native_action", "")).startswith("skpr-") else "PANTHEON_CONTINUATION"
                    raise GovHubError(code, str(exc), 409) from exc
            self._target_expectation_validate_pin(db, value, authority=True)
            value.update(state="QUEUED", cancel_requested=False, error=None)
            value["progress"] = dict(value["progress"], stage="QUEUED", detail="Continuing the retained native checkpoint")
            value = self._write_operation(db, value, actor, "Retained native operation resumed", {"reason": reason, "resume_checkpoint": value.get("resume_checkpoint"), "native_task_id": value.get("native_task_id"), "native_workflow_id": value.get("native_workflow_id"), "native_workflow_step": value.get("native_workflow_step"), "native_backup_selections": value.get("native_backup_selections"), "runtime_bindings": value.get("runtime_bindings"), "skpr_native_associations": value.get("skpr_native_associations"), "skpr_snapshot_selections": value.get("skpr_snapshot_selections"), "tugboat_job_association": value.get("tugboat_job_association"), "upsun_activity_association": value.get("upsun_activity_association"), "castor_command_receipt": value.get("castor_command_receipt")})
            result = {"operation": value}
            self._remember(db, key, fingerprint, result, actor)
        self._worker_wake.set()
        return result

    def _operation_sources(self, value, output_dir):
        from govhub import GovHubError
        snapshot = value.get("source_snapshot")
        result = {"snapshot_id": value["source_snapshot_id"], "snapshot_sha256": value["source_snapshot_sha256"], "rows": [], "bindings": [], "output_dir": str(output_dir), "checkpoint": value.get("resume_checkpoint") or value.get("checkpoint"), "workspace_relocations": self._workspace_relocations()}
        if not snapshot:
            return result
        cohort = set(value.get("agency_ids", value["plan"]["agency_ids"]))
        with self.connect(snapshot=True) as db:
            self._target_expectation_validate_pin(db, value, authority=True)
            current = self._get(db, "snapshot", snapshot["id"])
            if current["sha256"] != snapshot["sha256"]:
                raise GovHubError("OPERATION_SOURCE", "The selected source snapshot identity changed.", 409)
            paths = self._verify_snapshot(db, current, deep=True, cohort=cohort)
        result["rows"] = [row for row in snapshot["rows"] if row["agency_id"] in cohort]
        for binding in snapshot["bindings"]:
            if binding["agency_id"] not in cohort:
                continue
            supplied = {"agency_id": binding["agency_id"], "files": []}
            for role in ("export", "backup"):
                if binding.get(role):
                    item = binding[role]
                    supplied[role] = {**item.get("native", {}), "path": str(paths[item["sha256"]]), "sha256": item["sha256"], "size": item["bytes"], "file_id": item["id"], "filename": item["filename"]}
            for extra in binding.get("files", []):
                item = extra["file"]
                supplied["files"].append({**extra.get("native", {}), "role": extra["role"], "path": str(paths[item["sha256"]]), "sha256": item["sha256"], "size": item["bytes"], "file_id": item["id"], "filename": item["filename"]})
            result["bindings"].append(supplied)
        return result

    def _cancelled(self, operation_id):
        if self._worker_stop.is_set():
            return True
        with self.connect() as db:
            value = self._operation(db, operation_id)
            return value.get("cancel_requested", False) or value.get("worker_owner") != self._worker_owner

    def _native_checkpoint(self, operation_id, data):
        from govhub import GovHubError, packed
        if not isinstance(data, dict) or len(packed(data).encode("utf-8")) > 1024 * 1024:
            raise GovHubError("NATIVE_CHECKPOINT", "The native adapter returned an invalid checkpoint.", 503)
        with self.connect(write=True) as db:
            value = self._operation(db, operation_id)
            if value.get("worker_owner") != self._worker_owner:
                raise GovHubError("WORKER_OWNERSHIP", "The operation's native worker ownership changed.", 409)
            value["checkpoint"] = data
            if data.get("resume_checkpoint"):
                value["resume_checkpoint"] = data["resume_checkpoint"]
            if data.get("mutation_started"):
                value["native_attempted"] = True
            if data.get("safe_to_retry"):
                value["native_attempted"] = False
            value["progress"] = dict(value["progress"], stage=str(data.get("stage", "NATIVE")), detail=str(data.get("detail", data.get("message", "Native checkpoint retained")))[:8000])
            self._write_operation(db, value, value["author"], "Native checkpoint retained", data)

    @staticmethod
    def _static_unresolved(value):
        if value.get("type") not in {"STATIC_PUBLISH", "STATIC_ROLLBACK"}:
            return False
        from static_releases.native import is_unresolved_selection
        return is_unresolved_selection(value)

    def _claim_next(self):
        from govhub import now
        with self.connect(write=True) as db:
            rows = db.execute("SELECT data FROM govhub_operations WHERE state IN ('QUEUED','WAITING_NATIVE') ORDER BY rowid").fetchall()
            for row in rows:
                value = json.loads(row[0])
                if value["state"] == "WAITING_NATIVE":
                    resume = value.get("resume_checkpoint") or {}
                    if value.get("cancel_requested") or not self._native().can_poll(resume) or (value.get("next_poll_at") and value["next_poll_at"] > now()):
                        continue
                if value.get("cancel_requested") and not self._static_unresolved(value):
                    value["state"] = "CANCELLED"
                    self._write_operation(db, value, value["author"], "Queued operation cancelled")
                    continue
                value.update(state="RUNNING", worker_owner=self._worker_owner)
                value["progress"] = dict(value["progress"], stage="VERIFY_SOURCE", detail="Rehashing the exact retained native inputs")
                return self._write_operation(db, value, value["author"], "Native worker acquired operation")
        return None

    def _capture_result_files(self, db, value, native_result, output_dir):
        from govhub import GovHubError, packed
        artifacts = native_result.get("artifacts", [])
        if not isinstance(artifacts, list):
            raise GovHubError("NATIVE_ARTIFACTS", "The native result did not supply its artifact array.", 503)
        retained = []
        previous_outputs = self._output_list(db, "operation", value["id"])
        used = {item["name"] for item in previous_outputs}
        originals = {(item["name"], item["sha256"]): item for item in previous_outputs}
        for previous_artifact in value.get("retained_artifacts", []):
            original_name = previous_artifact.get("native", {}).get("original_filename")
            if original_name:
                file = previous_artifact["file"]
                originals[(original_name, file["sha256"])] = {
                    "file_id": file["id"], "sha256": file["sha256"], "size": file["bytes"]}
        for index, artifact in enumerate(artifacts, 1):
            if not isinstance(artifact, dict) or not artifact.get("path"):
                raise GovHubError("NATIVE_ARTIFACTS", "Each native artifact must identify its actual regular output file.", 503)
            raw = Path(artifact["path"])
            if not raw.is_absolute():
                raw = output_dir / raw
            if raw.is_symlink() or not raw.is_file() or not raw.resolve().is_relative_to(output_dir.resolve()):
                raise GovHubError("NATIVE_ARTIFACT_PATH", "A native output must remain inside this operation's private output directory.", 409)
            name = raw.name
            original = originals.get((name, artifact.get("sha256")))
            if original:
                from govhub import file_digest
                actual_sha, actual_size = file_digest(raw)
                if (actual_sha, actual_size) != (original["sha256"], original["size"]):
                    raise GovHubError("NATIVE_ARTIFACT_CHANGED", "The replayed original artifact no longer matches its retained source.", 409)
                item = self._file_row(db, original["file_id"])
                self._verify_file(item)
            else:
                if name in used:
                    name = f"{len(used) + 1:04d}-" + name
                used.add(name)
                item = self._register(db, raw, name, value["author"], "Extract", "Native " + str(artifact.get("role", "artifact")) + " from " + value["id"], owner_kind="operation", owner_id=value["id"], expected_sha=artifact.get("sha256"))
                originals[(raw.name, item["sha256"])] = {"file_id": item["id"], "sha256": item["sha256"], "size": item["bytes"]}
            retained.append({"role": artifact.get("role", "artifact"), "file": item,
                             "native": {**{key: val for key, val in artifact.items() if key != "path"},
                                        "original_filename": raw.name}})
        envelope = {"format": "govhub-native-operation/1", "operation_id": value["id"], "plan_revision": value["plan_revision"], "source_snapshot_id": value["source_snapshot_id"], "source_snapshot_sha256": value["source_snapshot_sha256"], "environment_id": value["environment_id"], "provider_environment_id": value["profile"]["config"]["environment_id"], "config_sha256": value["profile"]["revision"], "actual_started_at": value["actual_started_at"], "actual_finished_at": value["actual_finished_at"], "result": native_result, "retained_artifacts": retained}
        envelope.update(self._target_expectation_capture_fields(value))
        name = "native-result.json" if "native-result.json" not in used else f"native-result-{len(used) + 1:04d}.json"
        path = output_dir / name
        path.write_text(packed(envelope) + "\n", encoding="utf-8")
        os.chmod(path, 0o600)
        capture = self._register(db, path, name, value["author"], "Evidence", "Original native operation result", owner_kind="operation", owner_id=value["id"])
        return capture, retained

    def _run_operation(self, value):
        from govhub import GovHubError, now
        output_dir = self.root / "native-operations" / value["id"]
        output_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
        if output_dir.is_symlink() or not output_dir.resolve().is_relative_to(self.root):
            raise GovHubError("NATIVE_DIRECTORY", "The operation directory must remain inside its private workspace.", 409)
        native_result = None
        try:
            if value["type"] in {"STATIC_STAGE", "STATIC_PUBLISH", "STATIC_ROLLBACK"}:
                from static_releases.native import run_operation
                return run_operation(self, value)
            if value["type"] == "VISITOR_CAPTURE":
                from visitor_journeys.workspace import run_operation
                return run_operation(self, value)
            source_paths = self._operation_sources(value, output_dir)
            if self._cancelled(value["id"]):
                native_result = {"status": "CANCELLED", "artifacts": [], "safe_to_retry": True, "observations": {"stage": "before_native"}}
            else:
                native = self._native()
                with self.connect(write=True) as db:
                    current = self._operation(db, value["id"])
                    current["actual_started_at"] = current.get("actual_started_at") or now()
                    current["native_attempted"] = current["type"] not in {"CAPTURE", "CONTENT_STATUS", "CONTENT_RECEIVE", "PACKAGE_EXPORT", "PACKAGE_PREVIEW", "PACKAGE_STATUS"}
                    current["progress"] = dict(current["progress"], stage="NATIVE", detail="Executing the exact configured native action")
                    value = self._write_operation(db, current, current["author"], "Native action started", {"source_kind": current["profile"]["config"]["source_kind"], "config_sha256": current["profile"]["revision"]})
                checkpoint = lambda data: self._native_checkpoint(value["id"], data)
                cancelled = lambda: self._cancelled(value["id"])
                if value["type"] == "CAPTURE":
                    native_result = native.capture(value["profile"]["config"], {"operation_id": value["id"], "environment_id": value["environment_id"], "output_dir": str(output_dir), "checkpoint": source_paths["checkpoint"], "target_fingerprint": value["target_fingerprint"], "workspace_relocations": source_paths["workspace_relocations"], "runtime_bindings": value.get("runtime_bindings"), "castor_command_receipt": value.get("castor_command_receipt")}, checkpoint=checkpoint, cancelled=cancelled)
                else:
                    operation = dict(value, resume_checkpoint=source_paths["checkpoint"])
                    native_result = native.execute(operation, value["profile"]["config"], source_paths, checkpoint=checkpoint, cancelled=cancelled)
            if not isinstance(native_result, dict) or native_result.get("status") not in {"COMPLETE", "FAILED", "WAITING_NATIVE", "CANCELLED"}:
                raise GovHubError("NATIVE_RESULT", "The native adapter did not return a recognized durable result.", 503)
            with self.connect(write=True) as db:
                current = self._operation(db, value["id"])
                current["actual_finished_at"] = now()
                current["native_result"] = native_result
                capture, artifacts = self._capture_result_files(db, current, native_result, output_dir)
                current["native_capture_file_id"] = capture["id"]
                retained = {(item["file"]["id"], item["role"]): item
                            for item in current.get("retained_artifacts", [])}
                retained.update({(item["file"]["id"], item["role"]): item for item in artifacts})
                current["retained_artifacts"] = list(retained.values())
                if native_result.get("checkpoint"):
                    current["checkpoint"] = native_result["checkpoint"]
                if native_result.get("resume_checkpoint"):
                    current["resume_checkpoint"] = native_result["resume_checkpoint"]
                if native_result.get("safe_to_retry"):
                    current["native_attempted"] = False
                status = native_result["status"]
                needs_observation = current["type"] not in {"CAPTURE", "PREVIEW", "BACKUP_CREATE", "BACKUP_DOWNLOAD"}
                current["state"] = "WAITING_NATIVE" if status == "COMPLETE" and needs_observation else status
                resume = current.get("resume_checkpoint") or {}
                if status == "WAITING_NATIVE" and self._native().can_poll(resume) and not current.get("cancel_requested"):
                    delay = native_result.get("poll_after_seconds", 5)
                    delay = max(5, min(delay, 3600)) if type(delay) is int else 5
                    current["next_poll_at"] = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat(timespec="microseconds").replace("+00:00", "Z")
                else:
                    current["next_poll_at"] = None
                current["progress"] = {"completed": 1 if status == "COMPLETE" else 0, "total": 1,
                    "stage": "OBSERVE_RESULT" if status == "COMPLETE" and needs_observation else status,
                    "detail": "Native action complete; attach its actual observed result inventory" if status == "COMPLETE" and needs_observation else "Native source artifacts retained" if status == "COMPLETE" else str(native_result.get("message") or native_result.get("error") or "Native operation state retained")[:8000]}
                self._content_native_completion(current, native_result)
                current["error"] = native_result.get("error") or (native_result.get("message") if status in {"FAILED", "WAITING_NATIVE"} else None)
                self._write_operation(db, current, current["author"], "Native action result retained", {"native_status": status, "capture_file_id": capture["id"], "artifacts": len(artifacts)})
        except Exception as exc:
            with self.connect(write=True) as db:
                current = self._operation(db, value["id"])
                current["state"] = ("WAITING_NATIVE" if current.get("native_attempted") and not (current.get("checkpoint") or {}).get("safe_to_retry")
                    else "CANCELLED" if getattr(exc, "code", None) == "STATIC_CANCELLED"
                    else "PAUSED" if self._worker_stop.is_set() else "FAILED")
                current["error"] = {"code": getattr(exc, "code", type(exc).__name__), "message": str(exc)[:8000]}
                current["progress"] = dict(current["progress"], stage="RECONCILE_NATIVE" if current["state"] == "WAITING_NATIVE" else current["state"], detail=str(exc)[:8000])
                self._write_operation(db, current, current["author"], "Native operation stopped with retained checkpoint", current["error"])

    def _worker_loop(self):
        try:
            while not self._worker_stop.is_set():
                self._worker_wake.clear()
                value = None
                with self._native_storage_lease() as available:
                    if available:
                        value = self._claim_next()
                        if value:
                            self._run_operation(value)
                if value is None:
                    self._worker_wake.wait(1.0)
        finally:
            if self._worker_lock is not None:
                fcntl.flock(self._worker_lock, fcntl.LOCK_UN)
                os.close(self._worker_lock)
                self._worker_lock = None

    def start_worker(self):
        from govhub import GovHubError
        with self._worker_mutex:
            if self._worker and self._worker.is_alive():
                return self._worker
            path = self.root / "native-worker.lock"
            descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                os.close(descriptor)
                raise GovHubError("WORKER_OWNED", "Another process owns this workspace's native worker.", 409) from exc
            self._worker_lock = descriptor
            self._worker_stop.clear()
            with self.connect(write=True) as db:
                for row in db.execute("SELECT data FROM govhub_operations WHERE state='RUNNING'").fetchall():
                    value = json.loads(row[0])
                    value["state"] = "QUEUED" if value["type"] == "CAPTURE" or value.get("resume_checkpoint") else "WAITING_NATIVE" if value.get("native_attempted") else "PAUSED"
                    value["progress"] = dict(value["progress"], stage="RESTART_RECOVERY", detail="Prior native checkpoint recovered after process restart")
                    self._write_operation(db, value, value["author"], "Native operation recovered after restart")
            self._worker = threading.Thread(target=self._worker_loop, name="govhub-native-worker", daemon=True)
            self._worker.start()
            return self._worker

    def stop_worker(self):
        self._worker_stop.set()
        self._worker_wake.set()
        if self._worker and self._worker is not threading.current_thread():
            self._worker.join(timeout=10)

    def _operations_observe(self, payload, actor):
        from govhub import GovHubError, digest, instant, json_bytes, packed, text
        with self.connect(write=True) as db:
            value = self._operation(db, payload.get("operation_id"))
            self._expected(value, payload)
            if value["state"] in {"QUEUED", "RUNNING"} or value["type"] in {"CAPTURE", "PREVIEW", "BACKUP_CREATE", "BACKUP_DOWNLOAD"}:
                raise GovHubError("OPERATION_STATE", "Attach an observed result after the selected restore operation's native action has completed.", 409)
            file_id = payload.get("capture_file_id") or value.get("native_capture_file_id")
            item = self._file_row(db, file_id)
            if item["bytes"] > 32 * 1024 * 1024:
                raise GovHubError("CAPTURE_SIZE", "The native result envelope may be at most 32 MiB.", 413)
            capture = json_bytes(self._verify_file(item).read_bytes())
            if not isinstance(capture, dict) or capture.get("format") != "govhub-native-operation/1":
                raise GovHubError("NATIVE_CAPTURE", "Select the retained govhub-native-operation/1 execution capture.")
            expected = {"operation_id": value["id"], "plan_revision": value["plan_revision"], "source_snapshot_id": value["source_snapshot_id"], "source_snapshot_sha256": value["source_snapshot_sha256"], "environment_id": value["environment_id"], "provider_environment_id": value["profile"]["config"]["environment_id"], "config_sha256": value["profile"]["revision"]}
            self._target_expectation_validate_pin(db, value)
            expected.update(self._target_expectation_capture_fields(value))
            if any(capture.get(key) != item for key, item in expected.items()):
                raise GovHubError("NATIVE_CAPTURE_IDENTITY", "The execution capture belongs to a different operation, source revision, or native target.", 409)
            if not isinstance(capture.get("result"), dict) or capture["result"].get("status") != "COMPLETE":
                raise GovHubError("NATIVE_CAPTURE_STATUS", "The selected original execution capture does not record a completed native action.", 409)
            start = instant(payload.get("actual_started_at") or capture.get("actual_started_at", ""), True)
            end = instant(payload.get("actual_finished_at") or capture.get("actual_finished_at", ""), True)
            if end < start:
                raise GovHubError("EXECUTION_TIME", "The actual completion must follow the native action's start.")
            for key, expected_time in (("actual_started_at", start), ("actual_finished_at", end)):
                if capture.get(key) and instant(capture[key], True) != expected_time:
                    raise GovHubError("EXECUTION_TIME_SOURCE", "The entered actual time differs from the retained execution capture.", 409)
            restored = self._get(db, "snapshot", payload.get("restored_snapshot_id"))
            if restored["kind"] != "RESTORED":
                raise GovHubError("RESTORED_SOURCE", "Choose the actual RESTORED result inventory.")
            self._verify_snapshot(db, restored)
            source = self._get(db, "snapshot", value["source_snapshot_id"])
            self._verify_snapshot(db, source)
            cohort = set(value.get("agency_ids", value["plan"]["agency_ids"]))
            before = {row["agency_id"]: row for row in source["rows"] if row["agency_id"] in cohort}
            after = {row["agency_id"]: row for row in restored["rows"] if row["agency_id"] in cohort}
            comparison = self._target_expectation_compare(value, before, after, cohort) if value.get("target_expectation") else None
            summary = comparison["expected_target_summary"] if comparison else self.auditor.audit(before, after, {}, len(cohort))
            missing = sorted((cohort - set(before)) | (cohort - set(after)))
            status = "PASS" if summary["status"] == "PASS" and not missing else "FAIL"
            observation = self._object(db, "operation_observation", {"operation_id": value["id"], "capture_file_id": item["id"], "capture_sha256": item["sha256"], "restored_snapshot_id": restored["id"], "restored_snapshot_sha256": restored["sha256"], "actual_started_at": start, "actual_finished_at": end, "duration_seconds": (datetime.fromisoformat(end.replace("Z", "+00:00")) - datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds(), "status": status, "summary": summary, "missing_declared_ids": missing, "notes": text(payload.get("notes", ""), 16000), **({"target_comparison": comparison} if comparison else {})}, parent=value["id"], actor=actor["name"])
            value.update(state="COMPLETE" if status == "PASS" else "FAILED", result_snapshot_id=restored["id"], observation_id=observation["id"], native_capture_file_id=item["id"], actual_started_at=start, actual_finished_at=end, error=None if status == "PASS" else {"code": "RESTORED_DIFFERENCES", "message": "The actual observed result differs from its reviewed target expectation or original source invariants; inspect the per-site findings." if comparison else "The actual observed result differs from the selected original source; inspect the per-site findings."})
            value["progress"] = {"completed": len(cohort) if status == "PASS" else len(set(before) & set(after)), "total": len(cohort), "stage": "COMPLETE" if status == "PASS" else "RECONCILE_RESULT", "detail": "Original native result inventory reconciled" if status == "PASS" else "Correct the actual result differences and retain a new observed inventory"}
            value = self._write_operation(db, value, actor, "Actual native result inventory reconciled", {"status": status, "observation_id": observation["id"]})
            return {"operation": value, "observation": observation}

    def _operations_compare(self, payload):
        with self.connect(snapshot=True) as db:
            before = self._operation(db, payload.get("before_id"))
            after = self._operation(db, payload.get("after_id"))
            a = self._get(db, "snapshot", before["result_snapshot_id"]) if before.get("result_snapshot_id") else before.get("source_snapshot")
            b = self._get(db, "snapshot", after["result_snapshot_id"]) if after.get("result_snapshot_id") else after.get("source_snapshot")
            result = {"before": self._operation_summary(before), "after": self._operation_summary(after), "before_basis": "result" if before.get("result_snapshot_id") else "source", "after_basis": "result" if after.get("result_snapshot_id") else "source", "comparison": self._compare_rows(a["rows"] if a else [], b["rows"] if b else [])}
            if before.get("target_expectation") or after.get("target_expectation"):
                result["target_expectations"] = {"before": before.get("target_expectation"), "after": after.get("target_expectation")}
                result["target_observations"] = {"before": self._objects(db, "operation_observation", before["id"]), "after": self._objects(db, "operation_observation", after["id"])}
            return result
