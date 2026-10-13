"""Static output editions and releases in the original GovHub journal.

The native Tome owner supplies the completed capture. This module retains and
compares that capture; only the original worker changes a configured release.
"""
from __future__ import annotations
from pathlib import Path
import hashlib
import json
import os
import tempfile

from .model import canonical, sha, file_rows, validate_report, compare_rows, page, MAX_MANIFEST_BYTES

MAX_STORED_MANIFEST = 128 * 1024 * 1024
MUTATIONS = {"editions.receive", "targets.save", "plans.create", "reviews.save",
             "operations.create", "exports.create"}
STATIC_TYPES = {"STATIC_STAGE", "STATIC_PUBLISH", "STATIC_ROLLBACK"}


def problem(code, message, status=422):
    from govhub import GovHubError
    raise GovHubError(code, message, status)


def clean(value, limit=16000, required=False):
    from govhub import text
    return text(value, limit, required)


def _store_json(ws, db, value, name, actor, *, kind, owner):
    raw = canonical(value)
    if len(raw) > MAX_STORED_MANIFEST:
        problem("STATIC_MANIFEST_SIZE", "The complete retained manifest exceeds 128 MiB.", 413)
    ws.blobs.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, filename = tempfile.mkstemp(prefix=".static-", dir=ws.blobs)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(raw)
            out.flush()
            os.fsync(out.fileno())
        return ws._register(db, filename, name, actor, category="Generated",
                            label="Static release " + kind, owner_kind=kind,
                            owner_id=owner, output_name=name, expected_sha=sha(raw))
    finally:
        Path(filename).unlink(missing_ok=True)


def _json_file(ws, db, file_id, limit=MAX_STORED_MANIFEST):
    from govhub import json_bytes
    item = ws._file_row(db, file_id)
    if item["bytes"] > limit:
        problem("STATIC_MANIFEST_SIZE", "The retained manifest exceeds its supported size.", 413)
    return json_bytes(ws._verify_file(item).read_bytes()), item


def edition(ws, db, edition_id):
    return ws._get(db, "static_edition", edition_id)


def manifest(ws, db, value):
    data, item = _json_file(ws, db, value["manifest_file_id"])
    if item["sha256"] != value["manifest_sha256"] or data.get("edition_id") != value["id"]:
        problem("STATIC_EDITION_IDENTITY", "The edition's complete manifest changed.", 409)
    rows = file_rows(data.get("files"))
    if sha(canonical(rows)) != value["files_sha256"]:
        problem("STATIC_EDITION_IDENTITY", "The edition's path and byte identities changed.", 409)
    by_path = {r["path"]: r for r in data["files"]}
    return [dict(row, file_id=by_path[row["path"]]["file_id"]) for row in rows]


def target(ws, db, target_id, revision=None):
    head = ws._setting(db, "static.target:" + clean(target_id, 240, True))
    if not head:
        problem("STATIC_TARGET_NOT_FOUND", "Choose an existing static release target.", 404)
    value = ws._get(db, "static_target", revision or head)
    if value["target_id"] != target_id:
        problem("STATIC_TARGET_IDENTITY", "This target revision belongs to a different target.", 409)
    return value


def current_release(ws, db, target_id):
    ref = ws._setting(db, "static.current:" + target_id)
    return ws._get(db, "static_release", ref) if ref else None


def _expected_target(value, payload):
    if payload.get("expected_revision") != value["revision"]:
        problem("STATIC_TARGET_CHANGED", "The target configuration changed. Reopen its current version.", 409)


def _namespace(ws, db):
    from govhub import ident
    value = ws._setting(db, "static.namespace")
    if not value:
        value = ident("workspace-")
        ws._set(db, "static.namespace", value)
    return value


def _environment(ws, db, value):
    environment = ws._record_db(db, "environments", value["environment_id"])
    if environment["archived"] or not environment["data"]["authorization_reference"]:
        problem("STATIC_TARGET_AUTHORITY", "Select an active environment with its original operating authorization.", 409)
    if environment["data"]["provider_resource_id"] != value["provider_resource_id"]:
        problem("STATIC_ENVIRONMENT_CHANGED", "The release target's native environment identity changed.", 409)
    return environment


