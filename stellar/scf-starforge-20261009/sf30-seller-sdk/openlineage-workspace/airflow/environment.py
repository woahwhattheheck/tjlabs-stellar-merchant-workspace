#!/usr/bin/env python3
"""Inspect an installed Airflow/OpenLineage environment without emitting events.

Only named DAGs are inventoried. Configuration is resolved by the installed
provider; credentials and complete configuration values are never returned.
The original Airflow CLI supplies capabilities and optional DAG metadata.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import hashlib
import importlib.metadata as metadata
import io
import json
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit

SCHEMA = "commons.openlineage.airflow-environment.v1"
PROVIDER_VERSION = "2.20.2"
REQUIREMENTS = {
    "apache-airflow": "2.11.0",
    "apache-airflow-providers-openlineage": PROVIDER_VERSION,
    "apache-airflow-providers-common-compat": "1.15.0",
    "apache-airflow-providers-common-sql": "1.32.0",
    "openlineage-python": "1.52.0",
    "openlineage-integration-common": "1.52.0",
}
PRECEDENCE = ["config_conn_id", "config_path", "transport", "python-client"]
IDENTIFIER = re.compile(r"^[A-Za-z0-9_.:+-]{1,250}$")


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def json_document(raw):
    """Read one complete JSON document from native CLI output."""
    text = raw.decode("utf-8", "strict") if isinstance(raw, bytes) else raw
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Airflow may log before its JSON result. Require the JSON document to
        # consume the remainder, so a truncated/multiple result is not adopted.
        decoder = json.JSONDecoder()
        candidates = []
        for match in re.finditer(r"(?m)^[ \t]*[\[{]", text):
            start = match.start()
            try:
                value, length = decoder.raw_decode(text[start:].lstrip())
                consumed = start + len(text[start:]) - len(text[start:].lstrip()) + length
                if not text[consumed:].strip() and isinstance(value, (dict, list)):
                    candidates.append(value)
            except json.JSONDecodeError:
                continue
        if len(candidates) != 1:
            raise ValueError("Native CLI did not return one complete JSON document")
        return candidates[0]


def cli_capture(arguments, *, environment=None, timeout=30):
    """Use this interpreter's actual Airflow CLI and retain its complete bytes."""
    argv = [sys.executable, "-m", "airflow", *arguments]
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               env=environment, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
    return {"argv": argv, "exitCode": process.returncode, "timedOut": timed_out,
            "stdout": stdout, "stderr": stderr}


def capture_summary(result):
    return {"command": result["argv"], "exitCode": result["exitCode"],
            "timedOut": result["timedOut"],
            "stdout": {"bytes": len(result["stdout"]), "sha256": sha256(result["stdout"])},
            "stderr": {"bytes": len(result["stderr"]), "sha256": sha256(result["stderr"])}}


def clean_string(value, limit=2048):
    if not isinstance(value, str):
        return None
    return re.sub(r"[\x00-\x1f\x7f]", "", value)[:limit]


