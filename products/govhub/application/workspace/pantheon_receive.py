#!/usr/bin/env python3
"""Receive the complete GovHub application on its native Pantheon operating host.

Use the existing application, staff credentials, queue and provider journal.
The setup command installs the released Terminus PHAR and the received bridge.
"""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.error import URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

CODE = Path(__file__).resolve().parent
VERSION = "govhub-pantheon-receiving/1"
LAUNCHER_SCHEMA = "govhub-pantheon-launcher/v2"
PHAR = {
    "version": "4.3.3",
    "commit": "4cd1810ad892157131cec5919baf3036ab457d57",
    "url": "https://github.com/pantheon-systems/terminus/releases/download/4.3.3/terminus.phar",
    "bytes": 12336985,
    "sha256": "e7ca9bcad3acbb1cfc0cec32550eeb2351e578dc6d5f79cd3a5303201893bade",
}
CHUNK = 1024 * 1024
MAX_JSON = 32 * CHUNK


def utc():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       allow_nan=False, indent=2) + "\n").encode("utf-8")


def unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("A JSON object repeats the key " + key)
        value[key] = item
    return value


def read_json(path):
    path = regular(path)
    if path.stat().st_size > MAX_JSON:
        raise ValueError("The selected JSON exceeds the receiving size limit: " + str(path))
    return json.loads(path.read_bytes().decode("utf-8-sig"), object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))


