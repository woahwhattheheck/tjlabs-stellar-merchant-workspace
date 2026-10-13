"""Capture a complete original Tome build into the existing GovHub operation.

The installed Drupal/Tome services perform generation. Native Session owns every
Drush process, cancellation and retained command. Static release state belongs
to static_releases and the existing workspace; this module only supplies the
unchanged native inputs and a complete, immutable build report.
"""
from __future__ import annotations

import contextlib
import fcntl
import hashlib
import json
import os
import re
import shutil
import stat
import tempfile
import time
from pathlib import Path

import native_adapter as native

VERSION = "govhub.tome-native.v1"
PUBLISHED_TOME = {
    "package": "drupal/tome", "version": "8.x-1.16",
    "url": "https://ftp.drupal.org/files/projects/tome-8.x-1.16.tar.gz",
    "archive_sha256": "a762990bf2c1fc9111db14fa537ab60db84499ce5130824dc217aae98dd63bfe",
}
MODULE = Path(__file__).parent / "native_modules" / "tjl_tome_capture"
REQUIRED = {"php:script", "tome:static", "config:export", "sql:dump", "archive:dump"}


def configuration_schema():
    fields = [
        {"name": "environment_id", "label": "Environment reference", "type": "text", "required": True},
        {"name": "drush_path", "label": "Existing Drush executable", "type": "text", "required": True},
        {"name": "php_path", "label": "PHP executable, when required", "type": "text", "required": False},
        {"name": "site_root", "label": "Native Drupal root", "type": "text", "required": True},
        {"name": "restore_destination", "label": "Reviewed project restore directory", "type": "text", "required": False},
        {"name": "files_relative_path", "label": "Drupal files directory within the project", "type": "text", "required": False},
        {"name": "site_alias", "label": "Existing local Drush alias", "type": "text", "required": False},
        {"name": "uri", "label": "Site URI", "type": "text", "required": True},
        {"name": "timeout_seconds", "label": "Native command timeout (seconds)", "type": "integer",
         "default": 600, "minimum": 10, "maximum": 7200},
        {"name": "max_artifact_bytes", "label": "Maximum individual artifact bytes", "type": "integer",
         "default": 1073741824, "minimum": 1048576},
    ]
    return {"value": "tome", "label": "Drupal / Tome complete static edition",
            "fields": [*fields,
                {"name": "static_directory", "label": "Original Tome working output directory",
                 "type": "text", "required": True,
                 "help": "The existing absolute path selected by tome_static_directory; this differs from the reviewed release target."},
                {"name": "process_count", "label": "Native Tome processes", "type": "integer",
                 "default": 5, "minimum": 1, "maximum": 64},
                {"name": "path_count", "label": "Native paths per process", "type": "integer",
                 "default": 5, "minimum": 1, "maximum": 10000},
                {"name": "retry_count", "label": "Native child process retries", "type": "integer",
                 "default": 1, "minimum": 0, "maximum": 20},
                {"name": "install_observer", "label": "Install and enable the retained build observer",
                 "type": "boolean", "default": False,
                 "help": "Copies the supplied observation module and uses original Drush module enable and cache rebuild."},
                {"name": "content_entity_types", "label": "Source entity types",
                 "type": "text", "default": "*",
                 "help": "* retains the revision of every installed content entity type; otherwise supply comma-separated native IDs."},
                {"name": "expected_tome_version", "label": "Reviewed Tome version",
                 "type": "text", "default": PUBLISHED_TOME["version"]},
            ]}


def operation_actions(operation_type):
    return ([{"value": "tome-capture", "label": "Build and retain a complete native static edition"}]
            if operation_type == "CAPTURE" else [])


def _profile(config):
    if not isinstance(config, dict) or config.get("source_kind") != "tome":
        raise ValueError("Select the Tome native source configuration.")
    p = native._profile({**config, "source_kind": "drush"})
    directory = Path(str(config.get("static_directory", ""))).expanduser()
    if not directory.is_absolute():
        raise ValueError("Set the actual absolute Tome working output directory.")
    for parent in (directory, *directory.parents):
        if parent.is_symlink():
            raise ValueError("The native working output must use an ordinary directory path.")
    p["static_directory"] = str(directory.resolve())
    for key, default, minimum, maximum in (
        ("process_count", 5, 1, 64), ("path_count", 5, 1, 10000),
        ("retry_count", 1, 0, 20),
    ):
        value = config.get(key, default)
        try:
            parsed = int(value)
        except (TypeError, ValueError, OverflowError):
            raise ValueError("Set an integer " + key + ".") from None
        if isinstance(value, bool) or str(value).strip() != str(parsed):
            raise ValueError("Set an integer " + key + ".")
        value = parsed
        if not minimum <= value <= maximum:
            raise ValueError(key + " is outside the native profile range.")
        p[key] = value
    if not isinstance(config.get("install_observer", False), bool):
        raise ValueError("Set install_observer as a boolean.")
    p["install_observer"] = config.get("install_observer", False)
    types = config.get("content_entity_types", "*")
    if isinstance(types, str):
        types = [value.strip() for value in types.split(",") if value.strip()]
    if not isinstance(types, list) or not types or any(
        not isinstance(value, str) or not re.fullmatch(r"[a-z][a-z0-9_]*|\*", value)
        for value in types
    ) or ("*" in types and types != ["*"]):
        raise ValueError("Select * or a list of original Drupal content entity type IDs.")
    p["content_entity_types"] = sorted(set(types))
    version = config.get("expected_tome_version", PUBLISHED_TOME["version"])
    if not isinstance(version, str) or not version.strip():
        raise ValueError("Retain the reviewed original Tome version.")
    p["expected_tome_version"] = version.strip()
    return p


