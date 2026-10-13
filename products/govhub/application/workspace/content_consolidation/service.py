"""Content consolidation in GovHub's existing store, worker and receiving carrier."""
from copy import deepcopy
from pathlib import Path
import json
import re

from govhub import GovHubError, digest, ident, now, packed, text
from .model import compare_editions, parse_edition
from .tabular import csv_options, inspect_csv
from .compiler import compile_mapping
from .delivery import ContentDeliveryMixin

CONTENT_TYPES = {"CONTENT_IMPORT", "CONTENT_ROLLBACK", "CONTENT_STATUS", "CONTENT_RECEIVE"}
ACTIONS = {"CONTENT_IMPORT": "drupal-content-import", "CONTENT_ROLLBACK": "drupal-content-rollback", "CONTENT_STATUS": "drupal-content-status", "CONTENT_RECEIVE": "drupal-content-receive"}


class NativeFacade:
    def __init__(self, original):
        self.original = original

    def __getattr__(self, name):
        return getattr(self.original, name)

    def configuration_schema(self):
        schema = deepcopy(self.original.configuration_schema())
        for provider in schema["providers"]:
            if provider["value"] == "drush":
                provider["fields"].extend([
                    {"name": "jsonapi_bearer_env", "label": "JSON:API bearer environment variable", "type": "text", "required": False},
                    {"name": "jsonapi_cookie_env", "label": "JSON:API cookie environment variable", "type": "text", "required": False},
                ])
        return schema

    @staticmethod
    def _original_config(config):
        return {k: v for k, v in config.items() if k not in {"jsonapi_bearer_env", "jsonapi_cookie_env"}}

    def discover_capabilities(self, config, **options):
        return self.original.discover_capabilities(self._original_config(config), **options)

    def capture(self, config, context, checkpoint=None, cancelled=None):
        return self.original.capture(self._original_config(config), context, checkpoint=checkpoint, cancelled=cancelled)

    def execute(self, operation, config, source_paths, checkpoint=None, cancelled=None):
        if operation.get("type") in CONTENT_TYPES:
            from .drupal.adapter import execute
            return execute(operation, config, source_paths, checkpoint=checkpoint, cancelled=cancelled)
        return self.original.execute(operation, self._original_config(config), source_paths, checkpoint=checkpoint, cancelled=cancelled)


