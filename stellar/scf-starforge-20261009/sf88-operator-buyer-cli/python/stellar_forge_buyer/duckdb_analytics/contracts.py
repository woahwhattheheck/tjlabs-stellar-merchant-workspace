"""Reviewed dimensions, measures and filters for the original DuckDB warehouse."""
from __future__ import annotations

from copy import deepcopy
import re

from ..duckdb_dataset import _convert, _hex, _json, _qid, _wire
from ..errors import StateError
from ..storage import digest

SCHEMA = "stellar-forge.duckdb-analytics.v1"
NUMERIC = re.compile(r"^(?:U?(?:TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT)|FLOAT|DOUBLE|DECIMAL\([0-9]+,[0-9]+\))$")
GRAINS = {"day", "week", "month", "quarter", "year"}
AGGREGATES = {"count_rows", "count", "count_distinct", "sum", "avg", "min", "max"}
_ID = re.compile(r"[0-9a-f]{32}")
_SLUG = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,79}")
_ROW = "_sf_analysis_row"


def fail(code):
    raise StateError("DUCKDB_ANALYTICS_" + code)


def fields(value, required=(), optional=()):
    if not isinstance(value, dict) or set(value) - set(required) - set(optional):
        fail("FIELDS_INVALID")
    if any(key not in value for key in required):
        fail("FIELDS_REQUIRED")
    return value


def text(value, *, maximum=2000, blank=False):
    if (not isinstance(value, str) or len(value.encode("utf-8")) > maximum
            or "\x00" in value or not blank and not value.strip()):
        fail("TEXT_INVALID")
    return value


def label(value):
    value = text(value, maximum=200)
    if value.casefold().startswith("_sf_"):
        fail("COLUMN_LABEL_RESERVED")
    return value


def integer(value, minimum=0, maximum=1_000_000_000):
    if type(value) is not int or not minimum <= value <= maximum:
        fail("INTEGER_INVALID")
    return value


def flag(value):
    if type(value) is not bool:
        fail("BOOLEAN_REQUIRED")
    return value


def request_id(value):
    if not isinstance(value, str) or not _ID.fullmatch(value):
        fail("REQUEST_ID_REQUIRED")
    return value


def slug(value):
    if not isinstance(value, str) or not _SLUG.fullmatch(value):
        fail("NAME_INVALID")
    return value


def sha(value):
    return digest(_json(value).encode("utf-8"))


def page(offset=0, limit=25):
    return integer(offset), integer(limit, 1, 500)


def edition_columns(edition):
    if (not isinstance(edition, dict) or not isinstance(edition.get("columns"), list)
            or edition.get("table") != "sf_edition_" + _hex(edition.get("edition_id"))):
        fail("ORIGINAL_EDITION_REQUIRED")
    columns = {}
    for item in edition["columns"]:
        if not isinstance(item, dict) or item.get("name") in columns:
            fail("ORIGINAL_COLUMNS_CHANGED")
        columns[item["name"]] = item
    return columns


def _column(columns, value):
    if not isinstance(value, str) or value not in columns:
        fail("SOURCE_COLUMN_REQUIRED")
    return columns[value]


class _Bindings:
    def __init__(self):
        self.values = {}

    def value(self, value, column):
        # Original importer conversion retains exact integers/decimals and dates.
        # Every placeholder is explicitly cast back to the reviewed native type.
        native = _convert(value, {**column, "nullable": True})
        key = "a" + str(len(self.values))
        self.values[key] = _wire(native)
        return "CAST($" + key + " AS " + column["type"] + ")"


