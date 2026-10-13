"""Parse complete native POTS/CircleCI observations for the operator workspace."""
from __future__ import annotations

from pathlib import PurePosixPath
import hashlib
import json
import re
from urllib.parse import parse_qs, urlsplit

from .collector import API, SCHEMA, UUID, identifier, packed, strict_json

CONTEXT_SCHEMA = "govhub.pots.deployment-context/v1"
SHA = re.compile(r"[0-9a-f]{64}")
COMMIT = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})")


def need(condition, message):
    if not condition:
        raise ValueError(message)


def object_(value, label):
    need(isinstance(value, dict), label + " must be an object.")
    return value


def list_(value, label):
    need(isinstance(value, list), label + " must be an array.")
    return value


def file_index(manifest):
    files = {}
    for item in list_(manifest.get("files"), "Original receiving files"):
        object_(item, "Original file")
        path = item.get("path")
        need(isinstance(path, str) and re.fullmatch(r"objects/[0-9a-f]{64}", path),
             "Retain the original content-addressed file path.")
        need(path not in files, "The receiving manifest repeats an original file.")
        need(SHA.fullmatch(str(item.get("sha256", ""))) and path == "objects/" + item["sha256"],
             "An original file path and SHA-256 differ.")
        need(type(item.get("bytes")) is int and item["bytes"] >= 0,
             "Retain the exact original file byte length.")
        files[path] = item
    return files


class NativeReceiving:
    def __init__(self, manifest, read_file):
        self.manifest = object_(manifest, "Native receiving manifest")
        need(manifest.get("schema") == SCHEMA, "Select the native POTS receiving manifest.")
        self.files = file_index(manifest)
        self.responses = object_(manifest.get("responses"), "Original responses")
        self.read = read_file
        self.decoded = {}

    def bytes(self, item):
        original = self.files.get(item.get("path"))
        need(original is not None and all(item.get(k) == original[k] for k in ("sha256", "bytes")),
             "The original response or artifact file identity differs from the full manifest.")
        raw = self.read(original["path"])
        need(isinstance(raw, bytes), "The native file reader must return original bytes.")
        need(len(raw) == original["bytes"] and hashlib.sha256(raw).hexdigest() == original["sha256"],
             "The original received file changed.")
        return raw

    def response(self, key, path, query=None, decode=True):
        response = object_(self.responses.get(key), "Original native response")
        need(response.get("state") == "received" and type(response.get("status")) is int
             and 200 <= response["status"] < 300, "Choose a completed original native response.")
        req = object_(response.get("request"), "Original native request")
        need(req.get("method") == "GET", "The original receiving request must be a native GET.")
        parsed = urlsplit(req.get("url", ""))
        need(parsed.scheme == "https" and parsed.netloc == "circleci.com"
             and parsed.path == "/api/v3" + path and not parsed.fragment,
             "The native response belongs to a different provider request.")
        expected = {key: [str(value)] for key, value in (query or {}).items()}
        need(parse_qs(parsed.query, keep_blank_values=True) == expected,
             "The native response belongs to different source or page input.")
        if not decode:
            return response
        if key not in self.decoded:
            self.decoded[key] = strict_json(self.bytes(response["body"]))
        return object_(self.decoded[key], "Native API response")

    def resource(self, key, kind, native_id):
        data = object_(self.response(key, "/" + kind + "/" + native_id).get("data"),
                       "Original " + kind + " resource")
        need(data.get("id") == native_id, "The original native resource ID differs.")
        object_(data.get("attributes"), "Original native attributes")
        object_(data.get("references", {}), "Original native references")
        return data

    def collection(self, keys, path, query=None, paginated=False):
        need(isinstance(keys, list) and keys, "Retain all original collection pages.")
        rows, cursor, seen = [], None, set()
        for index, key in enumerate(keys):
            params = dict(query or {})
            if cursor is not None:
                params["page[cursor]"] = cursor
            data = self.response(key, path, params)
            rows.extend(list_(data.get("data"), "Original collection data"))
            if paginated:
                page = object_(data.get("page"), "Original page cursor")
                need("next" in page, "The original collection has no page completion value.")
                cursor = page["next"]
                if index + 1 < len(keys):
                    need(isinstance(cursor, str) and cursor and cursor not in seen,
                         "Retain the original distinct cursor for every next page.")
                    seen.add(cursor)
                else:
                    need(cursor is None, "Receive the remaining original provider pages.")
            else:
                need(len(keys) == 1 and data.get("page", {}).get("next") is None,
                     "The original unpaged native response was split or truncated.")
        return rows


