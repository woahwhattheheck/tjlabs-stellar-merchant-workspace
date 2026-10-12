#!/usr/bin/env python3
"""Run the pinned, unmodified DQA service with real public Solr data and owned Redis."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys
import time
import uuid

from public_solr_transport import (ENGINE_COMMIT, PYSOLR_COMMIT, UPSTREAM,
                                   checked_profile, encoded, load_json, private_directory,
                                   sha, utc, write_new, file_observation, sync_dir)

SCHEMA = "commons.iati.dqa.upstream.v1"

def command(argv: list[str], cwd: Path | None = None, env: dict | None = None) -> bytes:
    value = subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           check=False, timeout=30)
    if value.returncode:
        raise RuntimeError("Required native command failed (" + str(value.returncode) + "): " + argv[0])
    return value.stdout

def regular_bytes(file: Path, maximum: int = 8 * 1024 * 1024) -> bytes:
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or not 0 <= before.st_size <= maximum:
            raise ValueError("The selected source member exceeds its declared limit")
        value = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
                after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise ValueError("Selected original source changed while reading")
    return value

def source_inventory(upstream: Path, destination: Path) -> dict:
    if command(["git", "rev-parse", "--verify", "HEAD"], upstream).decode().strip() != ENGINE_COMMIT:
        raise ValueError("Use the exact original upstream commit " + ENGINE_COMMIT)
    selected = ["app", "data", "uv.lock", "pyproject.toml", "LICENSE.MD", "README.md",
                "Dockerfile", "docker-compose.yml"]
    rows = command(["git", "ls-tree", "-rz", "--full-tree", ENGINE_COMMIT, "--", *selected], upstream)
    files = []
    for row in rows.split(b"\0"):
        if not row:
            continue
        metadata, name = row.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split(" ")
        relative = name.decode("utf-8")
        if kind != "blob" or mode not in ("100644", "100755") or ".." in Path(relative).parts:
            raise ValueError("The selected upstream member is not an ordinary source file")
        body = regular_bytes(upstream / relative)
        actual = hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()
        if actual != blob:
            raise ValueError("Original engine/config source was modified: " + relative)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        write_new(target, body)
        files.append({"path": relative, "git_blob": blob, "sha256": sha(body), "bytes": len(body)})
    if not any(row["path"] == "app/main.py" for row in files) or not any(row["path"] == "uv.lock" for row in files):
        raise ValueError("The full original upstream source is missing")
    result = {"schema": "commons.iati.dqa.upstream-source.v1",
              "repository": "https://github.com/zimmerman-team/iati-cloud.dqa",
              "commit": ENGINE_COMMIT, "files": files, "observed_at": utc()}
    return result

def checked_config(value: dict) -> dict:
    allowed = {"schema", "operation_id", "directory", "upstream_directory", "python_executable",
               "redis_executable", "redis_library_directory", "authorization_env", "api_port", "redis_port", "transport"}
    if not isinstance(value, dict) or set(value) - allowed or value.get("schema") != SCHEMA:
        raise ValueError("Select the documented original upstream configuration")
    for key in ("operation_id", "directory", "upstream_directory", "python_executable",
                "redis_executable", "authorization_env"):
        if not isinstance(value.get(key), str) or not value[key]:
            raise ValueError("Supply " + key)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}", value["operation_id"]):
        raise ValueError("Retain one original upstream operation ID")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,127}", value["authorization_env"]):
        raise ValueError("Supply only the private authorization environment variable's name")
    for key in ("directory", "upstream_directory", "python_executable", "redis_executable"):
        if not Path(value[key]).is_absolute():
            raise ValueError("Use an absolute native path for " + key)
    if value.get("redis_library_directory") is not None and (
            not isinstance(value["redis_library_directory"], str) or not Path(value["redis_library_directory"]).is_absolute()):
        raise ValueError("Use an absolute original Redis shared-library directory")
    result = dict(value)
    result["api_port"] = value.get("api_port", 18766)
    result["redis_port"] = value.get("redis_port", 18767)
    result["transport"] = checked_profile(value.get("transport", {"schema": "commons.iati.dqa.public-solr.v1"}))
    for key in ("api_port", "redis_port"):
        if type(result[key]) is not int or not 1024 <= result[key] <= 65535:
            raise ValueError("Choose a valid local " + key)
    if len({result["api_port"], result["redis_port"], result["transport"]["listen_port"]}) != 3:
        raise ValueError("The three owned services need different loopback ports")
    return result


def redis_environment(config: dict) -> dict:
    env = dict(os.environ)
    selected = config.get("redis_library_directory")
    if selected:
        path = Path(selected)
        if not path.is_dir():
            raise ValueError("The selected original Redis shared libraries are unavailable")
        env["LD_LIBRARY_PATH"] = str(path) + (":" + env["LD_LIBRARY_PATH"] if env.get("LD_LIBRARY_PATH") else "")
    return env

def check_port(port: int):
    with socket.socket() as value:
        value.bind(("127.0.0.1", port))

def redis_ping(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5) as value:
            value.sendall(b"*1\r\n$4\r\nPING\r\n")
            return value.recv(128) == b"+PONG\r\n"
    except OSError:
        return False

def tcp_ready(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False

def health(port: int, secret: str):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
    try:
        conn.request("GET", "/dqa/health", headers={"Authorization": secret, "Accept-Encoding": "identity"})
        response = conn.getresponse()
        body = response.read(1024 * 1024 + 1)
        if len(body) > 1024 * 1024:
            raise ValueError("The native health response is unexpectedly large")
        result = {"status": response.status, "reason": response.reason,
                  "headers": response.getheaders(), "body_sha256": sha(body), "bytes": len(body),
                  "observed_at": utc()}
        value = json.loads(body)
        if response.status == 200 and value.get("status") == "healthy" and value.get("redis") == "connected":
            return result, body
    except (OSError, http.client.HTTPException, ValueError):
        return None
    finally:
        conn.close()
    return None

class Upstream:
    def __init__(self, config: dict):
        import fcntl
        self.config = config
        self.directory = private_directory(config["directory"])
        self.lock = os.open(self.directory / "upstream.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            os.close(self.lock)
            raise RuntimeError("This upstream operation already has a live owner")
        self.children = []
        self.files = []
        self.attempt = self.directory / "runs" / ("run-" + str(time.time_ns()) + "-" + uuid.uuid4().hex[:10])
        self.attempt.mkdir(parents=True, mode=0o700)
        write_new(self.directory / "configuration.json", encoded(config))

    def start(self, name: str, argv: list[str], *, cwd: Path | None = None, env: dict | None = None):
        for suffix in ("stdout", "stderr"):
            self.files.append((self.attempt / (name + "." + suffix)).open("xb"))
        child = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                 stdout=self.files[-2], stderr=self.files[-1], start_new_session=True)
        self.children.append((name, child))
        write_new(self.attempt / (name + ".process.json"), encoded({
            "started_at": utc(), "pid": child.pid, "argv": argv,
            "cwd": str(cwd) if cwd else None, "environment_values_retained": False}))
        return child

    def wait_ready(self, predicate, name: str, seconds: int = 30):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self.check_children()
            value = predicate()
            if value:
                return value
            time.sleep(0.2)
        raise RuntimeError("The actual " + name + " did not become ready; original logs are retained")

    def check_children(self):
        for name, child in self.children:
            if child.poll() is not None:
                raise RuntimeError("Owned " + name + " exited with " + str(child.returncode))

    def run(self):
        config = self.config
        secret = os.environ.get(config["authorization_env"], "")
        if not secret or "\r" in secret or "\n" in secret:
            raise ValueError("Supply the local service key in " + config["authorization_env"])
        upstream = Path(config["upstream_directory"]).resolve(strict=True)
        # Keep the selected venv path: resolving its Python symlink would discard its environment.
        python = str(Path(config["python_executable"]))
        if not Path(python).is_file() or not os.access(python, os.X_OK):
            raise ValueError("Choose the actual executable from the frozen upstream environment")
        # Redis packages may use a multicall symlink whose argv[0] selects server mode.
        redis = str(Path(config["redis_executable"]))
        if not Path(redis).is_file() or not os.access(redis, os.X_OK):
            raise ValueError("Choose the actual installed Redis server invocation")
        for port in (config["api_port"], config["redis_port"], config["transport"]["listen_port"]):
            check_port(port)
        source = source_inventory(upstream, self.directory / "source" / "upstream")
        # The timestamp is an observation, so each actual start retains its own source census.
        write_new(self.attempt / "upstream-source.json", encoded(source))
        env = dict(os.environ)
        env.update({"SECRET_KEY": secret, "SOLR_URL": f"http://127.0.0.1:{config['transport']['listen_port']}/solr/activity",
                    "REDIS_URL": f"redis://127.0.0.1:{config['redis_port']}/0",
                    "CACHE_TTL": "86400", "FLASK_DEBUG": "0", "PYTHONUNBUFFERED": "1",
                    "PYTHONDONTWRITEBYTECODE": "1", "TZ": "UTC"})
        runtime_code = (
            "import sys,json,hashlib,importlib.metadata as m,pysolr;"
            "from app.config import settings;"
            "v=settings.model_dump();v.pop('secret_key',None);"
            "fy=settings.get_current_financial_year();"
            "print(json.dumps({'python':sys.version,'executable':sys.executable,"
            "'packages':{n:m.version(n) for n in ['pysolr','flask','redis','pydantic','pydantic-settings']},"
            "'pysolr_file_sha256':hashlib.sha256(open(pysolr.__file__,'rb').read()).hexdigest(),"
            "'settings':v,'financial_year':[x.isoformat() for x in fy]},default=str))"
        )
        runtime = json.loads(command([python, "-B", "-c", runtime_code], upstream, env))
        if runtime["packages"]["pysolr"] != "3.11.0":
            raise ValueError("Use pysolr 3.11.0 from the original frozen uv.lock")
        redis_env = redis_environment(config)
        runtime.update({"redis_version": command([redis, "--version"], env=redis_env).decode().strip(),
                        "redis_executable": redis, "redis_binary": {"resolved_path": str(Path(redis).resolve()), **file_observation(Path(redis).resolve().parent, Path(redis).resolve())},
                        "redis_library_directory": config.get("redis_library_directory"),
                        "pysolr_source_commit": PYSOLR_COMMIT, "observed_at": utc()})
        write_new(self.attempt / "runtime.json", encoded(runtime))
        transport_profile = self.directory / "transport-profile.json"
        write_new(transport_profile, encoded(config["transport"]))
        redis_directory = private_directory(self.directory / "redis")
        self.start("redis", [redis, "--bind", "127.0.0.1", "--port", str(config["redis_port"]),
                           "--daemonize", "no", "--dir", str(redis_directory),
                           "--dbfilename", "dump.rdb", "--appendonly", "yes",
                           "--appenddirname", "appendonlydir"], env=redis_env)
        self.wait_ready(lambda: redis_ping(config["redis_port"]), "owned Redis")
        journal = self.directory / "solr-journal"
        old_exchange_ids = sorted(p.name for p in (journal / "exchanges").iterdir()) if (journal / "exchanges").exists() else []
        self.start("solr-transport", [python, "-B", str(Path(__file__).with_name("public_solr_transport.py").resolve()),
                                     "--profile", str(transport_profile), "--journal", str(journal)])
        self.wait_ready(lambda: tcp_ready(config["transport"]["listen_port"]), "public Solr transport")
        self.start("dqa", [python, "-B", "-m", "flask", "--app", "app.main:app", "run",
                           "--host", "127.0.0.1", "--port", str(config["api_port"]),
                           "--no-reload", "--no-debugger"], cwd=upstream, env=env)
        response, body = self.wait_ready(lambda: health(config["api_port"], secret), "original DQA API", 45)
        write_new(self.attempt / "native-health.body.json", body)
        write_new(self.attempt / "native-health.response.json", encoded(response))
        exchanges = []
        for folder in sorted((journal / "exchanges").iterdir()):
            if not folder.is_dir() or folder.name in old_exchange_ids:
                continue
            request_file, response_file = folder / "request.json", folder / "response.json"
            if request_file.exists() and response_file.exists():
                request, received = load_json(request_file), load_json(response_file)
                if request["route"] == "native-public-query-health" and received["status"] == 200 \
                        and received.get("complete_http") and received.get("solr", {}).get("header_status") == 0:
                    exchanges.append(folder.name)
        if not exchanges:
            raise RuntimeError("No actual successful public Solr startup reply was retained")
        self.check_children()
        ready = {"schema": "commons.iati.dqa.upstream-ready.v1", "state": "READY",
                 "operation_id": config["operation_id"], "ready_at": utc(),
                 "api_base_url": f"http://127.0.0.1:{config['api_port']}",
                 "authorization_env": config["authorization_env"], "engine_commit": ENGINE_COMMIT,
                 "upstream_source": str(self.attempt / "upstream-source.json"),
                 "runtime": str(self.attempt / "runtime.json"), "solr_journal": str(journal),
                 "startup_source_exchanges": exchanges, "run_directory": str(self.attempt),
                 "source_evidence": {"schema": "commons.iati.dqa.source-evidence-contract.v1",
                     "operation_directory": str(self.directory), "exchange_directory": str(journal / "exchanges"),
                     "excluded_prior_exchange_ids": old_exchange_ids, "closure_file": "closed.json",
                     "export_argv": [python, "-B", str(Path(__file__).resolve()), "evidence",
                                     "--ready", str(self.attempt / "ready.json"), "--output", "ABS_OUTPUT_DIRECTORY"]},
                 "owned_pids": {name: child.pid for name, child in self.children}}
        provider = {"schema": "commons.iati.dqa.upstream-provider-input.v1",
                    "name": "Zimmerman original DQA with public IATI.cloud source",
                    "api_base_url": ready["api_base_url"], "authorization_env": config["authorization_env"],
                    "engine_repository": "https://github.com/zimmerman-team/iati-cloud.dqa",
                    "engine_commit": ENGINE_COMMIT, "source_evidence": ready["source_evidence"],
                    "runtime": ready["runtime"], "upstream_source": ready["upstream_source"]}
        provider_file = self.attempt / "provider.json"
        requests_file = self.attempt / "assessment-requests.json"
        write_new(provider_file, encoded(provider))
        write_new(requests_file, regular_bytes(Path(__file__).with_name("assessment-requests.json")))
        ready["provider_input"] = str(provider_file)
        ready["assessments_input"] = str(requests_file)
        ready["ready_file"] = str(self.attempt / "ready.json")
        write_new(self.attempt / "ready.json", encoded(ready))
        print(json.dumps(ready), flush=True)
        while True:
            self.check_children()
            time.sleep(0.25)

    def close(self, reason: str):
        outcomes = []
        for name, child in reversed(self.children):
            if child.poll() is None:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    with contextlib.suppress(ProcessLookupError):
                        os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
            outcomes.append({"name": name, "pid": child.pid, "returncode": child.returncode})
        for stream in self.files:
            stream.flush()
            os.fsync(stream.fileno())
            stream.close()
        with contextlib.suppress(Exception):
            write_new(self.attempt / "stopped.json", encoded({
                "schema": "commons.iati.dqa.upstream-stopped.v1", "state": "STOPPED",
                "operation_id": self.config["operation_id"], "stopped_at": utc(),
                "reason": reason, "children": outcomes}))
        os.close(self.lock)
        print(json.dumps({"state": "STOPPED", "operation_id": self.config["operation_id"],
                          "run_directory": str(self.attempt), "children": outcomes}), flush=True)


def copy_verified(source: Path, destination: Path, expected: dict) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = destination.with_name(destination.name + "." + uuid.uuid4().hex + ".partial")
    descriptor = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    target = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    digest, count = hashlib.sha256(), 0
    try:
        with os.fdopen(descriptor, "rb") as incoming, os.fdopen(target, "wb") as outgoing:
            before = os.fstat(incoming.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise ValueError("Original source evidence must be a regular file")
            while chunk := incoming.read(1024 * 1024):
                outgoing.write(chunk)
                digest.update(chunk)
                count += len(chunk)
            after = os.fstat(incoming.fileno())
            if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
                    after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                raise ValueError("Original source evidence changed during receiving")
            if count != expected["bytes"] or digest.hexdigest() != expected["sha256"]:
                raise ValueError("Original source evidence does not match its retained manifest")
            outgoing.flush()
            os.fsync(outgoing.fileno())
        try:
            os.link(temporary, destination, follow_symlinks=False)
        except FileExistsError:
            actual = file_observation(destination.parent, destination)
            if actual["bytes"] != count or actual["sha256"] != digest.hexdigest():
                raise ValueError("A different evidence file already occupies this receiving path")
        sync_dir(destination.parent)
    finally:
        temporary.unlink(missing_ok=True)
    return {"bytes": count, "sha256": digest.hexdigest()}

def source_evidence(ready_file: Path, output: Path, after_file: Path | None = None) -> dict:
    """Freeze one explicit interval of real source exchanges; make retries idempotent."""
    ready_file = ready_file.resolve(strict=True)
    ready_bytes = regular_bytes(ready_file)
    ready = json.loads(ready_bytes)
    if ready.get("schema") != "commons.iati.dqa.upstream-ready.v1" or ready.get("state") != "READY":
        raise ValueError("Select the original successful upstream READY record")
    contract = ready["source_evidence"]
    operation_directory = Path(contract["operation_directory"]).resolve(strict=True)
    journal = Path(ready["solr_journal"]).resolve(strict=True)
    if ready_file != Path(ready["run_directory"]) / "ready.json" or operation_directory not in ready_file.parents:
        raise ValueError("READY does not belong to the selected native upstream operation")
    output = private_directory(output)
    original_after = None
    if after_file:
        original_after = regular_bytes(after_file.resolve(strict=True))
        previous = json.loads(original_after)
        if previous.get("schema") != "commons.iati.dqa.source-evidence.v1" or previous.get("ready_sha256") != sha(ready_bytes):
            raise ValueError("The prior evidence belongs to a different upstream READY record")
    else:
        previous = {}
    excluded = sorted(set(contract["excluded_prior_exchange_ids"]) |
                      set(previous.get("excluded_exchange_ids", [])) |
                      set(previous.get("exchange_ids", [])))
    selection_file = output / "selection.json"
    if selection_file.exists():
        selection = load_json(selection_file)
        if selection.get("ready_sha256") != sha(ready_bytes) or selection.get("after_evidence_sha256") != (
                sha(original_after) if original_after else None):
            raise ValueError("This evidence output already belongs to a different source interval")
    else:
        ids = sorted(p.name for p in (journal / "exchanges").iterdir()
                     if p.name not in excluded)
        if not ids:
            raise ValueError("No new original source exchange is present for this capture")
        for name in ids:
            if not (journal / "exchanges" / name / "closed.json").is_file():
                raise RuntimeError("A selected source exchange has not closed; finish the original capture before export")
        selection = {"schema": "commons.iati.dqa.source-selection.v1", "selected_at": utc(),
                     "ready_sha256": sha(ready_bytes), "after_evidence_sha256": sha(original_after) if original_after else None,
                     "exchange_ids": ids, "excluded_exchange_ids": excluded}
        write_new(selection_file, encoded(selection))
    manifest_file = output / "manifest.json"
    if manifest_file.exists():
        retained = load_json(manifest_file, 8 * 1024 * 1024)
        if retained.get("selection_sha256") != sha(regular_bytes(selection_file)):
            raise ValueError("The existing evidence manifest does not match its selected interval")
        for row in retained["files"]:
            actual = file_observation(output, output / row["path"])
            if actual != row:
                raise ValueError("A previously received source member no longer matches: " + row["path"])
        return retained

    files, observations, failures = [], [], []
    def add(original: Path, relative: str, expected: dict | None = None):
        path = Path(relative)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("Source evidence requires a safe relative member")
        descriptor = expected or file_observation(original.parent, original)
        measured = copy_verified(original, output / path, descriptor)
        files.append({"path": str(path), **measured})

    add(ready_file, "context/ready.json")
    add(Path(ready["runtime"]), "context/runtime.json")
    add(Path(ready["upstream_source"]), "context/upstream-source.json")
    add(journal / "transport.json", "context/transport.json")
    if original_after is not None:
        write_new(output / "previous-evidence.json", original_after)
        files.append(file_observation(output, output / "previous-evidence.json"))
    source = load_json(Path(ready["upstream_source"]), 8 * 1024 * 1024)
    for row in source["files"]:
        add(operation_directory / "source" / "upstream" / row["path"], "upstream/" + row["path"], row)
    from urllib.parse import parse_qs, urlsplit
    for name in selection["exchange_ids"]:
        if not re.fullmatch(r"exchange-[0-9]+-[a-f0-9]{12}", name):
            raise ValueError("Select an original closed source exchange ID")
        folder = journal / "exchanges" / name
        closure = load_json(folder / "closed.json")
        if closure.get("schema") != "commons.iati.dqa.solr-closed-exchange.v1":
            raise ValueError("The selected source exchange lacks its original closure")
        for row in closure["files"]:
            if Path(row["path"]).name != row["path"]:
                raise ValueError("Original exchange evidence members must be direct files")
            add(folder / row["path"], "solr/exchanges/" + name + "/" + row["path"], row)
        add(folder / "closed.json", "solr/exchanges/" + name + "/closed.json")
        request = load_json(folder / "request.json")
        response = load_json(folder / "response.json") if (folder / "response.json").exists() else {}
        details = response.get("solr", {})
        fields = parse_qs(urlsplit(request["incoming_target"]).query, keep_blank_values=True)
        if request["method"] == "POST":
            for key, values in parse_qs(regular_bytes(folder / "request.body", 16 * 1024 * 1024).decode(),
                                       keep_blank_values=True).items():
                fields.setdefault(key, []).extend(values)
        ok = (response.get("status") == 200 and response.get("complete_http") is True
              and details.get("header_status") == 0 and details.get("solr_response") is True
              and details.get("partial_results") in (None, False, "false")
              and details.get("num_found_exact") is not False
              and (folder / "delivery.json").is_file() and not (folder / "error.json").exists()
              and not (folder / "client-disconnected.json").exists())
        if request["route"] == "unchanged-native-search":
            ok = ok and details.get("start") == 0 and type(details.get("num_found")) is int \
                and details.get("returned_docs") == details["num_found"]
        item = {"exchange_id": name, "route": request["route"], "method": request["method"],
                "started_at": request["started_at"], "closed_at": closure["closed_at"],
                "upstream_url": request["upstream_url"], "request_fields": fields,
                "status": response.get("status"), "source_complete": bool(ok), "solr": details}
        observations.append(item)
        if not ok:
            failures.append({"exchange_id": name, "reason": "The actual source request was incomplete, failed, or not delivered"})
    files.append(file_observation(output, selection_file))
    result = {"schema": "commons.iati.dqa.source-evidence.v1",
              "status": "SOURCE_ERRORS" if failures else "COMPLETE", "created_at": utc(),
              "operation_id": ready["operation_id"], "ready_sha256": sha(ready_bytes),
              "selection_sha256": sha(regular_bytes(selection_file)), "engine_commit": ENGINE_COMMIT,
              "pysolr_commit": PYSOLR_COMMIT, "public_source": UPSTREAM,
              "exchange_ids": selection["exchange_ids"], "excluded_exchange_ids": selection["excluded_exchange_ids"],
              "files": sorted(files, key=lambda row: row["path"]), "observations": observations,
              "successful_searches": sum(x["route"] == "unchanged-native-search" and x["source_complete"] for x in observations),
              "failures": failures}
    write_new(manifest_file, encoded(result))
    return result



def probe(config: dict) -> dict:
    """Observe the selected existing runtime and source without starting services or installing."""
    python = Path(config["python_executable"])
    upstream = Path(config["upstream_directory"])
    redis = Path(config["redis_executable"])
    result = {"schema": "commons.iati.dqa.upstream-probe.v1", "observed_at": utc(),
              "python_executable": str(python), "upstream_directory": str(upstream),
              "redis_executable": str(redis), "required_engine_commit": ENGINE_COMMIT}
    missing = []
    if python.is_file() and os.access(python, os.X_OK):
        code = ("import sys,json,importlib.util as u,importlib.metadata as m;"
                "required=['flask','flask_cors','flasgger','pydantic','pydantic_settings','pysolr','redis','dotenv'];"
                "mods={n:(str(u.find_spec(n).origin) if u.find_spec(n) else None) for n in required+['flask_smorest']};"
                "versions={};"
                "print(json.dumps({'python':sys.version,'executable':sys.executable,'modules':mods,"
                "'pysolr_version':m.version('pysolr') if mods['pysolr'] else None,"
                "'required_modules':required}))")
        result["runtime"] = json.loads(command([str(python), "-B", "-c", code]))
        missing.extend("module:" + n for n in result["runtime"]["required_modules"] if not result["runtime"]["modules"][n])
        if result["runtime"]["pysolr_version"] != "3.11.0":
            missing.append("pinned-pysolr-3.11.0")
    else:
        missing.append("selected-python-executable")
    if redis.is_file() and os.access(redis, os.X_OK):
        result["redis_version"] = command([str(redis), "--version"], env=redis_environment(config)).decode().strip()
    else:
        missing.append("selected-redis-executable")
    if upstream.is_dir():
        try:
            result["source_commit"] = command(["git", "rev-parse", "--verify", "HEAD"], upstream).decode().strip()
        except (RuntimeError, subprocess.TimeoutExpired):
            result["source_commit"] = None
        if result["source_commit"] != ENGINE_COMMIT:
            missing.append("original-upstream-commit")
    else:
        missing.append("original-upstream-directory")
    result["missing"] = missing
    result["status"] = "AVAILABLE" if not missing else "NEEDS_EXISTING_RUNTIME_OR_SETUP"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["serve", "evidence", "probe"])
    parser.add_argument("--config")
    parser.add_argument("--ready")
    parser.add_argument("--output")
    parser.add_argument("--after-evidence")
    args = parser.parse_args()
    if args.command == "evidence":
        if not args.ready or not args.output or args.config:
            parser.error("evidence needs --ready and --output, with optional --after-evidence")
        result = source_evidence(Path(args.ready), Path(args.output),
                                 Path(args.after_evidence) if args.after_evidence else None)
        print(json.dumps({"status": result["status"], "manifest": str(Path(args.output).absolute() / "manifest.json"),
                          "operation_id": result["operation_id"], "exchanges": len(result["exchange_ids"]),
                          "successful_searches": result["successful_searches"], "failures": result["failures"]}), flush=True)
        raise SystemExit(0 if result["status"] == "COMPLETE" else 2)
    if not args.config or args.ready or args.output or args.after_evidence:
        parser.error("serve needs only --config")
    config = checked_config(load_json(Path(args.config)))
    if args.command == "probe":
        result = probe(config)
        print(json.dumps(result), flush=True)
        raise SystemExit(0 if result["status"] == "AVAILABLE" else 2)
    service = Upstream(config)
    reason = "requested-stop"
    code = 0
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        service.run()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        reason, code = type(error).__name__, 1
        write_new(service.attempt / "failure.json", encoded({
            "at": utc(), "type": type(error).__name__, "message": str(error)}))
        print(json.dumps({"state": "FAILED", "error": str(error), "run_directory": str(service.attempt)}), flush=True)
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        service.close(reason)
    raise SystemExit(code)

if __name__ == "__main__":
    main()
