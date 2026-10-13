"""Raw supplier intake through the original running Material Catalog workspace.

This adapter keeps the original loopback HTTP service, SQLite workspace, source
retention, request journal, preview and selection writers. The Grant workspace
only receives the complete exported bundle through its existing source writer.
"""
from __future__ import annotations

import base64
import binascii
from copy import deepcopy
import hashlib
from http.client import HTTPException
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from model import Problem, canonical, digest
import operations_material_catalogue as material

SCHEMA = "stellar-forge.material-catalogue-intake-result.v1"
CONNECTION_SCHEMA = "stellar-forge.material-catalogue-connections.v1"
CONFIGURATION_ENV = "GRANT_MATERIAL_CATALOGUE_CONNECTIONS"
ROUTE = re.compile(r"^/api/operations/(operation-[a-f0-9]{32})/material-catalog-intake/"
                   r"(connections|state|catalog|profile|materials|changes|operation|upload|save|preview|select|bundle)$")
KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,95}")
SHA = re.compile(r"[a-f0-9]{64}")
MAX_FILE = 16 * 1024 * 1024
MAX_BUNDLE = 128 * 1024 * 1024
MAX_RESPONSE = 64 * 1024 * 1024
MAX_NATIVE_JSON = 1024 * 1024
MAX_JSON_REQUEST = ((MAX_FILE + 2) // 3) * 4 + 1024 * 1024
MUTATIONS = frozenset(("upload", "save", "preview", "select"))
COMMON = {"expectedVersion", "connectionId", "expectedWorkspaceId", "expectedConnectionSha256", "actor"}
FIELDS = {
    "state": set(),
    "catalog": {"catalogId"},
    "profile": {"sourceId"},
    "materials": {"editionId", "offset", "limit", "search"},
    "changes": {"editionId", "offset", "limit"},
    "operation": {"requestId"},
    "upload": {"nativeRequest", "contentBase64"},
    "save": {"nativeRequest"},
    "preview": {"nativeRequest"},
    "select": {"nativeRequest"},
    "bundle": {"catalogId", "expectedCatalogRevision", "expectedActiveEditionId",
               "expectedTenantId", "expectedMappingSha256"},
}
NATIVE_FIELDS = {
    "upload": ({"requestId", "name", "format", "bytes", "sha256", "provenance"},
               {"requestId", "name", "format", "bytes", "sha256"}),
    "save": ({"requestId", "catalogId", "expectedRevision", "title", "tenantId", "mapping"},
             {"requestId", "title", "tenantId", "mapping"}),
    "preview": ({"requestId", "catalogId", "expectedRevision", "sourceId", "mode", "baseEditionId"},
                {"requestId", "catalogId", "expectedRevision", "sourceId", "mode", "baseEditionId"}),
    "select": ({"requestId", "catalogId", "expectedRevision", "editionId", "reviewSha256"},
               {"requestId", "catalogId", "expectedRevision", "editionId", "reviewSha256"}),
}


def fail(message, code="MATERIAL_INTAKE_INPUT", status=422):
    raise Problem(message, status, code)


def need(condition, message, code="MATERIAL_INTAKE_INPUT", status=422):
    if not condition:
        fail(message, code, status)


def exact(value, allowed, required, label):
    need(isinstance(value, dict) and not set(value) - set(allowed)
         and set(required) <= set(value), "Use the complete declared " + label + " fields.")
    return value


def identifier(value, label):
    need(isinstance(value, str) and KEY.fullmatch(value) is not None,
         "Keep the original " + label + " identity.")
    return value


def positive(value, label):
    need(type(value) is int and 1 <= value <= 2**53 - 1,
         "Keep the original whole " + label + ".")
    return value


def string(value, label, maximum=256):
    need(isinstance(value, str) and 0 < len(value) <= maximum and
         not any(ord(character) < 32 for character in value),
         "Keep the original " + label + ".")
    return value


def _json(raw, label):
    def constant(_value):
        raise ValueError("Nonfinite JSON")
    try:
        return json.loads(raw.decode("utf-8"), parse_constant=constant)
    except (ValueError, UnicodeDecodeError) as exc:
        raise Problem("The original " + label + " returned no complete UTF-8 JSON.",
                      502, "MATERIAL_INTAKE_RESPONSE") from exc


def _configuration():
    selected = os.environ.get(CONFIGURATION_ENV)
    if not selected:
        return []
    path = Path(selected)
    need(path.is_absolute(), "Select an absolute operator-owned catalogue connection file.",
         "MATERIAL_INTAKE_CONFIGURATION", 503)
    descriptor = None
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        before = os.fstat(descriptor)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= MAX_NATIVE_JSON,
             "Select a complete regular catalogue connection file up to 1 MiB.",
             "MATERIAL_INTAKE_CONFIGURATION", 503)
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            raw = source.read(MAX_NATIVE_JSON + 1)
        after, named = os.fstat(descriptor), os.lstat(path)
        need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
             and (named.st_dev, named.st_ino) == (after.st_dev, after.st_ino)
             and len(raw) == before.st_size,
             "The operator catalogue connection file changed during reading.",
             "MATERIAL_INTAKE_CONFIGURATION", 409)
    except OSError as exc:
        raise Problem("The selected operator catalogue connection file is unavailable.",
                      503, "MATERIAL_INTAKE_CONFIGURATION") from exc
    finally:
        if descriptor is not None:
            os.close(descriptor)
    value = _json(raw, "catalogue connection file")
    exact(value, {"schema", "connections"}, {"schema", "connections"}, "catalogue configuration")
    need(value["schema"] == CONNECTION_SCHEMA and isinstance(value["connections"], list)
         and len(value["connections"]) <= 100, "Select the complete original catalogue connection declaration.",
         "MATERIAL_INTAKE_CONFIGURATION", 503)
    result, ids = [], set()
    for row in value["connections"]:
        exact(row, {"id", "title", "origin", "workspaceId", "caseIds"},
              {"id", "title", "origin", "workspaceId", "caseIds"}, "catalogue connection")
        identifier(row["id"], "connection")
        string(row["title"], "connection title", 300)
        string(row["workspaceId"], "native workspace", 256)
        need(row["id"] not in ids, "Every configured catalogue connection needs its own identity.",
             "MATERIAL_INTAKE_CONFIGURATION", 503)
        ids.add(row["id"])
        origin = row["origin"]
        need(isinstance(origin, str) and re.fullmatch(r"http://127\.0\.0\.1:[1-9][0-9]{0,4}", origin) is not None,
             "Select the actual original loopback catalogue origin.",
             "MATERIAL_INTAKE_CONFIGURATION", 503)
        parsed = urlsplit(origin)
        try:
            port = parsed.port
        except ValueError as exc:
            raise Problem("Select the actual original catalogue port.", 503,
                          "MATERIAL_INTAKE_CONFIGURATION") from exc
        need(port is not None and 1 <= port <= 65535 and str(port) == origin.rsplit(":", 1)[1],
             "Select the actual original catalogue port.", "MATERIAL_INTAKE_CONFIGURATION", 503)
        cases = row["caseIds"]
        need(isinstance(cases, list) and 0 < len(cases) <= 1000 and
             all(isinstance(case, str) and re.fullmatch(r"operation-[a-f0-9]{32}", case) for case in cases)
             and len(cases) == len(set(cases)),
             "Bind this original catalogue connection to its exact Operations case identities.",
             "MATERIAL_INTAKE_CONFIGURATION", 503)
        normalized = {**deepcopy(row), "caseIds": sorted(cases)}
        normalized["configurationSha256"] = digest(normalized)
        result.append(normalized)
    return result


