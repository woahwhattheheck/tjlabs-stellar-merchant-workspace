"""MIT. Explicit HILA methodology, full denominators and source-bound cohort comparison."""
from __future__ import annotations

from collections import Counter
from datetime import datetime
from decimal import Decimal, localcontext, ROUND_HALF_EVEN
import re

from hila_questionnaire import (InputError, canonical, sha, DIMENSIONS, AXIS_FIELDS,
                                CONSENT, NEW_INFORMATION, Expression, UNKNOWN,
                                compile_conditions, relevant)

RULES = "stellar-forge.hila-rules.v1"
REPORT = "stellar-forge.hila-report.v1"
SEMANTICS = "hila-explicit-weighted-items-equal-respondents-1"
DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?\Z")
STATES = ("eligible", "answered", "explicitNonResponse", "explicitMissing", "missing", "unmappedField",
          "invalid", "notRelevant", "unknownEligibility", "staleHiddenAnswer")


def plain(value, label, limit=4000, required=False):
    if not isinstance(value, str) or len(value) > limit or "\x00" in value:
        raise InputError(label + " must be a bounded string")
    if required and not value.strip():
        raise InputError(label + " must name the selected original basis")
    return value


def decimal(value, label, *, positive=False):
    if not isinstance(value, str) or len(value) > 40 or not DECIMAL.fullmatch(value):
        raise InputError(label + " must be an exact decimal string with at most twelve fractional digits")
    number = Decimal(value)
    if abs(number) > Decimal("1000000000") or positive and number <= 0:
        raise InputError(label + " is outside its supported numeric bound")
    return number


def number(value, places=12):
    if value is None:
        return None
    with localcontext() as context:
        context.prec = 60
        value = value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_EVEN)
        if value == 0:
            return "0"
        return format(value, "f").rstrip("0").rstrip(".") if "." in format(value, "f") else str(value)


def instant(value, label):
    plain(value, label, 80, True)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as e:
        raise InputError(label + " must be an ISO timestamp with an explicit offset") from e
    if parsed.tzinfo is None:
        raise InputError(label + " must include its original UTC offset")
    return value


def template(form):
    return {
        "schema": RULES, "semantics": SEMANTICS, "questionnaire": form["sha256"],
        "name": "HILA methodology awaiting the selected scoring and disclosure definition",
        "status": "draft",
        "provenance": {"label": "", "url": "", "version": "", "approvedBy": "",
                       "approvedAt": "", "notes": ""},
        "dimensions": [
            {"id": ident, "minimumAnswered": None,
             "items": [{"field": field, "included": True, "reason": "", "weight": None,
                        "scores": {choice["value"]: None for choice in form["fields"][field]["choices"]}}
                       for field in paths]}
            for ident, paths in form["dimensions"].items()
        ],
        "disclosure": {"status": "draft", "approvedBy": "", "approvedAt": "",
                       "basis": "", "minimumRespondents": None, "minimumScored": None,
                       "complementarySuppression": "whole-axis", "releaseComparisons": False},
    }


