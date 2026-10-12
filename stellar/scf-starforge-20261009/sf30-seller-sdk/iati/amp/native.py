"""MIT. Installed AMP REST session, complete source capture and native receiving.

Authentication follows the pinned upstream Security.java / SecurityService.java:
the password hash is sent only to /security/user/ and native session cookies are
retained in memory. Original response bytes are delivered to the workspace sink.
"""
from __future__ import annotations
from datetime import datetime, timezone
from http.cookiejar import CookieJar
import ipaddress
import re
import ssl
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, quote
from urllib.request import Request, build_opener, HTTPCookieProcessor, HTTPSHandler, HTTPRedirectHandler
from iati_source import InputError
from .codec import loads, dumps, encode, digest, integer, text, fields
from .domain import connection, native_project
from .destination import required_value_fields

MAX_RESPONSE = 64 * 1024 * 1024
SAFE_HEADERS = {"content-type", "content-length", "etag", "last-modified", "date", "retry-after"}
API_ERRORS = ("error", "errors")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


class NativeFailure(InputError):
    def __init__(self, message, receipt=None, uncertain=False):
        super().__init__(message)
        self.receipt = receipt
        self.uncertain = uncertain


class SameOriginRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        # Native writes never follow a redirect, nor send session/auth information to another host.
        if request.get_method() != "GET" or _origin(request.full_url) != _origin(newurl):
            raise NativeFailure("Native AMP returned a redirected operation; retain and use its original configured REST URL")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def _origin(url):
    parsed = urlsplit(url)
    return parsed.scheme, parsed.hostname, parsed.port


def _credential_transport(base):
    parsed = urlsplit(base)
    if parsed.scheme == "https":
        return
    try:
        local = ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        local = parsed.hostname == "localhost"
    if not local:
        raise InputError("Use HTTPS for an AMP password hash, or the existing loopback native development server")