def _context(p):
    return {**native._context(p), "source_kind": "tome", "native_source_kind": "drush",
            "static_directory": p["static_directory"],
            "production_uri": p["uri"], "content_entity_types": p["content_entity_types"]}


class _Session(native.Session):
    """Add the two private context-file arguments to native relocation handling."""
    def resolve_private(self, value, key=None):
        value = super().resolve_private(value, key)
        if key == "argv" and isinstance(value, list):
            result = []
            for item in value:
                if isinstance(item, str) and item.startswith((
                    "TJL_TOME_NATIVE_REQUEST=", "TJL_TOME_CAPTURE_CONTEXT=",
                )):
                    name, path = item.split("=", 1)
                    item = name + "=" + self.private_path(path)
                result.append(item)
            return result
        return value

    def result(self, status, observations=None, message=None):
        return {**super().result(status, observations, message),
                "adapter_version": VERSION, "provider_context": _context(self.p)}


def _session(config, context, checkpoint=None, cancelled=None):
    p = _profile(config)
    def notify(value):
        if callable(checkpoint):
            checkpoint({**value, "adapter_version": VERSION, "provider_context": _context(p)})
    s = _Session(p, context["output_dir"], notify, cancelled, context.get("workspace_relocations"))
    identity = {"schema": "govhub.tome-native-intent.v1", "configuration": p}
    digest = native._digest(identity)
    supplied = context.get("resume_checkpoint") or context.get("checkpoint") or {}
    if isinstance(supplied, dict):
        supplied = supplied.get("resume_checkpoint", supplied.get("state", supplied))
    saved = s.read_private_json(s.out / "native-state.json") if (s.out / "native-state.json").exists() else s.resolve_private(supplied)
    if saved and saved.get("intent_sha256") != digest:
        raise ValueError("This native continuation names another reviewed Tome profile.")
    s.state = dict(saved or {})
    if not s.state:
        operation = context.get("operation") or {}
        operation_id = context.get("operation_id") or (operation.get("id") if isinstance(operation, dict) else None)
        operation_id = operation_id or "tome-" + native._digest({"profile": identity, "directory": str(s.out)})[:24]
        s.state = {"schema": "govhub.tome-native-state.v1", "intent": identity,
                   "intent_sha256": digest, "operation_id": str(operation_id),
                   "phase": "native_prepared", "mutation_started": False, "attempts": []}
        s.save_state()
    return s


@contextlib.contextmanager
def _target_lock(s):
    path = Path(s.p["site_root"]) / ".tjl-tome-capture.lock"
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError("The original Tome target lock must be an ordinary file.")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise native.NativeWaiting("The original Tome target has an active native build operation.") from exc
        yield
    finally:
        os.close(fd)


def _json_once(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.is_symlink() or json.loads(path.read_bytes()) != value:
            raise ValueError("The retained native request changed: " + path.name)
    else:
        native._atomic(path, value)
    return path


def _add(s, path, role, **extra):
    item = native._file(path, role, **extra)
    if item["size"] > s.p["max_artifact_bytes"]:
        raise ValueError("An actual native artifact exceeds the selected intake limit.")
    s.artifacts = [old for old in s.artifacts if not (
        old["path"] == item["path"] and old["role"] == item["role"])]
    s.artifacts.append(item)
    return item


def _source_files(directory):
    directory = Path(directory)
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("Use a retained ordinary source directory.")
    files = []
    for root, dirs, names in os.walk(directory, followlinks=False):
        for name in dirs:
            if (Path(root) / name).is_symlink():
                raise ValueError("The native source contains a directory link.")
        for name in names:
            path = Path(root) / name
            mode = path.lstat().st_mode
            if not stat.S_ISREG(mode):
                raise ValueError("The native source contains a link or special file.")
            files.append(path)
    return sorted(files, key=lambda item: item.relative_to(directory).as_posix())


def _copy_file(source, destination, maximum):
    source, destination = Path(source), Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_symlink():
        raise ValueError("An immutable receiving file is a link.")
    before = source.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > maximum:
        raise ValueError("Select an ordinary native file within the artifact limit.")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(source, flags)
    digest = hashlib.sha256()
    size = 0
    pending = destination.with_name(destination.name + ".tjl-copy-pending")
    if pending.is_symlink():
        raise ValueError("An owned pending receiving file is a link.")
    try:
        opened = os.fstat(fd)
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise ValueError("The original native file changed before capture.")
        with os.fdopen(fd, "rb") as incoming:
            fd = None
            with pending.open("wb") as outgoing:
                for chunk in iter(lambda: incoming.read(1024 * 1024), b""):
                    size += len(chunk)
                    if size > maximum:
                        raise ValueError("The native file grew beyond the selected artifact limit.")
                    digest.update(chunk)
                    outgoing.write(chunk)
                outgoing.flush()
                os.fsync(outgoing.fileno())
            after = os.fstat(incoming.fileno())
        current = source.lstat()
        identity = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)
        if identity(opened) != identity(after) or identity(after) != identity(current):
            raise ValueError("The original native file changed while its edition was copied.")
        result = {"bytes": size, "sha256": digest.hexdigest()}
        if destination.exists():
            existing = native._file(destination, "retained")
            if existing["sha256"] != result["sha256"] or existing["size"] != size:
                raise ValueError("A retained immutable file differs from this native edition.")
            pending.unlink()
        else:
            os.replace(pending, destination)
        return result
    finally:
        if fd is not None:
            os.close(fd)
        if pending.exists() and pending.is_file() and not pending.is_symlink():
            pending.unlink()


