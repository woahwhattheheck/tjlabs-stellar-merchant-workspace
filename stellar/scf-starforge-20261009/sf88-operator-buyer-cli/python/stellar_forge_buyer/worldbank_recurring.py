"""Refresh an existing World Bank customer's reviewed Analysis programme.

The original source importer, DatasetChanges selection, saved report publisher,
WorkbookRefresh and workspace archive own every data and publication transition.
Programme and operation records live in the same SQLite database as their native
jobs, so a customer restore carries the complete continuation identities.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from copy import deepcopy
import json
from pathlib import Path
import re
import sys

from .analysis_workspace import AnalysisWorkspace
from .response_documents import document_path
from .storage import private_directory
from .worldbank_analysis import (
    WorldBankAnalysis, SCHEMA as ANALYSIS_SCHEMA, MAX_DOCUMENT, MAX_PACKAGE,
    describe, encoded, regular, require, sha, write,
)

SCHEMA = "stellar-forge.worldbank-recurring.v1"
PROGRAMMES = "sf_worldbank_programmes"
EDITIONS = "sf_worldbank_recurring_editions"
DEFAULT_KEYS = ["source_id", "country_iso3", "indicator_id", "period", "aggregate"]


def _name(value):
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", value),
            "Choose a programme name of at most 64 letters, digits, underscores or hyphens.")
    return value


def _operation(value):
    require(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{32}", value),
            "Use the original 32-character lowercase hexadecimal operation ID.")
    return value


def _selection(value):
    require(isinstance(value, dict), "Retain the original World Bank selection.")
    return {"sourceId": str(value["sourceId"]), "countries": sorted(value["countries"]),
            "indicators": sorted(value["indicators"]), "date": value["date"]}


def _cohort(value):
    selection = _selection(value)
    return {key: selection[key] for key in ("sourceId", "countries", "indicators")}


def _accepted_source(workspace, name, version_id):
    manifest = workspace.database.manifest(version_id)
    require(manifest.get("name") == name, "The current view belongs to another registered source.")
    with workspace.database._connection(readonly=True) as db:
        revisions = [row[0] for row in db.execute(
            "SELECT revision FROM sf_analysis_response_sources WHERE name=? ORDER BY revision DESC", (name,))]
        for revision in revisions:
            record = workspace.responses._source(db, name, revision)
            if record["source_sha256"] == manifest.get("sourceBindingSha256"):
                return record
    raise ValueError("The accepted view's original source revision is missing.")


def _tables(workspace):
    with workspace.database._connection() as db:
        db.executescript("""
