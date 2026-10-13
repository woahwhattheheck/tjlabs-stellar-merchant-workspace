"""Prepare complete native receiving from a saved original Timescale pair.

The original warehouse remains the owner of reviews, editions, requests and
comparison revisions. This module reads those records and exports complete
private input files; the existing receiving program performs the handover.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import os
import re
import stat

from ..duckdb_agent import read_identity
from ..duckdb_dataset import _json
from ..duckdb_semantics import edition_fields, _file_bytes
from ..storage import digest, lock, parse, private_directory, sync_directory
from ..reconciliation.model import Reconciliation
from .model import report_bytes, report_guide_bytes
from .source import (CommissioningReport, MAX_REPORT, fields, filename, hash_id,
                     integer, interpretation, need, read_original, request_id,
                     text, uuid)

SCHEMA = "stellar-forge.duckdb-timescale-intake.receiving-preparation.v1"
MAX_INPUT = 2 * 1024 * 1024


def _json_bytes(value):
    return (_json(value) + "\n").encode("utf-8")


def _output_path(value):
    need(isinstance(value, (str, Path)), "PRIVATE_OUTPUT_REQUIRED")
    path = Path(value).expanduser()
    need(path.is_absolute() and path != Path("/") and path.resolve() == path,
         "CANONICAL_PRIVATE_OUTPUT_REQUIRED")
    return path


def _temporary(path):
    # This name belongs only to this final file in this preparation directory.
    # Keep it short even when the original publisher filename is long.
    return path.with_name(".timescale-preparation-" + digest(path.name.encode("utf-8")) + ".tmp")


def _private_bytes(path, maximum, *, empty=False):
    need(path.parent.resolve() == path.parent, "PRIVATE_OUTPUT_CHANGED")
    private_directory(path.parent, create=False)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_nlink in (1, 2)
             and not before.st_mode & 0o077
             and (0 if empty else 1) <= before.st_size <= maximum,
             "PRIVATE_PREPARATION_FILE_REQUIRED")
        raw = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    need(len(raw) == before.st_size
         and (before.st_dev, before.st_ino, before.st_size,
              before.st_mtime_ns, before.st_ctime_ns, before.st_nlink) ==
             (after.st_dev, after.st_ino, after.st_size,
              after.st_mtime_ns, after.st_ctime_ns, after.st_nlink),
         "ORIGINAL_PREPARATION_CHANGED")
    named = path.lstat()
    need(stat.S_ISREG(named.st_mode)
         and (named.st_dev, named.st_ino, named.st_size,
              named.st_mtime_ns, named.st_ctime_ns, named.st_nlink) ==
             (after.st_dev, after.st_ino, after.st_size,
              after.st_mtime_ns, after.st_ctime_ns, after.st_nlink),
         "ORIGINAL_PREPARATION_CHANGED")
    return raw, after


def _read_retained(path, maximum=MAX_REPORT, *, expected=None):
    """Finish only this file's exact interrupted exclusive publication."""
    raw, info = _private_bytes(path, maximum)
    if expected is not None:
        need(raw == expected, "ORIGINAL_PREPARATION_CHANGED")
    if info.st_nlink == 2:
        temporary = _temporary(path)
        staged, stage_info = _private_bytes(temporary, maximum)
        need(stage_info.st_nlink == 2
             and (stage_info.st_dev, stage_info.st_ino) == (info.st_dev, info.st_ino)
             and staged == raw, "ORIGINAL_PREPARATION_LINK_CHANGED")
        # No anonymous .write-* file or unrelated hard link is removed.
        named = temporary.lstat()
        final = path.lstat()
        need((named.st_dev, named.st_ino, named.st_nlink) ==
             (final.st_dev, final.st_ino, final.st_nlink) ==
             (info.st_dev, info.st_ino, 2),
             "ORIGINAL_PREPARATION_LINK_CHANGED")
        temporary.unlink()
        sync_directory(path.parent)
    need(read_original(path, maximum) == raw, "ORIGINAL_PREPARATION_CHANGED")
    return raw