def sync_dir(path):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic(path, value):
    path = Path(path)
    if path.is_symlink():
        raise ValueError("The receiving record must remain a regular file.")
    descriptor, temporary = tempfile.mkstemp(prefix="." + path.name + "-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(encoded(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        sync_dir(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def absolute(value):
    path = Path(value).expanduser()
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("Use an absolute path without parent traversal: " + str(value))
    return path


def regular(value):
    path = absolute(value)
    if path.is_symlink() or not path.is_file():
        raise ValueError("Choose an original regular file: " + str(path))
    return path.resolve(strict=True)


def directory(value, create=False):
    path = absolute(value)
    if path.is_symlink():
        raise ValueError("Choose a regular directory: " + str(path))
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not path.is_dir():
        raise ValueError("The selected directory does not exist: " + str(path))
    return path.resolve(strict=True)


def identity(path):
    path = regular(path)
    digest = hashlib.sha256()
    size = 0
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("The selected source is not a regular file.")
        for block in iter(lambda: stream.read(CHUNK), b""):
            digest.update(block)
            size += len(block)
        after = os.fstat(stream.fileno())
    if any(getattr(before, key) != getattr(after, key)
           for key in ("st_ino", "st_dev", "st_size", "st_mtime_ns")):
        raise ValueError("An original file changed while it was being read: " + str(path))
    return {"path": str(path), "bytes": size, "sha256": digest.hexdigest()}


def executable(value):
    found = shutil.which(str(value)) if not Path(value).is_absolute() else str(value)
    if not found:
        raise ValueError("The native executable is unavailable on this host: " + str(value))
    path = regular(Path(found).resolve(strict=True))
    if not os.access(path, os.X_OK):
        raise ValueError("The native executable is not executable: " + str(path))
    return path


@contextmanager
def lease(root, name):
    descriptor = os.open(root / name, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError("The original receiving operation already has a writer.") from error
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


class Commands:
    """Retain native setup output privately; provider work uses native_adapter.Session."""
    def __init__(self, root, timeout):
        self.root = directory(root, True)
        self.timeout = timeout
        self.commands = []

    def run(self, label, argv, cwd=CODE, required=True):
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,95}", label):
            raise ValueError("Choose a plain native receiving step label.")
        name = label + "-" + uuid.uuid4().hex
        output = self.root / (name + ".stdout")
        errors = self.root / (name + ".stderr")
        record = self.root / (name + ".json")
        value = {"label": label, "argv": [str(item) for item in argv], "cwd": str(cwd),
                 "started_at": utc(), "phase": "prepared", "stdout_path": str(output),
                 "stderr_path": str(errors)}
        atomic(record, value)
        process = None
        with output.open("xb") as stdout, errors.open("xb") as stderr:
            try:
                process = subprocess.Popen(value["argv"], cwd=cwd, stdin=subprocess.DEVNULL,
                    stdout=stdout, stderr=stderr, start_new_session=True)
                value.update(phase="running", pid=process.pid)
                atomic(record, value)
                process.wait(timeout=self.timeout)
                value.update(phase="complete", returncode=process.returncode)
            except BaseException as error:
                if process is not None and process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                value.update(phase="interrupted" if process else "not_started",
                             error=type(error).__name__, message=str(error),
                             owned_process_reaped=bool(process and process.poll() is not None))
                raise
            finally:
                stdout.flush()
                stderr.flush()
                os.fsync(stdout.fileno())
                os.fsync(stderr.fileno())
                value.update(finished_at=utc(), stdout=identity(output), stderr=identity(errors))
                atomic(record, value)
                self.commands.append({"record": identity(record), **value})
        if required and value.get("returncode") != 0:
            raise ValueError("Native " + label + " returned " + str(value.get("returncode"))
                             + "; complete private output: " + str(record))
        return value

    @staticmethod
    def json_output(command):
        return read_json(command["stdout"]["path"])


class HTTPSOnly(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        if not newurl.lower().startswith("https://"):
            raise ValueError("The original release download redirected away from HTTPS.")
        return super().redirect_request(request, response, code, message, headers, newurl)


def verify_phar(path):
    actual = identity(path)
    if any(actual[key] != PHAR[key] for key in ("bytes", "sha256")):
        raise ValueError("The native PHAR differs from the exact released Terminus 4.3.3 bytes.")
    return actual


def receive_phar(root, selected):
    if selected:
        return verify_phar(selected)
    bundled = CODE.parent / "native" / "terminus.phar"
    if bundled.is_file():
        return verify_phar(bundled)
    target = root / ("terminus-" + PHAR["version"] + ".phar")
    if target.exists() or target.is_symlink():
        return verify_phar(target)
    descriptor, temporary = tempfile.mkstemp(prefix=".terminus-download-", dir=root)
    temporary = Path(temporary)
    receipt = {"source": PHAR, "started_at": utc(), "temporary_path": str(temporary)}
    try:
        request = Request(PHAR["url"], headers={"User-Agent": VERSION, "Accept-Encoding": "identity"})
        with build_opener(HTTPSOnly()).open(request, timeout=60) as response, os.fdopen(descriptor, "wb") as stream:
            descriptor = None
            if response.status != 200:
                raise ValueError("The original release download returned HTTP " + str(response.status))
            receipt.update(status=response.status, final_url=response.geturl())
            size = 0
            for block in iter(lambda: response.read(CHUNK), b""):
                size += len(block)
                if size > PHAR["bytes"]:
                    raise ValueError("The release response exceeds its original byte length.")
                stream.write(block)
            stream.flush()
            os.fsync(stream.fileno())
        actual = verify_phar(temporary)
        # Link is create-only. A separate receiving process cannot replace a
        # release that appeared after the initial existence check.
        os.link(temporary, target)
        sync_dir(root)
        receipt.update(state="complete", artifact={**actual, "path": str(target)}, completed_at=utc())
        return receipt["artifact"]
    except BaseException as error:
        receipt.update(state="interrupted", error=str(error), completed_at=utc())
        raise
    finally:
        if descriptor is not None:
            os.close(descriptor)
        atomic(root / "terminus-download.json", receipt)
        if temporary.exists() and receipt.get("state") == "complete":
            temporary.unlink()


def plugin_sources():
    root = directory(CODE / "pantheon_bridge")
    package = read_json(root / "composer.json")
    if package.get("name") != "commons/terminus-govhub-bridge":
        raise ValueError("The received plugin is not the maintained GovHub bridge.")
    files = []
    for path in sorted(root.rglob("*.php")):
        item = identity(path)
        files.append({**item, "path": path.relative_to(root).as_posix()})
    if not files or not any(item["path"] == "src/GovHubBridgeCommand.php" for item in files):
        raise ValueError("The complete native bridge source is missing.")
    return root, package, files


def validate_bridge_info(value, sources):
    if not isinstance(value, dict) or value.get("schema") != "govhub-pantheon-bridge-info/v1":
        raise ValueError("The installed plugin did not return its native bridge-info document.")
    if value.get("terminus_version") != PHAR["version"]:
        raise ValueError("The installed plugin is attached to another Terminus release.")
    if value.get("request_schema") != "govhub-pantheon-bridge/v1":
        raise ValueError("The installed bridge uses another native request schema.")
    rows = value.get("source_files")
    if not isinstance(rows, list) or any(not isinstance(item, dict) for item in rows):
        raise ValueError("The installed plugin did not identify its original PHP source files.")
    indexed = {item.get("path"): item for item in rows}
    if len(indexed) != len(rows):
        raise ValueError("The installed plugin repeats a source identity.")
    if set(indexed) != {item["path"] for item in sources}:
        raise ValueError("The installed plugin has a different complete PHP source closure.")
    for original in sources:
        current = indexed[original["path"]]
        if any(current.get(key) != original[key] for key in ("bytes", "sha256")):
            raise ValueError("The installed bridge differs from the received source: " + original["path"])
    return value



def native_installation(root, php, phar, plugin, sources, create=False):
    """Bind native plugin discovery to this exact received application."""
    package = {**identity(plugin / "composer.json"), "path": "composer.json"}
    license_file = {**identity(plugin / "LICENSE"), "path": "LICENSE"}
    inputs = [package, license_file, *sources]
    selected = {"schema": "govhub-pantheon-installation/v1", "launcher_schema": LAUNCHER_SCHEMA,
                "php": php, "phar": phar, "plugin_files": inputs}
    installation_id = hashlib.sha256(encoded(selected)).hexdigest()
    slot = absolute(root / "installations" / installation_id)
    if create:
        slot = directory(slot, True)
    else:
        slot = directory(slot)

    def received_file(path, contents):
        if create:
            directory(path.parent, True)
        if create and not path.exists():
            descriptor, temporary = tempfile.mkstemp(prefix=".native-source-", dir=path.parent)
            try:
                with os.fdopen(descriptor, "wb") as stream:
                    stream.write(contents)
                    stream.flush()
                    os.fsync(stream.fileno())
                # Create-only publication preserves earlier native source.
                os.link(temporary, path)
                sync_dir(path.parent)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        actual = identity(path)
        if regular(path).read_bytes() != contents:
            raise ValueError("The native installation differs from its received source: " + str(path))
        return actual

    installed_plugin = slot / "bridge-source"
    for item in inputs:
        contents = regular(plugin / item["path"]).read_bytes()
        if len(contents) != item["bytes"] or hashlib.sha256(contents).hexdigest() != item["sha256"]:
            raise ValueError("The application source changed while preparing its native installation.")
        received_file(installed_plugin / item["path"], contents)
    environment = {
        "TERMINUS_PLUGINS_DIR": str(slot / "plugins"),
        "TERMINUS_DEPENDENCIES_BASE_DIR": str(slot / "dependencies"),
        "TERMINUS_COMMAND_CACHE_DIR": str(slot / "command-cache"),
    }
    settings = {"php": php["path"], "php_sha256": php["sha256"],
                "phar": phar["path"], "phar_sha256": phar["sha256"], "environment": environment}
    payload = base64.b64encode(encoded(settings)).decode("ascii")
    program = ("""<?php
declare(strict_types=1);
// Received source selects native plugin/dependency directories. Native account
// and token locations remain those selected by this host's Terminus setup.
$received = json_decode(base64_decode('__RECEIVED__', true), true, 32, JSON_THROW_ON_ERROR);
if (!is_file($received['php']) || !is_executable($received['php']) || !hash_equals(
    $received['php_sha256'], hash_file('sha256', $received['php'])
)) {
    fwrite(STDERR, "The selected native PHP executable changed.\\n");
    exit(126);
}
if (!is_file($received['phar']) || !hash_equals(
    $received['phar_sha256'], hash_file('sha256', $received['phar'])
)) {
    fwrite(STDERR, "The received native Terminus release changed.\\n");
    exit(126);
}
foreach ($received['environment'] as $key => $value) {
    if (!putenv($key . '=' . $value)) {
        fwrite(STDERR, "Cannot bind this received native installation.\\n");
        exit(126);
    }
}
// The selected executable may supply required PHP configuration and extensions.
// Reuse that exact host entry point for the child, including an original wrapper.
$command = array_merge([$received['php'], $received['phar']], array_slice($_SERVER['argv'], 1));
// An argv array preserves native options without invoking a shell. The child
// inherits the original Session process group, working directory and streams.
$process = proc_open($command, [0 => STDIN, 1 => STDOUT, 2 => STDERR],
    $pipes, null, null, ['bypass_shell' => true]);
if (!is_resource($process)) {
    fwrite(STDERR, "The original Terminus process did not start.\\n");
    exit(126);
}
exit(proc_close($process));
""").replace("__RECEIVED__", payload).encode("utf-8")
    path = slot / "terminus.php"
    current = received_file(path, program)
    return {**current, "schema": selected["schema"], "launcher_schema": LAUNCHER_SCHEMA,
            "installation_id": installation_id,
            "directory": str(slot), "native_environment": environment,
            "plugin_root": str(installed_plugin), "plugin_files": inputs}


def prepare(args):
    root = directory(args.runtime_dir, True)
    with lease(root, "prepare.lock"):
        commands = Commands(root / "setup", args.timeout)
        php = executable(args.php)
        code = ("echo json_encode(['version'=>PHP_VERSION,'version_id'=>PHP_VERSION_ID,"
                "'extensions'=>get_loaded_extensions(),'binary'=>PHP_BINARY],JSON_THROW_ON_ERROR);")
        probe = commands.run("php-runtime", [php, "-r", code])
        php_info = commands.json_output(probe)
        if not isinstance(php_info, dict) or php_info.get("version_id", 0) < 80200:
            raise ValueError("Terminus 4.3.3 requires this host's PHP 8.2 or later.")
        missing = {"json", "hash", "phar"} - {str(x).lower() for x in php_info.get("extensions", [])}
        if missing:
            raise ValueError("The native PHP runtime needs its extensions: " + ", ".join(sorted(missing)))
        phar = receive_phar(root, args.terminus_phar)
        plugin, package, sources = plugin_sources()
        php_identity = identity(php)
        launcher = native_installation(root, php_identity, phar, plugin, sources, create=True)
        prefix = [str(php), launcher["path"], "--no-ansi", "--no-interaction"]
        version = commands.run("terminus-version", prefix + ["--version"])
        native_version = regular(version["stdout"]["path"]).read_text(errors="replace").strip()
        if not re.search(r"(?<![0-9])4\.3\.3(?![0-9])", native_version):
            raise ValueError("The selected native CLI did not report Terminus 4.3.3.")
        for index, item in enumerate(sources, 1):
            commands.run("php-lint-" + str(index), [php, "-l", plugin / item["path"]])
        current = commands.run("bridge-info-before", prefix + ["govhub:bridge-info"], required=False)
        try:
            info = validate_bridge_info(commands.json_output(current), sources) if current.get("returncode") == 0 else None
        except (ValueError, OSError, KeyError):
            info = None
        installed = False
        if info is None:
            composer = executable("composer")
            commands.run("composer-version", [composer, "--version"])
            commands.run("bridge-install", prefix + ["self:plugin:install", launcher["plugin_root"]])
            installed = True
            current = commands.run("bridge-info", prefix + ["govhub:bridge-info"])
            info = validate_bridge_info(commands.json_output(current), sources)
        commands.run("bridge-help", prefix + ["help", "govhub:bridge"])
        result = {"schema": VERSION, "state": "READY", "prepared_at": utc(),
                  "application_root": str(CODE), "runtime_dir": str(root),
                  "php": php_identity, "php_runtime": php_info, "terminus": phar,
                  "launcher": launcher,
                  "native_version": native_version, "plugin_root": launcher["plugin_root"],
                  "application_plugin_root": str(plugin),
                  "plugin_package": {"name": package["name"], "version": package.get("version")},
                  "plugin_source_files": sources, "bridge_info": info,
                  "installed_in_this_run": installed,
                  "profile_runtime": {"php_path": str(php), "terminus_path": launcher["path"],
                                      "site_root": str(directory(args.site_root or CODE))},
                  "commands": [item["record"] for item in commands.commands]}
        atomic(root / "runtime.json", result)
        return {"state": result["state"], "runtime": identity(root / "runtime.json"),
                "profile_runtime": result["profile_runtime"], "plugin": result["plugin_package"],
                "native_version": native_version, "installation_id": launcher["installation_id"],
                "commands": len(commands.commands)}


def runtime(args, native_check=False):
    root = directory(args.runtime_dir)
    value = read_json(root / "runtime.json")
    if value.get("schema") != VERSION or value.get("state") != "READY":
        raise ValueError("Prepare this receiving host's original native runtime first.")
    verify_phar(value["terminus"]["path"])
    current_php = identity(value["php"]["path"])
    if any(current_php[key] != value["php"][key] for key in ("bytes", "sha256")):
        raise ValueError("The native PHP executable changed; prepare its current installation.")
    plugin, _, sources = plugin_sources()
    validate_bridge_info(value["bridge_info"], sources)
    if value.get("launcher"):
        launcher = native_installation(root, current_php, value["terminus"], plugin, sources)
        if value["launcher"] != launcher:
            raise ValueError("The recorded native installation differs from this received application.")
        if value["profile_runtime"].get("terminus_path") != launcher["path"]:
            raise ValueError("The prepared runtime does not select its original native launcher.")
    if native_check:
        commands = Commands(root / "setup", args.timeout)
        current = commands.run("bridge-info-current", native_prefix(value) + ["govhub:bridge-info"])
        validate_bridge_info(commands.json_output(current), sources)
    return root, value


def native_prefix(value):
    return [value["php"]["path"], (value.get("launcher") or value["terminus"])["path"],
            "--no-ansi", "--no-interaction"]


def discover(args):
    root, value = runtime(args, True)
    commands = Commands(root / "account-observations", args.timeout)
    who = commands.run("native-account", native_prefix(value) + ["auth:whoami", "--format=json"],
                       cwd=value["profile_runtime"]["site_root"], required=False)
    account = None
    if who.get("returncode") == 0:
        try:
            account = commands.json_output(who)
        except (ValueError, OSError):
            pass
    result = {"observed_at": utc(), "account": account, "commands": [who["record"]] if "record" in who else [],
              "sites": None}
    if isinstance(account, dict) and account.get("id"):
        sites = commands.run("native-sites", native_prefix(value) +
            ["site:list", "--format=json", "--fields=id,name,label,framework,region"],
            cwd=value["profile_runtime"]["site_root"])
        result["sites"] = commands.json_output(sites)
    result["commands"] = [item["record"] for item in commands.commands]
    path = root / "account-observations" / ("account-" + uuid.uuid4().hex + ".json")
    atomic(path, result)
    return {"account_id": account.get("id") if isinstance(account, dict) else None,
            "sites": len(result["sites"]) if isinstance(result["sites"], (list, dict)) else None,
            "observation": identity(path)}


def opened(args):
    from cli import actor
    from server import open_store
    args.workspace = directory(args.workspace)
    args.source_root = directory(args.source_root)
    args.assessment_core = directory(args.assessment_core or CODE / "vendor" / "assessment-core")
    workspace = open_store(args)
    return workspace, actor(workspace, args)


def retain_result(root, action, result, request=None):
    out = directory(root / "receiving", True)
    name = action.replace(".", "-").replace("/", "-") + "-" + uuid.uuid4().hex + ".json"
    value = {"schema": VERSION, "action": action, "observed_at": utc(), "result": result}
    if request:
        value["request"] = request
    path = out / name
    atomic(path, value)
    return identity(path)


def operation_summary(value):
    checkpoint = value.get("resume_checkpoint") or value.get("checkpoint") or {}
    return {**{key: value.get(key) for key in ("id", "revision", "type", "native_action", "state",
                "environment_id", "provider_environment_id", "plan_id", "source_snapshot_id",
                "progress", "error", "native_workflow_id", "native_workflow_step")},
            "native_phase": checkpoint.get("phase"),
            "native_poll": checkpoint.get("native_poll"),
            "pending_step": checkpoint.get("pending_step"),
            "pending_backup_set": checkpoint.get("pending_backup_set")}


def inspect_workspace(args):
    root, _ = runtime(args)
    workspace, user = opened(args)
    snapshot = workspace.snapshot()
    result = {"workspace": snapshot.get("workspace"), "user": {"name": user["name"], "role": user["role"]},
              "snapshot": snapshot}
    receipt = retain_result(root, "workspace-open", result)
    return {"workspace": snapshot.get("workspace"), "actor": result["user"],
            "summary": snapshot["govhub"]["summary"], "worker": snapshot["govhub"]["worker"],
            "operations": snapshot["govhub"]["operations"], "receipt": receipt}


def request_payload(path):
    path = regular(path)
    if path.stat().st_size > MAX_JSON:
        raise ValueError("The original application request exceeds the receiving size limit.")
    raw = path.read_bytes()
    if len(raw) > MAX_JSON:
        raise ValueError("The original application request exceeds the receiving size limit.")
    payload = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=unique,
                         parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
    if not isinstance(payload, dict):
        raise ValueError("Use the original application request JSON object.")
    original = {"path": str(path), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                "payload": payload}
    return payload, original


def call(args):
    action = args.operation.strip("/").replace("/", ".")
    root, prepared = runtime(args, action == "operations.configure" or args.bind_runtime)
    workspace, user = opened(args)
    payload, original = request_payload(args.request)
    if args.bind_runtime:
        if action not in {"operations.resume", "operations.capabilities"}:
            raise ValueError("Receiving runtime bindings belong to the original resume or capability action.")
        bindings = dict(prepared["profile_runtime"])
        if "runtime_bindings" in payload and payload["runtime_bindings"] != bindings:
            raise ValueError("The explicit runtime binding differs from the prepared receiving host.")
        payload = {**payload, "runtime_bindings": bindings}
        original["applied_payload"] = payload
        original["receiving_runtime"] = identity(root / "runtime.json")
    if action == "operations.configure":
        profile = payload.get("config") or {}
        if profile.get("source_kind") != "pantheon":
            raise ValueError("Use the Pantheon profile for this native receiving command.")
        for key in ("php_path", "terminus_path"):
            if profile.get(key) != prepared["profile_runtime"][key]:
                raise ValueError("Use the prepared native " + key + " in this explicit profile request.")
    result = workspace.dispatch(action, payload, user)
    receipt = retain_result(root, action, result, original)
    output = {"action": action, "receipt": receipt}
    if isinstance(result.get("operation"), dict):
        output["operation"] = operation_summary(result["operation"])
    else:
        output["result"] = result
    if args.work:
        from cli import run_worker
        completed = run_worker(workspace, True)
        output["worker"] = completed["worker"]
        output["operations"] = completed["operations"]
        output["worker_receipt"] = retain_result(root, "worker", completed)
    return output


def record(args):
    root, _ = runtime(args)
    workspace, user = opened(args)
    payload, original = request_payload(args.request)
    result = workspace.save(args.kind, args.record_id, payload, user)
    return {"record": result, "receipt": retain_result(root, "record-" + args.kind, result, original)}


def work(args):
    root, _ = runtime(args)
    workspace, _ = opened(args)
    from cli import run_worker
    result = run_worker(workspace, True)
    return {**result, "receipt": retain_result(root, "worker", result)}


def status(args):
    root, _ = runtime(args)
    workspace, user = opened(args)
    deadline = time.monotonic() + args.wait_seconds
    last_revision = None
    while True:
        result = workspace.dispatch("operations.get", {"operation_id": args.operation_id}, user)
        value = result["operation"]
        checkpoint = value.get("resume_checkpoint") or {}
        from native_adapter import can_poll
        active = value["state"] in {"QUEUED", "RUNNING"} or (
            value["state"] == "WAITING_NATIVE" and not value.get("cancel_requested") and can_poll(checkpoint))
        if not active or time.monotonic() >= deadline:
            return {"operation": operation_summary(value), "active": active,
                    "receipt": retain_result(root, "operation-status", result)}
        if value["revision"] != last_revision:
            print(json.dumps({"progress": operation_summary(value)}, ensure_ascii=False), flush=True)
            last_revision = value["revision"]
        time.sleep(min(2, max(0, deadline - time.monotonic())))


def handover_inventory(path):
    """Record owned partial files before moving them into retained custody."""
    root = directory(path)
    files, directories = [], []
    for current, dirs, names in os.walk(root, followlinks=False):
        folder = Path(current)
        if any((folder / name).is_symlink() for name in dirs):
            raise ValueError("An interrupted receiving directory contains a link.")
        directories.append({"path": folder.relative_to(root).as_posix(),
                            "mode": stat.S_IMODE(folder.stat().st_mode)})
        for name in sorted(names):
            item = folder / name
            actual = identity(item)
            files.append({**actual, "path": item.relative_to(root).as_posix(),
                          "mode": stat.S_IMODE(item.stat().st_mode)})
    return {"files": sorted(files, key=lambda x: x["path"]),
            "directories": sorted(directories, key=lambda x: x["path"])}


def retain_handover_partial(journal, state_path, state, phase, target):
    """Keep the exact incomplete phase, then let the original API copy afresh."""
    phase_state = state["phases"][phase]
    pending = phase_state.get("partial_move")
    if pending is None:
        if target.is_symlink() or not target.is_dir():
            raise ValueError("The interrupted receiving destination is not its original directory.")
        inventory = handover_inventory(target)
        retained = target.with_name(target.name + ".interrupted-" + uuid.uuid4().hex)
        pending = {"state": "PREPARED", "original": str(target), "retained": str(retained),
                   "inventory": inventory, "prepared_at": utc()}
        phase_state["partial_move"] = pending
        atomic(state_path, state)
    source, retained = absolute(pending["original"]), absolute(pending["retained"])
    if source != target or source.parent != retained.parent:
        raise ValueError("The original interrupted receiving move has another scope.")
    if pending["state"] == "PREPARED":
        source_exists = source.exists() or source.is_symlink()
        retained_exists = retained.exists() or retained.is_symlink()
        if source_exists and not retained_exists:
            if handover_inventory(source) != pending["inventory"]:
                raise ValueError("The interrupted phase changed before its retained move.")
            os.rename(source, retained)
            sync_dir(source.parent)
        elif source_exists or not retained_exists:
            raise ValueError("Reconcile the original interrupted phase's exact move.")
        if handover_inventory(retained) != pending["inventory"]:
            raise ValueError("The retained interrupted phase differs from its original files.")
        pending.update(state="RETAINED", completed_at=utc())
        atomic(state_path, state)
    elif pending["state"] != "RETAINED":
        raise ValueError("The interrupted phase has an unknown custody state.")
    # Do not remove either the old marker or its command record.
    state["retained_partials"].append(pending)
    phase_state.pop("partial_move")
    atomic(state_path, state)


def verify_handover_export(workspace, export_id, destination, expected):
    directory(destination)
    if (destination / "TRANSFER_INCOMPLETE").exists():
        raise ValueError("The original export is still marked incomplete.")
    wanted = {item["name"] for item in expected}
    if {p.name for p in destination.iterdir()} != wanted:
        raise ValueError("The receiving export has a different complete member collection.")
    receipts = []
    for item in expected:
        actual = identity(destination / item["name"])
        if actual["bytes"] != item["size"] or actual["sha256"] != item["sha256"]:
            raise ValueError("A receiving handover file differs from the retained original.")
        original = workspace.export_file(export_id, item["name"])
        source = identity(original["path"])
        if source["bytes"] != item["size"] or source["sha256"] != item["sha256"]:
            raise ValueError("The selected original handover changed.")
        receipts.append({"name": item["name"], "size": actual["bytes"], "sha256": actual["sha256"]})
    return {"export_id": export_id, "destination": str(destination), "files": receipts}


def verify_handover_backup(workspace, backup, expected_workspace):
    import sqlite3
    directory(backup)
    if (backup / "BACKUP_INCOMPLETE").exists():
        raise ValueError("The original private backup is still marked incomplete.")
    metadata = read_json(backup / "backup.json")
    if (metadata.get("format") != "systems-review-private-backup/v1"
            or metadata.get("workspace") != expected_workspace):
        raise ValueError("The receiving backup names another original workspace.")
    database = regular(backup / "assessment.sqlite3")
    try:
        db = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
        try:
            db.row_factory = sqlite3.Row
            if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise ValueError("The original receiving database is incomplete.")
            if workspace.meta(db).get("workspace") != expected_workspace:
                raise ValueError("The receiving database has another original workspace identity.")
            sources = [dict(row) for row in db.execute("SELECT DISTINCT sha256,bytes FROM files")]
        finally:
            db.close()
    except sqlite3.Error as error:
        raise ValueError("The original receiving database is incomplete.") from error
    source_root = directory(backup / "sources")
    if {p.name for p in source_root.iterdir()} != {item["sha256"] for item in sources}:
        raise ValueError("The private backup has a different retained source collection.")
    for item in sources:
        if not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]):
            raise ValueError("A private source has an invalid original content identity.")
        actual = identity(source_root / item["sha256"])
        if actual["sha256"] != item["sha256"] or actual["bytes"] != item["bytes"]:
            raise ValueError("A source in the original receiving backup differs.")
    original_key, copied_key = identity(workspace.key), identity(backup / "reconciliation.key")
    if any(original_key[key] != copied_key[key] for key in ("bytes", "sha256")):
        raise ValueError("The private backup has a different original reconciliation identity.")
    storage = metadata.get("native_storage")
    if (not isinstance(storage, dict) or storage.get("format") != "govhub-native-storage/1"
            or not isinstance(storage.get("files"), list)):
        raise ValueError("The backup omits its original native history manifest.")
    wanted = {}
    for item in storage["files"]:
        name = item["path"]
        parts = Path(name)
        if (parts.is_absolute() or ".." in parts.parts or parts.as_posix() != name
                or not name.startswith("native-operations/") or name in wanted):
            raise ValueError("A native backup member has an invalid original path.")
        actual = identity(backup / name)
        if actual["bytes"] != item["size"] or actual["sha256"] != item["sha256"]:
            raise ValueError("The receiving backup's original native history differs.")
        wanted[name.removeprefix("native-operations/")] = item
    native_root = backup / "native-operations"
    if native_root.exists() or native_root.is_symlink():
        actual = handover_inventory(native_root)
        if {item["path"] for item in actual["files"]} != set(wanted):
            raise ValueError("The original native backup has a different history collection.")
    elif wanted:
        raise ValueError("The original native history directory is unavailable.")
    return {"directory": str(backup), **{key: value for key, value in metadata.items()
            if key != "native_storage"}, "native_files": len(wanted),
            "native_bytes": sum(item["size"] for item in wanted.values())}