def compile_definition(value, edition):
    """Generate one native SELECT; bind only original immutable source columns."""
    value = deepcopy(value)
    fields(value, ("name", "title", "edition_id", "dimensions", "measures"),
           ("description", "filters", "pivot", "order"))
    slug(value["name"])
    label(value["title"])
    _hex(value["edition_id"])
    if value["edition_id"] != edition["edition_id"]:
        fail("EDITION_CHANGED")
    value["description"] = text(value.get("description", ""), maximum=16000, blank=True)
    columns = edition_columns(edition)
    dimensions = value["dimensions"]
    measures = value["measures"]
    if not isinstance(dimensions, list) or len(dimensions) > 12:
        fail("DIMENSIONS_INVALID")
    if not isinstance(measures, list) or not 1 <= len(measures) <= 32:
        fail("MEASURES_REQUIRED")
    bindings = _Bindings()
    filters = value.setdefault("filters", [])
    if not isinstance(filters, list) or len(filters) > 64:
        fail("FILTERS_INVALID")
    where = []
    for item in filters:
        fields(item, ("column", "operator"), ("value", "values", "nulls"))
        column = _column(columns, item["column"])
        expression = _qid(column["name"])
        operation = item["operator"]
        nulls = item.setdefault("nulls", "exclude")
        if nulls not in {"exclude", "include"}:
            fail("FILTER_NULL_RULE_REQUIRED")
        if operation in {"is_null", "not_null"}:
            if set(item) & {"value", "values"}:
                fail("FILTER_VALUES_INVALID")
            condition = expression + (" IS NULL" if operation == "is_null" else " IS NOT NULL")
        elif operation in {"eq", "ne", "lt", "lte", "gt", "gte"}:
            if "value" not in item or "values" in item or item["value"] is None:
                fail("FILTER_VALUE_REQUIRED")
            token = {"eq": "=", "ne": "<>", "lt": "<", "lte": "<=", "gt": ">", "gte": ">="}[operation]
            condition = expression + token + bindings.value(item["value"], column)
        elif operation in {"in", "not_in", "between"}:
            values = item.get("values")
            if ("value" in item or not isinstance(values, list) or not 1 <= len(values) <= 1000
                    or any(member is None for member in values)
                    or operation == "between" and len(values) != 2):
                fail("FILTER_VALUES_INVALID")
            parameters = [bindings.value(member, column) for member in values]
            if operation == "between":
                condition = expression + " BETWEEN " + parameters[0] + " AND " + parameters[1]
            else:
                condition = expression + (" NOT IN (" if operation == "not_in" else " IN (") + ",".join(parameters) + ")"
        else:
            fail("FILTER_OPERATOR_INVALID")
        if operation not in {"is_null", "not_null"} and nulls == "include":
            condition = "(" + condition + " OR " + expression + " IS NULL)"
        where.append("(" + condition + ")")
    filter_parameters = deepcopy(bindings.values)
    where_sql = " AND ".join(where) if where else "TRUE"
    dimension_sql, dimension_records = [], []
    for item in dimensions:
        fields(item, ("column", "name"), ("transform",))
        column = _column(columns, item["column"])
        name = label(item["name"])
        transform = item.setdefault("transform", "identity")
        expression = _qid(column["name"])
        if transform != "identity":
            if transform not in GRAINS or column["type"] not in {"DATE", "TIMESTAMP", "TIMESTAMPTZ"}:
                fail("DIMENSION_TRANSFORM_INVALID")
            if column["type"] == "TIMESTAMPTZ":
                expression = "(" + expression + " AT TIME ZONE 'UTC')"
            expression = "date_trunc('" + transform + "'," + expression + ")"
        dimension_sql.append(expression + " AS " + _qid(name))
        dimension_records.append({"name": name, "source": column["source"], "column": column["name"],
            "source_type": column["type"], "transform": transform,
            "time_basis": "UTC" if column["type"] == "TIMESTAMPTZ" and transform != "identity" else "original"})
    for item in measures:
        fields(item, ("name", "aggregate"), ("column", "nulls", "note"))
        label(item["name"])
        operation = item["aggregate"]
        if operation not in AGGREGATES:
            fail("MEASURE_AGGREGATE_INVALID")
        item["nulls"] = item.get("nulls", "exclude")
        item["note"] = text(item.get("note", ""), maximum=4000, blank=True)
        if operation == "count_rows":
            if "column" in item or item["nulls"] != "exclude":
                fail("ROW_COUNT_MEASURE_INVALID")
        else:
            column = _column(columns, item.get("column"))
            if operation in {"sum", "avg"} and not NUMERIC.fullmatch(column["type"]):
                fail("NUMERIC_MEASURE_REQUIRED")
            if item["nulls"] not in {"exclude", "zero"}:
                fail("MEASURE_NULL_RULE_REQUIRED")
            if item["nulls"] == "zero" and operation not in {"sum", "avg"}:
                fail("ZERO_RULE_REQUIRES_NUMERIC_SUM_OR_AVERAGE")
    pivot = value.get("pivot")
    pivots = [(None, None)]
    if pivot is not None:
        fields(pivot, ("column", "values"), ("include_null", "include_other", "null_label", "other_label"))
        column = _column(columns, pivot["column"])
        if not isinstance(pivot["values"], list) or len(pivot["values"]) > 64:
            fail("PIVOT_VALUES_INVALID")
        pivot["include_null"] = flag(pivot.get("include_null", False))
        pivot["include_other"] = flag(pivot.get("include_other", False))
        pivot["null_label"] = label(pivot.get("null_label", "Null"))
        pivot["other_label"] = label(pivot.get("other_label", "Other"))
        expression = _qid(column["name"])
        pivots, seen_values, seen_labels, selected = [], set(), set(), []
        for item in pivot["values"]:
            fields(item, ("value", "label"))
            item_label = label(item["label"])
            if item["value"] is None:
                fail("USE_PIVOT_NULL_SELECTION")
            normalized = _wire(_convert(item["value"], {**column, "nullable": True}))
            key = _json(normalized)
            if key in seen_values or item_label.casefold() in seen_labels:
                fail("DUPLICATE_PIVOT_SELECTION")
            seen_values.add(key)
            seen_labels.add(item_label.casefold())
            bound = bindings.value(item["value"], column)
            selected.append(bound)
            pivots.append((item_label, expression + " IS NOT DISTINCT FROM " + bound))
        if pivot["include_null"]:
            if pivot["null_label"].casefold() in seen_labels:
                fail("DUPLICATE_PIVOT_LABEL")
            seen_labels.add(pivot["null_label"].casefold())
            pivots.append((pivot["null_label"], expression + " IS NULL"))
        if pivot["include_other"]:
            if pivot["other_label"].casefold() in seen_labels:
                fail("DUPLICATE_PIVOT_LABEL")
            condition = expression + " IS NOT NULL"
            if selected:
                condition += " AND " + expression + " NOT IN (" + ",".join(selected) + ")"
            pivots.append((pivot["other_label"], "(" + condition + ")"))
        if not pivots:
            fail("PIVOT_SELECTION_REQUIRED")
    metric_sql, metric_records = [], []
    for item in measures:
        column = None if item["aggregate"] == "count_rows" else columns[item["column"]]
        expression = "*" if column is None else _qid(column["name"])
        if item["nulls"] == "zero":
            expression = "coalesce(" + expression + ",CAST(0 AS " + column["type"] + "))"
        for pivot_label, condition in pivots:
            name = item["name"] if pivot_label is None else item["name"] + " / " + pivot_label
            label(name)
            operation = item["aggregate"]
            if operation == "count_rows":
                sql = "count(*)"
            elif operation == "count_distinct":
                sql = "count(DISTINCT " + expression + ")"
            else:
                sql = operation + "(" + expression + ")"
            if condition is not None:
                sql += " FILTER (WHERE " + condition + ")"
            metric_sql.append(sql + " AS " + _qid(name))
            metric_records.append({"name": name, "measure": item["name"], "aggregate": operation,
                "source": column["source"] if column else None, "column": item.get("column"),
                "source_type": column["type"] if column else None, "nulls": item["nulls"],
                "pivot": pivot_label, "note": item["note"]})
    output_names = [item["name"] for item in dimension_records + metric_records]
    if len(output_names) > 1024 or len({name.casefold() for name in output_names}) != len(output_names):
        fail("UNIQUE_OUTPUT_COLUMN_NAMES_REQUIRED")
    order = value.setdefault("order", [])
    if not isinstance(order, list) or len(order) > len(output_names):
        fail("ORDER_INVALID")
    order_sql, ordered = [], set()
    for item in order:
        fields(item, ("column",), ("direction", "nulls"))
        name = item["column"]
        if name not in output_names or name in ordered:
            fail("ORDER_COLUMN_INVALID")
        item["direction"] = item.get("direction", "asc")
        item["nulls"] = item.get("nulls", "last")
        if item["direction"] not in {"asc", "desc"} or item["nulls"] not in {"first", "last"}:
            fail("ORDER_INVALID")
        ordered.add(name)
        order_sql.append(_qid(name) + " " + item["direction"].upper() + " NULLS " + item["nulls"].upper())
    # Complete group keys resolve ties and retain a stable receiving row order.
    for item in dimension_records:
        if item["name"] not in ordered:
            order_sql.append(_qid(item["name"]) + " ASC NULLS LAST")
    from_sql = " FROM " + _qid(edition["table"]) + " WHERE " + where_sql
    group_sql = " GROUP BY " + ",".join(str(i + 1) for i in range(len(dimensions))) if dimensions else ""
    aggregate_sql = "SELECT " + ",".join(dimension_sql + metric_sql) + from_sql + group_sql
    order_suffix = " ORDER BY " + ",".join(order_sql) if order_sql else ""
    sql = aggregate_sql + order_suffix
    row_order = ",".join(order_sql) if order_sql else "(SELECT 1)"
    materialize_sql = "SELECT row_number() OVER (ORDER BY " + row_order + ") AS " + _qid(_ROW) + ",* FROM (" + aggregate_sql + ") AS grouped"
    totals_sql = "SELECT " + ",".join(metric_sql) + from_sql
    return {"definition": value, "definition_sha256": sha(value), "sql": sql,
            "materialize_sql": materialize_sql, "parameters": bindings.values,
            "filter_sql": "SELECT *" + from_sql, "filter_parameters": filter_parameters,
            "source_count_sql": "SELECT count(*)" + from_sql,
            "totals_sql": totals_sql, "dimensions": dimension_records, "measures": metric_records,
            "output_names": output_names, "row_order_column": _ROW,
            "pivot_conditions": [{"label": title, "sql": condition} for title, condition in pivots if condition is not None]}
