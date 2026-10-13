"""Complete native static-output manifest and comparison contracts."""
from pathlib import PurePosixPath
from urllib.parse import urlsplit
import hashlib
import json
import re

BUILD_SCHEMA = "govhub.tome-static-build.v1"
EDITION_SCHEMA = "govhub.static-edition.v1"
MAX_FILES = 250000
MAX_MANIFEST_BYTES = 64 * 1024 * 1024
SHA = re.compile(r"^[0-9a-f]{64}$")
MAX_EXACT_INTEGER = 2**53 - 1


def error(code, message, status=422):
    from govhub import GovHubError
    raise GovHubError(code, message, status)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def relative(value):
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > 4096:
        error("STATIC_PATH", "Use a complete ordinary relative output path within 4,096 UTF-8 bytes.")
    if "\\" in value or any(ord(c) < 32 or ord(c) == 127 for c in value):
        error("STATIC_PATH", "Output paths cannot contain backslashes or control characters.")
    parts = value.split("/")
    if any(part in ("", ".", "..") for part in parts) or str(PurePosixPath(value)) != value or value.startswith("/"):
        error("STATIC_PATH", "Keep each original file path relative to its complete output root.")
    return value


def file_rows(rows):
    if not isinstance(rows, list) or not rows or len(rows) > MAX_FILES:
        error("STATIC_FILES", "A complete edition contains 1–250,000 original output files.")
    result, seen, total = [], set(), 0
    for row in rows:
        if not isinstance(row, dict):
            error("STATIC_FILE", "Each output row must name its original path, bytes, and SHA-256.")
        path = relative(row.get("path"))
        count, digest = row.get("bytes"), row.get("sha256")
        if isinstance(count, bool) or not isinstance(count, int) or not 0 <= count <= MAX_EXACT_INTEGER:
            error("STATIC_FILE_BYTES", "Keep the exact nonnegative original byte count.")
        if not isinstance(digest, str) or not SHA.fullmatch(digest):
            error("STATIC_FILE_HASH", "Keep the complete lowercase SHA-256 for every output file.")
        if path in seen:
            error("STATIC_FILE_DUPLICATE", "The complete edition repeats output path " + path + ".")
        seen.add(path)
        total += count
        result.append({"path": path, "bytes": count, "sha256": digest})
    if total > MAX_EXACT_INTEGER:
        error("STATIC_TOTAL_BYTES", "The total output size exceeds the supported exact byte count.")
    for path in seen:
        parts = path.split("/")
        if any("/".join(parts[:index]) in seen for index in range(1, len(parts))):
            error("STATIC_PATH_COLLISION", "One output file is also used as another file's directory.")
    return sorted(result, key=lambda row: row["path"])


def validate_report(report):
    if not isinstance(report, dict) or report.get("schema") != BUILD_SCHEMA:
        error("STATIC_BUILD_SCHEMA", "Select the original govhub.tome-static-build.v1 native report.")
    if report.get("complete") is not True or not isinstance(report.get("errors"), list) or report["errors"]:
        error("STATIC_BUILD_INCOMPLETE", "The original build must declare its complete output and an empty collected error list.", 409)
    uri = report.get("production_uri")
    if not isinstance(uri, str):
        error("STATIC_PRODUCTION_URI", "Retain the native build's actual production URI.")
    parsed = urlsplit(uri)
    if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        error("STATIC_PRODUCTION_URI", "Retain the actual HTTP(S) production URI without credentials or a fragment.")
    generator = report.get("generator")
    if not isinstance(generator, dict) or generator.get("package") != "drupal/tome":
        error("STATIC_GENERATOR", "The completed native build must identify its original drupal/tome generator.")
    if not isinstance(generator.get("version"), str) or not generator["version"].strip() or not SHA.fullmatch(str(generator.get("source_sha256", ""))):
        error("STATIC_GENERATOR_IDENTITY", "Retain the exact installed Tome version and generator source SHA-256.")
    inputs = report.get("inputs")
    if not isinstance(inputs, list):
        error("STATIC_BUILD_INPUTS", "Retain the native report's original input descriptors.")
    files = file_rows(report.get("files"))
    return {"production_uri": uri, "generator": generator, "inputs": inputs,
            "files": files, "file_count": len(files), "total_bytes": sum(r["bytes"] for r in files),
            "files_sha256": sha(canonical(files))}


def compare_rows(before, after):
    left, right = {r["path"]: r for r in before}, {r["path"]: r for r in after}
    rows, counts = [], {key: 0 for key in ("added", "removed", "changed", "unchanged")}
    for path in sorted(left.keys() | right.keys()):
        a, b = left.get(path), right.get(path)
        status = "added" if a is None else "removed" if b is None else "unchanged" if (a["sha256"], a["bytes"]) == (b["sha256"], b["bytes"]) else "changed"
        counts[status] += 1
        identity = {"path": path, "status": status, "before": a, "after": b}
        rows.append(dict(identity, change_id=sha(canonical(identity))))
    return {"schema": "govhub.static-comparison.v1", "counts": counts, "rows": rows,
            "sha256": sha(canonical(rows))}


def page(rows, payload):
    def integer(value, default, maximum):
        if value is None:
            return default
        if isinstance(value, str) and value.isdigit():
            value = int(value)
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
            error("STATIC_PAGE", "Use an ordinary nonnegative page offset and a page size through 1,000.")
        return value
    offset = integer(payload.get("offset"), 0, MAX_EXACT_INTEGER)
    limit = integer(payload.get("limit"), 100, 1000)
    if not limit:
        error("STATIC_PAGE", "Choose at least one row per page.")
    query = payload.get("query", "")
    status = payload.get("status", "all")
    if not isinstance(query, str) or len(query.encode("utf-8")) > 2000:
        error("STATIC_QUERY", "Use a path search within 2,000 UTF-8 bytes.")
    if status not in ("all", "added", "removed", "changed", "unchanged"):
        error("STATIC_FILTER", "Choose an original change category.")
    needle = query.casefold()
    selected = [r for r in rows if needle in r["path"].casefold() and (status == "all" or r.get("status") == status)]
    end = min(offset + limit, len(selected))
    return {"rows": selected[offset:end], "total": len(selected), "offset": offset, "limit": limit,
            "next_offset": end if end < len(selected) else None}