def _retain(path, raw, maximum=MAX_REPORT):
    need(0 < len(raw) <= maximum, "PREPARATION_FILE_LIMIT")
    need(path.parent.resolve() == path.parent, "PRIVATE_OUTPUT_CHANGED")
    private_directory(path.parent)
    need(path.parent.resolve() == path.parent, "PRIVATE_OUTPUT_CHANGED")
    if path.exists() or path.is_symlink():
        _read_retained(path, maximum, expected=raw)
        sync_directory(path.parent)
        return
    temporary = _temporary(path)
    fd = os.open(temporary, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    with os.fdopen(fd, "r+b") as stream:
        before = os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
             and not before.st_mode & 0o077 and before.st_size <= len(raw),
             "PRIVATE_PREPARATION_FILE_REQUIRED")
        prefix = stream.read(len(raw) + 1)
        after = os.fstat(stream.fileno())
        need(len(prefix) == before.st_size and raw.startswith(prefix)
             and (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                 (after.st_size, after.st_mtime_ns, after.st_ctime_ns),
             "ORIGINAL_PREPARATION_CHANGED")
        stream.seek(len(prefix))
        stream.write(raw[len(prefix):])
        stream.flush()
        os.fsync(stream.fileno())
    staged, stage_info = _private_bytes(temporary, maximum)
    need(staged == raw and stage_info.st_nlink == 1
         and (stage_info.st_dev, stage_info.st_ino) == (before.st_dev, before.st_ino),
         "ORIGINAL_PREPARATION_CHANGED")
    # Leave a partial or completed staging file available on interruption.
    # The final name is published only after the complete source is fsynced.
    os.link(temporary, path, follow_symlinks=False)
    sync_directory(path.parent)
    _read_retained(path, maximum, expected=raw)

def _pair_request(db, pair):
    rows = db.execute(
        "SELECT record FROM sf_reconciliation_requests WHERE kind='pairs' "
        "AND state='COMPLETE' AND json_extract_string(record,'$.result.pair_id')=?",
        [pair["pair_id"]]).fetchall()
    candidates = []
    for (raw,) in rows:
        saved = parse(raw.encode("utf-8"))
        if saved.get("result") == pair:
            need(saved.get("kind") == "pairs" and saved.get("state") == "COMPLETE"
                 and saved.get("request_id") == saved.get("body", {}).get("request_id"),
                 "ORIGINAL_PAIR_REQUEST_CHANGED")
            request_id(saved["request_id"])
            candidates.append(saved)
    need(bool(candidates), "ORIGINAL_SAVED_PAIR_REQUEST_REQUIRED")
    candidates.sort(key=lambda item: (item.get("created_at", ""), item["request_id"]))
    return candidates[0]


def _snapshot(workspace, body):
    """Read the selected immutable records under the original native guard."""
    with workspace._guard(), workspace._connection() as db:
        need(read_identity(db) == body["workspace_id"], "WORKSPACE_ID_CHANGED")
        native = Reconciliation(workspace)
        need(native._exists(db), "SAVED_PAIR_REQUIRED")
        pair = native._pair_on(db, body["pair_id"], body["pair_revision"])
        current = native._pair_on(db, body["pair_id"])
        need(current == pair, "SELECT_CURRENT_PAIR_REVISION")
        reviewed = native._review_on(db, pair["definition"])
        need(reviewed["review_sha256"] == pair["definition_sha256"],
             "ORIGINAL_PAIR_DEFINITION_CHANGED")
        original_request = _pair_request(db, pair)
        need(original_request["body"]["workspace_id"] == body["workspace_id"],
             "WORKSPACE_ID_CHANGED")
        selections, originals, report_raw, report_record, report = {}, {}, None, None, None
        for name, key, role in (("baseline", "source_edition", "BASELINE"),
                                ("observed", "target_edition", "OBSERVED")):
            identity = hash_id(pair["definition"][key])
            edition = edition_fields(db, workspace._record(db, "sf_editions", identity))
            review = workspace._record(db, "sf_reviews", identity)
            context = edition.get("timescale_source")
            need(isinstance(context, dict), "TWO_TIMESCALE_EDITIONS_REQUIRED")
            need(edition["edition_id"] == edition["review_id"] == review["review_id"] == identity
                 and edition["manifest_sha256"] == review["manifest_sha256"]
                 and edition["columns"] == review["columns"]
                 and edition["keys"] == review["keys"] == []
                 and edition["row_count"] == review["row_count"]
                 and context == review.get("timescale_source"),
                 "REVIEW_EDITION_BINDING_CHANGED")
            report_id = hash_id(context["report_id"])
            if report is None:
                report_raw, report_record = report_bytes(
                    workspace, report_id, db=db, expected_workspace_id=body["workspace_id"])
                report = CommissioningReport(report_raw, report_id)
            need(report_id == report.sha256, "ONE_ORIGINAL_REPORT_FOR_INTAKE_RECEIVING_REQUIRED")
            selected = report.source(uuid(context["source_id"]))
            descriptor, table = selected["descriptor"], selected["table"]
            need(context["role"] == descriptor["role"] == role and len(table["rows"]) > 0,
                 "NONEMPTY_BASELINE_AND_OBSERVED_REQUIRED")
            need(context["descriptor"]["workspace_id"] == body["workspace_id"]
                 and context["descriptor"]["report_id"] == report_id
                 and context["descriptor"]["source_id"] == context["source_id"]
                 and context["descriptor"]["report_filename"] == report_record["filename"]
                 and context["native_sha256"] == descriptor["sha256"]
                 and context["table_digest"] == descriptor["tableDigest"]
                 and context["native_columns"] == table["columns"]
                 and edition["row_count"] == len(table["rows"]),
                 "ORIGINAL_REVIEW_SOURCE_CHANGED")
            columns = deepcopy(edition["columns"])
            need([item["source"] for item in columns] == table["names"],
                 "EVERY_ORIGINAL_FIELD_IN_NATIVE_ORDER_REQUIRED")
            meaning = interpretation(context["interpretation"], table["names"])
            meanings = {item["source"]: item for item in meaning["columns"]}
            meaning["columns"] = [meanings[field] for field in table["names"]]
            original = _file_bytes(db, identity, "original-commissioning.json", MAX_REPORT)
            source = _file_bytes(db, identity, "original-source.json", MAX_REPORT)
            need(original == report_raw and source == selected["content"],
                 "ORIGINAL_REVIEW_FILE_CHANGED")
            guide = report_guide_bytes(workspace, report_id, db=db)
            need(_file_bytes(db, identity, "TIMESCALE_INTAKE.md", MAX_INPUT) == guide,
                 "ORIGINAL_REVIEW_GUIDE_CHANGED")
            selections[name] = {"source_id": context["source_id"], "columns": columns,
                                "interpretation": meaning, "keys": []}
            originals[name] = {"edition": edition, "review": review, "source": source,
                               "filename": filename(descriptor["filename"]),
                               "guide": guide}
        need(selections["baseline"]["source_id"] != selections["observed"]["source_id"],
             "TWO_ORIGINAL_SOURCES_REQUIRED")
        return pair, original_request, selections, originals, report, report_record


def _prepared_files(body, root, customer, snapshot):
    pair, pair_request, selections, originals, report, report_record = snapshot
    report_raw = report.raw
    report_name = filename(report_record["filename"])
    report_path = root / "original-report" / report_name
    pair_input = deepcopy(pair["definition"])
    del pair_input["source_edition"]
    del pair_input["target_edition"]
    pair_input["saved"] = {"pair_id": pair["pair_id"], "revision": pair["revision"],
                           "definition_sha256": pair["definition_sha256"],
                           "request_id": pair_request["request_id"]}
    receiving = {key: body[key] for key in ("operation_id", "source_commit", "source_root",
                 "workspace_id", "native_workspace", "actor", "reason")}
    receiving.update(workspace=str(customer),
                     report={"path": str(report_path), "sha256": digest(report_raw),
                             "filename": report_name},
                     **selections, pair=pair_input)
    from .receiving import _binding, _source_contract
    receiving = _binding(receiving)
    source_contract = _source_contract(report, receiving)
    input_raw = _json_bytes(receiving)
    need(len(input_raw) <= MAX_INPUT, "COMPLETE_RECEIVING_INPUT_LIMIT")
    files = {
        "receiving-input.json": input_raw,
        "original-report/" + report_name: report_raw,
        "pair.json": _json_bytes(pair),
        "pair-request.json": _json_bytes(pair_request),
    }
    for name, original in originals.items():
        base = "sources/" + name + "/"
        files[base + "review.json"] = _json_bytes(original["review"])
        files[base + "edition.json"] = _json_bytes(original["edition"])
        files[base + "source/" + original["filename"]] = original["source"]
        files[base + "TIMESCALE_INTAKE.md"] = original["guide"]
    intent = {"schema": SCHEMA, "input": body, "destination": str(root),
              "workspace": str(customer), "pair": pair_input["saved"],
              "receiving_input_sha256": digest(input_raw)}
    manifest = {"schema": SCHEMA, "complete": True, "operation_id": body["operation_id"],
                "workspace_id": body["workspace_id"], "pair": pair_input["saved"],
                "input": "receiving-input.json", "input_sha256": digest(input_raw),
                "sources": source_contract,
                "files": [{"path": name, "bytes": len(raw), "sha256": digest(raw)}
                          for name, raw in sorted(files.items())],
                "receiver": "stellar_forge_buyer.timescale_intake.receiving"}
    return receiving, input_raw, files, intent, manifest


def _completed(workspace, body, root, customer):
    """Reopen a frozen complete preparation without selecting a newer pair."""
    path = root / "preparation.json"
    if not (path.exists() or path.is_symlink()):
        return None
    manifest = parse(_read_retained(path, MAX_INPUT))
    fields(manifest, ("schema", "complete", "operation_id", "workspace_id", "pair",
                      "input", "input_sha256", "sources", "files", "receiver"))
    need(manifest["schema"] == SCHEMA and manifest["complete"] is True
         and manifest["operation_id"] == body["operation_id"]
         and manifest["workspace_id"] == body["workspace_id"]
         and manifest["input"] == "receiving-input.json"
         and manifest["receiver"] == "stellar_forge_buyer.timescale_intake.receiving",
         "ORIGINAL_PREPARATION_CHANGED")
    need(isinstance(manifest["files"], list) and len(manifest["files"]) == 12,
         "COMPLETE_PREPARATION_FILES_REQUIRED")
    entries, retained = {}, {}
    for entry in manifest["files"]:
        fields(entry, ("path", "bytes", "sha256"))
        name = text(entry["path"], 1024)
        relative = Path(name)
        need(not relative.is_absolute() and relative.as_posix() == name
             and all(part not in (".", "..") for part in relative.parts)
             and name not in entries, "PREPARATION_FILE_PATH_CHANGED")
        integer(entry["bytes"], 1, MAX_REPORT)
        hash_id(entry["sha256"])
        entries[name] = entry

    def member(name, maximum=MAX_REPORT):
        need(name in entries, "COMPLETE_PREPARATION_FILES_REQUIRED")
        record = entries[name]
        need(record["bytes"] <= maximum, "PREPARATION_FILE_LIMIT")
        if name not in retained:
            raw = _read_retained(root / name, maximum)
            need(len(raw) == record["bytes"] and digest(raw) == record["sha256"],
                 "ORIGINAL_PREPARATION_CHANGED")
            retained[name] = raw
        return retained[name]

    input_raw = member("receiving-input.json", MAX_INPUT)
    from .receiving import _input
    checked_raw, receiving = _input(root / "receiving-input.json")
    need(checked_raw == input_raw and _json_bytes(receiving) == input_raw
         and digest(input_raw) == manifest["input_sha256"],
         "PREPARED_RECEIVING_INPUT_CHANGED")
    for key in ("operation_id", "workspace_id", "source_commit", "source_root",
                "native_workspace", "actor", "reason"):
        need(receiving[key] == body[key], "PREPARATION_INPUT_CHANGED")
    need(receiving["workspace"] == str(customer), "PREPARATION_INPUT_CHANGED")
    saved = receiving["pair"]["saved"]
    need(saved == manifest["pair"] and saved["pair_id"] == body["pair_id"]
         and saved["revision"] == body["pair_revision"], "ORIGINAL_SAVED_PAIR_CHANGED")
    report_name = filename(receiving["report"]["filename"])
    need(receiving["report"]["path"] == str(root / "original-report" / report_name),
         "PREPARATION_FILE_PATH_CHANGED")
    report_raw = member("original-report/" + report_name)
    report = CommissioningReport(report_raw, receiving["report"]["sha256"])
    pair = parse(member("pair.json"))
    pair_request = parse(member("pair-request.json"))
    need(pair["pair_id"] == saved["pair_id"] and pair["revision"] == saved["revision"]
         and pair["definition_sha256"] == saved["definition_sha256"]
         and pair_request["kind"] == "pairs" and pair_request["state"] == "COMPLETE"
         and pair_request["request_id"] == saved["request_id"]
         and pair_request["body"]["request_id"] == saved["request_id"]
         and pair_request["body"]["workspace_id"] == body["workspace_id"]
         and pair_request["result"] == pair, "ORIGINAL_SAVED_PAIR_CHANGED")
    selections, originals = {}, {}
    for name, key, role in (("baseline", "source_edition", "BASELINE"),
                            ("observed", "target_edition", "OBSERVED")):
        base = "sources/" + name + "/"
        edition = parse(member(base + "edition.json"))
        review = parse(member(base + "review.json"))
        identity = hash_id(pair["definition"][key])
        context = edition.get("timescale_source")
        need(isinstance(context, dict)
             and edition["edition_id"] == edition["review_id"] == review["review_id"] == identity
             and edition["manifest_sha256"] == review["manifest_sha256"]
             and edition["columns"] == review["columns"]
             and edition["keys"] == review["keys"] == []
             and edition["row_count"] == review["row_count"]
             and context == review.get("timescale_source"), "REVIEW_EDITION_BINDING_CHANGED")
        selected = report.source(uuid(context["source_id"]))
        descriptor, table = selected["descriptor"], selected["table"]
        need(context["report_id"] == report.sha256
             and context["source_id"] == receiving[name]["source_id"]
             and context["role"] == descriptor["role"] == role
             and context["descriptor"]["workspace_id"] == body["workspace_id"]
             and context["descriptor"]["report_id"] == report.sha256
             and context["descriptor"]["source_id"] == context["source_id"]
             and context["descriptor"]["report_filename"] == report_name
             and context["native_sha256"] == descriptor["sha256"]
             and context["table_digest"] == descriptor["tableDigest"]
             and context["native_columns"] == table["columns"]
             and edition["row_count"] == len(table["rows"]) > 0,
             "ORIGINAL_REVIEW_SOURCE_CHANGED")
        columns = deepcopy(edition["columns"])
        need([item["source"] for item in columns] == table["names"],
             "EVERY_ORIGINAL_FIELD_IN_NATIVE_ORDER_REQUIRED")
        meaning = interpretation(context["interpretation"], table["names"])
        meanings = {item["source"]: item for item in meaning["columns"]}
        meaning["columns"] = [meanings[field] for field in table["names"]]
        source_name = filename(descriptor["filename"])
        source_raw = member(base + "source/" + source_name)
        need(source_raw == selected["content"], "ORIGINAL_REVIEW_FILE_CHANGED")
        selections[name] = {"source_id": context["source_id"], "columns": columns,
                            "interpretation": meaning, "keys": []}
        originals[name] = {"edition": edition, "review": review, "source": source_raw,
                           "filename": source_name,
                           "guide": member(base + "TIMESCALE_INTAKE.md", MAX_INPUT)}
    prepared = _prepared_files(body, root, customer, (
        pair, pair_request, selections, originals, report, {"filename": report_name}))
    expected_receiving, expected_raw, files, intent, expected_manifest = prepared
    need(receiving == expected_receiving and input_raw == expected_raw
         and manifest == expected_manifest and set(entries) == set(files),
         "ORIGINAL_PREPARATION_CHANGED")
    # The full normalized caller input, paths and frozen native source contract
    # must match before a complete output can bypass the current-pair gate.
    _read_retained(root / "preparation-input.json", MAX_INPUT, expected=_json_bytes(intent))
    for name, raw in files.items():
        need(member(name) == raw, "ORIGINAL_PREPARATION_CHANGED")
    with workspace._guard(), workspace._connection() as db:
        need(read_identity(db) == body["workspace_id"], "WORKSPACE_ID_CHANGED")
    return manifest


def prepare_receiving(workspace, body, destination):
    """Export a repeatable complete input for the existing native receiver."""
    fields(body, ("operation_id", "workspace_id", "source_commit", "source_root",
                  "native_workspace", "pair_id", "pair_revision", "actor", "reason"))
    body = deepcopy(body)
    text(body["operation_id"], 240)
    request_id(body["workspace_id"]); hash_id(body["pair_id"])
    integer(body["pair_revision"], 1)
    need(isinstance(body["source_commit"], str)
         and re.fullmatch(r"[0-9a-f]{40}", body["source_commit"]),
         "RECEIVING_SOURCE_COMMIT_REQUIRED")
    text(body["actor"]); text(body["reason"])
    for key in ("source_root", "native_workspace"):
        body[key] = str(_output_path(body[key]))
    root = _output_path(destination)
    customer = workspace.directory
    need(root != customer and not root.is_relative_to(customer)
         and not customer.is_relative_to(root), "PRIVATE_OUTPUT_OUTSIDE_WORKSPACE_REQUIRED")
    private_directory(root)
    need(root.resolve() == root, "PRIVATE_OUTPUT_CHANGED")
    with lock(root):
        completed = _completed(workspace, body, root, customer)
        if completed is not None:
            return {**completed, "directory": str(root),
                    "input_path": str(root / "receiving-input.json"), "reused": True}
        # New and incomplete output still requires the selected current pair.
        prepared = _prepared_files(body, root, customer, _snapshot(workspace, body))
        receiving, input_raw, files, intent, manifest = prepared
        _retain(root / "preparation-input.json", _json_bytes(intent), MAX_INPUT)
        for name, raw in files.items():
            _retain(root / name, raw)
        from .receiving import _input
        checked_raw, checked = _input(root / "receiving-input.json")
        need(checked_raw == input_raw and checked == receiving, "PREPARED_RECEIVING_INPUT_CHANGED")
        _retain(root / "preparation.json", _json_bytes(manifest), MAX_INPUT)
    return {**manifest, "directory": str(root),
            "input_path": str(root / "receiving-input.json"), "reused": False}
