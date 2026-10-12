"""Explicit survey-table mappings and one streamed original-source projection."""
from __future__ import annotations
from collections import Counter
from decimal import Decimal
import hashlib
import re

from model import StudyError, clone, decimal, encoded, fail, hash_id, identity, integer, text
from .. import model as property_model
from .source import Rows, options, workbook_reader, MAX_ROWS

SCHEMA = "stellar-forge.property-onboarding-plan.v1"
PROJECTION = "stellar-forge.property-onboarding-projection.v1"
ROW = "stellar-forge.property-onboarding-row.v1"

PROPERTY_FIELDS = {
    **{k: "text" for k in ("key", "name", "address", "city", "state", "postal_code", "target_population",
        "status", "status_kind", "market_area_membership", "quality", "neighborhood", "observation_label",
        "waitlist_raw", "waitlist_note", "parking", "notes")},
    **{k: "integer" for k in ("year_built", "year_renovated", "unit_count", "vacant_units")},
    "occupancy_pct_reported": "decimal", "observation_start": "date", "observation_end": "date",
    "programs": "strings", "amenities": "strings", "citations": "json", "original_fields": "json",
    "source_notes": "json", "units": "json", "waitlist": "json", "parking": "json",
}
UNIT_FIELDS = {
    **{k: "text" for k in ("property_key", "key", "style", "rent_raw", "rent_basis", "rent_period",
                           "currency", "ami_raw", "utility_note")},
    **{k: "decimal" for k in ("bedrooms", "bathrooms", "sqft_min", "sqft_max", "rent_min", "rent_max", "ami_percent")},
    "unit_count": "integer", "vacant_units": "integer", "utilities_owner": "strings",
    "utilities_tenant": "strings", "citations": "json", "original_fields": "json",
}
COMPARABLE_FIELDS = {"purpose": "text", "property_key": "text", "selected": "boolean",
                     "reason": "text", "citations": "json", "original_fields": "json"}
FIELDS = {"properties": PROPERTY_FIELDS, "units": UNIT_FIELDS, "comparables": COMPARABLE_FIELDS}
REQUIRED = {"properties": ("key", "name"), "units": ("property_key", "key"),
            "comparables": ("purpose", "property_key", "selected", "reason")}
TYPES = ("text", "decimal", "integer", "date", "boolean", "strings", "json")


def field_catalog():
    return {"schema": SCHEMA, "fields": clone(FIELDS), "required": clone(REQUIRED),
            "types": list(TYPES), "limits": {"tables": 64, "source_bytes": 64 * 1024 * 1024,
            "rows_per_table": MAX_ROWS, "properties": 10000, "schedules_per_property": 2000},
            "comparison": "Omitted properties enter the original removed-record review; prior editions remain retained."}


