"""Reviewed target-environment expectations for original source restoration.

The original source and actual observed inventory remain immutable. This module
permits only an explicitly reviewed canonical URL map. The original auditor
still enforces artifact identity, route count, presence and observed HTTP 2xx.
"""
from urllib.parse import urlsplit


class TargetExpectationsMixin:
    def _target_expectation_input(self, db, payload):
        from govhub import GovHubError, digest, packed, text
        plan = self._plan(db, payload.get("plan_id"))
        self._expected(plan, payload)
        purpose = payload.get("purpose")
        if purpose not in {"REHEARSAL", "CUTOVER", "ROLLBACK"}:
            raise GovHubError("EXPECTATION_PURPOSE", "Choose rehearsal, cutover or rollback.")
        environment = self._record_db(db, "environments", payload.get("environment_id"))
        profile = self._config(db, environment["id"])
        if environment["archived"]:
            raise GovHubError("EXPECTATION_TARGET", "Select an active target environment.")
        if purpose == "REHEARSAL" and environment["data"]["purpose"] != "Rehearsal":
            raise GovHubError("REHEARSAL_TARGET", "Select the isolated rehearsal target.")
        if payload.get("environment_revision") != environment["revision"] or payload.get("config_sha256") != profile["revision"]:
            raise GovHubError("EXPECTATION_TARGET_CHANGED", "Refresh the exact target record and native profile before preparing its expectation.", 409)
        if environment["data"].get("native_profile") != profile["revision"] or environment["data"]["provider_resource_id"] != profile["config"]["environment_id"]:
            raise GovHubError("NATIVE_TARGET_CHANGED", "Configure the current native target before reviewing expectations.", 409)
        source = self._get(db, "snapshot", plan["candidate_id"] if purpose == "CUTOVER" else plan["baseline_id"])
        self._verify_snapshot(db, source)
        originals = {r["agency_id"]: r for r in source["rows"]}
        cohort = plan["agency_ids"]
        if any(k not in originals for k in cohort):
            raise GovHubError("EXPECTATION_SOURCE", "Every selected comparison ID needs its retained source row.")
        supplied = payload.get("urls")
        if not isinstance(supplied, list) or len(supplied) != len(cohort):
            raise GovHubError("EXPECTATION_COHORT", "Supply one explicit expected URL for every comparison ID.")
        urls, seen = [], set()
        for entry in supplied:
            if not isinstance(entry, dict) or set(entry) != {"agency_id", "canonical_url", "reason"}:
                raise GovHubError("EXPECTATION_FIELDS", "Each map row contains only agency_id, canonical_url and reason; artifact and route invariants cannot be overridden.")
            agency = text(entry["agency_id"], 240, True)
            url = text(entry["canonical_url"], 4000, True)
            reason = text(entry["reason"], 8000, True)
            parsed = urlsplit(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment or any(ch.isspace() for ch in url):
                raise GovHubError("EXPECTATION_URL", "Use the exact HTTPS target URL without credentials, whitespace or a fragment.")
            try:
                parsed.port
            except ValueError as exc:
                raise GovHubError("EXPECTATION_URL", "The target URL port is invalid.") from exc
            if agency not in cohort or agency in seen:
                raise GovHubError("EXPECTATION_COHORT", "Map each selected comparison ID exactly once.")
            seen.add(agency)
            urls.append({"agency_id": agency, "source_canonical_url": originals[agency]["canonical_url"], "canonical_url": url, "reason": reason})
        parent_id = payload.get("parent_id") or None
        if parent_id:
            parent = self._get(db, "target_expectation", parent_id)
            if parent["plan_id"] != plan["id"] or parent["environment_id"] != environment["id"] or parent["purpose"] != purpose:
                raise GovHubError("EXPECTATION_PARENT", "A corrected edition must retain the same plan, purpose and target record.")
        value = {
            "format": "govhub-target-expectation/1",
            "name": text(payload.get("name", ""), 500, True),
            "reason": text(payload.get("reason", ""), 12000, True),
            "parent_id": parent_id, "plan_id": plan["id"], "plan_revision": plan["revision"],
            "purpose": purpose, "agency_ids": cohort,
            "source_snapshot_id": source["id"], "source_snapshot_sha256": source["sha256"],
            "environment_id": environment["id"], "environment_revision": environment["revision"],
            "config_sha256": profile["revision"],
            "provider_environment_id": profile["config"]["environment_id"],
            "urls": sorted(urls, key=lambda r: r["agency_id"]),
            "invariant_fields": ["export_sha256", "backup_sha256", "route_count"],
            "observation_rule": "Every selected ID present; actual HTTP status is 2xx.",
        }
        expected_rows = []
        mapping = {r["agency_id"]: r["canonical_url"] for r in value["urls"]}
        for agency in cohort:
            expected_rows.append(dict(originals[agency], canonical_url=mapping[agency]))
        return {"expectation": value, "preview_sha256": digest(packed(value)),
                "original_rows": [originals[k] for k in cohort], "expected_rows": expected_rows}

    def _target_expectations_context(self, payload):
        from govhub import GovHubError
        with self.connect(snapshot=True) as db:
            plan = self._plan(db, payload.get("plan_id"))
            purpose = payload.get("purpose", "REHEARSAL")
            if purpose not in {"REHEARSAL", "CUTOVER", "ROLLBACK"}:
                raise GovHubError("EXPECTATION_PURPOSE", "Choose rehearsal, cutover or rollback.")
            source = self._get(db, "snapshot", plan["candidate_id"] if purpose == "CUTOVER" else plan["baseline_id"])
            result = {"plan": plan, "source": source, "purpose": purpose}
            if payload.get("environment_id"):
                target = self._record_db(db, "environments", payload["environment_id"])
                result.update(environment=target, profile=self._config(db, target["id"]))
            return result

    def _target_expectations_preview(self, payload):
        with self.connect(snapshot=True) as db:
            return self._target_expectation_input(db, payload)

    def _target_expectations_save(self, payload, actor):
        from govhub import GovHubError
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            preview = self._target_expectation_input(db, payload)
            if payload.get("preview_sha256") != preview["preview_sha256"]:
                raise GovHubError("EXPECTATION_PREVIEW_CHANGED", "Review the current complete source-to-target URL map before saving.", 409)
            value = self._object(db, "target_expectation", preview["expectation"], parent=preview["expectation"]["plan_id"], actor=actor["name"])
            self._changed(db, actor, "Target expectation edition retained", "target_expectation", value["id"])
            result = {"expectation": value}
            self._remember(db, key, fingerprint, result, actor)
            return result

    def _target_expectation_latest_review(self, db, expectation_id):
        reviews = self._objects(db, "target_expectation_review", expectation_id)
        return reviews[-1] if reviews else None

    def _target_expectation_current(self, db, value):
        from govhub import GovHubError
        plan = self._plan(db, value["plan_id"])
        environment = self._record_db(db, "environments", value["environment_id"])
        profile = self._config(db, value["environment_id"])
        source = self._get(db, "snapshot", value["source_snapshot_id"])
        self._verify_snapshot(db, source)
        if (plan["revision"] != value["plan_revision"] or environment["archived"]
                or environment["revision"] != value["environment_revision"]
                or profile["revision"] != value["config_sha256"]
                or source["sha256"] != value["source_snapshot_sha256"]):
            raise GovHubError("EXPECTATION_BINDING_CHANGED", "The plan, source or target changed. Prepare and review a new expectation edition.", 409)
        return value

    def _target_expectations_review(self, payload, actor):
        from govhub import GovHubError, text
        self._authorize(actor, "reviewer")
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            value = self._get(db, "target_expectation", payload.get("expectation_id"))
            if payload.get("expectation_sha256") != value["sha256"]:
                raise GovHubError("EXPECTATION_CHANGED", "Review the exact retained target expectation.", 409)
            previous = self._target_expectation_latest_review(db, value["id"])
            if (previous["id"] if previous else None) != (payload.get("previous_review_id") or None):
                raise GovHubError("EXPECTATION_REVIEW_CHANGED", "Another decision was retained; review it before appending a successor.", 409)
            decision = payload.get("decision")
            if decision not in {"APPROVE", "RETURN"}:
                raise GovHubError("REVIEW_DECISION", "Choose APPROVE or RETURN.")
            if decision == "APPROVE":
                self._target_expectation_current(db, value)
            review = self._object(db, "target_expectation_review", {
                "expectation_id": value["id"], "expectation_sha256": value["sha256"],
                "previous_review_id": previous["id"] if previous else None,
                "decision": decision, "reason": text(payload.get("reason", ""), 12000, True)
            }, parent=value["id"], actor=actor["name"])
            self._changed(db, actor, "Target expectation reviewed", "target_expectation_review", review["id"], {"decision": decision})
            result = {"review": review}
            self._remember(db, key, fingerprint, result, actor)
            return result

    def _target_expectations_get(self, payload):
        from govhub import GovHubError
        with self.connect(snapshot=True) as db:
            values = ([self._get(db, "target_expectation", payload["expectation_id"])]
                      if payload.get("expectation_id") else self._objects(db, "target_expectation", payload.get("plan_id")))
            result = []
            for value in values:
                current, reason = True, ""
                try:
                    self._target_expectation_current(db, value)
                except GovHubError as exc:
                    current, reason = False, str(exc)
                result.append({"expectation": value, "current": current, "current_reason": reason,
                               "reviews": self._objects(db, "target_expectation_review", value["id"]),
                               "latest_review": self._target_expectation_latest_review(db, value["id"])})
            return {"expectations": result}

    def _target_expectation_pin(self, db, payload, plan, source, target, profile, purpose):
        from govhub import GovHubError
        expectation_id = payload.get("target_expectation_id")
        if not expectation_id:
            if payload.get("target_expectation_review_id"):
                raise GovHubError("EXPECTATION_REQUIRED", "Select the expectation belonging to this review.")
            return {}
        value = self._get(db, "target_expectation", expectation_id)
        self._target_expectation_current(db, value)
        review = self._target_expectation_latest_review(db, value["id"])
        if not review or review["decision"] != "APPROVE" or review["id"] != payload.get("target_expectation_review_id"):
            raise GovHubError("EXPECTATION_APPROVAL", "Select the current explicit reviewer approval for this target expectation.", 409)
        actual = [plan["id"], plan["revision"], source["id"], source["sha256"], target["id"], target["revision"], profile["revision"], purpose]
        bound = [value[k] for k in ("plan_id", "plan_revision", "source_snapshot_id", "source_snapshot_sha256", "environment_id", "environment_revision", "config_sha256", "purpose")]
        if actual != bound:
            raise GovHubError("EXPECTATION_BINDING", "This expectation belongs to another source, purpose or target.", 409)
        return {"target_expectation": value, "target_expectation_review": review}

    def _target_expectation_validate_pin(self, db, operation, authority=False):
        from govhub import GovHubError
        value = operation.get("target_expectation")
        if not value:
            return
        retained = self._get(db, "target_expectation", value["id"])
        review = operation.get("target_expectation_review") or {}
        retained_review = self._get(db, "target_expectation_review", review.get("id"))
        if retained != value or retained_review != review or review.get("decision") != "APPROVE" or review.get("expectation_sha256") != value["sha256"]:
            raise GovHubError("EXPECTATION_PIN_CHANGED", "The operation's original reviewed expectation binding changed.", 409)
        actual = [operation[k] for k in ("plan_id", "plan_revision", "source_snapshot_id", "source_snapshot_sha256", "environment_id", "type")]
        expected = [value[k] for k in ("plan_id", "plan_revision", "source_snapshot_id", "source_snapshot_sha256", "environment_id", "purpose")]
        if actual != expected or operation["profile"]["revision"] != value["config_sha256"] or operation["environment"]["revision"] != value["environment_revision"]:
            raise GovHubError("EXPECTATION_PIN_CHANGED", "The pinned source or target differs from the reviewed expectation.", 409)
        if authority:
            latest = self._target_expectation_latest_review(db, value["id"])
            if not latest or latest["decision"] != "APPROVE":
                raise GovHubError("EXPECTATION_RETURNED", "The expectation was returned for work. Retain the original operation and review the correct next action before continuing native execution.", 409)

    @staticmethod
    def _target_expectation_capture_fields(operation):
        value = operation.get("target_expectation")
        if not value:
            return {}
        review = operation["target_expectation_review"]
        return {"target_expectation_id": value["id"], "target_expectation_sha256": value["sha256"],
                "target_expectation_review_id": review["id"], "target_expectation_review_sha256": review["sha256"]}

    def _target_expectation_compare(self, operation, before, after, cohort):
        from govhub import GovHubError
        value = operation["target_expectation"]
        mapping = {r["agency_id"]: r for r in value["urls"]}
        if not set(cohort) <= set(mapping):
            raise GovHubError("EXPECTATION_COHORT", "The operation includes an ID outside its reviewed map.", 409)
        expected = {}
        rows = []
        fields = ("canonical_url", "export_sha256", "backup_sha256", "route_count", "observed_http_status")
        for agency in sorted(cohort):
            original, actual = before.get(agency), after.get(agency)
            if original:
                if original["canonical_url"] != mapping[agency]["source_canonical_url"]:
                    raise GovHubError("EXPECTATION_SOURCE_CHANGED", "The original source URL no longer matches its reviewed map.", 409)
                expected[agency] = dict(original, canonical_url=mapping[agency]["canonical_url"])
            for field in fields:
                want = expected.get(agency, {}).get(field)
                observed = actual.get(field) if actual else None
                rule = "actual HTTP 2xx" if field == "observed_http_status" else "reviewed target URL" if field == "canonical_url" else "original source invariant"
                matches = bool(original and actual) and (200 <= observed <= 299 if field == "observed_http_status" else observed == want)
                rows.append({"agency_id": agency, "field": field, "source": original.get(field) if original else None,
                             "expected": "HTTP 2xx" if field == "observed_http_status" else want,
                             "actual": observed, "rule": rule, "result": "PASS" if matches else "FAIL",
                             "reason": mapping[agency]["reason"] if field == "canonical_url" else ""})
        return {"format": "govhub-target-reconciliation/1",
                "expectation": value, "review": operation["target_expectation_review"],
                "original_source_summary": self.auditor.audit(before, after, {}, len(cohort)),
                "expected_target_summary": self.auditor.audit(expected, after, {}, len(cohort)),
                "rows": rows, "expected_rows": [expected[k] for k in sorted(expected)]}
