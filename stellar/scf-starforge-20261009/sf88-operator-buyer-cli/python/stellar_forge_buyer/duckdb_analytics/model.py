"""Saved analytical workbooks over immutable editions in the original warehouse."""
from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, localcontext
import hashlib

from ..duckdb_agent import read_identity
from ..duckdb_dataset import _hex, _json, _now, _qid, _wire
from .. import duckdb_semantics
from ..storage import parse
from .contracts import (SCHEMA, NUMERIC, _ROW, compile_definition, edition_columns,
                        fail, fields, integer, label, page, request_id, sha, slug, text)

_TABLES = {"analyses": "sf_analytics_analyses", "workbooks": "sf_analytics_workbooks",
           "results": "sf_analytics_results", "comparisons": "sf_analytics_comparisons",
           "reports": "sf_analytics_reports", "operations": "sf_analytics_requests"}


def decoded(value):
    return parse(value.encode("utf-8"))


def columns_of(cursor):
    return [{"name": item[0], "type": str(item[1])} for item in cursor.description]


def fingerprint(db, table, columns):
    checksum, count = hashlib.sha256(), 0
    checksum.update((_json(columns) + "\n").encode())
    cursor = db.execute("SELECT " + ",".join(_qid(item["name"]) for item in columns)
                        + " FROM " + _qid(table) + " ORDER BY " + _qid(_ROW))
    while batch := cursor.fetchmany(1024):
        for row in batch:
            checksum.update((_json(_wire(row)) + "\n").encode("utf-8"))
            count += 1
    return {"rows": count, "sha256": checksum.hexdigest(),
            "encoding": "columns-and-ordered-native-wire-rows-jsonl-v1"}


