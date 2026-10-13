"""Source-bound risk-adjustment study evaluation; Python 3.11, standard library.

This module evaluates retained observations and model outputs. It does not fit,
reimplement or select a risk model. A caller owns case history and blob custody.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import html
import io
import json
import re
import random
import os
import fcntl
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation, DivisionByZero, Overflow, Context, ROUND_HALF_EVEN, localcontext
from fractions import Fraction
from pathlib import Path
from uuid import UUID

SCHEMA = "commons.risk-study-plan.v1"
REPORT_SCHEMA = "commons.risk-study-evaluation.v1"
LIMITS = {"files": 34, "fileBytes": 64 * 1024 * 1024,
          "totalBytes": 256 * 1024 * 1024, "rowsPerFile": 200000,
          "candidates": 16, "groups": 8, "groupCells": 2000,
          "numericDigits": 38, "numericScale": 12, "nesting": 32,
          "reportCells": 250000, "bootstrapWork": 25000000, "reportBytes": 256 * 1024 * 1024}

class StudyError(ValueError):
    def __init__(self, code, message, **context):
        self.code, self.context = code, context
        super().__init__(message)
    def as_dict(self):
        return {"code": self.code, "message": str(self), "context": self.context}

def fail(code, message, **context):
    raise StudyError(code, message, **context)

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")

def sha(value):
    return hashlib.sha256(value).hexdigest()

def text(value, name, maximum=4000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        fail("TEXT", name + " must be nonempty bounded text")
    return value

def uuid(value, name):
    text(value, name, 36)
    try:
        if str(UUID(value)) != value:
            raise ValueError()
    except ValueError:
        fail("UUID", name + " must be a canonical UUID")
    return value

def integer(value, name, minimum=0, maximum=200000):
    if type(value) is not int or not minimum <= value <= maximum:
        fail("INTEGER", name + " is outside the supported integer range")
    return value

def boolean(value, name):
    if type(value) is not bool:
        fail("BOOLEAN", name + " must be true or false")
    return value

def day(value, name):
    try:
        if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
            raise ValueError()
    except ValueError:
        fail("DATE", name + " must be YYYY-MM-DD")
    return value

def number(value, name, nonnegative=False, positive=False):
    if not (isinstance(value, (str, Decimal)) or type(value) is int):
        fail("NUMBER", name + " must be exact decimal text or an original JSON number")
    s = str(value)
    if len(s) > 96 or not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", s):
        fail("NUMBER", name + " is not bounded decimal text")
    try:
        d = Decimal(s)
    except InvalidOperation:
        fail("NUMBER", name + " is not a decimal")
    tup = d.as_tuple()
    if (not d.is_finite() or len(tup.digits) > LIMITS["numericDigits"]
            or abs(tup.exponent) > LIMITS["numericDigits"]
            or d.adjusted() > LIMITS["numericDigits"]
            or max(0, -tup.exponent) > LIMITS["numericScale"]):
        fail("NUMBER_LIMIT", name + " exceeds the exact numeric capacity")
    f = Fraction(d)
    if nonnegative and f < 0 or positive and f <= 0:
        fail("NUMBER_SIGN", name + " has an invalid sign")
    return f

def rational(value):
    """Exact numerator/denominator plus a labelled 16-significant-digit display."""
    if value is None:
        return None
    with localcontext(Context(prec=16, rounding=ROUND_HALF_EVEN, Emin=-999999, Emax=999999,
                              capitals=1, clamp=0, flags=[],
                              traps=[InvalidOperation, DivisionByZero, Overflow])) as c:
        rendered = str(Decimal(value.numerator) / Decimal(value.denominator))
    return {"numerator": str(value.numerator), "denominator": str(value.denominator),
            "display": rendered, "displayPrecision": 16}

def ratio(numerator, denominator, reason):
    if denominator == 0:
        return {"value": None, "unavailable": reason}
    return {"value": rational(numerator / denominator), "unavailable": None}

def descriptor(value):
    if not isinstance(value, dict):
        fail("DESCRIPTOR", "A retained file descriptor is required")
    text(value.get("name"), "file.name", 240)
    text(value.get("mediaType"), "file.mediaType", 120)
    if not isinstance(value.get("sha256"), str) or not re.fullmatch(r"[a-f0-9]{64}", value["sha256"]):
        fail("DESCRIPTOR", "file.sha256 must identify the complete original bytes")
    integer(value.get("bytes"), "file.bytes", 1, LIMITS["fileBytes"])
    return value

def pointer(value, name):
    if not isinstance(value, str) or not value.startswith("/") or len(value) > 500:
        fail("POINTER", name + " must be an explicit non-root JSON pointer")
    if re.search(r"~(?![01])", value):
        fail("POINTER", name + " contains an invalid escape")
    return value

MISSING = object()

def get(row, path):
    result = row
    for raw in path[1:].split("/"):
        key = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(result, dict):
            result = result.get(key, MISSING)
        elif isinstance(result, list) and re.fullmatch(r"0|[1-9]\d*", key):
            idx = int(key)
            result = result[idx] if idx < len(result) else MISSING
        else:
            return MISSING
        if result is MISSING:
            return result
    return result

def original(value, depth=0):
    """JSON-safe lossless presentation: original numeric tokens remain labelled."""
    if depth > LIMITS["nesting"]:
        fail("NESTING", "Input nesting exceeds the supported capacity")
    if value is MISSING:
        return {"present": False}
    if isinstance(value, Decimal):
        return {"present": True, "type": "json-number", "lexeme": getattr(value, "lexeme", str(value))}
    if type(value) is int:
        return {"present": True, "type": "json-integer", "lexeme": str(value)}
    if value is None or type(value) in (str, bool):
        return {"present": True, "type": type(value).__name__, "value": value}
    if isinstance(value, list):
        return {"present": True, "type": "array",
                "value": [original(v, depth + 1) for v in value]}
    if isinstance(value, dict):
        return {"present": True, "type": "object",
                "value": {k: original(v, depth + 1) for k, v in value.items()}}
    fail("VALUE", "Unsupported original value")

def identity(row, paths):
    values = []
    for path in paths:
        v = get(row, path)
        if not (isinstance(v, str) and v != "" or type(v) is int):
            fail("IDENTITY", "Identity cells must be nonempty strings or JSON integers",
                 field=path, value=original(v))
        if len(str(v)) > 240:
            fail("IDENTITY", "Identity cell exceeds 240 characters", field=path)
        values.append({"type": "integer" if type(v) is int else "string", "value": str(v) if type(v) is int else v})
    return canonical(values).decode("utf-8"), values

def table_spec(spec, name, value_field=None):
    if not isinstance(spec, dict):
        fail("TABLE", name + " must define its original table")
    descriptor(spec.get("file"))
    if spec.get("format") not in {"CSV", "JSON", "JSONL"}:
        fail("FORMAT", name + " format must be CSV, JSON or JSONL")
    keys = spec.get("keys")
    if not isinstance(keys, list) or not 1 <= len(keys) <= 8 or len(set(keys)) != len(keys):
        fail("KEYS", name + " needs 1..8 distinct identity pointers")
    for key in keys:
        pointer(key, name + ".keys")
    if value_field:
        pointer(spec.get(value_field), name + "." + value_field)
    scope = spec.get("scope")
    if not isinstance(scope, dict):
        fail("SCOPE", name + " must record actual extraction coverage")
    text(scope.get("description"), name + ".scope.description")
    text(scope.get("authority"), name + ".scope.authority")
    day(scope.get("asOf"), name + ".scope.asOf")
    boolean(scope.get("complete"), name + ".scope.complete")
    if scope.get("expectedRows") is not None:
        integer(scope["expectedRows"], name + ".scope.expectedRows")
    if spec["format"] == "CSV":
        cfg = spec.get("csv")
        if not isinstance(cfg, dict) or cfg.get("delimiter") not in {",", "\t", ";", "|"}:
            fail("CSV", name + " requires an explicit supported CSV delimiter")
        if cfg.get("nullToken") is not None and (not isinstance(cfg["nullToken"], str)
                                               or cfg["nullToken"] == ""):
            fail("CSV", "CSV nullToken is null or explicit nonempty text; empty text stays text")
    if spec["format"] == "JSON":
        p = spec.get("rowsPointer", "")
        if p != "":
            pointer(p, name + ".rowsPointer")

def validate_plan(plan):
    if not isinstance(plan, dict) or plan.get("schema") != SCHEMA:
        fail("SCHEMA", "Unsupported study plan")
    uuid(plan.get("id"), "plan.id")
    text(plan.get("title"), "plan.title", 300)
    research = plan.get("research")
    if not isinstance(research, dict):
        fail("RESEARCH", "The investigator's actual research definition is required")
    for key in ("question", "investigator", "population", "market", "costBasis", "currency",
                "costUnit", "limitations"):
        text(research.get(key), "research." + key)
    if research.get("timing") not in {"PROSPECTIVE", "CONCURRENT", "OTHER_EXPLICIT"}:
        fail("TIMING", "Select prospective, concurrent or an explicit other timing")
    windows = {}
    for key in ("inputWindow", "outcomeWindow"):
        w = research.get(key)
        if not isinstance(w, dict):
            fail("WINDOW", key + " is required")
        a, b = day(w.get("start"), key + ".start"), day(w.get("end"), key + ".end")
        if a > b:
            fail("WINDOW", key + " ends before it starts")
        windows[key] = (a, b)
    if research["timing"] == "PROSPECTIVE" and windows["inputWindow"][1] >= windows["outcomeWindow"][0]:
        fail("TEMPORAL_LEAKAGE", "Prospective predictor window must end before the outcome window")
    if research["timing"] == "CONCURRENT" and windows["inputWindow"] != windows["outcomeWindow"]:
        fail("WINDOW", "Concurrent comparison requires the same declared input and outcome window")
    text(research.get("timingRationale"), "research.timingRationale")
    boolean(research.get("allowNegativeCosts"), "research.allowNegativeCosts")
    if plan.get("weighting") not in {"UNIT", "COHORT_FIELD"}:
        fail("WEIGHT", "Select UNIT or COHORT_FIELD weighting")
    table_spec(plan.get("cohort"), "cohort")
    table_spec(plan.get("outcomes"), "outcomes", "value")
    pointer(plan["cohort"].get("cluster"), "cohort.cluster")
    bootstrap = plan.get("bootstrap")
    if bootstrap is not None:
        if not isinstance(bootstrap, dict):
            fail("BOOTSTRAP", "Bootstrap selection must be an object or null")
        integer(bootstrap.get("replicates"), "bootstrap.replicates", 20, 1000)
        integer(bootstrap.get("seed"), "bootstrap.seed", 0, 2147483647)
        level = number(bootstrap.get("confidence"), "bootstrap.confidence", positive=True)
        if not Fraction(1, 2) <= level < 1:
            fail("BOOTSTRAP", "Confidence level must be between 0.5 and 1 (exclusive)")
    if plan["weighting"] == "COHORT_FIELD":
        pointer(plan["cohort"].get("weight"), "cohort.weight")
        text(plan.get("weightMeaning"), "weightMeaning")
    if plan["cohort"].get("eligible") is not None:
        pointer(plan["cohort"]["eligible"], "cohort.eligible")
        mapping = plan["cohort"].get("eligibilityValues")
        if not isinstance(mapping, dict) or set(mapping) != {"true", "false"}:
            fail("ELIGIBILITY", "Select the exact source values meaning eligible and excluded")
        if canonical(original(mapping["true"])) == canonical(original(mapping["false"])):
            fail("ELIGIBILITY", "Eligible/excluded source values must be distinct")
    groups = plan.get("groups", [])
    if not isinstance(groups, list) or len(groups) > LIMITS["groups"]:
        fail("GROUPS", "Too many subgroup dimensions")
    group_names = set()
    for group in groups:
        if not isinstance(group, dict):
            fail("GROUP", "Group must be an object")
        text(group.get("id"), "group.id", 100)
        text(group.get("label"), "group.label", 200)
        pointer(group.get("field"), "group.field")
        if group["id"] in group_names:
            fail("GROUP", "Duplicate group ID")
        group_names.add(group["id"])
    candidates = plan.get("candidates")
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= LIMITS["candidates"]:
        fail("CANDIDATES", "Select 1..16 retained candidate output tables")
    seen = set()
    for c in candidates:
        if not isinstance(c, dict):
            fail("CANDIDATE", "Candidate must be an object")
        uuid(c.get("id"), "candidate.id")
        if c["id"] in seen:
            fail("CANDIDATE", "Duplicate candidate ID")
        seen.add(c["id"])
        for key in ("label", "family", "version", "market", "nativeRunReference"):
            text(c.get(key), "candidate." + key)
        integer(c.get("modelYear"), "candidate.modelYear", 1900, 2200)
        descriptor(c.get("engineSource"))
        descriptor(c.get("nativeResult"))
        if c.get("timing") != research["timing"] or c.get("market") != research["market"]:
            fail("MODEL_SCOPE", "Candidate timing/market must match the explicitly selected study")
        table_spec(c.get("outputs"), "candidate.outputs", "value")
        if c.get("outputKind") not in {"COST", "RELATIVE_RISK"}:
            fail("OUTPUT_KIND", "Declare cost or relative risk outputs")
        if c["outputKind"] == "COST":
            if c.get("costUnit") != research["costUnit"] or c.get("currency") != research["currency"] or c.get("costBasis") != research["costBasis"]:
                fail("UNIT", "Cost predictions must use the same currency and cost basis unit")
            if c.get("scale") is not None:
                fail("SCALE", "Cost predictions are used unchanged; prepare separate explicit output for transformations")
        else:
            scale = c.get("scale")
            if not isinstance(scale, dict):
                fail("SCALE", "A risk score is not a monetary prediction without an explicit retained scale")
            number(scale.get("factor"), "scale.factor", positive=True)
            descriptor(scale.get("evidence"))
            for key in ("method", "fitPopulation", "fitWindow", "independenceBasis", "reference"):
                text(scale.get(key), "scale." + key)
            if scale.get("costUnit") != research["costUnit"] or scale.get("currency") != research["currency"] or scale.get("costBasis") != research["costBasis"]:
                fail("UNIT", "Risk scaling must yield the selected monetary unit and currency")
            boolean(scale.get("evaluationOutcomesUsed"), "scale.evaluationOutcomesUsed")
            if scale["evaluationOutcomesUsed"]:
                fail("SCALE_LEAKAGE", "Evaluation outcomes cannot set a held-out monetary scaling factor")
            fit = scale.get("training")
            table_spec(fit, "scale.training")
            if len(fit["keys"]) != len(plan["cohort"]["keys"]):
                fail("SCALE", "Training/evaluation identity keys must describe the same sampling-unit structure")
            end = day(scale.get("trainingOutcomeEnd"), "scale.trainingOutcomeEnd")
            if research["timing"] == "PROSPECTIVE" and end >= windows["outcomeWindow"][0]:
                fail("SCALE_LEAKAGE", "Prospective calibration outcomes must precede the evaluation outcome window")
    cap = plan.get("costCap")
    if cap is not None:
        if not isinstance(cap, dict):
            fail("CAP", "Cost cap must be an object or null")
        number(cap.get("amount"), "costCap.amount", positive=True)
        if cap.get("applyTo") not in {"ACTUAL_ONLY", "ACTUAL_AND_PREDICTED"}:
            fail("CAP", "Cost cap application must be explicit")
        text(cap.get("reason"), "costCap.reason")
    return plan

def _pairs(items):
    result = {}
    for k, v in items:
        if k in result:
            fail("DUPLICATE_JSON_KEY", "Original JSON contains a repeated object key", key=k)
        result[k] = v
    return result

class OriginalDecimal(Decimal):
    def __new__(cls, lexeme):
        value = super().__new__(cls, lexeme)
        value.lexeme = lexeme
        return value

def _loads(body):
    try:
        return json.loads(body, parse_float=OriginalDecimal, parse_int=int, object_pairs_hook=_pairs,
                          parse_constant=lambda x: fail("JSON_NUMBER", "Non-finite JSON number"))
    except (json.JSONDecodeError, RecursionError, ValueError) as exc:
        if isinstance(exc, StudyError):
            raise
        fail("JSON", "Original JSON cannot be read exactly", detail=str(exc))

class Inputs:
    def __init__(self, read_blob):
        self.read_blob = read_blob
        self.raw = {}
        self.total = 0
    def read(self, desc):
        descriptor(desc)
        digest = desc["sha256"]
        if digest not in self.raw:
            if len(self.raw) >= LIMITS["files"]:
                fail("CAPACITY", "Too many retained input files")
            body = self.read_blob(digest)
            if not isinstance(body, bytes):
                fail("BLOB", "read_blob must return complete bytes", sha256=digest)
            if len(body) != desc["bytes"] or sha(body) != digest:
                fail("BLOB_IDENTITY", "Original input bytes differ from their descriptor", name=desc["name"])
            if self.total + len(body) > LIMITS["totalBytes"]:
                fail("CAPACITY", "Aggregate retained input exceeds 256 MiB")
            self.raw[digest] = body
            self.total += len(body)
        elif len(self.raw[digest]) != desc["bytes"]:
            fail("BLOB_IDENTITY", "Inconsistent size for the same source SHA")
        return self.raw[digest]
    def rows(self, spec):
        body = self.read(spec["file"])
        try:
            s = body.decode("utf-8-sig")
        except UnicodeDecodeError:
            fail("ENCODING", "Input must be explicitly prepared as UTF-8; original bytes remain retained")
        rows = []
        if spec["format"] == "CSV":
            reader = csv.reader(io.StringIO(s, newline=""), delimiter=spec["csv"]["delimiter"], strict=True)
            try:
                headers = next(reader)
                if not headers or any(not h for h in headers) or len(set(headers)) != len(headers):
                    fail("CSV_HEADER", "CSV requires distinct nonempty original headers")
                for cells in reader:
                    if len(cells) != len(headers):
                        fail("CSV_WIDTH", "CSV row width differs from its header", row=reader.line_num)
                    token = spec["csv"].get("nullToken")
                    rows.append(dict(zip(headers, [None if token is not None and v == token else v for v in cells])))
                    if len(rows) > LIMITS["rowsPerFile"]:
                        fail("CAPACITY", "CSV exceeds the complete row capacity")
            except (StopIteration, csv.Error) as exc:
                fail("CSV", "Original CSV could not be read completely", detail=str(exc))
        elif spec["format"] == "JSONL":
            for n, line in enumerate(s.splitlines(), 1):
                if not line.strip():
                    fail("JSONL", "Blank JSONL rows are not silently removed", row=n)
                rows.append(_loads(line))
                if len(rows) > LIMITS["rowsPerFile"]:
                    fail("CAPACITY", "JSONL exceeds the complete row capacity")
        else:
            data = _loads(s)
            rows = data if not spec.get("rowsPointer") else get(data, spec["rowsPointer"])
            if not isinstance(rows, list):
                fail("ROWS", "Selected original JSON value is not an array")
        if len(rows) > LIMITS["rowsPerFile"] or any(not isinstance(r, dict) for r in rows):
            fail("ROWS", "All selected rows must be objects within the complete row capacity")
        for row in rows:
            original(row)
        return rows

def index_rows(rows, spec, label, findings):
    buckets = defaultdict(list)
    invalid = []
    for n, row in enumerate(rows, 1):
        try:
            key, values = identity(row, spec["keys"])
            buckets[key].append((n, row, values))
        except StudyError as exc:
            invalid.append(n)
            findings.append({"table": label, "row": n, **exc.as_dict()})
    duplicates = {k: [v[0] for v in vals] for k, vals in buckets.items() if len(vals) > 1}
    for k, nums in duplicates.items():
        findings.append({"code": "DUPLICATE_IDENTITY", "table": label, "identity": json.loads(k), "rows": nums})
    unique = {k: vals[0] for k, vals in buckets.items() if len(vals) == 1}
    expected = spec["scope"].get("expectedRows")
    return unique, {"rows": len(rows), "expectedRows": expected,
                    "coverageVerified": spec["scope"]["complete"] and expected is not None and expected == len(rows),
                    "invalidIdentityRows": invalid, "duplicateIdentities": [
                        {"identity": json.loads(k), "rows": v} for k, v in sorted(duplicates.items())]}

def metrics(rows):
    if not rows:
        return {"n": 0, "weight": rational(Fraction(0)), "unavailable": "NO_COMMON_VALID_ROWS"}
    weight = sum((r["w"] for r in rows), Fraction())
    actual = sum((r["w"] * r["y"] for r in rows), Fraction())
    predicted = sum((r["w"] * r["p"] for r in rows), Fraction())
    mean = actual / weight
    sse = sum((r["w"] * (r["p"] - r["y"]) ** 2 for r in rows), Fraction())
    sst = sum((r["w"] * (r["y"] - mean) ** 2 for r in rows), Fraction())
    sae = sum((r["w"] * abs(r["p"] - r["y"]) for r in rows), Fraction())
    mse = sse / weight
    with localcontext(Context(prec=16, rounding=ROUND_HALF_EVEN, Emin=-999999, Emax=999999,
                              capitals=1, clamp=0, flags=[],
                              traps=[InvalidOperation, DivisionByZero, Overflow])) as c:
        rmse = str((Decimal(mse.numerator) / Decimal(mse.denominator)).sqrt())
    return {"n": len(rows), "weight": rational(weight), "actualWeightedSum": rational(actual),
            "predictedWeightedSum": rational(predicted), "actualMean": rational(mean),
            "predictedMean": rational(predicted / weight), "bias": rational((predicted - actual) / weight),
            "mae": rational(sae / weight), "mse": rational(mse),
            "rmse": {"display": rmse, "displayPrecision": 16, "squaredExact": rational(mse)},
            "rSquared": {"value": rational(1 - sse / sst) if sst else None,
                         "unavailable": None if sst else "ZERO_ACTUAL_VARIANCE"},
            "predictiveRatio": ratio(predicted, actual, "ZERO_ACTUAL_TOTAL"),
            "normalizedMAE": ratio(sae, actual, "ZERO_ACTUAL_TOTAL"), "unavailable": None}


def _metric_rows(base, values, keys, cap, cap_spec, frequencies=None):
    result = []
    for key in keys:
        b, pv = base[key], values[key]
        multiplier = frequencies.get(b["cluster"], 0) if frequencies is not None else 1
        if not multiplier:
            continue
        y, p = b["originalY"], pv["p"]
        if cap is not None:
            y = min(y, cap)
            if cap_spec["applyTo"] == "ACTUAL_AND_PREDICTED":
                p = min(p, cap)
        result.append({"w": b["w"] * multiplier, "y": y, "p": p})
    return result

def _metric_value(metrics_row, name):
    v = metrics_row.get(name)
    if name in {"rSquared", "predictiveRatio", "normalizedMAE"}:
        v = v.get("value") if v else None
    if not v or "numerator" not in v:
        return None
    return Fraction(int(v["numerator"]), int(v["denominator"]))

def metric_differences(left, right):
    result = {}
    for name in ("mae", "mse", "bias", "rSquared", "predictiveRatio", "normalizedMAE"):
        a, b = _metric_value(left, name), _metric_value(right, name)
        result[name] = rational(a - b) if a is not None and b is not None else None
    return result

def _quantile(values, q):
    ordered = sorted(values)
    position = Fraction(len(ordered) - 1) * q
    lo = position.numerator // position.denominator
    hi = min(lo + 1, len(ordered) - 1)
    f = position - lo
    return ordered[lo] + f * (ordered[hi] - ordered[lo])

def cluster_bootstrap(plan, base, candidates, common, cap):
    cfg = plan.get("bootstrap")
    if cfg is None:
        return None
    work = cfg["replicates"] * len(common) * len(candidates)
    if work > LIMITS["bootstrapWork"]:
        return {"status": "NEEDS_RESOURCES", "plan": cfg, "requestedWork": work,
                "supportedWork": LIMITS["bootstrapWork"],
                "reason": "Complete selected bootstrap exceeds this component capacity. Primary and pairwise metrics remain complete; no cohort slice or smaller substitute run was performed."}
    clusters = sorted({base[k]["cluster"] for k in common})
    if len(clusters) < 2:
        return {"status": "UNAVAILABLE", "reason": "FEWER_THAN_TWO_PATIENT_CLUSTERS",
                "clusters": len(clusters), "plan": cfg}
    rng = random.Random(cfg["seed"])
    ids = list(candidates)
    metric_names = ("mae", "mse", "bias", "rSquared", "predictiveRatio", "normalizedMAE")
    pair_metrics = [(left, right, name) for ai, left in enumerate(ids)
                    for right in ids[ai + 1:] for name in metric_names]
    values = {key: [] for key in pair_metrics}
    undefined = {key: Counter() for key in pair_metrics}
    draws = []
    for repetition in range(cfg["replicates"]):
        frequencies = Counter(clusters[rng.randrange(len(clusters))] for _ in clusters)
        measured = {cid: metrics(_metric_rows(base, candidates[cid], common, cap,
                                              plan.get("costCap"), frequencies)) for cid in ids}
        for cid in ids:
            measured[cid]["distinctRows"] = measured[cid]["n"]
            measured[cid]["n"] = sum(frequencies[base[k]["cluster"]] for k in common)
            measured[cid]["sampledRows"] = measured[cid]["n"]
        differences = []
        for ai, left in enumerate(ids):
            for right in ids[ai + 1:]:
                diff = metric_differences(measured[left], measured[right])
                undefined_metrics = {}
                for name, v in diff.items():
                    key = (left, right, name)
                    if v is not None:
                        values[key].append(Fraction(int(v["numerator"]), int(v["denominator"])))
                    else:
                        causes = []
                        for cid in (left, right):
                            if _metric_value(measured[cid], name) is None:
                                metric = measured[cid].get(name)
                                reason = (metric.get("unavailable") if isinstance(metric, dict) else None)
                                causes.append({"candidateId": cid,
                                               "reason": reason or measured[cid].get("unavailable") or "METRIC_UNAVAILABLE"})
                        undefined_metrics[name] = causes
                        # Count one cause combination per undefined paired draw.
                        # Two undefined candidates do not double-count a replicate.
                        undefined[key][canonical(causes).decode("utf-8")] += 1
                differences.append({"left": left, "right": right, "metrics": diff,
                                    "undefinedMetrics": undefined_metrics})
        frequency_list = sorted(frequencies.items())
        draws.append({"replicate": repetition + 1,
                      "sampleSha256": sha(canonical(frequency_list)),
                      "clusterFrequencies": frequency_list,
                      "sampledRows": sum(frequencies[base[k]["cluster"]] for k in common),
                      "distinctRows": sum(1 for k in common if frequencies[base[k]["cluster"]]),
                      "sampledClusters": len(clusters), "distinctClusters": len(frequencies),
                      "metrics": measured, "pairedDifferences": differences})
    tail = (1 - number(cfg["confidence"], "confidence")) / 2
    intervals = []
    for left, right, name in sorted(pair_metrics):
        key = (left, right, name)
        observations = values[key]
        unavailable = cfg["replicates"] - len(observations)
        status = ("UNAVAILABLE" if not observations else
                  "CONDITIONAL_ON_DEFINED_REPLICATES" if unavailable else "COMPLETE")
        intervals.append({"left": left, "right": right, "metric": name, "status": status,
                          "validReplicates": len(observations),
                          "undefinedReplicates": unavailable,
                          "requestedReplicates": cfg["replicates"],
                          "undefinedReasons": [{"causes": json.loads(causes), "replicates": count}
                                               for causes, count in sorted(undefined[key].items())],
                          "conditionalOnDefinedReplicates": bool(observations) and bool(unavailable),
                          "unavailable": "NO_DEFINED_REPLICATES" if not observations else None,
                          "lower": rational(_quantile(observations, tail)) if observations else None,
                          "upper": rational(_quantile(observations, 1 - tail)) if observations else None,
                          "method": "PERCENTILE_LINEAR_INTERPOLATION"})
    interval_counts = dict(Counter(row["status"] for row in intervals))
    return {"status": ("COMPLETE_WITH_UNDEFINED_REPLICATES"
                       if any(row["undefinedReplicates"] for row in intervals) else "COMPLETE"),
            "plan": cfg, "clusters": len(clusters), "intervalStatusCounts": interval_counts,
            "cohort": "ALL_MODEL_COMMON_COHORT", "sameClusterDrawForEveryCandidate": True,
            "randomImplementation": "Python random.Random / MT19937; sorted typed patient identities",
            "frequencyEncoding": "Sorted [canonical typed patient identity JSON string, positive multiplicity] pairs; sampleSha256 hashes their canonical JSON bytes.",
            "repetitions": draws, "pairedIntervals": intervals,
            "limitations": "Patient clusters are resampled with replacement. No tuning, calibration, or model fitting occurs inside these draws; supplied predictions are treated as fixed. These are conditional performance intervals, not uncertainty for an entire model-training procedure. An interval with undefined draws is additionally conditional on defined replicates; all undefined counts, causes and original draws remain retained."}


def evaluate(plan, read_blob):
    plan = json.loads(canonical(plan))
    validate_plan(plan)
    inputs = Inputs(read_blob)
    findings, source_info = [], []
    cohort_rows = inputs.rows(plan["cohort"])
    outcome_rows = inputs.rows(plan["outcomes"])
    cohort, cohort_counts = index_rows(cohort_rows, plan["cohort"], "cohort", findings)
    outcomes, outcome_counts = index_rows(outcome_rows, plan["outcomes"], "outcomes", findings)
    predictions, pred_counts = {}, {}
    training_sets = {}
    for candidate in plan["candidates"]:
        inputs.read(candidate["engineSource"])
        inputs.read(candidate["nativeResult"])
        if candidate["outputKind"] == "RELATIVE_RISK":
            inputs.read(candidate["scale"]["evidence"])
            fit = candidate["scale"]["training"]
            fi, fc = index_rows(inputs.rows(fit), fit, "training:" + candidate["id"], findings)
            if fc["invalidIdentityRows"] or fc["duplicateIdentities"] or not fc["coverageVerified"]:
                fail("TRAINING_COVERAGE", "Calibration requires its complete unique training sample", candidate=candidate["id"])
            overlap = set(fi) & set(cohort)
            if overlap:
                fail("SCALE_LEAKAGE", "Calibration and evaluation sampling units overlap", candidate=candidate["id"],
                     identities=[json.loads(k) for k in sorted(overlap)])
            training_sets[candidate["id"]] = {"file": fit["file"], "rows": len(fi), "overlap": 0,
                                             "trainingOutcomeEnd": candidate["scale"]["trainingOutcomeEnd"]}
        rows = inputs.rows(candidate["outputs"])
        predictions[candidate["id"]], pred_counts[candidate["id"]] = index_rows(
            rows, candidate["outputs"], candidate["id"], findings)
    if len(cohort_rows) * len(plan["candidates"]) > LIMITS["reportCells"]:
        fail("CAPACITY", "Complete report would exceed the selected row/candidate capacity")
    eligible, excluded, base = [], [], {}
    group_cells = set()
    for key, (n, row, ident) in sorted(cohort.items()):
        value = get(row, plan["cohort"]["eligible"]) if plan["cohort"].get("eligible") else True
        if plan["cohort"].get("eligible"):
            mapping = plan["cohort"]["eligibilityValues"]
            flag = (True if canonical(original(value)) == canonical(original(mapping["true"]))
                    else False if canonical(original(value)) == canonical(original(mapping["false"])) else None)
        else:
            flag = True
        if flag is None:
            findings.append({"code": "ELIGIBILITY_VALUE", "table": "cohort", "row": n,
                             "identity": ident, "value": original(value)})
            continue
        if not flag:
            excluded.append({"identity": ident, "row": n, "reason": "EXPLICIT_COHORT_ELIGIBILITY_FALSE"})
            continue
        eligible.append(key)
        try:
            w = number(get(row, plan["cohort"]["weight"]), "cohort weight", positive=True) if plan["weighting"] == "COHORT_FIELD" else Fraction(1)
            if key not in outcomes:
                fail("MISSING_OUTCOME", "No unique actual outcome exists")
            on, outcome, _ = outcomes[key]
            y = number(get(outcome, plan["outcomes"]["value"]), "actual outcome",
                       nonnegative=not plan["research"]["allowNegativeCosts"])
            _, cluster = identity(row, [plan["cohort"]["cluster"]])
            groups = {}
            for group in plan.get("groups", []):
                v = original(get(row, group["field"]))
                groups[group["id"]] = v
                group_cells.add((group["id"], canonical(v)))
            if len(group_cells) > LIMITS["groupCells"]:
                fail("CAPACITY", "Subgroup output exceeds the complete group-cell capacity")
            base[key] = {"identity": ident, "cohortRow": n, "outcomeRow": on,
                         "w": w, "originalY": y, "groups": groups, "cluster": canonical(cluster).decode("utf-8")}
        except StudyError as exc:
            if exc.code == "CAPACITY":
                raise
            findings.append({"table": "cohort", "row": n, "identity": ident, **exc.as_dict()})
    candidate_values = {}
    for candidate in plan["candidates"]:
        cid, values = candidate["id"], {}
        scale = number(candidate["scale"]["factor"], "scale") if candidate["outputKind"] == "RELATIVE_RISK" else Fraction(1)
        for key in eligible:
            if key not in base:
                continue
            try:
                if key not in predictions[cid]:
                    fail("MISSING_PREDICTION", "No unique candidate prediction exists")
                pn, row, _ = predictions[cid][key]
                raw = number(get(row, candidate["outputs"]["value"]), "candidate prediction")
                values[key] = {"raw": raw, "p": raw * scale, "predictionRow": pn}
            except StudyError as exc:
                findings.append({"table": cid, "identity": json.loads(key), **exc.as_dict()})
        candidate_values[cid] = values
    common = sorted(set(base).intersection(*(set(v) for v in candidate_values.values())))
    common_set, eligible_set = set(common), set(eligible)
    cap = number(plan["costCap"]["amount"], "cap") if plan.get("costCap") else None
    result_candidates = []
    row_results = []
    for candidate in plan["candidates"]:
        cid = candidate["id"]
        rs, uncapped, grouped = [], [], defaultdict(list)
        for key in common:
            b, pv = base[key], candidate_values[cid][key]
            y, p = b["originalY"], pv["p"]
            uncapped.append({"w": b["w"], "y": y, "p": p})
            if cap is not None:
                y = min(y, cap)
                if plan["costCap"]["applyTo"] == "ACTUAL_AND_PREDICTED":
                    p = min(p, cap)
            entry = {"w": b["w"], "y": y, "p": p}
            rs.append(entry)
            for gid, gv in b["groups"].items():
                grouped[(gid, canonical(gv))].append(entry)
        result_candidates.append({"id": cid, "label": candidate["label"], "nativeRunReference": candidate["nativeRunReference"],
                                  "outputKind": candidate["outputKind"], "scale": candidate.get("scale"),
                                  "individuallyUsableRows": len(candidate_values[cid]), "commonCohort": metrics(rs),
                                  "uncappedCommonCohort": metrics(uncapped),
                                  "subgroups": [{"groupId": gid, "value": json.loads(gval),
                                                "metrics": metrics(vals)} for (gid, gval), vals in sorted(grouped.items())]})
    for key in sorted(cohort):
        n, _, ident = cohort[key]
        b = base.get(key)
        row_results.append({"identity": ident, "cohortRow": n,
                            "eligible": key in eligible_set, "commonIncluded": key in common_set,
                            "outcomeRow": b["outcomeRow"] if b else None,
                            "actual": rational(b["originalY"]) if b else None,
                            "weight": rational(b["w"]) if b else None, "groups": b["groups"] if b else {},
                            "candidates": {cid: {"predictionRow": vals[key]["predictionRow"],
                                                "originalValue": rational(vals[key]["raw"]),
                                                "scaledPrediction": rational(vals[key]["p"])} if key in vals else None
                                           for cid, vals in candidate_values.items()}})
    extras = {"outcomes": [json.loads(k) for k in sorted(set(outcomes) - set(cohort))]}
    extras.update({cid: [json.loads(k) for k in sorted(set(vals) - set(cohort))]
                   for cid, vals in predictions.items()})
    counts = {"cohort": cohort_counts, "outcomes": outcome_counts, "predictions": pred_counts,
              "explicitlyExcluded": len(excluded), "eligibleUnique": len(eligible),
              "validActualAndWeight": len(base), "commonValid": len(common)}
    all_coverage = [cohort_counts, outcome_counts, *pred_counts.values()]
    population_complete = (all(x["coverageVerified"] for x in all_coverage)
                           and not findings and len(common) == len(eligible))
    warnings = [{"code": "COMPLETE_CASE_ESTIMAND", "message": "Metrics use the same valid rows for every candidate; all excluded, missing and duplicate observations remain in this report."}]
    if not population_complete:
        warnings.append({"code": "POPULATION_INCOMPLETE", "message": "These metrics do not establish accuracy for the complete intended population."})
    for c in plan["candidates"]:
        if (c.get("scale") or {}).get("evaluationOutcomesUsed"):
            warnings.append({"code": "IN_SAMPLE_SCALE", "candidateId": c["id"],
                             "message": "Scaling used evaluation outcomes; interpretation must distinguish in-sample calibration from independent performance."})
    pairwise = []
    for ai, a in enumerate(plan["candidates"]):
        for b in plan["candidates"][ai + 1:]:
            keys = sorted(set(base) & set(candidate_values[a["id"]]) & set(candidate_values[b["id"]]))
            am = metrics(_metric_rows(base, candidate_values[a["id"]], keys, cap, plan.get("costCap")))
            bm = metrics(_metric_rows(base, candidate_values[b["id"]], keys, cap, plan.get("costCap")))
            pairwise.append({"left": a["id"], "right": b["id"], "n": len(keys),
                             "identities": [json.loads(k) for k in keys], "leftMetrics": am, "rightMetrics": bm,
                             "differenceLeftMinusRight": metric_differences(am, bm)})
    bootstrap_result = cluster_bootstrap(plan, base, candidate_values, common, cap)
    report = {"schema": REPORT_SCHEMA, "studyId": plan["id"], "planSha256": sha(canonical(plan)), "plan": plan,
              "research": plan["research"], "estimand": "COMMON_COMPLETE_CASE_COHORT",
              "populationComplete": population_complete, "counts": counts,
              "weighting": plan["weighting"], "weightMeaning": plan.get("weightMeaning"),
              "costCap": plan.get("costCap"), "candidates": result_candidates,
              "calibrationSamples": training_sets, "pairwise": pairwise, "bootstrap": bootstrap_result,
              "rows": row_results, "excluded": excluded, "extraIdentities": extras,
              "findings": findings, "warnings": warnings,
              "inputs": [{"sha256": digest, "bytes": len(body)} for digest, body in sorted(inputs.raw.items())],
              "limits": LIMITS, "engineInvoked": False}
    report["sha256"] = sha(canonical(report))
    return report

def report_html(report):
    """Complete offline, read-only report with exact original JSON download."""
    import base64
    raw = canonical(report)
    encoded = base64.b64encode(raw).decode("ascii")
    template = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>Risk-adjustment study report</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f4f4;color:#191919;font:15px/1.5 system-ui,sans-serif}
main{max-width:1420px;margin:auto;padding:30px}h1{font-size:28px;line-height:1.25;max-width:1050px;margin:8px 0 14px}h2{font-size:20px;margin:0 0 12px}
p{max-width:1100px;margin:10px 0}.muted{color:#555}.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:12px}
.panel{background:#fff;border:1px solid #bbb;padding:20px;margin:20px 0}.toolbar,nav,.pager{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
button,input,select{font:inherit;min-height:40px;border:1px solid #777;border-radius:2px;background:#fff;color:#111;padding:8px 12px}
button{cursor:pointer}button:disabled{opacity:.45;cursor:default}button[aria-pressed=true]{background:#222;color:#fff;border-color:#222}
button:hover:not(:disabled){box-shadow:inset 0 0 0 1px #333}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #666;outline-offset:3px}
#stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}.stat{background:#fff;border:1px solid #bbb;padding:14px}.stat span{display:block;color:#555}.stat strong{font-size:27px}
dl{display:grid;grid-template-columns:170px minmax(0,1fr);gap:8px 20px}dt{font-weight:650}dd{margin:0;overflow-wrap:anywhere}
nav{margin:18px 0}nav button{min-height:36px;font-size:14px}.table-scroll{overflow:auto;max-height:65vh;border:1px solid #aaa;margin:16px 0}
table{width:100%;border-collapse:collapse;background:#fff;font-size:14px}th,td{padding:11px 13px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
th{white-space:nowrap;background:#eee;position:sticky;top:0;z-index:1}td{max-width:420px;overflow-wrap:anywhere}td button{min-height:32px;padding:4px 9px}
.pager{justify-content:space-between}.pager p{margin:0}#search{flex:1;min-width:180px}.field{display:flex;align-items:center;gap:8px}
pre{font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;border:1px solid #ccc;padding:16px;max-height:65vh;overflow:auto}
#detail{position:fixed;inset:3vh 3vw;background:#fff;border:2px solid #444;box-shadow:0 0 0 100vmax #0008;padding:24px;z-index:5;overflow:auto}
#detail[hidden]{display:none}.detail-top{display:flex;gap:20px;justify-content:space-between;align-items:start}#identity{font-size:12px;overflow-wrap:anywhere;border-top:1px solid #bbb;padding-top:18px}
@media(max-width:700px){main{padding:16px}h1{font-size:23px}.panel{padding:14px}#stats{grid-template-columns:repeat(2,minmax(0,1fr))}dl{grid-template-columns:1fr;gap:3px}dd{margin-bottom:12px}.toolbar button{flex:1}#detail{inset:12px;padding:16px}.stat strong{font-size:23px}.pager{align-items:flex-start}}
@media print{body{background:#fff}main{max-width:none;padding:0}.toolbar,nav,.pager,#detail,#search,.field{display:none!important}.table-scroll{max-height:none;overflow:visible}th{position:static}.panel{break-inside:avoid}button{display:none}#print-note{display:block!important}}
</style></head><body><main id="report-main">
<div class="eyebrow">Research analysis · retained result</div>
<h1 id="title">Risk-adjustment study</h1><p id="subtitle" class="muted"></p>
<p id="population"></p><div id="stats"></div>
<div class="toolbar"><button type="button" id="download-json">Download complete exact JSON</button><button type="button" id="report-detail">Study and result identity</button><button type="button" id="print">Print visible report</button></div>
<section class="panel"><h2>Study definition</h2><dl id="study"></dl><button type="button" id="research-detail">Open complete definition</button><ul id="warnings"></ul><p id="uncertainty-status"></p><button type="button" id="uncertainty-detail">Open complete uncertainty result</button></section>
<section class="panel"><nav id="views" aria-label="Result views"></nav><h2 id="table-title"></h2><p id="table-description"></p>
<div class="toolbar"><label for="search">Find records</label><input id="search" type="search" placeholder="Search complete records in this view"><label class="field" for="page-size">Rows per page <select id="page-size"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option></select></label><button id="download-table" type="button">Download all rows in this table</button></div>
<p class="muted">Displayed decimal values use the analysis precision. Open a complete record or use the exact JSON for original fractions and metadata. Table downloads include every row, regardless of the filter or page.</p>
<div class="table-scroll" role="region" aria-label="Selected study result table" tabindex="0"><table><thead id="table-head"></thead><tbody id="table-body"></tbody></table></div>
<div class="pager"><button type="button" id="previous">Previous</button><p id="page-info" role="status" aria-live="polite"></p><button type="button" id="next">Next</button></div>
<p id="print-note" hidden>This printout contains the selected visible table page. The complete original study remains in the exact JSON download and offline report.</p></section>
<p id="identity" class="muted"></p><noscript>This self-contained report needs JavaScript to present its complete retained analysis. Enable JavaScript in the local browser, or open the accompanying complete JSON result.</noscript>
</main><section id="detail" hidden role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="detail-top"><h2 id="detail-title"></h2><button type="button" id="detail-close">Close record</button></div><pre id="detail-body"></pre></section>
<script id="study-data" type="application/octet-stream">__STUDY_BASE64__</script>
<script>(() => {
"use strict";
const raw = new TextDecoder("utf-8", {fatal:true}).decode(Uint8Array.from(atob(document.getElementById("study-data").textContent.trim()), c => c.charCodeAt(0)));
const report = JSON.parse(raw);
const plan=report.plan||{};
const descriptors=new Map();
function collectDescriptors(v){if(!v||typeof v!=="object")return;if(typeof v.sha256==="string"&&typeof v.name==="string"&&typeof v.bytes==="number"){const a=descriptors.get(v.sha256)||[];if(!a.some(x=>x.name===v.name))a.push(v);descriptors.set(v.sha256,a);}for(const child of Object.values(v))if(child&&typeof child==="object")collectDescriptors(child);}
collectDescriptors(plan);
const candidateDefinition=id=>(plan.candidates||[]).find(c=>c.id===id)||null;
const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=String(text); if(className)n.className=className; return n; };
const names=new Map((report.candidates||[]).map(c=>[c.id,c.label]));
const name=id=>names.get(id)||id;
const pretty=value=>{
  if(value===null||value===undefined)return "Unavailable";
  if(typeof value!=="object")return String(value);
  if(value.present===false)return "Missing source field";
  if(value.present===true){if(value.type==="json-number"||value.type==="json-integer")return value.lexeme;return pretty(value.value);}
  if(value.display!==undefined)return String(value.display);
  if(Object.prototype.hasOwnProperty.call(value,"unavailable")&&Object.prototype.hasOwnProperty.call(value,"value"))return value.value===null?"Unavailable: "+value.unavailable:pretty(value.value);
  return JSON.stringify(value);
};
const idText=ids=>(ids||[]).map(v=>String(v.value)+" ["+v.type+"]").join(" / ");
const metricColumns=[
 ["Rows",m=>m.n],["Weight",m=>m.weight],["Actual total",m=>m.actualWeightedSum],
 ["Predicted total",m=>m.predictedWeightedSum],["Mean error",m=>m.bias],
 ["MAE",m=>m.mae],["RMSE",m=>m.rmse],["R²",m=>m.rSquared],["Predictive ratio",m=>m.predictiveRatio]
];
const candidateRows=(report.candidates||[]).flatMap(c=>[
 {candidate:c.label,cohort:"Selected primary analysis",metrics:c.commonCohort,source:{definition:candidateDefinition(c.id),result:c}},
 {candidate:c.label,cohort:"Uncapped same cohort",metrics:c.uncappedCommonCohort,source:{definition:candidateDefinition(c.id),result:c}}
]);
const pairs=report.pairwise||[];
const pairedRows=pairs.flatMap(p=>[
 {pair:name(p.left)+" / "+name(p.right),side:name(p.left),metrics:p.leftMetrics,source:p},
 {pair:name(p.left)+" / "+name(p.right),side:name(p.right),metrics:p.rightMetrics,source:p}
]);
const diffRows=pairs.map(p=>({pair:name(p.left)+" minus "+name(p.right),n:p.n,...p.differenceLeftMinusRight,source:p}));
const subgroupRows=(report.candidates||[]).flatMap(c=>(c.subgroups||[]).map(s=>({candidate:c.label,group:s.groupId,value:s.value,metrics:s.metrics,source:s})));
const uncertainty=report.bootstrap;
const intervalRows=(uncertainty?.pairedIntervals||[]).map(r=>({...r,pair:name(r.left)+" minus "+name(r.right)}));
const drawRows=uncertainty?.repetitions||[];
const issueRows=[...(report.findings||[]).map(x=>({kind:"Input finding",...x})),
 ...(report.excluded||[]).map(x=>({kind:"Explicit exclusion",code:x.reason,...x})),
 ...Object.entries(report.extraIdentities||{}).flatMap(([table,values])=>values.map(identity=>({kind:"Outside cohort",code:"EXTRA_IDENTITY",table,identity})))];
const coverageRows=[
 {table:"Cohort",...(report.counts?.cohort||{})},
 {table:"Outcomes",...(report.counts?.outcomes||{})},
 ...Object.entries(report.counts?.predictions||{}).map(([id,c])=>({table:name(id),...c}))
];
const tables={
 coverage:{label:"Coverage",description:"Original row counts, extraction coverage and duplicate identities remain visible before any complete-case comparison.",
 columns:[["Table",r=>r.table],["Received rows",r=>r.rows],["Expected rows",r=>r.expectedRows],["Declared coverage matched",r=>r.coverageVerified],["Invalid identity rows",r=>(r.invalidIdentityRows||[]).length],["Duplicate identities",r=>(r.duplicateIdentities||[]).length]],rows:coverageRows},
 candidates:{label:"Candidate results",description:"Each candidate uses the same all-model complete cohort. The uncapped line preserves the alternative when an outcome cap was selected.",
 columns:[["Candidate",r=>r.candidate],["Analysis",r=>r.cohort],...metricColumns.map(([h,f])=>[h,r=>f(r.metrics||{})])],rows:candidateRows},
 paired:{label:"Pairwise results",description:"Each pair retains its own common denominator. Open a row for the complete identities and both candidate results.",
 columns:[["Pair",r=>r.pair],["Candidate",r=>r.side],...metricColumns.map(([h,f])=>[h,r=>f(r.metrics||{})])],rows:pairedRows},
 differences:{label:"Paired differences",description:"Signed changes are left minus right. Lower error and higher R² have different interpretations; inspect the actual values and denominator.",
 columns:[["Comparison",r=>r.pair],["Rows",r=>r.n],["MAE change",r=>r.mae],["MSE change",r=>r.mse],["Mean error change",r=>r.bias],["R² change",r=>r.rSquared],["Predictive ratio change",r=>r.predictiveRatio],["Normalized MAE change",r=>r.normalizedMAE]],rows:diffRows},
 subgroups:{label:"Subgroups",description:"The same retained group definitions are applied to each candidate. Group counts and full exact values accompany every metric.",
 columns:[["Candidate",r=>r.candidate],["Dimension",r=>r.group],["Source value",r=>r.value],...metricColumns.map(([h,f])=>[h,r=>f(r.metrics||{})])],rows:subgroupRows},
 uncertainty:{label:"Uncertainty",description:"Intervals use the retained common-cohort patient-cluster draws. Status identifies intervals conditional on defined replicates and unavailable intervals. Open a row for the exact undefined causes; the original primary estimates remain in the metric views.",
 columns:[["Comparison",r=>r.pair],["Metric",r=>r.metric],["Status",r=>r.status||"Not recorded"],["Valid replicates",r=>r.validReplicates],["Undefined replicates",r=>r.undefinedReplicates??"Not recorded"],["Requested replicates",r=>r.requestedReplicates],["Lower",r=>r.lower],["Upper",r=>r.upper],["Unavailable reason",r=>r.unavailable],["Method",r=>r.method]],rows:intervalRows},
 repetitions:{label:"Bootstrap draws",description:"Every retained draw is available. Open a draw for its complete candidate metrics, paired differences, multiplicities and sampling identity.",
 columns:[["Replicate",r=>r.replicate],["Sample identity",r=>r.sampleSha256],["Sampled rows",r=>r.sampledRows??r.counts?.sampledRows],["Distinct rows",r=>r.distinctRows??r.counts?.distinctRows],["Sampled clusters",r=>r.sampledClusters??r.counts?.sampledClusters],["Distinct clusters",r=>r.distinctClusters??r.counts?.distinctClusters]],rows:drawRows},
 issues:{label:"Exclusions and findings",description:"Input findings, explicit exclusions and observations outside the cohort are retained in full. Filtering this display changes no study data.",
 columns:[["Kind",r=>r.kind],["Reason",r=>r.code],["Table",r=>name(r.table)||""],["Row",r=>r.row??(r.rows||[]).join(", ")],["Identity",r=>idText(r.identity)],["Detail",r=>r.message??r.reason??"Open complete record"]],rows:issueRows},
 observations:{label:"Observations",description:"Inspect original cohort identity, inclusion, outcome, weight and each candidate prediction. Complete records retain exact numerator and denominator.",
 columns:[["Identity",r=>idText(r.identity)],["Cohort row",r=>r.cohortRow],["Eligible",r=>r.eligible],["Common included",r=>r.commonIncluded],["Outcome row",r=>r.outcomeRow],["Actual",r=>r.actual],["Weight",r=>r.weight],...(report.candidates||[]).map(c=>[c.label,r=>r.candidates?.[c.id]?.scaledPrediction])],rows:report.rows||[]},
 files:{label:"Input files",description:"These identities bind the complete original input bytes used in this analysis. The files themselves remain in the selected receiving package.",
 columns:[["Original names",r=>(descriptors.get(r.sha256)||[]).map(d=>d.name).join(" / ")||"See original input inventory"],["SHA-256",r=>r.sha256],["Bytes",r=>r.bytes]],rows:(report.inputs||[]).map(r=>({...r,descriptors:descriptors.get(r.sha256)||[]}))}
};
let current="candidates", page=0, filtered=[], searchTimer, returnFocus=null;
function details(value,title){
 returnFocus=document.activeElement;
 $("report-main").inert=true;
 $("detail-title").textContent=title;
 $("detail-body").textContent=JSON.stringify(value,null,2);
 $("detail").hidden=false;
 $("detail-close").focus();
}
function closeDetail(){$("detail").hidden=true;$("report-main").inert=false;if(returnFocus&&typeof returnFocus.focus==="function")returnFocus.focus();}
$("detail-close").addEventListener("click",closeDetail);
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("detail").hidden){event.preventDefault();closeDetail();}});
$("research-detail").addEventListener("click",()=>details({research:report.research,protocol:report.plan||null},"Complete research definition"));
$("uncertainty-detail").addEventListener("click",()=>details(report.bootstrap,"Complete uncertainty result"));
$("report-detail").addEventListener("click",()=>details({schema:report.schema,studyId:report.studyId,planSha256:report.planSha256,sha256:report.sha256,estimand:report.estimand,weighting:report.weighting,weightMeaning:report.weightMeaning,costCap:report.costCap,calibrationSamples:report.calibrationSamples,limits:report.limits},"Study definition and output identity"));
const urls=new Set();
function download(body,type,filename){
 const url=URL.createObjectURL(new Blob([body],{type}));urls.add(url);
 const a=el("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);
}
$("download-json").addEventListener("click",()=>download(raw,"application/json","risk-study-"+report.studyId+".json"));
function csv(value){
 let s=pretty(value);
 // Presentation CSV is for reading. Original exact numerators/denominators stay in the complete JSON.
 if(/^[=+@\t\r]/.test(s)||(/^[-]/.test(s)&&!/^-\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s)))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
$("download-table").addEventListener("click",()=>{
 const table=tables[current];
 const lines=[table.columns.map(([h])=>csv(h)).join(",")];
 for(const row of table.rows)lines.push(table.columns.map(([,get])=>csv(get(row))).join(","));
 download("\ufeff"+lines.join("\r\n")+"\r\n","text/csv;charset=utf-8","risk-study-"+current+"-all-rows.csv");
});
function render(){
 const table=tables[current],size=Number($("page-size").value);
 const query=$("search").value.trim().toLocaleLowerCase();
 filtered=query?table.rows.filter(row=>JSON.stringify(row).toLocaleLowerCase().includes(query)):table.rows;
 const pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.min(page,pages-1);
 $("table-title").textContent=table.label;
 $("table-description").textContent=table.description;
 $("table-head").replaceChildren();
 const tr=el("tr");
 for(const [h]of table.columns){const th=el("th",h);th.scope="col";tr.append(th);}
 tr.append(el("th","Complete record"));$("table-head").append(tr);
 $("table-body").replaceChildren();
 const start=page*size,end=Math.min(start+size,filtered.length);
 for(let i=start;i<end;i++){
  const record=filtered[i],row=el("tr");
  for(const [,get]of table.columns)row.append(el("td",pretty(get(record))));
  const td=el("td"),button=el("button","Open");button.type="button";
  button.setAttribute("aria-label","Open complete "+table.label.toLowerCase()+" record "+(i+1));
  button.addEventListener("click",()=>details(record.source||record,table.label+" — complete record"));
  td.append(button);row.append(td);$("table-body").append(row);
 }
 if(!filtered.length){const row=el("tr"),cell=el("td",query?"No matching records. Clear the filter to see the complete table.":"No records for this view in the retained result.");cell.colSpan=table.columns.length+1;row.append(cell);$("table-body").append(row);}
 $("page-info").textContent=(filtered.length?String(start+1)+"–"+end:"0")+" of "+filtered.length+" matching records; "+table.rows.length+" total. Page "+(page+1)+" of "+pages+".";
 $("previous").disabled=page===0;$("next").disabled=page+1>=pages;
 for(const b of $("views").children){const selected=b.dataset.view===current;b.setAttribute("aria-pressed",String(selected));}
}
for(const [key,table]of Object.entries(tables)){
 const button=el("button",table.label);button.type="button";button.dataset.view=key;
 button.addEventListener("click",()=>{current=key;page=0;$("search").value="";render();});
 $("views").append(button);
}
$("search").addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=0;render();},180);});
$("page-size").addEventListener("change",()=>{page=0;render();});
$("previous").addEventListener("click",()=>{page=Math.max(0,page-1);render();});
$("next").addEventListener("click",()=>{page++;render();});
$("print").addEventListener("click",()=>window.print());
$("title").textContent=report.research?.question||"Risk-adjustment study";
$("subtitle").textContent=[report.research?.market,report.research?.timing,report.research?.costBasis,report.research?.currency,report.research?.costUnit].filter(Boolean).join(" · ");
$("population").textContent=report.populationComplete?"The declared input coverage and eligible prediction population reconcile.":"The comparison uses the available common cohort. Review coverage and exclusions for the intended population.";
for(const [label,value]of [["Eligible unique observations",report.counts?.eligibleUnique],["Valid outcome and weight",report.counts?.validActualAndWeight],["All-model common observations",report.counts?.commonValid],["Explicit exclusions",report.counts?.explicitlyExcluded]]){
 const card=el("div",undefined,"stat");card.append(el("span",label),el("strong",pretty(value)));$("stats").append(card);
}
for(const warning of report.warnings||[])$("warnings").append(el("li",warning.message));
const study=report.research||{};
for(const [label,value]of [["Investigator",study.investigator],["Population",study.population],["Predictor window",pretty(study.inputWindow)],["Outcome window",pretty(study.outcomeWindow)],["Timing rationale",study.timingRationale],["Weight meaning",report.weightMeaning||report.weighting],["Limitations",study.limitations]]){
 const dt=el("dt",label),dd=el("dd",pretty(value));$("study").append(dt,dd);
}
$("uncertainty-status").textContent=uncertainty?("Uncertainty: "+uncertainty.status+". "+(uncertainty.reason||uncertainty.limitations||"Open the complete result for the selected procedure and resource details.")):"Uncertainty was not selected for this result.";
$("uncertainty-detail").disabled=!uncertainty;
$("identity").textContent="Study "+report.studyId+" · Result "+report.sha256;
window.addEventListener("pagehide",()=>{for(const u of urls)URL.revokeObjectURL(u);urls.clear();});
render();
})();</script></body></html>'''
    return template.replace("__STUDY_BASE64__", encoded)

def read_local_blob(root, descriptors, digest):
    desc = descriptors[digest]
    path = Path(desc["path"])
    if path.is_absolute() or ".." in path.parts:
        fail("PATH", "Input paths must stay inside the selected input directory")
    target = root.joinpath(path)
    if target.is_symlink() or root not in target.resolve().parents:
        fail("PATH", "Input path must resolve inside the selected input directory")
    if not target.is_file() or target.stat().st_size != desc["bytes"]:
        fail("FILE", "Complete original input is absent or has changed size", path=str(path))
    return target.read_bytes()


def retain_output(path, body):
    """Publish one complete immutable output under its existing permanent flock."""
    if len(body) > LIMITS["reportBytes"]:
        fail("CAPACITY", "Complete report exceeds the supported output size")
    path = Path(path)
    lock = path.with_name(path.name + ".lock")
    fd = os.open(lock, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        partial = path.with_name(path.name + "." + sha(body) + ".partial")
        if path.exists():
            if path.read_bytes() != body:
                fail("OUTPUT_EXISTS", "Existing output differs; select a new report edition", path=str(path))
            if partial.exists() and os.path.samefile(path, partial):
                partial.unlink()
            return
        if partial.exists():
            if partial.read_bytes() != body:
                partial.unlink()
        if not partial.exists():
            with partial.open("xb") as f:
                f.write(body)
                f.flush()
                os.fsync(f.fileno())
        os.link(partial, path)
        partial.unlink()
        parent_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
    finally:
        os.close(fd)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--files", required=True, help="JSON array of complete descriptors plus relative path")
    parser.add_argument("--input-root", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--html", required=True)
    args = parser.parse_args(argv)
    plan = json.loads(Path(args.plan).read_text("utf-8"))
    entries = json.loads(Path(args.files).read_text("utf-8"))
    if not isinstance(entries, list):
        fail("FILES", "File inventory must be an array")
    descriptors = {}
    if len(entries) > LIMITS["files"]:
        fail("FILES", "File inventory exceeds the complete input capacity")
    for entry in entries:
        descriptor(entry)
        if entry["sha256"] in descriptors:
            fail("FILES", "Inventory must contain each exact file once")
        descriptors[entry["sha256"]] = entry
    root = Path(args.input_root).resolve(strict=True)
    result = evaluate(plan, lambda digest: read_local_blob(root, descriptors, digest))
    outputs = [(Path(args.report), canonical(result)), (Path(args.html), report_html(result).encode("utf-8"))]
    for path, body in outputs:
        retain_output(path, body)
    print(json.dumps({"studyId": result["studyId"], "reportSha256": result["sha256"],
                      "commonValid": result["counts"]["commonValid"],
                      "populationComplete": result["populationComplete"], "engineInvoked": False}))
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (StudyError, OSError, KeyError) as exc:
        print(json.dumps({"error": exc.as_dict() if isinstance(exc, StudyError) else str(exc)}))
        raise SystemExit(2)