def _retained_tree(s, source, destination, *, allow_absent=False):
    source, destination = Path(source), Path(destination)
    manifest_path = destination.with_name(destination.name + ".manifest.json")
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_bytes())
        expected = {item["path"]: item for item in manifest["files"]}
        actual = {item.relative_to(destination).as_posix(): item for item in _source_files(destination)}
        if set(actual) != set(expected):
            raise ValueError("The full retained native file set changed.")
        for name, path in actual.items():
            item = native._file(path, "retained")
            if item["sha256"] != expected[name]["sha256"] or item["size"] != expected[name]["bytes"]:
                raise ValueError("A retained native edition file changed.")
        return manifest, manifest_path
    destination.mkdir(parents=True, exist_ok=True)
    if not source.exists() and allow_absent:
        paths = []
    else:
        paths = _source_files(source)
    names = [item.relative_to(source).as_posix() for item in paths]
    existing = {item.relative_to(destination).as_posix() for item in _source_files(destination)
                if not item.name.endswith(".tjl-copy-pending")}
    if existing - set(names):
        raise ValueError("The pending edition contains files absent from the actual native output.")
    entries = []
    for path, name in zip(paths, names):
        s.check()
        entries.append({"path": name, **_copy_file(path, destination / name, s.p["max_artifact_bytes"])})
    after = [item.relative_to(source).as_posix() for item in _source_files(source)] if source.exists() else []
    if names != after:
        raise ValueError("The full native file set changed during edition capture.")
    manifest = {"schema": "govhub.tome-native-files.v1", "source_directory": str(source),
                "files": entries, "total_bytes": sum(item["bytes"] for item in entries)}
    _json_once(manifest_path, manifest)
    return manifest, manifest_path


def _helper(s, label, mode="describe", *, reset_owned=False):
    path = s.out / "helper" / "native_context.php"
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (MODULE / "native_context.php").read_bytes()
    if path.exists() and path.read_bytes() != raw:
        raise ValueError("The retained original native helper differs from this source version.")
    if not path.exists():
        with path.open("xb") as stream:
            stream.write(raw)
    request = _json_once(s.out / "requests" / (label + ".json"), {
        "schema": "govhub.tome-native-request.v1", "operation_id": s.state["operation_id"],
        "mode": mode, "content_entity_types": s.p["content_entity_types"],
        "reset_owned_interruption": bool(reset_owned),
    })
    env = shutil.which("env")
    if not env:
        raise ValueError("The native host needs the existing env executable.")
    record = s.command(label, [env, "TJL_TOME_NATIVE_REQUEST=" + str(request),
                              *native._prefix(s.p), "php:script", str(path)],
                       mutating=mode == "reset_cache")
    value = json.loads(Path(record["stdout"]["path"]).read_bytes())
    expected = "govhub.tome-native-cache-reset.v1" if mode == "reset_cache" else "govhub.tome-native-description.v1"
    if not isinstance(value, dict) or value.get("schema") != expected:
        raise ValueError("The original Drupal helper returned another result schema.")
    _add(s, record["stdout"]["path"], "native_tome_" + mode)
    return value


def _fresh_helper(s, prefix):
    return _helper(s, prefix + "-" + str(time.time_ns()))


def _validate_directory(s, description, native_status):
    p = s.p
    if not description.get("observer_enabled"):
        raise ValueError("Enable the supplied observation module on this original Tome site.")
    if description.get("tome_version") != p["expected_tome_version"]:
        raise ValueError("The actual installed Tome version differs from the reviewed profile.")
    directory = Path(description.get("static_directory", "")).resolve()
    if directory != Path(p["static_directory"]):
        raise ValueError("The observed tome_static_directory differs from the configured working output.")
    protected = [Path(p["site_root"]), s.out]
    project = p.get("restore_destination")
    if project:
        protected.append(Path(project))
    files = native_status.get("files")
    if isinstance(files, str) and files:
        public_files = Path(files)
        if not public_files.is_absolute():
            public_files = Path(p["site_root"]) / public_files
        protected.append(public_files.resolve())
    for target in protected:
        if directory == target or target.is_relative_to(directory):
            raise ValueError("The native build output would replace original site or operation source.")
    for name in ("core", "modules", "themes", "sites"):
        if directory.is_relative_to(Path(p["site_root"]) / name):
            raise ValueError("The working static output overlaps the original Drupal source or public files.")
    if directory.is_relative_to(s.out):
        raise ValueError("Keep the native working output separate from immutable operation custody.")
    return directory