class Analytics:
    """Borrow the original database guard, query writer, exporter and backup."""

    def __init__(self, workspace):
        self.workspace = workspace

    @staticmethod
    def _exists(db):
        row = db.execute("SELECT value FROM sf_workspace WHERE key='analytics_schema'").fetchone()
        if row and row[0] != SCHEMA:
            fail("SCHEMA_CHANGED")
        return row is not None

    @classmethod
    def _schema(cls, db):
        cls._exists(db)
        db.execute("INSERT INTO sf_workspace VALUES('analytics_schema',?) ON CONFLICT DO NOTHING", [SCHEMA])
        for kind in ("analyses", "workbooks"):
            table = _TABLES[kind]
            db.execute("CREATE TABLE IF NOT EXISTS " + table + "(id VARCHAR PRIMARY KEY,name VARCHAR UNIQUE NOT NULL,revision BIGINT NOT NULL,record VARCHAR NOT NULL,sha256 VARCHAR NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS " + table + "_history(id VARCHAR,revision BIGINT,record VARCHAR NOT NULL,sha256 VARCHAR NOT NULL,PRIMARY KEY(id,revision))")
        db.execute("CREATE TABLE IF NOT EXISTS sf_analytics_results(id VARCHAR PRIMARY KEY,analysis_id VARCHAR NOT NULL,analysis_revision BIGINT NOT NULL,edition_id VARCHAR NOT NULL,table_name VARCHAR UNIQUE NOT NULL,record VARCHAR NOT NULL,sha256 VARCHAR NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS sf_analytics_comparisons(id VARCHAR PRIMARY KEY,before_id VARCHAR NOT NULL,after_id VARCHAR NOT NULL,table_name VARCHAR UNIQUE NOT NULL,record VARCHAR NOT NULL,sha256 VARCHAR NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS sf_analytics_reports(id VARCHAR PRIMARY KEY,workbook_id VARCHAR NOT NULL,workbook_revision BIGINT NOT NULL,record VARCHAR NOT NULL,sha256 VARCHAR NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS sf_analytics_requests(id VARCHAR PRIMARY KEY,kind VARCHAR NOT NULL,body VARCHAR NOT NULL,state VARCHAR NOT NULL,record VARCHAR NOT NULL)")

    def _record(self, db, kind, identity, revision=None):
        _hex(identity)
        if kind not in _TABLES or kind == "operations":
            fail("RECORD_KIND_INVALID")
        table = _TABLES[kind]
        parameters = [identity]
        if revision is not None:
            if kind not in {"analyses", "workbooks"}:
                fail("REVISION_NOT_SUPPORTED")
            integer(revision, 1)
            table += "_history"
            parameters.append(revision)
        suffix = " AND revision=?" if revision is not None else ""
        row = db.execute("SELECT record,sha256 FROM " + table + " WHERE id=?" + suffix, parameters).fetchone()
        if row is None:
            fail("RECORD_NOT_FOUND")
        if hashlib.sha256(row[0].encode()).hexdigest() != row[1]:
            fail("RETAINED_RECORD_CHANGED")
        return decoded(row[0])

    def record(self, kind, identity, revision=None):
        with self.workspace._guard(), self.workspace._connection() as db:
            if not self._exists(db):
                fail("RECORD_NOT_FOUND")
            return self._record(db, kind, identity, revision)

    def status(self):
        with self.workspace._guard(), self.workspace._connection() as db:
            result = {"schema": SCHEMA, "workspace_id": read_identity(db)}
            exists = self._exists(db)
            for kind, table in _TABLES.items():
                result[kind] = db.execute("SELECT count(*) FROM " + table).fetchone()[0] if exists else 0
            return result

    def catalog(self, kind, *, offset=0, limit=25):
        offset, limit = page(offset, limit)
        if kind not in _TABLES:
            fail("CATALOG_INVALID")
        with self.workspace._guard(), self.workspace._connection() as db:
            total, rows = 0, []
            if self._exists(db):
                table = _TABLES[kind]
                total = db.execute("SELECT count(*) FROM " + table).fetchone()[0]
                retained = [decoded(row[0]) for row in db.execute(
                    "SELECT record FROM " + table + " ORDER BY id LIMIT ? OFFSET ?", [limit, offset]).fetchall()]
                for record in retained:
                    summary = {key: record[key] for key in ("schema", "id", "result_id", "comparison_id",
                        "report_id", "request_id", "name", "revision", "kind", "title", "created_at", "updated_at",
                        "state", "error", "analysis_id", "analysis_revision", "workbook_id", "workbook_revision",
                        "edition_id", "source_editions", "row_count", "before_id", "after_id") if key in record}
                    if isinstance(record.get("definition"), dict):
                        summary["title"] = record["definition"].get("title", record.get("name"))
                        if "edition_id" in record["definition"]:
                            summary["edition_id"] = record["definition"]["edition_id"]
                    rows.append(summary)
            return {kind: rows, "offset": offset, "limit": limit, "total": total,
                    "next_offset": offset + len(rows) if offset + len(rows) < total else None}

    def _review_on(self, db, definition, *, preview=False):
        if not isinstance(definition, dict):
            fail("DEFINITION_REQUIRED")
        edition = self.workspace._record(db, "sf_editions", _hex(definition.get("edition_id")))
        compiled = compile_definition(definition, edition)
        parameters = compiled["parameters"]
        cursor = db.execute("SELECT * FROM (" + compiled["sql"] + ") AS reviewed LIMIT 0", parameters)
        result_columns = columns_of(cursor)
        filtered = db.execute(compiled["source_count_sql"], compiled["filter_parameters"]).fetchone()[0]
        context = duckdb_semantics.query_context(db, compiled["sql"], self.workspace._views(db))
        original = duckdb_semantics.edition_context(db, edition)
        value = {"schema": SCHEMA + ".review", "workspace_id": read_identity(db),
                 "definition": compiled["definition"], "definition_sha256": compiled["definition_sha256"],
                 "edition_id": edition["edition_id"], "manifest_sha256": edition["manifest_sha256"],
                 "original_columns": edition["columns"], "source_row_count": edition["row_count"],
                 "filtered_row_count": filtered, "columns": result_columns,
                 "dimensions": compiled["dimensions"], "measures": compiled["measures"],
                 "sql": compiled["sql"], "parameters": parameters, "source_meanings": context,
                 "semantic_dictionary": original.get("document") if original else None,
                 "group_null_rule": "Null dimension values form their own native group.",
                 "empty_measure_rule": "COUNT returns zero; SUM/AVG/MIN/MAX return null when their selected group has no values."}
        value["review_sha256"] = sha(value)
        if preview:
            rows = db.execute("SELECT * FROM (" + compiled["sql"] + ") AS reviewed LIMIT 101", parameters).fetchall()
            value["preview"] = {"columns": result_columns, "rows": _wire(rows[:100]), "truncated": len(rows) > 100}
        return value, compiled

    def review(self, definition):
        fields(definition, ("name", "title", "edition_id", "dimensions", "measures"),
               ("description", "filters", "pivot", "order"))
        with self.workspace._guard(), self.workspace._connection() as db:
            db.execute("BEGIN")
            try:
                result, _ = self._review_on(db, definition, preview=True)
                db.commit()
                return result
            except BaseException:
                db.rollback()
                raise

    def source(self, edition_id, *, column=None, offset=0, limit=50):
        offset, limit = page(offset, limit)
        with self.workspace._guard(), self.workspace._connection() as db:
            edition = self.workspace._record(db, "sf_editions", _hex(edition_id))
            columns = edition_columns(edition)
            context = duckdb_semantics.edition_context(db, edition)
            if column is None:
                selected = []
                for item in edition["columns"]:
                    expression = _qid(item["name"])
                    counts = db.execute("SELECT count(*)-count(" + expression + "),count(DISTINCT "
                                        + expression + ") FROM " + _qid(edition["table"])).fetchone()
                    selected.append({**item, "null_rows": counts[0], "distinct_non_null": counts[1]})
                return {"edition": {key: edition[key] for key in ("edition_id", "sequence", "row_count", "manifest_sha256", "table")},
                        "columns": selected, "source_meanings": context}
            if column not in columns:
                fail("SOURCE_COLUMN_REQUIRED")
            expression = _qid(column)
            sql = "SELECT " + expression + " AS value,count(*) AS rows FROM " + _qid(edition["table"]) + " GROUP BY 1"
            total = db.execute("SELECT count(*) FROM (" + sql + ") AS sf_values").fetchone()[0]
            rows = db.execute(sql + " ORDER BY 1 NULLS LAST LIMIT ? OFFSET ?", [limit, offset]).fetchall()
            return {"edition_id": edition_id, "column": column, "type": columns[column]["type"],
                    "values": [{"value": _wire(value), "rows": count} for value, count in rows],
                    "offset": offset, "limit": limit, "total": total,
                    "next_offset": offset + len(rows) if offset + len(rows) < total else None}

    def _mutate(self, kind, body, action):
        body = deepcopy(body)
        if not isinstance(body, dict):
            fail("FIELDS_INVALID")
        identity = request_id(body.get("request_id"))
        expected_workspace = request_id(body.get("workspace_id"))
        with self.workspace._guard(), self.workspace._connection(writeable=True) as db:
            db.execute("BEGIN")
            record = None
            try:
                if expected_workspace != read_identity(db):
                    fail("WORKSPACE_ID_CHANGED")
                self._schema(db)
                prior = db.execute("SELECT kind,body,record FROM sf_analytics_requests WHERE id=?", [identity]).fetchone()
                if prior:
                    if prior[0] != kind or decoded(prior[1]) != body:
                        fail("ORIGINAL_REQUEST_CHANGED")
                    record = decoded(prior[2])
                    if record["state"] == "COMPLETE":
                        db.commit()
                        return record["result"]
                else:
                    record = {"request_id": identity, "kind": kind, "body": body, "created_at": _now()}
                record.update(state="RUNNING", updated_at=_now())
                record.pop("error", None)
                db.execute("INSERT INTO sf_analytics_requests VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,record=excluded.record",
                           [identity, kind, _json(body), "RUNNING", _json(record)])
                db.commit()
                db.execute("BEGIN")
                result = action(db, body)
                record.update(state="COMPLETE", result=result, updated_at=_now())
                db.execute("UPDATE sf_analytics_requests SET state='COMPLETE',record=? WHERE id=?", [_json(record), identity])
                db.commit()
                return result
            except BaseException as error:
                db.rollback()
                if record is not None:
                    record.update(state="INTERRUPTED", error=getattr(error, "code", type(error).__name__), updated_at=_now())
                    try:
                        db.execute("BEGIN")
                        db.execute("UPDATE sf_analytics_requests SET state='INTERRUPTED',record=? WHERE id=?", [_json(record), identity])
                        db.commit()
                    except BaseException:
                        db.rollback()
                raise

    def request(self, identity):
        request_id(identity)
        with self.workspace._guard(), self.workspace._connection() as db:
            if not self._exists(db):
                fail("REQUEST_NOT_FOUND")
            row = db.execute("SELECT record FROM sf_analytics_requests WHERE id=?", [identity]).fetchone()
            if row is None:
                fail("REQUEST_NOT_FOUND")
            return decoded(row[0])

    def resume(self, identity, workspace_id):
        record = self.request(identity)
        if record["body"]["workspace_id"] != request_id(workspace_id):
            fail("WORKSPACE_ID_CHANGED")
        return self.perform(record["kind"], record["body"])

    def _save(self, db, kind, definition, expected_revision, extra=None):
        name = slug(definition["name"])
        integer(expected_revision)
        identity = sha({"schema": SCHEMA, "kind": kind, "name": name.casefold(), "workspace_id": read_identity(db)})
        table = _TABLES[kind]
        prior = db.execute("SELECT revision,record FROM " + table + " WHERE id=?", [identity]).fetchone()
        revision = prior[0] if prior else 0
        if revision != expected_revision:
            fail("SAVED_REVISION_CHANGED")
        if prior:
            original = decoded(prior[1])
            if original["definition"] == definition:
                return original
        record = {"schema": SCHEMA + "." + kind, "id": identity, "name": name,
                  "revision": revision + 1, "definition": definition, "created_at": _now(), **(extra or {})}
        raw = _json(record)
        record_sha = hashlib.sha256(raw.encode()).hexdigest()
        db.execute("INSERT INTO " + table + " VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,record=excluded.record,sha256=excluded.sha256",
                   [identity, name, revision + 1, raw, record_sha])
        db.execute("INSERT INTO " + table + "_history VALUES(?,?,?,?)", [identity, revision + 1, raw, record_sha])
        return record

    def _save_analysis(self, db, body):
        fields(body, ("request_id", "workspace_id", "definition", "expected_revision", "review_sha256"))
        review, compiled = self._review_on(db, body["definition"])
        if _hex(body["review_sha256"]) != review["review_sha256"]:
            fail("REVIEW_CHANGED")
        return self._save(db, "analyses", compiled["definition"], body["expected_revision"], {"review": review})

    def _run(self, db, body):
        fields(body, ("request_id", "workspace_id", "analysis_id", "revision"))
        analysis = self._record(db, "analyses", body["analysis_id"], integer(body["revision"], 1))
        review, compiled = self._review_on(db, analysis["definition"])
        if review != analysis["review"]:
            fail("ORIGINAL_SOURCE_REVIEW_CHANGED")
        identity = sha({"schema": SCHEMA + ".result", "analysis_id": analysis["id"], "revision": analysis["revision"],
                        "review_sha256": review["review_sha256"]})
        if db.execute("SELECT 1 FROM sf_analytics_results WHERE id=?", [identity]).fetchone():
            return self._record(db, "results", identity)
        table = "sf_analytics_result_" + identity
        db.execute("CREATE TABLE " + _qid(table) + " AS " + compiled["materialize_sql"], compiled["parameters"])
        db.execute("CREATE UNIQUE INDEX " + _qid("sf_analytics_index_" + identity) + " ON " + _qid(table) + "(" + _qid(_ROW) + ")")
        columns = columns_of(db.execute("SELECT * EXCLUDE(" + _qid(_ROW) + ") FROM " + _qid(table) + " LIMIT 0"))
        actual = fingerprint(db, table, columns)
        totals_cursor = db.execute(compiled["totals_sql"], compiled["parameters"])
        totals_columns = columns_of(totals_cursor)
        totals = _wire(totals_cursor.fetchone())
        coverage = {"selected_rows": review["filtered_row_count"], "unselected_rows": 0, "groups": []}
        if compiled["pivot_conditions"]:
            selections = ["count(*) FILTER (WHERE " + item["sql"] + ")" for item in compiled["pivot_conditions"]]
            pivot_sql = "SELECT " + ",".join(selections) + " FROM (" + compiled["filter_sql"] + ") AS filtered"
            counts = db.execute(pivot_sql, compiled["parameters"]).fetchone()
            coverage = {"selected_rows": sum(counts), "unselected_rows": review["filtered_row_count"] - sum(counts),
                        "groups": [{"label": item["label"], "rows": count} for item, count in zip(compiled["pivot_conditions"], counts)]}
        sql = "SELECT " + ",".join(_qid(item["name"]) for item in columns) + " FROM " + _qid(table) + " ORDER BY " + _qid(_ROW)
        query = self.workspace._save_query_on(db, "Analysis_" + identity, sql, [], expected_revision=0)
        record = {"schema": SCHEMA + ".result", "result_id": identity, "kind": "result", "analysis_id": analysis["id"],
                  "analysis_revision": analysis["revision"], "definition": analysis["definition"], "review": review,
                  "edition_id": review["edition_id"], "source_editions": [review["edition_id"]],
                  "table": table, "columns": columns, "dimensions": compiled["dimensions"], "measures": compiled["measures"],
                  "row_count": actual["rows"], "fingerprint": actual, "query": query, "created_at": _now(),
                  "source_meanings": review["source_meanings"], "pivot_coverage": coverage,
                  "totals": {"scope": "all selected source rows, independently aggregated", "columns": totals_columns, "values": totals}}
        raw = _json(record)
        db.execute("INSERT INTO sf_analytics_results VALUES(?,?,?,?,?,?,?)",
                   [identity, analysis["id"], analysis["revision"], review["edition_id"], table, raw, hashlib.sha256(raw.encode()).hexdigest()])
        return record

    def grid(self, kind, identity, *, offset=0, limit=100):
        offset, limit = page(offset, limit)
        if kind not in {"results", "comparisons"}:
            fail("GRID_KIND_INVALID")
        with self.workspace._guard(), self.workspace._connection() as db:
            if not self._exists(db):
                fail("RECORD_NOT_FOUND")
            record = self._record(db, kind, identity)
            names = ",".join(_qid(item["name"]) for item in record["columns"])
            rows = db.execute("SELECT " + names + " FROM " + _qid(record["table"])
                              + " ORDER BY " + _qid(_ROW) + " LIMIT ? OFFSET ?", [limit, offset]).fetchall()
            total = record["row_count"]
            return {"id": identity, "kind": kind, "columns": record["columns"], "rows": _wire(rows),
                    "offset": offset, "limit": limit, "total": total,
                    "next_offset": offset + len(rows) if offset + len(rows) < total else None}

    def _compare(self, db, body):
        fields(body, ("request_id", "workspace_id", "before_id", "after_id", "keys"), ("title",))
        before = self._record(db, "results", body["before_id"])
        after = self._record(db, "results", body["after_id"])
        if before["columns"] != after["columns"]:
            fail("COMPARISON_OUTPUT_SCHEMA_CHANGED")
        columns = before["columns"]
        names = [item["name"] for item in columns]
        keys = body["keys"]
        if (not isinstance(keys, list) or len(set(keys)) != len(keys)
                or any(key not in names for key in keys) or not keys and (before["row_count"] > 1 or after["row_count"] > 1)):
            fail("COMPLETE_COMPARISON_KEYS_REQUIRED")
        for result in (before, after):
            if keys and db.execute("SELECT 1 FROM " + _qid(result["table"]) + " GROUP BY "
                    + ",".join(_qid(key) for key in keys) + " HAVING count(*)>1 LIMIT 1").fetchone():
                fail("COMPARISON_KEYS_NOT_UNIQUE")
        title = label(body.get("title", "Source edition comparison"))
        identity = sha({"schema": SCHEMA + ".comparison", "before_id": before["result_id"], "after_id": after["result_id"], "keys": keys, "title": title})
        if db.execute("SELECT 1 FROM sf_analytics_comparisons WHERE id=?", [identity]).fetchone():
            return self._record(db, "comparisons", identity)
        table = "sf_analytics_comparison_" + identity
        before_present = "b." + _qid(_ROW) + " IS NOT NULL"
        after_present = "a." + _qid(_ROW) + " IS NOT NULL"
        nonkeys = [item for item in columns if item["name"] not in keys]
        changed = " OR ".join("b." + _qid(item["name"]) + " IS DISTINCT FROM a." + _qid(item["name"]) for item in nonkeys) or "FALSE"
        status = "CASE WHEN NOT (" + before_present + ") THEN 'added' WHEN NOT (" + after_present + ") THEN 'removed' WHEN " + changed + " THEN 'changed' ELSE 'unchanged' END"
        projection = [status + ' AS "Status"']
        output_meta = [{"name": "Status", "role": "status"}]
        for key in keys:
            projection.append("coalesce(b." + _qid(key) + ",a." + _qid(key) + ") AS " + _qid("Key / " + key))
            output_meta.append({"name": "Key / " + key, "role": "key", "source_column": key})
        deltas = []
        for item in nonkeys:
            name = item["name"]
            for side, alias in (("Before", "b"), ("After", "a")):
                output = side + " / " + name
                projection.append(alias + "." + _qid(name) + " AS " + _qid(output))
                output_meta.append({"name": output, "role": side.casefold(), "source_column": name})
            if NUMERIC.fullmatch(item["type"]):
                output = "Change / " + name
                projection.append("CAST(NULL AS VARCHAR) AS " + _qid(output))
                output_meta.append({"name": output, "role": "exact_decimal_change", "source_column": name})
                deltas.append((name, output))
        condition = " AND ".join("b." + _qid(key) + " IS NOT DISTINCT FROM a." + _qid(key) for key in keys) or "TRUE"
        ordered = ",".join(_qid("Key / " + key) + " NULLS LAST" for key in keys) or "(SELECT 1)"
        joined = "SELECT " + ",".join(projection) + " FROM " + _qid(before["table"]) + " AS b FULL OUTER JOIN " + _qid(after["table"]) + " AS a ON " + condition
        db.execute("CREATE TABLE " + _qid(table) + " AS SELECT row_number() OVER(ORDER BY " + ordered + ") AS "
                   + _qid(_ROW) + ",* FROM (" + joined + ") AS compared")
        count = db.execute("SELECT count(*) FROM " + _qid(table)).fetchone()[0]
        if deltas:
            selected = [_qid(_ROW)] + [side + " / " + name for name, _ in deltas for side in ("Before", "After")]
            selected_sql = _qid(_ROW) + "," + ",".join(_qid(name) for name in selected[1:])
            update_sql = "UPDATE " + _qid(table) + " SET " + ",".join(_qid(output) + "=?" for _, output in deltas) + " WHERE " + _qid(_ROW) + "=?"
            for offset in range(0, count, 512):
                rows = db.execute("SELECT " + selected_sql + " FROM " + _qid(table) + " ORDER BY " + _qid(_ROW) + " LIMIT 512 OFFSET ?", [offset]).fetchall()
                updates = []
                for row in rows:
                    values = []
                    for index, _ in enumerate(deltas):
                        left, right = row[1 + 2 * index:3 + 2 * index]
                        if left is None or right is None:
                            values.append(None)
                        else:
                            with localcontext() as context:
                                context.prec = 4096
                                first = Decimal.from_float(left) if isinstance(left, float) else Decimal(left)
                                second = Decimal.from_float(right) if isinstance(right, float) else Decimal(right)
                                values.append(str(second - first) if first.is_finite() and second.is_finite() else None)
                    updates.append(values + [row[0]])
                if updates:
                    db.executemany(update_sql, updates)
        result_columns = columns_of(db.execute("SELECT * EXCLUDE(" + _qid(_ROW) + ") FROM " + _qid(table) + " LIMIT 0"))
        actual = fingerprint(db, table, result_columns)
        summary = dict(db.execute("SELECT Status,count(*) FROM " + _qid(table) + " GROUP BY Status").fetchall())
        query_sql = "SELECT " + ",".join(_qid(item["name"]) for item in result_columns) + " FROM " + _qid(table) + " ORDER BY " + _qid(_ROW)
        query = self.workspace._save_query_on(db, "AnalysisCompare_" + identity, query_sql, [], expected_revision=0)
        source_editions = sorted(set(before["source_editions"] + after["source_editions"]))
        before_edition = self.workspace._record(db, "sf_editions", before["edition_id"])
        after_edition = self.workspace._record(db, "sf_editions", after["edition_id"])
        meaning_change = duckdb_semantics.compare_contexts(
            duckdb_semantics.edition_context(db, before_edition), duckdb_semantics.edition_context(db, after_edition),
            before_edition["columns"], after_edition["columns"])
        record = {"schema": SCHEMA + ".comparison", "comparison_id": identity, "kind": "comparison", "title": title,
                  "before_id": before["result_id"], "after_id": after["result_id"], "keys": keys,
                  "columns": result_columns, "column_roles": output_meta, "row_count": actual["rows"], "table": table,
                  "fingerprint": actual, "query": query, "summary": summary, "source_editions": source_editions,
                  "source_meaning_change": meaning_change, "before_definition": before["definition"],
                  "after_definition": after["definition"], "created_at": _now(),
                  "change_calculation": "Exact decimal subtraction of native integer/decimal or exact binary floating values. Missing sides and null values remain null."}
        raw = _json(record)
        db.execute("INSERT INTO sf_analytics_comparisons VALUES(?,?,?,?,?,?)",
                   [identity, before["result_id"], after["result_id"], table, raw, hashlib.sha256(raw.encode()).hexdigest()])
        return record

    def _artifact(self, db, kind, identity):
        if kind not in {"result", "comparison"}:
            fail("PAGE_SOURCE_KIND_INVALID")
        return self._record(db, "results" if kind == "result" else "comparisons", identity)

    def _workbook_definition(self, db, value):
        value = deepcopy(value)
        fields(value, ("name", "title", "pages"), ("description", "author"))
        slug(value["name"])
        label(value["title"])
        value["description"] = text(value.get("description", ""), maximum=32000, blank=True)
        value["author"] = text(value.get("author", ""), maximum=200, blank=True)
        pages = value["pages"]
        if not isinstance(pages, list) or not 1 <= len(pages) <= 100:
            fail("WORKBOOK_PAGES_REQUIRED")
        for item in pages:
            fields(item, ("title", "kind"), ("text", "source_kind", "source_id", "columns", "x", "y", "chart_limit"))
            label(item["title"])
            item["text"] = text(item.get("text", ""), maximum=64000, blank=True)
            if item["kind"] == "text":
                if set(item) & {"source_kind", "source_id", "columns", "x", "y", "chart_limit"}:
                    fail("TEXT_PAGE_SOURCE_INVALID")
                continue
            if item["kind"] not in {"table", "bar", "line"}:
                fail("PAGE_KIND_INVALID")
            source = self._artifact(db, item.get("source_kind"), item.get("source_id"))
            available = {column["name"]: column for column in source["columns"]}
            selected = item.setdefault("columns", list(available))
            if (not isinstance(selected, list) or not selected or len(set(selected)) != len(selected)
                    or any(name not in available for name in selected)):
                fail("PAGE_COLUMNS_INVALID")
            if item["kind"] in {"bar", "line"}:
                if item.get("x") not in available or item["x"] not in selected:
                    fail("CHART_DIMENSION_REQUIRED")
                measures = item.get("y")
                if (not isinstance(measures, list) or not 1 <= len(measures) <= 8 or len(set(measures)) != len(measures)
                        or any(name not in selected for name in measures)):
                    fail("CHART_MEASURES_REQUIRED")
                roles = {row["name"]: row["role"] for row in source.get("column_roles", [])}
                if any(not NUMERIC.fullmatch(available[name]["type"]) and roles.get(name) != "exact_decimal_change" for name in measures):
                    fail("NUMERIC_CHART_MEASURE_REQUIRED")
                item["chart_limit"] = integer(item.get("chart_limit", 200), 1, 2000)
            elif set(item) & {"x", "y", "chart_limit"}:
                fail("TABLE_CHART_FIELDS_INVALID")
        return value

    def _save_workbook(self, db, body):
        fields(body, ("request_id", "workspace_id", "definition", "expected_revision"))
        value = self._workbook_definition(db, body["definition"])
        return self._save(db, "workbooks", value, body["expected_revision"])

    def _publish(self, db, body):
        fields(body, ("request_id", "workspace_id", "workbook_id", "revision"))
        workbook = self._record(db, "workbooks", body["workbook_id"], integer(body["revision"], 1))
        definition = self._workbook_definition(db, workbook["definition"])
        identity = sha({"schema": SCHEMA + ".report", "workbook_id": workbook["id"], "revision": workbook["revision"]})
        if db.execute("SELECT 1 FROM sf_analytics_reports WHERE id=?", [identity]).fetchone():
            return self._record(db, "reports", identity)
        sources = {}
        for item in definition["pages"]:
            if item["kind"] != "text":
                key = item["source_kind"] + ":" + item["source_id"]
                sources[key] = self._artifact(db, item["source_kind"], item["source_id"])
        record = {"schema": SCHEMA + ".report", "report_id": identity, "workbook_id": workbook["id"],
                  "workbook_revision": workbook["revision"], "definition": definition,
                  "sources": sources, "source_editions": sorted({edition for source in sources.values() for edition in source["source_editions"]}),
                  "created_at": _now(), "workspace_id": read_identity(db), "renderer": "industrial-html-svg-v1"}
        raw = _json(record)
        db.execute("INSERT INTO sf_analytics_reports VALUES(?,?,?,?,?)",
                   [identity, workbook["id"], workbook["revision"], raw, hashlib.sha256(raw.encode()).hexdigest()])
        return record

    def validate_result(self, kind, identity):
        if kind not in {"results", "comparisons"}:
            fail("RESULT_KIND_INVALID")
        with self.workspace._guard(), self.workspace._connection() as db:
            value = self._record(db, kind, identity)
            actual = fingerprint(db, value["table"], value["columns"])
            if actual != value["fingerprint"]:
                fail("RETAINED_RESULT_CHANGED")
            return {"id": identity, "rows": actual["rows"], "sha256": actual["sha256"], "matched": True}

    def perform(self, kind, body):
        actions = {"analyses": self._save_analysis, "run": self._run, "compare": self._compare,
                   "workbooks": self._save_workbook, "publish": self._publish}
        if kind not in actions:
            fail("OPERATION_INVALID")
        return self._mutate(kind, body, actions[kind])
