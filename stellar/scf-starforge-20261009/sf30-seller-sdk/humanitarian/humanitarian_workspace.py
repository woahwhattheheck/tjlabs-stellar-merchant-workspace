"""MIT. Retained humanitarian sources, decisions, reports and complete request recovery."""
from __future__ import annotations

import _bootstrap
import os
from pathlib import Path
import shutil
import sqlite3
import time

from workspace import (Workspace, SourceFormat, InputError, json_bytes, load_json, digest,
                       checked_id, private_write, regular, file_digest, sync_dir)
from humanitarian_source import (inventory, validate_plan, extract, dataset_spec, text,
                                  identifier, MAX_BYTES, iter_table)
from humanitarian_reference import build_reference, validate_alias, alias_index
from humanitarian_reports import (fields_for, validate_outputs, compile_report,
                                   row_page, report_identity, MAX_REPORT)

MAX_SOURCE = MAX_BYTES
MAX_ARCHIVE = 2 * 1024 * 1024 * 1024
MAX_REQUEST = 1024 * 1024
strict_json = load_json
canonical_json = json_bytes
FORMAT = SourceFormat("humanitarian", "Humanitarian table", inventory, validate_plan, extract, dataset_spec)
OBJECT_SCHEMAS = {"reference": "stellar-forge.humanitarian-reference.v1",
                  "mapping": "stellar-forge.humanitarian-mapping.v1",
                  "alias": "stellar-forge.humanitarian-alias.v1"}


