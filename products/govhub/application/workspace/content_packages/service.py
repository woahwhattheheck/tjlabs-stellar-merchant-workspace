"""Content Packages in the original GovHub store, worker and delivery flow."""
from copy import deepcopy
import json

from govhub import GovHubError, digest, ident, json_bytes, now, packed, text
from .model import TYPES, READ_TYPES, NATIVE_RESULT, options, preview, selection
from .delivery import PackageDeliveryMixin


class NativeFacade:
    def __init__(self, original):
        self.original = original

    def __getattr__(self, name):
        return getattr(self.original, name)

    def execute(self, operation, config, source_paths, checkpoint=None, cancelled=None):
        if operation.get("type") in TYPES:
            from .native import execute
            return execute(operation, config, source_paths, checkpoint=checkpoint, cancelled=cancelled)
        return self.original.execute(operation, config, source_paths, checkpoint=checkpoint, cancelled=cancelled)


class PackagesMixin(PackageDeliveryMixin):
    def _native(self):
        return NativeFacade(super()._native())

    def _package_family(self, db, family_id):
        family = self._get(db, "package_family", family_id)
        versions = self._objects(db, "package_family_version", family_id)
        return dict(family, **versions[-1]["data"], revision=versions[-1]["id"]) if versions else dict(family, revision=family["id"])

    def _packages_summary(self, db):
        result = []
        for original in self._objects(db, "package_family"):
            family = self._package_family(db, original["id"])
            editions = self._objects(db, "package_edition", family["id"])
            reviews = self._objects(db, "package_review", family["id"])
            result.append(dict(family, edition_count=len(editions), latest_edition_id=editions[-1]["id"] if editions else "", latest_review=reviews[-1] if reviews else None))
        return {"families": result, "observed_at": now()}

    def _package_target(self, db, environment_id):
        environment = self._record_db(db, "environments", environment_id)
        profile = self._config(db, environment["id"])
        if environment["archived"] or environment["data"]["provider_resource_id"] != profile["config"]["environment_id"] or environment["data"]["native_profile"] != profile["revision"]:
            raise GovHubError("PACKAGE_TARGET_CHANGED", "Reopen the selected environment and its current native profile.", 409)
        if profile["config"].get("source_kind") != "drush":
            raise GovHubError("PACKAGE_NATIVE_PROFILE", "Select the original Drupal / Drush profile for this site's content operation.")
        return environment, profile

    def _packages_family_save(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            environment, profile = self._package_target(db, payload.get("environment_id"))
            source_id = text(payload.get("source_environment_id", ""), 240)
            if source_id:
                self._package_target(db, source_id)
            plan_ids = payload.get("plan_ids", [])
            if not isinstance(plan_ids, list) or any(not isinstance(p, str) for p in plan_ids) or len(set(plan_ids)) != len(plan_ids):
                raise GovHubError("PACKAGE_COHORT", "Select each original cutover or recovery plan once.")
            for plan_id in plan_ids:
                self._plan(db, plan_id)
            data = {
                "label": text(payload.get("label", ""), 500, True),
                "owner": text(payload.get("owner", actor["name"]), 500, True),
                "notes": text(payload.get("notes", ""), 32000),
                "environment_id": environment["id"],
                "source_environment_id": source_id,
                "comparison_id": text(payload.get("comparison_id", ""), 240),
                "plan_ids": plan_ids,
                "recovery_instruction": text(payload.get("recovery_instruction", ""), 32000),
                "profile_revision": profile["revision"],
            }
            if payload.get("family_id"):
                family = self._package_family(db, payload["family_id"])
                if payload.get("expected_revision") != family["revision"]:
                    raise GovHubError("PACKAGE_FAMILY_REVISION", "The content workshare changed. Reopen its current version before saving.", 409)
                version = self._object(db, "package_family_version", {"family_id": family["id"], "previous_revision": family["revision"], "data": data}, parent=family["id"], actor=actor["name"])
                family = dict(family, **data, revision=version["id"])
            else:
                original = self._object(db, "package_family", data, actor=actor["name"])
                family = dict(original, revision=original["id"])
            result = {"family": family}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Content package workshare saved", "package_family", family["id"])
            return result

    def _package_artifact(self, db, operation, role, sha256=None):
        candidates = [item for item in operation.get("retained_artifacts", []) if item.get("role") == role and (sha256 is None or item["file"]["sha256"] == sha256)]
        if not candidates:
            raise GovHubError("PACKAGE_NATIVE_OUTPUT", "The original native operation has not retained " + role + ".", 409)
        item = candidates[-1]["file"]
        actual = self._file_row(db, item["id"])
        if actual["sha256"] != item["sha256"] or actual["bytes"] != item["bytes"]:
            raise GovHubError("PACKAGE_NATIVE_OUTPUT_CHANGED", "The retained native output identity changed.", 409)
        return actual, self._verify_file(actual)

    def _package_result(self, db, operation):
        observed = (operation.get("native_result") or {}).get("observations", {})
        ref = observed.get("result_file") or {}
        file, path = self._package_artifact(db, operation, "package_result", ref.get("sha256"))
        native = json_bytes(path.read_bytes())
        if native.get("schema") != NATIVE_RESULT or native.get("operation_id") != operation["id"] or native.get("action") != TYPES.get(operation["type"]):
            raise GovHubError("PACKAGE_NATIVE_RESULT", "The retained bridge output belongs to another original operation.", 409)
        if observed.get("package_result") != native:
            raise GovHubError("PACKAGE_NATIVE_RESULT_CHANGED", "The observed native result differs from its original saved bytes.", 409)
        return file, native

    def _packages_edition_create(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            family = self._package_family(db, payload.get("family_id"))
            export_id = text(payload.get("export_operation_id", ""), 240)
            if export_id:
                operation = self._operation(db, export_id)
                if operation.get("package_family_id") != family["id"] or operation["type"] != "PACKAGE_EXPORT" or operation["state"] != "COMPLETE":
                    raise GovHubError("PACKAGE_EXPORT_STATE", "Choose this workshare's completed original graph export.", 409)
                _, native = self._package_result(db, operation)
                archive = native.get("archive", {})
                file, _ = self._package_artifact(db, operation, "package_archive", archive.get("sha256"))
                if payload.get("file_id") and payload["file_id"] != file["id"]:
                    raise GovHubError("PACKAGE_ARCHIVE_IDENTITY", "The selected file differs from the original graph export.", 409)
                provenance = {"export_operation_id": operation["id"], "source_target": native.get("target"), "roots": native.get("roots", [])}
            else:
                file = self._file_row(db, payload.get("file_id"))
                self._verify_file(file)
                provenance = {"source_reference": text(payload.get("source_reference", ""), 16000)}
            versions = self._objects(db, "package_edition", family["id"])
            previous_id = text(payload.get("previous_edition_id", ""), 240)
            if previous_id:
                previous = self._get(db, "package_edition", previous_id)
                if previous["family_id"] != family["id"]:
                    raise GovHubError("PACKAGE_EDITION_FAMILY", "Choose the preceding archive from this workshare.")
            elif versions:
                previous_id = versions[-1]["id"]
            edition = self._object(db, "package_edition", {
                "family_id": family["id"], "family_revision": family["revision"],
                "label": text(payload.get("label", file["filename"]), 500, True),
                "file_id": file["id"], "archive_sha256": file["sha256"], "archive_bytes": file["bytes"],
                "filename": file["filename"], "previous_edition_id": previous_id,
                "notes": text(payload.get("notes", ""), 32000), "provenance": provenance,
            }, parent=family["id"], actor=actor["name"])
            result = {"edition": edition}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Original content archive edition retained", "package_edition", edition["id"], {"archive_sha256": file["sha256"]})
            return result

    def _package_preview_record(self, db, operation_id):
        operation = self._operation(db, operation_id)
        if operation["type"] != "PACKAGE_PREVIEW" or operation["state"] != "COMPLETE":
            raise GovHubError("PACKAGE_PREVIEW_STATE", "Select a completed original native archive preview.", 409)
        file, native = self._package_result(db, operation)
        value = preview(native.get("preview"), operation["package_request"]["archive_sha256"])
        return operation, file, value

    def _packages_comparison_create(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            baseline, baseline_file, before = self._package_preview_record(db, payload.get("baseline_preview_operation_id"))
            candidate, candidate_file, after = self._package_preview_record(db, payload.get("candidate_preview_operation_id"))
            if baseline["package_family_id"] != candidate["package_family_id"]:
                raise GovHubError("PACKAGE_COMPARISON_SCOPE", "Select two archive previews from the same content workshare.")
            if baseline["package_edition_id"] == candidate["package_edition_id"]:
                raise GovHubError("PACKAGE_COMPARISON_EDITION", "Choose the original and corrected archive editions.")
            def changes(previous, current, identity, source):
                old = {row[identity]: row for row in previous}
                new = {row[identity]: row for row in current}
                if len(old) != len(previous) or len(new) != len(current):
                    raise GovHubError("PACKAGE_COMPARISON_IDENTITY", "The original native preview contains a repeated source identity.", 409)
                output = []
                for item_id in sorted(set(old) | set(new)):
                    a, b = old.get(item_id), new.get(item_id)
                    state = "ADDED" if a is None else "EXCLUDED" if b is None else "UNCHANGED" if source(a) == source(b) else "CHANGED"
                    output.append({"identity": item_id, "change": state, "baseline": a, "candidate": b})
                return output
            packages = changes(before["packages"], after["packages"], "key",
                               lambda row: packed({"source": row["source"]["sha256"],
                                   "entity_type": row["entity_type"], "bundle": row["bundle"],
                                   "references": row.get("references", []), "assets": row.get("assets", [])}))
            assets = changes(before["assets"], after["assets"], "path",
                             lambda row: (row["sha256"], row["bytes"]))
            comparison = self._object(db, "package_comparison", {
                "schema": "govhub.content-packages.comparison.v1",
                "family_id": candidate["package_family_id"],
                "baseline_edition_id": baseline["package_edition_id"],
                "candidate_edition_id": candidate["package_edition_id"],
                "baseline_preview_operation_id": baseline["id"],
                "candidate_preview_operation_id": candidate["id"],
                "baseline_preview_file_id": baseline_file["id"],
                "candidate_preview_file_id": candidate_file["id"],
                "baseline_preview_sha256": baseline_file["sha256"],
                "candidate_preview_sha256": candidate_file["sha256"],
                "baseline_target_sha256": before["target_sha256"],
                "candidate_target_sha256": after["target_sha256"],
                "packages": packages, "assets": assets,
                "counts": {kind: sum(row["change"] == kind for row in packages)
                           for kind in ("ADDED", "CHANGED", "UNCHANGED", "EXCLUDED")},
                "exclusion_behavior": "Excluded packages remain on the destination; native archive import does not delete them.",
            }, parent=candidate["package_family_id"], actor=actor["name"])
            result = {"comparison": comparison}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Original and corrected content archives compared", "package_comparison", comparison["id"])
            return result

    def _packages_review_save(self, payload, actor):
        self._authorize(actor, "reviewer")
        if payload.get("decision") not in {"APPROVE", "RETURN"}:
            raise GovHubError("PACKAGE_REVIEW", "Approve this exact native preview or return it for correction.")
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            operation = self._operation(db, payload.get("preview_operation_id"))
            if operation["type"] != "PACKAGE_PREVIEW" or operation["state"] != "COMPLETE":
                raise GovHubError("PACKAGE_PREVIEW_STATE", "Open the completed native archive preview.", 409)
            family = self._package_family(db, operation["package_family_id"])
            edition = self._get(db, "package_edition", operation["package_edition_id"])
            result_file, result = self._package_result(db, operation)
            if result_file["sha256"] != payload.get("preview_sha256"):
                raise GovHubError("PACKAGE_REVIEW_PREVIEW", "Save the review against the exact displayed native result bytes.", 409)
            native_preview = preview(result.get("preview"), edition["archive_sha256"])
            if operation["package_family_revision"] != family["revision"]:
                raise GovHubError("PACKAGE_REVIEW_SCOPE", "The workshare changed after this preview. Prepare the current target and scope.", 409)
            if payload["decision"] == "APPROVE" and native_preview["issues"]:
                raise GovHubError("PACKAGE_PREVIEW_ISSUES", "Resolve the native archive or destination issues before applying this edition.", fields={"preview": str(len(native_preview["issues"])) + " original module issues."})
            reviews = [r for r in self._objects(db, "package_review", family["id"]) if r["preview_operation_id"] == operation["id"]]
            latest_id = reviews[-1]["id"] if reviews else ""
            if payload.get("expected_review_id", "") != latest_id:
                raise GovHubError("PACKAGE_REVIEW_REVISION", "A newer review decision exists for this preview. Reopen it before saving.", 409)
            comparison_id = text(payload.get("comparison_id", ""), 240)
            if comparison_id:
                comparison = self._get(db, "package_comparison", comparison_id)
                if comparison["candidate_preview_operation_id"] != operation["id"] or comparison["candidate_preview_sha256"] != result_file["sha256"]:
                    raise GovHubError("PACKAGE_REVIEW_COMPARISON", "Select the source comparison for this exact candidate preview.", 409)
            decision = self._object(db, "package_review", {
                "family_id": family["id"], "family_revision": family["revision"],
                "edition_id": edition["id"], "archive_sha256": edition["archive_sha256"],
                "preview_operation_id": operation["id"], "preview_file_id": result_file["id"],
                "preview_sha256": result_file["sha256"], "profile_revision": operation["profile"]["revision"],
                "target_sha256": native_preview["target_sha256"], "before_sha256": native_preview["before_sha256"],
                "decision": payload["decision"], "reason": text(payload.get("reason", ""), 32000, True),
                "previous_review_id": latest_id, "comparison_id": comparison_id,
            }, parent=family["id"], actor=actor["name"])
            response = {"review": decision}
            self._remember(db, key, fingerprint, response, actor)
            self._changed(db, actor, "Exact native content-package review saved", "package_review", decision["id"], {"decision": decision["decision"]})
            return response

    def _packages_queue(self, type_, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            family = self._package_family(db, payload.get("family_id"))
            source_operation = None
            if type_ == "PACKAGE_STATUS":
                source_operation = self._operation(db, payload.get("import_operation_id"))
                if source_operation.get("package_family_id") != family["id"] or source_operation["type"] != "PACKAGE_IMPORT":
                    raise GovHubError("PACKAGE_RECEIVING_SOURCE", "Choose this workshare's original import operation.")
                environment, profile = deepcopy(source_operation["environment"]), deepcopy(source_operation["profile"])
            else:
                target_id = (family["source_environment_id"] or family["environment_id"]) if type_ == "PACKAGE_EXPORT" else family["environment_id"]
                environment, profile = self._package_target(db, target_id)
            edition, review, preview_operation = None, None, None
            if type_ in {"PACKAGE_PREVIEW", "PACKAGE_IMPORT"}:
                edition = self._get(db, "package_edition", payload.get("edition_id"))
                if edition["family_id"] != family["id"]:
                    raise GovHubError("PACKAGE_EDITION_FAMILY", "Select an archive from this content workshare.")
                file = self._file_row(db, edition["file_id"])
                if file["sha256"] != edition["archive_sha256"] or file["bytes"] != edition["archive_bytes"]:
                    raise GovHubError("PACKAGE_ARCHIVE_CHANGED", "The original retained archive changed.", 409)
                self._verify_file(file)
            if type_ == "PACKAGE_IMPORT":
                review = self._get(db, "package_review", payload.get("review_id"))
                if review["family_id"] != family["id"] or review["edition_id"] != edition["id"] or review["decision"] != "APPROVE":
                    raise GovHubError("PACKAGE_IMPORT_REVIEW", "Select the saved approval for this exact archive and target.")
                reviews = [r for r in self._objects(db, "package_review", family["id"]) if r["preview_operation_id"] == review["preview_operation_id"]]
                if reviews[-1]["id"] != review["id"] or review["family_revision"] != family["revision"] or review["profile_revision"] != profile["revision"]:
                    raise GovHubError("PACKAGE_IMPORT_REVISION", "The scope, target or review changed. Preview and review that current edition.", 409)
                preview_operation = self._operation(db, review["preview_operation_id"])
                result_file, result = self._package_result(db, preview_operation)
                if result_file["sha256"] != review["preview_sha256"]:
                    raise GovHubError("PACKAGE_IMPORT_PREVIEW", "The original reviewed preview bytes changed.", 409)
                preview(result.get("preview"), edition["archive_sha256"])
            parameters = {"action": TYPES[type_], "environment_id": profile["config"]["environment_id"]}
            if type_ == "PACKAGE_EXPORT":
                try:
                    parameters.update(roots=selection(payload.get("roots")), options=options(payload.get("options")))
                except ValueError as exc:
                    raise GovHubError("PACKAGE_GRAPH_SELECTION", str(exc)) from exc
            if edition:
                parameters.update(archive_sha256=edition["archive_sha256"], archive_bytes=edition["archive_bytes"], edition_id=edition["id"])
            if review:
                parameters.update(review_id=review["id"], preview_sha256=review["preview_sha256"], target_sha256=review["target_sha256"], before_sha256=review["before_sha256"])
            if source_operation:
                parameters.update(import_operation_id=source_operation["id"], import_intent_sha256=source_operation["package_intent_sha256"])
                for name in ("archive_sha256", "archive_bytes", "edition_id", "target_sha256", "before_sha256"):
                    if name in source_operation["package_request"]:
                        parameters[name] = source_operation["package_request"][name]
                edition = self._get(db, "package_edition", parameters["edition_id"])
            timestamp, operation_id = now(), ident("operation-")
            business_intent = {"operation_id": operation_id, "family_id": family["id"], "family_revision": family["revision"], "parameters": parameters, "provider_environment_id": profile["config"]["environment_id"]}
            value = {
                "id": operation_id, "type": type_, "native_action": "drupal-package-" + TYPES[type_],
                "state": "QUEUED", "plan_id": "", "plan_revision": family["revision"], "plan": None,
                "audit_id": None, "review_id": review["id"] if review else None,
                "environment_id": environment["id"], "environment": environment, "profile": profile,
                "provider_environment_id": profile["config"]["environment_id"],
                "source_snapshot_id": "", "source_snapshot": None, "source_snapshot_sha256": "",
                "authorization_reference": environment["data"].get("authorization_reference", ""),
                "agency_ids": [family["comparison_id"]] if family["comparison_id"] else [],
                "package_family_id": family["id"], "package_family_revision": family["revision"],
                "package_edition_id": edition["id"] if edition else "",
                "package_review_id": review["id"] if review else "",
                "package_preview_operation_id": preview_operation["id"] if preview_operation else "",
                "package_request": parameters, "package_intent_sha256": digest(packed(business_intent)),
                "package_intent": business_intent,
                "package_reason": text(payload.get("reason", ""), 32000, True),
                "created_at": timestamp, "updated_at": timestamp, "author": actor["name"],
                "progress": {"completed": 0, "total": 1, "stage": "QUEUED", "detail": "Queued for the selected native Content Packages module"},
                "error": None, "cancel_requested": False, "native_attempted": False,
                "checkpoint": None, "resume_checkpoint": None, "native_capture_file_id": None,
                "native_result": None, "result_snapshot_id": None, "actual_started_at": None,
                "actual_finished_at": None,
            }
            operation = self._write_operation(db, value, actor, "Original native content-package action queued", {"action": TYPES[type_], "archive_sha256": parameters.get("archive_sha256")})
            response = {"operation": operation}
            self._remember(db, key, fingerprint, response, actor)
        self._worker_wake.set()
        return response

    def _operation_sources(self, value, output_dir):
        if value.get("type") not in TYPES:
            return super()._operation_sources(value, output_dir)
        files = []
        with self.connect(snapshot=True) as db:
            checkpoint = value.get("resume_checkpoint") or value.get("checkpoint") or {}
            checkpoint = checkpoint.get("resume_checkpoint", checkpoint.get("state", checkpoint))
            if value["type"] == "PACKAGE_IMPORT" and not value.get("native_attempted") and not checkpoint.get("mutation_started"):
                family = self._package_family(db, value["package_family_id"])
                reviews = [r for r in self._objects(db, "package_review", family["id"]) if r["preview_operation_id"] == value["package_preview_operation_id"]]
                if family["revision"] != value["package_family_revision"] or not reviews or reviews[-1]["id"] != value["package_review_id"] or reviews[-1]["decision"] != "APPROVE":
                    raise GovHubError("PACKAGE_QUEUED_REVIEW_CHANGED", "The queued archive's scope or review changed before native import. Reopen its current decision.", 409)
                _, profile = self._package_target(db, family["environment_id"])
                if profile["revision"] != value["profile"]["revision"]:
                    raise GovHubError("PACKAGE_QUEUED_TARGET_CHANGED", "The native target changed before this queued import started.", 409)
            if value.get("package_edition_id"):
                edition = self._get(db, "package_edition", value["package_edition_id"])
                file = self._file_row(db, edition["file_id"])
                if file["sha256"] != value["package_request"]["archive_sha256"] or file["bytes"] != value["package_request"]["archive_bytes"]:
                    raise GovHubError("PACKAGE_ORIGINAL_ARCHIVE", "The queued content archive differs from its original source edition.", 409)
                files.append({"role": "archive", "file_id": file["id"], "path": str(self._verify_file(file)), "sha256": file["sha256"], "bytes": file["bytes"]})
            if value.get("package_review_id"):
                review = self._get(db, "package_review", value["package_review_id"])
                file = self._file_row(db, review["preview_file_id"])
                if file["sha256"] != review["preview_sha256"]:
                    raise GovHubError("PACKAGE_ORIGINAL_REVIEW", "The queued native preview differs from its reviewed source.", 409)
                files.append({"role": "reviewed_preview", "file_id": file["id"], "path": str(self._verify_file(file)), "sha256": file["sha256"], "bytes": file["bytes"]})
        return {"package_request": deepcopy(value["package_request"]), "package_intent": deepcopy(value["package_intent"]),
                "package_files": files, "output_dir": str(output_dir),
                "checkpoint": value.get("resume_checkpoint") or value.get("checkpoint"),
                "workspace_relocations": self._workspace_relocations(),
                "snapshot_id": "", "snapshot_sha256": "", "rows": [], "bindings": []}

    def _content_native_completion(self, current, native_result):
        super()._content_native_completion(current, native_result)
        if current.get("type") in TYPES and native_result.get("status") == "COMPLETE":
            current["state"] = "COMPLETE"
            current["progress"] = {"completed": 1, "total": 1, "stage": "COMPLETE", "detail": "Original native content-package result and receiving artifacts retained"}

    def _operation_summary(self, value):
        result = super()._operation_summary(value)
        return dict(result, **{name: value[name] for name in ("package_family_id", "package_edition_id", "package_review_id") if name in value})

    def _packages_dispatch(self, action, payload, actor):
        handlers = {
            "families.save": self._packages_family_save,
            "editions.create": self._packages_edition_create,
            "reviews.save": self._packages_review_save,
            "comparisons.create": self._packages_comparison_create,
            "exports.create": lambda p, a: self._packages_queue("PACKAGE_EXPORT", p, a),
            "previews.create": lambda p, a: self._packages_queue("PACKAGE_PREVIEW", p, a),
            "imports.create": lambda p, a: self._packages_queue("PACKAGE_IMPORT", p, a),
            "receiving.create": lambda p, a: self._packages_queue("PACKAGE_STATUS", p, a),
            "handovers.create": self._exports_create,
        }
        if action in handlers:
            return handlers[action](payload, actor)
        with self.connect(snapshot=True) as db:
            if action == "families.list":
                return self._packages_summary(db)
            if action == "families.get":
                family = self._package_family(db, payload.get("family_id"))
                operations = [json.loads(row[0]) for row in db.execute("SELECT data FROM govhub_operations ORDER BY rowid")]
                return {"family": family, "editions": self._objects(db, "package_edition", family["id"]), "reviews": self._objects(db, "package_review", family["id"]), "comparisons": self._objects(db, "package_comparison", family["id"]), "operations": [self._operation_summary(o) for o in operations if o.get("package_family_id") == family["id"]]}
            if action == "comparisons.get":
                return {"comparison": self._get(db, "package_comparison", payload.get("comparison_id"))}
            if action == "editions.get":
                edition = self._get(db, "package_edition", payload.get("edition_id"))
                file = self._file_row(db, edition["file_id"])
                self._verify_file(file)
                return {"edition": edition, "file": file}
            if action == "previews.get":
                operation = self._operation(db, payload.get("preview_operation_id"))
                if operation["type"] != "PACKAGE_PREVIEW":
                    raise GovHubError("PACKAGE_PREVIEW", "Choose the original native preview operation.")
                file, result = self._package_result(db, operation)
                value = deepcopy(result.get("preview"))
                assets = {item["file"]["sha256"]: item["file"] for item in operation.get("retained_artifacts", []) if item.get("role") == "package_asset"}
                for asset in (value or {}).get("assets", []):
                    if asset["sha256"] in assets:
                        asset["file"] = self._file_row(db, assets[asset["sha256"]]["id"])
                return {"operation": self._operation_summary(operation), "preview_file": file, "preview": value, "native": result}
            if action == "operations.get":
                operation = self._operation(db, payload.get("operation_id"))
                if operation["type"] not in TYPES:
                    raise GovHubError("PACKAGE_OPERATION", "Choose a native content-package operation.")
                return {"operation": operation, "events": self._objects(db, "operation_event", operation["id"]), "files": self._output_list(db, "operation", operation["id"])}
        raise GovHubError("PACKAGE_ACTION", "This content-package action does not exist.", 404)
