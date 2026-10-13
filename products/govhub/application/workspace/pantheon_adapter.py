"""Pantheon operations through the original Terminus host and GovHub journal.

Native contract: pantheon-systems/terminus 4cd1810ad892157131cec5919baf3036ab457d57.
The existing native login remains on that host. Every command uses Session;
provider writes have separate, durable steps and are never replayed after an
unknown outcome. Exact provider workflow UUIDs may settle that original step.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

VERSION = "govhub-pantheon/v1"
TERMINUS_SOURCE = "4cd1810ad892157131cec5919baf3036ab457d57"
ELEMENTS = ("code", "database", "files")
WORKFLOW_FIELDS = "id,env,workflow,user,status,started_at,finished_at,time"
ENV_FIELDS = "id,created,domain,locked,initialized,connection_mode,php_version"
BACKUP_FIELDS = "file,size,date,expiry,initiator"
UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
SCOPE = {
    "site": "one explicitly selected native site UUID",
    "environments": "all environments visible to the existing native account for that site",
    "backups": "all completed code, database and files backups for the selected environment",
    "backup_size": "Terminus supplies a rounded MB display; retained downloads carry exact bytes and SHA-256",
    "code": "the native selected-environment code log, plus the explicit promotion/content source",
    "workflows": "all site workflows before each write; same original UUID for outcome recovery",
    "transport": "existing Terminus executable, login and working directory; exact argv/stdout/stderr/exit",
}


def _api():
    import native_adapter
    return native_adapter


def provider_schema():
    def f(name, label, required=False, **extra):
        return {"name": name, "label": label, "type": "text", "required": required, **extra}
    return {"value": "pantheon", "label": "Pantheon / Terminus", "fields": [
        f("environment_id", "Exact site UUID and environment", True,
          help="Use the native site UUID followed by the environment, for example UUID.test. This must match the operating environment's provider resource ID."),
        f("terminus_path", "Prepared Terminus launcher or existing PHAR", True,
          placeholder="/usr/local/bin/terminus",
          help="For a received installation, use profile_runtime.terminus_path from prepare with its paired PHP path."),
        f("php_path", "Existing PHP executable",
          help="Optional absolute PHP path when the existing Terminus PHAR is not executable."),
        f("site_root", "Native CLI working directory", True,
          help="Existing absolute directory on the host that owns the selected Terminus login."),
        f("content_source_environment", "Reviewed content source environment",
          help="Same-site source such as live or test. Content sync selects this source and the target above explicitly."),
        f("expected_source_code_sha256", "Reviewed promotion source code-log SHA-256",
          help="For code promotion, copy promotion_source_code_sha256 from the native capability observation. Test promotes Dev code; Live promotes Test code."),
        f("backup_code_file", "Selected original code backup filename"),
        f("backup_database_file", "Selected original database backup filename"),
        f("backup_files_file", "Selected original files backup filename"),
        f("deploy_note", "Deployment note", max_length=2000),
        f("run_updatedb", "Run Drupal database updates",
          options=[["no", "No"], ["yes", "Yes"]], default="no"),
        f("clear_cache", "Clear cache after deployment or database sync",
          options=[["no", "No"], ["yes", "Yes"]], default="no"),
        f("wordpress_from_url", "WordPress text to replace", max_length=2048,
          help="Optional native search text, including a bare hostname or URL. Pair it with the replacement text."),
        f("wordpress_to_url", "WordPress replacement text", max_length=2048),
        {"name": "backup_keep_days", "label": "Native backup retention in days",
         "type": "integer", "default": 30, "minimum": 1, "maximum": 3650},
        {"name": "timeout_seconds", "label": "Native command timeout (seconds)",
         "type": "integer", "default": 600, "minimum": 10, "maximum": 7200},
        {"name": "max_artifact_bytes", "label": "Maximum individual artifact bytes",
         "type": "integer", "default": 1073741824, "minimum": 1048576},
    ]}


RUNTIME_FIELDS = ("terminus_path", "php_path", "site_root")
BRIDGE_SCHEMA = "govhub-pantheon-bridge/v1"


def profile(config, runtime_bindings=None):
    allowed = {"source_kind", "target_fingerprint", *(f["name"] for f in provider_schema()["fields"])}
    unknown = set(config) - allowed
    if unknown:
        raise ValueError("Unsupported Pantheon profile fields: " + ", ".join(sorted(unknown)))
    p = dict(config)
    if runtime_bindings is not None:
        if (not isinstance(runtime_bindings, dict) or not runtime_bindings
                or set(runtime_bindings) - set(RUNTIME_FIELDS)
                or not {"terminus_path", "site_root"} <= set(runtime_bindings)):
            raise ValueError("Local runtime bindings require terminus_path and site_root, with optional php_path.")
        if any(not isinstance(value, str) or "\x00" in value for value in runtime_bindings.values()):
            raise ValueError("Keep local runtime bindings as ordinary executable and directory paths.")
        # Explicit absence selects a directly executable Terminus, not the old
        # receiving machine's PHP path. No target or account field is overlaid.
        p["php_path"] = ""
        p.update(runtime_bindings)
    if p.get("source_kind") != "pantheon":
        raise ValueError("Select the Pantheon native profile.")
    value = p.get("environment_id")
    if not isinstance(value, str) or "." not in value:
        raise ValueError("Set the exact native site UUID followed by its environment.")
    site_id, environment = value.rsplit(".", 1)
    if not UUID.fullmatch(site_id) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", environment):
        raise ValueError("The provider resource must be an exact Pantheon site UUID and native environment.")
    p.update(site_id=site_id.lower(), environment=environment)
    for name, directory in (("terminus_path", False), ("site_root", True), ("php_path", False)):
        if name == "php_path" and not p.get(name):
            continue
        path = Path(str(p.get(name, ""))).expanduser()
        if not path.is_absolute() or not (path.is_dir() if directory else path.is_file()):
            raise ValueError("Select the existing absolute native " + name + ".")
        if name == "php_path" and not os.access(path, os.X_OK):
            raise ValueError("The selected PHP binary must be executable.")
        if name == "terminus_path" and not p.get("php_path") and not os.access(path, os.X_OK):
            raise ValueError("Select an executable Terminus or its existing PHP interpreter.")
        p[name] = str(path.resolve())
    source = p.get("content_source_environment", "")
    if source and (not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", source) or source == environment):
        raise ValueError("The content source must name a different environment on this same site.")
    for key in ("run_updatedb", "clear_cache"):
        p[key] = p.get(key) or "no"
        if p[key] not in {"yes", "no"}:
            raise ValueError("Choose Yes or No for " + key + ".")
    for key in ("wordpress_from_url", "wordpress_to_url", "deploy_note"):
        if p.get(key) is not None and (not isinstance(p[key], str) or "\x00" in p[key]):
            raise ValueError("Retain native option " + key + " as text.")
    if bool(p.get("wordpress_from_url")) != bool(p.get("wordpress_to_url")):
        raise ValueError("Set both WordPress replacement values together.")
    for key in ("wordpress_from_url", "wordpress_to_url"):
        value = p.get(key)
        if value and (len(value.encode("utf-8")) > 2048 or re.search(r"[\x00-\x1f\x7f]", value)):
            raise ValueError("Keep " + key + " as ordinary native replacement text up to 2048 UTF-8 bytes.")
    expected = p.get("expected_source_code_sha256", "")
    if expected and not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("Use the full observed promotion source code-log SHA-256.")
    for element in ELEMENTS:
        name = p.get("backup_" + element + "_file", "")
        if name and (not isinstance(name, str) or "/" in name or "\\" in name
                     or "\x00" in name or name in {".", ".."}):
            raise ValueError("Select an original native backup filename, without a path.")
    p["timeout_seconds"] = int(p.get("timeout_seconds") or 600)
    p["max_artifact_bytes"] = int(p.get("max_artifact_bytes") or 1073741824)
    p["backup_keep_days"] = int(p.get("backup_keep_days") or 30)
    if not 10 <= p["timeout_seconds"] <= 7200 or p["max_artifact_bytes"] < 1048576:
        raise ValueError("The native timeout or artifact limit is out of range.")
    if not 1 <= p["backup_keep_days"] <= 3650:
        raise ValueError("Native backup retention must be between 1 and 3650 days.")
    return p


def provider_context(p):
    return {"source_kind": "pantheon", "site_id": p["site_id"],
            "environment_id": p["environment_id"], "environment": p["environment"]}


def actions_for(operation_type):
    if operation_type == "CAPTURE":
        return [{"value": "pantheon-capture", "label": "Capture native site, environment, code and backup inventory"}]
    if operation_type == "BACKUP_DOWNLOAD":
        return [{"value": "pantheon-backup-download", "label": "Download the explicitly selected native backups"}]
    if operation_type == "BACKUP_CREATE":
        return [{"value": "pantheon-backup-create", "label": "Create and retain a complete native environment backup"}]
    if operation_type in {"REHEARSAL", "CUTOVER", "ROLLBACK"}:
        return [
            {"value": "pantheon-deploy", "label": "Promote reviewed code to Test or Live",
             "required_profile_fields": ["expected_source_code_sha256"]},
            {"value": "pantheon-sync-content", "label": "Sync reviewed database and files from the selected source",
             "required_profile_fields": ["content_source_environment"]},
            {"value": "pantheon-sync-database", "label": "Sync the reviewed database only",
             "required_profile_fields": ["content_source_environment"]},
            {"value": "pantheon-sync-files", "label": "Sync the reviewed files only",
             "required_profile_fields": ["content_source_environment"]},
            {"value": "pantheon-restore", "label": "Restore the explicitly selected original backup components"},
        ]
    return []


def pollable(resume):
    pending = resume.get("native_poll") or {}
    return (resume.get("phase") == "accepted" and pending.get("provider") == "pantheon"
            and pending.get("kind") in {"workflow", "backup-catalog"} and bool(pending.get("id")))


def resume_fields(operation, payload, reason):
    """Validate the explicit native association in the original resume action."""
    fields = {}
    requested = any(payload.get(key) for key in ("native_workflow_id", "native_backup_files")) or "runtime_bindings" in payload
    if not requested:
        return fields
    if not str(operation.get("native_action", "")).startswith("pantheon-"):
        raise ValueError("These native continuation fields belong to Pantheon operations.")
    if "runtime_bindings" in payload:
        if not isinstance(payload["runtime_bindings"], dict):
            raise ValueError("Supply an explicit local runtime binding object.")
        original = (operation.get("profile") or {}).get("config") or {}
        selected = profile(original, payload["runtime_bindings"])
        if selected["environment_id"] != operation.get("provider_environment_id"):
            raise ValueError("Local runtime bindings belong to the original selected native environment.")
        fields["runtime_bindings"] = {key: selected.get(key, "") for key in RUNTIME_FIELDS}
        fields["runtime_binding_reason"] = reason
    state = operation.get("resume_checkpoint") or operation.get("checkpoint") or {}
    state = state.get("resume_checkpoint", state.get("state", state))
    if payload.get("native_workflow_id"):
        native_id = payload["native_workflow_id"]
        label = payload.get("native_workflow_step")
        if not isinstance(native_id, str) or not UUID.fullmatch(native_id):
            raise ValueError("Supply the exact original Pantheon workflow UUID.")
        step = (state.get("steps") or {}).get(label)
        if not step or label != state.get("pending_step") or step.get("phase") in {"complete", "provider_failed"}:
            raise ValueError("Select the still unresolved original native step.")
        if step.get("workflow_id") and step["workflow_id"] != native_id:
            raise ValueError("A different workflow cannot replace the retained original workflow.")
        if native_id in step.get("prior_workflow_ids", []):
            raise ValueError("The selected workflow existed before the original command.")
        fields.update(native_workflow_id=native_id, native_workflow_step=label, native_workflow_reason=reason)
    if payload.get("native_backup_files"):
        label = payload.get("native_backup_step")
        selected = payload["native_backup_files"]
        if label != state.get("pending_backup_set") or not label:
            raise ValueError("Select the unresolved original backup set.")
        if not isinstance(selected, dict) or set(selected) != set(ELEMENTS):
            raise ValueError("Select all three original code, database and files backup filenames.")
        candidates = state.get("backup_candidates") or []
        for element, filename in selected.items():
            if not isinstance(filename, str) or not any(row.get("element") == element and row.get("file") == filename for row in candidates):
                raise ValueError("Select the " + element + " filename from this original native backup result.")
        prior = dict(operation.get("native_backup_selections") or {})
        if label in prior and prior[label] != selected:
            raise ValueError("A different backup set cannot replace the retained original selection.")
        prior[label] = dict(selected)
        fields.update(native_backup_selections=prior, native_backup_selection_reason=reason)
    return fields


def _bind_runtime(s, config):
    """Record the actual receiving host separately from the immutable instruction."""
    selected = {key: s.p.get(key, "") for key in RUNTIME_FIELDS}
    value = {"provider_context": provider_context(s.p), "paths": selected}
    digest = _api()._digest(value)
    history = s.state.setdefault("runtime_binding_history", [])
    if not history or history[-1].get("sha256") != digest:
        history.append({**value, "sha256": digest, "observed_at": _api()._now(),
                        "original_profile_paths": {key: config.get(key, "") for key in RUNTIME_FIELDS}})
        s.save_state()


def _prefix(p):
    return ([p["php_path"]] if p.get("php_path") else []) + [p["terminus_path"], "--no-ansi", "--no-interaction"]


def _add_once(s, path, role, **extra):
    actual = _api()._file(s.private_path(str(path)), role)
    for old in s.artifacts:
        if (old["path"], old["role"]) == (actual["path"], role):
            if (old["sha256"], old["size"]) != (actual["sha256"], actual["size"]):
                raise ValueError("An original native artifact changed during this operation.")
            return old
    return s.add(actual["path"], role, **extra)


def _command_labels(s, label):
    return [label] + list(s.state.get("runtime_command_attempts", {}).get(label, []))


def _command_record(s, label):
    actual = _command_labels(s, label)[-1]
    path = s.out / (actual + ".command.json")
    return s.read_private_json(path) if path.is_file() else s.state.get("completed_commands", {}).get(actual)


def _native_arguments(argv):
    if not isinstance(argv, list) or any(not isinstance(value, str) for value in argv):
        raise ValueError("The original native command has no readable argument identity.")
    for index in (1, 2):
        if argv[index:index + 2] == ["--no-ansi", "--no-interaction"]:
            return argv[index + 2:]
    raise ValueError("The original command is not an identified Terminus invocation.")


def _retain(s, label):
    for actual_label in _command_labels(s, label):
        path = s.out / (actual_label + ".command.json")
        if not path.is_file():
            continue
        record = s.read_private_json(path)
        _add_once(s, path, "native_command", format="terminus-cli")
        settled = record.get("phase") in {"complete", "not_started"} or (
            record.get("phase") == "interrupted" and record.get("owned_process_reaped") is True)
        if settled:
            for stream in ("stdout", "stderr"):
                old = record.get(stream)
                if not old:
                    continue
                actual = _api()._file(s.private_path(old["path"]), stream)
                if (actual["sha256"], actual["size"]) != (old["sha256"], old["size"]):
                    raise ValueError("The original Terminus output changed in custody.")
                _add_once(s, actual["path"], "native_stderr" if stream == "stderr" else "provider_cli_output",
                    format="terminus-cli", provider_context=provider_context(s.p),
                    native_phase=record.get("phase"), native_returncode=record.get("returncode"))


def _term(s, label, arguments, mutating=False):
    actual_label = _command_labels(s, label)[-1]
    argv = s.argv(_prefix(s.p) + arguments)
    previous = _command_record(s, label)
    if previous and (previous.get("argv") != argv or (not mutating
            and previous.get("phase") == "complete" and previous.get("returncode") != 0)):
        if (_native_arguments(previous.get("argv")) != s.argv(arguments)
                or previous.get("mutating", False) is not bool(mutating)):
            raise ValueError("Local runtime selection cannot change the original native command arguments.")
        # Reuse a complete original observation with its exact historical argv.
        # Session verifies the original output; no executable is launched here.
        if previous.get("phase") == "complete" and previous.get("returncode") == 0:
            argv = previous["argv"]
        elif previous.get("phase") == "not_started" or (
                not mutating and (previous.get("phase") == "complete" or (
                    previous.get("phase") == "interrupted" and previous.get("owned_process_reaped") is True))):
            _retain(s, label)
            attempts = s.state.setdefault("runtime_command_attempts", {}).setdefault(label, [])
            actual_label = label + "-runtime-" + str(len(attempts) + 1).zfill(6)
            if (s.out / (actual_label + ".command.json")).exists():
                raise ValueError("The selected receiving-host command attempt already has different history.")
            attempts.append(actual_label)
            s.save_state()
        else:
            raise _api().NativeWaiting("Retain the original unresolved command and continue its actual native workflow.")
    try:
        result = s.command(actual_label, argv, mutating=mutating)
    except BaseException as exc:
        try:
            _retain(s, label)
        except Exception as retention_error:
            s.event({"kind": "native_artifact_retention_error", "label": label, "message": str(retention_error)})
            if hasattr(exc, "add_note"):
                exc.add_note("Original artifact registration: " + str(retention_error))
        raise
    _retain(s, label)
    return result


def _read(s, label, arguments, fresh=False):
    if fresh:
        index = int(s.state.get("observation_index", 0)) + 1
        s.state["observation_index"] = index
        s.save_state()
        label += "-" + str(index).zfill(6)
    record = _term(s, label, arguments + ["--format=json"])
    path = Path(record["stdout"]["path"])
    if path.stat().st_size > min(s.p["max_artifact_bytes"], 32 * 1024 * 1024):
        raise ValueError("The native metadata exceeds the configured intake size.")
    return json.loads(path.read_bytes()), record


def _rows(value, field, name):
    rows = list(value.values()) if isinstance(value, dict) else value
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("Terminus did not return its native " + name + " collection.")
    ids = [row.get(field) for row in rows]
    if any(not isinstance(key, str) or not key for key in ids) or len(ids) != len(set(ids)):
        raise ValueError("The native " + name + " collection requires unique original " + field + " values.")
    return rows


def _backup_inventory(s, label, fresh=False):
    rows = []
    for element in ELEMENTS:
        data, _ = _read(s, label + "-" + element, ["backup:list", s.p["environment_id"],
            "--element=" + element, "--fields=" + BACKUP_FIELDS], fresh=fresh)
        for row in _rows(data, "file", element + " backups"):
            rows.append({**row, "element": element})
    names = [row["file"] for row in rows]
    if len(names) != len(set(names)):
        raise ValueError("One native backup filename appears in more than one component collection.")
    return rows


def _code(s, label, environment, fresh=False):
    value, _ = _read(s, label, ["env:code-log", s.p["site_id"] + "." + environment,
                              "--fields=datetime,author,labels,hash,message"], fresh=fresh)
    return _rows(value, "hash", "code log")


def _inventory(s, label, fresh=False):
    version_label = label + "-version"
    if fresh:
        index = int(s.state.get("observation_index", 0)) + 1
        s.state["observation_index"] = index
        s.save_state()
        version_label += "-" + str(index).zfill(6)
    version_record = _term(s, version_label, ["--version"])
    version_path = Path(version_record["stdout"]["path"])
    if version_path.stat().st_size > 65536:
        raise ValueError("The native version response exceeds its metadata size.")
    version = version_path.read_text(errors="replace").strip()
    if not version:
        raise ValueError("The existing Terminus executable returned no native version.")
    site, _ = _read(s, label + "-site", ["site:info", s.p["site_id"],
        "--fields=id,name,label,framework,region,organization,plan_name,frozen"], fresh=fresh)
    if not isinstance(site, dict) or str(site.get("id", "")).lower() != s.p["site_id"]:
        raise ValueError("The native site differs from the selected original site UUID.")
    envs, _ = _read(s, label + "-environments", ["env:list", s.p["site_id"], "--fields=" + ENV_FIELDS], fresh=fresh)
    envs = _rows(envs, "id", "environment")
    selected = [e for e in envs if e["id"] == s.p["environment"]]
    if len(selected) != 1:
        raise ValueError("The selected environment is absent from this site's permitted native inventory.")
    codes = {}
    for env in dict.fromkeys([s.p["environment"],
            *([{"test": "dev", "live": "test"}[s.p["environment"]]] if s.p["environment"] in {"test", "live"} else []),
            *([s.p["content_source_environment"]] if s.p.get("content_source_environment") else [])]):
        if env not in {e["id"] for e in envs}:
            raise ValueError("The reviewed source environment is absent from this same site's native inventory.")
        native_env = next(e for e in envs if e["id"] == env)
        if str(native_env.get("initialized")).lower() in {"true", "1"}:
            codes[env] = _code(s, label + "-code-" + env, env, fresh=fresh)
        else:
            codes[env] = []
    return {"site": site, "environments": envs, "selected_environment": selected[0],
            "terminus_version": version,
            "code_logs": codes, "backups": _backup_inventory(s, label + "-backups", fresh=fresh)}


def _summary(p, inventory):
    source = {"test": "dev", "live": "test"}.get(p["environment"])
    return {"site_id": p["site_id"], "site_name": inventory["site"].get("name"),
            "terminus_version": inventory.get("terminus_version"), "environment": p["environment"], "environments": len(inventory["environments"]),
            "backups": len(inventory["backups"]), "selected_backups": inventory["backups"],
            "target_code_sha256": _api()._digest(inventory["code_logs"].get(p["environment"], [])),
            "promotion_source_environment": source,
            "promotion_source_code_sha256": _api()._digest(inventory["code_logs"].get(source, [])) if source else None,
            "content_source_environment": p.get("content_source_environment"), "scope": SCOPE}


def _state(s, supplied=None):
    path = s.out / "native-state.json"
    value = s.read_private_json(path) if path.exists() else (supplied or {})
    value = value.get("resume_checkpoint", value.get("state", value))
    s.state = dict(s.resolve_private(value))


def _intent(s, value, legacy=None):
    digest = _api()._digest(value)
    original = s.state.get("intent_sha256")
    if original:
        if _api()._digest(s.state.get("intent")) != original:
            raise ValueError("The retained original instruction differs from its saved digest.")
        accepted = {digest}
        if legacy is not None:
            accepted.add(_api()._digest(legacy))
        if original not in accepted:
            raise ValueError("This continuation belongs to a different native operation, target or reviewed source.")
    if not s.state.get("intent_sha256"):
        s.state.update(intent=value, intent_sha256=digest, phase="prepared",
                       mutation_started=False, output_dir=str(s.out))
        s.save_state()


def _manifest(s, name, value, role="configuration_export", **extra):
    path = s.out / name
    if path.exists():
        if s.read_private_json(path) != value:
            raise ValueError("An original native manifest changed: " + name)
    else:
        _api()._atomic(path, value)
    return _add_once(s, path, role, format="pantheon-native-manifest", provider_context=provider_context(s.p), **extra)


def discover_capabilities(config, runtime_bindings=None):
    result = {"ready": False, "configuration": {}, "current_config": {}, "actions": []}
    try:
        p = profile(config, runtime_bindings)
        result.update(configuration=config, current_config=config, runtime_bindings={key: p.get(key, "") for key in RUNTIME_FIELDS})
        with tempfile.TemporaryDirectory(prefix="govhub-pantheon-capabilities-") as folder:
            s = _api().Session(p, folder)
            inventory = _inventory(s, "capability")
            result.update(ready=True, native_status=_summary(p, inventory),
                provider_context=provider_context(p), target_fingerprint=_api()._digest(provider_context(p)),
                actions=sum((actions_for(t) for t in ("CAPTURE", "BACKUP_CREATE", "BACKUP_DOWNLOAD", "CUTOVER")), []),
                observed_at=_api()._now())
    except Exception as exc:
        result["message"] = str(exc)
    return result


def capture(config, context, checkpoint=None, cancelled=None):
    p = profile(config, context.get("runtime_bindings"))
    s = _api().Session(p, context["output_dir"], checkpoint, cancelled, context.get("workspace_relocations"))
    try:
        _state(s, context.get("checkpoint"))
        _bind_runtime(s, config)
        _intent(s, {"action": "pantheon-capture", "target": provider_context(p),
                    "operation_id": context.get("operation_id")})
        inventory = _inventory(s, "original-inventory")
        expected = context.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _api()._digest(provider_context(p)):
            raise ValueError("The original native target differs from its reviewed fingerprint.")
        _manifest(s, "pantheon-source-inventory.json", {"schema": VERSION,
            "provider_context": provider_context(p), "scope": SCOPE, "inventory": inventory})
        observations = {"native_action": "pantheon-capture", **_summary(p, inventory)}
        s.state.update(phase="completed", observations=observations)
        s.save_state()
        return s.result("COMPLETE", observations)
    except _api().NativeCancelled as exc:
        return s.result("CANCELLED", message=str(exc))
    except _api().NativeWaiting as exc:
        return s.result("WAITING_NATIVE", message=str(exc))
    except Exception as exc:
        return s.result("FAILED", message=str(exc))


def _workflows(s, label, fresh=False):
    data, _ = _read(s, label, ["workflow:list", s.p["site_id"], "--all",
                            "--fields=" + WORKFLOW_FIELDS], fresh=fresh)
    return _rows(data, "id", "site workflow")


def _pending_recovery(s, operation, label):
    step = s.state["steps"][label]
    if step.get("transport") == BRIDGE_SCHEMA:
        return _bridge_poll(s, operation, label)
    native_id = step.get("workflow_id")
    association = operation.get("native_workflow_id")
    explicit = bool(association and operation.get("native_workflow_step") == label)
    if explicit:
        if native_id and association != native_id:
            raise ValueError("The selected workflow would replace an already bound original workflow.")
        if not UUID.fullmatch(association):
            raise ValueError("Retain the exact original Pantheon workflow UUID.")
        if association in step["prior_workflow_ids"]:
            raise ValueError("That workflow already existed before this native command.")
        native_id = association
    if not native_id:
        s.state.update(phase="reconcile_required", native_poll=None, pending_step=label)
        s.save_state()
        raise _api().NativeWaiting("Inspect the retained " + label + " command and select its original Pantheon workflow UUID in Resume.")
    workflow, _ = _read(s, "workflow-" + native_id, ["workflow:info:status", s.p["site_id"],
                         "--id=" + native_id, "--fields=" + WORKFLOW_FIELDS], fresh=True)
    if (not isinstance(workflow, dict) or workflow.get("id") != native_id
            or workflow.get("env") != s.p["environment"]):
        raise ValueError("The original workflow status belongs to a different native environment or UUID.")
    if not step.get("workflow_id"):
        # Bind after the native record validates, so a mistyped UUID cannot
        # poison this original continuation.
        step.update(workflow_id=native_id, association_reason=operation.get("native_workflow_reason"),
                    association_origin="explicit_original_operation_resume")
        s.event({"kind": "pantheon_original_workflow_binding", "label": label, "workflow_id": native_id,
                 "command_sha256": step["argv_sha256"], "reason": step["association_reason"]})
    step["workflow"] = workflow
    s.state.update(phase="accepted", pending_step=label,
                   native_poll={"provider": "pantheon", "kind": "workflow", "id": native_id, "step": label})
    status = workflow.get("status")
    if status == "succeeded":
        step.update(phase="complete", completion="original_provider_workflow", completed_at=_api()._now())
        s.state.update(phase="prepared", pending_step=None, pending_command=None, native_poll=None)
        s.save_state()
        return
    if status == "failed":
        step.update(phase="provider_failed", completion="original_provider_workflow")
        s.state.update(phase="failed", native_poll=None)
        s.save_state()
        raise ValueError("The original Pantheon workflow failed: " + native_id)
    s.save_state()
    raise _api().NativeWaiting("The original Pantheon workflow remains " + str(status or "unreported") + ".")



def _bridge_ready(s, label):
    record = _term(s, label, ["govhub:bridge-info"])
    output = Path(record["stdout"]["path"])
    if output.stat().st_size > 1048576:
        raise ValueError("The installed bridge information exceeds its source identity limit.")
    info = json.loads(output.read_bytes())
    if (not isinstance(info, dict) or info.get("schema") != "govhub-pantheon-bridge-info/v1"
            or info.get("request_schema") != BRIDGE_SCHEMA or info.get("terminus_version") != "4.3.3"
            or len(info.get("native_contracts", [])) != 15):
        raise ValueError("Receive the complete Terminus 4.3.3 native bridge through pantheon_receive.py prepare.")
    root = Path(__file__).resolve().parent / "pantheon_bridge"
    supplied = info.get("source_files")
    expected = []
    for name in ("GovHubBridgeCommand.php", "ReceiptJournal.php", "SingleAttemptRequest.php"):
        path = root / "src" / name
        item = _api()._file(path, "native_bridge_source")
        expected.append({"path": "src/" + name, "bytes": item["size"], "sha256": item["sha256"]})
    if supplied != sorted(expected, key=lambda value: value["path"]):
        raise ValueError("The installed native bridge differs from this received application's source.")
    return info


def _bridge_instruction(s, operation, label, arguments):
    value = {"schema": BRIDGE_SCHEMA, "operation_id": operation["id"], "step_id": label,
             "intent_sha256": s.state["intent_sha256"], "site_id": s.p["site_id"],
             "environment_id": s.p["environment"], "timeout_seconds": s.p["timeout_seconds"]}
    command = arguments[0]
    if command == "backup:create":
        value.update(action="pantheon-backup-create", backup_element="all",
                     backup_keep_days=s.p["backup_keep_days"])
        native_type = "do_export"
    elif command == "env:deploy":
        value.update(action="pantheon-deploy-code",
            source_environment_id={"test": "dev", "live": "test"}[s.p["environment"]],
            deploy_note=s.p.get("deploy_note") or "GovHub " + operation["id"],
            run_updatedb=s.p["run_updatedb"] == "yes", clear_cache=s.p["clear_cache"] == "yes",
            expected_source_code_sha256=s.p["expected_source_code_sha256"])
        native_type = "deploy"
    elif command == "env:clone-content":
        files = "--files-only" in arguments
        value.update(action="pantheon-clone-files" if files else "pantheon-clone-database",
                     source_environment_id=s.p["content_source_environment"])
        native_type = "clone_files" if files else "clone_database"
        if not files:
            value.update(run_updatedb=s.p["run_updatedb"] == "yes", clear_cache=s.p["clear_cache"] == "yes")
            if s.p.get("wordpress_from_url"):
                value.update(wordpress_from_url=s.p["wordpress_from_url"],
                             wordpress_to_url=s.p["wordpress_to_url"])
    elif command == "backup:restore" and label.startswith("restore-"):
        element = label.removeprefix("restore-")
        if element not in ELEMENTS:
            raise ValueError("The native restore step must retain its original component.")
        value.update(action="pantheon-restore-backup", backup_file=s.p["backup_" + element + "_file"],
                     backup_element=element)
        native_type = "restore_" + element
    else:
        raise ValueError("No native bridge mapping exists for this reviewed original command.")
    return value, native_type


def _bridge_paths(s, label):
    return s.out / (label + ".request.json"), s.out / (label + ".receipt.json")


def _bridge_request(s, label, request):
    path, receipt = _bridge_paths(s, label)
    if path.is_symlink() or receipt.is_symlink():
        raise ValueError("Native bridge custody must use ordinary private files.")
    if path.exists():
        raw = path.read_bytes()
        if json.loads(raw) != request:
            raise ValueError("The original bridge instruction changed.")
    else:
        _api()._atomic(path, request)
        os.chmod(path, 0o600)
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        raw = path.read_bytes()
    if path.stat().st_mode & 0o077:
        raise ValueError("The original native bridge request must be private to its operator.")
    _add_once(s, path, "native_bridge_request", format=BRIDGE_SCHEMA)
    return path, receipt, hashlib.sha256(raw).hexdigest()


def _bridge_bound(s, value, request, request_sha256):
    if not isinstance(value, dict):
        raise ValueError("The original native bridge receipt is not an object.")
    for key in ("schema", "operation_id", "step_id", "intent_sha256", "action"):
        if value.get(key) != request[key]:
            raise ValueError("The native receipt belongs to another original " + key + ".")
    if value.get("request_sha256") != request_sha256 or value.get("request") != request:
        raise ValueError("The native receipt differs from its exact private request bytes.")
    target = value.get("target") or {}
    if (target.get("site_id") != request["site_id"]
            or target.get("environment_id") != request["environment_id"]
            or target.get("resource_id") != request["site_id"] + "." + request["environment_id"]):
        raise ValueError("The native receipt belongs to a different original site or environment.")
    workflow = value.get("workflow")
    if workflow is not None:
        if (not isinstance(workflow, dict) or not isinstance(workflow.get("id"), str)
                or not UUID.fullmatch(workflow["id"])
                or workflow.get("site_id") != request["site_id"]
                or workflow.get("environment_id") != request["environment_id"]
                or not isinstance(workflow.get("finished"), bool)
                or not isinstance(workflow.get("successful"), bool)
                or workflow.get("status") not in {"running", "failed", "succeeded"}):
            raise ValueError("The original native workflow has incompatible target or status fields.")
        if request.get("workflow_id") and workflow["id"].lower() != request["workflow_id"]:
            raise ValueError("A different workflow cannot replace the selected original native UUID.")
        if (request.get("expected_workflow_type") and workflow.get("type") is not None
                and workflow["type"] != request["expected_workflow_type"]):
            raise ValueError("The native workflow type differs from this original step.")
        if ((workflow["status"] == "running") == workflow["finished"]
                or (workflow["status"] == "succeeded") != workflow["successful"]):
            raise ValueError("The original native workflow status and completion fields disagree.")
    return value


def _retain_bridge(s, receipt, value=None):
    if receipt.is_file():
        _add_once(s, receipt, "native_bridge_receipt", format=BRIDGE_SCHEMA)
    directory = receipt.with_name(receipt.name + ".d")
    if directory.is_symlink():
        raise ValueError("Native bridge sidecars must stay in ordinary private custody.")
    if directory.exists():
        for path in sorted(directory.iterdir()):
            if path.name == "lock" or path.name.startswith(".tmp-"):
                continue
            if path.is_symlink() or not path.is_file():
                raise ValueError("The original native bridge custody contains an unexpected entry.")
            _add_once(s, path, "native_bridge_source", format=BRIDGE_SCHEMA)
    for item in (value or {}).get("artifacts", []):
        path = Path(s.private_path(item["path"]))
        if not path.is_relative_to(directory):
            raise ValueError("The original native receipt artifact left its operation custody.")
        actual = _api()._file(path, "native_bridge_source")
        if (actual["sha256"], actual["size"]) != (item["sha256"], item["bytes"]):
            raise ValueError("An original native receipt artifact changed in custody.")
        _add_once(s, path, "native_bridge_source", format=BRIDGE_SCHEMA)



def _bridge_command_rejection(s, label, record, value, request, request_sha256):
    """Recognize an ended native validation return before receipt acquisition."""
    if (not isinstance(value, dict) or record.get("phase") != "complete"
            or record.get("returncode") != 2 or record.get("mutating") is not True
            or value.get("schema") != BRIDGE_SCHEMA or value.get("state") != "rejected"
            or value.get("dispatched") is not False or value.get("workflow") is not None
            or (value.get("error") or {}).get("code") != "INVALID_BRIDGE_REQUEST"):
        return None
    path, receipt = _bridge_paths(s, label)
    directory = receipt.with_name(receipt.name + ".d")
    if directory.exists() or directory.is_symlink() or receipt.exists() or receipt.is_symlink():
        return None
    if value.get("request_phase") not in {None, "request-read", "request-validation"}:
        return None
    if value.get("request_sha256") not in {None, request_sha256}:
        return None
    if any(value.get(key) not in {None, request[key]} for key in ("operation_id", "step_id")):
        return None
    arguments = ["govhub:bridge", "--request=" + str(path), "--receipt=" + str(receipt)]
    if _native_arguments(record.get("argv")) != s.argv(arguments):
        return None
    _retain(s, label)
    # Keep this local command association separate from the original native
    # stdout and from bound workflow receipts.
    return {**value, "command_rejection": {
        "kind": "original_native_command_validation", "command_label": label,
        "request_sha256": request_sha256, "stdout": record["stdout"],
        "request_phase": value.get("request_phase") or "legacy_before_receipt_creation"}}


def _bridge_saved(s, label, request, request_sha256):
    _, receipt = _bridge_paths(s, label)
    for path in (receipt, receipt.with_name(receipt.name + ".d") / "workflow.json"):
        if path.is_symlink():
            raise ValueError("Native workflow custody cannot be a symbolic link.")
        if path.is_file():
            if path.stat().st_size > min(s.p["max_artifact_bytes"], 32 * 1024 * 1024):
                raise ValueError("The native workflow receipt exceeds its metadata limit.")
            value = _bridge_bound(s, s.read_private_json(path), request, request_sha256)
            _retain_bridge(s, receipt, value)
            return value
    # A final write can fail after native receipt data reached the original
    # stdout. Its exact original bytes are also a recoverable native return.
    record = _command_record(s, label)
    if record and record.get("stdout") and (record.get("phase") == "complete" or (
            record.get("phase") == "interrupted" and record.get("owned_process_reaped") is True)):
        path = Path(record["stdout"]["path"])
        if path.is_file() and path.stat().st_size <= min(s.p["max_artifact_bytes"], 32 * 1024 * 1024):
            try:
                value = json.loads(path.read_bytes())
            except (ValueError, UnicodeError):
                value = None
            if isinstance(value, dict) and value.get("schema") == BRIDGE_SCHEMA and value.get("request"):
                value = _bridge_bound(s, value, request, request_sha256)
                _retain_bridge(s, receipt, value)
                return value
            rejected = _bridge_command_rejection(s, label, record, value, request, request_sha256)
            if rejected is not None:
                return rejected
    return None


def _bridge_call(s, label, request, mutating):
    request_path, receipt, request_sha256 = _bridge_request(s, label, request)
    saved = _bridge_saved(s, label, request, request_sha256)
    if saved:
        return saved
    args = ["govhub:bridge", "--request=" + str(request_path), "--receipt=" + str(receipt)]
    dispatch = receipt.with_name(receipt.name + ".d") / "dispatch.json"
    record = _command_record(s, label)
    error = None
    if not dispatch.exists():
        if record and record.get("phase") not in {"not_started"}:
            if not (not mutating and record.get("phase") == "interrupted"
                    and record.get("owned_process_reaped") is True):
                _retain_bridge(s, receipt)
                raise _api().NativeWaiting("Restore this original native command's completed receipt or select its actual workflow UUID.")
        try:
            _term(s, label, args, mutating=mutating)
        except Exception as exc:
            error = exc
        saved = _bridge_saved(s, label, request, request_sha256)
        if saved:
            return saved
    if dispatch.exists():
        # The original bridge recovers this bound dispatch before any login or
        # native request. A distinct read command retains the old process record.
        if dispatch.is_symlink() or not dispatch.is_file():
            raise ValueError("Original native dispatch custody must be an ordinary file.")
        _bridge_bound(s, s.read_private_json(dispatch), request, request_sha256)
        index = int(s.state.get("bridge_recovery_index", 0)) + 1
        s.state["bridge_recovery_index"] = index
        s.save_state()
        recovery_label = label + "-recover-" + str(index).zfill(6)
        try:
            _term(s, recovery_label, args, mutating=False)
        except Exception as exc:
            error = exc
        saved = _bridge_saved(s, label, request, request_sha256)
        if saved:
            return saved
        # The recovery command can itself preserve its return on stdout.
        recovery_record = _command_record(s, recovery_label)
        if recovery_record and recovery_record.get("stdout"):
            path = Path(recovery_record["stdout"]["path"])
            if path.is_file() and path.stat().st_size <= min(s.p["max_artifact_bytes"], 32 * 1024 * 1024):
                try:
                    value = json.loads(path.read_bytes())
                except (ValueError, UnicodeError):
                    value = None
                if isinstance(value, dict) and value.get("request"):
                    saved = _bridge_bound(s, value, request, request_sha256)
                    _retain_bridge(s, receipt, saved)
                    return saved
    _retain_bridge(s, receipt)
    if error is not None:
        raise error
    raise _api().NativeWaiting("The original native command's receipt is not yet complete.")


def _bridge_outcome(s, operation, label, value, inspection=False):
    step = s.state["steps"][label]
    if value.get("state") not in {"submitted", "completed", "failed", "rejected", "uncertain"}:
        raise ValueError("The original bridge returned an unsupported outcome.")
    workflow = value.get("workflow")
    if workflow:
        native_id = workflow["id"].lower()
        if step.get("workflow_id") and step["workflow_id"] != native_id:
            raise ValueError("The received workflow would replace this original step's native UUID.")
        if native_id in step.get("prior_workflow_ids", []):
            raise ValueError("The received workflow predates this original native command.")
        if workflow.get("type") is not None and workflow["type"] != step["native_workflow_type"]:
            raise ValueError("The received workflow type differs from this selected original step.")
        if not inspection and value.get("dispatched") is not True:
            raise ValueError("A native mutation workflow requires its original dispatch record.")
        step.update(workflow_id=native_id, workflow=workflow,
                    association_origin=step.get("association_origin") or "original_native_bridge_receipt")
        s.state.update(mutation_started=True, pending_step=label, pending_command=None)
        if workflow["status"] == "succeeded":
            step.update(phase="complete", completion="original_provider_workflow",
                        completed_at=value.get("completed_at") or _api()._now())
            s.state.update(phase="prepared", pending_step=None, native_poll=None)
            s.save_state()
            return
        if workflow["status"] == "failed":
            step.update(phase="provider_failed", completion="original_provider_workflow")
            s.state.update(phase="failed", native_poll=None)
            s.save_state()
            raise ValueError("The original Pantheon workflow failed: " + native_id)
        step["phase"] = "accepted"
        s.state.update(phase="accepted",
            native_poll={"provider": "pantheon", "kind": "workflow", "id": native_id, "step": label})
        s.save_state()
        raise _api().NativeWaiting("The original Pantheon workflow remains running: " + native_id)
    if (value["state"] == "completed" and step["bridge_request"]["action"] == "pantheon-deploy-code"
            and (value.get("data") or {}).get("no_change") is True and not value.get("dispatched")):
        step.update(phase="complete", completion="original_provider_no_change",
                    completed_at=value.get("completed_at") or _api()._now())
        s.state.update(phase="prepared", pending_step=None, pending_command=None, native_poll=None)
        s.save_state()
        return
    message = (value.get("error") or {}).get("message") or "Inspect the retained original native receipt."
    if value["state"] in {"failed", "rejected"}:
        if value.get("command_rejection"):
            step["pre_dispatch_rejection"] = value["command_rejection"]
        step["phase"] = "pre_dispatch_rejected" if value.get("dispatched") is False else "provider_failed"
        step["last_bridge_outcome"] = value["state"]
        s.state.update(phase="failed", native_poll=None, pending_step=label, pending_command=None)
        s.save_state()
        raise ValueError(message)
    step["phase"] = "unknown_outcome"
    s.state.update(phase="reconcile_required", native_poll=None, pending_step=label)
    s.save_state()
    if operation.get("native_workflow_id") and operation.get("native_workflow_step") == label:
        return _bridge_poll(s, operation, label)
    raise _api().NativeWaiting(message)


def _bridge_poll(s, operation, label):
    step = s.state["steps"][label]
    native_id = step.get("workflow_id")
    explicit = operation.get("native_workflow_id") if operation.get("native_workflow_step") == label else None
    if explicit:
        explicit = explicit.lower()
        if not UUID.fullmatch(explicit) or (native_id and native_id != explicit):
            raise ValueError("Select the same original Pantheon workflow UUID.")
        if explicit in step.get("prior_workflow_ids", []):
            raise ValueError("The selected workflow existed before this original command.")
        native_id = explicit
    if not native_id:
        raise _api().NativeWaiting("Select the exact original workflow UUID in this operation's Resume form.")
    index = int(s.state.get("bridge_observation_index", 0)) + 1
    s.state["bridge_observation_index"] = index
    s.save_state()
    observation = label + "-workflow-" + str(index).zfill(6)
    request = {"schema": BRIDGE_SCHEMA, "operation_id": operation["id"], "step_id": observation,
               "intent_sha256": s.state["intent_sha256"], "action": "workflow-inspect",
               "site_id": s.p["site_id"], "environment_id": s.p["environment"],
               "workflow_id": native_id, "expected_workflow_type": step["native_workflow_type"],
               "timeout_seconds": s.p["timeout_seconds"]}
    value = _bridge_call(s, observation, request, False)
    if not value.get("workflow"):
        s.state.update(phase="reconcile_required", native_poll=None, pending_step=label)
        s.save_state()
        raise _api().NativeWaiting((value.get("error") or {}).get("message") or "The exact original native workflow could not be observed.")
    if not step.get("workflow_id"):
        step.update(association_origin="explicit_original_operation_resume",
                    association_reason=operation.get("native_workflow_reason"))
    return _bridge_outcome(s, operation, label, value, inspection=True)


def _write(s, operation, label, arguments):
    steps = s.state.setdefault("steps", {})
    step = steps.get(label)
    if step and step.get("transport") != BRIDGE_SCHEMA:
        return _legacy_write(s, operation, label, arguments)
    request, native_type = _bridge_instruction(s, operation, label, arguments)
    logical = _api()._digest(arguments + ["--yes"])
    if step:
        if step.get("arguments_sha256") != logical or step.get("bridge_request") != request:
            raise ValueError("The retained native step has a different reviewed bridge instruction.")
        if step.get("phase") == "complete":
            _, receipt = _bridge_paths(s, step["bridge_call"])
            _retain_bridge(s, receipt)
            _retain(s, step["bridge_call"])
            return
        if step.get("phase") == "provider_failed":
            raise ValueError("The original native workflow failed. Retain it with the reviewed corrective operation.")
        if step.get("workflow_id"):
            return _bridge_poll(s, operation, label)
        if step.get("phase") == "unknown_outcome":
            original = _bridge_saved(s, step["bridge_call"], request, step["bridge_request_sha256"])
            if original and original.get("command_rejection"):
                step.update(phase="pre_dispatch_rejected",
                            pre_dispatch_rejection=original["command_rejection"])
                s.save_state()
        if step.get("phase") == "pre_dispatch_rejected":
            previous = _bridge_saved(s, step["bridge_call"], request, step["bridge_request_sha256"])
            if not previous or previous.get("dispatched") is not False:
                raise ValueError("Retain the original confirmed pre-dispatch rejection before retrying this step.")
            step.setdefault("prior_bridge_calls", []).append(step["bridge_call"])
            step["bridge_attempt"] += 1
            step["bridge_call"] = label + "-bridge-" + str(step["bridge_attempt"]).zfill(6)
            step["phase"] = "prepared"
            s.save_state()
    else:
        _bridge_ready(s, label + "-bridge-runtime")
        prior = _workflows(s, label + "-workflows-before")
        step = {"phase": "prepared", "transport": BRIDGE_SCHEMA,
                "argv_sha256": _api()._digest(_prefix(s.p) + arguments + ["--yes"]),
                "arguments_sha256": logical, "bridge_request": request,
                "native_workflow_type": native_type, "bridge_attempt": 1,
                "bridge_call": label + "-bridge-000001",
                "prior_workflow_ids": [row["id"].lower() for row in prior],
                "prepared_at": _api()._now()}
        steps[label] = step
        s.state.update(pending_step=label, phase="prepared")
        s.save_state()
    _, _, request_sha256 = _bridge_request(s, step["bridge_call"], request)
    step["bridge_request_sha256"] = request_sha256
    s.save_state()
    try:
        value = _bridge_call(s, step["bridge_call"], request, True)
    except Exception:
        step["phase"] = "unknown_outcome"
        s.state.update(phase="reconcile_required", native_poll=None, pending_step=label)
        s.save_state()
        raise
    return _bridge_outcome(s, operation, label, value)


def _legacy_write(s, operation, label, arguments):
    argv = _prefix(s.p) + arguments + ["--yes"]
    steps = s.state.setdefault("steps", {})
    step = steps.get(label)
    if step:
        logical = _api()._digest(arguments + ["--yes"])
        record = _command_record(s, label)
        if step.get("arguments_sha256"):
            if step["arguments_sha256"] != logical:
                raise ValueError("The original provider step has different reviewed command arguments.")
        else:
            if record:
                if (_api()._digest(record["argv"]) != step.get("argv_sha256")
                        or _native_arguments(record["argv"]) != arguments + ["--yes"]):
                    raise ValueError("The original provider command differs from its retained step.")
            elif step.get("phase") != "prepared":
                raise ValueError("Restore the original command record before continuing this native step.")
            step["arguments_sha256"] = logical
            s.save_state()
        if step.get("phase") == "complete":
            _retain(s, label)
            return
        if step.get("phase") == "provider_failed":
            raise ValueError("The original provider workflow failed; retain it and prepare the reviewed correction.")
        record = _command_record(s, label)
        if record and record.get("phase") == "complete" and record.get("returncode") == 0:
            _retain(s, label)
            step.update(phase="complete", completion="original_cli_exit", completed_at=record.get("completed_at"))
            s.state.update(phase="prepared", pending_step=None, native_poll=None)
            s.save_state()
            return
        if record and record.get("phase") not in {"not_started"}:
            _pending_recovery(s, operation, label)
            return
        # With a prepared step and no command file, Session has not attempted
        # this step. Its durable command record always precedes process launch.
    else:
        prior = _workflows(s, label + "-workflows-before")
        step = {"phase": "prepared", "argv_sha256": _api()._digest(argv),
                "prior_workflow_ids": [row["id"] for row in prior], "prepared_at": _api()._now()}
        steps[label] = step
        s.state.update(pending_step=label, phase="prepared")
        s.save_state()
    try:
        record = _term(s, label, arguments + ["--yes"], mutating=True)
    except (_api().NativeWaiting, _api().NativeCancelled, ValueError) as exc:
        record = _command_record(s, label)
        if record and record.get("phase") != "not_started":
            step["phase"] = "unknown_outcome"
            s.state.update(phase="reconcile_required", native_poll=None, pending_step=label)
            s.save_state()
            raise _api().NativeWaiting("Continue the original " + label + " workflow; " + str(exc))
        raise
    step.update(phase="complete", completion="original_cli_exit", completed_at=record.get("completed_at"))
    s.state.update(phase="prepared", pending_step=None, native_poll=None)
    s.save_state()


def _selected(p, inventory):
    selected = []
    for element in ELEMENTS:
        filename = p.get("backup_" + element + "_file")
        if not filename:
            continue
        rows = [b for b in inventory["backups"] if b["file"] == filename and b["element"] == element]
        if len(rows) != 1:
            raise ValueError("The selected original " + element + " backup is absent from this environment's inventory.")
        selected.append(rows[0])
    if not selected:
        raise ValueError("Select at least one exact native backup filename in the reviewed profile.")
    return selected


def _download(s, rows, prefix):
    retained = []
    for row in rows:
        identity = {"provider": provider_context(s.p), "file": row["file"], "element": row["element"]}
        key = _api()._digest(identity)
        base_label = prefix + "-" + row["element"] + "-" + key[:16]
        known = s.state.setdefault("downloads", {}).get(base_label)
        if known:
            actual = _api()._file(s.private_path(known["path"]), "backup")
            if (actual["sha256"], actual["size"]) != (known["sha256"], known["size"]):
                raise ValueError("The retained original backup bytes changed.")
        else:
            attempt = int(s.state.setdefault("download_attempts", {}).get(base_label, 1))
            label = base_label if attempt == 1 else base_label + "-attempt-" + str(attempt).zfill(6)
            record = _command_record(s, label)
            if record and ((record.get("phase") == "complete" and record.get("returncode") != 0)
                    or (record.get("phase") == "interrupted" and record.get("owned_process_reaped") is True)):
                _retain(s, label)
                attempt += 1
                label = base_label + "-attempt-" + str(attempt).zfill(6)
                record = None
            s.state["download_attempts"][base_label] = attempt
            s.save_state()
            destination = s.out / (label + ".backup")
            if not (record and record.get("phase") == "complete" and record.get("returncode") == 0):
                try:
                    _term(s, label, ["backup:get", s.p["environment_id"], "--file=" + row["file"],
                        "--element=" + row["element"], "--to", str(destination)])
                except BaseException:
                    saved = _command_record(s, label) or {}
                    settled = saved.get("phase") == "complete" or (
                        saved.get("phase") == "interrupted" and saved.get("owned_process_reaped") is True)
                    if settled and destination.is_file() and destination.stat().st_size <= s.p["max_artifact_bytes"]:
                        _add_once(s, destination, "incomplete_backup_download",
                            provider_context={**provider_context(s.p), "backup_file": row["file"],
                                              "backup_element": row["element"]}, native_backup=row)
                    raise
            else:
                _retain(s, label)
            if not destination.is_file() or not 0 < destination.stat().st_size <= s.p["max_artifact_bytes"]:
                raise ValueError("The original selected backup did not produce a nonempty file within the artifact limit.")
            actual = _api()._file(destination, "backup")
            s.state["downloads"][base_label] = actual
            s.save_state()
        retained.append(_add_once(s, actual["path"], "backup", format="pantheon-" + row["element"],
            provider_context={**provider_context(s.p), "backup_file": row["file"], "backup_element": row["element"]},
            native_backup=row, download_label=base_label))
    return retained


def _create_backup(s, operation, label):
    saved = s.state.get("backup_sets", {}).get(label)
    if saved:
        return _download(s, saved, label + "-download")
    before = _backup_inventory(s, label + "-before")
    _write(s, operation, label, ["backup:create", s.p["environment_id"],
        "--element=all", "--keep-for=" + str(s.p["backup_keep_days"])])
    after = _backup_inventory(s, label + "-after", fresh=True)
    previous = {row["file"] for row in before}
    added = [row for row in after if row["file"] not in previous]
    selection = (operation.get("native_backup_selections") or {}).get(label)
    if selection:
        chosen = []
        for element in ELEMENTS:
            matches = [row for row in added if row["element"] == element and row["file"] == selection.get(element)]
            if len(matches) != 1:
                raise ValueError("The selected " + element + " filename is not in this original backup's retained new component set.")
            chosen.append(matches[0])
        added = chosen
    # Concurrent provider backups remain visible. Bind the original set once;
    # an explicit same-operation selection resolves a competing backup set.
    counts = {element: len([row for row in added if row["element"] == element]) for element in ELEMENTS}
    if any(count == 0 for count in counts.values()):
        s.state.update(phase="accepted", pending_backup_set=None, backup_candidates=added,
            native_poll={"provider": "pantheon", "kind": "backup-catalog", "id": label})
        s.save_state()
        raise _api().NativeWaiting("The original backup command completed; its finished component catalog is still becoming available.")
    if any(count != 1 for count in counts.values()):
        s.state.update(phase="backup_selection_required", native_poll=None,
                       pending_backup_set=label, backup_candidates=added)
        s.save_state()
        raise _api().NativeWaiting("Select this original backup's exact code/database/files filenames in Resume; the completed backup command will be reused.")
    s.state.setdefault("backup_sets", {})[label] = added
    s.state.update(pending_backup_set=None, backup_candidates=[])
    s.save_state()
    return _download(s, added, label + "-download")


def _verify_bound_backups(source_paths, selected, p):
    artifacts = []
    for binding in source_paths.get("bindings", []):
        artifacts.extend([binding.get("backup")] if binding.get("backup") else [])
        artifacts.extend(binding.get("files") or [])
    for row in selected:
        candidates = []
        for item in artifacts:
            identity = item.get("provider_context") or item.get("provider_identity") or {}
            if (identity.get("source_kind") == "pantheon" and identity.get("site_id") == p["site_id"]
                    and identity.get("environment_id") == p["environment_id"]
                    and identity.get("backup_file") == row["file"]
                    and identity.get("backup_element") == row["element"]):
                _api()._verify_artifact(item)
                candidates.append(item)
        if not candidates:
            raise ValueError("Bind the selected original " + row["element"] + " backup to this cohort's source snapshot before restore.")


def _flags(p):
    return (["--updatedb"] if p["run_updatedb"] == "yes" else []) + (
        ["--cc"] if p["clear_cache"] == "yes" else [])


def _completed(s, completion):
    downloads = completion["backups"]
    for item in downloads:
        current = _api()._verify_artifact({**item, "path": s.private_path(item["path"])})
        _add_once(s, current["path"], item["role"], **{
            key: value for key, value in item.items() if key not in {"path", "role", "sha256", "size"}})
    for path in s.out.glob("*.command.json"):
        _retain(s, path.name[:-len(".command.json")])
    original = s.out / "pantheon-original-operation.json"
    if _api()._file(original, "configuration_export")["sha256"] != completion["original_inventory_sha256"]:
        raise ValueError("The original native inventory changed after this operation.")
    _add_once(s, original, "configuration_export", format="pantheon-native-manifest",
              provider_context=provider_context(s.p))
    _add_once(s, s.out / "pantheon-completed-operation.json", "restored_native_status",
              format="pantheon-native-manifest", provider_context=provider_context(s.p))
    observations = {"native_action": completion["action"], **_summary(s.p, completion["inventory"]),
        "retained_backups": len(downloads), "backup_sha256": [row["sha256"] for row in downloads],
        "original_steps": {key: {k: v for k, v in step.items() if k != "prior_workflow_ids"}
                           for key, step in completion.get("steps", {}).items()}}
    s.state.update(phase="completed", native_poll=None, observations=observations,
                   retained_downloads=downloads, steps=completion.get("steps", {}))
    s.save_state()
    return s.result("COMPLETE", observations)


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    p = profile(config, operation.get("runtime_bindings"))
    s = _api().Session(p, source_paths["output_dir"], checkpoint, cancelled, source_paths.get("workspace_relocations"))
    action = operation.get("native_action")
    try:
        _state(s, source_paths.get("checkpoint") or operation.get("resume_checkpoint"))
        _bind_runtime(s, config)
        if operation.get("provider_environment_id") != p["environment_id"]:
            raise ValueError("The operation names a different original Pantheon environment.")
        if action not in {a["value"] for a in actions_for(operation.get("type"))}:
            raise ValueError("Choose the Pantheon native action returned for this operation purpose.")
        expected = operation.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _api()._digest(provider_context(p)):
            raise ValueError("The reviewed target fingerprint belongs to a different native environment.")
        instruction = {"action": action, "operation_id": operation.get("id"), "target": provider_context(p),
            "snapshot_id": source_paths.get("snapshot_id"), "snapshot_sha256": source_paths.get("snapshot_sha256"),
            "profile": {key: value for key, value in config.items()
                        if key != "target_fingerprint" and key not in RUNTIME_FIELDS}}
        legacy = {**instruction, "profile": {key: value for key, value in config.items()
                                            if key != "target_fingerprint"}}
        _intent(s, instruction, legacy)
        completed_path = s.out / "pantheon-completed-operation.json"
        if completed_path.exists():
            completed = s.read_private_json(completed_path)
            if completed.get("intent_sha256") != s.state["intent_sha256"]:
                raise ValueError("The retained completion belongs to a different original operation.")
            return _completed(s, completed)
        if s.state.get("phase") == "completed":
            raise ValueError("Restore the original native completion manifest from retained custody.")
        original = _inventory(s, "original-operation")
        inventory_artifact = _manifest(s, "pantheon-original-operation.json",
            {"schema": VERSION, "provider_context": provider_context(p), "scope": SCOPE, "inventory": original})
        if action == "pantheon-backup-download":
            downloads = _download(s, _selected(p, original), "selected")
        elif action == "pantheon-backup-create":
            downloads = _create_backup(s, operation, "create-selected-backup")
        else:
            if str(original["site"].get("frozen")).lower() in {"true", "1"}:
                raise ValueError("The selected native site is frozen.")
            selected_env = original["selected_environment"]
            if str(selected_env.get("initialized")).lower() not in {"true", "1"}:
                raise ValueError("Use an initialized target for reviewed native deploy, content sync or restore.")
            selected = _selected(p, original) if action == "pantheon-restore" else []
            if selected:
                _verify_bound_backups(s.resolve_private(source_paths), selected, p)
                if any(row["element"] == "code" for row in selected) and p["environment"] not in {"test", "live"}:
                    if str(selected_env.get("connection_mode")).lower() != "git":
                        raise ValueError("Original Dev/Multidev code backup restoration requires native Git mode.")
            if action == "pantheon-deploy":
                source_env = {"test": "dev", "live": "test"}.get(p["environment"])
                if not source_env or not p.get("expected_source_code_sha256"):
                    raise ValueError("Code promotion requires Test or Live and its reviewed source code-log SHA-256.")
                if "promote-code" not in s.state.get("steps", {}):
                    current = _code(s, "reviewed-promotion-source", source_env, fresh=True)
                    if _api()._digest(current) != p["expected_source_code_sha256"]:
                        raise ValueError("The native promotion source changed since review. Refresh the reviewed source before this write.")
            if action.startswith("pantheon-sync-"):
                source_env = p.get("content_source_environment")
                source = [row for row in original["environments"] if row["id"] == source_env]
                if not source or str(source[0].get("initialized")).lower() not in {"true", "1"}:
                    raise ValueError("Choose an initialized same-site content source in the reviewed native profile.")
            # Every target-changing journey retains its own complete recoverable
            # pre-change backup before its first target-changing provider step.
            downloads = _create_backup(s, operation, "pre-change-backup")
            if action == "pantheon-deploy":
                # Refresh immediately after backup as well: backup duration must
                # not silently broaden which reviewed source code is promoted.
                if "promote-code" not in s.state.get("steps", {}):
                    current = _code(s, "dispatch-promotion-source", source_env, fresh=True)
                    if _api()._digest(current) != p["expected_source_code_sha256"]:
                        raise ValueError("The reviewed promotion source changed while the pre-change backup was prepared.")
                _write(s, operation, "promote-code", ["env:deploy", p["environment_id"],
                    "--note=" + (p.get("deploy_note") or "GovHub " + str(operation.get("id")))] + _flags(p))
            elif action.startswith("pantheon-sync-"):
                origin = p["site_id"] + "." + source_env
                if action in {"pantheon-sync-content", "pantheon-sync-files"}:
                    _write(s, operation, "sync-files", ["env:clone-content", origin, p["environment"], "--files-only"])
                if action in {"pantheon-sync-content", "pantheon-sync-database"}:
                    flags = _flags(p)
                    if p.get("wordpress_from_url"):
                        flags += ["--from-url=" + p["wordpress_from_url"], "--to-url=" + p["wordpress_to_url"]]
                    _write(s, operation, "sync-database", ["env:clone-content", origin, p["environment"], "--db-only"] + flags)
            elif action == "pantheon-restore":
                for row in selected:
                    # Terminus rejects --file together with a non-all --element.
                    # The exact selected filename already determines one component.
                    _write(s, operation, "restore-" + row["element"], [
                        "backup:restore", p["environment_id"], "--file=" + row["file"]])
        after = _inventory(s, "completed-operation", fresh=True)
        completion = {"schema": VERSION, "provider_context": provider_context(p), "action": action,
            "intent_sha256": s.state["intent_sha256"],
            "operation_id": operation.get("id"), "original_inventory_sha256": inventory_artifact["sha256"],
            "inventory": after, "steps": s.state.get("steps", {}), "backups": downloads}
        _manifest(s, "pantheon-completed-operation.json", completion, role="restored_native_status")
        return _completed(s, completion)
    except _api().NativeCancelled as exc:
        return s.result("WAITING_NATIVE" if s.state.get("mutation_started") else "CANCELLED", message=str(exc))
    except _api().NativeWaiting as exc:
        return s.result("WAITING_NATIVE", message=str(exc))
    except Exception as exc:
        if s.state.get("mutation_started") and s.state.get("phase") != "failed":
            s.state.update(phase="reconcile_required", native_poll=None)
            s.save_state()
            return s.result("WAITING_NATIVE", message=str(exc))
        return s.result("FAILED", message=str(exc))
