"""MIT. Complete administrative review, exact decimal outputs and edition comparison."""
from __future__ import annotations

import _bootstrap
from collections import Counter
from decimal import Decimal, InvalidOperation, localcontext
import hashlib
import os
from pathlib import Path
import sqlite3

from workspace import InputError, json_bytes, load_json, private_write, file_digest
from humanitarian_source import identifier, text, hxl_tag, RESERVED
from humanitarian_reference import reference_index, alias_index, resolve, ancestors

SCHEMA = "stellar-forge.humanitarian-report.v1"
MAX_REPORT = 2 * 1024 * 1024 * 1024
MAX_LAYOUTS = 2
GENERATED = {
    "source_row": "integer", "edition_id": "string", "period": "string",
    "reference_id": "string", "row_status": "string", "admin_code": "string",
    "admin_name": "string", "admin_level": "integer", "admin_parent": "string",
    **{f"adm{n}_{part}": "string" for n in range(6) for part in ("code", "name")}}
NUMERIC = {"integer", "number", "decimal"}


def fields_for(plan):
    result = [{"name": s["name"], "type": s["type"], "label": s["label"],
               "hxl": s["hxl"], "unit": s["unit"]} for s in plan["selectors"]]
    tags = {"admin_code": "", "admin_name": "", "period": "#date"}
    for name, kind in GENERATED.items():
        tag = ("#" + name.split("_")[0] + ("+code" if name.endswith("_code") else "+name")
               if name.startswith("adm") and name[3:4].isdigit() else tags.get(name, ""))
        result.append({"name": name, "type": kind, "label": name.replace("_", " "),
                       "hxl": tag, "unit": ""})
    return result


def validate_outputs(raw, fields):
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_LAYOUTS:
        raise InputError("Choose one or two complete reporting layouts")
    known = {f["name"]: f for f in fields}
    results, output_ids = [], set()
    for layout in raw:
        allowed = {"id", "title", "groupBy", "measures", "columns", "where"}
        if not isinstance(layout, dict) or set(layout) - allowed:
            raise InputError("Output layout contains an unknown field")
        ident = identifier(layout.get("id"), "Output ID")
        if ident in output_ids:
            raise InputError("Output IDs must be unique")
        output_ids.add(ident)
        groups = layout.get("groupBy", [])
        if not isinstance(groups, list) or len(groups) > 12 or any(not isinstance(g, str) or g not in known for g in groups) or len(set(groups)) != len(groups):
            raise InputError("Output grouping requires distinct selected or administrative fields")
        raw_measures = layout.get("measures", [])
        if not isinstance(raw_measures, list) or len(raw_measures) > 16:
            raise InputError("An output supports at most sixteen named measures")
        measures, measure_ids = [], set()
        for measure in raw_measures:
            if not isinstance(measure, dict) or set(measure) - {"name", "op", "field", "label", "hxl"}:
                raise InputError("Measure contains an unknown field")
            name = identifier(measure.get("name"), "Measure name")
            if name in known or name in measure_ids:
                raise InputError("A measure must have its own unambiguous field name")
            measure_ids.add(name)
            op, field = measure.get("op"), measure.get("field")
            if op not in {"sum", "count", "count-distinct", "min", "max"}:
                raise InputError("Use sum, count, count-distinct, min or max")
            if field not in known and not (op == "count" and field is None):
                raise InputError("Measure field must be a selected or administrative field")
            if op in {"sum", "min", "max"} and known[field]["type"] not in NUMERIC:
                raise InputError("Numeric measures require a column explicitly mapped as integer, number or decimal")
            measures.append({"name": name, "op": op, "field": field,
                             "label": text(measure.get("label", name), "Measure label", 160),
                             "hxl": hxl_tag(measure.get("hxl", ""))})
        aggregate = bool(groups or measures)
        if groups and not measures:
            raise InputError("Grouped reporting requires a named measure")
        available = ({g: known[g] for g in groups} | {
            m["name"]: {"name": m["name"], "label": m["label"], "hxl": m["hxl"],
                        "type": "integer" if m["op"].startswith("count") else "decimal", "unit": ""}
            for m in measures}) if aggregate else known
        columns = layout.get("columns")
        if not isinstance(columns, list) or not 1 <= len(columns) <= 64:
            raise InputError("Choose one to sixty-four output columns in their required order")
        selected, used = [], set()
        for column in columns:
            if not isinstance(column, dict) or set(column) - {"field", "label", "hxl", "type"} or column.get("field") not in available:
                raise InputError("Output column must select an available field")
            field = column["field"]
            if "type" in column and column["type"] != available[field]["type"]:
                raise InputError("Saved output column type differs from its selected field")
            if field in used:
                raise InputError("Each output field may appear once")
            used.add(field)
            selected.append({"field": field,
                             "label": text(column.get("label", available[field]["label"]), "Output column label", 160),
                             "hxl": hxl_tag(column.get("hxl", available[field].get("hxl", ""))),
                             "type": available[field]["type"]})
        raw_where = layout.get("where", [])
        if not isinstance(raw_where, list) or len(raw_where) > 16:
            raise InputError("An output supports at most sixteen equality filters")
        where = []
        for condition in raw_where:
            if not isinstance(condition, dict) or set(condition) != {"field", "equals"} or condition["field"] not in known:
                raise InputError("An output filter requires field and equals")
            value = condition["equals"]
            if not (value is None or type(value) in (str, bool, int, float)):
                raise InputError("An output filter requires a scalar value")
            if isinstance(value, str):
                text(value, "Filter value", 2000, empty=True)
            json_bytes(value)
            where.append({"field": condition["field"], "equals": value})
        results.append({"id": ident, "title": text(layout.get("title"), "Output title", 160),
                        "groupBy": groups, "measures": measures, "columns": selected, "where": where})
    return results


