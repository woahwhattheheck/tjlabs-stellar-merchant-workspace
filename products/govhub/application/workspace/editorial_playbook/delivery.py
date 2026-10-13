"""Complete editorial definitions and receiving inside the original GovHub handover."""
import html
import json

from govhub import SOURCE, csv_bytes, now, packed
from . import model


def report(data, complete=False):
    escape = lambda v: html.escape(str(v if v is not None else ""), quote=True)
    blocks = ["<section><h2>Publishing playbooks</h2>"]
    for item in data.get("playbooks", []):
        version = item["definition"]
        definition = version["definition"]
        blocks.append("<h3>" + escape(definition["label"]) + "</h3><p>" + escape(definition["notes"]) +
                      "</p><p>Publishing owner: " + escape(definition["owner"]) +
                      " · Edition " + escape(version["revision"]) + "</p>")
        blocks.append("<table><thead><tr><th>Content type / owner</th><th>Native editor roles</th>"
                      "<th>Field instructions</th></tr></thead><tbody>")
        for bundle in definition["content_types"]:
            instructions = "".join("<p><strong>" + escape(f["name"]) + "</strong>: " + escape(f["instruction"]) +
                                   ("<br>Source: " + escape(f["source_reference"]) if f["source_reference"] else "") +
                                   ("<br>" + escape(f["notes"]) if f["notes"] else "") + "</p>" for f in bundle["fields"])
            blocks.append("<tr><td>" + escape(bundle["bundle"]) + "<br>" + escape(bundle["owner"]) +
                          "</td><td>" + escape(", ".join(bundle["editor_role_ids"])) + "</td><td>" + instructions + "</td></tr>")
        blocks.append("</tbody></table><h4>Visitor tasks</h4><table><thead><tr><th>Task and audience</th>"
                      "<th>Goal / route</th><th>Responsible editor</th></tr></thead><tbody>")
        for task in definition["tasks"]:
            blocks.append("<tr><td>" + escape(task["name"]) + "<br>" + escape(task["audience"]) +
                          "</td><td>" + escape(task["goal"]) + "<br>" + escape(task["route"]) +
                          "</td><td>" + escape(task["owner"]) + "</td></tr>")
        blocks.append("</tbody></table>")
        for review in item["reviews"]:
            blocks.append("<p><strong>Editorial review: " + escape(review["decision"]) + "</strong> · " +
                          escape(review["author"]) + " · " + escape(review["created_at"]) + "<br>" +
                          escape(review["reason"]) + "</p>")
        for receiving in item["receiving"]:
            summary = receiving["summary"]
            blocks.append("<h4>" + escape(receiving["role"]) + " receiving for edition " + escape(receiving["version_id"]) + " · " + escape(summary["state"]) +
                          "</h4><p>" + escape(receiving["reason"]) + "</p><p>Editors: " +
                          escape(summary["editor_accepted"]) + "/" + escape(summary["editor_total"]) +
                          " · Visitor tasks: " + escape(summary["visitor_accepted"]) + "/" +
                          escape(summary["visitor_total"]) + " · Structural changes: " +
                          escape(summary["structural_changes"]) + "</p>")
            for editor in receiving["editors"]:
                blocks.append("<p><strong>" + escape(editor["bundle"]) + ": " + escape(editor["decision"]) +
                              "</strong> — " + escape(editor["reason"]) + "</p>")
            blocks.append("<table><thead><tr><th>Visitor task</th><th>Outcome</th><th>Receiving observation</th></tr></thead><tbody>")
            for task in receiving["visitor_tasks"]:
                binding = task.get("binding") or {}
                explanation = binding.get("message", "")
                if not explanation and (task.get("review") or {}).get("decision") == "RETURN":
                    explanation = "The original visitor review returns this edition."
                blocks.append("<tr><td>" + escape(task["name"]) + "</td><td>" + escape(task["status"]) +
                              "</td><td>" + escape(explanation) + "<br>" + escape(task.get("edition_id", "")) + "</td></tr>")
            blocks.append("</tbody></table>")
            if receiving["changes"]:
                blocks.append("<p>Structural change decision: " + escape(receiving["change_reason"]) + "</p>"
                              "<table><thead><tr><th>Selected item</th><th>Before</th><th>Received</th></tr></thead><tbody>")
                for change in receiving["changes"]:
                    blocks.append("<tr><td>" + escape(change["id"] + " / " + change["field"]) + "</td><td>" +
                                  escape(packed(change["before"])) + "</td><td>" + escape(packed(change["after"])) + "</td></tr>")
                blocks.append("</tbody></table>")
        blocks.append("<p>Original source: " + escape(definition["source_reference"]) + "</p>")
    if data.get("cohort_plans"):
        blocks.append("<h3>Original cohort editions</h3><p>These are the exact cohort versions named by the selected playbook history.</p>"
                      "<table><thead><tr><th>Cohort</th><th>Pinned version</th><th>Original baseline</th><th>Original candidate</th></tr></thead><tbody>")
        for cohort in data["cohort_plans"]:
            for edition in cohort["versions"]:
                blocks.append("<tr><td>" + escape(edition["name"]) + "<br>" + escape(cohort["id"]) + "</td><td>" +
                              escape(edition["id"]) + "</td><td>" + escape(edition["baseline_id"]) + "</td><td>" +
                              escape(edition["candidate_id"]) + "</td></tr>")
        blocks.append("</tbody></table><p>publishing-cohort-inventories.csv contains the selected original baseline and candidate rows for each pinned edition.</p>")
    blocks.append("</section>")
    body = "".join(blocks)
    if complete:
        body = ("<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
                "<title>Publishing playbook</title><style>body{font:15px/1.5 system-ui;color:#222;background:#fff;"
                "max-width:1160px;margin:32px auto;padding:0 20px}table{border-collapse:collapse;width:100%;margin:16px 0}"
                "td,th{border:1px solid #bbb;padding:9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}"
                "th{background:#eee}h2,h3{border-top:1px solid #999;padding-top:18px}@media print{body{font-size:10pt}}"
                "</style><main>" + body + "</main></html>")
    return body.encode("utf-8")


