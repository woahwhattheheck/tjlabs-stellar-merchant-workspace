"""Skpr's released native CLI inside the existing GovHub operating project.

Copyright 2026 TokenJunkie Labs contributors.
Licensed under the Apache License, Version 2.0; see ../LICENSE.
Provider contracts: CLI v1.9.4 / 0014e431f5892591fb04600a2e2ca706d70a3897;
API v1.8.5 / 93f97034c4f88cb29d369f03761c12599f63b92c.
Native credentials remain with the existing Skpr account on the operating host.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import stat
import tarfile
import tempfile

VERSION = "govhub-skpr/v1"
CLI_RELEASE = "v1.9.4"
CLI_COMMIT = "0014e431f5892591fb04600a2e2ca706d70a3897"
API_COMMIT = "93f97034c4f88cb29d369f03761c12599f63b92c"
RUNTIME_FIELDS = {"skpr_path", "git_path", "env_path", "site_root"}
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,191}\Z")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
EMPTY_BACKUPS = "No backups found: See " + chr(96) + "skpr backup create" + chr(96) + " to create a backup"
EMPTY_RESTORES = "No restores found: See " + chr(96) + "skpr restore create" + chr(96) + " to create a restore"
SCOPE = {
    "provider": "Skpr", "cli_release": CLI_RELEASE, "cli_commit": CLI_COMMIT,
    "api_commit": API_COMMIT, "authentication": "Existing native Skpr account",
    "source": "Original project Git tree and .skpr configuration",
    "backup": "Native environment backup and its original database/volume snapshots",
    "operations": "Existing GovHub operations, source comparisons and handover",
}


def _api():
    import native_adapter
    return native_adapter


def provider_schema():
    def f(name, label, required=False, **extra):
        return {"name": name, "label": label, "type": "text", "required": required, **extra}
    return {"value": "skpr", "label": "Skpr / native project CLI", "fields": [
        f("environment_id", "Cluster / project / environment", True,
          help="The actual cluster hostname, project and environment separated by /. This exact value also identifies the operating environment record."),
        f("skpr_path", "Existing Skpr executable", True,
          help="Absolute path to the released native CLI used by the logged-in account."),
        f("site_root", "Original project working directory", True,
          help="Absolute original Git project root containing its .skpr directory."),
        f("git_path", "Existing Git executable",
          help="Leave empty to resolve Git on this receiving machine."),
        f("env_path", "Existing POSIX env executable",
          help="Leave empty to resolve env on this receiving machine. It binds the public cluster and project without copying credentials."),
        f("source_environment", "Selected backup's original environment",
          help="Defaults to the target. Restore can select a backup from another environment in this same Skpr project."),
        f("backup_id", "Selected original environment backup name",
          help="Use the exact Name from the original backup collection."),
        f("release_version", "Reviewed native release version",
          help="The existing Skpr release version selected for deployment."),
        f("expected_release_sha256", "Reviewed native release SHA-256",
          help="Copy selected_release_sha256 from the native observation before queuing deployment."),
        f("expected_configuration_sha256", "Reviewed .skpr configuration SHA-256",
          help="Copy configuration_sha256 from the native observation. Deployment rechecks the complete .skpr files immediately before its native write."),
        f("mysql_backup_policies", "Native MySQL backup policies", type="textarea",
          max_length=16000, help="Optional JSON array of original policy names, passed as the CLI's --mysql-policy values. An empty selection uses the native environment policy."),
        f("restic_selections", "Original backup snapshot selections", type="textarea",
          max_length=64000, help="Optional original component-to-restic associations for a selected backup. Use the documented JSON selection export from native capture."),
        f("timeout_seconds", "Native command timeout (seconds)", type="integer",
          default=600, minimum=10, maximum=7200),
        f("max_artifact_bytes", "Maximum individual source or backup file bytes", type="integer",
          default=1073741824, minimum=1048576),
    ]}


def _identifier(value, name):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise ValueError("Use the exact ordinary native " + name + ".")
    return value


def _executable(value, name):
    selected = value or shutil.which(name)
    if not selected:
        raise ValueError("Install or select the existing native " + name + " executable.")
    path = Path(selected).expanduser()
    if not path.is_absolute() or not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError("Select an existing executable absolute path for " + name + ".")
    return str(path.resolve(strict=True))


def profile(config, runtime_bindings=None):
    if not isinstance(config, dict) or config.get("source_kind") != "skpr":
        raise ValueError("Select the native Skpr provider.")
    allowed = {f["name"] for f in provider_schema()["fields"]} | {"source_kind", "target_fingerprint"}
    if set(config) - allowed:
        raise ValueError("The Skpr profile contains unsupported fields.")
    p = dict(config)
    if runtime_bindings is not None:
        if not isinstance(runtime_bindings, dict) or set(runtime_bindings) - RUNTIME_FIELDS:
            raise ValueError("Only receiving-machine Skpr, Git, env and project paths can be rebound.")
        p.update(runtime_bindings)
    parts = str(p.get("environment_id", "")).split("/")
    if len(parts) != 3:
        raise ValueError("Use the actual cluster/project/environment identity.")
    cluster, project, environment = parts
    if (len(cluster) > 253 or not re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?", cluster)
            or any(not label or len(label) > 63 or label.startswith("-") or label.endswith("-")
                   for label in cluster.split("."))):
        raise ValueError("Use the original Skpr cluster hostname, without a URL, path or query.")
    p.update(cluster=cluster, project=_identifier(project, "project"),
             environment=_identifier(environment, "environment"))
    p["source_environment"] = _identifier(p.get("source_environment") or environment, "source environment")
    root = Path(str(p.get("site_root", ""))).expanduser()
    if not root.is_absolute() or not root.is_dir() or not (root / ".skpr").is_dir():
        raise ValueError("Choose the original absolute project directory containing .skpr.")
    p["site_root"] = str(root.resolve(strict=True))
    p["skpr_path"] = _executable(p.get("skpr_path"), "skpr")
    p["git_path"] = _executable(p.get("git_path"), "git")
    p["env_path"] = _executable(p.get("env_path"), "env")
    for key in ("backup_id", "release_version"):
        if p.get(key):
            p[key] = _identifier(p[key], key.replace("_", " "))
    for key in ("expected_release_sha256", "expected_configuration_sha256"):
        if p.get(key) and not SHA256.fullmatch(p[key]):
            raise ValueError("Supply the exact reviewed " + key + ".")
    policies = p.get("mysql_backup_policies") or "[]"
    p["policies"] = json.loads(policies) if isinstance(policies, str) else None
    if (not isinstance(p["policies"], list) or any(not isinstance(v, str) or not ID.fullmatch(v) for v in p["policies"])
            or len(p["policies"]) != len(set(p["policies"]))):
        raise ValueError("Native MySQL policies must be a JSON array of distinct existing policy names.")
    raw_selections = p.get("restic_selections") or "[]"
    p["snapshot_selections"] = json.loads(raw_selections) if isinstance(raw_selections, str) else None
    if not isinstance(p["snapshot_selections"], list):
        raise ValueError("Original snapshot selections must be a JSON array.")
    for key, default in (("timeout_seconds", 600), ("max_artifact_bytes", 1073741824)):
        value = p.get(key) or default
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("Use a whole number for " + key + ".")
        p[key] = value
    if not 10 <= p["timeout_seconds"] <= 7200 or p["max_artifact_bytes"] < 1048576:
        raise ValueError("The native timeout or artifact size is outside the configured range.")
    return p


def provider_context(p):
    return {"source_kind": "skpr", "environment_id": p["environment_id"],
            "cluster": p["cluster"], "project": p["project"], "environment": p["environment"]}


def actions_for(kind):
    if kind == "CAPTURE":
        return [{"value": "skpr-capture", "label": "Capture the original Skpr project, release and backup inventory"}]
    if kind == "BACKUP_CREATE":
        return [{"value": "skpr-backup-create", "label": "Create and retain the original native environment backup"}]
    if kind == "BACKUP_DOWNLOAD":
        return [{"value": "skpr-backup-download", "label": "Download the selected native backup's database and volume files"}]
    if kind in {"REHEARSAL", "CUTOVER", "ROLLBACK"}:
        return [
            {"value": "skpr-restore", "label": "Restore the selected original environment backup",
             "required_profile_fields": ["backup_id"]},
            {"value": "skpr-deploy", "label": "Deploy the reviewed release and original project configuration",
             "required_profile_fields": ["release_version", "expected_release_sha256", "expected_configuration_sha256"]},
        ]
    return []


def pollable(resume):
    pending = resume.get("native_poll") or {}
    return (resume.get("phase") == "accepted" and pending.get("provider") == "skpr"
            and pending.get("kind") in {"backup", "restore", "deployment"}
            and bool(pending.get("id")))


def resume_fields(operation, payload, reason):
    if not str(operation.get("native_action", "")).startswith("skpr-"):
        raise ValueError("These continuation fields belong to the original Skpr operation.")
    result = {}
    if "runtime_bindings" in payload:
        original = operation["profile"]["config"]
        selected = profile(original, payload["runtime_bindings"])
        result["runtime_bindings"] = {key: selected[key] for key in RUNTIME_FIELDS}
    request_id = payload.get("skpr_native_request_id")
    if request_id:
        request_id = _identifier(request_id, "backup or restore request ID")
        step = payload.get("skpr_request_step")
        state = operation.get("resume_checkpoint") or {}
        retained = state.get("steps", {}).get(step)
        if (not retained or retained.get("kind") not in {"backup", "restore"}
                or retained.get("phase") in {"completed", "failed"}
                or retained.get("native_id") not in (None, "", request_id)):
            raise ValueError("Join the actual provider ID to the matching unfinished original step.")
        if request_id in retained.get("before_ids", []):
            raise ValueError("The selected request already existed before this original command.")
        associations = dict(operation.get("skpr_native_associations") or {})
        associations[step] = {"native_id": request_id, "reason": str(reason)}
        result["skpr_native_associations"] = associations
    if "skpr_snapshot_choices" in payload:
        pending = (operation.get("resume_checkpoint") or {}).get("pending_skpr_download") or {}
        label = payload.get("skpr_download_step")
        choices = payload["skpr_snapshot_choices"]
        if not pending or label != pending.get("label") or not isinstance(choices, list):
            raise ValueError("Join the native snapshot selection to this original pending backup download.")
        expected = {(row["kind"], row["component_name"]) for row in pending["components"]}
        seen = set()
        for item in choices:
            if (not isinstance(item, dict) or item.get("backup_id") != pending["backup_id"]
                    or not isinstance(item.get("snapshot_id"), str) or not SHA256.fullmatch(item["snapshot_id"])):
                raise ValueError("Choose the actual full snapshot ID for this original backup.")
            key = (item.get("kind"), item.get("component_name"))
            if key not in expected or key in seen:
                raise ValueError("Every original database and volume component requires one native snapshot association.")
            seen.add(key)
        if seen != expected:
            raise ValueError("Complete the original snapshot selections for every displayed backup component.")
        selections = dict(operation.get("skpr_snapshot_selections") or {})
        selections[label] = choices
        result["skpr_snapshot_selections"] = selections
    return result


def _prefix(p):
    # These are public routing bindings. Skpr resolves native account credentials.
    return [p["env_path"], "SKPR_API=" + p["cluster"] + ":443",
            "SKPR_SSH=" + p["cluster"] + ":22", "SKPR_PROJECT=" + p["project"],
            p["skpr_path"]]


def _state(s, supplied=None):
    path = s.out / "native-state.json"
    saved = s.read_private_json(path) if path.exists() else (supplied or {})
    saved = saved.get("resume_checkpoint", saved.get("state", saved))
    s.state = dict(s.resolve_private(saved))
    if s.state.get("provider") not in (None, "skpr"):
        raise ValueError("The saved native continuation belongs to another provider.")


def _intent(s, instruction):
    digest = _api()._digest(instruction)
    if s.state and s.state.get("intent_sha256") not in (None, digest):
        raise ValueError("The retained operation has another reviewed source, target or instruction.")
    s.state.setdefault("provider", "skpr")
    s.state.setdefault("intent_sha256", digest)
    s.state.setdefault("intent", instruction)
    s.state.setdefault("phase", "prepared")
    s.state.setdefault("mutation_started", False)
    s.state.setdefault("steps", {})
    s.save_state()


def _add(s, path, role, **extra):
    path = Path(path)
    identity = _api()._file(path, role)
    if identity["size"] > s.p["max_artifact_bytes"]:
        raise ValueError("The original " + role + " exceeds this project's configured artifact size.")
    prior = next((item for item in s.artifacts if item["path"] == identity["path"] and item["role"] == role), None)
    if prior:
        if (prior["sha256"], prior["size"]) != (identity["sha256"], identity["size"]):
            raise ValueError("An already retained original file changed during this operation.")
        return prior
    return s.add(path, role, **extra)


def _manifest(s, name, value, role="provider_metadata"):
    path = s.out / name
    if path.exists():
        prior = s.read_private_json(path)
        if prior != value:
            raise ValueError("The retained original " + name + " belongs to another observation.")
    else:
        _api()._atomic(path, value)
    return _add(s, path, role, format=VERSION, provider_context=provider_context(s.p))


def _record(s, label):
    path = s.out / (label + ".command.json")
    return s.read_private_json(path) if path.exists() else None


def _retain_command(s, label):
    path = s.out / (label + ".command.json")
    if not path.is_file():
        return
    record = s.read_private_json(path)
    if record.get("phase") not in {"complete", "not_started", "interrupted"}:
        return
    _add(s, path, "native_command", format="skpr-cli")
    for stream in ("stdout", "stderr"):
        source = record.get(stream)
        if not source:
            continue
        actual = _api()._file(s.private_path(source["path"]), stream)
        if (actual["sha256"], actual["size"]) != (source["sha256"], source["size"]):
            raise ValueError("The original native " + stream + " changed in custody.")
        _add(s, actual["path"], "native_stderr" if stream == "stderr" else "provider_cli_output",
             format="skpr-cli", native_returncode=record.get("returncode"),
             native_phase=record.get("phase"))


def _fresh(s, label):
    index = int(s.state.get("observation_index", 0)) + 1
    s.state["observation_index"] = index
    s.save_state()
    return label + "-" + str(index).zfill(8)


def _command(s, label, arguments, *, mutating=False, fresh=False, native="skpr"):
    if fresh:
        label = _fresh(s, label)
    if native == "skpr":
        prefix = _prefix(s.p)
    elif native == "git":
        prefix = [s.p["git_path"]]
    else:
        raise ValueError("Unknown original executable binding.")
    semantic = {"program": native, "arguments": arguments, "mutating": bool(mutating)}
    index_path = s.out / (label + ".invocation.json")
    if index_path.exists():
        saved = s.read_private_json(index_path)
        if saved["semantic"] != semantic:
            raise ValueError("The original command's purpose or arguments changed.")
    else:
        saved = {"semantic": semantic, "attempts": [label]}
        _api()._atomic(index_path, saved)
    actual_label = saved["attempts"][-1]
    previous = _record(s, actual_label)
    argv = prefix + arguments
    retry_read = bool(previous and not mutating and (
        (previous.get("phase") == "complete" and previous.get("returncode") != 0)
        or (previous.get("phase") == "interrupted" and previous.get("owned_process_reaped") is True)))
    if previous and (previous.get("argv") != s.resolve_private(argv, "argv") or retry_read):
        if previous.get("phase") == "complete" and previous.get("returncode") == 0:
            argv = previous["argv"]
        elif previous.get("phase") == "not_started" or (not mutating and
                (previous.get("phase") == "complete" or
                 (previous.get("phase") == "interrupted" and previous.get("owned_process_reaped") is True))):
            _retain_command(s, actual_label)
            actual_label = label + "-receiving-" + str(len(saved["attempts"])).zfill(4)
            saved["attempts"].append(actual_label)
            _api()._atomic(index_path, saved)
        else:
            raise _api().NativeWaiting("Continue the original Skpr provider request using its retained native ID.")
    try:
        record = s.command(actual_label, argv, mutating=mutating)
    finally:
        _retain_command(s, actual_label)
        # Full commands are already journaled on disk and exported with the
        # original workspace. Keep checkpoints small during long provider jobs.
        s.state.get("completed_commands", {}).pop(actual_label, None)
    return record


def _read_text(s, record, limit=32 * 1024 * 1024):
    path = Path(record["stdout"]["path"])
    if path.stat().st_size > min(limit, s.p["max_artifact_bytes"]):
        raise ValueError("The original native metadata exceeds the selected intake size.")
    return path.read_text(encoding="utf-8")


def _json(s, label, arguments, *, fresh=False, empty=None):
    record = _command(s, label, arguments, fresh=fresh)
    raw = _read_text(s, record)
    if empty is not None and raw.strip() == empty:
        return [], record
    value = json.loads(raw)
    return value, record


def _rows(value, field, label):
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        raise ValueError("The native " + label + " response must contain its full original array.")
    ids = [row.get(field) for row in value]
    if any(not isinstance(value, str) or not value for value in ids) or len(set(ids)) != len(ids):
        raise ValueError("The native " + label + " response requires distinct original " + field + " values.")
    return value


def _catalogue(s, kind, environment, label, fresh=False):
    if kind not in {"backup", "restore", "mysql", "volume"}:
        raise ValueError("Choose the original native backup or restore collection.")
    command = [kind, "list", environment, "--json"] if kind in {"backup", "restore"} else [
        "mysql" if kind == "mysql" else "filesystem", "backup", "list", environment, "--json"]
    value, _ = _json(s, label, command, fresh=fresh,
                     empty=EMPTY_RESTORES if kind == "restore" else EMPTY_BACKUPS)
    return _rows(value, "Name", kind + " catalogue")


def _environment(s, environment, label, fresh=False):
    value, _ = _json(s, label, ["info", environment, "--format=json"], fresh=fresh)
    if not isinstance(value, dict) or value.get("Name") != environment:
        raise ValueError("Skpr returned a different native environment.")
    return value


def _release(s, version, label, fresh=False):
    value, _ = _json(s, label, ["release", "info", version, "--json"], fresh=fresh)
    rows = _rows(value, "name", "release image")
    if any(row.get("type") != "runtime" or not isinstance(row.get("tag"), str) or not row["tag"] for row in rows):
        raise ValueError("The selected release lacks its original runtime image identities.")
    if not rows:
        raise ValueError("The selected original release contains no runtime images.")
    return {"version": version, "images": rows, "sha256": _api()._digest({"version": version, "images": rows})}


def _configuration(p, destination=None):
    root = Path(p["site_root"]) / ".skpr"
    if root.is_symlink():
        raise ValueError("Select the original ordinary .skpr project directory.")
    files = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Resolve .skpr symlinks inside the original project before capturing its configuration.")
        if path.is_file():
            relative = path.relative_to(root).as_posix()
            item = _api()._file(path, "configuration_file")
            files.append({"path": relative, "bytes": item["size"], "sha256": item["sha256"],
                          "mode": stat.S_IMODE(path.stat().st_mode)})
            if destination is not None:
                target = Path(destination) / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    original = _api()._file(target, "configuration_file")
                    if (original["sha256"], original["size"]) != (item["sha256"], item["size"]):
                        raise ValueError("The original project configuration changed after capture.")
                else:
                    shutil.copyfile(path, target)
                    os.chmod(target, 0o600)
                    copied = _api()._file(target, "configuration_file")
                    if (copied["sha256"], copied["size"]) != (item["sha256"], item["size"]):
                        raise ValueError("An original configuration file changed while it was being captured.")
    if not files or not any(row["path"] == "config.yml" for row in files):
        raise ValueError("The original .skpr/config.yml must exist in the selected project.")
    return {"files": files, "sha256": _api()._digest(files)}


def _source(s, label):
    target = s.out / (label + "-project-source.json")
    if target.exists():
        value = s.read_private_json(target)
        for row in value["artifacts"]:
            actual = _api()._file(s.private_path(row["path"]), row["role"])
            if (actual["sha256"], actual["size"]) != (row["sha256"], row["size"]):
                raise ValueError("The original project source changed in custody.")
            _add(s, actual["path"], row["role"], format=row.get("format"))
        _add(s, target, "project_source", format=VERSION)
        return value
    top = _command(s, label + "-git-root", ["rev-parse", "--show-toplevel"], native="git")
    root = _read_text(s, top, 65536).strip()
    if Path(root).resolve() != Path(s.p["site_root"]):
        raise ValueError("Use this repository's actual Git top-level project directory.")
    commit_result = _command(s, label + "-git-head", ["rev-parse", "--verify", "HEAD^{commit}"], native="git")
    commit = _read_text(s, commit_result, 65536).strip()
    if not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", commit):
        raise ValueError("The original Git commit identity is invalid.")
    status_record = _command(s, label + "-git-status", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], native="git")
    diff_record = _command(s, label + "-git-diff", ["diff", "--binary", "HEAD", "--"], native="git")
    archive_record = _command(s, label + "-git-archive", ["archive", "--format=tar", commit], native="git")
    artifacts = [_add(s, archive_record["stdout"]["path"], "source_archive", format="git-archive-tar", source_commit=commit)]
    artifacts.append(_add(s, diff_record["stdout"]["path"], "source_worktree_patch", format="git-binary-diff"))
    artifacts.append(_add(s, status_record["stdout"]["path"], "source_worktree_status", format="git-porcelain-v1-z"))
    bundle = s.out / (label + "-source.git.bundle")
    _command(s, label + "-git-bundle", ["bundle", "create", str(bundle), "--all", "HEAD"], native="git")
    artifacts.append(_add(s, bundle, "source_git_bundle", format="git-bundle", source_commit=commit))
    staged = _command(s, label + "-git-index-diff", ["diff", "--binary", "--cached", "HEAD", "--"], native="git")
    unstaged = _command(s, label + "-git-worktree-diff", ["diff", "--binary", "--"], native="git")
    artifacts.append(_add(s, staged["stdout"]["path"], "source_index_patch", format="git-binary-diff"))
    artifacts.append(_add(s, unstaged["stdout"]["path"], "source_unstaged_patch", format="git-binary-diff"))
    untracked = _command(s, label + "-git-untracked", ["ls-files", "--others", "--exclude-standard", "-z"], native="git")
    paths = Path(untracked["stdout"]["path"]).read_bytes().split(b"\0")
    loose = s.out / (label + "-untracked.tar")
    names = []
    with tarfile.open(loose, "w", format=tarfile.PAX_FORMAT) as tar:
        for raw in paths:
            if not raw:
                continue
            name = os.fsdecode(raw)
            relative = PurePosixPath(name)
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("An untracked original source path is outside this project.")
            source = Path(s.p["site_root"]) / name
            if source.is_symlink() or not source.is_file():
                raise ValueError("Retain original untracked source as ordinary files: " + name)
            if source.resolve().is_relative_to(s.out):
                raise ValueError("The private GovHub operation directory must be outside the original project source.")
            tar.add(source, arcname=name, recursive=False)
            names.append(name)
    artifacts.append(_add(s, loose, "source_untracked_archive", format="tar"))
    destination = s.out / (label + "-skpr-configuration")
    config = _configuration(s.p, destination)
    for row in config["files"]:
        artifacts.append(_add(s, destination / row["path"], "configuration_file",
                              relative_path=".skpr/" + row["path"]))
    # Recheck the source after the complete capture. Interrupted captures keep
    # their original command outputs and cannot silently combine later edits.
    checks = [
        ("head", ["rev-parse", "--verify", "HEAD^{commit}"], commit_result),
        ("status", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], status_record),
        ("combined", ["diff", "--binary", "HEAD", "--"], diff_record),
        ("index", ["diff", "--binary", "--cached", "HEAD", "--"], staged),
        ("worktree", ["diff", "--binary", "--"], unstaged),
    ]
    for kind, arguments, original in checks:
        current = _command(s, label + "-source-final-" + kind, arguments, native="git", fresh=True)
        if (current["stdout"]["sha256"], current["stdout"]["size"]) != (
                original["stdout"]["sha256"], original["stdout"]["size"]):
            raise ValueError("The original Git source changed during its " + kind + " capture.")
    for row in _tar_index(s, loose)["entries"]:
        if row["type"] != "file":
            raise ValueError("The original untracked source must contain ordinary files.")
        current = _api()._file(Path(s.p["site_root"]) / row["path"], "source_file")
        if (current["sha256"], current["size"]) != (row["sha256"], row["size"]):
            raise ValueError("An original untracked source file changed during capture.")
    if _configuration(s.p)["sha256"] != config["sha256"]:
        raise ValueError("The original .skpr configuration changed during source capture.")
    value = {"schema": VERSION, "provider_context": provider_context(s.p),
             "commit": commit, "configuration": config, "untracked_files": names,
             "artifacts": artifacts}
    _manifest(s, target.name, value, role="project_source")
    return value


def _summary(p, inventory):
    env = inventory["environment"]
    result = {
        "cluster": p["cluster"], "project": p["project"], "environment": env["Name"],
        "production": bool(env.get("Production", False)),
        "version": env.get("Version", ""), "phase": env.get("Phase", ""),
        "databases": [row["Name"] for row in env.get("MySQL", [])],
        "volumes": [row["Name"] for row in env.get("Volume", [])],
        "backup_count": len(inventory["backups"]), "restore_count": len(inventory["restores"]),
        "configuration_sha256": inventory["configuration"]["sha256"],
        "source_environment": p["source_environment"],
        "backup_policy": {"mysql": p["policies"], "environment": env.get("Backup"),
                          "volume": env.get("Volume"), "database": env.get("MySQL")},
    }
    if inventory.get("selected_release"):
        result["selected_release_sha256"] = inventory["selected_release"]["sha256"]
        result["selected_release"] = inventory["selected_release"]
    return result


def _inventory(s, label, fresh=False):
    version = _command(s, label + "-cli-version", ["--version"], fresh=fresh)
    version_text = _read_text(s, version, 65536).strip()
    if not version_text:
        raise ValueError("The selected Skpr executable returned no native version.")
    if not re.search(r"(?<![0-9.])v?1\.9\.4(?![0-9.])", version_text):
        raise ValueError("Use the released Skpr v1.9.4 executable for this source-qualified native adapter.")
    environment = _environment(s, s.p["environment"], label + "-environment", fresh)
    environments = _command(s, label + "-environments", ["list"], fresh=fresh)
    releases = _command(s, label + "-releases", ["release", "list"], fresh=fresh)
    backups = _catalogue(s, "backup", s.p["source_environment"], label + "-backups", fresh)
    restores = _catalogue(s, "restore", s.p["environment"], label + "-restores", fresh)
    mysql = _catalogue(s, "mysql", s.p["source_environment"], label + "-mysql", fresh)
    volumes = _catalogue(s, "volume", s.p["source_environment"], label + "-volumes", fresh)
    configuration = _configuration(s.p)
    result = {"environment": environment, "backups": backups, "restores": restores,
              "mysql_backups": mysql, "volume_backups": volumes,
              "configuration": configuration, "cli_version": version_text,
              "cli_binary": _api()._file(s.p["skpr_path"], "native_executable"),
              "environment_table": _read_text(s, environments),
              "release_table": _read_text(s, releases)}
    if s.p.get("release_version"):
        result["selected_release"] = _release(s, s.p["release_version"], label + "-selected-release", fresh)
    return result


def discover_capabilities(config, runtime_bindings=None):
    result = {"ready": False, "actions": [], "configuration": dict(config), "current_config": dict(config)}
    try:
        p = profile(config, runtime_bindings)
        with tempfile.TemporaryDirectory(prefix="govhub-skpr-capabilities-") as folder:
            s = _api().Session(p, folder)
            inventory = _inventory(s, "capability")
            result.update(ready=True, target_fingerprint=_api()._digest(provider_context(p)),
                          native_status=_summary(p, inventory),
                          native_inventory={key: inventory[key] for key in
                              ("backups", "restores", "mysql_backups", "volume_backups", "environment_table", "release_table")},
                          actions=[action for kind in ("CAPTURE", "BACKUP_CREATE", "BACKUP_DOWNLOAD", "REHEARSAL")
                                   for action in actions_for(kind)])
    except Exception as exc:
        result["error"] = str(exc)
    return result


def _load_manifest(s, name, role="provider_metadata"):
    path = s.out / name
    if not path.exists():
        return None
    value = s.read_private_json(path)
    _add(s, path, role, format=VERSION, provider_context=provider_context(s.p))
    return value


def _original_inventory(s):
    name = "skpr-original-inventory.json"
    value = _load_manifest(s, name)
    if value is None:
        value = {"schema": VERSION, "provider_context": provider_context(s.p),
                 "inventory": _inventory(s, "original")}
        _manifest(s, name, value)
    return value["inventory"]


def _catalogue_manifest(s, label, kind, environment):
    rows = _catalogue(s, kind, environment, label, fresh=True)
    name = _fresh(s, label + "-collection") + ".json"
    artifact = _manifest(s, name, {"kind": kind, "environment": environment, "rows": rows})
    return rows, artifact


def _original_ids(s, step):
    value = s.read_private_json(step["before_file"])
    actual = _api()._file(s.private_path(step["before_file"]), "provider_metadata")
    if actual["sha256"] != step["before_sha256"]:
        raise ValueError("The original pre-request native collection changed.")
    return {row["Name"] for row in value["rows"]}


def _request_stdout(s, label):
    index = s.out / (label + ".invocation.json")
    labels = s.read_private_json(index).get("attempts", [label]) if index.exists() else [label]
    for actual in reversed(labels):
        path = s.out / (actual + ".stdout")
        if not path.is_file() or path.stat().st_size > 65536:
            continue
        value = path.read_text(encoding="utf-8").strip()
        if ID.fullmatch(value):
            return value
    return None


def _request_record(s, label):
    index = s.out / (label + ".invocation.json")
    labels = s.read_private_json(index).get("attempts", [label]) if index.exists() else [label]
    return _record(s, labels[-1])


def _request(s, operation, label, kind, environment, backup=None):
    """Receive one original ID before observing its native lifecycle."""
    expected = {"kind": kind, "environment": environment, "backup": backup,
                "policies": s.p["policies"] if kind == "backup" else []}
    step = s.state["steps"].get(label)
    if step is None:
        rows, artifact = _catalogue_manifest(s, label + "-before", kind, environment)
        step = {"instruction": expected, "kind": kind, "environment": environment,
                "backup": backup, "phase": "prepared", "command": label,
                "before_file": artifact["path"], "before_sha256": artifact["sha256"],
                "before_count": len(rows), "prepared_at": _api()._now()}
        s.state["steps"][label] = step
        s.save_state()
    elif step["instruction"] != expected:
        raise ValueError("The native request continuation changed target, source or backup policy.")
    if step["phase"] == "completed":
        original_result = _api()._file(s.private_path(step["result_file"]), "provider_metadata")
        if original_result["sha256"] != step["result_sha256"]:
            raise ValueError("The original native completion changed in custody.")
        result = s.read_private_json(step["result_file"])
        _add(s, s.private_path(step["result_file"]), "provider_metadata", format=VERSION)
        return result["row"]
    if step["phase"] == "failed":
        s.state.update(phase="failed", native_poll=None)
        s.save_state()
        raise ValueError("The original native " + kind + " reached " + step.get("native_phase", "Failed") + ".")
    if not step.get("native_id"):
        association = (operation.get("skpr_native_associations") or {}).get(label) or {}
        native_id = _request_stdout(s, label) or association.get("native_id")
        record = _request_record(s, label)
        if not native_id and (record is None or record.get("phase") == "not_started"):
            arguments = [kind, "create", environment]
            if kind == "restore":
                arguments += [_identifier(backup, "selected backup"), "--force"]
            else:
                for policy in s.p["policies"]:
                    arguments += ["--mysql-policy", policy]
            step.update(phase="dispatching", command_started_at=step.get("command_started_at") or _api()._now())
            s.state["pending_skpr_step"] = label
            s.save_state()
            try:
                _command(s, label, arguments, mutating=True)
            except Exception:
                native_id = _request_stdout(s, label)
                if not native_id:
                    record = _request_record(s, label)
                    if record and record.get("phase") == "not_started":
                        step["phase"] = "prepared"
                        s.state.update(phase="native_prepared", pending_command=None, native_poll=None)
                    else:
                        step["phase"] = "reconcile_required"
                        s.state.update(phase="native_interrupted", native_poll=None)
                    s.save_state()
                    raise
            native_id = native_id or _request_stdout(s, label)
        if not native_id:
            step["phase"] = "reconcile_required"
            s.state.update(phase="native_interrupted", native_poll=None, pending_skpr_step=label)
            s.save_state()
            raise _api().NativeWaiting("Join the actual native " + kind + " ID from this retained command to its original step.")
        native_id = _identifier(native_id, "returned request ID")
        if native_id in _original_ids(s, step):
            raise ValueError("The supplied provider ID already existed before this native command.")
        step.update(native_id=native_id, phase="accepted", accepted_at=_api()._now())
        if association:
            step["association"] = association
        s.state.update(phase="accepted", pending_command=None, pending_skpr_step=label,
                       native_poll={"provider": "skpr", "kind": kind, "id": native_id,
                                    "environment": environment, "step": label})
        s.save_state()
    rows, artifact = _catalogue_manifest(s, label + "-status", kind, environment)
    selected = next((row for row in rows if row["Name"] == step["native_id"]), None)
    if selected is None:
        s.state.update(phase="accepted", native_poll={"provider": "skpr", "kind": kind,
                       "id": step["native_id"], "environment": environment, "step": label})
        s.save_state()
        raise _api().NativeWaiting("Waiting for Skpr to return the original " + kind + " " + step["native_id"] + ".")
    if kind == "restore" and selected.get("Backup") != backup:
        raise ValueError("The native restore names a different original backup.")
    phase = selected.get("Phase")
    step.update(native_phase=phase, latest_collection=artifact["path"],
                latest_collection_sha256=artifact["sha256"])
    if phase in {"Failed", "Unknown"}:
        step["phase"] = "failed"
        s.state.update(phase="failed", native_poll=None, pending_skpr_step=None)
        s.save_state()
        raise ValueError("Skpr's original " + kind + " " + step["native_id"] + " reached " + phase + ".")
    if phase != "Completed":
        step["phase"] = "accepted"
        s.state.update(phase="accepted", native_poll={"provider": "skpr", "kind": kind,
                       "id": step["native_id"], "environment": environment, "step": label})
        s.save_state()
        raise _api().NativeWaiting("Skpr " + kind + " " + step["native_id"] + ": " + str(phase) + ".")
    result_name = label + "-completed.json"
    prior_result = _load_manifest(s, result_name)
    if prior_result:
        if (prior_result.get("native_id") != step["native_id"]
                or prior_result.get("original_instruction") != expected
                or prior_result.get("row", {}).get("Phase") != "Completed"):
            raise ValueError("The retained provider completion belongs to another request.")
        result = _api()._file(s.out / result_name, "provider_metadata")
    else:
        result = _manifest(s, result_name, {
            "schema": VERSION, "kind": kind, "environment": environment,
            "native_id": step["native_id"], "row": selected,
            "original_instruction": expected, "observed_at": _api()._now()})
    step.update(phase="completed", result_file=result["path"], result_sha256=result["sha256"])
    s.state.update(phase="native_prepared", native_poll=None, pending_skpr_step=None, pending_command=None)
    s.save_state()
    return selected


def _selected_backup(s, inventory):
    backup_id = s.p.get("backup_id")
    if not backup_id:
        raise ValueError("Select the original environment backup Name in this native profile.")
    selected = [row for row in inventory["backups"] if row["Name"] == backup_id]
    if len(selected) != 1 or selected[0].get("Phase") != "Completed":
        raise ValueError("Choose an existing Completed native environment backup.")
    return selected[0]


def _bound_backup(s, paths, backup):
    """Bind the selected original native backup to the reviewed source cohort."""
    expected = {"cluster": s.p["cluster"], "project": s.p["project"],
                "environment": s.p["source_environment"], "backup_id": backup["Name"]}
    found = []
    for binding in paths.get("bindings", []):
        sources = [binding.get("backup"), binding.get("export"), *binding.get("files", [])]
        for item in sources:
            if not isinstance(item, dict) or item.get("format") != "skpr-backup-manifest":
                continue
            identity = _api()._file(item["path"], "backup")
            if (identity["sha256"], identity["size"]) != (item["sha256"], item["size"]):
                raise ValueError("The reviewed native backup manifest changed in custody.")
            value = json.loads(Path(item["path"]).read_bytes())
            actual = {**{k: value.get("provider_context", {}).get(k) for k in ("cluster", "project", "environment")},
                      "backup_id": value.get("backup", {}).get("Name")}
            if actual == expected:
                found.append(value)
    if not found:
        raise ValueError("Bind this original Skpr backup manifest to the reviewed source inventory before restoring it.")
    identities = {_api()._digest(value) for value in found}
    if len(identities) != 1:
        raise ValueError("The reviewed source contains conflicting original backup manifests.")
    return found[0]


def _capture_context(config, context):
    p = profile(config, context.get("runtime_bindings"))
    s = _api().Session(p, context["output_dir"], context.get("checkpoint_callback"),
                      context.get("cancelled"), context.get("workspace_relocations"))
    _state(s, context.get("checkpoint"))
    instruction = {"action": "skpr-capture", "operation_id": context.get("operation_id"),
                   "target": provider_context(p),
                   "profile": {k: v for k, v in config.items() if k not in RUNTIME_FIELDS | {"target_fingerprint"}}}
    _intent(s, instruction)
    return p, s


def _completed(s, completion):
    observations = completion["observations"]
    for artifact in completion.get("artifacts", []):
        actual = _api()._file(s.private_path(artifact["path"]), artifact["role"])
        if (actual["sha256"], actual["size"]) != (artifact["sha256"], artifact["size"]):
            raise ValueError("A complete original Skpr output changed in custody.")
        _add(s, actual["path"], artifact["role"],
             **{k: v for k, v in artifact.items() if k not in {"path", "sha256", "size", "role"}})
    s.state.update(phase="completed", native_poll=None, pending_skpr_step=None,
                   pending_command=None)
    s.save_state()
    return s.result("COMPLETE", observations)


def _finish(s, observations, name="skpr-completed-operation.json"):
    # Command histories remain in the private native workspace. This manifest
    # carries every retained material output and its original content identity.
    value = {"schema": VERSION, "intent_sha256": s.state["intent_sha256"],
             "provider_context": provider_context(s.p), "observations": observations,
             "artifacts": list(s.artifacts)}
    _manifest(s, name, value, role="restored_native_status")
    return _completed(s, value)


def _failure(s, exc):
    if isinstance(exc, _api().NativeCancelled):
        return s.result("WAITING_NATIVE" if s.state.get("mutation_started") else "CANCELLED", message=str(exc))
    if isinstance(exc, _api().NativeWaiting):
        value = s.result("WAITING_NATIVE", message=str(exc))
        if pollable(s.state):
            value["poll_after_seconds"] = 15
        return value
    if s.state.get("mutation_started") and s.state.get("phase") not in {"failed", "completed", "native_prepared"}:
        value = s.result("WAITING_NATIVE", message=str(exc))
        if pollable(s.state):
            value["poll_after_seconds"] = 60
        return value
    return s.result("FAILED", message=str(exc))


def capture(config, context, checkpoint=None, cancelled=None):
    p, s = _capture_context(config, {**context, "checkpoint_callback": checkpoint, "cancelled": cancelled})
    try:
        expected = context.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _api()._digest(provider_context(p)):
            raise ValueError("The reviewed native environment identity changed.")
        complete = _load_manifest(s, "skpr-completed-operation.json", "restored_native_status")
        if complete:
            return _completed(s, complete)
        original = _original_inventory(s)
        source = _source(s, "original")
        _capture_restic(s, p["source_environment"], "original")
        return _finish(s, {"native_action": "skpr-capture", **_summary(p, original),
                          "source_commit": source["commit"],
                          "native_inventory": {k: original[k] for k in
                              ("backups", "restores", "mysql_backups", "volume_backups", "environment_table", "release_table")}})
    except Exception as exc:
        return _failure(s, exc)


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    p = profile(config, operation.get("runtime_bindings"))
    s = _api().Session(p, source_paths["output_dir"], checkpoint, cancelled, source_paths.get("workspace_relocations"))
    source_paths = s.resolve_private(source_paths)
    try:
        _state(s, source_paths.get("checkpoint") or operation.get("resume_checkpoint"))
        action = operation.get("native_action")
        if operation.get("provider_environment_id") != p["environment_id"]:
            raise ValueError("The original operation names another configured native environment.")
        if action not in {row["value"] for row in actions_for(operation.get("type"))}:
            raise ValueError("Choose the native Skpr action supplied for this operation purpose.")
        expected = operation.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _api()._digest(provider_context(p)):
            raise ValueError("The reviewed target fingerprint belongs to another native environment.")
        _intent(s, {"action": action, "operation_id": operation.get("id"), "target": provider_context(p),
                    "snapshot_id": source_paths.get("snapshot_id"),
                    "snapshot_sha256": source_paths.get("snapshot_sha256"),
                    "profile": {k: v for k, v in config.items() if k not in RUNTIME_FIELDS | {"target_fingerprint"}}})
        complete = _load_manifest(s, "skpr-completed-operation.json", "restored_native_status")
        if complete:
            if complete["intent_sha256"] != s.state["intent_sha256"]:
                raise ValueError("The native completion belongs to another original operation.")
            return _completed(s, complete)
        original = _original_inventory(s)
        source = _source(s, "original")
        backups = []
        if action == "skpr-backup-download":
            selected = _selected_backup(s, original)
            backups.append(_download(s, selected, p["source_environment"], "selected", operation))
        elif action == "skpr-backup-create":
            selected = _request(s, operation, "create-environment-backup", "backup", p["environment"])
            backups.append(_download(s, selected, p["environment"], "created", operation))
        else:
            if action == "skpr-restore":
                selected = _selected_backup(s, original)
                reviewed_backup = _bound_backup(s, source_paths, selected)
                # Retain the selected source bytes before the target-changing journey.
                backups.append(_download(s, selected, p["source_environment"], "selected", operation, reviewed_backup))
            else:
                if not all(p.get(k) for k in ("release_version", "expected_release_sha256", "expected_configuration_sha256")):
                    raise ValueError("Select the reviewed release and complete original configuration before deployment.")
                if "deploy-reviewed-release" not in s.state["steps"]:
                    _reviewed_deployment(s, "before-backup")
            before = _request(s, operation, "pre-change-backup", "backup", p["environment"])
            backups.append(_download(s, before, p["environment"], "pre-change", operation))
            if action == "skpr-restore":
                _request(s, operation, "restore-environment", "restore", p["environment"], selected["Name"])
            else:
                _deploy(s, operation)
        after = _inventory(s, "completed", fresh=True)
        observed = _summary(p, after)
        observed.update(native_action=action, source_commit=source["commit"], backups=backups,
                        steps=s.state["steps"], native_inventory={k: after[k] for k in
                            ("backups", "restores", "mysql_backups", "volume_backups", "environment_table", "release_table")})
        return _finish(s, observed)
    except Exception as exc:
        return _failure(s, exc)


def _remote(s, label, environment, arguments, *, fresh=False):
    # v1.9.4 joins remote argv with spaces before SSH session.Run. Quote each
    # argument once for that real remote shell, including provider-returned IDs.
    command = ["exec", environment, "--", *[shlex.quote(str(arg)) for arg in arguments]]
    return _command(s, label, command, fresh=fresh)


def _capture_restic(s, environment, label, fresh=False):
    name = label + "-restic-snapshots.json"
    if not fresh:
        prior = _load_manifest(s, name)
        if prior:
            return {**prior, "artifact": _api()._file(s.out / name, "provider_metadata")}
    version = _remote(s, label + "-restic-version", environment, ["restic", "version"], fresh=fresh)
    record = _remote(s, label + "-restic-snapshots", environment, ["restic", "snapshots", "--json"], fresh=fresh)
    snapshots = _rows(json.loads(_read_text(s, record)), "id", "restic snapshot")
    if any(not SHA256.fullmatch(row["id"]) for row in snapshots):
        raise ValueError("Retain the full original restic snapshot IDs.")
    value = {"schema": VERSION, "environment": environment,
             "version": _read_text(s, version, 65536).strip(),
             "snapshots": snapshots, "native_output": record["stdout"]}
    if fresh:
        name = _fresh(s, label + "-restic-snapshot-collection") + ".json"
    artifact = _manifest(s, name, value)
    return {**value, "artifact": artifact}


def _backup_components(s, backup, environment, label):
    database = _catalogue(s, "mysql", environment, label + "-mysql", fresh=True)
    volumes = _catalogue(s, "volume", environment, label + "-volume", fresh=True)
    # Published Skpr component docs use BackupID as the parent backup Name.
    # Component Name and physical Database/Volume are retained independently.
    selected = [{"kind": kind, "native": row} for kind, rows in (("mysql", database), ("volume", volumes))
                for row in rows if row.get("BackupID") == backup["Name"]]
    for kind, field in (("mysql", "Databases"), ("volume", "Volumes")):
        logical = backup.get(field, [])
        if not isinstance(logical, list) or any(not isinstance(x, str) or not x for x in logical):
            raise ValueError("The original environment backup has no readable component coverage.")
        expected = [] if logical == ["n/a"] else logical
        actual = [row for row in selected if row["kind"] == kind]
        if len(actual) != len(expected):
            raise ValueError("The native " + kind + " collection does not yet contain every component of backup " + backup["Name"] + ".")
    if any(row["native"].get("Phase") != "Completed" for row in selected):
        raise ValueError("Every selected native backup component must be Completed before its original files are downloaded.")
    return selected


def _snapshot_choices(s, operation, label, backup, environment, components, restic):
    selections = (operation.get("skpr_snapshot_selections") or {}).get(label)
    if selections is None:
        selections = [item for item in s.p["snapshot_selections"]
                      if isinstance(item, dict) and item.get("backup_id") == backup["Name"]]
    expected = {(item["kind"], item["native"]["Name"]) for item in components}
    supplied = {}
    available = {row["id"]: row for row in restic["snapshots"]}
    for choice in selections:
        if not isinstance(choice, dict):
            raise ValueError("Each original snapshot selection must be an object.")
        key = (choice.get("kind"), choice.get("component_name"))
        if (key not in expected or key in supplied or choice.get("backup_id") != backup["Name"]
                or choice.get("snapshot_id") not in available):
            raise ValueError("Choose each exact native component and an actual full snapshot ID from its retained original repository.")
        supplied[key] = choice
    if set(supplied) != expected:
        s.state.update(phase="native_prepared", native_poll=None,
            pending_skpr_download={"label": label, "backup_id": backup["Name"],
                "environment": environment,
                "components": [{"kind": item["kind"], "component_name": item["native"]["Name"],
                    "physical_resource": item["native"].get("Database" if item["kind"] == "mysql" else "Volume"),
                    "native": item["native"]} for item in components],
                "snapshot_catalogue": restic["artifact"]["path"],
                "snapshot_catalogue_sha256": restic["artifact"]["sha256"],
                "snapshot_count": len(restic["snapshots"]),
                "selected": list(supplied.values())})
        s.save_state()
        raise _api().NativeWaiting("Select the original restic snapshot for each displayed Skpr backup component, then resume this same download.")
    # A snapshot may intentionally contain several resources. Retain each
    # explicit association; the archive itself is fetched once per full ID.
    return [{"component": item, "selection": supplied[(item["kind"], item["native"]["Name"])],
             "snapshot": available[supplied[(item["kind"], item["native"]["Name"])]["snapshot_id"]]}
            for item in components]


def _archive_name(value):
    if not isinstance(value, str) or "\0" in value or "\\" in value:
        raise ValueError("The original backup archive contains an invalid path.")
    stripped = value.lstrip("/")
    path = PurePosixPath(stripped)
    if any(part == ".." for part in path.parts):
        raise ValueError("The original backup archive contains a parent-directory path.")
    return path.as_posix() if stripped not in {"", "."} else ""


def _tar_index(s, path):
    entries, names = [], set()
    total = 0
    with tarfile.open(path, "r:") as archive:
        for member in archive:
            s.check()
            name = _archive_name(member.name)
            if not name and member.isdir():
                continue
            if not name or name in names:
                raise ValueError("The original restic archive has duplicate or empty member paths.")
            names.add(name)
            entry = {"path": name, "size": member.size, "mode": member.mode,
                     "uid": member.uid, "gid": member.gid, "mtime": member.mtime}
            if member.isfile() or member.islnk():
                stream = archive.extractfile(member)
                if stream is None:
                    raise ValueError("A native archive file has no readable body.")
                h, count = hashlib.sha256(), 0
                with stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        s.check()
                        h.update(chunk)
                        count += len(chunk)
                if member.isfile() and count != member.size:
                    raise ValueError("A native backup member body is incomplete.")
                entry.update(type="hardlink" if member.islnk() else "file", sha256=h.hexdigest(), size=count)
                if member.islnk():
                    entry.update(link_target=member.linkname, header_size=member.size)
                total += count
            elif member.isdir():
                entry["type"] = "dir"
            elif member.issym() or member.islnk():
                entry.update(type="symlink" if member.issym() else "hardlink", link_target=member.linkname)
            else:
                entry.update(type="special", native_type=member.type.decode("ascii", errors="replace"))
            entries.append(entry)
    return {"entries": entries, "files": sum(row["type"] in {"file", "hardlink"} for row in entries), "file_bytes": total}


def _restic_nodes(s, record, snapshot_id):
    raw = _read_text(s, record)
    objects = [json.loads(line) for line in raw.splitlines() if line.strip()]
    if any(not isinstance(row, dict) for row in objects):
        raise ValueError("The original restic listing must contain its complete JSON objects.")
    headers = [row for row in objects if row.get("struct_type") == "snapshot" or ("id" in row and "path" not in row)]
    if headers and any(row.get("id") not in (None, snapshot_id) for row in headers):
        raise ValueError("The original restic listing belongs to a different snapshot.")
    return [row for row in objects if isinstance(row.get("path"), str) and isinstance(row.get("type"), str)]


def _download(s, backup, environment, label, operation, source_manifest=None):
    name = label + "-skpr-backup.json"
    prior = _load_manifest(s, name, "backup")
    if prior:
        for retained in s.artifacts:
            if retained["path"] == str(s.out / name) and retained["role"] == "backup":
                retained["format"] = "skpr-backup-manifest"
                retained["provider_context"] = prior.get("provider_context")
        expected_context = {**provider_context(s.p), "environment": environment,
                            "environment_id": s.p["cluster"] + "/" + s.p["project"] + "/" + environment}
        if (prior.get("backup", {}).get("Name") != backup["Name"]
                or prior.get("provider_context") != expected_context):
            raise ValueError("The retained download belongs to another native backup or environment.")
        if source_manifest is not None:
            expected_choices = {(row["component"]["kind"], row["component"]["native"]["Name"], row["selection"]["snapshot_id"])
                                for row in source_manifest.get("components", [])}
            received_choices = {(row["component"]["kind"], row["component"]["native"]["Name"], row["selection"]["snapshot_id"])
                                for row in prior["components"]}
            if received_choices != expected_choices:
                raise ValueError("The retained native download differs from its reviewed original snapshot choices.")
        for item in prior["artifacts"]:
            actual = _api()._file(s.private_path(item["path"]), item["role"])
            if (actual["sha256"], actual["size"]) != (item["sha256"], item["size"]):
                raise ValueError("The retained native backup changed in custody.")
            _add(s, actual["path"], item["role"],
                 **{k: v for k, v in item.items() if k not in {"path", "sha256", "size", "role"}})
        return {"backup_id": backup["Name"], "environment": environment,
                "manifest": _api()._file(s.out / name, "backup"),
                "components": len(prior["components"]), "snapshots": len(prior["snapshots"])}
    components = _backup_components(s, backup, environment, label)
    repository = _capture_restic(s, environment, label, fresh=True)
    selected_operation = operation
    if source_manifest is not None and label not in (operation.get("skpr_snapshot_selections") or {}):
        selected_operation = {**operation, "skpr_snapshot_selections": {
            **(operation.get("skpr_snapshot_selections") or {}),
            label: [row["selection"] for row in source_manifest.get("components", [])]}}
    choices = _snapshot_choices(s, selected_operation, label, backup, environment, components, repository)
    if source_manifest is not None:
        expected = {(x["component"]["kind"], x["component"]["native"]["Name"], x["selection"]["snapshot_id"])
                    for x in source_manifest.get("components", [])}
        actual = {(x["component"]["kind"], x["component"]["native"]["Name"], x["selection"]["snapshot_id"])
                  for x in choices}
        if actual != expected:
            raise ValueError("The selected native snapshots differ from the reviewed original backup manifest.")
    artifacts, snapshots = [], []
    for snapshot_id in sorted({choice["selection"]["snapshot_id"] for choice in choices}):
        prefix = label + "-restic-" + snapshot_id
        listing = _remote(s, prefix + "-list", environment, ["restic", "ls", "--json", snapshot_id])
        nodes = _restic_nodes(s, listing, snapshot_id)
        estimated = sum(int(row.get("size") or 0) for row in nodes if row["type"] == "file") + 2048 * len(nodes)
        if estimated > s.p["max_artifact_bytes"]:
            raise ValueError("The selected snapshot exceeds the configured archive size. Increase this project's actual artifact allowance before downloading it.")
        output = _remote(s, prefix + "-dump", environment, ["restic", "dump", "-a", "tar", snapshot_id, "/"])
        archive = _add(s, output["stdout"]["path"], "backup_archive", format="restic-tar",
                       snapshot_id=snapshot_id, backup_id=backup["Name"])
        index_name = prefix + "-members.json"
        existing = _load_manifest(s, index_name, "backup_member_index")
        if existing:
            if existing.get("archive_sha256") != archive["sha256"]:
                raise ValueError("The original backup archive member index changed.")
            index = existing["index"]
        else:
            index = _tar_index(s, archive["path"])
            observed = {(row["path"], row["size"]) for row in index["entries"] if row["type"] in {"file", "hardlink"}}
            expected = {(_archive_name(row["path"]), int(row.get("size") or 0))
                        for row in nodes if row["type"] == "file"}
            if observed != expected:
                raise ValueError("The original restic archive file inventory differs from its selected snapshot listing.")
            _manifest(s, index_name, {"snapshot_id": snapshot_id, "archive_sha256": archive["sha256"],
                                     "native_listing": listing["stdout"], "index": index},
                      role="backup_member_index")
        artifacts.append(archive)
        artifacts.append(_add(s, s.out / index_name, "backup_member_index", format="restic-archive-members"))
        artifacts.append(_add(s, listing["stdout"]["path"], "backup_listing", format="restic-ls-json", snapshot_id=snapshot_id))
        snapshots.append({"snapshot_id": snapshot_id, "archive_sha256": archive["sha256"],
                          "archive_bytes": archive["size"], "files": index["files"],
                          "file_bytes": index["file_bytes"], "index_sha256": artifacts[-2]["sha256"]})
    context = {**provider_context(s.p), "environment": environment,
               "environment_id": s.p["cluster"] + "/" + s.p["project"] + "/" + environment}
    value = {"schema": VERSION, "provider_context": context, "backup": backup,
             "components": choices, "snapshots": snapshots, "artifacts": artifacts,
             "restic_catalogue_sha256": repository["artifact"]["sha256"],
             "native_policy": {"mysql": s.p["policies"]}, "source_contract": SCOPE}
    artifact = _manifest(s, name, value, role="backup")
    # GovHub source binding uses this precise original format for restoration.
    for item in s.artifacts:
        if item["path"] == artifact["path"] and item["role"] == "backup":
            item["format"] = "skpr-backup-manifest"
            item["provider_context"] = context
    s.state.update(pending_skpr_download=None, phase="native_prepared", native_poll=None)
    s.save_state()
    return {"backup_id": backup["Name"], "environment": environment, "manifest": artifact,
            "components": len(components), "snapshots": len(snapshots)}


def _reviewed_deployment(s, label):
    release = _release(s, s.p["release_version"], label + "-reviewed-release", fresh=True)
    configuration = _configuration(s.p)
    if release["sha256"] != s.p["expected_release_sha256"]:
        raise ValueError("The original selected release changed since it was reviewed.")
    if configuration["sha256"] != s.p["expected_configuration_sha256"]:
        raise ValueError("The original .skpr configuration changed since it was reviewed.")
    return release, configuration


def _deploy(s, operation):
    label = "deploy-reviewed-release"
    step = s.state["steps"].get(label)
    if step and step["phase"] == "completed":
        original_result = _add(s, s.private_path(step["result_file"]), "restored_native_status", format=VERSION)
        if original_result["sha256"] != step["result_sha256"]:
            raise ValueError("The original native deployment completion changed in custody.")
        return s.read_private_json(step["result_file"])
    if step is None:
        release, configuration = _reviewed_deployment(s, "dispatch")
        before = _environment(s, s.p["environment"], "deployment-before", fresh=True)
        step = {"kind": "deployment", "environment": s.p["environment"],
                "version": s.p["release_version"], "release_sha256": release["sha256"],
                "configuration_sha256": configuration["sha256"], "phase": "prepared",
                "before_version": before.get("Version"), "before_phase": before.get("Phase"),
                "command": label}
        s.state["steps"][label] = step
        s.save_state()
    if (step["version"], step["release_sha256"], step["configuration_sha256"]) != (
            s.p["release_version"], s.p["expected_release_sha256"], s.p["expected_configuration_sha256"]):
        raise ValueError("The retained original deployment source changed.")
    record = _request_record(s, label)
    if record is None or record.get("phase") == "not_started":
        _reviewed_deployment(s, "immediate-dispatch")
        step["phase"] = "dispatching"
        s.state["pending_skpr_step"] = label
        s.save_state()
        try:
            record = _command(s, label, ["deploy", s.p["environment"], step["version"]], mutating=True)
        except Exception as exc:
            record = _request_record(s, label)
            if record and record.get("phase") == "not_started":
                step["phase"] = "prepared"
                s.state.update(phase="native_prepared", native_poll=None, pending_command=None)
                s.save_state()
                raise
            if record and record.get("phase") == "complete" and record.get("returncode") != 0:
                step["phase"] = "failed"
                s.state.update(phase="failed", native_poll=None)
                s.save_state()
                raise ValueError("The native deployment returned an error; its full validation or stream output is retained.") from exc
    if record and record.get("phase") == "complete" and record.get("returncode") != 0:
        step["phase"] = "failed"
        s.state.update(phase="failed", native_poll=None)
        s.save_state()
        raise ValueError("The original native deployment returned an error.")
    native = _environment(s, s.p["environment"], "deployment-observe", fresh=True)
    current_release = _release(s, step["version"], "deployment-release-observe", fresh=True)
    native_complete = record and record.get("phase") == "complete" and record.get("returncode") == 0
    changed_version = native.get("Version") != step["before_version"]
    if (native.get("Version") == step["version"] and native.get("Phase") == "Deployed"
            and current_release["sha256"] == step["release_sha256"]
            and (native_complete or changed_version)):
        name = label + "-completed.json"
        completion = _load_manifest(s, name, "restored_native_status")
        if completion is None:
            completion = {"schema": VERSION, "environment": native, "release": current_release,
                "reviewed_configuration_sha256": step["configuration_sha256"],
                "native_completion_basis": "cli-completion-and-environment" if native_complete else "original-release-now-deployed",
                "command": label, "observed_at": _api()._now()}
            _manifest(s, name, completion, "restored_native_status")
        completion_file = _api()._file(s.out / name, "restored_native_status")
        step.update(phase="completed", result_file=str(s.out / name), result_sha256=completion_file["sha256"])
        s.state.update(phase="native_prepared", native_poll=None, pending_command=None, pending_skpr_step=None)
        s.save_state()
        return completion
    step.update(phase="accepted", observed_version=native.get("Version"), native_phase=native.get("Phase"))
    if not native_complete and not changed_version and native.get("Version") == step["version"]:
        s.state.update(phase="native_interrupted", native_poll=None, pending_skpr_step=label)
        s.save_state()
        raise _api().NativeWaiting("Continue the original deployment stream on its operating host; this same-version environment observation is retained with the original command.")
    s.state.update(phase="accepted", native_poll={"provider": "skpr", "kind": "deployment",
                   "id": step["version"], "environment": s.p["environment"], "step": label})
    s.save_state()
    raise _api().NativeWaiting("Observing original Skpr deployment " + step["version"] + ": " + str(native.get("Phase")) + ".")
