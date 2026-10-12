"""Private, revision-checked browser working copies. Named reviews stay authoritative. MIT."""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
import uuid
from dbt_store import require, text, identity, stamp, json_bytes, create_file, regular_open, private_dir, fsync_dir

SCHEMA = "stellar-forge.dbt-browser-draft.v1"
ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$")
FIELDS = {"edition", "baseline", "review", "selection", "decisions", "form", "node", "editor", "tab", "query", "type", "page", "editors"}

def validate_context(value):
    require(isinstance(value, dict) and FIELDS - {"editors"} <= set(value) <= FIELDS, "INVALID_BROWSER_CONTEXT")
    for key in ("edition", "baseline", "node"):
        text(value[key], key, 1024, empty=True)
    require(value["tab"] in ("resources", "intake", "changes", "review", "operations"), "INVALID_BROWSER_TAB")
    text(value["query"], "query", 4096, empty=True)
    text(value["type"], "type", 64, empty=True)
    require(type(value["page"]) is int and 0 <= value["page"] <= 10000000, "INVALID_BROWSER_PAGE")
    selection = value["selection"]
    require(isinstance(selection, list) and len(selection) <= 100000, "INVALID_BROWSER_SELECTION")
    for item in selection:
        text(item, "resource", 1024)
    require(len(set(selection)) == len(selection), "DUPLICATE_BROWSER_SELECTION")
    require(isinstance(value["decisions"], dict), "INVALID_BROWSER_DECISIONS")
    for uid, decision in value["decisions"].items():
        text(uid, "resource", 1024)
        require(isinstance(decision, dict) and set(decision) <= {"status", "note", "proposed_code"}, "INVALID_BROWSER_DECISION")
        require(decision.get("status") in ("accepted", "investigate", "excluded", "correction-proposed"), "INVALID_BROWSER_DISPOSITION")
        for key in ("note", "proposed_code"):
            if key in decision:
                text(decision[key], key, 1048576, empty=True)
    form = value["form"]
    require(isinstance(form, dict) and set(form) == {"name", "reviewer", "note"}, "INVALID_BROWSER_FORM")
    for key, maximum in (("name", 128), ("reviewer", 128), ("note", 1048576)):
        text(form[key], key, maximum, empty=True)
    editor = value["editor"]
    require(isinstance(editor, dict) and set(editor) == {"status", "note", "proposed_code"}, "INVALID_BROWSER_EDITOR")
    require(editor["status"] in ("", "accepted", "investigate", "excluded", "correction-proposed"), "INVALID_BROWSER_DISPOSITION")
    for key in ("note", "proposed_code"):
        text(editor[key], key, 1048576, empty=True)
    editors = value.get("editors", {})
    require(isinstance(editors, dict) and len(editors) <= 100000, "INVALID_BROWSER_EDITORS")
    for uid, pending in editors.items():
        text(uid, "resource", 1024)
        require(isinstance(pending, dict) and set(pending) == {"status", "note", "proposed_code"}, "INVALID_BROWSER_EDITOR")
        require(pending["status"] in ("", "accepted", "investigate", "excluded", "correction-proposed"), "INVALID_BROWSER_DISPOSITION")
        for key in ("note", "proposed_code"):
            text(pending[key], key, 1048576, empty=True)
    anchor = value["review"]
    if anchor is not None:
        require(isinstance(anchor, dict) and set(anchor) == {"id", "name", "revision"}, "INVALID_BROWSER_REVIEW")
        text(anchor["id"], "review_id", 128)
        text(anchor["name"], "review_name", 128)
        require(type(anchor["revision"]) is int and anchor["revision"] > 0, "INVALID_REVIEW_REVISION")
    return value

class BrowserDrafts:
    """Uses the original owner's mutex and private HTTP directory; no second owner."""
    def __init__(self, application):
        self.app = application
        self.root = private_dir(application.directory / "browser-drafts", create=True)

    def path(self, uid):
        require(isinstance(uid, str) and ID.fullmatch(uid), "INVALID_BROWSER_DRAFT_ID")
        return self.root / (uid + ".json")

    def get(self, uid):
        path = self.path(uid)
        require(path.exists(), "BROWSER_DRAFT_NOT_FOUND", status=404)
        with regular_open(path) as src:
            record = json.load(src)
        require(record.get("schema") == SCHEMA and record.get("project_id") == self.app.project.info["id"], "BROWSER_DRAFT_BINDING_CHANGED", status=409)
        return record

    def list(self):
        with self.app.mutex:
            rows = []
            for path in self.root.glob("*.json"):
                row = self.get(path.stem)
                context = row["context"]
                rows.append({key: row[key] for key in ("id", "revision", "updated_at", "project_id")} | {
                    "name": context["form"]["name"] or "Unnamed working copy",
                    "edition": context["edition"], "selection_count": len(context["selection"]),
                    "review": context["review"]})
            return sorted(rows, key=lambda row: (row["updated_at"], row["id"]), reverse=True)

    def save(self, uid, payload):
        require(isinstance(payload, dict) and set(payload) == {"expected_revision", "context"}, "INVALID_BROWSER_DRAFT")
        expected = payload["expected_revision"]
        require(type(expected) is int and expected >= 0, "INVALID_BROWSER_DRAFT_REVISION")
        context = validate_context(payload["context"])
        digest = identity(context)
        with self.app.mutex:
            require(not self.app.closing, "APPLICATION_DRAINING", status=409)
            path = self.path(uid)
            old = self.get(uid) if path.exists() else None
            revision = old["revision"] if old else 0
            # Exact repeat after a lost completion returns the already saved version.
            if old and revision == expected + 1 and old["context_sha256"] == digest:
                return old
            require(revision == expected, "BROWSER_DRAFT_CONFLICT", "This working copy changed in another tab. Reopen it or save your current work as a new copy.", 409)
            if old and old["context_sha256"] == digest:
                return old
            row = {"schema": SCHEMA, "id": uid, "project_id": self.app.project.info["id"],
                   "revision": revision + 1, "created_at": old["created_at"] if old else stamp(),
                   "updated_at": stamp(), "context_sha256": digest, "context": context}
            temp = self.root / ("." + uuid.uuid4().hex)
            try:
                create_file(temp, json_bytes(row))
                os.replace(temp, path)
                fsync_dir(self.root)
            finally:
                temp.unlink(missing_ok=True)
            return row