class ContentMixin(ContentDeliveryMixin):
    def _operations_configure(self, payload, actor):
        config = payload.get("config")
        if isinstance(config, dict):
            for name in ("jsonapi_bearer_env", "jsonapi_cookie_env"):
                if config.get(name) and (not isinstance(config[name], str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", config[name])):
                    raise GovHubError("JSONAPI_ENV_REFERENCE", "Supply only the name of the existing private JSON:API environment variable.", fields={name: "Use an environment-variable name, not a credential value."})
        return super()._operations_configure(payload, actor)

    def _native(self):
        return NativeFacade(super()._native())

    def _content_family(self, db, identity):
        family = self._get(db, "content_family", identity)
        versions = self._objects(db, "content_family_version", identity)
        return dict(family, **versions[-1]["data"], revision=versions[-1]["id"]) if versions else dict(family, revision=family["id"])

    def _content_summary(self, db):
        families = []
        for stored in self._objects(db, "content_family"):
            family = self._content_family(db, stored["id"])
            editions = self._objects(db, "content_edition", family["id"])
            mappings = self._objects(db, "content_mapping", family["id"])
            reviews = self._objects(db, "content_review", family["id"])
            family.update(source_count=len({e["source_id"] for e in editions}), edition_count=len(editions), latest_mapping_id=mappings[-1]["id"] if mappings else "", latest_review=reviews[-1] if reviews else None)
            families.append(family)
        return {"families": families, "observed_at": now()}

    def _content_compile(self, db, family, definition):
        editions = {e["id"]: e for e in self._objects(db, "content_edition", family["id"])}
        files = {row["id"]: dict(row) for row in db.execute("SELECT * FROM files")}
        result = compile_mapping(family, definition, editions, files)
        selected = {m["id"] for m in result["migrations"]}
        for other in self._objects(db, "content_mapping"):
            if other["family_id"] != family["id"] and self._content_family(db, other["family_id"])["environment_id"] == family["environment_id"]:
                overlap = selected & {m["id"] for m in other["definition"].get("migrations", [])}
                if overlap:
                    raise GovHubError("MIGRATION_OWNERSHIP", "These native migration IDs already belong to another consolidation: " + ", ".join(sorted(overlap)), 409)
        return result

    def _content_family_save(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            environment = self._record_db(db, "environments", payload.get("environment_id"))
            if environment["archived"]:
                raise GovHubError("CONTENT_TARGET", "Select an active original target environment.")
            limits = payload.get("limits", {})
            if not isinstance(limits, dict) or set(limits) - {"migrations", "records", "files", "file_bytes", "routes"} or any(isinstance(v, bool) or not isinstance(v, int) or v < 0 for v in limits.values()):
                raise GovHubError("CONTENT_SCOPE", "Retain the agreed nonnegative whole-number scope quantities.")
            data = {"label": text(payload.get("label", ""), 500, True), "environment_id": environment["id"], "owner": text(payload.get("owner", actor["name"]), 500, True), "notes": text(payload.get("notes", ""), 16000), "comparison_id": text(payload.get("comparison_id", ""), 240), "limits": limits, "recovery_instruction": text(payload.get("recovery_instruction", ""), 16000)}
            if payload.get("family_id"):
                current = self._content_family(db, payload["family_id"])
                if current["revision"] != payload.get("expected_revision"):
                    raise GovHubError("CONTENT_REVISION", "Reopen the current consolidation before changing its scope.", 409)
                if data["environment_id"] != current["environment_id"]:
                    raise GovHubError("CONTENT_TARGET", "A consolidation retains its original target. Create a distinct consolidation for a different target.", 409)
                self._object(db, "content_family_version", {"family_id": current["id"], "data": data}, parent=current["id"], actor=actor["name"])
                family = self._content_family(db, current["id"])
            else:
                family = self._object(db, "content_family", data, actor=actor["name"], object_id=ident("content-"))
                family["revision"] = family["id"]
            result = {"family": family}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Content consolidation scope saved", "content_family", family["id"])
            return result

    def _content_source_inspect(self, payload, actor):
        options = csv_options(payload)
        descriptors = payload.get("files", [])
        if not isinstance(descriptors, list) or not descriptors:
            raise GovHubError("CONTENT_SOURCE", "Choose the retained original CSV files.")
        offset, limit = payload.get("offset", 0), payload.get("limit", 25)
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
            raise GovHubError("CONTENT_SOURCE_PAGE", "The source offset must be a nonnegative record number.")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 250:
            raise GovHubError("CONTENT_SOURCE_PAGE", "Choose between 1 and 250 displayed original records.")
        result = {"format": "CSV", "csv_options": options, "files": [], "rows": [], "issues": [], "headers": [], "offset": offset, "limit": limit, "complete": True, "row_count": 0, "observed_records": 0}
        seen, known_headers = set(), set()
        with self.connect(snapshot=True) as db:
            for descriptor in descriptors:
                if isinstance(descriptor, str):
                    descriptor = {"file_id": descriptor}
                if not isinstance(descriptor, dict):
                    raise GovHubError("CONTENT_SOURCE", "Choose a retained source file identifier.")
                file = self._file_row(db, descriptor.get("file_id"))
                if file["id"] in seen:
                    raise GovHubError("CONTENT_SOURCE", "Include each retained original CSV once.")
                seen.add(file["id"])
                if file["bytes"] > 128 * 1024 * 1024:
                    raise GovHubError("CONTENT_SOURCE_SIZE", "Select a source export within the existing 128 MiB row-intake limit.")
                path = self._verify_file(file)
                remaining = max(0, limit - len(result["rows"]))
                local_offset = max(0, offset - result["observed_records"])
                try:
                    with path.open("r", encoding="utf-8-sig", newline="") as stream:
                        observed = inspect_csv(stream, options, local_offset, remaining)
                except GovHubError as exc:
                    observed = {"headers": [], "complete": False, "row_count": None, "observed_records": 0, "rows": [], "issues": [{"code": exc.code, "message": exc.message}]}
                for header in observed["headers"]:
                    if header not in known_headers:
                        known_headers.add(header)
                        result["headers"].append(header)
                start = result["observed_records"]
                result["rows"].extend({**row, "row": start + row["source_row"], "file_id": file["id"], "file_sha256": file["sha256"]} for row in observed["rows"])
                result["issues"].extend({**item, "file_id": file["id"]} for item in observed["issues"])
                result["files"].append({**file, **{k: v for k, v in observed.items() if k not in {"rows", "issues"}}})
                result["observed_records"] += observed["observed_records"]
                result["complete"] = result["complete"] and observed["complete"]
        result["row_count"] = result["observed_records"] if result["complete"] else None
        return result

    def _content_edition_create(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            family = self._content_family(db, payload.get("family_id"))
            descriptors = payload.get("files", [])
            if not isinstance(descriptors, list) or not descriptors:
                raise GovHubError("CONTENT_SOURCE", "Choose the original source file or all original API pages.")
            originals, ids = [], set()
            for descriptor in descriptors:
                if isinstance(descriptor, str):
                    descriptor = {"file_id": descriptor}
                file = self._file_row(db, descriptor.get("file_id"))
                if file["id"] in ids:
                    raise GovHubError("CONTENT_SOURCE", "Include each original source page once.")
                ids.add(file["id"])
                if file["bytes"] > 128 * 1024 * 1024:
                    raise GovHubError("CONTENT_SOURCE_SIZE", "Select a source export within the existing 128 MiB row-intake limit; retain large media through source-file bindings.")
                originals.append({"file": file, "bytes": self._verify_file(file).read_bytes(), "request_url": text(descriptor.get("request_url", ""), 8000)})
            parsed = parse_edition(payload, originals)
            previous = [e for e in self._objects(db, "content_edition", family["id"]) if e["source_id"] == parsed["source_id"]]
            if previous and previous[-1]["record_keys"] != parsed["record_keys"]:
                raise GovHubError("CONTENT_KEYS_CHANGED", "An existing feed keeps its original key fields. Use a new source namespace for a different identity scheme.")
            edition = self._object(db, "content_edition", dict(parsed, family_id=family["id"], previous_edition_id=previous[-1]["id"] if previous else ""), parent=family["id"], actor=actor["name"])
            result = {"edition": self._content_edition_summary(edition)}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Complete original content edition retained", "content_edition", edition["id"], {"rows": edition["row_count"], "issues": len(edition["issues"])})
            return result

    @staticmethod
    def _content_edition_summary(edition):
        return {k: v for k, v in edition.items() if k != "rows"}

    def _content_mapping_save(self, payload, actor):
        definition = deepcopy(payload.get("definition"))
        if not isinstance(definition, dict):
            raise GovHubError("CONTENT_MAPPING", "Supply the complete native mapping definition.")
        for migration in definition.get("migrations", []):
            if isinstance(migration, dict) and isinstance(migration.get("process"), dict):
                migration.setdefault("process_order", list(migration["process"]))
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, dict(payload, definition=definition), actor)
            if prior:
                return prior
            family = self._content_family(db, payload.get("family_id"))
            versions = self._objects(db, "content_mapping", family["id"])
            latest = versions[-1]["id"] if versions else ""
            if payload.get("expected_mapping_id", "") != latest:
                raise GovHubError("CONTENT_MAPPING_REVISION", "A newer mapping was saved. Reopen it before preparing the next complete edition.", 409)
            compiled = self._content_compile(db, family, definition)
            mapping = self._object(db, "content_mapping", {"family_id": family["id"], "family_revision": family["revision"], "label": text(payload.get("label", ""), 500, True), "definition": definition, "previous_mapping_id": latest, "compiled": compiled}, parent=family["id"], actor=actor["name"])
            result = {"mapping": mapping}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Complete content mapping edition saved", "content_mapping", mapping["id"], {"issues": len(compiled["issues"]), **compiled["counts"]})
            return result

    def _content_review_save(self, payload, actor):
        self._authorize(actor, "reviewer")
        if payload.get("decision") not in {"APPROVE", "RETURN"}:
            raise GovHubError("CONTENT_REVIEW", "Approve this mapping edition or return it for correction.")
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            mapping = self._get(db, "content_mapping", payload.get("mapping_id"))
            family = self._content_family(db, mapping["family_id"])
            if payload.get("mapping_sha256") != mapping["sha256"]:
                raise GovHubError("CONTENT_REVIEW_REVISION", "Review the exact retained mapping edition displayed here.", 409)
            compiled = self._content_compile(db, family, mapping["definition"])
            approve = payload["decision"] == "APPROVE"
            if approve and compiled["issues"]:
                raise GovHubError("CONTENT_REVIEW_ISSUES", "Resolve this edition's source and mapping issues before approving its import.", fields={"mapping": str(len(compiled["issues"])) + " retained source or mapping issues."})
            backup = None
            if payload.get("backup_file_id"):
                file = self._file_row(db, payload["backup_file_id"])
                self._verify_file(file)
                backup = {"file_id": file["id"], "sha256": file["sha256"], "bytes": file["bytes"]}
            if approve and compiled["allow_existing_updates"] and not backup:
                raise GovHubError("CONTENT_UPDATE_BACKUP", "Select the original target backup for this reviewed existing-record update.")
            review = self._object(db, "content_review", {"family_id": family["id"], "mapping_id": mapping["id"], "mapping_sha256": mapping["sha256"], "family_revision": family["revision"], "definition_sha256": compiled["definition_sha256"], "decision": payload["decision"], "reason": text(payload.get("reason", ""), 16000, True), "backup_ref": backup}, parent=family["id"], actor=actor["name"])
            plan = None
            if approve:
                editions = sorted({m["edition_id"] for m in mapping["definition"]["migrations"]})
                profile = self._config(db, family["environment_id"])
                native = {"schema": "govhub.content-consolidation.drupal-plan.v1", "id": ident("content-plan-"), "family_id": family["id"], "edition_id": mapping["id"], "label": mapping["label"], "source_refs": compiled["source_refs"], "migrations": compiled["migrations"], "files": compiled["files"], "routes": compiled["routes"], "review": {"id": review["id"], "actor": actor["name"], "at": review["created_at"], "note": review["reason"], "allow_existing_updates": compiled["allow_existing_updates"], "backup_ref": backup}}
                plan = self._object(db, "content_plan", {"id": native["id"], "family_id": family["id"], "family_revision": family["revision"], "mapping_id": mapping["id"], "mapping_sha256": mapping["sha256"], "review_id": review["id"], "edition_ids": editions, "profile_revision": profile["revision"], "native": native, "lineage": compiled["lineage"], "definition_sha256": compiled["definition_sha256"]}, parent=family["id"], actor=actor["name"])
            result = {"review": review, "plan": plan}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Exact content mapping review retained", "content_review", review["id"], {"decision": review["decision"]})
            return result

    def _content_operation_create(self, payload, actor):
        type_ = payload.get("type", "CONTENT_IMPORT")
        if type_ not in CONTENT_TYPES:
            raise GovHubError("CONTENT_OPERATION", "Select native import, rollback, status, or receiving.")
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            plan = self._get(db, "content_plan", payload.get("content_plan_id"))
            if payload.get("plan_sha256") != plan["sha256"]:
                raise GovHubError("CONTENT_PLAN_REVISION", "Choose the exact reviewed native plan edition.", 409)
            family = self._content_family(db, plan["family_id"])
            reviews = [r for r in self._objects(db, "content_review", family["id"]) if r["mapping_id"] == plan["mapping_id"]]
            if not reviews or reviews[-1]["id"] != plan["review_id"] or reviews[-1]["decision"] != "APPROVE" or family["revision"] != plan["family_revision"]:
                raise GovHubError("CONTENT_CURRENT_REVIEW", "Review this exact native plan against the current consolidation scope and decision.", 409)
            environment = self._record_db(db, "environments", family["environment_id"])
            profile = self._config(db, environment["id"])
            if environment["archived"] or environment["data"]["provider_resource_id"] != profile["config"]["environment_id"] or profile["revision"] != plan["profile_revision"] or environment["data"]["native_profile"] != profile["revision"]:
                raise GovHubError("CONTENT_NATIVE_TARGET", "The selected target/profile changed. Review the mapping against its current original configuration.", 409)
            if profile["config"].get("source_kind") != "drush":
                raise GovHubError("CONTENT_NATIVE_PROFILE", "Select the original Drush profile for the Drupal project; its Acquia hosting identity remains in the environment register.")
            if not environment["data"]["authorization_reference"]:
                raise GovHubError("CONTENT_TARGET_AUTHORITY", "Retain the original operating instruction in this target environment.")
            reason = text(payload.get("reason", ""), 16000, True)
            timestamp = now()
            value = {"id": ident("operation-"), "type": type_, "native_action": ACTIONS[type_], "state": "QUEUED", "plan_id": "", "plan_revision": plan["mapping_id"], "plan": None, "audit_id": None, "review_id": plan["review_id"], "environment_id": environment["id"], "environment": environment, "profile": profile, "provider_environment_id": profile["config"]["environment_id"], "source_snapshot_id": "", "source_snapshot": None, "source_snapshot_sha256": "", "authorization_reference": environment["data"]["authorization_reference"], "agency_ids": [family["comparison_id"]] if family["comparison_id"] else [], "content_family_id": family["id"], "content_plan_id": plan["id"], "content_plan_sha256": plan["sha256"], "content_reason": reason, "created_at": timestamp, "updated_at": timestamp, "author": actor["name"], "progress": {"completed": 0, "total": 1, "stage": "QUEUED", "detail": "Queued for the original Drupal migration engine"}, "error": None, "cancel_requested": False, "native_attempted": False, "checkpoint": None, "resume_checkpoint": None, "native_capture_file_id": None, "native_result": None, "result_snapshot_id": None, "actual_started_at": None, "actual_finished_at": None}
            if "content_row_limit" in payload:
                row_limit = payload["content_row_limit"]
                if isinstance(row_limit, bool) or not isinstance(row_limit, int) or row_limit < 0:
                    raise GovHubError("CONTENT_ROW_LIMIT", "Use zero for the full native pass or a positive native row count per continuation.")
                if type_ != "CONTENT_IMPORT" and row_limit:
                    raise GovHubError("CONTENT_ROW_LIMIT", "Native row continuation applies to content import.")
                value["content_row_limit"] = row_limit
            if type_ == "CONTENT_ROLLBACK":
                selection = payload.get("content_selection")
                if not isinstance(selection, list) or not selection:
                    raise GovHubError("CONTENT_ROLLBACK_SELECTION", "Select the original native migration/source IDs to roll back.")
                value["content_selection"] = deepcopy(selection)
            operation = self._write_operation(db, value, actor, "Reviewed native content work queued", {"content_plan_id": plan["id"], "definition_sha256": plan["definition_sha256"]})
            result = {"operation": operation}
            self._remember(db, key, fingerprint, result, actor)
        self._worker_wake.set()
        return result

    def _operation_sources(self, value, output_dir):
        if value.get("type") not in CONTENT_TYPES:
            return super()._operation_sources(value, output_dir)
        with self.connect(snapshot=True) as db:
            plan = self._get(db, "content_plan", value["content_plan_id"])
            if plan["sha256"] != value["content_plan_sha256"]:
                raise GovHubError("CONTENT_PLAN_CHANGED", "The original retained native plan changed.", 409)
            bindings = []
            ids = {item["file_id"] for item in plan["native"]["source_refs"]}
            ids.update(item["file_id"] for item in plan["native"]["files"])
            backup = plan["native"]["review"].get("backup_ref")
            if backup:
                ids.add(backup["file_id"])
            expected = {item["file_id"]: item for item in [*plan["native"]["source_refs"], *plan["native"]["files"], *([backup] if backup else [])]}
            for file_id in sorted(ids):
                item = self._file_row(db, file_id)
                if any(item[name] != expected[file_id][name] for name in ("sha256", "bytes")):
                    raise GovHubError("CONTENT_SOURCE_IDENTITY", "The retained original file differs from the reviewed native plan.", 409)
                path = self._verify_file(item)
                selected = next((f for f in plan["native"]["files"] if f["file_id"] == file_id), {})
                bindings.append({"file_id": file_id, "path": str(path), "sha256": item["sha256"], "bytes": item["bytes"], "relative_path": selected.get("relative_path", item["filename"])})
        return {"content_plan": deepcopy(plan["native"]), "content_files": bindings, "output_dir": str(output_dir), "checkpoint": value.get("resume_checkpoint") or value.get("checkpoint"), "workspace_relocations": self._workspace_relocations(), "snapshot_id": "", "snapshot_sha256": "", "rows": [], "bindings": []}

    def _content_native_completion(self, current, native_result):
        if current.get("type") in CONTENT_TYPES and native_result.get("status") == "COMPLETE":
            current["state"] = "COMPLETE"
            current["progress"] = {"completed": 1, "total": 1, "stage": "COMPLETE", "detail": "Original Drupal migration and selected receiving result retained"}

    def _content_dispatch(self, action, payload, actor):
        if action == "sources.inspect":
            return self._content_source_inspect(payload, actor)
        handlers = {"families.save": self._content_family_save, "editions.create": self._content_edition_create, "mappings.save": self._content_mapping_save, "reviews.save": self._content_review_save, "operations.create": self._content_operation_create}
        if action in handlers:
            return handlers[action](payload, actor)
        with self.connect(snapshot=True) as db:
            if action == "families.list":
                return self._content_summary(db)
            if action == "families.get":
                family = self._content_family(db, payload.get("family_id"))
                return {"family": family, "editions": [self._content_edition_summary(e) for e in self._objects(db, "content_edition", family["id"])], "mappings": [{k: v for k, v in m.items() if k not in {"compiled", "definition"}} for m in self._objects(db, "content_mapping", family["id"])], "reviews": self._objects(db, "content_review", family["id"]), "plans": [{k: v for k, v in p.items() if k not in {"native", "lineage"}} for p in self._objects(db, "content_plan", family["id"])], "operations": [self._operation_summary(o) for o in [json.loads(row[0]) for row in db.execute("SELECT data FROM govhub_operations ORDER BY rowid")] if o.get("content_family_id") == family["id"]]}
            if action == "editions.get":
                edition = self._get(db, "content_edition", payload.get("edition_id"))
                offset = max(0, int(payload.get("offset", 0)))
                limit = min(250, max(1, int(payload.get("limit", 50))))
                query = text(payload.get("query", ""), 2000).casefold()
                rows = [r for r in edition["rows"] if not query or query in packed(r).casefold()]
                return {"edition": self._content_edition_summary(edition), "rows": rows[offset:offset + limit], "offset": offset, "limit": limit, "total": len(rows)}
            if action == "editions.compare":
                return compare_editions(self._get(db, "content_edition", payload.get("before_id")), self._get(db, "content_edition", payload.get("after_id")))
            if action == "mappings.get":
                return {"mapping": self._get(db, "content_mapping", payload.get("mapping_id"))}
            if action == "mappings.preview":
                family = self._content_family(db, payload.get("family_id"))
                return {"compiled": self._content_compile(db, family, payload.get("definition", {}))}
            if action == "plans.get":
                return {"plan": self._get(db, "content_plan", payload.get("content_plan_id"))}
        raise GovHubError("CONTENT_ACTION", "This content-consolidation action does not exist.", 404)
