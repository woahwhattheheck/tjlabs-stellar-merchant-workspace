#!/usr/bin/env python3
"""Compose frozen upstream setup, the original customer receiver, and owned shutdown.

Run this command inside the maintained native resource admission. It is not a
scheduler and does not launch another capacity request.
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import stat
import subprocess
import sys
import time
import uuid

from public_solr_transport import ENGINE_COMMIT, encoded, file_observation, load_json, private_directory, sha, sync_dir, utc, write_new

SCHEMA = "commons.iati.dqa.complete-upstream.v1"
REPOSITORY = "https://github.com/zimmerman-team/iati-cloud.dqa"
TOKENS = {"{operation_directory}", "{ready_file}", "{provider_file}", "{assessments_file}"}


def regular(path: Path, maximum: int = 16 * 1024 * 1024) -> bytes:
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > maximum:
            raise ValueError("Expected a bounded regular input: " + str(path))
        body = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
        if len(body) > maximum or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
                after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise ValueError("Input changed while being selected: " + str(path))
        return body


def executable(value: str) -> str:
    if not isinstance(value, str) or not Path(value).is_absolute():
        raise ValueError("Select an absolute existing executable")
    path = Path(value)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError("Selected executable is not available: " + value)
    # Python venv and Redis multicall symlinks must preserve their invocation.
    return str(path)


def checked(value: dict) -> dict:
    allowed = {"schema", "operation_id", "directory", "python_executable", "uv_executable",
               "git_executable", "redis_executable", "redis_library_directory", "authorization_env",
               "api_port", "redis_port", "transport", "runtime_prepare", "callback",
               "setup_timeout_seconds", "callback_timeout_seconds"}
    if not isinstance(value, dict) or value.get("schema") != SCHEMA or set(value) - allowed:
        raise ValueError("Select the complete upstream profile schema")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}", value.get("operation_id", "")):
        raise ValueError("Supply one stable complete-operation identity")
    if not isinstance(value.get("directory"), str) or not Path(value["directory"]).is_absolute():
        raise ValueError("Supply the private complete-operation directory")
    result = dict(value)
    for key in ("python_executable", "uv_executable", "git_executable", "redis_executable"):
        result[key] = executable(value.get(key))
    if value.get("redis_library_directory") is not None:
        library = Path(value["redis_library_directory"])
        if not library.is_absolute() or not library.is_dir():
            raise ValueError("Select the existing original Redis library directory")
    name = value.get("authorization_env", "IATI_DQA_LOCAL_KEY")
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,127}", name):
        raise ValueError("Retain only the authorization environment variable name")
    result["authorization_env"] = name
    for key, default in (("setup_timeout_seconds", 1200), ("callback_timeout_seconds", 1800)):
        amount = value.get(key, default)
        if type(amount) is not int or not 30 <= amount <= 7200:
            raise ValueError("Select a finite original command timeout between 30 and 7200 seconds")
        result[key] = amount
    for key in ("runtime_prepare", "callback"):
        item = value.get(key)
        if item is None and key == "runtime_prepare":
            continue
        if not isinstance(item, dict) or set(item) - {"argv", "cwd", "required_outputs", "result_file", "operation_id"}:
            raise ValueError("Supply the exact original " + key + " argv and cwd")
        argv = item.get("argv")
        if not isinstance(argv, list) or not argv or any(not isinstance(part, str) or not part or "\0" in part for part in argv):
            raise ValueError("Use a complete literal argument vector")
        executable(argv[0])
        for part in argv:
            if ("{" in part or "}" in part) and part not in TOKENS:
                raise ValueError("Use only complete documented path tokens in argv")
            if key == "runtime_prepare" and part in TOKENS - {"{operation_directory}"}:
                raise ValueError("Provider READY paths do not exist during runtime preparation")
        if not isinstance(item.get("cwd"), str) or not Path(item["cwd"]).is_absolute():
            raise ValueError("Select an absolute original command working directory")
        outputs = item.get("required_outputs", [])
        if not isinstance(outputs, list):
            raise ValueError("Required outputs are selected relative file paths")
        for relative in outputs:
            if not isinstance(relative, str) or not relative or Path(relative).is_absolute() or ".." in Path(relative).parts:
                raise ValueError("Select safe relative complete-operation output files")
    callback = result["callback"]
    if not isinstance(callback.get("result_file"), str) or not callback["result_file"] or Path(callback["result_file"]).is_absolute() or ".." in Path(callback["result_file"]).parts:
        raise ValueError("Select the original callback result file relative to this complete operation")
    if not isinstance(callback.get("operation_id"), str) or not callback["operation_id"]:
        raise ValueError("Retain the original customer receiver operation ID")
    return result


def namespace(path: Path) -> str:
    return os.readlink(path / "ns" / "pid")


def procfs_identity() -> dict:
    value = os.stat("/proc")
    return {"device": value.st_dev, "root_inode": value.st_ino}


def proc_identity(procfs_pid: int) -> dict | None:
    """Read a canonical PID in the current procfs mount, never a caller-local PID."""
    path = Path("/proc", str(procfs_pid))
    try:
        before = (path / "stat").read_text()
        fields = before[before.rfind(")") + 2:].split()
        status = {}
        for line in (path / "status").read_text().splitlines():
            key, separator, value = line.partition(":")
            if separator:
                status[key] = value.strip()
        pid_namespace = namespace(path)
        after = (path / "stat").read_text()
        final_fields = after[after.rfind(")") + 2:].split()
        if int(before.split(" ", 1)[0]) != procfs_pid or fields[19] != final_fields[19]:
            return None
        nspid = [int(value) for value in status["NSpid"].split()]
        nspgid = [int(value) for value in status.get("NSpgid", "").split()]
        return {"schema": "commons.iati.dqa.proc-identity.v1", "pid": procfs_pid,
                "local_pid": nspid[-1], "nspid": nspid, "nspgid": nspgid,
                "start_ticks": fields[19], "boot_id": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
                "pid_namespace": pid_namespace, "procfs_identity": procfs_identity(),
                "state": final_fields[0]}
    except (FileNotFoundError, ProcessLookupError):
        return None


def identity(local_pid: int) -> dict | None:
    """Resolve this caller's local Popen PID through matching PID namespace/NSpid."""
    caller_namespace = namespace(Path("/proc/self"))
    if local_pid == os.getpid():
        procfs_pid = int(os.readlink("/proc/self"))
        observed = proc_identity(procfs_pid)
        if observed and observed["pid_namespace"] == caller_namespace and observed["local_pid"] == local_pid:
            return observed
        return None
    try:
        observed = proc_identity(local_pid)
    except PermissionError:
        observed = None
    if observed and observed["pid_namespace"] == caller_namespace and observed["local_pid"] == local_pid:
        return observed
    matches = []
    with os.scandir("/proc") as entries:
        for entry in entries:
            if not entry.name.isdecimal() or int(entry.name) == local_pid:
                continue
            try:
                if namespace(Path(entry.path)) != caller_namespace:
                    continue
                observed = proc_identity(int(entry.name))
                if observed and observed["pid_namespace"] == caller_namespace and observed["local_pid"] == local_pid:
                    matches.append(observed)
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                continue
    if len(matches) > 1:
        raise RuntimeError("The actual child PID has ambiguous procfs namespace identity")
    return matches[0] if matches else None


