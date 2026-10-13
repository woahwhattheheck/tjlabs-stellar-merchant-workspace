"""MIT. Saved original TIND job observations and reviewed batch receiving."""
from __future__ import annotations
import base64
import binascii
import os
from pathlib import Path
import tempfile
import zipfile
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlsplit
from urllib.request import Request, build_opener
from bridge import InputError
from harvest import jbytes, decode, sha, stamp, plain, page_values
from migration import MAX_JSON, https_url, timestamp

WITHHELD = {"authorization", "proxy-authorization", "cookie", "set-cookie", "set-cookie2"}
STATES = {"submitted", "completed", "failed", "unknown"}
RECORD_STATES = {"accepted", "failed", "pending", "withdrawn"}

def tables(owner):
    owner.db.executescript("""
        CREATE TABLE IF NOT EXISTS tind_destination_jobs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tind_job_observations(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,job_id TEXT NOT NULL,body TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS tind_job_observation_history ON tind_job_observations(job_id);
        CREATE TABLE IF NOT EXISTS tind_job_reviews(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,job_id TEXT NOT NULL,body TEXT NOT NULL);
    """)

def put(owner, table, value):
    owner.db.execute("INSERT INTO " + table + " VALUES(" + ("?,?,?" if table == "tind_destination_jobs" else "?,?,?,?") +
        ") ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        (value["id"], value["projectId"], jbytes(value).decode()) if table == "tind_destination_jobs" else
        (value["id"], value["projectId"], value["jobId"], jbytes(value).decode()))
    return value

def job(owner, project_id, identity):
    value = owner._get("tind_destination_jobs", identity)
    if value["projectId"] != project_id:
        raise InputError("Choose a destination job in this migration")
    return value

def observation(owner, project_id, identity):
    value = owner._get("tind_job_observations", identity)
    if value["projectId"] != project_id:
        raise InputError("Choose an original job response in this migration")
    return value

def request_headers(value):
    if not isinstance(value, dict) or len(value) > 64:
        raise InputError("Native job headers must be literal non-secret pairs")
    for name, text in value.items():
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9-]+", name) or not isinstance(text, str) or "\r" in text or "\n" in text:
            raise InputError("Use original single-line native header values")
        if name.casefold() in WITHHELD | {"host", "content-length", "transfer-encoding"} or re.search(r"token|secret|api.?key", name, re.I):
            raise InputError("Keep native authorization in its original environment binding")
    return dict(value)

def job_url(value, instance):
    from native import origin
    url = https_url(value, "original destination job URL")
    if origin(url) != origin(instance):
        raise InputError("Read the job from the selected original TIND institution")
    if any(re.search(r"token|password|secret|signature|credential|api.?key|authorization", key, re.I)
           for key, _ in parse_qsl(urlsplit(url).query)):
        raise InputError("Keep native job credentials in the existing authorization environment")
    return url

