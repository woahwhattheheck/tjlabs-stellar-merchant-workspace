"""Survey onboarding retains its plans and projections as original Property documents."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import tempfile

from model import clone, encoded, fail, hash_id, identity, integer, parse, read, text
from ..service import PropertyResearch
from .mapping import SCHEMA, PROJECTION, ROW, compile_plan, field_catalog, normalize
from .source import inspect


class Onboarding:
    def __init__(self, workspace):
        self.w = workspace
        self.property = PropertyResearch(workspace)

    def fields(self):
        return field_catalog()

    def source(self, document_id, reader, offset=0, limit=30):
        return inspect(self.property, document_id, reader, offset, limit)

    def plans(self):
        result = []
        for item in self.property.status()["documents"]:
            if item["metadata"].get("document_type") == "property-onboarding-plan":
                result.append({"document_id": item["id"], "label": item["label"], "created": item["created"],
                               "plan_sha256": item["metadata"].get("plan_sha256")})
        return {"schema": SCHEMA, "plans": result}

    def _file(self, document_id):
        item = self.property.document(hash_id(document_id))
        if len(item["files"]) != 1:
            fail("PROPERTY_SINGLE_DOCUMENT_MEMBER_REQUIRED")
        return item, self.w.directory / "property-documents" / document_id / item["files"][0]["path"]

    def _json(self, document_id):
        item, path = self._file(document_id)
        raw = read(path, 64 * 1024 * 1024)
        if hashlib.sha256(raw).hexdigest() != item["files"][0]["sha256"]:
            fail("PROPERTY_DOCUMENT_CHANGED")
        return item, parse(raw)

    def _retain(self, value, *, key, title, operator, document_type, plan_sha256=None):
        data = encoded(value)
        fd, name = tempfile.mkstemp(prefix=".property-onboarding-", suffix=".json", dir=self.w.directory)
        try:
            with os.fdopen(fd, "wb") as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
            metadata = {"key": key, "title": title, "publisher": operator, "url": None,
                        "source_kind": "authored_mapping" if document_type == "property-onboarding-plan" else "authored_projection",
                        "source_reference": "Operator-authored from the exact retained document identities in this file.",
                        "document_type": document_type}
            if plan_sha256:
                metadata["plan_sha256"] = plan_sha256
            return self.property.import_document(name, metadata, hashlib.sha256(data).hexdigest())
        finally:
            Path(name).unlink(missing_ok=True)

    def save(self, value, operator):
        operator = text(operator, "operator", maximum=200)
        plan = normalize(value)
        documents = self.property._bindings(plan["document_ids"])
        for table in plan["tables"]:
            item = self.property.document(table["document_id"])
            if plan["document_ids"].get(item["key"]) != table["document_id"]:
                fail("PROPERTY_TABLE_SOURCE_NOT_BOUND", table=table["key"])
        from ..model import study
        study(plan["study"], documents)
        if plan["previous_id"]:
            previous = self.property._record("property_editions", plan["previous_id"])
            if previous["study_key"] != plan["study"]["key"]:
                fail("PROPERTY_STUDY_LINEAGE_MISMATCH")
        plan_sha = identity(plan)
        body = {"schema": SCHEMA, "plan_sha256": plan_sha, "operator": operator, "value": plan}
        item = self._retain(body, key="onboarding-plan:" + plan_sha, title=plan["name"],
                            operator=operator, document_type="property-onboarding-plan", plan_sha256=plan_sha)
        return {"document_id": item["id"], "plan_sha256": plan_sha, "reopened": item["reopened"],
                "value": plan, "operator": operator}

    def read_plan(self, plan_id):
        item, body = self._json(plan_id)
        if (item["metadata"].get("document_type") != "property-onboarding-plan" or
                body.get("schema") != SCHEMA or not isinstance(body.get("value"), dict)):
            fail("PROPERTY_ONBOARDING_PLAN_DOCUMENT_REQUIRED")
        value = normalize(body["value"])
        if value != body["value"] or identity(value) != body.get("plan_sha256"):
            fail("PROPERTY_ONBOARDING_PLAN_CHANGED")
        return {"document_id": item["id"], "created": item["created"], "operator": body["operator"],
                "plan_sha256": body["plan_sha256"], "value": value}

    def preview(self, value, offset=0, limit=30, changes_offset=0):
        with tempfile.TemporaryFile(mode="w+b", dir=self.w.directory) as rows:
            _, _, _, result = compile_plan(self.property, value, rows,
                                           offset=offset, limit=limit, changes_offset=changes_offset)
        return result

    def prepare(self, plan_id, expected_projection_sha256, operator, label, note=""):
        """Identical retries reopen the native documents, edition and current review."""
        operator = text(operator, "operator", maximum=200)
        label = text(label, "label", maximum=1000)
        note = text(note, "note", empty=True, maximum=16000)
        expected_projection_sha256 = hash_id(expected_projection_sha256)
        saved = self.read_plan(plan_id)
        fd, row_name = tempfile.mkstemp(prefix=".property-row-map-", suffix=".jsonl", dir=self.w.directory)
        try:
            with os.fdopen(fd, "w+b") as output:
                plan, packet, projection, result = compile_plan(self.property, saved["value"], output)
                output.flush()
                os.fsync(output.fileno())
            if result["projection_sha256"] != expected_projection_sha256:
                fail("PROPERTY_PROJECTION_CHANGED", actual=result["projection_sha256"])
            if not result["ready"]:
                fail("PROPERTY_PROJECTION_REVIEW_REQUIRED", errors=result["errors"], counts=result["counts"])
            if plan["previous_id"] and not note.strip():
                fail("PROPERTY_REVISION_NOTE_REQUIRED")
            row_doc = self.property.import_document(row_name, {
                "key": "onboarding-rows:" + expected_projection_sha256,
                "title": label + " — original cells and mapping decisions", "publisher": operator, "url": None,
                "source_kind": "authored_projection", "document_type": "property-onboarding-rows",
                "source_reference": "Complete included, excluded and rejected source rows for mapping " + saved["plan_sha256"],
                "projection_sha256": expected_projection_sha256,
            }, projection["row_map_sha256"])
            retained_projection = {"schema": PROJECTION, "projection_sha256": expected_projection_sha256,
                                   "plan_document_id": plan_id, "row_map_document_id": row_doc["id"], "projection": projection}
            projection_doc = self._retain(retained_projection,
                key="onboarding-projection:" + expected_projection_sha256, title=label + " — source projection",
                operator=operator, document_type="property-onboarding-projection")
            document_ids = clone(plan["document_ids"])
            plan_doc = self.property.document(plan_id)
            for item in (plan_doc, row_doc, projection_doc):
                if item["key"] in document_ids and document_ids[item["key"]] != item["id"]:
                    fail("PROPERTY_ONBOARDING_DOCUMENT_KEY_CONFLICT")
                document_ids[item["key"]] = item["id"]
            packet["study"]["onboarding"] = {
                "schema": PROJECTION, "plan_document_id": plan_id,
                "row_map_document_id": row_doc["id"], "projection_document_id": projection_doc["id"],
                "projection_sha256": expected_projection_sha256, "row_map_sha256": projection["row_map_sha256"],
                "projected_packet_sha256": projection["packet_sha256"], "source_row_count": projection["rows"],
            }
            edition = self.property.intake(document_ids=document_ids, operator=operator, label=label,
                                           packet=packet, previous_id=plan["previous_id"], note=note)
            review = self.property.compare(edition["id"], operator, label + " — source review",
                                           baseline_id=plan["previous_id"], note=note, unchanged="review")
            return {"schema": "stellar-forge.property-onboarding-receiving.v1",
                    "plan_document_id": plan_id, "projection_document_id": projection_doc["id"],
                    "row_map_document_id": row_doc["id"], "projection_sha256": expected_projection_sha256,
                    "edition": edition, "review": review, "projection": projection}
        finally:
            Path(row_name).unlink(missing_ok=True)

    def retained(self, edition_id):
        edition = self.property._record("property_editions", edition_id)
        packet = self.property.packet(edition_id)
        binding = packet.get("study", {}).get("onboarding")
        if not isinstance(binding, dict) or binding.get("schema") != PROJECTION:
            fail("PROPERTY_ONBOARDING_EDITION_REQUIRED")
        for field in ("plan_document_id", "row_map_document_id", "projection_document_id"):
            if binding[field] not in edition["document_ids"].values():
                fail("PROPERTY_ONBOARDING_DOCUMENT_NOT_BOUND", field=field)
        _, projection = self._json(binding["projection_document_id"])
        if (projection.get("schema") != PROJECTION or
                projection.get("projection_sha256") != binding["projection_sha256"] or
                projection.get("plan_document_id") != binding["plan_document_id"] or
                projection.get("row_map_document_id") != binding["row_map_document_id"] or
                identity(projection["projection"]) != binding["projection_sha256"]):
            fail("PROPERTY_ONBOARDING_PROJECTION_CHANGED")
        plan = self.read_plan(binding["plan_document_id"])
        if plan["plan_sha256"] != projection["projection"]["plan_sha256"]:
            fail("PROPERTY_ONBOARDING_PLAN_CHANGED")
        for key, did in plan["value"]["document_ids"].items():
            if edition["document_ids"].get(key) != did:
                fail("PROPERTY_ONBOARDING_SOURCE_BINDING_CHANGED", document_key=key)
        base_packet = clone(packet)
        base_packet["study"].pop("onboarding", None)
        if identity(base_packet) != projection["projection"]["packet_sha256"]:
            fail("PROPERTY_ONBOARDING_PROJECTED_PACKET_CHANGED")
        row_doc, _ = self._file(binding["row_map_document_id"])
        if row_doc["files"][0]["sha256"] != projection["projection"]["row_map_sha256"]:
            fail("PROPERTY_ONBOARDING_ROW_MAP_CHANGED")
        return {"edition_id": edition_id, "binding": binding, "plan": plan, "projection": projection["projection"]}

    def rows(self, edition_id, offset=0, limit=30, state=""):
        offset = integer(offset, "offset", 0, MAX_RETAINED_ROWS)
        limit = integer(limit, "limit", 1, 100)
        if state not in ("", "included", "excluded", "error"):
            fail("PROPERTY_ROW_STATE")
        retained = self.retained(edition_id)
        item, path = self._file(retained["binding"]["row_map_document_id"])
        selected, count, digest = [], 0, hashlib.sha256()
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as stream:
            for line in stream:
                digest.update(line)
                value = parse(line)
                if value.get("schema") != ROW:
                    fail("PROPERTY_ONBOARDING_ROW_MAP_CHANGED")
                if state and value["state"] != state:
                    continue
                if offset <= count < offset + limit:
                    selected.append(value)
                count += 1
        if digest.hexdigest() != item["files"][0]["sha256"]:
            fail("PROPERTY_ONBOARDING_ROW_MAP_CHANGED")
        return {"edition_id": edition_id, "projection_sha256": retained["binding"]["projection_sha256"],
                "offset": offset, "limit": limit, "state": state, "total": count,
                "next_offset": offset + len(selected) if offset + len(selected) < count else None, "rows": selected}

    def continuation(self, edition_id, replacement_document_ids=None):
        retained = self.retained(edition_id)
        value = clone(retained["plan"]["value"])
        replacements = replacement_document_ids or {}
        if not isinstance(replacements, dict):
            fail("PROPERTY_DOCUMENT_BINDINGS_REQUIRED")
        for key, did in replacements.items():
            item = self.property.document(did)
            if item["key"] != key or key not in value["document_ids"]:
                fail("PROPERTY_REPLACEMENT_DOCUMENT_KEY", document_key=key)
        old_ids = clone(value["document_ids"])
        value["document_ids"].update(replacements)
        for table in value["tables"]:
            keys = [key for key, did in old_ids.items() if did == table["document_id"]]
            if len(keys) != 1:
                fail("PROPERTY_TABLE_SOURCE_NOT_BOUND", table=table["key"])
            table["document_id"] = value["document_ids"][keys[0]]
        value["previous_id"] = edition_id
        value["name"] = value["name"][:900] + " — next source edition"
        return {"schema": SCHEMA, "source_edition_id": edition_id, "value": value,
                "instruction": "Choose the new retained source IDs, inspect the rows, and review all changed or omitted records."}


MAX_RETAINED_ROWS = 250000 * 64
