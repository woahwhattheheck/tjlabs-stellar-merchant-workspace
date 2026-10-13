"""Bind a complete retained mapping working copy to the original native Review."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from .errors import StateError

NAMES = ("analysis-source.mjs", "mapping-working.mjs", "mapping-working-html.mjs",
         "mapping-working-ui.mjs", "mapping-review.mjs", "mapping-review-ui.mjs",
         "mapping-native-check.mjs")


def need(ok, code):
    if not ok:
        raise StateError("EVENT_MAPPING_NATIVE_SOURCE_" + code)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def selection(manager, programme, request):
    value = request.get("mapping_working_source")
    need(isinstance(value, dict) and set(value) == {"id", "bytes", "sha256"},
         "EXACT_SOURCE_DESCRIPTOR_REQUIRED")
    status = manager.mapping_sources.status(value["id"])
    need(all(value[key] == status[key] for key in value) and status["complete"] and
         status["workspace_id"] == manager.workspace.identity and
         status["programme"] == programme and status["input_id"] == request["input_id"],
         "ORIGINAL_SOURCE_CONTEXT_CHANGED")
    return status


def validate_source(manager, programme, request, comparison):
    status = selection(manager, programme, request)
    need("mapping_review" in request, "ORIGINAL_ATTRIBUTED_REVIEW_REQUIRED")
    derived = status.get("derived")
    if derived is None:
        source = Path(__file__).resolve().parents[2] / "event-feed"
        # Only these installed paths are executable. No source body from the
        # received workspace or uploaded working JSON is executed on the server.
        bodies = {name: (source / name).read_bytes() for name in NAMES}
        need(all(0 < len(body) <= 2 * 1024 * 1024 for body in bodies.values()),
             "INSTALLED_SOURCE_ALLOWANCE")
        identities = {name: {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
                      for name, body in bodies.items()}
        need(identities["analysis-source.mjs"]["sha256"] == comparison["receiver"]["core_sha256"],
             "MATCHING_INSTALLED_PARSER_REQUIRED")
        with tempfile.TemporaryDirectory(prefix="event-mapping-native-source-") as temporary:
            root = Path(temporary)
            for name, body in bodies.items():
                (root / name).write_bytes(body)
            original, expected = root / "original.json", root / "selection.json"
            evidence_path, html_path = root / "evidence.json", root / "editor.html"
            manager.mapping_sources.copy_to(status["id"], original)
            expected.write_bytes(encoded({"workspace_id": manager.workspace.identity,
                "programme": programme, "input_id": request["input_id"],
                "mapping": request["mapping"], "mapping_review": request["mapping_review"],
                "comparison": comparison}))
            completed = subprocess.run([manager.workspace.node, str(root / "mapping-native-check.mjs"),
                str(original), str(expected), str(evidence_path), str(html_path)],
                capture_output=True, check=False, timeout=300)
            need(completed.returncode == 0,
                 completed.stderr.decode("utf-8", "replace")[:8000] or "VALIDATION_FAILED")
            need(evidence_path.is_file() and evidence_path.stat().st_size <= 2 * 1024 * 1024,
                 "COMPLETE_EVIDENCE_REQUIRED")
            evidence = json.loads(evidence_path.read_bytes())
            need(all((source / name).read_bytes() == body for name, body in bodies.items()),
                 "INSTALLED_SOURCE_CHANGED")
            _bind(manager, programme, request, comparison, status, evidence)
            manager.mapping_sources.install_derived(status["id"],
                {"evidence": evidence, "renderer_sources": identities}, html_path)
        status = manager.mapping_sources.status(status["id"])
        derived = status["derived"]
    _bind(manager, programme, request, comparison, status, derived["evidence"])
    return {"schema": "stellar-forge.event-mapping-native-source-receipt.v1",
            "source": {key: status[key] for key in ("id", "bytes", "sha256")},
            "evidence": derived["evidence"], "renderer_sources": derived["renderer_sources"],
            "html": derived["html"]}


def _bind(manager, programme, request, comparison, source, evidence):
    need(evidence.get("schema") == "stellar-forge.event-mapping-native-source-validation.v1"
         and evidence.get("working_bytes") == source["bytes"]
         and evidence.get("working_sha256") == source["sha256"]
         and evidence.get("workspace_id") == manager.workspace.identity
         and evidence.get("programme") == programme
         and evidence.get("input_id") == request["input_id"]
         and evidence.get("mapping") == comparison["mapping"]
         and evidence.get("mapping_review") == request["mapping_review"]
         and all(evidence.get(key) == comparison[key] for key in
                 ("comparison_sha256", "programme_revision", "baseline_operation_id")),
         "SAVED_WORKING_SELECTION_CHANGED")