def bind(owner, project, value, operation):
    transfer = owner._get("tind_native_transfers", plain(value.get("transferId"), "original transfer ID", 128))
    if transfer["projectId"] != project["id"] or transfer["status"] == "prepared":
        raise InputError("Select this migration's actual submitted or interrupted native transfer")
    batch = owner._owned_batch(project, transfer["batchId"])
    if batch["status"] == "withdrawn":
        raise InputError("The selected native batch was withdrawn")
    native_id = plain(value.get("nativeJobId"), "actual destination job ID", 4096)
    url = job_url(value.get("url"), project["profile"]["instance"])
    environment = value.get("authorizationEnvironment") or None
    if environment is not None and (not isinstance(environment, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", environment)):
        raise InputError("Name the existing authorization environment variable")
    contract = {"url": url, "method": "GET", "documentation": https_url(value.get("documentation"), "original native job documentation"),
                "headers": request_headers(value.get("headers", {})), "authorizationEnvironment": environment}
    identity = sha(jbytes(["tind-destination-job", project["id"], transfer["id"], native_id]))
    prior = owner.db.execute("SELECT body FROM tind_destination_jobs WHERE id=?", (identity,)).fetchone()
    reviewer = plain(value.get("reviewer"), "binding operator", 256)
    note = plain(value.get("note"), "original job identity and request source", 16384)
    if prior:
        current = decode(prior[0])
        if current["contract"] != contract:
            current.setdefault("contractHistory", []).append({"contract": current["contract"],
                "selectedAt": current.get("updatedAt", current["createdAt"]), "supersededAt": stamp(),
                "reviewer": reviewer, "note": note, "operationId": operation})
            current["contract"] = contract
            current["updatedAt"] = stamp(); current["reviewer"] = reviewer; current["note"] = note
            put(owner, "tind_destination_jobs", current)
        return current
    result = {"schema": "stellar-forge.tind-destination-job.v1", "id": identity, "projectId": project["id"],
              "batchId": batch["id"], "transferId": transfer["id"], "transferSha256": transfer["contractSha256"],
              "file": transfer["file"], "nativeJobId": native_id, "contract": contract, "createdAt": stamp(),
              "reviewer": reviewer, "note": note, "operationId": operation}
    return put(owner, "tind_destination_jobs", result)

def pages(owner, project_id, job_id=None, offset=0, limit=50):
    offset, limit = page_values(offset, limit)
    owner.project(project_id)
    table = "tind_job_observations" if job_id else "tind_destination_jobs"
    clause, values = ("project_id=? AND job_id=?", (project_id, job_id)) if job_id else ("project_id=?", (project_id,))
    if job_id:
        job(owner, project_id, job_id)
    total = owner.db.execute("SELECT COUNT(*) FROM " + table + " WHERE " + clause, values).fetchone()[0]
    rows = [decode(row[0]) for row in owner.db.execute("SELECT body FROM " + table + " WHERE " + clause +
        " ORDER BY rowid DESC LIMIT ? OFFSET ?", (*values, limit, offset))]
    return {"items": rows, "offset": offset, "limit": limit, "total": total,
            "next": offset + len(rows) if offset + len(rows) < total else None}

def read(owner, project_id, job_id, operation_id):
    from native import NoRedirect, headers, native_operation, response_object
    plain(operation_id, "saved native observation operation ID", 128)
    with native_operation(owner):
        with owner.mutex, owner.db:
            selected = job(owner, project_id, job_id)
            project = owner.project(project_id)
            job_url(selected["contract"]["url"], project["profile"]["instance"])
            previous = owner.db.execute("SELECT body FROM tind_job_observations WHERE id=?", (operation_id,)).fetchone()
            if previous:
                previous = decode(previous[0])
                if previous["jobId"] != job_id or previous["projectId"] != project_id:
                    raise InputError("This observation ID belongs to another original job")
                if previous["status"] != "reading":
                    return previous
                # GET continuation can safely complete an interrupted original read.
                previous.setdefault("interruptedReads", []).append({"startedAt": previous["startedAt"], "recoveredAt": stamp()})
            state = previous or {"schema": "stellar-forge.tind-job-observation.v1", "id": operation_id,
                     "projectId": project_id, "jobId": job_id, "origin": "native-get", "request": selected["contract"]}
            state["status"] = "reading"; state["startedAt"] = stamp()
            put(owner, "tind_job_observations", state)
        try:
            # Continue this observation's exact request even if staff later revised
            # the job's current request contract.
            request = state["request"]
            job_url(request["url"], project["profile"]["instance"])
            outgoing = headers(request["authorizationEnvironment"])
            outgoing.update(request["headers"])
            if owner.native_stop.is_set():
                raise InputError("The original native operation was stopped before its read")
            opener = build_opener(NoRedirect())
            try:
                response = opener.open(Request(request["url"], headers=outgoing, method="GET"), timeout=60)
            except HTTPError as response:
                with response:
                    observed = response_object(owner, response)
            else:
                with response:
                    observed = response_object(owner, response)
            state["response"] = {"url": request["url"], "finalURL": request["url"], "method": "GET", **observed}
            state["status"] = "observed"
        except (OSError, URLError, TimeoutError, InputError) as error:
            state["status"] = "interrupted" if owner.native_stop.is_set() else "read-error"
            state["error"] = str(error)
        with owner.mutex, owner.db:
            state["finishedAt"] = stamp()
            return put(owner, "tind_job_observations", state)

def import_response(owner, project, value, operation):
    selected = job(owner, project["id"], value.get("jobId"))
    transport = value.get("transport")
    if not isinstance(transport, dict):
        raise InputError("Retain the original HTTP receipt with this source-browser response")
    if transport.get("method") != "GET":
        raise InputError("Receive the actual original GET job observation")
    requested = job_url(transport.get("url"), project["profile"]["instance"])
    final = job_url(transport.get("finalURL"), project["profile"]["instance"])
    if requested != selected["contract"]["url"]:
        raise InputError("The original HTTP receipt belongs to another exact job request")
    status = transport.get("status")
    if type(status) is not int or not 100 <= status <= 599:
        raise InputError("Retain the original HTTP status")
    observed_at = timestamp(transport.get("observedAt"), "original job response time")
    if observed_at < selected["createdAt"]:
        # A retained source-browser result may predate the local binding, but not the actual native send.
        transfer = owner._get("tind_native_transfers", selected["transferId"])
        if observed_at < transfer.get("sentAt", transfer["createdAt"]):
            raise InputError("The job observation precedes the original native request")
    header_rows = transport.get("headers", [])
    if not isinstance(header_rows, list) or len(header_rows) > 256:
        raise InputError("Retain the original response header pairs")
    kept = []
    for row in header_rows:
        if not isinstance(row, list) or len(row) != 2 or not all(isinstance(item, str) for item in row):
            raise InputError("Original response headers must be name/value pairs")
        if any("\r" in item or "\n" in item for item in row):
            raise InputError("Use the original single-line response headers")
        if row[0].casefold() not in WITHHELD:
            kept.append(row)
    encoded = value.get("bodyBase64")
    if not isinstance(encoded, str):
        raise InputError("Receive the complete unchanged native response bytes")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise InputError("Receive a complete base64 native response") from error
    if not raw or len(raw) > MAX_JSON:
        raise InputError("The complete original response must fit within 8 MiB")
    original = owner.object(raw)
    result = {"schema": "stellar-forge.tind-job-observation.v1", "id": sha(jbytes(["tind-job-import", operation])),
        "projectId": project["id"], "jobId": selected["id"], "origin": "original-source-browser", "request": selected["contract"],
        "status": "observed", "startedAt": stamp(), "finishedAt": stamp(), "operationId": operation,
        "reviewer": plain(value.get("reviewer"), "source receiving operator", 256),
        "note": plain(value.get("note"), "original response acquisition note", 16384),
        "response": {"url": requested, "finalURL": final, "method": "GET", "status": status, "headers": kept,
                     "observedAt": observed_at, "original": original}}
    return put(owner, "tind_job_observations", result)

def pointer(value, path):
    if path == "":
        return value
    if not isinstance(path, str) or not path.startswith("/") or len(path) > 4096:
        raise InputError("Use an original JSON Pointer beginning with /, or empty for the whole value")
    for raw_key in path[1:].split("/"):
        if re.search(r"~(?![01])", raw_key):
            raise InputError("Use JSON Pointer ~0 and ~1 escapes for original field names")
        key = raw_key.replace("~1", "/").replace("~0", "~")
        if isinstance(value, list):
            if not re.fullmatch(r"0|[1-9][0-9]*", key) or int(key) >= len(value):
                raise InputError("The original JSON pointer does not select an existing array member")
            value = value[int(key)]
        elif isinstance(value, dict) and key in value:
            value = value[key]
        else:
            raise InputError("The original response does not contain " + path)
    return value

def mapped_records(document, mapping):
    if not isinstance(mapping, dict) or set(mapping) - {"records", "identifier", "status", "nativeId", "error", "statuses"}:
        raise InputError("Use the complete declared original JSON result mapping")
    rows = pointer(document, mapping.get("records"))
    statuses = mapping.get("statuses")
    if not isinstance(rows, list) or len(rows) > 10000 or not isinstance(statuses, dict) or not statuses:
        raise InputError("Select up to 10,000 original result rows and their explicit status meanings")
    if any(not isinstance(key, str) or value not in RECORD_STATES for key, value in statuses.items()):
        raise InputError("Map actual source status strings to accepted, failed, pending or withdrawn")
    result = []
    for row in rows:
        original_status = pointer(row, mapping.get("status"))
        if not isinstance(original_status, str) or original_status not in statuses:
            raise InputError("Review the actual original record status before mapping it")
        item = {"identifier": pointer(row, mapping.get("identifier")), "status": statuses[original_status]}
        for key in ("nativeId", "error"):
            if mapping.get(key) is not None:
                item[key] = pointer(row, mapping[key])
                if key == "nativeId" and type(item[key]) is int and item[key] >= 0:
                    item[key] = str(item[key])
        result.append(item)
    return result

def preview(owner, project_id, value):
    project = owner.project(project_id)
    selected = job(owner, project_id, value.get("jobId"))
    observed = observation(owner, project_id, value.get("observationId"))
    if observed["jobId"] != selected["id"] or observed["status"] != "observed":
        raise InputError("Choose a complete original response for this destination job")
    response = observed["response"]
    if not 200 <= response["status"] < 300:
        raise InputError("Review the actual failed HTTP response; receive record outcomes from a successful native job observation")
    if response["original"]["bytes"] > MAX_JSON:
        raise InputError("This complete response exceeds the 8 MiB interactive review; select the original job's narrower result page")
    raw = owner.object_path(response["original"]).read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise InputError("Review a complete original UTF-8 job response") from error
    mode = value.get("mode", "reviewed")
    mapping = value.get("mapping")
    if mode == "json":
        try:
            document = json.loads(text)
        except (ValueError, RecursionError) as error:
            raise InputError("This original response is not complete JSON") from error
        records = mapped_records(document, mapping)
    elif mode == "reviewed":
        records = value.get("records", [])
    else:
        raise InputError("Choose explicit reviewed records or an original JSON result mapping")
    status = value.get("status")
    if status not in STATES or not isinstance(records, list) or len(records) > 10000:
        raise InputError("Review the actual job state and up to 10,000 original record outcomes")
    transfer = owner._get("tind_native_transfers", selected["transferId"])
    if transfer["projectId"] != project_id or transfer["contractSha256"] != selected["transferSha256"]:
        raise InputError("The selected original native transfer identity changed")
    batch = owner._owned_batch(project, selected["batchId"])
    if batch["status"] == "withdrawn":
        raise InputError("The original native batch is withdrawn")
    latest = {}
    for receipt_id in batch["receipts"]:
        prior = owner._get("tind_receipts", receipt_id)
        prior_time = timestamp(prior["observedAt"], "retained native observation")
        for original_result in prior["records"]:
            identity = original_result["identifier"]
            if identity not in latest or latest[identity][0] <= prior_time:
                latest[identity] = (prior_time, original_result)
    observation_time = timestamp(response["observedAt"], "selected original observation")
    seen, normalized = set(), []
    counts = {name: 0 for name in sorted(RECORD_STATES)}
    for item in records:
        if not isinstance(item, dict) or set(item) - {"identifier", "status", "nativeId", "error"}:
            raise InputError("Use complete original identifier/status/nativeId/error result rows")
        identifier = plain(item.get("identifier"), "original source identifier", 4096)
        if identifier in seen:
            raise InputError("The original result repeats a source identifier")
        seen.add(identifier)
        row = owner.db.execute("SELECT body FROM tind_batch_records WHERE batch_id=? AND identifier=?", (batch["id"], identifier)).fetchone()
        if row is None or decode(row[0])["xmlFile"] != selected["file"]:
            raise InputError("A native result names a record outside this exact transferred file")
        state = item.get("status")
        if state not in RECORD_STATES:
            raise InputError("Review the actual original record status")
        record = {"identifier": identifier, "status": state}
        if state in {"accepted", "withdrawn"}:
            record["nativeId"] = plain(item.get("nativeId"), "actual native record ID", 4096)
        elif item.get("nativeId"):
            record["nativeId"] = plain(item["nativeId"], "actual native record ID", 4096)
        if state == "failed":
            record["error"] = plain(item.get("error"), "original native record error", 16384)
        elif item.get("error"):
            record["error"] = plain(item["error"], "original native record note", 16384)
        previous_result = latest.get(identifier)
        if previous_result and previous_result[0] > observation_time:
            raise InputError("A later original native result is already received for " + identifier + "; retain this older observation as history")
        normalized.append(record); counts[state] += 1
    total = sum(1 for row in owner.db.execute("SELECT body FROM tind_batch_records WHERE batch_id=?", (batch["id"],))
                if decode(row[0])["xmlFile"] == selected["file"])
    result = {"schema": "stellar-forge.tind-job-review-preview.v1", "projectId": project_id, "revision": project["revision"],
        "jobId": selected["id"], "observationId": observed["id"], "original": response["original"],
        "transferId": selected["transferId"], "batchId": batch["id"], "file": selected["file"],
        "nativeJobId": selected["nativeJobId"], "observedAt": response["observedAt"], "status": status,
        "mode": mode, "mapping": mapping if mode == "json" else None, "records": normalized,
        "counts": counts, "selectedRecords": total, "unreportedRecords": total - len(normalized)}
    result["sha256"] = sha(jbytes(result))
    return result

def receive(owner, project, value, operation):
    reviewed = preview(owner, project["id"], value)
    if value.get("expectedPreviewSha256") != reviewed["sha256"]:
        raise InputError("The reviewed native response, result selection or migration changed; preview the original response again")
    selected = job(owner, project["id"], reviewed["jobId"])
    observed = observation(owner, project["id"], reviewed["observationId"])
    original = owner.object_path(observed["response"]["original"]).read_bytes().decode("utf-8-sig")
    reviewer = plain(value.get("reviewer"), "native receiving operator", 256)
    note = plain(value.get("note"), "original response/result review note", 16384)
    receipt = owner._receipt(project, {"batchId": selected["batchId"], "transferId": selected["transferId"],
        "jobId": selected["nativeJobId"], "url": observed["response"]["url"], "observedAt": reviewed["observedAt"],
        "operator": reviewer, "status": reviewed["status"], "records": reviewed["records"], "original": original}, operation)
    record = {"schema": "stellar-forge.tind-job-review.v1", "id": sha(jbytes(["tind-job-review", operation])),
        "projectId": project["id"], "jobId": selected["id"], "observationId": observed["id"],
        "operationId": operation, "reviewer": reviewer, "note": note, "reviewedAt": stamp(),
        "preview": reviewed, "receiptId": receipt["id"]}
    put(owner, "tind_job_reviews", record)
    receipt["jobObservationId"] = observed["id"]; receipt["jobReviewId"] = record["id"]
    owner.db.execute("UPDATE tind_receipts SET body=? WHERE id=?", (jbytes(receipt).decode(), receipt["id"]))
    return {"jobId": selected["id"], "observationId": observed["id"], "reviewId": record["id"],
            "receipt": receipt, "unreportedRecords": reviewed["unreportedRecords"]}

def view(owner, project_id, job_id, offset=0, limit=50):
    selected = job(owner, project_id, job_id)
    history = pages(owner, project_id, job_id, offset, limit)
    reviews = [decode(row[0]) for row in owner.db.execute("SELECT body FROM tind_job_reviews WHERE project_id=? AND job_id=? ORDER BY rowid DESC LIMIT 50", (project_id, job_id))]
    return {"job": selected, "observations": history, "reviews": reviews,
            "transfer": owner._get("tind_native_transfers", selected["transferId"])}

def write_export(owner, project_id, job_id, output):
    from migration import file_digest, MAX_PACKAGE
    target = Path(output).expanduser().absolute()
    with owner.mutex:
        selected = job(owner, project_id, job_id)
        fd, temporary = tempfile.mkstemp(prefix="." + target.name + ".", suffix=".partial", dir=target.parent)
        try:
            with os.fdopen(fd, "wb") as raw:
                with zipfile.ZipFile(raw, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                    archive.writestr("job.json", jbytes(selected))
                    archive.writestr("transfer.json", jbytes(owner._get("tind_native_transfers", selected["transferId"])))
                    for row in owner.db.execute("SELECT body FROM tind_job_observations WHERE project_id=? AND job_id=? ORDER BY rowid", (project_id, job_id)):
                        value = decode(row[0]); identity = sha(jbytes(value))
                        archive.writestr("observations/" + identity + ".json", jbytes(value))
                        if value.get("response"):
                            archive.write(owner.object_path(value["response"]["original"]), "observations/" + identity + ".body")
                    for row in owner.db.execute("SELECT body FROM tind_job_reviews WHERE project_id=? AND job_id=? ORDER BY rowid", (project_id, job_id)):
                        value = decode(row[0])
                        archive.writestr("reviews/" + value["id"] + ".json", jbytes(value))
                        receipt = owner._get("tind_receipts", value["receiptId"])
                        archive.writestr("receipts/" + receipt["id"] + ".json", jbytes(receipt))
                raw.flush(); os.fsync(raw.fileno())
            os.link(temporary, target)
            return {"path": str(target), **file_digest(target, MAX_PACKAGE)}
        finally:
            Path(temporary).unlink(missing_ok=True)
