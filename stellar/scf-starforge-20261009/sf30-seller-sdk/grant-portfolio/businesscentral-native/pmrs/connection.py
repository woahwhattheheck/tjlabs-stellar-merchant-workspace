"""Launcher-owned connections and one ordinary OAuth bearer-file HTTP transport."""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from .canonical import decode, digest, encode, guid, read_bytes, stable_text
from .errors import PMRSError, ProviderError, require

SAFE_RESPONSE_HEADERS = {"content-type", "content-length", "etag", "retry-after",
                         "odata-entityid", "x-ms-service-request-id", "req_id", "request-id"}
MAX_RESPONSE = 8 * 1024 * 1024

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProviderError("PROVIDER_REDIRECT", "The selected provider redirected the request.",
                            http_status=code, dispatched=True)

def checked_url(value, *, loopback=False):
    stable_text(value, 8192)
    parsed = urllib.parse.urlsplit(value)
    require(parsed.scheme == "https" or (loopback and parsed.scheme == "http"
            and parsed.hostname in {"127.0.0.1", "::1", "localhost"}),
            "CONNECTION_URL", "Use the selected HTTPS provider URL.")
    require(parsed.hostname and not parsed.username and not parsed.password and not parsed.fragment
            and not parsed.query, "CONNECTION_URL", "Provider base URLs must not carry credentials, queries or fragments.")
    require("\\" not in parsed.path and ".." not in urllib.parse.unquote(parsed.path).split("/"),
            "CONNECTION_URL", "Invalid provider path.")
    return value.rstrip("/") + "/"

def scope_url(url, roots):
    parsed = urllib.parse.urlsplit(url)
    require(not parsed.username and not parsed.password and not parsed.fragment and "\\" not in url
            and ".." not in urllib.parse.unquote(parsed.path).split("/"),
            "PROVIDER_SCOPE", "Provider continuation contains an invalid path.")
    for root in roots:
        allowed = urllib.parse.urlsplit(root)
        if (parsed.scheme, parsed.netloc) == (allowed.scheme, allowed.netloc) and (
                parsed.path == allowed.path.rstrip("/") or parsed.path.startswith(allowed.path)):
            return url
    raise PMRSError("PROVIDER_SCOPE", "Provider continuation left the selected account, company or API path.")

class Configuration:
    def __init__(self, path, workspace_root):
        self.path = Path(path).absolute()
        self.root = Path(workspace_root).absolute()
        require(not self.path.resolve().is_relative_to(self.root.resolve()), "PRIVATE_CONFIGURATION",
                "Keep launcher connection configuration outside the exported workspace.")
        value = decode(read_bytes(self.path, limit=1024 * 1024))
        require(value.get("schema") == "commons.pmrs-connections.v1", "CONNECTION_SCHEMA", "Invalid connection configuration.")
        require(isinstance(value.get("connections"), dict), "CONNECTION_SCHEMA", "Connection aliases are required.")
        self.connections = {}
        for alias, selected in value["connections"].items():
            require(re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", alias) and isinstance(selected, dict),
                    "CONNECTION_ALIAS", "Invalid launcher connection alias.")
            kind = selected.get("kind")
            require(kind in {"businesscentral", "dataverse"}, "CONNECTION_KIND", "Select Business Central or Dataverse.")
            allow_local = selected.get("allow_loopback_http") is True
            if kind == "businesscentral":
                company = guid(selected.get("company_id"))
                standard = checked_url(selected.get("standard_url"), loopback=allow_local)
                projects = checked_url(selected.get("projects_url"), loopback=allow_local)
                require(urllib.parse.urlsplit(standard).netloc == urllib.parse.urlsplit(projects).netloc
                        and urllib.parse.urlsplit(standard).scheme == urllib.parse.urlsplit(projects).scheme,
                        "COMPANY_SCOPE", "Both Business Central API families must use the same provider origin.")
                suffix = "/companies(" + company + ")/"
                require(standard.lower().endswith("/api/v2.0" + suffix)
                        and projects.lower().endswith("/api/commons/pmrs/v1.0" + suffix),
                        "COMPANY_SCOPE", "Use the exact selected company API paths.")
                public = {"alias": alias, "kind": kind, "company_id": company,
                          "standard_url": standard, "projects_url": projects,
                          "label": stable_text(selected.get("label", alias), 256)}
                roots = [standard, projects]
            else:
                url = checked_url(selected.get("url"), loopback=allow_local)
                require(urllib.parse.urlsplit(url).path.endswith("/api/data/v9.2/"),
                        "DATAVERSE_SCOPE", "Select the actual Dataverse v9.2 Web API base.")
                public = {"alias": alias, "kind": kind, "url": url,
                          "organization_id": guid(selected.get("organization_id")),
                          "label": stable_text(selected.get("label", alias), 256)}
                roots = [url]
            token = selected.get("token_file")
            require(isinstance(token, str) and Path(token).is_absolute()
                    and not Path(token).resolve().is_relative_to(self.root.resolve()),
                    "TOKEN_REFERENCE", "Select an external private bearer-token file.")
            timeout = selected.get("timeout_seconds", 60)
            require(type(timeout) is int and 1 <= timeout <= 120, "CONNECTION_TIMEOUT", "Use a 1–120 second HTTP timeout.")
            self.connections[alias] = {"public": public, "roots": roots, "token_file": token, "timeout": timeout}

    def public(self):
        return [x["public"] for x in self.connections.values()]

    def selected(self, alias, kind=None):
        require(alias in self.connections, "CONNECTION_NOT_FOUND", "The launcher has not configured this connection.")
        value = self.connections[alias]
        require(kind is None or value["public"]["kind"] == kind, "CONNECTION_KIND", "The connection has a different provider kind.")
        return value

    def http(self, alias, kind=None):
        return HTTP(self.selected(alias, kind))