CREATE TABLE IF NOT EXISTS sf_worldbank_programmes(
 name TEXT PRIMARY KEY,record TEXT NOT NULL,sha256 TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sf_worldbank_recurring_editions(
 operation_id TEXT PRIMARY KEY,programme TEXT NOT NULL,record TEXT NOT NULL,sha256 TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sf_worldbank_recurring_programme
 ON sf_worldbank_recurring_editions(programme,operation_id);
""")


def _read(workspace, table, key):
    column = "name" if table == PROGRAMMES else "operation_id"
    with workspace.database._connection(readonly=True) as db:
        row = db.execute("SELECT record,sha256 FROM " + table + " WHERE " + column + "=?", (key,)).fetchone()
    if row is None:
        return None
    raw = row["record"].encode()
    require(sha(raw) == row["sha256"], "The retained recurring record changed.")
    return json.loads(raw)


def _save_edition(workspace, record):
    raw = encoded(record)
    with workspace.database._connection() as db:
        db.execute("BEGIN IMMEDIATE")
        old = db.execute("SELECT programme FROM " + EDITIONS + " WHERE operation_id=?",
                         (record["operation_id"],)).fetchone()
        require(old is None or old["programme"] == record["programme"],
                "This operation ID belongs to another programme.")
        db.execute("INSERT INTO " + EDITIONS + " VALUES(?,?,?,?) "
                   "ON CONFLICT(operation_id) DO UPDATE SET record=excluded.record,sha256=excluded.sha256",
                   (record["operation_id"], record["programme"], raw.decode(), sha(raw)))
        db.commit()


def _programme(workspace, name):
    record = _read(workspace, PROGRAMMES, _name(name))
    require(record is not None, "Create this recurring programme from its existing customer view first.")
    require(record["workspace_id"] == workspace.identity, "Open the original customer Analysis workspace.")
    return record


def _source(workspace, name):
    values = [row for row in workspace.state()["sources"] if row["name"] == name]
    require(len(values) == 1 and values[0].get("input_kind") == "document",
            "Select the existing retained World Bank document source.")
    return values[0]


def _worldbank_source(workspace, source):
    opened = workspace.responses._open(source)
    opened.check_inputs()
    with opened.file.open():
        pass
    path = document_path(workspace.database.directory, source["document_id"])
    manifest = json.loads(regular(path))
    require(manifest.get("provenance", {}).get("publisher") == "World Bank",
            "The selected document is not the original World Bank source.")
    originals = {item["role"]: item for item in manifest.get("originals", [])}
    item = originals.get("original-source.json")
    require(item is not None, "Select the complete original World Bank Analysis document.")
    body = regular(path.parent / item["path"], MAX_DOCUMENT)
    require(len(body) == item["bytes"] and sha(body) == item["sha256"],
            "The retained original World Bank metadata changed.")
    result = json.loads(body)
    require(result.get("schema") == "stellar-forge.worldbank-export.v1",
            "The selected document does not contain an original World Bank export.")
    return result


class _NativeOperation(WorldBankAnalysis):
    """Use original job continuation while recording every identity in SQLite."""

    def __init__(self, owner, edition, workspace=None):
        self.owner = owner
        self.workspace = owner.workspace
        self.operation_id = edition["operation_id"]
        self.directory = private_directory(
            owner.workspace / "worldbank-recurring" / self.operation_id, create=True)
        self.progress = owner.progress
        self.edition = edition
        self.active_workspace = workspace
        self.record = deepcopy(edition.get("engine") or {
            "schema": ANALYSIS_SCHEMA, "operation_id": self.operation_id, "jobs": {}, "queries": {}})
        require(self.record["operation_id"] == self.operation_id,
                "Continue the original recurring native operation.")

    def save(self):
        self.edition["engine"] = deepcopy(self.record)
        if self.active_workspace is not None:
            _save_edition(self.active_workspace, self.edition)
        write(self.directory / "operation.json", encoded(self.record))

    def job(self, workspace, phase, kind, payload, *, resume=False):
        attempts = self.record["jobs"].get(phase) or []
        if attempts:
            selected = attempts[-1]
            require(selected["kind"] == kind and
                    selected["request_sha256"] == sha(encoded({"kind": kind, "request": payload})),
                    "The retained native phase selects another request.")
            try:
                existing = workspace.job(selected["id"])
            except Exception as error:
                if getattr(error, "code", None) != "ANALYSIS_JOB_NOT_FOUND":
                    raise
            else:
                # Reopening an already completed comparison must not re-run its
                # pre-selection guard after that exact comparison was selected.
                if existing["status"] == "COMPLETE":
                    return existing
        return super().job(workspace, phase, kind, payload, resume=resume)

    def completed(self):
        return None

    def project(self, handover, core, *, resume):
        # The caller supplies original source bytes again only for an unfinished
        # preview. _prepare validates/imports/re-exports them with the unchanged
        # World Bank core before the native Analysis handoff below.
        import fcntl
        import os
        descriptor = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return self._prepare(handover, core, prefix="recurring", resume=resume)
        finally:
            os.close(descriptor)

    def _prepare_analysis(self, workspace, document, name, source, review,
                          rows, columns, selected_recipes, max_rows, *, resume):
        _tables(workspace)
        current = _read(workspace, EDITIONS, self.operation_id)
        require(current is not None and current["intent"] == self.edition["intent"],
                "The original recurring source intent changed.")
        # Source validation may have populated the engine before the workspace
        # lock was available. Native jobs remain authoritative in the database.
        self.edition = current
        self.active_workspace = workspace
        if current.get("review"):
            return self.owner._summary(current)
        self.record["jobs"] = deepcopy(current.get("engine", {}).get("jobs", {}))
        programme = _programme(workspace, current["programme"])
        require(_cohort(source["selection"]) == _cohort(programme["selection"]),
                "This handover changes the programme\'s source/countries/indicators; create a separately named programme.")
        self.owner._check_baseline(workspace, current, definitions=True)
        registered = workspace.responses.register(
            programme["source"], "document", manifest=document / "source.json",
            expected_revision=current["baseline"]["source_revision"])
        self.save()
        preview = self.job(workspace, "SOURCE_PREVIEW", "response-preview", {
            "source": programme["source"], "source_revision": registered["revision"],
            "mapping": {"collection": "/observations", "sse_data": "text",
                        "columns": [{"name": c, "pointer": "/" + c, "type": "native", "missing": "error"}
                                    for c in columns]}}, resume=resume)
        imported = self.job(workspace, "SOURCE_IMPORT", "response-import", {
            "preview_id": preview["id"], "preview_sha256": preview["result"]["preview_sha256"],
            "allow_incomplete": False}, resume=resume)
        version = imported["result"]["version"]
        require(version["row_count"] == len(rows), "The original source projection row count differs.")
        comparison = self.job(workspace, "COMPARE", "compare", {
            "view": programme["view"], "expected_revision": current["baseline"]["view"]["revision"],
            "base_version_id": current["baseline"]["view"]["version_id"],
            "candidate_version_id": version["version_id"], "keys": programme["keys"]}, resume=resume)
        proposed = {
            "schema": SCHEMA, "workspace_id": workspace.identity,
            "programme": programme["name"], "operation_id": self.operation_id,
            "baseline": current["baseline"], "source": self.record["source"],
            "source_revision": registered["revision"], "source_document_id": registered["document_id"],
            "source_selection": {"before": current["baseline"]["source_selection"],
                                 "after": _selection(source["selection"])},
            "candidate_version_id": version["version_id"],
            "comparison_id": comparison["id"], "comparison": comparison["result"],
            "report": current["report"], "workbook": current["workbook"],
        }
        current["review"] = proposed
        current["review_sha256"] = sha(encoded(proposed))
        current["status"] = "REVIEW_READY"
        current["engine"] = deepcopy(self.record)
        _save_edition(workspace, current)
        self.emit("REVIEW_READY", review_sha256=current["review_sha256"])
        return self.owner._summary(current)


class WorldBankRecurring:
    def __init__(self, workspace, *, progress=None):
        self.workspace = private_directory(Path(workspace).expanduser().absolute(), create=False)
        self.progress = progress or (lambda value: None)

    @contextmanager
    def _open(self):
        workspace = AnalysisWorkspace(self.workspace)
        try:
            _tables(workspace)
            yield workspace
        finally:
            workspace.close()

    @staticmethod
    def _summary(edition):
        return {"schema": SCHEMA, "programme": edition["programme"],
                "operation_id": edition["operation_id"], "status": edition["status"],
                **{key: edition[key] for key in (
                    "review_sha256", "review", "selection", "publication", "workbook_result",
                    "workbook_review", "mapping_request", "result", "files") if key in edition}}

    def create(self, programme, *, view, report, workbook, source=None, keys=None):
        programme = _name(programme)
        source = source or view
        selected_keys = list(DEFAULT_KEYS if keys is None else keys)
        require(1 <= len(selected_keys) <= 16 and len(set(selected_keys)) == len(selected_keys)
                and all(isinstance(key, str) and key for key in selected_keys),
                "Select one to sixteen distinct original observation key columns.")
        binding = {"name": programme, "view": _name(view), "source": _name(source),
                   "report": _name(report), "workbook": _name(workbook), "keys": selected_keys}
        with self._open() as workspace:
            old = _read(workspace, PROGRAMMES, programme)
            if old is not None:
                require(all(old.get(key) == value for key, value in binding.items()),
                        "An existing programme name has another original customer binding.")
                return old
            current = workspace.database.current(view)
            require(current["version"] is not None, "Select an existing accepted Analysis view.")
            registered = _source(workspace, source)
            original = _worldbank_source(workspace, registered)
            manifest = workspace.database.manifest(current["version"]["version_id"])
            require(manifest.get("sourceBindingSha256") == registered["source_sha256"]
                    and manifest.get("name") == source,
                    "The selected view does not contain this current World Bank document source.")
            require(set(selected_keys) <= {c["column"] for c in current["version"]["column_types"]},
                    "The selected observation keys are absent from the original view.")
            report_definition = workspace.reports.definition(report)
            workbook_definition = workspace.workbooks.definition(workbook)
            refresh = workspace.workbooks.refresh
            linked = [i for i, sheet in enumerate(workbook_definition["definition"]["sheets"])
                      if sheet["source"]["kind"] == "report"
                      and refresh._lineage(sheet["source"])["report_name"] == report]
            require(linked, "Select a workbook containing the original saved report's published sections.")
            value = {**binding, "schema": SCHEMA, "workspace_id": workspace.identity,
                     "selection": _selection(original["selection"]),
                     "created_from": {"view_revision": current["revision"],
                                      "version_id": current["version"]["version_id"],
                                      "document_id": registered["document_id"],
                                      "report_revision": report_definition["definition"]["revision"],
                                      "workbook_revision": workbook_definition["definition"]["revision"]}}
            raw = encoded(value)
            with workspace.database._connection() as db:
                db.execute("INSERT INTO " + PROGRAMMES + " VALUES(?,?,?)",
                           (programme, raw.decode(), sha(raw)))
                db.commit()
            return value

    def status(self, programme=None, operation_id=None):
        with self._open() as workspace:
            if operation_id is not None:
                edition = _read(workspace, EDITIONS, _operation(operation_id))
                require(edition is not None and (programme is None or edition["programme"] == programme),
                        "This recurring operation is not registered in the selected programme.")
                return self._summary(edition)
            with workspace.database._connection(readonly=True) as db:
                names = [row[0] for row in db.execute("SELECT name FROM " + PROGRAMMES + " ORDER BY name")]
                ids = [row[0] for row in db.execute("SELECT operation_id FROM " + EDITIONS +
                     ("" if programme is None else " WHERE programme=?") + " ORDER BY rowid",
                     () if programme is None else (programme,))]
            return {"schema": SCHEMA, "workspace_id": workspace.identity,
                    "programmes": [_programme(workspace, name) for name in names
                                   if programme is None or name == programme],
                    "editions": [self._summary(_read(workspace, EDITIONS, key)) for key in ids]}

    @staticmethod
    def _check_baseline(workspace, edition, *, definitions):
        baseline = edition["baseline"]
        current = workspace.database.current(baseline["view"]["name"])
        require(current["version"] is not None and current["revision"] == baseline["view"]["revision"]
                and current["version"]["version_id"] == baseline["view"]["version_id"],
                "The accepted customer view changed; review a new operation against its current edition.")
        require(workspace.database.view_bindings() == baseline["views"],
                "A reviewed Analysis view changed before source selection.")
        if definitions:
            report = workspace.reports.definition(edition["report"]["definition"]["name"])
            book = workspace.workbooks.definition(edition["workbook"]["definition"]["name"])
            require(report["sha256"] == edition["report"]["sha256"]
                    and report["head_revision"] == edition["report"]["head_revision"]
                    and report["publication_revision"] == edition["report"]["publication_revision"],
                    "The customer's report changed; preview a new operation to preserve that edition.")
            require(book["definition_sha256"] == edition["workbook"]["definition_sha256"]
                    and book["head_revision"] == edition["workbook"]["head_revision"],
                    "The customer's workbook changed; preview a new operation to preserve that edition.")

    def preview(self, programme, *, operation_id, handover, core, resume=False):
        programme, operation_id = _name(programme), _operation(operation_id)
        raw = regular(handover, MAX_PACKAGE)
        core = Path(core).expanduser().resolve(strict=True)
        require(core.name == "core.py", "Select the maintained World Bank core.py.")
        intent = {"programme": programme, "operation_id": operation_id,
                  "handover": {"bytes": len(raw), "sha256": sha(raw)},
                  "source_engine": {"core_sha256": sha(regular(core)),
                                    "source_sha256": sha(regular(core.parent / "source.py"))}}
        with self._open() as workspace:
            selected = _programme(workspace, programme)
            edition = _read(workspace, EDITIONS, operation_id)
            if edition is not None:
                require(edition["intent"] == intent, "The original operation selects another handover or source engine.")
                if edition.get("review"):
                    return self._summary(edition)
            else:
                current = workspace.database.current(selected["view"])
                require(current["version"] is not None, "The programme's accepted view is missing.")
                registered = _source(workspace, selected["source"])
                accepted_source = _accepted_source(workspace, selected["source"], current["version"]["version_id"])
                original = _worldbank_source(workspace, accepted_source)
                require(_cohort(original["selection"]) == _cohort(selected["selection"]),
                        "The current accepted view now belongs to a different source cohort.")
                edition = {"schema": SCHEMA, "programme": programme, "operation_id": operation_id,
                           "intent": intent, "status": "PREPARING",
                           "baseline": {"view": {"name": selected["view"], "revision": current["revision"],
                                                "version_id": current["version"]["version_id"]},
                                        "views": workspace.database.view_bindings(),
                                        "source_revision": registered["revision"],
                                        "source_selection": _selection(original["selection"]),
                                        "accepted_document_id": accepted_source["document_id"]},
                           "report": workspace.reports.definition(selected["report"]),
                           "workbook": workspace.workbooks.definition(selected["workbook"])}
                _save_edition(workspace, edition)
        # No second Analysis owner remains open during original core receiving.
        native = _NativeOperation(self, edition)
        return native.project(handover, core, resume=resume)

    def apply(self, programme, *, operation_id, review_sha256, reason,
              workbook_recipe=None, resume=False):
        programme, operation_id = _name(programme), _operation(operation_id)
        require(isinstance(reason, str) and reason.strip() and len(reason.encode()) <= 8000,
                "Record the reason for accepting this exact source and workbook edition.")
        with self._open() as workspace:
            selected = _programme(workspace, programme)
            edition = _read(workspace, EDITIONS, operation_id)
            require(edition is not None and edition["programme"] == programme and edition.get("review"),
                    "Preview the complete retained handover before applying it.")
            require(edition["review_sha256"] == review_sha256
                    and sha(encoded(edition["review"])) == review_sha256,
                    "Select the exact reviewed source comparison.")
            accepted = {"review_sha256": review_sha256, "reason": reason}
            if "acceptance" in edition:
                require(edition["acceptance"] == accepted, "Continue the original recorded acceptance reason and review.")
            else:
                edition["acceptance"] = accepted
                _save_edition(workspace, edition)
            native = _NativeOperation(self, edition, workspace)
            already_complete = edition.get("status") in {"PUBLISHED", "COMPLETE"}
            if not already_complete:
                page = workspace.changes.page(edition["review"]["comparison_id"], limit=1)
                selection = page["selection"]
                expected_selection = native.identifier("source-selection")
                if selection is None:
                    self._check_baseline(workspace, edition, definitions=True)
                else:
                    require(selection["id"] == expected_selection,
                            "Another review already selected this comparison.")
                selection = workspace.changes.select(edition["review"]["comparison_id"], {
                    "id": expected_selection,
                    "result_sha256": edition["review"]["comparison"]["result_sha256"], "note": reason})
                edition["selection"] = selection
                edition["status"] = "SOURCE_SELECTED"
                native.save()
                expected_views = deepcopy(edition["baseline"]["views"])
                for binding in expected_views:
                    if binding["name"] == selected["view"]:
                        binding.update(revision=selection["activation"]["revision"],
                                       version_id=selection["activation"]["version"]["version_id"])
                definition = edition["report"]
                report = native.job(workspace, "REPORT", "report", {
                    "name": selected["report"], "revision": definition["definition"]["revision"],
                    "definition_sha256": definition["sha256"], "expected_views": expected_views}, resume=resume)
                publication = workspace.reports.publish(report["id"], {
                    "id": native.identifier("report-publication"),
                    "result_sha256": report["result"]["result_sha256"],
                    "expected_revision": definition["publication_revision"], "note": reason})
                first = workspace.workbooks.source({"kind": "report", "id": publication["id"], "section": 0})
                edition["publication"] = {**publication, "sha256": first["sha256"]}
                native.save()
                outcome = self._refresh_workbook(workspace, native, selected, workbook_recipe, resume=resume)
                if outcome is not None:
                    return outcome
                edition["status"] = "PUBLISHED"
                edition["result"] = {"schema": SCHEMA, "programme": programme,
                    "operation_id": operation_id, "review_sha256": review_sha256,
                    "selection": selection, "report": edition["publication"],
                    "workbook": edition["workbook_result"],
                    "source": edition["review"]["source"], "workspace_id": workspace.identity}
                native.save()
            elif workbook_recipe is not None:
                require(edition.get("workbook_recipe_input") == workbook_recipe,
                        "This completed operation already selected another workbook recipe.")
            reopened = self._reopen_completed(workspace, native) if already_complete else None
            return reopened if reopened is not None else self._deliver(workspace, native, resume=resume)

    def _reopen_completed(self, workspace, native):
        edition = native.edition
        require(edition["status"] in {"PUBLISHED", "COMPLETE"}, "Complete the source/report/workbook operation first.")
        publication = edition["publication"]
        source = workspace.workbooks.source({"kind": "report", "id": publication["id"], "section": 0})
        require(source["sha256"] == publication["sha256"], "The original published report changed.")
        book = edition["workbook_result"]
        with workspace.workbooks.download(book["job_id"], "manifest.json") as (stream, descriptor):
            body = stream.read()
        require(sha(body) == book["manifest_sha256"] == descriptor["sha256"]
                and len(body) == descriptor["bytes"], "The retained workbook manifest changed.")
        page = workspace.changes.page(edition["review"]["comparison_id"], limit=1)
        require(page["selection"] == edition["selection"]
                and page["report"]["result_sha256"] == edition["review"]["comparison"]["result_sha256"],
                "The original source review changed.")
        with workspace.database._connection(readonly=True) as db:
            db.execute("BEGIN")
            workspace.changes._verify_rows(db, page["report"])
        destination = native.directory / "delivery"
        if edition.get("files") and destination.is_dir():
            for item in edition["files"]:
                require(describe(destination / item["filename"]) == item,
                        "A completed recurring delivery changed: " + item["filename"])
            delivery = json.loads(regular(destination / "Recurring_Delivery.json"))
            return {**self._summary(edition), "directory": str(destination), "delivery": delivery, "reused": True}
        marker = workspace.database.directory / "workspace-archive-receipt.json"
        archive_attempts = edition.get("engine", {}).get("jobs", {}).get("WORKSPACE_ARCHIVE") or []
        if marker.exists() and archive_attempts:
            receiving = json.loads(regular(marker))
            require(receiving.get("schema") == "stellar-forge.analysis-workspace-receipt.v1"
                    and receiving.get("workspace_id") == workspace.identity,
                    "The original portable receiving identity changed.")
            received_job = workspace.job(receiving["archive_id"])
            original_job = workspace.job(archive_attempts[-1]["id"])
            if received_job["sequence"] < original_job["sequence"]:
                return None
            # The portable archive carries completed native data, but does not
            # recursively carry its own ZIP or arbitrary producer directories.
            # Reopening this completed business edition must not rebuild that
            # historical archive ID from a later customer's edited database.
            edition["status"] = "COMPLETE"
            native.save()
            return {**self._summary(edition), "receiving": receiving, "reused": True}
        return None

    def _refresh_workbook(self, workspace, native, programme, supplied, *, resume):
        edition = native.edition
        base = edition["workbook"]
        refresh = workspace.workbooks.refresh
        if "workbook_definition" not in edition:
            if "workbook_recipe_input" in edition:
                require(supplied is None or edition["workbook_recipe_input"] == supplied,
                        "Continue the exact recorded workbook column choices.")
                supplied = edition["workbook_recipe_input"]
            proposed = deepcopy(base["definition"])
            publication_id = edition["publication"]["id"]
            unresolved = []
            related = []
            for index, sheet in enumerate(base["definition"]["sheets"]):
                lineage = refresh._lineage(sheet["source"])
                if lineage["kind"] != "report" or lineage["report_name"] != programme["report"]:
                    continue
                related.append(index)
                candidates, before = [], None
                while True:
                    page = refresh.candidates(programme["workbook"], revision=base["definition"]["revision"],
                                              sheet=index, before=before, limit=100)
                    candidates.extend(item for item in page["items"] if item["source"]["id"] == publication_id)
                    if page["next_before"] is None:
                        break
                    before = page["next_before"]
                require(len(candidates) == 1, "Review the saved report's changed section identity before workbook refresh.")
                candidate = candidates[0]
                proposed["sheets"][index]["source"] = candidate["source"]
                proposed["sheets"][index]["columns"] = candidate["suggested_columns"]
                unresolved.extend({"sheet": index, **item} for item in candidate["unresolved_columns"])
            require(related, "The selected workbook no longer contains the programme's report.")
            recipe = {"base_revision": base["definition"]["revision"],
                      "definition_sha256": base["definition_sha256"],
                      "expected_revision": base["head_revision"],
                      "reason": edition["acceptance"]["reason"], "definition": proposed}
            if supplied is not None:
                require(isinstance(supplied, dict) and all(supplied.get(key) == recipe[key]
                        for key in ("base_revision", "definition_sha256", "expected_revision", "reason")),
                        "The workbook recipe must retain this reviewed customer definition and reason.")
                proposed = supplied.get("definition")
                require(isinstance(proposed, dict) and proposed.get("name") == programme["workbook"]
                        and len(proposed.get("sheets", [])) == len(base["definition"]["sheets"]),
                        "Keep all original workbook sheet positions.")
                for index, (old, new) in enumerate(zip(base["definition"]["sheets"], proposed["sheets"])):
                    if index in related:
                        require(new.get("source") == recipe["definition"]["sheets"][index]["source"],
                                "Select the exact new publication and reviewed source section.")
                    else:
                        require(new == old, "Preserve unrelated customer workbook sheets unchanged.")
                recipe = {**recipe, "definition": proposed}
            elif unresolved:
                edition["status"] = "WORKBOOK_REVIEW_REQUIRED"
                edition["mapping_request"] = {"recipe": recipe, "unresolved_columns": unresolved}
                native.save()
                return self._summary(edition)
            reviewed = refresh.review(programme["workbook"], recipe)
            if not reviewed["ready"]:
                edition["status"] = "WORKBOOK_REVIEW_REQUIRED"
                edition["workbook_review"] = reviewed
                edition["mapping_request"] = {"recipe": recipe, "unresolved_columns": []}
                native.save()
                return self._summary(edition)
            # Retain the full accepted request before the original CAS save.
            if supplied is not None:
                edition["workbook_recipe_input"] = deepcopy(supplied)
            edition["workbook_request"] = {**recipe, "id": native.identifier("workbook-refresh"),
                                          "review_sha256": reviewed["review_sha256"]}
            edition["workbook_review"] = reviewed
            native.save()
            saved = refresh.save(programme["workbook"], edition["workbook_request"])
            edition["workbook_definition"] = saved
            edition.pop("mapping_request", None)
            native.save()
        if supplied is not None:
            require(edition.get("workbook_recipe_input") == supplied,
                    "This operation already saved another exact workbook recipe.")
        saved = edition["workbook_definition"]
        job = native.job(workspace, "WORKBOOK", "workbook", {
            "name": programme["workbook"], "revision": saved["revision"],
            "definition_sha256": saved["definition_sha256"]}, resume=resume)
        edition["workbook_result"] = {"name": programme["workbook"], "revision": saved["revision"],
            "definition_sha256": saved["definition_sha256"], "job_id": job["id"],
            "manifest_sha256": job["result"]["manifest_sha256"], "rows": job["result"]["row_count"]}
        native.save()
        return None

    def _deliver(self, workspace, native, *, resume):
        """Reopen original outputs; rebuilding delivery never rewrites a query."""
        edition = native.edition
        destination = private_directory(native.directory / "delivery", create=True)
        files = []
        def retain(body, descriptor, filename):
            require(len(body) == descriptor["bytes"] and sha(body) == descriptor["sha256"],
                    "The original native output changed: " + filename)
            write(destination / filename, body, exact=True)
            files.append(describe(destination / filename))
        def download(manager, job_id, name, filename):
            with manager.download(job_id, name) as (stream, descriptor):
                retain(stream.read(), descriptor, filename)
        book = edition["workbook_result"]
        download(workspace.workbooks, book["job_id"], "workbook.xlsx", "WorldBank_Updated_Workbook.xlsx")
        download(workspace.workbooks, book["job_id"], "handoff.zip", "WorldBank_Workbook_Handover.zip")
        publication = edition["publication"]
        for format, filename in (("html", "WorldBank_Report.html"), ("json", "WorldBank_Report.json"),
                                 ("csv", "WorldBank_Report_Tables.zip")):
            job = native.job(workspace, "REPORT_" + format.upper(), "report-export", {
                "publication_id": publication["id"], "publication_sha256": publication["sha256"],
                "format": format}, resume=resume)
            path, descriptor = workspace.report_export_file(job["id"])
            retain(regular(path, 1024**3), descriptor, filename)
        page = workspace.changes.page(edition["review"]["comparison_id"], limit=1)
        selection = page["selection"]
        require(selection == edition["selection"], "The retained source-selection record changed.")
        change_job = native.job(workspace, "SOURCE_CHANGES", "change-export", {
            "comparison_id": edition["review"]["comparison_id"],
            "result_sha256": edition["review"]["comparison"]["result_sha256"],
            "selection_sha256": page["selection_sha256"], "format": "json"}, resume=resume)
        changed = change_job["result"]
        # Paths in a result are producer provenance; resolve its declared name
        # from the original receiving directory after a portable restoration.
        change_path = workspace.database.directory / "analysis-exports" / changed["filename"]
        retain(regular(change_path, 1024**3), changed, "WorldBank_Reviewed_Changes.json")
        availability = workspace.archives.review(include_previous_backups=False)
        require(availability["ready"], "Retain the missing original outputs before workspace export: " +
                json.dumps(availability.get("missing", [])))
        archived = native.job(workspace, "WORKSPACE_ARCHIVE", "workspace-export",
                             {"include_previous_backups": False}, resume=resume)
        download(workspace.archives, archived["id"], "workspace.zip", "WorldBank_Recurring_Workspace.zip")
        download(workspace.archives, archived["id"], "archive-manifest.json", "WorldBank_Workspace_Manifest.json")
        guide = (
            "# Continue your World Bank programme\n\n"
            "Open WorldBank_Report.html and WorldBank_Updated_Workbook.xlsx for the accepted edition. "
            "WorldBank_Reviewed_Changes.json retains the complete original observation comparison and acceptance. "
            "Numeric source tokens remain text; missing observations remain missing. Derived calculations retain "
            "the customer's saved SQL and workbook choices.\n\n"
            "WorldBank_Workbook_Handover.zip is the original portable workbook with its predecessor history. "
            "Receive the full workspace into a new private directory, using its SHA256 in Recurring_Delivery.json:\n\n"
            "    starforge worldbank-product analysis receive --archive /absolute/WorldBank_Recurring_Workspace.zip "
            "--sha256 <archive-sha256> --workspace /absolute/new-private-directory --operation-id <uuid32>\n\n"
            "Open that original Analysis application:\n\n"
            "    starforge worldbank-product analysis serve --workspace /absolute/new-private-directory\n\n"
            "Continue the same queries, reports and workbook. "
            "The programme and all source-review identities are included in its database.\n\n"
            "A later handover is first previewed against the current accepted view. "
            "Apply its exact review digest only after reviewing additions, removals and revisions. "
            "A workbook column that cannot be matched uniquely needs an explicit retained recipe. "
            "A saved customer edit changes the review basis; preview a new operation instead of overwriting it.\n"
        ).encode()
        write(destination / "Open_and_use.md", guide, exact=True)
        files.append(describe(destination / "Open_and_use.md"))
        delivery = {**edition["result"], "workspace_archive": {
            "id": archived["id"], "workspace_id": workspace.identity}, "files": deepcopy(files)}
        write(destination / "Recurring_Delivery.json", encoded(delivery), exact=True)
        files.append(describe(destination / "Recurring_Delivery.json"))
        bundle = destination / "WorldBank_Recurring_Delivery.zip"
        native.bundle(bundle, destination, files)
        files.append(describe(bundle))
        edition["files"] = files
        edition["status"] = "COMPLETE"
        native.save()
        return {**self._summary(edition), "directory": str(destination), "delivery": delivery}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True)
    actions = parser.add_subparsers(dest="action", required=True)
    create = actions.add_parser("create")
    for key in ("programme", "view", "report", "workbook"):
        create.add_argument("--" + key, required=True)
    create.add_argument("--source")
    create.add_argument("--keys")
    preview = actions.add_parser("preview")
    for key in ("programme", "operation-id", "handover", "worldbank-core"):
        preview.add_argument("--" + key, required=True)
    preview.add_argument("--resume", action="store_true")
    apply = actions.add_parser("apply")
    for key in ("programme", "operation-id", "review-sha256", "reason"):
        apply.add_argument("--" + key, required=True)
    apply.add_argument("--workbook-recipe")
    apply.add_argument("--resume", action="store_true")
    status = actions.add_parser("status")
    status.add_argument("--programme")
    status.add_argument("--operation-id")
    args = parser.parse_args(argv)
    operation = WorldBankRecurring(args.workspace, progress=lambda value:
        print(json.dumps(value, ensure_ascii=False), file=sys.stderr, flush=True))
    if args.action == "create":
        result = operation.create(args.programme, view=args.view, report=args.report, workbook=args.workbook,
                                  source=args.source, keys=args.keys.split(",") if args.keys else None)
    elif args.action == "preview":
        result = operation.preview(args.programme, operation_id=args.operation_id, handover=args.handover,
                                   core=args.worldbank_core, resume=args.resume)
    elif args.action == "apply":
        recipe = json.loads(regular(args.workbook_recipe)) if args.workbook_recipe else None
        result = operation.apply(args.programme, operation_id=args.operation_id,
                                 review_sha256=args.review_sha256, reason=args.reason,
                                 workbook_recipe=recipe, resume=args.resume)
    else:
        result = operation.status(args.programme, args.operation_id)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"error": {"type": type(error).__name__, "code": getattr(error, "code", None),
                                   "message": str(error)}}), file=sys.stderr, flush=True)
        raise SystemExit(1)