def specification(value, field, expected_type):
    if not isinstance(value, dict):
        fail("PROPERTY_COLUMN_MAPPING_REQUIRED", field=field)
    value = clone(value)
    allowed = {"column", "constant", "type", "trim", "null_values", "nullable", "lookup",
               "separator", "strings_format", "formula", "date", "decimal_mark", "group_mark"}
    if set(value) - allowed or ("column" in value) == ("constant" in value):
        fail("PROPERTY_COLUMN_MAPPING_FIELDS", field=field)
    kind = value.get("type", expected_type)
    if kind not in TYPES or expected_type != "json" and kind != expected_type:
        fail("PROPERTY_COLUMN_TYPE", field=field, expected=expected_type)
    result = {"type": kind, "trim": value.get("trim", False), "nullable": value.get("nullable", True),
              "null_values": value.get("null_values", [""]), "lookup": value.get("lookup", []),
              "formula": value.get("formula", "reject")}
    if type(result["trim"]) is not bool or type(result["nullable"]) is not bool:
        fail("PROPERTY_COLUMN_BOOLEAN_OPTION", field=field)
    if (not isinstance(result["null_values"], list) or len(result["null_values"]) > 100 or
            any(not isinstance(x, str) for x in result["null_values"])):
        fail("PROPERTY_NULL_TOKENS", field=field)
    if result["formula"] not in ("reject", "cached", "text"):
        fail("PROPERTY_FORMULA_POLICY", field=field)
    if "column" in value:
        result["column"] = integer(value["column"], "column", 1, 16384)
    else:
        result["constant"] = value["constant"]
    if not isinstance(result["lookup"], list) or len(result["lookup"]) > 10000:
        fail("PROPERTY_VALUE_LOOKUP", field=field)
    seen = set()
    for item in result["lookup"]:
        if not isinstance(item, dict) or set(item) != {"from", "to"} or not isinstance(item["from"], str) or item["from"] in seen:
            fail("PROPERTY_VALUE_LOOKUP", field=field)
        seen.add(item["from"])
    if kind == "strings":
        result["strings_format"] = value.get("strings_format", "split")
        if result["strings_format"] not in ("split", "json"):
            fail("PROPERTY_ARRAY_MAPPING", field=field)
        result["separator"] = value.get("separator", ";")
        text(result["separator"], "separator", maximum=10)
    if kind == "date":
        result["date"] = value.get("date", "iso")
        if result["date"] not in ("iso", "excel"):
            fail("PROPERTY_DATE_MAPPING", field=field)
    if kind in ("decimal", "integer"):
        result["decimal_mark"] = value.get("decimal_mark", ".")
        result["group_mark"] = value.get("group_mark")
        if result["decimal_mark"] not in (".", ",") or result["group_mark"] not in (None, ".", ",", " ", "\u00a0", "'"):
            fail("PROPERTY_NUMBER_FORMAT", field=field)
        if result["decimal_mark"] == result["group_mark"]:
            fail("PROPERTY_NUMBER_FORMAT", field=field)
    return result


def normalize(value):
    value = clone(value)
    allowed = {"schema", "name", "study", "document_ids", "previous_id", "omitted_records", "tables", "note"}
    if not isinstance(value, dict) or len(encoded(value)) > 3 * 1024 * 1024 or set(value) - allowed or value.get("schema") != SCHEMA:
        fail("PROPERTY_ONBOARDING_PLAN_REQUIRED")
    result = {"schema": SCHEMA, "name": text(value.get("name"), "name", maximum=1000),
              "study": property_model.study(value.get("study")), "document_ids": value.get("document_ids", {}),
              "previous_id": hash_id(value["previous_id"]) if value.get("previous_id") else None,
              "omitted_records": value.get("omitted_records", "review_removed"),
              "note": text(value.get("note", ""), "note", empty=True, maximum=16000), "tables": []}
    if result["omitted_records"] != "review_removed":
        fail("PROPERTY_OMITTED_RECORD_POLICY", supported="review_removed")
    if not isinstance(result["document_ids"], dict) or len(result["document_ids"]) > 1000:
        fail("PROPERTY_DOCUMENT_BINDINGS_REQUIRED")
    for key, did in result["document_ids"].items():
        property_model.key(key, "document_key")
        hash_id(did)
    if not isinstance(value.get("tables"), list) or not 1 <= len(value["tables"]) <= 64:
        fail("PROPERTY_TABLES_REQUIRED")
    seen = set()
    for item in value["tables"]:
        if not isinstance(item, dict) or set(item) - {"key", "kind", "document_id", "reader", "fields", "hidden", "selection"}:
            fail("PROPERTY_TABLE_FIELDS")
        key = property_model.key(item.get("key"), "table_key")
        kind = item.get("kind")
        if key in seen or kind not in FIELDS:
            fail("PROPERTY_TABLE_IDENTITY")
        seen.add(key)
        table = {"key": key, "kind": kind, "document_id": hash_id(item.get("document_id")),
                 "reader": options(item.get("reader")), "hidden": item.get("hidden", "exclude"), "fields": {}}
        if table["reader"]["kind"] == "xlsx" and not table["reader"]["sheet"]:
            fail("PROPERTY_WORKSHEET_SELECTION_REQUIRED", table=key)
        if table["hidden"] not in ("include", "exclude"):
            fail("PROPERTY_HIDDEN_ROW_POLICY")
        raw_selection = clone(item.get("selection", {"mode": "all", "rows": [], "exclude": []}))
        if not isinstance(raw_selection, dict) or set(raw_selection) - {"mode", "rows", "exclude"}:
            fail("PROPERTY_ROW_SELECTION")
        table["selection"] = {"mode": raw_selection.get("mode", "all"),
                              "rows": raw_selection.get("rows", []), "exclude": raw_selection.get("exclude", [])}
        selection = table["selection"]
        if (selection["mode"] not in ("all", "only") or not isinstance(selection["rows"], list) or
                len(selection["rows"]) > MAX_ROWS or len(selection["rows"]) != len(set(selection["rows"]))):
            fail("PROPERTY_ROW_SELECTION")
        for row in selection["rows"]:
            integer(row, "selected row", 1, 1048576)
        if selection["mode"] == "only" and not selection["rows"]:
            fail("PROPERTY_SELECTED_ROWS_REQUIRED")
        if not isinstance(selection["exclude"], list) or len(selection["exclude"]) > MAX_ROWS:
            fail("PROPERTY_ROW_EXCLUSIONS")
        exclusions = set()
        for row in selection["exclude"]:
            if not isinstance(row, dict) or set(row) != {"row", "reason"}:
                fail("PROPERTY_ROW_EXCLUSIONS")
            integer(row["row"], "excluded row", 1, 1048576)
            text(row["reason"], "exclusion reason", maximum=2000)
            if row["row"] in exclusions:
                fail("PROPERTY_DUPLICATE_ROW_EXCLUSION")
            exclusions.add(row["row"])
        fields = item.get("fields")
        if not isinstance(fields, dict) or not set(REQUIRED[kind]) <= set(fields) or len(fields) > 200:
            fail("PROPERTY_REQUIRED_MAPPINGS", table=key, fields=list(REQUIRED[kind]))
        for field, binding in fields.items():
            expected = FIELDS[kind].get(field)
            if expected is None and re.fullmatch(r"original_fields\.[A-Za-z0-9_-]{1,100}", field):
                expected = "json"
            if expected is None:
                fail("PROPERTY_UNKNOWN_MAPPING_FIELD", table=key, field=field)
            table["fields"][field] = specification(binding, field, expected)
        result["tables"].append(table)
    if not any(t["kind"] == "properties" for t in result["tables"]):
        fail("PROPERTY_PROPERTIES_TABLE_REQUIRED")
    return result


