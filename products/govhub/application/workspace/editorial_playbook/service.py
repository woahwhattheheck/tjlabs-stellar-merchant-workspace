"""Editorial operating records using GovHub's original storage and native operations."""
from copy import deepcopy
import json
from urllib.parse import urljoin, urlsplit

from govhub import GovHubError, SOURCE, digest, now, packed
from . import model
from .delivery import PlaybookDeliveryMixin


class PlaybookMixin(PlaybookDeliveryMixin):
    def _playbook_inventory(self, db, file_id):
        file = self._file_row(db, file_id)
        original = self._verify_file(file).read_bytes()
        from govhub import json_bytes
        return model.inventory(json_bytes(original)), {k: file[k] for k in ("id", "filename", "bytes", "sha256")}

    def _playbook_current(self, db, entity_id):
        pointer = self._setting(db, "playbook:" + model.identity(entity_id))
        if not pointer:
            raise GovHubError("PLAYBOOK_NOT_FOUND", "The selected editorial playbook does not exist.", 404)
        return self._get(db, "playbook_definition", pointer["version_id"])

    def _playbook_summary(self, db):
        values = []
        for row in db.execute("SELECT key,value FROM govhub_settings WHERE key LIKE 'playbook:%' ORDER BY key"):
            version = self._get(db, "playbook_definition", json.loads(row["value"])["version_id"])
            reviews = self._objects(db, "playbook_review", version["id"])
            receiving = self._objects(db, "playbook_receiving", version["id"])
            definition = version["definition"]
            values.append({"id": version["entity_id"], "version_id": version["id"], "revision": version["revision"],
                           "label": definition["label"], "owner": definition["owner"],
                           "environment_id": definition["environment_id"],
                           "content_types": len(definition["content_types"]), "tasks": len(definition["tasks"]),
                           "review": reviews[-1] if reviews else None,
                           "receiving": [{k: r[k] for k in ("id", "role", "created_at", "summary")} for r in receiving]})
        return {"playbooks": values}

    def _playbook_get(self, payload):
        with self.connect(snapshot=True) as db:
            version = (self._get(db, "playbook_definition", payload["version_id"]) if payload.get("version_id")
                       else self._playbook_current(db, payload.get("playbook_id")))
            inventory, file = self._playbook_inventory(db, version["inventory"]["id"])
            return {"playbook": version, "inventory": inventory, "file": file,
                    "versions": self._objects(db, "playbook_definition", version["entity_id"]),
                    "reviews": self._objects(db, "playbook_review", version["id"]),
                    "receiving": self._objects(db, "playbook_receiving", version["id"])}

    def _playbook_prepare(self, payload):
        with self.connect(snapshot=True) as db:
            native, file = self._playbook_inventory(db, payload.get("inventory_file_id"))
            env = self._record_db(db, "environments", payload.get("environment_id"))
            if env["id"] != native["source"]["environment_ref"]:
                model.fail("PLAYBOOK_TARGET", "Select the inventory's original environment reference.", 409)
            if payload.get("version_id"):
                previous = self._get(db, "playbook_definition", payload["version_id"])
                current = self._playbook_current(db, previous["entity_id"])
                if (current["id"] != previous["id"]
                        or previous["definition"]["environment_id"] != env["id"]):
                    model.fail("PLAYBOOK_REVISION", "Prepare from the current playbook on its original environment.", 409)
                before, _ = self._playbook_inventory(db, previous["inventory"]["id"])
                value, changes = model.revise_definition(previous["definition"], before, native)
                return {"definition": value, "inventory": native, "file": file, "entity_id": previous["entity_id"],
                        "revision": previous["revision"], "previous_version_id": previous["id"],
                        "preparation_changes": changes, "structure_changes": model.compare(previous["definition"], before, native)}
        value = model.suggested_definition(native, model.text(payload.get("label"), "Playbook name"),
                                           model.text(payload.get("owner"), "Publishing owner"), env["id"])
        return {"definition": value, "inventory": native, "file": file}

    def _playbook_bind(self, db, definition, native):
        environment = self._record_db(db, "environments", definition["environment_id"])
        profile = self._config(db, environment["id"])
        bindings = {"environment": environment, "profile_revision": profile["revision"],
                    "cohorts": [], "content_mappings": [], "visitor_sets": []}
        for plan_id in definition["cohort_plan_ids"]:
            plan = self._plan(db, plan_id)
            bindings["cohorts"].append({"id": plan["id"], "revision": plan["revision"],
                                        "baseline_id": plan["baseline_id"], "candidate_id": plan["candidate_id"]})
        for mapping_id in definition["content_mapping_ids"]:
            mapping = self._get(db, "content_mapping", mapping_id)
            family = self._content_family(db, mapping["family_id"])
            if family["environment_id"] != environment["id"]:
                model.fail("PLAYBOOK_CONTENT_TARGET", "Choose content mappings for the selected native environment.", 409)
            bindings["content_mappings"].append({"id": mapping["id"], "sha256": mapping["sha256"],
                                                 "family_id": family["id"], "family_revision": family["revision"]})
        for set_id in sorted({t["visitor_set_version_id"] for t in definition["tasks"] if t["visitor_set_version_id"]}):
            selected = self._get(db, "visitor_set", set_id)
            journeys = {j["id"]: j for j in selected["value"]["journeys"]}
            for task in definition["tasks"]:
                if task["visitor_set_version_id"] != set_id:
                    continue
                issue = model.task_journey_issue(task, native, journeys.get(task["journey_id"]))
                if issue:
                    model.fail("PLAYBOOK_VISITOR_TASK", issue, 409)
            bindings["visitor_sets"].append(selected)
        return bindings

    def _playbook_save(self, payload, actor):
        entity_id = model.identity(payload.get("playbook_id"), "Playbook identifier")
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            native, file = self._playbook_inventory(db, payload.get("inventory_file_id"))
            definition = model.definition(payload.get("definition"), native)
            pointer = self._setting(db, "playbook:" + entity_id)
            revision = pointer["revision"] if pointer else 0
            if type(payload.get("expected_revision")) is not int or payload["expected_revision"] != revision:
                model.fail("PLAYBOOK_REVISION", "Open the current playbook revision before saving changes.", 409)
            relink = []
            if pointer:
                previous = self._get(db, "playbook_definition", pointer["version_id"])
                previous_native, _ = self._playbook_inventory(db, previous["inventory"]["id"])
                previous_tasks = {task["id"]: task for task in previous["definition"]["tasks"]}
                for task in definition["tasks"]:
                    before = previous_tasks.get(task["id"])
                    if not before or not task["visitor_set_version_id"]:
                        continue
                    if any(before[key] != task[key] for key in ("visitor_set_version_id", "journey_id")):
                        continue
                    old_intent, new_intent = model.task_intent(before, previous_native), model.task_intent(task, native)
                    changed = sorted(key for key in old_intent if old_intent[key] != new_intent[key])
                    if changed:
                        relink.append({"task_id": task["id"], "previous_set_version_id": task["visitor_set_version_id"],
                                       "previous_journey_id": task["journey_id"], "changed_fields": changed})
                        task["visitor_set_version_id"], task["journey_id"] = "", ""
            bindings = self._playbook_bind(db, definition, native)
            version = self._object(db, "playbook_definition",
                                   {"entity_id": entity_id, "revision": revision + 1, "definition": definition,
                                    "inventory": file, "bindings": bindings, "visitor_relink": relink,
                                    "previous_version_id": pointer["version_id"] if pointer else "",
                                    "change_note": model.text(payload.get("change_note"), "Change note")},
                                   parent=entity_id, actor=actor["name"])
            self._set(db, "playbook:" + entity_id, {"revision": version["revision"], "version_id": version["id"]})
            result = {"playbook": version}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Editorial playbook saved", "playbook_definition", version["id"])
            return result

    def _playbook_review(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            version = self._get(db, "playbook_definition", payload.get("version_id"))
            if version["sha256"] != payload.get("version_sha256"):
                model.fail("PLAYBOOK_REVIEW_VERSION", "Review the exact displayed playbook edition.", 409)
            previous = self._objects(db, "playbook_review", version["id"])
            if type(payload.get("expected_revision")) is not int or payload["expected_revision"] != len(previous):
                model.fail("PLAYBOOK_REVIEW_REVISION", "Open the latest editorial decision before saving.", 409)
            if payload.get("decision") not in ("ACCEPT", "RETURN"):
                model.fail("PLAYBOOK_REVIEW", "Choose ACCEPT or RETURN for the publishing playbook.")
            review = self._object(db, "playbook_review",
                                  {"version_id": version["id"], "version_sha256": version["sha256"],
                                   "revision": len(previous) + 1, "decision": payload["decision"],
                                   "reason": model.text(payload.get("reason"), "Editorial review reason")},
                                  parent=version["id"], actor=actor["name"])
            result = {"review": review}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Editorial playbook reviewed", "playbook_review", review["id"])
            return result

    def _playbook_link_visitors(self, payload, actor):
        """Create or revise the original visitor records, then bind their exact version."""
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            intents = self._objects(db, "playbook_link_intent", key)
            if intents:
                intent = intents[0]
                if intent["fingerprint"] != fingerprint:
                    model.fail("RETRY_CHANGED", "Continue this original visitor-link request unchanged.", 409)
            else:
                version = self._get(db, "playbook_definition", payload.get("version_id"))
                current = self._playbook_current(db, version["entity_id"])
                if current["id"] != version["id"]:
                    model.fail("PLAYBOOK_REVISION", "Open the current playbook before linking its visitor tasks.", 409)
                native, _ = self._playbook_inventory(db, version["inventory"]["id"])
                if not version["definition"]["tasks"]:
                    model.fail("PLAYBOOK_TASK", "Add the named visitor tasks before creating their operating set.")
                entity_id = "editorial-" + digest(version["entity_id"])[:24]
                p = self._setting(db, "visitor.project:" + entity_id)
                base = native["source"]["base_url"]
                origin = urlsplit(base)
                project = {"label": version["definition"]["label"], "base_url": base,
                           "allowed_origins": [origin.scheme + "://" + origin.netloc],
                           "source_reference": version["definition"]["source_reference"]}
                entities = {e["uuid"]: e for e in native["entities"]}
                journeys = []
                for task in version["definition"]["tasks"]:
                    expected = {"status": [200]}
                    if task["entity_uuid"]:
                        expected["heading"] = entities[task["entity_uuid"]]["label"]
                    journeys.append({"id": task["id"], "name": task["name"], "goal": task["goal"],
                                     "audience": task["audience"], "steps": [{"id": "open",
                                     "url": urljoin(base, task["route"]), "label": task["name"],
                                     "expect": expected, "note": task["notes"]}]})
                sets = []
                for offset in range(0, len(journeys), 150):
                    set_id = entity_id + "-" + str(offset // 150 + 1).zfill(3)
                    previous_set = self._setting(db, "visitor.set:" + set_id)
                    sets.append({"entity_id": set_id, "expected_revision": previous_set["revision"] if previous_set else 0,
                                 "value": {"label": version["definition"]["label"] + " / " + str(offset // 150 + 1),
                                           "journeys": journeys[offset:offset + 150],
                                           "source_reference": version["definition"]["source_reference"]}})
                intent = self._object(db, "playbook_link_intent",
                    {"fingerprint": fingerprint, "version": version, "entity_id": entity_id,
                     "project_revision": p["revision"] if p else 0, "project": project, "sets": sets},
                    parent=key, actor=actor["name"])
        # Each original operation records its own request before the next step.
        # Reopening this intent therefore recovers the same records after interruption.
        project = self.dispatch("visitor.projects.save",
                                {"entity_id": intent["entity_id"], "expected_revision": intent["project_revision"],
                                 "value": intent["project"], "request_key": key + ":project",
                                 "change_note": "Publishing playbook visitor source"}, actor)
        selected_sets, task_bindings = [], {}
        for index, selection in enumerate(intent["sets"]):
            selected = self.dispatch("visitor.sets.save",
                                     {**selection, "project_id": intent["entity_id"],
                                      "request_key": key + ":set:" + str(index),
                                      "change_note": "Publishing playbook visitor tasks"}, actor)
            selected_sets.append(selected["set"])
            task_bindings.update({j["id"]: selected["set"]["id"] for j in selected["set"]["value"]["journeys"]})
        version = intent["version"]
        definition = deepcopy(version["definition"])
        for task in definition["tasks"]:
            task["visitor_set_version_id"] = task_bindings[task["id"]]
            task["journey_id"] = task["id"]
        saved = self._playbook_save({"playbook_action": "definitions.save", "playbook_id": version["entity_id"],
                                    "inventory_file_id": version["inventory"]["id"], "definition": definition,
                                    "expected_revision": version["revision"], "request_key": key + ":definition",
                                    "change_note": "Bound original visitor project and task-set edition"}, actor)
        result = {"project": project["project"], "sets": selected_sets, "playbook": saved["playbook"]}
        with self.connect(write=True) as db:
            request, request_fingerprint, existing = self._request(db, payload, actor)
            if existing:
                return existing
            self._remember(db, request, request_fingerprint, result, actor)
            self._changed(db, actor, "Editorial visitor tasks linked", "playbook_definition", saved["playbook"]["id"])
        return result

    def _playbook_receiving(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            version = self._get(db, "playbook_definition", payload.get("version_id"))
            definition = version["definition"]
            original, _ = self._playbook_inventory(db, version["inventory"]["id"])
            received, file = self._playbook_inventory(db, payload.get("inventory_file_id"))
            if received["source"]["environment_ref"] != definition["environment_id"]:
                model.fail("PLAYBOOK_RECEIVING_TARGET", "Select the received inventory for the original environment.", 409)
            role = payload.get("role")
            if role not in ("BASELINE", "CANDIDATE", "RESTORED"):
                model.fail("PLAYBOOK_RECEIVING_ROLE", "Choose BASELINE, CANDIDATE or RESTORED.")
            previous = self._objects(db, "playbook_receiving", version["id"])
            if type(payload.get("expected_revision")) is not int or payload["expected_revision"] != len(previous):
                model.fail("PLAYBOOK_RECEIVING_REVISION", "Reopen the current receiving history before saving.", 409)
            continued_from = model.text(payload.get("continued_from", ""), "Previous receiving observation", False)
            if continued_from:
                earlier = self._get(db, "playbook_receiving", continued_from)
                if (earlier["version_id"] != version["id"] or earlier["inventory"]["id"] != file["id"]
                        or earlier["role"] != role):
                    model.fail("PLAYBOOK_RECEIVING_CONTINUATION",
                               "Continue the same edition, inventory and receiving role, or start a new observation.", 409)
            operations = []
            for operation_id in model.ids(payload.get("operation_ids", []), "Native operations"):
                operation = self._operation(db, operation_id)
                if operation["environment_id"] != definition["environment_id"]:
                    model.fail("PLAYBOOK_RECEIVING_TARGET", "Select native operations on the playbook's environment.", 409)
                if operation.get("plan_id") and definition["cohort_plan_ids"] and operation["plan_id"] not in definition["cohort_plan_ids"]:
                    model.fail("PLAYBOOK_RECEIVING_COHORT", "The native operation belongs to a different selected cohort.", 409)
                cohort = next((p for p in version["bindings"]["cohorts"] if p["id"] == operation.get("plan_id")), None)
                if cohort and operation.get("plan_revision") != cohort["revision"]:
                    model.fail("PLAYBOOK_RECEIVING_COHORT", "Use the native operation for this retained cohort edition, or save the revised playbook.", 409)
                if operation.get("content_plan_id") and definition["content_mapping_ids"]:
                    native_plan = self._get(db, "content_plan", operation["content_plan_id"])
                    if native_plan["mapping_id"] not in definition["content_mapping_ids"]:
                        model.fail("PLAYBOOK_RECEIVING_MAPPING", "Select the native operation for an original mapped content edition.", 409)
                operations.append({k: operation.get(k) for k in (
                    "id", "revision", "type", "state", "environment_id", "plan_id", "plan_revision",
                    "content_plan_id", "profile", "actual_started_at", "actual_finished_at", "native_capture_file_id")})
            editor_input = model.indexed(payload.get("editor_decisions", []), "bundle", "Editor receiving decisions")
            bundle_ids = {b["bundle"] for b in definition["content_types"]}
            if set(editor_input) - bundle_ids:
                model.fail("PLAYBOOK_EDITOR", "Record editor receiving against the selected content types.")
            editors, extra_files = [], set()
            for bundle in definition["content_types"]:
                item = editor_input.get(bundle["bundle"])
                if item is None:
                    editors.append({"bundle": bundle["bundle"], "owner": bundle["owner"], "decision": "PENDING",
                                    "reason": "", "files": []})
                    continue
                if item.get("decision") not in ("ACCEPT", "RETURN", "PENDING"):
                    model.fail("PLAYBOOK_EDITOR", "Use ACCEPT, RETURN or PENDING for an editor receiving outcome.")
                files = []
                for file_id in model.ids(item.get("file_ids", []), "Editor receiving files"):
                    metadata = self._file_row(db, file_id)
                    self._verify_file(metadata)
                    files.append({k: metadata[k] for k in ("id", "filename", "sha256", "bytes")})
                    extra_files.add(file_id)
                editors.append({"bundle": bundle["bundle"], "owner": bundle["owner"], "decision": item["decision"],
                                "reason": model.text(item.get("reason", ""), "Editor receiving reason", item["decision"] != "PENDING"),
                                "files": files})
            editions = [self._get(db, "visitor_edition", e) for e in
                        model.ids(payload.get("visitor_edition_ids", []), "Visitor editions")]
            tasks = []
            for task in definition["tasks"]:
                matches = [e for e in editions if e["definition"]["id"] == task["visitor_set_version_id"]]
                if len(matches) > 1:
                    model.fail("PLAYBOOK_VISITOR_EDITION", "Choose one observed edition per original visitor set for this receiving.")
                outcome = {"task_id": task["id"], "name": task["name"], "status": "PENDING",
                           "edition_id": "", "journey_id": task["journey_id"], "result": None, "review": None}
                if matches:
                    selected = matches[0]
                    if digest(packed(selected["result"])) != selected["result_sha256"]:
                        model.fail("PLAYBOOK_VISITOR_SOURCE", "The retained visitor result identity changed.", 409)
                    journey = next((j for j in selected["result"]["journeys"] if j["id"] == task["journey_id"]), None)
                    if journey is None:
                        model.fail("PLAYBOOK_VISITOR_SOURCE", "The captured edition does not contain the selected task.", 409)
                    reviews = self._objects(db, "visitor_review", selected["id"])
                    review = reviews[-1] if reviews else None
                    accepted = bool(review and review["decision"] == "ACCEPT" and
                                    (journey["status"] == "PASS" or any(x["journey_id"] == task["journey_id"]
                                     for x in review.get("exceptions", []))))
                    binding = model.receiving_task_binding(task, original, received, selected)
                    returned = bool(review and review["decision"] == "RETURN")
                    complete = selected["capture_status"] == "COMPLETE" and binding["matched"] and not returned
                    outcome.update(edition_id=selected["id"], result=journey, review=review, binding=binding,
                                   status="ACCEPT" if complete and accepted else
                                   "PASS" if complete and journey["status"] == "PASS" else "RETURN")
                tasks.append(outcome)
            changes = model.compare(definition, original, received)
            accept_changes = payload.get("accept_changes", False)
            if type(accept_changes) is not bool:
                model.fail("PLAYBOOK_CHANGES", "Record whether the observed structural changes are accepted.")
            change_reason = model.text(payload.get("change_reason", ""), "Structural change decision", bool(changes and accept_changes))
            native_complete = bool(operations) and all(o["state"] == "COMPLETE" and o["actual_finished_at"] for o in operations)
            editors_complete = all(e["decision"] == "ACCEPT" for e in editors)
            tasks_complete = bool(tasks) and all(t["status"] in ("PASS", "ACCEPT") for t in tasks)
            editorial_reviews = self._objects(db, "playbook_review", version["id"])
            editorial_review = editorial_reviews[-1] if editorial_reviews else None
            playbook_accepted = bool(editorial_review and editorial_review["decision"] == "ACCEPT")
            summary = {"playbook_accepted": playbook_accepted, "native_complete": native_complete, "editor_accepted": sum(e["decision"] == "ACCEPT" for e in editors),
                       "editor_total": len(editors), "visitor_accepted": sum(t["status"] in ("PASS", "ACCEPT") for t in tasks),
                       "visitor_total": len(tasks), "structural_changes": len(changes),
                       "changes_accepted": accept_changes,
                       "state": "COMPLETE" if playbook_accepted and native_complete and editors_complete and tasks_complete and
                                (not changes or accept_changes) else "IN_PROGRESS"}
            record = self._object(db, "playbook_receiving",
                {"version_id": version["id"], "version_sha256": version["sha256"], "revision": len(previous) + 1,
                 "role": role, "inventory": file, "observed_source": received["source"], "operations": operations,
                 "continued_from": continued_from,
                 "editorial_review": editorial_review,
                 "editors": editors, "visitor_tasks": tasks, "visitor_edition_ids": [e["id"] for e in editions],
                 "changes": changes, "accept_changes": accept_changes, "change_reason": change_reason,
                 "source_file_ids": sorted(extra_files), "summary": summary,
                 "reason": model.text(payload.get("reason"), "Receiving note")},
                parent=version["id"], actor=actor["name"])
            result = {"receiving": record}
            self._remember(db, key, fingerprint, result, actor)
            self._changed(db, actor, "Editorial and visitor receiving retained", "playbook_receiving", record["id"], summary)
            return result

    def _playbook_compare(self, payload):
        with self.connect(snapshot=True) as db:
            version = self._get(db, "playbook_definition", payload.get("version_id"))
            before, original = self._playbook_inventory(db, version["inventory"]["id"])
            after, received = self._playbook_inventory(db, payload.get("inventory_file_id"))
            if after["source"]["environment_ref"] != version["definition"]["environment_id"]:
                model.fail("PLAYBOOK_RECEIVING_TARGET", "Select the inventory for the original environment.", 409)
            return {"changes": model.compare(version["definition"], before, after),
                    "original": original, "received": received,
                    "original_source": before["source"], "received_source": after["source"]}

    def _playbook_dispatch(self, action, payload, actor):
        payload = deepcopy(payload)
        payload["playbook_action"] = action
        if action == "snapshot":
            with self.connect(snapshot=True) as db:
                return self._playbook_summary(db)
        handlers = {"inventories.compare": lambda: self._playbook_compare(payload),
                    "definitions.prepare": lambda: self._playbook_prepare(payload),
                    "definitions.save": lambda: self._playbook_save(payload, actor),
                    "definitions.get": lambda: self._playbook_get(payload),
                    "reviews.save": lambda: self._playbook_review(payload, actor),
                    "visitors.link": lambda: self._playbook_link_visitors(payload, actor),
                    "receiving.save": lambda: self._playbook_receiving(payload, actor)}
        if action == "exports.create":
            payload.pop("playbook_action", None)
            return self._exports_create(payload, actor)
        if action not in handlers:
            model.fail("PLAYBOOK_ACTION", "This editorial playbook operation does not exist.", 404)
        return handlers[action]()