def _receive(ws, db, payload, actor):
    from govhub import ident
    value = ws._operation(db, payload.get("operation_id"))
    ws._expected(value, payload)
    if value["state"] != "COMPLETE" or (value.get("native_result") or {}).get("status") != "COMPLETE":
        problem("STATIC_BUILD_INCOMPLETE", "Complete the original native build before retaining its output edition.", 409)
    if value.get("profile", {}).get("config", {}).get("source_kind") != "tome":
        problem("STATIC_BUILD_SOURCE", "Choose the original Tome native capture.", 409)
    native = value["native_result"].get("artifacts", [])
    if not isinstance(native, list):
        problem("STATIC_BUILD_ARTIFACTS", "The native result has no complete artifact inventory.", 409)
    reports = [r for r in native if r.get("role") == "static_build_report"]
    if len(reports) != 1:
        problem("STATIC_BUILD_REPORT", "The completed native result must identify exactly one build report.", 409)
    retained = value.get("retained_artifacts", [])

    def binding(item):
        matches = [r for r in retained if r.get("role") == item.get("role")
                   and r.get("file", {}).get("sha256") == item.get("sha256")
                   and r.get("file", {}).get("bytes") == item.get("size", item.get("bytes"))
                   and r.get("native", {}).get("relative_path") == item.get("relative_path")]
        if not matches:
            problem("STATIC_ARTIFACT_MISSING", "A completed native artifact is missing from the original retained capture.", 409)
        row = ws._file_row(db, matches[-1]["file"]["id"])
        ws._verify_file(row)
        return row

    report_file = binding(reports[0])
    report, _ = _json_file(ws, db, report_file["id"], MAX_MANIFEST_BYTES)
    normalized = validate_report(report)
    assets = [r for r in native if r.get("role") == "static_asset"]
    by_path = {}
    for item in assets:
        path = item.get("relative_path")
        if not isinstance(path, str) or path in by_path:
            problem("STATIC_ARTIFACT_SET", "The completed output has repeated or missing relative paths.", 409)
        by_path[path] = item
    if set(by_path) != {r["path"] for r in normalized["files"]}:
        problem("STATIC_ARTIFACT_SET", "The build report and retained output must contain the same complete path set.", 409)
    existing = [e for e in ws._objects(db, "static_edition", value["id"])
                if e["report_sha256"] == report_file["sha256"]]
    if existing:
        return {"edition": existing[0], "reused": True}
    rows = []
    for row in normalized["files"]:
        item = binding(by_path[row["path"]])
        if (item["sha256"], item["bytes"]) != (row["sha256"], row["bytes"]):
            problem("STATIC_ARTIFACT_IDENTITY", "A generated file differs from the complete build report: " + row["path"], 409)
        rows.append(dict(row, file_id=item["id"]))
    identifier = ident("static-edition-")
    stored = _store_json(ws, db, {"schema": "govhub.static-edition-files.v1", "edition_id": identifier,
                        "operation_id": value["id"], "operation_revision": value["revision"],
                        "report_file_id": report_file["id"], "files": rows},
                        "output-manifest.json", actor, kind="static_edition", owner=identifier)
    sources = []
    for item in native:
        if item.get("role") != "static_asset":
            kept = binding(item)
            sources.append({"role": item.get("role"), "file_id": kept["id"],
                            "filename": kept["filename"], "bytes": kept["bytes"], "sha256": kept["sha256"]})
    if value.get("native_capture_file_id"):
        kept = ws._file_row(db, value["native_capture_file_id"])
        ws._verify_file(kept)
        sources.append({"role": "native_capture", "file_id": kept["id"], "filename": kept["filename"],
                        "bytes": kept["bytes"], "sha256": kept["sha256"]})
    result = ws._object(db, "static_edition", {
        "id": identifier, "schema": "govhub.static-edition.v1",
        "label": clean(payload.get("label", "Tome output"), 500, True),
        "environment_id": value["environment_id"], "operation_id": value["id"],
        "operation_revision": value["revision"], "native_capture_file_id": value.get("native_capture_file_id"),
        "report_file_id": report_file["id"], "report_sha256": report_file["sha256"],
        "manifest_file_id": stored["id"], "manifest_sha256": stored["sha256"],
        "files_sha256": normalized["files_sha256"], "file_count": len(rows),
        "total_bytes": sum(r["bytes"] for r in rows), "production_uri": normalized["production_uri"],
        "generator": normalized["generator"], "inputs": normalized["inputs"],
        "sources": sources, "completed_at": value.get("actual_finished_at"),
        "profile_revision": value["profile"]["revision"],
    }, parent=value["id"], actor=actor["name"])
    return {"edition": result, "reused": False}