def validate_rules(raw, form):
    expected = {"schema", "semantics", "questionnaire", "name", "status", "provenance", "dimensions", "disclosure"}
    if not isinstance(raw, dict) or set(raw) != expected or raw.get("schema") != RULES:
        raise InputError("Supply the complete HILA methodology document")
    if raw.get("semantics") != SEMANTICS or raw.get("questionnaire") != form["sha256"]:
        raise InputError("Methodology must select the exact questionnaire and supported calculation semantics")
    if raw["status"] not in {"draft", "approved"}:
        raise InputError("Methodology status must be draft or approved")
    approved = raw["status"] == "approved"
    plain(raw["name"], "Methodology name", 160, True)
    provenance = raw["provenance"]
    if not isinstance(provenance, dict) or set(provenance) != {"label", "url", "version", "approvedBy", "approvedAt", "notes"}:
        raise InputError("Methodology requires its complete original provenance")
    for key, value in provenance.items():
        plain(value, "Methodology provenance " + key, 4000, approved and key in {"label", "version", "approvedBy"})
    if approved:
        instant(provenance["approvedAt"], "Methodology approval time")
    dimensions = raw["dimensions"]
    if not isinstance(dimensions, list) or len(dimensions) != 5 or {d.get("id") for d in dimensions if isinstance(d, dict)} != set(DIMENSIONS):
        raise InputError("Methodology must retain all five original dimensions exactly once")
    normalized = []
    for dimension in sorted(dimensions, key=lambda d: list(DIMENSIONS).index(d["id"])):
        if set(dimension) != {"id", "minimumAnswered", "items"}:
            raise InputError("Unexpected dimension calculation fields")
        items = dimension["items"]
        original_fields = form["dimensions"][dimension["id"]]
        if not isinstance(items, list) or len(items) != len(original_fields) or {item.get("field") for item in items if isinstance(item, dict)} != set(original_fields):
            raise InputError("Each dimension must account explicitly for every original assessment item")
        included = 0
        for item in items:
            if set(item) != {"field", "included", "reason", "weight", "scores"} or type(item["included"]) is not bool:
                raise InputError("Each original assessment item needs its complete explicit scoring selection")
            included += item["included"]
            plain(item["reason"], "Item reason", 2000, not item["included"])
            choices = {choice["value"] for choice in form["fields"][item["field"]]["choices"]}
            if not isinstance(item["scores"], dict) or set(item["scores"]) != choices:
                raise InputError("Score mapping must account for every original answer code, including non-response")
            if item["scores"].get("no_response") is not None:
                raise InputError("The original non-response code must remain non-numeric")
            for code, value in item["scores"].items():
                if value is not None:
                    decimal(value, "Score for " + code)
            if item["weight"] is not None:
                decimal(item["weight"], "Item weight", positive=True)
            if approved and item["included"] and (item["weight"] is None or all(value is None for value in item["scores"].values())):
                raise InputError("An approved included item requires its weight and at least one explicit scored answer")
        minimum = dimension["minimumAnswered"]
        if minimum is not None and (type(minimum) is not int or not 1 <= minimum <= included):
            raise InputError("Minimum answered items must be within the included item count")
        if approved and (not included or minimum is None):
            raise InputError("Approved dimensions require explicit minimum answered items")
        normalized.append({**dimension, "items": sorted(items, key=lambda x: original_fields.index(x["field"]))})
    disclosure = raw["disclosure"]
    if not isinstance(disclosure, dict) or set(disclosure) != {"status", "approvedBy", "approvedAt", "basis", "minimumRespondents", "minimumScored", "complementarySuppression", "releaseComparisons"}:
        raise InputError("Supply the complete disclosure and release definition")
    if disclosure["status"] not in {"draft", "approved"} or disclosure["complementarySuppression"] != "whole-axis":
        raise InputError("Disclosure must retain the supported conservative whole-axis suppression rule")
    if type(disclosure["releaseComparisons"]) is not bool:
        raise InputError("Comparison release must be explicitly selected")
    for key in ["approvedBy", "approvedAt", "basis"]:
        plain(disclosure[key], "Disclosure " + key, 4000, disclosure["status"] == "approved")
    for key in ["minimumRespondents", "minimumScored"]:
        value = disclosure[key]
        if value is not None and (type(value) is not int or not 1 <= value <= 100000):
            raise InputError("Disclosure minimums must be explicit positive respondent counts")
        if disclosure["status"] == "approved" and value is None:
            raise InputError("Approved disclosure requires both original minimum respondent counts")
    if disclosure["status"] == "approved":
        instant(disclosure["approvedAt"], "Disclosure approval time")
    result = {**raw, "dimensions": normalized}
    if len(canonical(result)) > 65536:
        raise InputError("Methodology exceeds 64 KiB")
    return result


