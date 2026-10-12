"""MIT. Original TIND MARCXML export and retained exact native transfer requests."""
from __future__ import annotations
import hashlib
import io
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from bridge import InputError
from harvest import jbytes, decode, sha, stamp, plain
from marc import identifiers, native_id, parse_marc
from migration import ObjectWriter, MAX_OBJECT, file_digest, https_url, export_scope

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def origin(url):
    parts = urlsplit(https_url(url))
    return parts.scheme, parts.netloc.casefold()

def headers(authorization_env=None):
    result = {"User-Agent": "TINDMigrationWorkspace/1", "Accept": "application/xml, application/json, text/plain"}
    if authorization_env:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", authorization_env):
            raise InputError("Choose the existing authorization environment variable")
        value = os.environ.get(authorization_env)
        if not value or "\n" in value or "\r" in value:
            raise InputError("The selected authorization environment variable is unavailable")
        result["Authorization"] = value
    return result

def native_tables(owner):
    with owner.mutex:
        owner.db.executescript("""
        CREATE TABLE IF NOT EXISTS tind_native_searches(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tind_native_transfers(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,body TEXT NOT NULL);
    """)

def put(owner, table, value):
    owner.db.execute("INSERT INTO " + table + " VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
                     (value["id"], value["projectId"], jbytes(value).decode()))
    return value

def response_object(owner, response):
    writer = ObjectWriter(owner)
    try:
        while block := response.read(65536):
            writer.write(block)
        original = writer.finish()
    finally:
        writer.discard()
    withheld = {"authorization", "proxy-authorization", "cookie", "set-cookie", "set-cookie2"}
    return {"status": response.status, "headers": [[key, value] for key, value in response.headers.items() if key.casefold() not in withheld],
            "original": original, "observedAt": stamp()}