def converted(cell, spec, field, epoch=None):
    value = clone(spec["constant"]) if "constant" in spec else cell.get("value")
    trace = {"source": clone(cell) if "constant" not in spec else {"constant": clone(value)},
             "mapping": spec, "steps": []}
    if "constant" not in spec and cell.get("formula") is not None:
        policy = spec["formula"]
        if policy == "reject":
            fail("PROPERTY_FORMULA_REVIEW_REQUIRED", field=field)
        if policy == "text":
            raw = cell["formula"].get("text")
            if raw is None:
                fail("PROPERTY_FORMULA_TEXT_UNAVAILABLE", field=field)
            value = "=" + raw
        elif not cell.get("cachedPresent"):
            fail("PROPERTY_FORMULA_CACHE_MISSING", field=field)
        trace["steps"].append({"formula_policy": policy})
    if "constant" not in spec and cell.get("type") == "error":
        fail("PROPERTY_EXCEL_ERROR", field=field, value=value)
    if isinstance(value, str) and spec["trim"]:
        previous, value = value, value.strip()
        trace["steps"].append({"trim": {"before": previous, "after": value}})
    for replacement in spec["lookup"]:
        if isinstance(value, str) and value == replacement["from"]:
            trace["steps"].append({"lookup": clone(replacement)})
            value = clone(replacement["to"])
            break
    if value is None or isinstance(value, str) and value in spec["null_values"]:
        if not spec["nullable"]:
            fail("PROPERTY_REQUIRED_MAPPED_VALUE", field=field)
        trace["value"] = None
        trace["value_json"] = "null"
        return None, trace
    kind = spec["type"]
    if kind in ("decimal", "integer"):
        if isinstance(value, bool) or not isinstance(value, (str, int)):
            fail("PROPERTY_NUMERIC_TOKEN_REQUIRED", field=field)
        token = str(value)
        group, mark = spec["group_mark"], spec["decimal_mark"]
        if group is not None and group in token:
            pattern = r"[+-]?[0-9]{1,3}(?:" + re.escape(group) + r"[0-9]{3})+(?:" + re.escape(mark) + r"[0-9]+)?"
            if not re.fullmatch(pattern, token):
                fail("PROPERTY_DIGIT_GROUPING_INVALID", field=field, token=token)
            token = token.replace(group, "")
        if mark != ".":
            if "." in token:
                fail("PROPERTY_DECIMAL_MARK_INVALID", field=field)
            token = token.replace(mark, ".")
        if not re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]{1,3})?", token):
            fail("PROPERTY_NUMERIC_TOKEN_REQUIRED", field=field, token=token)
        value = decimal(token, field, nullable=False)
        if kind == "integer":
            number = Decimal(value)
            if number != number.to_integral_value():
                fail("PROPERTY_INTEGER_VALUE_REQUIRED", field=field)
            value = int(number)
    elif kind == "text":
        if not isinstance(value, str):
            fail("PROPERTY_TEXT_TOKEN_REQUIRED", field=field)
        text(value, field, empty=True, maximum=1024 * 1024)
    elif kind == "date":
        if spec["date"] == "excel":
            if epoch is None or "constant" in spec:
                fail("PROPERTY_WORKBOOK_DATE_REQUIRED", field=field)
            try:
                value = workbook_reader().date_value(value, cell["type"], epoch, "iso-date")
            except workbook_reader().WorkbookError as error:
                fail(error.code, field=field, message=str(error))
        else:
            value = property_model.date_value(value, field)
    elif kind == "boolean":
        if type(value) is bool:
            pass
        elif value in ("true", "false"):
            value = value == "true"
        else:
            fail("PROPERTY_BOOLEAN_MAPPING_REQUIRED", field=field)
    elif kind in ("json", "strings"):
        if kind == "strings" and isinstance(value, str) and spec["strings_format"] == "split":
            value = value.split(spec["separator"])
            if spec["trim"]:
                value = [x.strip() for x in value]
        elif isinstance(value, str):
            from model import parse
            value = parse(value.encode("utf-8"))
        if kind == "strings" and (not isinstance(value, list) or any(not isinstance(x, str) for x in value)):
            fail("PROPERTY_STRING_ARRAY_REQUIRED", field=field)
    trace["value"] = clone(value)
    trace["value_json"] = encoded(value).decode("utf-8")
    return value, trace