class HumanitarianWorkspace(Workspace):
    def __init__(self, root, create=False):
        super().__init__(root, create=create, source_format=FORMAT)
        self._verified_reports = {}
        try:
            directory = self.root / "reports"
            if not directory.exists():
                directory.mkdir(mode=0o700)
                sync_dir(self.root)
            info = directory.lstat()
            if directory.is_symlink() or not directory.is_dir() or (os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077)):
                raise InputError("Reporting directories must be private and owned by the operator")
            self.db.executescript("""
                CREATE TABLE IF NOT EXISTS human_objects(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,
                    created REAL NOT NULL,summary TEXT NOT NULL,PRIMARY KEY(kind,id));
                CREATE TABLE IF NOT EXISTS human_reports(id TEXT PRIMARY KEY,body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS human_reviews(id TEXT NOT NULL,revision INTEGER NOT NULL,
                    request_id TEXT NOT NULL UNIQUE,body TEXT NOT NULL,PRIMARY KEY(id,revision));
                CREATE TABLE IF NOT EXISTS human_requests(id TEXT PRIMARY KEY,kind TEXT NOT NULL,
                    input_sha256 TEXT NOT NULL,input TEXT NOT NULL,result TEXT NOT NULL);
            """)
            if "summary" not in {r[1] for r in self.db.execute("PRAGMA table_info(human_objects)")}:
                with self.db:
                    self.db.execute("ALTER TABLE human_objects ADD COLUMN summary TEXT NOT NULL DEFAULT '{}'")
                    for row in self.db.execute("SELECT kind,id,body FROM human_objects"):
                        body = load_json(row["body"])
                        self.db.execute("UPDATE human_objects SET summary=? WHERE kind=? AND id=?",
                                        (json_bytes(self._object_summary(row["kind"], body)).decode(), row["kind"], row["id"]))
        except BaseException:
            super().close()
            raise

    def _object(self, kind, ident):
        checked_id(ident)
        row = self.db.execute("SELECT body FROM human_objects WHERE kind=? AND id=?", (kind, ident)).fetchone()
        if row is None:
            raise InputError("Unknown retained " + kind)
        body = load_json(row["body"])
        if body.get("schema") != OBJECT_SCHEMAS[kind] or body.get("id") != ident or digest(json_bytes({k: v for k, v in body.items() if k != "id"})) != ident:
            raise InputError("Retained " + kind + " identity changed")
        return body

    @staticmethod
    def _object_summary(kind, body):
        if kind == "reference":
            return {"id": body["id"], "name": body["definition"]["name"], "source": body["source"],
                    "counts": body["counts"], "provenance": body["definition"]["provenance"]}
        if kind == "mapping":
            return {key: body[key] for key in ("id", "name", "reference", "plan", "outputs")}
        return body

    def _save_object(self, kind, body):
        encoded = json_bytes(body).decode()
        existing = self.db.execute("SELECT body FROM human_objects WHERE kind=? AND id=?", (kind, body["id"])).fetchone()
        if existing and existing["body"] != encoded:
            raise InputError("An existing immutable object has different complete bytes")
        self.db.execute("INSERT OR IGNORE INTO human_objects VALUES(?,?,?,?,?)",
                        (kind, body["id"], encoded, time.time(), json_bytes(self._object_summary(kind, body)).decode()))
        return body

    def _mutation(self, kind, raw, operation):
        if not isinstance(raw, dict):
            raise InputError("Submit a complete JSON object")
        request_id = identifier(raw.get("requestId"), "Request ID")
        encoded = json_bytes(raw)
        if len(encoded) > MAX_REQUEST:
            raise InputError("A mutation definition may contain at most one MiB")
        input_sha = digest(encoded)
        with self.mutex:
            old = self.db.execute("SELECT * FROM human_requests WHERE id=?", (request_id,)).fetchone()
            if old:
                if old["kind"] != kind or old["input_sha256"] != input_sha or old["input"] != encoded.decode():
                    raise InputError("This request ID already names different complete input")
                return load_json(old["result"])
            try:
                result = operation()
                self.db.execute("INSERT INTO human_requests VALUES(?,?,?,?,?)",
                                (request_id, kind, input_sha, encoded.decode(), json_bytes(result).decode()))
                self.db.commit()
                return result
            except BaseException:
                self.db.rollback()
                raise

    def request(self, ident):
        identifier(ident, "Request ID")
        with self.mutex:
            row = self.db.execute("SELECT * FROM human_requests WHERE id=?", (ident,)).fetchone()
            if row is None:
                raise InputError("Unknown completed request")
            raw = load_json(row["input"])
            if digest(json_bytes(raw)) != row["input_sha256"]:
                raise InputError("Retained request input changed")
            return {"id": row["id"], "kind": row["kind"], "state": "completed",
                    "inputSha256": row["input_sha256"], "input": raw, "result": load_json(row["result"])}

    def state(self):
        with self.mutex:
            references, mappings, aliases = [], [], []
            for row in self.db.execute("SELECT kind,summary FROM human_objects ORDER BY created DESC,id"):
                obj = load_json(row["summary"])
                if row["kind"] == "reference":
                    references.append(obj)
                elif row["kind"] == "mapping":
                    mappings.append(obj)
                else:
                    aliases.append(obj)
            return {"schema": self.version,
                    "sources": [dict(r) for r in self.db.execute("SELECT id,label,name,bytes,created FROM sources ORDER BY created DESC,id")],
                    "references": references, "mappings": mappings, "aliases": aliases,
                    "reviews": [self._summary(r) for r in self.reviews()["reviews"]]}

    @staticmethod
    def _summary(review):
        return {key: review[key] for key in ("id", "name", "revision", "status", "reference",
                                             "editionCount", "counts", "reviewer", "notes")}

    def table_rows(self, source_id, table="data", offset=0, limit=8):
        if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 20:
            raise InputError("Select a nonnegative table offset and one through twenty complete rows")
        text(table, "Table name", 128)
        with self.mutex:
            source = self.source(source_id)
            path = self.root / "sources" / (source_id + "." + self.kind)
            if file_digest(path) != source_id:
                raise InputError("Original source bytes changed")
            result = []
            with path.open("rb") as stream:
                for ordinal, cells in iter_table(stream, table):
                    if ordinal <= offset:
                        continue
                    result.append({"row": ordinal, "cells": cells})
                    if len(result) >= limit:
                        break
            body = {"schema": "stellar-forge.humanitarian-table-rows.v1", "source": source["id"],
                    "table": table, "offset": offset, "limit": limit, "rows": result}
            if len(json_bytes(body)) > 4 * MAX_REQUEST:
                raise InputError("These complete rows exceed four MiB; request one row at a time")
            return body

    def reference(self, ident):
        with self.mutex:
            return self._object("reference", ident)

    def save_reference(self, raw):
        return self._mutation("reference", raw, lambda: self._save_object("reference", build_reference(self, raw)))

    def alias(self, ident):
        with self.mutex:
            return self._object("alias", ident)

    def save_alias(self, raw):
        def save():
            reference = self.reference(raw.get("reference"))
            return self._save_object("alias", validate_alias(reference, raw))
        return self._mutation("alias", raw, save)

    def mapping(self, ident):
        with self.mutex:
            return self._object("mapping", ident)

    def _mapping_body(self, raw):
        if set(raw) - {"requestId", "name", "reference", "plan", "admin", "keyFields", "outputs"}:
            raise InputError("Mapping contains an unknown field")
        reference = self.reference(raw.get("reference"))
        plan = validate_plan(raw.get("plan"))
        fields = fields_for(plan)
        known = {f["name"]: f for f in fields}
        selected = {s["name"]: s for s in plan["selectors"]}
        admin = raw.get("admin")
        if not isinstance(admin, dict) or set(admin) - {"level", "codeField", "nameField", "scopeCodeField"}:
            raise InputError("Administrative mapping requires level, codeField, nameField and optional scopeCodeField")
        level = admin.get("level")
        if type(level) is not int or str(level) not in reference["counts"]:
            raise InputError("Choose an administrative level present in this reference edition")
        normalized_admin = {"level": level}
        for name in ("codeField", "nameField", "scopeCodeField"):
            field = admin.get(name)
            if field is not None and (not isinstance(field, str) or field not in selected or selected[field]["type"] != "string"):
                raise InputError("Administrative codes and names must select original string columns")
            normalized_admin[name] = field
        if not normalized_admin["codeField"] and not normalized_admin["nameField"]:
            raise InputError("Select an original administrative code or name column")
        keys = raw.get("keyFields")
        if not isinstance(keys, list) or not 1 <= len(keys) <= 12 or any(not isinstance(k, str) or k not in known for k in keys) or len(set(keys)) != len(keys):
            raise InputError("Choose one to twelve distinct business-key fields")
        if any(k in {"source_row", "edition_id", "period", "reference_id", "row_status"} for k in keys):
            raise InputError("Business keys must identify the same real record across editions")
        outputs = validate_outputs(raw.get("outputs"), fields)
        saved = self.save_plan(plan)
        name = text(raw.get("name"), "Mapping name", 160)
        definition = {"name": name, "reference": reference["id"], "plan": plan, "admin": normalized_admin,
                      "keyFields": keys, "outputs": outputs}
        body = {"schema": OBJECT_SCHEMAS["mapping"], "name": name, "reference": reference["id"], "plan": saved["id"],
                "definition": definition, "admin": normalized_admin, "keyFields": keys, "outputs": outputs, "fields": fields}
        return body | {"id": digest(json_bytes(body))}

    def save_mapping(self, raw):
        return self._mutation("mapping", raw, lambda: self._save_object("mapping", self._mapping_body(raw)))

    def reviews(self):
        with self.mutex:
            rows = self.db.execute("""
                SELECT r.body FROM human_reviews r
                JOIN (SELECT id,MAX(revision) AS revision FROM human_reviews GROUP BY id) h
                ON r.id=h.id AND r.revision=h.revision ORDER BY r.id
            """)
            return {"schema": "stellar-forge.humanitarian-reviews.v1", "reviews": [load_json(r["body"]) for r in rows]}

    def review(self, ident, revision=None):
        identifier(ident, "Review ID")
        if revision is not None and (type(revision) is not int or revision < 1):
            raise InputError("Review revision must be a positive integer")
        with self.mutex:
            if revision is None:
                row = self.db.execute("SELECT body FROM human_reviews WHERE id=? ORDER BY revision DESC LIMIT 1", (ident,)).fetchone()
            else:
                row = self.db.execute("SELECT body FROM human_reviews WHERE id=? AND revision=?", (ident, revision)).fetchone()
            if row is None:
                raise InputError("Unknown retained review revision")
            body = load_json(row["body"])
            report = self._report(body["report"])
            if report["review"] != ident or report["revision"] != body["revision"] or report["definition"] != body["definition"]:
                raise InputError("Retained review and complete report no longer agree")
            return body

    def history(self, ident):
        identifier(ident, "Review ID")
        with self.mutex:
            versions = [load_json(r["body"]) for r in self.db.execute("SELECT body FROM human_reviews WHERE id=? ORDER BY revision", (ident,))]
            if not versions:
                raise InputError("Unknown retained review")
            return {"schema": "stellar-forge.humanitarian-history.v1", "id": ident, "revisions": versions}

    def _review_definition(self, raw, *, current_revision=None):
        allowed = {"requestId", "id", "name", "expectedRevision", "editions", "aliases", "reviewer", "notes", "rowPolicy"}
        if set(raw) - allowed:
            raise InputError("Review contains an unknown field")
        ident = identifier(raw.get("id"), "Review ID")
        expected = raw.get("expectedRevision")
        if type(expected) is not int or expected < 0:
            raise InputError("Review requires the last observed revision, or zero for its first edition")
        row = self.db.execute("SELECT MAX(revision) AS revision FROM human_reviews WHERE id=?", (ident,)).fetchone()
        current = (row["revision"] or 0) if current_revision is None else current_revision
        if current != expected:
            raise InputError(f"Review is at revision {current}; reopen that complete revision before saving")
        raw_editions = raw.get("editions")
        if not isinstance(raw_editions, list) or not 1 <= len(raw_editions) <= 2:
            raise InputError("A review selects one or two complete source editions")
        editions, mappings = [], []
        for number, edition in enumerate(raw_editions):
            if not isinstance(edition, dict) or set(edition) - {"source", "mapping", "label", "period"}:
                raise InputError("An edition requires source, mapping, label and period")
            source = self.source(edition.get("source"))
            mapping = self.mapping(edition.get("mapping"))
            editions.append({"source": source["id"], "mapping": mapping["id"],
                             "label": text(edition.get("label"), "Edition label", 160),
                             "period": text(edition.get("period", ""), "Reporting period", 160, empty=True)})
            mappings.append(mapping)
        if len({m["reference"] for m in mappings}) != 1:
            raise InputError("Both compared editions must use the same pinned administrative reference")
        if len(mappings) == 2 and mappings[0]["keyFields"] != mappings[1]["keyFields"]:
            raise InputError("Edition comparison requires the same ordered business-key fields")
        reference = self.reference(mappings[0]["reference"])
        raw_aliases = raw.get("aliases", [])
        if not isinstance(raw_aliases, list) or len(raw_aliases) > 10000 or any(not isinstance(a, str) for a in raw_aliases) or len(set(raw_aliases)) != len(raw_aliases):
            raise InputError("Select distinct retained alias decisions")
        decisions = [self.alias(a) for a in sorted(raw_aliases)]
        alias_index(reference, decisions)
        policy = raw.get("rowPolicy", "require-complete")
        if policy not in {"require-complete", "valid-rows"}:
            raise InputError("Choose require-complete or explicitly select valid-rows reporting")
        definition = {"id": ident, "name": text(raw.get("name"), "Review name", 160),
                      "reference": reference["id"], "editions": editions, "aliases": sorted(raw_aliases),
                      "reviewer": text(raw.get("reviewer"), "Reviewer", 160),
                      "notes": text(raw.get("notes", ""), "Review notes", 12000, empty=True),
                      "rowPolicy": policy}
        return definition, current + 1, reference, mappings, decisions

    def _retain_report(self, report, path):
        ident = report["id"]
        destination = self.root / "reports" / ident
        existing = self.db.execute("SELECT body FROM human_reports WHERE id=?", (ident,)).fetchone()
        if existing:
            previous = self._report(ident)
            if {k: v for k, v in previous.items() if k != "files"} != {k: v for k, v in report.items() if k != "files"}:
                raise InputError("An existing complete report has a different semantic identity")
            return previous
        if destination.exists():
            if destination.is_symlink() or not destination.is_dir():
                raise InputError("An unfinished reporting path is not a private directory")
            old = load_json((destination / "report.json").read_bytes())
            if report_identity(old) != ident or {k: v for k, v in old.items() if k != "files"} != {k: v for k, v in report.items() if k != "files"}:
                raise InputError("An unfinished report conflicts with this complete revision")
            for name, metadata in old["files"].items():
                if name != "rows.sqlite" or file_digest(destination / name, MAX_REPORT) != metadata["sha256"] or (destination / name).stat().st_size != metadata["bytes"]:
                    raise InputError("An unfinished report has changed bytes")
            report = old
        else:
            os.replace(path, destination)
            sync_dir(destination.parent)
        self.db.execute("INSERT INTO human_reports VALUES(?,?)", (ident, json_bytes(report).decode()))
        return report

    def save_review(self, raw):
        def save():
            definition, revision, reference, mappings, decisions = self._review_definition(raw)
            with self.scratch() as temporary:
                directory = temporary / "report"
                report = compile_report(self, definition, revision, reference, mappings, decisions, directory)
                report = self._retain_report(report, directory)
            body = {"schema": "stellar-forge.humanitarian-review.v1", "id": definition["id"],
                    "name": definition["name"], "revision": revision, "status": report["status"],
                    "reference": reference["id"], "editions": report["editions"], "editionCount": len(mappings),
                    "aliases": definition["aliases"], "reviewer": definition["reviewer"], "notes": definition["notes"],
                    "rowPolicy": definition["rowPolicy"], "counts": report["counts"],
                    "report": report["id"], "requestId": raw["requestId"], "definition": definition}
            self.db.execute("INSERT INTO human_reviews VALUES(?,?,?,?)",
                            (body["id"], revision, raw["requestId"], json_bytes(body).decode()))
            return body
        return self._mutation("review", raw, save)

    def _report(self, ident):
        checked_id(ident)
        row = self.db.execute("SELECT body FROM human_reports WHERE id=?", (ident,)).fetchone()
        if row is None:
            raise InputError("Unknown retained complete report")
        body = load_json(row["body"])
        if body.get("id") != ident or report_identity(body) != ident:
            raise InputError("Retained report identity changed")
        directory = self.root / "reports" / ident
        if directory.is_symlink() or not directory.is_dir():
            raise InputError("Reporting directory is missing or changed")
        metadata_path = directory / "report.json"
        regular(metadata_path, MAX_REQUEST * 8)
        if metadata_path.read_bytes() != json_bytes(body):
            raise InputError("Complete report metadata changed")
        if set(body["files"]) != {"rows.sqlite"}:
            raise InputError("Complete report file selection changed")
        for name, metadata in body["files"].items():
            path = directory / name
            info = regular(path, MAX_REPORT)
            signature = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
            key = (ident, name)
            if self._verified_reports.get(key) != signature:
                if info.st_size != metadata["bytes"] or file_digest(path, MAX_REPORT) != metadata["sha256"]:
                    raise InputError("Retained complete report bytes changed")
                self._verified_reports[key] = signature
        return body

    def report(self, ident, revision=None):
        with self.mutex:
            review = self.review(ident, revision)
            return self._report(review["report"])

    def rows(self, ident, revision=None, edition=0, offset=0, limit=50, issues=False):
        with self.mutex:
            review = self.review(ident, revision)
            if type(edition) is not int or not 0 <= edition < len(review["editions"]):
                raise InputError("Choose an edition in this review")
            return row_page(self.root / "reports" / review["report"] / "rows.sqlite",
                            ident, review["revision"], edition, offset, limit, issues)

    @staticmethod
    def _page(offset, limit):
        if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 1000:
            raise InputError("Select a nonnegative offset and a page limit from one to one thousand")

    def output_rows(self, ident, revision=None, edition=0, output=None, offset=0, limit=50):
        self._page(offset, limit)
        identifier(output, "Output ID")
        with self.mutex:
            review = self.review(ident, revision)
            if type(edition) is not int or not 0 <= edition < review["editionCount"]:
                raise InputError("Choose an edition in this review")
            report = self._report(review["report"])
            selected = next((o for o in report["outputs"] if o["edition"] == edition and o["output"] == output), None)
            if selected is None:
                raise InputError("Choose an output retained in this edition")
            path = self.root / "reports" / report["id"] / "rows.sqlite"
            db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
            try:
                rows = [{"ordinal": r[0], "values": load_json(r[1])} for r in db.execute(
                    "SELECT ordinal,values_json FROM layout_rows WHERE edition=? AND output=? ORDER BY ordinal LIMIT ? OFFSET ?",
                    (edition, output, limit, offset))]
                return {"schema": "stellar-forge.humanitarian-output-rows.v1", "review": ident, "revision": review["revision"],
                        "edition": edition, "output": output, "offset": offset, "limit": limit, "total": selected["rows"],
                        "columns": selected["columns"], "coverage": selected["coverage"], "rows": rows}
            finally:
                db.close()

    def comparison_rows(self, ident, revision=None, offset=0, limit=50):
        self._page(offset, limit)
        with self.mutex:
            review = self.review(ident, revision)
            report = self._report(review["report"])
            path = self.root / "reports" / report["id"] / "rows.sqlite"
            db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
            try:
                total = db.execute("SELECT COUNT(*) FROM changes").fetchone()[0]
                rows = [{"ordinal": r[0]} | load_json(r[1]) for r in db.execute(
                    "SELECT ordinal,body FROM changes ORDER BY ordinal LIMIT ? OFFSET ?", (limit, offset))]
                return {"schema": "stellar-forge.humanitarian-comparison-rows.v1", "review": ident, "revision": review["revision"],
                        "offset": offset, "limit": limit, "total": total, "comparison": report["comparison"], "rows": rows}
            finally:
                db.close()

    def export_review(self, ident, output, revision=None):
        from humanitarian_handover import export_review
        with self.mutex:
            return export_review(self, ident, Path(output), revision)

    def receive_review(self, path):
        from humanitarian_handover import receive_review
        with self.mutex:
            return receive_review(self, Path(path))

    def import_packet(self, path):
        return self.receive_review(path)

    def write_report(self, ident, output, revision=None):
        from humanitarian_handover import write_report
        with self.mutex:
            return write_report(self, ident, Path(output), revision)
