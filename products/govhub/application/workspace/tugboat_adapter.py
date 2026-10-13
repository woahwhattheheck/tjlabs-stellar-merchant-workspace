"""Original Tugboat v3 preview lifecycle inside the GovHub native operator.

Copyright 2026 Token Junkie Labs contributors. Apache-2.0, see ../LICENSE.
The original provider OpenAPI and license are retained in native/tugboat/.
Every mutation has one retained dispatch; accepted jobs continue by their native ID.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib import error, parse, request

VERSION = "govhub-tugboat/v1"
API_BASE = "https://api.tugboatqa.com/v3"
SPEC_COMMIT = "56e79dd90a8186238738f34ad5a39f5a7e2a66df"
SPEC_BLOB = "b87bf3ce52c8735a99dd2cef2f5927c31b33c27b"
RUNTIME_FIELDS = {"site_root", "git_path", "access_token_env"}
ACTIONS = {"create", "rebuild", "refresh", "start", "stop"}
TERMINAL = {"success", "error", "cancelled"}


def _api():
    import native_adapter
    return native_adapter


def _identity(value, label):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9]{24}", value):
        raise ValueError("Select the original 24-character Tugboat " + label + ".")
    return value


def _bool(value, label):
    if type(value) is not bool:
        raise ValueError(label + " must be a boolean.")
    return value


def provider_schema():
    def field(name, label, required=False, **extra):
        return {"name": name, "label": label, "type": "text", "required": required, **extra}
    return {"value": "tugboat", "label": "Tugboat / original preview and job API", "fields": [
        field("environment_id", "Project ID / repository ID", True,
              help="Join the two actual Tugboat IDs with /. This is the environment record's exact resource reference."),
        field("access_token_env", "Existing API-key environment variable", True,
              help="Variable name only. Its existing native token stays on the selected host."),
        field("site_root", "Original local Git project root", True,
              help="The existing repository whose complete source is included in the customer handover."),
        field("git_path", "Existing Git executable", help="Absolute executable path, or leave empty to resolve Git."),
        field("source_revision", "Reviewed source commit",
              help="Full original commit ID. Required for creating a preview; capture can first discover HEAD."),
        field("preview_id", "Selected native preview ID",
              help="Required for rebuild, refresh, start or stop. Select its ID from the actual repository census."),
        field("base_preview_id", "Selected original base preview",
              help="An exact preview ID in this repository, or none. Create never expands implicit multiple bases."),
        field("config_json", "Reviewed preview configuration JSON", type="textarea", max_length=1000000,
              help="Optional original services configuration. Leave empty to use the selected commit's native .tugboat/config.yml."),
        field("expected_config_sha256", "Reviewed configuration SHA-256",
              help="Capture reports this hash; creating a preview requires the exact original configuration."),
        field("children", "Include child previews in rebuild or refresh", type="boolean", default=False),
        field("force", "Use the provider's explicit force option", type="boolean", default=False),
        field("timeout_seconds", "Native request timeout, seconds", type="integer", default=120, minimum=10, maximum=7200),
        field("max_artifact_bytes", "Maximum individual retained artifact bytes", type="integer",
              default=1073741824, minimum=1048576),
    ]}


def profile(config, runtime_bindings=None):
    if not isinstance(config, dict) or config.get("source_kind") != "tugboat":
        raise ValueError("Select the Tugboat native profile.")
    allowed = {"source_kind", "target_fingerprint"} | {f["name"] for f in provider_schema()["fields"]}
    if set(config) - allowed:
        raise ValueError("Unsupported Tugboat fields: " + ", ".join(sorted(set(config) - allowed)))
    p = {k: v for k, v in config.items() if k in allowed}
    if runtime_bindings:
        if not isinstance(runtime_bindings, dict) or set(runtime_bindings) - RUNTIME_FIELDS:
            raise ValueError("Only existing local source, Git and token references can be rebound.")
        p.update(runtime_bindings)
    parts = str(p.get("environment_id", "")).split("/")
    if len(parts) != 2:
        raise ValueError("Use the original project ID/repository ID environment reference.")
    p["project_id"], p["repo_id"] = (_identity(v, label) for v, label in
                                    zip(parts, ("project ID", "repository ID")))
    token = p.get("access_token_env", "")
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", token):
        raise ValueError("Supply the existing API-key environment variable name.")
    root = Path(p.get("site_root", "")).expanduser()
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise ValueError("Select the existing absolute original Git project root.")
    p["site_root"] = str(root.resolve())
    git = p.get("git_path") or shutil.which("git")
    if not git or not Path(git).is_absolute() or not os.access(git, os.X_OK):
        raise ValueError("Select the existing native Git executable.")
    p["git_path"] = str(Path(git).resolve())
    for name, default, low, high in (("timeout_seconds", 120, 10, 7200),
                                    ("max_artifact_bytes", 1073741824, 1048576, 2**53 - 1)):
        value = p.get(name, default)
        if type(value) is not int or not low <= value <= high:
            raise ValueError("Invalid native " + name + ".")
        p[name] = value
    for name in ("children", "force"):
        p[name] = _bool(p.get(name, False), name)
    for name in ("preview_id", "base_preview_id"):
        if p.get(name) and p[name] != "none":
            _identity(p[name], name)
    p["base_preview_id"] = p.get("base_preview_id") or "none"
    if p.get("preview_id") == "none":
        raise ValueError("Select a real existing preview ID, or leave the selection empty.")
    if p.get("source_revision") and not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", p["source_revision"]):
        raise ValueError("Use a full reviewed original Git commit.")
    if p.get("expected_config_sha256") and not re.fullmatch(r"[0-9a-f]{64}", p["expected_config_sha256"]):
        raise ValueError("Use the exact original configuration SHA-256.")
    if p.get("config_json"):
        value = json.loads(p["config_json"])
        if not isinstance(value, dict) or not isinstance(value.get("services"), dict) or not value["services"]:
            raise ValueError("The selected original configuration must contain its services object.")
    return p


def provider_context(p):
    return {"source_kind": "tugboat", "environment_id": p["environment_id"],
            "api_base": API_BASE, "project_id": p["project_id"], "repo_id": p["repo_id"]}


def actions_for(kind):
    if kind == "CAPTURE":
        return [{"value": "tugboat-capture", "label": "Capture the complete original Git and native preview source"}]
    if kind == "PREVIEW":
        return [{"value": "tugboat-" + action, "label": label,
                 "required_profile_fields": ["source_revision", "expected_config_sha256"]
                 if action == "create" else ["preview_id"]}
                for action, label in [
                    ("create", "Build the selected exact commit as a new preview"),
                    ("rebuild", "Rebuild the selected original preview"),
                    ("refresh", "Refresh the selected preview's native source data"),
                    ("start", "Start the selected preview"),
                    ("stop", "Stop the selected preview")]]
    return []


def pollable(resume):
    pending = resume.get("native_poll") or {}
    return resume.get("phase") == "accepted" and pending.get("provider") == "tugboat" and bool(pending.get("id"))


def resume_fields(operation, payload, reason):
    if not str(operation.get("native_action", "")).startswith("tugboat-"):
        raise ValueError("These continuation fields belong to the original Tugboat operation.")
    result = {}
    if "runtime_bindings" in payload:
        selected = profile(operation["profile"]["config"], payload["runtime_bindings"])
        result["runtime_bindings"] = {key: selected[key] for key in RUNTIME_FIELDS}
    if payload.get("tugboat_job_id"):
        native_id = _identity(payload["tugboat_job_id"], "job ID")
        state = operation.get("resume_checkpoint") or {}
        if state.get("phase") not in {"dispatching", "native_interrupted", "accepted"}:
            raise ValueError("Join a provider job only to this original unfinished dispatch.")
        prior = state.get("native_poll", {}).get("id")
        if prior and prior != native_id:
            raise ValueError("The original retained job ID cannot be replaced.")
        if native_id in state.get("before_job_ids", []):
            raise ValueError("The selected job existed before the original native dispatch.")
        result["tugboat_job_association"] = {"id": native_id, "reason": str(reason),
                                            "request_sha256": state.get("request_sha256")}
    return result


def _read_json(path):
    return json.loads(Path(path).read_bytes())


def _state(s, supplied=None):
    path = s.out / "native-state.json"
    saved = s.read_private_json(path) if path.exists() else supplied or {}
    saved = saved.get("resume_checkpoint", saved.get("state", saved))
    s.state = dict(s.resolve_private(saved))
    if s.state.get("provider") not in (None, "tugboat"):
        raise ValueError("This native output directory belongs to another provider.")
    s.state["provider"] = "tugboat"


def _intent(s, value):
    digest = _api()._digest(value)
    if s.state.get("intent_sha256") not in (None, digest):
        raise ValueError("The saved Tugboat operation belongs to another reviewed instruction.")
    s.state.update(intent=value, intent_sha256=digest)
    s.save_state()


def _retain(s, path, role, **extra):
    item = s.add(path, role, **extra)
    if not any(x["path"] == item["path"] for x in s.state.setdefault("retained_artifacts", [])):
        s.state["retained_artifacts"].append(item)
    return item


def _json_file(s, name, value, role):
    path = s.out / name
    if path.exists() and _read_json(path) != value:
        path = path.with_name(path.stem + "-" + _api()._digest(value) + path.suffix)
    _api()._atomic(path, value)
    return _retain(s, path, role)


def _delay(headers):
    value = headers.get("retry-after", "")
    try:
        return max(1, int(value))
    except (ValueError, TypeError):
        try:
            return max(1, int((parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()))
        except (ValueError, TypeError):
            return 15


def _url(path):
    value = parse.urlsplit(parse.urljoin(API_BASE + "/", path))
    if value.scheme != "https" or value.netloc != "api.tugboatqa.com" or not value.path.startswith("/v3/") or value.username or value.password or value.fragment:
        raise ValueError("The request must remain on the exact original Tugboat v3 API.")
    return parse.urlunsplit(value)


def _provider_deadline(s, response=None, url=None):
    """Retain native account limits and each original job's polling deadline separately."""
    token = os.environ.get(s.p["access_token_env"], "")
    if not token:
        raise _api().NativeWaiting("The selected native API-key variable is empty.")
    account = hashlib.sha256((API_BASE + "\\0" + token).encode()).hexdigest()
    root = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local" / "state")))
    if not root.is_absolute():
        raise ValueError("The existing native state directory must be absolute.")
    root = root / "tjl-govhub" / "tugboat"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.is_symlink():
        raise ValueError("The native provider deadline directory must be an ordinary directory.")
    path, lock = root / (account + ".json"), root / (account + ".lock")
    with lock.open("a+b") as guard:
        os.chmod(lock, 0o600)
        fcntl.flock(guard.fileno(), fcntl.LOCK_EX)
        current = _read_json(path) if path.exists() else {}
        account_deadline = max(float(current.get("not_before", 0)),
                               float(s.state.get("provider_not_before", 0)))
        polling = s.state.setdefault("provider_poll_deadlines", {})
        if response is not None:
            headers = response.get("response_headers", {})
            if "retry-after" in headers or response.get("status") == 429:
                observed = time.time() + _delay(headers)
                if response.get("status") in (429, 503):
                    if observed >= account_deadline:
                        account_deadline = observed
                        current = {"authority": API_BASE, "not_before": account_deadline,
                                   "observed_at": _api()._now(), "status": response.get("status"),
                                   "url": response.get("url"), "retry_after": headers.get("retry-after")}
                        _api()._atomic(path, current)
                else:
                    resource = response.get("url")
                    if response.get("status") == 202 and headers.get("content-location"):
                        resource = _url(headers["content-location"])
                    polling[resource] = max(float(polling.get(resource, 0)), observed)
        s.state["provider_not_before"] = account_deadline
        selected = url or (response or {}).get("url")
        deadline = max(account_deadline, float(polling.get(selected, 0)))
        s.state["poll_after_seconds"] = max(1, int(deadline - time.time() + 1)) if deadline > time.time() else 0
        s.save_state()
        fcntl.flock(guard.fileno(), fcntl.LOCK_UN)
    return deadline