def search_export(owner, project_id, operation_id, selection, *, authorization_env=None, interval=2.1, page_size=100, export_context=None):
    """Continue the native hosted /search MARCXML API until an actual empty page."""
    plain(operation_id, "stable native export operation ID", 128)
    if not isinstance(selection, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in selection.items()):
        raise InputError("Native search arguments are literal string pairs")
    if any(re.search(r"token|password|secret|credential|api.?key|authorization", key, re.I) for key in selection):
        raise InputError("Use the separate authorization environment variable")
    if set(selection) & {"of", "jrec", "rg"}:
        raise InputError("The native MARCXML exporter controls of, jrec and rg")
    if type(page_size) is not int or not 1 <= page_size <= 10000 or type(interval) not in {int, float} or not 0 <= interval <= 3600:
        raise InputError("Choose a positive page size and 0–3600 second request spacing")
    native_tables(owner)
    project = owner.project(project_id)
    base = project["profile"]["instance"].rstrip("/")
    parsed = urlsplit(https_url(base))
    if parsed.path not in {"", "/"} or parsed.query:
        raise InputError("Use the selected TIND instance origin for native search")
    context = export_scope(export_context or {"fieldCoverage": "public", "authority": "Original public hosted search"})
    contract = {"projectId": project_id, "instance": base, "selection": selection, "pageSize": page_size, "exportContext": context,
                "authorizationEnvironment": authorization_env, "interface": "hosted-search-MARCXML",
                "documentation": "https://worldveg.tind.io/help/search-engine-api"}
    contract_sha = sha(jbytes(contract))
    with owner.mutex, owner.db:
        prior = owner.db.execute("SELECT body FROM tind_native_searches WHERE id=?", (operation_id,)).fetchone()
        if prior:
            state = decode(prior[0])
            if state["contractSha256"] != contract_sha:
                raise InputError("The native export operation ID belongs to another exact selection")
            if state["status"] == "complete":
                return state
            if state["status"] == "record-drift":
                raise InputError("Start a fresh native export after resolving its moving or repeated record page")
        else:
            state = {"schema": "stellar-forge.tind-native-search.v1", "id": operation_id, "projectId": project_id,
                     "contract": contract, "contractSha256": contract_sha, "interval": interval, "snapshotId": sha(jbytes(["tind-native-search", operation_id, contract])),
                     "status": "ready", "createdAt": stamp(), "nextOffset": 1, "records": 0, "pages": [], "lastError": None}
            put(owner, "tind_native_searches", state)
    auth_headers = headers(authorization_env)
    opener = build_opener(NoRedirect())
    while True:
        if state["pages"] and interval:
            time.sleep(interval)
        query = list(selection.items()) + [("of", "xm"), ("jrec", str(state["nextOffset"])), ("rg", str(page_size))]
        url = base + "/search?" + urlencode(query)
        with owner.mutex, owner.db:
            state["status"] = "reading"
            state["pending"] = {"url": url, "offset": state["nextOffset"], "startedAt": stamp()}
            put(owner, "tind_native_searches", state)
        try:
            try:
                response = opener.open(Request(url, headers=auth_headers, method="GET"), timeout=60)
            except HTTPError as response:
                with response:
                    observed = response_object(owner, response)
            else:
                with response:
                    observed = response_object(owner, response)
        except (OSError, URLError, TimeoutError, InputError) as error:
            with owner.mutex, owner.db:
                state["status"] = "ready"; state["lastError"] = str(error)
                put(owner, "tind_native_searches", state)
            return state
        page = {"url": url, "offset": state["nextOffset"], **observed}
        if observed["status"] != 200:
            with owner.mutex, owner.db:
                state["status"] = "ready"; state["lastError"] = "Native export returned HTTP " + str(observed["status"])
                state.setdefault("failedReads", []).append(page)
                put(owner, "tind_native_searches", state)
            return state
        try:
            with owner.mutex, owner.db:
                def receive(record):
                    identity = native_id(record)
                    existing = owner.db.execute("SELECT body FROM tind_destination_records WHERE snapshot_id=? AND native_id=?",
                                                (state["snapshotId"], identity)).fetchone()
                    if existing:
                        raise InputError("The native continuation repeated record " + identity + "; retain these pages and receive a fresh exact export")
                    owner.db.execute("INSERT INTO tind_destination_records VALUES(?,?,?)", (state["snapshotId"], identity, jbytes(record).decode()))
                    for namespace, value in identifiers(record):
                        owner.db.execute("INSERT OR IGNORE INTO tind_destination_ids VALUES(?,?,?,?)", (state["snapshotId"], namespace, value, identity))
                with owner.object_path(observed["original"]).open("rb") as stream:
                    result = parse_marc(stream, receive)
                page["records"] = result["records"]
                state["pages"].append(page)
                state["records"] += result["records"]
                state["nextOffset"] += result["records"]
                state.pop("pending", None)
                state["lastError"] = None
                if result["records"] == 0:
                    state["status"] = "complete"; state["completedAt"] = stamp()
                    snapshot = {"schema": "stellar-forge.tind-destination.v1", "id": state["snapshotId"], "projectId": project_id,
                                "originalPages": state["pages"], "records": state["records"], "receivedAt": stamp(),
                                "provenance": {**context, "url": base + "/search?" + urlencode(selection), "retrievedAt": state["completedAt"],
                                    "scope": "Native hosted search arguments " + jbytes(selection).decode().strip(),
                                    "complete": True, "reviewer": "Original native search continuation", "recordCount": state["records"],
                                    "authorizationEnvironment": authorization_env, "terminalOffset": state["nextOffset"]}}
                    owner.db.execute("INSERT INTO tind_snapshots VALUES(?,?,?)", (snapshot["id"], project_id, jbytes(snapshot).decode()))
                    current = owner.project(project_id)
                    if origin(current["profile"]["instance"]) != origin(base):
                        raise InputError("The selected destination changed during native export")
                    current["snapshotId"] = snapshot["id"]; current["revision"] += 1; current["updatedAt"] = stamp()
                    owner.put_project(current)
                else:
                    state["status"] = "ready"
                put(owner, "tind_native_searches", state)
        except InputError as error:
            with owner.mutex, owner.db:
                # Parse/membership changes roll back; the original bytes stay readable.
                state["status"] = "record-drift"; state["lastError"] = str(error)
                state.setdefault("failedReads", []).append(page)
                put(owner, "tind_native_searches", state)
            return state
        if state["status"] == "complete":
            return state