def _save_target(ws, db, payload, actor):
    from govhub import ident
    from .native import inspect_target, verify_tree, target_lock
    ws._authorize(actor, "admin")
    old = target(ws, db, payload["target_id"]) if payload.get("target_id") else None
    if old:
        _expected_target(old, payload)
        fixed = ("environment_id", "release_root", "current_name")
        if any(payload.get(k, old[k]) != old[k] for k in fixed):
            problem("STATIC_TARGET_BINDING", "The saved target keeps its original environment and filesystem path. Configure a separate target for a different location.", 409)
        environment = _environment(ws, db, old)
        identity = {k: old[k] for k in ("target_id", "environment_id", "provider_resource_id",
                    "release_root", "root_device", "root_inode", "current_name", "namespace")}
        observed = inspect_target(old)
    else:
        environment = ws._record_db(db, "environments", payload.get("environment_id"))
        if environment["archived"] or not environment["data"]["authorization_reference"] or not environment["data"]["provider_resource_id"]:
            problem("STATIC_TARGET_AUTHORITY", "Choose an active original environment with its native identity and operating authorization.")
        root = Path(clean(payload.get("release_root", ""), 4000, True))
        if not root.is_absolute() or root.is_symlink() or not root.is_dir():
            problem("STATIC_TARGET_DIRECTORY", "Select an existing absolute local release directory.")
        root = root.resolve(strict=True)
        if root == ws.root or root.is_relative_to(ws.root) or ws.root.is_relative_to(root):
            problem("STATIC_TARGET_DIRECTORY", "Keep the selected release directory outside the private workspace and its ancestors.")
        info = root.stat()
        name = clean(payload.get("current_name", "current"), 200, True)
        if Path(name).name != name or name in (".", "..", ".govhub-static", ".govhub-static.lock") or "\\" in name:
            problem("STATIC_CURRENT_NAME", "Use one ordinary filename for the current release symlink.")
        target_id = ident("static-target-")
        identity = {"target_id": target_id, "environment_id": environment["id"],
                    "provider_resource_id": environment["data"]["provider_resource_id"],
                    "release_root": str(root), "root_device": info.st_dev, "root_inode": info.st_ino,
                    "current_name": name, "namespace": _namespace(ws, db) + "-" + target_id}
        for entry in ws._objects(db, "static_target"):
            if (entry["root_device"], entry["root_inode"], entry["current_name"]) == (info.st_dev, info.st_ino, name):
                problem("STATIC_TARGET_EXISTS", "This current pointer already belongs to retained target " + entry["target_id"] + ".", 409)
        observed = inspect_target(identity)
    value = dict(identity, label=clean(payload.get("label", old["label"] if old else ""), 500, True),
                 notes=clean(payload.get("notes", old.get("notes", "") if old else ""), 16000),
                 revision=ident("target-revision-"), environment_revision=environment["revision"])
    saved = ws._object(db, "static_target", value, parent=identity["target_id"], actor=actor["name"])
    if not old and observed["pointer"] is not None:
        baseline = edition(ws, db, payload.get("baseline_edition_id"))
        if baseline["environment_id"] != environment["id"]:
            problem("STATIC_BASELINE_ENVIRONMENT", "The existing pointer baseline must come from this original build environment.", 409)
        with target_lock(saved):
            current = inspect_target(saved)
            if current != observed:
                problem("STATIC_POINTER_CHANGED", "The selected current pointer changed during configuration.", 409)
            verify_tree(Path(current["resolved_path"]), manifest(ws, db, baseline))
        adopted = ws._object(db, "static_release", {
            "target_id": saved["target_id"], "target_revision": saved["id"],
            "kind": "ADOPTED", "edition_id": baseline["id"], "edition_sha256": baseline["sha256"],
            "pointer": observed["pointer"], "previous_release_id": None, "operation_id": None,
            "reason": "Existing pointer matched the complete original retained build edition",
            "target": saved, "plan_id": None, "review_id": None,
        }, parent=saved["target_id"], actor=actor["name"])
        ws._set(db, "static.current:" + saved["target_id"], adopted["id"])
    elif not old and payload.get("baseline_edition_id"):
        problem("STATIC_BASELINE_POINTER", "An absent current pointer has no existing output to adopt.")
    ws._set(db, "static.target:" + saved["target_id"], saved["id"])
    return {"target": saved, "observed": observed, "current_release": current_release(ws, db, saved["target_id"])}