def load_connections(case_id):
    return [row for row in _configuration() if case_id in row["caseIds"]]


def public_connection(row):
    return {key: row[key] for key in ("id", "title", "workspaceId", "configurationSha256")}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def _exchange(connection, path, *, method="GET", raw=None, headers=None, maximum=MAX_RESPONSE):
    # The selected service is the original explicit loopback listener. Do not
    # send its ephemeral token through an external HTTP proxy or a redirect.
    need(path.startswith("/api/") and not path.startswith("//"), "Use the original catalogue operation route.")
    request_headers = {"Accept": "application/json", "Origin": connection["origin"]}
    request_headers.update(headers or {})
    request = Request(connection["origin"] + path, data=raw, method=method, headers=request_headers)
    opener = build_opener(ProxyHandler({}), _NoRedirect())
    try:
        try:
            response = opener.open(request, timeout=120)
        except HTTPError as error:
            response = error
        with response, tempfile.SpooledTemporaryFile(max_size=1024 * 1024) as received:
            status = int(response.getcode())
            declared = response.headers.get("Content-Length")
            if declared is not None:
                need(declared.isascii() and declared.isdecimal() and int(declared) <= maximum,
                     "The complete native response exceeds the selected response bound.",
                     "MATERIAL_INTAKE_RESPONSE_SIZE", 413)
            total = 0
            while True:
                part = response.read(min(262144, maximum + 1 - total))
                if not part:
                    break
                total += len(part)
                need(total <= maximum, "The complete native response exceeds the selected response bound.",
                     "MATERIAL_INTAKE_RESPONSE_SIZE", 413)
                received.write(part)
            need(declared is None or total == int(declared),
                 "The original catalogue response ended before its declared complete length.",
                 "MATERIAL_INTAKE_RESPONSE", 502)
            received.seek(0)
            return status, dict(response.headers.items()), received.read()
    except (URLError, TimeoutError, ConnectionError, OSError, HTTPException) as exc:
        raise Problem("The original catalogue connection ended before a complete response. "
                      "Keep any submitted request and read that same native operation before continuing.",
                      502, "MATERIAL_INTAKE_TRANSPORT") from exc