def decimal_text(value):
    if value is None:
        return None
    if not value.is_finite():
        raise InputError("Numeric aggregation produced a non-finite result")
    if value == 0:
        return "0"
    with localcontext() as ctx:
        ctx.prec = 800
        return format(value.normalize(), "f")


class _DecimalSum:
    def __init__(self):
        self.value = None

    def step(self, value):
        if value is None or value == "":
            return
        try:
            with localcontext() as ctx:
                ctx.prec = 800
                number = Decimal(str(value))
                if not number.is_finite():
                    raise InputError("Numeric output contains a non-finite value")
                self.value = number if self.value is None else self.value + number
        except InvalidOperation as e:
            raise InputError("Numeric output contains an invalid decimal") from e

    def finalize(self):
        return decimal_text(self.value)


class _DecimalMin(_DecimalSum):
    def step(self, value):
        if value is not None and value != "":
            number = Decimal(str(value))
            self.value = number if self.value is None else min(self.value, number)


class _DecimalMax(_DecimalSum):
    def step(self, value):
        if value is not None and value != "":
            number = Decimal(str(value))
            self.value = number if self.value is None else max(self.value, number)


def expression(field):
    identifier(field, "Reporting field")
    return "json_extract(values_json, '$.\"" + field + "\"')"


def _layout(db, edition, layout, coverage):
    terms, params = ["edition=?", "valid=1"], [edition]
    for condition in layout["where"]:
        terms.append(expression(condition["field"]) + (" IS NULL" if condition["equals"] is None else " = ?"))
        if condition["equals"] is not None:
            params.append(condition["equals"])
    where = " WHERE " + " AND ".join(terms)
    count = db.execute("SELECT COUNT(*) FROM rows" + where, params).fetchone()[0]
    output_count = 0
    logical = hashlib.sha256()
    if layout["measures"]:
        selects = [(expression(f), f) for f in layout["groupBy"]]
        for measure in layout["measures"]:
            op, field = measure["op"], measure["field"]
            cell = expression(field) if field is not None else None
            if op == "count":
                sql = "COUNT(*)" if cell is None else "COUNT(NULLIF(" + cell + ",''))"
            elif op == "count-distinct":
                sql = "COUNT(DISTINCT NULLIF(" + cell + ",''))"
            else:
                sql = {"sum": "DSUM", "min": "DMIN", "max": "DMAX"}[op] + "(" + cell + ")"
            selects.append((sql, measure["name"]))
        statement = "SELECT " + ",".join(sql + ' AS "' + name + '"' for sql, name in selects) + " FROM rows" + where
        if layout["groupBy"]:
            expressions = ",".join(expression(f) for f in layout["groupBy"])
            statement += " GROUP BY " + expressions + " ORDER BY " + expressions
        iterator = (dict(zip([name for _, name in selects], row)) for row in db.execute(statement, params))
    else:
        iterator = (load_json(row[0]) for row in db.execute("SELECT values_json FROM rows" + where + " ORDER BY source_row", params))
    for record in iterator:
        values = [record.get(column["field"]) for column in layout["columns"]]
        output_count += 1
        encoded = json_bytes(values)
        logical.update(encoded)
        db.execute("INSERT INTO layout_rows VALUES(?,?,?,?)", (edition, layout["id"], output_count, encoded.decode()))
    return {"edition": edition, "output": layout["id"], "title": layout["title"],
            "rows": output_count, "columns": layout["columns"], "matchedRows": count,
            "coverage": coverage, "definition": layout, "logicalSha256": logical.hexdigest()}