def _create_plan(ws, db, payload, actor):
    from govhub import ident
    value = target(ws, db, payload.get("target_id"))
    _expected_target(value, payload)
    _environment(ws, db, value)
    before = current_release(ws, db, value["target_id"])
    if payload.get("expected_current_release_id") != (before["id"] if before else None):
        problem("STATIC_RELEASE_CHANGED", "The current retained release changed. Reopen the target before comparing.", 409)
    candidate = edition(ws, db, payload.get("candidate_id"))
    if candidate["environment_id"] != value["environment_id"]:
        problem("STATIC_EDITION_ENVIRONMENT", "Choose a complete edition from this target's original build environment.")
    baseline = edition(ws, db, before["edition_id"]) if before else None
    comparison = compare_rows(manifest(ws, db, baseline) if baseline else [], manifest(ws, db, candidate))
    identifier = ident("static-plan-")
    source = _store_json(ws, db, comparison, "comparison.json", actor, kind="static_plan", owner=identifier)
    saved = ws._object(db, "static_plan", {
        "id": identifier, "label": clean(payload.get("label", ""), 500, True),
        "notes": clean(payload.get("notes", ""), 16000), "target_id": value["target_id"],
        "target_revision": value["id"], "target_sha256": value["sha256"],
        "candidate_id": candidate["id"], "candidate_sha256": candidate["sha256"],
        "baseline_id": baseline["id"] if baseline else None,
        "baseline_sha256": baseline["sha256"] if baseline else None,
        "previous_release_id": before["id"] if before else None,
        "previous_release_sha256": before["sha256"] if before else None,
        "comparison_file_id": source["id"], "comparison_sha256": source["sha256"],
        "counts": comparison["counts"],
    }, parent=value["target_id"], actor=actor["name"])
    return {"plan": saved}


def _latest_review(ws, db, plan_id):
    rows = ws._objects(db, "static_review", plan_id)
    return rows[-1] if rows else None


def _review(ws, db, payload, actor):
    ws._authorize(actor, "reviewer")
    plan = ws._get(db, "static_plan", payload.get("plan_id"))
    if payload.get("comparison_sha256") != plan["comparison_sha256"]:
        problem("STATIC_COMPARISON_CHANGED", "Review the exact retained comparison for this plan.", 409)
    decision = payload.get("decision")
    if decision not in ("APPROVE", "RETURN"):
        problem("STATIC_REVIEW_DECISION", "Choose Approve or Return.")
    saved = ws._object(db, "static_review", {
        "plan_id": plan["id"], "plan_sha256": plan["sha256"],
        "comparison_sha256": plan["comparison_sha256"], "decision": decision,
        "reason": clean(payload.get("reason", ""), 12000, True),
    }, parent=plan["id"], actor=actor["name"])
    return {"review": saved, "plan": plan}