def handover(args):
    root, _ = runtime(args)
    workspace, user = opened(args)
    from cli import export_files
    source_root = directory(args.source_root)
    destination, backup = absolute(args.destination), absolute(args.backup)
    for candidate in (destination, backup):
        resolved = candidate.resolve(strict=False)
        if (resolved == source_root or resolved.is_relative_to(source_root)
                or source_root.is_relative_to(resolved)
                or resolved == workspace.root or resolved.is_relative_to(workspace.root)):
            raise ValueError("Keep receiving destinations outside the live workspace and its original intake.")
    if (destination.resolve(strict=False).is_relative_to(backup.resolve(strict=False))
            or backup.resolve(strict=False).is_relative_to(destination.resolve(strict=False))):
        raise ValueError("Keep the receiving export and private backup in separate directories.")
    destination = directory(destination.parent) / destination.name
    backup = directory(backup.parent) / backup.name
    before = workspace.snapshot()
    selected = next((item for item in workspace.dispatch("exports.list", {}, user)["exports"]
                     if item["id"] == args.export_id), None)
    if selected is None:
        raise ValueError("Choose the retained original handover.")
    expected = selected["files"]
    names = set()
    for item in expected:
        name = item["name"]
        if Path(name).name != name or name in (".", "..") or name in names:
            raise ValueError("The original handover has an invalid member collection.")
        names.add(name)
    intent = {"schema": "govhub-pantheon-handover/v1", "workspace": str(workspace.root),
              "workspace_id": before.get("workspace"), "source_root": str(source_root),
              "actor": user["name"], "export_id": args.export_id, "files": expected,
              "destination": str(destination), "backup": str(backup)}
    handover_id = hashlib.sha256(encoded(intent)).hexdigest()
    journal = directory(root / "handovers" / handover_id, True)
    state_path = journal / "state.json"
    old_operations = {item["id"]: item for item in before["govhub"]["operations"]}
    with lease(root, "handover.lock"):
        if state_path.exists():
            state = read_json(state_path)
            if state.get("intent") != intent:
                raise ValueError("The retained receiving handover has another exact intent.")
            if not getattr(args, "resume", False):
                raise ValueError("Use handover --resume to reconcile this original receiving operation.")
            if state["original_operations"] != old_operations:
                raise ValueError("The original native operation population changed; review it before receiving.")
        else:
            if any(p.exists() or p.is_symlink() for p in (destination, backup)):
                raise ValueError("A new receiving handover requires its original unused destinations.")
            state = {"schema": "govhub-pantheon-handover-journal/v1", "intent": intent,
                     "created_at": utc(), "original_operations": old_operations, "phases": {},
                     "retained_partials": [], "attempts": []}
            atomic(state_path, state)
        state["attempts"].append({"at": utc(), "resume": bool(getattr(args, "resume", False)),
                                  "receiving_source": identity(CODE / "pantheon_receive.py")})
        atomic(state_path, state)

        def phase_copy(name, target, verify, copy):
            phase = state["phases"].get(name)
            if phase is None:
                phase = state["phases"][name] = {"state": "STARTED", "started_at": utc()}
                atomic(state_path, state)
            if phase.get("partial_move"):
                retain_handover_partial(journal, state_path, state, name, target)
            if target.exists() or target.is_symlink():
                try:
                    result = verify()
                except (ValueError, OSError, KeyError):
                    if phase["state"] == "COMPLETE":
                        raise
                    retain_handover_partial(journal, state_path, state, name, target)
                else:
                    phase.update(state="COMPLETE", result=result, reconciled_at=utc())
                    phase.setdefault("completion", "verified-original-artifact")
                    atomic(state_path, state)
                    return result
            elif phase["state"] == "COMPLETE":
                raise ValueError("A completed original receiving artifact is missing.")
            result = copy()
            verified = verify()
            phase.update(state="COMPLETE", result=verified, completed_at=utc(),
                         completion="original-create-only-operation")
            atomic(state_path, state)
            return verified

        result = phase_copy("export", destination,
            lambda: verify_handover_export(workspace, args.export_id, destination, expected),
            lambda: export_files(workspace, args.export_id, destination, user))
        copied = phase_copy("backup", backup,
            lambda: verify_handover_backup(workspace, backup, before.get("workspace")),
            lambda: workspace.dispatch("workspace.backup", {"destination": str(backup)}, user))
        if state.get("state") == "COMPLETE":
            return {**state["result"], "reconciled": True,
                    "handover_journal": identity(state_path)}
        reopen = state["phases"].get("reopen")
        if reopen is None:
            reopen = state["phases"]["reopen"] = {
                "state": "STARTED", "directory": str(journal / "cold-reopen"), "started_at": utc()}
            atomic(state_path, state)
        commands = Commands(reopen["directory"], args.timeout)
        argv = [sys.executable, str(CODE / "pantheon_receive.py"), "--runtime-dir", str(root),
                "--timeout", str(args.timeout), "inspect", "--workspace", str(backup),
                "--source-root", str(source_root), "--assessment-core", str(args.assessment_core),
                "--username", args.username, "--password-env", args.password_env]
        retained = []
        for path in commands.root.glob("received-workspace-open-*.json"):
            entry = read_json(path)
            if entry.get("argv") != [str(item) for item in argv] or entry.get("cwd") != str(CODE):
                raise ValueError("The retained cold reopen has another original intent.")
            retained.append((entry, path))
        successful = [(entry, path) for entry, path in retained
                      if entry.get("phase") == "complete" and entry.get("returncode") == 0]
        if successful:
            entry, record_path = sorted(successful, key=lambda pair: pair[0]["started_at"])[-1]
            for key in ("stdout", "stderr"):
                actual = identity(entry[key]["path"])
                if any(actual[k] != entry[key][k] for k in ("bytes", "sha256")):
                    raise ValueError("An original cold-reopen output differs.")
            reopened = commands.json_output(entry)
            child_record = identity(record_path)
        else:
            # Inspect is the existing local authenticated reopen; it cannot start
            # a provider worker. Keep every earlier failed/interrupted record.
            child = commands.run("received-workspace-open", argv)
            reopened = commands.json_output(child)
            child_record = commands.commands[-1]["record"]
        if reopened.get("workspace") != before.get("workspace"):
            raise ValueError("The receiving copy has a different original workspace identity.")
        new_operations = {item["id"]: item for item in reopened["operations"]}
        if old_operations != new_operations:
            raise ValueError("The receiving copy's original native operation population differs.")
        reopen.update(state="COMPLETE", command=child_record, completed_at=utc())
        retained_export = retain_result(root, "handover-files", result)
        retained_backup = retain_result(root, "workspace-backup", copied)
        value = {"export": result, "backup": copied, "reopened": reopened,
                 "source_root": str(source_root), "workspace": before.get("workspace"),
                 "operations": len(old_operations), "export_receipt": retained_export,
                 "backup_receipt": retained_backup, "cold_reopen_command": child_record,
                 "handover_id": handover_id, "retained_partials": state["retained_partials"]}
        outcome = {"state": "RECEIVED", "workspace": value["workspace"],
                   "operations": value["operations"], "export": str(destination),
                   "backup": str(backup), "source_root": str(source_root),
                   "receipt": retain_result(root, "handover-reopened", value)}
        state.update(state="COMPLETE", completed_at=utc(), result=outcome)
        atomic(state_path, state)
        return {**outcome, "handover_journal": identity(state_path)}