def reference(data, kind):
    value = data.get("references", {}).get(kind, {}).get("id")
    return identifier(value, kind + " reference")


def _native_head(value):
    def commit(row):
        if not isinstance(row, dict):
            return None
        observed = row.get("hash") or row.get("id")
        return observed if COMMIT.fullmatch(str(observed or "")) else None
    if isinstance(value, dict):
        direct = commit(value)
        values = list(value.values())
        if direct:
            return direct
    elif isinstance(value, list):
        values = value
    else:
        return None
    return commit(values[0]) if values else None


def _context(receiving, artifact, artifacts, run_id, project_id, workflow_id, event_revision):
    context = strict_json(receiving.bytes(artifact["file"]))
    if not isinstance(context, dict) or context.get("schema") != CONTEXT_SCHEMA:
        return None
    issues, closure = [], []
    ci = context.get("ci_identity") or {}
    raw_ci = context.get("ci") or {}
    expected = {"run_id": run_id, "project_id": project_id,
                "workflow_id": workflow_id, "job_id": artifact["job_id"]}
    for name, wanted in expected.items():
        present = ci.get(name)
        if present and present != wanted:
            issues.append("Deployment context " + name + " differs from its original CircleCI artifact.")
    source_revision = ci.get("source_revision") or raw_ci.get("CIRCLE_SHA1")
    if source_revision and not COMMIT.fullmatch(str(source_revision)):
        issues.append("The deployment context's source revision is not a complete observed commit.")
    # GitHub App event, configured checkout and generated deployment revisions
    # have distinct native meanings; retain each without inferring equality.
    checkout_revision = (context.get("checkout") or {}).get("revision")
    if not checkout_revision or not COMMIT.fullmatch(str(checkout_revision)):
        issues.append("Receive the actual checkout revision from the original capture.")
    prefix = artifact["native_path"].rsplit("/", 1)[0] + "/" if "/" in artifact["native_path"] else ""
    index = {(row["job_id"], row["execution"], row["native_path"]): row for row in artifacts}
    by_path = {}
    for item in context.get("artifact_files", []):
        path = item.get("path")
        need(isinstance(path, str) and path and not PurePosixPath(path).is_absolute()
             and not any(part in ("..", "") for part in path.split("/")) and "\\" not in path,
             "A deployment-context file has an invalid original relative path.")
        need(path not in by_path, "The deployment context repeats an original output path.")
        match = index.get((artifact["job_id"], artifact["execution"], prefix + path))
        if not match or any(match["file"].get(k) != item.get(k) for k in ("bytes", "sha256")):
            issues.append("Receive the original deployment-context output " + path + ".")
            continue
        by_path[path] = match
        closure.append(match["file"])
    commands = {}
    for command in list_(context.get("commands"), "Original capture commands"):
        need(isinstance(command, dict) and command.get("id") and command["id"] not in commands,
             "Retain each original capture command once.")
        commands[command["id"]] = command
        for stream in ("stdout", "stderr"):
            output = command.get(stream) or {}
            member = by_path.get(output.get("path"))
            if not member or any(member["file"].get(k) != output.get(k) for k in ("sha256", "bytes")):
                issues.append("Receive the original " + command["id"] + " " + stream + " file.")
    for source in list_(context.get("sources"), "Original captured source files"):
        member = by_path.get(source.get("path"))
        if not member or any(member["file"].get(k) != source.get(k) for k in ("sha256", "bytes")):
            issues.append("Receive the original selected source file " + str(source.get("source_path")) + ".")
        if source.get("stable_during_copy") is False:
            issues.append("The selected source file changed during its native capture.")
    def observation(name, observed, json_body=True):
        observed = observed or {}
        command_id = observed.get("command_id") or observed.get("command")
        command = commands.get(command_id)
        if not command:
            issues.append("Retain the original " + name + " command.")
            return None
        if (type(command.get("exit_code")) is not int or command["exit_code"] != 0
                or command.get("status") != "SUCCEEDED"):
            issues.append("The original " + name + " command did not finish successfully.")
            return None
        output = command.get("stdout", {})
        member = by_path.get(output.get("path"))
        if not member or any(member["file"].get(k) != output.get(k) for k in ("sha256", "bytes")):
            return None
        declared_source = observed.get("source")
        if declared_source is not None and any(declared_source.get(k) != output.get(k)
                                               for k in ("path", "sha256", "bytes")):
            issues.append("The " + name + " observation references different output bytes.")
            return None
        try:
            raw = receiving.bytes(member["file"])
            data = strict_json(raw) if json_body else raw.decode("utf-8").strip()
        except (ValueError, UnicodeError):
            issues.append("The original " + name + " output could not be read completely.")
            return None
        declared = observed.get("data")
        if declared is not None and packed(data) != packed(declared):
            issues.append("The original " + name + " bytes differ from their context projection.")
            return None
        return data
    observations = object_(context.get("observations"), "Original native observations")
    parsed_observations = {name: observation(name, observations.get(name))
                           for name in ("site", "environment", "code_log", "backups", "workflows")}
    if observations.get("actor"):
        parsed_observations["actor"] = observation("native account", observations["actor"])
    checkout = context.get("checkout") or {}
    actual_checkout = observation("checkout", checkout.get("observation") or
                                  {"command": checkout.get("command")}, json_body=False)
    if actual_checkout is not None and actual_checkout != checkout_revision:
        issues.append("The actual checkout output differs from the captured checkout revision.")
    selected_workflows = []
    for selected in (observations.get("workflows") or {}).get("selected", []):
        native_id = identifier(selected.get("workflow_id"), "selected native workflow")
        status = observation("workflow " + native_id + " status", selected.get("status"))
        operations = observation("workflow " + native_id + " operations", selected.get("operations"))
        if not isinstance(status, dict) or status.get("id") != native_id or status.get("env") != context.get("target", {}).get("environment"):
            issues.append("The selected native workflow does not match its UUID and deployment environment.")
        selected_workflows.append({"workflow_id": native_id, "status": status, "operations": operations})
    site_data = parsed_observations.get("site") or {}
    environment_data = parsed_observations.get("environment") or {}
    site_id = site_data.get("id") if isinstance(site_data, dict) else None
    environment = environment_data.get("id") if isinstance(environment_data, dict) else None
    target = context.get("target") or {}
    if not site_id or not UUID.fullmatch(str(site_id).lower()):
        issues.append("Receive the selected site's native UUID from Terminus site:info.")
    if environment != target.get("environment"):
        issues.append("The actual Terminus environment differs from the selected deployment environment.")
    deployed_commit = _native_head(parsed_observations.get("code_log"))
    if not deployed_commit:
        issues.append("Receive the native deployed code revision from Terminus env:code-log.")
    if context.get("failures"):
        issues.append("The deployment capture contains unfinished native commands.")
    return {"capture_id": context.get("capture_id"), "state": context.get("state"),
            "captured_at": context.get("completed_at"),
            "job_id": artifact["job_id"], "execution": artifact["execution"],
            "artifact_path": artifact["native_path"], "file": artifact["file"],
            "workflow_id": workflow_id, "run_id": run_id, "project_id": project_id,
            "event_revision": event_revision, "source_revision": source_revision,
            "source_repository_url": raw_ci.get("CIRCLE_REPOSITORY_URL"),
            "checkout_revision": checkout_revision,
            "site_id": site_id, "environment": environment, "deployed_commit": deployed_commit,
            "target": target, "files": closure, "issues": issues,
            "workflow_scope": (context.get("observations", {}).get("workflows") or {}).get("scope"),
            "selected_workflows": selected_workflows,
            "source_count": len(context.get("sources", [])),
            "command_count": len(commands)}


