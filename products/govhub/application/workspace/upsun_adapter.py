"""Current Upsun native lifecycle for the existing GovHub operator.

Copyright 2026 Token Junkie Labs contributors. Apache-2.0, see ../LICENSE.
The unchanged official specification and selected original client contracts are
retained in native/upsun/. A mutation is dispatched once; its native activities
are resumed by their original identities.
"""
from __future__ import annotations

import base64
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

VERSION = "govhub-upsun/v1"
API_BASE = "https://api.upsun.com"
AUTH_URL = "https://auth.upsun.com/oauth2/token"
SPEC_COMMIT = "486957153711c62f206b9e950af4c5406d1a6559"
SPEC_BLOB = "c956c8b7c5e1b41d61a4452e9c4ff3228f17ff0f"
RUNTIME_FIELDS = {"site_root", "git_path", "upsun_path", "ssh_path", "rsync_path",
                  "api_token_env", "access_token_env"}
KINDS = {
    "CAPTURE": ["capture"],
    "BACKUP_CREATE": ["backup-create"],
    "PREVIEW": ["branch", "activate", "redeploy"],
    "REHEARSAL": ["synchronize", "restore-backup", "deploy", "redeploy"],
    "CUTOVER": ["merge", "deploy", "redeploy"],
    "ROLLBACK": ["restore-backup"],
}
LABELS = {
    "capture": "Receive original source and complete native inventory",
    "backup-create": "Create the selected environment's native snapshot",
    "branch": "Create a development or staging child environment",
    "activate": "Activate the selected nonproduction environment",
    "redeploy": "Redeploy the selected environment",
    "synchronize": "Synchronize the selected child from its retained parent",
    "restore-backup": "Restore the selected exact native snapshot",
    "deploy": "Deploy all staged changes on the selected environment",
    "merge": "Merge the selected child into its reviewed parent",
}
ACTIVITY_TYPES = {
    "backup-create": {"environment.backup"},
    "restore-backup": {"environment.restore"},
    "branch": {"environment.branch"},
    "activate": {"environment.activate"},
    "redeploy": {"environment.redeploy"},
    "synchronize": {"environment.synchronize"},
    "merge": {"environment.merge"},
    "deploy": {"environment.redeploy", "environment.push"},
}
_TOKENS = {}


def _api():
    import native_adapter
    return native_adapter


def _id(value, label):
    if not isinstance(value, str) or not value or len(value) > 512 or any(
            ch in value for ch in ("\\", "\x00", "\r", "\n", "?", "#")) or value in {".", ".."}:
        raise ValueError("Select the complete original Upsun " + label + ".")
    return value


def _segment(value):
    return parse.quote(str(value), safe="")


def _bool(value, label):
    if type(value) is not bool:
        raise ValueError(label + " must be a boolean.")
    return value


def provider_schema():
    def field(name, label, required=False, **extra):
        return {"name": name, "label": label, "type": "text", "required": required, **extra}
    return {"value": "upsun", "label": "Upsun (current API)",
            "runtime_fields": sorted(RUNTIME_FIELDS), "fields": [
        field("environment_id", "Project ID / environment ID", True,
              help="Exact native IDs separated by /. Current Upsun account and product only."),
        field("api_token_env", "Existing Upsun API-token variable",
              help="Environment variable NAME. Use this or the access-token variable."),
        field("access_token_env", "Existing short-lived access-token variable",
              help="Environment variable NAME. Its value stays on the native host."),
        field("site_root", "Existing native source workspace", True,
              help="Absolute retained source path on the selected host."),
        field("git_path", "Existing Git executable"),
        field("upsun_path", "Existing current Upsun CLI executable"),
        field("ssh_path", "Existing SSH executable"),
        field("rsync_path", "Existing rsync executable"),
        field("source_revision", "Reviewed original Git commit",
              help="Full commit ID. Capture first to select actual source; mutations retain this exact head."),
        field("source_app", "Selected native application"),
        field("source_database", "Selected native database relationship"),
        field("source_database_schema", "Selected native database schema"),
        field("source_mounts_json", "Selected original mount paths", type="textarea",
              help="Explicit JSON selection consumed by the complete source export programme."),
        field("parent_environment_id", "Reviewed parent environment",
              help="Required for synchronize and merge. Merge changes this parent; synchronize changes the selected child."),
        field("backup_id", "Selected native snapshot ID",
              help="Select an actual restorable backup from this environment."),
        field("branch_name", "New child environment name"),
        field("branch_title", "New child environment title"),
        field("branch_type", "Child type", default="development",
              help="development or staging"),
        field("clone_parent", "Copy parent data into new child", type="boolean", default=True),
        field("safe_backup", "Create a consistent native backup", type="boolean", default=True),
        field("synchronize_code", "Synchronize parent code", type="boolean", default=False),
        field("synchronize_data", "Replace child data from parent", type="boolean", default=False),
        field("synchronize_resources", "Synchronize parent resource selection", type="boolean", default=False),
        field("rebase", "Use the native code rebase option", type="boolean", default=False),
        field("restore_code", "Restore snapshot code", type="boolean", default=True),
        field("restore_resources", "Restore snapshot resource allocation", type="boolean", default=True),
        field("deployment_strategy", "Native deployment strategy", default="stopstart",
              help="rolling or stopstart"),
        field("resources_init", "Explicit native resource initialization",
              help="Optional; allowed values depend on the selected native operation."),
        field("timeout_seconds", "Native request timeout, seconds", type="integer",
              default=120, minimum=10, maximum=7200),
        field("max_artifact_bytes", "Maximum individual retained artifact bytes", type="integer",
              default=1073741824, minimum=1048576),
    ]}


