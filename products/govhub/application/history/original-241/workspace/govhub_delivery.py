"""Scoped immutable GovHub handovers and source-preserving private backup."""
from contextlib import contextmanager
from pathlib import Path
import csv
import fcntl
import hashlib
import html
import io
import json
import mimetypes
import os
import shutil
import sqlite3
import stat
import tempfile
import zipfile


class DeliveryMixin:
    def _output_list(self, db, kind, owner_id):
        rows = db.execute("SELECT x.name,x.mime,x.file_id,f.sha256,f.bytes FROM govhub_output_files x JOIN files f ON f.id=x.file_id WHERE x.owner_kind=? AND x.owner_id=? ORDER BY x.name", (kind, owner_id))
        return [{"name": row["name"], "mime": row["mime"], "file_id": row["file_id"], "sha256": row["sha256"], "size": row["bytes"]} for row in rows]

    def _output_file(self, kind, owner_id, filename):
        from govhub import GovHubError, text
        filename = text(filename, 500, True)
        if Path(filename).name != filename or filename in {".", ".."} or "\\" in filename:
            raise GovHubError("OUTPUT_NAME", "Choose an exact retained output filename.", 404)
        with self.connect(snapshot=True) as db:
            owner = self._get(db, "export", owner_id) if kind == "export" else self._operation(db, owner_id)
            matches = [item for item in self._output_list(db, kind, owner_id) if item["name"] == filename]
            if not matches:
                raise GovHubError("OUTPUT_NOT_FOUND", "The selected retained output does not exist.", 404)
            selected = matches[0]
            item = self._file_row(db, selected["file_id"])
            if kind == "export":
                manifest_item = next((value for value in owner["files"] if value["name"] == filename), None)
                if not manifest_item or any(manifest_item[key] != selected[key] for key in ("name", "sha256", "size", "mime")):
                    raise GovHubError("OUTPUT_IDENTITY", "The retained handover output identity changed.", 409)
        return {"path": str(self._verify_file(item)), "mime": selected["mime"], "name": filename, "sha256": selected["sha256"], "size": selected["size"]}

    def export_file(self, export_id, filename):
        return self._output_file("export", export_id, filename)

    def operation_file(self, operation_id, filename):
        return self._output_file("operation", operation_id, filename)

    def _register_generated(self, db, path, filename, actor, export_id):
        """Move an owned completed output into the original immutable blob store."""
        from govhub import GovHubError, file_digest, ident, now
        path = Path(path)
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to((self.root / "govhub-export-builds").resolve()):
            raise GovHubError("GENERATED_PATH", "Generated handover outputs must stay inside their owned build directory.", 409)
        sha, size = file_digest(path)
        with path.open("rb") as source:
            os.fsync(source.fileno())
        destination = self.blobs / sha
        if destination.exists():
            actual, actual_size = file_digest(destination)
            if destination.is_symlink() or actual != sha or actual_size != size:
                raise GovHubError("BLOB_CHANGED", "A retained content-addressed output is damaged.", 409)
            path.unlink()
        else:
            os.replace(path, destination)
            os.chmod(destination, 0o600)
        self._sync_dir(self.blobs)
        item = {"id": ident("file-"), "filename": filename, "sha256": sha, "bytes": size, "category": "Evidence", "source_label": "Immutable GovHub handover " + export_id, "system_id": "", "created_at": now(), "author": actor["name"]}
        db.execute("INSERT INTO files VALUES(:id,:filename,:sha256,:bytes,:category,:source_label,:system_id,:created_at,:author)", item)
        mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        db.execute("INSERT INTO govhub_output_files VALUES(?,?,?,?,?)", (item["id"], "export", export_id, filename, mime))
        return {"name": filename, "sha256": sha, "size": size, "mime": mime, "file_id": item["id"]}

    @contextmanager
    def _export_lease(self):
        from govhub import GovHubError
        descriptor = os.open(self.root / "govhub-export.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise GovHubError("EXPORT_BUILDING", "Another handover is being assembled. Reopen or retry this same request after that assembly completes.", 409) from exc
            yield
        finally:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)

    def _handover_capture(self, db, payload, actor):
        from govhub import GovHubError, SOURCE, now, text
        visitor_capture = None
        if payload.get("visitor_edition_ids"):
            from visitor_journeys.workspace import handover_capture
            visitor_capture = handover_capture(self, db, payload, actor)
            if not payload.get("plan_ids"):
                return visitor_capture
        ids = payload.get("plan_ids")
        if not isinstance(ids, list) or not ids or len(ids) > 1000:
            raise GovHubError("HANDOVER_SCOPE", "Choose the explicit cohort plans for this handover.")
        ids = [text(value, 240, True) for value in ids]
        if len(set(ids)) != len(ids):
            raise GovHubError("HANDOVER_SCOPE", "Each selected plan must appear once.")
        if not isinstance(payload.get("include_sources"), bool):
            raise GovHubError("HANDOVER_SOURCE_OPTION", "Choose whether to include the original source artifact bytes.")
        plans, snapshot_ids, all_comparison_ids = [], set(), set()
        for plan_id in sorted(ids):
            plan = self._plan(db, plan_id)
            snapshot_ids.update((plan["baseline_id"], plan["candidate_id"]))
            all_comparison_ids.update(plan["agency_ids"])
            plans.append({"plan": dict(plan, **self._plan_summary(db, plan)), "versions": self._objects(db, "plan_version", plan_id), "approvals": self._objects(db, "approval", plan_id), "revocations": self._objects(db, "revocation", plan_id), "applicable_approvals": self._applicable(db, plan), "audits": self._objects(db, "audit", plan_id), "reviews": self._objects(db, "review", plan_id)})
        all_operations = [json.loads(row[0]) for row in db.execute("SELECT data FROM govhub_operations ORDER BY rowid")]
        operation_ids = {operation["id"] for operation in all_operations if operation["plan_id"] in ids}
        for operation in all_operations:
            if operation["id"] not in operation_ids:
                continue
            if operation.get("source_snapshot_id"):
                snapshot_ids.add(operation["source_snapshot_id"])
            if operation.get("result_snapshot_id"):
                snapshot_ids.add(operation["result_snapshot_id"])
        snapshots = [self._get(db, "snapshot", snapshot_id) for snapshot_id in sorted(snapshot_ids)]
        capture_ids, captured_file_ids = set(), set()
        for snapshot in snapshots:
            captured_file_ids.add(snapshot["file_id"])
            for binding in snapshot["bindings"]:
                if binding["agency_id"] not in all_comparison_ids:
                    continue
                entries = [binding[role] for role in ("export", "backup") if binding.get(role)]
                entries.extend({**value["file"], "native": value.get("native", {})} for value in binding.get("files", []))
                for entry in entries:
                    captured_file_ids.add(entry["id"])
                    if entry.get("native", {}).get("capture_operation_id"):
                        capture_ids.add(entry["native"]["capture_operation_id"])
        for file_id in captured_file_ids:
            capture_ids.update(row[0] for row in db.execute("SELECT owner_id FROM govhub_output_files WHERE owner_kind='operation' AND file_id=?", (file_id,)))
        operation_ids.update(operation["id"] for operation in all_operations if operation["type"] in {"CAPTURE", "BACKUP_CREATE", "BACKUP_DOWNLOAD"} and operation["id"] in capture_ids)
        operations = [{"operation": operation, "events": self._objects(db, "operation_event", operation["id"]), "observations": self._objects(db, "operation_observation", operation["id"]), "files": self._output_list(db, "operation", operation["id"])} for operation in all_operations if operation["id"] in operation_ids]
        all_records = [self._core.view_record(row) for row in db.execute("SELECT * FROM entities ORDER BY kind,id")]
        sites = [row for row in all_records if row["kind"] == "sites" and row["data"]["comparison_id"] in all_comparison_ids]
        environment_ids = {row["operation"]["environment_id"] for row in operations}
        for site in sites:
            environment_ids.update(value for value in (site["data"]["incumbent_environment_id"], site["data"]["candidate_environment_id"]) if value)
        records = {"sites": sites, "environments": [row for row in all_records if row["kind"] == "environments" and row["id"] in environment_ids], "migration_issues": [row for row in all_records if row["kind"] == "migration_issues" and (row["data"]["plan_id"] in ids or set(row["data"]["site_ids"]) & {site["id"] for site in sites})]}
        selected = {(row["kind"], row["id"]) for rows in records.values() for row in rows}
        revisions = []
        for row in db.execute("SELECT * FROM revisions ORDER BY rowid"):
            if (row["kind"], row["id"]) not in selected:
                continue
            retained = dict(row)
            retained["data"], retained["origin"] = json.loads(row["data"]), json.loads(row["origin"])
            revisions.append(retained)
        source_ids = set()
        settings = self._setting(db, "settings")
        if settings.get("scope_file_id"):
            source_ids.add(settings["scope_file_id"])
        for snapshot in snapshots:
            source_ids.add(snapshot["file_id"])
            for binding in snapshot["bindings"]:
                for role in ("export", "backup"):
                    if binding.get(role):
                        source_ids.add(binding[role]["id"])
                source_ids.update(value["file"]["id"] for value in binding.get("files", []))
        for operation in operations:
            source_ids.update(item["file_id"] for item in operation["files"])
        files = [self._file_row(db, file_id) for file_id in sorted(source_ids)]
        capture = {"format": "govhub-cutover-handover/1", "name": text(payload.get("name", ""), 500, True), "observed_at": now(), "author": actor["name"], "workspace": self.meta(db)["workspace"], "workspace_head": self.meta(db)["head"], "source": SOURCE, "settings": settings, "core_sources": self.core_sources, "auditor_sha256": self.auditor_sha256, "include_sources": payload["include_sources"], "plan_ids": sorted(ids), "plans": plans, "snapshots": snapshots, "operations": operations, "records": records, "record_history": revisions, "sources": files}
        if visitor_capture:
            original_operations = {item["operation"]["id"]: item for item in capture["operations"]}
            original_operations.update({item["operation"]["id"]: item for item in visitor_capture["operations"]})
            capture["operations"] = list(original_operations.values())
            original_files = {item["id"]: item for item in capture["sources"]}
            original_files.update({item["id"]: item for item in visitor_capture["sources"]})
            capture["sources"] = [original_files[key] for key in sorted(original_files)]
            capture["visitor"] = visitor_capture["visitor"]
            capture["visitor_edition_ids"] = visitor_capture["visitor_edition_ids"]
            capture["visitor_source"] = visitor_capture["source"]
        return capture

    @staticmethod
    def _handover_html(capture):
        if "visitor" in capture and not capture["plans"] and not capture.get("content_consolidation"):
            from visitor_journeys.delivery import report
            return report(capture)
        e = lambda value: html.escape(str(value if value is not None else ""), quote=True)
        blocks = []
        blocks.append("<h1>" + e(capture["name"]) + "</h1><p>GovHub operating and receiving handover</p><dl><dt>Captured</dt><dd>" + e(capture["observed_at"]) + "</dd><dt>Prepared by</dt><dd>" + e(capture["author"]) + "</dd><dt>Input mode</dt><dd>" + e(capture["settings"]["input_mode"]) + "</dd></dl>")
        blocks.append("<h2>Cohort plans</h2><table><thead><tr><th>Plan</th><th>Revision and scope</th><th>Current review</th></tr></thead><tbody>")
        for item in capture["plans"]:
            plan = item["plan"]
            review = plan["latest_review"]
            blocks.append("<tr><td>" + e(plan["name"]) + "</td><td>" + e(plan["revision"]) + "<br>" + e(len(plan["agency_ids"])) + " comparison IDs</td><td>" + e(plan["status"]) + ("<br>" + e(review["author"]) + ": " + e(review["reason"]) if review else "") + "</td></tr>")
        blocks.append("</tbody></table>")
        for item in capture["plans"]:
            plan = item["plan"]
            blocks.append("<h3>" + e(plan["name"]) + "</h3><p>" + e(plan.get("notes", "")) + "</p><dl><dt>Owner</dt><dd>" + e(plan.get("owner", "")) + "</dd><dt>Agreed window</dt><dd>" + e(plan.get("window_start", "")) + " – " + e(plan.get("window_end", "")) + "</dd><dt>Rollback procedure</dt><dd>" + e(plan.get("rollback_reference", "")) + "</dd></dl>")
            audit = next((value for value in item["audits"] if value["id"] == plan["latest_audit_id"]), None)
            if audit:
                blocks.append("<p>Original audit: <strong>" + e(audit["status"]) + "</strong>. Baseline " + e(audit["summary"]["baseline_sites"]) + ", candidate " + e(audit["summary"]["candidate_sites"]) + ", matched " + e(audit["summary"]["matched_sites"]) + ".</p>")
                blocks.append("<table><thead><tr><th>Comparison ID</th><th>Field</th><th>Before</th><th>After</th><th>Decision</th></tr></thead><tbody>")
                for row in audit["summary"]["checks"]:
                    blocks.append("<tr>" + "".join("<td>" + e(row.get(key, "")) + "</td>" for key in ("agency_id", "field", "before", "after")) + "<td>" + e(row["result"]) + "<br>" + e(row["reason"]) + ("<br>" + e(row["approved_by"]) if row.get("approved_by") else "") + "</td></tr>")
                for issue in audit["scope_issues"]:
                    blocks.append("<tr><td>" + e(issue["agency_id"]) + "</td><td colspan=4>" + e(issue["message"]) + "</td></tr>")
                blocks.append("</tbody></table>")
        blocks.append("<h2>Native operations and recovery</h2><table><thead><tr><th>Operation</th><th>Target and source</th><th>Observed result</th></tr></thead><tbody>")
        for item in capture["operations"]:
            value = item["operation"]
            blocks.append("<tr><td>" + e(value["type"]) + "<br>" + e(value.get("native_action", "")) + "<br>" + e(value["id"]) + "</td><td>" + e(value["environment"]["data"]["name"]) + "<br>" + e(value["profile"]["config"]["environment_id"]) + "<br>" + e(value["source_snapshot_id"]) + "</td><td>" + e(value["state"]) + "<br>" + e(value["progress"]["detail"]) + "<br>" + e(value.get("actual_started_at", "")) + " — " + e(value.get("actual_finished_at", "")) + "</td></tr>")
        blocks.append("</tbody></table><h2>Assigned corrective work</h2><table><thead><tr><th>Work</th><th>Owner and status</th><th>Actual resolution</th></tr></thead><tbody>")
        for item in capture["records"]["migration_issues"]:
            value = item["data"]
            blocks.append("<tr><td>" + e(value["name"]) + "<br>" + e(value["description"]) + "</td><td>" + e(value["owner"]) + "<br>" + e(value["status"]) + "</td><td>" + e(value["resolution"]) + "<br>" + e(value["resolved_at"]) + "</td></tr>")
        blocks.append("</tbody></table><h2>Original source inventory</h2><p>Every listed hash identifies the original retained bytes. The source manifest records their exact package paths.</p><table><thead><tr><th>Original file</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>")
        for item in capture["sources"]:
            blocks.append("<tr><td>" + e(item["filename"]) + "<br>" + e(item["source_label"]) + "</td><td>" + e(item["bytes"]) + "</td><td class=hash>" + e(item["sha256"]) + "</td></tr>")
        blocks.append("</tbody></table><p>The full JSON includes retained source versions, exact field approvals, plan and record revisions, native command checkpoints, result observations and reviewer history.</p>")
        if "visitor" in capture:
            from visitor_journeys.delivery import report
            blocks.append(report(capture, embedded=True).decode("utf-8"))
        return ("<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>" + e(capture["name"]) + "</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#171717;background:white;max-width:1200px;margin:36px auto;padding:0 20px}h1,h2,h3{line-height:1.2}h2{border-top:2px solid #333;padding-top:20px;margin-top:36px}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:16px 0}th,td{border:1px solid #bbb;padding:9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#ededed}dt{font-weight:650}dd{margin:0 0 8px}.hash{font:12px/1.5 ui-monospace,monospace}@media print{body{font-size:10pt;margin:0}tr{break-inside:avoid}}</style><main>" + "".join(blocks) + "</main></html>").encode("utf-8")

    def _write_export_payload(self, directory, capture):
        from govhub import APPROVAL_FIELDS, MANIFEST_FIELDS, csv_bytes, digest, packed
        files = {}
        def write(name, content):
            path = directory / name
            with path.open("wb") as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
            os.chmod(path, 0o600)
            files[name] = path
        write("handover.json", (packed(capture) + "\n").encode("utf-8"))
        write("handover.html", self._handover_html(capture))
        write("record-history.ndjson", ("".join(packed(row) + "\n" for row in capture["record_history"])).encode("utf-8"))
        write("operations.json", (packed(capture["operations"]) + "\n").encode("utf-8"))
        if "visitor" in capture:
            from visitor_journeys.delivery import write_payload
            write_payload(write, capture)
        for kind, records in capture["records"].items():
            fields = ["id", "revision", "archived", "author", "updated_at"] + [field["name"] for field in self._schema.SCHEMAS[kind]["fields"]]
            rows = []
            for item in records:
                row = {key: item[key] for key in ("id", "revision", "archived", "author", "updated_at")}
                row.update({key: packed(value) if isinstance(value, (dict, list)) else value for key, value in item["data"].items()})
                rows.append(row)
            write(kind + ".csv", csv_bytes(rows, fields))
        snapshots = {item["id"]: item for item in capture["snapshots"]}
        for item in capture["plans"]:
            plan = item["plan"]
            cohort = set(plan["agency_ids"])
            prefix = plan["id"] + "-"
            write(prefix + "baseline.csv", csv_bytes([row for row in snapshots[plan["baseline_id"]]["rows"] if row["agency_id"] in cohort], MANIFEST_FIELDS))
            write(prefix + "candidate.csv", csv_bytes([row for row in snapshots[plan["candidate_id"]]["rows"] if row["agency_id"] in cohort], MANIFEST_FIELDS))
            write(prefix + "approvals.csv", csv_bytes(item["applicable_approvals"], APPROVAL_FIELDS))
            if plan["latest_audit_id"]:
                audit = next(value for value in item["audits"] if value["id"] == plan["latest_audit_id"])
                write(prefix + "audit.json", (packed(audit["report"]) + "\n").encode("utf-8"))
                rendered = self.auditor.render_html(audit["report"])
                write(prefix + "audit.html", rendered.encode("utf-8") if isinstance(rendered, str) else rendered)
        self._content_export_files(capture, write)
        source_manifest, source_paths, by_hash = [], {}, {}
        for item in capture["sources"]:
            path = self._verify_file(item)
            archive_name = by_hash.setdefault(item["sha256"], "sources/" + item["sha256"][:20] + "-" + item["filename"])
            source_manifest.append(dict(item, archive_path=archive_name if capture["include_sources"] else None))
            if capture["include_sources"]:
                source_paths[archive_name] = path
        write("source-manifest.json", (packed({"include_sources": capture["include_sources"], "sources": source_manifest}) + "\n").encode("utf-8"))
        entries = [{"name": name, "sha256": digest(path.read_bytes()), "size": path.stat().st_size} for name, path in sorted(files.items())]
        write("manifest.json", (packed({"format": "govhub-handover-files/1", "files": entries, "original_sources": source_manifest}) + "\n").encode("utf-8"))
        archive = directory / "handover.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=5, allowZip64=True) as output:
            for name, path in sorted(files.items()):
                output.write(path, name)
            for name, path in sorted(source_paths.items()):
                compression = zipfile.ZIP_STORED if Path(name).suffix.lower() in {".gz", ".zip", ".xz", ".bz2", ".jpg", ".png", ".pdf"} else zipfile.ZIP_DEFLATED
                output.write(path, name, compress_type=compression)
        with archive.open("rb") as output:
            os.fsync(output.fileno())
        os.chmod(archive, 0o600)
        files["handover.zip"] = archive
        return files

    def _exports_create(self, payload, actor):
        from govhub import GovHubError, digest, ident, now, packed
        with self._export_lease():
            with self.connect(write=True) as db:
                key, fingerprint, prior = self._request(db, payload, actor)
                if prior:
                    return prior
                intents = self._objects(db, "export_intent", key)
                if intents:
                    intent = intents[0]
                    if intent["request_fingerprint"] != fingerprint:
                        raise GovHubError("RETRY_CHANGED", "This handover identity belongs to different input.", 409)
                else:
                    capture = self._handover_capture(db, payload, actor)
                    intent = self._object(db, "export_intent", {"export_id": ident("export-"), "request_fingerprint": fingerprint, "capture": capture}, parent=key, actor=actor["name"])
            capture = intent["capture"]
            export_id = intent["export_id"]
            root = self.root / "govhub-export-builds"
            root.mkdir(mode=0o700, exist_ok=True)
            if root.is_symlink():
                raise GovHubError("EXPORT_DIRECTORY", "The handover build directory must remain private and local.", 409)
            directory = root / export_id
            directory.mkdir(mode=0o700, exist_ok=True)
            if directory.is_symlink():
                raise GovHubError("EXPORT_DIRECTORY", "The selected handover build directory changed.", 409)
            paths = self._write_export_payload(directory, capture)
            with self.connect(write=True) as db:
                key, fingerprint, prior = self._request(db, payload, actor)
                if prior:
                    return prior
                # A previous interrupted final transaction may have left only
                # unreferenced immutable blobs; the same captured intent is reused.
                files = [self._register_generated(db, path, name, actor, export_id) for name, path in sorted(paths.items())]
                value = {"id": export_id, "name": capture["name"], "created_at": capture["observed_at"], "author": capture["author"], "plan_ids": capture["plan_ids"], "content_family_ids": capture.get("content_family_ids", []), "package_family_ids": capture.get("package_family_ids", []), "visitor_edition_ids": capture.get("visitor_edition_ids", []), "pots_project_ids": capture.get("pots_project_ids", []), "playbook_version_ids": capture.get("playbook_version_ids", []), "files": files, "snapshot_sha256": digest(packed(capture)), "intent_id": intent["id"], "include_sources": capture["include_sources"]}
                result = {"export": self._object(db, "export", value, actor=actor["name"])}
                self._remember(db, key, fingerprint, result, actor)
                self._changed(db, actor, "Complete immutable cohort handover created", "export", export_id, {"plan_ids": capture["plan_ids"], "files": len(files)})
            try:
                directory.rmdir()
            except OSError:
                pass
            return result

    def _exports_get(self, payload):
        with self.connect(snapshot=True) as db:
            value = self._get(db, "export", payload.get("export_id"))
            return {"export": value}

    @staticmethod
    def _compare_objects(before, after, key="id"):
        a, b = {item[key]: item for item in before}, {item[key]: item for item in after}
        changed = []
        for identity in sorted(set(a) & set(b)):
            if a[identity] != b[identity]:
                fields = [{"field": name, "before": a[identity].get(name), "after": b[identity].get(name)} for name in sorted(set(a[identity]) | set(b[identity])) if a[identity].get(name) != b[identity].get(name)]
                changed.append({"id": identity, "fields": fields})
        return {"added": [b[key] for key in sorted(set(b) - set(a))], "removed": [a[key] for key in sorted(set(a) - set(b))], "changed": changed, "unchanged": sorted(key for key in set(a) & set(b) if a[key] == b[key])}

    def _exports_compare(self, payload):
        with self.connect(snapshot=True) as db:
            before = self._get(db, "export", payload.get("before_id"))
            after = self._get(db, "export", payload.get("after_id"))
            a = self._get(db, "export_intent", before["intent_id"])["capture"]
            b = self._get(db, "export_intent", after["intent_id"])["capture"]
            records = {kind: self._compare_objects(a["records"][kind], b["records"][kind]) for kind in a["records"]}
            result = {"before": {key: before[key] for key in ("id", "name", "created_at", "sha256")}, "after": {key: after[key] for key in ("id", "name", "created_at", "sha256")}, "plans": self._compare_objects([item["plan"] for item in a["plans"]], [item["plan"] for item in b["plans"]]), "operations": self._compare_objects([item["operation"] for item in a["operations"]], [item["operation"] for item in b["operations"]]), "records": records, "scope_changed": a["settings"] != b["settings"], "before_source_hashes": sorted({item["sha256"] for item in a["sources"]}), "after_source_hashes": sorted({item["sha256"] for item in b["sources"]})}
            if a.get("visitor") or b.get("visitor"):
                result["visitor"] = {name: self._compare_objects(
                    a.get("visitor", {}).get(name, []), b.get("visitor", {}).get(name, []))
                    for name in ("editions", "reviews", "finding_history")}
            return result

    def backup(self, output):
        """Copy one coherent database, immutable sources and original native journal."""
        from govhub import GovHubError
        with self._native_storage_lease(exclusive=True) as available:
            if not available:
                raise GovHubError("BACKUP_NATIVE_ACTIVE", "A native operation is still writing its journal. Let that operation finish, or pause it and wait for its retained terminal result, then create this private backup.", 409)
            # An orphaned RUNNING record may still own a native child even after
            # its Python process disappeared. Reconcile it through the existing
            # worker before declaring a consistent private backup.
            with self.connect() as db:
                if db.execute("SELECT 1 FROM govhub_operations WHERE state='RUNNING' LIMIT 1").fetchone():
                    raise GovHubError("BACKUP_NATIVE_ACTIVE", "An original native operation is still marked running. Reopen its worker and reconcile the retained operation before backing up its command journal.", 409)
            return self._backup_locked(output)

    def _backup_locked(self, output):
        from govhub import GovHubError, now, packed
        target = Path(output)
        if not target.is_absolute() or target.exists():
            raise GovHubError("BACKUP_DIRECTORY", "Choose a new absolute backup directory.")
        target = target.parent.resolve() / target.name
        if target.is_relative_to(self.root):
            raise GovHubError("BACKUP_DIRECTORY", "Choose a backup destination outside the live workspace.")
        target.mkdir(mode=0o700, parents=True)
        marker = target / "BACKUP_INCOMPLETE"
        self._durable_file(marker, b"Backup in progress.")
        self._sync_dir(target)
        def copy_file(source, destination, expected=None):
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            descriptor = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
            before = os.fstat(descriptor)
            if not stat.S_ISREG(before.st_mode):
                os.close(descriptor)
                raise GovHubError("BACKUP_SOURCE", "The private backup contains a nonregular source; its incomplete marker is retained.", 503)
            h, size = hashlib.sha256(), 0
            with os.fdopen(descriptor, "rb") as original:
                output_descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(output_descriptor, "wb") as copy:
                    for chunk in iter(lambda: original.read(1024 * 1024), b""):
                        h.update(chunk)
                        size += len(chunk)
                        copy.write(chunk)
                    copy.flush()
                    os.fsync(copy.fileno())
                after = os.fstat(original.fileno())
            if any(getattr(before, key) != getattr(after, key) for key in ("st_size", "st_mtime_ns", "st_ino", "st_dev")) or size != before.st_size:
                raise GovHubError("BACKUP_SOURCE", "A private source changed during its copy; the backup remains incomplete.", 503)
            value = {"path": destination.relative_to(target).as_posix(), "sha256": h.hexdigest(), "size": size}
            if expected and (size != expected["bytes"] or value["sha256"] != expected["sha256"]):
                raise GovHubError("BACKUP_SOURCE", "A retained source is inconsistent; the backup remains incomplete.", 503)
            return value
        with self.connect(write=True) as db:
            out = sqlite3.connect(target / "assessment.sqlite3")
            reader = sqlite3.connect(self.db)
            try:
                reader.backup(out)
            finally:
                reader.close()
                out.close()
            sources = [dict(row) for row in db.execute("SELECT DISTINCT sha256,bytes FROM files")]
            metadata = {"format": "systems-review-private-backup/v1", "created_at": now(), "workspace": self.meta(db)["workspace"]}
        (target / "sources").mkdir(mode=0o700)
        for row in sources:
            source = self.blobs / row["sha256"]
            if source.is_symlink() or not source.is_file():
                raise GovHubError("BACKUP_SOURCE", "A retained source is unavailable; the backup remains incomplete.", 503)
            copy_file(source, target / "sources" / row["sha256"], row)
        native_files = []
        native_root = self.root / "native-operations"
        if native_root.exists() or native_root.is_symlink():
            if native_root.is_symlink() or not native_root.is_dir():
                raise GovHubError("BACKUP_NATIVE_SOURCE", "The original native journal must be a private regular directory.", 503)
            for directory, dirs, files in os.walk(native_root, followlinks=False):
                folder = Path(directory)
                if any((folder / name).is_symlink() for name in dirs):
                    raise GovHubError("BACKUP_NATIVE_SOURCE", "The native journal contains a directory link; the backup remains incomplete.", 503)
                destination = target / folder.relative_to(self.root)
                destination.mkdir(mode=0o700, parents=True, exist_ok=True)
                for name in sorted(files):
                    native_files.append(copy_file(folder / name, destination / name))
            for directory, _, _ in os.walk(target / "native-operations", topdown=False):
                self._sync_dir(Path(directory))
        roots = {str(self.root), *(item["from"] for item in self._workspace_relocations())}
        metadata["native_storage"] = {"format": "govhub-native-storage/1", "original_roots": sorted(roots), "files": sorted(native_files, key=lambda value: value["path"])}
        self._durable_file(target / "reconciliation.key", self.key.read_bytes())
        os.chmod(target / "assessment.sqlite3", 0o600)
        with (target / "assessment.sqlite3").open("rb") as file:
            os.fsync(file.fileno())
        self._durable_file(target / "backup.json", packed(metadata).encode("utf-8"))
        self._sync_dir(target / "sources")
        self._sync_dir(target)
        marker.unlink()
        self._sync_dir(target)
        self._sync_dir(target.parent)
        return {"directory": str(target), **{key: value for key, value in metadata.items() if key != "native_storage"}, "native_files": len(native_files), "native_bytes": sum(value["size"] for value in native_files)}
