#!/usr/bin/env python3
"""Operate and independently receive the original content-consolidation case.

The supplied case selects original source files and exact mapping editions. All
migration, command recovery, review, export and backup writes use GovHub APIs.
This module keeps only caller receipts; it does not run a second migration queue.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from copy import deepcopy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import time
import uuid

APP = Path(__file__).resolve().parents[2]
if str(APP) not in sys.path:
    sys.path.insert(0, str(APP))

from govhub import GovHubError, file_digest, json_bytes, open_workspace, packed
from cli import password as read_password, export_files
from server import add_paths, open_store

SCHEMA = "govhub.content-consolidation.receiving-case.v1"
RECEIPT_SCHEMA = "govhub.content-consolidation.receiving-receipt.v1"
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
SHA = re.compile(r"^[0-9a-f]{64}$")
ACTIVE = {"QUEUED", "RUNNING"}


def required(value, message):
    if not value:
        raise GovHubError("RECEIVING_INPUT", message)
    return value


def member(value):
    if not isinstance(value, str) or not NAME.fullmatch(value):
        raise GovHubError("RECEIVING_NAME", "Use a stable name containing letters, digits, underscores or hyphens.")
    return value


def absolute_directory(value, *, create=False):
    path = Path(value)
    if not path.is_absolute() or path.is_symlink():
        raise GovHubError("RECEIVING_DIRECTORY", "Choose an absolute ordinary private directory.")
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not path.is_dir():
        raise GovHubError("RECEIVING_DIRECTORY", "The selected directory does not exist.")
    return path.resolve()


def read_json(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 32 * 1024 * 1024:
        raise GovHubError("RECEIVING_RECORD", "Choose a complete ordinary receiving JSON file within 32 MiB.")
    return json_bytes(path.read_bytes())


def write_json(path, value):
    """Publish a complete caller receipt with an atomic same-directory replace."""
    path = Path(path)
    if path.is_symlink():
        raise GovHubError("RECEIVING_RECORD", "A receiving record cannot be a symbolic link.")
    payload = (packed(value) + "\n").encode("utf-8")
    temporary = path.parent / ("." + path.name + "-" + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        temporary.unlink(missing_ok=True)


def sha_json(value):
    return hashlib.sha256(packed(value).encode("utf-8")).hexdigest()


def authenticate_user(workspace, username, password):
    # Same original password verification and disabled-account handling as cli.py.
    user = workspace.authenticate(username, password)
    if not user:
        raise GovHubError("AUTH_REQUIRED", "Username or password was not recognized.", 401)
    return user


class ReceivingCase:
    """Complete source, review, native continuation and receiving composition.

    Use as a context manager to serialize this caller's receipts. The original
    service/worker/storage locks still own workspace and target operations.
    """

    def __init__(self, workspace, user, definition, directory):
        self.workspace, self.user = workspace, user
        self.definition = deepcopy(definition)
        required(isinstance(definition, dict) and definition.get("schema") == SCHEMA,
                 "Select a complete content-consolidation receiving case.")
        self.identity = member(definition.get("id"))
        stages = definition.get("stages")
        required(isinstance(stages, list) and stages, "The case needs its selected source/mapping stages.")
        self.stages = {}
        for stage in stages:
            name = member(stage.get("id"))
            required(name not in self.stages, "Each stage must have a distinct stable name.")
            self.stages[name] = stage
        self.digest = sha_json(definition)
        self.directory = absolute_directory(directory, create=True)
        required(not self.directory.is_relative_to(workspace.root),
                 "Keep the receiving caller records outside the private workspace.")
        with workspace.connect(snapshot=True) as db:
            self.workspace_id = workspace.meta(db)["workspace"]
        self._lock = None

    def __enter__(self):
        self._lock = os.open(self.directory / "receiving.lock",
                             os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self._lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            os.close(self._lock)
            self._lock = None
            raise GovHubError("RECEIVING_OWNED", "This receiving caller is already active.", 409) from exc
        expected = {"schema": RECEIPT_SCHEMA, "case_id": self.identity,
                    "case_sha256": self.digest, "workspace": self.workspace_id}
        path = self.directory / "case-binding.json"
        try:
            if path.exists():
                required(read_json(path) == expected,
                         "This receiving directory belongs to a different case or original workspace.")
                required(sha_json(read_json(self.directory / "case.json")) == self.digest,
                         "The retained case definition changed.")
            else:
                write_json(self.directory / "case.json", self.definition)
                write_json(path, expected)
        except BaseException:
            self.__exit__(None, None, None)
            raise
        return self

    def __exit__(self, *_):
        if self._lock is not None:
            os.close(self._lock)
            self._lock = None

    def key(self, step):
        return "content-receiving-" + sha_json({"case": self.digest, "step": step})

    def call(self, action, payload, user=None):
        return self.workspace.dispatch(action, payload, user or self.user)

    def retain(self, selection):
        """Use original retained files, including a lost sources.retain reply."""
        required(isinstance(selection, dict), "Each selected file needs its exact original identity.")
        expected_sha, expected_size = selection.get("sha256"), selection.get("bytes")
        required(isinstance(expected_sha, str) and SHA.fullmatch(expected_sha),
                 "Every input file needs its original SHA-256.")
        required(isinstance(expected_size, int) and not isinstance(expected_size, bool)
                 and expected_size >= 0, "Every input file needs its complete byte count.")
        if selection.get("file_id"):
            item = self.call("sources.get", {"file_id": selection["file_id"]})["file"]
        else:
            relative = selection.get("path")
            required(isinstance(relative, str) and relative, "Select a path under the original source root.")
            # Open and hash the exact descriptor through the existing no-link path validator.
            with self.workspace._source_open(relative) as source:
                actual_sha, actual_size = file_digest(source)
            required((actual_sha, actual_size) == (expected_sha, expected_size),
                     "The selected source differs from the case's original bytes.")
            filename = Path(relative).name
            label = selection.get("source_label", filename)
            category = selection.get("category", "Extract")
            # sources.retain is content addressed but has no request-key argument.
            # An exact prior retained file is the proper lost-response reconciliation.
            with self.workspace.connect(snapshot=True) as db:
                rows = db.execute(
                    "SELECT * FROM files WHERE sha256=? AND bytes=? AND filename=? AND category=? AND source_label=? ORDER BY created_at,id",
                    (expected_sha, expected_size, filename, category, label)).fetchall()
            if rows:
                item = self.call("sources.get", {"file_id": rows[0]["id"]})["file"]
            else:
                item = self.call("sources.retain", {"path": relative,
                    "source_label": label, "category": category})
        required((item["sha256"], item["bytes"]) == (expected_sha, expected_size),
                 "The retained source identity differs from the selected original.")
        return item

    def family(self):
        specification = deepcopy(required(self.definition.get("family"), "Select the original target family."))
        saved = self.directory / "family.json"
        identity = specification.get("family_id") or (read_json(saved)["id"] if saved.exists() else None)
        if identity:
            return self.call("content.families.get", {"family_id": identity})["family"]
        specification["request_key"] = self.key("family")
        family = self.call("content.families.save", specification)["family"]
        write_json(saved, family)
        return family

    def prepared(self, stage_id):
        path = self.directory / (member(stage_id) + "-prepared.json")
        required(path.exists(), "Prepare this exact stage before reviewing or executing it.")
        result = read_json(path)
        mapping = self.call("content.mappings.get", {"mapping_id": result["mapping"]["id"]})["mapping"]
        required(mapping["sha256"] == result["mapping"]["sha256"],
                 "The retained mapping no longer matches this receiving stage.")
        return result

    def prepare(self, stage_id):
        stage = self.stages[member(stage_id)]
        family = self.family()
        previous = stage.get("previous_stage")
        old = self.prepared(previous) if previous else None
        required(not old or old["family"]["id"] == family["id"],
                 "A corrected stage must retain its original consolidation.")
        files, editions = {}, {}
        for selection in stage.get("files", []):
            name = member(selection.get("name"))
            required(name not in files, "Each file alias must be unique within its stage.")
            files[name] = self.retain(selection)
        for feed in stage.get("feeds", []):
            value = deepcopy(feed)
            name = member(value.pop("name", None))
            required(name not in editions, "Each original feed alias must be unique.")
            selected = []
            for part in value.pop("files", []):
                if isinstance(part, str):
                    part = {"file": part}
                ref = files[part["file"]]
                selected.append({"file_id": ref["id"], "request_url": part.get("request_url", "")})
            value.update(family_id=family["id"], files=selected,
                         request_key=self.key(stage_id + ":edition:" + name))
            editions[name] = self.call("content.editions.create", value)["edition"]
        definition = deepcopy(required(stage.get("mapping"), "Supply the complete native mapping."))
        for migration in definition.get("migrations", []):
            if "edition_name" in migration:
                migration["edition_id"] = editions[migration.pop("edition_name")]["id"]
            required("edition_id" in migration, "Select each migration's exact retained source edition.")
            for binding in migration.get("file_bindings", []):
                if "file_name" in binding:
                    alias = binding.pop("file_name")
                    required(alias in files, "Retain the selected original media file in this stage.")
                    binding["file_id"] = files[alias]["id"]
        for binding in definition.get("files", []):
            if "file_name" in binding:
                binding["file_id"] = files[binding.pop("file_name")]["id"]
        if old:
            before = {m["id"]: (m.get("source_ids"), m["destination"]["plugin"])
                      for m in old["mapping"]["definition"]["migrations"]}
            after = {m["id"]: (m.get("source_ids"), m["destination"]["plugin"])
                     for m in definition["migrations"]}
            required(before == after,
                     "A corrected edition must keep this case's native migration IDs, source ID order and entity types.")
        preview = self.call("content.mappings.preview",
                            {"family_id": family["id"], "definition": definition})["compiled"]
        request = {"family_id": family["id"], "label": stage.get("label", stage_id),
                   "definition": definition,
                   "expected_mapping_id": old["mapping"]["id"] if old else stage.get("expected_mapping_id", ""),
                   "request_key": self.key(stage_id + ":mapping")}
        mapping = self.call("content.mappings.save", request)["mapping"]
        comparisons = {}
        if old:
            previous_feeds = {e["source_id"]: e for e in old["editions"].values()}
            for alias, edition in editions.items():
                prior = previous_feeds.get(edition["source_id"])
                if prior:
                    comparisons[alias] = self.call("content.editions.compare",
                        {"before_id": prior["id"], "after_id": edition["id"]})
        result = {"schema": RECEIPT_SCHEMA, "case_sha256": self.digest, "stage": stage_id,
                  "family": family, "files": files, "editions": editions,
                  "mapping": mapping, "issues": preview["issues"], "comparisons": comparisons}
        write_json(self.directory / (stage_id + "-prepared.json"), result)
        return result

    def capture_backup(self, stage_id):
        member(stage_id)
        family = self.family()
        result = self.call("sources.capture", {"environment_id": family["environment_id"],
            "request_key": self.key(stage_id + ":target-backup")})
        write_json(self.directory / (stage_id + "-target-backup.json"), result)
        return self.inspect(result["operation"]["id"])

    def backup_file(self, operation_id):
        value = self.inspect(operation_id)["operation"]
        required(value["type"] == "CAPTURE" and value["state"] == "COMPLETE",
                 "Choose the original completed target capture for this update.")
        selected = [item["file"] for item in value.get("retained_artifacts", []) if item.get("role") == "backup"]
        required(len(selected) == 1, "Select the exact backup file when a native capture returns several.")
        return self.call("sources.get", {"file_id": selected[0]["id"]})["file"]

    def review(self, stage_id, mapping_sha256, reason, reviewer, backup_file_id=None):
        prepared = self.prepared(stage_id)
        mapping = prepared["mapping"]
        required(mapping["sha256"] == mapping_sha256,
                 "Supply the SHA-256 of the exact mapping that the reviewer inspected.")
        payload = {"mapping_id": mapping["id"], "mapping_sha256": mapping_sha256,
                   "decision": "APPROVE", "reason": reason,
                   "request_key": self.key(stage_id + ":review:" + mapping_sha256)}
        if backup_file_id:
            payload["backup_file_id"] = backup_file_id
        result = self.call("content.reviews.save", payload, reviewer)
        write_json(self.directory / (stage_id + "-review.json"), result)
        return result

    def operation(self, stage_id, kind="CONTENT_IMPORT", reason=None, *,
                  selection=None, request_suffix=None):
        stage_id = member(stage_id)
        required(kind in {"CONTENT_IMPORT", "CONTENT_ROLLBACK", "CONTENT_RECEIVE", "CONTENT_STATUS"},
                 "Choose an original content operation.")
        review_path = self.directory / (stage_id + "-review.json")
        required(review_path.exists(), "Review this mapping through the original reviewer account first.")
        review = read_json(review_path)
        plan = required(review.get("plan"), "The original review did not approve a native plan.")
        fresh = self.call("content.plans.get", {"content_plan_id": plan["id"]})["plan"]
        required(fresh["sha256"] == plan["sha256"], "The retained plan identity changed.")
        stage = self.stages[stage_id]
        suffix = member(request_suffix) if request_suffix is not None else ""
        step = stage_id + ":" + kind + (":" + suffix if suffix else "")
        receipt_name = stage_id + "-" + kind + ("-" + suffix if suffix else "")
        payload = {"content_plan_id": plan["id"], "plan_sha256": plan["sha256"],
                   "type": kind, "reason": reason or stage.get("operation_reason", "Execute the exact reviewed source edition.")}
        if kind == "CONTENT_IMPORT" and "content_row_limit" in stage:
            row_limit = stage["content_row_limit"]
            required(isinstance(row_limit, int) and not isinstance(row_limit, bool) and row_limit >= 0,
                     "Use zero for the full import or a positive native row count per continuation.")
            payload["content_row_limit"] = row_limit
        if kind == "CONTENT_ROLLBACK":
            selection = deepcopy(selection if selection is not None else stage.get("content_selection"))
            required(isinstance(selection, list) and selection,
                     "Select the exact original migration/source IDs for native rollback.")
            for entry in selection:
                required(isinstance(entry, dict) and set(entry) == {"migration_id", "source_ids"},
                         "Each rollback entry contains migration_id and the original ordered source_ids.")
                required(isinstance(entry["migration_id"], str) and entry["migration_id"]
                         and isinstance(entry["source_ids"], list) and entry["source_ids"]
                         and all(isinstance(value, str) and value for value in entry["source_ids"]),
                         "Keep the rollback migration and complete ordered source keys unchanged.")
            payload["content_selection"] = selection
            selected_sha = sha_json(selection)
            step += ":" + selected_sha
            receipt_name += "-" + selected_sha[:16]
        else:
            required(selection is None, "A source-ID selection belongs to native rollback.")
        payload["request_key"] = self.key(step)
        request_path = self.directory / ("request-" + receipt_name + ".json")
        if request_path.exists():
            required(read_json(request_path) == payload,
                     "Continue the exact retained operation request or choose an explicit new request suffix.")
        else:
            write_json(request_path, payload)
        result = self.call("content.operations.create", payload)
        write_json(self.directory / (receipt_name + ".json"), result)
        return self.inspect(result["operation"]["id"])

    def inspect(self, operation_id, *, retain=True):
        result = self.call("operations.get", {"operation_id": operation_id})
        value, family = result["operation"], self.family()
        allowed = value.get("content_family_id") == family["id"]
        allowed = allowed or value["type"] == "CAPTURE" and value["environment_id"] == family["environment_id"]
        required(allowed, "The native operation belongs to another consolidation or target.")
        if retain:
            write_json(self.directory / ("operation-" + member(operation_id) + ".json"), result)
        return result

    def resume(self, operation_id, reason):
        result = self.inspect(operation_id)
        current = result["operation"]
        if current["state"] in ACTIVE | {"COMPLETE"}:
            return result
        payload = {"operation_id": operation_id, "expected_revision": current["revision"],
                   "reason": reason,
                   "request_key": self.key("resume:" + operation_id + ":" + current["revision"])}
        # Original GovHub alone evaluates whether this retained native checkpoint
        # can continue. This caller never clears a map, command journal or intent.
        self.call("operations.resume", payload)
        return self.inspect(operation_id)

    def cancel(self, operation_id, reason):
        current = self.inspect(operation_id)["operation"]
        self.call("operations.cancel", {"operation_id": operation_id,
            "expected_revision": current["revision"], "reason": reason})
        return self.inspect(operation_id)

    def wait(self, operation_id, timeout=600, progress=None):
        deadline, previous = time.monotonic() + timeout, None
        while True:
            result = self.inspect(operation_id, retain=False)
            operation = result["operation"]
            marker = (operation["revision"], operation["state"])
            if marker != previous:
                write_json(self.directory / ("operation-" + member(operation_id) + ".json"), result)
                if progress:
                    progress({"id": operation_id, "state": operation["state"],
                              "progress": operation["progress"]})
            previous = marker
            if operation["state"] not in ACTIVE or time.monotonic() >= deadline:
                return result
            time.sleep(0.5)

    @contextmanager
    def worker(self):
        """Borrow the existing worker in this process under its original lease."""
        with self.workspace.service_lease():
            self.workspace.start_worker()
            try:
                yield
            finally:
                self.workspace.stop_worker()

    def export(self, destination, name, request_suffix="delivery", workspace=None, user=None):
        workspace, user = workspace or self.workspace, user or self.user
        family_id = self.family()["id"]
        payload = {"name": name, "plan_ids": [], "content_family_ids": [family_id],
                   "include_sources": True, "request_key": self.key(request_suffix)}
        result = workspace.dispatch("exports.create", payload, user)
        export = result["export"]
        destination = Path(destination)
        if destination.exists():
            # The original exported files identify completion after a lost reply.
            required(not (destination / "TRANSFER_INCOMPLETE").exists(),
                     "The original transfer remains incomplete; retain it and use a new receiving destination.")
            receipt = verify_export_directory(destination, export)
            transfer = {"export_id": export["id"], "destination": str(destination),
                        "files": receipt, "reopened": True}
        else:
            transfer = export_files(workspace, export["id"], destination, user)
        write_json(self.directory / ("export-" + member(request_suffix) + ".json"),
                   {"export": export, "transfer": transfer})
        return {"export": export, "transfer": transfer}

    def receive(self, destination, name, recipient_auth, note, *, assessment_core=None):
        """Make a full native backup, reopen it, edit scope and re-export.

        The completed native source, full media, mapping/review history and
        original command identities are compared before the recipient edits.
        """
        target = absolute_directory(destination, create=True)
        family = self.family()
        original = self.call("content.families.get", {"family_id": family["id"]})
        active = [o["id"] for o in original["operations"] if o["state"] in ACTIVE]
        required(not active, "Finish or reconcile the original native operation before customer receiving.")
        required(original["plans"] and original["operations"],
                 "Run the original reviewed content workflow before delivering its native result.")
        imports = [o for o in original["operations"] if o["type"] == "CONTENT_IMPORT"]
        required(imports and all(o["state"] == "COMPLETE" for o in imports),
                 "Complete the selected imports through their original native checkpoints.")
        first = self.export(target / "handover", name, "source-handover")
        backup_path = target / "editable-workspace"
        backup_record = self.directory / "backup.json"
        if backup_path.exists():
            required(not (backup_path / "BACKUP_INCOMPLETE").exists(),
                     "The original backup is incomplete; preserve it and choose a new receiving directory.")
            backup = read_json(backup_path / "backup.json")
            required(backup.get("workspace") == self.workspace_id,
                     "This backup belongs to another original workspace.")
        else:
            backup = self.call("workspace.backup", {"destination": str(backup_path)})
        write_json(backup_record, backup)
        # Same original code and auth store. The new receiver has its own local
        # root, while the original native target/profile and command IDs persist.
        receiving = open_workspace(backup_path, source_root_path=self.workspace.source_root,
                                   assessment_core_path=assessment_core, create=False)
        recipient = recipient_auth(receiving)
        current = receiving.dispatch("content.families.get", {"family_id": family["id"]}, recipient)
        before = content_identity(self.workspace, self.user, original)
        after = content_identity(receiving, recipient, current)
        required(before == after,
                 "The receiver does not contain every exact source edition, mapping, native plan and operation.")
        for item in before["sources"]:
            actual = receiving.dispatch("sources.get", {"file_id": item["id"]}, recipient)["file"]
            required((actual["sha256"], actual["bytes"]) == (item["sha256"], item["bytes"]),
                     "A complete original source or media file is missing from the receiver.")
        required(isinstance(note, str) and note.strip(),
                 "Retain the recipient's actual continuation note.")
        edit_path = self.directory / "recipient-edit-request.json"
        if edit_path.exists():
            retained_edit = read_json(edit_path)
            required(retained_edit["note"] == note.strip() and retained_edit["destination"] == str(target),
                     "Resume this recipient's exact retained edit before starting a different continuation.")
            edited = retained_edit["payload"]
        else:
            version = current["family"]
            edited = {key: version[key] for key in
                      ("label", "environment_id", "owner", "notes", "comparison_id", "limits", "recovery_instruction")}
            edited.update(family_id=family["id"], expected_revision=version["revision"],
                          notes=version["notes"] + "\n\nRecipient continuation: " + note.strip(),
                          request_key=self.key("recipient-scope"))
            write_json(edit_path, {"destination": str(target), "note": note.strip(), "payload": edited})
        changed = receiving.dispatch("content.families.save", edited, recipient)
        successor = self.export(target / "recipient-handover", name + " — recipient continuation",
                                "recipient-handover", workspace=receiving, user=recipient)
        comparison = receiving.dispatch("exports.compare",
            {"before_id": first["export"]["id"], "after_id": successor["export"]["id"]}, recipient)
        result = {"schema": RECEIPT_SCHEMA, "status": "RECEIVED_EDITED_REEXPORTED",
                  "case_id": self.identity, "case_sha256": self.digest,
                  "source_handover": first, "backup": backup,
                  "original_identity": before, "received_identity": after,
                  "recipient_family": changed["family"], "successor_handover": successor,
                  "handover_comparison": comparison}
        write_json(target / "receiving-result.json", result)
        write_json(self.directory / "receiving-result.json", result)
        return result


def content_identity(workspace, user, summary):
    """Compare complete original record identities, including native results."""
    def call(action, data):
        return workspace.dispatch(action, data, user)
    editions, sources = [], {}
    for item in summary["editions"]:
        edition = call("content.editions.get", {"edition_id": item["id"], "limit": 1})["edition"]
        editions.append({"id": edition["id"], "sha256": edition["sha256"],
                         "source_sha256": edition["source_sha256"], "rows": edition["row_count"]})
        for file in edition["files"]:
            sources[file["id"]] = {k: file[k] for k in ("id", "sha256", "bytes")}
    mappings = []
    for item in summary["mappings"]:
        mapping = call("content.mappings.get", {"mapping_id": item["id"]})["mapping"]
        mappings.append({"id": mapping["id"], "sha256": mapping["sha256"]})
        for file in mapping["compiled"]["files"]:
            actual = call("sources.get", {"file_id": file["file_id"]})["file"]
            sources[actual["id"]] = {k: actual[k] for k in ("id", "sha256", "bytes")}
    for review in summary["reviews"]:
        if review.get("backup_ref"):
            actual = call("sources.get", {"file_id": review["backup_ref"]["file_id"]})["file"]
            sources[actual["id"]] = {k: actual[k] for k in ("id", "sha256", "bytes")}
    plans = [{"id": p["id"], "sha256": p["sha256"]} for p in summary["plans"]]
    operations = []
    for item in summary["operations"]:
        report = call("operations.get", {"operation_id": item["id"]})
        value = report["operation"]
        operations.append({"id": value["id"], "revision": value["revision"], "state": value["state"],
                           "content_plan_id": value["content_plan_id"],
                           "content_plan_sha256": value["content_plan_sha256"],
                           "native_result_sha256": sha_json(value.get("native_result")),
                           "checkpoint_sha256": sha_json(value.get("checkpoint")),
                           "resume_checkpoint_sha256": sha_json(value.get("resume_checkpoint"))})
        for file in report["files"]:
            actual = call("sources.get", {"file_id": file["file_id"]})["file"]
            sources[actual["id"]] = {k: actual[k] for k in ("id", "sha256", "bytes")}
    return {"family_id": summary["family"]["id"],
            "editions": editions, "mappings": mappings, "reviews": summary["reviews"],
            "plans": plans, "operations": operations,
            "sources": sorted(sources.values(), key=lambda item: item["id"])}


def verify_export_directory(directory, record):
    directory = absolute_directory(directory)
    required(not (directory / "TRANSFER_INCOMPLETE").exists(), "The handover transfer remains incomplete.")
    receipts = []
    names = set()
    for file in record["files"]:
        name = file["name"]
        required(isinstance(name, str) and Path(name).name == name and name not in {".", ".."}
                 and name not in names, "The retained handover has an invalid file name.")
        names.add(name)
        path = directory / name
        required(not path.is_symlink() and path.is_file(), "A declared handover file is missing.")
        sha, size = file_digest(path)
        required((sha, size) == (file["sha256"], file["size"]),
                 "The handover file differs from the original retained export.")
        receipts.append({"name": name, "sha256": sha, "size": size})
    required({p.name for p in directory.iterdir()} == names,
             "This directory includes files outside the selected original handover.")
    return receipts


def compact(result):
    if "operation" in result:
        value = result["operation"]
        return {"operation_id": value["id"], "state": value["state"], "progress": value["progress"],
                "error": value.get("error"),
                "artifacts": [{"role": item["role"], "file_id": item["file"]["id"],
                               "sha256": item["file"]["sha256"], "bytes": item["file"]["bytes"]}
                              for item in value.get("retained_artifacts", [])]}
    if "mapping" in result:
        value = result["mapping"]
        return {"stage": result["stage"], "family_id": result["family"]["id"],
                "mapping_id": value["id"], "mapping_sha256": value["sha256"],
                "counts": value["compiled"]["counts"], "issues": value["compiled"]["issues"]}
    if result.get("plan"):
        return {"review_id": result["review"]["id"], "plan_id": result["plan"]["id"],
                "plan_sha256": result["plan"]["sha256"]}
    if result.get("status") == "RECEIVED_EDITED_REEXPORTED":
        return {"status": result["status"], "case_id": result["case_id"],
                "source_export_id": result["source_handover"]["export"]["id"],
                "recipient_export_id": result["successor_handover"]["export"]["id"],
                "received_sources": len(result["received_identity"]["sources"])}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_paths(parser)
    parser.add_argument("--username", required=True)
    credentials = parser.add_mutually_exclusive_group()
    credentials.add_argument("--password-env")
    credentials.add_argument("--password-stdin", action="store_true")
    parser.add_argument("--case", type=Path, required=True)
    parser.add_argument("--receipts", type=Path, required=True)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("stage")
    review = commands.add_parser("review")
    review.add_argument("stage")
    review.add_argument("--mapping-sha256", required=True)
    review.add_argument("--reason", required=True)
    backup_input = review.add_mutually_exclusive_group()
    backup_input.add_argument("--backup-file-id")
    backup_input.add_argument("--backup-operation-id")
    capture = commands.add_parser("capture-backup")
    capture.add_argument("stage")
    capture.add_argument("--timeout", type=float, default=600)
    capture.add_argument("--worker", action="store_true")
    execute = commands.add_parser("execute")
    execute.add_argument("stage")
    execute.add_argument("--kind", choices=("CONTENT_IMPORT", "CONTENT_ROLLBACK", "CONTENT_RECEIVE", "CONTENT_STATUS"), default="CONTENT_IMPORT")
    execute.add_argument("--selection", type=Path, help="Original migration/source-ID JSON array for selected native rollback.")
    execute.add_argument("--request-suffix", help="Stable name for a distinct operation on the same reviewed plan.")
    execute.add_argument("--reason", help="The original instruction for this selected native operation.")
    execute.add_argument("--timeout", type=float, default=600)
    execute.add_argument("--worker", action="store_true", help="Own the original local worker under its existing service lease.")
    for name in ("resume", "cancel", "inspect"):
        part = commands.add_parser(name)
        part.add_argument("operation_id")
        if name != "inspect":
            part.add_argument("--reason", required=True)
        if name == "resume":
            part.add_argument("--worker", action="store_true")
            part.add_argument("--timeout", type=float, default=600)
    delivery = commands.add_parser("receive")
    delivery.add_argument("--destination", type=Path, required=True)
    delivery.add_argument("--name", required=True)
    delivery.add_argument("--note", required=True)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        workspace = open_store(args)
        password = read_password(args)
        user = authenticate_user(workspace, args.username, password)
        definition = read_json(args.case)
        with ReceivingCase(workspace, user, definition, args.receipts) as case:
            if args.command == "prepare":
                result = case.prepare(args.stage)
            elif args.command == "review":
                backup_id = case.backup_file(args.backup_operation_id)["id"] if args.backup_operation_id else args.backup_file_id
                result = case.review(args.stage, args.mapping_sha256, args.reason, user, backup_id)
            elif args.command == "receive":
                result = case.receive(args.destination, args.name,
                    lambda receiver: authenticate_user(receiver, args.username, password),
                    args.note, assessment_core=args.assessment_core)
            elif args.command == "inspect":
                result = case.inspect(args.operation_id)
            elif args.command == "cancel":
                result = case.cancel(args.operation_id, args.reason)
            else:
                def operate():
                    if args.command == "resume":
                        begun = case.resume(args.operation_id, args.reason)
                    elif args.command == "capture-backup":
                        begun = case.capture_backup(args.stage)
                    else:
                        begun = case.operation(args.stage, args.kind, args.reason,
                            selection=read_json(args.selection) if args.selection else None,
                            request_suffix=args.request_suffix)
                    return case.wait(begun["operation"]["id"], args.timeout)
                if args.worker:
                    with case.worker():
                        result = operate()
                else:
                    result = operate()
        print(json.dumps(compact(result), ensure_ascii=False, allow_nan=False))
        return 0 if "operation" not in result or result["operation"]["state"] == "COMPLETE" else 3
    except Exception as error:
        print(json.dumps({"code": getattr(error, "code", "RECEIVING_ERROR"),
                          "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
