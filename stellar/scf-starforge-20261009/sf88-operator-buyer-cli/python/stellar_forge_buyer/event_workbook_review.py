"""Validate and retain full Event worksheet reviews with the original action.

This calls the installed original JavaScript model through the existing Node
runtime. Browser-supplied values are data; executable paths stay in this package.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from .errors import StateError

LIMIT = 16 * 1024 * 1024


def need(value, message):
    if not value:
        raise StateError("EVENT_WORKBOOK_REVIEW_" + message)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def validate_review(workspace, programme, operation, review_sha256, columns, value):
    need(isinstance(value, dict), "COMPLETE_SOURCE_REQUIRED")
    body = encoded(value)
    need(0 < len(body) <= LIMIT, "SOURCE_TOO_LARGE")
    original = value.get("original")
    expected = {"workspace_id": workspace.identity, "programme": programme,
                "proposal": operation.get("column_choices")}
    need(isinstance(expected["proposal"], dict) and original == expected and
         expected["proposal"].get("operation_id") == operation["id"] and
         expected["proposal"].get("review_sha256") == review_sha256 and
         operation.get("review", {}).get("review_sha256") == review_sha256,
         "ORIGINAL_PROPOSAL_CHANGED")
    source = Path(__file__).resolve().parents[2] / "event-feed"
    names = ("workbook-columns-cli.mjs", "workbook-columns.mjs", "workbook-returns.mjs",
             "workbook-editor.mjs")
    before = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in names}
    with tempfile.TemporaryDirectory(prefix="event-workbook-review-") as temporary:
        root = Path(temporary)
        original_path, output_path = root / "whole-review.json", root / "native-columns.json"
        original_path.write_bytes(body)
        completed = subprocess.run(
            [workspace.node, str(source / "workbook-columns-cli.mjs"), "columns",
             "--choices", str(original_path), "--out", str(output_path)],
            capture_output=True, check=False, timeout=120)
        need(completed.returncode == 0,
             completed.stderr.decode("utf-8", "replace")[:8000] or "SOURCE_VALIDATION_FAILED")
        need(output_path.is_file() and output_path.stat().st_size <= LIMIT,
             "NATIVE_COLUMNS_TOO_LARGE")
        checked = json.loads(output_path.read_bytes())
    need(before == {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in names},
         "INSTALLED_SOURCE_CHANGED")
    need(checked == columns, "SELECTED_COLUMNS_CHANGED")
    return {"schema": "stellar-forge.event-workbook-review-validation.v1",
            "workspace_id": workspace.identity, "programme": programme,
            "operation_id": operation["id"], "review_sha256": review_sha256,
            "working_sha256": hashlib.sha256(body).hexdigest(), "working_bytes": len(body),
            "columns_sha256": digest(columns), "validator_sources": before}