def _http(s, label, path, method="GET", body=None):
    """One native request, no redirect or hidden mutation retry."""
    s.check()
    url = _url(path)
    deadline = _provider_deadline(s, url=url)
    if time.time() < deadline:
        raise _api().NativeWaiting("The retained native provider Retry-After deadline has not elapsed: " +
                                   datetime.fromtimestamp(deadline, timezone.utc).isoformat())
    token = os.environ.get(s.p["access_token_env"], "")
    if not token:
        raise _api().NativeWaiting("The selected native API-key variable is empty.")
    payload = None if body is None else json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    nonce = str(time.time_ns())
    stem = s.out / (label + "-" + nonce)
    response_path = Path(str(stem) + ".response")
    record_path = Path(str(stem) + ".http.json")
    record = {"schema": VERSION, "method": method, "url": url, "started_at": _api()._now(),
              "request_sha256": hashlib.sha256(payload or b"").hexdigest(), "complete": False,
              "status": None, "response_headers": {}}
    if payload is not None:
        input_path = Path(str(stem) + ".input.json")
        input_path.write_bytes(payload)
        os.chmod(input_path, 0o600)
        record["input"] = _retain(s, input_path, "native_request_body")
    _api()._atomic(record_path, record)
    if method != "GET":
        s.state.update(phase="dispatching", mutation_started=True, dispatch_record=str(record_path),
                       dispatch_path=str(response_path), dispatched_at=record["started_at"])
        s.save_state()
    headers = {"Authorization": "Bearer " + token, "Accept": "application/vnd.tugboat.propeller+json",
               "User-Agent": "Token-Junkie-Labs-GovHub-Tugboat/1"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request_object = request.Request(url, data=payload, headers=headers, method=method)
    response = None
    try:
        try:
            response = request.build_opener(_api().NoRedirect).open(request_object, timeout=s.p["timeout_seconds"])
        except error.HTTPError as exc:
            response = exc
        record.update(status=response.code, response_headers={k.lower(): v for k, v in response.headers.items()})
        _provider_deadline(s, record)
        expected = getattr(response, "length", None)
        if expected is None:
            expected = getattr(getattr(response, "fp", None), "length", None)
        declared = record["response_headers"].get("content-length")
        if expected is None and declared is not None and "chunked" not in record["response_headers"].get("transfer-encoding", "").lower():
            expected = int(declared)
        if expected is not None and (type(expected) is not int or expected < 0):
            raise ValueError("The native HTTP response has an invalid declared body length.")
        record["expected_body_bytes"] = expected
        count = 0
        with response, response_path.open("wb") as stream:
            os.chmod(response_path, 0o600)
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > s.p["max_artifact_bytes"]:
                    raise ValueError("The original native HTTP body exceeds the configured source limit.")
                stream.write(chunk)
                record["received_body_bytes"] = count
            stream.flush()
            os.fsync(stream.fileno())
        record["received_body_bytes"] = count
        if expected is not None and count != expected:
            raise IOError("The original HTTP body is incomplete: received " + str(count) +
                          " bytes; the provider declared " + str(expected) + ".")
        record.update(complete=True, completed_at=_api()._now())
    except BaseException as exc:
        record.update(error={"type": type(exc).__name__, "message": str(exc)}, completed_at=_api()._now())
        if response_path.is_file():
            record["response"] = _api()._file(response_path, "provider_response_partial")
        _api()._atomic(record_path, record)
        _retain(s, record_path, "provider_http_record")
        if response_path.is_file():
            _retain(s, response_path, "provider_response_partial")
        if method != "GET":
            s.state.update(phase="native_interrupted")
            s.save_state()
        raise
    record["response"] = _retain(s, response_path, "provider_response")
    _api()._atomic(record_path, record)
    _retain(s, record_path, "provider_http_record")
    s.event({"kind": "tugboat_http", "method": method, "path": parse.urlsplit(url).path,
             "status": record["status"], "record": str(record_path), "complete": True})
    return record


def _value(result, expected=(200,)):
    if not result.get("complete"):
        raise _api().NativeWaiting("Retain the complete original provider response before continuing.")
    if result["status"] not in expected:
        if result["status"] == 429:
            raise _api().NativeWaiting("Tugboat requested a later read; the complete Retry-After response is retained.")
        if result["status"] == 404:
            raise ValueError("Tugboat returned 404 for missing or inaccessible source; inspect the retained native response.")
        raise ValueError("Tugboat returned HTTP " + str(result["status"]) + "; inspect the retained native response.")
    value = _read_json(result["response"]["path"])
    if not isinstance(value, (dict, list)):
        raise ValueError("Expected the original Tugboat JSON object or collection.")
    return value


def _object(value, kind, native_id):
    if not isinstance(value, dict) or str(value.get("id", "")) != native_id or value.get("type") != kind:
        raise ValueError("The native response does not match the selected " + kind + " identity.")
    return value


def _scope(s, value, preview=False):
    if value.get("project") != s.p["project_id"]:
        raise ValueError("The native object belongs to another original project.")
    if preview and value.get("repo") != s.p["repo_id"]:
        raise ValueError("The native preview belongs to another original repository.")
    return value


def _inventory(s, label):
    version = _value(_http(s, label + "-version", "version"))
    project = _object(_value(_http(s, label + "-project", "projects/" + s.p["project_id"])),
                      "project", s.p["project_id"])
    repo = _scope(s, _object(_value(_http(s, label + "-repo", "repos/" + s.p["repo_id"])),
                             "repo", s.p["repo_id"]))
    previews = _value(_http(s, label + "-previews", "repos/" + s.p["repo_id"] + "/previews"))
    if not isinstance(previews, list):
        raise ValueError("The original preview census must be an array.")
    ids = set()
    for row in previews:
        _scope(s, _object(row, "preview", _identity(row.get("id"), "preview ID")), True)
        if row["id"] in ids:
            raise ValueError("The source preview census repeats an identity.")
        ids.add(row["id"])
    selected = next((x for x in previews if x["id"] == s.p.get("preview_id")), None)
    if s.p.get("preview_id") and selected is None:
        raise ValueError("The selected preview is not in the current original repository census.")
    base_id = s.p["base_preview_id"]
    if base_id != "none" and base_id not in ids:
        raise ValueError("Select a current base preview from this original repository.")
    value = {"version": version, "project": project, "repo": repo, "previews": previews,
             "selected_preview": selected, "base_preview_id": base_id}
    _json_file(s, label + "-inventory.json", value, "provider_inventory")
    return value


def _git_identity(value):
    value = str(value).strip()
    if "://" not in value:
        match = re.fullmatch(r"(?:[^@:/]+@)?([^:/]+):(.+)", value)
        if not match:
            raise ValueError("The native Git remote is not an explicit host/repository reference.")
        host, path = match.groups()
    else:
        parsed = parse.urlsplit(value)
        if parsed.scheme not in {"https", "ssh", "git"} or not parsed.hostname:
            raise ValueError("Use the original native hosted Git repository URL.")
        host, path = parsed.hostname, parsed.path
    return host.lower() + "/" + path.strip("/").removesuffix(".git")


def _source(s, label, full=False, expected_git=None):
    git = [s.p["git_path"], "-C", s.p["site_root"]]
    remote = s.command(label + "-source-remote", git + ["remote", "get-url", "origin"])
    remote_identity = _git_identity(Path(remote["stdout"]["path"]).read_text().strip())
    if expected_git and remote_identity != _git_identity(expected_git):
        raise ValueError("The selected local Git source belongs to another native repository.")
    _retain(s, remote["stdout"]["path"], "native_git_remote")
    revision = s.p.get("source_revision") or "HEAD"
    result = s.command(label + "-source-commit", git + ["rev-parse", "--verify", revision + "^{commit}"])
    commit = Path(result["stdout"]["path"]).read_text().strip()
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", commit) or (s.p.get("source_revision") and commit != s.p["source_revision"]):
        raise ValueError("The selected original Git commit could not be resolved exactly.")
    for role in ("stdout", "stderr"):
        _retain(s, result[role]["path"], "native_git_" + role)
    if s.p.get("config_json"):
        config = json.loads(s.p["config_json"])
        raw = json.dumps(config, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
        origin = "reviewed-native-config-object"
    else:
        result = s.command(label + "-native-config", git + ["show", commit + ":.tugboat/config.yml"])
        raw = Path(result["stdout"]["path"]).read_bytes()
        if not raw.strip():
            raise ValueError("The original commit has no nonempty .tugboat/config.yml.")
        config = None
        origin = commit + ":.tugboat/config.yml"
        _retain(s, result["stdout"]["path"], "native_tugboat_configuration")
    sha = hashlib.sha256(raw).hexdigest()
    source = {"commit": commit, "repository_identity": remote_identity, "configuration_origin": origin, "configuration_sha256": sha,
              "configuration_bytes": len(raw), "config": config}
    if full:
        bundle = s.out / (label + "-original-repository.bundle")
        archive = s.out / (label + "-selected-source.tar")
        for name, target, args in [
            ("repository-bundle", bundle, ["bundle", "create", str(bundle), "--all", commit]),
            ("selected-source", archive, ["archive", "--format=tar", "--output=" + str(archive), commit])]:
            s.command(label + "-" + name, git + args)
            _retain(s, target, "native_git_bundle" if name == "repository-bundle" else "native_source_archive")
        source["repository_bundle"] = str(bundle)
        source["selected_source_archive"] = str(archive)
    _json_file(s, label + "-source.json", source, "native_source_identity")
    return source


def _jobs(s, action, label):
    expected_action = "build" if action == "create" else action
    if action == "create":
        path = "projects/" + s.p["project_id"] + "/jobs?children=true"
    else:
        path = "previews/" + s.p["preview_id"] + "/jobs?" + parse.urlencode(
            {"action": expected_action, "children": "false"})
    rows = _value(_http(s, label, path))
    if not isinstance(rows, list):
        raise ValueError("The original job census must be an array.")
    # The complete returned native census is already retained by _http.
    # Repository jobs only support keygen/update filters; preview actions are filtered here.
    return [row for row in rows if isinstance(row, dict) and row.get("target") == "previews"
            and row.get("action") == expected_action
            and row.get("project", s.p["project_id"]) == s.p["project_id"]
            and row.get("repo", s.p["repo_id"]) == s.p["repo_id"]
            and (action == "create" or (row.get("preview") or row.get("object")) == s.p["preview_id"])]

def _request_body(s, action, operation_id, source):
    if action == "create":
        if not s.p.get("source_revision") or not s.p.get("expected_config_sha256"):
            raise ValueError("Capture and select the exact original commit and configuration hash before preview creation.")
        if source["configuration_sha256"] != s.p["expected_config_sha256"]:
            raise ValueError("The original selected preview configuration changed.")
        body = {"repo": s.p["repo_id"], "ref": source["commit"], "type": "commit",
                "base": s.p["base_preview_id"], "name": "GovHub " + operation_id}
        if source["config"] is not None:
            body["config"] = source["config"]
        return "previews", body
    preview_id = _identity(s.p.get("preview_id"), "selected preview ID")
    return "previews/" + preview_id + "/" + action, (
        {"children": s.p["children"], "force": s.p["force"]} if action in {"refresh", "rebuild"} else None)


def _job(s, value, action, *, joining=False):
    native_id = _identity(value.get("id"), "job ID")
    if value.get("type") != "job" or value.get("target") != "previews":
        raise ValueError("Select an original preview job.")
    expected_action = "build" if action == "create" else action
    if value.get("action") != expected_action:
        raise ValueError("The returned native job belongs to another preview action.")
    preview_id = _identity(value.get("preview") or value.get("object"), "job preview ID")
    if value.get("preview") and value.get("object") and value["preview"] != value["object"]:
        raise ValueError("The job's original target identifiers disagree.")
    if value.get("project") and value["project"] != s.p["project_id"]:
        raise ValueError("The selected job belongs to another project.")
    if value.get("repo") and value["repo"] != s.p["repo_id"]:
        raise ValueError("The selected job belongs to another repository.")
    if action != "create" and preview_id != s.p["preview_id"]:
        raise ValueError("The selected job belongs to another preview.")
    if joining:
        if native_id in s.state.get("before_job_ids", []):
            raise ValueError("This job predates the retained original dispatch.")
        created = value.get("createdAt")
        try:
            observed = datetime.fromisoformat(created.replace("Z", "+00:00"))
            started = datetime.fromisoformat(s.state["dispatched_at"].replace("Z", "+00:00"))
            if observed.timestamp() < started.timestamp() - 30:
                raise ValueError("This job was created before the retained original dispatch.")
        except (AttributeError, KeyError, TypeError):
            raise ValueError("The selected job lacks its original createdAt identity.")
    return native_id, preview_id


def _contains(original, received):
    if isinstance(original, dict):
        return isinstance(received, dict) and all(key in received and _contains(value, received[key])
                                                    for key, value in original.items())
    return type(original) is type(received) and original == received


def _associated_request(s, job, preview, action):
    """Bind a lost response to the original selected instruction and deterministic name."""
    instruction = s.state["request"]
    body = instruction.get("body") or {}
    args = job.get("args")
    if isinstance(args, dict):
        for key, expected in body.items():
            if key in args and not _contains(expected, args[key]):
                raise ValueError("The selected job changed the original native argument: " + key)
    if action == "create":
        if preview.get("name") != body["name"]:
            raise ValueError("The selected preview does not have this original operation's deterministic name.")
        if preview.get("sha") != body["ref"]:
            raise ValueError("The selected job did not build the original reviewed commit.")
        base = preview.get("base")
        if body["base"] == "none":
            if base not in (None, "", "none"):
                raise ValueError("The original create selected no base; this preview has a base.")
        elif base != body["base"]:
            raise ValueError("The selected preview belongs to another original base.")
        if "config" in body and not _contains(body["config"], preview.get("config")):
            raise ValueError("The selected preview does not retain the original explicit configuration.")
    return {"original_request_sha256": s.state["request_sha256"],
            "preview_name": preview.get("name"), "preview_base": preview.get("base"),
            "native_args": args}


def _accept(s, response, action):
    if response["status"] == 429 and response.get("complete"):
        s.state.update(phase="rate_limited", mutation_started=False,
                       not_before=s.state.get("provider_not_before", time.time()))
        s.save_state()
        raise _api().NativeWaiting("The original Tugboat mutation was rate limited; resume it after the retained provider deadline.")
    if response["status"] != 202:
        if response.get("complete") and 400 <= response["status"] < 500:
            s.state.update(phase="failed")
            s.save_state()
            _value(response, (202,))
        raise _api().NativeWaiting("The original mutation has no accepted job response; inspect its native result and associate that same job.")
    value = _value(response, (202,))
    if not isinstance(value, dict):
        raise ValueError("The selected single-base preview must return one native job object.")
    job_id, preview_id = _job(s, value, action)
    location = response["response_headers"].get("content-location")
    if location and _url(location) != API_BASE + "/jobs/" + job_id:
        raise ValueError("The accepted job body and original Content-Location disagree.")
    s.state.update(phase="accepted", native_poll={"provider": "tugboat", "id": job_id,
                    "preview_id": preview_id, "action": action}, accepted_job=value)
    s.save_state()


def _poll(s, action):
    pending = s.state["native_poll"]
    response = _http(s, "job", "jobs/" + pending["id"])
    if response["status"] == 429:
        s.state["poll_after_seconds"] = _delay(response["response_headers"])
        s.save_state()
        raise _api().NativeWaiting("The original job requested a later native read.")
    value = _value(response, (200, 303))
    job_id, preview_id = _job(s, value, action)
    if job_id != pending["id"] or preview_id != pending["preview_id"]:
        raise ValueError("The returned provider job changed its original identity.")
    location = response["response_headers"].get("location")
    if response["status"] == 303 and location and _url(location) != API_BASE + "/previews/" + preview_id:
        raise ValueError("The completed job's Location names another native preview.")
    s.state["last_job"] = value
    if value.get("result") not in TERMINAL:
        s.state["poll_after_seconds"] = _delay(response["response_headers"])
        s.save_state()
        raise _api().NativeWaiting("The original preview job is still active.")
    log = _value(_http(s, "complete-job-log", "jobs/" + job_id + "/log?limit=0"))
    _json_file(s, "completed-job.json", {"job": value, "log": log}, "native_job_result")
    if value["result"] != "success":
        s.state.update(phase="failed", native_failure=value["result"])
        s.save_state()
        raise ValueError("The native preview job completed with " + value["result"] + ": " + str(value.get("message", "")))
    preview = _scope(s, _object(_value(_http(s, "completed-preview", "previews/" + preview_id)),
                                "preview", preview_id), True)
    if action == "create" and preview.get("sha") != s.state["source"]["commit"]:
        raise ValueError("The completed preview did not receive the reviewed original commit.")
    services = _value(_http(s, "completed-services", "previews/" + preview_id + "/services"))
    expected_states = {"stop": {"stopped"}, "start": {"ready"}, "create": {"ready"},
                       "rebuild": {"ready"}, "refresh": {"ready"}}
    if preview.get("state") not in expected_states[action]:
        s.state["poll_after_seconds"] = 15
        s.save_state()
        raise _api().NativeWaiting("The original job succeeded; the native preview has not reached its expected operating state.")
    return _finish(s, {"native_action": "tugboat-" + action, "job": value, "preview": preview,
                       "services": services, "source": s.state["source"],
                       "native_result": "success", "preview_url": preview.get("url")})


def _finish(s, observations):
    value = {"schema": VERSION, "intent_sha256": s.state["intent_sha256"],
             "provider_context": provider_context(s.p), "observations": observations,
             "artifacts": list(s.state.get("retained_artifacts", []))}
    _json_file(s, "tugboat-completed-operation.json", value, "restored_native_status")
    s.state.update(phase="completed", completion=str(s.out / "tugboat-completed-operation.json"))
    s.save_state()
    return _completed(s, value)


def _completed(s, value):
    if value["intent_sha256"] != s.state["intent_sha256"]:
        raise ValueError("The native completed source belongs to another original operation.")
    s.artifacts = []
    for item in value["artifacts"]:
        current = _api()._file(s.private_path(item["path"]), item["role"])
        if current["sha256"] != item["sha256"] or current["size"] != item["size"]:
            raise ValueError("A retained original Tugboat artifact changed.")
        s.add(current["path"], item["role"])
    s.add(s.out / "tugboat-completed-operation.json", "restored_native_status")
    return s.result("COMPLETE", value["observations"])


def _failure(s, exc):
    if isinstance(exc, _api().NativeCancelled):
        status = "WAITING_NATIVE" if s.state.get("mutation_started") else "CANCELLED"
    elif isinstance(exc, _api().NativeWaiting) or s.state.get("phase") in {"dispatching", "native_interrupted", "accepted", "rate_limited"}:
        status = "WAITING_NATIVE"
    else:
        status = "FAILED"
    s.artifacts = list(s.state.get("retained_artifacts", []))
    value = s.result(status, message=str(exc))
    value["safe_to_retry"] = not s.state.get("mutation_started") or s.state.get("phase") in {"failed", "completed", "rate_limited"}
    if pollable(s.state):
        value["poll_after_seconds"] = max(5, min(int(s.state.get("poll_after_seconds", 15)), 3600))
    return value


def discover_capabilities(config, runtime_bindings=None):
    result = {"ready": False, "actions": [], "configuration": dict(config), "current_config": dict(config)}
    try:
        p = profile(config, runtime_bindings)
        with tempfile.TemporaryDirectory(prefix="govhub-tugboat-capabilities-") as folder:
            s = _api().Session(p, folder)
            _state(s)
            inventory = _inventory(s, "capability")
            source = _source(s, "capability", expected_git=inventory["repo"]["git"])
            # Full raw private responses are retained by a CAPTURE operation.
            result.update(ready=True, target_fingerprint=_api()._digest(provider_context(p)),
                          native_status={"api": inventory["version"], "project_id": p["project_id"],
                              "repo_id": p["repo_id"], "source": source,
                              "previews": [{k: row.get(k) for k in ("id", "ref", "sha", "state", "base", "url", "job")}
                                           for row in inventory["previews"]]},
                          actions=actions_for("CAPTURE") + actions_for("PREVIEW"))
    except Exception as exc:
        result["error"] = str(exc)
    return result


def capture(config, context, checkpoint=None, cancelled=None):
    p = profile(config, context.get("runtime_bindings"))
    s = _api().Session(p, context["output_dir"], checkpoint, cancelled, context.get("workspace_relocations"))
    try:
        _state(s, context.get("checkpoint"))
        expected = context.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _api()._digest(provider_context(p)):
            raise ValueError("The original capture target fingerprint changed.")
        _intent(s, {"action": "tugboat-capture", "operation_id": context.get("operation_id"),
                    "target": provider_context(p), "profile": {k: v for k, v in config.items() if k not in RUNTIME_FIELDS}})
        completed = s.out / "tugboat-completed-operation.json"
        if completed.exists():
            return _completed(s, s.read_private_json(completed))
        inventory = _inventory(s, "original")
        source = _source(s, "original", full=True, expected_git=inventory["repo"]["git"])
        if p.get("preview_id"):
            for suffix, role in (("services", "native_services"), ("log?limit=0", "native_preview_log"),
                                 ("jobs?limit=0", "native_preview_jobs")):
                value = _value(_http(s, "original-" + role, "previews/" + p["preview_id"] + "/" + suffix))
                _json_file(s, role + ".json", value, role)
        return _finish(s, {"native_action": "tugboat-capture", "source": source,
                          "project_id": p["project_id"], "repo_id": p["repo_id"],
                          "preview_ids": [row["id"] for row in inventory["previews"]],
                          "selected_preview": inventory["selected_preview"]})
    except Exception as exc:
        return _failure(s, exc)


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    p = profile(config, operation.get("runtime_bindings"))
    s = _api().Session(p, source_paths["output_dir"], checkpoint, cancelled, source_paths.get("workspace_relocations"))
    try:
        _state(s, source_paths.get("checkpoint") or operation.get("resume_checkpoint"))
        action = str(operation.get("native_action", "")).removeprefix("tugboat-")
        if action not in ACTIONS or operation.get("type") != "PREVIEW":
            raise ValueError("Select a native Tugboat preview lifecycle operation.")
        if operation.get("provider_environment_id") != p["environment_id"]:
            raise ValueError("The original operation names another provider environment.")
        expected = operation.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _api()._digest(provider_context(p)):
            raise ValueError("The original target fingerprint changed.")
        _intent(s, {"action": action, "operation_id": operation["id"], "target": provider_context(p),
                    "profile": {k: v for k, v in config.items() if k not in RUNTIME_FIELDS}})
        completed = s.out / "tugboat-completed-operation.json"
        if completed.exists():
            return _completed(s, s.read_private_json(completed))
        if s.state.get("phase") == "failed":
            raise ValueError("This original provider operation has a retained terminal failure; inspect its actual result.")
        if s.state.get("phase") == "accepted":
            return _poll(s, action)
        if s.state.get("phase") in {"dispatching", "native_interrupted"}:
            saved = Path(s.state.get("dispatch_record", ""))
            if saved.is_file():
                response = s.read_private_json(saved)
                if response.get("complete"):
                    if response.get("status") == 429 or 400 <= response.get("status", 0) < 500:
                        _accept(s, response, action)
                    elif response.get("status") == 202:
                        try:
                            _accept(s, response, action)
                        except (ValueError, KeyError, TypeError) as exc:
                            s.state["acceptance_read_error"] = str(exc)
                            s.save_state()
                        else:
                            return _poll(s, action)
                    # A complete ambiguous response still needs the original job association.
                    # It must not suppress this same-operation recovery or trigger another POST.
            association = operation.get("tugboat_job_association") or {}
            if association:
                if association.get("request_sha256") != s.state.get("request_sha256"):
                    raise ValueError("The selected native job association belongs to another original request.")
                result = _value(_http(s, "associated-job", "jobs/" + _identity(association["id"], "job ID")), (200, 303))
                job_id, preview_id = _job(s, result, action, joining=True)
                preview = _scope(s, _object(_value(_http(s, "associated-preview", "previews/" + preview_id)),
                                            "preview", preview_id), True)
                match = _associated_request(s, result, preview, action)
                s.state.update(phase="accepted", native_poll={"provider": "tugboat", "id": job_id,
                    "preview_id": preview_id, "action": action}, association=association,
                    associated_request=match)
                s.save_state()
                return _poll(s, action)
            candidates = _jobs(s, action, "original-dispatch-candidates")
            s.state["candidate_jobs"] = [{k: row.get(k) for k in ("id", "action", "createdAt", "object", "preview", "result")}
                                        for row in candidates if row.get("id") not in s.state.get("before_job_ids", [])]
            s.save_state()
            raise _api().NativeWaiting("Select the actual original job ID from the retained provider jobs to reconcile this dispatch.")
        if s.state.get("phase") == "rate_limited" and time.time() < s.state.get("not_before", 0):
            raise _api().NativeWaiting("The original provider Retry-After deadline has not elapsed.")
        inventory = _inventory(s, "before")
        source = s.state.get("source") or _source(s, "operation", full=True, expected_git=inventory["repo"]["git"])
        if source["repository_identity"] != _git_identity(inventory["repo"]["git"]):
            raise ValueError("The native repository changed from the original source binding.")
        path, body = _request_body(s, action, operation["id"], source)
        instruction = {"method": "POST", "path": path, "body": body}
        request_sha = _api()._digest(instruction)
        if s.state.get("request_sha256") not in (None, request_sha):
            raise ValueError("The original prepared provider request changed.")
        jobs = _jobs(s, action, "before-native-jobs")
        s.state.update(phase="prepared", source=source, request=instruction, request_sha256=request_sha,
                       before_job_ids=sorted({row["id"] for row in jobs if row.get("id")}),
                       before_preview_ids=[row["id"] for row in inventory["previews"]])
        s.save_state()
        response = _http(s, "dispatch", path, method="POST", body=body)
        _accept(s, response, action)
        return _poll(s, action)
    except Exception as exc:
        return _failure(s, exc)
