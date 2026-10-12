"""MIT. Saved native DQA assessments, analyst work and complete IATI customer receiving."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit, quote
from urllib.request import Request, build_opener, HTTPRedirectHandler
import zipfile

from iati_source import InputError
from workspace import checked_id, digest, file_digest, json_bytes, load_json, private_write, regular, sync_dir

ASSESSMENT = "stellar-forge.iati-dqa-assessment.v1"
PROVIDER = "stellar-forge.iati-dqa-provider.v1"
CASE = "stellar-forge.iati-dqa-case.v1"
COMPARISON = "stellar-forge.iati-dqa-comparison.v1"
PACKET = "stellar-forge.iati-dqa-customer.v1"
UPSTREAM = {
    "repository": "https://github.com/zimmerman-team/iati-cloud.dqa",
    "commit": "61a5e02420b936a39ebaf79dea7212fc0ce36683",
    "license": "MIT",
}
MAX_BODY = 64 * 1024 * 1024
MAX_PACKET = 4 * 1024 * 1024 * 1024
MAX_MEMBERS = 32768
REQUEST_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}\Z")
ENVIRONMENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,159}\Z")
STATUSES = {"pass", "fail", "not_applicable"}
ACTION_STATUSES = {"open", "investigate", "addressed", "accepted"}
HERE = Path(__file__).resolve().parent
GUIDES = {
    "DQA.md": HERE / "DQA.md",
    "IATI.md": HERE / "README.md",
    "provider/README.md": HERE / "dqa-provider" / "README.md",
    "provider/VALIDATOR_RULES.md": HERE / "dqa-provider" / "VALIDATOR_RULES.md",
    "provider/LICENSE.MD": HERE / "dqa-provider" / "LICENSE.MD",
    "provider/source.json": HERE / "dqa-provider" / "source.json",
    "receiving/DQA.md": HERE / "receiving" / "DQA.md",
    "receiving/dqa-source/README.md": HERE / "receiving" / "dqa-source" / "README.md",
    "receiving/dqa-source/SETUP.md": HERE / "receiving" / "dqa-source" / "SETUP.md",
    "receiving/dqa-source/complete.example.json": HERE / "receiving" / "dqa-source" / "complete.example.json",
}


def text(value, name, maximum=160, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise InputError(f"{name} must be {'0' if empty else '1'} to {maximum} characters")
    return value if empty else value.strip()


def object_input(raw, allowed, required=()):
    if not isinstance(raw, dict) or set(raw) - set(allowed) or set(required) - set(raw):
        raise InputError("Supply the complete DQA selection with its supported fields")
    return raw


def integer(value, name, minimum=0, maximum=1000000):
    if type(value) is not int or not minimum <= value <= maximum:
        raise InputError(f"{name} must be an integer from {minimum} to {maximum}")
    return value


def utc():
    return datetime.now(timezone.utc).isoformat()


def endpoint(value):
    value = text(value, "DQA endpoint", 2048)
    parsed = urlsplit(value)
    try:
        port = parsed.port
    except ValueError as error:
        raise InputError("Select a valid DQA service port") from error
    if (parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username is not None
            or parsed.password is not None or parsed.query or parsed.fragment
            or any(ord(c) < 33 for c in value) or "\\" in value
            or not parsed.path.rstrip("/").endswith("/dqa")
            or (parsed.scheme == "http" and parsed.hostname not in {"127.0.0.1", "::1", "localhost"})):
        raise InputError("Select the service HTTPS /dqa endpoint, or your local HTTP /dqa deployment")
    if port is not None and not 1 <= port <= 65535:
        raise InputError("Select a valid DQA service port")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def parameters(raw):
    fields = {"organisation", "segmentation", "require_funding_and_accountable", "include_exemptions",
              "optional_rules", "skip_cache", "failed_activities", "use_budget_date_filter"}
    object_input(raw, fields, {"organisation"})
    result = dict(raw)
    organisation = raw["organisation"]
    if isinstance(organisation, list):
        if not 1 <= len(organisation) <= 1000:
            raise InputError("Select 1 to 1000 organisation identifiers")
        result["organisation"] = [text(v, "Organisation identifier", 1000) for v in organisation]
    else:
        result["organisation"] = text(organisation, "Organisation identifier", 16000)
    if raw.get("segmentation") is not None:
        object_input(raw["segmentation"], {"countries", "regions", "sectors"})
        for name, values in raw["segmentation"].items():
            if values is not None and (not isinstance(values, list) or len(values) > 10000):
                raise InputError("Native segmentation must contain code arrays")
            if values is not None:
                for value in values:
                    text(value, "Segmentation code", 160)
    for key in ("require_funding_and_accountable", "include_exemptions", "failed_activities", "use_budget_date_filter"):
        if key in raw and type(raw[key]) is not bool:
            raise InputError(f"{key} must be a native boolean")
    if raw.get("skip_cache") is not None and type(raw["skip_cache"]) is not bool:
        raise InputError("skip_cache must be a native boolean or null")
    if raw.get("optional_rules") is not None:
        object_input(raw["optional_rules"], {"check_acronyms"})
        if "check_acronyms" in raw["optional_rules"] and type(raw["optional_rules"]["check_acronyms"]) is not bool:
            raise InputError("check_acronyms must be a native boolean")
    if len(json_bytes(result)) > 131072:
        raise InputError("The complete DQA request exceeds 128 KiB")
    return result


def check_response(value):
    if not isinstance(value, dict):
        raise InputError("The native DQA response must be an object")
    required = {"summary", "failed_activities", "pass_count", "fail_count", "not_applicable_count",
                "generated_at", "available_segmentations"}
    if required - set(value) or not isinstance(value["summary"], dict):
        raise InputError("The response does not implement the native DQA model")
    summary = value["summary"]
    text(summary.get("organisation"), "Native organisation", 100000)
    text(summary.get("financial_year"), "Native financial year", 160)
    for name in ("total_programmes", "total_projects"):
        integer(summary.get(name), name, maximum=1000000000)
    if type(summary.get("total_budget")) not in {int, float}:
        raise InputError("The native provider budget must retain its numeric value")
    for name in ("pass_count", "fail_count", "not_applicable_count"):
        integer(value.get(name), name, maximum=1000000000)
    text(value["generated_at"], "Native generation time", 160)
    if not isinstance(value["failed_activities"], list) or len(value["failed_activities"]) > 1000000:
        raise InputError("The native failed activity set exceeds one million entries")
    for row in value["failed_activities"]:
        if not isinstance(row, dict) or not isinstance(row.get("iati_identifier"), str):
            raise InputError("A native activity needs its original identifier")
        integer(row.get("hierarchy"), "Native hierarchy", minimum=0, maximum=1000000)
        integer(row.get("failure_count"), "Native failure count", maximum=1000000)
        if row.get("overall_status") not in STATUSES:
            raise InputError("A native activity has an unknown assessment status")
        for kind, field in (("attributes", "attribute"), ("documents", "document_type")):
            if not isinstance(row.get(kind), list):
                raise InputError("Native attribute and document lists must remain complete")
            for finding in row[kind]:
                if (not isinstance(finding, dict) or not isinstance(finding.get(field), str)
                        or finding.get("status") not in STATUSES):
                    raise InputError("A native rule result has an unknown name or status")
    segmentation = value["available_segmentations"]
    if (not isinstance(segmentation, dict) or any(not isinstance(segmentation.get(k), list)
            or any(not isinstance(v, str) for v in segmentation[k]) for k in ("countries", "regions", "sectors"))):
        raise InputError("The original available segmentation codes are incomplete")
    return value


def activity_rows(value):
    seen = Counter()
    for position, activity in enumerate(value["failed_activities"]):
        identity = (activity["iati_identifier"], activity["hierarchy"])
        seen[identity] += 1
        key = digest(json_bytes([*identity, seen[identity]]))
        yield {"key": key, "position": position, "occurrence": seen[identity], "activity": activity}


def finding_rows(value):
    for selected in activity_rows(value):
        activity = selected["activity"]
        for kind, field in (("attribute", "attribute"), ("document", "document_type")):
            seen = Counter()
            for position, rule in enumerate(activity["attributes" if kind == "attribute" else "documents"]):
                seen[rule[field]] += 1
                key = digest(json_bytes([selected["key"], kind, rule[field], seen[rule[field]]]))
                yield {"key": key, "activityKey": selected["key"], "activityPosition": selected["position"],
                       "activityOccurrence": selected["occurrence"], "rulePosition": position,
                       "iatiIdentifier": activity["iati_identifier"], "hierarchy": activity["hierarchy"],
                       "title": activity.get("title"), "activityStatus": activity.get("activity_status"),
                       "kind": kind, "rule": rule[field], "status": rule["status"], "native": rule}


def page_values(values, offset=0, limit=50):
    integer(offset, "Offset", maximum=1000000000)
    integer(limit, "Page size", minimum=1, maximum=250)
    rows = list(values)
    return {"total": len(rows), "offset": offset, "limit": limit, "items": rows[offset:offset + limit],
            "nextOffset": offset + limit if offset + limit < len(rows) else None}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HTTPError(req.full_url, code, "The selected DQA endpoint redirected", headers, fp)


class IatiDqa:
    """Use the original private IATI database, process lease and mutex."""
    def __init__(self, workspace):
        self.ws, self.db = workspace, workspace.db
        self.root = workspace.root / "dqa"
        for path in (self.root, self.root / "blobs", self.root / "tmp", self.root / "exports", self.root / "received"):
            path.mkdir(mode=0o700, exist_ok=True)
            info = path.lstat()
            if not stat.S_ISDIR(info.st_mode) or path.is_symlink() or path.resolve() != path:
                raise InputError("The DQA workspace must use its original private directories")
            if os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077):
                raise InputError("Keep DQA workspace directories private and operator-owned")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS iati_dqa_providers(id TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS iati_dqa_assessments(id TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS iati_dqa_cases(
                id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id,revision));
            CREATE TABLE IF NOT EXISTS iati_dqa_operations(
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, input_sha TEXT NOT NULL, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS iati_dqa_comparisons(id TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS iati_dqa_receipts(id TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS iati_dqa_finding_indexes(
                assessment TEXT PRIMARY KEY, response_sha TEXT NOT NULL, row_count INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS iati_dqa_findings(
                assessment TEXT NOT NULL, ordinal INTEGER NOT NULL, finding TEXT NOT NULL,
                status TEXT NOT NULL, search TEXT NOT NULL, body TEXT NOT NULL,
                PRIMARY KEY(assessment,ordinal), UNIQUE(assessment,finding));
            CREATE INDEX IF NOT EXISTS iati_dqa_findings_status ON iati_dqa_findings(assessment,status,ordinal);
        """)

    def _blob(self, data, mime="application/json"):
        if not isinstance(data, bytes) or len(data) > MAX_BODY:
            raise InputError("The complete retained DQA file exceeds 64 MiB")
        ident = digest(data)
        path = self.root / "blobs" / (ident + ".bin")
        with self.ws.mutex:
            if path.exists():
                if regular(path, MAX_BODY).st_size != len(data) or file_digest(path, MAX_BODY) != ident:
                    raise InputError("An original DQA source file changed")
            else:
                fd, temporary = tempfile.mkstemp(prefix="dqa-", dir=self.root / "tmp")
                temp = Path(temporary)
                try:
                    with os.fdopen(fd, "wb") as stream:
                        stream.write(data)
                        stream.flush()
                        os.fsync(stream.fileno())
                    # The existing exclusive workspace lease and mutex own publication.
                    # Rename never leaves a second hard link to a referenced source.
                    os.replace(temp, path)
                    sync_dir(path.parent)
                finally:
                    temp.unlink(missing_ok=True)
        return {"sha256": ident, "bytes": len(data), "contentType": mime}

    def blob_path(self, item):
        if not isinstance(item, dict) or type(item.get("bytes")) is not int:
            raise InputError("Select an original complete DQA file identity")
        path = self.root / "blobs" / (checked_id(item.get("sha256")) + ".bin")
        if regular(path, MAX_BODY).st_size != item["bytes"] or file_digest(path, MAX_BODY) != item["sha256"]:
            raise InputError("The retained DQA file differs from its selected identity")
        return path

    def _json(self, item):
        return load_json(self.blob_path(item).read_bytes())

    def _record(self, table, ident):
        checked_id(ident)
        if table not in {"providers", "assessments", "comparisons"}:
            raise InputError("Unknown DQA record type")
        row = self.db.execute("SELECT body FROM iati_dqa_" + table + " WHERE id=?", (ident,)).fetchone()
        if row is None:
            raise InputError("Unknown retained DQA " + table)
        return load_json(row["body"])

    def _operation(self, request_id, kind, selected):
        if not isinstance(request_id, str) or not REQUEST_ID.fullmatch(request_id):
            raise InputError("Choose an original DQA requestId of 1 to 160 identifier characters")
        encoded = json_bytes(selected)
        row = self.db.execute("SELECT * FROM iati_dqa_operations WHERE id=?", (request_id,)).fetchone()
        if row:
            if row["kind"] != kind or row["input_sha"] != digest(encoded):
                raise InputError("This DQA requestId already selects different work")
            return load_json(row["body"])
        result = {"requestId": request_id, "kind": kind, "input": selected, "inputSha256": digest(encoded),
                  "state": "PREPARED", "createdAt": utc(), "attempts": []}
        self._save_operation(result)
        return result

    def _save_operation(self, value):
        body = json_bytes(value)
        if len(body) > MAX_BODY:
            raise InputError("The DQA operation history exceeds 64 MiB")
        with self.db:
            self.db.execute("INSERT INTO iati_dqa_operations VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
                            (value["requestId"], value["kind"], value["inputSha256"], body.decode()))

    def providers(self):
        with self.ws.mutex:
            return [load_json(r["body"]) for r in self.db.execute("SELECT body FROM iati_dqa_providers ORDER BY id")]

    def save_provider(self, raw):
        object_input(raw, {"requestId", "name", "endpoint", "authorizationEnv", "timeoutSeconds", "notes", "previous"},
                     {"requestId", "name", "endpoint", "authorizationEnv"})
        with self.ws.mutex:
            environment = raw["authorizationEnv"]
            if not isinstance(environment, str) or not ENVIRONMENT.fullmatch(environment):
                raise InputError("Select the existing authorization environment variable name")
            selected = {"name": text(raw["name"], "Provider name"), "endpoint": endpoint(raw["endpoint"]),
                        "authorizationEnv": environment,
                        "timeoutSeconds": integer(raw.get("timeoutSeconds", 300), "Timeout", 1, 900),
                        "notes": text(raw.get("notes", ""), "Provider notes", 16000, True), "protocol": UPSTREAM}
            if raw.get("previous") is not None:
                self._record("providers", raw["previous"])
                selected["previous"] = raw["previous"]
            op = self._operation(raw["requestId"], "provider", selected)
            if op["state"] == "COMPLETE":
                return self._record("providers", op["result"])
            ident = digest(json_bytes(selected))
            prior = self.db.execute("SELECT body FROM iati_dqa_providers WHERE id=?", (ident,)).fetchone()
            result = load_json(prior["body"]) if prior else {
                "schema": PROVIDER, "id": ident, **selected, "createdAt": op["createdAt"]}
            with self.db:
                self.db.execute("INSERT OR IGNORE INTO iati_dqa_providers VALUES(?,?)", (ident, json_bytes(result).decode()))
                op.update(state="COMPLETE", result=ident)
                self.db.execute("UPDATE iati_dqa_operations SET body=? WHERE id=?", (json_bytes(op).decode(), op["requestId"]))
            return result

    def _exchange(self, provider, suffix, request_body=None):
        secret = os.environ.get(provider["authorizationEnv"])
        if not secret or "\r" in secret or "\n" in secret:
            raise InputError("Set the selected DQA authorization variable on the console's own host")
        url = provider["endpoint"] + suffix
        method = "GET" if request_body is None else "POST"
        request = Request(url, data=request_body, method=method, headers={
            "Authorization": secret, "Accept": "application/json", "Accept-Encoding": "identity",
            **({"Content-Type": "application/json"} if request_body is not None else {})})
        started = utc()
        opener = build_opener(NoRedirect())
        try:
            try:
                response = opener.open(request, timeout=provider["timeoutSeconds"])
            except HTTPError as error:
                response = error
            with response:
                blocks, size = [], 0
                while block := response.read(65536):
                    blocks.append(block)
                    size += len(block)
                    if size > MAX_BODY:
                        partial = self._blob(b"".join(blocks[:-1]), response.headers.get("Content-Type", "application/octet-stream"))
                        raise InputError("The provider response exceeds 64 MiB; retained prefix " + partial["sha256"])
                body = self._blob(b"".join(blocks), response.headers.get("Content-Type", "application/octet-stream"))
                selected_headers = {key: response.headers.get_all(key) for key in
                    ("Content-Type", "Content-Length", "Date", "ETag", "Last-Modified", "Retry-After", "Cache-Control")
                    if response.headers.get_all(key) is not None}
                return {"method": method, "url": url, "startedAt": started, "receivedAt": utc(),
                        "status": response.status if hasattr(response, "status") else response.code,
                        "headers": selected_headers, "body": body}
        except (URLError, TimeoutError, OSError) as error:
            raise InputError("The selected DQA service did not complete its response: " + type(error).__name__) from error

    def _config_observation(self, provider):
        value = {"state": "UNAVAILABLE", "calls": [], "configurations": {}}
        try:
            listing = self._exchange(provider, "/config")
            value["calls"].append(listing)
            if listing["status"] == 200:
                document = self._json(listing["body"])
                names = document.get("configs") if isinstance(document, dict) else None
                if (not isinstance(names, list) or len(names) > 256
                        or any(not isinstance(name, str) or not re.fullmatch(r"\\w{1,160}", name) for name in names)
                        or len(set(names)) != len(names)):
                    raise InputError("The native configuration catalogue is incomplete")
                for name in names:
                    result = self._exchange(provider, "/config/" + quote(name, safe=""))
                    value["calls"].append(result)
                    if result["status"] != 200:
                        break
                    document = self._json(result["body"])
                    if not isinstance(document, dict) or document.get("config_name") != name or not isinstance(document.get("values"), list):
                        raise InputError("A native configuration response changed its selected name or values")
                    value["configurations"][name] = document["values"]
                else:
                    value["state"] = "COMPLETE"
        except (InputError, ValueError, OSError) as error:
            value.update(error=str(error), observedAt=utc())
        return {"file": self._blob(json_bytes(value)), **value}

    @staticmethod
    def _check_observation(observation, provider, read):
        if not isinstance(observation, dict) or "file" not in observation:
            raise InputError("Retain the complete original configuration observation")
        original = load_json(read(observation["file"]))
        if original != {key: value for key, value in observation.items() if key != "file"}:
            raise InputError("The configuration observation differs from its original file")
        calls = original.get("calls")
        if not isinstance(calls, list) or len(calls) > 257 or original.get("state") not in {"COMPLETE", "UNAVAILABLE"}:
            raise InputError("The configuration call history changed")
        names, actual, complete = None, {}, False
        for index, call in enumerate(calls):
            expected = "/config" if index == 0 else "/config/" + quote(names[index - 1], safe="") if names and index <= len(names) else None
            if (not expected or call.get("method") != "GET" or call.get("url") != provider["endpoint"] + expected
                    or type(call.get("status")) is not int or not 100 <= call["status"] <= 599):
                raise InputError("A configuration call differs from the selected native endpoint")
            raw = read(call["body"])
            if call["status"] != 200:
                if index != len(calls) - 1:
                    raise InputError("A failed configuration call must end that observation")
                break
            try:
                document = load_json(raw)
                if index == 0:
                    found = document.get("configs") if isinstance(document, dict) else None
                    if (not isinstance(found, list) or len(found) > 256
                            or any(not isinstance(name, str) or not re.fullmatch(r"\\w{1,160}", name) for name in found)
                            or len(set(found)) != len(found)):
                        raise InputError("Native configuration catalogue is incomplete")
                    names = found
                else:
                    if (not isinstance(document, dict) or document.get("config_name") != names[index - 1]
                            or not isinstance(document.get("values"), list)):
                        raise InputError("Native configuration response is incomplete")
                    actual[names[index - 1]] = document["values"]
            except (InputError, ValueError):
                if index != len(calls) - 1 or original["state"] != "UNAVAILABLE":
                    raise InputError("Retain an incomplete configuration response as an unavailable observation")
                break
        else:
            complete = names is not None and len(calls) == len(names) + 1
        if original.get("configurations") != actual or (original["state"] == "COMPLETE") != complete:
            raise InputError("The configuration values differ from the complete native call bodies")
        return original

    @staticmethod
    def _assessment_result(selected, request_id, attempt, provider, read):
        original_request = load_json(read(attempt["request"]))
        if original_request != parameters(selected["parameters"]):
            raise InputError("The original assessment request differs from its saved parameters")
        response = attempt["response"]
        if (response.get("status") != 200 or response.get("method") != "POST"
                or response.get("url") != provider["endpoint"]):
            raise InputError("The assessment response differs from the selected native endpoint")
        raw = read(response["body"])
        body = check_response(load_json(raw))
        before, after = attempt["configurationBefore"], attempt["configurationAfter"]
        IatiDqa._check_observation(before, provider, read)
        IatiDqa._check_observation(after, provider, read)
        same_config = (before["state"] == after["state"] == "COMPLETE"
                       and before["configurations"] == after["configurations"])
        raw_numbers = json.loads(raw, parse_float=str, parse_int=str)
        details_selected = selected["parameters"].get("failed_activities", True)
        result = {"schema": ASSESSMENT, **selected, "requestId": request_id,
                  "request": attempt["request"], "response": response,
                  "configurationBefore": before, "configurationAfter": after,
                  "configurationStable": same_config, "attempt": attempt["number"],
                  "generatedAt": body["generated_at"], "receivedAt": response["receivedAt"],
                  "summary": {**body["summary"], "total_budget": raw_numbers["summary"]["total_budget"]},
                  "counts": {name: body[name] for name in ("pass_count", "fail_count", "not_applicable_count")},
                  "listedActivities": len(body["failed_activities"]),
                  "listedRuleResults": sum(1 for _ in finding_rows(body)),
                  "detailsSelected": details_selected,
                  "percentages": {name: body.get(name) for name in
                      ("total_percentages", "h1_percentages", "h2_percentages", "percentages")},
                  "availableSegmentations": body["available_segmentations"],
                  "reviewFindings": []}
        if body["pass_count"] + body["fail_count"] != body["summary"]["total_programmes"] + body["summary"]["total_projects"]:
            result["reviewFindings"].append("Activity outcome counts differ from the provider hierarchy totals.")
        if details_selected and body["fail_count"] != len(body["failed_activities"]):
            result["reviewFindings"].append("The provider failure count differs from the returned activity list.")
        if not same_config:
            result["reviewFindings"].append("Inspect the captured configuration observations alongside this assessment.")
        result["id"] = digest(json_bytes(result))
        return result

    def capture(self, raw):
        object_input(raw, {"requestId", "provider", "parameters", "label", "operator", "notes"},
                     {"requestId", "provider", "parameters", "label", "operator"})
        with self.ws.mutex:
            provider = self._record("providers", raw["provider"])
            selected = {"provider": provider["id"], "parameters": parameters(raw["parameters"]),
                        "label": text(raw["label"], "Assessment label"),
                        "operator": text(raw["operator"], "Receiving operator"),
                        "notes": text(raw.get("notes", ""), "Assessment notes", 16000, True)}
            op = self._operation(raw["requestId"], "assessment", selected)
            if op["state"] == "COMPLETE":
                return self.assessment(op["result"])
            attempt = op["attempts"][-1] if op["attempts"] else None
            if not attempt or "response" not in attempt or attempt["response"]["status"] != 200:
                attempt = {"number": len(op["attempts"]) + 1, "startedAt": utc(),
                           "request": self._blob(json_bytes(selected["parameters"])), "state": "STARTED"}
                op["attempts"].append(attempt)
                op["state"] = "ACQUIRING"
                self._save_operation(op)
                try:
                    attempt["configurationBefore"] = self._config_observation(provider)
                    attempt["state"] = "DISPATCHING"
                    self._save_operation(op)
                    attempt["response"] = self._exchange(provider, "", self.blob_path(attempt["request"]).read_bytes())
                    attempt["state"] = "RESPONSE_SAVED"
                    self._save_operation(op)
                except (InputError, ValueError, OSError) as error:
                    attempt.update(state="INTERRUPTED", error=str(error), endedAt=utc())
                    op["state"] = "INTERRUPTED"
                    self._save_operation(op)
                    raise
            if attempt["response"]["status"] != 200:
                attempt.update(state="HTTP_ERROR", endedAt=utc())
                op["state"] = "HTTP_ERROR"
                self._save_operation(op)
                raise InputError("DQA returned HTTP " + str(attempt["response"]["status"]) +
                                 "; the complete native response is retained under request " + op["requestId"])
            try:
                body = check_response(self._json(attempt["response"]["body"]))
            except (InputError, ValueError) as error:
                attempt.update(state="RESPONSE_REVIEW", error=str(error), endedAt=utc())
                op["state"] = "RESPONSE_REVIEW"
                self._save_operation(op)
                raise
            if "configurationAfter" not in attempt:
                attempt["configurationAfter"] = self._config_observation(provider)
                self._save_operation(op)
            result = self._assessment_result(selected, op["requestId"], attempt, provider,
                                             lambda item: self.blob_path(item).read_bytes())
            attempt.update(state="COMPLETE", endedAt=utc())
            op.update(state="COMPLETE", result=result["id"])
            with self.db:
                self.db.execute("INSERT OR IGNORE INTO iati_dqa_assessments VALUES(?,?)",
                                (result["id"], json_bytes(result).decode()))
                self._index_findings(result, body)
                self.db.execute("UPDATE iati_dqa_operations SET body=? WHERE id=?", (json_bytes(op).decode(), op["requestId"]))
            return result

    def assessments(self):
        with self.ws.mutex:
            rows = [load_json(r["body"]) for r in self.db.execute("SELECT body FROM iati_dqa_assessments ORDER BY id")]
            return [{key: row[key] for key in ("id", "provider", "label", "operator", "generatedAt", "receivedAt",
                    "summary", "counts", "listedActivities", "listedRuleResults", "configurationStable")} for row in rows]

    def operations(self):
        with self.ws.mutex:
            return [load_json(r["body"]) for r in self.db.execute("SELECT body FROM iati_dqa_operations ORDER BY id")]

    def assessment(self, ident):
        with self.ws.mutex:
            result = self._record("assessments", ident)
            self.blob_path(result["request"])
            self.blob_path(result["response"]["body"])
            return result

    def result(self, ident):
        return check_response(self._json(self.assessment(ident)["response"]["body"]))

    def _index_findings(self, assessment, native=None):
        """One complete derived index; original response bytes remain authoritative."""
        existing = self.db.execute("SELECT * FROM iati_dqa_finding_indexes WHERE assessment=?", (assessment["id"],)).fetchone()
        if existing:
            if (existing["response_sha"] != assessment["response"]["body"]["sha256"]
                    or existing["row_count"] != assessment["listedRuleResults"]):
                raise InputError("The native finding index differs from its selected response")
            return
        if native is None:
            native = check_response(self._json(assessment["response"]["body"]))
        self.db.execute("DELETE FROM iati_dqa_findings WHERE assessment=?", (assessment["id"],))
        count = 0
        for ordinal, row in enumerate(finding_rows(native)):
            complete = json_bytes(row).decode()
            self.db.execute("INSERT INTO iati_dqa_findings VALUES(?,?,?,?,?,?)",
                            (assessment["id"], ordinal, row["key"], row["status"],
                             json.dumps(row, ensure_ascii=False).casefold(), complete))
            count += 1
        if count != assessment["listedRuleResults"]:
            raise InputError("The complete finding index differs from the original result count")
        self.db.execute("INSERT INTO iati_dqa_finding_indexes VALUES(?,?,?)",
                        (assessment["id"], assessment["response"]["body"]["sha256"], count))

    def findings(self, ident, offset=0, limit=50, status="", search=""):
        if status and status not in STATUSES:
            raise InputError("Choose a native pass, fail or not_applicable status")
        text(search, "Finding search", 1000, True)
        integer(offset, "Offset", maximum=1000000000)
        integer(limit, "Page size", minimum=1, maximum=250)
        with self.ws.mutex:
            selected = self._record("assessments", ident)
            with self.db:
                self._index_findings(selected)
            terms, values = ["assessment=?"], [ident]
            if status:
                terms.append("status=?")
                values.append(status)
            if search:
                terms.append("instr(search,?)>0")
                values.append(search.casefold())
            where = " AND ".join(terms)
            total = self.db.execute("SELECT COUNT(*) FROM iati_dqa_findings WHERE " + where, values).fetchone()[0]
            rows = self.db.execute("SELECT body FROM iati_dqa_findings WHERE " + where +
                                   " ORDER BY ordinal LIMIT ? OFFSET ?", [*values, limit, offset])
            return {"assessment": ident, "total": total, "offset": offset, "limit": limit,
                    "items": [load_json(row["body"]) for row in rows],
                    "nextOffset": offset + limit if offset + limit < total else None}

    def cases(self):
        with self.ws.mutex:
            rows = self.db.execute("""SELECT c.body FROM iati_dqa_cases c JOIN
                (SELECT id,MAX(revision) AS revision FROM iati_dqa_cases GROUP BY id) latest
                ON latest.id=c.id AND latest.revision=c.revision ORDER BY c.id""")
            return [{key: value[key] for key in ("id", "revision", "name", "client", "review", "updatedAt", "assessmentIds")}
                    for value in (load_json(row["body"]) for row in rows)]

    def case(self, ident, revision=None):
        checked_id(ident)
        with self.ws.mutex:
            if revision is None:
                row = self.db.execute("SELECT body FROM iati_dqa_cases WHERE id=? ORDER BY revision DESC LIMIT 1", (ident,)).fetchone()
            else:
                integer(revision, "Case revision", 1, 1000000000)
                row = self.db.execute("SELECT body FROM iati_dqa_cases WHERE id=? AND revision=?", (ident, revision)).fetchone()
            if row is None:
                raise InputError("Unknown saved DQA case revision")
            return load_json(row["body"])

    def history(self, ident):
        self.case(ident)
        return [load_json(r["body"]) for r in self.db.execute(
            "SELECT body FROM iati_dqa_cases WHERE id=? ORDER BY revision", (ident,))]

    def _definition(self, raw, previous=None, *, receiving_actions=False):
        object_input(raw, {"requestId", "id", "expectedRevision", "name", "client", "notes", "assessmentIds",
                           "portfolios", "review", "reviewEdits"},
                     {"requestId", "name", "client", "assessmentIds", "review"})
        if ("id" in raw) != ("expectedRevision" in raw):
            raise InputError("A DQA case edit requires both id and expectedRevision")
        ids = raw["assessmentIds"]
        if (not isinstance(ids, list) or not 1 <= len(ids) <= 256 or len(set(ids)) != len(ids)):
            raise InputError("Select 1 to 256 distinct complete assessment editions")
        for ident in ids:
            self.assessment(ident)
        review = raw["review"]
        object_input(review, {"status", "reviewer", "note"}, {"status", "reviewer", "note"})
        if review["status"] not in {"draft", "reviewed", "needs-correction"}:
            raise InputError("Choose draft, reviewed or needs-correction")
        review = {"status": review["status"],
                  "reviewer": text(review["reviewer"], "Reviewer", 160, review["status"] == "draft"),
                  "note": text(review["note"], "Review note", 16000, True)}
        portfolios = raw.get("portfolios", previous["portfolios"] if previous else [])
        if not isinstance(portfolios, list) or len(portfolios) > 32:
            raise InputError("Select up to 32 complete original IATI portfolios")
        seen_portfolios = set()
        for selected in portfolios:
            object_input(selected, {"id", "revision"}, {"id", "revision"})
            self.ws.portfolio(selected["id"], selected["revision"])
            key = (selected["id"], selected["revision"])
            if key in seen_portfolios:
                raise InputError("The same portfolio revision is selected twice")
            seen_portfolios.add(key)
        edits = raw.get("reviewEdits", [])
        if not isinstance(edits, list) or (not receiving_actions and len(edits) > 1000):
            raise InputError("Apply up to 1000 named finding edits in one revision")
        actions = {(v["assessment"], v["finding"]): v for v in (previous["actions"] if previous else [])}
        indexes = {}
        edited = set()
        for edit in edits:
            object_input(edit, {"assessment", "finding", "status", "owner", "note", "dueDate", "remove"},
                         {"assessment", "finding"})
            capture, finding = edit["assessment"], checked_id(edit["finding"])
            if capture not in ids:
                raise InputError("The reviewed finding must belong to a selected assessment")
            key = (capture, finding)
            if key in edited:
                raise InputError("Apply each finding decision once per request")
            edited.add(key)
            if capture not in indexes:
                indexes[capture] = {row["key"]: row for row in finding_rows(self.result(capture))}
            if finding not in indexes[capture]:
                raise InputError("The finding does not occur in the original selected response")
            if edit.get("remove") is True:
                if set(edit) != {"assessment", "finding", "remove"}:
                    raise InputError("A removed finding decision selects only its original identity")
                actions.pop(key, None)
                continue
            if "remove" in edit or edit.get("status") not in ACTION_STATUSES:
                raise InputError("Choose open, investigate, addressed or accepted")
            due = text(edit.get("dueDate", ""), "Action date", 10, True)
            if due:
                try:
                    if datetime.strptime(due, "%Y-%m-%d").date().isoformat() != due:
                        raise ValueError()
                except (TypeError, ValueError) as error:
                    raise InputError("Choose a complete YYYY-MM-DD action date") from error
            actions[key] = {"assessment": capture, "finding": finding, "status": edit["status"],
                            "owner": text(edit.get("owner", ""), "Action owner", 160, True),
                            "note": text(edit.get("note", ""), "Action note", 16000, True), "dueDate": due}
        if any(value["assessment"] not in ids for value in actions.values()):
            raise InputError("Remove the selected assessment's current action decisions before removing its selection")
        result = {"name": text(raw["name"], "Case name"), "client": text(raw["client"], "Client name"),
                  "notes": text(raw.get("notes", ""), "Case notes", 32000, True),
                  "assessmentIds": ids, "portfolios": portfolios, "review": review,
                  "actions": [actions[key] for key in sorted(actions)]}
        if len(json_bytes(result)) > MAX_BODY:
            raise InputError("The complete DQA case revision exceeds 64 MiB")
        return result

    def save_case(self, raw):
        with self.ws.mutex:
            # Replaying an already completed request returns its historical revision,
            # even after another analyst has advanced the case.
            op = self._operation(raw.get("requestId") if isinstance(raw, dict) else None, "case", raw)
            if op["state"] == "COMPLETE":
                return self.case(op["result"]["id"], op["result"]["revision"])
            previous = self.case(raw["id"]) if "id" in raw else None
            if previous and previous["revision"] != raw.get("expectedRevision"):
                raise InputError("This case has a newer saved revision; open it before applying the next decision")
            definition = self._definition(raw, previous)
            ident = previous["id"] if previous else digest(os.urandom(32))
            revision = previous["revision"] + 1 if previous else 1
            result = {"schema": CASE, "id": ident, "revision": revision, **definition,
                      "previousRevision": previous["revision"] if previous else None,
                      "createdAt": previous["createdAt"] if previous else op["createdAt"], "updatedAt": utc(),
                      "definitionSha256": digest(json_bytes(definition))}
            op.update(state="COMPLETE", result={"id": ident, "revision": revision})
            with self.db:
                self.db.execute("INSERT INTO iati_dqa_cases VALUES(?,?,?)", (ident, revision, json_bytes(result).decode()))
                self.db.execute("UPDATE iati_dqa_operations SET body=? WHERE id=?", (json_bytes(op).decode(), op["requestId"]))
            return result

    def _comparison_result(self, before, after, left, right, old, new):
        old_activities = {row["key"]: row for row in activity_rows(old)}
        new_activities = {row["key"]: row for row in activity_rows(new)}
        changes, counts = [], Counter()
        for key in sorted(set(old_activities) | set(new_activities)):
            a, b = old_activities.get(key), new_activities.get(key)
            if a and b and a["activity"] == b["activity"]:
                counts["unchanged"] += 1
                continue
            kind = "newly-listed" if a is None else "no-longer-listed" if b is None else "changed"
            counts[kind] += 1
            changes.append({"activityKey": key, "kind": kind,
                            "before": a["activity"] if a else None, "after": b["activity"] if b else None})
        scope = {}
        for key in sorted(set(left["parameters"]) | set(right["parameters"])):
            if key in {"skip_cache", "failed_activities"}:
                continue
            if left["parameters"].get(key) != right["parameters"].get(key):
                scope[key] = {"before": left["parameters"].get(key), "after": right["parameters"].get(key)}
        body = b"".join(json_bytes(change) for change in changes)
        result = {"schema": COMPARISON, "before": before, "after": after, "scopeChanges": scope,
                  "providerChanged": left["provider"] != right["provider"],
                  "configurationChanged": left["configurationBefore"].get("configurations") != right["configurationBefore"].get("configurations"),
                  "beforeGeneratedAt": left["generatedAt"], "afterGeneratedAt": right["generatedAt"],
                  "beforeSummary": left["summary"], "afterSummary": right["summary"],
                  "beforeCounts": left["counts"], "afterCounts": right["counts"],
                  "counts": {kind: counts[kind] for kind in ("newly-listed", "no-longer-listed", "changed", "unchanged")},
                  "changes": self._blob(body, "application/x-ndjson"),
                  "meaning": "Membership and full record changes in the provider's returned failed-activity lists."}
        result["id"] = digest(json_bytes(result))
        return result

    def compare(self, before, after):
        with self.ws.mutex:
            if before == after:
                raise InputError("Select two different saved assessment editions")
            result = self._comparison_result(before, after, self.assessment(before), self.assessment(after),
                                             self.result(before), self.result(after))
            with self.db:
                self.db.execute("INSERT OR IGNORE INTO iati_dqa_comparisons VALUES(?,?)", (result["id"], json_bytes(result).decode()))
            return result

    def comparison(self, ident, offset=0, limit=50):
        with self.ws.mutex:
            result = self._record("comparisons", ident)
            with self.blob_path(result["changes"]).open("rb") as stream:
                page = page_values((load_json(line) for line in stream), offset, limit)
            return {**result, "page": page}

    @staticmethod
    def _references(value):
        found = {}
        def walk(item):
            if isinstance(item, dict):
                if (set(item) == {"sha256", "bytes", "contentType"} and isinstance(item["sha256"], str)
                        and re.fullmatch(r"[0-9a-f]{64}", item["sha256"])):
                    old = found.get(item["sha256"])
                    if old and old["bytes"] != item["bytes"]:
                        raise InputError("Conflicting DQA source identities")
                    found[item["sha256"]] = item
                for child in item.values():
                    walk(child)
            elif isinstance(item, list):
                for child in item:
                    walk(child)
        walk(value)
        return found

    def _bundle(self, ident, revision=None):
        selected = self.case(ident, revision)
        history = [row for row in self.history(ident) if row["revision"] <= selected["revision"]]
        ids = sorted({value for row in history for value in row["assessmentIds"]})
        assessments = [self.assessment(value) for value in ids]
        providers = {row["provider"] for row in assessments}
        # A provider edition keeps its complete predecessor chain.
        pending = list(providers)
        while pending:
            provider = self._record("providers", pending.pop())
            if provider.get("previous") and provider["previous"] not in providers:
                providers.add(provider["previous"])
                pending.append(provider["previous"])
        provider_rows = [self._record("providers", value) for value in sorted(providers)]
        operations = []
        for op in self.operations():
            result = op.get("result")
            if ((op["kind"] in {"provider", "assessment"} and result in providers | set(ids))
                    or (op["kind"] == "case" and isinstance(result, dict) and result.get("id") == ident
                        and result.get("revision", 0) <= selected["revision"])):
                operations.append(op)
        comparisons = [load_json(row["body"]) for row in self.db.execute("SELECT body FROM iati_dqa_comparisons ORDER BY id")]
        comparisons = [row for row in comparisons if row["before"] in ids and row["after"] in ids]
        return {"selected": selected, "history": history, "providers": provider_rows,
                "assessments": assessments, "operations": operations, "comparisons": comparisons}

    def _reports(self, bundle):
        result = {}
        summary = io.StringIO(newline="")
        writer = csv.writer(summary)
        writer.writerow(["assessment", "label", "organisation", "generated_at", "programmes", "projects",
                         "passed_activities", "failed_activities", "not_applicable_rule_results",
                         "provider_financial_year", "provider_budget"])
        for row in bundle["assessments"]:
            s, c = row["summary"], row["counts"]
            writer.writerow([row["id"], row["label"], s["organisation"], row["generatedAt"],
                             s["total_programmes"], s["total_projects"], c["pass_count"], c["fail_count"],
                             c["not_applicable_count"], s["financial_year"], s["total_budget"]])
        result["assessment-summary.csv"] = summary.getvalue().encode()
        findings = io.StringIO(newline="")
        writer = csv.writer(findings)
        writer.writerow(["assessment", "finding", "iati_identifier", "hierarchy", "title", "kind", "rule", "status", "complete_native_result"])
        for row in bundle["assessments"]:
            for item in finding_rows(self.result(row["id"])):
                writer.writerow([row["id"], item["key"], item["iatiIdentifier"], item["hierarchy"], item["title"],
                                 item["kind"], item["rule"], item["status"], json_bytes(item["native"]).decode().rstrip("\n")])
        result["findings.csv"] = findings.getvalue().encode()
        actions = io.StringIO(newline="")
        writer = csv.writer(actions)
        writer.writerow(["assessment", "finding", "status", "owner", "due_date", "note"])
        for item in bundle["selected"]["actions"]:
            writer.writerow([item["assessment"], item["finding"], item["status"], item["owner"], item["dueDate"], item["note"]])
        result["review-actions.csv"] = actions.getvalue().encode()
        result["case.json"] = json_bytes(bundle["selected"])
        result["comparisons.json"] = json_bytes(bundle["comparisons"])
        return result

    def export_case(self, ident, output, revision=None):
        from iati_workspace import packet_write
        with self.ws.mutex, self.ws.scratch() as temp:
            bundle = self._bundle(ident, revision)
            content = {"case-history.json": bundle["history"], "providers.json": bundle["providers"],
                       "assessments.json": bundle["assessments"], "operations.json": bundle["operations"],
                       "comparisons.json": bundle["comparisons"]}
            sources = {}
            for name, value in content.items():
                path = temp / name
                private_write(path, json_bytes(value))
                sources[name] = path
            for name, data in self._reports(bundle).items():
                if len(data) > MAX_BODY:
                    raise InputError("The complete DQA report exceeds 64 MiB")
                path = temp / ("report-" + name)
                private_write(path, data)
                sources["reports/" + name] = path
            for key, item in self._references(content).items():
                sources["blobs/" + key + ".bin"] = self.blob_path(item)
            portfolios = sorted({(item["id"], item["revision"]) for row in bundle["history"] for item in row["portfolios"]})
            for portfolio, selected_revision in portfolios:
                name = portfolio + "-" + str(selected_revision) + ".zip"
                path = self.root / "exports" / ("portfolio-" + name)
                self.ws.export_portfolio(portfolio, path, selected_revision)
                sources["portfolios/" + name] = path
            for name, path in GUIDES.items():
                sources["guides/" + name] = path
            output = Path(output).expanduser().absolute()
            if output.parent.resolve(strict=True) != output.parent:
                raise InputError("Select the original receiving output directory")
            metadata = {"case": ident, "revision": bundle["selected"]["revision"],
                        "assessments": [row["id"] for row in bundle["assessments"]],
                        "producer": {"product": "IATI aid finance and DQA customer workspace", "upstream": UPSTREAM}}
            return packet_write(output, sources, PACKET, metadata)

    def receive(self, path):
        with self.ws.mutex, self.ws.scratch() as temp:
            regular(Path(path), MAX_PACKET)
            packet_sha = file_digest(Path(path), MAX_PACKET)
            with zipfile.ZipFile(path) as archive:
                infos = archive.infolist()
                names = [row.filename for row in infos]
                if (len(infos) > MAX_MEMBERS or len(set(names)) != len(names) or "manifest.json" not in names
                        or sum(row.file_size for row in infos) > MAX_PACKET):
                    raise InputError("The DQA packet must contain one complete declared file set")
                allowed = re.compile(r"(?:manifest|case-history|providers|assessments|operations|comparisons)\.json|"
                                     r"blobs/[0-9a-f]{64}\.bin|portfolios/[0-9a-f]{64}-[1-9][0-9]*\.zip|"
                                     r"reports/[A-Za-z0-9._-]+|guides/(?:provider/|receiving/(?:dqa-source/)?)?[A-Za-z0-9._-]+\Z")
                for item in infos:
                    if (not allowed.fullmatch(item.filename) or item.is_dir() or item.flag_bits & 1
                            or item.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}
                            or (stat.S_IFMT(item.external_attr >> 16) not in {0, stat.S_IFREG})
                            or item.file_size > (MAX_PACKET if item.filename.startswith("portfolios/") else MAX_BODY)):
                        raise InputError("The DQA packet has an invalid path, type or size")
                manifest = load_json(archive.read("manifest.json"))
                if (not isinstance(manifest, dict) or manifest.get("schema") != PACKET
                        or not isinstance(manifest.get("files"), dict)
                        or set(manifest["files"]) != set(names) - {"manifest.json"}):
                    raise InputError("The DQA manifest must name the complete customer package")
                checked_id(manifest.get("case"))
                integer(manifest.get("revision"), "Receiving revision", 1, 1000000000)
                for item in infos:
                    if item.filename == "manifest.json":
                        continue
                    target = temp / item.filename
                    target.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
                    h, size = hashlib.sha256(), 0
                    with archive.open(item) as source, target.open("xb") as out:
                        target.chmod(0o600)
                        while block := source.read(65536):
                            out.write(block)
                            h.update(block)
                            size += len(block)
                            if size > item.file_size:
                                raise InputError("A DQA packet file exceeds its declared size")
                        out.flush()
                        os.fsync(out.fileno())
                    if manifest["files"][item.filename] != {"bytes": size, "sha256": h.hexdigest()}:
                        raise InputError("A complete DQA packet file differs from its declared identity")
            required = {"case-history.json", "providers.json", "assessments.json", "operations.json", "comparisons.json"}
            required.update("guides/" + name for name in GUIDES)
            if not required <= set(manifest["files"]):
                raise InputError("The DQA packet is missing its original domain history")
            domain_files = {"case-history.json", "providers.json", "assessments.json", "operations.json", "comparisons.json"}
            content = {name: load_json((temp / name).read_bytes()) for name in domain_files}
            if any(not isinstance(value, list) or any(not isinstance(row, dict) for row in value) for value in content.values()):
                raise InputError("DQA domain history must retain its complete arrays")
            history, providers, assessments, operations, comparisons = [content[name] for name in
                ("case-history.json", "providers.json", "assessments.json", "operations.json", "comparisons.json")]
            if (not history or len(history) != manifest["revision"] or [row.get("revision") for row in history] != list(range(1, manifest["revision"] + 1))
                    or any(row.get("id") != manifest["case"] or row.get("schema") != CASE for row in history)):
                raise InputError("The original DQA case history must be complete and ordered")
            for rows in (providers, assessments, comparisons):
                if len({row.get("id") for row in rows if isinstance(row, dict)}) != len(rows):
                    raise InputError("The received DQA records repeat an identity")
            provider_ids = {row["id"] for row in providers}
            assessment_ids = {row["id"] for row in assessments}
            selected_ids = {value for row in history for value in row["assessmentIds"]}
            if sorted(assessment_ids) != manifest.get("assessments") or assessment_ids != selected_ids:
                raise InputError("The packet must retain every selected assessment and its complete history")
            references = self._references(content)
            if {name for name in manifest["files"] if name.startswith("blobs/")} != {
                    "blobs/" + key + ".bin" for key in references}:
                raise InputError("The packet must carry exactly every original DQA source file")
            for key, item in references.items():
                source = temp / "blobs" / (key + ".bin")
                if file_digest(source, MAX_BODY) != key or source.stat().st_size != item["bytes"]:
                    raise InputError("A referenced DQA native source differs")
            # Validate original record identities and all conflicts before publishing.
            for table, rows, schema in (("providers", providers, PROVIDER),
                                        ("assessments", assessments, ASSESSMENT),
                                        ("comparisons", comparisons, COMPARISON)):
                for row in rows:
                    if row.get("schema") != schema:
                        raise InputError("A received DQA record has an unknown schema")
                    if table == "providers":
                        selected = {key: value for key, value in row.items() if key not in {"schema", "id", "createdAt"}}
                        object_input(selected, {"name", "endpoint", "authorizationEnv", "timeoutSeconds", "notes", "protocol", "previous"},
                                     {"name", "endpoint", "authorizationEnv", "timeoutSeconds", "notes", "protocol"})
                        if endpoint(row["endpoint"]) != row["endpoint"] or row["protocol"] != UPSTREAM:
                            raise InputError("The saved provider endpoint or native protocol changed")
                        text(row["name"], "Provider name")
                        text(row["notes"], "Provider notes", 16000, True)
                        integer(row["timeoutSeconds"], "Provider timeout", 1, 900)
                        if not isinstance(row["authorizationEnv"], str) or not ENVIRONMENT.fullmatch(row["authorizationEnv"]):
                            raise InputError("The saved provider authorization variable name changed")
                        if row.get("previous") and row["previous"] not in provider_ids:
                            raise InputError("A provider predecessor is missing")
                    else:
                        selected = {key: value for key, value in row.items() if key != "id"}
                    if digest(json_bytes(selected)) != row.get("id"):
                        raise InputError("A received DQA record has a different complete identity")
                    existing = self.db.execute("SELECT body FROM iati_dqa_" + table + " WHERE id=?", (row["id"],)).fetchone()
                    if existing and load_json(existing["body"]) != row:
                        raise InputError("The received DQA record conflicts with saved work")
                    if table == "assessments":
                        if row["provider"] not in provider_ids:
                            raise InputError("A complete assessment needs its original provider edition")
                        definition = {key: row[key] for key in ("provider", "parameters", "label", "operator", "notes")}
                        text(definition["label"], "Assessment label")
                        text(definition["operator"], "Receiving operator")
                        text(definition["notes"], "Assessment notes", 16000, True)
                        native_attempt = {key: row[key] for key in
                                          ("request", "response", "configurationBefore", "configurationAfter")}
                        native_attempt["number"] = integer(row["attempt"], "Native attempt", 1, 1000000)
                        original_provider = next(item for item in providers if item["id"] == row["provider"])
                        rebuilt = self._assessment_result(definition, row["requestId"], native_attempt, original_provider,
                            lambda item: (temp / "blobs" / (checked_id(item["sha256"]) + ".bin")).read_bytes())
                        if rebuilt != row:
                            raise InputError("The saved assessment differs from its complete original native response and configuration")
                    if table == "comparisons" and (row["before"] not in assessment_ids or row["after"] not in assessment_ids):
                        raise InputError("A DQA comparison is missing one of its original assessments")
            for row in history:
                definition = {key: row[key] for key in ("name", "client", "notes", "assessmentIds", "portfolios", "review", "actions")}
                if digest(json_bytes(definition)) != row.get("definitionSha256"):
                    raise InputError("A saved DQA case definition differs")
                existing = self.db.execute("SELECT body FROM iati_dqa_cases WHERE id=? AND revision=?", (row["id"], row["revision"])).fetchone()
                if existing and load_json(existing["body"]) != row:
                    raise InputError("Receiving would change an existing case revision")
            seen_requests = set()
            for op in operations:
                if (not isinstance(op, dict) or not isinstance(op.get("requestId"), str)
                        or not REQUEST_ID.fullmatch(op["requestId"]) or op["requestId"] in seen_requests
                        or op.get("state") != "COMPLETE" or digest(json_bytes(op.get("input"))) != op.get("inputSha256")):
                    raise InputError("The original DQA operation journal is invalid")
                seen_requests.add(op["requestId"])
                existing = self.db.execute("SELECT * FROM iati_dqa_operations WHERE id=?", (op["requestId"],)).fetchone()
                if existing and (existing["kind"] != op["kind"] or existing["input_sha"] != op["inputSha256"]
                                 or load_json(existing["body"]) != op):
                    raise InputError("The received operation conflicts with an original request")
            # Completed requests must replay their selected original domain result.
            by_provider = {row["id"]: row for row in providers}
            by_assessment = {row["id"]: row for row in assessments}
            by_case = {(row["id"], row["revision"]): row for row in history}
            case_requests, assessment_requests, provider_requests = set(), set(), set()
            for op in operations:
                kind, selected, result = op.get("kind"), op.get("input"), op.get("result")
                if kind == "provider":
                    if not isinstance(result, str) or result not in by_provider:
                        raise InputError("The provider request result is outside this complete packet")
                    definition = {key: value for key, value in by_provider[result].items()
                                  if key not in {"schema", "id", "createdAt"}}
                    if selected != definition:
                        raise InputError("The completed provider request selects a different original edition")
                    provider_requests.add(result)
                elif kind == "assessment":
                    if not isinstance(result, str) or result not in by_assessment:
                        raise InputError("The assessment request result is outside this complete packet")
                    record = by_assessment[result]
                    definition = {key: record[key] for key in ("provider", "parameters", "label", "operator", "notes")}
                    attempts = op.get("attempts")
                    if (selected != definition or op["requestId"] != record["requestId"]
                            or not isinstance(attempts, list) or not attempts
                            or [item.get("number") for item in attempts] != list(range(1, len(attempts) + 1))
                            or record["attempt"] != len(attempts) or attempts[-1].get("state") != "COMPLETE"
                            or any(attempts[-1].get(key) != record[key] for key in
                                   ("request", "response", "configurationBefore", "configurationAfter"))):
                        raise InputError("The completed assessment request differs from its original acquisition")
                    assessment_requests.add(result)
                elif kind == "case":
                    if (not isinstance(result, dict) or set(result) != {"id", "revision"}
                            or type(result["revision"]) is not int
                            or (result["id"], result["revision"]) not in by_case
                            or not isinstance(selected, dict) or selected.get("requestId") != op["requestId"]):
                        raise InputError("The completed case request selects a different historical revision")
                    case_requests.add((result["id"], result["revision"]))
                else:
                    raise InputError("The customer packet contains an unsupported completed operation")
            if (assessment_requests != assessment_ids or provider_requests != provider_ids
                    or case_requests != set(by_case)):
                raise InputError("Retain every original completed request for the complete selected history")
            for index, row in enumerate(history):
                previous = history[index - 1] if index else None
                if (type(row["revision"]) is not int or row.get("previousRevision") != (index if index else None)
                        or (previous and row.get("createdAt") != previous.get("createdAt"))):
                    raise InputError("The original case revision link or creation identity changed")
            portfolio_selections = sorted({(item["id"], item["revision"]) for row in history for item in row["portfolios"]})
            expected_portfolios = {"portfolios/" + ident + "-" + str(revision) + ".zip" for ident, revision in portfolio_selections}
            if {name for name in manifest["files"] if name.startswith("portfolios/")} != expected_portfolios:
                raise InputError("The complete selected IATI finance portfolios are missing")
            for name in sorted(expected_portfolios):
                self.ws.receive_portfolio(temp / name)
            for key, item in references.items():
                self._blob((temp / "blobs" / (key + ".bin")).read_bytes(), item["contentType"])
            # Domain rows become visible together on the existing workspace transaction.
            with self.db:
                for table, rows in (("providers", providers), ("assessments", assessments), ("comparisons", comparisons)):
                    for row in rows:
                        self.db.execute("INSERT OR IGNORE INTO iati_dqa_" + table + " VALUES(?,?)", (row["id"], json_bytes(row).decode()))
                for row in history:
                    self.db.execute("INSERT OR IGNORE INTO iati_dqa_cases VALUES(?,?,?)", (row["id"], row["revision"], json_bytes(row).decode()))
                for op in operations:
                    self.db.execute("INSERT OR IGNORE INTO iati_dqa_operations VALUES(?,?,?,?)",
                                    (op["requestId"], op["kind"], op["inputSha256"], json_bytes(op).decode()))
                for assessment in assessments:
                    self._index_findings(assessment)
                bundle = {"selected": history[-1], "history": history, "providers": providers,
                          "assessments": assessments, "operations": operations, "comparisons": comparisons}
                rebuilt_reports = self._reports(bundle)
                if {name for name in manifest["files"] if name.startswith("reports/")} != {
                        "reports/" + name for name in rebuilt_reports}:
                    raise InputError("The complete client report set is missing")
                for name, body in rebuilt_reports.items():
                    if (temp / "reports" / name).read_bytes() != body:
                        raise InputError("A complete DQA client report differs from its original domain records")
                for comparison in comparisons:
                    before, after = comparison["before"], comparison["after"]
                    rebuilt = self._comparison_result(before, after, self.assessment(before), self.assessment(after),
                                                      self.result(before), self.result(after))
                    if rebuilt != comparison:
                        raise InputError("The full native assessment comparison does not reconstruct")
                for row in history:
                    previous = history[row["revision"] - 2] if row["revision"] > 1 else None
                    raw = {"requestId": "received-definition", **{key: row[key] for key in
                           ("name", "client", "notes", "assessmentIds", "portfolios", "review")},
                           "reviewEdits": row["actions"]}
                    rebuilt = self._definition(raw, receiving_actions=True)
                    if any(rebuilt[key] != row[key] for key in rebuilt):
                        raise InputError("A saved DQA review does not resolve against its actual native findings")
                for op in operations:
                    if op["kind"] != "case":
                        continue
                    selected, revision = op["input"], op["result"]["revision"]
                    previous = history[revision - 2] if revision > 1 else None
                    if previous:
                        if selected.get("id") != manifest["case"] or selected.get("expectedRevision") != revision - 1:
                            raise InputError("The completed edit request selects a different original predecessor")
                    elif "id" in selected or "expectedRevision" in selected:
                        raise InputError("The original creation request must create its first case revision")
                    definition = self._definition(selected, previous)
                    record = history[revision - 1]
                    if any(record[key] != value for key, value in definition.items()):
                        raise InputError("The completed case request does not reconstruct its historical result")
                stored = self.root / "received" / (packet_sha + ".zip")
                if not stored.exists():
                    staged = temp / "customer-original.zip"
                    with Path(path).open("rb") as inp, staged.open("xb") as out:
                        staged.chmod(0o600)
                        shutil.copyfileobj(inp, out, 65536)
                        out.flush()
                        os.fsync(out.fileno())
                    if file_digest(staged, MAX_PACKET) != packet_sha:
                        raise InputError("The original customer package changed during receiving")
                    os.replace(staged, stored)
                    sync_dir(stored.parent)
                if file_digest(stored, MAX_PACKET) != packet_sha:
                    raise InputError("The complete received customer package changed")
                receipt = {"schema": "stellar-forge.iati-dqa-receiving.v1", "packetSha256": packet_sha,
                           "case": manifest["case"], "revision": manifest["revision"],
                           "assessments": len(assessments), "historyRevisions": len(history),
                           "providers": len(providers), "files": len(manifest["files"]), "reports": sorted(rebuilt_reports),
                           "portfolioPackets": len(portfolio_selections)}
                self.db.execute("INSERT OR IGNORE INTO iati_dqa_receipts VALUES(?,?)", (packet_sha, json_bytes(receipt).decode()))
                return {"case": self.case(manifest["case"], manifest["revision"]), "receiving": receipt}
