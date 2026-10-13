"""MIT. Streaming approved CSV/JSON editions through the original Dataset SourceFormat."""
from __future__ import annotations

from collections import Counter
import csv
import io
import json
from pathlib import Path
import re
import sys

XML_ROOT = Path(__file__).resolve().parent.parent / "xml"
if str(XML_ROOT) not in sys.path:
    sys.path.append(str(XML_ROOT))
from xml_source import InputError, dataset_spec as native_dataset_spec
from hila_questionnaire import canonical, sha, CONSENT

SCHEMA = "stellar-forge.hila-mapping.v1"
NORMALIZER = "hila-coded-responses-1"
MAX_BYTES = 100_000_000
MAX_ROWS = 100_000
MAX_COLUMNS = 512
MAX_CELL = 1_048_576
MAX_ROW = 2 * MAX_CELL
csv.field_size_limit(MAX_CELL)


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InputError("Source JSON has duplicate object keys")
        result[key] = value
    return result


def reject_constant(value):
    raise InputError("Source JSON contains a non-finite number: " + value)


def decode_json(value):
    try:
        return json.loads(value, object_pairs_hook=no_duplicates, parse_constant=reject_constant,
                          parse_float=str)
    except (ValueError, UnicodeError) as e:
        raise InputError("Invalid source JSON: " + str(e)) from e


def _flatten(row):
    if not isinstance(row, dict):
        raise InputError("Each JSON respondent must be an object")
    result = {}
    def walk(item, prefix="", depth=0):
        if depth > 16:
            raise InputError("Response nesting exceeds 16 levels")
        for key, value in item.items():
            if not isinstance(key, str) or not key or len(key) > 512 or "\x00" in key:
                raise InputError("Response field names must be nonempty bounded strings")
            path = prefix + key
            if isinstance(value, dict):
                walk(value, path + "/", depth + 1)
                continue
            if path in result:
                raise InputError("Nested and flat response fields collide: " + path)
            if isinstance(value, list):
                if len(value) > 1024 or any(isinstance(v, (dict, list)) or v is None for v in value):
                    raise InputError("Multi-select answers must be flat non-null scalar arrays")
                value = [_scalar(v) for v in value]
            else:
                value = _scalar(value)
            result[path] = value
            if len(result) > MAX_COLUMNS:
                raise InputError("Response source exceeds 512 fields")
    walk(row)
    if len(canonical(result)) > MAX_ROW:
        raise InputError("One response exceeds 2 MiB of retained normalized cells")
    return result


def _scalar(value):
    if value is None:
        return None
    if isinstance(value, str):
        text = value
    elif type(value) is bool:
        text = "true" if value else "false"
    elif type(value) is int:
        text = str(value)
    else:
        raise InputError("Response cells must be strings, exact numeric tokens, booleans, null or scalar arrays")
    if len(text) > MAX_CELL or "\x00" in text or any(0xD800 <= ord(c) <= 0xDFFF for c in text):
        raise InputError("Response cell exceeds its bound or contains an invalid Unicode scalar")
    return text