class AmpSession:
    def __init__(self, selected, sink, timeout=60):
        self.connection = connection(selected)
        self.sink = sink
        self.timeout = integer(timeout, "Native HTTP timeout", 1, 180)
        self.jar = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.jar), SameOriginRedirect(),
                                   HTTPSHandler(context=ssl.create_default_context()))
        self.user = None
        self.layout = None

    def close(self):
        self.jar.clear()
        self.user = None
        self.layout = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def request(self, method, path, body=None, *, secret=False):
        if method not in {"GET", "POST"} or path.startswith("/") or ".." in path.split("/") or "://" in path:
            raise InputError("Use an original relative AMP operation path")
        url = self.connection["baseUrl"] + "/" + path
        raw = None if body is None else encode(body)
        if raw is not None and method != "POST":
            raise InputError("Native read body belongs to its documented POST route")
        headers = {"Accept": "application/json", "User-Agent": "Commons-IATI-AMP-Commissioning/1"}
        if raw is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
        receipt = {"startedAt": now(), "method": method, "url": url,
                   "requestSha256": None if secret or raw is None else digest(raw),
                   "requestJson": None if secret or raw is None else raw.decode("utf-8")}
        response = None
        try:
            try:
                response = self.opener.open(Request(url, data=raw, headers=headers, method=method),
                                            timeout=self.timeout)
            except HTTPError as error:
                response = error
            with response:
                data = response.read(MAX_RESPONSE + 1)
                if len(data) > MAX_RESPONSE:
                    receipt.update({"state": "response-too-large", "status": response.code,
                                    "finishedAt": now()})
                    self.sink(receipt, None)
                    raise NativeFailure("Complete AMP response exceeds 64 MiB", receipt,
                                        uncertain=method == "POST" and not secret)
                receipt.update({"status": response.code, "finalUrl": response.url,
                                "headers": {k.lower(): v for k, v in response.headers.items()
                                            if k.lower() in SAFE_HEADERS},
                                "responseSha256": digest(data), "responseBytes": len(data),
                                "finishedAt": now(), "state": "response"})
        except NativeFailure:
            raise
        except (URLError, TimeoutError, OSError) as error:
            receipt.update({"state": "transport-uncertain" if method == "POST" else "read-failed",
                            "finishedAt": now(), "errorType": type(error).__name__})
            self.sink(receipt, None)
            raise NativeFailure("The original native request did not yield a complete response", receipt,
                                uncertain=method == "POST" and not secret) from error
        self.sink(receipt, data)
        try:
            parsed = loads(data)
        except InputError as error:
            raise NativeFailure("The native AMP response is retained but is not complete JSON", receipt,
                                uncertain=method == "POST" and not secret) from error
        if not 200 <= receipt["status"] < 300:
            raise NativeFailure("Native AMP returned HTTP " + str(receipt["status"]) + "; open the complete retained response",
                                receipt, uncertain=method == "POST" and receipt["status"] >= 500 and not secret)
        if isinstance(parsed, dict) and any(parsed.get(key) for key in API_ERRORS):
            raise NativeFailure("Native AMP returned field or permission errors; open the full retained response",
                                receipt, uncertain=False)
        return parsed, data, receipt

    def authenticate(self, credentials):
        fields(credentials, {"username", "passwordSha1"})
        username = text(credentials["username"], "Native AMP username", 1024)
        password = credentials["passwordSha1"]
        if not isinstance(password, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", password):
            raise InputError("Use the existing AMP password's SHA-1 hash for the original native login protocol")
        _credential_transport(self.connection["baseUrl"])
        self.request("POST", "security/user/",
                     {"username": username, "password": password,
                      "workspaceId": self.connection["workspaceId"]}, secret=True)
        user, user_raw, _ = self.request("GET", "security/user/")
        layout, layout_raw, _ = self.request("GET", "security/layout")
        if not isinstance(user, dict) or type(user.get("user-id")) is not int:
            raise NativeFailure("The original AMP session did not identify a native user")
        expected = self.connection.get("expectedUserId")
        if expected is not None and user["user-id"] != expected:
            raise NativeFailure("The actual AMP session belongs to a different selected native user")
        if not isinstance(layout, dict) or layout.get("workspaceId") != self.connection["workspaceId"]:
            raise NativeFailure("The actual AMP session belongs to a different selected native workspace")
        if layout.get("ampVersion") != self.connection["installedVersion"]:
            raise NativeFailure("The actual installed AMP version changed; retain its current configuration before receiving")
        self.user, self.layout = user, layout
        self.connection["expectedUserId"] = user["user-id"]
        return user_raw.decode("utf-8"), layout_raw.decode("utf-8")

    def project(self, ident):
        integer(ident, "Native project ID")
        value, raw, receipt = self.request("GET", "activity/projects/" + str(ident))
        native_project(value)
        if value["internal_id"] != ident:
            raise NativeFailure("The original native read returned a different project identity", receipt)
        return value, raw, receipt

    def capture(self, project_ids, credentials, coverage_note, name=""):
        if (not isinstance(project_ids, list) or len(project_ids) > 10000
                or len(set(project_ids)) != len(project_ids)):
            raise InputError("Choose the complete explicit native project selection")
        session_json, layout_json = self.authenticate(credentials)
        field_data, field_raw, _ = self.request("GET", "activity/fields")
        values_data, values_raw, _ = self.request("POST", "activity/field/values",
                                                required_value_fields(field_raw.decode("utf-8")))
        if not isinstance(values_data, dict):
            raise NativeFailure("The original field-values read did not return a complete object")
        # The pinned GET /activity/projects endpoint excludes its last row. Read exactly
        # the operator's retained original project selection through the full project route.
        projects, originals = [], []
        for ident in project_ids:
            project, raw, _ = self.project(ident)
            projects.append(project)
            originals.append({"internalId": ident, "sha256": digest(raw), "bytes": len(raw)})
        return {"name": name, "connection": self.connection,
                "coverage": {"kind": "explicit-projects", "projectIds": project_ids,
                             "note": text(coverage_note, "Selected original country/programme coverage", 16000)},
                "fieldsJson": field_raw.decode("utf-8"), "valuesJson": values_raw.decode("utf-8"),
                "projectsJson": dumps(projects), "sessionJson": session_json, "layoutJson": layout_json,
                "acquisition": "Complete selected native project reads at " + now() + " from "
                               + self.connection["baseUrl"] + ". Original individual response bytes are retained.",
                "exchanges": originals}

    def submit(self, step):
        payload = loads(step["requestJson"])
        if step["mode"] == "update":
            ident = integer(step["originalId"], "Original native update ID")
            if payload.get("internal_id") != ident:
                raise InputError("Native request body and original update path differ")
            path = "activity/" + str(ident)
        elif step["mode"] == "create":
            if "internal_id" in payload:
                raise InputError("A new native project body carries an existing internal_id")
            path = "activity"
        else:
            raise InputError("Unknown native AMP operation")
        # Original source defaults retain approval and editor behavior.
        return self.request("POST", path +
            "?can-downgrade-to-draft=false&process-approval-fields=false&track-editors=false", payload)
