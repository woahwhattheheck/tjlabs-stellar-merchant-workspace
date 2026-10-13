"""MIT. Complete tabular intake and explicit local HXL-compatible mappings."""
from __future__ import annotations

import _bootstrap
import csv
from decimal import Decimal, InvalidOperation
import io
import json
import math
import posixpath
import re
import unicodedata
import zipfile
from xml.etree import ElementTree as ET

from workspace import InputError, json_bytes, load_json
from xml_source import validate_plan as xml_plan, dataset_spec, typed

SCHEMA = "stellar-forge.humanitarian-table-plan.v1"
MAX_BYTES = 100 * 1024 * 1024
MAX_ROWS = 250000
MAX_COLUMNS = 256
MAX_CELL = 1048576
MAX_XML = 128 * 1024 * 1024
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
TAG = re.compile(r"#[a-z][a-z0-9_]*(?:\+[a-z][a-z0-9_]*)*\Z", re.I)
RESERVED = {"source_row", "edition_id", "period", "reference_id", "row_status",
            "admin_code", "admin_name", "admin_level", "admin_parent",
            *{f"adm{n}_{suffix}" for n in range(6) for suffix in ("code", "name")}}
csv.field_size_limit(MAX_CELL)


def text(value, label, maximum=160, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (
            not empty and not value.strip()) or any(ord(c) < 32 and c not in "\t\n\r" for c in value):
        raise InputError(f"{label} must be {'at most' if empty else '1–'}{maximum} characters")
    return value


def identifier(value, label="identifier"):
    text(value, label, 80)
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,79}", value):
        raise InputError(f"{label} must start with a letter and use letters, numbers, dot, hyphen or underscore")
    return value


def normalized_name(value):
    return " ".join(unicodedata.normalize("NFKC", str(value)).casefold().split())


def hxl_tag(value):
    if value in (None, ""):
        return ""
    if not isinstance(value, str) or len(value) > 240:
        raise InputError("HXL tags must be short strings")
    compact = re.sub(r"\s+(?=\+)|(?<=\+)\s+", "", value.strip()).lower()
    if not TAG.fullmatch(compact):
        raise InputError("Use a HXL tag such as #adm3+code or #affected+num")
    tag, *attributes = compact.split("+")
    if len(attributes) != len(set(attributes)):
        raise InputError("Each HXL attribute may appear once")
    return tag + "".join("+" + a for a in sorted(attributes))


class JsonNumber:
    """Original valid JSON numeric lexeme; conversion belongs to the explicit column type."""
    __slots__ = ("raw",)

    def __init__(self, raw):
        if len(raw) > MAX_CELL:
            raise InputError("A JSON numeric cell exceeds one million characters")
        self.raw = raw

    def __str__(self):
        return self.raw


def _table_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise InputError("Duplicate JSON field: " + key)
            result[key] = value
        return result
    def constant(_):
        raise InputError("Non-finite JSON values are not accepted")
    try:
        return json.loads(data, object_pairs_hook=pairs, parse_int=JsonNumber,
                          parse_float=JsonNumber, parse_constant=constant)
    except (UnicodeError, ValueError, json.JSONDecodeError) as error:
        raise InputError("Invalid complete UTF-8 JSON table") from error


