"""Complete content editions, native results and editable receiving joins."""
import html
import json

from govhub import GovHubError, SOURCE, csv_bytes, now, packed, text


class ContentDeliveryMixin:
    def _handover_capture(self, db, payload, actor):
        families = payload.get("content_family_ids", [])
        if not families:
            return super()._handover_capture(db, payload, actor)
        if not isinstance(families, list) or len(set(families)) != len(families) or any(not isinstance(f, str) for f in families):
            raise GovHubError("CONTENT_HANDOVER_SCOPE", "Select each complete content consolidation once.")
        if not isinstance(payload.get("include_sources"), bool):
            raise GovHubError("HANDOVER_SOURCE_OPTION", "Select whether the receiving handover includes the original source bytes.")
        if payload.get("plan_ids") or payload.get("visitor_edition_ids"):
            capture = super()._handover_capture(db, payload, actor)
        else:
            meta = self.meta(db)
            capture = {"format": "govhub-cutover-handover/1", "name": text(payload.get("name", ""), 500, True), "observed_at": now(), "author": actor["name"], "workspace": meta["workspace"], "workspace_head": meta["head"], "source": SOURCE, "settings": self._setting(db, "settings"), "core_sources": self.core_sources, "auditor_sha256": self.auditor_sha256, "include_sources": payload["include_sources"], "plan_ids": [], "plans": [], "snapshots": [], "operations": [], "records": {"sites": [], "environments": [], "migration_issues": []}, "record_history": [], "sources": []}
        source_ids = {f["id"] for f in capture["sources"]}
        if capture["settings"].get("scope_file_id"):
            source_ids.add(capture["settings"]["scope_file_id"])
        content, targets, comparisons = [], set(), set()
        for family_id in sorted(families):
            family = self._content_family(db, family_id)
            editions = self._objects(db, "content_edition", family_id)
            mappings = self._objects(db, "content_mapping", family_id)
            reviews = self._objects(db, "content_review", family_id)
            plans = self._objects(db, "content_plan", family_id)
            content.append({"family": family, "versions": self._objects(db, "content_family_version", family_id), "editions": editions, "mappings": mappings, "reviews": reviews, "plans": plans})
            targets.add(family["environment_id"])
            if family["comparison_id"]:
                comparisons.add(family["comparison_id"])
            for edition in editions:
                source_ids.update(f["id"] for f in edition["files"])
            for mapping in mappings:
                source_ids.update(f["file_id"] for f in mapping["compiled"]["files"])
            for review in reviews:
                if review.get("backup_ref"):
                    source_ids.add(review["backup_ref"]["file_id"])
        included_operations = {o["operation"]["id"] for o in capture["operations"]}
        all_operations = [json.loads(r[0]) for r in db.execute("SELECT data FROM govhub_operations ORDER BY rowid")]
        for operation in all_operations:
            if operation.get("content_family_id") not in families or operation["id"] in included_operations:
                continue
            files = self._output_list(db, "operation", operation["id"])
            capture["operations"].append({"operation": operation, "events": self._objects(db, "operation_event", operation["id"]), "observations": self._objects(db, "operation_observation", operation["id"]), "files": files})
            source_ids.update(f["file_id"] for f in files)
        existing_records = {(r["kind"], r["id"]) for rows in capture["records"].values() for r in rows}
        for row in db.execute("SELECT * FROM entities ORDER BY kind,id"):
            record = self._core.view_record(row)
            selected = record["kind"] == "environments" and record["id"] in targets or record["kind"] == "sites" and record["data"]["comparison_id"] in comparisons
            if selected and (record["kind"], record["id"]) not in existing_records:
                capture["records"][record["kind"]].append(record)
                existing_records.add((record["kind"], record["id"]))
        previous_revisions = {r["revision"] for r in capture["record_history"]}
        for row in db.execute("SELECT * FROM revisions ORDER BY rowid"):
            if (row["kind"], row["id"]) in existing_records and row["revision"] not in previous_revisions:
                retained = dict(row)
                retained["data"], retained["origin"] = json.loads(row["data"]), json.loads(row["origin"])
                capture["record_history"].append(retained)
        capture["sources"] = [self._file_row(db, f) for f in sorted(source_ids)]
        capture["content_family_ids"] = sorted(families)
        capture["content_consolidation"] = {"schema": "govhub.content-consolidation.handover.v1", "families": content}
        return capture

    def _exports_compare(self, payload):
        result = super()._exports_compare(payload)
        with self.connect(snapshot=True) as db:
            before = self._get(db, "export", payload.get("before_id"))
            after = self._get(db, "export", payload.get("after_id"))
            a = self._get(db, "export_intent", before["intent_id"])["capture"]
            b = self._get(db, "export_intent", after["intent_id"])["capture"]
        if not (a.get("content_consolidation") or b.get("content_consolidation")):
            return result
        def components(capture):
            groups = {name: [] for name in ("families", "source_editions", "mappings", "reviews", "native_plans")}
            for bundle in capture.get("content_consolidation", {}).get("families", []):
                groups["families"].append(bundle["family"])
                for edition in bundle["editions"]:
                    groups["source_editions"].append({k: v for k, v in edition.items() if k != "rows"})
                for mapping in bundle["mappings"]:
                    groups["mappings"].append({k: v for k, v in mapping.items() if k not in {"compiled", "definition"}})
                groups["reviews"].extend(bundle["reviews"])
                for plan in bundle["plans"]:
                    groups["native_plans"].append({k: v for k, v in plan.items() if k not in {"native", "lineage"}})
            return groups
        left, right = components(a), components(b)
        result["content_consolidation"] = {name: self._compare_objects(left[name], right[name]) for name in left}
        return result

    def _content_export_files(self, capture, write):
        content = capture.get("content_consolidation")
        if not content:
            return
        write("content-consolidation.json", (packed(content) + "\n").encode("utf-8"))
        rows, lineage, definitions = [], [], []
        for bundle in content["families"]:
            family = bundle["family"]
            for edition in bundle["editions"]:
                for row in edition["rows"]:
                    rows.append({"family_id": family["id"], "source_id": edition["source_id"], "edition_id": edition["id"], "observed_at": edition["observed_at"], "keys": packed(row["keys"]), "file_id": row["file_id"], "source_row": row["source_row"], "row_sha256": row["row_sha256"], "original_record": packed(row["data"]), "source_line_start": row.get("source_line_start", ""), "source_line_end": row.get("source_line_end", "")})
            for plan in bundle["plans"]:
                definitions.append(plan["native"])
                lineage.extend({"plan_id": plan["id"], **entry, "source_ids": packed(entry["source_ids"])} for entry in plan["lineage"])
        write("content-source-records.csv", csv_bytes(rows, ("family_id", "source_id", "edition_id", "observed_at", "keys", "file_id", "source_row", "row_sha256", "original_record", "source_line_start", "source_line_end")))
        write("content-native-migrations.json", (packed(definitions) + "\n").encode("utf-8"))
        write("content-lineage.csv", csv_bytes(lineage, ("plan_id", "migration_id", "source_ids", "edition_id", "file_id", "source_row", "original_row_sha256", "source_line_start", "source_line_end")))
        write("CONTENT_RECEIVING.md", ("# Content consolidation receiving\n\nOpen handover.html for the operator report and content-consolidation.json for every original feed edition, mapping, decision and native plan. content-source-records.csv preserves the complete selected records. content-lineage.csv connects the original source rows to the selected native migration/source IDs. New CSV editions retain their exact delimiter, quoting and per-file header order in content-consolidation.json; their source_line_start/source_line_end columns locate records that span physical lines. Those columns remain empty for earlier editions and JSON sources. operations.json and the retained original native artifacts contain Drupal's actual ID maps, messages and JSON:API responses. source-manifest.json identifies every included original source and media file.\n\nThe separate full workspace backup includes the database, current staff accounts, original file store and native operation journals. Open that complete backup with this same application and review Content consolidation. Compare the retained first and corrected source editions; open their native operations and original artifacts; create a new source-inclusive handover. Use the original target/profile and migration IDs for any continuation. Native selected-row rollback is separate from whole-site recovery. The consolidation record retains its operating recovery instruction.\n").encode("utf-8"))

    def _handover_html(self, capture):
        rendered = super()._handover_html(capture)
        content = capture.get("content_consolidation")
        if not content:
            return rendered
        e = lambda x: html.escape(str(x if x is not None else ""), quote=True)
        blocks = ["<h2>Content consolidation</h2>"]
        for bundle in content["families"]:
            family = bundle["family"]
            blocks.append("<h3>" + e(family["label"]) + "</h3><p>" + e(family["notes"]) + "</p><dl><dt>Owner</dt><dd>" + e(family["owner"]) + "</dd><dt>Recovery instruction</dt><dd>" + e(family["recovery_instruction"]) + "</dd></dl>")
            blocks.append("<table><thead><tr><th>Original feed edition</th><th>Observation</th><th>Records and original sources</th></tr></thead><tbody>")
            for edition in bundle["editions"]:
                blocks.append("<tr><td>" + e(edition["source_id"]) + "<br>" + e(edition["label"]) + "<br>" + e(edition["id"]) + "</td><td>" + e(edition["observed_at"]) + "</td><td>" + e(edition["row_count"]) + " records<br>" + e(len(edition["files"])) + " original files<br>" + e(len(edition["issues"])) + " source issues</td></tr>")
            blocks.append("</tbody></table><h4>Mapping and review history</h4><table><thead><tr><th>Mapping</th><th>Native migration</th><th>Source edition and selected destination</th></tr></thead><tbody>")
            for mapping in bundle["mappings"]:
                for migration in mapping["definition"]["migrations"]:
                    blocks.append("<tr><td>" + e(mapping["label"]) + "<br>" + e(mapping["id"]) + "</td><td>" + e(migration["id"]) + "</td><td>" + e(migration["edition_id"]) + "<br>" + e(packed(migration["destination"])) + "</td></tr>")
            blocks.append("</tbody></table>")
            for review in bundle["reviews"]:
                blocks.append("<p><strong>" + e(review["decision"]) + "</strong> · " + e(review["author"]) + " · " + e(review["created_at"]) + "<br>" + e(review["reason"]) + "<br>Mapping " + e(review["mapping_id"]) + "</p>")
        return rendered.replace(b"</main>", ("".join(blocks) + "</main>").encode("utf-8"))
