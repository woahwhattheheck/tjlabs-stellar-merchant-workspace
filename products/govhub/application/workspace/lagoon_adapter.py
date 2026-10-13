"""Lagoon native project, backup and active/standby operations for GovHub.

The selected original Lagoon CLI owns authentication and provider execution.
CLI raw output is decoded GraphQL data, not an HTTP response envelope.
Provider contract: uselagoon/lagoon 7ffbadcf159988952a9c7dddde3329935bd279ec.
CLI contract: uselagoon/lagoon-cli 38a7b36e6b1f13cabcc01a5009ddd01f51f2ca29.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit, urlunsplit

VERSION = "govhub-lagoon/v1"
ROUTE_FIELDS = "id domain service source type primary environment { id name }"
PROJECT_FIELDS = ("id name gitUrl productionEnvironment standbyProductionEnvironment productionRoutes standbyRoutes "
                  "apiRoutes { " + ROUTE_FIELDS + " }")
TASK_FIELDS = "id name taskName status created started completed service remoteId environment { id name }"
BACKUP_FIELDS = "id backupId source created deleted"
ENVIRONMENT_FIELDS = """id name environmentType deployType deployBaseRef deployHeadRef
route routes created updated deleted
services { id name type replicas abandoned }
volumes { id name storageType type kibRequested kibUsed created updated abandoned }"""
SUCCEEDED = {"COMPLETE", "SUCCEEDED", "SUCCESSFUL"}
FAILED = {"FAILED", "ERROR", "CANCELLED"}
SCOPE = {
    "project": "one explicitly selected native project",
    "environments": "all authorized current environments; includeDeleted:false",
    "backups": "all authorized backups returned by the native resolver; no limit; original deleted values retained",
    "backup_filter": "includeDeleted:false is sent, but this pinned native resolver does not apply that argument",
    "tasks": "all tasks visible to the selected native account; no limit",
    "pagination": "native arrays have no cursor; omitted limits retain the full permitted arrays",
    "transport": "original Lagoon CLI decoded GraphQL data plus exact command/stdout/stderr/exit",
}


def provider_schema():
    def f(name, label, required=False, **extra):
        return {"name": name, "label": label, "type": "text", "required": required, **extra}
    return {"value": "lagoon", "label": "Lagoon native CLI", "fields": [
        f("environment_id", "Exact Lagoon environment ID", True,
          help="The native integer ID, retained as text in the operating environment record."),
        f("project_name", "Exact Lagoon project name", True),
        f("lagoon_path", "Existing Lagoon executable", True,
          placeholder="/usr/local/bin/lagoon"),
        f("lagoon_instance", "Existing configured Lagoon instance", True,
          help="The explicit native --lagoon selection; authentication stays on its host."),
        f("lagoon_config_file", "Existing native configuration file",
          help="Optional absolute YAML path. The operator uses it without reading its credential values."),
        f("site_root", "Native CLI working directory", True,
          help="An existing absolute directory on the configured native host."),
        f("expected_production_routes", "Reviewed production route URLs", type="textarea", max_length=64000,
          help="Complete comma- or newline-separated HTTP(S) route URLs for an active/standby switch."),
        f("expected_standby_routes", "Reviewed standby route URLs", type="textarea", max_length=64000,
          help="Complete comma- or newline-separated standby route URLs, retained separately from their native order."),
        f("lagoon_backup_id", "Selected original backupId",
          help="The opaque backupId from the native inventory, distinct from its integer row ID."),
        {"name": "timeout_seconds", "label": "Native command timeout (seconds)",
         "type": "integer", "default": 120, "minimum": 10, "maximum": 7200},
        {"name": "max_artifact_bytes", "label": "Maximum individual artifact bytes",
         "type": "integer", "default": 1073741824, "minimum": 1048576},
    ]}


def profile(config):
    allowed = {"source_kind", "target_fingerprint", *(f["name"] for f in provider_schema()["fields"])}
    unknown = set(config) - allowed
    if unknown:
        raise ValueError("Unsupported Lagoon profile fields: " + ", ".join(sorted(unknown)))
    p = dict(config)
    if p.get("source_kind") != "lagoon":
        raise ValueError("Select the Lagoon native profile.")
    if not isinstance(p.get("environment_id"), str) or not re.fullmatch(r"[1-9][0-9]*", p["environment_id"]):
        raise ValueError("Retain the exact positive Lagoon environment ID as text.")
    for key in ("project_name", "lagoon_instance"):
        if not isinstance(p.get(key), str) or not p[key].strip() or "\x00" in p[key]:
            raise ValueError("Set the exact native " + key + ".")
    for key, directory in (("lagoon_path", False), ("site_root", True)):
        path = Path(str(p.get(key, ""))).expanduser()
        if not path.is_absolute() or not (path.is_dir() if directory else path.is_file()):
            raise ValueError("Select the existing absolute native " + key + ".")
        if not directory and not os.access(path, os.X_OK):
            raise ValueError("The configured Lagoon executable is not executable.")
        p[key] = str(path.resolve())
    if p.get("lagoon_config_file"):
        path = Path(p["lagoon_config_file"]).expanduser()
        if not path.is_absolute() or not path.is_file():
            raise ValueError("Select the existing absolute native YAML configuration path.")
        p["lagoon_config_file"] = str(path.resolve())
    p["timeout_seconds"] = int(p.get("timeout_seconds") or 120)
    p["max_artifact_bytes"] = int(p.get("max_artifact_bytes") or 1073741824)
    if not 10 <= p["timeout_seconds"] <= 7200 or p["max_artifact_bytes"] < 1048576:
        raise ValueError("Native timeout or artifact limit is out of range.")
    backup = p.get("lagoon_backup_id")
    if backup is not None and (not isinstance(backup, str) or "\x00" in backup):
        raise ValueError("The native backupId must retain its original string value.")
    for name in ("expected_production_routes", "expected_standby_routes"):
        if p.get(name):
            _route_members(p[name])
    return p


def provider_context(p):
    return {"source_kind": "lagoon", "lagoon_instance": p["lagoon_instance"],
            "project_name": p["project_name"], "environment_id": p["environment_id"],
            **({"project_id": p["native_project_id"]} if p.get("native_project_id") else {}),
            **({"environment_name": p["native_environment_name"]} if p.get("native_environment_name") else {})}


def actions_for(operation_type):
    if operation_type == "CAPTURE":
        return [{"value": "lagoon-capture", "label": "Capture complete native project and environment inventory"}]
    if operation_type == "BACKUP_DOWNLOAD":
        return [{"value": "lagoon-backup-download", "label": "Prepare and download the selected native backup"}]
    if operation_type in {"REHEARSAL", "CUTOVER", "ROLLBACK"}:
        return [{"value": "lagoon-switch-active-standby",
                 "label": "Switch the reviewed project to the selected standby environment",
                 "required_profile_fields": ["expected_production_routes", "expected_standby_routes"]}]
    return []


def pollable(resume):
    value = resume.get("native_poll") or {}
    return (resume.get("phase") == "accepted" and value.get("provider") == "lagoon"
            and value.get("kind") in {"task", "backup"} and bool(value.get("id")))


def _api():
    import native_adapter
    return native_adapter


def _q(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), allow_nan=False)


def _make_safe(value):
    """The native makeSafe helper operates on lowercased JavaScript UTF-16 units."""
    if not isinstance(value, str):
        raise ValueError("The native environment must retain its original name.")
    encoded = value.lower().encode("utf-16-le", errors="surrogatepass")
    units = [int.from_bytes(encoded[i:i + 2], "little") for i in range(0, len(encoded), 2)]
    return "".join(chr(unit) if 48 <= unit <= 57 or 97 <= unit <= 122 or unit == 45 else "-" for unit in units)


def _environment_for(project, selector):
    matches = [environment for environment in project["environments"]
               if selector in {environment.get("name"), _make_safe(environment.get("name"))}]
    if len(matches) != 1:
        raise ValueError("The native active/standby selector does not identify one unique current environment.")
    return matches[0]


def _route_members(value):
    if not isinstance(value, str):
        raise ValueError("Retain the reviewed route URLs as text.")
    if value.strip() == "[]":
        return []
    result = []
    for entry in re.split(r"[\r\n,]+", value):
        entry = entry.strip()
        if not entry:
            continue
        parsed = urlsplit(entry)
        if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in {"", "/"}):
            raise ValueError("Each reviewed native route must be an HTTP(S) origin without credentials, query or fragment.")
        result.append(urlunsplit((parsed.scheme, parsed.netloc.lower(), "", "", "")))
    if len(result) != len(set(result)):
        raise ValueError("The reviewed route population repeats an origin.")
    return sorted(result)


def _api_route_bindings(project):
    result = {}
    for route in project["apiRoutes"]:
        native_id = route.get("id")
        if not isinstance(native_id, int) or isinstance(native_id, bool) or native_id in result:
            raise ValueError("The complete native API route population requires unique original integer IDs.")
        result[native_id] = {"id": native_id, "domain": route.get("domain"), "service": route.get("service"),
            "source": route.get("source"), "type": route.get("type"),
            "environment_id": (route.get("environment") or {}).get("id")}
    return result


def _prefix(p):
    result = [p["lagoon_path"], "--skip-update-check", "--lagoon", p["lagoon_instance"]]
    if p.get("lagoon_config_file"):
        result += ["--config-file", p["lagoon_config_file"]]
    return result


def _add_once(s, path, role, **extra):
    path = Path(s.private_path(str(path)))
    actual = _api()._file(path, role)
    for retained in s.artifacts:
        if retained["path"] == actual["path"] and retained["role"] == role:
            if (retained["sha256"], retained["size"]) != (actual["sha256"], actual["size"]):
                raise ValueError("An original native artifact changed during this operation.")
            return retained
    return s.add(path, role, **extra)


def _retain_command(s, label, record=None):
    path = s.out / (label + ".command.json")
    if path.is_file():
        record = s.read_private_json(path)
        _add_once(s, path, "native_command", format="lagoon-cli")
    if not record:
        return
    phase = record.get("phase")
    settled = phase in {"complete", "not_started"} or (
        phase == "interrupted" and record.get("owned_process_reaped") is True)
    if not settled:
        return
    for key in ("stdout", "stderr"):
        saved = record.get(key)
        if not saved:
            continue
        actual = _api()._file(s.private_path(saved["path"]), key)
        if (actual["sha256"], actual["size"]) != (saved["sha256"], saved["size"]):
            raise ValueError("The retained original native command output changed.")
        role = ("provider_cli_data" if phase == "complete" and record.get("returncode") == 0
                else "provider_cli_output") if key == "stdout" else "native_stderr"
        _add_once(s, actual["path"], role, format="lagoon-cli",
                  provider_context=provider_context(s.p), native_phase=phase,
                  native_returncode=record.get("returncode"))


def _raw(s, label, document, mutating=False):
    try:
        record = s.command(label, _prefix(s.p) + ["raw", "--raw", document], mutating=mutating)
    except BaseException as error:
        try:
            _retain_command(s, label)
        except Exception as retention_error:
            s.event({"kind": "native_artifact_retention_error", "label": label,
                     "message": str(retention_error)})
            if hasattr(error, "add_note"):
                error.add_note("Original artifact registration: " + str(retention_error))
        raise
    _retain_command(s, label, record)
    path = Path(record["stdout"]["path"])
    if path.stat().st_size > min(s.p["max_artifact_bytes"], 32 * 1024 * 1024):
        raise ValueError("The native GraphQL data exceeds the metadata intake size.")
    data = json.loads(path.read_bytes())
    if not isinstance(data, dict):
        raise ValueError("The original Lagoon CLI must return a decoded GraphQL data object.")
    return data, record


def _fresh(s, purpose, document):
    index = int(s.state.get("observation_index", 0)) + 1
    s.state["observation_index"] = index
    s.save_state()
    return _raw(s, purpose + "-" + str(index).zfill(6), document)


def inventory_query(p):
    return ("query { lagoonVersion projectByName(name:" + _q(p["project_name"]) + ") { "
            + PROJECT_FIELDS + " environments(includeDeleted:false) { "
            + ENVIRONMENT_FIELDS + " backups(includeDeleted:false) { " + BACKUP_FIELDS
            + " } tasks { " + TASK_FIELDS + " } } } }")


def _inventory(s, label, fresh=False):
    data, record = (_fresh(s, label, inventory_query(s.p)) if fresh
                    else _raw(s, label, inventory_query(s.p)))
    project = data.get("projectByName")
    if not isinstance(project, dict) or project.get("name") != s.p["project_name"]:
        raise ValueError("The native project differs from the selected original project.")
    if not isinstance(project.get("id"), int) or isinstance(project["id"], bool):
        raise ValueError("The native project did not return its integer identity.")
    if not isinstance(project.get("apiRoutes"), list):
        raise ValueError("The native project did not return its complete permitted API route array.")
    environments = project.get("environments")
    if not isinstance(environments, list):
        raise ValueError("The native project did not return its complete permitted environment array.")
    ids = []
    for environment in environments:
        if not isinstance(environment, dict) or not isinstance(environment.get("id"), int):
            raise ValueError("A native environment is missing its original identity.")
        ids.append(environment["id"])
        for key in ("services", "volumes", "backups", "tasks"):
            if not isinstance(environment.get(key), list):
                raise ValueError("The original permitted " + key + " array is unavailable.")
    if len(ids) != len(set(ids)):
        raise ValueError("The native project repeats an environment identity.")
    matches = [e for e in environments if str(e["id"]) == s.p["environment_id"]]
    if len(matches) != 1:
        raise ValueError("The selected environment is not in this project's current permitted set.")
    selected = matches[0]
    s.p.update(native_project_id=project["id"], native_environment_name=selected.get("name"))
    return {"project": project, "selected_environment": selected,
            "lagoon_version": data.get("lagoonVersion"), "record": record}


def _state(s, supplied):
    path = s.out / "native-state.json"
    value = s.read_private_json(path) if path.exists() else (supplied or {})
    value = value.get("resume_checkpoint", value.get("state", value))
    s.state = dict(s.resolve_private(value))


def _intent(s, value):
    fingerprint = _api()._digest(value)
    if s.state.get("intent_sha256") and s.state["intent_sha256"] != fingerprint:
        raise ValueError("This continuation belongs to a different native target, source or operation.")
    if not s.state.get("intent_sha256"):
        s.state.update(intent_sha256=fingerprint, intent=value, phase="prepared",
                       mutation_started=False, output_dir=str(s.out))
        s.save_state()


def _summary(inventory):
    environments = inventory["project"]["environments"]
    return {"project_id": inventory["project"]["id"],
            "selected_environment_id": inventory["selected_environment"]["id"],
            "environments": len(environments),
            "services": sum(len(e["services"]) for e in environments),
            "volumes": sum(len(e["volumes"]) for e in environments),
            "backups": sum(len(e["backups"]) for e in environments),
            "api_routes": len(inventory["project"]["apiRoutes"]),
            "tasks": sum(len(e["tasks"]) for e in environments)}


def discover_capabilities(config):
    result = {"ready": False, "configuration": {}, "current_config": {}, "actions": []}
    try:
        p = profile(config)
        result.update(configuration=p, current_config=p)
        with tempfile.TemporaryDirectory(prefix="govhub-lagoon-capabilities-") as folder:
            s = _api().Session(p, folder)
            inventory = _inventory(s, "capability-inventory")
            target = provider_context(p)
            result.update(ready=True, native_status={**_summary(inventory),
                "lagoon_version": inventory["lagoon_version"],
                "production_environment": inventory["project"].get("productionEnvironment"),
                "standby_environment": inventory["project"].get("standbyProductionEnvironment"),
                "source_scope": SCOPE}, provider_context=target,
                target_fingerprint=_api()._digest(target),
                actions=actions_for("CAPTURE") + actions_for("BACKUP_DOWNLOAD") + actions_for("CUTOVER"),
                observed_at=_api()._now())
    except Exception as exc:
        result["message"] = str(exc)
    return result


def capture(config, context, checkpoint=None, cancelled=None):
    p = profile(config)
    s = _api().Session(p, context["output_dir"], checkpoint, cancelled, context.get("workspace_relocations"))
    try:
        _state(s, context.get("checkpoint"))
        inventory = _inventory(s, "project-inventory")
        expected = context.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _api()._digest(provider_context(p)):
            raise ValueError("The captured native target differs from its reviewed fingerprint.")
        _intent(s, {"action": "lagoon-capture", "target": provider_context(p),
                    "operation_id": context.get("operation_id")})
        manifest = {"schema": "lagoon-source-inventory/v1", "captured_at": _api()._now(),
                    "provider_context": provider_context(p), "scope": SCOPE,
                    "lagoon_version": inventory["lagoon_version"],
                    "project": inventory["project"], "selected_environment_id": int(p["environment_id"]),
                    "original_cli_stdout": inventory["record"]["stdout"]}
        path = s.out / "lagoon-source-inventory.json"
        if path.exists():
            prior = s.read_private_json(path)
            if prior.get("original_cli_stdout", {}).get("sha256") != inventory["record"]["stdout"]["sha256"]:
                raise ValueError("The original native inventory changed.")
        else:
            _api()._atomic(path, manifest)
        s.add(path, "configuration_export", format="lagoon-source-inventory",
              provider_context=provider_context(p))
        observations = {"native_action": "lagoon-capture", **_summary(inventory), "scope": SCOPE}
        s.state.update(phase="completed", observations=observations)
        s.save_state()
        return s.result("COMPLETE", observations)
    except _api().NativeCancelled as exc:
        return s.result("CANCELLED", message=str(exc))
    except _api().NativeWaiting as exc:
        return s.result("WAITING_NATIVE", message=str(exc))
    except Exception as exc:
        return s.result("FAILED", message=str(exc))


def _backup_status(s, backup_id):
    query = ("query { environmentById(id:" + str(int(s.p["environment_id"])) + ") { id project { id } "
             "backups(includeDeleted:false) { " + BACKUP_FIELDS
             + " restore { id backupId status created restoreSize } } } }")
    data, _ = _fresh(s, "backup-status", query)
    environment = data.get("environmentById") or {}
    if environment.get("id") != int(s.p["environment_id"]) or (environment.get("project") or {}).get("id") != s.p["native_project_id"]:
        raise ValueError("Backup observation returned a different project or environment.")
    backups = environment.get("backups")
    if not isinstance(backups, list):
        raise ValueError("The native backup observation is incomplete.")
    matches = [b for b in backups if b.get("backupId") == backup_id]
    if len(matches) != 1:
        raise _api().NativeWaiting("The original selected backup is absent from the current native observation.")
    restore = matches[0].get("restore")
    if restore is not None and (not isinstance(restore, dict) or restore.get("backupId") != backup_id):
        raise ValueError("The native restore record belongs to a different original backup.")
    return matches[0], restore


def _completed_download(s):
    """Recover retained bytes before consulting a locator that may have expired."""
    retained = s.state.get("download")
    request_identity = s.state.get("download_request")
    if not retained and request_identity:
        record_path = s.out / (request_identity["label"] + ".request.json")
        if record_path.is_file():
            result = s.read_private_json(record_path)
            if result.get("method") != "GET" or result.get("requested_url_sha256") != request_identity["url_sha256"]:
                raise ValueError("The original download record belongs to a different native request.")
            if result.get("status") == 200:
                retained = result["response"]
    if not retained:
        return None
    if not request_identity or request_identity.get("backup_id") != s.p.get("lagoon_backup_id"):
        raise ValueError("The retained backup has no matching original download intent.")
    if request_identity.get("restore_id") != s.state.get("restore_id"):
        raise ValueError("The retained backup belongs to a different native restore row.")
    actual = _api()._file(s.private_path(retained["path"]), "backup")
    if (actual["sha256"], actual["size"]) != (retained["sha256"], retained["size"]) or not actual["size"]:
        raise ValueError("The completed original backup bytes changed or are empty.")
    declared = request_identity["restore"].get("restoreSize")
    if isinstance(declared, (int, float)) and not isinstance(declared, bool) and declared > 0 and actual["size"] != declared:
        raise ValueError("The downloaded native backup size differs from the provider's byte count.")
    s.state["download"] = actual
    return actual


def _finish_download(s, downloaded):
    request_identity = s.state["download_request"]
    backup_id = request_identity["backup_id"]
    request_path = s.out / (request_identity["label"] + ".request.json")
    request_record = s.read_private_json(request_path)
    if (request_record.get("method") != "GET" or request_record.get("status") != 200
            or request_record.get("requested_url_sha256") != request_identity["url_sha256"]
            or ((request_record.get("response") or {}).get("sha256"),
                (request_record.get("response") or {}).get("size")) != (downloaded["sha256"], downloaded["size"])):
        raise ValueError("The completed backup has no matching original download request record.")
    _add_once(s, request_path, "native_download_request", format="lagoon-backup-download")
    locator = request_identity["locator_cli_stdout"]
    locator_path = Path(s.private_path(locator["path"]))
    actual_locator = _api()._file(locator_path, "provider_cli_data")
    if (actual_locator["sha256"], actual_locator["size"]) != (locator["sha256"], locator["size"]):
        raise ValueError("The original backup locator command output changed.")
    if locator_path.parent != s.out or locator_path.suffix != ".stdout":
        raise ValueError("The retained locator must belong to this original native operation.")
    _retain_command(s, locator_path.name[:-len(".stdout")])
    _add_once(s, locator_path, "provider_cli_data", format="lagoon-cli",
              provider_context=provider_context(s.p))
    _add_once(s, downloaded["path"], "backup", format="lagoon-backup-download",
          backup_id=backup_id, restore_id=s.state["restore_id"], provider_context=provider_context(s.p))
    manifest = {"schema": "lagoon-backup-download/v1", "provider_context": provider_context(s.p),
                "backup": s.state["backup_identity"], "restore": request_identity["restore"],
                "download": downloaded, "locator_cli_stdout": request_identity["locator_cli_stdout"],
                "meaning": "Original backup downloaded for receiving; application restoration is a separate native operation."}
    path = s.out / "lagoon-backup-download.json"
    if path.exists():
        previous = s.read_private_json(path)
        if previous.get("download", {}).get("sha256") != downloaded["sha256"]:
            raise ValueError("The original backup manifest names different retained bytes.")
    else:
        _api()._atomic(path, manifest)
    _add_once(s, path, "backup_manifest", format="lagoon-backup-download", provider_context=provider_context(s.p))
    observations = {"native_action": "lagoon-backup-download", "backup_id": backup_id,
                    "restore_id": s.state["restore_id"], "downloaded_sha256": downloaded["sha256"],
                    "downloaded_bytes": downloaded["size"], "application_restore_performed": False}
    s.state.update(phase="completed", native_poll=None, observations=observations)
    s.save_state()
    return s.result("COMPLETE", observations)


def _download_backup(s, inventory):
    backup_id = s.p.get("lagoon_backup_id")
    if not backup_id:
        raise ValueError("Select the original opaque backupId in this native profile.")
    original = [b for b in inventory["selected_environment"]["backups"] if b.get("backupId") == backup_id]
    if len(original) != 1:
        raise ValueError("The selected backupId is not in the original environment inventory.")
    s.state.setdefault("backup_identity", {**original[0], "environment_id": s.p["environment_id"]})
    downloaded = _completed_download(s)
    if downloaded:
        return _finish_download(s, downloaded)
    backup, restore = _backup_status(s, backup_id)
    known = s.state.get("restore_id")
    if known and (not restore or restore.get("id") != known):
        s.state.update(phase="reconcile_required", native_poll=None)
        s.save_state()
        raise _api().NativeWaiting("The original restore record is absent or changed. Reconcile that native record; the retained addRestore is not repeated.")
    if not known and restore:
        if not isinstance(restore.get("id"), int) or isinstance(restore["id"], bool):
            raise ValueError("The existing native restore has no valid integer ID.")
        s.state.update(restore_id=restore["id"], restore_origin="existing_native_record")
        known = restore["id"]
        s.save_state()
    if not known:
        mutation = "mutation { addRestore(input:{backupId:" + _q(backup_id) + "}) { id backupId status created } }"
        try:
            data, _ = _raw(s, "prepare-selected-backup", mutation, mutating=True)
            restore = data.get("addRestore")
            if (not isinstance(restore, dict) or not isinstance(restore.get("id"), int)
                    or isinstance(restore["id"], bool) or restore["id"] < 1 or restore.get("backupId") != backup_id):
                raise _api().NativeWaiting("The original backup preparation returned no usable restore identity.")
            s.state.update(restore_id=restore["id"], restore_origin="original_addRestore")
        except (_api().NativeWaiting, ValueError):
            # The provider may have inserted its row before a queue or response error.
            s.state.update(phase="reconcile_required", native_poll=None)
            s.save_state()
            raise _api().NativeWaiting("Reconcile the retained original backup preparation and its native restore row before continuing.")
    s.state["last_restore"] = restore
    status = str((restore or {}).get("status") or "")
    s.state.update(phase="accepted", native_poll={"provider": "lagoon", "kind": "backup", "id": s.state["restore_id"]})
    s.save_state()
    if status.upper() in FAILED:
        s.state.update(phase="failed", native_poll=None)
        s.save_state()
        return s.result("FAILED", {"native_action": "lagoon-backup-download", "restore": restore},
                        "The original native backup preparation returned " + status + ".")
    if status.upper() not in SUCCEEDED:
        return s.result("WAITING_NATIVE", {"native_action": "lagoon-backup-download", "restore": restore},
                        "The original backup preparation remains " + (status or "unreported") + ".")
    query = "query { getBackupDownloadLinkByBackupId(backupId:" + _q(backup_id) + ") }"
    data, locator = _fresh(s, "backup-download-location", query)
    location = data.get("getBackupDownloadLinkByBackupId")
    if not isinstance(location, str) or not location:
        raise _api().NativeWaiting("The original restore has no currently available native download location.")
    attempt = int(s.state.get("download_attempt", 0)) + 1
    label = "selected-backup" if attempt == 1 else "selected-backup-" + str(attempt).zfill(6)
    s.state.update(download_attempt=attempt, download_request={
        "label": label, "url_sha256": hashlib.sha256(location.encode()).hexdigest(),
        "backup_id": backup_id, "restore_id": s.state["restore_id"], "restore": restore,
        "locator_cli_stdout": locator["stdout"]})
    s.save_state()
    result = _api()._http(s, label, location, accept="application/octet-stream", acquia_auth=False)
    if result["status"] != 200:
        _add_once(s, s.out / (label + ".request.json"), "native_download_request", format="lagoon-backup-download")
        _add_once(s, result["response"]["path"], "provider_download_response")
        raise _api().NativeWaiting("The original backup download returned HTTP " + str(result["status"]) + ".")
    downloaded = _completed_download(s)
    if not downloaded:
        raise ValueError("The native download has no complete original response record.")
    return _finish_download(s, downloaded)


def _switch_source(project, selected, p):
    active = _environment_for(project, project.get("productionEnvironment"))
    standby = _environment_for(project, project.get("standbyProductionEnvironment"))
    if active["id"] == standby["id"] or selected["id"] != standby["id"]:
        raise ValueError("The selected target must be this project's distinct current standby environment.")
    services = lambda environment: sorted(item["name"] for item in environment["services"] if not item.get("abandoned"))
    if services(active) != services(standby):
        raise ValueError("The active and standby environments must have the same actual service names.")
    expected = {}
    for role in ("production", "standby"):
        value = p.get("expected_" + role + "_routes")
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Retain the complete reviewed " + role + " route URLs in the profile; use [] for an intentionally empty set.")
        expected[role] = _route_members(value)
    return {"project_id": project["id"],
            "active_selector": project.get("productionEnvironment"), "standby_selector": project.get("standbyProductionEnvironment"),
            "active_environment_id": active["id"], "standby_environment_id": standby["id"],
            "active_name": active["name"], "standby_name": standby["name"],
            "production_routes": project.get("productionRoutes"), "standby_routes": project.get("standbyRoutes"),
            "expected_routes": expected, "services": services(active),
            "api_routes": list(_api_route_bindings(project).values()),
            "task_ids": [task["id"] for task in standby["tasks"] if isinstance(task.get("id"), int)]}


def _route_readback(project, before):
    production = _route_members(project.get("productionRoutes") or "")
    standby = _route_members(project.get("standbyRoutes") or "")
    routes = _api_route_bindings(project)
    expected = {}
    for original in before["api_routes"]:
        route = dict(original)
        if route["environment_id"] is not None and route["type"] in {"ACTIVE", "STANDBY"}:
            route["environment_id"] = before["standby_environment_id"] if route["type"] == "ACTIVE" else before["active_environment_id"]
        expected[route["id"]] = route
    findings = []
    for native_id in sorted(set(routes) | set(expected)):
        if routes.get(native_id) != expected.get(native_id):
            findings.append({"route_id": native_id, "expected": expected.get(native_id), "observed": routes.get(native_id)})
    return {"production_urls": production, "standby_urls": standby,
            "production_matches": production == before["expected_routes"]["production"],
            "standby_matches": standby == before["expected_routes"]["standby"],
            "api_route_count": len(routes), "api_route_findings": findings}


def _selectors_match(project, active_id, standby_id):
    return (_environment_for(project, project.get("productionEnvironment"))["id"] == active_id
            and _environment_for(project, project.get("standbyProductionEnvironment"))["id"] == standby_id)


def _normalize_selectors(s, project, active_id, standby_id, label, task_id=None):
    """Keep equivalent selectors usable by the native next-switch resolver.

    The native completion handler can write original names containing slashes;
    the next native switch resolves selectors using makeSafe(name).
    """
    active = next(environment for environment in project["environments"] if environment["id"] == active_id)
    standby = next(environment for environment in project["environments"] if environment["id"] == standby_id)
    desired = {"productionEnvironment": _make_safe(active["name"]),
               "standbyProductionEnvironment": _make_safe(standby["name"])}
    if not _selectors_match(project, active_id, standby_id):
        raise _api().NativeWaiting("Reconcile this original project's actual active/standby identities before selector continuation.")
    key = label + "_intent"
    intent = s.state.get(key)
    if all(project.get(name) == value for name, value in desired.items()):
        return project, {"required": bool(intent), "native_values_match": True,
                         "patch": desired, "original_task_id": task_id,
                         "reconciled_from_native_readback": bool(intent)}
    if not intent:
        intent = {"project_id": project["id"], "original_task_id": task_id,
                  "active_environment_id": active_id, "standby_environment_id": standby_id,
                  "preimage": {name: project.get(name) for name in desired}, "patch": desired}
        s.state[key] = intent
        s.save_state()
    if intent["patch"] != desired or intent["project_id"] != project["id"] or intent.get("original_task_id") != task_id:
        raise ValueError("The original equivalent-selector correction belongs to a different native switch.")
    document = ("mutation { updateProject(input:{id:" + str(project["id"]) + ",patch:{productionEnvironment:"
                + _q(desired["productionEnvironment"]) + ",standbyProductionEnvironment:"
                + _q(desired["standbyProductionEnvironment"]) + "}}) { id name productionEnvironment standbyProductionEnvironment } }")
    cli_error = None
    try:
        data, _ = _raw(s, label, document, mutating=True)
        result = data.get("updateProject")
        if not isinstance(result, dict) or result.get("id") != project["id"]:
            cli_error = "The original correction response did not contain its expected project identity."
    except (_api().NativeWaiting, ValueError) as exc:
        # The provider can apply the SQL patch before its audit/readback fails.
        cli_error = str(exc)
    observed = _inventory(s, label + "-readback", fresh=True)["project"]
    matched = (observed["id"] == project["id"]
               and all(observed.get(name) == value for name, value in desired.items())
               and _selectors_match(observed, active_id, standby_id))
    result = {"required": True, "native_values_match": matched, "patch": desired,
              "original_task_id": task_id, "cli_error": cli_error,
              "reconciled_from_native_readback": bool(cli_error)}
    s.state[label + "_result"] = result
    s.save_state()
    if not matched:
        s.state.update(phase="reconcile_required", native_poll=None)
        s.save_state()
        raise _api().NativeWaiting("The retained original selector correction has not reached its exact native readback; continue that correction without another switch.")
    return observed, result


def authoritative_task_id(state):
    task_id = state.get("task_id")
    if not task_id:
        return None
    if state.get("task_reference_origin") != "operator_reconciled_original_task":
        return task_id
    task = state.get("last_task") or {}
    before = state.get("switch_before") or {}
    matches = (task.get("id") == task_id and task.get("name") == "Active/Standby Switch"
               and (task.get("environment") or {}).get("id") == before.get("standby_environment_id")
               and task_id not in before.get("task_ids", []))
    return task_id if matches else None


def _switch(s, operation, inventory):
    project = inventory["project"]
    before = s.state.get("switch_before")
    if not before:
        before = _switch_source(project, inventory["selected_environment"], s.p)
        s.state["switch_before"] = before
        s.save_state()
    supplied = operation.get("native_task_id")
    task_id = authoritative_task_id(s.state)
    if s.state.get("task_id") and not task_id:
        # Older source editions persisted an operator candidate before its native readback.
        legacy_id = s.state.pop("task_id")
        s.state.setdefault("task_reference_attempts", []).append({
            "task_id": legacy_id, "status": "unverified_legacy_candidate",
            "observed_at": _api()._now()})
        s.state.update(pending_task_id=legacy_id, native_poll=None)
        s.save_state()
    manual_candidate = False
    if supplied is not None:
        if not isinstance(supplied, int) or isinstance(supplied, bool) or supplied < 1:
            raise ValueError("Supply the actual original native task ID as a positive integer.")
        if task_id and supplied != task_id:
            raise ValueError("A different task cannot replace the original retained task.")
        manual_candidate = not task_id
        task_id = supplied
    if not task_id and s.state.get("pending_task_id"):
        raise _api().NativeWaiting("Correct or continue the retained unverified task candidate; this original switch is not repeated.")
    if not task_id:
        command = s.out / "switch-active-standby.command.json"
        previous = s.read_private_json(command) if command.exists() else None
        not_started = previous is None and s.state.get("pending_command") != "switch-active-standby" or previous is not None and previous.get("phase") == "not_started"
        if not_started:
            fresh = _inventory(s, "switch-dispatch-preflight", fresh=True)
            current = _switch_source(fresh["project"], fresh["selected_environment"], s.p)
            immutable = ("project_id", "active_environment_id", "standby_environment_id", "active_name",
                         "standby_name", "expected_routes", "services", "api_routes")
            if any(current[key] != before[key] for key in immutable):
                raise ValueError("The reviewed native switch target, services or route assignments changed before dispatch.")
            if any(task_id not in before["task_ids"] for task_id in current["task_ids"]):
                before["task_ids"] = sorted(set(before["task_ids"]) | set(current["task_ids"]))
                s.save_state()
            normalized, correction = _normalize_selectors(s, fresh["project"],
                before["active_environment_id"], before["standby_environment_id"], "normalize-before-switch")
            confirmed = _switch_source(normalized, next(environment for environment in normalized["environments"]
                if environment["id"] == before["standby_environment_id"]), s.p)
            if any(confirmed[key] != before[key] for key in immutable):
                raise ValueError("The native target or route assignments changed during selector normalization.")
            s.state["pre_switch_selector_result"] = correction
            s.save_state()
        # The exact mutation label is reused after every transport/worker interruption.
        document = "mutation { switchActiveStandby(input:{project:{name:" + _q(s.p["project_name"]) + "}}) { id remoteId } }"
        data, _ = _raw(s, "switch-active-standby", document, mutating=True)
        value = data.get("switchActiveStandby")
        if not isinstance(value, dict) or not isinstance(value.get("id"), int) or isinstance(value["id"], bool) or value["id"] < 1:
            s.state.update(phase="reconcile_required", native_poll=None)
            s.save_state()
            raise _api().NativeWaiting("The original switch response has no usable task ID. Supply its actual original task ID in operating continuation; do not submit another switch.")
        task_id = value["id"]
        s.state.update(task_id=task_id, task_reference_origin="original_switch_response",
                       phase="accepted", native_poll={"provider": "lagoon", "kind": "task", "id": task_id})
        s.save_state()
    attempt = None
    if manual_candidate:
        attempt = {"task_id": task_id, "status": "awaiting_native_identity",
                   "observed_at": _api()._now()}
        s.state.setdefault("task_reference_attempts", []).append(attempt)
        s.state.update(pending_task_id=task_id, native_poll=None, phase="reconcile_required")
        s.save_state()
    try:
        if task_id in before["task_ids"]:
            raise ValueError("The selected task predates this original switch operation.")
        data, _ = _fresh(s, "switch-task", "query { taskById(id:" + str(task_id) + ") { " + TASK_FIELDS + " } }")
        task = data.get("taskById")
        if not isinstance(task, dict) or task.get("id") != task_id:
            raise _api().NativeWaiting("The original native task is absent from the current provider observation.")
        if task.get("name") != "Active/Standby Switch" or (task.get("environment") or {}).get("id") != before["standby_environment_id"]:
            raise ValueError("The supplied task is not the original active/standby task on the reviewed standby environment.")
    except Exception as exc:
        if attempt is not None:
            attempt.update(status="not_verified", message=str(exc), completed_at=_api()._now())
            s.save_state()
        raise
    if attempt is not None:
        attempt.update(status="verified_original_task", completed_at=_api()._now())
        s.state["task_reference_origin"] = "operator_verified_original_task"
    s.state.update(task_id=task_id, task_identity_verified=True, pending_task_id=None,
                   last_task=task, phase="accepted",
                   native_poll={"provider": "lagoon", "kind": "task", "id": task_id})
    s.save_state()
    status = str(task.get("status") or "")
    if status.upper() in FAILED:
        s.state.update(phase="failed", native_poll=None)
        s.save_state()
        return s.result("FAILED", {"native_action": "lagoon-switch-active-standby", "task": task},
                        "The original native switch returned " + status + ".")
    if status.upper() not in SUCCEEDED:
        s.save_state()
        return s.result("WAITING_NATIVE", {"native_action": "lagoon-switch-active-standby", "task": task},
                        "The original native switch remains " + (status or "unreported") + ".")
    after = _inventory(s, "switch-readback", fresh=True)["project"]
    if after["id"] != before["project_id"]:
        raise ValueError("The native project identity changed after the original task.")
    role_matches = _selectors_match(after, before["standby_environment_id"], before["active_environment_id"])
    routes = _route_readback(after, before)
    exact = role_matches and routes["production_matches"] and routes["standby_matches"] and not routes["api_route_findings"]
    observations = {"native_action": "lagoon-switch-active-standby", "task": task, "before": before,
                    "after": {key: after.get(key) for key in ("id", "productionEnvironment", "standbyProductionEnvironment", "productionRoutes", "standbyRoutes", "apiRoutes")},
                    "project_readback_matches": exact, "route_readback": routes,
                    "deployment_tasks_executed": False, "environment_variables_rewritten": False}
    if not exact:
        s.state["observations"] = observations
        s.save_state()
        return s.result("WAITING_NATIVE", observations,
                        "The original task completed; reconcile the observed environment roles, reviewed URL membership and native API route assignments.")
    normalized, correction = _normalize_selectors(s, after, before["standby_environment_id"],
        before["active_environment_id"], "normalize-after-switch", task_id)
    routes = _route_readback(normalized, before)
    if not routes["production_matches"] or not routes["standby_matches"] or routes["api_route_findings"]:
        raise _api().NativeWaiting("The native routes changed during selector reconciliation; retain and reconcile this same completed switch.")
    observations["selector_correction"] = correction
    observations["final_project_selectors"] = {key: normalized.get(key) for key in ("productionEnvironment", "standbyProductionEnvironment")}
    s.state.update(phase="completed", native_poll=None, observations=observations)
    s.save_state()
    return s.result("COMPLETE", observations)


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    p = profile(config)
    s = _api().Session(p, source_paths["output_dir"], checkpoint, cancelled, source_paths.get("workspace_relocations"))
    action = operation.get("native_action")
    try:
        _state(s, source_paths.get("checkpoint") or operation.get("resume_checkpoint"))
        if operation.get("provider_environment_id") != p["environment_id"]:
            raise ValueError("The operation names a different native environment.")
        allowed = {item["value"] for item in actions_for(operation.get("type"))}
        if action not in allowed:
            raise ValueError("Select the documented Lagoon action for this operation purpose.")
        inventory = _inventory(s, "original-operation-inventory")
        target = provider_context(p)
        expected = operation.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _api()._digest(target):
            raise ValueError("The observed Lagoon target differs from its reviewed fingerprint.")
        _intent(s, {"action": action, "target": target, "operation_id": operation.get("id"),
                    "snapshot_id": source_paths.get("snapshot_id"),
                    "snapshot_sha256": source_paths.get("snapshot_sha256"),
                    "backup_id": p.get("lagoon_backup_id"),
                    "expected_routes": {role: p.get("expected_" + role + "_routes") for role in ("production", "standby")},
                    "original_inventory_sha256": inventory["record"]["stdout"]["sha256"]})
        if s.state.get("phase") == "completed":
            return s.result("COMPLETE", s.state.get("observations"))
        if action == "lagoon-backup-download":
            return _download_backup(s, inventory)
        return _switch(s, operation, inventory)
    except _api().NativeCancelled as exc:
        return s.result("WAITING_NATIVE" if s.state.get("mutation_started") else "CANCELLED", message=str(exc))
    except _api().NativeWaiting as exc:
        return s.result("WAITING_NATIVE", message=str(exc))
    except Exception as exc:
        if s.state.get("mutation_started"):
            s.state.update(phase="reconcile_required", native_poll=None)
            s.save_state()
            return s.result("WAITING_NATIVE", message=str(exc))
        return s.result("FAILED", message=str(exc))