def _session(connection):
    status, _headers, raw = _exchange(connection, "/api/session", maximum=65536)
    need(status == 200, "The configured original catalogue session is unavailable.",
         "MATERIAL_INTAKE_SESSION", 503)
    value = _json(raw, "catalogue session")
    need(isinstance(value, dict) and value.get("workspaceId") == connection["workspaceId"]
         and isinstance(value.get("token"), str) and re.fullmatch(r"[a-f0-9]{48}", value["token"]),
         "The listener is not the selected original catalogue workspace. Reopen the configured connection.",
         "MATERIAL_INTAKE_WORKSPACE_CHANGED", 409)
    return value


def _scope(ops, case_id, expected, before, *, mutation=False):
    with ops._snapshot():
        current = ops._context(case_id)
        version = current["program"]["version"]
        if mutation:
            need(version == expected, "Another case change was saved. Reopen its current version before this native action.",
                 "MATERIAL_INTAKE_CASE_CHANGED", 409)
            need(current["program"]["state"] != "CLOSED", "Reopen this case before recording further supplier work.",
                 "MATERIAL_INTAKE_CASE_CLOSED", 409)
        return {"caseId": case_id, "expectedVersion": expected, "currentVersion": version,
                "planId": current["program"]["planId"], "caseChanged": version != expected}


def _query(action, body):
    if action == "state":
        return "/api/catalog/state"
    if action == "catalog":
        return "/api/catalog/catalogs/" + identifier(body.get("catalogId"), "catalogue")
    if action == "profile":
        return "/api/catalog/bmecat/profile?" + urlencode({"sourceId": identifier(body.get("sourceId"), "source")})
    if action == "operation":
        return "/api/operations/" + identifier(body.get("requestId"), "request")
    if action in ("materials", "changes"):
        values = {"editionId": identifier(body.get("editionId"), "edition"),
                  "offset": body.get("offset", 0), "limit": body.get("limit", 50)}
        need(type(values["offset"]) is int and 0 <= values["offset"] <= 2**53 - 1 and
             type(values["limit"]) is int and 1 <= values["limit"] <= 200,
             "Select an original whole page offset and a page size from 1 to 200.")
        if action == "materials" and "search" in body:
            need(isinstance(body["search"], str) and len(body["search"]) <= 4096,
                 "Use the original material search text.")
            values["search"] = body["search"]
        return "/api/catalog/" + action + "?" + urlencode(values)
    fail("Select a supported original catalogue read.")