def _issue(code, message, **extra):
    return {"code": code, "message": message, "severity": "error"} | extra


def _comparison(db, editions, mappings):
    if len(editions) != 2:
        return {"enabled": False, "counts": {}, "fields": [], "logicalSha256": hashlib.sha256(b"").hexdigest()}
    left_fields = {f["name"] for f in mappings[0]["fields"]}
    right_fields = {f["name"] for f in mappings[1]["fields"]}
    omitted = {"source_row", "edition_id", "period", "reference_id", "row_status"}
    fields = sorted((left_fields | right_fields) - omitted)
    counts = {"added": 0, "removed": 0, "changed": 0, "unchanged": 0,
              "excludedBefore": db.execute("SELECT COUNT(*) FROM rows WHERE edition=0 AND valid=0").fetchone()[0],
              "excludedAfter": db.execute("SELECT COUNT(*) FROM rows WHERE edition=1 AND valid=0").fetchone()[0]}
    logical = hashlib.sha256()
    cursor = db.execute("""
        SELECT a.k,a.source_row,a.values_json,b.source_row,b.values_json
        FROM rows a LEFT JOIN rows b ON b.edition=1 AND b.valid=1 AND a.k=b.k
        WHERE a.edition=0 AND a.valid=1
        UNION ALL
        SELECT b.k,NULL,NULL,b.source_row,b.values_json
        FROM rows b LEFT JOIN rows a ON a.edition=0 AND a.valid=1 AND a.k=b.k
        WHERE b.edition=1 AND b.valid=1 AND a.source_row IS NULL
        ORDER BY 1
    """)
    ordinal = 0
    for key, before_row, before_raw, after_row, after_raw in cursor:
        before = load_json(before_raw) if before_raw is not None else None
        after = load_json(after_raw) if after_raw is not None else None
        if before is None:
            kind, differences = "added", []
        elif after is None:
            kind, differences = "removed", []
        else:
            differences = [{"field": f, "before": before.get(f), "after": after.get(f),
                            "beforePresent": f in before, "afterPresent": f in after}
                           for f in fields if (f in before) != (f in after) or before.get(f) != after.get(f)]
            kind = "changed" if differences else "unchanged"
        counts[kind] += 1
        if kind == "unchanged":
            continue
        ordinal += 1
        change = {"kind": kind, "key": load_json(key), "beforeRow": before_row, "afterRow": after_row,
                  "before": before, "after": after, "changes": differences}
        encoded = json_bytes(change)
        logical.update(encoded)
        db.execute("INSERT INTO changes VALUES(?,?,?)", (ordinal, kind, encoded.decode()))
    return {"enabled": True, "counts": counts, "fields": fields,
            "addedFields": sorted(right_fields - left_fields), "removedFields": sorted(left_fields - right_fields),
            "keyFields": mappings[0]["keyFields"], "logicalSha256": logical.hexdigest()}