def profile(config, runtime_bindings=None):
    if not isinstance(config, dict) or config.get("source_kind") != "upsun":
        raise ValueError("Select the current Upsun native profile.")
    allowed = {"source_kind", "target_fingerprint"} | {f["name"] for f in provider_schema()["fields"]}
    if set(config) - allowed:
        raise ValueError("Unsupported Upsun fields: " + ", ".join(sorted(set(config) - allowed)))
    p = dict(config)
    if runtime_bindings:
        if not isinstance(runtime_bindings, dict) or set(runtime_bindings) - RUNTIME_FIELDS:
            raise ValueError("Only original native host paths and credential variable names can be rebound.")
        p.update(runtime_bindings)
    parts = str(p.get("environment_id", "")).split("/", 1)
    if len(parts) != 2:
        raise ValueError("Use the original project ID/environment ID reference.")
    p["project_id"], p["native_environment_id"] = (_id(v, label) for v, label in
                                                  zip(parts, ("project", "environment")))
    names = [p.get(k) for k in ("api_token_env", "access_token_env") if p.get(k)]
    if len(names) != 1 or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", names[0]):
        raise ValueError("Select exactly one original API-token or access-token environment variable NAME.")
    root = Path(p.get("site_root", "")).expanduser()
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise ValueError("Select the existing absolute native source workspace.")
    p["site_root"] = str(root.resolve())
    for key, command in (("git_path", "git"), ("upsun_path", "upsun"), ("ssh_path", "ssh"), ("rsync_path", "rsync")):
        value = p.get(key)
        if value:
            expanded = str(Path(value).expanduser())
            selected = expanded if Path(expanded).is_absolute() else shutil.which(expanded)
            if not selected or not Path(selected).is_file() or not os.access(selected, os.X_OK):
                raise ValueError("Select the actual installed executable for " + key + ".")
            p[key] = str(Path(selected).resolve())
    for key, default, low, high in (("timeout_seconds", 120, 10, 7200),
                                   ("max_artifact_bytes", 1073741824, 1048576, 2**53 - 1)):
        value = p.get(key, default)
        if type(value) is not int or not low <= value <= high:
            raise ValueError("Invalid native " + key + ".")
        p[key] = value
    for key, default in (("clone_parent", True), ("safe_backup", True),
                         ("synchronize_code", False), ("synchronize_data", False),
                         ("synchronize_resources", False), ("rebase", False),
                         ("restore_code", True), ("restore_resources", True)):
        p[key] = _bool(p.get(key, default), key)
    for key in ("parent_environment_id", "backup_id", "branch_name", "source_app", "source_database", "source_database_schema"):
        if p.get(key):
            _id(p[key], key)
    if p.get("source_revision") and not re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", p["source_revision"]):
        raise ValueError("Select the full reviewed original Git commit.")
    if p.get("branch_type", "development") not in {"development", "staging"}:
        raise ValueError("New preview children must use development or staging.")
    p["branch_type"] = p.get("branch_type", "development")
    if p.get("deployment_strategy", "stopstart") not in {"rolling", "stopstart"}:
        raise ValueError("Select the original rolling or stopstart deployment strategy.")
    p["deployment_strategy"] = p.get("deployment_strategy", "stopstart")
    if p.get("source_mounts_json"):
        mounts = json.loads(p["source_mounts_json"])
        if not isinstance(mounts, list):
            raise ValueError("The selected source mounts must be a JSON array.")
    return p


def provider_context(p):
    return {"source_kind": "upsun", "environment_id": p["environment_id"],
            "api_base": API_BASE, "product": "current-upsun-api",
            "project_id": p["project_id"], "native_environment_id": p["native_environment_id"]}


def actions_for(kind):
    required = {"branch": ["branch_name", "branch_title", "source_revision"],
                "merge": ["parent_environment_id", "source_revision"],
                "synchronize": ["parent_environment_id", "source_revision"],
                "restore-backup": ["backup_id", "source_revision"],
                "activate": ["source_revision"], "deploy": ["source_revision"],
                "redeploy": ["source_revision"]}
    return [{"value": "upsun-" + action, "label": LABELS[action],
             "required_profile_fields": required.get(action, [])}
            for action in KINDS.get(kind, [])]


def pollable(resume):
    pending = resume.get("native_poll") or {}
    return resume.get("phase") == "accepted" and pending.get("provider") == "upsun" and bool(pending.get("ids"))


def resume_fields(operation, payload, reason):
    if not str(operation.get("native_action", "")).startswith("upsun-"):
        raise ValueError("These continuation fields belong to the original Upsun operation.")
    result = {}
    if "runtime_bindings" in payload:
        bindings = payload["runtime_bindings"]
        selected = profile(operation["profile"]["config"], bindings)
        result["runtime_bindings"] = {k: selected.get(k, "") for k in RUNTIME_FIELDS if k in bindings}
    if payload.get("upsun_activity_id") or payload.get("upsun_activity_ids_json"):
        selected = json.loads(payload["upsun_activity_ids_json"]) if payload.get("upsun_activity_ids_json") else [payload["upsun_activity_id"]]
        if not isinstance(selected, list) or not selected or len(selected) > 1000:
            raise ValueError("Select the actual complete original activity ID array.")
        ids = [_id(value, "activity ID") for value in selected]
        if len(ids) != len(set(ids)):
            raise ValueError("Select every original activity once.")
        if payload.get("upsun_activity_id") and payload["upsun_activity_id"] not in ids:
            raise ValueError("The primary activity must belong to the original selected set.")
        state = operation.get("resume_checkpoint") or {}
        if state.get("phase") not in {"dispatching", "native_interrupted", "accepted"}:
            raise ValueError("Join actual activities only to their original unfinished dispatch.")
        existing = state.get("native_poll", {}).get("ids", [])
        if existing and set(ids) != set(existing):
            raise ValueError("The original accepted activity set cannot be replaced.")
        staged = set(state.get("before_staged_activity_ids", []))
        for selected_id in ids:
            if selected_id in state.get("before_activity_ids", []) and not (
                    operation.get("native_action") == "upsun-deploy" and selected_id in staged):
                raise ValueError("The selected activity predates the original dispatch.")
        result["upsun_activity_association"] = {"id": ids[0], "ids": ids, "reason": str(reason),
                                               "request_sha256": state.get("request_sha256")}
    return result

def _read_json(path):
    return json.loads(Path(path).read_bytes())


def _state(s, supplied=None):
    path = s.out / "native-state.json"
    saved = s.read_private_json(path) if path.exists() else supplied or {}
    saved = saved.get("resume_checkpoint", saved.get("state", saved))
    s.state = dict(s.resolve_private(saved))
    if s.state.get("provider") not in (None, "upsun"):
        raise ValueError("This native output directory belongs to another provider.")
    s.state["provider"] = "upsun"


def _intent(s, value):
    digest = _api()._digest(value)
    if s.state.get("intent_sha256") not in (None, digest):
        raise ValueError("The saved Upsun operation belongs to another reviewed instruction.")
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



def _base(s):
    return "/projects/" + _segment(s.p["project_id"])


def _environment_path(s, environment_id=None):
    return _base(s) + "/environments/" + _segment(environment_id or s.p["native_environment_id"])