def serve(args):
    runtime(args, True)
    workspace, _ = opened(args)
    # Authenticate the receiving operator before attaching the original server.
    # Its own opaque browser login and single service lease remain authoritative.
    argv = [sys.executable, str(CODE / "server.py"), "--workspace", str(workspace.root),
            "--source-root", str(args.source_root), "--assessment-core", str(args.assessment_core),
            "--port", str(args.port)]
    os.execv(sys.executable, argv)


def add_workspace(parser):
    parser.add_argument("--workspace", required=True, help="Original private workspace or its received backup.")
    parser.add_argument("--source-root", required=True, help="Actual supplied-source directory.")
    parser.add_argument("--assessment-core", help="Original unchanged assessment core; bundled by default.")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password-env", required=True,
                        help="Existing private environment-variable name; the value stays on this host.")
    parser.set_defaults(password_stdin=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-dir", required=True, help="Dedicated private receiving/runtime directory.")
    parser.add_argument("--timeout", type=int, default=600, help="Native setup and cold-reopen command deadline.")
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare", help="Receive pinned native CLI and install/inspect the actual bridge.")
    prep.add_argument("--php", default="php")
    prep.add_argument("--terminus-phar", help="Existing exact released PHAR; otherwise use bundle or official release.")
    prep.add_argument("--site-root", help="Existing authenticated native CLI working directory.")
    prep.set_defaults(handler=prepare)
    sub.add_parser("discover", help="Read this native session's actual user and complete permitted site list.").set_defaults(handler=discover)
    opened_parser = sub.add_parser("inspect", help="Authenticate and reopen the original complete application.")
    add_workspace(opened_parser)
    opened_parser.set_defaults(handler=inspect_workspace)
    apply = sub.add_parser("call", help="Dispatch an unchanged original GovHub JSON request.")
    add_workspace(apply)
    apply.add_argument("operation", help="Existing action, e.g. sources.capture or operations.resume.")
    apply.add_argument("--request", required=True)
    apply.add_argument("--work", action="store_true", help="Run the original durable queue until settled.")
    apply.add_argument("--bind-runtime", action="store_true",
                       help="Attach the prepared host's exact runtime_bindings to this original resume/capability request.")
    apply.set_defaults(handler=call)
    edit = sub.add_parser("record", help="Save one original operating record through the application's revision controls.")
    add_workspace(edit)
    edit.add_argument("kind")
    edit.add_argument("record_id", help="Existing record ID or the application's original creation ID.")
    edit.add_argument("--request", required=True)
    edit.set_defaults(handler=record)
    worker = sub.add_parser("work", help="Run the same native worker and accepted-workflow continuation.")
    add_workspace(worker)
    worker.set_defaults(handler=work)
    current = sub.add_parser("status", help="Read or follow one original operation without starting a writer.")
    add_workspace(current)
    current.add_argument("operation_id")
    current.add_argument("--wait-seconds", type=int, default=0)
    current.set_defaults(handler=status)
    transfer = sub.add_parser("handover", help="Copy a complete handover, back up the workspace and cold-reopen it.")
    add_workspace(transfer)
    transfer.add_argument("--export-id", required=True)
    transfer.add_argument("--destination", required=True)
    transfer.add_argument("--backup", required=True)
    transfer.add_argument("--resume", action="store_true",
                          help="Reconcile this same receiving export/backup and continue its original cold reopen.")
    transfer.set_defaults(handler=handover)
    web = sub.add_parser("serve", help="Open the original authenticated browser application and native worker.")
    add_workspace(web)
    web.add_argument("--port", type=int, default=8792)
    web.set_defaults(handler=serve)
    args = parser.parse_args()
    if not 10 <= args.timeout <= 7200:
        parser.error("Use a native command deadline of 10 through 7200 seconds.")
    if hasattr(args, "wait_seconds") and not 0 <= args.wait_seconds <= 86400:
        parser.error("Use an operation-follow interval from 0 through 86400 seconds.")
    if hasattr(args, "password_env") and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", args.password_env):
        parser.error("Supply the name of the original private password environment variable.")
    if hasattr(args, "port") and not 0 <= args.port <= 65535:
        parser.error("Choose a local browser port from 0 through 65535.")
    os.umask(0o077)
    try:
        result = args.handler(args)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
        return 0
    except KeyboardInterrupt:
        print(json.dumps({"error": "The receiving process was interrupted; its original native journal remains on this host."}), file=sys.stderr)
        return 130
    except Exception as error:
        print(json.dumps({"error": str(error), "type": type(error).__name__}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