class PlaybookDeliveryMixin:
    def _handover_capture(self, db, payload, actor):
        selected = payload.get("playbook_version_ids", [])
        if not selected:
            return super()._handover_capture(db, payload, actor)
        if type(payload.get("include_sources")) is not bool:
            model.fail("PLAYBOOK_HANDOVER", "Choose whether to include the retained source bytes.")
        selected = model.ids(selected, "Playbook editions")
        versions = [self._get(db, "playbook_definition", v) for v in selected]
        families = set(payload.get("content_family_ids", []))
        # Explicit global cohort selections keep their original current-edition
        # behavior. A playbook's own cohorts are resolved by their pinned revisions.
        explicit_cohorts = payload.get("plan_ids", [])
        visitor_editions = set(payload.get("visitor_edition_ids", []))
        bundle, source_ids, operation_ids = [], set(), set()
        pinned, environment_ids, comparison_ids = {}, set(), set()
        for version in versions:
            history = [v for v in self._objects(db, "playbook_definition", version["entity_id"])
                       if v["revision"] <= version["revision"]]
            reviews = [r for v in history for r in self._objects(db, "playbook_review", v["id"])]
            receiving = [r for v in history for r in self._objects(db, "playbook_receiving", v["id"])]
            for earlier in history:
                environment_ids.add(earlier["bindings"]["environment"]["id"])
                families.update(v["family_id"] for v in earlier["bindings"]["content_mappings"])
                source_ids.add(earlier["inventory"]["id"])
                for bound in earlier["bindings"]["cohorts"]:
                    identity = (bound["id"], bound["revision"])
                    if identity in pinned:
                        continue
                    original = self._get(db, "plan_version", bound["revision"])
                    if (original["plan_id"] != bound["id"]
                            or any(original[key] != bound[key] for key in ("baseline_id", "candidate_id"))):
                        model.fail("PLAYBOOK_COHORT_SOURCE", "The original pinned cohort edition changed.", 409)
                    pinned[identity] = original
                    comparison_ids.update(original["agency_ids"])
            for received in receiving:
                visitor_editions.update(received["visitor_edition_ids"])
                source_ids.add(received["inventory"]["id"])
                source_ids.update(received["source_file_ids"])
                operation_ids.update(o["id"] for o in received["operations"])
            bundle.append({"definition": version, "versions": history, "reviews": reviews, "receiving": receiving})
        ordered_visitors = sorted(visitor_editions)
        joined = dict(payload, plan_ids=explicit_cohorts, content_family_ids=sorted(families),
                      visitor_edition_ids=ordered_visitors[:100])
        if explicit_cohorts or families or ordered_visitors or payload.get("pots_project_ids"):
            capture = super()._handover_capture(db, joined, actor)
        else:
            meta = self.meta(db)
            capture = {"format": "govhub-cutover-handover/1", "name": model.text(payload.get("name"), "Handover name"),
                       "observed_at": now(), "author": actor["name"], "workspace": meta["workspace"],
                       "workspace_head": meta["head"], "source": SOURCE, "settings": self._setting(db, "settings"),
                       "core_sources": self.core_sources, "auditor_sha256": self.auditor_sha256,
                       "include_sources": payload["include_sources"], "plan_ids": [], "plans": [], "snapshots": [],
                       "operations": [], "records": {"sites": [], "environments": [], "migration_issues": []},
                       "record_history": [], "sources": []}
        # The original visitor reader verifies at most 100 editions per call.
        # Preserve the complete historical population inside this same export intent.
        if len(ordered_visitors) > 100:
            from visitor_journeys.workspace import handover_capture
            for offset in range(100, len(ordered_visitors), 100):
                part = handover_capture(self, db, dict(joined, visitor_edition_ids=ordered_visitors[offset:offset + 100]), actor)
                for key, identity in (("operations", lambda x: x["operation"]["id"]), ("sources", lambda x: x["id"])):
                    values = {identity(item): item for item in capture[key]}
                    values.update({identity(item): item for item in part[key]})
                    capture[key] = [values[key] for key in sorted(values)]
                for key in ("editions", "reviews", "finding_history"):
                    values = {item["id"]: item for item in capture["visitor"][key]}
                    values.update({item["id"]: item for item in part["visitor"][key]})
                    capture["visitor"][key] = [values[key] for key in sorted(values)]
        if ordered_visitors:
            capture["visitor_edition_ids"] = ordered_visitors

        cohort_plans = []
        for plan_id in sorted({identity[0] for identity in pinned}):
            rows = [pinned[key] for key in sorted(pinned) if key[0] == plan_id]
            revisions = {row["id"] for row in rows}
            cohort_plans.append({"id": plan_id, "versions": rows,
                                 "approvals": self._objects(db, "approval", plan_id),
                                 "revocations": self._objects(db, "revocation", plan_id),
                                 "audits": [r for r in self._objects(db, "audit", plan_id) if r["plan_revision"] in revisions],
                                 "reviews": [r for r in self._objects(db, "review", plan_id) if r["plan_revision"] in revisions]})
        all_operations = {operation["id"]: operation for operation in
                          (json.loads(row[0]) for row in db.execute("SELECT data FROM govhub_operations ORDER BY rowid"))}
        operation_ids.update(operation["id"] for operation in all_operations.values()
                             if (operation.get("plan_id"), operation.get("plan_revision")) in pinned)
        included_operations = {item["operation"]["id"]: item for item in capture["operations"]}
        snapshots = {item["id"]: item for item in capture["snapshots"]}
        pending_snapshots = {row[key] for row in pinned.values() for key in ("baseline_id", "candidate_id")}
        pending_snapshots.update(snapshots)
        pending_operations = set(included_operations) | operation_ids
        seen_operations, seen_snapshots, inspected_files = set(), set(), set()
        source_ids.update(item["id"] for item in capture["sources"])
        while pending_operations or pending_snapshots or source_ids - inspected_files:
            for operation_id in sorted(pending_operations - seen_operations):
                operation = all_operations.get(operation_id) or self._operation(db, operation_id)
                files = self._output_list(db, "operation", operation_id)
                included_operations[operation_id] = {"operation": operation,
                    "events": self._objects(db, "operation_event", operation_id),
                    "observations": self._objects(db, "operation_observation", operation_id), "files": files}
                source_ids.update(item["file_id"] for item in files)
                environment_ids.add(operation["environment_id"])
                if operation["type"] != "VISITOR_CAPTURE":
                    pending_snapshots.update(operation[key] for key in ("source_snapshot_id", "result_snapshot_id")
                                             if operation.get(key))
                seen_operations.add(operation_id)
            pending_operations.clear()
            for snapshot_id in sorted(pending_snapshots - seen_snapshots):
                snapshot = snapshots.get(snapshot_id) or self._get(db, "snapshot", snapshot_id)
                snapshots[snapshot_id] = snapshot
                source_ids.add(snapshot["file_id"])
                for binding in snapshot["bindings"]:
                    entries = [binding[key] for key in ("export", "backup") if binding.get(key)]
                    entries.extend(dict(item["file"], native=item.get("native", {})) for item in binding.get("files", []))
                    for entry in entries:
                        source_ids.add(entry["id"])
                        native_id = entry.get("native", {}).get("capture_operation_id")
                        if native_id in all_operations and native_id not in seen_operations:
                            pending_operations.add(native_id)
                seen_snapshots.add(snapshot_id)
            pending_snapshots.clear()
            for file_id in sorted(source_ids - inspected_files):
                for row in db.execute("SELECT owner_id FROM govhub_output_files WHERE owner_kind='operation' AND file_id=?", (file_id,)):
                    original = all_operations.get(row[0])
                    if (original and original["type"] in {"CAPTURE", "BACKUP_CREATE", "BACKUP_DOWNLOAD"}
                            and original["id"] not in seen_operations):
                        pending_operations.add(original["id"])
                inspected_files.add(file_id)
        capture["operations"] = [included_operations[key] for key in sorted(included_operations)]
        capture["snapshots"] = [snapshots[key] for key in sorted(snapshots)]
        records = {(r["kind"], r["id"]) for rows in capture["records"].values() for r in rows}
        selected_sites = {r["id"] for r in capture["records"]["sites"]}
        all_records = [self._core.view_record(row) for row in db.execute("SELECT * FROM entities ORDER BY kind,id")]
        for record in all_records:
            if record["kind"] == "sites" and record["data"]["comparison_id"] in comparison_ids:
                selected_sites.add(record["id"])
                environment_ids.update(record["data"][key] for key in ("incumbent_environment_id", "candidate_environment_id")
                                       if record["data"].get(key))
        for record in all_records:
            wanted = (record["kind"] == "environments" and record["id"] in environment_ids
                      or record["kind"] == "sites" and record["id"] in selected_sites
                      or record["kind"] == "migration_issues" and
                      (record["data"]["plan_id"] in {key[0] for key in pinned}
                       or set(record["data"]["site_ids"]) & selected_sites))
            if wanted and (record["kind"], record["id"]) not in records:
                capture["records"][record["kind"]].append(record)
                records.add((record["kind"], record["id"]))
        revisions = {row["revision"] for row in capture["record_history"]}
        for row in db.execute("SELECT * FROM revisions ORDER BY rowid"):
            if (row["kind"], row["id"]) in records and row["revision"] not in revisions:
                retained = dict(row)
                retained["data"], retained["origin"] = json.loads(row["data"]), json.loads(row["origin"])
                capture["record_history"].append(retained)
                revisions.add(row["revision"])
        if capture["settings"].get("scope_file_id"):
            source_ids.add(capture["settings"]["scope_file_id"])
        capture["sources"] = [self._file_row(db, f) for f in sorted(source_ids)]
        capture["playbook_version_ids"] = selected
        capture["editorial_playbook"] = {"schema": "govhub.editorial-playbook.handover.v1",
                                        "playbooks": bundle, "cohort_plans": cohort_plans}
        return capture

    def _content_export_files(self, capture, write):
        super()._content_export_files(capture, write)
        data = capture.get("editorial_playbook")
        if not data:
            return
        write("publishing-playbooks.json", (packed(data) + "\n").encode("utf-8"))
        write("publishing-playbooks.html", report(data, complete=True))
        from govhub import MANIFEST_FIELDS
        snapshots = {item["id"]: item for item in capture["snapshots"]}
        inventory_rows = []
        for cohort in data.get("cohort_plans", []):
            for edition in cohort["versions"]:
                for role in ("baseline", "candidate"):
                    snapshot = snapshots[edition[role + "_id"]]
                    inventory_rows.extend(dict(row, plan_id=cohort["id"], plan_revision=edition["id"],
                                               inventory_role=role, snapshot_id=snapshot["id"])
                                          for row in snapshot["rows"] if row["agency_id"] in edition["agency_ids"])
        if data.get("cohort_plans"):
            write("publishing-cohort-inventories.csv", csv_bytes(inventory_rows,
                  ("plan_id", "plan_revision", "inventory_role", "snapshot_id") + tuple(MANIFEST_FIELDS)))
        fields, tasks, outcomes = [], [], []
        for item in data["playbooks"]:
            version = item["definition"]
            for content_type in version["definition"]["content_types"]:
                for field in content_type["fields"]:
                    fields.append({"playbook": version["entity_id"], "edition": version["revision"],
                                   "content_type": content_type["bundle"], "owner": content_type["owner"],
                                   "editor_roles": ", ".join(content_type["editor_role_ids"]), **field})
            tasks.extend({"playbook": version["entity_id"], "edition": version["revision"], **task}
                         for task in version["definition"]["tasks"])
            for receiving in item["receiving"]:
                outcomes.extend({"playbook": version["entity_id"], "receiving_id": receiving["id"],
                                 "role": receiving["role"], "bundle": editor["bundle"], "owner": editor["owner"],
                                 "decision": editor["decision"], "reason": editor["reason"],
                                 "original_files": packed(editor["files"])} for editor in receiving["editors"])
        write("editor-field-instructions.csv", csv_bytes(fields, ("playbook", "edition", "content_type", "owner",
              "editor_roles", "name", "instruction", "source_reference", "notes")))
        write("visitor-task-responsibilities.csv", csv_bytes(tasks, ("playbook", "edition", "id", "name", "goal",
              "audience", "owner", "bundle", "entity_uuid", "route", "visitor_set_version_id", "journey_id", "notes")))
        write("editor-receiving-decisions.csv", csv_bytes(outcomes, ("playbook", "receiving_id", "role",
              "bundle", "owner", "decision", "reason", "original_files")))
        write("PUBLISHING_PLAYBOOK.md", (
            "# Publishing playbook receiving\n\n"
            "Open publishing-playbooks.html for the readable field instructions, editor responsibilities, visitor tasks "
            "and original receiving decisions. The CSV worksheets remain editable. publishing-playbooks.json "
            "retains every selected definition, historical version and exact native/source binding. The combined "
            "handover also contains the selected original content, visitor and native operating records. Bound cohort "
            "history uses each original plan revision, with its exact source snapshots and native operations. "
            "publishing-cohort-inventories.csv contains the selected baseline/candidate rows when cohorts are present.\n\n"
            "Reopen the separate complete private workspace backup with the same GovHub application. "
            "Open Publishing playbooks, select the retained edition and continue its original visitor/native operations. "
            "To observe another release or restore, run editorial_playbook/native/inventory.php through that target's "
            "existing Drush profile with a new retained request/output; import its original JSON, then save a new "
            "receiving observation. Continue this observation restores the retained same-role inventory, native and visitor "
            "selections and all editor files. Reuse the same request after interruption. Retain the actual editor's outcome "
            "and the original visitor capture; the playbook displays unresolved work beside completed outcomes.\n"
        ).encode("utf-8"))

    def _handover_html(self, capture):
        rendered = super()._handover_html(capture)
        data = capture.get("editorial_playbook")
        return rendered.replace(b"</main>", report(data) + b"</main>") if data else rendered

    def _exports_compare(self, payload):
        result = super()._exports_compare(payload)
        with self.connect(snapshot=True) as db:
            captures = []
            for key in ("before_id", "after_id"):
                value = self._get(db, "export", payload.get(key))
                captures.append(self._get(db, "export_intent", value["intent_id"])["capture"])
        def versions(capture):
            return [item["definition"] for item in capture.get("editorial_playbook", {}).get("playbooks", [])]
        if any(c.get("editorial_playbook") for c in captures):
            result["editorial_playbook"] = self._compare_objects(versions(captures[0]), versions(captures[1]), key="entity_id")
        return result
