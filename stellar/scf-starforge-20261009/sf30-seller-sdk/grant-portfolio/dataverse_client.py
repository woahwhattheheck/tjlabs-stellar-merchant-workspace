"""Native Dataverse transport and source capture over an original operation journal.

The supplied journal belongs to the existing grant workspace reservation. This
module creates no business store, tenant, token or account. A dispatched write
without its complete retained return is reconciled through target reads, never
silently reposted.
"""
from __future__ import annotations

import os
import socket
import ssl
import uuid
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPSHandler, HTTPRedirectHandler
from dataverse_contract import (
    EXCHANGE_SCHEMA, SNAPSHOT_SCHEMA, MAX_JSON, MAX_XML, DataverseError,
    require, clone, profile, public_profile, target_identity, route, api_root,
    pack, binary, parse_json, json_bytes, identity, instant, next_route,
    validate_exchange, validate_snapshot, Csdl, guid, resource_rows,
)
from dataverse_solution import preflight_queries, all_components, component_route, ROW_KINDS

CLIENT_SCHEMA = "tjlabs.pmrs.dataverse-native-client/v1"
MAX_HTTP = MAX_JSON
PRIVATE_HEADERS = {"authorization", "proxy-authorization", "cookie", "set-cookie"}

def request_key(operation_id, *parts):
    return "native-" + identity({"operation_id": operation_id, "parts": list(parts)})

def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def headers_dict(headers):
    result = {}
    for key, value in headers.items():
        if key.lower() in PRIVATE_HEADERS:
            continue
        # Header multiplicity is retained without claiming a hidden provider
        # header was present. Dataverse's selected protocol fields are singular.
        if key in result:
            result[key] += ", " + value
        else:
            result[key] = value
    return result

def header(value, name):
    found = [v for k, v in value.items() if k.lower() == name.lower()]
    require(len(found) <= 1, "HEADER_AMBIGUOUS", "The native response repeats a protocol header.", header=name)
    return found[0] if found else None

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class NativeResultUnknown(DataverseError):
    def __init__(self, request_id, message, **details):
        super().__init__("NATIVE_RESULT_UNKNOWN", message, request_id=request_id, uncertain=True, **details)
        self.request_id = request_id