def public_url(value):
    """Drop URL credentials, query parameters and fragments."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        if not hostname:
            return None
        host = "[" + hostname + "]" if ":" in hostname else hostname
        if parsed.port is not None:
            host += ":" + str(parsed.port)
        if parsed.scheme not in ("http", "https"):
            return None
        return urlunsplit((parsed.scheme, host, parsed.path, "", ""))
    except ValueError:
        return None


def transport_summary(transport):
    if not isinstance(transport, dict):
        return {"configured": False}
    auth = transport.get("auth")
    result = {
        "configured": bool(transport),
        "type": clean_string(transport.get("type"), 100),
        "url": public_url(transport.get("url")),
        "endpoint": clean_string(urlsplit(str(transport.get("endpoint", ""))).path),
    }
    if isinstance(auth, dict):
        result["auth"] = {
            "type": clean_string(auth.get("type"), 100),
            "connectionId": clean_string(auth.get("conn_id"), 250),
            "credentialPresent": any(bool(auth.get(key)) for key in
                                     ("apiKey", "api_key", "password", "token")),
        }
    else:
        result["auth"] = {"type": None, "connectionId": None,
                          "credentialPresent": False}
    if isinstance(transport.get("headers"), dict):
        result["headerNames"] = sorted(clean_string(key, 100)
                                        for key in transport["headers"]
                                        if isinstance(key, str))
    for key in ("timeout", "verify", "compression", "retry", "retry_config"):
        value = transport.get(key)
        if isinstance(value, (bool, int, float)) or value is None:
            result[key] = value
        elif key == "compression" and value in ("gzip", "none"):
            result[key] = value
    if isinstance(transport.get("transports"), list):
        result["transports"] = [transport_summary(value)
                                 for value in transport["transports"]]
    return result


def version_at_least(value, minimum):
    if value is None:
        return False
    try:
        from packaging.version import Version
        return Version(value) >= Version(minimum)
    except (ImportError, ValueError):
        match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:\.post\d+)?", value)
        return bool(match and tuple(map(int, match.groups())) >=
                    tuple(map(int, minimum.split("."))))


def package_inventory():
    result = {}
    for name, minimum in REQUIREMENTS.items():
        try:
            version = metadata.version(name)
        except metadata.PackageNotFoundError:
            version = None
        accepted = (version == PROVIDER_VERSION if name ==
                    "apache-airflow-providers-openlineage"
                    else version_at_least(version, minimum))
        result[name] = {"installed": version is not None, "version": version,
                        "required": ("==" if name ==
                                     "apache-airflow-providers-openlineage"
                                     else ">=") + minimum,
                        "satisfies": accepted}
    return result


def provider_configuration():
    """Use original provider resolution, without constructing a client."""
    from airflow.providers.openlineage import conf
    from airflow.providers.openlineage.plugins.adapter import OpenLineageAdapter
    conn_id = conf.config_conn_id()
    config_path = conf.config_path(check_legacy_env_var=False)
    direct = conf.transport() if not conn_id and not config_path else {}
    selected = ("config_conn_id" if conn_id else "config_path" if config_path
                else "transport" if direct else "python-client")
    resolved = OpenLineageAdapter().get_openlineage_config()
    policy = conf.emission_policy()
    result = {
        "precedence": list(PRECEDENCE), "selectedSource": selected,
        "configConnId": clean_string(conn_id, 250),
        "configPath": clean_string(config_path),
        "namespace": clean_string(conf.namespace()),
        "disabled": bool(conf.is_disabled()),
        "selectiveEnable": bool(conf.selective_enable()),
        "disabledOperators": sorted(clean_string(value)
                                    for value in conf.disabled_operators()),
        "sourceCodeEnabled": bool(conf.is_source_enabled()),
        "emissionPolicy": {"rules": len(policy), "sha256": sha256(canonical_bytes(policy))},
        "transport": transport_summary((resolved or {}).get("transport")),
        "resolution": "provider" if resolved is not None else "python-client-fallback",
        "legacyEnvironmentNames": sorted(name for name, value in os.environ.items()
                                         if name.startswith("OPENLINEAGE_") and value),
    }
    if selected == "python-client":
        # The SDK owns its fallback resolution. Inspect presence and destination
        # metadata without instantiating a potentially custom transport.
        result["legacy"] = {
            "url": public_url(os.environ.get("OPENLINEAGE_URL")),
            "configPathPresent": bool(os.environ.get("OPENLINEAGE_CONFIG")),
            "apiKeyPresent": bool(os.environ.get("OPENLINEAGE_API_KEY")),
            "transportEnvironmentPresent": any(
                name.startswith("OPENLINEAGE__TRANSPORT") and bool(value)
                for name, value in os.environ.items()),
        }
    return result


def named_dag_inventory(dag_ids, timeout):
    entries = []
    for dag_id in dag_ids:
        if not IDENTIFIER.fullmatch(dag_id):
            raise ValueError("Invalid named DAG identifier")
        native = cli_capture(["dags", "details", dag_id, "--output", "json"],
                             timeout=timeout)
        entry = {"dagId": dag_id, "native": capture_summary(native), "found": False}
        if native["exitCode"] == 0:
            try:
                value = json_document(native["stdout"])
                rows = value if isinstance(value, list) else [value]
                matches = [row for row in rows if isinstance(row, dict) and
                           row.get("dag_id", row.get("dagId")) == dag_id]
                if len(matches) == 1:
                    row = matches[0]
                    entry["found"] = True
                    entry["metadata"] = {
                        key: row[key] for key in
                        ("dag_id", "dag_display_name", "fileloc", "is_paused",
                         "is_active", "has_import_errors", "max_active_runs",
                         "max_active_tasks", "timetable_description")
                        if key in row and isinstance(row[key], (str, bool, int, type(None)))
                    }
                    if isinstance(row.get("task_ids"), list):
                        entry["taskIds"] = [item for item in row["task_ids"]
                                            if isinstance(item, str) and
                                            IDENTIFIER.fullmatch(item)]
                else:
                    entry["resolution"] = "named-dag-not-returned"
            except (ValueError, UnicodeError):
                entry["resolution"] = "native-json-unavailable"
        entries.append(entry)
    return entries


def inspect_environment(dag_ids=(), timeout=30):
    packages = package_inventory()
    report = {
        "schema": SCHEMA, "observedAt": utc_now(),
        "python": {"executable": sys.executable, "version": platform.python_version(),
                   "implementation": platform.python_implementation()},
        "host": {"system": platform.system(), "machine": platform.machine()},
        "airflow": {"version": packages["apache-airflow"]["version"],
                    "command": [sys.executable, "-m", "airflow"]},
        "provider": {"version": packages["apache-airflow-providers-openlineage"]["version"]},
        "packages": packages, "capabilities": {}, "dags": [], "errors": [],
    }
    report["requirementsSatisfied"] = (os.name == "posix" and sys.version_info >= (3, 10) and
                                       all(item["satisfies"] for item in packages.values()))
    if not packages["apache-airflow"]["installed"]:
        return report
    output, errors = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
        if packages["apache-airflow-providers-openlineage"]["installed"]:
            try:
                report["provider"]["configuration"] = provider_configuration()
            except Exception as exc:
                report["errors"].append({"stage": "provider-configuration",
                                          "type": type(exc).__name__})
    report["configurationDiagnostics"] = {
        "stdoutBytes": len(output.getvalue().encode()),
        "stderrBytes": len(errors.getvalue().encode()),
    }
    try:
        test = cli_capture(["dags", "test", "--help"], timeout=timeout)
        runs = cli_capture(["dags", "list-runs", "--help"], timeout=timeout)
        test_help = test["stdout"].decode("utf-8", "replace")
        runs_help = runs["stdout"].decode("utf-8", "replace")
        report["capabilities"] = {
            "dagTest": test["exitCode"] == 0,
            "dagFileFlag": ("--dagfile-path" if "--dagfile-path" in test_help else
                            "--subdir" if "--subdir" in test_help else None),
            "bundleName": "--bundle-name" in test_help,
            "useExecutor": "--use-executor" in test_help,
            "listRuns": runs["exitCode"] == 0,
            "listRunsDagIdStyle": "option" if "--dag-id" in runs_help else "positional",
            "dagTestNative": capture_summary(test),
            "listRunsNative": capture_summary(runs),
        }
        if dag_ids:
            report["dags"] = named_dag_inventory(tuple(dict.fromkeys(dag_ids)), timeout)
    except Exception as exc:
        report["errors"].append({"stage": "native-cli-inspection",
                                  "type": type(exc).__name__})
    return report


def write_new_json(path, value):
    data = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(target, flags, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    return data


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dag-id", action="append", default=[],
                        help="Inspect this original named DAG; may be repeated.")
    parser.add_argument("--timeout", type=int, default=30,
                        help="Timeout for each read-only native CLI command.")
    parser.add_argument("--output", default="-",
                        help="New private JSON observation, or - for standard output.")
    args = parser.parse_args(argv)
    if not 1 <= args.timeout <= 300:
        parser.error("--timeout must be between1 and300 seconds")
    report = inspect_environment(args.dag_id, args.timeout)
    if args.output == "-":
        print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
    else:
        data = write_new_json(args.output, report)
        print(json.dumps({"schema": SCHEMA, "path": str(Path(args.output).absolute()),
                          "bytes": len(data), "sha256": sha256(data)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