def compile_report(ws, definition, revision, reference, mappings, decisions, destination):
    """Build every row and output; native builds precede derived reporting."""
    destination = Path(destination)
    destination.mkdir(mode=0o700, exist_ok=False)
    path = destination / "rows.sqlite"
    private_write(path, b"")
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.create_aggregate("DSUM", 1, _DecimalSum)
    db.create_aggregate("DMIN", 1, _DecimalMin)
    db.create_aggregate("DMAX", 1, _DecimalMax)
    db.executescript("""
        PRAGMA journal_mode=OFF;
        PRAGMA temp_store=FILE;
        CREATE TABLE rows(edition INTEGER NOT NULL,source_row INTEGER NOT NULL,k TEXT,
            valid INTEGER NOT NULL,values_json TEXT NOT NULL,resolution_json TEXT NOT NULL,issues_json TEXT NOT NULL,
            PRIMARY KEY(edition,source_row));
        CREATE INDEX row_keys ON rows(edition,k);
        CREATE INDEX row_valid ON rows(edition,valid,source_row);
        CREATE TABLE layout_rows(edition INTEGER NOT NULL,output TEXT NOT NULL,ordinal INTEGER NOT NULL,values_json TEXT NOT NULL,
            PRIMARY KEY(edition,output,ordinal));
        CREATE TABLE changes(ordinal INTEGER PRIMARY KEY,kind TEXT NOT NULL,body TEXT NOT NULL);
    """)
    index, reviewed = reference_index(reference), alias_index(reference, decisions)
    edition_results, issues_counter = [], Counter()
    logical_rows = hashlib.sha256()
    try:
        for edition_number, (edition, mapping) in enumerate(zip(definition["editions"], mappings)):
            native = ws.build(edition["source"], mapping["plan"])
            build_path = ws._build_path(native["id"], "rows.sqlite")
            source = sqlite3.connect(build_path.as_uri() + "?mode=ro", uri=True)
            try:
                plan = ws.plan(mapping["plan"])
                names = [c["name"] for c in plan["columns"]]
                for ordinal, encoded in source.execute("SELECT ordinal,values_json FROM rows ORDER BY ordinal"):
                    values = dict(zip(names, load_json(encoded)))
                    admin = mapping["admin"]
                    resolved = resolve(index, reviewed, admin["level"],
                                       values.get(admin["codeField"]) if admin["codeField"] else "",
                                       values.get(admin["nameField"]) if admin["nameField"] else "",
                                       values.get(admin["scopeCodeField"]) if admin["scopeCodeField"] else None)
                    issues = []
                    values.update({name: None for name in GENERATED if name != "source_row"})
                    values.update({"edition_id": str(edition_number), "period": edition["period"],
                                   "reference_id": reference["id"]})
                    if resolved["status"] == "matched":
                        node = index["codes"][resolved["code"]]
                        values.update({"admin_code": node["code"], "admin_name": node["name"],
                                       "admin_level": node["level"], "admin_parent": node["parent"]})
                        for level, ancestor in ancestors(index, node["code"]).items():
                            values[f"adm{level}_code"], values[f"adm{level}_name"] = ancestor["code"], ancestor["name"]
                        if resolved.get("nameDifference"):
                            issues.append({"code": "SOURCE_NAME_VARIANT", "message": "The exact selected code resolves this row; the original name is retained",
                                           "severity": "information"})
                    else:
                        issues.append(_issue(resolved["issue"], resolved["message"], candidates=resolved["candidates"]))
                    key = [values.get(field) for field in mapping["keyFields"]]
                    missing = any(value is None or value == "" for value in key)
                    if missing:
                        issues.append(_issue("MISSING_KEY", "Every selected business-key field requires a value",
                                             fields=mapping["keyFields"]))
                    valid = not any(i["severity"] == "error" for i in issues)
                    values["row_status"] = "valid" if valid else "needs-review"
                    db.execute("INSERT INTO rows VALUES(?,?,?,?,?,?,?)",
                               (edition_number, ordinal, None if missing else json_bytes(key).decode(),
                                int(valid), json_bytes(values).decode(), json_bytes(resolved).decode(), json_bytes(issues).decode()))
            finally:
                source.close()
            duplicates = list(db.execute("SELECT k,COUNT(*) FROM rows WHERE edition=? AND k IS NOT NULL GROUP BY k HAVING COUNT(*)>1", (edition_number,)))
            for key, duplicate_count in duplicates:
                duplicated = db.execute("SELECT source_row,values_json,issues_json FROM rows WHERE edition=? AND k=? ORDER BY source_row", (edition_number, key))
                for row in duplicated:
                    values, issues = load_json(row["values_json"]), load_json(row["issues_json"])
                    values["row_status"] = "needs-review"
                    issues.append(_issue("DUPLICATE_KEY", "The selected business key identifies more than one original row",
                                         duplicateCount=duplicate_count, key=load_json(key)))
                    db.execute("UPDATE rows SET valid=0,values_json=?,issues_json=? WHERE edition=? AND source_row=?",
                               (json_bytes(values).decode(), json_bytes(issues).decode(), edition_number, row["source_row"]))
            total, valid = db.execute("SELECT COUNT(*),COALESCE(SUM(valid),0) FROM rows WHERE edition=?", (edition_number,)).fetchone()
            coverage = {"totalRows": total, "includedRows": valid, "excludedRows": total - valid,
                        "complete": total == valid, "rowPolicy": definition["rowPolicy"]}
            edition_results.append({"id": edition_number, "source": edition["source"], "mapping": mapping["id"],
                                    "build": native["id"], "label": edition["label"], "period": edition["period"],
                                    "counts": coverage, "duplicateKeys": len(duplicates)})
        db.commit()
        for row in db.execute("SELECT edition,source_row,k,valid,values_json,resolution_json,issues_json FROM rows ORDER BY edition,source_row"):
            encoded = json_bytes({"edition": row["edition"], "source_row": row["source_row"],
                                  "key": load_json(row["k"]) if row["k"] is not None else None, "valid": bool(row["valid"]),
                                  "values": load_json(row["values_json"]), "resolution": load_json(row["resolution_json"]),
                                  "issues": load_json(row["issues_json"])})
            logical_rows.update(encoded)
            for issue in load_json(row["issues_json"]):
                issues_counter[issue["code"]] += 1
        outputs = []
        for number, mapping in enumerate(mappings):
            for layout in mapping["outputs"]:
                outputs.append(_layout(db, number, layout, edition_results[number]["counts"]))
        comparison = _comparison(db, edition_results, mappings)
        db.commit()
        db.execute("VACUUM")
    finally:
        db.close()
    if path.stat().st_size > MAX_REPORT:
        raise InputError("The complete reporting database exceeds two GiB")
    counts = {key: sum(e["counts"][key] for e in edition_results)
              for key in ("totalRows", "includedRows", "excludedRows")}
    status = "ready" if counts["excludedRows"] == 0 else ("partial" if definition["rowPolicy"] == "valid-rows" else "needs-review")
    body = {"schema": SCHEMA, "review": definition["id"], "revision": revision, "status": status,
            "reference": reference["id"], "counts": counts, "editions": edition_results, "outputs": outputs,
            "comparison": comparison, "issues": dict(sorted(issues_counter.items())),
            "definition": definition, "logicalSha256": logical_rows.hexdigest()}
    ident = hashlib.sha256(json_bytes(body)).hexdigest()
    body.update({"id": ident, "files": {"rows.sqlite": {"bytes": path.stat().st_size,
                                                     "sha256": file_digest(path, MAX_REPORT)}}})
    private_write(destination / "report.json", json_bytes(body))
    return body


