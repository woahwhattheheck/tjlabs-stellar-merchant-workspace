"""Complete POTS project delivery through the original GovHub handover."""
from __future__ import annotations
import html
import json

from govhub import GovHubError, SOURCE, csv_bytes, now, packed, text

RECEIVING_GUIDE = """# POTS project handover

Open handover.html for the operating report. pots-projects.json retains every
selected project's scope versions, complete received run editions, linked
operating work and review. pots-runs.csv provides the run index. pots-jobs.csv
contains the native job outcomes; pots-deployments.csv keeps the Git event,
CI source, actual checkout and Pantheon deployed commits in separate columns.

All original API responses, native job stdout/stderr, artifacts and capture
source files are in the source-inclusive archive. source-manifest.json maps
their original workspace file IDs to the exact archived bytes. Each retained
run's manifest_file_id selects its original receiving manifest, and
retained_files maps its objects/ paths to these same workspace file IDs.

A capture's workflow:list observation labels its selected scope: the native
latest100 workflows or all available native pages. Selected workflow IDs carry
their own original status and
operations. Review the selected site and environment before continuing an
existing native operation. CI source and Pantheon built commits may legitimately
differ; use the original checkout, build configuration and deployment output to
review that transition. Native CircleCI approvals stay in the original pipeline.

Open the separate complete workspace backup with the same application for
editable recovery. It carries the database, project records, original source
store, staff accounts and operation journals. In the reopened application,
choose POTS delivery, open the selected project and run, inspect original job
output and the deployment context, then open linked native recovery and content
operations. Use the same operation identity when resuming interrupted work.
Create a new source-inclusive handover from that reopened project.

For another observation of a changing pipeline, receive its current run into a
new private receiving directory and import that edition into the same project.
An interrupted collector resumes its original directory and retained request.
The independent original CI job capture uses the already installed POTS version,
PHP runtime and Terminus binary; CAPTURE.md contains its installation steps.
"""


