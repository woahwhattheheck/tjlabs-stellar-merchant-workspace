"""Prepare and serve one dedicated Drupal target with the original Drush runtime.

The installed runtime comes from the maintained public-dependency installer.
Original native_adapter.Session owns every Drush command and its continuation.
This context owns only its selected site preparation and foreground PHP server.
"""
from __future__ import annotations

from contextlib import contextmanager
import fcntl
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import time
from urllib import error, request
import uuid

APP = Path(__file__).resolve().parents[2]
if str(APP) not in sys.path:
    sys.path.insert(0, str(APP))

import native_adapter as native
from content_consolidation.examples.native_receiving import (
    absolute_directory, read_json, required, sha_json, write_json,
)

SCHEMA = "govhub.native-site-preparation.v1"
READY_SCHEMA = "govhub.native-site-ready.v1"


def file_identity(path):
    path = Path(path)
    required(path.is_absolute() and path.is_file() and not path.is_symlink(),
             "Select the existing ordinary absolute native file.")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": digest.hexdigest()}


def _retain_json(path, value):
    if path.exists():
        required(read_json(path) == value, "This retained native input belongs to another request.")
    else:
        write_json(path, value)
    return file_identity(path)


def _retain_bytes(path, value):
    if path.exists():
        required(not path.is_symlink() and path.read_bytes() == value,
                 "The retained native setup source changed.")
    else:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
    return file_identity(path)


def _free_port(port):
    required(isinstance(port, int) and not isinstance(port, bool) and 0 <= port <= 65535,
             "Select a valid loopback port, or zero for the first available port.")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", port))
        return sock.getsockname()[1]


class _NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None