def _url(s, path):
    """Only the selected project on the current central API receives credentials."""
    value = parse.urlsplit(parse.urljoin(API_BASE + "/", path))
    hostname = value.hostname or ""
    provider_host = hostname == "api.upsun.com" or hostname.endswith(".platform.sh") or hostname.endswith(".upsun.com")
    native_path = value.path[4:] if value.path.startswith("/api/projects/") else value.path
    if (value.scheme != "https" or not provider_host or value.port not in (None, 443)
            or value.username or value.password or value.fragment
            or not (native_path == _base(s) or native_path.startswith(_base(s) + "/"))):
        raise ValueError("The request must remain on this exact current Upsun project.")
    # The official client likewise retains the configured API authority for HAL references.
    return parse.urlunsplit(("https", "api.upsun.com", native_path, value.query, ""))


def _credential(s):
    key = "access_token_env" if s.p.get("access_token_env") else "api_token_env"
    value = os.environ.get(s.p[key], "")
    if not value or any(c in value for c in ("\r", "\n", "\x00")):
        raise _api().NativeWaiting("The original credential variable is empty or invalid on this host.")
    return key, value


def _auth_body(response):
    expected = getattr(response, "length", None)
    if expected is None:
        expected = getattr(getattr(response, "fp", None), "length", None)
    declared = response.headers.get("Content-Length")
    if expected is None and declared is not None and "chunked" not in response.headers.get("Transfer-Encoding", "").lower():
        expected = int(declared)
    if expected is not None and (type(expected) is not int or expected < 0 or expected > 1048576):
        raise ValueError("The native token response has an invalid declared length.")
    data = response.read(1048577)
    if len(data) > 1048576 or (expected is not None and len(data) != expected):
        raise IOError("The native token response is incomplete or exceeds its bound.")
    return data


def _token(s):
    kind, value = _credential(s)
    if kind == "access_token_env":
        return value
    fingerprint = hashlib.sha256((AUTH_URL + "\x00" + value).encode()).hexdigest()
    cached = _TOKENS.get(fingerprint)
    if cached and cached["expires_at"] > time.time() + 30:
        return cached["token"]
    payload = parse.urlencode({"grant_type": "api_token", "api_token": value}).encode()
    headers = {"Authorization": "Basic " + base64.b64encode(b"platform-api-user:").decode(),
               "Content-Type": "application/x-www-form-urlencoded",
               "Accept": "application/json", "Accept-Encoding": "identity"}
    req = request.Request(AUTH_URL, data=payload, headers=headers, method="POST")
    try:
        with request.build_opener(_api().NoRedirect).open(req, timeout=s.p["timeout_seconds"]) as response:
            data = _auth_body(response)
            native = json.loads(data)
            if response.status != 200 or not isinstance(native, dict) or not native.get("access_token"):
                raise ValueError("The current Upsun account did not return an access token.")
            if not isinstance(native["access_token"], str) or any(c in native["access_token"] for c in ("\r", "\n", "\x00")):
                raise ValueError("The original access token has an invalid native representation.")
            if str(native.get("token_type", "bearer")).lower() != "bearer":
                raise ValueError("Unexpected native token type.")
            expiry = native.get("expires_in")
            if type(expiry) not in (int, float) or expiry <= 0:
                raise ValueError("The original token response has no valid expiry.")
            _TOKENS[fingerprint] = {"token": native["access_token"], "expires_at": time.time() + expiry}
            s.event({"kind": "upsun_auth", "url": AUTH_URL, "status": response.status,
                     "credential_reference": s.p[kind], "expires_in": expiry,
                     "response_bytes": len(data), "observed_at": _api()._now()})
            return native["access_token"]
    except error.HTTPError as exc:
        retained_headers = {k.lower(): v for k, v in exc.headers.items()
                            if k.lower() not in {"set-cookie", "authorization"}}
        if exc.code in {429, 503}:
            _provider_deadline(s, {"url": AUTH_URL, "status": exc.code,
                                  "response_headers": retained_headers})
        facts = {"kind": "upsun_auth", "url": AUTH_URL, "status": exc.code,
                 "credential_reference": s.p[kind], "response_headers": retained_headers,
                 "observed_at": _api()._now()}
        try:
            body = _auth_body(exc)
            facts.update(response_bytes=len(body), response_sha256=hashlib.sha256(body).hexdigest(),
                         body_complete=True)
        except Exception as body_error:
            facts.update(body_complete=False, body_error=type(body_error).__name__)
        finally:
            exc.close()
        s.event(facts)
        raise _api().NativeWaiting("The original Upsun token exchange returned HTTP " + str(exc.code) + ".") from None


def _provider_deadline(s, response=None, url=None):
    kind, value = _credential(s)
    identity = hashlib.sha256((API_BASE + "\x00" + value).encode()).hexdigest()
    root = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local" / "state")))
    if not root.is_absolute():
        raise ValueError("The native provider state directory must be absolute.")
    root = root / "tjl-govhub" / "upsun"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.is_symlink():
        raise ValueError("Use an ordinary native provider state directory.")
    path, lock = root / (identity + ".json"), root / (identity + ".lock")
    with lock.open("a+b") as guard:
        os.chmod(lock, 0o600)
        fcntl.flock(guard.fileno(), fcntl.LOCK_EX)
        current = _read_json(path) if path.exists() else {}
        account = max(float(current.get("not_before", 0)), float(s.state.get("provider_not_before", 0)))
        resources = s.state.setdefault("provider_resource_deadlines", {})
        if response is not None:
            headers = response.get("response_headers", {})
            if response.get("status") in {429, 503} or "retry-after" in headers:
                observed = time.time() + _delay(headers)
                if response.get("status") in {429, 503}:
                    account = max(account, observed)
                    _api()._atomic(path, {"authority": API_BASE, "not_before": account,
                                         "observed_at": _api()._now(), "status": response.get("status"),
                                         "url": response.get("url"),
                                         "retry_after": headers.get("retry-after")})
                else:
                    resource = response["url"]
                    resources[resource] = max(float(resources.get(resource, 0)), observed)
        s.state["provider_not_before"] = account
        selected = url or (response or {}).get("url")
        deadline = max(account, float(resources.get(selected, 0)))
        s.state["provider_request_not_before"] = deadline
        s.state["provider_request_url"] = selected
        s.state["poll_after_seconds"] = max(1, int(deadline - time.time() + 1)) if deadline > time.time() else 0
        s.save_state()
    return deadline


