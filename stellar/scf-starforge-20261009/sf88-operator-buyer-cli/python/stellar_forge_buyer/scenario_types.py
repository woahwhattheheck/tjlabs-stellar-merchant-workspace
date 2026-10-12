"""Scenario definitions and lossless comparison on the original SQL scalars."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, localcontext
import hashlib
import json
import math
import re
from typing import Any

from .analysis_workspace import _cell, _parameters
from .errors import StateError

SCHEMA = "stellar-forge.customer-scenarios.v1"
NAME = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,63}\Z")
ID = re.compile(r"[0-9a-f]{32}\Z")
HASH = re.compile(r"[0-9a-f]{64}\Z")
DECIMAL = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\Z")


def fail(message: str) -> None:
    raise StateError("SCENARIO: " + message)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def checksum(value: Any) -> str:
    return hashlib.sha256(encode(value).encode()).hexdigest()


def text(value: Any, label: str, maximum: int = 8000, *, required: bool = False) -> str:
    if not isinstance(value, str) or "\0" in value or len(value.encode()) > maximum or required and not value.strip():
        fail(label + " is missing or invalid.")
    return value


def name(value: Any, label: str = "Name") -> str:
    if not isinstance(value, str) or not NAME.fullmatch(value):
        fail(label + " must start with a letter and use up to 64 letters, numbers, underscores or hyphens.")
    return value


def identifier(value: Any) -> str:
    if not isinstance(value, str) or not ID.fullmatch(value):
        fail("A 32-character request identifier is required.")
    return value


def revision(value: Any, *, zero: bool = False) -> int:
    if type(value) is not int or value < (0 if zero else 1):
        fail("The reviewed revision is required.")
    return value


def parameters(value: Any) -> str | None:
    if value is None:
        return None
    text(value, "Parameters", 262144)
    _parameters(value)
    return value


def definition(value: Any) -> dict:
    if not isinstance(value, dict):
        fail("A scenario definition is required.")
    title = text(value.get("title"), "Title", 300, required=True)
    question = text(value.get("question", ""), "Question")
    measures, cases = value.get("measures"), value.get("cases")
    if not isinstance(measures, list) or not 1 <= len(measures) <= 32:
        fail("Choose between one and 32 saved analyses.")
    if not isinstance(cases, list) or not 2 <= len(cases) <= 128:
        fail("Choose between two and 128 parameter scenarios.")
    selected, labels = [], set()
    for item in measures:
        if not isinstance(item, dict):
            fail("An analysis selection is invalid.")
        key = name(item.get("name"), "Analysis name")
        if key in labels:
            fail("Analysis names must be unique.")
        labels.add(key)
        keys = item.get("keys", [])
        if not isinstance(keys, list) or len(keys) > 16 or len({encode(k) for k in keys}) != len(keys):
            fail("Row keys must be distinct column names, with at most 16 columns.")
        keys = [text(k, "Key column", 256, required=True) for k in keys]
        metrics = item.get("metrics", [])
        if not isinstance(metrics, list) or not 1 <= len(metrics) <= 32:
            fail("Choose between one and 32 comparison metrics per analysis.")
        typed, columns = [], set()
        for metric in metrics:
            if isinstance(metric, str):
                metric = {"column": metric}
            if not isinstance(metric, dict):
                fail("A comparison metric is invalid.")
            column = text(metric.get("column"), "Metric column", 256, required=True)
            kind = metric.get("kind", "number")
            if column in columns or kind not in ("number", "decimal"):
                fail("Metric columns must be unique and use number or decimal values.")
            columns.add(column)
            typed.append({"column": column, "kind": kind,
                          "label": text(metric.get("label", column), "Metric label", 300, required=True),
                          "unit": text(metric.get("unit", ""), "Metric unit", 80)})
        selected.append({"name": key, "title": text(item.get("title", key), "Analysis title", 300, required=True),
                         "query_name": name(item.get("query_name"), "Saved query"),
                         "query_revision": revision(item.get("query_revision")),
                         "keys": keys, "metrics": typed,
                         "parameters_text": parameters(item.get("parameters_text"))})
    plans, labels = [], set()
    for item in cases:
        if not isinstance(item, dict):
            fail("A parameter scenario is invalid.")
        key = name(item.get("name"), "Scenario name")
        if key in labels:
            fail("Scenario names must be unique.")
        labels.add(key)
        overrides = item.get("overrides", {})
        if not isinstance(overrides, dict) or set(overrides) - {m["name"] for m in selected}:
            fail("Scenario overrides must name a selected analysis.")
        plans.append({"name": key, "label": text(item.get("label", key), "Scenario label", 300, required=True),
                      "note": text(item.get("note", ""), "Scenario note"),
                      "parameters_text": parameters(item.get("parameters_text")),
                      "overrides": {key: parameters(val) for key, val in overrides.items()}})
    baseline = name(value.get("baseline", plans[0]["name"]), "Baseline scenario")
    if baseline not in labels:
        fail("The baseline must be one of these scenarios.")
    return {"title": title, "question": question, "measures": selected, "cases": plans, "baseline": baseline}


def effective_parameters(measure: dict, case: dict) -> str:
    override = case["overrides"].get(measure["name"])
    return next(value for value in (override, case["parameters_text"], measure["parameters_text"],
                                   measure["query"]["parameters_text"]) if value is not None)


def row_key(cells: list, positions: list[int], row_number: int) -> str:
    if not positions:
        if row_number > 1:
            fail("An analysis without row keys must return at most one row. Select unique key columns for tables.")
        return "[]"
    keys = [cells[index] for index in positions]
    if any(cell["type"] == "null" for cell in keys):
        fail("A row key is null. Use non-null, unique key columns.")
    return encode(keys)


def numeric(cell: dict | None, kind: str) -> Decimal | None:
    if cell is None or cell["type"] == "null":
        return None
    raw = cell.get("text", "")
    if cell["type"] not in ("integer", "number") and not (kind == "decimal" and cell["type"] == "string"):
        fail("A metric contains a nonnumeric value. Use decimal for explicitly selected decimal-text columns.")
    if not isinstance(raw, str) or len(raw) > 4096 or not DECIMAL.fullmatch(raw):
        fail("A metric is not a finite decimal value.")
    try:
        number = Decimal(raw)
    except InvalidOperation:
        fail("A metric is not a finite decimal value.")
    if not number.is_finite() or abs(number.adjusted()) > 1024:
        fail("A metric exceeds the supported finite decimal range.")
    return number


def difference(before: dict | None, after: dict | None, metric: dict) -> dict:
    a, b = numeric(before, metric["kind"]), numeric(after, metric["kind"])
    result = {"column": metric["column"], "baseline": before, "candidate": after,
              "delta": None, "percent_of_absolute_baseline": None, "reason": None}
    if a is None or b is None:
        result["reason"] = "missing-row" if before is None or after is None else "unreported-value"
        return result
    # Preserve integer and explicitly selected decimal-text arithmetic. For SQL
    # REAL values the original scalar encoder supplies its shortest decimal text.
    precision = max(len(a.as_tuple().digits), len(b.as_tuple().digits)) + abs(a.as_tuple().exponent - b.as_tuple().exponent) + 10
    with localcontext() as ctx:
        ctx.prec = max(50, precision)
        delta = b - a
        result["delta"] = format(delta, "f")
        if a == 0:
            result["reason"] = "zero-baseline"
        else:
            ctx.prec = 28
            result["percent_of_absolute_baseline"] = format(delta / abs(a) * 100, "g")
    return result


def compare_rows(before: dict | None, after: dict | None, measure: dict) -> dict:
    left = dict(zip(before["columns"], before["cells"])) if before else {}
    right = dict(zip(after["columns"], after["cells"])) if after else {}
    status = "added" if before is None else "removed" if after is None else "unchanged" if left == right else "changed"
    return {"status": status,
            "baseline_row": before["row_number"] if before else None,
            "candidate_row": after["row_number"] if after else None,
            "changed_columns": [key for key in dict.fromkeys([*left, *right]) if left.get(key) != right.get(key)],
            "metrics": [difference(left.get(m["column"]), right.get(m["column"]), m) for m in measure["metrics"]]}


def file_digest(path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def cell(value: Any) -> dict:
    return _cell(value)