def _json_rows(text):
    decoder = json.JSONDecoder(object_pairs_hook=no_duplicates, parse_constant=reject_constant,
                               parse_float=str)
    buffer, pos, ended = "", 0, False
    def fill():
        nonlocal buffer, pos, ended
        if pos:
            buffer, pos = buffer[pos:], 0
        chunk = text.read(65536)
        if not chunk:
            ended = True
        buffer += chunk
        if len(buffer) > MAX_ROW + 65536:
            raise InputError("A JSON respondent exceeds the 2 MiB source row bound")
    def whitespace():
        nonlocal pos
        while True:
            while pos < len(buffer) and buffer[pos].isspace():
                pos += 1
            if pos < len(buffer) or ended:
                return
            fill()
    fill()
    whitespace()
    if pos >= len(buffer) or buffer[pos] != "[":
        raise InputError("JSON edition must be one complete respondent array; export Kobo CSV or JSON records")
    pos += 1
    first = True
    while True:
        whitespace()
        if pos < len(buffer) and buffer[pos] == "]":
            pos += 1
            break
        if not first:
            if pos >= len(buffer) or buffer[pos] != ",":
                raise InputError("JSON respondent array requires a comma between complete records")
            pos += 1
            whitespace()
            if pos < len(buffer) and buffer[pos] == "]":
                raise InputError("Trailing commas are not accepted in a JSON edition")
        first = False
        while True:
            try:
                value, end = decoder.raw_decode(buffer, pos)
                pos = end
                break
            except json.JSONDecodeError as e:
                if ended:
                    raise InputError("Incomplete JSON respondent array: " + str(e)) from e
                fill()
        yield _flatten(value)
    whitespace()
    if pos < len(buffer):
        raise InputError("Unexpected data after the complete JSON respondent array")


def records(stream, on_columns=None):
    try:
        stream.seek(0, 2)
        size = stream.tell()
        stream.seek(0)
        prefix = stream.read(4096)
        stream.seek(0)
    except (OSError, AttributeError) as e:
        raise InputError("Retain the complete source through the original workspace before projecting it") from e
    if not 0 < size <= MAX_BYTES:
        raise InputError("Each HILA source must contain 1–100,000,000 bytes")
    text = io.TextIOWrapper(stream, encoding="utf-8-sig", errors="strict", newline="")
    try:
        is_json = prefix.decode("utf-8-sig", errors="replace").lstrip().startswith(("[", "{"))
        if is_json:
            iterator = _json_rows(text)
        else:
            csv_reader = csv.reader(text, strict=True)
            try:
                headers = next(csv_reader)
            except StopIteration:
                raise InputError("CSV source has no header")
            if (not 1 <= len(headers) <= MAX_COLUMNS or len(set(headers)) != len(headers) or
                any(not h or len(h) > 512 or "\x00" in h for h in headers)):
                raise InputError("CSV headers must contain 1–512 unique nonempty field names")
            if on_columns is not None:
                on_columns(headers)
            def csv_rows():
                for cells in csv_reader:
                    if len(cells) != len(headers):
                        raise InputError("CSV respondent width differs from its original header")
                    yield _flatten(dict(zip(headers, cells)))
            iterator = csv_rows()
        for ordinal, row in enumerate(iterator, 1):
            if ordinal > MAX_ROWS:
                raise InputError("HILA source exceeds 100,000 respondent rows")
            yield ordinal, row
    except (UnicodeError, csv.Error) as e:
        raise InputError("Source must be a complete UTF-8 CSV or JSON edition: " + str(e)) from e
    finally:
        text.detach()


def inventory(stream):
    counts, nulls, blanks, arrays, count = Counter(), Counter(), Counter(), Counter(), 0
    def columns(names):
        for name in names:
            counts[name] += 0
    for ordinal, row in records(stream, on_columns=columns):
        count = ordinal
        for key, value in row.items():
            counts[key] += 1
            nulls[key] += value is None
            blanks[key] += value == ""
            arrays[key] += isinstance(value, list)
        if len(counts) > MAX_COLUMNS:
            raise InputError("Combined JSON source contains more than 512 fields")
    return {
        "schema": "stellar-forge.hila-source-inventory.v1", "rows": count,
        "columns": [{"name": key, "present": counts[key], "absent": count - counts[key],
                     "null": nulls[key], "blank": blanks[key], "array": arrays[key]}
                    for key in sorted(counts)],
        "normalization": "UTF-8 CSV cells or flattened JSON paths; exact numeric tokens remain strings; originals retained",
    }