def selected_batch_file(owner, project, request):
    batch = owner._owned_batch(project, request["batchId"])
    if batch["status"] == "withdrawn":
        raise InputError("Select a current prepared native batch")
    filename = request.get("file")
    entry = next((item for item in batch["files"] if item["name"] == filename and item["kind"] == "marcxml"), None)
    if entry is None:
        raise InputError("Select one exact frozen native MARCXML file")
    return batch, entry, owner.object_path(entry)

def send_exact(owner, project_id, operation_id, request, *, authorization_env=None):
    """Send one original target-documented request; unknown writes retain their operation."""
    native_tables(owner)
    project = owner.project(project_id)
    if not isinstance(request, dict):
        raise InputError("Supply the selected native request document")
    allowed = {"batchId", "file", "url", "method", "contentType", "encoding", "fileField", "fields", "headers", "documentation"}
    if set(request) - allowed:
        raise InputError("Unknown native request contract fields")
    url = https_url(request.get("url"), "original native batch endpoint")
    if origin(url) != origin(project["profile"]["instance"]):
        raise InputError("Send the frozen batch to its selected native TIND institution")
    if any(re.search(r"token|password|secret|signature|credential|api.?key|authorization", key, re.I) for key, _ in parse_qsl(urlsplit(url).query)):
        raise InputError("Use the authorization environment variable for credentials")
    if request.get("method") not in {"POST", "PUT", "PATCH"}:
        raise InputError("Use the method from the selected native batch contract")
    https_url(request.get("documentation"), "native documentation URL")
    encoding = request.get("encoding", "raw")
    if encoding not in {"raw", "multipart"}:
        raise InputError("Use raw or multipart bytes from the original native contract")
    additional = request.get("headers", {})
    if not isinstance(additional, dict):
        raise InputError("Native headers must be a literal object")
    for name, value in additional.items():
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9-]+", name) or not isinstance(value, str) or "\r" in value or "\n" in value:
            raise InputError("Invalid native header")
        if name.casefold() in {"authorization", "proxy-authorization", "cookie", "host", "content-length", "transfer-encoding"} or re.search(r"token|secret|api.?key", name, re.I):
            raise InputError("Use the authorization environment variable for private credentials")
    literal_fields = request.get("fields", {})
    if not isinstance(literal_fields, dict) or len(literal_fields) > 64:
        raise InputError("Native multipart fields must be a literal object")
    for name, value in literal_fields.items():
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+", name) or not isinstance(value, str):
            raise InputError("Native multipart fields must be literal strings")
        if re.search(r"token|password|secret|credential|api.?key|authorization", name, re.I):
            raise InputError("Use the authorization environment variable for private credentials")
    if encoding == "raw":
        content_type = plain(request.get("contentType"), "native request content type", 256)
        if "\r" in content_type or "\n" in content_type:
            raise InputError("Use the native content type without a newline")
    else:
        file_field = plain(request.get("fileField"), "native multipart file field", 128)
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", file_field):
            raise InputError("Use the literal native multipart file field")
    batch, entry, path = selected_batch_file(owner, project, request)
    contract = {**request, "encoding": encoding, "source": entry, "authorizationEnvironment": authorization_env}
    contract_sha = sha(jbytes(contract))
    with owner.mutex, owner.db:
        prior = owner.db.execute("SELECT body FROM tind_native_transfers WHERE id=?", (operation_id,)).fetchone()
        if prior:
            result = decode(prior[0])
            if result["contractSha256"] != contract_sha:
                raise InputError("This native transfer operation ID belongs to another exact request")
            if result["status"] != "prepared":
                return result
        for row in owner.db.execute("SELECT body FROM tind_native_transfers WHERE project_id=?", (project_id,)):
            previous = decode(row[0])
            if previous["batchId"] == batch["id"] and previous["file"] == entry["name"] and previous["status"] in {"sending", "unknown", "responded", "received"}:
                raise InputError("Receive the existing native operation's job result before sending this frozen file again")
        state = {"schema": "stellar-forge.tind-native-transfer.v1", "id": plain(operation_id, "native operation ID", 128),
                 "projectId": project_id, "batchId": batch["id"], "file": entry["name"], "contractSha256": contract_sha,
                 "request": contract, "status": "prepared", "createdAt": stamp()}
        put(owner, "tind_native_transfers", state)
    request_headers = headers(authorization_env)
    additional = request.get("headers", {})
    if not isinstance(additional, dict):
        raise InputError("Native headers must be an object of literal contract values")
    for name, value in additional.items():
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9-]+", name) or not isinstance(value, str) or "\r" in value or "\n" in value:
            raise InputError("Invalid native request header")
        if name.casefold() in {"authorization", "proxy-authorization", "cookie", "host", "content-length", "transfer-encoding"} or re.search(r"token|secret|api.?key", name, re.I):
            raise InputError("Use the separate authorization environment variable for private credentials")
        request_headers[name] = value
    body = path.read_bytes()
    if encoding == "raw":
        request_headers["Content-Type"] = plain(request.get("contentType"), "native request content type", 256)
    else:
        field = plain(request.get("fileField"), "native multipart file field", 128)
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", field):
            raise InputError("Use the original native multipart field name")
        boundary = "tind-" + sha(jbytes([operation_id, entry]))[:40]
        fields = request.get("fields", {})
        if not isinstance(fields, dict) or len(fields) > 64:
            raise InputError("Use the original literal native multipart fields")
        chunks = []
        for name, value in fields.items():
            if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+", name) or not isinstance(value, str):
                raise InputError("Native multipart values must be literal strings")
            if re.search(r"token|password|secret|credential|api.?key|authorization", name, re.I):
                raise InputError("Use the authorization environment variable for private credentials")
            chunks.append(("--" + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + value + "\r\n").encode())
        chunks.append(("--" + boundary + '\r\nContent-Disposition: form-data; name="' + field + '"; filename="' + entry["name"] +
                       '"\r\nContent-Type: application/xml\r\n\r\n').encode())
        chunks.extend([body, ("\r\n--" + boundary + "--\r\n").encode()])
        body = b"".join(chunks)
        request_headers["Content-Type"] = "multipart/form-data; boundary=" + boundary
    if len(body) > MAX_OBJECT:
        raise InputError("The complete native request exceeds 256 MiB")
    state["requestBody"] = owner.object(body)
    state["sentAt"] = stamp()
    with owner.mutex, owner.db:
        # A staff withdrawal or institution change may occur while encoding the body.
        current = owner.project(project_id)
        selected_batch_file(owner, current, request)
        if origin(current["profile"]["instance"]) != origin(url):
            raise InputError("The selected native institution changed before transfer")
        state["status"] = "sending"
        put(owner, "tind_native_transfers", state)
    try:
        opener = build_opener(NoRedirect())
        outgoing = Request(url, data=body, headers=request_headers, method=request["method"])
        try:
            response = opener.open(outgoing, timeout=60)
        except HTTPError as response:
            with response:
                observed = response_object(owner, response)
        else:
            with response:
                observed = response_object(owner, response)
    except (OSError, URLError, TimeoutError, InputError) as error:
        with owner.mutex, owner.db:
            state["status"] = "unknown"; state["lastError"] = str(error)
            put(owner, "tind_native_transfers", state)
        return state
    with owner.mutex, owner.db:
        state["response"] = observed
        state["status"] = "responded"
        state["httpAccepted"] = 200 <= observed["status"] < 300
        put(owner, "tind_native_transfers", state)
    return state