def cell_key(dimension, axis, value):
    return sha(canonical({"dimension": dimension, "axis": axis, "value": value}))


def _value_state(form, path, answers, mapped, conditions):
    field = form["fields"][path]
    eligible = relevant(form, path, answers, conditions)
    value = answers.get(path)
    if eligible is False:
        return "notRelevant", [], value not in (None, "", [])
    if eligible is None:
        return "unknownEligibility", [], False
    if path not in mapped:
        return "unmappedField", [], False
    if path not in answers or value in (None, "", []):
        return "missing", [], False
    choices = value if isinstance(value, list) else str(value).split()
    known = {choice["value"] for choice in field["choices"]}
    if (len(set(choices)) != len(choices) or any(code not in known for code in choices) or
        field["kind"] == "select1" and len(choices) != 1):
        return "invalid", [], False
    constraint = field["binding"].get("constraint")
    if constraint:
        try:
            check = Expression(constraint, form["root"]).evaluate(answers, value)
        except InputError:
            check = UNKNOWN
        if check is UNKNOWN or not check:
            return "invalid", [], False
    return ("explicitNonResponse" if choices == ["no_response"] else "answered"), choices, False


def _memberships(form, answers, mapped, conditions):
    result = {"overall": [None]}
    for axis, paths in AXIS_FIELDS.items():
        values = set()
        for path in paths:
            if path not in form["fields"]:
                continue
            state, choices, stale = _value_state(form, path, answers, mapped, conditions)
            if state in {"answered", "explicitNonResponse"}:
                values.update(choices)
        result[axis] = sorted(values) if values else [None]
    return result


