"""Original HTTP page acquisition with exact-origin runtime header binding."""
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, HTTPRedirectHandler, build_opener
import hashlib
import json
import os
import time

from .model import fail, origin, parse_source, url


def now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def atomic(path, data):
    path = Path(path)
    temporary = path.with_name(path.name + ".partial")
    with temporary.open("wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def headers_for(profile, destination):
    headers = {"User-Agent": "VisitorJourneyWorkspace/1.0", "Accept": "text/html,application/json;q=0.9,*/*;q=0.1",
               "Accept-Encoding": "identity"}
    for name, variable in profile.get("header_environment", {}).get(origin(destination), {}).items():
        value = os.environ.get(variable)
        if not value:
            fail("VISITOR_CREDENTIAL", "The configured request-header environment is unavailable: " + variable, 503)
        if "\r" in value or "\n" in value:
            fail("VISITOR_CREDENTIAL", "A configured request-header value contains a line break.", 503)
        headers[name] = value
    return headers


class ScopedRedirect(HTTPRedirectHandler):
    def __init__(self, profile):
        self.profile = profile
        self.chain = []

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        destination = url(newurl, request.full_url)
        if origin(destination) not in self.profile["allowed_origins"]:
            fail("VISITOR_REDIRECT_SCOPE", "The source redirected outside the selected capture origins.", 409)
        if len(self.chain) >= 10:
            fail("VISITOR_REDIRECT_LIMIT", "The source exceeded ten redirects.", 409)
        self.chain.append({"from": request.full_url, "to": destination, "status": code})
        # Rebuild the request so a source credential never follows a redirect
        # onto an unrelated origin. Each configured origin supplies its own.
        return Request(destination, headers=headers_for(self.profile, destination), method="GET")


def acquire(profile, destination, directory):
    destination = url(destination)
    if origin(destination) not in profile["allowed_origins"]:
        fail("VISITOR_SCOPE", "The page is outside this capture's site origins.")
    started = now()
    clock = time.monotonic()
    redirect = ScopedRedirect(profile)
    opener = build_opener(redirect)
    try:
        response = opener.open(Request(destination, headers=headers_for(profile, destination), method="GET"),
                               timeout=profile["timeout_seconds"])
    except HTTPError as error:
        response = error
    with response:
        content = response.read(profile["max_page_bytes"] + 1)
        if len(content) > profile["max_page_bytes"]:
            fail("VISITOR_PAGE_LIMIT", "The original response exceeds the configured page byte limit.", 413)
        content_type = response.headers.get("Content-Type", "application/octet-stream")
        result = {"url": destination, "final_url": url(response.geturl()), "status": response.status,
                  "redirects": redirect.chain, "observed_at": started, "completed_at": now(),
                  "elapsed_ms": round((time.monotonic() - clock) * 1000, 3),
                  "headers": {key: value for key, value in response.headers.items()
                              if key.lower() in {"content-type", "content-language", "content-length", "last-modified",
                                                 "etag", "cache-control", "date", "content-encoding"}},
                  "source_mode": "HTTP", "acquisition": "Python urllib original HTTP GET",
                  "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                  "content_type": content_type}
    if "html" not in content_type and "json" not in content_type:
        fail("VISITOR_CONTENT_TYPE", "The original response must be an HTML page or native Solr JSON result.", 415)
    filename = hashlib.sha256(destination.encode()).hexdigest()[:24] + (".json" if "json" in content_type else ".html")
    path = Path(directory) / filename
    atomic(path, content)
    result["parsed"] = parse_source(content, result["final_url"], content_type, profile.get("search_result_class", ""))
    result["body_path"] = str(path)
    return result


def supplied(profile, destination, item, content, path):
    destination = url(destination)
    if item.get("url") != destination:
        fail("VISITOR_SUPPLIED_URL", "The supplied original file belongs to a different source URL.", 409)
    if hashlib.sha256(content).hexdigest() != item["sha256"]:
        fail("VISITOR_SUPPLIED_HASH", "The original supplied page bytes changed.", 409)
    content_type = item.get("content_type", "text/html; charset=utf-8")
    final_url = url(item.get("final_url", destination))
    if origin(final_url) not in profile["allowed_origins"]:
        fail("VISITOR_SUPPLIED_ORIGIN", "The supplied original final URL is outside the selected site scope.", 409)
    status = item.get("status")
    if status is not None and (isinstance(status, bool) or not isinstance(status, int) or not 100 <= status <= 599):
        fail("VISITOR_SUPPLIED_STATUS", "A supplied HTTP status must be an actual response code.")
    redirects = item.get("redirects")
    if redirects is not None:
        if not isinstance(redirects, list) or len(redirects) > 10:
            fail("VISITOR_SUPPLIED_REDIRECTS", "The retained redirect chain is invalid.")
        for hop in redirects:
            if not isinstance(hop, dict) or origin(hop.get("from", "")) not in profile["allowed_origins"] or origin(hop.get("to", "")) not in profile["allowed_origins"]:
                fail("VISITOR_SUPPLIED_REDIRECTS", "A supplied redirect is outside this captured site scope.")
    return {"url": destination, "final_url": final_url, "status": status, "redirects": redirects,
            "observed_at": item["observed_at"], "completed_at": item["observed_at"],
            "elapsed_ms": item.get("elapsed_ms"), "headers": {},
            "source_mode": "SUPPLIED_ORIGINAL", "acquisition": item["acquisition"],
            "source_file_id": item["file_id"], "bytes": len(content), "sha256": item["sha256"],
            "content_type": content_type, "parsed": parse_source(content, final_url, content_type, profile.get("search_result_class", "")),
            "body_path": str(path)}