def parse_receiving(manifest, read_file):
    receiving = NativeReceiving(manifest, read_file)
    intent = object_(manifest.get("request"), "Original receiving request")
    need(intent.get("command") == "receive" and intent.get("source") == API,
         "Select the complete native run receiving command.")
    run_id, project_id = identifier(intent.get("run_id")), identifier(intent.get("project_id"))
    accounts = receiving.collection(manifest.get("account_records"), "/users", {"filter[user_id]": "me"})
    need(len(accounts) == 1, "Retain the original authenticated CircleCI account observation.")
    identifier(accounts[0].get("id"), "CircleCI account")
    project = receiving.resource(manifest["project_record"], "projects", project_id)
    run = receiving.resource(manifest["run_record"], "runs", run_id)
    final_run = receiving.resource(manifest["run_after_record"], "runs", run_id)
    need(reference(run, "project") == project_id and reference(final_run, "project") == project_id,
         "The native run belongs to a different project.")
    source = run.get("references", {}).get("event", {}).get("attributes", {}).get("vcs") or {}
    revision = source.get("revision")
    native_workflows = receiving.collection(manifest.get("workflow_pages"), "/workflows",
                                            {"filter[run_id]": run_id}, True)
    final_workflows = receiving.collection(manifest.get("workflow_pages_after"), "/workflows",
                                            {"filter[run_id]": run_id}, True)
    workflows, jobs, native_artifacts = [], [], []
    workflow_index = {item["id"]: item for item in list_(manifest.get("workflows"), "Workflows")}
    need(len(workflow_index) == len(manifest["workflows"]), "The manifest repeats a workflow.")
    need({row.get("id") for row in native_workflows} == set(workflow_index),
         "Receive every original workflow returned for this run.")
    job_index = {item["id"]: item for item in list_(manifest.get("jobs"), "Jobs")}
    need(len(job_index) == len(manifest["jobs"]), "The manifest repeats a job.")
    observed_jobs, expected_streams = set(), set()
    for workflow_id, entry in workflow_index.items():
        workflow = receiving.resource(entry["record"], "workflows", identifier(workflow_id))
        need(reference(workflow, "run") == run_id and reference(workflow, "project") == project_id,
             "An original workflow belongs to a different run or project.")
        workflows.append({"id": workflow_id, **workflow["attributes"]})
        rows = receiving.collection(entry["job_pages"], "/jobs", {"filter[workflow_id]": workflow_id})
        for row in rows:
            need(reference(row, "project") == project_id and reference(row, "workflow") == workflow_id,
                 "A native listed job belongs to a different original workflow or project.")
            job_id = identifier(row.get("id"), "native job ID")
            need(job_id not in observed_jobs and job_id in job_index,
                 "Receive each original native job once.")
            observed_jobs.add(job_id)
            descriptor = job_index[job_id]
            job = receiving.resource(descriptor["record"], "jobs", job_id)
            need(reference(job, "project") == project_id and reference(job, "workflow") == workflow_id,
                 "An original job belongs to a different workflow or project.")
            attributes = job["attributes"]
            failures = []
            for execution, native in enumerate(attributes.get("parallel_executions") or []):
                for step in native.get("steps", []):
                    number = step.get("num")
                    need(type(number) is int and number >= 0, "Retain the original native step number.")
                    if attributes.get("type") != "approval":
                        for stream in ("stdout", "stderr"):
                            marker = (job_id, execution, number, stream)
                            need(marker not in expected_streams, "The native job repeats an execution step.")
                            expected_streams.add(marker)
                    if step.get("outcome") in ("failed", "errored") or step.get("exit_code") not in (None, 0):
                        failures.append({"execution": execution, **step})
            jobs.append({"id": job_id, "workflow_id": workflow_id,
                         "number": row.get("attributes", {}).get("number"),
                         "name": attributes.get("name"), "type": attributes.get("type"),
                         "phase": attributes.get("phase"), "outcome": attributes.get("outcome"),
                         "started_at": attributes.get("started_at"), "ended_at": attributes.get("ended_at"),
                         "failed_steps": failures, "record": descriptor["record"]})
            if attributes.get("type") != "approval":
                for original in receiving.collection(descriptor.get("artifact_pages"),
                                                     "/jobs/" + job_id + "/artifacts"):
                    data = object_(original.get("attributes"), "Native artifact")
                    native_artifacts.append((job_id, data["execution"], data["path"], data["url"]))
    need(observed_jobs == set(job_index), "The receiving manifest includes an unbound native job.")
    artifact_index, artifacts = {}, []
    for item in list_(manifest.get("artifacts"), "Native artifacts"):
        key = (item.get("job_id"), item.get("execution"), item.get("native_path"))
        need(key not in artifact_index, "A received native artifact is repeated.")
        response = object_(receiving.responses.get(item.get("response")), "Original artifact response")
        need(response.get("state") == "received" and 200 <= response.get("status", 0) < 300
             and response.get("request", {}).get("method") == "GET"
             and response.get("body") == item.get("file"), "The native artifact has no original receiving response.")
        identity = item["file"]
        need(identity.get("path") in receiving.files and identity == receiving.files[identity["path"]],
             "The artifact does not match its original retained file.")
        artifact_index[key] = response["request"]["url"]
        artifacts.append(item)
    need(len(native_artifacts) == len(artifact_index)
         and all(artifact_index.get((job, execution, path)) == url for job, execution, path, url in native_artifacts),
         "Receive every original artifact returned by the selected native jobs.")
    streams, observed_streams = [], set()
    for item in list_(manifest.get("streams"), "Native output streams"):
        marker = (item.get("job_id"), item.get("execution"), item.get("step_num"), item.get("stream"))
        need(marker in expected_streams and marker not in observed_streams,
             "The original output stream belongs to an unlisted or repeated execution step.")
        observed_streams.add(marker)
        job_id, execution, number, stream = marker
        response = receiving.response(item.get("response"), "/jobs/" + job_id + "/" + stream,
                        {"filter[execution]": execution, "filter[step_num]": number}, decode=False)
        identity = item.get("file") or {}
        need(response.get("status") in (200, 204) and response.get("body") == identity
             and receiving.files.get(identity.get("path")) == identity,
             "Retain the complete original native output stream.")
        if response["status"] == 204:
            need(identity.get("bytes") == 0, "The native empty stream has unexpected bytes.")
        streams.append(item)
    need(type(intent.get("include_logs")) is bool, "Retain the original log receiving choice.")
    need(observed_streams == (expected_streams if intent["include_logs"] else set()),
         "Receive every selected native execution's stdout and stderr.")
    contexts, context_errors = [], []
    workflow_for_job = {job["id"]: job["workflow_id"] for job in jobs}
    for artifact in artifacts:
        if not artifact["native_path"].endswith("context.json") or artifact["file"]["bytes"] > 32*1024**2:
            continue
        try:
            value = _context(receiving, artifact, artifacts, run_id, project_id,
                             workflow_for_job[artifact["job_id"]], revision)
            if value:
                contexts.append(value)
        except (ValueError, UnicodeError, KeyError, TypeError) as exc:
            context_errors.append({"job_id": artifact["job_id"], "artifact_path": artifact["native_path"],
                                   "message": str(exc)})
    graph_changed = {item.get("id") for item in final_workflows} != set(workflow_index)
    issues = []
    if graph_changed:
        issues.append("The native run added or removed workflows during receiving; receive its current edition.")
    return {"schema": "govhub.pots.run-edition/v1", "received_at": manifest["created_at"],
            "project_id": project_id, "project_name": project["attributes"].get("name", project_id),
            "circle_actor": accounts[0],
            "run_id": run_id, "run_number": run["attributes"].get("number"),
            "event_revision": revision, "event_repository_url": source.get("origin_repository_url"),
            "event_branch": source.get("branch"), "include_logs": intent["include_logs"], "run_phase": final_run["attributes"].get("phase"),
            "run_outcome": final_run["attributes"].get("current_outcome"),
            "run_errors": final_run["attributes"].get("errors") or [],
            "workflows": workflows, "jobs": jobs, "artifacts": artifacts,
            "streams": streams,
            "contexts": contexts, "context_errors": context_errors,
            "issues": issues, "files": list(receiving.files.values()),
            "counts": {"workflows": len(workflows), "jobs": len(jobs), "artifacts": len(artifacts),
                       "streams": len(manifest["streams"]), "contexts": len(contexts),
                       "failed_jobs": sum(job.get("outcome") in ("failed", "errored") for job in jobs),
                       "active_jobs": sum(job.get("phase") != "ended" for job in jobs),
                       "bytes": sum(item["bytes"] for item in receiving.files.values())}}
