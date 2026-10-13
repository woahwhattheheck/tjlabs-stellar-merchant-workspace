"""POTS projects, original run editions and operating review in GovHub."""
from __future__ import annotations

from pathlib import Path
import json

from govhub import GovHubError, ident, now, packed, text
from .collector import identifier, strict_json
from .model import file_index, parse_receiving
from .delivery import PotsDeliveryMixin

MAX_JSON_BYTES = 32 * 1024**2


def selected_ids(payload, name):
    values = payload.get(name, [])
    if not isinstance(values, list) or any(not isinstance(v, str) or not v for v in values):
        raise GovHubError("POTS_SELECTION", "Select the original " + name.replace("_", " ") + ".")
    if len(values) != len(set(values)):
        raise GovHubError("POTS_SELECTION", "Select each original item once.")
    return values


def run_summary(edition):
    return {name: edition.get(name) for name in (
        "id", "project_id", "project_revision", "run_id", "run_number", "created_at", "author",
        "received_at", "event_revision", "event_branch", "run_phase", "run_outcome",
        "include_logs", "counts", "issues", "context_errors", "manifest_file_id", "sha256")}


class PotsMixin(PotsDeliveryMixin):
    def _pots_project(self, db, project_id):
        original = self._get(db, "pots_project", project_id)
        versions = self._objects(db, "pots_project_version", project_id)
        if versions:
            version = self._get(db, "pots_project_version", versions[-1]["id"])
            return dict(original, **version["data"], revision=version["id"])
        return dict(original, revision=original["id"])

    def _pots_summary(self, db):
        projects = []
        for original in self._objects(db, "pots_project"):
            project = self._pots_project(db, original["id"])
            runs = self._objects(db, "pots_run", project["id"])
            reviews = self._objects(db, "pots_review", project["id"])
            projects.append(dict(project, edition_count=len(runs),
                                 latest_run=run_summary(runs[-1]) if runs else None,
                                 latest_review=reviews[-1] if reviews else None))
        return {"projects": projects, "observed_at": now()}

    def _pots_save_project(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            environment = self._record_db(db, "environments", payload.get("environment_id"))
            if environment["archived"]:
                raise GovHubError("POTS_ENVIRONMENT", "Choose the current operating environment.")
            site_record = None
            if payload.get("workspace_site_id"):
                site_record = self._record_db(db, "sites", payload["workspace_site_id"])
                if site_record["archived"]:
                    raise GovHubError("POTS_SITE", "Choose the current site record.")
            try:
                circle_project = identifier(payload.get("circle_project_id"), "CircleCI project")
                native_site = identifier(payload.get("site_id"), "Pantheon site")
            except ValueError as exc:
                raise GovHubError("POTS_NATIVE_ID", str(exc)) from exc
            target = text(payload.get("target_environment", ""), 64, True)
            import re
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", target):
                raise GovHubError("POTS_TARGET", "Use the exact original Pantheon environment name.")
            source_file_id = text(payload.get("scope_file_id", ""), 240)
            if source_file_id:
                self._verify_file(self._file_row(db, source_file_id))
            data = {
                "label": text(payload.get("label", ""), 500, True),
                "circle_project_id": circle_project, "site_id": native_site,
                "target_environment": target, "environment_id": environment["id"],
                "workspace_site_id": site_record["id"] if site_record else "",
                "owner": text(payload.get("owner", actor["name"]), 500, True),
                "scope_reference": text(payload.get("scope_reference", ""), 16000, True),
                "scope_file_id": source_file_id,
                "recovery_instruction": text(payload.get("recovery_instruction", ""), 16000),
                "notes": text(payload.get("notes", ""), 16000),
            }
            if payload.get("project_id"):
                current = self._pots_project(db, payload["project_id"])
                if current["revision"] != payload.get("expected_revision"):
                    raise GovHubError("POTS_REVISION", "Reopen this project's current scope before editing it.", 409)
                for name in ("circle_project_id", "site_id", "target_environment", "environment_id"):
                    if data[name] != current[name]:
                        raise GovHubError("POTS_TARGET", "Create a project for the newly selected native target.", 409)
                self._object(db, "pots_project_version", {"project_id": current["id"], "data": data},
                             parent=current["id"], actor=actor["name"])
                project = self._pots_project(db, current["id"])
            else:
                project = self._object(db, "pots_project", data, actor=actor["name"], object_id=ident("pots-"))
                project["revision"] = project["id"]
            result = {"project": project}
            self._changed(db, actor, "pots.projects.save", "pots_project", project["id"])
            self._remember(db, key, fingerprint, result, actor)
            return result

    def _pots_json(self, item):
        if item["bytes"] > MAX_JSON_BYTES:
            raise GovHubError("POTS_JSON_SIZE", "Select the original JSON manifest within the 32 MiB parsing limit.")
        try:
            return strict_json(self._verify_file(item).read_bytes())
        except (ValueError, UnicodeError) as exc:
            raise GovHubError("POTS_JSON", "The retained native JSON could not be read: " + str(exc)) from exc

    def _pots_receive(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            project = self._pots_project(db, payload.get("project_id"))
            manifest_file = self._file_row(db, payload.get("manifest_file_id"))
            manifest = self._pots_json(manifest_file)
            try:
                expected = file_index(manifest)
            except (ValueError, TypeError, AttributeError) as exc:
                raise GovHubError("POTS_MANIFEST", str(exc)) from exc
            selections = payload.get("files")
            if not isinstance(selections, dict) or set(selections) != set(expected):
                raise GovHubError("POTS_FILES", "Retain and select every original file listed by this receiving manifest.")
            retained, paths = {}, {}
            for source_path, file_id in selections.items():
                item = self._file_row(db, file_id)
                if any(item[name] != expected[source_path][name] for name in ("bytes", "sha256")):
                    raise GovHubError("POTS_FILE_IDENTITY", "The selected original bytes differ: " + source_path, 409)
                paths[source_path] = self._verify_file(item)
                retained[source_path] = item
            def read_file(path):
                if expected[path]["bytes"] > MAX_JSON_BYTES:
                    raise ValueError("The original JSON observation exceeds the 32 MiB parsing limit.")
                return paths[path].read_bytes()
            try:
                native = parse_receiving(manifest, read_file)
            except (ValueError, TypeError, KeyError, AttributeError, UnicodeError) as exc:
                raise GovHubError("POTS_RECEIVING", str(exc)) from exc
            if native["project_id"] != project["circle_project_id"]:
                raise GovHubError("POTS_PROJECT", "This original run belongs to a different CircleCI project.")
            for previous in self._objects(db, "pots_run", project["id"]):
                if previous["manifest_sha256"] == manifest_file["sha256"]:
                    result = {"edition": run_summary(previous), "reopened": True}
                    self._remember(db, key, fingerprint, result, actor)
                    return result
            value = dict(native, native_project_id=native["project_id"], project_id=project["id"],
                         project_revision=project["revision"], manifest_file_id=manifest_file["id"],
                         manifest_sha256=manifest_file["sha256"],
                         retained_files=[dict(item, native_path=path) for path, item in retained.items()])
            edition = self._object(db, "pots_run", value, parent=project["id"], actor=actor["name"])
            result = {"edition": run_summary(edition), "contexts": edition["contexts"]}
            self._changed(db, actor, "pots.receive", "pots_run", edition["id"],
                          {"project_id": project["id"], "run_id": edition["run_id"], "files": len(retained)})
            self._remember(db, key, fingerprint, result, actor)
            return result

    def _pots_link(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            project = self._pots_project(db, payload.get("project_id"))
            operation_ids = selected_ids(payload, "operation_ids")
            family_ids = selected_ids(payload, "content_family_ids")
            if not operation_ids and not family_ids:
                raise GovHubError("POTS_LINK", "Select the existing operating work to connect to this project.")
            operations = []
            for operation_id in operation_ids:
                row = db.execute("SELECT data FROM govhub_operations WHERE id=?", (operation_id,)).fetchone()
                if not row:
                    raise GovHubError("POTS_OPERATION", "Choose an existing original native operation.")
                operation = json.loads(row[0])
                operations.append({name: operation.get(name) for name in
                                   ("id", "type", "state", "environment_id", "native_action", "content_family_id")})
            families = [self._content_family(db, identity) for identity in family_ids]
            edition_id = payload.get("edition_id") or ""
            if edition_id and self._get(db, "pots_run", edition_id)["project_id"] != project["id"]:
                raise GovHubError("POTS_RUN", "Select a run edition from this project.")
            link = self._object(db, "pots_link", {
                "project_id": project["id"], "project_revision": project["revision"], "edition_id": edition_id,
                "operation_ids": operation_ids, "content_family_ids": family_ids,
                "operations_at_link": operations,
                "families_at_link": [{"id": f["id"], "revision": f["revision"],
                                     "environment_id": f["environment_id"]} for f in families],
                "reason": text(payload.get("reason", ""), 16000, True),
            }, parent=project["id"], actor=actor["name"])
            result = {"link": link}
            self._changed(db, actor, "pots.links.save", "pots_link", link["id"])
            self._remember(db, key, fingerprint, result, actor)
            return result

    def _pots_assessment(self, project, edition):
        jobs = {job["id"]: job for job in edition["jobs"]}
        contexts = []
        for observed in edition["contexts"]:
            context = dict(observed)
            issues = list(observed["issues"])
            if observed["site_id"] != project["site_id"]:
                issues.append("This capture observed a different Pantheon site.")
            if observed["environment"] != project["target_environment"]:
                issues.append("This capture observed a different deployment environment.")
            job = jobs[observed["job_id"]]
            if job.get("phase") != "ended" or job.get("outcome") != "succeeded":
                issues.append("The original deployment job has not ended successfully.")
            context.update(issues=issues, matches_target=observed["site_id"] == project["site_id"]
                           and observed["environment"] == project["target_environment"],
                           job_name=job.get("name"), job_phase=job.get("phase"), job_outcome=job.get("outcome"))
            contexts.append(context)
        observations = list(edition["issues"])
        if not edition["include_logs"]:
            observations.append("This received edition intentionally omits the native job output streams.")
        if not contexts:
            observations.append("Receive the POTS deployment capture from the selected original job.")
        return {"project_id": project["id"], "project_revision": project["revision"],
                "edition_id": edition["id"], "run_id": edition["run_id"],
                "run_phase": edition["run_phase"], "run_outcome": edition["run_outcome"],
                "contexts": contexts, "observations": observations,
                "context_errors": edition["context_errors"]}

    def _pots_review(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            project = self._pots_project(db, payload.get("project_id"))
            edition = self._get(db, "pots_run", payload.get("edition_id"))
            if edition["project_id"] != project["id"]:
                raise GovHubError("POTS_REVIEW", "Choose the exact received edition of this project.")
            decision = payload.get("decision")
            if decision not in ("Reviewed", "Ready for handover", "Needs work"):
                raise GovHubError("POTS_REVIEW", "Choose the operating review decision.")
            assessment = self._pots_assessment(project, edition)
            review = self._object(db, "pots_review", {
                "project_id": project["id"], "project_revision": project["revision"],
                "edition_id": edition["id"], "edition_sha256": edition["sha256"],
                "decision": decision, "notes": text(payload.get("notes", ""), 32000, True),
                "assessment": assessment, "reviewed_at": now(),
            }, parent=project["id"], actor=actor["name"])
            result = {"review": review}
            self._changed(db, actor, "pots.reviews.save", "pots_review", review["id"])
            self._remember(db, key, fingerprint, result, actor)
            return result

    def _pots_project_get(self, payload):
        with self.connect(snapshot=True) as db:
            project = self._pots_project(db, payload.get("project_id"))
            editions = self._objects(db, "pots_run", project["id"])
            return {"project": project, "versions": self._objects(db, "pots_project_version", project["id"]),
                    "editions": [run_summary(e) for e in editions],
                    "links": self._objects(db, "pots_link", project["id"]),
                    "reviews": self._objects(db, "pots_review", project["id"]),
                    "latest_assessment": self._pots_assessment(project, editions[-1]) if editions else None}

    def _pots_run_get(self, payload):
        with self.connect(snapshot=True) as db:
            edition = self._get(db, "pots_run", payload.get("edition_id"))
            project = self._pots_project(db, edition["project_id"])
            return {"edition": edition, "project": project,
                    "manifest": self._file_row(db, edition["manifest_file_id"]),
                    "assessment": self._pots_assessment(project, edition)}

    def _pots_compare(self, payload):
        with self.connect(snapshot=True) as db:
            before = self._get(db, "pots_run", payload.get("before_id"))
            after = self._get(db, "pots_run", payload.get("after_id"))
            if before["project_id"] != after["project_id"]:
                raise GovHubError("POTS_COMPARE", "Choose two original received editions from this project.")
        def compare_rows(left, right, key):
            a, b = {key(row): row for row in left}, {key(row): row for row in right}
            return {"removed": [a[k] for k in sorted(a.keys() - b.keys())],
                    "added": [b[k] for k in sorted(b.keys() - a.keys())],
                    "changed": [{"key": k, "before": a[k], "after": b[k]}
                                for k in sorted(a.keys() & b.keys()) if packed(a[k]) != packed(b[k])]}
        return {"before": run_summary(before), "after": run_summary(after),
                "jobs": compare_rows(before["jobs"], after["jobs"], lambda row: row["id"]),
                "contexts": compare_rows(before["contexts"], after["contexts"],
                                        lambda row: (row["job_id"], row["execution"], row["artifact_path"])),
                "artifacts": compare_rows(before["artifacts"], after["artifacts"],
                                         lambda row: (row["job_id"], row["execution"], row["native_path"]))}

    def _pots_preview(self, payload):
        with self.connect(snapshot=True) as db:
            edition = self._get(db, "pots_run", payload.get("edition_id"))
            eligible = {f["id"]: f for f in edition["retained_files"]}
            if payload.get("file_id") == edition["manifest_file_id"]:
                eligible[payload["file_id"]] = self._file_row(db, payload["file_id"])
            item = eligible.get(payload.get("file_id"))
            if not item:
                raise GovHubError("POTS_FILE", "Choose an original file retained in this run edition.")
            path = self._verify_file(item)
        with path.open("rb") as original:
            raw = original.read(256 * 1024)
        try:
            rendered = raw.decode("utf-8")
            binary = "\x00" in rendered
        except UnicodeError:
            rendered, binary = "", True
        return {"file": item, "text": "" if binary else rendered, "binary": binary,
                "truncated": item["bytes"] > len(raw), "preview_bytes": len(raw)}

    def _pots_dispatch(self, action, payload, actor):
        actions = {
            "projects.save": lambda: self._pots_save_project(payload, actor),
            "projects.get": lambda: self._pots_project_get(payload),
            "receive": lambda: self._pots_receive(payload, actor),
            "runs.get": lambda: self._pots_run_get(payload),
            "runs.compare": lambda: self._pots_compare(payload),
            "links.save": lambda: self._pots_link(payload, actor),
            "reviews.save": lambda: self._pots_review(payload, actor),
            "files.preview": lambda: self._pots_preview(payload),
        }
        if action == "projects.list":
            with self.connect(snapshot=True) as db:
                return self._pots_summary(db)
        if action not in actions:
            raise GovHubError("POTS_ACTION", "Choose a supported POTS project action.", 404)
        return actions[action]()
