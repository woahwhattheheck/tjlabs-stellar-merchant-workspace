"""MIT. Source-bound IATI 2.03 results, explicit comparisons and exact decimal arithmetic.

Uses the original IATI Expat/Node walk. The retained whole publisher document
is the authority; generated keys identify its original element positions.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from decimal import Decimal, InvalidOperation, localcontext
import hashlib
import re

from iati_source import (
    InputError, XML_LANG, walk, children, child, node_object, objects,
    narratives, preferred, text_child, day, decimal, canonical, fingerprint,
)

PROJECTION = "stellar-forge.iati-results-source.v1"
REPORT = "stellar-forge.iati-results-report.v1"
COMPARISON = "stellar-forge.iati-results-comparison.v1"
CONTRACT = {
    "schema": "stellar-forge.iati-results-contract.v1",
    "standard": "2.03",
    "sourceReader": "original iati_source.walk / xml_source.Node",
    "identity": "SHA256 of source ID and exact original element locator",
    "numericMeasures": ["1", "2"],
    "measures": {"1": "Unit", "2": "Percentage", "3": "Nominal",
                 "4": "Ordinal", "5": "Qualitative"},
    "pairing": "Explicit original indicator and period, identical dimension/location context",
    "operations": ["inspect", "difference", "target-ratio", "baseline-progress", "baseline-change"],
    "baselineChange": "Explicit actual minus baseline in identical original context; no target or percentage is supplied",
    "aggregation": "No automatic sum across indicators, periods, dimensions or activities",
    "dates": "Original IATI day() retains the reported calendar date and its original text",
    "precision": "Source decimal strings; exact differences; ratios rounded to 12 decimal places",
    "review": "Named local interpretation, distinct from publisher validation or impact assurance",
    "references": [
        "https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/result/",
        "https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/result/indicator/",
        "https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/result/indicator/baseline/",
        "https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/result/indicator/period/",
        "https://iatistandard.org/en/iati-standard/203/codelists/IndicatorMeasure/",
    ],
}
MAX_INDICATORS = 100000
MAX_ROWS = 500000
HEX = re.compile(r"[0-9a-f]{64}\Z")
YEAR = re.compile(r"\+?[0-9]{4,9}\Z")


def source_key(source, locator):
    return fingerprint([source, locator])


def problem(code, message, locator, severity="review"):
    return {"code": code, "message": message, "locator": locator, "severity": severity}


def boolean(raw):
    if raw in ("true", "1"):
        return True
    if raw in ("false", "0"):
        return False
    return None


def _texts(node, name, language):
    return [n for container in children(node, name) for n in narratives(container, language)]


def _content(node, names):
    return {name: objects(node, name) for name in names}


def _finding_list(node, path, *, kind, measure):
    findings = []
    raw = node.attrs.get("value")
    number = decimal(raw) if isinstance(raw, str) else ""
    if measure == "5":
        if raw is not None:
            findings.append(problem("qualitative-value", "The original qualitative record also supplies @value; retain it as text.", path))
    elif raw is None:
        findings.append(problem("missing-value", "The original non-qualitative value is absent.", path))
    elif number == "":
        findings.append(problem("non-decimal-value", "The original value is not a supported finite XML decimal.", path))
    if kind == "baseline":
        year = node.attrs.get("year", "")
        if not YEAR.fullmatch(year) or int(year) <= 0:
            findings.append(problem("baseline-year", "The original baseline year is missing or invalid.", path))
        date = node.attrs.get("iso-date", "")
        if date and not day(date):
            findings.append(problem("baseline-date", "The original baseline date cannot be placed as a calendar day.", path))
        if date and day(date) and YEAR.fullmatch(year) and int(year) != int(day(date)[:4]):
            findings.append(problem("baseline-year-date", "The original baseline year and date disagree.", path))
    return findings, number


def _context(node, path, known_locations):
    dimensions = [deepcopy(n.attrs) for n in children(node, "dimension")]
    locations = [deepcopy(n.attrs) for n in children(node, "location")]
    findings = []
    names = [d.get("name", "") for d in dimensions]
    refs = [d.get("ref", "") for d in locations]
    if any(not d.get("name") or "value" not in d for d in dimensions):
        findings.append(problem("dimension-incomplete", "Each selected dimension needs its original name and value.", path))
    if len(set(names)) != len(names):
        findings.append(problem("dimension-ambiguous", "Repeated dimension names need source review; they are not collapsed.", path))
    if any(not ref for ref in refs) or len(set(refs)) != len(refs):
        findings.append(problem("location-ambiguous", "Empty or repeated original location references are retained.", path))
    for ref in refs:
        if ref and known_locations.get(ref, 0) != 1:
            findings.append(problem("location-reference", "Original location reference is absent or ambiguous in this activity: " + ref, path))
    signature = {"dimensions": sorted(dimensions, key=canonical),
                 "locations": sorted(locations, key=canonical)}
    return {"dimensions": dimensions, "locations": locations,
            "contextKey": fingerprint(signature),
            "contextComparable": not findings}, findings


def _value(node, kind, source, path, indicator, period, language, known_locations):
    findings, numeric = _finding_list(node, path, kind=kind, measure=indicator["measure"])
    context, extra = _context(node, path, known_locations)
    findings.extend(extra)
    raw = node_object(node)
    return {"key": source_key(source, path), "source": source, "locator": path,
            "indicatorKey": indicator["key"], "periodKey": period, "kind": kind,
            "attributes": deepcopy(node.attrs), "rawValue": node.attrs.get("value"),
            "decimal": numeric if indicator["measure"] in ("1", "2") and numeric != "" else None,
            "measure": indicator["measure"], **context,
            "comments": _texts(node, "comment", language),
            "documents": objects(node, "document-link"),
            "year": node.attrs.get("year"), "isoDate": node.attrs.get("iso-date"),
            "dateDay": day(node.attrs.get("iso-date", "")) or None,
            "original": raw, "originalSha256": fingerprint(raw), "findings": findings}


class _HashingReader:
    def __init__(self, stream):
        self.stream, self.hash, self.bytes = stream, hashlib.sha256(), 0

    def read(self, size=-1):
        value = self.stream.read(size)
        self.hash.update(value)
        self.bytes += len(value)
        return value


def project_source(source, stream, cancel=None):
    """Read one already-retained original document, without fetching or mutating it."""
    if not isinstance(source, dict) or not HEX.fullmatch(str(source.get("id", ""))):
        raise InputError("Results require one complete original source identity")
    identity = source["id"]
    result_rows, indicators, activities, findings = [], [], [], []
    activity_ids = Counter()
    row_count = 0
    reader = _HashingReader(stream)

    def record(activity, ordinal):
        nonlocal row_count
        path = "/iati-activities/iati-activity[" + str(ordinal) + "]"
        activity_id = text_child(activity, "iati-identifier")
        orgs = children(activity, "reporting-org")
        org = orgs[0].attrs.get("ref", "") if len(orgs) == 1 else ""
        language = activity.attrs.get(XML_LANG, "")
        locations = Counter(n.attrs.get("ref", "") for n in children(activity, "location"))
        activity_ids[activity_id] += 1
        if not activity_id:
            findings.append(problem("activity-identifier", "The original activity identifier is absent.", path))
        if len(orgs) != 1 or not org:
            findings.append(problem("reporting-organisation", "The activity does not select one original reporting organisation.", path))
        activity_record = {"key": source_key(identity, path), "source": identity,
            "locator": path, "ordinal": ordinal, "activityId": activity_id,
            "reportingOrgRef": org, "title": preferred(child(activity, "title"), language),
            "titles": _texts(activity, "title", language),
            "attributes": deepcopy(activity.attrs), "locations": objects(activity, "location"),
            "reportingOrganisations": objects(activity, "reporting-org"),
            "descriptions": _texts(activity, "description", language),
            "documents": objects(activity, "document-link"),
            "resultKeys": []}
        activities.append(activity_record)
        for ri, result in enumerate(children(activity, "result"), 1):
            rp = path + "/result[" + str(ri) + "]"
            result_record = {"key": source_key(identity, rp), "source": identity,
                "locator": rp, "activityKey": activity_record["key"], "activityId": activity_id,
                "reportingOrgRef": org, "resultType": result.attrs.get("type", ""),
                "attributes": deepcopy(result.attrs),
                "aggregationStatus": boolean(result.attrs.get("aggregation-status")),
                "title": preferred(child(result, "title"), language),
                "titles": _texts(result, "title", language),
                "descriptions": _texts(result, "description", language),
                "references": objects(result, "reference"), "documents": objects(result, "document-link"),
                "indicatorKeys": [], "findings": []}
            activity_record["resultKeys"].append(result_record["key"])
            result_rows.append(result_record)
            if not result_record["resultType"]:
                result_record["findings"].append(problem("result-type", "The result type is absent.", rp))
            if not children(result, "indicator"):
                result_record["findings"].append(problem("result-indicators", "This result has no indicator.", rp))
            for ii, indicator in enumerate(children(result, "indicator"), 1):
                ip = rp + "/indicator[" + str(ii) + "]"
                measure = indicator.attrs.get("measure", "")
                item = {"key": source_key(identity, ip), "source": identity, "locator": ip, "ordinal": len(indicators) + 1,
                    "activityKey": activity_record["key"], "activityId": activity_id,
                    "reportingOrgRef": org, "resultKey": result_record["key"],
                    "resultType": result_record["resultType"], "resultTitle": result_record["title"],
                    "attributes": deepcopy(indicator.attrs),
                    "measure": measure, "measureLabel": CONTRACT["measures"].get(measure, "Unrecognised source code"),
                    "ascending": boolean(indicator.attrs.get("ascending")),
                    "aggregationStatus": boolean(indicator.attrs.get("aggregation-status")),
                    "title": preferred(child(indicator, "title"), language),
                    "titles": _texts(indicator, "title", language),
                    "descriptions": _texts(indicator, "description", language),
                    "references": objects(indicator, "reference"), "documents": objects(indicator, "document-link"),
                    "baselines": [], "periods": [], "findings": []}
                if measure not in CONTRACT["measures"]:
                    item["findings"].append(problem("indicator-measure", "Review the original missing or unknown measure code.", ip))
                for name in ("ascending", "aggregation-status"):
                    if name in indicator.attrs and boolean(indicator.attrs[name]) is None:
                        item["findings"].append(problem("indicator-boolean", "Original " + name + " is not an XML boolean.", ip))
                for bi, baseline in enumerate(children(indicator, "baseline"), 1):
                    bp = ip + "/baseline[" + str(bi) + "]"
                    item["baselines"].append(_value(baseline, "baseline", identity, bp, item, None, language, locations))
                    row_count += 1
                for pi, period in enumerate(children(indicator, "period"), 1):
                    pp = ip + "/period[" + str(pi) + "]"
                    starts, ends = children(period, "period-start"), children(period, "period-end")
                    start_raw = starts[0].attrs.get("iso-date", "") if len(starts) == 1 else ""
                    end_raw = ends[0].attrs.get("iso-date", "") if len(ends) == 1 else ""
                    start, end = day(start_raw), day(end_raw)
                    value = {"key": source_key(identity, pp), "source": identity, "locator": pp,
                        "indicatorKey": item["key"], "attributes": deepcopy(period.attrs),
                        "startOriginal": start_raw, "endOriginal": end_raw,
                        "start": start or None, "end": end or None,
                        "startElements": [node_object(n) for n in starts],
                        "endElements": [node_object(n) for n in ends],
                        "calendarComparable": bool(start and end and start <= end),
                        "targets": [], "actuals": [], "candidatePairs": [], "findings": []}
                    if not value["calendarComparable"]:
                        value["findings"].append(problem("period-calendar", "The period needs one valid ordered original start and end date.", pp))
                    for kind, collection in (("target", "targets"), ("actual", "actuals")):
                        for vi, observed in enumerate(children(period, kind), 1):
                            vp = pp + "/" + kind + "[" + str(vi) + "]"
                            value[collection].append(_value(observed, kind, identity, vp, item, value["key"], language, locations))
                            row_count += 1
                    groups = defaultdict(lambda: {"targets": [], "actuals": []})
                    for collection in ("targets", "actuals"):
                        for observed in value[collection]:
                            if observed["contextComparable"]:
                                groups[observed["contextKey"]][collection].append(observed["key"])
                    for key, group in sorted(groups.items()):
                        if len(group["targets"]) == len(group["actuals"]) == 1:
                            value["candidatePairs"].append({"contextKey": key,
                                "targetKey": group["targets"][0], "actualKey": group["actuals"][0],
                                "basis": "Unique identical original dimension/location context; reviewer selects interpretation"})
                        elif group["targets"] or group["actuals"]:
                            value["findings"].append(problem("unpaired-context",
                                "This context has " + str(len(group["targets"])) + " target(s) and " +
                                str(len(group["actuals"])) + " actual(s); no record is chosen automatically.", pp))
                    item["periods"].append(value)
                item["contentSha256"] = fingerprint(node_object(indicator))
                item["sourceValuesSha256"] = fingerprint({
                    "baselines": [v["original"] for v in item["baselines"]],
                    "periods": [{"start": p["startElements"], "end": p["endElements"],
                        "attributes": p["attributes"], "targets": [v["original"] for v in p["targets"]],
                        "actuals": [v["original"] for v in p["actuals"]]} for p in item["periods"]]})
                item["sourcePeriodCount"] = len(item["periods"])
                result_record["indicatorKeys"].append(item["key"])
                indicators.append(item)
                if len(indicators) > MAX_INDICATORS or row_count > MAX_ROWS:
                    raise InputError("The original results projection exceeds 100,000 indicators or 500,000 value records")
        if len(activities) > 1000000:
            raise InputError("The source exceeds one million original activities")

    meta = walk(reader, record, cancel)
    if reader.hash.hexdigest() != identity or reader.bytes != source["bytes"]:
        raise InputError("The original publisher file differs from its selected source identity")
    if meta["version"] != "2.03":
        findings.append(problem("iati-version", "This results interpretation is defined for IATI 2.03.", "/iati-activities"))
    for identifier, count in sorted(activity_ids.items()):
        if count > 1:
            findings.append(problem("duplicate-activity", str(count) + " original activities share identifier " + identifier +
                                    "; all element identities remain separate.", "/iati-activities"))
    value = {"schema": PROJECTION, "source": {k: deepcopy(source[k]) for k in ("id", "label", "name", "bytes")},
        "sourceMetadata": meta, "analysisContract": CONTRACT, "activities": activities,
        "results": result_rows, "indicators": indicators, "findings": findings,
        "counts": {"activities": len(activities), "results": len(result_rows),
                   "indicators": len(indicators), "valueRecords": row_count,
                   "baselines": sum(len(i["baselines"]) for i in indicators),
                   "periods": sum(len(i["periods"]) for i in indicators),
                   "targets": sum(len(p["targets"]) for i in indicators for p in i["periods"]),
                   "actuals": sum(len(p["actuals"]) for i in indicators for p in i["periods"])}}
    value["projectionSha256"] = fingerprint(value)
    return value


def _strings(value, name, maximum=100000):
    if not isinstance(value, list) or len(value) > maximum or any(
        not isinstance(v, str) or not v or len(v) > 2048 for v in value):
        raise InputError(name + " must be a complete array of bounded original strings")
    if len(set(value)) != len(value):
        raise InputError(name + " repeats an original identity")
    return sorted(value)


def selection(raw):
    if not isinstance(raw, dict) or set(raw) - {
        "indicatorKeys", "activityIds", "resultTypes", "measures", "periodFrom", "periodTo", "includeUndated"}:
        raise InputError("Unknown results selection field")
    result = {k: _strings(raw.get(k, []), k) for k in ("indicatorKeys", "activityIds", "resultTypes", "measures")}
    for key in result["indicatorKeys"]:
        if not HEX.fullmatch(key):
            raise InputError("Select complete source-bound indicator keys")
    for key in ("periodFrom", "periodTo"):
        value = raw.get(key, "")
        if not isinstance(value, str) or (value and (not day(value) or day(value) != value)):
            raise InputError("Use an exact YYYY-MM-DD selection boundary")
        result[key] = value
    if result["periodFrom"] and result["periodTo"] and result["periodFrom"] > result["periodTo"]:
        raise InputError("The selected period starts after its end")
    if type(raw.get("includeUndated", True)) is not bool:
        raise InputError("includeUndated must be an explicit boolean")
    result["includeUndated"] = raw.get("includeUndated", True)
    return result


def selected_indicator(item, chosen):
    return all(not chosen[field] or item[value] in chosen[field] for field, value in (
        ("indicatorKeys", "key"), ("activityIds", "activityId"), ("resultTypes", "resultType"), ("measures", "measure")))


def selected_period(period, chosen):
    if not period["calendarComparable"]:
        return chosen["includeUndated"]
    return not ((chosen["periodFrom"] and period["end"] < chosen["periodFrom"]) or
                (chosen["periodTo"] and period["start"] > chosen["periodTo"]))


def _small(value, name, maximum, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise InputError(name + " must be " + ("nonempty " if not empty else "") + "text of at most " + str(maximum) + " characters")
    return value


def interpretations(raw, keys):
    if not isinstance(raw, list) or len(raw) > MAX_INDICATORS:
        raise InputError("Interpretations must be an array")
    out, seen = [], set()
    for item in raw:
        if not isinstance(item, dict) or set(item) != {"indicatorKey", "unitLabel", "direction", "note"}:
            raise InputError("Interpretation needs indicatorKey, unitLabel, direction and note")
        key = item["indicatorKey"]
        if key not in keys or key in seen:
            raise InputError("Interpretation must bind one distinct selected original indicator")
        if item["direction"] not in ("reported", "higher", "lower", "none"):
            raise InputError("Choose reported, higher, lower or none direction")
        seen.add(key)
        out.append({"indicatorKey": key, "unitLabel": _small(item["unitLabel"], "Unit label", 160, True),
                    "direction": item["direction"], "note": _small(item["note"], "Interpretation note", 4000, True)})
    return sorted(out, key=lambda x: x["indicatorKey"])


def bindings(raw, indicators):
    if not isinstance(raw, list) or len(raw) > MAX_ROWS:
        raise InputError("Comparison bindings must be an array")
    periods = {p["key"]: (i, p) for i in indicators.values() for p in i["periods"]}
    out, seen = [], set()
    for value in raw:
        if not isinstance(value, dict) or set(value) != {
            "periodKey", "targetKey", "actualKey", "baselineKey", "operation", "note"}:
            raise InputError("A comparison needs exact period, target, actual, optional baseline, operation and note")
        if value["periodKey"] not in periods:
            raise InputError("The comparison period is outside the selected original records")
        indicator, period = periods[value["periodKey"]]
        baseline_change = value["operation"] == "baseline-change"
        if value["actualKey"] not in {r["key"] for r in period["actuals"]}:
            raise InputError("Actual must belong to that exact original period")
        if baseline_change:
            if value["targetKey"] is not None:
                raise InputError("Baseline change retains no selected target; use targetKey null")
        elif value["targetKey"] not in {r["key"] for r in period["targets"]}:
            raise InputError("Target must belong to that exact original period")
        if value["baselineKey"] is not None and value["baselineKey"] not in {r["key"] for r in indicator["baselines"]}:
            raise InputError("Baseline must belong to that exact original indicator")
        if value["operation"] not in ("inspect", "difference", "target-ratio", "baseline-progress", "baseline-change"):
            raise InputError("Choose inspect, difference, target-ratio, baseline-progress or baseline-change")
        if value["operation"] in ("baseline-progress", "baseline-change") and value["baselineKey"] is None:
            raise InputError("This baseline operation requires an explicitly selected original baseline")
        identity = (value["periodKey"], value["targetKey"], value["actualKey"])
        if identity in seen:
            raise InputError("Select each original target/actual pair once")
        seen.add(identity)
        out.append({**deepcopy(value), "note": _small(value["note"], "Comparison basis", 4000,
                                                    value["operation"] == "inspect")})
    return sorted(out, key=lambda x: (x["periodKey"], x["targetKey"] or "", x["actualKey"]))


def _number(value):
    return Decimal(value["decimal"]) if value["decimal"] is not None else None


def _ratio(a, b):
    with localcontext() as context:
        context.prec = 1024
        return format((a / b * Decimal(100)).quantize(Decimal("0.000000000001")), "f")


def comparison_value(indicator, period, binding, interpretation):
    target = next((v for v in period["targets"] if v["key"] == binding["targetKey"]), None)
    actual = next(v for v in period["actuals"] if v["key"] == binding["actualKey"])
    baseline = next((v for v in indicator["baselines"] if v["key"] == binding["baselineKey"]), None)
    direction = interpretation["direction"]
    effective = (("higher" if indicator["ascending"] else "lower") if indicator["ascending"] is not None else None) if direction == "reported" else (direction if direction != "none" else None)
    result = {"indicatorKey": indicator["key"], "periodKey": period["key"], "binding": deepcopy(binding),
              "interpretation": deepcopy(interpretation), "measure": indicator["measure"],
              "effectiveDirection": effective, "target": target, "actual": actual, "baseline": baseline,
              "status": "retained-inspection", "reasons": [], "calculation": None}
    if binding["operation"] == "inspect":
        return result
    reasons = []
    if indicator["measure"] not in ("1", "2"):
        reasons.append("This original measure is nominal, ordinal, qualitative or unknown; arithmetic is not selected.")
    if not period["calendarComparable"]:
        reasons.append("The original period calendar is unresolved.")
    for value in (target, actual, baseline):
        if value is not None and (not value["contextComparable"] or value["decimal"] is None):
            reasons.append("A selected original value or dimension/location context is unresolved.")
    if (target and target["contextKey"] != actual["contextKey"]) or (baseline and baseline["contextKey"] != actual["contextKey"]):
        reasons.append("The selected records have different original dimensions or locations.")
    if indicator["measure"] == "1" and not interpretation["unitLabel"].strip():
        reasons.append("Name the original indicator's unit meaning before arithmetic.")
    if not interpretation["note"].strip():
        reasons.append("Record the source-bound comparability interpretation before arithmetic.")
    if direction in ("higher", "lower") and not interpretation["note"].strip():
        reasons.append("An explicit direction selection needs its source basis.")
    if baseline:
        year = baseline["year"] or ""
        if not YEAR.fullmatch(year) or int(year) <= 0:
            reasons.append("The selected baseline year is unresolved.")
        elif period["start"] and int(year) > int(period["start"][:4]):
            reasons.append("The selected baseline year is later than the selected period start.")
        if baseline["dateDay"] and period["start"] and baseline["dateDay"] > period["start"]:
            reasons.append("The selected baseline date is later than the selected period start.")
        if any(f["code"] in ("baseline-date", "baseline-year-date") for f in baseline["findings"]):
            reasons.append("The selected baseline's original year/date needs review.")
    if reasons:
        return {**result, "status": "not-comparable", "reasons": sorted(set(reasons))}
    a, t, b = _number(actual), _number(target) if target else None, _number(baseline) if baseline else None
    with localcontext() as context:
        context.prec = 1024
        calculation = {"actualMinusTarget": format(a - t, "f") if t is not None else None,
            "differenceMeaning": "percentage points" if indicator["measure"] == "2" else interpretation["unitLabel"],
            "reportedTargetRelation": ("equal" if a == t else ("above" if a > t else "below")) if t is not None else None,
            "directionalTargetRelation": None,
            "actualMinusBaseline": format(a - b, "f") if b is not None else None,
            "directionalBaselineRelation": None,
            "ratioPercent": None, "ratioFormula": None, "roundingDecimalPlaces": None}
        if effective and t is not None:
            calculation["directionalTargetRelation"] = "meets-selected-target" if (
                a >= t if effective == "higher" else a <= t) else "does-not-meet-selected-target"
        if binding["operation"] == "baseline-change" and effective:
            calculation["directionalBaselineRelation"] = ("unchanged" if a == b else
                ("in-selected-direction" if (a > b) == (effective == "higher") else "opposite-selected-direction"))
        if binding["operation"] == "target-ratio":
            if t <= 0 or effective != "higher":
                reasons.append("Actual/target percentage requires a positive target and an explicit higher-is-better basis.")
            else:
                calculation.update(ratioPercent=_ratio(a, t), ratioFormula="actual / target * 100", roundingDecimalPlaces=12)
        if binding["operation"] == "baseline-progress":
            difference = t - b
            if effective is None or difference == 0 or ((difference > 0) != (effective == "higher")):
                reasons.append("Baseline progress requires a nonzero baseline→target change in the selected improvement direction.")
            else:
                calculation.update(ratioPercent=_ratio(a - b, difference),
                    ratioFormula="(actual - baseline) / (target - baseline) * 100", roundingDecimalPlaces=12)
        if reasons:
            return {**result, "status": "not-comparable", "reasons": sorted(set(reasons))}
    return {**result, "status": "calculated-from-selected-source", "calculation": calculation}


def build_report(definition, projections):
    chosen = selection(definition["selection"])
    all_indicators = {}
    for projection in projections:
        if projection.get("schema") != PROJECTION:
            raise InputError("Use the exact original results projection")
        for indicator in projection["indicators"]:
            if indicator["key"] in all_indicators:
                raise InputError("The selected source set repeats an indicator identity")
            all_indicators[indicator["key"]] = indicator
    unknown = set(chosen["indicatorKeys"]) - set(all_indicators)
    if unknown:
        raise InputError("The selection names indicator identities outside these original sources")
    selected, hidden_periods = {}, 0
    for key, indicator in all_indicators.items():
        if selected_indicator(indicator, chosen):
            item = deepcopy(indicator)
            item["periods"] = [p for p in item["periods"] if selected_period(p, chosen)]
            hidden_periods += len(indicator["periods"]) - len(item["periods"])
            selected[key] = item
    meaning = interpretations(definition.get("interpretations", []), selected)
    meanings = {v["indicatorKey"]: v for v in meaning}
    requested = bindings(definition.get("bindings", []), selected)
    periods = {p["key"]: (i, p) for i in selected.values() for p in i["periods"]}
    compared = []
    for binding in requested:
        indicator, period = periods[binding["periodKey"]]
        interpretation = meanings.get(indicator["key"], {"indicatorKey": indicator["key"],
            "unitLabel": "", "direction": "reported", "note": ""})
        compared.append(comparison_value(indicator, period, binding, interpretation))
    findings = [{**deepcopy(v), "source": p["source"]["id"]} for p in projections for v in p["findings"]]
    selected_results = {i["resultKey"] for i in selected.values()}
    findings.extend({**deepcopy(f), "source": p["source"]["id"]} for p in projections for r in p["results"]
                    if r["key"] in selected_results or not r["indicatorKeys"] for f in r["findings"])
    for indicator in selected.values():
        def add_findings(values):
            findings.extend({**deepcopy(f), "source": indicator["source"]} for f in values)
        add_findings(indicator["findings"])
        for baseline in indicator["baselines"]:
            add_findings(baseline["findings"])
        for period in indicator["periods"]:
            add_findings(period["findings"])
            for value in period["targets"] + period["actuals"]:
                add_findings(value["findings"])
    selected_result_keys = {i["resultKey"] for i in selected.values()}
    selected_activity_keys = {i["activityKey"] for i in selected.values()}
    parent_results = []
    for projection in projections:
        for parent in projection["results"]:
            selected_empty = (not parent["indicatorKeys"] and not chosen["indicatorKeys"] and not chosen["measures"]
                and (not chosen["activityIds"] or parent["activityId"] in chosen["activityIds"])
                and (not chosen["resultTypes"] or parent["resultType"] in chosen["resultTypes"]))
            if parent["key"] in selected_result_keys or selected_empty:
                retained = deepcopy(parent)
                retained["selectedIndicatorKeys"] = [k for k in parent["indicatorKeys"] if k in selected]
                parent_results.append(retained)
                selected_activity_keys.add(parent["activityKey"])
    parent_activities = []
    for projection in projections:
        for parent in projection["activities"]:
            broad_activity = (not chosen["indicatorKeys"] and not chosen["resultTypes"] and not chosen["measures"]
                and (not chosen["activityIds"] or parent["activityId"] in chosen["activityIds"]))
            if parent["key"] in selected_activity_keys or broad_activity:
                parent_activities.append(deepcopy(parent))
    result = {"schema": REPORT, "analysisContract": CONTRACT, "selection": chosen,
        "activities": parent_activities, "results": parent_results,
        "coverage": [{"source": p["source"], "projectionSha256": p["projectionSha256"],
                      "sourceCounts": p["counts"]} for p in projections],
        "counts": {"activities": len(parent_activities), "results": len(parent_results), "indicators": len(selected), "selectedPeriods": len(periods),
                   "excludedPeriods": hidden_periods,
                   "baselines": sum(len(i["baselines"]) for i in selected.values()),
                   "targets": sum(len(p["targets"]) for _, p in periods.values()),
                   "actuals": sum(len(p["actuals"]) for _, p in periods.values()),
                   "reviewFindings": len(findings), "selectedComparisons": len(compared),
                   "calculatedComparisons": sum(v["calculation"] is not None for v in compared)},
        "indicators": sorted(selected.values(), key=lambda v: (v["source"], v["ordinal"])),
        "interpretations": meaning, "bindings": requested, "comparisons": compared,
        "findings": findings, "aggregation": "No performance total is calculated across these separate indicator records."}
    result["reportSha256"] = fingerprint(result)
    return result


def compare_reports(before, after, supplied):
    """Compare explicit original indicator pairs; retain additions and removals separately."""
    if not isinstance(supplied, list) or len(supplied) > MAX_INDICATORS:
        raise InputError("Provide the explicit following-source indicator pairs")
    left = {i["key"]: i for i in before["indicators"]}
    right = {i["key"]: i for i in after["indicators"]}
    common = sorted(set(left) & set(right))
    pairs = [{"before": k, "after": k, "note": "Same original source-bound indicator"} for k in common]
    unused_left, unused_right = set(left) - set(common), set(right) - set(common)
    for value in supplied:
        if not isinstance(value, dict) or set(value) != {"before", "after", "note"}:
            raise InputError("Each source comparison needs before, after and an explicit mapping note")
        if value["before"] not in unused_left or value["after"] not in unused_right:
            raise InputError("Pair each remaining original earlier/later indicator at most once")
        pairs.append({**value, "note": _small(value["note"], "Following-source mapping basis", 4000)})
        unused_left.remove(value["before"])
        unused_right.remove(value["after"])
    changes = []
    for pair in pairs:
        a, b = left[pair["before"]], right[pair["after"]]
        fields = sorted(k for k in set(a) | set(b) if k not in (
            "key", "source", "locator", "activityKey", "resultKey", "periods", "baselines") and a.get(k) != b.get(k))
        # Source-contained row keys change with the source; compare complete original
        # XML fragments and period dates independently of those derived keys.
        def rows(item):
            return {"baselines": [v["original"] for v in item["baselines"]],
                    "periods": [{"start": p["startOriginal"], "end": p["endOriginal"],
                        "targets": [v["original"] for v in p["targets"]],
                        "actuals": [v["original"] for v in p["actuals"]]} for p in item["periods"]]}
        original_a, original_b = rows(a), rows(b)
        changes.append({**pair, "beforeSource": a["source"], "afterSource": b["source"],
            "beforeActivity": a["activityId"], "afterActivity": b["activityId"],
            "activityIdentityChanged": (a["activityId"], a["reportingOrgRef"]) != (b["activityId"], b["reportingOrgRef"]),
            "changedFields": fields,
            "originalValuesChanged": a["sourceValuesSha256"] != b["sourceValuesSha256"],
            "beforeSourceValuesSha256": a["sourceValuesSha256"], "afterSourceValuesSha256": b["sourceValuesSha256"],
            "selectedValuesChanged": original_a != original_b,
            "selectedPeriodCounts": {"before": len(a["periods"]), "after": len(b["periods"])},
            "originalPeriodCounts": {"before": a["sourcePeriodCount"], "after": b["sourcePeriodCount"]},
            "beforeOriginal": original_a, "afterOriginal": original_b,
            "beforeContentSha256": a["contentSha256"], "afterContentSha256": b["contentSha256"]})
    value = {"schema": COMPARISON, "beforeReportSha256": before["reportSha256"],
        "afterReportSha256": after["reportSha256"], "selectionChanged": before["selection"] != after["selection"],
        "interpretationChanged": before["interpretations"] != after["interpretations"],
        "pairs": changes, "removedIndicators": sorted(unused_left), "addedIndicators": sorted(unused_right),
        "meaning": "Source and selected-interpretation changes; no title-only identity matching or cross-source performance sum."}
    value["sha256"] = fingerprint(value)
    return value
