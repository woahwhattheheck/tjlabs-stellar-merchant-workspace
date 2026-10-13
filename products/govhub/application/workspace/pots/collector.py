"""Receive one original CircleCI V3 run and its complete available outputs.

Python 3.11+, standard library only. The selected account supplies CIRCLE_TOKEN.
All network actions are GET. Original API/stream bytes remain private and are
stored once by SHA-256; every observation retains the native request and status.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time
from urllib import error, parse, request

SCHEMA = "govhub.pots.native-receiving/v1"
API = "https://circleci.com/api/v3"
REFERENCE = "https://circleci.com/fullopenapi.json"
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
HEADERS = {"content-type", "content-length", "content-range", "content-encoding",
           "etag", "last-modified", "cache-control", "retry-after",
           "ratelimit", "ratelimit-policy", "deprecation", "sunset", "date"}


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def identifier(value, label="native ID"):
    if not isinstance(value, str) or not UUID.fullmatch(value.lower()):
        raise ValueError(label + " must be the full native UUID.")
    return value.lower()


def strict_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ValueError("Repeated JSON member in original response: " + key)
            value[key] = item
        return value
    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs)


def sha_file(path):
    digest, size = hashlib.sha256(), 0
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            size += len(block)
            digest.update(block)
    return {"sha256": digest.hexdigest(), "bytes": size}


def atomic(path, value):
    raw = (packed(value) + "\n").encode("utf-8")
    fd, name = tempfile.mkstemp(prefix="." + path.name + "-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o600)
        os.replace(name, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def regular(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError("Use an ordinary private receiving file.")
    return path


class ReceivingError(Exception):
    def __init__(self, message, status=None, retry_at=None, record=None):
        super().__init__(message)
        self.status, self.retry_at, self.record = status, retry_at, record


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def allowed_artifact(url):
    parsed = parse.urlsplit(url)
    host = (parsed.hostname or "").lower()
    if (parsed.scheme != "https" or parsed.username or parsed.password
            or parsed.port not in (None, 443) or parsed.fragment):
        raise ValueError("Use the original HTTPS CircleCI artifact locator.")
    hosted = (host == "circleci.com" or host.endswith(".circle-artifacts.com")
              or host == "circle-artifacts.com")
    s3 = (host.endswith(".amazonaws.com")
          and (".s3." in host or ".s3-" in host or host.endswith(".s3.amazonaws.com")))
    if not (hosted or s3):
        raise ValueError("The original artifact uses an unsupported receiving host: " + host)
    return parsed, hosted


class Collector:
    def __init__(self, output, intent, token_env="CIRCLE_TOKEN",
                 max_file_bytes=1024**3, max_total_bytes=8*1024**3, timeout=120):
        self.root = Path(output).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.root, 0o700)
        self.objects = self.root / "objects"
        self.objects.mkdir(exist_ok=True, mode=0o700)
        if self.objects.is_symlink():
            raise ValueError("The original objects directory must be an ordinary directory.")
        self.lock = (self.root / ".receiving.lock").open("a+b")
        os.chmod(self.root / ".receiving.lock", 0o600)
        try:
            fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ReceivingError("This original receiving operation is already running.") from exc
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", token_env):
            raise ValueError("Select the name of the existing private token environment variable.")
        self.token = os.environ.get(token_env, "")
        if not self.token:
            raise ValueError("The selected private CircleCI token is not available in this process.")
        if "\n" in self.token or "\r" in self.token:
            raise ValueError("The selected token contains invalid header characters.")
        self.max_file_bytes = max_file_bytes
        self.max_total_bytes = max_total_bytes
        self.timeout = timeout
        self.opener = request.build_opener(NoRedirect())
        self.intent_path = self.root / "receiving-intent.json"
        if self.intent_path.exists():
            old = strict_json(regular(self.intent_path).read_bytes())
            if old != intent:
                raise ValueError("This directory belongs to different original receiving input.")
        else:
            atomic(self.intent_path, intent)
        self.state_path = self.root / "receiving-state.json"
        self.state = strict_json(regular(self.state_path).read_bytes()) if self.state_path.exists() else {
            "schema": SCHEMA, "intent": intent, "started_at": now(), "responses": {}, "files": {}}
        if self.state.get("intent") != intent:
            raise ValueError("The retained receiving intent changed.")
        self.total_bytes = sum(item["bytes"] for item in self.state["files"].values())

    def close(self):
        if self.lock:
            self.token = ""
            fcntl.flock(self.lock.fileno(), fcntl.LOCK_UN)
            self.lock.close()
            self.lock = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def save(self):
        atomic(self.state_path, self.state)

    def file(self, item):
        value = item["path"]
        if not re.fullmatch(r"objects/[0-9a-f]{64}", value):
            raise ValueError("An original receiving object path changed.")
        path = regular(self.root / value)
        if sha_file(path) != {"sha256": item["sha256"], "bytes": item["bytes"]}:
            raise ValueError("An original received file changed.")
        return path

    def _store_response(self, response, max_bytes):
        fd, temporary = tempfile.mkstemp(prefix=".receive-", dir=self.objects)
        digest, count = hashlib.sha256(), 0
        try:
            with os.fdopen(fd, "wb") as stream:
                while True:
                    block = response.read(1024 * 1024)
                    if not block:
                        break
                    count += len(block)
                    if count > max_bytes or self.total_bytes + count > self.max_total_bytes:
                        raise ReceivingError("The selected receiving byte allowance was reached; "
                                             "retain this directory and resume with the needed allowance.")
                    digest.update(block)
                    stream.write(block)
                stream.flush()
                os.fsync(stream.fileno())
            expected = response.headers.get("Content-Length")
            if expected is not None and (not expected.isdigit() or int(expected) != count):
                raise ReceivingError("The original response ended before its declared byte length.")
            identity = digest.hexdigest()
            target = self.objects / identity
            if target.exists():
                if sha_file(regular(target)) != {"sha256": identity, "bytes": count}:
                    raise ReceivingError("An existing receiving object has different bytes.")
                os.unlink(temporary)
            else:
                os.chmod(temporary, 0o600)
                os.link(temporary, target)
                os.unlink(temporary)
                directory_fd = os.open(self.objects, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            item = {"path": "objects/" + identity, "sha256": identity, "bytes": count}
            if item["path"] not in self.state["files"]:
                self.total_bytes += count
                self.state["files"][item["path"]] = item
            return item
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def get(self, key, url, *, artifact=False, max_bytes=None):
        retained = self.state["responses"].get(key)
        if retained and retained.get("state") == "received":
            if retained["request"]["url"] != url:
                raise ValueError("A retained request key belongs to a different native URL.")
            self.file(retained["body"])
            return retained
        retry_at = self.state.get("retry_at")
        if retry_at and time.time() < retry_at:
            raise ReceivingError("The original provider retry time has not arrived.",
                                 status=429, retry_at=retry_at)
        if not artifact and not url.startswith(API + "/"):
            raise ValueError("API requests retain the original CircleCI V3 origin.")
        initial_url, current, redirects = url, url, []
        started_at = now()
        while True:
            if artifact:
                parsed, attach_token = allowed_artifact(current)
            else:
                parsed = parse.urlsplit(current)
                attach_token = parsed.hostname == "circleci.com"
            headers = {"Accept": "*/*" if artifact else "application/json",
                       "Accept-Encoding": "identity",
                       "User-Agent": "GovHub-POTS-Receiving/1"}
            if attach_token:
                headers["Authorization"] = "Bearer " + self.token
            try:
                response = self.opener.open(request.Request(current, headers=headers, method="GET"),
                                            timeout=self.timeout)
            except error.HTTPError as exc:
                response = exc
            except (error.URLError, TimeoutError, OSError) as exc:
                self.state["responses"][key] = {"state": "transport_error",
                    "request": {"method": "GET", "url": initial_url},
                    "started_at": started_at, "received_at": now(),
                    "error_type": type(exc).__name__}
                self.save()
                raise ReceivingError("The original native GET did not complete; rerun the same "
                                     "receiving command to continue.", record=key) from exc
            with response:
                status_code = response.code
                if status_code in (301, 302, 303, 307, 308) and artifact:
                    location = response.headers.get("Location")
                    if not location or len(redirects) >= 5:
                        raise ReceivingError("The native artifact redirect did not resolve.",
                                             status=status_code, record=key)
                    target = parse.urljoin(current, location)
                    allowed_artifact(target)
                    redirects.append({"status": status_code, "from": current, "to": target})
                    current = target
                    continue
                encoding = response.headers.get("Content-Encoding", "identity")
                if encoding.lower() not in ("", "identity"):
                    raise ReceivingError("The native response ignored identity content encoding.",
                                         status=status_code, record=key)
                limit = max_bytes or self.max_file_bytes
                body = self._store_response(response, min(limit, 16*1024**2)
                                            if status_code >= 400 else limit)
                native_headers = {k.lower(): v for k, v in response.headers.items()
                                  if k.lower() in HEADERS}
                record = {"state": "received" if 200 <= status_code < 300 else "http_error",
                          "request": {"method": "GET", "url": initial_url},
                          "response_url": current, "redirects": redirects,
                          "started_at": started_at, "received_at": now(),
                          "status": status_code, "headers": native_headers, "body": body}
                self.state["responses"][key] = record
                if status_code == 429:
                    value = response.headers.get("Retry-After", "")
                    try:
                        retry = time.time() + max(1, int(value))
                    except ValueError:
                        try:
                            retry = parsedate_to_datetime(value).timestamp()
                        except (ValueError, TypeError):
                            prior_wait = self.state.get("rate_wait_seconds", 15)
                            retry = time.time() + min(prior_wait * 2, 900)
                    self.state["retry_at"] = max(time.time() + 1, retry)
                    self.state["rate_wait_seconds"] = int(self.state["retry_at"] - time.time())
                elif 200 <= status_code < 300:
                    self.state.pop("retry_at", None)
                self.save()
                if not 200 <= status_code < 300:
                    raise ReceivingError("CircleCI returned HTTP " + str(status_code)
                                         + " for the original " + key + " request.",
                                         status=status_code,
                                         retry_at=self.state.get("retry_at"), record=key)
                return record

    def api(self, key, path, query=None):
        url = API + path
        if query:
            url += "?" + parse.urlencode(query)
        record = self.get(key, url, max_bytes=32*1024**2)
        data = strict_json(self.file(record["body"]).read_bytes())
        if not isinstance(data, dict):
            raise ReceivingError("The original CircleCI response is not an object.", record=key)
        return data

    def resource(self, kind, native_id, *, suffix=""):
        native_id = identifier(native_id, kind + " ID")
        key = kind + "/" + native_id + suffix
        value = self.api(key, "/" + kind + "/" + native_id)
        data = value.get("data")
        if not isinstance(data, dict) or identifier(data.get("id"), kind + " response ID") != native_id:
            raise ReceivingError("The original CircleCI resource does not match its requested ID.",
                                 record=key)
        if not isinstance(data.get("attributes"), dict):
            raise ReceivingError("The original resource has no attributes object.", record=key)
        return key, data

    def collection(self, key, path, query=None, *, paginated=False):
        rows, page_keys, cursor, seen_cursors = [], [], None, set()
        while True:
            args = dict(query or {})
            if cursor is not None:
                args["page[cursor]"] = cursor
            page_key = key + "/page-" + str(len(page_keys) + 1)
            value = self.api(page_key, path, args)
            if not isinstance(value.get("data"), list):
                raise ReceivingError("The original collection does not contain a data array.",
                                     record=page_key)
            rows.extend(value["data"])
            page_keys.append(page_key)
            if not paginated:
                if value.get("page", {}).get("next") is not None:
                    raise ReceivingError("The original unpaged collection now supplies pagination; "
                                         "receive the updated native contract.", record=page_key)
                break
            page = value.get("page")
            if not isinstance(page, dict) or "next" not in page:
                raise ReceivingError("The original paginated collection has no terminal cursor.",
                                     record=page_key)
            cursor = page["next"]
            if cursor is None:
                break
            if not isinstance(cursor, str) or not cursor or cursor in seen_cursors:
                raise ReceivingError("The original collection repeated an invalid cursor.",
                                     record=page_key)
            seen_cursors.add(cursor)
        return page_keys, rows

    @staticmethod
    def bound(data, name, expected):
        actual = data.get("references", {}).get(name, {}).get("id")
        if actual != expected:
            raise ReceivingError("The original resource's " + name + " does not match the selected run.")

    def receive(self, run_id, project_id, *, logs=True):
        run_id, project_id = identifier(run_id), identifier(project_id)
        account_keys, accounts = self.collection("account", "/users", {"filter[user_id]": "me"})
        project_key, project = self.resource("projects", project_id)
        run_key, run = self.resource("runs", run_id)
        self.bound(run, "project", project_id)
        workflows_keys, workflow_rows = self.collection("workflows-before", "/workflows",
                                                        {"filter[run_id]": run_id}, paginated=True)
        workflows, jobs, artifacts, streams = [], [], [], []
        seen_workflows, seen_jobs = set(), set()
        for workflow_row in workflow_rows:
            workflow_id = identifier(workflow_row.get("id"), "workflow ID")
            if workflow_id in seen_workflows:
                raise ReceivingError("The original workflow pages contain a duplicate workflow.")
            seen_workflows.add(workflow_id)
            workflow_key, workflow = self.resource("workflows", workflow_id)
            self.bound(workflow, "project", project_id)
            self.bound(workflow, "run", run_id)
            job_pages, job_rows = self.collection("jobs/" + workflow_id, "/jobs",
                                                  {"filter[workflow_id]": workflow_id})
            workflows.append({"id": workflow_id, "record": workflow_key, "job_pages": job_pages})
            for row in job_rows:
                job_id = identifier(row.get("id"), "job ID")
                if job_id in seen_jobs:
                    raise ReceivingError("The original run contains a duplicate job identity.")
                seen_jobs.add(job_id)
                self.bound(row, "project", project_id)
                self.bound(row, "workflow", workflow_id)
                job_key, job = self.resource("jobs", job_id)
                self.bound(job, "project", project_id)
                self.bound(job, "workflow", workflow_id)
                entry = {"id": job_id, "record": job_key, "workflow_id": workflow_id,
                         "number": row.get("attributes", {}).get("number")}
                jobs.append(entry)
                # Approval nodes carry no execution/artifact storage in the native API.
                if job["attributes"].get("type") != "approval":
                    artifact_pages, artifact_rows = self.collection("artifacts/" + job_id,
                                                "/jobs/" + job_id + "/artifacts")
                    entry["artifact_pages"] = artifact_pages
                    selected = set()
                    for item in artifact_rows:
                        attributes = item.get("attributes", {})
                        native_path, execution = attributes.get("path"), attributes.get("execution")
                        if (not isinstance(native_path, str) or not native_path or "\x00" in native_path
                                or isinstance(execution, bool) or not isinstance(execution, int)
                                or execution < 0):
                            raise ReceivingError("The original artifact has no native path/execution.")
                        identity = (execution, native_path)
                        if identity in selected:
                            raise ReceivingError("The original job repeats an artifact path/execution.")
                        selected.add(identity)
                        key = "artifact/" + job_id + "/" + hashlib.sha256(
                            packed(identity).encode("utf-8")).hexdigest()
                        result = self.get(key, attributes.get("url", ""), artifact=True)
                        artifacts.append({"job_id": job_id, "execution": execution,
                                          "native_path": native_path, "response": key,
                                          "file": result["body"]})
                    if logs:
                        executions = job["attributes"].get("parallel_executions") or []
                        if not isinstance(executions, list):
                            raise ReceivingError("The original job has invalid parallel executions.")
                        for execution, native in enumerate(executions):
                            for step in native.get("steps", []):
                                number = step.get("num")
                                if isinstance(number, bool) or not isinstance(number, int) or number < 0:
                                    raise ReceivingError("The original job step has no native number.")
                                for stream in ("stdout", "stderr"):
                                    key = "log/" + job_id + "/" + str(execution) + "/" + str(number) + "/" + stream
                                    url = API + "/jobs/" + job_id + "/" + stream + "?" + parse.urlencode({
                                        "filter[execution]": execution, "filter[step_num]": number})
                                    result = self.get(key, url, max_bytes=self.max_file_bytes)
                                    streams.append({"job_id": job_id, "execution": execution,
                                                    "step_num": number, "stream": stream,
                                                    "response": key, "file": result["body"]})
        final_pages, final_workflows = self.collection("workflows-after", "/workflows",
                                    {"filter[run_id]": run_id}, paginated=True)
        final_run_key, final_run = self.resource("runs", run_id, suffix="/after")
        self.bound(final_run, "project", project_id)
        changed = {item.get("id") for item in final_workflows} != seen_workflows
        source = run.get("references", {}).get("event", {}).get("attributes", {}).get("vcs") or {}
        manifest = {"schema": SCHEMA, "created_at": now(), "request": self.state["intent"],
                    "source": {"api": API, "reference": REFERENCE, "native_version": "3.0"},
                    "account_records": account_keys, "project_record": project_key,
                    "run_record": run_key, "run_after_record": final_run_key,
                    "workflow_pages": workflows_keys, "workflow_pages_after": final_pages,
                    "workflows": workflows, "jobs": jobs, "artifacts": artifacts, "streams": streams,
                    "event_revision": source.get("revision"),
                    "event_repository_url": source.get("origin_repository_url"),
                    "event_branch": source.get("branch"),
                    "changed_during_receiving": changed,
                    "outputs": {"artifacts": "all returned native artifacts",
                                "logs": "all returned job executions and steps" if logs else "operator omitted logs"},
                    "responses": self.state["responses"],
                    "files": sorted(self.state["files"].values(), key=lambda item: item["path"])}
        atomic(self.root / "manifest.json", manifest)
        self.state["completed_at"] = now()
        self.state["manifest"] = sha_file(self.root / "manifest.json")
        self.save()
        return {"schema": SCHEMA, "manifest": str(self.root / "manifest.json"),
                "manifest_sha256": self.state["manifest"]["sha256"],
                "run_id": run_id, "project_id": project_id,
                "workflows": len(workflows), "jobs": len(jobs),
                "artifacts": len(artifacts), "streams": len(streams),
                "files": len(manifest["files"]), "bytes": self.total_bytes,
                "changed_during_receiving": changed,
                "run_phase_at_final_read": final_run["attributes"].get("phase"),
                "run_outcome_at_final_read": final_run["attributes"].get("current_outcome")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="Original private receiving directory")
    parser.add_argument("--token-env", default="CIRCLE_TOKEN")
    parser.add_argument("--max-file-bytes", type=int, default=1024**3)
    parser.add_argument("--max-total-bytes", type=int, default=8*1024**3)
    parser.add_argument("--timeout", type=int, default=120)
    sub = parser.add_subparsers(dest="command", required=True)
    receive = sub.add_parser("receive", help="Receive the complete original run and available outputs")
    receive.add_argument("--run-id", required=True)
    receive.add_argument("--project-id", required=True)
    receive.add_argument("--omit-logs", action="store_true")
    discover = sub.add_parser("discover", help="Read the existing account, organizations, or projects")
    discover.add_argument("--org-id")
    discover.add_argument("--project-id")
    args = parser.parse_args()
    if min(args.max_file_bytes, args.max_total_bytes) < 1024 or not 5 <= args.timeout <= 7200:
        parser.error("Choose positive receiving byte allowances and a 5–7200 second native timeout.")
    intent = {"command": args.command, "source": API}
    if args.command == "receive":
        intent.update(run_id=identifier(args.run_id), project_id=identifier(args.project_id),
                      include_logs=not args.omit_logs)
    else:
        intent.update(org_id=identifier(args.org_id) if args.org_id else None,
                      project_id=identifier(args.project_id) if args.project_id else None)
    try:
        with Collector(args.output, intent, args.token_env, args.max_file_bytes,
                       args.max_total_bytes, args.timeout) as collector:
            if args.command == "receive":
                result = collector.receive(args.run_id, args.project_id, logs=not args.omit_logs)
            else:
                if args.project_id:
                    keys, rows = collector.collection("runs", "/runs",
                                     {"filter[project_id]": identifier(args.project_id)}, paginated=True)
                elif args.org_id:
                    keys, rows = collector.collection("projects", "/projects",
                                     {"filter[org_id]": identifier(args.org_id)}, paginated=True)
                else:
                    keys, rows = collector.collection("orgs", "/orgs", paginated=True)
                result = {"source": API, "records": keys, "resources": rows}
                atomic(collector.root / "discovery.json", result)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except ReceivingError as exc:
        print(json.dumps({"error": str(exc), "status": exc.status,
                          "retry_at": datetime.fromtimestamp(exc.retry_at, timezone.utc).isoformat()
                          if exc.retry_at else None, "record": exc.record}, ensure_ascii=False),
              file=sys.stderr)
        return 3 if exc.status == 429 else 2
    except (ValueError, OSError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