def analyse(form, edition, rules, rows, selection=None, decisions=None):
    """Read every original native projection once; retain complete distinct denominators."""
    conditions = compile_conditions(form)
    mapped = set(edition["mapping"])
    selection = selection or {}
    decisions = decisions or {}
    counts = Counter({key: 0 for key in ["sourceRows", "consenting", "declined", "consentMissing",
                                        "selected", "excludedBySelection", "excludedByReview", "noNewInformation",
                                        "newInformation", "newInformationOther", "scoredRespondents"]})
    fields = {path: {"field": path, "states": Counter({state: 0 for state in STATES}),
                     "values": Counter()} for path, field in form["fields"].items() if field["analysisAllowed"]}
    cells = {}
    scoring = rules["status"] == "approved"
    seen_decisions = set()
    row_events = []
    def new_cell(dimension, axis, value):
        return {"key": cell_key(dimension, axis, value), "dimension": dimension,
                "axis": axis, "value": value, "respondents": 0, "scoredRespondents": 0,
                "scoreSum": Decimal(0), "states": Counter({state: 0 for state in STATES}),
                "items": {item["field"]: {"states": Counter({state: 0 for state in STATES}),
                                         "values": Counter()} for item in dimension_rules[dimension]["items"]}}
    dimension_rules = {d["id"]: d for d in rules["dimensions"]}
    with localcontext() as context:
        context.prec = 60
        for row in rows:
            counts["sourceRows"] += 1
            ident, answers = row["recordId"], row["answers"]
            decision = decisions.get(ident)
            if decision:
                seen_decisions.add(ident)
            consent = answers.get(CONSENT)
            if consent != "yes":
                counts["declined" if consent == "no" else "consentMissing"] += 1
                continue
            counts["consenting"] += 1
            members = _memberships(form, answers, mapped, conditions)
            if any(values and not (set(values) & set(members[axis])) for axis, values in selection.items()):
                counts["excludedBySelection"] += 1
                continue
            if decision and decision["decision"] == "exclude":
                counts["excludedByReview"] += 1
                continue
            counts["selected"] += 1
            gate = answers.get(NEW_INFORMATION)
            counts["newInformation" if gate == "yes" else "noNewInformation" if gate == "no" else "newInformationOther"] += 1
            states = {}
            for path, entry in fields.items():
                state, choices, stale = _value_state(form, path, answers, mapped, conditions)
                entry["states"][state] += 1
                if state not in {"notRelevant", "unknownEligibility"}:
                    entry["states"]["eligible"] += 1
                if stale:
                    entry["states"]["staleHiddenAnswer"] += 1
                entry["values"].update(choices)
                states[path] = state, choices, stale
            some_score = False
            for dimension in rules["dimensions"]:
                weighted, weights, answered = Decimal(0), Decimal(0), 0
                item_results = []
                for item in dimension["items"]:
                    state, choices, stale = states[item["field"]]
                    output_state = state
                    if state == "answered" and scoring and item["included"]:
                        score = item["scores"][choices[0]]
                        if score is None:
                            output_state = "explicitMissing"
                        else:
                            weight = Decimal(item["weight"])
                            weighted += Decimal(score) * weight
                            weights += weight
                            answered += 1
                    item_results.append((item, output_state, choices, stale))
                score = weighted / weights if scoring and weights and answered >= dimension["minimumAnswered"] else None
                some_score |= score is not None
                for axis, values in members.items():
                    for value in values:
                        key = cell_key(dimension["id"], axis, value)
                        cell = cells.get(key)
                        if cell is None:
                            cell = cells[key] = new_cell(dimension["id"], axis, value)
                        cell["respondents"] += 1
                        if score is not None:
                            cell["scoredRespondents"] += 1
                            cell["scoreSum"] += score
                        for item, state, choices, stale in item_results:
                            selected = cell["items"][item["field"]]
                            selected["states"][state] += 1
                            selected["values"].update(choices)
                            cell["states"][state] += 1
                            if state not in {"notRelevant", "unknownEligibility"}:
                                selected["states"]["eligible"] += 1
                                cell["states"]["eligible"] += 1
                            if stale:
                                selected["states"]["staleHiddenAnswer"] += 1
                                cell["states"]["staleHiddenAnswer"] += 1
            counts["scoredRespondents"] += some_score
        missing_decisions = set(decisions) - seen_decisions
        if missing_decisions:
            raise InputError("A respondent review decision does not identify a retained source row: " + sorted(missing_decisions)[0])
        output_cells = []
        for cell in sorted(cells.values(), key=lambda c: (c["dimension"], c["axis"], "" if c["value"] is None else c["value"])):
            output_cells.append({
                **{k: v for k, v in cell.items() if k not in {"scoreSum", "states", "items"}},
                "scoreSum": number(cell["scoreSum"]),
                "meanScore": number(cell["scoreSum"] / cell["scoredRespondents"]) if cell["scoredRespondents"] else None,
                "states": dict(cell["states"]),
                "items": [{"field": path, "states": dict(item["states"]),
                           "values": dict(sorted(item["values"].items()))}
                          for path, item in cell["items"].items()],
            })
    return {
        "edition": edition["id"], "source": edition["source"], "questionnaire": form["sha256"],
        "rulesSha256": sha(canonical(rules)), "scoringStatus": "computed" if scoring else "unconfigured",
        "counts": dict(counts), "cells": output_cells,
        "fields": [{**entry, "states": dict(entry["states"]), "values": dict(sorted(entry["values"].items()))}
                   for entry in fields.values()],
        "coverage": {
            "mappedFields": len(mapped), "questionnaireAnalysisFields": len(fields),
            "unmappedFields": sorted(set(fields) - mapped),
            "unsupportedEligibility": sorted(path for path, expressions in conditions.items()
                                            if form["fields"][path]["analysisAllowed"] and
                                            any(expression is None for _, expression in expressions)),
            "membership": "Each respondent is counted once within each cell. Multi-select country and role cells overlap; cell totals must not be summed as distinct respondents.",
            "sample": "Descriptive respondent sample; no representativeness, population weighting or causal change is inferred.",
            "eligibility": "Original consent and inherited XForm branches. Hidden, missing, invalid and unmapped answers are separate; no-information responses are not assigned a zero score.",
        },
    }