class DataverseClient:
    """journal: original reserve_request/before_dispatch/returned/failed receipts.

    reserve_request(id,intent) returns {request_id,intent,state,exchange?}.
    The journal must persist a request before before_dispatch returns and must
    durably retain the complete returned exchange before returned returns.
    request(id) reads the same original reservation without another HTTP call.
    failed(id,error) retains uncertainty, partial bytes and the original request.
    It cannot downgrade an already retained exchange. A complete_exchange in a
    storage-failure receipt must be recoverable as that original native return.
    reconcile(id,evidence,result) retains explicit target evidence; it must not
    rewrite the original unknown transport into a fabricated HTTP response.
    """
    def __init__(self, selected_profile, journal, *, timeout=60, max_response_bytes=MAX_HTTP):
        self.profile = profile(selected_profile)
        self.journal = journal
        require(isinstance(timeout, (int, float)) and not isinstance(timeout, bool) and 0 < timeout <= 300,
                "HTTP_TIMEOUT", "Select an explicit native request timeout up to 300 seconds.")
        require(isinstance(max_response_bytes, int) and 1 <= max_response_bytes <= MAX_HTTP,
                "HTTP_LIMIT", "Select the bounded complete native response size.")
        self.timeout, self.maximum = timeout, max_response_bytes
        self.opener = build_opener(NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))
        for name in ("reserve_request", "before_dispatch", "returned", "failed", "request", "reconcile"):
            require(callable(getattr(journal, name, None)), "JOURNAL_CONTRACT",
                    "The existing workspace must supply the complete native operation journal.", method=name)

    def _intent(self, method, path, body, headers):
        require(method in ("GET", "POST", "PATCH", "PUT", "DELETE"), "HTTP_METHOD", "Use a supported native method.")
        route(path)
        require(isinstance(headers, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in headers.items()),
                "HTTP_HEADERS", "Use native header text.")
        require(not {x.lower() for x in headers} & PRIVATE_HEADERS, "CREDENTIAL_HEADER",
                "Provide the selected token environment reference, not a persisted credential header.")
        require(method != "GET" or body is None, "READ_BODY", "A native source GET has no body.")
        if body is not None:
            require(isinstance(body, bytes) and len(body) <= self.maximum, "HTTP_BODY", "Retain a complete bounded native request.")
        standard = {"Accept": "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0"}
        if body is not None:
            standard["Content-Type"] = "application/json; charset=utf-8"
        for key, value in headers.items():
            require("\r" not in key + value and "\n" not in key + value, "HTTP_HEADER", "Header text must not contain a line break.")
            standard[key] = value
        return {"schema": CLIENT_SCHEMA + ".request", "profile": public_profile(self.profile),
                "request": {"method": method, "path": path, "headers": standard,
                            "body": None if body is None else pack(body)}}

    def request(self, request_id, method, path, *, body=None, headers=None):
        intent = self._intent(method, path, body, headers or {})
        retained = self.journal.reserve_request(request_id, intent)
        require(retained.get("intent") == intent and retained.get("request_id") == request_id,
                "REQUEST_IDENTITY", "The original native request reservation differs.")
        if retained.get("exchange") is not None:
            exchange = validate_exchange(retained["exchange"])
            require(exchange["request_id"] == request_id and exchange["request"] == intent["request"]
                    and target_identity(exchange["profile"]) == target_identity(intent["profile"]),
                    "RETURN_IDENTITY", "The retained native return belongs to another request.")
            return exchange
        if retained.get("state") not in ("RESERVED", "NOT_DISPATCHED"):
            raise NativeResultUnknown(request_id, "The original native request was dispatched without a complete retained return.")
        token = os.environ.get(self.profile["token_environment"])
        require(isinstance(token, str) and token.strip() and "\r" not in token and "\n" not in token,
                "TOKEN_UNAVAILABLE", "The selected administrator token reference is not available in this runtime.")
        actual_headers = {**intent["request"]["headers"], "Authorization": "Bearer " + token}
        request = Request(api_root(self.profile) + path, data=body, headers=actual_headers, method=method)
        self.journal.before_dispatch(request_id)
        response = None
        prefix, status, observed_headers = bytearray(), None, None
        try:
            try:
                response = self.opener.open(request, timeout=self.timeout)
            except HTTPError as error:
                # A native HTTP error is an observed response, including its
                # complete original body. It is not a transport exception.
                response = error
            status = response.status
            observed_headers = headers_dict(response.headers)
            while True:
                block = response.read(min(131072, self.maximum + 1 - len(prefix)))
                if not block:
                    break
                prefix.extend(block)
                if len(prefix) > self.maximum:
                    raise DataverseError("HTTP_RESPONSE_LIMIT", "The native response exceeds the selected retained-byte bound.")
        except BaseException as error:
            failure = {"schema": CLIENT_SCHEMA + ".failure", "received_at": now(),
                       "type": type(error).__name__, "message": str(error), "uncertain": True,
                       "observed_status": status, "observed_headers": observed_headers,
                       "body_complete": False, "received_prefix": pack(bytes(prefix))}
            try:
                self.journal.failed(request_id, failure)
            except BaseException as retention_error:
                raise NativeResultUnknown(request_id, "The incomplete native return could not be durably retained.",
                                          retention_error=type(retention_error).__name__,
                                          retained_failure=failure) from error
            raise NativeResultUnknown(request_id, "The original native request has no complete durable return.",
                                      observed_status=status, received_prefix_bytes=len(prefix)) from error
        finally:
            if response is not None:
                try:
                    response.close()
                except Exception:
                    # A close failure cannot erase a fully read native body or
                    # replace the original read failure with another exception.
                    pass
        exchange = {"schema": EXCHANGE_SCHEMA, "profile": public_profile(self.profile),
                    "request": intent["request"], "response": {"status": status, "headers": observed_headers,
                                                             "body": pack(bytes(prefix))},
                    "received_at": now(), "request_id": request_id}
        # Record the complete actual return before interpreting status or JSON.
        # A storage failure here is distinct from an incomplete HTTP response.
        try:
            self.journal.returned(request_id, exchange)
        except BaseException as error:
            failure = {"schema": CLIENT_SCHEMA + ".failure", "received_at": now(),
                       "type": type(error).__name__, "message": str(error), "uncertain": True,
                       "body_complete": True, "complete_exchange": exchange}
            try:
                self.journal.failed(request_id, failure)
            except BaseException as retention_error:
                raise NativeResultUnknown(request_id, "The complete native return awaits durable recovery.",
                                          retention_error=type(retention_error).__name__,
                                          complete_exchange=exchange) from error
            raise NativeResultUnknown(request_id, "The complete native return is retained with a storage-failure receipt.",
                                      body_complete=True, complete_exchange_sha256=identity(exchange)) from error
        # Validation failure must preserve RETURNED and its exact original
        # bytes. It must never downgrade an observed response to an unknown
        # transport or authorize redispatch.
        return validate_exchange(exchange)

    def json(self, request_id, method, path, *, payload=None, headers=None, statuses=(200, 201, 204)):
        exchange = self.request(request_id, method, path, body=None if payload is None else json_bytes(payload), headers=headers)
        status = exchange["response"]["status"]
        if status not in statuses:
            raise DataverseError("NATIVE_HTTP_ERROR", "The target returned an actual non-success status.",
                                 request_id=request_id, status=status,
                                 retry_after=header(exchange["response"]["headers"], "Retry-After"),
                                 body_sha256=exchange["response"]["body"]["sha256"], uncertain=method != "GET")
        raw = binary(exchange["response"]["body"], "native return", self.maximum)
        return exchange, parse_json(raw, self.maximum) if raw else None

    def read_resource(self, request_key, path, *, max_pages=10000):
        """Follow only the exact retained nextLink, preserving every response."""
        require(isinstance(max_pages, int) and 1 <= max_pages <= 10000, "PAGE_LIMIT", "Select a bounded complete source page count.")
        path = route(path)
        initial, exchanges, visited = path, [], set()
        for index in range(max_pages):
            require(path not in visited, "NATIVE_PAGE_CYCLE", "The original provider nextLink repeats a request.")
            visited.add(path)
            rid = request_key + ":page:" + str(index)
            exchange, body = self.json(rid, "GET", path, statuses=(200, 404))
            exchanges.append(exchange)
            if exchange["response"]["status"] == 404:
                require(index == 0, "NATIVE_PAGE_MISSING", "A later missing source page cannot complete the original population.")
                return {"path": initial, "exchanges": exchanges, "complete": True}
            require(isinstance(body, dict), "NATIVE_RESOURCE", "The selected target resource is not a complete JSON object.")
            if body.get("@odata.nextLink") is None:
                return {"path": initial, "exchanges": exchanges, "complete": True}
            path = next_route(body["@odata.nextLink"], public_profile(self.profile))
        raise DataverseError("NATIVE_PAGE_LIMIT", "The original resource still has a continuation after the selected page bound.",
                             initial_path=initial, last_path=path, retained_pages=len(exchanges))

    def whoami(self, request_id):
        exchange, body = self.json(request_id, "GET", "WhoAmI()")
        require(isinstance(body, dict) and guid(body.get("OrganizationId")) == self.profile["organization_id"],
                "TARGET_IDENTITY", "The actual native organization differs from the selected original target.")
        return exchange