def alive(original: dict | None) -> bool:
    if not original:
        return False
    if original.get("schema") != "commons.iati.dqa.proc-identity.v1":
        raise ValueError("An earlier process identity needs the original native namespace reconciliation")
    if procfs_identity() != original["procfs_identity"]:
        raise RuntimeError("The current procfs mount cannot establish the original host PID's lifetime")
    observed = proc_identity(original["pid"])
    return bool(observed and observed["state"] not in ("Z", "X") and
                all(observed.get(key) == original.get(key) for key in
                    ("pid", "start_ticks", "boot_id", "pid_namespace", "procfs_identity")))


def retained_local_pid(original: dict) -> int:
    """Translate only a retained process in this caller's verified PID namespace."""
    if not alive(original):
        raise ProcessLookupError("The retained original process has ended")
    if namespace(Path("/proc/self")) != original["pid_namespace"]:
        raise RuntimeError("Resume the original provider through its owning native namespace before signalling it")
    observed = proc_identity(original["pid"])
    if observed is None or observed["local_pid"] != original["local_pid"]:
        raise RuntimeError("The retained original local PID mapping changed")
    return observed["local_pid"]

class Complete:
    def __init__(self, profile: dict):
        self.profile = checked(profile)
        self.directory = private_directory(self.profile["directory"])
        self.lock = os.open(self.directory / "complete.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            os.close(self.lock)
            raise RuntimeError("The complete operation has an active owner")
        self.children: list[dict] = []
        self.cancelled = False
        self.ready = None
        self.callback_ready = None
        self.attempt = None
        self.original_result = None
        self.stage = "reconciliation"
        profile_body = encoded(self.profile)
        write_new(self.directory / "profile.json", profile_body)
        self.profile_sha256 = sha(profile_body)
        self.prior_providers = []
        self.prior_commands = []
        for path in sorted((self.directory / "attempts").glob("*/commands/*/started.json")):
            command_dir = path.parent
            request = load_json(path)
            process_path = command_dir / "process.json"
            launch_failure = command_dir / "launch-failure.json"
            if not process_path.exists():
                if launch_failure.exists() and load_json(launch_failure).get("dispatch") == "NOT_STARTED":
                    self.prior_commands.append({"directory": str(command_dir), "dispatch": "NOT_STARTED"})
                    continue
                outcome_path = command_dir / "wait-outcome.json"
                if outcome_path.exists():
                    waited = load_json(outcome_path)
                    if type(waited.get("returncode")) is not int:
                        raise ValueError("A retained native wait outcome is invalid")
                    process = {"identity": waited.get("identity")}
                else:
                    # A missing process record is not proof that Popen never returned.
                    raise RuntimeError("The original command launch is uncertain; use the native controller's original identity reconciliation: " + str(command_dir))
            else:
                process = load_json(process_path)
            live = alive(process.get("identity"))
            if request["name"] == "upstream":
                self.prior_providers.append({"directory": command_dir, "request": request, "identity": process["identity"]})
            elif live:
                raise RuntimeError("A retained original child is still alive: " + str(process_path))
            outcome = command_dir / "wait-outcome.json"
            completion = command_dir / "completed.json"
            if outcome.exists() and not completion.exists() and not live:
                value = load_json(outcome)
                value["stdout"] = file_observation(command_dir, command_dir / "stdout")
                value["stderr"] = file_observation(command_dir, command_dir / "stderr")
                write_new(completion, encoded(value))
            if completion.exists():
                value = load_json(completion)
                for key in ("stdout", "stderr"):
                    if file_observation(command_dir, command_dir / key) != value[key]:
                        raise ValueError("A retained original command log changed")
                self.prior_commands.append({"directory": str(command_dir), "returncode": value["returncode"]})
            else:
                self.prior_commands.append({"directory": str(command_dir), "returncode": None,
                                            "observation": "original process ended" if not live else "owned upstream remains live"})
        binding_path = self.directory / "callback-binding.json"
        self.callback_binding = load_json(binding_path) if binding_path.exists() else None
        if self.callback_binding:
            if self.callback_binding.get("profile_sha256") != self.profile_sha256:
                raise ValueError("The retained callback selection belongs to another complete profile")
            ready_path = Path(self.callback_binding["ready_file"])
            if sha(regular(ready_path)) != self.callback_binding["ready_sha256"]:
                raise ValueError("The original callback READY bytes changed")
            self.callback_ready = json.loads(regular(ready_path))
        complete = self.directory / "result.json"
        if complete.exists():
            result = load_json(complete)
            if result.get("profile_sha256") != self.profile_sha256 or result.get("status") != "COMPLETE":
                raise ValueError("This complete operation has a different retained result")
            for row in result["required_outputs"] + [result["upstream_stopped"], result["receiver_result"]]:
                if file_observation(self.directory, self.directory / row["path"]) != row:
                    raise ValueError("A completed original output changed: " + row["path"])
            self.verify_receiver_result()
            if any(alive(item["identity"]) for item in self.prior_providers):
                raise RuntimeError("An original provider remains alive despite the completed result")
            self.original_result = result
            return
        self.attempt = self.directory / "attempts" / ("attempt-" + str(time.time_ns()) + "-" + uuid.uuid4().hex[:10])
        self.attempt.mkdir(parents=True, mode=0o700)
        write_new(self.attempt / "owner.json", encoded({"at": utc(), "identity": identity(os.getpid()),
                                                       "profile_sha256": self.profile_sha256}))
        self.env = dict(os.environ)
        self.env.setdefault(self.profile["authorization_env"], secrets.token_urlsafe(36))
        if not self.env[self.profile["authorization_env"]] or any(
                char in self.env[self.profile["authorization_env"]] for char in ("\r", "\n")):
            raise ValueError("Supply a valid local service key in the selected environment name")
        temporary = private_directory(self.directory / "temporary")
        self.env.update({"PYTHONDONTWRITEBYTECODE": "1", "PYTHONUNBUFFERED": "1", "TZ": "UTC",
                         "TMPDIR": str(temporary), "TMP": str(temporary), "TEMP": str(temporary),
                         "GIT_TERMINAL_PROMPT": "0"})

    def event(self, name: str, **values):
        value = {"at": utc(), "stage": name, **values}
        path = self.attempt / "events.jsonl"
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "ab") as stream:
            stream.write(encoded(value))
            stream.flush()
            os.fsync(stream.fileno())
        print(json.dumps(value), flush=True)

    def start(self, name: str, argv: list[str], cwd: Path | None = None, env: dict | None = None) -> dict:
        if self.cancelled:
            raise InterruptedError("The original parent was stopped")
        command_dir = self.attempt / "commands" / (str(len(self.children) + 1).zfill(3) + "-" + name)
        command_dir.mkdir(parents=True, mode=0o700)
        request = {"name": name, "argv": argv, "cwd": str(cwd) if cwd else None, "started_at": utc()}
        write_new(command_dir / "started.json", encoded(request))
        out = err = None
        phase = "logs"
        try:
            out = (command_dir / "stdout").open("xb")
            err = (command_dir / "stderr").open("xb")
            phase = "process_creation"
            child = subprocess.Popen(argv, cwd=cwd, env=env or self.env, stdin=subprocess.DEVNULL,
                                     stdout=out, stderr=err, start_new_session=True)
        except BaseException as error:
            for stream in (out, err):
                if stream:
                    stream.close()
            # subprocess.Popen raised before returning a child. Retain that actual
            # outcome; absence of this record remains uncertain on a later restart.
            with contextlib.suppress(Exception):
                write_new(command_dir / "launch-failure.json", encoded({
                    "at": utc(), "dispatch": ("NOT_STARTED" if phase == "logs" or isinstance(error, (OSError, ValueError)) else "UNCERTAIN"),
                    "phase": phase, "error": type(error).__name__, "message": str(error)}))
            raise
        selected = {"name": name, "process": child, "directory": command_dir, "out": out, "err": err,
                    "identity": identity(child.pid), "outcome": None, "completed": None}
        self.children.append(selected)
        write_new(command_dir / "process.json", encoded({"at": utc(), "identity": selected["identity"]}))
        if selected["identity"] is None:
            if child.poll() is None:
                raise RuntimeError("The created original child has no observable native identity")
            self.finish(selected)
        return selected

    def finish(self, selected: dict) -> dict:
        if selected["completed"] is not None:
            return selected["completed"]
        child = selected["process"]
        if child.poll() is None:
            raise RuntimeError("The original child has not ended")
        # The wait outcome is separate from fallible log/metadata completion.
        if selected["outcome"] is None:
            selected["outcome"] = {"ended_at": utc(), "identity": selected["identity"],
                                   "returncode": child.returncode}
        write_new(selected["directory"] / "wait-outcome.json", encoded(selected["outcome"]))
        for stream in (selected["out"], selected["err"]):
            if not stream.closed:
                stream.flush()
                os.fsync(stream.fileno())
                stream.close()
        result = dict(selected["outcome"])
        result["stdout"] = file_observation(selected["directory"], selected["directory"] / "stdout")
        result["stderr"] = file_observation(selected["directory"], selected["directory"] / "stderr")
        write_new(selected["directory"] / "completed.json", encoded(result))
        selected["completed"] = result
        return result

    def stop(self, selected: dict, timeout: int = 20) -> dict:
        child = selected["process"]
        if child.poll() is None:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(child.pid, signal.SIGKILL)
                child.wait()
        return self.finish(selected)

    def command(self, name: str, argv: list[str], cwd: Path | None = None,
                env: dict | None = None, timeout: int | None = None) -> bytes:
        selected = self.start(name, argv, cwd, env)
        deadline = time.monotonic() + (timeout or self.profile["setup_timeout_seconds"])
        while selected["process"].poll() is None:
            if self.cancelled:
                self.stop(selected)
                raise InterruptedError("The original parent was stopped")
            if time.monotonic() >= deadline:
                self.stop(selected)
                raise TimeoutError("Original " + name + " command timed out; complete output is retained")
            if name == "callback" and self.provider["process"].poll() is not None:
                self.stop(selected)
                raise RuntimeError("The owned upstream ended during its original customer callback")
            time.sleep(0.2)
        result = self.finish(selected)
        if result["returncode"] != 0:
            raise RuntimeError("Original " + name + " command exited " + str(result["returncode"]) +
                               "; complete stdout/stderr: " + str(selected["directory"]))
        return regular(selected["directory"] / "stdout", 32 * 1024 * 1024)

    def acquire_upstream(self) -> tuple[Path, Path]:
        repo = self.directory / "upstream-repository"
        repo.mkdir(mode=0o700, exist_ok=True)
        git = self.profile["git_executable"]
        if not (repo / ".git").is_dir():
            if any(repo.iterdir()):
                raise ValueError("The selected original upstream directory contains unrelated files")
            self.command("git-init", [git, "init", str(repo)])
        config = self.command("git-remotes", [git, "remote", "-v"], repo).decode()
        if config.strip():
            lines = [line.split() for line in config.splitlines()]
            if any(len(line) != 3 or line[0] != "origin" or line[1].removesuffix(".git") != REPOSITORY for line in lines):
                raise ValueError("The retained source remote is not the exact original upstream repository")
        else:
            self.command("git-origin", [git, "remote", "add", "origin", REPOSITORY], repo)
        # Request an immutable commit; never substitute the repository's moving default branch.
        present = subprocess.run([git, "cat-file", "-e", ENGINE_COMMIT + "^{commit}"],
                                 cwd=repo, env=self.env, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
        if not present:
            self.command("git-fetch", [git, "-c", "gc.auto=0", "fetch", "--no-tags", "--depth=1", "origin", ENGINE_COMMIT], repo)
        has_head = subprocess.run([git, "rev-parse", "--verify", "HEAD"], cwd=repo, env=self.env,
                                  stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        if has_head.returncode:
            self.command("git-checkout", [git, "checkout", "--detach", ENGINE_COMMIT], repo)
        elif has_head.stdout.decode().strip() != ENGINE_COMMIT:
            raise ValueError("The existing upstream checkout belongs to another selected edition")
        changed = self.command("git-tracked-status", [git, "status", "--porcelain", "--untracked-files=no"], repo)
        if changed.strip():
            raise ValueError("The original upstream tracked source has changed")
        before = sha(regular(repo / "uv.lock"))
        venv = self.directory / "python-environment"
        python = venv / "bin" / "python"
        install_env = dict(self.env, UV_PROJECT_ENVIRONMENT=str(venv))
        self.command("uv-sync-frozen", [
            self.profile["uv_executable"], "sync", "--frozen", "--no-dev", "--no-editable", "--no-cache",
            "--project", str(repo), "--python", self.profile["python_executable"], "--link-mode", "copy"
        ], repo, install_env)
        if sha(regular(repo / "uv.lock")) != before:
            raise ValueError("The upstream lock changed during frozen dependency setup")
        executable(str(python))
        files = []
        raw = self.command("git-source-inventory", [git, "ls-tree", "-rz", "--full-tree", ENGINE_COMMIT], repo)
        for item in raw.split(b"\0"):
            if not item:
                continue
            metadata, path = item.split(b"\t", 1)
            mode, kind, blob = metadata.decode().split(" ")
            relative = path.decode("utf-8")
            if kind != "blob" or mode not in ("100644", "100755"):
                raise ValueError("Retain the original ordinary-file source closure")
            body = regular(repo / relative)
            if hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest() != blob:
                raise ValueError("An original source file does not match its Git blob")
            files.append({"path": relative, "git_blob": blob, "bytes": len(body), "sha256": sha(body)})
        write_new(self.attempt / "upstream-acquisition.json", encoded({
            "schema": "commons.iati.dqa.upstream-acquisition.v1", "observed_at": utc(),
            "repository": REPOSITORY, "commit": ENGINE_COMMIT, "uv_lock_sha256": before, "files": files,
            "python_executable": str(python), "uv_version": self.command("uv-version", [self.profile["uv_executable"], "--version"]).decode().strip()
        }))
        self.event("original_upstream_and_frozen_environment_ready", commit=ENGINE_COMMIT, source_files=len(files))
        return repo, python

    def expand(self, command: dict) -> tuple[list[str], Path]:
        mapping = {"{operation_directory}": str(self.directory)}
        selected_ready = self.callback_ready or self.ready
        if selected_ready:
            mapping.update({"{ready_file}": selected_ready["ready_file"],
                            "{provider_file}": selected_ready["provider_input"],
                            "{assessments_file}": selected_ready["assessments_input"]})
        argv = []
        for token in command["argv"]:
            if token in TOKENS and token not in mapping:
                raise ValueError("The selected command requires an unavailable provider path")
            argv.append(mapping.get(token, token))
        cwd = Path(command["cwd"])
        if not cwd.is_dir():
            raise ValueError("The original command's selected directory is absent")
        return argv, cwd

    def wait_provider(self, selected: dict) -> dict:
        deadline = time.monotonic() + 90
        offset, buffer = 0, b""
        while time.monotonic() < deadline:
            if self.cancelled:
                raise InterruptedError("The original parent was stopped")
            with (selected["directory"] / "stdout").open("rb") as stream:
                stream.seek(offset)
                chunk = stream.read(1024 * 1024)
            offset += len(chunk)
            buffer += chunk
            if len(buffer) > 2 * 1024 * 1024:
                raise ValueError("Provider stdout did not contain a bounded complete READY record")
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                try:
                    value = json.loads(line)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    continue
                if isinstance(value, dict) and value.get("state") == "READY":
                    file = Path(value["ready_file"])
                    observed = json.loads(regular(file))
                    if observed != value or value.get("engine_commit") != ENGINE_COMMIT:
                        raise ValueError("READY differs from its original retained source")
                    if value.get("operation_id") != self.profile["operation_id"] or self.directory not in file.parents:
                        raise ValueError("READY belongs to another operation")
                    if selected["process"].poll() is not None:
                        raise RuntimeError("The provider ended before its READY could be used")
                    return value
            if selected["process"].poll() is not None:
                self.finish(selected)
                raise RuntimeError("The original provider exited before READY; complete logs are retained")
            time.sleep(0.2)
        raise TimeoutError("The actual original upstream did not reach READY")

    def outputs(self) -> list[dict]:
        selected = set(self.profile["callback"].get("required_outputs", []))
        if self.profile.get("runtime_prepare"):
            selected.update(self.profile["runtime_prepare"].get("required_outputs", []))
        result = []
        for relative in sorted(selected):
            path = self.directory / relative
            if not path.is_file() or path.is_symlink():
                raise ValueError("The original command did not retain required output: " + relative)
            result.append(file_observation(self.directory, path))
        return result

    def verify_receiver_result(self) -> dict | None:
        path = self.directory / self.profile["callback"]["result_file"]
        if not path.exists():
            return None
        value = load_json(path, 32 * 1024 * 1024)
        if value.get("schema") != "stellar-forge.iati-dqa-operator-receiving.v1" or value.get("state") != "COMPLETE":
            raise ValueError("The original callback result has not completed its own cleanup")
        if value.get("operationId") != self.profile["callback"]["operation_id"]:
            raise ValueError("The receiver result belongs to another native customer operation")
        if not re.fullmatch(r"[a-f0-9]{64}", value.get("selectionSha256", "")):
            raise ValueError("The original callback selection identity is absent")
        files = value.get("files")
        handover = value.get("customerHandover")
        if not isinstance(files, list) or not files or not isinstance(handover, dict):
            raise ValueError("The complete original receiver file inventory is missing")
        if handover.get("schema") != "stellar-forge.iati-dqa-complete-handover.v1":
            raise ValueError("Select the original complete customer handover")
        for row in [*files, handover]:
            path = Path(row["path"])
            if not path.is_absolute() or path.is_symlink():
                raise ValueError("The callback must retain absolute original regular-file descriptors")
            measured = file_observation(path.parent, path)
            if measured["bytes"] != row["bytes"] or measured["sha256"] != row["sha256"]:
                raise ValueError("A complete original customer file changed: " + str(path))
        return value

    def prior_ready(self, selected: dict) -> dict | None:
        raw = regular(selected["directory"] / "stdout", 4 * 1024 * 1024)
        for line in raw.splitlines():
            try:
                value = json.loads(line)
            except (ValueError, UnicodeDecodeError):
                continue
            if isinstance(value, dict) and value.get("schema") == "commons.iati.dqa.upstream-ready.v1":
                file = Path(value["ready_file"])
                if self.directory not in file.parents or json.loads(regular(file)) != value:
                    raise ValueError("The retained original upstream READY changed")
                return value
        return None

    def stop_prior_providers(self) -> list[Path]:
        stopped = []
        for selected in reversed(self.prior_providers):
            original = selected["identity"]
            ready = self.prior_ready(selected)
            if alive(original):
                local_pid = retained_local_pid(original)
                if os.getpgid(local_pid) != local_pid:
                    raise RuntimeError("The original provider process group no longer matches its retained identity")
                if not alive(original):
                    raise RuntimeError("Original provider identity changed during shutdown selection")
                os.killpg(local_pid, signal.SIGTERM)
                deadline = time.monotonic() + 60
                while alive(original) and time.monotonic() < deadline:
                    time.sleep(0.2)
                if alive(original):
                    raise RuntimeError("The retained provider is still closing; continue its same owned shutdown")
            if ready:
                path = Path(ready["run_directory"]) / "stopped.json"
                if not path.is_file():
                    raise RuntimeError("The ended provider lacks its original child-shutdown record; reconcile that same native provider before continuing")
                value = load_json(path)
                if value.get("state") != "STOPPED" or value.get("operation_id") != self.profile["operation_id"]:
                    raise ValueError("Original provider shutdown belongs to a different operation")
                stopped.append(path)
            self.event("prior_provider_shutdown_reconciled", identity=original,
                       ready_file=ready["ready_file"] if ready else None,
                       stopped_file=str(stopped[-1]) if ready else None)
        return stopped

    def bind_callback(self):
        identity_fields = ("api_base_url", "authorization_env", "engine_commit", "solr_journal")
        if self.callback_binding:
            original = self.callback_ready
            for key in identity_fields:
                if original[key] != self.ready[key]:
                    raise ValueError("The restarted upstream changed the original callback provider identity: " + key)
            if original["source_evidence"]["operation_directory"] != self.ready["source_evidence"]["operation_directory"]:
                raise ValueError("The restarted upstream uses a different source evidence journal")
            for key in ("runtime", "upstream_source"):
                prior = dict(load_json(Path(original[key])))
                current = dict(load_json(Path(self.ready[key])))
                prior.pop("observed_at", None)
                current.pop("observed_at", None)
                if prior != current:
                    raise ValueError("The restarted upstream changed original source/runtime selection: " + key)
            argv, cwd = self.expand(self.profile["callback"])
            if argv != self.callback_binding["argv"] or str(cwd) != self.callback_binding["cwd"]:
                raise ValueError("The resumed callback must keep its exact original argument vector")
            self.event("original_callback_selection_resumed", ready_file=original["ready_file"],
                       live_ready_file=self.ready["ready_file"], selection_sha256=sha(encoded(self.callback_binding)))
            return argv, cwd
        self.callback_ready = self.ready
        argv, cwd = self.expand(self.profile["callback"])
        value = {"schema": "commons.iati.dqa.callback-binding.v1", "selected_at": utc(),
                 "profile_sha256": self.profile_sha256, "argv": argv, "cwd": str(cwd),
                 "ready_file": self.ready["ready_file"], "ready_sha256": sha(regular(Path(self.ready["ready_file"]))),
                 "provider_file": self.ready["provider_input"], "assessments_file": self.ready["assessments_input"],
                 "receiver_operation_id": self.profile["callback"]["operation_id"]}
        write_new(self.directory / "callback-binding.json", encoded(value))
        self.callback_binding = value
        return argv, cwd

    def publish(self, stopped_file: Path) -> dict:
        receiver = self.verify_receiver_result()
        if receiver is None:
            raise RuntimeError("The original customer callback has no final result")
        stopped_value = load_json(stopped_file)
        if stopped_value.get("state") != "STOPPED" or stopped_value.get("operation_id") != self.profile["operation_id"]:
            raise ValueError("The original provider shutdown has a different identity")
        result = {"schema": "commons.iati.dqa.complete-upstream-result.v1", "status": "COMPLETE",
                  "operation_id": self.profile["operation_id"], "completed_at": utc(),
                  "profile_sha256": self.profile_sha256, "attempt_directory": str(self.attempt),
                  "engine_commit": ENGINE_COMMIT, "ready_file": self.callback_ready["ready_file"],
                  "live_ready_file": self.ready["ready_file"] if self.ready else None,
                  "upstream_stopped": file_observation(self.directory, stopped_file),
                  "receiver_result": file_observation(self.directory, self.directory / self.profile["callback"]["result_file"]),
                  "required_outputs": self.outputs(), "prior_commands": self.prior_commands,
                  "commands": [{"name": row["name"], "directory": str(row["directory"]),
                                "returncode": row["outcome"]["returncode"] if row["outcome"] else None} for row in self.children]}
        write_new(self.directory / "result.json", encoded(result))
        return result

    def run(self) -> dict:
        if self.original_result:
            return self.original_result
        prior_stopped = self.stop_prior_providers()
        receiver = self.verify_receiver_result()
        if receiver is not None:
            if not self.callback_binding or not prior_stopped:
                raise RuntimeError("The final callback result needs its original READY/shutdown binding")
            self.event("completed_callback_verified_without_replay", operation_id=receiver["operationId"])
            return self.publish(prior_stopped[0])
        repo, python = self.acquire_upstream()
        if self.profile.get("runtime_prepare"):
            argv, cwd = self.expand(self.profile["runtime_prepare"])
            self.command("runtime-prepare", argv, cwd)
            self.event("original_customer_runtime_preparation_complete")
        upstream_config = {"schema": "commons.iati.dqa.upstream.v1",
                           "operation_id": self.profile["operation_id"],
                           "directory": str(self.directory / "provider"),
                           "upstream_directory": str(repo), "python_executable": str(python),
                           "redis_executable": self.profile["redis_executable"],
                           "authorization_env": self.profile["authorization_env"],
                           "api_port": self.profile.get("api_port", 18766),
                           "redis_port": self.profile.get("redis_port", 18767),
                           "transport": self.profile.get("transport", {"schema": "commons.iati.dqa.public-solr.v1"})}
        if self.profile.get("redis_library_directory"):
            upstream_config["redis_library_directory"] = self.profile["redis_library_directory"]
        config_path = self.directory / "upstream-profile.json"
        write_new(config_path, encoded(upstream_config))
        upstream_script = str(Path(__file__).with_name("upstream.py").resolve())
        probe = json.loads(self.command("upstream-probe", [str(python), "-B", upstream_script, "probe", "--config", str(config_path)]))
        write_new(self.attempt / "probe.json", encoded(probe))
        self.stage = "provider"
        self.provider = self.start("upstream", [str(python), "-B", upstream_script, "serve", "--config", str(config_path)], repo)
        self.ready = self.wait_provider(self.provider)
        write_new(self.attempt / "ready-binding.json", encoded({
            "ready_file": self.ready["ready_file"], "sha256": sha(regular(Path(self.ready["ready_file"]))),
            "engine_commit": ENGINE_COMMIT, "operation_id": self.profile["operation_id"]}))
        self.event("original_upstream_ready", ready_file=self.ready["ready_file"])
        self.stage = "callback"
        argv, cwd = self.bind_callback()
        # The maintained receiver uses its original selection/progress/result and
        # request identities to resume, including an ended partially completed call.
        self.command("callback", argv, cwd, timeout=self.profile["callback_timeout_seconds"])
        if self.verify_receiver_result() is None:
            raise RuntimeError("The original callback exited without its complete native result")
        # Freeze callback success separately: a later shutdown/fsync failure must not replay the receiver.
        callback_success = {"at": utc(), "ready_file": self.ready["ready_file"], "required_outputs": self.outputs()}
        write_new(self.attempt / "callback-success.json", encoded(callback_success))
        self.event("customer_callback_complete", required_outputs=callback_success["required_outputs"])
        self.stage = "shutdown"
        stopped = self.stop(self.provider, timeout=60)
        stopped_file = Path(self.ready["run_directory"]) / "stopped.json"
        if stopped["returncode"] != 0 or not stopped_file.exists():
            raise RuntimeError("The provider's full owned shutdown needs reconciliation")
        stopped_value = load_json(stopped_file)
        if stopped_value.get("state") != "STOPPED" or stopped_value.get("operation_id") != self.profile["operation_id"]:
            raise ValueError("The provider shutdown record belongs to another operation")
        if any(alive(item["identity"]) for item in self.children):
            raise RuntimeError("A tracked original process remains alive after shutdown")
        return self.publish(stopped_file)

    def close(self):
        failures = []
        for child in reversed(self.children):
            try:
                self.stop(child, timeout=60 if child["name"] == "upstream" else 20)
            except Exception as error:
                failures.append({"name": child["name"], "error": type(error).__name__, "message": str(error)})
        if self.attempt:
            with contextlib.suppress(Exception):
                write_new(self.attempt / "parent-stopped.json", encoded({
                    "at": utc(), "cancelled": self.cancelled, "failures": failures,
                    "children": [{"name": row["name"], "identity": row["identity"],
                                  "returncode": row["process"].poll()} for row in self.children]}))
        os.close(self.lock)
        return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    args = parser.parse_args()
    operation = None
    try:
        operation = Complete(json.loads(regular(Path(args.profile))))
        def stopped(_number, _frame):
            operation.cancelled = True
        signal.signal(signal.SIGTERM, stopped)
        signal.signal(signal.SIGINT, stopped)
        result = operation.run()
        print(json.dumps(result), flush=True)
        return 0
    except BaseException as error:
        if isinstance(error, SystemExit):
            raise
        result = {"status": "INTERRUPTED" if isinstance(error, (InterruptedError, KeyboardInterrupt)) else "FAILED",
                  "error": type(error).__name__, "message": str(error)}
        if operation and operation.attempt:
            result.update({"at": utc(), "stage": operation.stage, "operation_id": operation.profile["operation_id"],
                           "attempt_directory": str(operation.attempt)})
            with contextlib.suppress(Exception):
                write_new(operation.attempt / "failure.json", encoded(result))
        print(json.dumps(result), flush=True)
        return 2
    finally:
        if operation:
            operation.close()


if __name__ == "__main__":
    raise SystemExit(main())
