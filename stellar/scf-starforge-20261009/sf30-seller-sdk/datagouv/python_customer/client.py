#!/usr/bin/env python3
"""Use the installed Datactivist publisher and keep complete customer queries."""
from __future__ import annotations

import argparse
import contextlib
import csv
import datetime as dt
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import queue
import subprocess
import threading
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

__version__ = "1.0.0"


class CustomerError(RuntimeError):
    """A native publisher response or a retained customer-workflow conflict."""

    def __init__(self, code, message, *, status=None, details=None):
        super().__init__(message)
        self.code = str(code)
        self.status = status
        self.details = details

    def as_dict(self):
        value = {"error": self.code, "message": str(self)}
        if self.status is not None:
            value["status"] = self.status
        if self.details is not None:
            value["details"] = self.details
        return value


def _require(condition, code, message):
    if not condition:
        raise CustomerError(code, message)


def _now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n").encode("utf-8")


def _read_json(path):
    with Path(path).open("r", encoding="utf-8") as source:
        return json.load(source)


def _sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def _hash_file(path):
    digest = hashlib.sha256()
    size = 0
    with Path(path).open("rb") as source:
        for part in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(part)
            size += len(part)
    return {"bytes": size, "sha256": digest.hexdigest()}


def _sync_directory(path):
    if os.name == "posix":
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def _save_json(path, value, *, replace=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    _require(not path.is_symlink(), "CUSTOMER_STATE_PATH", "Use the original ordinary customer-state file.")
    temporary = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as out:
            os.chmod(temporary, 0o600)
            out.write(_json_bytes(value))
            out.flush()
            os.fsync(out.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            os.link(temporary, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            temporary.unlink()
    _sync_directory(path.parent)

def _query_text(query):
    if query is None:
        return ""
    if isinstance(query, str):
        return query.removeprefix("?")
    items = list(query.items()) if isinstance(query, dict) else query
    _require(isinstance(items, (list, tuple)), "CUSTOMER_QUERY",
             "Use the original URL query string or a sequence of scalar query parameters.")
    pairs = []
    for item in items:
        _require(isinstance(item, (list, tuple)) and len(item) == 2 and isinstance(item[0], str),
                 "CUSTOMER_QUERY", "Each query parameter needs one string name and one scalar value.")
        name, value = item
        if isinstance(value, bool):
            value = "true" if value else "false"
        elif type(value) in (int, float):
            _require(type(value) is int or math.isfinite(value), "CUSTOMER_QUERY",
                     "Use a finite numeric query value.")
            value = str(value)
        _require(isinstance(value, str), "CUSTOMER_QUERY",
                 "Use a string, finite number, or boolean; an empty source cell is an empty string.")
        pairs.append((name, value))
    return urllib.parse.urlencode(pairs)

def _query_pairs(query):
    pairs = urllib.parse.parse_qsl(_query_text(query), keep_blank_values=True, strict_parsing=False)
    names = [key for key, _ in pairs]
    _require(len(names) == len(set(names)), "CUSTOMER_QUERY_REPEATED", "Supply each dataset query parameter once.")
    return pairs


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise CustomerError("CUSTOMER_REDIRECT", "The selected publisher redirected the request; reopen its original local connection.", status=code)


def _retry_delay(headers, attempt):
    value = headers.get("Retry-After") if headers else None
    if value:
        try:
            return max(0.0, float(value))
        except ValueError:
            from email.utils import parsedate_to_datetime
            try:
                moment = parsedate_to_datetime(value)
                return max(0.0, (moment - dt.datetime.now(dt.timezone.utc)).total_seconds())
            except (TypeError, ValueError, OverflowError):
                pass
    return min(2.0 ** attempt, 8.0)

class _Transport:
    def __init__(self, base_url, *, token=None, timeout=60.0, read_retries=2, max_response_bytes=64 * 1024 * 1024):
        parts = urllib.parse.urlsplit(base_url)
        _require(parts.scheme in ("http", "https") and parts.hostname and not parts.username and not parts.password,
                 "CUSTOMER_CONNECTION", "Use the installed publisher's complete HTTP origin.")
        _require(parts.path in ("", "/") and not parts.query and not parts.fragment,
                 "CUSTOMER_CONNECTION", "The connection origin must not contain a path, query, or credential fragment.")
        if parts.scheme == "http":
            _require(parts.hostname in ("127.0.0.1", "localhost", "::1"),
                     "CUSTOMER_CONNECTION", "Plain HTTP is supported for the publisher's local listener.")
        _require(isinstance(timeout, (int, float)) and 0 < timeout <= 300,
                 "CUSTOMER_TIMEOUT", "Choose a timeout greater than zero and at most 300 seconds.")
        _require(type(read_retries) is int and 0 <= read_retries <= 5,
                 "CUSTOMER_RETRIES", "Choose zero through five read retries.")
        _require(type(max_response_bytes) is int and max_response_bytes >= 1024,
                 "CUSTOMER_RESPONSE_LIMIT", "Choose an explicit complete-response byte limit.")
        self.base_url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, "", "", ""))
        self.token = token
        self.timeout = float(timeout)
        self.read_retries = read_retries
        self.max_response_bytes = max_response_bytes
        # Local application credentials never pass through an environment proxy.
        self._opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())

    def _headers(self):
        headers = {"Accept": "application/json", "Accept-Encoding": "identity",
                   "User-Agent": "Datactivist-Customer/" + __version__}
        if self.token:
            headers["x-workspace-token"] = self.token
        return headers

    def request(self, method, path, *, parameters=None, value=None):
        _require(path.startswith("/") and not path.startswith("//") and "?" not in path and "#" not in path,
                 "CUSTOMER_ROUTE", "Use an original publisher API path and separate query parameters.")
        query = urllib.parse.urlencode(_query_pairs(parameters))
        url = self.base_url + path + ("?" + query if query else "")
        headers = self._headers()
        data = None
        if value is not None:
            data = _json_bytes(value)
            headers["Content-Type"] = "application/json; charset=utf-8"
        attempts = self.read_retries + 1 if method == "GET" else 1
        for attempt in range(attempts):
            request = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with self._opener.open(request, timeout=self.timeout) as response:
                    raw = response.read(self.max_response_bytes + 1)
                    _require(len(raw) <= self.max_response_bytes, "CUSTOMER_RESPONSE_TOO_LARGE",
                             "The native response exceeds this client's selected complete-response byte limit.")
                    declared = response.headers.get("Content-Length")
                    _require(declared is None or declared.isdecimal() and int(declared) == len(raw), "CUSTOMER_RESPONSE_INCOMPLETE",
                             "The native response ended before its declared complete body.")
                    if not raw:
                        return None
                    try:
                        return json.loads(raw.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError) as error:
                        raise CustomerError("CUSTOMER_RESPONSE_JSON", "The publisher response was not complete UTF-8 JSON.") from error
            except urllib.error.HTTPError as error:
                if method == "GET" and error.code in (429, 502, 503, 504) and attempt + 1 < attempts:
                    delay = _retry_delay(error.headers, attempt)
                    error.close()
                    if delay <= 60:
                        time.sleep(delay)
                        continue
                    raise CustomerError("CUSTOMER_RETRY_LATER", "The publisher requested a longer pause; continue this same read later.",
                                        status=error.code, details={"retry_after_seconds": delay}) from error
                raw = error.read(self.max_response_bytes + 1)
                error.close()
                try:
                    details = json.loads(raw.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    details = {"message": "The selected publisher returned HTTP " + str(error.code) + "."}
                native_code = details.get("error") if isinstance(details, dict) else None
                message = details.get("message") if isinstance(details, dict) else None
                if isinstance(native_code, dict):
                    message = message or native_code.get("message")
                    native_code = native_code.get("code")
                raise CustomerError(native_code or "CUSTOMER_HTTP", message or "The publisher rejected the request.",
                                    status=error.code, details=details) from error
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                if method == "GET" and attempt + 1 < attempts:
                    time.sleep(min(2 ** attempt, 8))
                    continue
                message = ("The read did not return a complete response; continue with the same edition and query."
                           if method == "GET" else
                           "The request did not return a complete response. Reopen the retained customer request and inspect the native workspace before continuing.")
                raise CustomerError("CUSTOMER_CONNECTION_ENDED", message) from error

    def download(self, path, output, *, parameters=None, max_bytes=768 * 1024 * 1024):
        """Keep one complete original publisher file without decoding its bytes."""
        output = Path(output).absolute()
        output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        _require(not output.exists(), "CUSTOMER_OUTPUT_EXISTS", "Choose a new output filename.")
        query = urllib.parse.urlencode(_query_pairs(parameters))
        _require(path.startswith("/") and not path.startswith("//") and "?" not in path and "#" not in path,
                 "CUSTOMER_ROUTE", "Use the original publisher file route.")
        url = self.base_url + path + ("?" + query if query else "")
        temporary = output.with_name("." + output.name + "." + uuid.uuid4().hex + ".tmp")
        try:
            request = urllib.request.Request(url, headers=self._headers(), method="GET")
            with self._opener.open(request, timeout=self.timeout) as response:
                declared = response.headers.get("Content-Length")
                _require(declared is None or declared.isdecimal() and int(declared) <= max_bytes,
                         "CUSTOMER_RESPONSE_LIMIT", "The publisher file exceeds the selected complete-file byte limit.")
                digest, size = hashlib.sha256(), 0
                with temporary.open("xb") as target:
                    os.chmod(temporary, 0o600)
                    while True:
                        part = response.read(1024 * 1024)
                        if not part:
                            break
                        size += len(part)
                        _require(size <= max_bytes, "CUSTOMER_RESPONSE_LIMIT",
                                 "The publisher file exceeds the selected complete-file byte limit.")
                        digest.update(part)
                        target.write(part)
                    target.flush()
                    os.fsync(target.fileno())
                _require(declared is None or size == int(declared), "CUSTOMER_RESPONSE_INCOMPLETE",
                         "The publisher file ended before its complete declared body.")
                content_type = response.headers.get("Content-Type")
            os.link(temporary, output)
            _sync_directory(output.parent)
            return {"path": str(output), "bytes": size, "sha256": digest.hexdigest(), "content_type": content_type}
        except urllib.error.HTTPError as error:
            raw = error.read(1024 * 1024)
            error.close()
            try:
                details = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                details = {}
            raise CustomerError(details.get("error", "CUSTOMER_HTTP"),
                                details.get("message", "The publisher file request was rejected."),
                                status=error.code, details=details) from error
        except (urllib.error.URLError, TimeoutError) as error:
            raise CustomerError("CUSTOMER_CONNECTION_ENDED",
                                "The complete publisher file did not finish; repeat its original download to a new output.") from error
        finally:
            with contextlib.suppress(FileNotFoundError):
                temporary.unlink()


def _page_scope(page):
    _require(isinstance(page, dict) and page.get("schema") == "stellar-forge.dataset-page.v1",
             "CUSTOMER_DATASET_PAGE", "Expected the publisher's original dataset page.")
    dataset, meta = page.get("dataset"), page.get("page")
    fields, rows = page.get("fields"), page.get("rows")
    _require(isinstance(dataset, dict) and isinstance(dataset.get("snapshot"), str) and re.fullmatch(r"[0-9a-f]{64}", dataset["snapshot"]) and
             isinstance(meta, dict) and "nextCursor" in meta and isinstance(fields, list) and fields and all(isinstance(field, str) for field in fields) and
             len(fields) == len(set(fields)) and isinstance(rows, list),
             "CUSTOMER_DATASET_PAGE", "The original page is missing its edition, fields, or rows.")
    total, returned, limit = meta.get("total"), meta.get("returned"), meta.get("limit")
    _require(type(total) is int and total >= 0 and type(returned) is int and returned == len(rows) and
             type(limit) is int and limit > 0 and returned <= limit,
             "CUSTOMER_PAGE_COUNTS", "The original page has inconsistent row counts.")
    _require(meta.get("nextCursor") is None or
             isinstance(meta.get("nextCursor"), str) and bool(meta["nextCursor"]),
             "CUSTOMER_PAGE_CURSOR", "The publisher returned an invalid continuation cursor.")
    _require(all(isinstance(row, dict) and set(row) == set(fields) for row in rows),
             "CUSTOMER_PAGE_FIELDS", "A native row does not match the selected fields.")
    return {"dataset": dataset, "fields": fields, "filters": page.get("filters", {}),
            "ranges": page.get("ranges", []), "order": page.get("order"),
            "semantics": page.get("semantics"), "total": total}


def _walk_pages(fetch_page, query, *, cursor=None, received=0, scope=None):
    pairs = _query_pairs(query)
    _require(all(key != "cursor" for key, _ in pairs), "CUSTOMER_FIRST_PAGE_QUERY",
             "Save a complete query without a continuation cursor; the original nextCursor supplies later pages.")
    seen = {cursor} if cursor is not None else set()
    while True:
        parameters = pairs + ([("cursor", cursor)] if cursor is not None else [])
        page = fetch_page(urllib.parse.urlencode(parameters))
        selected = _page_scope(page)
        if scope is None:
            scope = selected
        _require(selected == scope, "CUSTOMER_QUERY_CHANGED",
                 "The response changed the retained snapshot, schema, fields, filters, order, or meaning.")
        count = len(page["rows"])
        _require(count == min(page["page"]["limit"], scope["total"] - received),
                 "CUSTOMER_PAGE_BOUNDARY", "The page does not continue the original complete query boundary.")
        received += count
        next_cursor = page["page"]["nextCursor"]
        _require(received <= scope["total"], "CUSTOMER_PAGE_BOUNDARY", "The page exceeds the original query total.")
        if next_cursor is None:
            _require(received == scope["total"], "CUSTOMER_QUERY_INCOMPLETE",
                     "The publisher ended the cursor before returning every selected row.")
        else:
            _require(count > 0 and received < scope["total"] and next_cursor not in seen,
                     "CUSTOMER_CURSOR_REPEATED", "The continuation did not advance within the original query.")
            seen.add(next_cursor)
        yield page, scope, received
        if next_cursor is None:
            return
        cursor = next_cursor


def _verify_prefix(stream, size, expected_sha256):
    digest = hashlib.sha256()
    remaining = size
    stream.seek(0)
    while remaining:
        part = stream.read(min(1024 * 1024, remaining))
        _require(bool(part), "CUSTOMER_OUTPUT_INCOMPLETE", "The retained output is shorter than the accepted query prefix.")
        digest.update(part)
        remaining -= len(part)
    _require(digest.hexdigest() == expected_sha256, "CUSTOMER_OUTPUT_CHANGED",
             "The retained query prefix differs; preserve it and reopen the original customer output.")
    stream.seek(size)
    stream.truncate()
    stream.flush()
    os.fsync(stream.fileno())
    return digest


def _finish_rows(directory, state):
    partial = directory / "rows.jsonl.partial"
    final = directory / "rows.jsonl"
    expected = {"bytes": state["bytes"], "sha256": state["sha256"]}
    if final.exists():
        _require(not final.is_symlink() and _hash_file(final) == expected,
                 "CUSTOMER_OUTPUT_CHANGED", "The existing completed row file differs from this query.")
    else:
        _require(partial.is_file() and not partial.is_symlink() and _hash_file(partial) == expected,
                 "CUSTOMER_OUTPUT_CHANGED", "The complete query output is unavailable.")
        os.link(partial, final)
    if partial.exists():
        _require(not partial.is_symlink() and _hash_file(partial) == expected,
                 "CUSTOMER_OUTPUT_CHANGED", "A retained partial differs from the completed query.")
        partial.unlink()
    _sync_directory(directory)
    state["state"] = "COMPLETE"
    state["completed_at"] = state.get("completed_at") or _now()
    state["file"] = "rows.jsonl"
    _save_json(directory / "query.json", state, replace=True)
    return {"directory": str(directory), "path": str(final), "rows": state["received"],
            "pages": len(state["pages"]), "bytes": state["bytes"], "sha256": state["sha256"],
            "edition": state["edition"], "workspace_id": state["workspace_id"], "query": state["query"]}


def _save_query_result(fetch_page, *, directory, workspace_id, edition, query):
    """Receive every native page; resume from the retained original cursor and output."""
    directory = Path(directory).absolute()
    _require(not directory.is_symlink(), "CUSTOMER_OUTPUT_DIRECTORY", "Use an ordinary customer output directory.")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    query = urllib.parse.urlencode(_query_pairs(query))
    _require("cursor" not in dict(_query_pairs(query)), "CUSTOMER_FIRST_PAGE_QUERY",
             "The saved query must begin at its first page.")
    path, partial = directory / "query.json", directory / "rows.jsonl.partial"
    binding = {"workspace_id": workspace_id, "edition": edition, "query": query}
    if path.exists():
        state = _read_json(path)
        _require(state.get("schema") == "stellar-forge.datagouv-customer-query.v1" and
                 all(state.get(key) == value for key, value in binding.items()),
                 "CUSTOMER_QUERY_BINDING", "Continue the original workspace, edition, and complete query in this output directory.")
        if state["state"] == "COMPLETE":
            _require(_hash_file(directory / state["file"]) == {"bytes": state["bytes"], "sha256": state["sha256"]},
                     "CUSTOMER_OUTPUT_CHANGED", "The completed customer query file changed.")
            return _finish_rows(directory, state)
    else:
        _require(not partial.exists() and not (directory / "rows.jsonl").exists(),
                 "CUSTOMER_OUTPUT_EXISTS", "Choose an empty customer output directory or the original saved query.")
        state = {"schema": "stellar-forge.datagouv-customer-query.v1", **binding, "created_at": _now(),
                 "state": "RECEIVING", "received": 0, "scope": None, "next_cursor": None,
                 "bytes": 0, "sha256": _sha256(b""), "pages": []}
        _save_json(path, state)
    if state["pages"] and state["next_cursor"] is None:
        return _finish_rows(directory, state)
    _require(not partial.is_symlink(), "CUSTOMER_OUTPUT_PATH", "Use the original ordinary partial output file.")
    if not partial.exists():
        _require(state["bytes"] == 0, "CUSTOMER_OUTPUT_INCOMPLETE", "The accepted partial output is missing.")
        with partial.open("xb"):
            os.chmod(partial, 0o600)
    with partial.open("r+b") as stream:
        digest = _verify_prefix(stream, state["bytes"], state["sha256"])
        for page, scope, received in _walk_pages(fetch_page, query, cursor=state["next_cursor"],
                                                  received=state["received"], scope=state["scope"]):
            raw = b"".join((json.dumps(row, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8")
                           for row in page["rows"])
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
            digest.update(raw)
            state["pages"].append({"returned": len(page["rows"]), "request_cursor": state["next_cursor"],
                                   "next_cursor": page["page"]["nextCursor"], "received": received})
            state.update(scope=scope, received=received, next_cursor=page["page"]["nextCursor"],
                         bytes=stream.tell(), sha256=digest.hexdigest(), updated_at=_now())
            _save_json(path, state, replace=True)
    return _finish_rows(directory, state)


def saved_rows(directory):
    """Open a completed original customer export while retaining native JSON values."""
    directory = Path(directory)
    state = _read_json(directory / "query.json")
    _require(state.get("schema") == "stellar-forge.datagouv-customer-query.v1" and state.get("state") == "COMPLETE" and
             state.get("file") == "rows.jsonl", "CUSTOMER_QUERY_INCOMPLETE", "Open a completed retained customer query.")
    path = directory / "rows.jsonl"
    _require(not path.is_symlink() and _hash_file(path) == {"bytes": state["bytes"], "sha256": state["sha256"]},
             "CUSTOMER_OUTPUT_CHANGED", "The saved row file differs from its completed query.")
    with path.open("r", encoding="utf-8") as source:
        count = 0
        for line in source:
            row = json.loads(line)
            _require(isinstance(row, dict), "CUSTOMER_ROW", "Expected an original JSON row object.")
            count += 1
            yield row
        _require(count == state["received"], "CUSTOMER_OUTPUT_INCOMPLETE", "The saved query row count differs.")


def export_csv(directory, output):
    """Write every saved native row as CSV; the query manifest retains field types."""
    directory, output = Path(directory), Path(output)
    state = _read_json(directory / "query.json")
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    _require(not output.exists(), "CUSTOMER_OUTPUT_EXISTS", "Choose a new CSV output file.")
    temporary = output.with_name("." + output.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="") as target:
            os.chmod(temporary, 0o600)
            writer = csv.DictWriter(target, fieldnames=state["scope"]["fields"], lineterminator="\r\n")
            writer.writeheader()
            for row in saved_rows(directory):
                writer.writerow(row)
            target.flush()
            os.fsync(target.fileno())
        os.link(temporary, output)
    finally:
        with contextlib.suppress(FileNotFoundError):
            temporary.unlink()
    _sync_directory(output.parent)
    return {"path": str(output.absolute()), **_hash_file(output), "rows": state["received"],
            "fields": state["scope"]["fields"]}


@contextlib.contextmanager
def _directory_lock(directory):
    path = Path(directory) / ".customer.lock"
    with path.open("a+b") as lock:
        os.chmod(path, 0o600)
        if os.name == "nt":
            import msvcrt
            if lock.seek(0, os.SEEK_END) == 0:
                lock.write(b"\0")
                lock.flush()
            lock.seek(0)
            try:
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as error:
                raise CustomerError("CUSTOMER_OUTPUT_BUSY", "Another client is continuing this original customer output.") from error
            try:
                yield
            finally:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise CustomerError("CUSTOMER_OUTPUT_BUSY", "Another client is continuing this original customer output.") from error
            try:
                yield
            finally:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def save_query_result(fetch_page, *, directory, workspace_id, edition, query):
    directory = Path(directory).absolute()
    _require(not directory.is_symlink(), "CUSTOMER_OUTPUT_DIRECTORY", "Use an ordinary customer output directory.")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    with _directory_lock(directory):
        return _save_query_result(fetch_page, directory=directory, workspace_id=workspace_id, edition=edition, query=query)

def profile_query(directory):
    """Describe every saved row using its original JSON field types and values."""
    directory = Path(directory)
    state = _read_json(directory / "query.json")
    _require(state.get("schema") == "stellar-forge.datagouv-customer-query.v1" and state.get("state") == "COMPLETE",
             "CUSTOMER_QUERY_INCOMPLETE", "Profile a completed customer query.")
    fields = state["scope"]["fields"]
    counts = {name: {} for name in fields}
    profiles = {name: {"types": {}, "null": 0, "empty_string": 0, "leading_zero_strings": 0,
                       "literal_null_tokens": 0} for name in fields}
    total = 0
    for row in saved_rows(directory):
        _require(set(row) == set(fields), "CUSTOMER_PAGE_FIELDS", "A saved row differs from the native selected fields.")
        total += 1
        for name in fields:
            value = row[name]
            kind = ("null" if value is None else "boolean" if isinstance(value, bool) else
                    "string" if isinstance(value, str) else "integer" if type(value) is int else
                    "number" if type(value) is float else "unsupported")
            _require(kind != "unsupported", "CUSTOMER_ROW_TYPE", "The native dataset returned a non-scalar field.")
            encoded = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            key = kind + ":" + encoded
            counts[name][key] = counts[name].get(key, 0) + 1
            summary = profiles[name]
            summary["types"][kind] = summary["types"].get(kind, 0) + 1
            summary["null"] += value is None
            summary["empty_string"] += value == ""
            if isinstance(value, str):
                summary["leading_zero_strings"] += len(value) > 1 and value.startswith("0")
                summary["literal_null_tokens"] += value.upper() in ("NA", "NULL", "N/A")
    for name in fields:
        distinct = len(counts[name])
        profiles[name].update(
            distinct_values=distinct,
            duplicate_values=sum(count > 1 for count in counts[name].values()),
            duplicate_rows=sum(count - 1 for count in counts[name].values()),
            unique=distinct == total,
        )
    return {"schema": "stellar-forge.datagouv-customer-profile.v1", "workspace_id": state["workspace_id"],
            "edition": state["edition"], "query": state["query"], "rows": total,
            "source_file": {"path": str((directory / "rows.jsonl").absolute()),
                            "bytes": state["bytes"], "sha256": state["sha256"]},
            "fields": profiles}


def value_counts(directory, field):
    """Return all distinct values and counts in an already received query field."""
    state = _read_json(Path(directory) / "query.json")
    _require(state.get("state") == "COMPLETE" and field in state["scope"]["fields"],
             "CUSTOMER_FIELD", "Choose a field from the completed customer query.")
    counts, values = {}, {}
    for row in saved_rows(directory):
        value = row[field]
        key = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        counts[key] = counts.get(key, 0) + 1
        values[key] = value
    return {"workspace_id": state["workspace_id"], "edition": state["edition"], "field": field,
            "rows": state["received"], "distinct": len(counts),
            "values": [{"value": values[key], "rows": counts[key]}
                       for key in sorted(counts, key=lambda item: (-counts[item], item))]}


class NativeDatasetSession:
    """Keep one immutable dataset loaded by the installed original Node handler."""

    def __init__(self, *, node, handler, config, adapter=None, timeout=60.0,
                 max_response_bytes=64 * 1024 * 1024):
        self.config = Path(config).absolute()
        self.handler = Path(handler).absolute()
        self.adapter = Path(adapter).absolute() if adapter else Path(__file__).with_name("native_dataset.mjs")
        self.timeout = float(timeout)
        self.max_response_bytes = max_response_bytes
        _require(0 < self.timeout <= 300 and type(max_response_bytes) is int and max_response_bytes >= 1024,
                 "CUSTOMER_NATIVE_OPTIONS", "Choose a positive native timeout up to 300 seconds and complete-response limit.")
        _require(all(path.is_file() for path in (self.config, self.handler, self.adapter)),
                 "CUSTOMER_NATIVE_SOURCE", "Select the installed original handler, saved edition config, and customer adapter.")
        self.config_identity = _hash_file(self.config)
        self._responses = queue.Queue()
        self._lock = threading.RLock()
        self._sequence = 0
        self._closed = False
        self._process = subprocess.Popen(
            [str(node), str(self.adapter), str(self.handler), str(self.config)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        self._reader = threading.Thread(target=self._read_output, daemon=True, name="datagouv-customer-native")
        self._reader.start()
        try:
            self.dataset = self._response(0)
            _require(isinstance(self.dataset, dict) and re.fullmatch(r"[0-9a-f]{64}", self.dataset.get("snapshot", "")),
                     "CUSTOMER_NATIVE_DATASET", "The original handler did not open an immutable dataset snapshot.")
        except BaseException:
            self.close()
            raise

    def _read_output(self):
        try:
            while True:
                raw = self._process.stdout.readline(self.max_response_bytes + 1)
                if not raw:
                    self._responses.put(None)
                    return
                if len(raw) > self.max_response_bytes or not raw.endswith(b"\n"):
                    self._responses.put(CustomerError("CUSTOMER_RESPONSE_TOO_LARGE",
                                                       "The original handler response exceeds the complete-response limit."))
                    return
                self._responses.put(raw)
        except BaseException as error:
            self._responses.put(error)

    def _response(self, request_id):
        try:
            raw = self._responses.get(timeout=self.timeout)
        except queue.Empty as error:
            raise CustomerError("CUSTOMER_NATIVE_TIMEOUT",
                                "The original dataset read timed out; reopen the same installed source and saved query.") from error
        if isinstance(raw, BaseException):
            raise raw
        if raw is None:
            raise CustomerError("CUSTOMER_NATIVE_ENDED",
                                "The selected native dataset process ended before its complete response.")
        try:
            response = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise CustomerError("CUSTOMER_NATIVE_RESPONSE", "The native adapter did not return complete UTF-8 JSON.") from error
        _require(isinstance(response, dict) and response.get("schema") == "stellar-forge.customer-native.v1" and
                 response.get("id") == request_id and type(response.get("status")) is int and "body" in response,
                 "CUSTOMER_NATIVE_RESPONSE", "The native response does not match this original customer request.")
        body = response["body"]
        if response["status"] >= 400:
            code = body.get("error", "CUSTOMER_NATIVE_QUERY") if isinstance(body, dict) else "CUSTOMER_NATIVE_QUERY"
            message = body.get("message", "The original dataset rejected the query.") if isinstance(body, dict) else str(body)
            raise CustomerError(code, message, status=response["status"], details=body)
        return body

    def describe(self):
        return json.loads(json.dumps(self.dataset))

    def page(self, query=None):
        with self._lock:
            _require(not self._closed, "CUSTOMER_NATIVE_CLOSED", "Open the installed original dataset session.")
            self._sequence += 1
            command = {"id": self._sequence, "query": urllib.parse.urlencode(_query_pairs(query))}
            try:
                self._process.stdin.write(json.dumps(command, ensure_ascii=False, allow_nan=False).encode("utf-8") + b"\n")
                self._process.stdin.flush()
                page = self._response(self._sequence)
            except (OSError, CustomerError):
                self.close()
                raise
            scope = _page_scope(page)
            _require(scope["dataset"]["snapshot"] == self.dataset["snapshot"],
                     "CUSTOMER_QUERY_CHANGED", "The native page differs from the original loaded edition.")
            return page

    def pages(self, query=None):
        if query is None:
            query = {"limit": self.dataset["maxLimit"]}
        for page, _scope, _received in _walk_pages(self.page, query):
            yield page

    def rows(self, query=None):
        for page in self.pages(query):
            yield from page["rows"]

    def download(self, directory, query=None, *, workspace_id=None):
        query = _download_query(directory, query, default="limit=" + str(self.dataset["maxLimit"]))
        return save_query_result(self.page, directory=directory, workspace_id=workspace_id,
                                 edition=self.dataset["snapshot"], query=query)

    def close(self):
        with self._lock:
            if self._closed:
                return
            self._closed = True
            with contextlib.suppress(OSError):
                self._process.stdin.close()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.terminate()
                try:
                    self._process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._process.kill()
                    self._process.wait()
            for stream in (self._process.stdout, self._process.stderr):
                with contextlib.suppress(OSError):
                    stream.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class DatactivistClient:
    """Customer access to the installed original data.gouv publisher HTTP service."""

    def __init__(self, url, *, timeout=60.0, read_retries=2):
        self._transport = _Transport(url, timeout=timeout, read_retries=read_retries)

    def status(self):
        result = self._transport.request("GET", "/api/status")
        _require(isinstance(result, dict) and result.get("schema") == "stellar-forge.datagouv-operations.v1" and
                 isinstance(result.get("workspace"), dict) and isinstance(result.get("selection"), dict),
                 "CUSTOMER_WORKSPACE", "Open the installed original data.gouv publisher workspace.")
        return result

    def publications(self):
        return self.status()["publications"]

    def dataset(self, publication_id=None):
        state = self.status()
        selected = publication_id or state["selection"]["publicationId"]
        publication = next((row for row in state["publications"] if row["id"] == selected), None)
        _require(publication is not None and publication["state"] == "PUBLISHED",
                 "CUSTOMER_PUBLICATION", "Choose a saved, fully published local edition.")
        return PublishedDataset(self, state["workspace"]["id"], publication)

    def inspect_publication(self, publication_id, query="limit=25"):
        return self._transport.request("GET", "/api/publication",
                                       parameters={"publication": publication_id, "query": _query_text(query)})

    def source_page(self, capture_hash, *, offset=0, limit=250):
        return self._transport.request("GET", "/api/source",
                                       parameters={"capture": capture_hash, "offset": offset, "limit": limit})

    def source_rows(self, capture_hash):
        offset = 0
        while True:
            result = self.source_page(capture_hash, offset=offset)
            meta = result["page"]
            _require(result["capture"]["hash"] == capture_hash and meta["offset"] == offset and
                     len(result["rows"]) == min(meta["limit"], meta["total"] - offset),
                     "CUSTOMER_SOURCE_PAGE", "The retained source page did not continue its original boundary.")
            yield from result["rows"]
            if meta["next"] is None:
                _require(offset + len(result["rows"]) == meta["total"], "CUSTOMER_SOURCE_INCOMPLETE",
                         "The source ended before every original row.")
                return
            _require(meta["next"] == offset + len(result["rows"]) and meta["next"] > offset,
                     "CUSTOMER_SOURCE_PAGE", "The retained source page did not advance.")
            offset = meta["next"]

    def history(self):
        offset = 0
        while True:
            result = self._transport.request("GET", "/api/history", parameters={"offset": offset})
            meta = result["page"]
            _require(meta["offset"] == offset and len(result["rows"]) == min(meta["limit"], meta["total"] - offset),
                     "CUSTOMER_HISTORY_PAGE", "The original operation history did not continue its page boundary.")
            yield from result["rows"]
            if meta["next"] is None:
                return
            _require(meta["next"] == offset + len(result["rows"]) and meta["next"] > offset,
                     "CUSTOMER_HISTORY_PAGE", "The original operation history did not advance.")
            offset = meta["next"]

    def comparison(self, comparison_id):
        offset, original, changes = 0, None, []
        while True:
            page = self._transport.request("GET", "/api/comparison",
                                           parameters={"comparison": comparison_id, "offset": offset})
            meta = page["page"]
            _require(page["id"] == comparison_id and meta["offset"] == offset and
                     len(page["changes"]) == min(meta["limit"], meta["total"] - offset),
                     "CUSTOMER_COMPARISON_PAGE", "The original comparison did not continue its complete change list.")
            if original is None:
                original = {key: value for key, value in page.items() if key not in ("changes", "page")}
                total = meta["total"]
            _require(page["summary"] == original["summary"] and meta["total"] == total,
                     "CUSTOMER_COMPARISON_CHANGED", "The immutable source comparison changed during receiving.")
            changes.extend(page["changes"])
            if meta["next"] is None:
                _require(len(changes) == total, "CUSTOMER_COMPARISON_INCOMPLETE",
                         "Receive every original source change before using the comparison.")
                return {**original, "changes": changes, "complete": True, "changeCount": total}
            _require(meta["next"] == offset + len(page["changes"]) and meta["next"] > offset,
                     "CUSTOMER_COMPARISON_PAGE", "The original comparison did not advance.")
            offset = meta["next"]

    def _operation(self, route, body, request_file):
        """Continue one native UUID request through restarts and lost responses."""
        state = self.status()
        workspace_id = state["workspace"]["id"]
        request_file = Path(request_file).absolute()
        request_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with _directory_lock(request_file.parent):
            if request_file.exists():
                saved = _read_json(request_file)
                _require(saved.get("schema") == "stellar-forge.datagouv-customer-request.v1" and
                         saved.get("workspace_id") == workspace_id and saved.get("route") == route and
                         {key: value for key, value in saved["body"].items() if key != "requestId"} == body,
                         "CUSTOMER_REQUEST_CHANGED", "Continue this original workspace request with its retained input.")
                if saved.get("state") == "COMPLETE":
                    return saved["result"]
            else:
                saved = {"schema": "stellar-forge.datagouv-customer-request.v1", "workspace_id": workspace_id,
                         "route": route, "body": {**body, "requestId": str(uuid.uuid4())},
                         "created_at": _now(), "state": "PREPARED"}
                _save_json(request_file, saved)
            session = self._transport.request("GET", "/api/session")
            _require(isinstance(session, dict) and isinstance(session.get("token"), str) and session["token"],
                     "CUSTOMER_SESSION", "Reopen the original local publisher connection.")
            self._transport.token = session["token"]
            saved.update(state="REQUESTING", attempted_at=_now())
            _save_json(request_file, saved, replace=True)
            try:
                result = self._transport.request("POST", route, value=saved["body"])
            except CustomerError as error:
                saved.update(state="CONTINUE_ORIGINAL_REQUEST", last_error=error.as_dict())
                _save_json(request_file, saved, replace=True)
                raise
            saved.update(state="COMPLETE", result=result, completed_at=_now())
            saved.pop("last_error", None)
            _save_json(request_file, saved, replace=True)
            return result

    def continue_request(self, route, original_request, *, request_file):
        """Reopen an already retained native compare/select/decision UUID request."""
        _require(route in ("/api/compare", "/api/select", "/api/decide") and isinstance(original_request, dict),
                 "CUSTOMER_ORIGINAL_REQUEST", "Choose an original comparison, selection, or decision request.")
        request_id = original_request.get("requestId")
        try:
            parsed = uuid.UUID(request_id)
        except (ValueError, TypeError, AttributeError) as error:
            raise CustomerError("CUSTOMER_ORIGINAL_REQUEST", "Use the retained native version-4 request UUID.") from error
        _require(parsed.version == 4 and str(parsed) == request_id, "CUSTOMER_ORIGINAL_REQUEST",
                 "Use the exact retained native version-4 request UUID.")
        state = self.status()
        request_file = Path(request_file).absolute()
        request_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with _directory_lock(request_file.parent):
            if request_file.exists():
                saved = _read_json(request_file)
                _require(saved.get("workspace_id") == state["workspace"]["id"] and saved.get("route") == route and
                         saved.get("body") == original_request, "CUSTOMER_REQUEST_CHANGED",
                         "This customer request file belongs to another original operation.")
            else:
                _save_json(request_file, {"schema": "stellar-forge.datagouv-customer-request.v1",
                           "workspace_id": state["workspace"]["id"], "route": route, "body": original_request,
                           "state": "PREPARED", "created_at": _now()})
        return self._operation(route, {key: value for key, value in original_request.items() if key != "requestId"}, request_file)

    def compare(self, before, after, keys, *, request_file):
        return self._operation("/api/compare", {"before": before, "after": after, "keys": list(keys)}, request_file)

    def decide(self, comparison_id, action, *, expected_revision, reviewer, note, request_file, publication_id=None):
        _require(action in ("accept", "keep", "withdraw"), "CUSTOMER_DECISION", "Choose accept, keep, or withdraw.")
        body = {"comparisonId": comparison_id, "action": action, "expectedRevision": expected_revision,
                "reviewer": reviewer, "note": note}
        if publication_id is not None:
            body["publicationId"] = publication_id
        return self._operation("/api/decide", body, request_file)

    def select(self, publication_id, *, expected_revision, reviewer, note, request_file):
        return self._operation("/api/select", {"publicationId": publication_id, "expectedRevision": expected_revision,
                                               "reviewer": reviewer, "note": note}, request_file)

    def download_file(self, kind, source_id, output):
        _require(kind in ("original", "manifest", "comparison", "csv", "config", "candidate"),
                 "CUSTOMER_DOWNLOAD", "Choose an original publisher file type.")
        return self._transport.download("/api/download", output, parameters={"kind": kind, "id": source_id})

    def archive(self, output):
        return self._transport.download("/api/export", output)


class PublishedDataset:
    """One named published edition, retained independently of the current pointer."""

    def __init__(self, client, workspace_id, publication):
        self.client = client
        self.workspace_id = workspace_id
        self.publication = json.loads(json.dumps(publication))
        self.id = publication["id"]
        self.snapshot = publication["snapshot"]

    def page(self, query=None):
        pairs = _query_pairs(query)
        _require(all(key != "publication" for key, _ in pairs), "CUSTOMER_PUBLICATION_QUERY",
                 "Select the edition separately from its native dataset query.")
        page = self.client._transport.request("GET", "/api/query", parameters=[("publication", self.id), *pairs])
        scope = _page_scope(page)
        _require(scope["dataset"]["snapshot"] == self.snapshot, "CUSTOMER_QUERY_CHANGED",
                 "The customer response differs from the original selected publication.")
        return page

    def pages(self, query="limit=250"):
        for page, _scope, _received in _walk_pages(self.page, query):
            yield page

    def rows(self, query="limit=250"):
        for page in self.pages(query):
            yield from page["rows"]

    def download(self, directory, query=None):
        query = _download_query(directory, query)
        return save_query_result(self.page, directory=directory, workspace_id=self.workspace_id,
                                 edition={"publication_id": self.id, "snapshot": self.snapshot}, query=query)


def prepare_adoption(client, directory, *, after_capture, keys, following_publication=None):
    """Retain the full native source comparison and its original selection revision."""
    directory = Path(directory).absolute()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    status = client.status()
    binding = {"workspace_id": status["workspace"]["id"], "after_capture": after_capture,
               "keys": list(keys), "following_publication": following_publication}
    path = directory / "review.json"
    with _directory_lock(directory):
        if path.exists():
            review = _read_json(path)
            _require(review.get("schema") == "stellar-forge.datagouv-customer-adoption.v1" and
                     all(review.get(key) == value for key, value in binding.items()),
                     "CUSTOMER_REVIEW_CHANGED", "Continue the same following-edition review in this directory.")
            if review["state"] == "READY":
                _require(_hash_file(directory / "comparison.json") == review["comparison_file"],
                         "CUSTOMER_COMPARISON_CHANGED", "The retained complete comparison file changed.")
                return review
        else:
            current = next((p for p in status["publications"] if p["id"] == status["selection"]["publicationId"]), None)
            _require(current is not None, "CUSTOMER_CURRENT_EDITION", "Select the original current publication before reviewing its following edition.")
            after = next((c for c in status["captures"] if c["hash"] == after_capture), None)
            _require(after is not None, "CUSTOMER_FOLLOWING_SOURCE", "Choose a complete source edition retained in this workspace.")
            candidate = None
            if following_publication is not None:
                candidate = next((p for p in status["publications"] if p["id"] == following_publication), None)
                _require(candidate is not None and candidate["state"] == "PUBLISHED" and candidate["captureHash"] == after_capture,
                         "CUSTOMER_FOLLOWING_PUBLICATION", "Choose the fully published local edition made from the following source.")
            review = {"schema": "stellar-forge.datagouv-customer-adoption.v1", **binding, "created_at": _now(),
                      "state": "COMPARING", "selection": status["selection"], "before_capture": current["captureHash"],
                      "current_publication": current, "following_source": after, "candidate": candidate}
            _save_json(path, review)
        result = client.compare(review["before_capture"], after_capture, keys, request_file=directory / "requests" / "comparison.json")
        full = client.comparison(result["id"])
        comparison_path = directory / "comparison.json"
        if comparison_path.exists():
            _require(_read_json(comparison_path) == full, "CUSTOMER_COMPARISON_CHANGED",
                     "The existing complete customer comparison differs from the original source comparison.")
        else:
            _save_json(comparison_path, full)
        review.update(state="READY", comparison_id=result["id"], summary=full["summary"],
                      change_count=full["changeCount"], comparison_file=_hash_file(comparison_path), completed_at=_now())
        _save_json(path, review, replace=True)
        return review


def apply_adoption(client, directory, *, action, reviewer, note):
    """Record accept, keep, or withdraw through the retained native comparison."""
    directory = Path(directory).absolute()
    review = _read_json(directory / "review.json")
    _require(review.get("schema") == "stellar-forge.datagouv-customer-adoption.v1" and review.get("state") == "READY",
             "CUSTOMER_REVIEW_INCOMPLETE", "Complete the original following-edition comparison first.")
    _require(client.status()["workspace"]["id"] == review["workspace_id"] and
             _hash_file(directory / "comparison.json") == review["comparison_file"],
             "CUSTOMER_REVIEW_CHANGED", "Use the original workspace and retained complete comparison.")
    if action == "accept":
        _require(review["following_publication"] is not None, "CUSTOMER_FOLLOWING_PUBLICATION",
                 "Select the published following edition in the original adoption review.")
    return client.decide(review["comparison_id"], action, expected_revision=review["selection"]["revision"],
                         reviewer=reviewer, note=note, publication_id=review["following_publication"] if action == "accept" else None,
                         request_file=directory / "requests" / "decision.json")


def _download_publication(directory, supplied):
    if supplied is not None:
        return supplied
    path = Path(directory) / "query.json"
    if path.is_file():
        state = _read_json(path)
        if state.get("schema") == "stellar-forge.datagouv-customer-query.v1" and isinstance(state.get("edition"), dict):
            return state["edition"].get("publication_id")
    return None


def _download_query(directory, supplied, *, default="limit=250"):
    if supplied is not None:
        return supplied
    path = Path(directory) / "query.json"
    if path.is_file():
        state = _read_json(path)
        if state.get("schema") == "stellar-forge.datagouv-customer-query.v1":
            return state["query"]
    return default


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", action="version", version=__version__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name, help_text in (
        ("native-describe", "Open the installed original dataset and show its immutable edition and field types."),
        ("native-page", "Read one original page, including its exact nextCursor."),
        ("native-download", "Receive every original query page, continuing an existing saved output."),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("--node", default=os.environ.get("DATACTIVIST_NODE", "node"))
        command.add_argument("--handler", required=True, help="Installed original sf30-seller-sdk/dataset-handler.mjs.")
        command.add_argument("--config", required=True, help="Saved stellar-forge.csv-dataset.v1 edition config.")
        command.add_argument("--adapter", help="Installed native_dataset.mjs; defaults beside this client.")
        command.add_argument("--timeout", type=float, default=60)
        if name != "native-describe":
            command.add_argument("--query", default=None if name == "native-download" else "", help="Original scalar URL query; omitted downloads continue the saved query.")
        if name == "native-download":
            command.add_argument("--out", required=True, help="New customer query directory or this same saved query.")
            command.add_argument("--workspace-id", help="Original publisher workspace ID, when opened from a retained workspace.")
    profile = commands.add_parser("profile", help="Inspect every saved row without changing native types.")
    profile.add_argument("--directory", required=True)
    values = commands.add_parser("values", help="List all distinct original values and their full counts.")
    values.add_argument("--directory", required=True)
    values.add_argument("--field", required=True)
    csv_command = commands.add_parser("csv", help="Export all rows of a completed original query as UTF-8 CSV.")
    csv_command.add_argument("--directory", required=True)
    csv_command.add_argument("--out", required=True)
    for name, help_text in (
        ("status", "Open the actual local workspace status and saved editions."),
        ("page", "Read one original published dataset page."),
        ("download", "Receive all pages of one original published edition."),
        ("history", "Read the full original operation history."),
        ("source", "Show the retained source metadata and a selected original row page."),
        ("comparison", "Receive every change in one original edition comparison."),
        ("file", "Download one complete original source or publication file."),
        ("archive", "Export the full original workspace and installed source."),
        ("review-adoption", "Save the complete following-source comparison and current selection."),
        ("adopt", "Record accept, keep, or withdraw using a saved complete comparison."),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("--url", required=True, help="Original displayed loopback publisher URL.")
        command.add_argument("--timeout", type=float, default=60)
        if name in ("page", "download"):
            command.add_argument("--publication", help="Original publication ID; download resumes its saved edition automatically.")
            command.add_argument("--query", default="limit=250" if name == "page" else None)
        if name in ("download", "file", "archive"):
            command.add_argument("--out", required=True)
        if name == "source":
            command.add_argument("--capture", required=True)
            command.add_argument("--offset", type=int, default=0)
            command.add_argument("--limit", type=int, default=250)
        if name == "comparison":
            command.add_argument("--comparison", required=True)
        if name == "file":
            command.add_argument("--kind", choices=("original", "manifest", "comparison", "csv", "config", "candidate"), required=True)
            command.add_argument("--id", required=True)
        if name in ("review-adoption", "adopt"):
            command.add_argument("--directory", required=True)
        if name == "review-adoption":
            command.add_argument("--after-capture", required=True)
            command.add_argument("--key", action="append", required=True, help="Repeat for a composite original source key.")
            command.add_argument("--following-publication", help="Published local edition to make available for accept.")
        if name == "adopt":
            command.add_argument("--action", choices=("accept", "keep", "withdraw"), required=True)
            command.add_argument("--reviewer", required=True)
            command.add_argument("--note", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command.startswith("native-"):
            with NativeDatasetSession(node=args.node, handler=args.handler, config=args.config,
                                      adapter=args.adapter, timeout=args.timeout) as client:
                if args.command == "native-describe":
                    result = client.describe()
                elif args.command == "native-page":
                    result = client.page(args.query)
                else:
                    result = client.download(args.out, args.query, workspace_id=args.workspace_id)
        elif args.command == "profile":
            result = profile_query(args.directory)
        elif args.command == "values":
            result = value_counts(args.directory, args.field)
        elif args.command == "csv":
            result = export_csv(args.directory, args.out)
        else:
            client = DatactivistClient(args.url, timeout=args.timeout)
            if args.command == "status":
                result = client.status()
            elif args.command == "page":
                result = client.dataset(args.publication).page(args.query)
            elif args.command == "download":
                publication = _download_publication(args.out, args.publication)
                result = client.dataset(publication).download(args.out, args.query)
            elif args.command == "history":
                result = {"rows": list(client.history())}
            elif args.command == "source":
                result = client.source_page(args.capture, offset=args.offset, limit=args.limit)
            elif args.command == "comparison":
                result = client.comparison(args.comparison)
            elif args.command == "file":
                result = client.download_file(args.kind, args.id, args.out)
            elif args.command == "archive":
                result = client.archive(args.out)
            elif args.command == "review-adoption":
                result = prepare_adoption(client, args.directory, after_capture=args.after_capture,
                                          keys=args.key, following_publication=args.following_publication)
            else:
                result = apply_adoption(client, args.directory, action=args.action, reviewer=args.reviewer, note=args.note)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2))
        return 0
    except CustomerError as error:
        print(json.dumps(error.as_dict(), ensure_ascii=False), file=sys.stderr)
        return 2
    except (OSError, ValueError) as error:
        print(json.dumps({"error": "CUSTOMER_INPUT", "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