class HTTP:
    def __init__(self, selected):
        self.selected = selected
        self.public = selected["public"]
        self.roots = selected["roots"]
        self.opener = urllib.request.build_opener(NoRedirect())

    def token(self):
        data = read_bytes(self.selected["token_file"], limit=32 * 1024).decode("utf-8").strip()
        require(data and not any(c.isspace() for c in data), "TOKEN_FILE", "The bearer-token file must contain one token.")
        return data

    def request(self, method, url, *, body=None, headers=None, admit=None, limit=MAX_RESPONSE):
        scope_url(url, self.roots)
        require(method in {"GET", "PATCH"}, "HTTP_METHOD", "Only native reads and reviewed conditional patches are supported.")
        require(method != "PATCH" or self.public["kind"] == "dataverse",
                "SOURCE_READ_ONLY", "Business Central is a read-only source in this integration.")
        payload = None if body is None else encode(body)
        outgoing = {"Authorization": "Bearer " + self.token(), "Accept": "application/json",
                    "OData-MaxVersion": "4.0", "OData-Version": "4.0"}
        if payload is not None: outgoing["Content-Type"] = "application/json; charset=utf-8"
        for key, value in (headers or {}).items():
            require(key in {"If-Match", "If-None-Match", "Prefer"}, "HTTP_HEADER", "Unsupported native request header.")
            outgoing[key] = value
        request = urllib.request.Request(url, data=payload, headers=outgoing, method=method)
        # All local validation and serialization precedes durable dispatch admission.
        if admit is not None: admit()
        try:
            try: response = self.opener.open(request, timeout=self.selected["timeout"])
            except urllib.error.HTTPError as error: response = error
            with response:
                content = response.read(limit + 1)
                require(len(content) <= limit, "PROVIDER_RESPONSE_LIMIT", "Provider response exceeds its explicit limit.", limit=limit)
                return {"status": response.status, "headers": {
                    key.lower(): value for key, value in response.headers.items()
                    if key.lower() in SAFE_RESPONSE_HEADERS}, "body": content, "url": url}
        except ProviderError: raise
        except PMRSError: raise
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise ProviderError("PROVIDER_UNCERTAIN" if method == "PATCH" else "PROVIDER_UNAVAILABLE",
                "The original provider request did not return a complete response.", dispatched=True) from error

    def get(self, url):
        return self.request("GET", url)

def parsed(response, *, allow_not_found=False):
    if allow_not_found and response["status"] == 404: return None
    if not 200 <= response["status"] < 300:
        code = {401: "PROVIDER_AUTHENTICATION", 403: "PROVIDER_PERMISSION",
                404: "PROVIDER_NOT_FOUND", 409: "PROVIDER_CONFLICT", 412: "PROVIDER_PRECONDITION",
                429: "PROVIDER_RATE_LIMIT"}.get(response["status"], "PROVIDER_ERROR")
        raise ProviderError(code, "The selected provider rejected the original request.",
                            http_status=response["status"], dispatched=True,
                            retry_after=response["headers"].get("retry-after"))
    return None if not response["body"] else decode(response["body"], limit=MAX_RESPONSE)

def query(url, expression):
    return url + ("&" if "?" in url else "?") + urllib.parse.urlencode(expression, safe="$(),'", quote_via=urllib.parse.quote)