def report_identity(body):
    return hashlib.sha256(json_bytes({k: v for k, v in body.items() if k not in {"id", "files"}})).hexdigest()


def row_page(path, review, revision, edition=0, offset=0, limit=50, issues=False):
    if type(edition) is not int or not 0 <= edition <= 1:
        raise InputError("Edition must be zero or one")
    if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 1000:
        raise InputError("Rows require a nonnegative offset and a limit from one to one thousand")
    db = sqlite3.connect(Path(path).as_uri() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    try:
        where = "edition=?" + (" AND issues_json!='[]\n'" if issues else "")
        total = db.execute("SELECT COUNT(*) FROM rows WHERE " + where, (edition,)).fetchone()[0]
        result = []
        for row in db.execute("SELECT * FROM rows WHERE " + where + " ORDER BY source_row LIMIT ? OFFSET ?", (edition, limit, offset)):
            result.append({"source_row": row["source_row"], "key": load_json(row["k"]) if row["k"] is not None else None,
                           "values": load_json(row["values_json"]), "resolution": load_json(row["resolution_json"]),
                           "issues": load_json(row["issues_json"])})
        return {"schema": "stellar-forge.humanitarian-rows.v1", "review": review, "revision": revision,
                "edition": edition, "offset": offset, "limit": limit, "total": total, "rows": result}
    finally:
        db.close()
