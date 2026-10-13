"""Selected native Castor tasks in the existing GovHub operation.
Apache-2.0. Castor remains the task engine; all source and native outputs stay
in the original private Session. See CASTOR_NATIVE.md for the exact contract.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import time

VERSION = "govhub-castor/v1"
CASTOR_COMMIT = "058feddafd0b977eebf33364d02cd553ae26854a"
RUNTIME_FIELDS = {"site_root", "castor_path", "php_path", "git_path", "docker_path"}
KINDS = {"CAPTURE": "capture", "BACKUP_CREATE": "backup", "PREVIEW": "preview",
         "REHEARSAL": "restore", "CUTOVER": "release", "ROLLBACK": "rollback"}
LABELS = {"capture": "Capture complete selected Castor project",
          "backup": "Run the selected native backup task",
          "preview": "Run the selected nonproduction task",
          "restore": "Rehearse the selected native restore",
          "release": "Apply the selected reviewed release task",
          "rollback": "Run the selected reviewed recovery task"}


def _api():
    import native_adapter
    return native_adapter


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _digest(value):
    return hashlib.sha256(_json(value).encode()).hexdigest()


def _name(value, label):
    if not isinstance(value, str) or not value or len(value) > 512 or any(
            c in value for c in ("\x00", "\r", "\n")):
        raise ValueError("Select the actual " + label + ".")
    return value


def _relative(value):
    value = _name(value, "project-relative path")
    if "\\" in value or Path(value).is_absolute() or any(p in {"", ".", ".."} for p in value.split("/")):
        raise ValueError("Use an ordinary project-relative path.")
    return value


def _under(root, relative, *, exists=True):
    relative = _relative(relative)
    root = Path(root).resolve()
    path = root.joinpath(*relative.split("/"))
    current = root
    for part in relative.split("/"):
        current /= part
        if current.is_symlink():
            raise ValueError("An explicitly selected project path is a symlink: " + relative)
    if exists and not path.exists():
        raise ValueError("The selected native project member is absent: " + relative)
    if not path.resolve().is_relative_to(root):
        raise ValueError("A selected project member escaped its original root.")
    return path


def _array(p, key):
    value = p.get(key, "[]")
    if not isinstance(value, str):
        raise ValueError(key + " must retain its explicit JSON text.")
    result = json.loads(value)
    if not isinstance(result, list) or len(result) > 10000:
        raise ValueError(key + " must be a bounded JSON array.")
    return result


def provider_schema():
    def f(name, label, required=False, **extra):
        return {"name": name, "label": label, "type": "text", "required": required, **extra}
    return {"value": "castor", "label": "Castor on-premise application",
            "runtime_fields": sorted(RUNTIME_FIELDS), "fields": [
        f("environment_id", "Existing deployment identity", True),
        f("site_root", "Existing native project directory", True),
        f("castor_path", "Existing Castor or repacked executable", True),
        f("php_path", "Existing PHP launcher for a PHAR",
          help="Optional. The installed Castor release determines its PHP requirement."),
        f("git_path", "Existing Git executable"),
        f("docker_path", "Existing Docker executable"),
        f("docker_context", "Selected native Docker context", True),
        f("castor_file", "Project-relative Castor entrypoint",
          help="Empty for a repacked executable; otherwise the actual root PHP file."),
        f("castor_context", "Selected native Castor context",
          help="Leave empty only when the original application defines no named contexts."),
        f("compose_project", "Existing Compose project name", True),
        f("compose_files_json", "Complete ordered Compose files", True, type="textarea",
          help="JSON array of original project-relative file names."),
        f("source_revision", "Reviewed full Git commit",
          help="Capture first to receive the actual full commit; mutations require it."),
        f("task_name", "Selected existing native task"),
        f("task_args_json", "Exact task argument tokens", type="textarea", default="[]"),
        f("verify_task_name", "Existing native verification task"),
        f("verify_args_json", "Exact verification argument tokens", type="textarea", default="[]"),
        f("verify_source", "Verification JSON source", default="stdout",
          help="stdout or file. The original task must actually provide this JSON."),
        f("verify_output_path", "Project-relative verification JSON file"),
        f("verification_checks_json", "Native verification comparisons", type="textarea", default="[]",
          help='JSON array of {"pointer":"/actual/path","equals":<actual expected value>} objects.'),
        f("task_outputs_json", "Complete task output selection", type="textarea", default="[]",
          help='JSON array of {"path":"relative","role":"database|files|...","kind":"file|directory"}.'),
        f("backup_inputs_json", "Reviewed original recovery input files", type="textarea", default="[]",
          help='JSON array of {"path":"relative","role":"...","kind":"file|directory","sha256":"original file or directory-manifest SHA256"}.'),
        f("release_files_json", "Complete release executables and configuration", type="textarea", default="[]"),
        f("source_images_json", "Selected immutable image IDs or digests", type="textarea", default="[]",
          help="Empty selects the complete current native Compose image cohort."),
        f("timeout_seconds", "Native command timeout, seconds", type="integer", default=900,
          minimum=10, maximum=86400),
        f("max_artifact_bytes", "Maximum retained individual file bytes", type="integer",
          default=2147483648, minimum=1048576),
    ]}


def profile(config, runtime_bindings=None):
    if not isinstance(config, dict) or config.get("source_kind") != "castor":
        raise ValueError("Select the original Castor application profile.")
    allowed = {"source_kind", "target_fingerprint"} | {v["name"] for v in provider_schema()["fields"]}
    if set(config) - allowed:
        raise ValueError("Unsupported Castor profile fields: " + ", ".join(sorted(set(config) - allowed)))
    p = dict(config)
    if runtime_bindings:
        if not isinstance(runtime_bindings, dict) or set(runtime_bindings) - RUNTIME_FIELDS:
            raise ValueError("Only the original native host paths can be rebound.")
        p.update(runtime_bindings)
    _name(p.get("environment_id"), "deployment identity")
    root = Path(p.get("site_root", "")).expanduser()
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise ValueError("Select the original absolute native project directory.")
    p["site_root"] = str(root.resolve())
    for key, default in (("castor_path", None), ("git_path", "git"), ("docker_path", "docker")):
        selected = p.get(key) or default
        p[key] = _api()._binary(selected, executable=not (key == "castor_path" and p.get("php_path")))
    if p.get("php_path"):
        p["php_path"] = _api()._binary(p["php_path"])
    if p.get("castor_file"):
        _under(root, p["castor_file"])
    for key in ("docker_context", "compose_project"):
        _name(p.get(key), key)
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", p["compose_project"]):
        raise ValueError("Select the actual native Compose project name.")
    if p.get("castor_context"):
        _name(p["castor_context"], "Castor context")
    for key, default, lower, upper in (("timeout_seconds", 900, 10, 86400),
                                      ("max_artifact_bytes", 2147483648, 1048576, 2**53 - 1)):
        value = p.get(key, default)
        if type(value) is not int or not lower <= value <= upper:
            raise ValueError("Invalid " + key + ".")
        p[key] = value
    if p.get("source_revision") and not re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", p["source_revision"]):
        raise ValueError("Select the original complete Git commit.")
    for key in ("compose_files_json", "release_files_json"):
        values = _array(p, key)
        if key == "compose_files_json" and not values:
            raise ValueError("Select every original Compose file in its native order.")
        for value in values:
            _under(root, value)
        if len(values) != len(set(values)):
            raise ValueError("An original selected file is repeated.")
    for key in ("task_args_json", "verify_args_json"):
        _arguments(_array(p, key))
    for key in ("task_outputs_json", "backup_inputs_json"):
        paths = []
        for item in _array(p, key):
            if not isinstance(item, dict):
                raise ValueError("Select complete original " + key + " records.")
            _relative(item.get("path"))
            _name(item.get("role"), "output role")
            paths.append(item["path"])
            if key == "task_outputs_json":
                if item.get("kind") not in {"file", "directory"} or set(item) != {"path", "role", "kind"}:
                    raise ValueError("Declare each task output's exact path, role and kind.")
            elif (set(item) not in ({"path", "role", "sha256"}, {"path", "role", "kind", "sha256"})
                    or item.get("kind", "file") not in {"file", "directory"}
                    or not re.fullmatch(r"[a-f0-9]{64}", str(item.get("sha256", "")))):
                raise ValueError("Select each original recovery file or directory's complete SHA256 identity.")
        if len(paths) != len(set(paths)):
            raise ValueError("An original output/input is selected twice.")
    for image in _array(p, "source_images_json"):
        if not isinstance(image, str) or not re.fullmatch(r"(?:sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})", image):
            raise ValueError("Select immutable native image IDs or repository digests.")
    for name in ("task_name", "verify_task_name"):
        if p.get(name):
            _task_name(p[name])
    if p.get("verify_source", "stdout") not in {"stdout", "file"}:
        raise ValueError("Choose original verification stdout or file.")
    if p.get("verify_output_path"):
        _relative(p["verify_output_path"])
    for check in _array(p, "verification_checks_json"):
        if not isinstance(check, dict) or set(check) != {"pointer", "equals"} or not isinstance(check["pointer"], str) or (
                check["pointer"] and not check["pointer"].startswith("/")):
            raise ValueError("Declare native JSON pointer/expected-value comparisons.")
    return p


def _task_name(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9:_.-]{0,511}", value):
        raise ValueError("Select an exact original named Castor task.")
    if value in {"list", "help", "execute", "repack", "compile", "composer", "self-update"} or value.startswith("castor:"):
        raise ValueError("Select the application's own named task; keep build/tool maintenance separate.")
    return value


def _arguments(value):
    for item in value:
        if not isinstance(item, str) or "\x00" in item or len(item) > 65536:
            raise ValueError("Native arguments must remain complete string tokens.")
        if item.startswith("-c") and not item.startswith("--"):
            raise ValueError("Task arguments cannot override the original context shortcut.")
        if item.split("=", 1)[0] in {"--context", "-c", "--castor-file", "--working-dir", "--interactive",
                                    "--update-remotes", "--no-remote"}:
            raise ValueError("Task arguments cannot replace the bound native root/context/import selection.")
    return value


def provider_context(p):
    return {"source_kind": "castor", "environment_id": p["environment_id"],
            "compose_project": p["compose_project"], "docker_context": p["docker_context"],
            "castor_context": p.get("castor_context", ""), "castor_file": p.get("castor_file", "")}


def actions_for(kind):
    action = KINDS.get(kind)
    if not action:
        return []
    required = [] if action == "capture" else ["source_revision", "task_name", "verify_task_name", "verification_checks_json"]
    if action == "backup":
        required.append("task_outputs_json")
    if action in {"restore", "rollback"}:
        required.append("backup_inputs_json")
    return [{"value": "castor-" + action, "label": LABELS[action], "required_profile_fields": required}]


def pollable(resume):
    # Local native tasks have no separate provider job queue. An unknown exit
    # stays attached to its original process/journal, never becomes a new task.
    return False


def resume_fields(operation, payload, reason):
    if not str(operation.get("native_action", "")).startswith("castor-"):
        raise ValueError("Continue the original Castor operation.")
    value = {}
    if "runtime_bindings" in payload:
        selected = profile(operation["profile"]["config"], payload["runtime_bindings"])
        value["runtime_bindings"] = {k: selected.get(k, "") for k in payload["runtime_bindings"]}
    if payload.get("castor_command_receipt"):
        path = Path(payload["castor_command_receipt"]).expanduser()
        if not path.is_absolute() or path.is_symlink() or not path.is_file():
            raise ValueError("Select the actual original completed Session command receipt.")
        pending = operation.get("resume_checkpoint") or {}
        if not pending.get("pending_command") and pending.get("phase") not in {"native_interrupted", "dispatching"}:
            raise ValueError("This original operation has no uncertain native command to reconcile.")
        value["castor_command_receipt"] = {"path": str(path.resolve()), "reason": str(reason),
                                           "request_sha256": pending.get("request_sha256")}
    return value


def _retain(s, path, role, **extra):
    item = s.add(path, role, **extra)
    rows = s.state.setdefault("retained_artifacts", [])
    old = next((x for x in rows if x["path"] == item["path"]), None)
    if old and (old["sha256"], old["size"]) != (item["sha256"], item["size"]):
        raise ValueError("An original retained artifact was modified.")
    if old is None:
        rows.append(item)
    return item


def _record(s, name, value, role):
    path = s.out / name
    if path.exists() and json.loads(path.read_bytes()) != value:
        path = path.with_name(path.stem + "-" + _digest(value) + path.suffix)
    if not path.exists():
        _api()._atomic(path, value)
    return _retain(s, path, role)


def _load(s, supplied=None):
    path = s.out / "native-state.json"
    saved = s.read_private_json(path) if path.exists() else supplied or {}
    saved = saved.get("resume_checkpoint", saved.get("state", saved))
    s.state = dict(s.resolve_private(saved))
    if s.out.is_relative_to(Path(s.p["site_root"])):
        raise ValueError("Keep the receiving Session outside its selected source project tree.")
    if s.state.get("provider") not in (None, "castor"):
        raise ValueError("This original Session belongs to another provider.")
    s.state["provider"] = "castor"


def _bind(s, operation_id, action, original_config):
    value = {"operation_id": operation_id, "action": action, "target": provider_context(s.p),
             "profile": {k: v for k, v in original_config.items() if k not in RUNTIME_FIELDS}}
    digest = _digest(value)
    if s.state.get("intent_sha256") not in (None, digest):
        raise ValueError("The retained Castor instruction belongs to another original operation.")
    s.state.update(intent=value, intent_sha256=digest)
    s.save_state()


def _command(s, label, argv, *, mutating=False):
    path = s.out / (label + ".command.json")
    # Reopen completed commands as their exact original native invocation, even
    # on a receiving host with explicit new executable locations.
    previous = s.read_private_json(path) if path.exists() else None
    if previous and previous.get("phase") == "complete":
        argv = previous["argv"]
    try:
        result = s.command(label, argv, mutating=mutating)
    except _api().NativeWaiting:
        if path.exists():
            retained = s.read_private_json(path)
            if retained.get("phase") not in {"complete", "not_started"}:
                s.state.update(phase="native_interrupted", pending_command=label, command_record=str(path))
                s.save_state()
        raise
    for role in ("stdout", "stderr"):
        _retain(s, result[role]["path"], "native_" + role)
    _retain(s, path, "native_command")
    return result


def _bytes(record, role="stdout"):
    path = Path(record[role]["path"])
    raw = path.read_bytes()
    if len(raw) != record[role]["size"] or hashlib.sha256(raw).hexdigest() != record[role]["sha256"]:
        raise ValueError("An original native command output changed.")
    return raw


def _parsed(record):
    try:
        return json.loads(_bytes(record))
    except (UnicodeDecodeError, ValueError) as exc:
        raise ValueError("The selected native command did not return complete JSON; inspect its unchanged stdout.") from exc


def _castor(p, task, args=None, *, context=True):
    result = ([p["php_path"]] if p.get("php_path") else []) + [p["castor_path"]]
    if p.get("castor_file"):
        result.append("--castor-file=" + str(_under(p["site_root"], p["castor_file"])))
    result.extend(["--no-interaction", "--no-ansi"])
    if context and p.get("castor_context"):
        result.append("--context=" + p["castor_context"])
    return result + [task] + (args or [])


def _compose(p):
    result = [p["docker_path"], "--context", p["docker_context"], "compose",
              "--project-directory", p["site_root"], "--project-name", p["compose_project"]]
    for item in _array(p, "compose_files_json"):
        result.extend(["--file", str(_under(p["site_root"], item))])
    return result



def _file_identity(path):
    digest = hashlib.sha256()
    size = 0
    with Path(path).open("rb") as stream:
        before = os.fstat(stream.fileno())
        for block in iter(lambda: stream.read(1048576), b""):
            digest.update(block)
            size += len(block)
        after = os.fstat(stream.fileno())
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or size != before.st_size:
        raise ValueError("An original native file changed while its complete bytes were received.")
    return {"bytes": size, "sha256": digest.hexdigest()}


def _working_tree(s, label, root=None, depth=0):
    """Hash actual Git-selected files, index entries and nested worktrees."""
    if depth > 30:
        raise ValueError("The selected original submodule nesting is excessive.")
    root = Path(root or s.p["site_root"])
    command = [s.p["git_path"], "-C", str(root)]
    tracked = _bytes(_command(s, label + "-index", command + ["ls-files", "--stage", "-z"]))
    other = _bytes(_command(s, label + "-untracked", command + ["ls-files", "--others", "--exclude-standard", "-z"]))
    entries = {}
    for row in tracked.split(b"\x00"):
        if not row:
            continue
        metadata, raw_path = row.split(b"\t", 1)
        mode, blob, stage = metadata.decode("ascii").split(" ")
        relative = raw_path.decode("utf-8", "strict")
        _relative(relative)
        if stage != "0":
            raise ValueError("Resolve the original native source's Git index conflict before commissioning.")
        entries[relative] = {"path": relative, "git_mode": mode, "git_blob": blob}
    for raw_path in other.split(b"\x00"):
        if raw_path:
            relative = raw_path.decode("utf-8", "strict")
            _relative(relative)
            entries[relative] = {"path": relative, "git_mode": None, "git_blob": None}
    result = []
    for relative, entry in sorted(entries.items()):
        path = root / relative
        # A tracked symlink is observed as its link value, never followed.
        if path.is_symlink():
            entry.update(kind="symlink", target=os.readlink(path))
        elif not path.exists():
            entry["kind"] = "absent"
        elif entry["git_mode"] == "160000":
            if not path.is_dir():
                raise ValueError("The original submodule is no longer a directory.")
            prefix = label + "-sub-" + hashlib.sha256(relative.encode()).hexdigest()[:20]
            nested = _working_tree(s, prefix, path, depth + 1)
            head = _bytes(_command(s, prefix + "-head", command[:1] + ["-C", str(path), "rev-parse", "HEAD"])).decode().strip()
            entry.update(kind="submodule", head_commit=head, source=nested)
        elif path.is_file():
            before = path.stat()
            identity = _file_identity(path)
            after = path.stat()
            if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
                raise ValueError("An original source member changed while its identity was read.")
            entry.update(kind="file", mode=after.st_mode & 0o777, **identity)
        else:
            raise ValueError("An original Git-selected member is not an ordinary source file.")
        result.append(entry)
    return {"members": result, "sha256": _digest(result)}


def _inventory(s, label, *, selected=True):
    p = s.p
    head_record = _command(s, label + "-head", [p["git_path"], "rev-parse", "--verify", "HEAD"])
    head = _bytes(head_record).decode().strip()
    if not re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", head):
        raise ValueError("Native Git did not identify the complete current commit.")
    status = _command(s, label + "-git-status", [p["git_path"], "status", "--porcelain=v1", "-z", "--untracked-files=all"])
    version = _command(s, label + "-version", _castor(p, "--version", context=False))
    listing = _command(s, label + "-tasks", _castor(p, "list", ["--format=json"], context=False))
    catalog = _parsed(listing)
    if not isinstance(catalog, dict) or not isinstance(catalog.get("commands"), list):
        raise ValueError("The installed Castor list did not return its native command catalogue.")
    help_rows = {}
    if selected:
        for key in ("task_name", "verify_task_name"):
            if p.get(key):
                help_result = _command(s, label + "-" + key + "-help",
                    _castor(p, "help", [p[key], "--format=json"]))
                help_rows[key] = _parsed(help_result)
                if help_rows[key].get("name") != p[key]:
                    raise ValueError("Native task help resolved to a different original task.")
                options = help_rows[key].get("definition", {}).get("options", {})
                context_option = options.get("context") if isinstance(options, dict) else next((x for x in options if x.get("name") == "--context"), None)
                if context_option and not p.get("castor_context"):
                    raise ValueError("Select the actual named native context before this task can run.")
    engine = _parsed(_command(s, label + "-engine",
        [p["docker_path"], "--context", p["docker_context"], "info", "--format", "{{json .}}"]))
    if not isinstance(engine, dict) or not engine.get("ID"):
        raise ValueError("Native Docker did not return the selected engine identity.")
    compose = _parsed(_command(s, label + "-compose-config", _compose(p) + ["config", "--format", "json"]))
    ps_raw = _bytes(_command(s, label + "-compose-ps", _compose(p) + ["ps", "--all", "--format", "json"]))
    try:
        containers = json.loads(ps_raw or b"[]")
        if isinstance(containers, dict):
            containers = [containers]
    except ValueError:
        containers = [json.loads(line) for line in ps_raw.splitlines() if line.strip()]
    if not isinstance(containers, list):
        raise ValueError("The native Compose container census is not a complete array.")
    images_raw = _bytes(_command(s, label + "-compose-images", _compose(p) + ["images", "--format", "json"]))
    try:
        images = json.loads(images_raw or b"[]")
        if isinstance(images, dict):
            images = [images]
    except ValueError:
        images = [json.loads(line) for line in images_raw.splitlines() if line.strip()]
    working_tree = _working_tree(s, label + "-source")
    bindings = {}
    for relative in _array(p, "compose_files_json") + _array(p, "release_files_json") + ([p["castor_file"]] if p.get("castor_file") else []):
        path = _under(p["site_root"], relative)
        if not path.is_file():
            raise ValueError("Select ordinary native release/configuration files.")
        bindings[relative] = _file_identity(path)
    return {"project": provider_context(p), "head_commit": head, "git_status_sha256": status["stdout"]["sha256"],
            "castor_version": _bytes(version).decode("utf-8", "strict").strip(),
            "native_executables": {key: _file_identity(p[key]) for key in ("castor_path", "php_path") if p.get(key)},
            "tasks": catalog["commands"], "task_definitions": help_rows,
            "docker_engine": engine, "compose_config": compose, "containers": containers, "images": images,
            "selected_files": bindings, "working_tree": working_tree, "observed_at": _api()._now()}


def _binding(inventory):
    return {"project": inventory["project"], "head_commit": inventory["head_commit"],
            "git_status_sha256": inventory["git_status_sha256"],
            "working_tree_sha256": inventory["working_tree"]["sha256"],
            "engine_id": inventory["docker_engine"]["ID"],
            "castor_version": inventory["castor_version"], "native_executables": inventory["native_executables"],
            "selected_files": inventory["selected_files"], "compose_config": inventory["compose_config"],
            "task_definitions": inventory["task_definitions"]}


def _source(s, inventory, phase):
    import castor_source
    selected = dict(s.p)
    selected["source_revision"] = inventory["head_commit"]
    selected["capture_phase"] = phase
    if phase == "before":
        # These files are produced by the selected task. A pre-task capture
        # retains existing members, but may legitimately precede their creation.
        selected["allow_missing_task_outputs"] = True
    result = castor_source.capture_source(s, inventory, selected)
    for item in list(s.artifacts):
        current = _retain(s, item["path"], item["role"], **{k: v for k, v in item.items() if k not in {"path", "role", "sha256", "size"}})
        if current["sha256"] != item["sha256"] or current["size"] != item["size"]:
            raise ValueError("An original helper source artifact changed before completion.")
    s.state.setdefault("source_captures", {})[phase] = result
    s.save_state()
    return result


def _directory_members(path):
    members = []
    for member in sorted(path.rglob("*")):
        if member.is_symlink():
            raise ValueError("A declared native directory contains a symlink.")
        if member.is_file():
            members.append({"path": member.relative_to(path).as_posix(), **_file_identity(member)})
        elif not member.is_dir():
            raise ValueError("A declared native directory contains a nonordinary member.")
    return members


def _inputs(s):
    result = []
    for selected in _array(s.p, "backup_inputs_json"):
        path = _under(s.p["site_root"], selected["path"])
        kind = selected.get("kind", "file")
        if kind == "file":
            if not path.is_file():
                raise ValueError("The reviewed recovery input must be an ordinary complete file.")
            identity = _file_identity(path)
        else:
            if not path.is_dir():
                raise ValueError("The reviewed recovery input must be its original complete directory.")
            members = _directory_members(path)
            identity = {"members": members, "sha256": _digest(members)}
        if identity["sha256"] != selected["sha256"]:
            raise ValueError("An original reviewed recovery input has changed.")
        result.append({**selected, "kind": kind, **identity})
    return result


def _outputs(s, *, required):
    result = []
    for selected in _array(s.p, "task_outputs_json"):
        path = _under(s.p["site_root"], selected["path"], exists=required)
        if not path.exists():
            result.append({**selected, "present": False})
            continue
        if selected["kind"] == "file":
            if not path.is_file():
                raise ValueError("The selected native output is not an ordinary file.")
            result.append({**selected, "present": True, **_file_identity(path)})
        else:
            if not path.is_dir():
                raise ValueError("The selected native output is not a directory.")
            members = _directory_members(path)
            result.append({**selected, "present": True, "members": members, "manifest_sha256": _digest(members)})
    return result


def _pointer(value, pointer):
    for raw in pointer.split("/")[1:] if pointer else []:
        if re.search(r"~(?![01])", raw):
            raise ValueError("Invalid native JSON pointer escape.")
        key = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(value, list):
            if not re.fullmatch(r"0|[1-9][0-9]*", key):
                raise ValueError("Select an actual array position in the native report.")
            value = value[int(key)]
        elif isinstance(value, dict):
            value = value[key]
        else:
            raise ValueError("A native verification pointer crosses a scalar value.")
    return value


def _verify(s):
    p = s.p
    result = _command(s, "verify-task", _castor(p, p["verify_task_name"], _array(p, "verify_args_json")), mutating=True)
    retained = s.state.get("verification_report")
    if retained:
        raw = Path(s.private_path(retained["path"])).read_bytes()
        if hashlib.sha256(raw).hexdigest() != retained["sha256"] or len(raw) != retained["size"]:
            raise ValueError("The original native verification bytes changed.")
    else:
        if p.get("verify_source", "stdout") == "file":
            original = _under(p["site_root"], p["verify_output_path"])
            raw = original.read_bytes()
        else:
            raw = _bytes(result)
        if len(raw) > p["max_artifact_bytes"]:
            raise ValueError("The native verification report exceeds the selected intake bound.")
        saved = s.out / ("verification-report-" + hashlib.sha256(raw).hexdigest() + ".json")
        if not saved.exists():
            with saved.open("xb") as output:
                output.write(raw)
                output.flush()
                os.fsync(output.fileno())
        s.state["verification_report"] = _retain(s, saved, "native_verification_report")
        s.save_state()
    if len(raw) > p["max_artifact_bytes"]:
        raise ValueError("The native verification report exceeds the selected intake bound.")
    actual = json.loads(raw)
    checks = []
    for selected in _array(p, "verification_checks_json"):
        observed = _pointer(actual, selected["pointer"])
        matched = _json(observed) == _json(selected["equals"])
        checks.append({**selected, "observed": observed, "matched": matched})
    outcome = {"checks": checks, "report_sha256": hashlib.sha256(raw).hexdigest(),
               "passed": bool(checks) and all(row["matched"] for row in checks)}
    _record(s, "native-verification.json", outcome, "native_verification")
    if not outcome["passed"]:
        raise ValueError("The actual native verification did not satisfy all reviewed comparisons.")
    s.state["verification"] = outcome
    s.save_state()
    return outcome


def _recover_receipt(s, operation):
    incoming = operation.get("castor_command_receipt")
    if not incoming:
        return
    accepted = s.state.setdefault("received_command_receipts", {})
    for item in accepted.values():
        if item.get("selection") == incoming:
            return
    if incoming.get("request_sha256") != s.state.get("request_sha256"):
        raise ValueError("The selected command receipt belongs to another original request.")
    source = Path(s.private_path(incoming["path"]))
    raw = source.read_bytes()
    receipt_hash = hashlib.sha256(raw).hexdigest()
    if any(item["sha256"] == receipt_hash for item in accepted.values()):
        return
    label = s.state.get("pending_command")
    if not label or not re.fullmatch(r"[A-Za-z0-9_.-]+", label):
        raise ValueError("No original native command is awaiting its completion; retain the already accepted receipt.")
    if label in accepted:
        raise ValueError("The already accepted original native receipt cannot be replaced.")
    original_path = s.out / (label + ".command.json")
    original = s.read_private_json(original_path)
    retained = s.out / ("received-command-receipt-" + receipt_hash + ".json")
    if not retained.exists():
        with retained.open("xb") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
    _retain(s, retained, "original_native_receipt")
    # Compare both receipts in the same receiving-workspace view while the
    # complete incoming bytes remain unchanged in retained custody.
    completed = s.resolve_private(json.loads(raw))
    for key in ("argv", "cwd", "started_at", "mutating", "stdin"):
        if completed.get(key) != original.get(key):
            raise ValueError("The native receipt does not match the exact original command " + key + ".")
    if original.get("pid") is not None and completed.get("pid") != original["pid"]:
        raise ValueError("The completion names a different original process.")
    if completed.get("phase") != "complete" or type(completed.get("returncode")) is not int or not completed.get("completed_at"):
        raise ValueError("Select the native observed exit receipt, not an inferred task outcome.")
    for role in ("stdout", "stderr"):
        item = completed[role]
        path = Path(item["path"])
        if not path.is_absolute() or path.is_symlink() or not path.is_file():
            raise ValueError("The native receipt must include complete original output files.")
        observed = _api()._file(path, role)
        if observed["sha256"] != item["sha256"] or observed["size"] != item["size"]:
            raise ValueError("The selected native output does not match its receipt.")
        copied = s.out / (label + ".received-" + receipt_hash + "." + role)
        if copied.exists():
            if _file_identity(copied)["sha256"] != item["sha256"]:
                raise ValueError("A retained received output changed.")
        else:
            shutil.copyfile(path, copied)
        completed[role] = _api()._file(copied, role)
    _record(s, label + "-before-receiving.json", original, "original_interrupted_command")
    _api()._atomic(original_path, completed)
    s.state.setdefault("completed_commands", {})[label] = completed
    s.state.update(phase="native_prepared" if completed["returncode"] == 0 else "native_failed", pending_command=None)
    s.state["received_command_receipts"][label] = {"sha256": receipt_hash, "reason": incoming["reason"],
        "label": label, "request_sha256": s.state.get("request_sha256"), "selection": incoming,
        "retained_path": str(retained)}
    s.save_state()


def _finish(s, observations):
    value = {"schema": VERSION, "intent_sha256": s.state["intent_sha256"],
             "provider_context": provider_context(s.p), "observations": observations,
             "artifacts": list(s.state.get("retained_artifacts", []))}
    path = s.out / "castor-completed-operation.json"
    if path.exists() and json.loads(path.read_bytes()) != value:
        raise ValueError("The original completed Castor outcome cannot be replaced.")
    _api()._atomic(path, value)
    s.state.update(phase="completed", completion=str(path))
    s.save_state()
    return _completed(s, value)


def _completed(s, value):
    if value.get("intent_sha256") != s.state["intent_sha256"]:
        raise ValueError("This original completed outcome belongs to another instruction.")
    s.artifacts = []
    for item in value["artifacts"]:
        path = s.private_path(item["path"])
        observed = _api()._file(path, item["role"])
        if observed["sha256"] != item["sha256"] or observed["size"] != item["size"]:
            raise ValueError("A retained complete Castor artifact changed.")
        s.add(path, item["role"])
    s.add(s.out / "castor-completed-operation.json", "restored_native_status")
    return s.result("COMPLETE", value["observations"])


def _failure(s, exc):
    waiting = isinstance(exc, _api().NativeWaiting) or s.state.get("phase") in {"native_interrupted", "dispatching"}
    status = "WAITING_NATIVE" if waiting else "CANCELLED" if isinstance(exc, _api().NativeCancelled) else "FAILED"
    s.artifacts = list(s.state.get("retained_artifacts", []))
    result = s.result(status, message=str(exc))
    label = s.state.get("pending_command")
    record = None
    if label and (s.out / (label + ".command.json")).exists():
        record = s.read_private_json(s.out / (label + ".command.json"))
    result["native_resume"] = {"provider": "castor", "phase": s.state.get("phase"),
        "request_sha256": s.state.get("request_sha256"), "command_label": label,
        "command_record": str(s.out / (label + ".command.json")) if label else None,
        "original_process": {k: record.get(k) for k in ("pid", "started_at", "phase", "returncode")} if record else None}
    result["safe_to_retry"] = not waiting
    return result


def discover_capabilities(config, runtime_bindings=None):
    value = {"ready": False, "actions": [], "configuration": dict(config), "current_config": dict(config)}
    try:
        p = profile(config, runtime_bindings)
        with tempfile.TemporaryDirectory(prefix="govhub-castor-capabilities-") as folder:
            s = _api().Session(p, folder)
            _load(s)
            inventory = _inventory(s, "capability")
            value.update(ready=True, target_fingerprint=_digest(provider_context(p)),
                native_inventory=inventory,
                native_status={"head_commit": inventory["head_commit"], "castor_version": inventory["castor_version"],
                    "docker_engine_id": inventory["docker_engine"]["ID"], "compose_project": p["compose_project"],
                    "task_count": len(inventory["tasks"]), "containers": inventory["containers"]},
                actions=[row for kind in KINDS for row in actions_for(kind)])
    except Exception as exc:
        value["error"] = str(exc)
    return value


def capture(config, context, checkpoint=None, cancelled=None):
    p = profile(config, context.get("runtime_bindings"))
    s = _api().Session(p, context["output_dir"], checkpoint, cancelled, context.get("workspace_relocations"))
    try:
        _load(s, context.get("checkpoint"))
        expected = context.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _digest(provider_context(p)):
            raise ValueError("The original capture target fingerprint changed.")
        _bind(s, context.get("operation_id"), "capture", config)
        completed = s.out / "castor-completed-operation.json"
        if completed.exists():
            return _completed(s, s.read_private_json(completed))
        _recover_receipt(s, context)
        inventory = s.state.get("capture_inventory")
        if inventory is None:
            inventory = _inventory(s, "capture")
            s.state["capture_inventory"] = inventory
            s.save_state()
        if p.get("source_revision") and p["source_revision"] != inventory["head_commit"]:
            raise ValueError("The original selected Git revision changed.")
        source = _source(s, inventory, "capture")
        following = _inventory(s, "capture-following")
        if _binding(following) != _binding(inventory):
            raise ValueError("The native source/engine/configuration changed during full capture.")
        return _finish(s, {"native_action": "castor-capture", "native_inventory": inventory,
                          "following_inventory": following, "source": source,
                          "consistency": "original native task/source outputs; no database/files transaction is inferred"})
    except Exception as exc:
        return _failure(s, exc)


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    p = profile(config, operation.get("runtime_bindings"))
    s = _api().Session(p, source_paths["output_dir"], checkpoint, cancelled, source_paths.get("workspace_relocations"))
    try:
        _load(s, source_paths.get("checkpoint") or operation.get("resume_checkpoint"))
        action = str(operation.get("native_action", "")).removeprefix("castor-")
        if action == "capture" or KINDS.get(operation.get("type")) != action:
            raise ValueError("Select the exact native task purpose from the original reviewed operation.")
        if action == "preview" and operation.get("environment", {}).get("data", {}).get("purpose") not in {"Candidate", "Rehearsal"}:
            raise ValueError("Select the explicitly designated nonproduction environment for a preview task.")
        if operation.get("provider_environment_id") != p["environment_id"]:
            raise ValueError("The original native operation names a different deployment.")
        expected = operation.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _digest(provider_context(p)):
            raise ValueError("The original native target identity changed.")
        _bind(s, operation["id"], action, config)
        completed = s.out / "castor-completed-operation.json"
        if completed.exists():
            return _completed(s, s.read_private_json(completed))
        _recover_receipt(s, operation)
        if not p.get("source_revision") or not p.get("task_name") or not p.get("verify_task_name") or not _array(p, "verification_checks_json"):
            raise ValueError("Select the original source commit, native task and complete verification comparisons.")
        if p.get("verify_source", "stdout") == "file" and not p.get("verify_output_path"):
            raise ValueError("Select the actual native verification report path.")
        if action == "backup" and not _array(p, "task_outputs_json"):
            raise ValueError("Select the complete actual database/files backup outputs.")
        if action in {"restore", "rollback"} and not _array(p, "backup_inputs_json"):
            raise ValueError("Select the original hash-bound recovery input files.")
        original = s.state.get("before")
        if original is None:
            original = _inventory(s, "before")
            if original["head_commit"] != p["source_revision"]:
                raise ValueError("The current source differs from the reviewed commit.")
            s.state.update(before=original, backup_inputs=_inputs(s), before_outputs=_outputs(s, required=False))
            s.save_state()
        argv = _castor(p, p["task_name"], _array(p, "task_args_json"))
        request = {"task": p["task_name"], "args": _array(p, "task_args_json"),
                   "context": provider_context(p), "source": _binding(original),
                   "backup_inputs": s.state["backup_inputs"], "verification": {
                       k: p.get(k) for k in ("verify_task_name", "verify_args_json", "verify_source",
                                             "verify_output_path", "verification_checks_json")}}
        request_sha = _digest(request)
        if s.state.get("request_sha256") not in (None, request_sha):
            raise ValueError("The retained original native request changed.")
        s.state.update(request=request, request_sha256=request_sha)
        s.save_state()
        task_record = s.out / "application-task.command.json"
        dispatched = task_record.exists() and s.read_private_json(task_record).get("phase") not in {"not_started", "prepared"}
        if not dispatched and not s.state.get("task_completed"):
            if not s.state.get("before_source"):
                s.state["before_source"] = _source(s, original, "before")
                s.save_state()
            fresh = _inventory(s, "dispatch-" + str(time.time_ns()))
            if _binding(fresh) != _binding(original) or _inputs(s) != s.state["backup_inputs"]:
                raise ValueError("The original source/configuration/engine/recovery inputs changed before dispatch.")
        native = _command(s, "application-task", argv, mutating=True)
        s.state["task_completed"] = {"returncode": native["returncode"], "completed_at": native["completed_at"]}
        s.save_state()
        verification = s.state.get("verification") or _verify(s)
        outputs = s.state.get("after_outputs")
        if outputs is None:
            outputs = _outputs(s, required=True)
            s.state["after_outputs"] = outputs
            s.save_state()
        elif outputs != _outputs(s, required=True):
            raise ValueError("The completed native task outputs changed before full receiving.")
        following = s.state.get("after_inventory")
        if following is None:
            following = _inventory(s, "after")
            if following["docker_engine"]["ID"] != original["docker_engine"]["ID"]:
                raise ValueError("The native task continued on another Docker engine.")
            s.state["after_inventory"] = following
            s.save_state()
        source = s.state.get("after_source")
        if source is None:
            source = _source(s, following, "after")
            final_inventory = _inventory(s, "source-after-" + str(time.time_ns()))
            if _binding(final_inventory) != _binding(following):
                raise ValueError("The actual post-task source/engine/configuration changed during receiving.")
            if outputs != _outputs(s, required=True):
                raise ValueError("The original task outputs changed during complete source capture.")
            s.state["after_source"] = source
            s.save_state()
        return _finish(s, {"native_action": "castor-" + action, "native_inventory": following,
            "before_inventory": original, "source": source, "before_source": s.state["before_source"],
            "task_result": s.state["task_completed"], "verification": verification,
            "task_outputs": outputs, "backup_inputs": s.state["backup_inputs"],
            "request_sha256": request_sha, "native_result": "verified",
            "consistency": "actual selected task and original verification report; no inferred transactional snapshot"})
    except Exception as exc:
        return _failure(s, exc)
