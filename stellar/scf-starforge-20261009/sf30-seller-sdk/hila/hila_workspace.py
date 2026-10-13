"""MIT. Saved HILA editions and review history on the original Dataset workspace."""
from __future__ import annotations

from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import tempfile

import hila_source as source
import hila_rules as rules
from hila_questionnaire import (canonical, sha, inventory, suggested_mapping, MAX_FORM,
                                CONSENT, AXIS_FIELDS)
from workspace import (Workspace, SourceFormat, InputError, checked_id, regular,
                       file_digest, sync_dir, load_json)

FORMAT = SourceFormat("hila", "HILA", source.inventory, source.validate_plan,
                      source.extract, source.dataset_spec)
EDITION = "stellar-forge.hila-edition.v1"
REVIEW = "stellar-forge.hila-review.v1"
REQUEST = "stellar-forge.hila-request.v1"
META_LIMIT = 64 * 1024 * 1024
DEFINITION_FIELDS = ("name", "notes", "editions", "rules", "selection", "review",
                     "rowDecisions", "cellDecisions")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def strict_json(data):
    value = load_json(data)
    try:
        canonical(value)
    except (ValueError, OverflowError, RecursionError, UnicodeError) as e:
        raise InputError("Metadata must contain bounded finite UTF-8 JSON values") from e
    return value


def require_fields(value, fields, label):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise InputError(label + " requires its complete documented fields")
    return value


def request_id(value):
    rules.plain(value, "Request ID", 160, True)
    if any(ord(c) < 33 or ord(c) == 127 for c in value):
        raise InputError("Request ID must be one visible stable token")
    return value


def revision_number(value):
    if type(value) is not int or not 1 <= value <= 100000:
        raise InputError("Select a positive retained revision")
    return value


def publish(path, data):
    """Atomic complete publication under the original workspace lifetime."""
    path = Path(path)
    if not isinstance(data, bytes) or len(data) > META_LIMIT:
        raise InputError("Retained metadata exceeds 64 MiB")
    if path.exists() or path.is_symlink():
        regular(path, META_LIMIT)
        if path.read_bytes() != data:
            raise InputError("Existing completed output selects different original bytes: " + path.name)
        return path
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.parent.is_symlink():
        raise InputError("Output parent must be a real directory")
    fd, name = tempfile.mkstemp(prefix=".receiving-", suffix=".partial", dir=path.parent)
    staged = Path(name)
    with os.fdopen(fd, "wb") as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())
    if staged.read_bytes() != data:
        raise InputError("Staged metadata did not retain all selected bytes")
    os.replace(staged, path)
    sync_dir(path.parent)
    return path


def stable_build(build):
    """Portable identity excludes receiving-host SQLite and engine implementation bytes."""
    return {key: build[key] for key in ("schema", "id", "source", "plan", "rowCount", "keys", "columns")} | {
        "native": build["native"],
        "files": {key: build["files"][key] for key in ("data.csv", "dataset.json")},
    }


def acquisition_definition(value):
    require_fields(value, ("label", "url", "retrievedAt", "license", "notice"), "Questionnaire acquisition")
    for key in ("label", "url", "license", "notice"):
        rules.plain(value[key], "Questionnaire " + key, 8000, key == "label")
    rules.instant(value["retrievedAt"], "Questionnaire retrieval time")
    return value


def edition_provenance(value):
    require_fields(value, ("kind", "label", "sourceUrl", "obtainedAt", "periodStart", "periodEnd",
                           "approvedBy", "approvedAt", "approval"), "Edition provenance")
    if value["kind"] not in {"approved-anonymized", "synthetic-engineering"}:
        raise InputError("Identify an approved anonymized edition or an explicitly synthetic engineering fixture")
    for key in ("label", "sourceUrl", "periodStart", "periodEnd", "approvedBy", "approval"):
        rules.plain(value[key], "Edition " + key, 8000, key in {"label", "approvedBy", "approval"})
    rules.instant(value["obtainedAt"], "Edition acquisition time")
    rules.instant(value["approvedAt"], "Edition approval time")
    for key in ("periodStart", "periodEnd"):
        if value[key] and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value[key]):
            raise InputError("Edition periods must be explicit ISO dates or empty")
        if value[key]:
            try:
                datetime.strptime(value[key], "%Y-%m-%d")
            except ValueError as e:
                raise InputError("Edition period contains an invalid calendar date") from e
    if value["periodStart"] and value["periodEnd"] and value["periodStart"] > value["periodEnd"]:
        raise InputError("Edition period ends before it starts")
    return value