def _setup_command(s, name, arguments):
    labels = s.state.setdefault("setup_commands", {})
    label = labels.get(name, "prepare-" + name)
    record_path = s.out / (label + ".command.json")
    if record_path.exists():
        prior = json.loads(record_path.read_bytes())
        if prior.get("phase") == "interrupted" and prior.get("owned_process_reaped") is not True:
            raise native.NativeWaiting("Reconcile the original observer preparation process before continuing.")
        if ((prior.get("phase") == "interrupted" and prior.get("owned_process_reaped") is True)
                or (prior.get("phase") == "complete" and prior.get("returncode") != 0)):
            label = "prepare-" + name + "-" + str(time.time_ns())
    labels[name] = label
    s.save_state()
    return s.command(label, native._prefix(s.p) + arguments, mutating=True)


def _prepare_locked(s):
    native_status, names, fingerprint = native._drush_info(s)
    missing = REQUIRED - names
    if missing:
        raise ValueError("Installed original Drush/Tome lacks commands: " + ", ".join(sorted(missing)))
    description = _fresh_helper(s, "prepare-observed")
    if not description.get("observer_enabled"):
        if not s.p["install_observer"]:
            raise ValueError("Select observer installation or use the same site's already installed receiving observer.")
        if not {"pm:enable", "cache:rebuild"} <= names:
            raise ValueError("The selected Drush must expose original module enable and cache rebuild.")
        staged = s.out / "observer-source"
        observer, observer_manifest = _retained_tree(s, MODULE, staged)
        destination = Path(s.p["site_root"]) / "modules" / "custom" / "tjl_tome_capture"
        destination.mkdir(parents=True, exist_ok=True)
        expected = {item["path"] for item in observer["files"]}
        if {item.relative_to(destination).as_posix() for item in _source_files(destination)} - expected:
            raise ValueError("An existing different observation module occupies the selected native path.")
        s.state.update(phase="preparing_observer", mutation_started=True,
                       observer_manifest_sha256=native._file(observer_manifest, "manifest")["sha256"])
        s.save_state()
        for item in observer["files"]:
            _copy_file(staged / item["path"], destination / item["path"], s.p["max_artifact_bytes"])
        if not description.get("observer_module_enabled"):
            _setup_command(s, "observer-enable", ["pm:enable", "tjl_tome_capture", "--yes"])
        _setup_command(s, "observer-cache", ["cache:rebuild"])
        description = _fresh_helper(s, "observer-prepared")
        _add(s, observer_manifest, "native_observer_manifest")
        for item in observer["files"]:
            _add(s, staged / item["path"], "native_observer_source", relative_path=item["path"])
    directory = _validate_directory(s, description, native_status)
    _add(s, s.out / "status.stdout", "native_status")
    _add(s, s.out / "commands.stdout", "native_commands")
    s.state.update(phase="native_prepared", target_fingerprint=fingerprint,
                   native_status=native_status, native_description=description)
    s.save_state()
    return native_status, description, directory