def _json_cell(value):
    if isinstance(value, JsonNumber):
        return value.raw
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + _json_cell(v)
                              for k, v in sorted(value.items())) + "}"
    if isinstance(value, list):
        return "[" + ",".join(_json_cell(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        result = _json_cell(value)
        if len(result) > MAX_CELL:
            raise InputError("A table cell exceeds one million characters")
        return result
    if isinstance(value, float) and not math.isfinite(value):
        raise InputError("Non-finite table values are not accepted")
    result = str(value)
    if len(result) > MAX_CELL:
        raise InputError("A table cell exceeds one million characters")
    return result


def _xml(archive, name):
    try:
        info = archive.getinfo(name)
    except KeyError as e:
        raise InputError("Workbook is missing " + name) from e
    if info.file_size > MAX_XML:
        raise InputError("Workbook XML member exceeds 128 MiB")
    data = archive.read(info)
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise InputError("Workbook XML declarations must not define entities")
    try:
        return ET.fromstring(data)
    except ET.ParseError as e:
        raise InputError("Workbook XML could not be read") from e


def _workbook(archive):
    infos = archive.infolist()
    names = [i.filename for i in infos]
    if len(names) != len(set(names)) or len(names) > 2048 or sum(i.file_size for i in infos) > MAX_XML:
        raise InputError("Workbook has duplicate members or exceeds the declared size")
    for info in infos:
        if info.flag_bits & 1 or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise InputError("Encrypted or unsupported workbook members are not accepted")
    workbook = _xml(archive, "xl/workbook.xml")
    relationships = _xml(archive, "xl/_rels/workbook.xml.rels")
    links = {}
    for item in relationships:
        if item.get("TargetMode") == "External":
            continue
        target = item.get("Target", "")
        target = posixpath.normpath(target.lstrip("/") if target.startswith("/") else "xl/" + target)
        if not target.startswith("xl/") or "/../" in target:
            raise InputError("Workbook relationship leaves the workbook")
        links[item.get("Id")] = target
    sheets = []
    for item in workbook.findall(NS + "sheets/" + NS + "sheet"):
        if item.get(REL + "id") not in links:
            raise InputError("Workbook sheet has no internal relationship")
        sheets.append((item.get("name"), links[item.get(REL + "id")]))
    if not sheets or len(sheets) > 64 or len({x[0] for x in sheets}) != len(sheets):
        raise InputError("Choose a workbook with 1–64 uniquely named worksheets")
    return sheets


def format_name(stream):
    stream.seek(0)
    lead = stream.read(1024)
    stream.seek(0)
    if lead.startswith(b"PK\x03\x04"):
        return "xlsx"
    cleaned = (lead[3:] if lead.startswith(b"\xef\xbb\xbf") else lead).lstrip(b" \r\n\t")
    return "json" if cleaned.startswith((b"{", b"[")) else "csv"


def table_names(stream):
    kind = format_name(stream)
    if kind == "xlsx":
        with zipfile.ZipFile(stream) as archive:
            return [name for name, _ in _workbook(archive)]
    return ["data"]


def _json_rows(stream):
    data = stream.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise InputError("JSON source exceeds 100 MiB")
    value = _table_json(data.decode("utf-8-sig"))
    if isinstance(value, dict) and set(value) == {"columns", "rows"}:
        columns, rows = value["columns"], value["rows"]
        if (not isinstance(columns, list) or not all(isinstance(c, str) for c in columns)
                or not isinstance(rows, list)):
            raise InputError("JSON tables require complete columns and rows arrays")
    else:
        if isinstance(value, dict) and value.get("type") == "FeatureCollection":
            features = value.get("features")
            if not isinstance(features, list):
                raise InputError("GeoJSON requires its complete features array")
            values = []
            for item in features:
                if not isinstance(item, dict) or item.get("type") != "Feature" or not isinstance(item.get("properties"), dict):
                    raise InputError("GeoJSON features require property objects")
                row = dict(item["properties"])
                if "geometry" in row:
                    raise InputError("GeoJSON property geometry conflicts with the geometry field")
                row["geometry"] = item.get("geometry")
                values.append(row)
        else:
            values = value
        if not isinstance(values, list) or not values or not all(isinstance(r, dict) for r in values):
            raise InputError("JSON input must be a record array, columns/rows table or GeoJSON FeatureCollection")
        columns = list(dict.fromkeys(k for row in values for k in row))
        if not all(isinstance(c, str) for c in columns):
            raise InputError("JSON field names must be strings")
        rows = [[row.get(c) for c in columns] for row in values]
    if not 1 <= len(columns) <= MAX_COLUMNS or len(rows) > MAX_ROWS:
        raise InputError("JSON table exceeds 256 columns or 250,000 rows")
    yield 1, columns
    for number, row in enumerate(rows, 2):
        if not isinstance(row, list) or len(row) != len(columns):
            raise InputError(f"JSON record {number - 1} differs from its complete column list")
        yield number, [cell_text(v) for v in row]


def iter_table(stream, table="data"):
    """Yield original physical row numbers and cell strings without evaluating formulas."""
    kind = format_name(stream)
    if kind == "json":
        if table != "data":
            raise InputError("JSON table is named data")
        yield from _json_rows(stream)
        return
    if kind == "csv":
        if table != "data":
            raise InputError("CSV table is named data")
        wrapper = io.TextIOWrapper(stream, encoding="utf-8-sig", newline="")
        try:
            reader = csv.reader(wrapper, strict=True)
            for ordinal, row in enumerate(reader, 1):
                if len(row) > MAX_COLUMNS or ordinal > MAX_ROWS + 100:
                    raise InputError("CSV exceeds 256 columns or 250,100 physical rows")
                yield ordinal, row
        except (csv.Error, UnicodeError) as e:
            raise InputError("Use a complete UTF-8 comma-separated CSV source") from e
        finally:
            wrapper.detach()
        return
    with zipfile.ZipFile(stream) as archive:
        sheets = dict(_workbook(archive))
        if table not in sheets:
            raise InputError("Choose an existing worksheet: " + ", ".join(sheets))
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for item in _xml(archive, "xl/sharedStrings.xml").findall(NS + "si"):
                strings.append("".join(t.text or "" for t in item.iter(NS + "t")))
        sheet = _xml(archive, sheets[table])
        last = 0
        for row in sheet.findall(NS + "sheetData/" + NS + "row"):
            try:
                number = int(row.get("r", last + 1))
            except (ValueError, TypeError) as error:
                raise InputError("Workbook row number is invalid") from error
            if number <= last or number > MAX_ROWS + 100:
                raise InputError("Workbook row numbers must be ordered and within the row limit")
            last, result, used = number, [], set()
            for cell in row.findall(NS + "c"):
                ref = cell.get("r", "")
                match = re.fullmatch(r"([A-Z]+)([1-9][0-9]*)", ref)
                if not match or int(match.group(2)) != number:
                    raise InputError("Workbook cell reference differs from its row")
                index = 0
                for letter in match.group(1):
                    index = index * 26 + ord(letter) - 64
                if index > MAX_COLUMNS or index in used:
                    raise InputError("Workbook contains repeated cells or too many columns")
                used.add(index)
                while len(result) < index:
                    result.append("")
                if cell.find(NS + "f") is not None:
                    raise InputError(f"Worksheet {table}, {ref}: use a values-only source edition for formula cells")
                kind = cell.get("t", "")
                value = cell.findtext(NS + "v", "")
                if kind == "s":
                    try:
                        if not re.fullmatch(r"0|[1-9][0-9]*", value):
                            raise ValueError()
                        value = strings[int(value)]
                    except (ValueError, IndexError) as e:
                        raise InputError("Workbook shared-string index is invalid") from e
                elif kind == "inlineStr":
                    value = "".join(t.text or "" for t in cell.findall(".//" + NS + "t"))
                elif kind == "b":
                    if value not in {"0", "1"}:
                        raise InputError("Workbook boolean is invalid")
                    value = "true" if value == "1" else "false"
                elif kind == "e":
                    raise InputError(f"Worksheet {table}, {ref}: source contains an Excel error")
                result[index - 1] = cell_text(value)
            yield number, result


def inventory(stream, cancel=None):
    stream.seek(0, 2)
    size = stream.tell()
    if size > MAX_BYTES:
        raise InputError("Tabular source exceeds 100 MiB")
    stream.seek(0)
    kind = format_name(stream)
    tables = []
    for name in table_names(stream):
        preview, count, width, first = [], 0, 0, None
        for number, cells in iter_table(stream, name):
            if cancel is not None and cancel():
                raise InputError("Source inventory was cancelled")
            count += 1
            width = max(width, len(cells))
            if first is None and cells:
                first = number
            if len(preview) < 8:
                preview.append({"row": number, "cells": [c[:240] for c in cells[:64]]})
        tables.append({"name": name, "physicalRows": count, "columns": width,
                       "firstPopulatedRow": first, "preview": preview})
    return {"schema": "stellar-forge.humanitarian-table-inventory.v1",
            "format": kind, "bytes": size, "tables": tables}


def validate_plan(raw):
    if isinstance(raw, dict) and "selectors" in raw:
        selected = raw.get("selectors")
        native = raw.get("columns")
        if not isinstance(selected, list) or not isinstance(native, list) or len(native) != len(selected) + 1:
            raise InputError("Saved table mapping is incomplete")
        original = {k: raw[k] for k in ("schema", "name", "table", "headerRow", "hxlRow",
                    "expectedHeaders", "filters", "ranges", "sorts", "maxRows", "maxBytes",
                    "maxCellChars", "defaultLimit", "maxLimit", "allowEmpty") if k in raw}
        original["columns"] = []
        for column, selector in zip(native[1:], selected):
            if not isinstance(column, dict) or not isinstance(selector, dict) or column.get("name") != selector.get("name"):
                raise InputError("Saved table column and selector differ")
            original["columns"].append({k: selector[k] for k in ("name", "index", "label", "type", "hxl", "unit")}
                                       | {k: column[k] for k in ("nullable", "trim")})
        result = validate_plan(original)
        if json_bytes(result) != json_bytes(raw):
            raise InputError("Saved table mapping differs from its normalized definition")
        return result
    allowed = {"schema", "name", "table", "headerRow", "hxlRow", "expectedHeaders",
               "columns", "filters", "ranges", "sorts", "maxRows", "maxBytes",
               "maxCellChars", "defaultLimit", "maxLimit", "allowEmpty"}
    if not isinstance(raw, dict) or set(raw) - allowed or raw.get("schema") != SCHEMA:
        raise InputError("Use the complete humanitarian table mapping schema")
    table = text(raw.get("table", "data"), "Table", 128)
    header = raw.get("headerRow", 1)
    hxl = raw.get("hxlRow")
    if type(header) is not int or not 1 <= header <= 100 or hxl is not None and hxl != header + 1:
        raise InputError("Select a header row and, when present, its following HXL row")
    headers = raw.get("expectedHeaders")
    if not isinstance(headers, list) or not 1 <= len(headers) <= MAX_COLUMNS or not all(isinstance(v, str) for v in headers):
        raise InputError("Retain the complete selected header row")
    columns = raw.get("columns")
    if not isinstance(columns, list) or not 1 <= len(columns) <= 63:
        raise InputError("Select 1–63 reporting columns")
    native = [{"name": "source_row", "path": [], "type": "integer"}]
    selectors = []
    for column in columns:
        if not isinstance(column, dict) or set(column) - {"name", "index", "label", "type", "nullable", "trim", "hxl", "unit"}:
            raise InputError("Unknown mapping-column field")
        name = column.get("name")
        if not isinstance(name, str):
            raise InputError("Reporting column requires a string name")
        if name in RESERVED:
            raise InputError("Reporting column name is reserved: " + str(name))
        index = column.get("index")
        if type(index) is not int or not 0 <= index < len(headers):
            raise InputError("Select each source column by its original zero-based position")
        item = {k: column[k] for k in ("name", "type", "nullable", "trim") if k in column}
        semantic = item.get("type", "string")
        if semantic == "decimal":
            item["type"] = "string"
        native.append(item | {"path": []})
        selectors.append({"name": name, "index": index, "label": text(column.get("label", headers[index] or name), "Column label", 160),
                          "type": semantic, "hxl": hxl_tag(column.get("hxl", "")),
                          "unit": text(column.get("unit", ""), "Unit", 100, empty=True)})
    base = {"schema": "stellar-forge.xml-mapping.v1", "name": raw.get("name"),
            "recordPath": ["record"], "columns": native, "keys": ["source_row"]}
    for key in ("filters", "ranges", "sorts", "maxRows", "maxBytes", "maxCellChars", "defaultLimit", "maxLimit", "allowEmpty"):
        if key in raw:
            base[key] = raw[key]
    for key in ("maxRows", "maxBytes"):
        if key in base and (type(base[key]) is not int or base[key] < 1):
            raise InputError(key + " must be a positive integer")
    base["maxRows"] = min(base.get("maxRows", MAX_ROWS), MAX_ROWS)
    base["maxBytes"] = min(base.get("maxBytes", MAX_BYTES), MAX_BYTES)
    normalized = xml_plan(base)
    normalized.pop("recordPath")
    normalized.update({"schema": SCHEMA, "table": table, "headerRow": header,
                       "hxlRow": hxl, "expectedHeaders": headers, "selectors": selectors})
    return normalized


def extract(stream, plan, on_record, cancel=None):
    header_found, tags_found, count = False, plan["hxlRow"] is None, 0
    columns = plan["columns"][1:]
    for number, raw in iter_table(stream, plan["table"]):
        if cancel is not None and cancel():
            raise InputError("Table extraction was cancelled")
        if number < plan["headerRow"]:
            continue
        if number == plan["headerRow"]:
            if raw != plan["expectedHeaders"]:
                raise InputError("The complete selected header row changed; save the new edition mapping")
            header_found = True
            continue
        if number == plan["hxlRow"]:
            padded = raw + [""] * (len(plan["expectedHeaders"]) - len(raw))
            if len(padded) != len(plan["expectedHeaders"]) or not any(padded):
                raise InputError("The selected HXL row is incomplete")
            for value in padded:
                hxl_tag(value)
            tags_found = True
            continue
        if not header_found:
            raise InputError("The selected header row is missing")
        if not raw or all(v == "" for v in raw):
            continue
        if len(raw) > len(plan["expectedHeaders"]):
            raise InputError(f"Source row {number} has values beyond the complete header")
        cells, values = [str(number)], [number]
        for column, selector in zip(columns, plan["selectors"]):
            value = raw[selector["index"]] if selector["index"] < len(raw) else ""
            if column["trim"]:
                value = value.strip()
            actual = typed(value, column, f"Source row {number}, {column['name']}")
            if selector["type"] == "decimal" and actual is not None:
                try:
                    decimal = Decimal(actual)
                except InvalidOperation as e:
                    raise InputError(f"Source row {number}, {column['name']}: requires a finite decimal") from e
                if not decimal.is_finite() or len(decimal.as_tuple().digits) > 38 or (decimal != 0 and not -38 <= decimal.adjusted() <= 37):
                    raise InputError("Decimals must be finite, contain at most 38 significant digits, and have a magnitude between 1e-38 and 1e38")
            cells.append(value)
            values.append(actual)
        count += 1
        if count > plan["maxRows"]:
            raise InputError("Selected table exceeds its saved maxRows")
        on_record(number, cells, values)
    if not header_found or not tags_found:
        raise InputError("The selected header or HXL row is missing")
    return count