class NativeDrupalSite:
    """Use a pristine dedicated runtime project, or reopen this exact target.

    prepare() returns the actual target and account identities without passwords.
    authenticated_profile() temporarily supplies its reader cookie to the original
    native JSON:API receiver by environment-variable reference.

    A second caller cannot prepare or serve this same site concurrently. An
    existing target from another operation is never installed over.
    """

    def __init__(self, *, runtime_manifest, directory, site_root, environment_id,
                 site_name, site_mail, port=0, timeout=600,
                 max_artifact_bytes=1073741824):
        self.runtime_manifest = Path(runtime_manifest)
        self.directory_arg = Path(directory)
        self.root_arg = Path(site_root)
        required(all(isinstance(value, str) and value.strip()
                     for value in (environment_id, site_name, site_mail)),
                 "Name the exact native environment, site, and site contact.")
        required(re.fullmatch(r"[A-Za-z0-9_.:-]{1,180}", environment_id) is not None,
                 "Use a stable native environment identifier.")
        required("\n" not in site_mail and "\r" not in site_mail and "@" in site_mail,
                 "Supply the selected site's email address.")
        self.environment_id, self.site_name, self.site_mail = environment_id, site_name, site_mail
        required(isinstance(timeout, int) and not isinstance(timeout, bool) and 10 <= timeout <= 7200,
                 "Use a whole native command timeout from 10 to 7200 seconds.")
        required(isinstance(max_artifact_bytes, int) and not isinstance(max_artifact_bytes, bool)
                 and max_artifact_bytes >= 1048576, "Use a whole native artifact byte limit of at least one MiB.")
        self.port_requested, self.timeout = port, timeout
        self.max_artifact_bytes = max_artifact_bytes
        self._lock = None
        self._server = None
        self._logs = []
        self._authenticated = False
        self.receipt = None

    def __enter__(self):
        try:
            self._open()
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def _open(self):
        runtime_file = file_identity(self.runtime_manifest)
        runtime = read_json(self.runtime_manifest)
        required(runtime.get("returncode") == 0 and runtime.get("drush_version_returncode") == 0,
                 "Select the original completed Composer/Drush runtime receipt.")
        self.project = absolute_directory(runtime.get("project"))
        self.root = absolute_directory(self.root_arg)
        required(self.root.is_relative_to(self.project),
                 "The dedicated Drupal root must belong to the selected installed project.")
        required((self.root / "core/lib/Drupal.php").is_file()
                 and (self.root / "index.php").is_file()
                 and (self.root / ".ht.router.php").is_file(),
                 "The selected root must contain the installed original Drupal core and router.")
        original_lock = file_identity(self.project / "composer.original.lock")
        materialized_lock = file_identity(self.project / "composer.lock")
        required(original_lock["sha256"] == runtime.get("original_lock_sha256")
                 and materialized_lock["sha256"] == runtime.get("materialized_lock_sha256"),
                 "The selected installed runtime's original or materialized dependency lock changed.")
        php = native._binary(runtime.get("php"))
        drush = native._binary(runtime.get("drush"), executable=False)
        required(Path(drush).is_relative_to(self.project),
                 "The original Drush entrypoint must belong to this installed project.")
        self.directory = absolute_directory(self.directory_arg, create=True)
        required(not self.directory.is_relative_to(self.project)
                 and not self.project.is_relative_to(self.directory),
                 "Keep private site credentials and setup records separate from the native restore project.")
        lease_path = self.project / ".govhub-site-setup.lock"
        self._lock = os.open(lease_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self._lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise native.NativeWaiting("This selected site's original setup/server context is still active.") from exc
        files = self.root / "sites/default/files"
        self.database = files / ".ht.sqlite"
        runtime_identity = {"manifest": runtime_file, "original_lock_sha256": original_lock["sha256"],
            "materialized_lock_sha256": materialized_lock["sha256"],
            "php": file_identity(Path(php)), "drush": file_identity(Path(drush)),
            "composer": runtime.get("composer"), "drush_version": runtime["drush_version"]}
        selection = {"schema": SCHEMA, "directory": str(self.directory),
            "project": str(self.project), "site_root": str(self.root),
            "environment_id": self.environment_id, "site_name": self.site_name,
            "site_mail": self.site_mail, "database": str(self.database),
            "runtime": runtime_identity, "timeout_seconds": self.timeout,
            "max_artifact_bytes": self.max_artifact_bytes}
        binding_path = self.directory / "site-binding.json"
        owner_path = self.project / ".govhub-site-owner.json"
        if binding_path.exists():
            self.binding = read_json(binding_path)
            required({key: self.binding.get(key) for key in selection} == selection,
                     "Continue the original selected site, runtime and private setup directory.")
            self.port = self.binding["port"]
            required(self.port_requested in (0, self.port),
                     "Reopen the same retained site URI; its content mappings retain that origin.")
        else:
            required(not owner_path.exists() and not (self.root / "sites/default/settings.php").exists()
                     and not self.database.exists(),
                     "Choose a pristine dedicated runtime project, or reopen its original setup directory.")
            self.port = _free_port(self.port_requested)
            self.binding = {**selection, "operation_id": uuid.uuid4().hex,
                            "port": self.port, "uri": "http://127.0.0.1:" + str(self.port)}
            _retain_json(binding_path, self.binding)
        required(isinstance(self.binding.get("operation_id"), str)
                 and re.fullmatch(r"[0-9a-f]{32}", self.binding["operation_id"]) is not None,
                 "The original site operation identity is missing.")
        self.binding_sha256 = sha_json(self.binding)
        owner = {"schema": SCHEMA, "binding_sha256": self.binding_sha256,
                 "directory": str(self.directory), "site_root": str(self.root),
                 "environment_id": self.environment_id, "operation_id": self.binding["operation_id"]}
        _retain_json(owner_path, owner)
        self.uri = self.binding["uri"]
        self.profile = native._profile({"source_kind": "drush", "environment_id": self.environment_id,
            "php_path": php, "drush_path": drush, "site_root": str(self.root),
            "restore_destination": str(self.project),
            "files_relative_path": files.relative_to(self.project).as_posix(), "uri": self.uri,
            "timeout_seconds": self.timeout, "max_artifact_bytes": self.max_artifact_bytes})
        self.cookie_variable = "GOVHUB_NATIVE_SITE_" + self.binding["operation_id"].upper() + "_COOKIE"
        self.credentials_path = self.directory / "credentials.json"
        self._credentials()
        self.scripts = self.directory / "scripts"
        self.scripts.mkdir(mode=0o700, exist_ok=True)
        helper = Path(__file__).with_name("prepare_native_site.php")
        _retain_bytes(self.scripts / helper.name, helper.read_bytes())
        self.session = native.Session(self.profile, self.directory / "native-setup")
        state_path = self.session.out / "native-state.json"
        self.session.state = self.session.read_private_json(state_path) if state_path.exists() else {
            "intent_sha256": self.binding_sha256, "intent": self.binding,
            "phase": "prepared", "mutation_started": False}
        required(self.session.state.get("intent_sha256") == self.binding_sha256,
                 "The retained original Drush commands belong to a different site intent.")
        self.session.save_state()

    def _credentials(self):
        if self.credentials_path.exists():
            value = read_json(self.credentials_path)
            required(value.get("schema") == "govhub.native-site-credentials.v1"
                     and value.get("operation_id") == self.binding["operation_id"],
                     "Restore this site's original private account inputs.")
        else:
            required(not (self.directory / "drush.yml").exists()
                     and not (self.root / "sites/default/settings.php").exists(),
                     "Restore the existing private account file before reopening this native site.")
            suffix = self.binding["operation_id"][:12]
            value = {"schema": "govhub.native-site-credentials.v1",
                "operation_id": self.binding["operation_id"],
                "admin": {"name": "govhub_admin_" + suffix, "password": secrets.token_urlsafe(36),
                          "mail": self.site_mail},
                "receiver": {"name": "govhub_reader_" + suffix, "password": secrets.token_urlsafe(36),
                             "mail": "govhub-reader-" + suffix + "@example.invalid"}}
            write_json(self.credentials_path, value)
        required(not self.credentials_path.stat().st_mode & 0o077,
                 "The native account input file must remain private.")
        for role in ("admin", "receiver"):
            account = value.get(role)
            required(isinstance(account, dict)
                     and all(isinstance(account.get(key), str) and account[key] for key in ("name", "password", "mail")),
                     "Retain the complete original private " + role + " account.")
        self.credentials = value

    def _request(self, action):
        value = {"schema": "govhub.native-site-preparation-request.v1", "action": action,
                 "binding_file": str(self.directory / "site-binding.json"),
                 "binding_sha256": self.binding_sha256,
                 "credentials_file": str(self.credentials_path)}
        path = self.directory / (action + "-request.json")
        _retain_json(path, value)
        return path

    def _helper(self, action, label, *, mutating=False):
        path = self._request(action)
        record = self.session.command(label, native._prefix(self.profile) + [
            "php:script", "prepare_native_site", "--script-path=" + str(self.scripts), str(path)],
            mutating=mutating)
        value = read_json(Path(record["stdout"]["path"]))
        required(value.get("schema") == READY_SCHEMA
                 and value.get("binding_sha256") == self.binding_sha256
                 and value.get("environment_id") == self.environment_id
                 and value.get("site_root") == str(self.root)
                 and value.get("database") == str(self.database)
                 and isinstance(value.get("site_uuid"), str) and value["site_uuid"],
                 "The native Drupal observation does not match this selected site.")
        return value, record

    def _reconcile_completed(self, label, *, need_receiver):
        path = self.session.out / (label + ".command.json")
        if not path.exists():
            return None
        original = read_json(path)
        if original.get("phase") in {"complete", "not_started"}:
            return None
        required(original.get("phase") == "interrupted"
                 and original.get("owned_process_reaped") is True,
                 "Reconcile the original still-unfinished Drush process before continuing site setup.")
        # A lost final reply may follow a complete native commit. Observe the
        # same database and private accounts; preserve the original command state.
        value, observation = self._helper("inspect", label + "-observe-" + str(time.time_ns()))
        if need_receiver:
            required(value.get("status") == "READY" and value.get("receiver"),
                     "The original account step has not committed its complete native identities.")
        receipt = {"schema": "govhub.native-site-command-reconciliation.v1",
                   "original_command": file_identity(path), "native_observation": value,
                   "observation_command": observation}
        write_json(self.directory / (label + "-reconciled.json"), receipt)
        return receipt

    def prepare(self):
        required(self._lock is not None, "Open NativeDrupalSite as a context manager.")
        self.database.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        drush_config = self.directory / "drush.yml"
        _retain_json(drush_config, {"command": {"site": {"install": {"options": {
            "account-name": self.credentials["admin"]["name"],
            "account-pass": self.credentials["admin"]["password"],
            "account-mail": self.credentials["admin"]["mail"]}}}}})
        install_recovery = self._reconcile_completed("site-install", need_receiver=False)
        if install_recovery is None:
            self.session.command("site-install", native._prefix(self.profile) + [
                "--config=" + str(drush_config), "site:install", "minimal",
                "--sites-subdir=default",
                "--db-url=sqlite://sites/default/files/.ht.sqlite?module=sqlite",
                "--site-name=" + self.site_name, "--site-mail=" + self.site_mail,
                "install_configure_form.enable_update_status_module=NULL",
                "install_configure_form.enable_update_status_emails=NULL", "--yes"], mutating=True)
        accounts_recovery = self._reconcile_completed("site-accounts", need_receiver=True)
        if accounts_recovery is None:
            self._helper("prepare", "site-accounts", mutating=True)
        actual, command = self._helper("inspect", "site-readback-" + str(time.time_ns()))
        required(actual.get("status") == "READY" and actual.get("receiver"),
                 "The original native site/account setup is incomplete.")
        info, commands, fingerprint = native._drush_info(self.session, fresh=True)
        required({"php:script", "pm:enable", "cache:rebuild"} <= commands,
                 "The installed original Drush lacks a required native module command.")
        self.receipt = {**actual, "uri": self.uri, "native_profile": dict(self.profile),
                        "runtime": self.binding["runtime"], "native_status": info,
                        "native_fingerprint": fingerprint,
                        "observation_command": command,
                        "reconciliations": {key: value for key, value in {
                            "site-install": install_recovery, "site-accounts": accounts_recovery}.items()
                            if value is not None}}
        write_json(self.directory / "site-ready.json", self.receipt)
        self._start_server()
        return self.receipt

    def _start_server(self):
        if self._server is not None:
            required(self._server.poll() is None, "The owned native PHP server has exited.")
            return
        _free_port(self.port)
        router = self.directory / "router.php"
        # The original Drupal router remains the request handler. The wrapper
        # prevents PHP's development server from serving private/config files.
        router_source = """<?php
$binding = json_decode(file_get_contents(__DIR__ . '/site-binding.json'), true, 512, JSON_THROW_ON_ERROR);
$root = $binding['site_root'];
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
foreach (explode('/', $path) as $segment) {
  if ($segment === '..' || str_starts_with($segment, '.') || str_contains($segment, chr(0))) {
    http_response_code(404); return true;
  }
}
$resolved = realpath($root . '/' . ltrim($path, '/'));
if ($resolved !== false && is_file($resolved)) {
  $extension = strtolower(pathinfo($resolved, PATHINFO_EXTENSION));
  $public = ['css','js','map','png','jpg','jpeg','gif','webp','avif','svg','ico','woff','woff2','ttf','otf','eot','pdf','txt'];
  if (!str_starts_with($resolved, $root . DIRECTORY_SEPARATOR) ||
      (!in_array($extension, $public, true) && $path !== '/index.php')) {
    http_response_code(404); return true;
  }
}
return require $root . '/.ht.router.php';
"""
        _retain_bytes(router, router_source.encode())
        logs = [open(self.directory / name, "ab", buffering=0) for name in ("php-server.stdout", "php-server.stderr")]
        self._logs = logs
        argv = [self.profile["php_path"], "-d", "display_errors=0", "-d", "log_errors=1",
                "-d", "error_log=" + str(self.directory / "php-errors.log"),
                "-S", "127.0.0.1:" + str(self.port), "-t", str(self.root), str(router)]
        self._server = subprocess.Popen(argv, cwd=self.root, stdout=logs[0], stderr=logs[1],
                                        stdin=subprocess.DEVNULL, start_new_session=True)
        write_json(self.directory / "http-server.json", {"schema": "govhub.native-site-http.v1",
                   "uri": self.uri, "argv": argv, "pid": self._server.pid, "state": "STARTING"})
        opener = request.build_opener(request.ProxyHandler({}), _NoRedirect())
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            required(self._server.poll() is None, "The selected PHP server exited; inspect its retained stderr.")
            try:
                with opener.open(self.uri + "/user/login", timeout=2) as response:
                    response.read(65536)
                    if response.status == 200:
                        write_json(self.directory / "http-server.json", {
                            "schema": "govhub.native-site-http.v1", "uri": self.uri,
                            "argv": argv, "pid": self._server.pid, "state": "READY"})
                        return
            except (error.URLError, TimeoutError):
                pass
            time.sleep(0.2)
        raise native.NativeWaiting("The owned PHP server has not returned the original Drupal login page.")

    @contextmanager
    def authenticated_profile(self):
        required(self.receipt is not None and self._server is not None
                 and self._server.poll() is None, "Prepare the original native site before JSON:API receiving.")
        required(not self._authenticated, "Use one reader authentication context for this native site.")
        jar = http.cookiejar.CookieJar()
        opener = request.build_opener(request.ProxyHandler({}), _NoRedirect(), request.HTTPCookieProcessor(jar))
        credentials = self.credentials["receiver"]
        payload = json.dumps({"name": credentials["name"], "pass": credentials["password"]}).encode()
        login = request.Request(self.uri + "/user/login?_format=json", data=payload,
                                headers={"Content-Type": "application/json", "Accept": "application/json"},
                                method="POST")
        with opener.open(login, timeout=30) as response:
            raw = response.read(1048577)
            required(response.status == 200 and len(raw) <= 1048576,
                     "The original Drupal reader login did not complete.")
            value = json.loads(raw)
        current = value.get("current_user", {})
        expected = self.receipt["receiver"]
        required(str(current.get("uid")) == str(expected["uid"]) and current.get("name") == expected["name"],
                 "The original Drupal login returned a different receiving account.")
        probe = request.Request(self.uri + "/jsonapi")
        jar.add_cookie_header(probe)
        cookie = probe.get_header("Cookie")
        required(isinstance(cookie, str) and cookie and "\n" not in cookie and "\r" not in cookie,
                 "The original Drupal login did not issue its native receiving cookie.")
        previous = os.environ.get(self.cookie_variable)
        os.environ[self.cookie_variable] = cookie
        self._authenticated = True
        try:
            yield {**self.profile, "jsonapi_cookie_env": self.cookie_variable}
        finally:
            if previous is None:
                os.environ.pop(self.cookie_variable, None)
            else:
                os.environ[self.cookie_variable] = previous
            self._authenticated = False

    def __exit__(self, *_):
        if self._server is not None:
            process = self._server
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=10)
            if hasattr(self, "directory"):
                write_json(self.directory / "http-server-stopped.json", {
                    "schema": "govhub.native-site-http.v1", "uri": self.uri,
                    "pid": process.pid, "returncode": process.returncode, "state": "STOPPED"})
            self._server = None
        for stream in self._logs:
            stream.close()
        self._logs = []
        if self._lock is not None:
            os.close(self._lock)
            self._lock = None