def validate_plan(raw):
    allowed = {"schema", "normalizer", "name", "questionnaire", "mapping", "respondentKey",
               "columns", "filters", "ranges", "sorts", "keys", "defaultLimit",
               "maxLimit", "maxBytes", "maxRows", "maxCellChars", "allowEmpty"}
    if not isinstance(raw, dict) or set(raw) - allowed or raw.get("schema") != SCHEMA:
        raise InputError("Expected a complete HILA response mapping")
    if raw.get("normalizer") != NORMALIZER:
        raise InputError("Mapping selects an unsupported HILA normalizer")
    form_id, mapping, key = raw.get("questionnaire"), raw.get("mapping"), raw.get("respondentKey")
    if not isinstance(form_id, str) or not re.fullmatch("[0-9a-f]{64}", form_id):
        raise InputError("Mapping requires the exact original questionnaire SHA-256")
    if not isinstance(mapping, dict) or not 1 <= len(mapping) <= 256:
        raise InputError("Select 1–256 explicit original questionnaire field bindings")
    for target, header in mapping.items():
        if (not isinstance(target, str) or not isinstance(header, str) or
            not target or not header or len(target) > 512 or len(header) > 512):
            raise InputError("Mapping paths and source fields must be nonempty bounded strings")
    if len(set(mapping.values())) != len(mapping):
        raise InputError("A source field cannot silently supply two questionnaire answers")
    if CONSENT not in mapping:
        raise InputError("The original consent answer must be explicitly mapped")
    if key is not None and (not isinstance(key, str) or not key or len(key) > 512):
        raise InputError("Respondent key must be an explicit source field or null")
    name = raw.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.encode("utf-16-le")) // 2 > 128:
        raise InputError("Dataset name must contain 1–128 UTF-16 code units")
    columns = [{"name": "recordId", "type": "string", "nullable": False},
               {"name": "sourceRow", "type": "integer", "nullable": False},
               {"name": "sourceRowSha256", "type": "string", "nullable": False},
               {"name": "consent", "type": "string", "nullable": True},
               {"name": "answers", "type": "string", "nullable": False}]
    result = {
        "schema": SCHEMA, "normalizer": NORMALIZER, "name": name,
        "questionnaire": form_id, "mapping": dict(sorted(mapping.items())),
        "respondentKey": key, "columns": columns, "filters": ["recordId", "consent"],
        "ranges": ["sourceRow"], "sorts": ["sourceRow"],
        "keys": ["recordId"] if key else [], "defaultLimit": 50, "maxLimit": 1000,
        "maxBytes": 256 * 1024 * 1024, "maxRows": MAX_ROWS,
        "maxCellChars": MAX_CELL, "allowEmpty": True,
    }
    for field in allowed - {"schema", "normalizer", "name", "questionnaire", "mapping", "respondentKey"}:
        if field in raw and raw[field] != result[field]:
            raise InputError("HILA mapping native capabilities must match the original bounded projection")
    return result


def extract(stream, plan, on_record):
    count = 0
    for ordinal, row in records(stream):
        count = ordinal
        row_sha = sha(canonical(row))
        key = row.get(plan["respondentKey"]) if plan["respondentKey"] else None
        if plan["respondentKey"] and (key is None or key == "" or isinstance(key, list)):
            raise InputError("Every explicitly keyed respondent needs one nonempty scalar pseudonymous key")
        record_id = sha(canonical(["hila-respondent-key.v1", key])) if key is not None else sha(canonical(["hila-source-row.v1", ordinal, row_sha]))
        answers = {field: row[header] for field, header in plan["mapping"].items() if header in row}
        consent = answers.get(CONSENT)
        if isinstance(consent, list):
            consent = " ".join(consent)
        body = canonical(answers).decode().rstrip("\n")
        if len(body.encode("utf-16-le")) // 2 > plan["maxCellChars"]:
            raise InputError("Projected respondent answers exceed the native cell bound")
        cells = [record_id, str(ordinal), row_sha, consent or "", body]
        values = [record_id, ordinal, row_sha, consent or None, body]
        on_record(ordinal, cells, values)
    return count


def dataset_spec(plan):
    return native_dataset_spec(plan)