def _native(action, body):
    value = deepcopy(body.get("nativeRequest"))
    allowed, required = NATIVE_FIELDS[action]
    exact(value, allowed, required, "original catalogue request")
    identifier(value.get("requestId"), "request")
    for key in ("catalogId", "sourceId", "editionId"):
        if key in value:
            identifier(value[key], key)
    if "expectedRevision" in value:
        positive(value["expectedRevision"], "catalogue revision")
    if action == "save":
        need(("catalogId" in value) == ("expectedRevision" in value),
             "Keep both original catalogue and revision when editing an existing mapping.")
    if action == "preview":
        need(value["mode"] in ("full", "delta"), "Select the actual original full or delta input mode.")
        if value["baseEditionId"] is not None:
            identifier(value["baseEditionId"], "base edition")
        need(value["mode"] != "delta" or value["baseEditionId"] is not None,
             "Select the exact retained full base before a delta preview.")
    if action == "select":
        need(isinstance(value["reviewSha256"], str) and SHA.fullmatch(value["reviewSha256"]),
             "Keep the complete original edition review identity.")
    encoded = canonical(value).encode("utf-8")
    need(len(encoded) <= MAX_NATIVE_JSON, "Keep the complete native request within its original 1 MiB JSON bound.", status=413)
    if action != "upload":
        request_bytes = canonical({"action": action, **value}).encode("utf-8")
        need(len(request_bytes) <= MAX_NATIVE_JSON, "Keep the complete native request within its original 1 MiB JSON bound.", status=413)
        return "/api/catalog", request_bytes, {"Content-Type": "application/json"}
    need(type(value["bytes"]) is int and 0 < value["bytes"] <= MAX_FILE and
         isinstance(value["sha256"], str) and SHA.fullmatch(value["sha256"]),
         "Retain the exact whole original supplier file up to 16 MiB.", status=413)
    content = body.get("contentBase64")
    need(isinstance(content, str) and len(content) <= 4 * ((MAX_FILE + 2) // 3),
         "Retain the complete bounded supplier file.", status=413)
    try:
        raw = base64.b64decode(content, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise Problem("Select the complete original supplier bytes.", 422,
                      "MATERIAL_INTAKE_SOURCE") from exc
    need(base64.b64encode(raw).decode("ascii") == content and len(raw) == value["bytes"] and
         hashlib.sha256(raw).hexdigest() == value["sha256"],
         "The selected supplier file differs from its original byte receipt.",
         "MATERIAL_INTAKE_SOURCE_CHANGED", 409)
    # HTTP headers are ASCII. JSON escaping keeps every original Unicode name
    # and provenance character while using the original native header contract.
    metadata = json.dumps(value, ensure_ascii=True, separators=(",", ":"), allow_nan=False)
    need(len(metadata.encode("ascii")) <= 12288, "Keep the original upload metadata within its 12 KiB header bound.", status=413)
    return "/api/catalog/upload", raw, {"Content-Type": "application/octet-stream",
                                      "X-Catalog-Metadata": metadata}


def _bundle(connection, body):
    catalog_id = identifier(body.get("catalogId"), "catalogue")
    revision = positive(body.get("expectedCatalogRevision"), "selected catalogue revision")
    active = body.get("expectedActiveEditionId")
    identifier(active, "selected active edition")
    tenant = string(body.get("expectedTenantId"), "selected tenant", 256)
    mapping = body.get("expectedMappingSha256")
    need(isinstance(mapping, str) and SHA.fullmatch(mapping), "Keep the original selected mapping identity.")
    path = "/api/catalog/export?" + urlencode({"catalogId": catalog_id, "format": "catalog-bundle.jsonl"})
    status, _headers, raw = _exchange(connection, path, maximum=MAX_BUNDLE)
    if status != 200:
        return {"httpStatus": status, "result": _json(raw, "catalogue export")}
    file_sha = hashlib.sha256(raw).hexdigest()
    proof = material._engine({"action": "intake-custody", "sourceBase64": base64.b64encode(raw).decode("ascii")})
    need(isinstance(proof, dict) and proof.get("file") == {"bytes": len(raw), "sha256": file_sha}
         and isinstance(proof.get("header"), dict) and isinstance(proof.get("catalogue"), dict),
         "The complete original export has no matching native custody result.", "MATERIAL_INTAKE_BUNDLE", 502)
    header, catalog = proof["header"], proof["catalogue"]
    identity = {"workspaceId": header.get("sourceWorkspaceId"), "catalogId": catalog.get("id"),
                "revision": catalog.get("revision"), "activeEditionId": catalog.get("activeEditionId"),
                "tenantId": catalog.get("tenantId"), "mappingSha256": catalog.get("mappingSha256")}
    expected = {"workspaceId": connection["workspaceId"], "catalogId": catalog_id, "revision": revision,
                "activeEditionId": active, "tenantId": tenant, "mappingSha256": mapping}
    need(identity == expected and header.get("catalogId") == catalog_id and
         header.get("catalogRevision") == revision and header.get("tenantId") == tenant,
         "The captured complete export differs from the explicitly reviewed workspace, catalogue or edition. "
         "Inspect its current original state before selecting another capture.",
         "MATERIAL_INTAKE_SELECTION_CHANGED", 409)
    return {"archive": raw, "filename": "Material_Catalog_" + catalog_id + ".jsonl",
            "sha256": file_sha, "bytes": len(raw), "identity": identity}


def _preflight_rejection(case_id, action, body, error, scope, selected):
    # This receipt proves only that THIS adapter attempt stopped before POST.
    # An older attempt with the same native request ID may still be in flight.
    # Bind every caller-selected field, including exact file text, without
    # duplicating a potentially 22 MiB Base64 source in the response.
    request = deepcopy(body)
    request.pop("actor", None)
    content = request.pop("contentBase64", None)
    content_sha = hashlib.sha256(content.encode("utf-8")).hexdigest() if isinstance(content, str) else None
    return {"schema": SCHEMA, "scope": scope,
            "connection": public_connection(selected) if selected is not None else None,
            "httpStatus": None, "localStatus": error.status,
            "result": {"error": error.code, "message": str(error),
                       "dispatchStarted": False, "dispatchScope": "this-proxy-attempt",
                       "caseId": case_id, "action": action,
                       "requestId": body["nativeRequest"]["requestId"],
                       "requestBody": request, "contentBase64Sha256": content_sha}}


def perform(ops, case_id, action, body):
    need(action == "connections" or action in FIELDS, "Select an original supplier intake action.")
    scope, selected = None, None
    mutation = action in MUTATIONS
    try:
        if action == "connections":
            exact(body, {"expectedVersion"}, {"expectedVersion"}, "catalogue connection selection")
        else:
            exact(body, COMMON | FIELDS[action], COMMON - {"actor"}, "catalogue intake")
        expected = positive(body.get("expectedVersion"), "Operations case version")
        scope = _scope(ops, case_id, expected, None, mutation=mutation)
        if action == "connections":
            return {"schema": SCHEMA, "scope": scope, "connection": None, "httpStatus": 200,
                    "result": {"connections": [public_connection(row) for row in load_connections(case_id)]}}
        selected = next((row for row in load_connections(case_id) if row["id"] == body.get("connectionId")), None)
        need(selected is not None, "Select an original catalogue connection configured for this case.",
             "MATERIAL_INTAKE_CONNECTION_NOT_FOUND", 404)
        need(body["expectedWorkspaceId"] == selected["workspaceId"] and
             body["expectedConnectionSha256"] == selected["configurationSha256"],
             "The selected original catalogue connection changed. Reopen its current declaration.",
             "MATERIAL_INTAKE_CONNECTION_CHANGED", 409)
        # Source validation and session lookup are read-only. Failures here
        # provide a selected-attempt rejection, never native journal absence.
        if mutation:
            path, raw, headers = _native(action, body)
        session = _session(selected)
        if mutation:
            headers["X-Workspace-Token"] = session["token"]
            scope = _scope(ops, case_id, expected, scope, mutation=True)
    except Problem as error:
        native = body.get("nativeRequest") if isinstance(body, dict) else None
        if (mutation and isinstance(native, dict) and isinstance(native.get("requestId"), str)
                and KEY.fullmatch(native["requestId"]) is not None):
            return _preflight_rejection(case_id, action, body, error, scope, selected)
        raise
    if mutation:
        # From this point a failed or missing response is uncertain. Do not
        # attach pre-dispatch evidence to an exception after native POST starts.
        status, _response_headers, received = _exchange(selected, path, method="POST", raw=raw, headers=headers)
        result = {"httpStatus": status, "result": _json(received, "native catalogue operation")}
    elif action == "bundle":
        result = _bundle(selected, body)
    else:
        status, _response_headers, received = _exchange(selected, _query(action, body))
        result = {"httpStatus": status, "result": _json(received, "native catalogue read")}
        _session(selected)  # A read must still belong to the same selected workspace.
    # Native work is already recorded by its original journal. A concurrent
    # Operations edit must not erase or misreport that native operation result.
    try:
        scope = _scope(ops, case_id, expected, scope)
    except Problem:
        scope = {**scope, "currentVersion": None, "caseChanged": True, "caseReadUnavailable": True}
    result.update(schema=SCHEMA, scope=scope, connection=public_connection(selected))
    return result


def register_static(static):
    for name, media in {
        "operations_material_supplier_intake.mjs": "text/javascript; charset=utf-8",
        "operations_material_supplier_intake_model.mjs": "text/javascript; charset=utf-8",
        "MATERIAL_SUPPLIER_INTAKE.md": "text/markdown; charset=utf-8",
    }.items():
        static["/" + name] = (name, media)


def request_limit(path):
    match = ROUTE.fullmatch(path)
    return MAX_JSON_REQUEST if match and match[2] == "upload" else None


def handle(handler, parsed, ops, method):
    match = ROUTE.fullmatch(parsed.path)
    if not match:
        return False
    need(method == "POST", "Use the case-scoped original supplier intake request.", "METHOD_NOT_ALLOWED", 405)
    result = perform(ops, match[1], match[2], handler.json_body())
    if "archive" in result:
        identity = base64.b64encode(canonical(result["identity"]).encode("utf-8")).decode("ascii")
        handler.send(200, result["archive"], "application/x-ndjson", result["filename"], headers={
            "X-Material-Catalog-Sha256": result["sha256"],
            "X-Material-Catalog-Bytes": str(result["bytes"]),
            "X-Material-Catalog-Identity": identity})
    else:
        # An outer successful exchange includes the complete native HTTP status
        # and operation. The caller must inspect both, not infer completion.
        handler.send(200, result)