class PotsDeliveryMixin:
    def _handover_capture(self, db, payload, actor):
        selected = payload.get("pots_project_ids", [])
        if not selected:
            return super()._handover_capture(db, payload, actor)
        if (not isinstance(selected, list) or any(not isinstance(p, str) or not p for p in selected)
                or len(selected) != len(set(selected))):
            raise GovHubError("POTS_HANDOVER", "Select each original POTS project once.")
        if type(payload.get("include_sources")) is not bool:
            raise GovHubError("POTS_HANDOVER", "Choose whether to include all original source bytes.")
        bundles, family_ids, operation_ids = [], set(payload.get("content_family_ids", [])), set()
        for project_id in sorted(selected):
            project = self._pots_project(db, project_id)
            links = self._objects(db, "pots_link", project_id)
            editions = self._objects(db, "pots_run", project_id)
            bundles.append({
                "project": project, "versions": self._objects(db, "pots_project_version", project_id),
                "editions": editions, "links": links,
                "reviews": self._objects(db, "pots_review", project_id),
                "current_assessments": [self._pots_assessment(project, edition) for edition in editions],
            })
            for link in links:
                family_ids.update(link["content_family_ids"])
                operation_ids.update(link["operation_ids"])
        joined = dict(payload, content_family_ids=sorted(family_ids))
        if joined.get("plan_ids") or joined.get("visitor_edition_ids") or family_ids:
            capture = super()._handover_capture(db, joined, actor)
        else:
            meta = self.meta(db)
            capture = {
                "format": "govhub-cutover-handover/1", "name": text(payload.get("name", ""), 500, True),
                "observed_at": now(), "author": actor["name"], "workspace": meta["workspace"],
                "workspace_head": meta["head"], "source": SOURCE,
                "settings": self._setting(db, "settings"), "core_sources": self.core_sources,
                "auditor_sha256": self.auditor_sha256, "include_sources": payload["include_sources"],
                "plan_ids": [], "plans": [], "snapshots": [], "operations": [],
                "records": {"sites": [], "environments": [], "migration_issues": []},
                "record_history": [], "sources": [],
            }
        source_ids = {item["id"] for item in capture["sources"]}
        if capture["settings"].get("scope_file_id"):
            source_ids.add(capture["settings"]["scope_file_id"])
        environments, sites = set(), set()
        for bundle in bundles:
            project = bundle["project"]
            environments.add(project["environment_id"])
            if project.get("workspace_site_id"):
                sites.add(project["workspace_site_id"])
            scopes = [project] + [version["data"] for version in bundle["versions"]]
            source_ids.update(scope["scope_file_id"] for scope in scopes if scope.get("scope_file_id"))
            for edition in bundle["editions"]:
                source_ids.add(edition["manifest_file_id"])
                source_ids.update(item["id"] for item in edition["retained_files"])
        included = {item["operation"]["id"] for item in capture["operations"]}
        snapshot_ids = {item["id"] for item in capture["snapshots"]}
        for operation_id in sorted(operation_ids - included):
            row = db.execute("SELECT data FROM govhub_operations WHERE id=?", (operation_id,)).fetchone()
            if not row:
                raise GovHubError("POTS_OPERATION", "A selected original operation could not be reopened.", 409)
            operation = json.loads(row[0])
            native_files = self._output_list(db, "operation", operation_id)
            capture["operations"].append({
                "operation": operation, "events": self._objects(db, "operation_event", operation_id),
                "observations": self._objects(db, "operation_observation", operation_id), "files": native_files,
            })
            source_ids.update(item["file_id"] for item in native_files)
            environments.add(operation["environment_id"])
            for field in ("source_snapshot_id", "result_snapshot_id"):
                snapshot_id = operation.get(field)
                if snapshot_id and snapshot_id not in snapshot_ids:
                    snapshot = self._get(db, "snapshot", snapshot_id)
                    capture["snapshots"].append(snapshot)
                    snapshot_ids.add(snapshot_id)
                    source_ids.add(snapshot["file_id"])
                    for binding in snapshot.get("bindings", []):
                        for role in ("export", "backup"):
                            if binding.get(role):
                                source_ids.add(binding[role]["id"])
                        source_ids.update(item["file"]["id"] for item in binding.get("files", []))
        records = {(r["kind"], r["id"]) for rows in capture["records"].values() for r in rows}
        for row in db.execute("SELECT * FROM entities ORDER BY kind,id"):
            item = self._core.view_record(row)
            wanted = (item["kind"] == "environments" and item["id"] in environments
                      or item["kind"] == "sites" and item["id"] in sites)
            if wanted and (item["kind"], item["id"]) not in records:
                capture["records"][item["kind"]].append(item)
                records.add((item["kind"], item["id"]))
        revisions = {item["revision"] for item in capture["record_history"]}
        for row in db.execute("SELECT * FROM revisions ORDER BY rowid"):
            if (row["kind"], row["id"]) in records and row["revision"] not in revisions:
                item = dict(row)
                item["data"], item["origin"] = json.loads(row["data"]), json.loads(row["origin"])
                capture["record_history"].append(item)
        capture["sources"] = [self._file_row(db, identity) for identity in sorted(source_ids)]
        capture["pots_project_ids"] = sorted(selected)
        capture["pots"] = {"schema": "govhub.pots.handover/v1", "projects": bundles}
        return capture

    def _content_export_files(self, capture, write):
        super()._content_export_files(capture, write)
        pots = capture.get("pots")
        if not pots:
            return
        write("pots-projects.json", (packed(pots) + "\n").encode("utf-8"))
        runs, jobs, deployments = [], [], []
        for bundle in pots["projects"]:
            project = bundle["project"]
            for edition in bundle["editions"]:
                base = {"project_id": project["id"], "project": project["label"],
                        "edition_id": edition["id"], "run_id": edition["run_id"]}
                runs.append(dict(base, **{key: edition.get(key) for key in
                            ("received_at", "event_revision", "event_branch", "run_phase",
                             "run_outcome", "include_logs", "manifest_file_id", "manifest_sha256")}))
                jobs.extend(dict(base, **{key: job.get(key) for key in
                            ("id", "workflow_id", "name", "type", "phase", "outcome",
                             "started_at", "ended_at")}) for job in edition["jobs"])
                for observed in edition["contexts"]:
                    deployments.append(dict(base, **{key: observed.get(key) for key in
                        ("capture_id", "captured_at", "job_id", "execution", "artifact_path",
                         "site_id", "environment", "event_revision", "source_revision",
                         "checkout_revision", "deployed_commit", "workflow_scope")}))
        write("pots-runs.csv", csv_bytes(runs, (
            "project_id", "project", "edition_id", "run_id", "received_at", "event_revision",
            "event_branch", "run_phase", "run_outcome", "include_logs", "manifest_file_id", "manifest_sha256")))
        write("pots-jobs.csv", csv_bytes(jobs, (
            "project_id", "project", "edition_id", "run_id", "id", "workflow_id", "name",
            "type", "phase", "outcome", "started_at", "ended_at")))
        write("pots-deployments.csv", csv_bytes(deployments, (
            "project_id", "project", "edition_id", "run_id", "capture_id", "captured_at",
            "job_id", "execution", "artifact_path", "site_id", "environment", "event_revision",
            "source_revision", "checkout_revision", "deployed_commit", "workflow_scope")))
        write("POTS_RECEIVING.md", RECEIVING_GUIDE.encode("utf-8"))

    def _handover_html(self, capture):
        rendered = super()._handover_html(capture)
        if not capture.get("pots"):
            return rendered
        was_bytes = isinstance(rendered, bytes)
        document = rendered.decode("utf-8") if was_bytes else rendered
        esc = lambda value: html.escape(str(value if value is not None else "—"))
        sections = ['<section><h2>POTS delivery projects</h2>']
        for bundle in capture["pots"]["projects"]:
            project = bundle["project"]
            sections.append("<h3>" + esc(project["label"]) + "</h3><p>" + esc(project["scope_reference"]) + "</p>")
            sections.append("<dl><dt>Pantheon target</dt><dd>" + esc(project["site_id"]) + "." +
                            esc(project["target_environment"]) + "</dd><dt>CircleCI project</dt><dd>" +
                            esc(project["circle_project_id"]) + "</dd><dt>Owner</dt><dd>" + esc(project["owner"]) + "</dd></dl>")
            sections.append("<table><thead><tr><th>Run</th><th>Received</th><th>Phase</th><th>Outcome</th><th>Jobs</th><th>Artifacts</th></tr></thead><tbody>")
            for edition in bundle["editions"]:
                sections.append("<tr>" + "".join("<td>" + esc(value) + "</td>" for value in (
                    edition["run_id"], edition["received_at"], edition["run_phase"], edition["run_outcome"],
                    edition["counts"]["jobs"], edition["counts"]["artifacts"])) + "</tr>")
            sections.append("</tbody></table><h4>Operating review</h4>")
            for review in bundle["reviews"]:
                sections.append("<p><strong>" + esc(review["decision"]) + "</strong> · " +
                                esc(review["author"]) + " · " + esc(review["reviewed_at"]) + "</p><p>" +
                                esc(review["notes"]) + "</p>")
            sections.append("<h4>Recovery instruction</h4><p>" + esc(project["recovery_instruction"]) + "</p>")
        sections.append("<p>The complete original deployment contexts, source revisions, native output, scope versions and linked operations are retained in pots-projects.json and the source manifest.</p></section>")
        document = document.replace("</main>", "".join(sections) + "</main>")
        return document.encode("utf-8") if was_bytes else document

    def _exports_compare(self, payload):
        result = super()._exports_compare(payload)
        with self.connect(snapshot=True) as db:
            before = self._get(db, "export", payload.get("before_id"))
            after = self._get(db, "export", payload.get("after_id"))
            a = self._get(db, "export_intent", before["intent_id"])["capture"]
            b = self._get(db, "export_intent", after["intent_id"])["capture"]
        if a.get("pots") or b.get("pots"):
            def index(capture):
                return {item["project"]["id"]: item for item in capture.get("pots", {}).get("projects", [])}
            left, right = index(a), index(b)
            result["pots_projects"] = {
                "added": sorted(right.keys() - left.keys()), "removed": sorted(left.keys() - right.keys()),
                "changed": [identity for identity in sorted(left.keys() & right.keys())
                            if packed(left[identity]) != packed(right[identity])],
            }
        return result
