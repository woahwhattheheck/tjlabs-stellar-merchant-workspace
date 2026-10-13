"""Content Packages on GovHub's existing native command and operation journal."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import native_adapter as base
from content_consolidation.drupal.adapter import _verified, _write_once
from govhub import packed
from .model import NATIVE_REQUEST, NATIVE_RESULT, TYPES, original_result


def _collect(session):
    """Retain complete source/result files through the existing GovHub store."""
    known = {item["path"] for item in session.artifacts}
    for path in sorted(session.out.rglob("*")):
        if not path.is_file() or path.is_symlink() or str(path) in known:
            continue
        if ".writing" in path.name or ".govhub-writing" in path.name or path.name == "native-state.json":
            continue
        if path.name.startswith("event-") and path.suffix == ".json":
            continue
        if "relocated-originals" in path.parts:
            role = "original_relocation_record"
        elif path.name.endswith(".command.json"):
            role = "native_command"
        elif path.suffix in {".stdout", ".stderr"}:
            role = "native_command_output"
        elif path.name.endswith(".result.json"):
            role = "package_result"
        elif path.name == "package-graph.zip":
            role = "package_archive"
        elif path.parent.name == "assets":
            role = "package_asset"
        elif path.name.endswith(".module-source.json"):
            role = "package_module_source"
        else:
            role = "package_native_artifact"
        session.add(path, role)
        known.add(str(path))


def _state(session, operation, source_paths):
    path = session.out / "native-state.json"
    saved = source_paths.get("checkpoint") or operation.get("resume_checkpoint") or {}
    saved = saved.get("resume_checkpoint", saved.get("state", saved))
    state = session.read_private_json(path) if path.is_file() else session.resolve_private(saved)
    if state and state.get("intent_sha256") != operation["package_intent_sha256"]:
        raise ValueError("The native journal belongs to a different original content operation.")
    session.state = dict(state or {
        "intent_sha256": operation["package_intent_sha256"],
        "operation_id": operation["id"],
        "phase": "prepared", "attempt": 0, "mutation_started": False,
        "output_dir": str(session.out),
    })
    session.save_state()


def _sources(operation, source_paths):
    files = {}
    for item in source_paths.get("package_files", []):
        role = item.get("role")
        if role not in {"archive", "reviewed_preview"} or role in files:
            raise ValueError("Each original content archive and reviewed preview has one retained binding.")
        path = _verified(item)
        files[role] = {**item, "path": str(path), "bytes": path.stat().st_size}
    request = operation["package_request"]
    if "archive_sha256" in request:
        archive = files.get("archive")
        if not archive or archive["sha256"] != request["archive_sha256"] or archive["bytes"] != request["archive_bytes"]:
            raise ValueError("This operation requires the exact original archive edition.")
    if operation["type"] == "PACKAGE_IMPORT":
        reviewed = files.get("reviewed_preview")
        if not reviewed or reviewed["sha256"] != request["preview_sha256"]:
            raise ValueError("This import requires the exact original reviewed preview bytes.")
    return files


def _settle_original(session):
    """An admitted original child must be complete or positively reaped."""
    label = session.state.get("current_label")
    if not label:
        return None
    record_path = session.out / (label + ".command.json")
    if not record_path.is_file():
        # current_label is saved before Session prepares the command. A pending
        # mutation without that record remains an unknown dispatched operation.
        if session.state.get("pending_command") == label:
            raise base.NativeWaiting("Restore the original dispatched command record before resuming this import.")
        return None
    record = session.read_private_json(record_path)
    if record.get("phase") == "not_started":
        return record
    if record.get("phase") == "complete" or (
        record.get("phase") == "interrupted" and record.get("owned_process_reaped") is True
    ):
        for role in ("stdout", "stderr"):
            if record.get(role):
                _verified(record[role])
        session.state.update(pending_command=None, phase="native_reconciled")
        session.save_state()
        return record
    raise base.NativeWaiting("The original content command is still running or lacks its own completed/reaped process record.")


def _saved_result(session, operation, record):
    ref = session.state.get("result_ref")
    selected = ref.get("path") if ref else session.state.get("current_result_path")
    if not selected:
        return None
    path = Path(session.private_path(selected))
    if path.parent != session.out or not path.name.endswith(".result.json"):
        raise ValueError("The saved native result must remain in its original private operation.")
    if not path.is_file():
        return None
    if record is not None and record.get("phase") == "not_started":
        raise ValueError("An unstarted native command cannot supply a completed result.")
    if ref:
        raw = _verified(ref).read_bytes()
    else:
        if not record:
            raise base.NativeWaiting("Recover the original command completion before adopting its retained content result.")
        raw = path.read_bytes()
    value = original_result(json.loads(raw), operation["id"], TYPES[operation["type"]])
    if value.get("intent_sha256") != operation["package_intent_sha256"]:
        raise ValueError("The retained result belongs to another original content request.")
    if value.get("status") == "complete":
        descriptor = base._file(path, "package_result")
        session.state.update(result_ref=descriptor, phase="native_complete")
        session.save_state()
        return value
    return None



def _guarded_prefix(session, attempt):
    """Use the PHP executable/entrypoint observed from this original Drush."""
    probe = "echo json_encode(['php_binary'=>PHP_BINARY,'script'=>realpath($_SERVER['SCRIPT_FILENAME']),'original_auto_prepend_file'=>ini_get('auto_prepend_file'),'posix'=>function_exists('posix_kill')],JSON_THROW_ON_ERROR);"
    record = session.command(f"package-php-runtime-{attempt:04d}",
                             base._prefix(session.p) + ["php:eval", probe])
    runtime = json.loads(_verified(record["stdout"]).read_bytes())
    binary, script = Path(runtime["php_binary"]), Path(runtime["script"])
    if not binary.is_absolute() or not binary.is_file() or not os.access(binary, os.X_OK):
        raise ValueError("The original Drush did not return its usable native PHP executable.")
    if not script.is_absolute() or not script.is_file() or runtime.get("posix") is not True:
        raise ValueError("The selected native Drush must retain its PHP entrypoint and existing POSIX extension.")
    guard_path = session.out / f"package-guard-{attempt:04d}.php"
    guard_source = Path(__file__).resolve().parent / "native" / "shutdown.php"
    _write_once(guard_path, guard_source.read_bytes())
    _write_once(Path(str(guard_path) + ".runtime.json"), runtime)
    prefix = base._prefix(session.p)
    original_options = prefix[2:] if session.p.get("php_path") else prefix[1:]
    # Keep the selected PHP launcher: extracted runtimes may establish their
    # library and ini paths in that original wrapper before executing PHP_BINARY.
    launcher = prefix[0] if session.p.get("php_path") else str(binary)
    return [launcher, "-d", "auto_prepend_file=" + str(guard_path), str(script), *original_options]


def _attempt(session, operation, intent_ref, files, reconciled):
    attempt = int(session.state.get("attempt", 0)) + 1
    label = f"package-native-{attempt:04d}"
    request_path = session.out / (label + ".request.json")
    result_path = session.out / (label + ".result.json")
    script = Path(__file__).resolve().parent / "native" / "run.php"
    script_copy = session.out / f"package-run-{attempt:04d}.php"
    # Each actual attempt retains the exact operated bridge. A corrected
    # installed bridge can continue the same business operation after its
    # original child is complete/reaped; old source and commands remain intact.
    _write_once(script_copy, script.read_bytes())
    script_ref = base._file(script_copy, "package_bridge_source")
    payload = {
        "schema": NATIVE_REQUEST,
        "operation_id": operation["id"], "action": TYPES[operation["type"]],
        "intent": intent_ref, "intent_sha256": operation["package_intent_sha256"],
        "parameters": operation["package_request"], "files": files,
        "output_dir": str(session.out), "result_path": str(result_path),
        "archive_destination": str(session.out / "package-graph.zip"),
        "provider_environment_id": operation["provider_environment_id"],
        "profile_revision": operation["profile"]["revision"],
        "resume_reconciled": bool(reconciled),
        "lock_seconds": int(session.p["timeout_seconds"]) + 60,
    }
    request_ref = _write_once(request_path, payload)
    session.state.update(attempt=attempt, current_label=label, current_request=request_ref,
                         current_result_path=str(result_path), script_ref=script_ref,
                         phase="native_prepared")
    session.save_state()
    prefix = _guarded_prefix(session, attempt) if operation["type"] == "PACKAGE_IMPORT" else base._prefix(session.p)
    argv = prefix + [
        "php:script", script_copy.stem, "--script-path=" + str(session.out), "--", str(request_path)
    ]
    session.command(label, argv, mutating=operation["type"] == "PACKAGE_IMPORT")
    ref = base._file(result_path, "package_result")
    result = original_result(json.loads(_verified(ref).read_bytes()), operation["id"], TYPES[operation["type"]])
    if result.get("intent_sha256") != operation["package_intent_sha256"]:
        raise ValueError("The original native result differs from its retained operation intent.")
    session.state.update(result_ref=ref, phase="native_complete", pending_command=None)
    session.save_state()
    return result


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    profile = base._profile(config)
    if profile["source_kind"] != "drush":
        raise ValueError("Select the existing equipped Drupal / Drush profile for this content operation.")
    session = base.Session(profile, source_paths["output_dir"], checkpoint, cancelled,
                           source_paths.get("workspace_relocations"))
    source_paths = session.resolve_private(source_paths)
    observations = {}
    try:
        if operation.get("type") not in TYPES or operation["provider_environment_id"] != profile["environment_id"]:
            raise ValueError("The original operation must select this exact configured Drupal environment.")
        if source_paths.get("package_request") != operation["package_request"]:
            raise ValueError("The original queued package parameters changed.")
        intent = operation["package_intent"]
        intent_bytes = packed(intent).encode()
        if hashlib.sha256(intent_bytes).hexdigest() != operation["package_intent_sha256"]:
            raise ValueError("The original queued content intent changed.")
        files = _sources(operation, source_paths)
        intent_ref = _write_once(session.out / "package-intent.json", intent_bytes)
        _state(session, operation, source_paths)
        record = _settle_original(session)
        result = _saved_result(session, operation, record)
        if result is None:
            native_status, commands, native_fingerprint = base._drush_info(session, fresh=True)
            if "php:script" not in commands:
                raise ValueError("The installed original Drush must expose php:script.")
            session.state["native_preflight"] = {
                "native_status": native_status, "target_fingerprint": native_fingerprint,
                "observed_at": base._now(),
            }
            session.save_state()
            result = _attempt(session, operation, intent_ref, files, record is not None)
        observations = {
            "package_result": result, "result_file": session.state.get("result_ref"),
            "native_action": operation["native_action"],
            "provider_context": base._context(profile),
            "native_preflight": session.state.get("native_preflight", {}),
            "intent_file": intent_ref,
        }
        if result.get("archive"):
            archive = session.out / "package-graph.zip"
            actual = base._file(archive, "package_archive")
            if actual["sha256"] != result["archive"]["sha256"] or actual["size"] != result["archive"]["bytes"]:
                raise ValueError("The retained native graph archive differs from its completed export.")
        final_path = session.out / f"package-observations-{int(session.state['attempt']):04d}.json"
        _write_once(final_path, observations)
        success = result.get("status") == "complete"
        session.state.update(phase="completed" if success else "native_failed",
                             observations_ref=base._file(final_path, "package_observations"))
        session.save_state()
        _collect(session)
        return session.result("COMPLETE" if success else "FAILED", observations,
                              None if success else result.get("error", {}).get("message", "The native content operation failed."))
    except base.NativeCancelled as exc:
        _collect(session)
        return session.result("WAITING_NATIVE" if session.state.get("mutation_started") else "CANCELLED", observations, str(exc))
    except base.NativeWaiting as exc:
        _collect(session)
        return session.result("WAITING_NATIVE", observations, str(exc))
    except Exception as exc:
        _collect(session)
        status = "WAITING_NATIVE" if session.state.get("phase") == "native_interrupted" else "FAILED"
        return session.result(status, observations, str(exc))
