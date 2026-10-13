"""Original source editions, stable keys, and exact source-change comparison."""
import io
from copy import deepcopy
from urllib.parse import urljoin

from govhub import GovHubError, digest, instant, json_bytes, packed, text
from .tabular import CsvSource, csv_options

MISSING = object()


def at(value, path):
    """Literal top-level field or RFC 6901 JSON pointer; never guess dot notation."""
    if not isinstance(path, str):
        return MISSING
    if isinstance(value, dict) and path in value:
        return value[path]
    if path == "":
        return value
    if not path.startswith("/"):
        return MISSING
    result = value
    for token in path[1:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        if isinstance(result, dict):
            result = result.get(token, MISSING)
        elif isinstance(result, list) and token.isdecimal() and int(token) < len(result):
            result = result[int(token)]
        else:
            return MISSING
    return result


def issue(code, message, **context):
    return dict(code=code, message=message, **context)


def keys_for(row, fields, encoding="string"):
    values = []
    for field in fields:
        value = at(row, field)
        if isinstance(value, int) and not isinstance(value, bool) and encoding == "decimal":
            value = str(value)
        if not isinstance(value, str) or not value or any(ord(c) < 32 for c in value):
            raise GovHubError("SOURCE_KEY", "Each source key must be a nonempty exact string. Select decimal encoding explicitly for original integer keys.", fields={field: "Supply the original string key or select decimal integer encoding."})
        values.append(value)
    return values


def parse_edition(descriptor, originals):
    """Retain every selected source row, including actionable duplicate-key rows."""
    format_ = descriptor.get("format", "JSON").upper()
    if format_ not in {"CSV", "JSON", "JSON_API"}:
        raise GovHubError("CONTENT_FORMAT", "Select CSV, JSON, or original JSON:API pages.")
    keys = descriptor.get("record_keys", [])
    if not isinstance(keys, list) or not keys or len(set(keys)) != len(keys) or any(not isinstance(k, str) or not k for k in keys):
        raise GovHubError("CONTENT_KEYS", "Select the original unique key fields in their original order.")
    encoding = descriptor.get("key_encoding", "string")
    if encoding not in {"string", "decimal"}:
        raise GovHubError("CONTENT_KEYS", "Choose string or explicit decimal integer source keys.")
    if not originals:
        raise GovHubError("CONTENT_SOURCE", "Select the original source file or all original source pages.")
    rows, problems, fields, seen = [], [], set(), {}
    selected_csv = csv_options(descriptor) if format_ == "CSV" else None
    csv_headers = []
    for page_index, original in enumerate(originals):
        file, content = original["file"], original["bytes"]
        request_url = original.get("request_url", "")
        if format_ == "CSV":
            try:
                source_rows = CsvSource(io.StringIO(content.decode("utf-8-sig"), newline=""), selected_csv)
            except UnicodeError as exc:
                raise GovHubError("CONTENT_CSV", "Read the complete UTF-8 CSV source: " + str(exc)) from exc
            csv_headers.append({"file_id": file["id"], "file_sha256": file["sha256"], "headers": source_rows.headers, "header_line_end": source_rows.header_line_end})
        else:
            source = json_bytes(content)
            source_rows = at(source, descriptor.get("records_pointer", "/data" if format_ == "JSON_API" else ""))
            if not isinstance(source_rows, list):
                raise GovHubError("CONTENT_ROWS", "The selected JSON pointer must identify the original complete row array.")
            if format_ == "JSON_API":
                links = source.get("links", {}) if isinstance(source, dict) else {}
                next_url = links.get("next") if isinstance(links, dict) else None
                if isinstance(next_url, dict):
                    next_url = next_url.get("href")
                actual_next = urljoin(request_url, next_url) if isinstance(next_url, str) and next_url else None
                supplied_next = originals[page_index + 1].get("request_url") if page_index + 1 < len(originals) else None
                if actual_next != (supplied_next or None):
                    problems.append(issue("PAGE_SEQUENCE", "Retain the next original JSON:API page at its exact request URL, or end at the native terminal page.", file_id=file["id"], next_url=actual_next, supplied_next=supplied_next))
        for ordinal, source_row in enumerate(source_rows, 1):
            value = source_row["data"] if format_ == "CSV" else source_row
            if not isinstance(value, dict):
                raise GovHubError("CONTENT_ROW", "Each selected record must be an original JSON object or CSV row.")
            fields.update(value)
            entry = {"row": len(rows) + 1, "file_id": file["id"], "file_sha256": file["sha256"], "source_row": ordinal, "data": deepcopy(value), "row_sha256": digest(packed(value))}
            if format_ == "CSV":
                entry.update(source_line_start=source_row["source_line_start"], source_line_end=source_row["source_line_end"])
            try:
                entry["keys"] = keys_for(value, keys, encoding)
                identity = packed(entry["keys"])
                if identity in seen:
                    problems.append(issue("DUPLICATE_SOURCE_KEY", "This source key occurs more than once in the selected edition.", keys=entry["keys"], rows=[seen[identity], entry["row"]]))
                else:
                    seen[identity] = entry["row"]
            except GovHubError as exc:
                entry["keys"] = []
                problems.append(issue(exc.code, exc.message, row=entry["row"], fields=exc.fields))
            rows.append(entry)
    expected = descriptor.get("expected_records")
    if expected is not None and (isinstance(expected, bool) or not isinstance(expected, int) or expected < 0):
        raise GovHubError("CONTENT_COUNT", "The source's declared record count must be a nonnegative integer.")
    if expected is not None and expected != len(rows):
        problems.append(issue("SOURCE_COUNT", "The retained source count differs from the supplied original declaration.", expected=expected, retained=len(rows)))
    result = {"source_id": text(descriptor.get("source_id", ""), 240, True), "label": text(descriptor.get("label", ""), 500, True), "observed_at": instant(descriptor.get("observed_at", ""), True), "format": format_, "record_keys": keys, "key_encoding": encoding, "records_pointer": descriptor.get("records_pointer", ""), "source_url": text(descriptor.get("source_url", ""), 4000), "source_owner": text(descriptor.get("source_owner", ""), 500), "license_reference": text(descriptor.get("license_reference", ""), 4000), "retention_instruction": text(descriptor.get("retention_instruction", ""), 8000), "files": [{**item["file"], "request_url": item.get("request_url", "")} for item in originals], "rows": rows, "row_count": len(rows), "fields": sorted(fields), "issues": problems, "source_sha256": digest(packed([{k: r[k] for k in ("keys", "row_sha256")} for r in rows]))}
    if format_ == "CSV":
        result.update(csv_options=selected_csv, csv_headers=csv_headers)
    return result


def compare_editions(before, after):
    if before["source_id"] != after["source_id"] or before["record_keys"] != after["record_keys"]:
        raise GovHubError("CONTENT_COMPARISON", "Compare editions of the same original feed and key fields.")
    def index(edition):
        result = {}
        for row in edition["rows"]:
            key = packed(row["keys"])
            if not row["keys"] or key in result:
                raise GovHubError("CONTENT_COMPARISON", "Resolve missing or duplicate keys before comparing this edition.")
            result[key] = row
        return result
    a, b = index(before), index(after)
    changed, unchanged = [], []
    for identity in sorted(set(a) & set(b)):
        old, new = a[identity], b[identity]
        if old["row_sha256"] == new["row_sha256"]:
            unchanged.append(new["keys"])
        else:
            names = sorted(set(old["data"]) | set(new["data"]))
            changed.append({"keys": new["keys"], "before": old, "after": new, "fields": [{"field": name, "before_present": name in old["data"], "after_present": name in new["data"], "before": old["data"].get(name), "after": new["data"].get(name)} for name in names if (name in old["data"], old["data"].get(name)) != (name in new["data"], new["data"].get(name))]})
    return {"before_id": before["id"], "after_id": after["id"], "source_id": before["source_id"], "added": [b[k] for k in sorted(set(b) - set(a))], "removed": [a[k] for k in sorted(set(a) - set(b))], "changed": changed, "unchanged": unchanged}
