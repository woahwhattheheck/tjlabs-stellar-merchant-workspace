"""Native Drupal/Drush, Acquia, Lagoon, Pantheon and Skpr inputs for GovHub.

Provider source: Acquia's original OpenAPI 2.0.0, SHA256
a4419efca11e3177d9e7907e20e509c0e98de79513e6b2c2aed52805d88956f2.
The carrier owns staff authorization, plan/source pins, custody and operation leases.
This adapter owns actual commands/requests and their retained native outcomes.
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from urllib import error, parse, request

import lagoon_adapter
import pantheon_adapter
import skpr_adapter
import tugboat_adapter
import upsun_adapter


def _tome_native(required=True):
    import importlib
    try:
        return importlib.import_module("tome_native")
    except ModuleNotFoundError as exc:
        if exc.name != "tome_native" or required:
            raise
        return None



def pantheon_resume_fields(operation, payload, reason):
    return pantheon_adapter.resume_fields(operation, payload, reason)


def native_resume_fields(operation, payload, reason):
    if str(operation.get("native_action", "")).startswith("upsun-"):
        return upsun_adapter.resume_fields(operation, payload, reason)
    if str(operation.get("native_action", "")).startswith("tugboat-"):
        return tugboat_adapter.resume_fields(operation, payload, reason)
    if str(operation.get("native_action", "")).startswith("skpr-"):
        return skpr_adapter.resume_fields(operation, payload, reason)
    return pantheon_adapter.resume_fields(operation, payload, reason)


def lagoon_task_id(checkpoint):
    return lagoon_adapter.authoritative_task_id(checkpoint or {})


API_BASE = "https://cloud.acquia.com/api"
VERSION = "govhub-native/v1"
DRUSH_FILE_EXCLUSIONS = {"css", "js", "styles", "php"}

# Settings::initialize and Database::getConnection load the installed driver's
# functions and collations without requiring a functioning Drupal content schema.
# The source SQL is passed intact to that driver's own PDO client.
DRUPAL_SQLITE_IMPORT = r'''<?php
declare(strict_types=1);
use Drupal\Core\Database\Database;
use Drupal\Core\Site\Settings;
use Symfony\Component\HttpFoundation\Request;

try {
    if (PHP_SAPI !== 'cli' || count($argv) !== 5) {
        throw new RuntimeException('Use the retained native SQLite command envelope.');
    }
    [, $mode, $jobFile, $sqlFile, $expectedJobSha] = $argv;
    if (!in_array($mode, ['preflight', 'import'], true)
        || !hash_equals($expectedJobSha, hash_file('sha256', $jobFile))) {
        throw new RuntimeException('The native SQLite request differs from its retained bytes.');
    }
    $job = json_decode(file_get_contents($jobFile), true, 512, JSON_THROW_ON_ERROR);
    if (!is_file($sqlFile) || filesize($sqlFile) !== $job['sql_size']
        || !hash_equals($job['sql_sha256'], hash_file('sha256', $sqlFile))) {
        throw new RuntimeException('The selected SQL dump changed before native import.');
    }
    $root = realpath($job['site_root']);
    if ($root !== $job['site_root'] || !is_file($root . '/' . $job['site_path'] . '/settings.php')) {
        throw new RuntimeException('The original native Drupal root or site settings are unavailable.');
    }
    chdir($root);
    $loader = require $root . '/autoload.php';
    $request = Request::create($job['uri']);
    foreach ($request->server->all() as $key => $value) {
        $_SERVER[$key] = $value;
    }
    require_once $root . '/core/includes/bootstrap.inc';
    Settings::initialize($root, $job['site_path'], $loader);
    $connection = Database::getConnection('default', 'default');
    $options = $connection->getConnectionOptions();
    if (($options['driver'] ?? null) !== 'sqlite'
        || realpath($options['database']) !== $job['database_path']) {
        throw new RuntimeException('Drupal resolved a different native database target.');
    }
    $pdo = $connection->getClientConnection();
    if (!$pdo instanceof PDO || $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'sqlite') {
        throw new RuntimeException('The installed Drupal SQLite driver did not provide its native PDO client.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $collations = $pdo->query('PRAGMA collation_list')->fetchAll(PDO::FETCH_ASSOC);
    if (!in_array('NOCASE_UTF8', array_column($collations, 'name'), true)) {
        throw new RuntimeException('The installed Drupal driver did not register NOCASE_UTF8.');
    }
    $driver = new ReflectionClass($connection);
    $result = [
        'mode' => $mode, 'driver_class' => get_class($connection),
        'driver_source_sha256' => hash_file('sha256', $driver->getFileName()),
        'site_root' => $root, 'site_path' => $job['site_path'],
        'database_path' => $job['database_path'],
        'sql_sha256' => $job['sql_sha256'], 'sql_size' => $job['sql_size'],
        'collations' => array_column($collations, 'name'),
    ];
    if ($mode === 'import') {
        $sql = file_get_contents($sqlFile);
        if ($sql === false || !hash_equals($job['sql_sha256'], hash('sha256', $sql))) {
            throw new RuntimeException('The exact SQL bytes could not be retained by the native importer.');
        }
        $pdo->exec($sql);
        unset($sql);
        $integrity = $pdo->query('PRAGMA integrity_check')->fetchAll(PDO::FETCH_COLUMN);
        if ($integrity !== ['ok']) {
            throw new RuntimeException('The restored SQLite database failed its native integrity check.');
        }
        $result['integrity_check'] = $integrity;
        $result['table_count'] = (int) $pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchColumn();
    }
    echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
} catch (Throwable $error) {
    // No connection options or credentials enter retained command output.
    fwrite(STDERR, get_class($error) . ': ' . $error->getMessage() . "\n");
    exit(1);
}
'''


def configuration_schema():
    def field(name, label, kind="text", required=False, **extra):
        return {"name": name, "label": label, "type": kind, "required": required, **extra}
    tome = _tome_native(required=False)
    return {"version": VERSION, "selector": "source_kind", "providers": [
        {"value": "drush", "label": "Drupal / Drush on the native host", "fields": [
            field("environment_id", "Environment reference", required=True,
                  help="An exact staff-owned reference for this configured native target."),
            field("drush_path", "Existing Drush executable", required=True,
                  placeholder="/srv/site/vendor/bin/drush"),
            field("php_path", "PHP executable, when required",
                  help="Optional existing PHP binary for a non-executable Drush script."),
            field("site_root", "Native Drupal root", required=True,
                  placeholder="/srv/site/web"),
            field("restore_destination", "Reviewed project restore directory",
                  placeholder="/srv/site",
                  help="Existing project root containing this Drupal root; restored files stay beneath this directory."),
            field("files_relative_path", "Drupal files directory within the project",
                  placeholder="web/sites/default/files",
                  help="The actual public files directory for this target, relative to the project restore directory."),
            field("site_alias", "Existing local Drush alias",
                  help="Optional @alias on this host. Run the adapter on a remote site's host."),
            field("uri", "Site URI", required=True, placeholder="https://pilot.example.invalid"),
            field("timeout_seconds", "Native command timeout (seconds)", "integer", default=600,
                  minimum=10, maximum=7200),
            field("max_artifact_bytes", "Maximum individual artifact bytes", "integer",
                  default=1073741824, minimum=1048576),
        ]},
        {"value": "acquia", "label": "Acquia Cloud API", "fields": [
            field("environment_id", "Acquia environment ID", required=True,
                  help="The actual compound environment ID: internal ID followed by application UUID."),
            field("database_name", "Database name", required=True),
            field("backup_id", "Selected native backup ID", "integer",
                  help="Leave empty for source inventory. Select the actual ID to download or restore it."),
            field("access_token_env", "Access-token environment variable", required=True,
                  placeholder="ACQUIA_ACCESS_TOKEN", help="Variable name only; the token remains on the native host."),
            field("timeout_seconds", "Native request / observation timeout (seconds)", "integer",
                  default=120, minimum=10, maximum=7200),
            field("max_artifact_bytes", "Maximum individual artifact bytes", "integer",
                  default=1073741824, minimum=1048576),
        ]},
        lagoon_adapter.provider_schema(),
        *([tome.configuration_schema()] if tome is not None else []),
        pantheon_adapter.provider_schema(),
        skpr_adapter.provider_schema(),
        tugboat_adapter.provider_schema(),
        upsun_adapter.provider_schema(),
    ]}


def operation_actions(config, operation_type):
    kind = config.get("source_kind")
    if kind == "upsun":
        return upsun_adapter.actions_for(operation_type)
    if kind == "tugboat":
        return tugboat_adapter.actions_for(operation_type)
    if kind == "tome":
        return _tome_native().operation_actions(operation_type)
    if kind == "lagoon":
        return lagoon_adapter.actions_for(operation_type)
    if kind == "pantheon":
        return pantheon_adapter.actions_for(operation_type)
    if kind == "skpr":
        return skpr_adapter.actions_for(operation_type)
    if kind not in {"drush", "acquia"}:
        return []
    if operation_type == "CAPTURE":
        return [{"value": kind + "-capture", "label": "Capture original native source"}]
    if operation_type in {"REHEARSAL", "CUTOVER", "ROLLBACK"}:
        return [{"value": kind + "-restore", "label": "Restore the selected original source"}]
    return []


def can_poll(resume):
    return bool(resume.get("phase") == "accepted" and resume.get("notification_url")) or lagoon_adapter.pollable(resume) or pantheon_adapter.pollable(resume) or skpr_adapter.pollable(resume) or tugboat_adapter.pollable(resume) or upsun_adapter.pollable(resume)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                    ensure_ascii=False).encode()).hexdigest()


def _atomic(path, value):
    path = Path(path)
    temp = path.with_name(path.name + ".pending")
    with temp.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def _file(path, role, **extra):
    path = Path(path).resolve(strict=True)
    if not path.is_file():
        raise ValueError(f"Expected a retained file for {role}.")
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    return {"role": role, "path": str(path), "sha256": digest.hexdigest(), "size": size, **extra}


def _profile(config):
    if isinstance(config, dict) and config.get("source_kind") == "upsun":
        return upsun_adapter.profile(config)
    if config.get("source_kind") == "tugboat":
        return tugboat_adapter.profile(config)
    if not isinstance(config, dict):
        raise ValueError("A named native configuration is required.")
    if config.get("source_kind") == "lagoon":
        return lagoon_adapter.profile(config)
    if config.get("source_kind") == "pantheon":
        return pantheon_adapter.profile(config)
    if config.get("source_kind") == "skpr":
        return skpr_adapter.profile(config)
    allowed = {"source_kind", "api_base"}
    for provider in configuration_schema()["providers"]:
        allowed.update(field["name"] for field in provider["fields"])
    p = {key: value for key, value in config.items() if key in allowed}
    if p.get("source_kind") not in ("drush", "acquia"):
        raise ValueError("Select Drupal / Drush or Acquia Cloud API.")
    if not isinstance(p.get("environment_id"), str) or not p["environment_id"].strip():
        raise ValueError("Set the exact environment reference.")
    p["timeout_seconds"] = int(p.get("timeout_seconds") or 600)
    p["max_artifact_bytes"] = int(p.get("max_artifact_bytes") or 1073741824)
    if not 10 <= p["timeout_seconds"] <= 7200 or p["max_artifact_bytes"] < 1048576:
        raise ValueError("Native timeout or artifact limit is out of range.")
    if p["source_kind"] == "acquia":
        if p.get("api_base", API_BASE).rstrip("/") != API_BASE:
            raise ValueError("The configured API must be the published Acquia Cloud API origin.")
        if not re.fullmatch(r"[0-9]+-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", p["environment_id"]):
            raise ValueError("Use Acquia's actual compound environment ID.")
        if not isinstance(p.get("database_name"), str) or not p["database_name"].strip():
            raise ValueError("Set the selected native database name.")
        key = p.get("access_token_env", "")
        if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise ValueError("Set the access-token environment-variable name.")
        if p.get("backup_id") not in (None, ""):
            if isinstance(p["backup_id"], bool) or int(p["backup_id"]) < 1:
                raise ValueError("The native backup ID must be a positive integer.")
            p["backup_id"] = int(p["backup_id"])
        else:
            p["backup_id"] = None
    else:
        root = Path(str(p.get("site_root", ""))).expanduser()
        if not root.is_absolute() or not root.is_dir():
            raise ValueError("Choose the existing absolute native Drupal root.")
        p["site_root"] = str(root.resolve())
        if p.get("restore_destination"):
            destination = Path(p["restore_destination"]).expanduser()
            if not destination.is_absolute() or not destination.is_dir():
                raise ValueError("Select the existing absolute project restore directory.")
            destination = destination.resolve()
            if not root.resolve().is_relative_to(destination):
                raise ValueError("The configured Drupal root must belong to the selected restore project.")
            p["restore_destination"] = str(destination)
        if p.get("files_relative_path"):
            relative = Path(p["files_relative_path"])
            if relative.is_absolute() or any(part in ("..", ".") for part in relative.parts):
                raise ValueError("The files directory must be an ordinary relative path within the restore project.")
            p["files_relative_path"] = relative.as_posix()
        u = parse.urlsplit(str(p.get("uri", "")))
        if u.scheme not in ("http", "https") or not u.hostname or u.username or u.password:
            raise ValueError("Set the native site's http(s) URI without credentials.")
        if p.get("site_alias") and not re.fullmatch(r"@[A-Za-z0-9_.:-]+", p["site_alias"]):
            raise ValueError("The existing local Drush alias must start with @.")
    return p


def _binary(value, *, executable=True):
    if not value:
        raise ValueError("Configure the existing native executable.")
    path = shutil.which(str(value)) if not Path(str(value)).is_absolute() else str(value)
    if not path or not Path(path).is_file() or (executable and not os.access(path, os.X_OK)):
        raise ValueError(f"Native executable is unavailable: {value}")
    return str(Path(path).resolve())


def _prefix(p, *, alias=True):
    if p.get("php_path"):
        argv = [_binary(p["php_path"]), _binary(p.get("drush_path"), executable=False)]
    else:
        argv = [_binary(p.get("drush_path"))]
    if alias and p.get("site_alias"):
        argv.append(p["site_alias"])
    return argv + ["--root=" + p["site_root"], "--uri=" + p["uri"]]


def _context(p):
    if p["source_kind"] == "upsun":
        return upsun_adapter.provider_context(p)
    if p["source_kind"] == "tugboat":
        return tugboat_adapter.provider_context(p)
    if p["source_kind"] == "lagoon":
        return lagoon_adapter.provider_context(p)
    if p["source_kind"] == "pantheon":
        return pantheon_adapter.provider_context(p)
    if p["source_kind"] == "skpr":
        return skpr_adapter.provider_context(p)
    result = {"source_kind": p["source_kind"], "environment_id": p["environment_id"]}
    fields = ("site_root", "site_alias", "uri", "restore_destination", "files_relative_path") if p["source_kind"] == "drush" else ("database_name", "backup_id")
    result.update({k: p[k] for k in fields if p.get(k) not in (None, "")})
    return result


class NativeWaiting(Exception):
    pass


class NativeCancelled(Exception):
    pass


class Session:
    def __init__(self, p, output_dir, checkpoint=None, cancelled=None, workspace_relocations=None):
        self.p = p
        self.relocations = []
        for item in workspace_relocations or []:
            if not isinstance(item, dict) or not all(isinstance(item.get(k), str)
                    and Path(item[k]).is_absolute() for k in ("from", "to")):
                raise ValueError("Workspace relocation must retain its exact original and current private roots.")
            original, current = (str(Path(item[k])) for k in ("from", "to"))
            if original != current:
                self.relocations.append((original.rstrip("/"), current.rstrip("/")))
        self.relocations.sort(key=lambda item: len(item[0]), reverse=True)
        self.out = Path(self.private_path(str(output_dir))).resolve()
        self.out.mkdir(parents=True, exist_ok=True)
        self.notify = checkpoint or (lambda _: None)
        self.cancelled = cancelled or (lambda: False)
        self.artifacts = []
        self.events = []
        self.state = {}

    def private_path(self, value):
        if not isinstance(value, str):
            return value
        for original, current in self.relocations:
            for directory in ("native-operations", "sources"):
                prefix = original + "/" + directory
                if value == prefix or value.startswith(prefix + "/"):
                    return current + value[len(original):]
        return value

    def resolve_private(self, value, key=None):
        # Native targets remain where the reviewed profile placed them. Only the
        # carrier's copied custody directories move with its private workspace.
        if key in {"intent", "target", "native_target", "provider_context", "profile",
                   "configuration", "native_status", "files_target", "before", "temporary"}:
            return value
        if key == "argv" and isinstance(value, list):
            resolved = []
            for argument in value:
                if isinstance(argument, str) and argument.startswith(("--file=", "--source=",
                        "--destination=", "--result-file=", "--request=", "--receipt=")):
                    option, path = argument.split("=", 1)
                    resolved.append(option + "=" + self.private_path(path))
                else:
                    resolved.append(self.private_path(argument))
            return resolved
        if isinstance(value, dict):
            return {name: self.resolve_private(item, name) for name, item in value.items()}
        if isinstance(value, list):
            return [self.resolve_private(item) for item in value]
        return self.private_path(value)

    def read_private_json(self, path):
        path = Path(self.private_path(str(path)))
        raw = path.read_bytes()
        original = json.loads(raw)
        resolved = self.resolve_private(original)
        if original != resolved:
            custody = self.out / "relocated-originals"
            custody.mkdir(exist_ok=True)
            retained = custody / (path.name + "." + hashlib.sha256(raw).hexdigest())
            try:
                with retained.open("xb") as stream:
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
            except FileExistsError:
                if retained.read_bytes() != raw:
                    raise ValueError("An original native relocation record changed in custody.")
        return resolved

    def check(self):
        if self.cancelled():
            raise NativeCancelled("The native operation was cancelled.")

    def event(self, value):
        event = {"at": _now(), **value}
        self.events.append(event)
        path = self.out / ("event-" + str(time.time_ns()) + ".json")
        _atomic(path, event)
        phase = self.state.get("phase")
        self.notify({"adapter_version": VERSION, "provider_context": _context(self.p),
                     "stage": value.get("stage", value.get("kind", phase)),
                     "mutation_started": bool(self.state.get("mutation_started")),
                     "safe_to_retry": phase not in ("dispatching", "native_interrupted"),
                     "resume_checkpoint": self.state,
                     "state": self.state, "event": event, "event_path": str(path)})

    def save_state(self):
        _atomic(self.out / "native-state.json", self.state)
        self.event({"kind": "native_state", "phase": self.state.get("phase")})

    def command(self, label, argv, *, mutating=False, stdin_path=None):
        self.check()
        argv = self.resolve_private(argv, "argv")
        stdin_path = self.private_path(stdin_path)
        record_path = self.out / (label + ".command.json")
        input_file = _file(stdin_path, "command_input") if stdin_path else None
        previous = (self.read_private_json(record_path) if record_path.exists()
                    else self.state.get("completed_commands", {}).get(label))
        if previous:
            if previous.get("argv") != argv or previous.get("stdin") != input_file:
                raise ValueError("The retained native command belongs to a different request.")
            retry_read = (not mutating and previous.get("phase") == "interrupted"
                          and previous.get("owned_process_reaped") is True)
            if previous.get("phase") == "not_started" or retry_read:
                retained = dict(previous)
                suffix = ".attempt-" + str(time.time_ns())
                for role in ("stdout", "stderr"):
                    if previous.get(role) and Path(previous[role]["path"]).is_file():
                        copied = self.out / (label + suffix + "." + role)
                        shutil.copyfile(previous[role]["path"], copied)
                        retained[role] = _file(copied, role)
                _atomic(self.out / (label + suffix + ".json"), retained)
                previous = None
            elif previous.get("phase") != "complete":
                raise NativeWaiting("The original native command has no retained completion; reconcile that same process before another execution.")
        if previous:
            if previous.get("returncode") != 0:
                raise ValueError(f"Original native command {label} failed; its command and output are retained.")
            for role in ("stdout", "stderr"):
                saved = previous[role]
                current = _file(saved["path"], role)
                if current["sha256"] != saved["sha256"]:
                    raise ValueError("Retained native command output changed.")
            return previous
        if mutating and self.state.get("pending_command") == label and not record_path.exists():
            raise NativeWaiting("This continuation retains an already started command; restore its original command result before execution.")
        out_path = self.out / (label + ".stdout")
        err_path = self.out / (label + ".stderr")
        record = {"argv": argv, "cwd": self.p["site_root"], "started_at": _now(),
                  "phase": "prepared", "mutating": mutating, "stdin": input_file}
        _atomic(record_path, record)
        self.event({"kind": "command_prepared", "record": str(record_path), "argv": argv})
        process = None
        input_stream = None
        try:
            with out_path.open("wb") as out, err_path.open("wb") as err:
                if mutating:
                    self.state.update(phase="native_interrupted", mutation_started=True,
                                      pending_command=label, command_record=str(record_path))
                    self.save_state()
                if stdin_path:
                    input_stream = Path(stdin_path).open("rb")
                process = subprocess.Popen(argv, cwd=self.p["site_root"], stdout=out, stderr=err,
                                           stdin=input_stream if input_stream else subprocess.DEVNULL,
                                           start_new_session=True)
                record.update(phase="running", pid=process.pid)
                _atomic(record_path, record)
                self.event({"kind": "command_running", "record": str(record_path), "pid": process.pid})
                deadline = time.monotonic() + self.p["timeout_seconds"]
                while process.poll() is None:
                    self.check()
                    if time.monotonic() >= deadline:
                        raise TimeoutError("Native command exceeded its configured timeout.")
                    time.sleep(0.2)
                record["returncode"] = process.returncode
        except BaseException as exc:
            if process and process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=5)
            record.update(phase="interrupted" if process else "not_started", error=str(exc),
                          returncode=process.returncode if process else None,
                          owned_process_reaped=bool(process and process.poll() is not None))
            for role, path in (("stdout", out_path), ("stderr", err_path)):
                if path.is_file():
                    record[role] = _file(path, role)
            _atomic(record_path, record)
            if process is None and mutating:
                # No child was created; retaining the source step makes this fact explicit.
                self.state.update(phase="native_prepared", mutation_started=bool(self.state.get("completed_commands")),
                                  pending_command=None, launch_failed=True)
                self.save_state()
            raise
        finally:
            if input_stream:
                input_stream.close()
        record.update(phase="complete", completed_at=_now(), stdout=_file(out_path, "stdout"),
                      stderr=_file(err_path, "stderr"))
        _atomic(record_path, record)
        if mutating:
            self.state.setdefault("completed_commands", {})[label] = record
            self.state.update(phase="native_prepared" if record["returncode"] == 0 else "native_failed",
                              pending_command=None)
            self.save_state()
        self.event({"kind": "command_complete", "record": str(record_path), "returncode": record["returncode"]})
        if record["returncode"] != 0:
            raise ValueError(f"Native command {label} returned {record['returncode']}; inspect its retained stderr.")
        return record

    def add(self, path, role, **extra):
        result = _file(path, role, **extra)
        if result["size"] > self.p["max_artifact_bytes"]:
            raise ValueError("An actual artifact exceeds the configured intake size.")
        self.artifacts.append(result)
        return result

    def result(self, status, observations=None, message=None):
        return {"status": status, "artifacts": self.artifacts,
                "provider_context": _context(self.p), "observations": observations or {},
                "events": self.events, "checkpoint": self.state, "resume_checkpoint": self.state,
                "mutation_started": bool(self.state.get("mutation_started")),
                "safe_to_retry": self.state.get("phase") not in ("dispatching", "native_interrupted"),
                **({"message": message} if message else {})}


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _safe_url(url, *, api=False):
    u = parse.urlsplit(url)
    if u.scheme != "https" or not u.hostname or u.username or u.password or u.fragment:
        raise ValueError("The native URL must be credential-free HTTPS.")
    if api and not (u.netloc == "cloud.acquia.com" and u.path.startswith("/api/")):
        raise ValueError("The native operation is outside the published Acquia API.")
    if u.hostname in ("localhost", "localhost.localdomain"):
        raise ValueError("A provider download cannot target localhost.")
    try:
        if not ipaddress.ip_address(u.hostname).is_global:
            raise ValueError("A provider download cannot target a private IP address.")
    except ValueError as exc:
        if "private IP" in str(exc):
            raise
    return url


def _display_url(url):
    u = parse.urlsplit(url)
    # Retained response bytes may contain signed links; never echo their query values.
    return parse.urlunsplit((u.scheme, u.netloc, u.path, "", ""))


def _notification_url(url):
    _safe_url(url, api=True)
    value = parse.urlsplit(url)
    if value.query or not re.fullmatch(r"/api/notifications/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", value.path):
        raise ValueError("The continuation must name the exact native notification UUID.")
    return url


def _http(s, label, url, *, method="GET", accept="application/hal+json", acquia_auth=True):
    s.check()
    _safe_url(url)
    token = os.environ.get(s.p["access_token_env"], "") if acquia_auth else ""
    if acquia_auth and not token:
        raise NativeWaiting("The configured access-token variable is empty on this native host.")
    opener = request.build_opener(NoRedirect)
    start = _now()
    requested_url_sha256 = hashlib.sha256(url.encode()).hexdigest()
    s.event({"kind": "http_request", "method": method, "url": _display_url(url),
             "url_sha256": hashlib.sha256(url.encode()).hexdigest(), "label": label})
    for _ in range(6):
        u = parse.urlsplit(url)
        headers = {"Accept": accept}
        if acquia_auth and u.netloc == "cloud.acquia.com" and u.path.startswith("/api/"):
            headers["Authorization"] = "Bearer " + token
        req = request.Request(url, data=b"" if method == "POST" else None, headers=headers, method=method)
        try:
            response = opener.open(req, timeout=min(s.p["timeout_seconds"], 120))
        except error.HTTPError as exc:
            if method == "GET" and exc.code in (301, 302, 303, 307, 308) and exc.headers.get("Location"):
                url = _safe_url(parse.urljoin(url, exc.headers["Location"]))
                continue
            response = exc
        path = s.out / (label + ".response")
        temporary = path.with_name(path.name + ".pending")
        count = 0
        with response, temporary.open("wb") as stream:
            while True:
                s.check()
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > s.p["max_artifact_bytes"]:
                    raise ValueError("Native response exceeds the configured artifact limit.")
                stream.write(chunk)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        result = {"method": method, "url": _display_url(url), "url_sha256": hashlib.sha256(url.encode()).hexdigest(), "requested_url_sha256": requested_url_sha256, "requested_at": start,
                  "completed_at": _now(), "status": response.code,
                  "content_type": response.headers.get("Content-Type", ""),
                  "response": _file(path, "provider_response")}
        _atomic(s.out / (label + ".request.json"), result)
        s.event({"kind": "http_response", **result})
        return result
    raise ValueError("The native download returned too many redirects.")


def _json_response(result):
    if not 200 <= result["status"] < 300:
        raise ValueError(f"Acquia returned HTTP {result['status']}; the native response is retained.")
    path = Path(result["response"]["path"])
    if path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError("Native JSON response exceeds the metadata intake size.")
    value = json.loads(path.read_bytes())
    if not isinstance(value, dict) or value.get("error"):
        raise ValueError("Expected a successful original Acquia object response.")
    return value


def _env_path(p):
    return API_BASE + "/environments/" + parse.quote(p["environment_id"], safe="")


def _backup_path(p):
    return _env_path(p) + "/databases/" + parse.quote(p["database_name"], safe="") + "/backups"


def _pages(s, label, url):
    rows, captures, seen = [], [], set()
    offset = 0
    for page in range(1000):
        response = _http(s, f"{label}-{page:04}", url + "?" + parse.urlencode({"limit": 100, "offset": offset}))
        value = _json_response(response)
        items = value.get("_embedded", {}).get("items")
        if not isinstance(items, list):
            raise ValueError("Acquia's original HAL collection is missing _embedded.items.")
        captures.append({"request": {"url": url, "limit": 100, "offset": offset}, "response": value})
        for item in items:
            if not isinstance(item, dict):
                raise ValueError("Native collection contains a non-object item.")
            identity = str(item.get("id", item.get("hostname", "")))
            if not identity or identity in seen:
                raise ValueError("Native paged source has a missing or repeated identity; refresh the same census.")
            seen.add(identity)
        rows.extend(items)
        if not items:
            # Native 'total' is documented as returned collection count, not a reliable grand total.
            break
        offset += len(items)
    else:
        raise ValueError("Native collection exceeded the supported page census.")
    path = s.out / (label + ".captures.json")
    _atomic(path, {"source_url": url, "pages": captures, "complete": True})
    s.add(path, "provider_collection", collection=label)
    return rows


def _check_backup(p, value):
    if (str(value.get("id")) != str(p["backup_id"])
            or value.get("environment", {}).get("id") != p["environment_id"]
            or value.get("database", {}).get("name") != p["database_name"]):
        raise ValueError("The native backup does not match the selected environment, database and backup ID.")
    if value.get("flags", {}).get("deleted") is True or not value.get("completed_at"):
        raise ValueError("The selected native backup is deleted or has no completed timestamp.")


def _drush_fingerprint(p, native, names):
    target = {k: native[k] for k in ("uri", "root", "site", "db-driver", "db-hostname", "db-port",
              "db-name", "files", "drupal-version", "drush-version") if k in native}
    return _digest({"profile": _context(p), "native_target": target,
        "commands": sorted(names & {"sql:drop", "sql:query", "config:import", "cache:rebuild", "yaml:get:value"})})


def _drush_info(s, *, fresh=False):
    p = s.p
    suffix = "-" + str(time.time_ns()) if fresh else ""
    if p.get("site_alias"):
        alias = s.command("alias" + suffix, _prefix(p, alias=False) + ["site:alias", p["site_alias"], "--format=json"])
        resolved = json.loads(Path(alias["stdout"]["path"]).read_bytes())
        def remote(value):
            return isinstance(value, dict) and (bool(value.get("host") or value.get("remote-host"))
                   or any(remote(v) for v in value.values()))
        if remote(resolved):
            raise ValueError("Run this adapter on the selected native host; remote aliases do not share these retained artifact paths.")
    status = s.command("status" + suffix, _prefix(p) + ["core:status", "--format=json",
        "--fields=drupal-version,uri,db-driver,db-hostname,db-port,db-name,db-status,bootstrap,php-version,drush-version,root,site,files,config-sync"])
    commands = s.command("commands" + suffix, _prefix(p) + ["list", "--format=json"])
    native = json.loads(Path(status["stdout"]["path"]).read_bytes())
    listing = json.loads(Path(commands["stdout"]["path"]).read_bytes())
    if not isinstance(native, dict) or not isinstance(listing, dict):
        raise ValueError("Native Drush status and command list must be JSON objects.")
    names = {x.get("name") for x in listing.get("commands", []) if isinstance(x, dict)}
    if native.get("root") and Path(native["root"]).resolve() != Path(p["site_root"]):
        raise ValueError("The actual Drush root differs from the configured target.")
    return native, names, _drush_fingerprint(p, native, names)


def _restore_drush_preflight(s, reviewed_fingerprint):
    native, names, fingerprint = _drush_info(s, fresh=True)
    original = s.state.get("native_preflight")
    if not original and s.state.get("mutation_started"):
        # Recover the actual status/list pair retained before the first reset.
        first = min((record.get("started_at", "") for record in
                     s.state.get("completed_commands", {}).values() if record.get("mutating")), default="")
        for path in sorted(s.out.glob("status-*.command.json")):
            record = s.read_private_json(path)
            if (record.get("phase") != "complete" or record.get("returncode") != 0
                    or not first or record.get("started_at", "") >= first):
                continue
            if record.get("argv", [])[:len(_prefix(s.p)) + 1] != _prefix(s.p) + ["core:status"]:
                continue
            command_path = path.with_name(path.name.replace("status-", "commands-", 1))
            if not command_path.is_file():
                continue
            command_record = s.read_private_json(command_path)
            if (command_record.get("phase") != "complete" or command_record.get("returncode") != 0
                    or command_record.get("argv") != _prefix(s.p) + ["list", "--format=json"]):
                continue
            for item in (record["stdout"], record["stderr"], command_record["stdout"], command_record["stderr"]):
                _verify_artifact(item)
            previous_native = json.loads(Path(record["stdout"]["path"]).read_bytes())
            previous_commands = json.loads(Path(command_record["stdout"]["path"]).read_bytes())
            previous_names = {x.get("name") for x in previous_commands.get("commands", []) if isinstance(x, dict)}
            if _drush_fingerprint(s.p, previous_native, previous_names) == reviewed_fingerprint:
                original = {"native_status": previous_native, "commands": sorted(previous_names),
                    "target_fingerprint": reviewed_fingerprint, "status_record": str(path),
                    "commands_record": str(command_path)}
                break
    if fingerprint != reviewed_fingerprint:
        if not s.state.get("mutation_started") or not original or original.get("target_fingerprint") != reviewed_fingerprint:
            raise ValueError("Review the current native target fingerprint before restoring to it.")
        previous = original["native_status"]
        required_identity = ("root", "site", "db-driver", "db-name", "drupal-version", "drush-version")
        if any(not native.get(key) or native[key] != previous.get(key) for key in required_identity):
            raise ValueError("The native target identity changed after the retained restore started.")
        for key in ("uri", "db-hostname", "db-port", "files"):
            if native.get(key) not in (None, "") and native[key] != previous.get(key):
                raise ValueError("The continued native target differs from its original pre-reset observation.")
        native, names = {**previous, **native}, set(original["commands"])
        if not native.get("files"):
            native["files"] = previous["files"]
    if not original:
        original = {"native_status": native, "commands": sorted(names), "target_fingerprint": fingerprint}
    if s.state.get("native_preflight") != original:
        s.state["native_preflight"] = original
        s.save_state()
    return native, names


def _retained_bytes(path, value):
    path = Path(path)
    try:
        with path.open("xb") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
    except FileExistsError:
        if path.read_bytes() != value:
            raise ValueError("A retained native helper or request differs from this exact continuation.")


def _restore_drupal_sqlite(s, native, sql):
    p = s.p
    site = _ordinary_relative(native.get("site")).as_posix()
    database = Path(str(native.get("db-name", "")))
    if not database.is_absolute():
        database = Path(p["site_root"]) / database
    database = database.resolve(strict=True)
    if not database.is_file():
        raise ValueError("The reviewed native SQLite target is not an existing file.")
    job = {"site_root": p["site_root"], "site_path": site, "uri": p["uri"],
        "database_path": str(database), "sql_sha256": sql["sha256"], "sql_size": sql["size"]}
    script = s.out / "drupal-sqlite-driver-v1.php"
    job_path = s.out / "drupal-sqlite-request.json"
    _retained_bytes(script, DRUPAL_SQLITE_IMPORT.encode())
    _retained_bytes(job_path, (json.dumps(job, sort_keys=True, indent=2) + "\n").encode())
    script_artifact = s.add(script, "native_import_helper")
    request_artifact = s.add(job_path, "native_import_request")
    prefix = [_binary(p.get("php_path") or "php"), str(script)]
    arguments = [str(job_path), sql["path"], request_artifact["sha256"]]
    preflight = s.command("database-driver-preflight", prefix + ["preflight"] + arguments)
    observed = json.loads(Path(preflight["stdout"]["path"]).read_bytes())
    if (observed.get("database_path") != str(database) or observed.get("sql_sha256") != sql["sha256"]
            or "NOCASE_UTF8" not in observed.get("collations", [])):
        raise ValueError("The actual Drupal SQLite driver preflight differs from the reviewed source or target.")
    original_path = s.out / "database-restore.command.json"
    original = (s.read_private_json(original_path) if original_path.exists()
                else s.state.get("completed_commands", {}).get("database-restore"))
    original_argv = _prefix(p) + ["sql:query", "--file=" + sql["path"]]
    if original:
        if original.get("argv") != original_argv or original.get("stdin") is not None:
            raise ValueError("The prior generic SQL command belongs to a different source.")
        if original.get("phase") != "complete" or not isinstance(original.get("returncode"), int):
            raise NativeWaiting("Reconcile the original SQL import completion before a driver correction.")
        for role in ("stdout", "stderr"):
            _verify_artifact(original[role])
        if original["returncode"] == 0:
            return {"method": "retained-successful-sql-query", "command": str(original_path)}
        reset = s.state.get("completed_commands", {}).get("database-reset") or {}
        if reset.get("phase") != "complete" or reset.get("returncode") != 0:
            raise ValueError("The known failed SQL import requires its original completed reset record.")
        if not s.state.get("sqlite_driver_correction"):
            s.state["sqlite_driver_correction"] = {"reason": "known-failed-generic-sqlite-import",
                "original_command": _file(original_path, "failed_native_command"),
                "original_stderr": original["stderr"], "sql_sha256": sql["sha256"],
                "driver_source_sha256": observed["driver_source_sha256"],
                "helper_sha256": script_artifact["sha256"], "recorded_at": _now()}
            s.save_state()
        # A failed generic import can leave committed partial tables. Keep both
        # original records and perform this distinct correction reset once.
        s.command("database-reset-sqlite-driver", _prefix(p) + ["sql:drop", "--yes"], mutating=True)
    else:
        s.command("database-reset", _prefix(p) + ["sql:drop", "--yes"], mutating=True)
    imported = s.command("database-restore-sqlite-driver", prefix + ["import"] + arguments, mutating=True)
    result = json.loads(Path(imported["stdout"]["path"]).read_bytes())
    if (result.get("database_path") != str(database) or result.get("sql_sha256") != sql["sha256"]
            or result.get("integrity_check") != ["ok"]):
        raise ValueError("The actual Drupal driver import did not confirm the selected bytes and database.")
    s.add(imported["stdout"]["path"], "native_database_import_result")
    return {"method": "drupal-native-sqlite-driver", **result}


def discover_capabilities(config, runtime_bindings=None):
    if isinstance(config, dict) and config.get("source_kind") == "upsun":
        return {"configuration_schema": configuration_schema(), **upsun_adapter.discover_capabilities(config, runtime_bindings)}
    if isinstance(config, dict) and config.get("source_kind") == "tugboat":
        return {"configuration_schema": configuration_schema(), **tugboat_adapter.discover_capabilities(config, runtime_bindings)}
    if runtime_bindings is not None and (not isinstance(config, dict) or config.get("source_kind") not in {"pantheon", "skpr"}):
        raise ValueError("Local runtime bindings are available for the selected Pantheon or Skpr provider.")
    if isinstance(config, dict) and config.get("source_kind") == "tome":
        return {**_tome_native().discover_capabilities(config), "configuration_schema": configuration_schema()}
    if isinstance(config, dict) and config.get("source_kind") == "lagoon":
        return {"configuration_schema": configuration_schema(), **lagoon_adapter.discover_capabilities(config)}
    if isinstance(config, dict) and config.get("source_kind") == "pantheon":
        return {"configuration_schema": configuration_schema(), **pantheon_adapter.discover_capabilities(config, runtime_bindings)}
    if isinstance(config, dict) and config.get("source_kind") == "skpr":
        return {"configuration_schema": configuration_schema(), **skpr_adapter.discover_capabilities(config, runtime_bindings)}
    result = {"configuration_schema": configuration_schema(), "ready": False, "actions": [],
              "configuration": {}, "current_config": {}}
    try:
        p = _profile(config)
        result.update(configuration=p, current_config=p)
        with tempfile.TemporaryDirectory(prefix="govhub-native-capabilities-") as folder:
            s = Session(p, folder)
            if p["source_kind"] == "drush":
                native, names, fingerprint = _drush_info(s)
                result.update(native_status=native, target_fingerprint=fingerprint,
                              actions=[{"value": "drush-capture", "label": "Capture native status, configuration, SQL and archive"}])
                if {"sql:drop", "sql:query", "config:import", "cache:rebuild", "yaml:get:value"} <= names:
                    result["actions"].append({"value": "drush-restore",
                        "label": "Restore the selected SQL, configuration and public files into this native target",
                        "required_profile_fields": ["restore_destination", "files_relative_path"],
                        "commands": ["sql:drop --yes", "Drupal native SQLite driver import" if native.get("db-driver") == "sqlite" else "sql:query --file",
                                     "config:import --source", "cache:rebuild"]})
                result["missing_commands"] = sorted({"config:export", "sql:dump", "archive:dump"} - names)
                result["ready"] = not result["missing_commands"]
            else:
                value = _json_response(_http(s, "environment", _env_path(p)))
                if value.get("id") != p["environment_id"]:
                    raise ValueError("Acquia returned a different environment ID.")
                result.update(ready=True, native_status={k: value.get(k) for k in ("id", "name", "label", "application", "type", "status")},
                              target_fingerprint=_digest(_context(p)), actions=[
                                  {"value": "acquia-capture", "label": "Capture current native environment and backup source"},
                                  {"value": "acquia-restore", "label": "Restore this selected backup to its native environment and database"}])
            result["provider_context"] = _context(p)
            result["observed_at"] = _now()
    except Exception as exc:
        result["message"] = str(exc)
    return result


def capture(config, context, checkpoint=None, cancelled=None):
    if config.get("source_kind") == "upsun":
        return upsun_adapter.capture(config, context, checkpoint, cancelled)
    if config.get("source_kind") == "tugboat":
        return tugboat_adapter.capture(config, context, checkpoint, cancelled)
    if config.get("source_kind") == "tome":
        return _tome_native().capture(config, context, checkpoint=checkpoint, cancelled=cancelled)
    if config.get("source_kind") == "lagoon":
        return lagoon_adapter.capture(config, context, checkpoint, cancelled)
    if config.get("source_kind") == "pantheon":
        return pantheon_adapter.capture(config, context, checkpoint, cancelled)
    if config.get("source_kind") == "skpr":
        return skpr_adapter.capture(config, context, checkpoint, cancelled)
    p = _profile(config)
    s = Session(p, context["output_dir"], checkpoint, cancelled, context.get("workspace_relocations"))
    try:
        if p["source_kind"] == "drush":
            native, names, fingerprint = _drush_info(s)
            missing = {"config:export", "sql:dump", "archive:dump"} - names
            if missing:
                raise ValueError("Installed Drush lacks required commands: " + ", ".join(sorted(missing)))
            s.add(s.out / "status.stdout", "native_status")
            destination = s.out / "configuration"
            s.command("configuration-export", _prefix(p) + ["config:export", "--destination=" + str(destination), "--yes"])
            entries = []
            for file in sorted(destination.rglob("*")):
                if file.is_symlink():
                    raise ValueError("Native configuration export contains a symlink; retain ordinary export files.")
                if file.is_file():
                    item = s.add(file, "configuration_file", relative_path=file.relative_to(destination).as_posix())
                    entries.append({k: item[k] for k in ("relative_path", "sha256", "size")})
            if not entries:
                raise ValueError("The native configuration export is empty.")
            export = s.out / "configuration-manifest.json"
            _atomic(export, {"schema": "drush-configuration-files/v1", "files": entries})
            s.add(export, "export", format="drush-configuration-manifest")
            sql = s.out / "database.sql"
            s.command("database-dump", _prefix(p) + ["sql:dump", "--result-file=" + str(sql)])
            s.add(sql, "database_dump")
            backup = s.out / "backup.tar.gz"
            s.command("archive-dump", _prefix(p) + ["archive:dump", "--destination=" + str(backup), "--yes"])
            s.add(backup, "backup", format="drush-archive", provider_context=_context(p))
            return s.result("COMPLETE", {"native_status": native, "target_fingerprint": fingerprint,
                                          "configuration_files": len(entries)})
        environment = _json_response(_http(s, "environment", _env_path(p)))
        if environment.get("id") != p["environment_id"]:
            raise ValueError("The native environment response differs from the selected target.")
        s.add(s.out / "environment.response", "provider_environment")
        domains = _pages(s, "domains", _env_path(p) + "/domains")
        for domain in domains:
            if domain.get("environment", {}).get("id") != p["environment_id"]:
                raise ValueError("A native domain belongs to another environment.")
        backups = _pages(s, "backups", _backup_path(p))
        for backup in backups:
            if (backup.get("environment", {}).get("id") != p["environment_id"]
                    or backup.get("database", {}).get("name") != p["database_name"]):
                raise ValueError("A native backup collection mixes environment or database identities.")
        if p["backup_id"]:
            backup = _json_response(_http(s, "selected-backup", _backup_path(p) + "/" + str(p["backup_id"])))
            _check_backup(p, backup)
            s.add(s.out / "selected-backup.response", "provider_backup_metadata")
            response = _http(s, "backup-download", _backup_path(p) + "/" + str(p["backup_id"]) + "/actions/download", accept="application/octet-stream")
            if not 200 <= response["status"] < 300:
                raise ValueError(f"Native backup download returned HTTP {response['status']}.")
            download_path = Path(response["response"]["path"])
            prefix = download_path.read_bytes()[:256] if download_path.stat().st_size < 65536 else b""
            if "json" in response["content_type"] or prefix.lstrip().startswith(b"{"):
                descriptor = _json_response(response)
                url = _safe_url(descriptor.get("url", ""))
                expires = datetime.fromisoformat(descriptor["expires_at"].replace("Z", "+00:00"))
                if expires.tzinfo is None or expires <= datetime.now(timezone.utc):
                    raise ValueError("The provider's backup download link is expired.")
                response = _http(s, "backup-bytes", url, accept="application/octet-stream")
            if (not 200 <= response["status"] < 300 or "html" in response["content_type"]
                    or "json" in response["content_type"] or not response["response"]["size"]):
                raise ValueError("Native backup download did not return backup file bytes.")
            s.add(response["response"]["path"], "backup", format="acquia-database-backup", provider_context=_context(p))
        return s.result("COMPLETE", {"environment_id": p["environment_id"], "domain_count": len(domains),
                                      "backup_metadata_count": len(backups), "selected_backup_id": p["backup_id"]})
    except NativeCancelled as exc:
        return s.result("CANCELLED", message=str(exc))
    except NativeWaiting as exc:
        return s.result("WAITING_NATIVE", message=str(exc))
    except Exception as exc:
        return s.result("FAILED", message=str(exc))


def _selected_backup(source_paths, operation):
    candidates = {}
    for binding in source_paths.get("bindings", []):
        if operation.get("agency_id") and binding.get("agency_id") != operation["agency_id"]:
            continue
        item = binding.get("backup")
        if not item:
            continue
        if operation.get("backup_sha256") and item.get("sha256") != operation["backup_sha256"]:
            continue
        candidates[(item.get("path"), item.get("sha256"))] = (item, binding)
    if len(candidates) != 1:
        raise ValueError("Select one exact retained backup binding for this native operation.")
    item, binding = next(iter(candidates.values()))
    current = _file(item["path"], "backup")
    if current["sha256"] != item.get("sha256") or current["size"] != item.get("size"):
        raise ValueError("The selected retained backup differs from its reviewed bytes.")
    return {**item, **current}, binding


def _verify_artifact(item):
    actual = _file(item["path"], item.get("role", "source"))
    if (actual["sha256"], actual["size"]) != (item.get("sha256"), item.get("size")):
        raise ValueError("A retained native source artifact changed after review.")
    return {**item, **actual}


def _ordinary_relative(value):
    if not isinstance(value, str):
        raise ValueError("A retained native file must name its relative path.")
    name = value
    path = Path(name)
    if not name or path.is_absolute() or "\\" in name or ".." in path.parts or name.startswith("./"):
        raise ValueError("A retained native file has an unsafe relative path.")
    return path


def _target_file(root, relative):
    relative = _ordinary_relative(relative)
    path = root / relative
    for part in (path, *path.parents):
        if part == root:
            break
        if part.is_symlink():
            raise ValueError("A native restoration path traverses a symbolic link.")
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("The selected native file is outside its reviewed restoration directory.")
    return path


def _stage_drush_components(s, backup, binding, native):
    p = s.p
    if not p.get("restore_destination") or not p.get("files_relative_path"):
        raise ValueError("Set the actual project and public-files restoration directories before restoring.")
    project = Path(p["restore_destination"])
    files_target = _target_file(project, p["files_relative_path"])
    observed_files = native.get("files")
    if not observed_files:
        raise ValueError("Native Drush status must identify this target's public files directory.")
    observed_files = Path(observed_files)
    if not observed_files.is_absolute():
        observed_files = Path(p["site_root"]) / observed_files
    if observed_files.resolve() != files_target.resolve():
        raise ValueError("The reviewed files directory differs from this native site's actual public files path.")
    supplied = [_verify_artifact(item) for item in binding.get("files", [])]
    sql = [item for item in supplied if item.get("role") == "database_dump"]
    if len(sql) != 1:
        raise ValueError("Retain the exact original database_dump artifact with this archive binding.")
    export = _verify_artifact(binding.get("export") or {})
    manifest = json.loads(Path(export["path"]).read_bytes())
    if manifest.get("schema") != "drush-configuration-files/v1" or not isinstance(manifest.get("files"), list):
        raise ValueError("Select the original complete Drush configuration manifest.")
    available = {}
    for item in supplied:
        if item.get("role") == "configuration_file":
            name = item.get("relative_path")
            if name in available:
                raise ValueError("The native configuration binding repeats a relative filename.")
            available[name] = item
    configuration = s.out / "restore-configuration"
    configuration.mkdir(exist_ok=True)
    seen = set()
    for entry in manifest["files"]:
        name = _ordinary_relative(entry.get("relative_path")).as_posix()
        source = available.get(name)
        if name in seen or not source or (source["sha256"], source["size"]) != (entry.get("sha256"), entry.get("size")):
            raise ValueError("The exact original configuration file set is incomplete or inconsistent.")
        seen.add(name)
        destination = _target_file(configuration, name)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source["path"], destination)
    if not seen or seen != set(available):
        raise ValueError("The complete configuration manifest and retained files must match exactly.")
    actual_names = {path.relative_to(configuration).as_posix() for path in configuration.rglob("*") if path.is_file()}
    if actual_names != seen:
        raise ValueError("The staged configuration contains a file outside its reviewed manifest.")
    staging = s.out / "restore-public-files"
    staging.mkdir(exist_ok=True)
    files, total, seen = [], 0, set()
    archive_manifest = None
    with tarfile.open(backup["path"], "r:*") as archive:
        for member in archive:
            name = member.name.removeprefix("./")
            if name == "MANIFEST.yml":
                if archive_manifest is not None or not member.isfile() or member.size > 65536:
                    raise ValueError("The native archive must contain one ordinary bounded MANIFEST.yml.")
                archive_manifest = s.out / "archive-MANIFEST.yml"
                with archive.extractfile(member) as source, archive_manifest.open("wb") as target:
                    shutil.copyfileobj(source, target)
                continue
            if name.rstrip("/") == "files" or not name.startswith("files/"):
                continue
            relative = _ordinary_relative(name[len("files/"):]).as_posix()
            if member.isdir():
                continue
            if not member.isfile() or relative in seen:
                raise ValueError("The native public-files archive contains a link, special file or duplicate path.")
            seen.add(relative)
            total += member.size
            if total > p["max_artifact_bytes"]:
                raise ValueError("Expanded native public files exceed the configured artifact limit.")
            destination = _target_file(staging, relative)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, destination.open("wb") as target:
                shutil.copyfileobj(source, target, 1024 * 1024)
            descriptor = _file(destination, "public_file", relative_path=relative)
            if descriptor["size"] != member.size:
                raise ValueError("A native archive member is incomplete.")
            target = _target_file(files_target, relative)
            if target.exists() and not target.is_file():
                raise ValueError("A reviewed native file target is not a regular file.")
            files.append({**descriptor, "target": str(target), "mode": member.mode & 0o777})
    if archive_manifest is None:
        raise ValueError("Retain the original Drush archive manifest before reconciling a public-files tree.")
    native_values = {}
    for key in ("formatversion", "components.files", "generatorversion"):
        result = s.command("archive-manifest-" + key.replace(".", "-"),
                           _prefix(p) + ["yaml:get:value", str(archive_manifest), key])
        native_values[key] = Path(result["stdout"]["path"]).read_text().strip().strip("'\"")
    if (native_values["formatversion"] != "1.0" or native_values["components.files"] != "true"
            or not native_values["generatorversion"].startswith("13.")):
        raise ValueError("Complete file reconciliation requires the original Drush 13 format-1.0 files component.")
    if any(Path(item["relative_path"]).parts[0] in DRUSH_FILE_EXCLUSIONS for item in files):
        raise ValueError("The archive contradicts its Drush 13 managed public-files exclusions.")
    s.add(archive_manifest, "native_archive_manifest")
    _prepare_drush_file_plan(s, files, files_target, backup)
    return sql[0], configuration, files, files_target


def _public_file_inventory(root):
    result = {}
    if not root.exists():
        return result
    for folder, directories, names in os.walk(root, followlinks=False):
        parent = Path(folder)
        if parent == root:
            directories[:] = [name for name in directories if name not in DRUSH_FILE_EXCLUSIONS]
            names = [name for name in names if name not in DRUSH_FILE_EXCLUSIONS]
        for name in directories + names:
            path = parent / name
            if path.is_symlink() or not (path.is_file() or path.is_dir()):
                raise ValueError("Managed native public files contain a link or special entry.")
        for name in names:
            path = parent / name
            relative = path.relative_to(root).as_posix()
            result[relative] = _file(path, "public_file", relative_path=relative,
                                     mode=path.stat().st_mode & 0o777)
    return result


def _file_identity(item):
    return (item.get("sha256"), item.get("size")) if item else None


def _public_manifest(files):
    return {"schema": "drush-managed-public-files/v1", "excluded_roots": sorted(DRUSH_FILE_EXCLUSIONS),
            "files": [{key: item[key] for key in ("relative_path", "sha256", "size", "mode")}
                      for item in sorted(files, key=lambda value: value["relative_path"])]}


def _sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _prepare_drush_file_plan(s, files, files_target, backup):
    expected = _public_manifest(files)
    expected_sha = _digest(expected)
    plan = s.state.get("public_file_plan")
    if plan:
        if plan.get("source_manifest_sha256") != expected_sha or plan.get("backup_sha256") != backup["sha256"]:
            raise ValueError("The native public-file continuation belongs to a different recovery point.")
    else:
        before = _public_file_inventory(files_target)
        for item in files:
            pending = item["relative_path"] + ".govhub-" + s.state["intent_sha256"][:16] + ".pending"
            if pending in before:
                raise ValueError("A native file conflicts with this operation's temporary restoration path.")
        plan = {"source_manifest_sha256": expected_sha, "backup_sha256": backup["sha256"],
                "files_target": str(files_target), "before": before,
                "remove": sorted(set(before) - {item["relative_path"] for item in files}),
                "excluded_roots": sorted(DRUSH_FILE_EXCLUSIONS)}
        s.state["public_file_plan"] = plan
        s.state.setdefault("file_actions", {})
        s.save_state()
    path = s.out / "source-public-files-manifest.json"
    _atomic(path, expected)
    s.add(path, "source_public_files_manifest")


def _restore_drush_files(s, files, files_target):
    plan = s.state["public_file_plan"]
    source_by_name = {item["relative_path"]: item for item in files}
    actions = s.state.setdefault("file_actions", {})
    for relative in sorted(set(source_by_name) | set(plan["remove"])):
        s.check()
        item = source_by_name.get(relative)
        target = _target_file(files_target, relative)
        if target.exists() and not target.is_file():
            raise ValueError("A managed native file target changed to a non-file entry.")
        current = _file(target, "current_file") if target.is_file() else None
        before = plan["before"].get(relative)
        action = actions.get(relative)
        expected = _file_identity(item)
        if action and action.get("phase") == "complete":
            if _file_identity(current) != expected:
                raise ValueError("A completed native file action changed before this continuation.")
            continue
        if action is None:
            if _file_identity(current) != _file_identity(before):
                raise ValueError("A native public file changed after its original restore preflight.")
            retained = None
            if before and (item is None or _file_identity(before) != expected):
                custody = s.out / "prior-public-files"
                custody.mkdir(exist_ok=True)
                original = _target_file(custody, relative)
                original.parent.mkdir(parents=True, exist_ok=True)
                if not original.exists():
                    with target.open("rb") as source, original.open("xb") as output:
                        shutil.copyfileobj(source, output, 1024 * 1024)
                        output.flush()
                        os.fsync(output.fileno())
                    _sync_directory(original.parent)
                retained = _file(original, "displaced_public_file", relative_path=relative)
                if _file_identity(retained) != _file_identity(before):
                    raise ValueError("The retained displaced file differs from the native preflight bytes.")
            action = {"kind": "restore" if item else "remove", "phase": "prepared",
                      "before": before, "retained_before": retained,
                      "source_sha256": item["sha256"] if item else None,
                      "target": str(target)}
            actions[relative] = action
            s.state.update(phase="native_files", mutation_started=True)
            s.save_state()
        if action.get("retained_before"):
            retained = _file(action["retained_before"]["path"], "displaced_public_file")
            if _file_identity(retained) != _file_identity(before):
                raise ValueError("Original displaced-file custody changed before continuation.")
        if _file_identity(current) not in (_file_identity(before), expected):
            raise ValueError("A prepared native file action has a different current result.")
        if item:
            if _file_identity(current) != expected or target.stat().st_mode & 0o777 != item["mode"]:
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_name(target.name + ".govhub-" + s.state["intent_sha256"][:16] + ".pending")
                if temporary.is_symlink() or (temporary.exists() and not temporary.is_file()):
                    raise ValueError("The operation's temporary native file is not an ordinary file.")
                action["temporary"] = str(temporary)
                s.save_state()
                with Path(item["path"]).open("rb") as source, temporary.open("wb") as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
                    output.flush()
                    os.fsync(output.fileno())
                if _file_identity(_file(temporary, "prepared_native_file")) != expected:
                    raise ValueError("The staged native replacement bytes changed.")
                os.chmod(temporary, item["mode"])
                os.replace(temporary, target)
                _sync_directory(target.parent)
        elif target.exists():
            target.unlink()
            _sync_directory(target.parent)
        action.update(phase="complete", completed_at=_now())
        action.pop("temporary", None)
        s.save_state()
    actual = _public_file_inventory(files_target)
    if _public_manifest(actual.values()) != _public_manifest(files):
        raise ValueError("The observed managed public-files tree differs from the selected native recovery point.")
    path = s.out / "restored-public-files-manifest.json"
    _atomic(path, _public_manifest(actual.values()))
    return s.add(path, "restored_public_files_manifest")


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    if config.get("source_kind") == "upsun":
        return upsun_adapter.execute(operation, config, source_paths, checkpoint, cancelled)
    if config.get("source_kind") == "tugboat":
        return tugboat_adapter.execute(operation, config, source_paths, checkpoint, cancelled)
    if config.get("source_kind") == "tome":
        return _tome_native().execute(operation, config, source_paths, checkpoint=checkpoint, cancelled=cancelled)
    if config.get("source_kind") == "lagoon":
        return lagoon_adapter.execute(operation, config, source_paths, checkpoint, cancelled)
    if config.get("source_kind") == "pantheon":
        return pantheon_adapter.execute(operation, config, source_paths, checkpoint, cancelled)
    if config.get("source_kind") == "skpr":
        return skpr_adapter.execute(operation, config, source_paths, checkpoint, cancelled)
    p = _profile(config)
    action = operation.get("native_action", operation.get("action"))
    if action in ("drush-capture", "acquia-capture"):
        if action != p["source_kind"] + "-capture":
            raise ValueError("The native action and configured provider differ.")
        return capture(p, {"output_dir": source_paths["output_dir"],
            "workspace_relocations": source_paths.get("workspace_relocations")}, checkpoint, cancelled)
    s = Session(p, source_paths["output_dir"], checkpoint, cancelled, source_paths.get("workspace_relocations"))
    source_paths = s.resolve_private(source_paths)
    try:
        if action != p["source_kind"] + "-restore":
            raise ValueError("Choose the explicit native action returned by the configured capabilities.")
        if operation.get("provider_environment_id", operation.get("environment_id")) != p["environment_id"]:
            raise ValueError("The reviewed operation must name this exact configured environment.")
        backup, binding = _selected_backup(source_paths, operation)
        expected = _context(p)
        intent = {"action": action, "target": expected, "backup_sha256": backup["sha256"],
                  "snapshot_id": source_paths.get("snapshot_id"), "snapshot_sha256": source_paths.get("snapshot_sha256")}
        intent_sha = _digest(intent)
        state_path = s.out / "native-state.json"
        supplied = source_paths.get("checkpoint") or operation.get("resume_checkpoint") or {}
        supplied = supplied.get("resume_checkpoint", supplied.get("state", supplied))
        saved = s.read_private_json(state_path) if state_path.exists() else s.resolve_private(supplied)
        s.state = dict(saved)
        if s.state and s.state.get("intent_sha256") != intent_sha:
            raise ValueError("The retained native continuation belongs to a different reviewed target or source.")
        if not s.state:
            s.state = {"intent_sha256": intent_sha, "intent": intent, "phase": "prepared",
                       "environment_id": p["environment_id"], "database_name": p.get("database_name"),
                       "backup_id": p.get("backup_id"), "mutation_started": False,
                       "output_dir": str(s.out)}
            s.save_state()
        if s.state.get("phase") == "completed":
            return s.result("COMPLETE", s.state.get("observations"))
        if p["source_kind"] == "drush":
            if backup.get("format") not in (None, "drush-archive"):
                raise ValueError("Drush restoration requires its original archive format.")
            native, names = _restore_drush_preflight(s, operation.get("target_fingerprint", config.get("target_fingerprint")))
            required = {"sql:drop", "sql:query", "config:import", "cache:rebuild", "yaml:get:value"}
            if not required <= names:
                raise ValueError("Installed Drush is missing native restore commands: " + ", ".join(sorted(required - names)))
            if s.state.get("phase") == "completed":
                return s.result("COMPLETE", s.state.get("observations"))
            sql, configuration, files, files_target = _stage_drush_components(s, backup, binding, native)
            if native.get("db-driver") == "sqlite":
                database_result = _restore_drupal_sqlite(s, native, sql)
            else:
                s.command("database-reset", _prefix(p) + ["sql:drop", "--yes"], mutating=True)
                s.command("database-restore", _prefix(p) + ["sql:query", "--file=" + sql["path"]], mutating=True)
                database_result = {"method": "drush-sql-query"}
            public_inventory = _restore_drush_files(s, files, files_target)
            s.command("configuration-restore", _prefix(p) + ["config:import", "--source=" + str(configuration), "--yes"], mutating=True)
            s.command("restored-cache", _prefix(p) + ["cache:rebuild"], mutating=True)
            result = s.command("restored-status", _prefix(p) + ["core:status", "--format=json",
                "--fields=drupal-version,uri,db-driver,db-hostname,db-port,db-name,db-status,bootstrap,php-version,drush-version,root,site,files,config-sync"])
            s.add(result["stdout"]["path"], "restored_native_status")
            observations = {"native_action": action, "restored_backup_sha256": backup["sha256"],
                "database_dump_sha256": sql["sha256"], "database_import": database_result,
                "public_files_restored": len(files),
                "public_files_removed": len(s.state["public_file_plan"]["remove"]),
                "public_files_manifest": public_inventory,
                "public_files_excluded_roots": sorted(DRUSH_FILE_EXCLUSIONS),
                "configuration_export_sha256": binding["export"]["sha256"], "target": expected,
                "snapshot_id": source_paths.get("snapshot_id"), "snapshot_sha256": source_paths.get("snapshot_sha256"),
                "native_status": json.loads(Path(result["stdout"]["path"]).read_bytes())}
            s.state.update(phase="completed", observations=observations)
            s.save_state()
            return s.result("COMPLETE", observations)
        if not p["backup_id"]:
            raise ValueError("Select the exact native Acquia backup ID.")
        bound = backup.get("provider_context") or backup.get("provider_identity") or {}
        if any(str(bound.get(k, "")) != str(expected.get(k, "")) for k in ("environment_id", "database_name", "backup_id")):
            raise ValueError("The retained backup's native environment/database/backup identity must match the selected target.")
        if s.state.get("phase") == "prepared":
            current = _json_response(_http(s, "restore-backup-preflight", _backup_path(p) + "/" + str(p["backup_id"])))
            _check_backup(p, current)
            s.state.update(phase="dispatching", mutation_started=True, requested_at=_now())
            s.save_state()
            response = _http(s, "restore", _backup_path(p) + "/" + str(p["backup_id"]) + "/actions/restore", method="POST")
            if response["status"] != 202:
                if response["status"] >= 500:
                    raise NativeWaiting("The original restore returned a server error; reconcile that same native request before another write.")
                s.state.update(phase="rejected", response=response)
                s.save_state()
                return s.result("FAILED", message=f"The native restore returned HTTP {response['status']}; its original result is retained.")
            value = _json_response(response)
            notification = value.get("_links", {}).get("notification", {}).get("href")
            if not notification:
                raise NativeWaiting("The native restore was accepted without a retained notification link; reconcile that same request.")
            _notification_url(notification)
            s.state.update(phase="accepted", notification_url=notification, accepted_response=response)
            s.save_state()
        if s.state.get("phase") == "dispatching":
            # The response may have become durable before a checkpoint callback failed.
            record_path = s.out / "restore.request.json"
            if record_path.is_file():
                response = s.read_private_json(record_path)
                actual = _verify_artifact(response["response"])
                if (response.get("method") == "POST" and response.get("status") == 202
                        and response.get("url") == _backup_path(p) + "/" + str(p["backup_id"]) + "/actions/restore"):
                    value = _json_response(response)
                    notification = value.get("_links", {}).get("notification", {}).get("href")
                    if notification:
                        _notification_url(notification)
                        s.state.update(phase="accepted", notification_url=notification, accepted_response=response)
                        s.save_state()
            if s.state.get("phase") == "dispatching":
                raise NativeWaiting("The original restore was dispatched without a durable acceptance result; reconcile its original provider request before another write.")
        if s.state.get("phase") == "rejected":
            return s.result("FAILED", message="The original native restore was rejected; its retained request remains available.")
        if s.state.get("phase") in ("completed", "failed"):
            return s.result("COMPLETE" if s.state["phase"] == "completed" else "FAILED", s.state.get("observations"))
        s.check()
        _notification_url(s.state["notification_url"])
        response = _http(s, "notification-" + str(time.time_ns()), s.state["notification_url"])
        native = _json_response(response)
        status = native.get("status")
        expected_uuid = parse.urlsplit(s.state["notification_url"]).path.rsplit("/", 1)[-1]
        if native.get("uuid") != expected_uuid or status not in ("completed", "in-progress", "failed"):
            raise ValueError("The native notification differs from its retained continuation.")
        observations = {"native_action": action, "notification_uuid": native["uuid"], "native_status": status,
                        "completed_at": native.get("completed_at"), "backup_sha256": backup["sha256"],
                        "target": expected, "snapshot_id": source_paths.get("snapshot_id"),
                        "snapshot_sha256": source_paths.get("snapshot_sha256")}
        s.add(response["response"]["path"], "native_notification")
        s.state.update(phase=status if status != "in-progress" else "accepted", observations=observations)
        s.save_state()
        return s.result({"completed": "COMPLETE", "failed": "FAILED", "in-progress": "WAITING_NATIVE"}[status], observations)
    except NativeCancelled as exc:
        status = "WAITING_NATIVE" if s.state.get("mutation_started") else "CANCELLED"
        return s.result(status, message=str(exc))
    except NativeWaiting as exc:
        return s.result("WAITING_NATIVE", message=str(exc))
    except Exception as exc:
        phase = s.state.get("phase")
        status = "WAITING_NATIVE" if (phase in ("dispatching", "accepted", "native_interrupted")
            or s.state.get("mutation_started") and phase not in ("native_failed", "rejected", "failed")) else "FAILED"
        return s.result(status, message=str(exc))