def _http(s, label, path, method="GET", body=None, accept="application/json"):
    """One actual request; complete original body/headers or retained uncertainty."""
    s.check()
    url = _url(s, path)
    deadline = _provider_deadline(s, url=url)
    if time.time() < deadline:
        raise _api().NativeWaiting("Continue after the original Upsun Retry-After deadline: " +
                                   datetime.fromtimestamp(deadline, timezone.utc).isoformat())
    token = _token(s)  # Before the mutation admission record; never replay POST after a 401.
    payload = None if body is None else json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    stem = s.out / (label + "-" + str(time.time_ns()))
    body_path, record_path = Path(str(stem) + ".response"), Path(str(stem) + ".http.json")
    record = {"schema": VERSION, "method": method, "url": url, "started_at": _api()._now(),
              "complete": False, "status": None, "response_headers": {},
              "request_sha256": hashlib.sha256(payload or b"").hexdigest()}
    if payload is not None:
        original = Path(str(stem) + ".input.json")
        original.write_bytes(payload)
        os.chmod(original, 0o600)
        record["input"] = _retain(s, original, "native_request_body")
    _api()._atomic(record_path, record)
    if method != "GET":
        s.state.update(phase="dispatching", mutation_started=True,
                       dispatch_record=str(record_path), dispatch_path=str(body_path),
                       dispatched_at=record["started_at"])
        s.save_state()
    headers = {"Authorization": "Bearer " + token, "Accept": accept,
               "Accept-Encoding": "identity", "User-Agent": "TJL-GovHub-Upsun/1"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = request.Request(url, data=payload, headers=headers, method=method)
    try:
        try:
            response = request.build_opener(_api().NoRedirect).open(req, timeout=s.p["timeout_seconds"])
        except error.HTTPError as exc:
            response = exc
        record.update(status=response.code,
                      response_header_items=list(response.headers.items()),
                      response_headers={k.lower(): v for k, v in response.headers.items()})
        _provider_deadline(s, record)
        encoding = record["response_headers"].get("content-encoding", "identity").lower()
        if encoding not in {"", "identity"}:
            # Retain any encoded original body; JSON parsing then reports its actual encoding.
            record["content_encoding"] = encoding
        expected = getattr(response, "length", None)
        if expected is None:
            expected = getattr(getattr(response, "fp", None), "length", None)
        declared = record["response_headers"].get("content-length")
        if expected is None and declared is not None and "chunked" not in record["response_headers"].get("transfer-encoding", "").lower():
            expected = int(declared)
        if expected is not None and (type(expected) is not int or expected < 0):
            raise ValueError("The original HTTP response has an invalid length.")
        record["expected_body_bytes"] = expected
        count = 0
        with response, body_path.open("wb") as stream:
            os.chmod(body_path, 0o600)
            while True:
                s.check()
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > s.p["max_artifact_bytes"]:
                    raise ValueError("The native response exceeds the configured artifact bound.")
                stream.write(chunk)
                record["received_body_bytes"] = count
            stream.flush()
            os.fsync(stream.fileno())
        if expected is not None and count != expected:
            raise IOError("The native HTTP body ended before its declared length.")
        record.update(complete=True, completed_at=_api()._now(), received_body_bytes=count)
    except BaseException as exc:
        record.update(error={"type": type(exc).__name__, "message": str(exc)}, completed_at=_api()._now())
        if body_path.is_file():
            record["response"] = _api()._file(body_path, "provider_response_partial")
        _api()._atomic(record_path, record)
        _retain(s, record_path, "provider_http_record")
        if body_path.is_file():
            _retain(s, body_path, "provider_response_partial")
        if method != "GET":
            s.state["phase"] = "native_interrupted"
            s.save_state()
        raise
    record["response"] = _retain(s, body_path, "provider_response")
    _api()._atomic(record_path, record)
    _retain(s, record_path, "provider_http_record")
    s.event({"kind": "upsun_http", "method": method, "path": parse.urlsplit(url).path,
             "status": record["status"], "record": str(record_path), "complete": True})
    return record


def _value(result, expected=(200,)):
    if not result.get("complete"):
        raise _api().NativeWaiting("Continue the retained original incomplete response.")
    if result["status"] not in expected:
        if result["status"] in {401, 429, 503}:
            raise _api().NativeWaiting("Upsun returned HTTP " + str(result["status"]) +
                                       "; retain the same operation and its actual response.")
        raise ValueError("Upsun returned HTTP " + str(result["status"]) + "; inspect the original response.")
    if result.get("content_encoding"):
        raise ValueError("The original response used " + result["content_encoding"] +
                         "; its complete encoded bytes are retained.")
    value = _read_json(result["response"]["path"])
    if not isinstance(value, (dict, list)):
        raise ValueError("The native response is not a JSON object or collection.")
    return value


def _object(value, native_id, label):
    if not isinstance(value, dict) or value.get("id") != native_id:
        raise ValueError("The returned original " + label + " identity differs.")
    return value


def _next_link(s, response, value):
    candidates = []
    if isinstance(value, dict):
        link = value.get("_links", {}).get("next")
        if isinstance(link, dict) and link.get("href"):
            candidates.append(link["href"])
    for key, header in response.get("response_header_items", []):
        if key.lower() == "link":
            for part in re.split(r",(?=\s*<)", header):
                match = re.match(r'\s*<([^>]+)>\s*;(.*)', part)
                if match and re.search(r'\brel\s*=\s*["\']?next(?:["\';\s]|$)', match[2]):
                    candidates.append(match[1])
    if not candidates:
        return None
    urls = {_url(s, parse.urljoin(response["url"], item)) for item in candidates}
    if len(urls) != 1:
        raise ValueError("The native next-page links disagree.")
    return urls.pop()


def _collection(s, label, path, collection_name):
    items, pages, seen = [], [], set()
    current = _url(s, path)
    while current:
        s.check()
        if current in seen:
            raise ValueError("The native collection repeats an opaque page URL.")
        seen.add(current)
        response = _http(s, label + "-page-" + str(len(pages)), current)
        value = _value(response)
        if isinstance(value, list):
            rows = value
        elif isinstance(value, dict):
            rows = value.get("_embedded", {}).get(collection_name)
            if rows is None:
                rows = value.get("items")
        else:
            rows = None
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError("The original " + collection_name + " response is not a native collection.")
        items.extend(rows)
        pages.append({"url": response["url"], "response": response["response"], "count": len(rows)})
        current = _next_link(s, response, value)
    ids = [row.get("id") for row in items]
    if any(not isinstance(native_id, str) or not native_id for native_id in ids) or len(ids) != len(set(ids)):
        raise ValueError("The complete native collection has missing or repeated identities.")
    _json_file(s, label + "-pages.json", {"pages": pages, "total": len(items)}, "native_collection_pages")
    return items


def _inventory(s, label):
    project = _object(_value(_http(s, label + "-project", _base(s))), s.p["project_id"], "project")
    environments = _collection(s, label + "-environments", _base(s) + "/environments", "environments")
    environment = _object(_value(_http(s, label + "-environment", _environment_path(s))),
                          s.p["native_environment_id"], "environment")
    if environment.get("project") not in (None, s.p["project_id"]):
        raise ValueError("The selected environment names another project.")
    if environment["id"] not in {row["id"] for row in environments}:
        raise ValueError("The selected environment is absent from this original project.")
    backups = _collection(s, label + "-backups", _environment_path(s) + "/backups", "backups")
    activities = _collection(s, label + "-activities", _base(s) + "/activities", "activities")
    staged_activities = _collection(s, label + "-staged-activities",
                                    _environment_path(s) + "/activities?state=staged", "activities")
    deployments = _collection(s, label + "-deployments", _environment_path(s) + "/deployments", "deployments")
    response = _http(s, label + "-current-deployment", _environment_path(s) + "/deployments/current")
    current = None if response.get("complete") and response.get("status") == 404 else _value(response)
    if current is not None and not isinstance(current, dict):
        raise ValueError("The native current deployment is not an object.")
    parent_environment, parent_deployment, parent_deployment_status = None, None, None
    if environment.get("parent"):
        parent_id = _id(environment["parent"], "parent environment")
        parent_environment = _object(_value(_http(s, label + "-parent",
                                                  _environment_path(s, parent_id))),
                                     parent_id, "parent environment")
        parent_response = _http(s, label + "-parent-deployment",
                                _environment_path(s, parent_id) + "/deployments/current")
        parent_deployment_status = parent_response["status"]
        parent_deployment = (None if parent_response.get("complete") and parent_deployment_status == 404
                             else _value(parent_response))
    inventory = {"project": project, "environment": environment, "environments": environments,
                 "backups": backups, "activities": activities, "staged_activities": staged_activities, "deployments": deployments,
                 "current_deployment": current, "current_deployment_status": response["status"],
                 "parent_environment": parent_environment, "parent_current_deployment": parent_deployment,
                 "parent_current_deployment_status": parent_deployment_status,
                 "observed_at": _api()._now()}
    _json_file(s, label + "-inventory.json", inventory, "provider_inventory")
    return inventory


def _action_link(resource, action, expected):
    relation = resource.get("_links", {}).get("#" + action)
    if not isinstance(relation, dict) or not isinstance(relation.get("href"), str):
        raise ValueError("The current native resource does not offer the selected " + action + " operation.")
    original = parse.urlsplit(relation["href"])
    if original.query or original.fragment:
        raise ValueError("The native action link has additional parameters requiring its original review.")
    path = original.path
    # Regional HAL references use /api/projects; dispatch remains on the official central origin.
    if path.startswith("/api/projects/"):
        path = path[4:]
    if path != expected:
        raise ValueError("The original native action link names a different resource.")
    meta = relation.get("meta")
    if isinstance(meta, dict) and meta.get("method") and str(meta["method"]).upper() != "POST":
        raise ValueError("The original native action uses a different HTTP method.")
    return relation


def _source(s, inventory):
    from upsun_source import capture_source
    selection = dict(s.p)
    if not selection.get("source_revision"):
        selection["source_revision"] = inventory["environment"].get("head_commit")
    value = capture_source(s, inventory, selection)
    if not isinstance(value, dict):
        raise ValueError("The complete native source receiver returned no source manifest.")
    for item in list(s.artifacts):
        if not any(x["path"] == item["path"] for x in s.state.setdefault("retained_artifacts", [])):
            s.state["retained_artifacts"].append(item)
    s.state["source"] = value
    s.save_state()
    return value


def _source_binding(inventory, action):
    result = {"environment_id": inventory["environment"]["id"],
              "head_commit": inventory["environment"].get("head_commit"),
              "deployment_id": (inventory.get("current_deployment") or {}).get("id")}
    if action in {"merge", "synchronize"}:
        parent = inventory.get("parent_environment") or {}
        result["parent"] = {"id": inventory["environment"].get("parent"),
                            "observed_id": parent.get("id"), "head_commit": parent.get("head_commit"),
                            "deployment_id": (inventory.get("parent_current_deployment") or {}).get("id")}
    if action == "deploy":
        result["staged_activities"] = sorted(row["id"] for row in inventory["staged_activities"]
            if row.get("state") == "staged" and inventory["environment"]["id"] in row.get("environments", []))
    return result


def _request_body(s, action, operation, inventory):
    p, environment = s.p, inventory["environment"]
    endpoint = "backup" if action == "backup-create" else "restore" if action == "restore-backup" else action
    expected_head = p.get("source_revision")
    if action != "backup-create" and not expected_head:
        raise ValueError("Select the reviewed original source commit before this lifecycle operation.")
    if expected_head and environment.get("head_commit") != expected_head:
        raise ValueError("The selected native environment no longer has the reviewed original commit.")
    purpose = operation["type"]
    if purpose == "PREVIEW" and action != "branch" and (
            environment.get("type") == "production" or environment.get("is_main")):
        raise ValueError("Preview activation and redeployment require an actual nonproduction environment.")
    path = _environment_path(s) + "/" + endpoint
    resource = environment
    body = None
    affected = [environment["id"]]
    if action == "branch":
        name = _id(p.get("branch_name"), "new child name")
        title = p.get("branch_title")
        if not isinstance(title, str) or not title.strip() or len(title) > 1024:
            raise ValueError("Supply the reviewed native child title.")
        if any(row.get("id") == name or row.get("name") == name for row in inventory["environments"]):
            raise ValueError("The selected child already exists. Continue its original operation or select it directly.")
        body = {"name": name, "title": title, "clone_parent": p["clone_parent"], "type": p["branch_type"]}
        affected.append(name)
    elif action in {"synchronize", "merge"}:
        parent = p.get("parent_environment_id")
        if not parent or environment.get("parent") != parent:
            raise ValueError("Select the exact current parent for this reviewed native operation.")
        original_parent = next((row for row in inventory["environments"] if row["id"] == parent), None)
        if original_parent is None:
            raise ValueError("The reviewed parent is missing from the actual project.")
        affected.append(parent)
        if action == "synchronize":
            if not any(p[k] for k in ("synchronize_code", "synchronize_data", "synchronize_resources")):
                raise ValueError("Choose the actual code, data or resource synchronization.")
            if p["rebase"] and not p["synchronize_code"]:
                raise ValueError("The rebase option requires code synchronization.")
            body = {k: p[k] for k in ("synchronize_code", "synchronize_data", "synchronize_resources", "rebase")}
        else:
            body = {}
    elif action == "backup-create":
        body = {"safe": p["safe_backup"]}
    elif action == "restore-backup":
        backup = next((row for row in inventory["backups"] if row["id"] == p.get("backup_id")), None)
        if backup is None or backup.get("environment") != environment["id"]:
            raise ValueError("Select the actual original snapshot belonging to this environment.")
        if backup.get("restorable") is not True or backup.get("status") != "CREATED":
            raise ValueError("The selected native snapshot is not currently restorable.")
        resource = _object(_value(_http(s, "selected-backup",
                            _environment_path(s) + "/backups/" + _segment(backup["id"]))),
                           backup["id"], "backup")
        path = _environment_path(s) + "/backups/" + _segment(backup["id"]) + "/restore"
        body = {"restore_code": p["restore_code"], "restore_resources": p["restore_resources"]}
        if resource.get("environment") != environment["id"] or resource.get("restorable") is not True or resource.get("status") != "CREATED":
            raise ValueError("The selected snapshot changed before the original restore request.")
        s.state["selected_backup"] = resource
    elif action == "deploy":
        if p["deployment_strategy"] == "rolling" and environment.get("can_rolling_deploy") is not True:
            raise ValueError("The original environment does not offer rolling deployment.")
        if not _source_binding(inventory, action)["staged_activities"]:
            raise ValueError("The selected environment has no original staged activities to deploy.")
        body = {"strategy": p["deployment_strategy"]}
    elif action == "activate":
        body = {}
    elif action != "redeploy":
        raise ValueError("Unknown original Upsun lifecycle action.")
    init = p.get("resources_init")
    if init:
        allowed = {"branch": {"default", "minimum", "parent"},
                   "activate": {"default", "minimum", "parent"},
                   "merge": {"child", "default", "manual", "minimum"},
                   "restore-backup": {"backup", "default", "minimum", "parent"}}
        if init not in allowed.get(action, set()):
            raise ValueError("This resource initialization is not declared for the selected native action.")
        body["resources"] = {"init": init}
    link = _action_link(resource, endpoint, path)
    s.state["affected_environment_ids"] = affected
    s.state["native_action_link"] = link
    return path, body


def _activity(s, row, action, *, association=False, primary=False):
    native_id = _id(row.get("id"), "activity") if isinstance(row, dict) else None
    if not native_id or row.get("project") != s.p["project_id"]:
        raise ValueError("The actual activity belongs to another project.")
    environments = row.get("environments")
    if not isinstance(environments, list) or not set(environments).intersection(s.state["affected_environment_ids"]):
        raise ValueError("The actual activity does not involve this original selected environment.")
    staged = action == "deploy" and native_id in s.state.get("before_staged_activity_ids", [])
    if association or primary:
        if not staged and row.get("type") not in ACTIVITY_TYPES[action]:
            raise ValueError("The selected activity has a different native lifecycle purpose.")
    if association:
        if native_id in s.state.get("before_activity_ids", []) and not staged:
            raise ValueError("The selected activity existed before this original operation.")
        parameters = row.get("parameters") or {}
        if not isinstance(parameters, dict):
            raise ValueError("The native activity parameters are not an object.")
        body = s.state["request"].get("body") or {}
        matched, omitted = [], []
        for key, expected in body.items():
            if key in parameters:
                if parameters[key] != expected:
                    raise ValueError("The native activity contradicts the reviewed parameter " + key + ".")
                matched.append(key)
            else:
                omitted.append(key)
        return {"id": native_id, "type": row.get("type"),
                "matched_parameter_names": matched, "parameters_not_exposed": omitted,
                "request_sha256": s.state["request_sha256"], "native_parameters": parameters,
                "selection": "explicit-original-operation-association"}
    return {"id": native_id, "type": row.get("type")}


def _accept(s, response, action):
    status = response.get("status")
    if not response.get("complete"):
        raise _api().NativeWaiting("Continue the same original dispatch after its interrupted response.")
    if status == 429:
        s.state.update(phase="rate_limited", mutation_started=False)
        s.save_state()
        raise _api().NativeWaiting("The native request was rate limited; its original deadline is retained.")
    if isinstance(status, int) and 400 <= status < 500:
        s.state.update(phase="failed", native_failure={"status": status, "response": response})
        s.save_state()
        raise ValueError("The original native mutation returned HTTP " + str(status) + ".")
    if not isinstance(status, int) or not 200 <= status < 300:
        s.state["phase"] = "native_interrupted"
        s.save_state()
        raise _api().NativeWaiting("The mutation response is uncertain; associate the actual original activity.")
    value = _value(response, tuple(range(200, 300)))
    embedded = value.get("_embedded", {}) if isinstance(value, dict) else {}
    activities = embedded.get("activities")
    if not isinstance(activities, list) or not activities:
        s.state.update(phase="native_interrupted", accepted_response=value)
        s.save_state()
        raise _api().NativeWaiting("The accepted response has no complete activity list; select its original native activity.")
    ids = []
    for row in activities:
        ids.append(_activity(s, row, action)["id"])
    if len(ids) != len(set(ids)):
        raise ValueError("The accepted native response repeats an activity identity.")
    # Auxiliary native activities stay in the complete set. The original returned response
    # is the direct request association, so do not assume every activity has the primary type.
    s.state.update(phase="accepted", accepted_response=value,
                   accepted_entity=embedded.get("entity"),
                   native_poll={"provider": "upsun", "ids": ids, "id": ids[0], "action": action},
                   native_resume={"provider": "upsun", "activity_ids": ids,
                                  "request_sha256": s.state["request_sha256"]})
    s.save_state()


def _associate(s, operation, action):
    selected = operation.get("upsun_activity_association") or {}
    if not selected:
        return False
    if not selected.get("reason") or selected.get("request_sha256") != s.state.get("request_sha256"):
        raise ValueError("The selected native activity belongs to another original request.")
    ids = selected.get("ids") or [selected.get("id")]
    ids = [_id(value, "activity") for value in ids]
    if len(ids) != len(set(ids)):
        raise ValueError("The selected original activity set repeats an ID.")
    if action == "deploy" and not set(s.state.get("before_staged_activity_ids", [])).issubset(ids):
        raise ValueError("Controlled deployment recovery must retain the complete original staged activity set.")
    matches = []
    for native_id in ids:
        row = _object(_value(_http(s, "associated-activity",
                                  _base(s) + "/activities/" + _segment(native_id))),
                      native_id, "activity")
        matches.append(_activity(s, row, action, association=True))
    s.state.update(phase="accepted", association=selected, associated_request=matches,
                   native_poll={"provider": "upsun", "ids": ids, "id": ids[0], "action": action},
                   native_resume={"provider": "upsun", "activity_ids": ids,
                                  "request_sha256": s.state["request_sha256"]})
    s.save_state()
    return True


def _poll(s, action):
    pending = s.state["native_poll"]
    current = []
    for native_id in pending["ids"]:
        row = _object(_value(_http(s, "activity-" + native_id,
                                  _base(s) + "/activities/" + _segment(native_id))),
                      native_id, "activity")
        _activity(s, row, action)
        current.append(row)
    s.state["last_activities"] = current
    s.state["poll_after_seconds"] = max(10, int(s.state.get("poll_after_seconds", 0)))
    s.save_state()
    if any(row.get("state") not in {"complete", "cancelled"} for row in current):
        raise _api().NativeWaiting("The original native activities are still pending; continue the same operation.")
    for row in current:
        native_id = row["id"]
        if native_id in s.state.setdefault("complete_activity_logs", {}):
            continue
        response = _http(s, "complete-activity-log-" + native_id,
                         _base(s) + "/activities/" + _segment(native_id) + "/log", accept="text/plain")
        if not response.get("complete") or response.get("status") != 200:
            raise _api().NativeWaiting("The native activity is terminal; retain its full original log before completing.")
        s.state["complete_activity_logs"][native_id] = response
        s.save_state()
    failures = [{"id": row["id"], "state": row.get("state"), "result": row.get("result"),
                 "failure_reason": row.get("failure_reason"),
                 "failed_commands": [command for command in row.get("commands", [])
                                     if command.get("exit_code") not in (None, 0)]}
                for row in current if row.get("state") != "complete" or row.get("result") != "success"
                or any(command.get("exit_code") not in (None, 0) for command in row.get("commands", []))]
    if failures:
        s.state.update(phase="failed", native_failure=failures)
        _json_file(s, "terminal-native-activities.json", {"activities": current, "failures": failures},
                   "native_activity_result")
        s.save_state()
        raise ValueError("The original native lifecycle finished with retained failures; inspect its activities and logs.")
    inventory = _inventory(s, "completed")
    selected = inventory["environment"]
    if action == "branch":
        entity = s.state.get("accepted_entity")
        candidates = [row for row in inventory["environments"] if
                      row.get("id") == s.p["branch_name"] or row.get("name") == s.p["branch_name"]]
        if isinstance(entity, dict) and entity.get("id"):
            candidates = [row for row in inventory["environments"] if row["id"] == entity["id"]]
        if len(candidates) != 1 or candidates[0].get("parent") != s.p["native_environment_id"]:
            raise ValueError("The completed branch cannot be bound to its original parent and name.")
        selected = candidates[0]
    elif action == "merge":
        selected = next((row for row in inventory["environments"]
                         if row["id"] == s.p["parent_environment_id"]), None)
        if selected is None:
            raise ValueError("The completed merge target is absent from its original project.")
    new_backups = [row for row in inventory["backups"] if row["id"] not in s.state.get("before_backup_ids", [])]
    if action == "backup-create" and not new_backups:
        raise _api().NativeWaiting("The original backup activity succeeded; its snapshot has not appeared in native inventory.")
    if action == "restore-backup" and s.p["restore_code"]:
        expected = s.state["selected_backup"].get("commit_id")
        if selected.get("head_commit") != expected:
            raise ValueError("The restored environment does not match its selected snapshot's original commit.")
    return _finish(s, {"native_action": "upsun-" + action, "activities": current,
                       "activity_ids": pending["ids"], "native_inventory": inventory,
                       "affected_environment": selected, "source": s.state.get("source"),
                       "selected_backup": s.state.get("selected_backup"),
                       "new_backups": new_backups, "native_result": "success",
                       "request_sha256": s.state["request_sha256"]})


def _finish(s, observations):
    value = {"schema": VERSION, "intent_sha256": s.state["intent_sha256"],
             "provider_context": provider_context(s.p), "observations": observations,
             "artifacts": list(s.state.get("retained_artifacts", []))}
    _json_file(s, "upsun-completed-operation.json", value, "restored_native_status")
    s.state.update(phase="completed", completion=str(s.out / "upsun-completed-operation.json"))
    s.save_state()
    return _completed(s, value)


def _completed(s, value):
    if value["intent_sha256"] != s.state["intent_sha256"]:
        raise ValueError("The completed native source belongs to another original instruction.")
    s.artifacts = []
    for item in value["artifacts"]:
        current = _api()._file(s.private_path(item["path"]), item["role"])
        if current["sha256"] != item["sha256"] or current["size"] != item["size"]:
            raise ValueError("A retained original Upsun artifact changed.")
        s.add(current["path"], item["role"])
    s.add(s.out / "upsun-completed-operation.json", "restored_native_status")
    result = s.result("COMPLETE", value["observations"])
    result["native_resume"] = s.state.get("native_resume", {})
    return result


def _failure(s, exc):
    if isinstance(exc, _api().NativeCancelled):
        status = "WAITING_NATIVE" if s.state.get("mutation_started") else "CANCELLED"
    elif isinstance(exc, _api().NativeWaiting) or s.state.get("phase") in {
            "dispatching", "native_interrupted", "accepted", "rate_limited"}:
        status = "WAITING_NATIVE"
    else:
        status = "FAILED"
    s.artifacts = list(s.state.get("retained_artifacts", []))
    result = s.result(status, message=str(exc))
    result["native_resume"] = s.state.get("native_resume", {})
    result["safe_to_retry"] = not s.state.get("mutation_started") or s.state.get("phase") in {
        "failed", "completed", "rate_limited"}
    if pollable(s.state):
        result["poll_after_seconds"] = max(10, min(int(s.state.get("poll_after_seconds", 15)), 3600))
    return result


def _identity_binding(s, operation_id, action, config):
    _intent(s, {"action": action, "operation_id": operation_id,
                "target": provider_context(s.p),
                "profile": {k: v for k, v in config.items() if k not in RUNTIME_FIELDS}})


def discover_capabilities(config, runtime_bindings=None):
    result = {"ready": False, "actions": [], "configuration": dict(config), "current_config": dict(config)}
    try:
        p = profile(config, runtime_bindings)
        with tempfile.TemporaryDirectory(prefix="govhub-upsun-capabilities-") as folder:
            s = _api().Session(p, folder)
            _state(s)
            inventory = _inventory(s, "capability")
            environment = inventory["environment"]
            result.update(ready=True, target_fingerprint=_api()._digest(provider_context(p)),
                          native_inventory=inventory,
                          native_status={"project_id": p["project_id"],
                              "environment_id": p["native_environment_id"],
                              "head_commit": environment.get("head_commit"),
                              "type": environment.get("type"), "status": environment.get("status"),
                              "parent": environment.get("parent"),
                              "current_deployment_id": (inventory["current_deployment"] or {}).get("id"),
                              "available_native_actions": [key[1:] for key in environment.get("_links", {})
                                                           if key.startswith("#")]},
                          actions=[item for kind in KINDS for item in actions_for(kind)])
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
        _identity_binding(s, context.get("operation_id"), "capture", config)
        completed = s.out / "upsun-completed-operation.json"
        if completed.exists():
            return _completed(s, s.read_private_json(completed))
        inventory = s.state.get("capture_inventory")
        if inventory is None:
            inventory = _inventory(s, "original")
            s.state["capture_inventory"] = inventory
            s.save_state()
        if p.get("source_revision") and inventory["environment"].get("head_commit") != p["source_revision"]:
            raise ValueError("The captured original head differs from the selected source commit.")
        source = _source(s, inventory)
        following = _inventory(s, "following-source")
        if (following["environment"].get("head_commit") != inventory["environment"].get("head_commit")
                or (following["current_deployment"] or {}).get("id") !=
                   (inventory["current_deployment"] or {}).get("id")):
            s.state["capture_changed"] = {"before": inventory, "after": following}
            s.save_state()
            raise ValueError("The native code or deployment changed during source receiving; every original capture remains retained.")
        return _finish(s, {"native_action": "upsun-capture", "native_inventory": inventory,
                          "following_inventory": following, "source": source,
                          "source_consistency": "same-head-and-deployment; independently observed database and mounts"})
    except Exception as exc:
        return _failure(s, exc)


def execute(operation, config, source_paths, checkpoint=None, cancelled=None):
    p = profile(config, operation.get("runtime_bindings"))
    s = _api().Session(p, source_paths["output_dir"], checkpoint, cancelled,
                       source_paths.get("workspace_relocations"))
    try:
        _state(s, source_paths.get("checkpoint") or operation.get("resume_checkpoint"))
        action = str(operation.get("native_action", "")).removeprefix("upsun-")
        if action == "capture" or action not in KINDS.get(operation.get("type"), []):
            raise ValueError("Select the native action belonging to this original reviewed purpose.")
        if operation.get("provider_environment_id") != p["environment_id"]:
            raise ValueError("The original operation names another provider environment.")
        expected = operation.get("target_fingerprint") or config.get("target_fingerprint")
        if expected and expected != _api()._digest(provider_context(p)):
            raise ValueError("The original native target fingerprint changed.")
        _identity_binding(s, operation["id"], action, config)
        completed = s.out / "upsun-completed-operation.json"
        if completed.exists():
            return _completed(s, s.read_private_json(completed))
        if s.state.get("phase") == "failed":
            raise ValueError("This original operation has a terminal native failure; inspect its retained response.")
        if s.state.get("phase") == "accepted":
            return _poll(s, action)
        if s.state.get("phase") in {"dispatching", "native_interrupted"}:
            saved = s.state.get("dispatch_record")
            if saved and Path(saved).is_file():
                response = s.read_private_json(saved)
                if response.get("complete"):
                    try:
                        _accept(s, response, action)
                    except _api().NativeWaiting:
                        if s.state.get("phase") == "rate_limited":
                            raise
                    except (ValueError, KeyError, TypeError) as exc:
                        if s.state.get("phase") == "failed":
                            raise
                        s.state["acceptance_read_error"] = str(exc)
                        s.save_state()
                    if s.state.get("phase") == "accepted":
                        return _poll(s, action)
            if _associate(s, operation, action):
                return _poll(s, action)
            candidates = _collection(s, "original-dispatch-candidates", _base(s) + "/activities", "activities")
            s.state["candidate_activities"] = [row for row in candidates
                                              if row["id"] not in s.state.get("before_activity_ids", [])]
            s.state["native_resume"] = {"provider": "upsun", "activity_ids": [],
                                      "request_sha256": s.state.get("request_sha256"),
                                      "candidate_activities": s.state["candidate_activities"]}
            s.save_state()
            raise _api().NativeWaiting("Select the actual original activity to recover this dispatch without repeating it.")
        if s.state.get("phase") == "rate_limited" and time.time() < s.state.get("provider_not_before", 0):
            raise _api().NativeWaiting("The original native Retry-After deadline has not elapsed.")
        inventory = _inventory(s, "before")
        # Native snapshots need only their own provider operation. Other content-changing
        # actions retain the full selected code/database/mount source before dispatch.
        if action in {"synchronize", "restore-backup", "merge", "deploy", "redeploy"}:
            if "source_inventory" not in s.state:
                s.state["source_inventory"] = inventory
                s.save_state()
            source = _source(s, s.state["source_inventory"])
            inventory = _inventory(s, "before-dispatch")
            if _source_binding(s.state["source_inventory"], action) != _source_binding(inventory, action):
                s.state["changed_source_binding"] = {
                    "before": _source_binding(s.state["source_inventory"], action),
                    "after": _source_binding(inventory, action)}
                s.save_state()
                raise ValueError("The original environment or reviewed parent head/deployment changed during source capture.")
        else:
            source = None
        path, body = _request_body(s, action, operation, inventory)
        instruction = {"method": "POST", "path": path, "body": body}
        request_sha = _api()._digest(instruction)
        if s.state.get("request_sha256") not in (None, request_sha):
            raise ValueError("The original prepared native request changed.")
        s.state.update(phase="prepared", request=instruction, request_sha256=request_sha,
                       before_activity_ids=[row["id"] for row in inventory["activities"]],
                       before_staged_activity_ids=[row["id"] for row in inventory["staged_activities"]
                           if row.get("state") == "staged" and p["native_environment_id"] in row.get("environments", [])],
                       before_backup_ids=[row["id"] for row in inventory["backups"]],
                       before_environment_ids=[row["id"] for row in inventory["environments"]],
                       before=inventory, source=source)
        s.save_state()
        response = _http(s, "dispatch", path, method="POST", body=body)
        _accept(s, response, action)
        return _poll(s, action)
    except Exception as exc:
        return _failure(s, exc)