def assign(target, field, value):
    if field.startswith("original_fields."):
        target.setdefault("original_fields", {})[field.split(".", 1)[1]] = value
    else:
        target[field] = value


def selection_reason(table, row, chosen, excluded):
    if row["row"] in excluded:
        return excluded[row["row"]]
    if table["selection"]["mode"] == "only" and row["row"] not in chosen:
        return "Outside the explicitly selected source rows"
    if row["hidden"] and table["hidden"] == "exclude":
        return "Original hidden row excluded by the saved mapping"
    if row["blank"]:
        return "Original blank row"
    return None


def compile_plan(service, value, row_output, *, offset=0, limit=30, changes_offset=0):
    plan = normalize(value)
    offset = integer(offset, "offset", 0, MAX_ROWS * 64)
    limit = integer(limit, "limit", 1, 100)
    changes_offset = integer(changes_offset, "changes_offset", 0, 10002)
    documents = service._bindings(plan["document_ids"])
    previous = service._record("property_editions", plan["previous_id"]) if plan["previous_id"] else None
    if previous and previous["study_key"] != plan["study"]["key"]:
        fail("PROPERTY_STUDY_LINEAGE_MISMATCH")
    properties, units, comparable_rows, sources, errors, sample = {}, {}, {}, [], [], []
    stats, row_count, row_digest = Counter(), 0, hashlib.sha256()
    row_bytes, projected_bytes, global_errors = 0, 0, 0
    for table in plan["tables"]:
        chosen = set(table["selection"]["rows"])
        excluded = {x["row"]: x["reason"] for x in table["selection"]["exclude"]}
        observed = set()
        with Rows(service, table["document_id"], table["reader"]) as source:
            if plan["document_ids"].get(source.document["key"]) != table["document_id"]:
                fail("PROPERTY_TABLE_SOURCE_NOT_BOUND", table=table["key"])
            sources.append({"table_key": table["key"], "source": clone(source.metadata)})
            for field, spec in table["fields"].items():
                if "column" in spec and not source.first_column <= spec["column"] <= source.last_column:
                    fail("PROPERTY_COLUMN_OUTSIDE_SOURCE_SELECTION", table=table["key"], field=field, column=spec["column"])
            for row in source.rows():
                observed.add(row["row"])
                record = {"schema": ROW, "table_key": table["key"], "kind": table["kind"],
                          "document_id": source.document_id, "document_key": source.document["key"],
                          "source": row, "fields": {}, "projected": None}
                reason = selection_reason(table, row, chosen, excluded)
                record["state"], record["reason"] = ("excluded", reason) if reason is not None else ("included", None)
                if reason is None:
                    try:
                        projected = {}
                        by_column = {c["column_index"]: c for c in row["cells"]}
                        for field, spec in table["fields"].items():
                            cell = by_column.get(spec.get("column"), {})
                            value, trace = converted(cell, spec, field, source.metadata.get("epoch"))
                            record["fields"][field] = trace
                            assign(projected, field, value)
                        if not projected.get("citations"):
                            locator = (table["reader"].get("sheet", "CSV") + " row " + str(row["row"]) +
                                       "; columns " + str(source.first_column) + "–" + str(source.last_column))
                            projected["citations"] = [{"document_key": source.document["key"], "locator": locator}]
                        kind = table["kind"]
                        if kind == "properties":
                            normalized = property_model.property_value(projected, documents)
                            key = normalized["key"]
                            if key in properties:
                                before, after = clone(properties[key]), clone(normalized)
                                before.pop("citations"); after.pop("citations")
                                if before != after:
                                    fail("PROPERTY_REPEATED_PROPERTY_CONFLICT", property_key=key,
                                         paths=property_model.changed_paths(before, after))
                                for citation in normalized["citations"]:
                                    if citation not in properties[key]["citations"]:
                                        properties[key]["citations"].append(citation)
                                stats["repeated_property_rows"] += 1
                                record["duplicate_property"] = True
                            else:
                                properties[key] = normalized
                                if len(properties) > 10000:
                                    fail("PROPERTY_SURVEY_CAPACITY")
                            record["entity_key"] = key
                        elif kind == "units":
                            pkey = property_model.key(projected.pop("property_key", None), "property_key")
                            normalized = property_model.unit(projected, documents)
                            key = (pkey, normalized["key"])
                            if key in units:
                                fail("PROPERTY_DUPLICATE_UNIT_KEY", property_key=pkey, unit_key=normalized["key"])
                            units[key] = normalized
                            record["entity_key"] = list(key)
                        else:
                            normalized = clone(projected)
                            pkey = property_model.key(normalized.get("property_key"), "property_key")
                            purpose = text(normalized.get("purpose"), "purpose", maximum=1000)
                            if type(normalized.get("selected")) is not bool:
                                fail("PROPERTY_COMPARABLE_SELECTION_BOOLEAN")
                            text(normalized.get("reason"), "reason", maximum=16000)
                            normalized["citations"] = property_model.citations(normalized["citations"], documents)
                            key = (purpose, pkey)
                            if key in comparable_rows:
                                fail("PROPERTY_DUPLICATE_SOURCE_COMPARABLE", purpose=purpose, property_key=pkey)
                            comparable_rows[key] = normalized
                            record["entity_key"] = list(key)
                        if not (kind == "properties" and record.get("duplicate_property")):
                            projected_bytes += len(encoded(normalized))
                        if projected_bytes > 64 * 1024 * 1024:
                            fail("PROPERTY_PROJECTED_PACKET_CAPACITY", maximum_bytes=64 * 1024 * 1024)
                        record["projected"] = normalized
                    except (StudyError, ValueError, TypeError) as error:
                        if getattr(error, "code", "") in ("PROPERTY_SURVEY_CAPACITY", "PROPERTY_PROJECTED_PACKET_CAPACITY"):
                            raise
                        record["state"] = "error"
                        record["error"] = {"code": getattr(error, "code", "PROPERTY_CONVERSION_FAILED"),
                                           "details": getattr(error, "details", {"message": str(error)})}
                        if len(errors) < 100:
                            errors.append({"table_key": table["key"], "row": row["row"], **record["error"]})
                stats[record["state"]] += 1
                stats[table["kind"] + "_" + record["state"]] += 1
                raw = encoded(record) + b"\n"
                row_bytes += len(raw)
                if row_bytes > 512 * 1024 * 1024:
                    fail("PROPERTY_ROW_MAP_CAPACITY", maximum_bytes=512 * 1024 * 1024)
                row_output.write(raw)
                row_digest.update(raw)
                if offset <= row_count < offset + limit:
                    sample.append(record)
                row_count += 1
        missing = (chosen | set(excluded)) - observed
        if missing:
            fail("PROPERTY_SELECTED_ROWS_NOT_FOUND", table=table["key"], rows=sorted(missing)[:100], count=len(missing))
    for (pkey, ukey), unit in units.items():
        if pkey not in properties:
            global_errors += 1
            if len(errors) < 100:
                errors.append({"code": "PROPERTY_UNIT_PARENT_MISSING", "property_key": pkey, "unit_key": ukey})
            continue
        existing = {u["key"] for u in properties[pkey]["units"]}
        if ukey in existing:
            global_errors += 1
            if len(errors) < 100:
                errors.append({"code": "PROPERTY_DUPLICATE_UNIT_KEY", "property_key": pkey, "unit_key": ukey})
            continue
        properties[pkey]["units"].append(unit)
    packet = {"schema": property_model.SCHEMA, "study": clone(plan["study"]),
              "properties": list(properties.values()), "source_comparables": list(comparable_rows.values())}
    normalized_packet = None
    try:
        normalized_packet = property_model.intake(packet, documents)
    except StudyError as error:
        global_errors += 1
        if len(errors) < 100:
            errors.append({"code": error.code, "details": error.details})
    if normalized_packet is not None:
        packet = normalized_packet
    candidate = {"properties": packet["properties"], "study_id": identity(packet["study"]),
                 "document_ids": plan["document_ids"], "source_comparables": packet["source_comparables"],
                 "issues": {p["key"]: property_model.issues(p) for p in packet["properties"]}}
    changes = property_model.comparison_rows(candidate, previous)
    changed_counts = dict(Counter(x["kind"] for x in changes))
    before = {p["key"]: p for p in previous["properties"]} if previous else {}
    after = {p["key"]: p for p in packet["properties"]}
    preview_changes = [{**x, "before": before.get(x["key"]), "after": after.get(x["key"]),
                        "before_json": encoded(before.get(x["key"])).decode("utf-8"),
                        "after_json": encoded(after.get(x["key"])).decode("utf-8")}
                       for x in changes[changes_offset:changes_offset + limit]]
    plan_sha, rows_sha, packet_sha = identity(plan), row_digest.hexdigest(), identity(packet)
    projection = {"schema": PROJECTION, "plan_sha256": plan_sha, "row_map_sha256": rows_sha,
                  "packet_sha256": packet_sha, "sources": sources, "counts": dict(stats),
                  "rows": row_count, "row_map_bytes": row_bytes, "properties": len(properties), "unit_schedules": sum(len(x["units"]) for x in properties.values()),
                  "source_comparables": len(comparable_rows), "comparison_counts": changed_counts,
                  "errors": errors[:100], "error_count": stats["error"] + global_errors,
                  "ready": stats["error"] == 0 and global_errors == 0 and normalized_packet is not None}
    projection_sha = identity(projection)
    result = {**projection, "projection_sha256": projection_sha, "offset": offset, "limit": limit,
              "preview_rows": sample, "next_offset": offset + len(sample) if offset + len(sample) < row_count else None,
              "changes": {"total": len(changes), "offset": changes_offset, "rows": preview_changes,
                          "next_offset": changes_offset + len(preview_changes) if changes_offset + len(preview_changes) < len(changes) else None}}
    return plan, packet, projection, result
