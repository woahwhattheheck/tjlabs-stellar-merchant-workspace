"""Complete content-package history in GovHub's existing handover and backup."""
import html
import json

from govhub import GovHubError, SOURCE, csv_bytes, now, packed, text


class PackageDeliveryMixin:
    def _handover_capture(self, db, payload, actor):
        ids = payload.get("package_family_ids", [])
        if not ids:
            return super()._handover_capture(db, payload, actor)
        if not isinstance(ids, list) or any(not isinstance(value, str) for value in ids) or len(ids) != len(set(ids)):
            raise GovHubError("PACKAGE_HANDOVER_SCOPE", "Select each complete content-package workshare once.")
        if not isinstance(payload.get("include_sources"), bool):
            raise GovHubError("HANDOVER_SOURCE_OPTION", "Choose whether the handover includes the original source archive and native output bytes.")
        families = [self._package_family(db, value) for value in sorted(ids)]
        selected = dict(payload)
        selected["plan_ids"] = sorted(set(selected.get("plan_ids", [])) | {plan for family in families for plan in family["plan_ids"]})
        if selected.get("plan_ids") or selected.get("content_family_ids") or selected.get("visitor_edition_ids") or selected.get("pots_project_ids") or selected.get("playbook_version_ids"):
            capture = super()._handover_capture(db, selected, actor)
        else:
            meta = self.meta(db)
            capture = {
                "format": "govhub-cutover-handover/1", "name": text(payload.get("name", ""), 500, True),
                "observed_at": now(), "author": actor["name"], "workspace": meta["workspace"],
                "workspace_head": meta["head"], "source": SOURCE, "settings": self._setting(db, "settings"),
                "core_sources": self.core_sources, "auditor_sha256": self.auditor_sha256,
                "include_sources": payload["include_sources"], "plan_ids": [], "plans": [], "snapshots": [],
                "operations": [], "records": {"sites": [], "environments": [], "migration_issues": []},
                "record_history": [], "sources": [],
            }
        source_ids = {item["id"] for item in capture["sources"]}
        if capture["settings"].get("scope_file_id"):
            source_ids.add(capture["settings"]["scope_file_id"])
        bundles, targets, comparisons = [], set(), set()
        for family in families:
            editions = self._objects(db, "package_edition", family["id"])
            reviews = self._objects(db, "package_review", family["id"])
            bundles.append({"family": family, "versions": self._objects(db, "package_family_version", family["id"]), "editions": editions, "reviews": reviews, "comparisons": self._objects(db, "package_comparison", family["id"])})
            targets.update(value for value in (family["environment_id"], family["source_environment_id"]) if value)
            if family["comparison_id"]:
                comparisons.add(family["comparison_id"])
            source_ids.update(edition["file_id"] for edition in editions)
            source_ids.update(review["preview_file_id"] for review in reviews)
            for comparison in self._objects(db, "package_comparison", family["id"]):
                source_ids.update((comparison["baseline_preview_file_id"], comparison["candidate_preview_file_id"]))
        included = {item["operation"]["id"] for item in capture["operations"]}
        for row in db.execute("SELECT data FROM govhub_operations ORDER BY rowid"):
            operation = json.loads(row[0])
            if operation.get("package_family_id") not in ids or operation["id"] in included:
                continue
            files = self._output_list(db, "operation", operation["id"])
            capture["operations"].append({"operation": operation, "events": self._objects(db, "operation_event", operation["id"]), "observations": self._objects(db, "operation_observation", operation["id"]), "files": files})
            source_ids.update(file["file_id"] for file in files)
        records = {(record["kind"], record["id"]) for values in capture["records"].values() for record in values}
        for row in db.execute("SELECT * FROM entities ORDER BY kind,id"):
            record = self._core.view_record(row)
            selected_record = (record["kind"] == "environments" and record["id"] in targets) or (record["kind"] == "sites" and record["data"]["comparison_id"] in comparisons)
            if selected_record and (record["kind"], record["id"]) not in records:
                capture["records"][record["kind"]].append(record)
                records.add((record["kind"], record["id"]))
        previous_revisions = {item["revision"] for item in capture["record_history"]}
        for row in db.execute("SELECT * FROM revisions ORDER BY rowid"):
            if (row["kind"], row["id"]) in records and row["revision"] not in previous_revisions:
                item = dict(row)
                item["data"], item["origin"] = json.loads(row["data"]), json.loads(row["origin"])
                capture["record_history"].append(item)
        capture["sources"] = [self._file_row(db, file_id) for file_id in sorted(source_ids)]
        capture["package_family_ids"] = sorted(ids)
        capture["content_packages"] = {"schema": "govhub.content-packages.handover.v1", "families": bundles}
        return capture

    def _content_export_files(self, capture, write):
        super()._content_export_files(capture, write)
        packages = capture.get("content_packages")
        if not packages:
            return
        write("content-packages.json", (packed(packages) + "\n").encode("utf-8"))
        archives, reviews, operations = [], [], []
        for bundle in packages["families"]:
            for edition in bundle["editions"]:
                archives.append({name: edition.get(name, "") for name in ("id", "family_id", "label", "file_id", "filename", "archive_sha256", "archive_bytes", "previous_edition_id", "created_at", "author")})
            for review in bundle["reviews"]:
                reviews.append({name: review.get(name, "") for name in ("id", "family_id", "edition_id", "preview_operation_id", "preview_sha256", "target_sha256", "before_sha256", "decision", "reason", "created_at", "author")})
        for item in capture["operations"]:
            operation = item["operation"]
            if operation.get("package_family_id") in capture["package_family_ids"]:
                operations.append({"id": operation["id"], "family_id": operation["package_family_id"], "edition_id": operation.get("package_edition_id", ""), "type": operation["type"], "state": operation["state"], "environment_id": operation["environment_id"], "intent_sha256": operation["package_intent_sha256"], "created_at": operation["created_at"], "actual_finished_at": operation.get("actual_finished_at", "")})
        write("package-archive-editions.csv", csv_bytes(archives, ("id", "family_id", "label", "file_id", "filename", "archive_sha256", "archive_bytes", "previous_edition_id", "created_at", "author")))
        write("package-editor-decisions.csv", csv_bytes(reviews, ("id", "family_id", "edition_id", "preview_operation_id", "preview_sha256", "target_sha256", "before_sha256", "decision", "reason", "created_at", "author")))
        write("package-native-operations.csv", csv_bytes(operations, ("id", "family_id", "edition_id", "type", "state", "environment_id", "intent_sha256", "created_at", "actual_finished_at")))
        guide = """# Content package receiving

Open handover.html for the retained workshare, original archives and review decisions. content-packages.json contains every original and corrected archive edition and saved review. package-archive-editions.csv identifies the exact source bytes; package-editor-decisions.csv binds each decision to its native preview and destination state.

operations.json contains the complete original native operations, state and history. Each operation's retained files include the native archive verification, exact package and asset preview, import receipt and receiving readback. source-manifest.json maps each source ID and digest to its included original file. When sources were selected, handover.zip includes every listed archive and native result.

Open the separate complete workspace backup with the maintained GovHub application to continue this same workshare. The backup preserves staff records, decisions, source files and original native command journals. Use packages.families.get, packages.operations.get and packages.receiving.create through the existing CLI or HTTP action dispatcher. A receiving operation reads the original import identity; it does not create another import. Reopen or resume the original interrupted operation before making a new import decision.

GovHub's graph export explicitly selects the native unpublished mode by default: its packages create new content as drafts and preserve existing destination publication. An externally supplied archive retains its original publication mode; the native preview shows that source and its planned effect before review. Use Drupal's native editor and scheduler for destination publication. Correct the original Drupal source and retain its next native export as a new archive edition, then preview and review that edition against the current destination. Absence from a candidate archive is a review difference; native Content Packages does not delete omitted destination entities.

An interrupted native import rolls back its database changes and original receipt together. Unmanaged asset files copied by Drupal can remain after a database rollback; their original native asset plan and files stay retained for the same-operation continuation. Whole-site recovery uses the workshare's included original GovHub cutover and rollback plans and selected backups. Open their native operations and complete original source files. An earlier content package upsert is a new content change; the retained site backup supplies the full rollback path.
"""
        write("PACKAGE_RECEIVING.md", guide.encode("utf-8"))

    def _handover_html(self, capture):
        rendered = super()._handover_html(capture)
        packages = capture.get("content_packages")
        if not packages:
            return rendered
        escape = lambda value: html.escape(str(value if value is not None else ""), quote=True)
        blocks = ["<h2>Content packages</h2>"]
        for bundle in packages["families"]:
            family = bundle["family"]
            blocks.append("<h3>" + escape(family["label"]) + "</h3><p>" + escape(family["notes"]) + "</p><dl><dt>Receiving engineer</dt><dd>" + escape(family["owner"]) + "</dd><dt>Recovery instruction</dt><dd>" + escape(family["recovery_instruction"]) + "</dd></dl>")
            blocks.append("<table><thead><tr><th>Archive edition</th><th>Original bytes</th><th>Source and history</th></tr></thead><tbody>")
            for edition in bundle["editions"]:
                blocks.append("<tr><td>" + escape(edition["label"]) + "<br>" + escape(edition["id"]) + "</td><td>" + escape(edition["filename"]) + "<br>" + escape(edition["archive_bytes"]) + " bytes<br>" + escape(edition["archive_sha256"]) + "</td><td>" + escape(edition["created_at"]) + "<br>" + escape(edition["notes"]) + "</td></tr>")
            blocks.append("</tbody></table><h4>Editor decisions</h4>")
            for review in bundle["reviews"]:
                blocks.append("<p><strong>" + escape(review["decision"]) + "</strong> · " + escape(review["author"]) + " · " + escape(review["created_at"]) + "<br>" + escape(review["reason"]) + "<br>Native preview " + escape(review["preview_operation_id"]) + "</p>")
            blocks.append("<h4>Native operations</h4><table><thead><tr><th>Operation</th><th>Outcome</th><th>Original edition</th></tr></thead><tbody>")
            for item in capture["operations"]:
                operation = item["operation"]
                if operation.get("package_family_id") == family["id"]:
                    blocks.append("<tr><td>" + escape(operation["type"]) + "<br>" + escape(operation["id"]) + "</td><td>" + escape(operation["state"]) + "<br>" + escape(operation["progress"]["detail"]) + "</td><td>" + escape(operation.get("package_edition_id", "")) + "</td></tr>")
            blocks.append("</tbody></table>")
        return rendered.replace(b"</main>", ("".join(blocks) + "</main>").encode("utf-8"))

    def _exports_compare(self, payload):
        result = super()._exports_compare(payload)
        with self.connect(snapshot=True) as db:
            before = self._get(db, "export", payload.get("before_id"))
            after = self._get(db, "export", payload.get("after_id"))
            left = self._get(db, "export_intent", before["intent_id"])["capture"]
            right = self._get(db, "export_intent", after["intent_id"])["capture"]
        def flatten(capture):
            groups = {"families": [], "editions": [], "reviews": [], "comparisons": []}
            for bundle in capture.get("content_packages", {}).get("families", []):
                groups["families"].append(bundle["family"])
                groups["editions"].extend(bundle["editions"])
                groups["reviews"].extend(bundle["reviews"])
                groups["comparisons"].extend(bundle.get("comparisons", []))
            return groups
        if left.get("content_packages") or right.get("content_packages"):
            a, b = flatten(left), flatten(right)
            result["content_packages"] = {name: self._compare_objects(a[name], b[name]) for name in a}
        return result