def _support_artifacts(s):
    for path in sorted(s.out.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(s.out)
        if any(part in {"source-capture", "static-output", "prior-output", "tome-source"}
               for part in relative.parts):
            continue
        if path.suffix in {".stdout", ".stderr", ".php", ".yml"} or path.name.endswith((
            ".command.json", ".manifest.json", "tome-events.jsonl",
            "native-source-result.json",
        )) or "requests" in relative.parts or path.name == "build-context.json":
            _add(s, path, "native_operation_artifact", relative_path=relative.as_posix())


def discover_capabilities(config):
    result = {"configuration_schema": configuration_schema(), "ready": False,
              "actions": [], "configuration": {}, "current_config": {}}
    try:
        p = _profile(config)
        result.update(configuration={**p, "source_kind": "tome"},
                      current_config={**p, "source_kind": "tome"}, provider_context=_context(p))
        with tempfile.TemporaryDirectory(prefix="govhub-tome-capabilities-") as directory:
            s = _session(config, {"output_dir": directory})
            status, names, fingerprint = native._drush_info(s)
            description = _helper(s, "capability-description") if "php:script" in names else {}
            missing = sorted(REQUIRED - names)
            if p["install_observer"] and not description.get("observer_enabled"):
                missing = sorted(set(missing) | ({"pm:enable", "cache:rebuild"} - names))
            actual_version = description.get("tome_version")
            valid_version = actual_version == p["expected_tome_version"]
            ready = not missing and valid_version and bool(
                description.get("observer_enabled") or p["install_observer"])
            if description.get("observer_enabled"):
                _validate_directory(s, description, status)
            result.update(ready=ready, native_status=status, native_tome=description,
                          target_fingerprint=fingerprint, missing_commands=missing,
                          actions=operation_actions("CAPTURE") if ready else [],
                          observed_at=native._now())
            if not ready:
                result["message"] = "Use the observed Tome version, required native commands and selected observer preparation."
    except Exception as exc:
        result["message"] = str(exc)
    return result


def prepare(config, context, checkpoint=None, cancelled=None):
    s = _session(config, context, checkpoint, cancelled)
    try:
        with _target_lock(s):
            status, description, directory = _prepare_locked(s)
            observations = {"native_status": status, "native_tome": description,
                            "static_directory": str(directory),
                            "target_fingerprint": s.state["target_fingerprint"]}
            _support_artifacts(s)
            return s.result("COMPLETE", observations)
    except native.NativeCancelled as exc:
        return s.result("CANCELLED", message=str(exc))
    except native.NativeWaiting as exc:
        return s.result("WAITING_NATIVE", message=str(exc))
    except Exception as exc:
        _support_artifacts(s)
        return s.result("FAILED", message=str(exc))


def _reconcile_owned_commands(s):
    label = s.state.get("pending_command")
    if not label:
        return False
    path = s.out / (label + ".command.json")
    if not path.is_file():
        raise native.NativeWaiting("The original started native command still needs its retained process outcome.")
    record = s.read_private_json(path)
    phase = record.get("phase")
    if phase == "complete":
        s.state.update(pending_command=None, phase="native_prepared")
        s.save_state()
        return False
    if phase == "not_started":
        s.state.update(pending_command=None, phase="native_prepared")
        s.save_state()
        return False
    if phase == "interrupted" and record.get("owned_process_reaped") is True:
        s.state.setdefault("reconciled_commands", []).append({
            "label": label, "record": str(path),
            "outcome": "original_owned_process_reaped",
        })
        s.state.update(pending_command=None, phase="native_prepared")
        s.save_state()
        return True
    raise native.NativeWaiting("The original native process has no retained completion. Continue its existing operation before another generation.")


def _select_attempt(s, owned_interruption):
    attempts = s.state["attempts"]
    previous = attempts[-1] if attempts else None
    if previous:
        directory = s.out / previous["directory"]
        command_path = s.out / (previous["generation_label"] + ".command.json")
        command = s.read_private_json(command_path) if command_path.exists() else None
        unfinished = command and command.get("phase") not in {"complete", "not_started"}
        if unfinished and not (command.get("phase") == "interrupted"
                               and command.get("owned_process_reaped") is True):
            raise native.NativeWaiting("The original Tome build process must finish or be reconciled before a replacement attempt.")
        if not (previous.get("status") == "FAILED" or unfinished or (
            command and command.get("phase") == "complete" and command.get("returncode") != 0
        )):
            return previous, directory
        previous.setdefault("retained_outcome", "failed_or_interrupted")
        owned_interruption = owned_interruption or bool(unfinished)
    number = len(attempts) + 1
    attempt = {"number": number, "directory": "attempt-" + str(number).zfill(4),
               "generation_label": "a" + str(number).zfill(4) + "-tome-generation",
               "status": "PREPARING", "started_at": native._now(),
               "owned_interruption": bool(owned_interruption)}
    attempts.append(attempt)
    s.save_state()
    directory = s.out / attempt["directory"]
    directory.mkdir(exist_ok=True)
    return attempt, directory


def _actual_manifest(s, directory):
    root = Path(directory)
    files = []
    for path in _source_files(root):
        s.check()
        item = native._file(path, "source")
        if item["size"] > s.p["max_artifact_bytes"]:
            raise ValueError("An installed native source file exceeds the selected artifact limit.")
        files.append({"path": path.relative_to(root).as_posix(),
                      "bytes": item["size"], "sha256": item["sha256"]})
    return {"schema": "govhub.tome-installed-source.v1", "files": files}


def _capture_original_source(s, directory):
    output = directory / "source-capture"
    result_path = directory / "native-source-result.json"
    if result_path.exists():
        result = s.read_private_json(result_path)
        if result.get("status") == "COMPLETE":
            for item in result.get("artifacts", []):
                actual = native._file(item["path"], item["role"])
                if actual["sha256"] != item["sha256"] or actual["size"] != item["size"]:
                    raise ValueError("The original source capture artifact changed before the build.")
            return result
    original_profile = native._profile(s.p)
    def notify(value):
        s.state["source_capture_checkpoint"] = value
        s.event({"kind": "native_source_capture", "stage": value.get("stage"),
                 "source_checkpoint": value})
    result = native.capture(original_profile, {
        "output_dir": str(output),
        "workspace_relocations": [{"from": original, "to": current} for original, current in s.relocations],
    }, notify, s.cancelled)
    native._atomic(result_path, result)
    if result.get("status") == "WAITING_NATIVE":
        raise native.NativeWaiting(result.get("message", "Continue the original source capture."))
    if result.get("status") == "CANCELLED":
        raise native.NativeCancelled(result.get("message", "The original source capture was cancelled."))
    if result.get("status") != "COMPLETE":
        raise ValueError(result.get("message", "The original complete native source capture did not finish."))
    return result


def _journal(s, directory, context_file):
    path = directory / "tome-events.jsonl"
    if not path.is_file() or path.is_symlink():
        return [], [{"code": "BUILD_EVENTS_ABSENT", "message": "The native observer retained no completed build journal."}]
    raw = path.read_bytes()
    errors = []
    if raw and not raw.endswith(b"\n"):
        errors.append({"code": "BUILD_EVENT_INCOMPLETE", "message": "The final native event was interrupted."})
    events = []
    for number, line in enumerate(raw.splitlines(), 1):
        try:
            item = json.loads(line)
            if (not isinstance(item, dict) or item.get("schema") != "govhub.tome-native-event.v1"
                    or item.get("operation_id") != s.state["operation_id"]
                    or not isinstance(item.get("pid"), int) or not isinstance(item.get("data"), dict)):
                raise ValueError("The event belongs to another native operation or schema.")
            events.append(item)
        except (ValueError, TypeError) as exc:
            errors.append({"code": "BUILD_EVENT_INVALID", "line": number, "message": str(exc)})
    expected_hash = native._file(context_file, "context")["sha256"]
    contexts = [item for item in events if item["kind"] == "process_context"]
    if not contexts or any(item["data"].get("context_sha256") != expected_hash for item in contexts):
        errors.append({"code": "BUILD_CONTEXT_DIFFERS", "message": "Every native process must retain this exact build context."})
    return events, errors


def _path_outcomes(s, events, manifest):
    errors, outcomes, active = [], [], {}
    expected = set()
    files = {item["path"]: item for item in manifest["files"]}
    root = Path(s.p["static_directory"])
    kinds = [event["kind"] for event in events]
    if "get_paths" not in kinds:
        errors.append({"code": "FULL_PATH_COLLECTION_ABSENT", "message": "The original full native path collection is absent."})
    if "cleanup_completed" not in kinds or not any(
        event["kind"] == "directory_prepared" and event["data"].get("success") is True
        for event in events
    ):
        errors.append({"code": "OUTPUT_PREPARATION_INCOMPLETE", "message": "The original full output preparation did not complete."})
    for event in events:
        data, kind, pid = event["data"], event["kind"], event["pid"]
        if kind == "file_saved" and data.get("regular_file") is not True:
            errors.append({"code": "NATIVE_SAVED_FILE_INCOMPLETE", "path": data.get("path"), "pid": pid})
        if kind == "export_paths_completed":
            paths = data.get("next_paths")
            if not isinstance(paths, list) or any(not isinstance(path, str) for path in paths):
                errors.append({"code": "NATIVE_PATH_LIST_INVALID"})
            else:
                expected.update(paths)
        if kind == "request_started":
            path = data.get("path")
            if not isinstance(path, str):
                errors.append({"code": "NATIVE_REQUEST_PATH_INVALID"})
                continue
            key = (pid, path)
            if key in active:
                errors.append({"code": "NATIVE_REQUEST_OVERLAP", "path": path})
            item = {"path": path, "pid": pid, "started_at_unix": event.get("at_unix"),
                    "status": "RUNNING", "http": [], "saved_files": [], "native_exceptions": []}
            active[key] = item
            outcomes.append(item)
            continue
        original_path = event.get("original_path") or data.get("path")
        item = active.get((pid, original_path)) if isinstance(original_path, str) else None
        if item is None:
            continue
        if kind == "http_response":
            item["http"].append(dict(data))
        elif kind == "http_exception":
            item["native_exceptions"].append(dict(data))
        elif kind == "path_placeholder":
            item["placeholder"] = dict(data)
        elif kind == "file_saved":
            if data.get("regular_file") is not True:
                item.setdefault("errors", []).append("The original saved-file event did not observe a complete ordinary file.")
            saved_path = Path(str(data.get("path", "")))
            if not saved_path.is_absolute():
                saved_path = Path(s.p["site_root"]) / saved_path
            saved_path = saved_path.resolve()
            if not saved_path.is_relative_to(root):
                item.setdefault("errors", []).append("The original saved file is outside the reviewed static output.")
            else:
                relative = saved_path.relative_to(root).as_posix()
                item["saved_files"].append(relative)
        elif kind in {"request_completed", "request_failed"}:
            item["completed_at_unix"] = event.get("at_unix")
            if kind == "request_failed":
                item["status"] = "FAILED"
                item["failure"] = dict(data)
            elif item.get("placeholder", {}).get("invalid") is True:
                item["status"] = "EXCLUDED_BY_ORIGINAL_TOME"
            else:
                responses = item["http"]
                valid_http = bool(responses) and all(
                    response.get("status") == 200 or (
                        isinstance(response.get("status"), int) and 300 <= response["status"] < 400
                    ) for response in responses)
                valid_files = bool(item["saved_files"]) and all(name in files for name in item["saved_files"])
                item["status"] = "COMPLETE" if valid_http and valid_files and not item.get("errors") else "FAILED"
                if not valid_http:
                    item.setdefault("errors", []).append("The native path has no successful retained Drupal HTTP response.")
                if not valid_files:
                    item.setdefault("errors", []).append("The native saved-file event has no corresponding complete output file.")
            active.pop((pid, original_path), None)
    latest = {}
    for item in outcomes:
        latest[item["path"]] = item
    for path in sorted(expected - set(latest)):
        errors.append({"code": "NATIVE_REQUEST_ABSENT", "path": path,
                       "message": "The original generator returned this path for a child process, but no native request was retained."})
    for path, item in latest.items():
        if item["status"] not in {"COMPLETE", "EXCLUDED_BY_ORIGINAL_TOME"}:
            errors.append({"code": "NATIVE_PATH_INCOMPLETE", "path": path,
                           "status": item["status"], "errors": item.get("errors", []),
                           "failure": item.get("failure")})
    for item in active.values():
        errors.append({"code": "NATIVE_REQUEST_INTERRUPTED", "path": item["path"], "pid": item["pid"]})
    return outcomes, errors


def _preserve_attempt_artifacts(s, attempt, directory, report, source):
    report_path = directory / "static-build-report.json"
    native._atomic(report_path, report)
    _add(s, report_path, "static_build_report", format="govhub.tome-static-build.v1")
    for item in report["files"]:
        _add(s, directory / "static-output" / item["path"], "static_asset",
             relative_path=item["path"], production_uri=s.p["uri"])
    if source:
        for item in source.get("artifacts", []):
            actual = native._file(item["path"], item["role"])
            if actual["sha256"] != item["sha256"] or actual["size"] != item["size"]:
                raise ValueError("An original source input changed after the native build.")
            s.artifacts.append(dict(item))
    for name, role in (("prior-output", "native_prior_output_asset"),
                       ("tome-source", "native_tome_source")):
        selected = directory / name
        if selected.is_dir():
            for path in _source_files(selected):
                _add(s, path, role, relative_path=path.relative_to(selected).as_posix())
    for old in s.state["attempts"]:
        if old["number"] == attempt["number"]:
            continue
        previous = s.out / old["directory"]
        previous_report = previous / "static-build-report.json"
        if previous_report.exists():
            _add(s, previous_report, "native_prior_build_report",
                 attempt_number=old["number"])
        output = previous / "static-output"
        if output.is_dir():
            for path in _source_files(output):
                _add(s, path, "native_prior_build_asset", attempt_number=old["number"],
                     relative_path=path.relative_to(output).as_posix())
    _support_artifacts(s)


def _finish(s, status, attempt, directory, report, source, message=None):
    _preserve_attempt_artifacts(s, attempt, directory, report, source)
    attempt.update(status=status, completed_at=native._now(),
                   report_sha256=native._file(directory / "static-build-report.json", "report")["sha256"])
    observations = {"native_action": "tome-capture", "native_status": s.state.get("native_status"),
                    "target_fingerprint": s.state.get("target_fingerprint"),
                    "static_build": report, "complete": report["complete"],
                    "file_count": len(report["files"]),
                    "total_bytes": sum(item["bytes"] for item in report["files"])}
    s.state.update(phase="completed" if status == "COMPLETE" else "native_failed",
                   observations=observations, artifacts=s.artifacts)
    s.save_state()
    result = s.result(status, observations, message)
    native._atomic(s.out / "native-result.json", result)
    return result


def _completed_result(s):
    s.artifacts = []
    for item in s.state.get("artifacts", []):
        item = s.resolve_private(item)
        current = native._file(item["path"], item["role"])
        if current["sha256"] != item["sha256"] or current["size"] != item["size"]:
            raise ValueError("A completed original native artifact changed before reopen.")
        s.artifacts.append(item)
    return s.result("COMPLETE", s.state.get("observations"))


def capture(config, context, checkpoint=None, cancelled=None):
    s = _session(config, context, checkpoint, cancelled)
    if s.state.get("phase") == "completed":
        return _completed_result(s)
    attempt = directory = source = None
    before = after = {}
    manifest = {"files": []}
    generator = {"package": PUBLISHED_TOME["package"], "version": s.p["expected_tome_version"],
                 "published_source": PUBLISHED_TOME}
    try:
        with _target_lock(s):
            interrupted = _reconcile_owned_commands(s)
            status, prepared, working = _prepare_locked(s)
            attempt, directory = _select_attempt(s, interrupted)
            prefix = "a" + str(attempt["number"]).zfill(4)
            before = _helper(s, prefix + "-source-before")
            _validate_directory(s, before, status)
            if before.get("building") and not attempt.get("owned_interruption"):
                raise native.NativeWaiting("The actual Tome site retains an existing build. Reconcile that original operation before clearing its output.")
            package = Path(before["tome_package_path"])
            actual_source = _actual_manifest(s, package)
            if not actual_source["files"]:
                raise ValueError("The installed original Tome source is empty.")
            retained_source, source_manifest_path = _retained_tree(s, package, directory / "tome-source")
            if actual_source["files"] != retained_source["files"]:
                raise ValueError("The installed Tome source changed after this attempt was prepared.")
            generator.update(version=before["tome_version"],
                             source_sha256=native._file(source_manifest_path, "source")["sha256"],
                             installed_manifest_sha256=native._digest(actual_source),
                             installed_path=str(package))
            prior, prior_manifest = _retained_tree(s, working, directory / "prior-output", allow_absent=True)
            _add(s, prior_manifest, "native_prior_output_manifest")
            source = _capture_original_source(s, directory)
            source_ready = _helper(s, prefix + "-source-captured")
            if source_ready.get("source_revision_sha256") != before.get("source_revision_sha256"):
                raise ValueError("The original configuration or declared content changed while its source capture was collected.")
            context_file = _json_once(directory / "build-context.json", {
                "schema": "govhub.tome-native-context.v1", "operation_id": s.state["operation_id"],
                "attempt_id": prefix, "production_uri": s.p["uri"],
            })
            reset = _helper(s, prefix + "-cache-reset", "reset_cache",
                            reset_owned=attempt.get("owned_interruption", False))
            if reset.get("cache_empty") is not True:
                raise ValueError("The original Tome cache was not cleared for this complete edition.")
            attempt["status"] = "GENERATING"
            s.state.update(phase="native_prepared", current_attempt=attempt["number"])
            s.save_state()
            env = shutil.which("env")
            command = s.command(attempt["generation_label"], [
                env, "TJL_TOME_CAPTURE_CONTEXT=" + str(context_file), *native._prefix(s.p),
                "tome:static", "--process-count=" + str(s.p["process_count"]),
                "--path-count=" + str(s.p["path_count"]), "--retry-count=" + str(s.p["retry_count"]),
                "--yes",
            ], mutating=True)
            after = _helper(s, prefix + "-source-after")
            attempt["status"] = "RETAINING"
            s.save_state()
            manifest, output_manifest = _retained_tree(s, working, directory / "static-output")
            _add(s, output_manifest, "native_output_manifest")
            events, errors = _journal(s, directory, context_file)
            path_outcomes, path_errors = _path_outcomes(s, events, manifest)
            errors.extend(path_errors)
            if after.get("building"):
                errors.append({"code": "ORIGINAL_BUILD_STILL_MARKED_ACTIVE"})
            if after.get("source_revision_sha256") != before.get("source_revision_sha256"):
                errors.append({"code": "ORIGINAL_INPUT_REVISION_CHANGED",
                               "before": before.get("source_revision_sha256"),
                               "after": after.get("source_revision_sha256")})
            if _actual_manifest(s, package) != actual_source:
                errors.append({"code": "ORIGINAL_GENERATOR_SOURCE_CHANGED"})
            if not manifest["files"]:
                errors.append({"code": "NO_STATIC_OUTPUT", "message": "The actual full native build returned no ordinary output files."})
            report = {
                "schema": "govhub.tome-static-build.v1", "complete": not errors,
                "operation_id": s.state["operation_id"], "attempt": attempt["number"],
                "production_uri": s.p["uri"], "generator": generator,
                "inputs": source["artifacts"], "input_revision_before": before,
                "input_revision_after": after,
                "working_directory": str(working), "retained_directory": str(directory / "static-output"),
                "files": manifest["files"], "path_outcomes": path_outcomes, "errors": errors,
                "native_command": command,
                "native_cache_reset": reset,
                "prior_output_manifest": native._file(prior_manifest, "prior_output_manifest"),
                "capture_method": "original Tome full generation, original cache reset, complete ordinary-file receiving",
            }
            return _finish(s, "COMPLETE" if report["complete"] else "FAILED",
                           attempt, directory, report, source,
                           None if report["complete"] else "Review the retained native path and source outcomes.")
    except native.NativeWaiting as exc:
        return s.result("WAITING_NATIVE", message=str(exc))
    except native.NativeCancelled as exc:
        if attempt:
            attempt["status"] = "CANCELLED"
            s.save_state()
        return s.result("CANCELLED", message=str(exc))
    except Exception as exc:
        if attempt and directory:
            # Session retains the actual command outcome. A failed build's partial
            # files are copied only after that owned process has completed or reaped.
            command_path = s.out / (attempt["generation_label"] + ".command.json")
            record = s.read_private_json(command_path) if command_path.exists() else None
            inactive = not record or record.get("phase") in {"complete", "not_started"} or (
                record.get("phase") == "interrupted" and record.get("owned_process_reaped") is True)
            errors = [{"code": "NATIVE_BUILD_FAILED", "message": str(exc)}]
            path_outcomes = []
            if inactive and Path(s.p["static_directory"]).is_dir():
                try:
                    manifest, output_manifest = _retained_tree(s, s.p["static_directory"], directory / "static-output")
                    _add(s, output_manifest, "native_partial_output_manifest")
                    context_file = directory / "build-context.json"
                    if context_file.exists():
                        events, journal_errors = _journal(s, directory, context_file)
                        path_outcomes, path_errors = _path_outcomes(s, events, manifest)
                        errors.extend(journal_errors + path_errors)
                except Exception as receiving_error:
                    errors.append({"code": "PARTIAL_OUTPUT_RECEIVING", "message": str(receiving_error)})
            report = {"schema": "govhub.tome-static-build.v1", "complete": False,
                      "operation_id": s.state["operation_id"], "attempt": attempt["number"],
                      "production_uri": s.p["uri"], "generator": generator,
                      "inputs": source.get("artifacts", []) if source else [],
                      "input_revision_before": before, "input_revision_after": after,
                      "working_directory": s.p["static_directory"],
                      "retained_directory": str(directory / "static-output"),
                      "files": manifest["files"], "path_outcomes": path_outcomes,
                      "errors": errors, "native_command": record}
            try:
                return _finish(s, "FAILED", attempt, directory, report, source, str(exc))
            except Exception as receiving_error:
                s.state.update(phase="native_failed", receiving_error=str(receiving_error))
                s.save_state()
                return s.result("FAILED", {"static_build": report}, str(exc) + "; " + str(receiving_error))
        _support_artifacts(s)
        return s.result("FAILED", message=str(exc))


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    action = operation.get("native_action", operation.get("action"))
    if action != "tome-capture":
        raise ValueError("Select the original tome-capture action; static promotion and rollback use the release workspace.")
    environment = operation.get("provider_environment_id", operation.get("environment_id"))
    if environment not in (None, config.get("environment_id")):
        raise ValueError("The reviewed operation and original Tome environment differ.")
    context = {
        "output_dir": source_paths["output_dir"], "operation": operation,
        "operation_id": operation.get("id"),
        "workspace_relocations": source_paths.get("workspace_relocations"),
        "resume_checkpoint": source_paths.get("checkpoint") or operation.get("resume_checkpoint") or {},
    }
    return capture(config, context, checkpoint, cancelled)