def compare(before, after):
    left, right = {cell["key"]: cell for cell in before["cells"]}, {cell["key"]: cell for cell in after["cells"]}
    same_rules = before["rulesSha256"] == after["rulesSha256"] and before["questionnaire"] == after["questionnaire"]
    changes = []
    for key in sorted(set(left) | set(right)):
        a, b = left.get(key), right.get(key)
        source = b or a
        difference = None
        if same_rules and a and b and a["meanScore"] is not None and b["meanScore"] is not None:
            difference = number(Decimal(b["meanScore"]) - Decimal(a["meanScore"]))
        changes.append({
            "key": key, "dimension": source["dimension"], "axis": source["axis"], "value": source["value"],
            "status": "added" if a is None else "removed" if b is None else "retained",
            "before": a, "after": b, "meanDifference": difference,
            "respondentDifference": (b["respondents"] if b else 0) - (a["respondents"] if a else 0),
            "scoredDifference": (b["scoredRespondents"] if b else 0) - (a["scoredRespondents"] if a else 0),
        })
    return {
        "before": before["edition"], "after": after["edition"], "sameMethodology": same_rules,
        "semantics": "Same dimension/axis/code cells; independent respondent editions. Differences describe observed samples, not changes in the same individuals.",
        "beforeCounts": before["counts"], "afterCounts": after["counts"], "cells": changes,
    }


def public_report(report, rules, review):
    disclosure = rules["disclosure"]
    if rules["status"] != "approved" or disclosure["status"] != "approved" or review["status"] != "reviewed":
        raise InputError("Public aggregate release requires the selected approved methodology, disclosure rule and named reviewed revision")
    forbidden = set()
    for edition in report["editions"]:
        for cell in edition["cells"]:
            if cell["respondents"] < disclosure["minimumRespondents"] or cell["scoredRespondents"] < disclosure["minimumScored"]:
                forbidden.add((cell["dimension"], cell["axis"]))
    def selected(cell):
        return {key: cell[key] for key in ["key", "dimension", "axis", "value", "respondents",
                                          "scoredRespondents", "meanScore"]}
    editions = []
    for edition in report["editions"]:
        editions.append({
            "edition": edition["edition"], "rulesSha256": edition["rulesSha256"],
            "cells": [selected(cell) for cell in edition["cells"]
                      if (cell["dimension"], cell["axis"]) not in forbidden],
            "coverage": edition["coverage"],
        })
    comparisons = []
    if disclosure["releaseComparisons"] and report.get("comparison"):
        for cell in report["comparison"]["cells"]:
            if (cell["dimension"], cell["axis"]) not in forbidden:
                comparisons.append({
                    **{key: cell[key] for key in ["key", "dimension", "axis", "value", "status",
                                                  "meanDifference", "respondentDifference", "scoredDifference"]},
                    "before": selected(cell["before"]) if cell["before"] else None,
                    "after": selected(cell["after"]) if cell["after"] else None,
                })
    return {
        "schema": "stellar-forge.hila-public-aggregates.v1", "reviewId": report["reviewId"],
        "revision": report["revision"], "name": report["name"], "definitionSha256": report["definitionSha256"],
        "rulesSha256": sha(canonical(rules)), "methodology": rules, "review": review,
        "attribution": report["attribution"], "editions": editions, "comparison": comparisons,
        "suppressedAxes": [{"dimension": dimension, "axis": axis,
                            "reason": "The selected primary minimum protects the entire matching axis across all selected editions."}
                           for dimension, axis in sorted(forbidden)],
        "disclosure": "Public release contains aggregate cells only. Full private source rows, identifiers, free text, assessment-item counts and unsuppressed private reports are excluded.",
    }
