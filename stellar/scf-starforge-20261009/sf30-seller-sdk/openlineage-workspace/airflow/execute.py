#!/usr/bin/env python3
"""Commission original Airflow DAGs from an immutable reviewed plan.

Credentials enter through a named host environment variable. The installed
Airflow OpenLineage provider emits events. Complete native logs stay in the
private execution directory. Reopening receives the same worker and run.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit

from environment import (PROVIDER_VERSION, canonical_bytes, capture_summary,
                         cli_capture, json_document, public_url, sha256, utc_now)

PLAN_SCHEMA = "commons.openlineage.airflow-plan.v1"
SCHEMA = "commons.openlineage.airflow-execution.v1"
WORKER_SCHEMA = "commons.openlineage.airflow-native-worker.v1"
ID = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.:+-]{0,249}$")
ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SHA = re.compile(r"^[a-f0-9]{64}$")
SECRET_KEYS = {"apikey", "password", "token", "accesstoken", "refreshtoken",
               "secret", "clientsecret", "authorization", "privatekey"}


def private_directory(path):
    target = Path(path).absolute()
    if target.is_symlink():
        raise ValueError("Execution directory must be the original directory")
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = target.stat()
    if info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("Execution directory must be private to its owner")
    return target


def atomic_json(path, value):
    target = Path(path)
    data = json.dumps(value, ensure_ascii=False, indent=2,
                      allow_nan=False).encode("utf-8") + b"\n"
    descriptor, temporary = tempfile.mkstemp(prefix="." + target.name + "-",
                                              dir=target.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        directory = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {"path": str(target), "bytes": len(data), "sha256": sha256(data)}


def retain_bytes(path, data):
    target = Path(path)
    descriptor, temporary = tempfile.mkstemp(prefix="." + target.name + "-",
                                              dir=target.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, target, follow_symlinks=False)
        except FileExistsError:
            if target.is_symlink() or target.read_bytes() != data:
                raise ValueError("Original retained file changed: " + target.name)
        directory = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def read_json(path):
    return json.loads(Path(path).read_bytes())


def file_record(path):
    target = Path(path)
    digest = hashlib.sha256()
    length = 0
    with target.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            length += len(chunk)
            digest.update(chunk)
    return {"path": str(target), "bytes": length, "sha256": digest.hexdigest()}


def process_identity(pid):
    try:
        stat = Path("/proc", str(pid), "stat").read_text()
        tail = stat[stat.rfind(")") + 2:].split()
        return {"pid": pid, "startTicks": tail[19],
                "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
                "state": tail[0]}
    except (OSError, IndexError, ValueError):
        return None


def process_alive(identity):
    if not isinstance(identity, dict):
        return False
    current = process_identity(identity.get("pid"))
    return bool(current and current["state"] != "Z" and
                all(current[key] == identity.get(key)
                    for key in ("pid", "startTicks", "bootId")))


def reject_secrets(value):
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
            if normalized in SECRET_KEYS and item not in (None, ""):
                raise ValueError("Credentials belong in host inputs, not the reviewed plan")
            reject_secrets(item)
    elif isinstance(value, list):
        for item in value:
            reject_secrets(item)


def instant(value):
    if not isinstance(value, str) or not value:
        raise ValueError("Each DAG needs its explicit original logicalDate")
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Logical date needs its explicit timezone")
    return parsed.astimezone(dt.timezone.utc)


def validate_plan(plan):
    if not isinstance(plan, dict) or plan.get("schema") != PLAN_SCHEMA:
        raise ValueError("Original Airflow plan schema required")
    reject_secrets(plan)
    if not ID.fullmatch(str(plan.get("operationId", ""))):
        raise ValueError("Original operationId required")
    if plan.get("providerVersion") != PROVIDER_VERSION:
        raise ValueError("Reviewed provider must be 2.20.2")
    for key in ("airflowVersion", "pythonVersion", "namespace"):
        if not isinstance(plan.get(key), str) or not plan[key].strip():
            raise ValueError("Reviewed " + key + " required")
    if not SHA.fullmatch(str(plan.get("observationSha256", ""))):
        raise ValueError("Original observation SHA256 required")
    connection = plan.get("connection")
    if (not isinstance(connection, dict) or
            connection.get("schema") != "commons.openlineage.startup.v1" or
            not connection.get("workspaceId") or not connection.get("instanceId")):
        raise ValueError("Original collector startup identity required")
    configuration = plan.get("configuration")
    if not isinstance(configuration, dict) or configuration.get("mode") not in (
            "connection", "environment"):
        raise ValueError("Reviewed provider configuration mode required")
    transport = configuration.get("transport")
    if not isinstance(transport, dict) or transport.get("type") != "http":
        raise ValueError("Native HTTP provider transport required for this collector")
    parsed = urlsplit(str(transport.get("url", "")))
    collector = public_url(connection.get("url"))
    if (not public_url(transport.get("url")) or parsed.username or parsed.password or
            parsed.query or parsed.fragment or
            public_url(transport["url"]).rstrip("/") != (collector or "").rstrip("/")):
        raise ValueError("Transport must use the reviewed original collector URL")
    endpoint = urlsplit(str(transport.get("endpoint", "")))
    if endpoint.scheme or endpoint.netloc or endpoint.query or endpoint.fragment:
        raise ValueError("Transport endpoint must be the reviewed local URL path")
    if "headers" in transport:
        raise ValueError("Transport credentials use the original host auth input")
    auth = transport.get("auth")
    if auth is not None:
        if (not isinstance(auth, dict) or auth.get("type") not in
                ("api_key", "airflow_connection_api_key")):
            raise ValueError("Native API key or Airflow connection auth required")
        if set(auth) - {"type", "conn_id"}:
            raise ValueError("Public auth contains only its type and connection reference")
    if configuration["mode"] == "connection":
        if not ENV_NAME.fullmatch(str(configuration.get("connectionId", ""))):
            raise ValueError("Connection ID must map exactly to AIRFLOW_CONN_<ID>")
        if auth and auth.get("conn_id") not in (None, configuration["connectionId"]):
            raise ValueError("This installation uses the selected original connection")
    elif auth and auth.get("type") != "api_key":
        raise ValueError("Environment mode resolves its API key from the named host input")
    variables = configuration.get("environment", {})
    if not isinstance(variables, dict):
        raise ValueError("Reviewed provider environment must be a mapping")
    for name, value in variables.items():
        if (not re.fullmatch(r"AIRFLOW__OPENLINEAGE__[A-Z0-9_]+", name) or
                not isinstance(value, str) or "\0" in value):
            raise ValueError("Only reviewed OpenLineage provider environment is accepted")
        if name.endswith("__TRANSPORT") and value:
            reject_secrets(json.loads(value))
    if not isinstance(configuration.get("emissionPolicy", []), list):
        raise ValueError("Emission policy must be the native JSON rule array")
    if configuration.get("tokenEnv") and not ENV_NAME.fullmatch(configuration["tokenEnv"]):
        raise ValueError("tokenEnv is a host variable name")
    execution = plan.get("execution", {})
    if not isinstance(execution, dict) or execution.get("mode", "dag-test") != "dag-test":
        raise ValueError("This commissioning executes original native dags test")
    timeout = execution.get("timeoutSeconds", 1800)
    if isinstance(timeout, bool) or not isinstance(timeout, int) or timeout < 1:
        raise ValueError("Positive reviewed native timeout required")
    if not isinstance(execution.get("continueOnFailure", False), bool):
        raise ValueError("continueOnFailure must be an explicit boolean")
    dags = plan.get("dags")
    if not isinstance(dags, list) or not dags:
        raise ValueError("Original named DAG selections required")
    identities = set()
    for dag in dags:
        if not isinstance(dag, dict) or not ID.fullmatch(str(dag.get("dagId", ""))):
            raise ValueError("Original DAG identifier required")
        date = instant(dag.get("logicalDate"))
        identity = (dag["dagId"], date.isoformat())
        if identity in identities:
            raise ValueError("Repeated DAG/logical-date selection")
        identities.add(identity)
        if dag.get("runId") not in (None, ""):
            raise ValueError("dags test returns its original run ID; it has no run-id option")
        if dag.get("expectedTerminal") not in ("COMPLETE", "FAIL", "ABORT"):
            raise ValueError("Reviewed expected provider terminal event required")
        if dag.get("dagFilePath") and dag.get("bundleName"):
            raise ValueError("Choose the original DAG file or bundle")
        for key in ("dagFilePath", "bundleName"):
            if dag.get(key) is not None and (
                    not isinstance(dag[key], str) or not dag[key] or
                    re.search(r"[\x00-\x1f\x7f]", dag[key])):
                raise ValueError("Invalid original " + key)
        if dag.get("conf") is not None and not isinstance(dag["conf"], dict):
            raise ValueError("Original DAG conf must be a JSON object")
        if dag.get("taskIds") is not None and (
                not isinstance(dag["taskIds"], list) or
                any(not isinstance(item, str) or not ID.fullmatch(item)
                    for item in dag["taskIds"])):
            raise ValueError("Expected taskIds must name original tasks")
    return plan


def configured_environment(plan, token_env=None):
    configuration = plan["configuration"]
    environment = dict(os.environ)
    environment.update(configuration.get("environment", {}))
    environment["AIRFLOW__OPENLINEAGE__NAMESPACE"] = plan["namespace"]
    environment["AIRFLOW__OPENLINEAGE__DISABLED"] = "false"
    environment["OPENLINEAGE_DISABLED"] = "false"
    environment["AIRFLOW__OPENLINEAGE__CONFIG_PATH"] = ""
    environment["AIRFLOW__OPENLINEAGE__EMISSION_POLICY"] = json.dumps(
        configuration.get("emissionPolicy", []), ensure_ascii=False, separators=(",", ":"))
    transport = copy.deepcopy(configuration["transport"])
    selected_token_env = token_env or configuration.get("tokenEnv", "COMMONS_OPENLINEAGE_TOKEN")
    if not ENV_NAME.fullmatch(selected_token_env):
        raise ValueError("Select a valid original host token variable")
    token = environment.get(selected_token_env)
    if transport.get("auth") and (not token or re.search(r"[\x00-\x1f\x7f]", token)):
        raise ValueError("Original provider token is required in its named host variable")
    if configuration["mode"] == "connection":
        connection_id = configuration["connectionId"]
        environment["AIRFLOW__OPENLINEAGE__CONFIG_CONN_ID"] = connection_id
        environment["AIRFLOW__OPENLINEAGE__TRANSPORT"] = ""
        connection = {"conn_type": "generic", "extra": {"transport": transport}}
        if transport.get("auth"):
            transport["auth"] = {"type": "airflow_connection_api_key"}
            connection["password"] = token
        environment["AIRFLOW_CONN_" + connection_id.upper()] = json.dumps(
            connection, ensure_ascii=False, separators=(",", ":"))
    else:
        environment["AIRFLOW__OPENLINEAGE__CONFIG_CONN_ID"] = ""
        if transport.get("auth"):
            transport["auth"] = {"type": "api_key", "apiKey": token}
        environment["AIRFLOW__OPENLINEAGE__TRANSPORT"] = json.dumps(
            transport, ensure_ascii=False, separators=(",", ":"))
    return environment, selected_token_env


def configured_observation(plan, environment, directory):
    command = [sys.executable, str(Path(__file__).with_name("environment.py")),
               "--output", "-", "--timeout", "30"]
    native = subprocess.run(command, env=environment, capture_output=True, timeout=120)
    retain_bytes(directory / "configured-observation.stdout", native.stdout)
    retain_bytes(directory / "configured-observation.stderr", native.stderr)
    if native.returncode != 0:
        raise ValueError("Original configured environment inspection did not complete")
    observation = json_document(native.stdout)
    atomic_json(directory / "configured-observation.json", observation)
    if (observation.get("schema") != "commons.openlineage.airflow-environment.v1" or
            not observation.get("requirementsSatisfied") or
            observation["airflow"].get("version") != plan["airflowVersion"] or
            observation["python"].get("version") != plan["pythonVersion"]):
        raise ValueError("Installed native versions differ from the reviewed plan")
    configuration = observation.get("provider", {}).get("configuration", {})
    expected = plan["configuration"]
    source = "config_conn_id" if expected["mode"] == "connection" else "transport"
    actual = configuration.get("transport", {})
    wanted = expected["transport"]
    if (configuration.get("selectedSource") != source or configuration.get("disabled") or
            configuration.get("namespace") != plan["namespace"] or
            actual.get("type") != "http" or
            (actual.get("url") or "").rstrip("/") != public_url(wanted["url"]).rstrip("/") or
            (actual.get("endpoint") or "").lstrip("/") !=
            str(wanted.get("endpoint", "")).lstrip("/") or
            wanted.get("auth") and not actual.get("auth", {}).get("credentialPresent")):
        raise ValueError("Actual provider resolution differs from the reviewed collector")
    if not observation.get("capabilities", {}).get("dagTest"):
        raise ValueError("Original installed DAG command is unavailable")
    return observation


def dag_command(dag, observation):
    capabilities = observation["capabilities"]
    command = [sys.executable, "-m", "airflow", "dags", "test"]
    if dag.get("conf") is not None:
        command += ["--conf", json.dumps(dag["conf"], ensure_ascii=False, separators=(",", ":"))]
    if dag.get("dagFilePath"):
        if not capabilities.get("dagFileFlag"):
            raise ValueError("Installed CLI cannot select the original DAG file")
        source = Path(dag["dagFilePath"]).expanduser().resolve(strict=True)
        if not source.is_file():
            raise ValueError("Original DAG source must be a file")
        command += [capabilities["dagFileFlag"], str(source)]
    if dag.get("bundleName"):
        if not capabilities.get("bundleName"):
            raise ValueError("Installed CLI cannot select the original DAG bundle")
        command += ["--bundle-name", dag["bundleName"]]
    command += [dag["dagId"], dag["logicalDate"]]
    return command


def native_runs(dag, observation, environment, directory, edition):
    date = instant(dag["logicalDate"])
    arguments = ["dags", "list-runs"]
    if observation["capabilities"].get("listRunsDagIdStyle") == "option":
        arguments += ["--dag-id", dag["dagId"]]
    else:
        arguments += [dag["dagId"]]
    arguments += ["--output", "json",
                  "--start-date", (date.date() - dt.timedelta(days=1)).isoformat(),
                  "--end-date", (date.date() + dt.timedelta(days=2)).isoformat()]
    result = cli_capture(arguments, environment=environment, timeout=60)
    stdout = directory / (edition + ".stdout")
    stderr = directory / (edition + ".stderr")
    retain_bytes(stdout, result["stdout"])
    retain_bytes(stderr, result["stderr"])
    summary = capture_summary(result)
    summary["stdout"] = file_record(stdout)
    summary["stderr"] = file_record(stderr)
    if result["exitCode"] != 0:
        return {"native": summary, "resolved": False, "runs": []}
    try:
        value = json_document(result["stdout"])
        if isinstance(value, dict):
            value = value.get("dag_runs", value.get("dagRuns", value.get("items", [value])))
        if not isinstance(value, list):
            raise ValueError("Original native DagRun array required")
        rows = []
        for row in value:
            if not isinstance(row, dict):
                raise ValueError("Original native DagRun object required")
            if row.get("dag_id", dag["dagId"]) != dag["dagId"]:
                continue
            logical_date = row.get("logical_date", row.get("execution_date"))
            if not logical_date or instant(logical_date) != date:
                continue
            row_id = row.get("run_id")
            if not isinstance(row_id, str) or not row_id:
                raise ValueError("Native DagRun ID missing")
            rows.append({key: row[key] for key in
                         ("dag_id", "run_id", "state", "logical_date", "execution_date",
                          "start_date", "end_date", "run_type", "clear_number")
                         if key in row and isinstance(row[key], (str, int, type(None)))})
        return {"native": summary, "resolved": True, "runs": rows}
    except (ValueError, TypeError, UnicodeError):
        return {"native": summary, "resolved": False, "runs": []}


def worker(spec_path):
    spec_path = Path(spec_path).absolute()
    directory = private_directory(spec_path.parent)
    spec = read_json(spec_path)
    if spec.get("schema") != WORKER_SCHEMA:
        raise ValueError("Original native worker source required")
    raw = Path(spec["planPath"]).read_bytes()
    if sha256(raw) != spec["planSha256"]:
        raise ValueError("Original plan changed before worker receiving")
    plan = validate_plan(json.loads(raw))
    if plan["operationId"] != spec["operationId"]:
        raise ValueError("Original worker operation changed")
    dag = plan["dags"][spec["dagIndex"]]
    observation_file = spec["configuredObservation"]
    if file_record(observation_file["path"]) != observation_file:
        raise ValueError("Original configured observation changed")
    observation = read_json(observation_file["path"])
    command = dag_command(dag, observation)
    if command != spec["command"]:
        raise ValueError("Original reviewed DAG command changed")
    lock = os.open(directory / ".worker.lock",
                   os.O_WRONLY | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    result_path = directory / "native-process.json"
    if result_path.exists():
        prior = read_json(result_path)
        fcntl.flock(lock, fcntl.LOCK_UN)
        os.close(lock)
        if prior.get("phase") == "FINISHED":
            return 0
        raise ValueError("Receive the original native worker")
    record = {"schema": WORKER_SCHEMA, "operationId": plan["operationId"],
              "planSha256": spec["planSha256"], "dagIndex": spec["dagIndex"],
              "dagId": dag["dagId"], "logicalDate": dag["logicalDate"],
              "command": command, "worker": process_identity(os.getpid()),
              "startedAt": utc_now(), "phase": "STARTING"}
    atomic_json(result_path, record)
    process = None
    stdout_path, stderr_path = directory / "stdout.log", directory / "stderr.log"
    interrupted = {"signal": None}

    def forward_signal(signum, _frame):
        interrupted["signal"] = signum
        if process is not None and process.poll() is None:
            os.killpg(process.pid, signum)

    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, forward_signal)
    try:
        with stdout_path.open("xb") as stdout, stderr_path.open("xb") as stderr:
            os.chmod(stdout_path, 0o600)
            os.chmod(stderr_path, 0o600)
            if interrupted["signal"] is not None:
                raise InterruptedError("Native worker was interrupted before launch")
            process = subprocess.Popen(command, stdout=stdout, stderr=stderr,
                                       start_new_session=True)
            record.update({"phase": "RUNNING", "process": process_identity(process.pid),
                           "pid": process.pid})
            atomic_json(result_path, record)
            try:
                returncode = process.wait(timeout=plan.get("execution", {}).get(
                    "timeoutSeconds", 1800))
                record["timedOut"] = False
            except subprocess.TimeoutExpired:
                record["timedOut"] = True
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    returncode = process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    returncode = process.wait()
            stdout.flush()
            stderr.flush()
            os.fsync(stdout.fileno())
            os.fsync(stderr.fileno())
            record["exitCode"] = returncode
    except Exception as exc:
        record["error"] = {"type": type(exc).__name__}
        if process is not None and process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        record["exitCode"] = process.returncode if process is not None else None
    finally:
        record.update({"phase": "FINISHED", "finishedAt": utc_now(),
                       "receivedSignal": interrupted["signal"]})
        for key, path in (("stdout", stdout_path), ("stderr", stderr_path)):
            if path.exists():
                record[key] = file_record(path)
        atomic_json(result_path, record)
        fcntl.flock(lock, fcntl.LOCK_UN)
        os.close(lock)
    return 0


def receive_worker(directory, spec):
    received_path = directory / "native-run-receiving.json"
    if received_path.exists():
        received = read_json(received_path)
        if (received.get("planSha256") != spec["planSha256"] or
                received.get("operationId") != spec["operationId"] or
                received.get("dagIndex") != spec["dagIndex"] or
                received.get("phase") != "NATIVE_RUN_RECEIVED"):
            raise ValueError("Original native run receiving identity changed")
        for key in ("stdout", "stderr", "originalWorkerRecord"):
            original = received.get(key)
            if original and file_record(original["path"]) != original:
                raise ValueError("Original native run receiving source changed")
        return received
    path = directory / "native-process.json"
    if not path.exists():
        launch_path = directory / "worker-launch.json"
        if not launch_path.exists():
            return {"phase": "READY_TO_START", "retryableBeforeNativeLaunch": True}
        launch = read_json(launch_path)
        if (launch.get("planSha256") != spec["planSha256"] or
                launch.get("operationId") != spec["operationId"] or
                launch.get("dagIndex") != spec["dagIndex"]):
            raise ValueError("Original worker launch identity changed")
        attempts = launch.get("attempts", [])
        if not attempts:
            raise ValueError("Original worker launch attempt required")
        latest = attempts[-1]
        phase = latest.get("phase")
        base = {"launch": latest, "launchAttemptCount": len(attempts)}
        if phase in ("START_FAILED", "RETURNED"):
            for key in ("stdout", "stderr"):
                original = latest.get(key)
                if original and file_record(original["path"]) != original:
                    raise ValueError("Original worker startup " + key + " changed")
            return {**base, "phase": "STARTUP_ENDED",
                    "retryableBeforeNativeLaunch": True,
                    "receiving": "Original worker returned before recording a native DAG launch"}
        if process_alive(latest.get("worker")) or process_alive(latest.get("controller")):
            return {**base, "phase": "STARTUP_RECEIVING"}
        if phase == "STARTED" and latest.get("worker"):
            return {**base, "phase": "STARTUP_INTERRUPTED",
                    "retryableBeforeNativeLaunch": True,
                    "receiving": "Original worker ended before recording a native DAG launch"}
        return {**base, "phase": "STARTUP_RECONCILING",
                "receiving": "Receive the original launch attempt before another worker starts"}
    record = read_json(path)
    if (record.get("planSha256") != spec["planSha256"] or
            record.get("operationId") != spec["operationId"] or
            record.get("dagIndex") != spec["dagIndex"]):
        raise ValueError("Original worker identity changed")
    if record.get("phase") == "FINISHED":
        for key in ("stdout", "stderr"):
            original = record.get(key)
            if original and file_record(original["path"]) != original:
                raise ValueError("Original native " + key + " changed")
        return record
    if process_alive(record.get("worker")) or process_alive(record.get("process")):
        return record
    return {**record, "phase": "INTERRUPTED",
            "receiving": "Original worker ended before its complete return; retain native run and logs"}


def launch_worker(directory, spec_path, spec, environment):
    if (directory / "native-process.json").exists():
        return receive_worker(directory, spec)
    launch_path = directory / "worker-launch.json"
    launch = read_json(launch_path) if launch_path.exists() else {
        "schema": "commons.openlineage.airflow-worker-launch.v1",
        "operationId": spec["operationId"], "planSha256": spec["planSha256"],
        "dagIndex": spec["dagIndex"], "attempts": []}
    if (launch.get("planSha256") != spec["planSha256"] or
            launch.get("operationId") != spec["operationId"] or
            launch.get("dagIndex") != spec["dagIndex"]):
        raise ValueError("Original worker launch identity changed")
    attempt_directory = Path(tempfile.mkdtemp(prefix="worker-launch-", dir=directory))
    output_path, error_path = attempt_directory / "stdout.log", attempt_directory / "stderr.log"
    command = [sys.executable, str(Path(__file__).absolute()), "--_worker", str(spec_path)]
    attempt = {"number": len(launch["attempts"]) + 1, "phase": "STARTING",
               "startedAt": utc_now(), "controller": process_identity(os.getpid()),
               "command": command, "directory": str(attempt_directory)}
    launch["attempts"].append(attempt)
    atomic_json(launch_path, launch)
    child = None
    with output_path.open("xb") as output, error_path.open("xb") as error:
        os.chmod(output_path, 0o600)
        os.chmod(error_path, 0o600)
        try:
            child = subprocess.Popen(command, env=environment, stdout=output, stderr=error,
                                     start_new_session=True)
        except OSError as exc:
            attempt.update({"phase": "START_FAILED", "processCreated": False,
                            "error": {"type": type(exc).__name__, "errno": exc.errno}})
        else:
            attempt.update({"phase": "STARTED", "pid": child.pid,
                            "worker": process_identity(child.pid), "processCreated": True})
            atomic_json(launch_path, launch)
            prior_handlers = {}

            def forward_to_original_worker(signum, _frame):
                if child.poll() is None:
                    try:
                        os.killpg(child.pid, signum)
                    except ProcessLookupError:
                        pass

            for signum in (signal.SIGTERM, signal.SIGINT):
                prior_handlers[signum] = signal.signal(signum, forward_to_original_worker)
            try:
                returncode = child.wait()
                attempt.update({"phase": "RETURNED", "exitCode": returncode})
            finally:
                for signum, handler in prior_handlers.items():
                    signal.signal(signum, handler)
        output.flush()
        error.flush()
        os.fsync(output.fileno())
        os.fsync(error.fileno())
    attempt.update({"finishedAt": utc_now(), "stdout": file_record(output_path),
                    "stderr": file_record(error_path)})
    atomic_json(launch_path, launch)
    return receive_worker(directory, spec)

def reconcile_ended_worker(directory, spec, dag, observation, environment, native):
    receiving = Path(tempfile.mkdtemp(prefix="interruption-receiving-", dir=directory))
    after = native_runs(dag, observation, environment, receiving, "runs-after")
    rows = after["runs"]
    if not after["resolved"] or len(rows) != 1:
        return native, after
    row = rows[0]
    if row.get("state") not in ("success", "failed"):
        return {**native, "receivedNativeRun": row}, after
    received = {**native, "schema": WORKER_SCHEMA, "operationId": spec["operationId"],
                "planSha256": spec["planSha256"], "dagIndex": spec["dagIndex"],
                "dagId": dag["dagId"], "logicalDate": dag["logicalDate"],
                "phase": "NATIVE_RUN_RECEIVED", "receivedAt": utc_now(),
                "exitCode": native.get("exitCode"), "receivedNativeRun": row,
                "nativeQuery": after}
    for key, name in (("stdout", "stdout.log"), ("stderr", "stderr.log"),
                      ("originalWorkerRecord", "native-process.json")):
        path = directory / name
        if path.exists():
            received[key] = file_record(path)
    atomic_json(directory / "native-run-receiving.json", received)
    return received, after


def native_succeeded(native):
    return native.get("exitCode") == 0 or (
        native.get("phase") == "NATIVE_RUN_RECEIVED" and
        native.get("receivedNativeRun", {}).get("state") == "success")

def execute_plan(plan_path, expected_sha, output, *, token_env=None, receive_only=False):
    raw = Path(plan_path).read_bytes()
    if not SHA.fullmatch(expected_sha or "") or sha256(raw) != expected_sha:
        raise ValueError("Exact reviewed plan bytes and separate SHA256 required")
    plan = validate_plan(json.loads(raw))
    directory = private_directory(output)
    retain_bytes(directory / "plan.json", raw)
    lock = os.open(directory / ".execution.lock",
                   os.O_WRONLY | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(lock)
        existing = directory / "execution.json"
        return read_json(existing) if existing.exists() else {
            "schema": SCHEMA, "operationId": plan["operationId"],
            "planSha256": expected_sha, "phase": "ORIGINAL_CONTROLLER_RUNNING"}
    report_path = directory / "execution.json"
    report = read_json(report_path) if report_path.exists() else {
        "schema": SCHEMA, "operationId": plan["operationId"],
        "planSha256": expected_sha, "planPath": str(directory / "plan.json"),
        "startedAt": utc_now(), "phase": "PREPARING", "runs": [],
        "source": {"environment.py": file_record(Path(__file__).with_name("environment.py")),
                   "execute.py": file_record(__file__)},
    }
    if report.get("planSha256") != expected_sha or report.get("operationId") != plan["operationId"]:
        fcntl.flock(lock, fcntl.LOCK_UN)
        os.close(lock)
        raise ValueError("Original execution identity changed")
    environment = None
    try:
        for index, dag in enumerate(plan["dags"]):
            run_dir = private_directory(directory / ("dag-" + str(index + 1).zfill(3)))
            spec_path = run_dir / "worker-spec.json"
            while len(report["runs"]) <= index:
                report["runs"].append({"dagId": dag["dagId"],
                                       "logicalDate": dag["logicalDate"], "phase": "PENDING"})
            spec = read_json(spec_path) if spec_path.exists() else None
            launch_required = spec is None
            if spec is not None:
                if (spec.get("planSha256") != expected_sha or
                        spec.get("operationId") != plan["operationId"] or
                        spec.get("dagIndex") != index):
                    raise ValueError("Original worker specification changed")
                native = receive_worker(run_dir, spec)
                if native["phase"] in ("INTERRUPTED", "STARTUP_RECONCILING"):
                    if environment is None:
                        environment, _ = configured_environment(plan, token_env)
                    observation = read_json(spec["configuredObservation"]["path"])
                    native, after = reconcile_ended_worker(
                        run_dir, spec, dag, observation, environment, native)
                    report["runs"][index].setdefault("receivingAttempts", []).append(after)
                    report["runs"][index]["after"] = after
                    rows = after["runs"]
                    report["runs"][index]["runId"] = rows[0]["run_id"] if len(rows) == 1 else None
                    report["runs"][index]["nativeRunState"] = rows[0].get("state") if len(rows) == 1 else None
                    report["runs"][index]["expectedTerminal"] = dag["expectedTerminal"]
                    report["runs"][index]["expectedTaskIds"] = dag.get("taskIds", [])
                report["runs"][index]["nativeProcess"] = native
                report["runs"][index]["phase"] = native["phase"]
                launch_required = bool(native.get("retryableBeforeNativeLaunch"))
                if native["phase"] not in ("FINISHED", "NATIVE_RUN_RECEIVED") and (
                        receive_only or not launch_required):
                    report["phase"] = "RECEIVING"
                    atomic_json(report_path, report)
                    return report
            if launch_required and receive_only:
                report["phase"] = "RECEIVING"
                atomic_json(report_path, report)
                return report
            if launch_required:
                if environment is None:
                    environment, selected_token_env = configured_environment(plan, token_env)
                    report["configuration"] = {"mode": plan["configuration"]["mode"],
                                                "tokenEnv": selected_token_env,
                                                "credentialLocation": "original-host-environment"}
                preparation = Path(tempfile.mkdtemp(prefix="preparation-", dir=run_dir))
                report["runs"][index].setdefault("preparationPaths", []).append(str(preparation))
                atomic_json(report_path, report)
                observation = configured_observation(plan, environment, preparation)
                before = native_runs(dag, observation, environment, preparation, "runs-before")
                report["runs"][index]["before"] = before
                if not before["resolved"]:
                    report["runs"][index]["phase"] = "NATIVE_INVENTORY_UNAVAILABLE"
                    report["phase"] = "RECEIVING"
                    atomic_json(report_path, report)
                    return report
                if before["runs"]:
                    report["runs"][index].update({"phase": "EXISTING_ORIGINAL_RUN",
                                                  "originalRuns": before["runs"]})
                    report["phase"] = "RECEIVING"
                    atomic_json(report_path, report)
                    return report
                command = dag_command(dag, observation)
                if spec is None:
                    spec = {"schema": WORKER_SCHEMA, "operationId": plan["operationId"],
                            "planSha256": expected_sha, "planPath": str(directory / "plan.json"),
                            "dagIndex": index, "command": command,
                            "configuredObservation": file_record(preparation / "configured-observation.json"),
                            "createdAt": utc_now()}
                    retain_bytes(spec_path, canonical_bytes(spec) + b"\n")
                elif command != spec["command"]:
                    raise ValueError("Original native worker command changed before restart")
                report["runs"][index]["phase"] = "LAUNCHING"
                atomic_json(report_path, report)
                native = launch_worker(run_dir, spec_path, spec, environment)
                report["runs"][index]["nativeProcess"] = native
                report["runs"][index]["phase"] = native["phase"]
                if native["phase"] != "FINISHED":
                    report["phase"] = "RECEIVING"
                    atomic_json(report_path, report)
                    return report
            if (not report["runs"][index].get("after", {}).get("resolved") or
                    not report["runs"][index].get("runId")):
                if environment is None:
                    environment, _ = configured_environment(plan, token_env)
                observation = read_json(spec["configuredObservation"]["path"])
                receiving = Path(tempfile.mkdtemp(prefix="receiving-", dir=run_dir))
                after = native_runs(dag, observation, environment, receiving, "runs-after")
                report["runs"][index].setdefault("receivingAttempts", []).append(after)
                report["runs"][index]["after"] = after
                rows = after["runs"]
                report["runs"][index]["runId"] = rows[0]["run_id"] if len(rows) == 1 else None
                report["runs"][index]["nativeRunState"] = (
                    rows[0].get("state") if len(rows) == 1 else None)
                report["runs"][index]["expectedTerminal"] = dag["expectedTerminal"]
                report["runs"][index]["expectedTaskIds"] = dag.get("taskIds", [])
            atomic_json(report_path, report)
            native = report["runs"][index]["nativeProcess"]
            if (not native_succeeded(native) and not plan.get("execution", {}).get(
                    "continueOnFailure", False)):
                report["phase"] = "FINISHED"
                report["finishedAt"] = report.get("finishedAt") or utc_now()
                report["remainingDagCount"] = len(plan["dags"]) - index - 1
                report["runReceivingComplete"] = all(
                    item.get("after", {}).get("resolved") and item.get("runId")
                    for item in report["runs"])
                atomic_json(report_path, report)
                return report
        report["phase"] = "FINISHED"
        report["finishedAt"] = report.get("finishedAt") or utc_now()
        report["remainingDagCount"] = 0
        report["runReceivingComplete"] = all(
            item.get("after", {}).get("resolved") and item.get("runId")
            for item in report["runs"])
        atomic_json(report_path, report)
        return report
    except Exception as exc:
        report["phase"] = "RECEIVING"
        report["error"] = {"type": type(exc).__name__, "message": str(exc)}
        atomic_json(report_path, report)
        raise
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        os.close(lock)

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", help="The original reviewed plan.json")
    parser.add_argument("--plan-sha256", help="SHA256 of those exact reviewed bytes")
    parser.add_argument("--output", help="Original private execution directory")
    parser.add_argument("--token-env", help="Original host credential variable name")
    parser.add_argument("--receive", action="store_true",
                        help="Receive existing native workers and results without launching a DAG")
    parser.add_argument("--_worker", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    os.umask(0o077)
    if args._worker:
        return worker(args._worker)
    if not args.plan or not args.plan_sha256 or not args.output:
        parser.error("--plan, --plan-sha256 and --output are required")
    result = execute_plan(args.plan, args.plan_sha256, args.output,
                          token_env=args.token_env, receive_only=args.receive)
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    if result.get("phase") != "FINISHED":
        return 3
    return 0 if all(native_succeeded(item.get("nativeProcess", {}))
                    for item in result.get("runs", [])) else 1


if __name__ == "__main__":
    raise SystemExit(main())
