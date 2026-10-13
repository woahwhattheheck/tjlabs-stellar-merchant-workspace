"""GovHub native adapter ABI for reviewed Drupal content migrations."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from pathlib import Path

import native_adapter as base
from .install import module_inventory
from .receiving import receive

SCHEMA = "govhub.content-consolidation.drupal-plan.v1"
ACTIONS = {
    "drupal-content-import": "import",
    "drupal-content-rollback": "rollback",
    "drupal-content-status": "status",
    "drupal-content-receive": "receive",
}


def _hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verified(descriptor):
    path = Path(descriptor["path"])
    if not path.is_absolute() or path.is_symlink() or not path.is_file():
        raise ValueError("Use the original regular file retained in the private content workspace.")
    expected_size = descriptor.get("bytes", descriptor.get("size"))
    if path.stat().st_size != expected_size or _hash(path) != descriptor["sha256"]:
        raise ValueError("The original retained source bytes changed: " + str(descriptor.get("file_id", path.name)))
    return path


def _read_result(descriptor):
    return json.loads(_verified(descriptor).read_bytes())


def _write_once(path, content):
    data = content if isinstance(content, bytes) else (
        json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n"
    ).encode()
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError("The original retained native request has different bytes: " + path.name)
    else:
        temporary = path.with_name(path.name + ".writing")
        with temporary.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    return base._file(path, "retained_native_input")


def _collect_artifacts(session):
    # The original GovHub file store captures these exact bytes. Large native
    # row and HTTP payloads remain in files, never in the 1 MiB checkpoint.
    known = {item["path"] for item in session.artifacts}
    for path in sorted(session.out.rglob("*")):
        if not path.is_file() or path.is_symlink() or str(path) in known:
            continue
        if path.name.endswith((".writing", ".govhub-writing")) or path.name == "native-state.json":
            continue
        if path.name.startswith("event-") and path.suffix == ".json":
            continue
        if "relocated-originals" in path.parts:
            role = "original_relocation_record"
        elif path.name.endswith(".command.json"):
            role = "native_command"
        elif path.suffix in (".stdout", ".stderr"):
            role = "native_command_output"
        elif path.name == "native-events.ndjson":
            role = "native_row_events"
        elif path.parent.name == "receiving":
            role = "native_http_response" if path.suffix == ".json" else "native_http_body"
        else:
            role = "native_content_artifact"
        session.add(path, role)
        known.add(str(path))


def _source_bindings(plan, source_paths):
    bindings = {}
    for item in source_paths.get("content_files", []):
        if item.get("file_id") in bindings:
            raise ValueError("Each original content file ID has one retained byte binding.")
        path = _verified(item)
        bindings[item["file_id"]] = {**item, "path": str(path.resolve()), "bytes": path.stat().st_size}
    selected = [*plan.get("source_refs", []), *plan.get("files", [])]
    if plan.get("review", {}).get("backup_ref"):
        selected.append(plan["review"]["backup_ref"])
    for item in selected:
        binding = bindings.get(item["file_id"])
        if not binding or any(binding[key] != item[key] for key in ("sha256", "bytes")):
            raise ValueError("An original reviewed source, media file or recovery point is missing: " + item["file_id"])
    return list(bindings.values())


def _ensure_module(profile):
    root, inventory, digest = module_inventory()
    installed = Path(profile["site_root"]) / "modules" / "custom" / "govhub_consolidation"
    missing = []
    for name, item in inventory.items():
        path = installed / name
        if not path.is_file() or _hash(path) != item["sha256"]:
            missing.append(name)
    if missing:
        raise ValueError("Install this exact supplied govhub_consolidation edition into the selected Drupal project with "
                         "python3 -m content_consolidation.drupal.install; missing or different files: " + ", ".join(missing))
    return digest


def _resume_state(session, source_paths, operation, intent):
    path = session.out / "native-state.json"
    supplied = source_paths.get("checkpoint") or operation.get("resume_checkpoint") or {}
    supplied = supplied.get("resume_checkpoint", supplied.get("state", supplied))
    state = session.read_private_json(path) if path.exists() else session.resolve_private(supplied)
    if state and state.get("intent_sha256") != base._digest(intent):
        raise ValueError("The original native operation selects another target, source edition, or rollback selection.")
    session.state = dict(state or {
        "intent_sha256": base._digest(intent), "intent": intent, "phase": "prepared",
        "mutation_started": False, "attempt": 0, "receiving_attempt": 0, "output_dir": str(session.out)
    })
    session.save_state()


def _command_reconciliation(session):
    pending = session.state.get("pending_command")
    if not pending:
        return False
    record_path = session.out / (pending + ".command.json")
    if not record_path.is_file():
        raise base.NativeWaiting("The original native command was dispatched without its retained command record; recover that same record before continuation.")
    record = session.read_private_json(record_path)
    if record.get("phase") == "not_started":
        session.state.update(pending_command=None, phase="native_prepared")
        session.save_state()
        return False
    if record.get("phase") == "complete" or record.get("phase") == "interrupted" and record.get("owned_process_reaped") is True:
        session.state["reconciled_command"] = {"path": str(record_path), "sha256": _hash(record_path),
                                                "phase": record["phase"], "owned_process_reaped": True}
        session.state.update(pending_command=None, phase="native_reconciled")
        session.save_state()
        return True
    raise base.NativeWaiting("This original mutating command has no retained completion or owned-process reaping; reconcile its same process and output before continuing.")


def _recover_native_result(session, operation, plan_ref, action):
    """Adopt the original finished output after a lost parent checkpoint."""
    selected = session.state.get("current_result_path")
    request_ref = session.state.get("current_request")
    if not selected or not request_ref:
        return None
    path = Path(selected)
    if path.parent != session.out or not path.name.endswith(".result.json"):
        raise ValueError("The retained result must belong to this original private operation.")
    if not path.is_file():
        return None
    request = _read_result(request_ref)
    operation_id = operation.get("id") or operation.get("operation_id")
    if (request.get("operation_id") != operation_id or request.get("plan_sha256") != plan_ref["sha256"]
            or request.get("action") != action or Path(request.get("result_path", "")) != path
            or request.get("selection", []) != operation.get("content_selection", [])):
        raise ValueError("The retained native request differs from this operation and source.")
    label = path.name.removesuffix(".result.json")
    record_path = session.out / (label + ".command.json")
    if not record_path.is_file():
        raise base.NativeWaiting("Recover the original command record before adopting its native output.")
    record = session.read_private_json(record_path)
    complete = record.get("phase") == "complete" and record.get("returncode") == 0
    reaped = record.get("phase") == "interrupted" and record.get("owned_process_reaped") is True
    if not (complete or reaped):
        raise base.NativeWaiting("Reconcile the original native process before adopting its retained output.")
    for role in ("stdout", "stderr"):
        if record.get(role):
            _verified(record[role])
    descriptor = base._file(path, "native_content_result")
    result = _read_result(descriptor)
    if (result.get("schema") != "govhub.content-consolidation.drupal-result.v1"
            or result.get("operation_id") != operation_id or result.get("plan_sha256") != plan_ref["sha256"]
            or result.get("action") != action):
        raise ValueError("The original native result differs from its retained operation and source.")
    session.state.update(native_result_ref=descriptor, phase="native_complete",
                         pending_command=None, completed_commands={})
    session.save_state()
    return result


def _native_attempt(session, operation, plan_ref, files, action, *, reconciled=False):
    attempt = int(session.state.get("attempt", 0)) + 1
    label = f"content-native-{attempt:04d}"
    result_path = session.out / f"{label}.result.json"
    request_path = session.out / f"{label}.request.json"
    operation_id = operation.get("id") or operation.get("operation_id")
    if not isinstance(operation_id, str) or not operation_id:
        raise ValueError("Retain the original GovHub operation ID.")
    payload = {
        "schema": "govhub.content-consolidation.native-request.v1", "operation_id": operation_id,
        "action": action, "plan_path": plan_ref["path"], "plan_sha256": plan_ref["sha256"],
        "files": files, "selection": operation.get("content_selection", []),
        "output_dir": str(session.out), "result_path": str(result_path),
        "resume_reconciled": bool(reconciled),
        "row_limit": int(operation.get("content_row_limit", 0)),
        "time_budget_seconds": max(1, session.p["timeout_seconds"] - 10),
    }
    if payload["row_limit"] < 0:
        raise ValueError("The native row limit cannot be negative.")
    request_ref = _write_once(request_path, payload)
    script = Path(__file__).resolve().parent / "run.php"
    script_copy = session.out / "content-run.php"
    _write_once(script_copy, script.read_bytes())
    argv = base._prefix(session.p) + ["php:script", "content-run",
            "--script-path=" + str(session.out), "--", str(request_path)]
    session.state.update(attempt=attempt, current_request=request_ref, current_result_path=str(result_path),
                         phase="native_prepared", native_action=action)
    session.save_state()
    record = session.command(label, argv, mutating=action in {"import", "rollback"})
    result_ref = base._file(result_path, "native_content_result")
    result = _read_result(result_ref)
    if (result.get("schema") != "govhub.content-consolidation.drupal-result.v1"
            or result.get("operation_id") != operation_id or result.get("plan_sha256") != plan_ref["sha256"]):
        raise ValueError("The original native result differs from its retained operation and source.")
    session.state.update(native_result_ref=result_ref, phase="native_complete",
                         pending_command=None, completed_commands={})
    session.save_state()
    return result


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    """Run through the original GovHub private native worker and result envelope."""
    profile = base._profile(config)
    if profile["source_kind"] != "drush":
        raise ValueError("Content Migrate execution uses the existing equipped Drupal / Drush profile.")
    session = base.Session(profile, source_paths["output_dir"], checkpoint, cancelled, source_paths.get("workspace_relocations"))
    source_paths = session.resolve_private(source_paths)
    observations = {}
    try:
        native_action = operation.get("native_action", operation.get("action"))
        action = ACTIONS.get(native_action)
        if action is None:
            raise ValueError("Select one of the original Drupal content native actions.")
        environment = operation.get("provider_environment_id", operation.get("environment_id"))
        if environment != profile["environment_id"]:
            raise ValueError("The operation must select this exact configured Drupal environment.")
        plan = source_paths.get("content_plan")
        if not isinstance(plan, dict) or plan.get("schema") != SCHEMA:
            raise ValueError("Use the original frozen Drupal content plan v1.")
        files = _source_bindings(plan, source_paths)
        plan_ref = _write_once(session.out / "content-plan.json", plan)
        selection = operation.get("content_selection", [])
        if action == "rollback" and not selection:
            raise ValueError("Select the exact original migration/source-ID rows to roll back.")
        intent = {"action": native_action, "target": base._context(profile), "plan_sha256": plan_ref["sha256"],
                  "selection": selection, "operation_id": operation.get("id") or operation.get("operation_id")}
        _resume_state(session, source_paths, operation, intent)
        if session.state.get("phase") == "completed" and session.state.get("observations_ref"):
            observations = _read_result(session.state["observations_ref"])
            _collect_artifacts(session)
            return session.result("COMPLETE", observations)
        module_sha = _ensure_module(profile)
        native_status, commands, native_fingerprint = base._drush_info(session, fresh=True)
        if "php:script" not in commands:
            raise ValueError("The selected installed Drush does not expose php:script.")
        expected_fingerprint = operation.get("target_fingerprint") or config.get("target_fingerprint")
        if expected_fingerprint:
            actual = base._drush_fingerprint(profile, native_status, commands)
            if actual != expected_fingerprint:
                raise ValueError("The selected native target differs from the original configured fingerprint.")
        reconciled = _command_reconciliation(session)
        result = None
        ref = session.state.get("native_result_ref")
        candidate = _read_result(ref) if ref else _recover_native_result(session, operation, plan_ref, action)
        if candidate:
            if candidate.get("status") == "complete":
                result = candidate
            elif candidate.get("status") in {"failed", "incomplete"}:
                reconciled = True
        if result is None:
            result = _native_attempt(session, operation, plan_ref, files, action, reconciled=reconciled)
        observations = {**result, "native_action": native_action, "target": base._context(profile),
                        "native_status": native_status, "module_source_sha256": module_sha,
                        "plan_file": plan_ref, "native_result_file": session.state.get("native_result_ref")}
        if result.get("status") == "incomplete":
            path = session.out / f"observations-{session.state['attempt']:04d}.json"
            base._atomic(path, observations)
            session.state.update(phase="native_paused", observations_ref=base._file(path, "content_observations"))
            session.save_state()
            _collect_artifacts(session)
            return session.result("WAITING_NATIVE", observations, "The core Migrate engine paused with its original ID maps; resume this same operation.")
        if result.get("status") != "complete":
            session.state.update(phase="native_failed")
            session.save_state()
            _collect_artifacts(session)
            return session.result("FAILED", observations, (result.get("error") or {}).get("message", "The original migration has failed, ignored or unmapped selected rows; its native maps and messages are retained."))
        if action != "status":
            pass_number = int(session.state.get("receiving_attempt", 0)) + 1
            session.state.update(receiving_attempt=pass_number, phase="receiving")
            session.save_state()
            receiving = receive(session, config, result, plan, pass_number)
            observations["receiving"] = receiving
        else:
            receiving = {"status": "COMPLETE"}
        final_path = session.out / f"content-observations-{int(session.state['receiving_attempt']):04d}.json"
        base._atomic(final_path, observations)
        status = "COMPLETE" if receiving["status"] == "COMPLETE" else "FAILED"
        session.state.update(phase="completed" if status == "COMPLETE" else "receiving_failed",
                             observations_ref=base._file(final_path, "content_observations"), completed_commands={})
        session.save_state()
        _collect_artifacts(session)
        return session.result(status, observations, None if status == "COMPLETE" else "The native import is retained; resolve the recorded target receiving response and resume this operation.")
    except base.NativeCancelled as exc:
        _collect_artifacts(session)
        return session.result("WAITING_NATIVE" if session.state.get("mutation_started") else "CANCELLED", observations, str(exc))
    except base.NativeWaiting as exc:
        _collect_artifacts(session)
        return session.result("WAITING_NATIVE", observations, str(exc))
    except Exception as exc:
        _collect_artifacts(session)
        status = "WAITING_NATIVE" if session.state.get("phase") == "native_interrupted" else "FAILED"
        return session.result(status, observations, str(exc))