def capture_target(client, spec, capture_id, *, created_at):
    """Same native operation source capture, with exact original replay IDs."""
    instant(created_at, "original capture time")
    who = client.whoami(request_key(capture_id, "whoami"))
    csdl_exchange = client.request(request_key(capture_id, "csdl"), "GET", "$metadata",
                                   headers={"Accept": "application/xml"})
    require(csdl_exchange["response"]["status"] == 200, "CSDL_HTTP", "The actual metadata request did not complete successfully.",
            status=csdl_exchange["response"]["status"])
    csdl = Csdl(binary(csdl_exchange["response"]["body"], "actual CSDL", MAX_XML))
    csdl.operation("WhoAmI", {}, function=True)
    resources, bindings = {}, {}
    for component in all_components(spec):
        path = component_route(component, bindings)
        if path is None:
            continue
        key = "component:" + component["key"]
        resources[key] = client.read_resource(request_key(capture_id, "component", component["key"]), path)
        rows = resource_rows(resources[key], public_profile(client.profile), key)
        require(len(rows) <= 1, "COMPONENT_AMBIGUOUS", "The original target selector returned multiple records.", component=component["key"])
        if rows:
            kind = component["kind"]
            entity_set = (component["entity_set"] if kind == "reference" else ROW_KINDS.get(kind)
                          or ("EntityDefinitions" if kind == "table" else "RelationshipDefinitions" if kind == "relationship" else "Attributes"))
            id_field = "MetadataId" if kind in ("table", "attribute", "relationship") else csdl.key(entity_set)
            bindings[component["key"]] = {"id": guid(rows[0].get(id_field)), "entity_set": entity_set, "id_field": id_field, "kind": kind}
    for item in preflight_queries(spec, bindings):
        if item["key"].startswith("component:"):
            continue
        resources[item["key"]] = client.read_resource(request_key(capture_id, "resource", item["key"]), item["path"])
    payload = {"schema": SNAPSHOT_SCHEMA, "created_at": created_at, "profile": public_profile(client.profile),
               "whoami": who, "csdl": csdl_exchange, "resources": resources, "complete": True,
               "source_refs": clone(spec["source_refs"])}
    result = {"id": "target-" + identity(payload), **payload}
    return validate_snapshot(result)