def _queue(ws, db, payload, actor):
    from govhub import ident, now
    kind = payload.get("type")
    if kind not in STATIC_TYPES:
        problem("STATIC_OPERATION_TYPE", "Choose Stage, Publish, or Roll back the retained predecessor.")
    selected_target = target(ws, db, payload.get("target_id"))
    _expected_target(selected_target, payload)
    environment = _environment(ws, db, selected_target)
    previous = current_release(ws, db, selected_target["target_id"])
    if payload.get("expected_current_release_id") != (previous["id"] if previous else None):
        problem("STATIC_RELEASE_CHANGED", "The current release changed. Reopen the selected target.", 409)
    plan = review = baseline = None
    if kind == "STATIC_ROLLBACK":
        if not previous or not previous.get("previous_release_id"):
            problem("STATIC_PREDECESSOR", "The selected current release has no retained predecessor.", 409)
        baseline = ws._get(db, "static_release", previous["previous_release_id"])
        selected_edition = edition(ws, db, baseline["edition_id"])
    else:
        plan = ws._get(db, "static_plan", payload.get("plan_id"))
        if (plan["target_id"], plan["target_revision"], plan["previous_release_id"]) != (selected_target["target_id"], selected_target["id"], previous["id"] if previous else None):
            problem("STATIC_PLAN_CHANGED", "Create a comparison against the current target and release before staging or publishing.", 409)
        selected_edition = edition(ws, db, plan["candidate_id"])
        review = _latest_review(ws, db, plan["id"])
        if kind == "STATIC_PUBLISH":
            if not review or review["decision"] != "APPROVE":
                problem("STATIC_REVIEW_REQUIRED", "Review this complete path comparison before publication.", 409)
            stages = ws._objects(db, "static_stage", plan["id"])
            if not stages:
                problem("STATIC_STAGE_REQUIRED", "Stage this complete edition on the configured target first.", 409)
    for row in db.execute("SELECT data FROM govhub_operations WHERE state NOT IN ('COMPLETE','FAILED','CANCELLED')"):
        operation = json.loads(row[0])
        if operation.get("static_target_id") == selected_target["target_id"]:
            problem("STATIC_TARGET_BUSY", "Finish or cancel the original active static operation for this target.", 409)
    timestamp = now()
    operation = {
        "id": ident("operation-"), "type": kind, "state": "QUEUED",
        "plan_id": "", "plan_revision": "", "plan": None, "audit_id": None,
        "review_id": review["id"] if review else None,
        "environment_id": environment["id"], "environment": environment,
        "profile": {"revision": selected_target["revision"], "config": {
            "source_kind": "static-release", "environment_id": environment["data"]["provider_resource_id"]}},
        "source_snapshot_id": "", "source_snapshot": None, "source_snapshot_sha256": "",
        "authorization_reference": environment["data"]["authorization_reference"],
        "created_at": timestamp, "updated_at": timestamp, "author": actor["name"],
        "queued_actor": actor, "progress": {"completed": 0, "total": selected_edition["file_count"],
            "stage": "QUEUED", "detail": "Queued on the original GovHub release worker"},
        "error": None, "cancel_requested": False, "native_attempted": False,
        "checkpoint": None, "resume_checkpoint": None, "native_capture_file_id": None,
        "native_result": None, "result_snapshot_id": None, "actual_started_at": None,
        "actual_finished_at": None, "native_action": kind.lower().replace("_", "-"),
        "provider_environment_id": environment["data"]["provider_resource_id"], "agency_ids": [],
        "target_fingerprint": sha(canonical(selected_target)),
        "static_target_id": selected_target["target_id"], "static_target": selected_target,
        "static_plan": plan, "static_review": review, "static_edition": selected_edition,
        "static_previous": previous, "static_rollback_to": baseline,
        "reason": clean(payload.get("reason", ""), 12000, True),
    }
    saved = ws._write_operation(db, operation, actor, "Static release operation queued",
                                {"type": kind, "edition_id": selected_edition["id"], "target_id": selected_target["target_id"]})
    return {"operation": saved}