def review_definition(value):
    require_fields(value, ("status", "reviewer", "note"), "Named review")
    if value["status"] not in {"draft", "reviewed", "needs-correction"}:
        raise InputError("Review status must be draft, reviewed or needs-correction")
    rules.plain(value["reviewer"], "Reviewer", 160, value["status"] != "draft")
    rules.plain(value["note"], "Review note", 8000)
    return value


class HilaWorkspace(Workspace):
    def __init__(self, root, create=False):
        super().__init__(root, create=create, source_format=FORMAT)
        try:
            for name in ("questionnaires", "reviews", "packet-cache"):
                path = self.root / name
                path.mkdir(mode=0o700, exist_ok=True)
                info = path.lstat()
                if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077:
                    raise InputError("HILA directories must remain private real directories")
            self.db.executescript("""
                CREATE TABLE IF NOT EXISTS hila_questionnaires(id TEXT PRIMARY KEY,body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS hila_acquisitions(id TEXT PRIMARY KEY,questionnaire TEXT NOT NULL,body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS hila_editions(id TEXT PRIMARY KEY,body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS hila_reviews(id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,
                    PRIMARY KEY(id,revision));
                CREATE TABLE IF NOT EXISTS hila_requests(id TEXT PRIMARY KEY,kind TEXT NOT NULL,input_sha TEXT NOT NULL,
                    input TEXT NOT NULL,result TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS hila_receiving_builds(edition TEXT PRIMARY KEY,body TEXT NOT NULL);
            """)
        except Exception:
            super().close()
            raise

    def _row(self, table, ident):
        checked_id(ident)
        row = self.db.execute("SELECT body FROM " + table + " WHERE id=?", (ident,)).fetchone()
        if row is None:
            raise InputError("Unknown retained HILA record")
        return strict_json(row["body"])

    def _immutable(self, table, ident, value):
        encoded = canonical(value).decode()
        row = self.db.execute("SELECT body FROM " + table + " WHERE id=?", (ident,)).fetchone()
        if row is not None and canonical(strict_json(row["body"])) != encoded.encode():
            raise InputError("Retained immutable HILA record differs from its original identity")
        if row is None:
            self.db.execute("INSERT INTO " + table + " VALUES(?,?)", (ident, encoded))

    def _replay(self, kind, raw):
        ident = request_id(raw.get("requestId")) if isinstance(raw, dict) else request_id(None)
        body = canonical(raw)
        if len(body) > META_LIMIT:
            raise InputError("Complete request exceeds 64 MiB")
        previous = self.db.execute("SELECT * FROM hila_requests WHERE id=?", (ident,)).fetchone()
        if previous is None:
            return None
        if previous["kind"] != kind or previous["input_sha"] != sha(body) or previous["input"].encode() != body:
            raise InputError("Request ID already belongs to different original input")
        return strict_json(previous["result"])

    def _save_request(self, kind, raw, result):
        body = canonical(raw)
        self.db.execute("INSERT INTO hila_requests VALUES(?,?,?,?,?)",
                        (raw["requestId"], kind, sha(body), body.decode(), canonical(result).decode()))

    def request(self, ident):
        with self.mutex:
            row = self.db.execute("SELECT * FROM hila_requests WHERE id=?", (request_id(ident),)).fetchone()
            if row is None:
                raise InputError("Unknown original HILA request")
            return {"schema": REQUEST, "id": row["id"], "kind": row["kind"],
                    "inputSha256": row["input_sha"], "input": strict_json(row["input"]),
                    "result": strict_json(row["result"])}

    def add_questionnaire(self, stream, provenance):
        acquisition_definition(provenance)
        with self.mutex:
            body = stream.read(MAX_FORM + 1)
            if stream.read(1) or len(body) > MAX_FORM:
                raise InputError("Complete questionnaire exceeds 16 MiB")
            form = inventory(body)
            ident = form["sha256"]
            path = self.root / "questionnaires" / (ident + ".xml")
            publish(path, body)
            publish(self.root / "questionnaires" / (ident + ".json"), canonical(form))
            selection = {"schema": "stellar-forge.hila-questionnaire-acquisition.v1",
                         "questionnaire": ident, "provenance": provenance}
            acquisition = {**selection, "id": sha(canonical(selection))}
            with self.db:
                self._immutable("hila_questionnaires", ident, form)
                old = self.db.execute("SELECT body FROM hila_acquisitions WHERE id=?", (acquisition["id"],)).fetchone()
                if old and strict_json(old["body"]) != acquisition:
                    raise InputError("Questionnaire acquisition identity conflicts with retained provenance")
                self.db.execute("INSERT OR IGNORE INTO hila_acquisitions VALUES(?,?,?)",
                                (acquisition["id"], ident, canonical(acquisition).decode()))
            return {"questionnaire": form, "acquisition": acquisition}

    def questionnaire(self, ident):
        with self.mutex:
            form = self._row("hila_questionnaires", ident)
            path = self.root / "questionnaires" / (ident + ".xml")
            if file_digest(path, MAX_FORM) != ident:
                raise InputError("Original questionnaire bytes changed")
            recorded = self.root / "questionnaires" / (ident + ".json")
            regular(recorded, META_LIMIT)
            if strict_json(recorded.read_bytes()) != form:
                raise InputError("Retained questionnaire catalogue differs from its original record")
            expected = dict(form)
            inventory_sha = expected.pop("inventorySha256", None)
            if sha(canonical(expected)) != inventory_sha or form["sha256"] != ident:
                raise InputError("Questionnaire catalogue identity is inconsistent")
            return form

    def acquisition(self, ident):
        with self.mutex:
            value = self._row("hila_acquisitions", ident)
            original = {key: item for key, item in value.items() if key != "id"}
            if value.get("id") != ident or sha(canonical(original)) != ident:
                raise InputError("Questionnaire acquisition identity is inconsistent")
            acquisition_definition(value["provenance"])
            self.questionnaire(value["questionnaire"])
            return value

    def mapping(self, questionnaire, source_id):
        with self.mutex:
            form, retained = self.questionnaire(questionnaire), self.source(source_id)
            selected = suggested_mapping(form, [column["name"] for column in retained["inventory"]["columns"]])
            return {"schema": "stellar-forge.hila-mapping-preview.v1", "questionnaire": questionnaire,
                    "source": source_id, **selected, "excludedFields": form["excludedFromAnalysis"],
                    "consent": form["consent"], "automaticSave": False}

    def _edition_definition(self, raw):
        require_fields(raw, ("requestId", "name", "source", "questionnaire", "acquisition",
                             "mapping", "respondentKey", "provenance"), "Saved edition")
        rules.plain(raw["name"], "Edition name", 120, True)
        source_record = self.source(checked_id(raw["source"]))
        form = self.questionnaire(checked_id(raw["questionnaire"]))
        acquired = self.acquisition(checked_id(raw["acquisition"]))
        if acquired["questionnaire"] != form["sha256"]:
            raise InputError("Edition selects provenance for another questionnaire")
        edition_provenance(raw["provenance"])
        mapping = raw["mapping"]
        if not isinstance(mapping, dict) or any(path not in form["fields"] or not form["fields"][path]["analysisAllowed"] for path in mapping):
            raise InputError("Map only original coded analysis fields; identifiers, refusal explanations, text and audio stay outside analytics")
        plan = source.validate_plan({"schema": source.SCHEMA, "normalizer": source.NORMALIZER,
            "name": raw["name"], "questionnaire": form["sha256"], "mapping": mapping,
            "respondentKey": raw["respondentKey"]})
        present = {column["name"] for column in source_record["inventory"]["columns"]}
        selected = set(mapping.values()) | ({raw["respondentKey"]} if raw["respondentKey"] else set())
        if source_record["inventory"]["rows"] and selected - present:
            raise InputError("Saved mapping refers to a field absent from the selected original edition")
        if source_record["bytes"] > source.MAX_BYTES or source_record["inventory"]["rows"] > source.MAX_ROWS:
            raise InputError("Edition exceeds the documented complete source bound")
        definition = {key: raw[key] for key in ("name", "source", "questionnaire", "acquisition", "respondentKey", "provenance")}
        definition["mapping"] = plan["mapping"]
        definition["normalizer"] = source.NORMALIZER
        return definition, plan, source_record

    def save_edition(self, raw):
        with self.mutex:
            previous = self._replay("edition.save", raw)
            if previous is not None:
                return previous
            definition, plan, original = self._edition_definition(raw)
            ident = sha(canonical({"schema": EDITION, "definition": definition}))
            old = self.db.execute("SELECT body FROM hila_editions WHERE id=?", (ident,)).fetchone()
            if old is not None:
                result = self.edition(ident)
                if any(result[key] != value for key, value in definition.items()):
                    raise InputError("Edition identity differs from this complete source definition")
            else:
                mapped = self.save_plan(plan)
                built = self.build(original["id"], mapped["id"])
                result = {"schema": EDITION, "id": ident, **definition, "plan": mapped["id"],
                          "build": built, "sourceBytes": original["bytes"], "rows": built["rowCount"],
                          "created": now()}
            with self.db:
                self._immutable("hila_editions", ident, result)
                self._save_request("edition.save", raw, result)
            return result

    def edition(self, ident):
        with self.mutex:
            result = self._row("hila_editions", ident)
            definition = {key: result[key] for key in ("name", "source", "questionnaire", "acquisition",
                           "respondentKey", "provenance", "mapping", "normalizer")}
            if result.get("schema") != EDITION or result.get("id") != ident or sha(canonical({"schema": EDITION, "definition": definition})) != ident:
                raise InputError("Edition does not match its complete original definition")
            local = self.build_view(result["build"]["id"])
            if stable_build(local) != stable_build(result["build"]):
                raise InputError("Receiving native dataset differs from the original edition")
            return result

    def editions(self):
        with self.mutex:
            return [strict_json(row["body"]) for row in self.db.execute("SELECT body FROM hila_editions ORDER BY id")]

    def rows(self, ident, offset=0, limit=None):
        if type(offset) is not int or offset < 0 or limit is not None and (type(limit) is not int or limit < 0):
            raise InputError("Invalid private respondent selection")
        with self.mutex:
            edition = self.edition(ident)
            path = self._build_path(edition["build"]["id"], "rows.sqlite")
            connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
            try:
                query = "SELECT values_json FROM rows ORDER BY ordinal LIMIT ? OFFSET ?"
                for row in connection.execute(query, (-1 if limit is None else limit, offset)):
                    values = strict_json(row[0])
                    if not isinstance(values, list) or len(values) != 5:
                        raise InputError("Original native projection has an unexpected row shape")
                    yield {"recordId": values[0], "sourceRow": values[1], "sourceRowSha256": values[2],
                           "consent": values[3], "answers": strict_json(values[4])}
            finally:
                connection.close()

    def respondent_page(self, ident, offset=0, limit=50):
        if type(limit) is not int or not 1 <= limit <= 1000:
            raise InputError("Private respondent page requires a limit from 1 to 1,000")
        with self.mutex:
            edition = self.edition(ident)
            selected = list(self.rows(ident, offset, limit))
            return {"edition": ident, "rows": selected, "offset": offset, "total": edition["rows"],
                    "nextOffset": offset + len(selected) if offset + len(selected) < edition["rows"] else None,
                    "privacy": "Private coded source rows; original consent remains decisive for analytics"}

    def _definition(self, raw):
        allowed = set(DEFINITION_FIELDS) | {"requestId", "id", "expectedRevision"}
        if not isinstance(raw, dict) or set(raw) - allowed or set(DEFINITION_FIELDS) - set(raw):
            raise InputError("Save the complete HILA review definition")
        if ("id" in raw) != ("expectedRevision" in raw):
            raise InputError("Editing requires the original review ID and expected revision together")
        rules.plain(raw["name"], "Review name", 160, True)
        rules.plain(raw["notes"], "Review notes", 8000)
        selected = raw["editions"]
        if not isinstance(selected, list) or not 1 <= len(selected) <= 2 or len(set(selected)) != len(selected):
            raise InputError("A review selects one or two distinct complete editions in before/after order")
        editions = [self.edition(checked_id(ident)) for ident in selected]
        if len({edition["questionnaire"] for edition in editions}) != 1:
            raise InputError("A HILA round review uses one exact agreed questionnaire; map changed instruments explicitly in a separate review")
        if sum(e["rows"] for e in editions) > source.MAX_ROWS or sum(e["sourceBytes"] for e in editions) > source.MAX_BYTES:
            raise InputError("Combined review exceeds 100,000 original rows or 100,000,000 uncompressed source bytes")
        form = self.questionnaire(editions[0]["questionnaire"])
        methodology = rules.validate_rules(raw["rules"], form)
        selection = require_fields(raw["selection"], AXIS_FIELDS, "Cohort selection")
        for axis, values in selection.items():
            if not isinstance(values, list) or len(values) > 512 or any(value is not None and not isinstance(value, str) for value in values) or len(set(values)) != len(values):
                raise InputError("Each cohort selection is a unique list of original codes or null for missing membership")
            known = {choice["value"] for path in AXIS_FIELDS[axis] for choice in form["fields"].get(path, {}).get("choices", [])}
            if set(values) - known - {None}:
                raise InputError("Cohort selection contains a code absent from the original questionnaire")
        named = review_definition(raw["review"])
        rows = raw["rowDecisions"]
        if not isinstance(rows, list) or len(rows) > source.MAX_ROWS:
            raise InputError("Respondent review must be a complete bounded list")
        seen = set()
        for decision in rows:
            require_fields(decision, ("edition", "recordId", "decision", "reviewer", "note"), "Respondent decision")
            if decision["edition"] not in selected or decision["decision"] not in {"include", "exclude", "note"}:
                raise InputError("Respondent decision must select an original edition and supported outcome")
            checked_id(decision["recordId"])
            identity = (decision["edition"], decision["recordId"])
            if identity in seen:
                raise InputError("Respondent decision is duplicated")
            seen.add(identity)
            rules.plain(decision["reviewer"], "Respondent reviewer", 160, True)
            rules.plain(decision["note"], "Respondent note", 8000, True)
        cells = raw["cellDecisions"]
        if not isinstance(cells, list) or len(cells) > 10000:
            raise InputError("Cell review must be a bounded complete list")
        seen = set()
        for decision in cells:
            require_fields(decision, ("key", "decision", "reviewer", "note"), "Cell decision")
            checked_id(decision["key"])
            if decision["key"] in seen or decision["decision"] not in {"accepted", "needs-correction", "note"}:
                raise InputError("Cell decision must be unique and use a supported named outcome")
            seen.add(decision["key"])
            rules.plain(decision["reviewer"], "Cell reviewer", 160, True)
            rules.plain(decision["note"], "Cell note", 8000, True)
        definition = {"name": raw["name"], "notes": raw["notes"], "editions": selected, "rules": methodology,
                      "selection": {axis: sorted(values, key=lambda v: (v is not None, v or "")) for axis, values in selection.items()},
                      "review": named, "rowDecisions": sorted(rows, key=lambda row: (row["edition"], row["recordId"])),
                      "cellDecisions": sorted(cells, key=lambda cell: cell["key"])}
        if len(canonical(definition)) > META_LIMIT:
            raise InputError("Complete review definition exceeds 64 MiB")
        return definition

    def compose_report(self, ident, revision, definition):
        editions = [self.edition(key) for key in definition["editions"]]
        form = self.questionnaire(editions[0]["questionnaire"])
        outputs = []
        for edition in editions:
            decisions = {item["recordId"]: item for item in definition["rowDecisions"] if item["edition"] == edition["id"]}
            outputs.append(rules.analyse(form, edition, definition["rules"], self.rows(edition["id"]),
                                         definition["selection"], decisions))
        available = {cell["key"] for output in outputs for cell in output["cells"]}
        if any(decision["key"] not in available for decision in definition["cellDecisions"]):
            raise InputError("Cell decision does not identify a cell in the complete selected report")
        attribution = [{"edition": edition["id"], "name": edition["name"], "source": edition["source"],
                        "bytes": edition["sourceBytes"], "provenance": edition["provenance"],
                        "questionnaireAcquisition": self.acquisition(edition["acquisition"])} for edition in editions]
        return {"schema": rules.REPORT, "reviewId": ident, "revision": revision, "name": definition["name"],
                "notes": definition["notes"], "definitionSha256": sha(canonical(definition)),
                "questionnaire": form["sha256"], "rules": definition["rules"], "review": definition["review"],
                "selection": definition["selection"], "rowDecisions": definition["rowDecisions"],
                "cellDecisions": definition["cellDecisions"], "attribution": attribution, "editions": outputs,
                "comparison": rules.compare(outputs[0], outputs[1]) if len(outputs) == 2 else None,
                "semantics": {"categories": "Exact original yes / partial / no / no_response; non-response remains distinct from missing and is never assigned an ordinal score",
                              "scoring": "No composite score without the selected explicit approved methodology",
                              "sample": "Two respondent editions are independent samples unless a separate authorized design establishes otherwise",
                              "privacy": "Complete private analyst report. Refusal reasons, personal identifiers, free text and audio are excluded from its analytics."}}

    def _report_path(self, ident, revision):
        return self.root / "reviews" / checked_id(ident) / str(revision_number(revision)) / "report.json"

    def save_review(self, raw):
        with self.mutex:
            prior = self._replay("review.save", raw)
            if prior is not None:
                return prior
            definition = self._definition(raw)
            if "id" in raw:
                before = self.review(checked_id(raw["id"]))
                if before["revision"] != revision_number(raw["expectedRevision"]):
                    raise InputError("Review revision changed; reopen the current complete revision before saving")
                ident, revision, created = before["id"], before["revision"] + 1, before["created"]
            else:
                ident = sha(canonical({"schema": REVIEW, "creationRequest": raw["requestId"]}))
                revision, created = 1, now()
                if self.db.execute("SELECT 1 FROM hila_reviews WHERE id=?", (ident,)).fetchone():
                    raise InputError("Review creation request already identifies retained history")
            report = self.compose_report(ident, revision, definition)
            body = canonical(report)
            path = publish(self._report_path(ident, revision), body)
            saved = {"schema": REVIEW, "id": ident, "revision": revision, **definition,
                     "definitionSha256": sha(canonical(definition)), "created": created,
                     "updated": now(), "previousRevision": revision - 1 if revision > 1 else None,
                     "report": {"bytes": len(body), "sha256": sha(body),
                                "editions": [{"id": item["edition"], "counts": item["counts"]} for item in report["editions"]]}}
            with self.db:
                self.db.execute("INSERT INTO hila_reviews VALUES(?,?,?)", (ident, revision, canonical(saved).decode()))
                self._save_request("review.save", raw, saved)
            return saved

    def review(self, ident, revision=None):
        checked_id(ident)
        if revision is not None:
            revision_number(revision)
        with self.mutex:
            row = self.db.execute("SELECT body FROM hila_reviews WHERE id=?" +
                (" AND revision=?" if revision is not None else " ORDER BY revision DESC LIMIT 1"),
                (ident, revision) if revision is not None else (ident,)).fetchone()
            if row is None:
                raise InputError("Unknown retained HILA review revision")
            result = strict_json(row["body"])
            definition = {key: result[key] for key in DEFINITION_FIELDS}
            if result.get("schema") != REVIEW or result["id"] != ident or sha(canonical(definition)) != result["definitionSha256"]:
                raise InputError("Saved HILA definition identity is inconsistent")
            return result

    def reviews(self):
        with self.mutex:
            return [strict_json(row["body"]) for row in self.db.execute("""
                SELECT r.body FROM hila_reviews r JOIN
                (SELECT id,MAX(revision) AS revision FROM hila_reviews GROUP BY id) current
                ON r.id=current.id AND r.revision=current.revision ORDER BY r.id""")]

    def history(self, ident):
        self.review(ident)
        with self.mutex:
            return [strict_json(row["body"]) for row in self.db.execute(
                "SELECT body FROM hila_reviews WHERE id=? ORDER BY revision", (ident,))]

    def report(self, ident, revision=None, public=False):
        with self.mutex:
            view = self.review(ident, revision)
            path = self._report_path(ident, view["revision"])
            if regular(path, META_LIMIT).st_size != view["report"]["bytes"] or file_digest(path, META_LIMIT) != view["report"]["sha256"]:
                raise InputError("Full saved report differs from the original revision")
            report = strict_json(path.read_bytes())
            return rules.public_report(report, view["rules"], view["review"]) if public else report

    def state(self):
        with self.mutex:
            original = super().state()
            forms = [strict_json(row["body"]) for row in self.db.execute("SELECT body FROM hila_questionnaires ORDER BY id")]
            return {**original, "questionnaires": [{"id": form["sha256"], "bytes": form["bytes"], "title": form["title"],
                        "languages": form["languages"], "dimensions": {key: len(items) for key, items in form["dimensions"].items()},
                        "inventorySha256": form["inventorySha256"]} for form in forms],
                    "acquisitions": [strict_json(row["body"]) for row in self.db.execute("SELECT body FROM hila_acquisitions ORDER BY id")],
                    "editions": self.editions(), "reviews": self.reviews()}

    def export_review(self, ident, output, revision=None):
        from hila_portable import export_review
        return export_review(self, ident, Path(output), revision)

    def receive_review(self, path):
        from hila_portable import receive_review
        return receive_review(self, Path(path))

    def write_report(self, ident, output, revision=None, public=False):
        from hila_portable import export_report
        return export_report(self, ident, Path(output), revision, public)

    def import_packet(self, path):
        from hila_portable import is_review_packet
        return self.receive_review(path) if is_review_packet(Path(path)) else super().import_packet(Path(path))