def _get_plan(ws, db, payload):
    plan = ws._get(db, "static_plan", payload.get("plan_id"))
    comparison, item = _json_file(ws, db, plan["comparison_file_id"])
    if item["sha256"] != plan["comparison_sha256"]:
        problem("STATIC_COMPARISON_IDENTITY", "The retained comparison source changed.", 409)
    values = page(comparison["rows"], payload)
    value = target(ws, db, plan["target_id"])
    current = current_release(ws, db, plan["target_id"])
    return {"plan": plan, "comparison": dict(values, counts=comparison["counts"]),
            "reviews": ws._objects(db, "static_review", plan["id"]),
            "stages": ws._objects(db, "static_stage", plan["id"]),
            "target": value, "current_release": current,
            "current": plan["target_revision"] == value["id"] and plan["previous_release_id"] == (current["id"] if current else None)}


def summaries(ws, db):
    targets = []
    for row in db.execute("SELECT value FROM govhub_settings WHERE key LIKE 'static.target:%' ORDER BY key"):
        value = ws._get(db, "static_target", json.loads(row[0]))
        targets.append(dict(value, current_release=current_release(ws, db, value["target_id"])))
    builds = []
    for row in db.execute("SELECT data FROM govhub_operations ORDER BY rowid DESC"):
        operation = json.loads(row[0])
        if operation.get("profile", {}).get("config", {}).get("source_kind") == "tome":
            builds.append(ws._operation_summary(operation))
    return {
        "targets": targets, "builds": builds,
        "editions": list(reversed(ws._objects(db, "static_edition"))),
        "plans": [dict(p, latest_review=_latest_review(ws, db, p["id"]))
                  for p in reversed(ws._objects(db, "static_plan"))],
        "releases": list(reversed(ws._objects(db, "static_release"))),
        "exports": list(reversed(ws._objects(db, "static_export"))),
    }


def dispatch(ws, action, payload, actor):
    from govhub import packed
    name = action.removeprefix("static.")
    if name == "targets.inspect":
        from .native import inspect_target
        with ws.connect(snapshot=True) as db:
            selected = target(ws, db, payload.get("target_id"))
            return {"target": selected, "current_release": current_release(ws, db, selected["target_id"]),
                    "observed": inspect_target(selected)}
    if name not in MUTATIONS:
        with ws.connect(snapshot=True) as db:
            if name == "list":
                return summaries(ws, db)
            if name == "editions.get":
                value = edition(ws, db, payload.get("edition_id"))
                return {"edition": value, "files": page(manifest(ws, db, value), payload)}
            if name == "plans.get":
                return _get_plan(ws, db, payload)
            if name == "targets.get":
                value = target(ws, db, payload.get("target_id"), payload.get("revision"))
                return {"target": value, "current_release": current_release(ws, db, value["target_id"]),
                        "history": ws._objects(db, "static_target", value["target_id"]),
                        "releases": ws._objects(db, "static_release", value["target_id"])}
            if name == "exports.get":
                return {"export": ws._get(db, "static_export", payload.get("export_id"))}
            if name == "requests.get":
                key = clean(payload.get("request_key", ""), 240, True)
                row = db.execute("SELECT result,author FROM govhub_requests WHERE request_key=?", (key,)).fetchone()
                if not row or row["author"] != actor["name"]:
                    problem("REQUEST_NOT_FOUND", "No completed original request exists for this account.", 404)
                return {"request_key": key, "result": json.loads(row["result"])}
            problem("STATIC_ACTION_NOT_FOUND", "This static release action does not exist.", 404)
    if name == "exports.create":
        from .exporting import create_export
        return create_export(ws, payload, actor)
    with ws.connect(write=True) as db:
        bound = dict(payload, static_action=name)
        key, fingerprint, prior = ws._request(db, bound, actor)
        if prior is not None:
            return dict(prior, replayed=True)
        handlers = {"editions.receive": _receive, "targets.save": _save_target,
                    "plans.create": _create_plan, "reviews.save": _review, "operations.create": _queue}
        result = handlers[name](ws, db, payload, actor)
        ws._remember(db, key, fingerprint, result, actor)
        ws._changed(db, actor, "Static release " + name, details={"request_key": key})
    if name == "operations.create":
        ws._worker_wake.set()
    return result
