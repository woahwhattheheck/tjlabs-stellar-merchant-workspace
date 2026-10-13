"""MIT. Period-specific donor statements on the original programme report."""
from __future__ import annotations
from collections import defaultdict
from decimal import Decimal
import re
from domain import canonical, decimal_amount, digest, identifier, require, sha, shape, short

SCHEMA = "stellar-forge.grant-donor-selection.v1"
STATEMENT = "stellar-forge.grant-donor-statement.v1"
FIELDS = {"donorSelection": "donor-selection?"}
MISSING = object()


def pointer(value):
    require(isinstance(value, str) and 0 < len(value) <= 512 and value.startswith("/")
            and not re.search(r"~(?![01])", value), "Select a complete original JSON pointer")
    return value


def lookup(row, path):
    current = row
    for token in path[1:].split("/"):
        key = token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict):
            if key not in current:
                return MISSING
            current = current[key]
        elif isinstance(current, list) and re.fullmatch(r"0|[1-9][0-9]*", key):
            index = int(key)
            if index >= len(current):
                return MISSING
            current = current[index]
        else:
            return MISSING
    return current


def normalize_selection(value):
    if value is None:
        return None
    from programme import normalize, programme_decimal
    shape(value, ("schema", "agreementId", "supersedesReportId", "correctionReason",
                  "lines", "indicatorIds", "resultMode", "controlTotals", "exclusions", "reviewNote"),
          ("schema", "lines", "indicatorIds", "resultMode"))
    require(value["schema"] == SCHEMA, "Select the original donor report selection schema")
    result = {"schema": SCHEMA, "agreementId": identifier(value["agreementId"]) if value.get("agreementId") else None,
        "supersedesReportId": identifier(value["supersedesReportId"]) if value.get("supersedesReportId") else None,
        "correctionReason": short(value.get("correctionReason", ""), "Correction reason", 16000, empty=True),
        "reviewNote": short(value.get("reviewNote", ""), "Statement review note", 16000, empty=True),
        "indicatorIds": normalize(value["indicatorIds"], "ids", "Report indicators"),
        "resultMode": value["resultMode"], "lines": [], "controlTotals": [], "exclusions": []}
    require(result["resultMode"] in ("period-contained", "cumulative"),
            "Select complete in-period observations or cumulative results through period end")
    require(isinstance(value["lines"], list) and len(value["lines"]) <= 100,
            "Select up to 100 complete financial statement lines")
    seen = set()
    for line in value["lines"]:
        shape(line, ("id", "title", "sourceIds", "kind", "currency", "dimensions", "dateMode",
                     "datePointer", "endPointer", "basis"),
              ("id", "title", "sourceIds", "kind", "currency", "dateMode", "datePointer", "basis"))
        ident = identifier(line["id"])
        require(ident not in seen, "Financial statement lines repeat an identity")
        seen.add(ident)
        source_ids = line["sourceIds"]
        require(isinstance(source_ids, list) and 1 <= len(source_ids) <= 64,
                "Select each line's original source editions")
        source_ids = [sha(item) for item in source_ids]
        require(len(set(source_ids)) == len(source_ids), "A financial line repeats a source edition")
        require(isinstance(line["currency"], str) and re.fullmatch(r"[A-Z]{3}", line["currency"]),
                "Retain a line's original three-letter currency")
        mode = line["dateMode"]
        require(mode in ("point", "contained-period"), "Select point date or a fully contained source period")
        end = pointer(line.get("endPointer")) if mode == "contained-period" else None
        require(mode != "point" or line.get("endPointer") is None,
                "A point-date line has no period-end pointer")
        result["lines"].append({"id": ident, "title": short(line["title"], "Statement line", 240),
            "sourceIds": sorted(source_ids), "kind": short(line["kind"], "Original financial meaning", 240),
            "currency": line["currency"], "dimensions": normalize(line.get("dimensions", {}), "dimensions", "Financial filters"),
            "dateMode": mode, "datePointer": pointer(line["datePointer"]), "endPointer": end,
            "basis": short(line["basis"], "Date and financial basis", 16000)})
    controls = value.get("controlTotals", [])
    require(isinstance(controls, list) and len(controls) <= 1000, "Select complete control totals")
    seen = set()
    for control in controls:
        shape(control, ("groupId", "amount", "basis"), ("groupId", "amount", "basis"))
        key = sha(control["groupId"])
        require(key not in seen, "A control total repeats the same statement group")
        seen.add(key)
        programme_decimal(control["amount"], "Supplied control total")
        result["controlTotals"].append({"groupId": key, "amount": control["amount"],
            "basis": short(control["basis"], "Control total source and basis", 16000)})
    exclusions = value.get("exclusions", [])
    require(isinstance(exclusions, list) and len(exclusions) <= 2000, "Select complete explained row exclusions")
    seen = set()
    for exclusion in exclusions:
        shape(exclusion, ("sourceId", "rowKey", "sha256", "reason"), ("sourceId", "rowKey", "sha256", "reason"))
        item = {key: sha(exclusion[key]) for key in ("sourceId", "rowKey", "sha256")}
        key = item["sourceId"], item["rowKey"]
        require(key not in seen, "A row exclusion repeats its original record")
        seen.add(key)
        item["reason"] = short(exclusion["reason"], "Original row exclusion reason", 16000)
        result["exclusions"].append(item)
    return result


def validate_reports(model):
    from programme import indexes, evidence_in_scope, descendants, ancestors
    idx = indexes(model)
    for report in idx["reports"].values():
        selection = report.get("donorSelection")
        if selection is None:
            continue
        require(normalize_selection(selection) == selection, "The retained donor selection differs")
        agreement = idx["documents"].get(selection["agreementId"]) if selection["agreementId"] else None
        require(selection["agreementId"] is None or agreement is not None
                and agreement["category"] in ("agreement", "amendment")
                and evidence_in_scope(idx, "reports", report, agreement),
                "Select an agreement or amendment in this report's project/grant scope",
                "DONOR_AGREEMENT_SCOPE", 409)
        prior_id = selection["supersedesReportId"]
        if prior_id:
            prior = idx["reports"].get(prior_id)
            require(prior is not None and prior_id != report["id"] and prior.get("publication")
                    and (prior["nodeId"], prior.get("grantId")) == (report["nodeId"], report.get("grantId")),
                    "A correction selects an earlier submitted report in the same scope",
                    "DONOR_CORRECTION_SCOPE", 409)
            require(selection["correctionReason"].strip(), "Explain the correction to the earlier submitted report")
            visited, current = {report["id"]}, prior
            while current:
                require(current["id"] not in visited, "Donor report corrections cannot form a cycle")
                visited.add(current["id"])
                following = (current.get("donorSelection") or {}).get("supersedesReportId")
                current = idx["reports"].get(following) if following else None
        else:
            require(not selection["correctionReason"].strip(),
                    "A correction reason selects its original submitted report")
        nodes = descendants(idx, report["nodeId"])
        for ident in selection["indicatorIds"]:
            indicator = idx["indicators"].get(ident)
            require(indicator is not None and indicator["nodeId"] in nodes and (
                report.get("grantId") is None or indicator.get("grantId") is not None and
                report["grantId"] in ancestors(idx["grants"], indicator["grantId"], "parentGrantId")),
                "A report indicator must belong to its project or grant scope", "DONOR_INDICATOR_SCOPE", 409)


def _day(value):
    from programme import date
    if value is MISSING or value is None or value == "":
        return None, "MISSING_DATE"
    try:
        return date(value), None
    except (TypeError, ValueError):
        return None, "INVALID_DATE"


def _ref(row):
    return {"sourceId": row["sourceId"], "rowKey": row["rowKey"], "sha256": digest(row)}


def _line_groups(line, records):
    """Dates selected for period membership are separated from all other dimensions."""
    groups = {}
    date_keys = set()
    for path in (line["datePointer"], line["endPointer"]):
        if path and path.startswith("/dimensions/") and "/" not in path[len("/dimensions/"):]:
            date_keys.add(path[len("/dimensions/"):].replace("~1", "/").replace("~0", "~"))
    for item in records:
        row = item["record"]
        dimensions = {"sourceId": row["sourceId"], "standard": row["standard"], "kind": row["kind"],
                      "currency": row["currency"],
                      "original": {k: v for k, v in row["dimensions"].items() if k not in date_keys}}
        key = digest([line["id"], dimensions])
        target = groups.setdefault(key, {"id": key, "lineId": line["id"], "title": line["title"],
            "dimensions": dimensions, "recordRefs": [], "values": [], "reviewRecordRefs": []})
        if item["status"] == "INCLUDED":
            target["recordRefs"].append(item["reference"])
            target["values"].append(row["value"])
        elif item["status"] in {"MISSING_DATE", "INVALID_DATE", "REVERSED_PERIOD", "PARTIAL_PERIOD",
                                 "INELIGIBLE", "MISSING_VALUE", "DUPLICATE_LINE_SELECTION"}:
            target["reviewRecordRefs"].append(item["reference"])
    return groups


def statement(model, report, entities, financial, *, publication_context=None):
    from programme import (indexes, position, record_ref, indicator_results, programme_exact_variance,
                           _programme_exact_arithmetic)
    selection = report.get("donorSelection")
    require(selection is not None, "Configure and save this report's donor statement", "DONOR_SELECTION_MISSING", 409)
    selection = normalize_selection(selection)
    validate_reports(model)
    idx = indexes(model)
    selected_model = {**model, "settings": {**model["settings"], "asOf": report["periodEnd"]}}
    scoped = position(selected_model, report["nodeId"], entities, financial, report.get("grantId"))
    selected_refs = {(ref["sourceId"], ref["rowKey"]): ref["sha256"] for ref in scoped["financialRowRefs"]}
    originals = {}
    for row in financial:
        key = row["sourceId"], row["rowKey"]
        if key in selected_refs:
            require(digest(row) == selected_refs[key], "The original scoped financial row changed", "DONOR_SOURCE_CHANGED", 409)
            if key in originals:
                require(originals[key] == row, "Two financial rows repeat an identity with different contents")
            originals[key] = row
    require(len(originals) == len(selected_refs), "The selected statement lost an original financial row")
    exclusions = {(x["sourceId"], x["rowKey"]): x for x in selection["exclusions"]}
    for key, exclusion in exclusions.items():
        require(key in originals and digest(originals[key]) == exclusion["sha256"],
                "An explained exclusion must select an exact current in-scope financial row", "DONOR_EXCLUSION_CHANGED", 409)
    start, end = report["periodStart"], report["periodEnd"]
    lines, used = [], defaultdict(list)
    for line in selection["lines"]:
        candidates = []
        for key, row in sorted(originals.items()):
            if row["sourceId"] not in line["sourceIds"] or row["kind"] != line["kind"] or row["currency"] != line["currency"]:
                continue
            if any(row["dimensions"].get(k, MISSING) != value for k, value in line["dimensions"].items()):
                continue
            item = {"reference": _ref(row), "record": row, "status": None,
                    "selectedStart": None, "selectedEnd": None, "reason": ""}
            if key in exclusions:
                item.update(status="EXPLAINED_EXCLUSION", reason=exclusions[key]["reason"])
            else:
                first, error = _day(lookup(row, line["datePointer"]))
                last, end_error = _day(lookup(row, line["endPointer"])) if line["endPointer"] else (first, error)
                item.update(selectedStart=first, selectedEnd=last)
                if error or end_error:
                    item["status"] = error or end_error
                elif last < first:
                    item["status"] = "REVERSED_PERIOD"
                elif last < start or first > end:
                    item["status"] = "OUTSIDE_PERIOD"
                elif first < start or last > end:
                    item["status"] = "PARTIAL_PERIOD"
                elif not row["eligible"]:
                    item["status"] = "INELIGIBLE"
                elif row.get("value") is None or row["value"] == "":
                    item["status"] = "MISSING_VALUE"
                else:
                    decimal_amount(row["value"])
                    item["status"] = "INCLUDED"
                    used[key].append(item)
            candidates.append(item)
        lines.append({"selection": line, "records": candidates})
    for items in used.values():
        if len(items) > 1:
            for item in items:
                item["status"] = "DUPLICATE_LINE_SELECTION"
    controls = {item["groupId"]: item for item in selection["controlTotals"]}
    seen_controls, group_count, included_count, review_count = set(), 0, 0, 0
    for line in lines:
        groups = _line_groups(line["selection"], line["records"])
        line["groups"] = []
        for key, group in sorted(groups.items()):
            values = group.pop("values")
            actual = _programme_exact_arithmetic(decimal_amount(v) for v in values) if values else None
            control = controls.get(key)
            if control:
                seen_controls.add(key)
            group.update(amount=actual, control=control,
                variance=programme_exact_variance(actual, control["amount"]) if actual is not None and control else None,
                status="REVIEW_REQUIRED" if group["reviewRecordRefs"] else "NO_INCLUDED_ROWS" if not values else
                    "CONTROL_DIFFERENCE" if control and Decimal(actual) != Decimal(control["amount"]) else "CURRENT")
            line["groups"].append(group)
        line["counts"] = dict(sorted((status, sum(item["status"] == status for item in line["records"]))
                             for status in {item["status"] for item in line["records"]}))
        line["status"] = "NO_MATCHING_ROWS" if not line["records"] else "REVIEW_REQUIRED" if any(
            group["status"] in {"REVIEW_REQUIRED", "CONTROL_DIFFERENCE"} for group in line["groups"]) else "CURRENT"
        included_count += line["counts"].get("INCLUDED", 0)
        review_count += sum(len(group["reviewRecordRefs"]) for group in line["groups"])
        group_count += len(line["groups"])
    unmatched_controls = [controls[key] for key in sorted(set(controls) - seen_controls)]
    candidate_keys = {(item["reference"]["sourceId"], item["reference"]["rowKey"])
                      for line in lines for item in line["records"]}
    uncovered = [{"reference": _ref(row), "record": row, "reason": "NO_LINE_SELECTION"}
                 for key, row in sorted(originals.items()) if key not in candidate_keys]
    observations, retained, selected_observations = [], [], []
    indicator_ids = set(selection["indicatorIds"])
    for observed in model["records"]["observations"]:
        if observed["indicatorId"] not in indicator_ids:
            continue
        status = "INCLUDED"
        if observed["archived"] or observed["status"] == "withdrawn":
            status = "WITHDRAWN_OR_ARCHIVED"
        elif observed["periodEnd"] > end:
            status = "PARTIAL_PERIOD" if observed["periodStart"] <= end else "OUTSIDE_PERIOD"
        elif selection["resultMode"] == "period-contained" and observed["periodStart"] < start:
            status = "PARTIAL_PERIOD" if observed["periodEnd"] >= start else "OUTSIDE_PERIOD"
        observations.append({"reference": record_ref("observations", observed), "record": observed, "status": status})
        if status == "INCLUDED":
            selected_observations.append(observed)
    result_model = {**selected_model, "records": {**model["records"],
        "indicators": [row for row in model["records"]["indicators"] if row["id"] in indicator_ids],
        "observations": selected_observations}}
    results = indicator_results(result_model)
    for name, ids in (("documents", [selection["agreementId"]] if selection["agreementId"] else []),
                      ("indicators", selection["indicatorIds"])):
        retained.extend({"reference": record_ref(name, idx[name][ident]), "record": idx[name][ident]} for ident in ids)
    prior = idx["reports"].get(selection["supersedesReportId"])
    summary = {"scopedFinancialRows": len(originals), "lineCount": len(lines), "groupCount": group_count,
        "includedFinancialRows": included_count, "reviewFinancialRows": review_count,
        "uncoveredFinancialRows": len(uncovered), "unmatchedControls": len(unmatched_controls),
        "selectedIndicators": len(indicator_ids), "candidateObservations": len(observations),
        "includedObservations": len(selected_observations),
        "partialObservations": sum(o["status"] == "PARTIAL_PERIOD" for o in observations)}
    result = {"schema": STATEMENT, "reportId": report["id"], "selection": selection,
        "reportingPeriod": {"start": start, "end": end}, "nodeId": report["nodeId"], "grantId": report.get("grantId"),
        "title": report["title"], "recipient": report.get("recipient"), "narrative": report["narrative"],
        "documentRefs": [record_ref("documents", idx["documents"][ident]) for ident in report["documentIds"]],
        "sourceBindings": scoped["sourceBindings"], "financialCoverage": scoped["financialCoverage"],
        "lines": lines, "unselectedFinancialRows": uncovered, "unmatchedControls": unmatched_controls,
        "results": results, "observations": observations, "selectedRecords": retained, "summary": summary,
        "supersedes": None if prior is None else {"report": record_ref("reports", prior),
            "publicationSha256": prior["publication"]["sha256"],
            "statementSha256": prior["publication"].get("donorStatement", {}).get("sha256")},
        "financialBasis": "Original scoped rows; explicit source, meaning, currency and dimensions; inclusive point dates or complete contained periods. All other source dimensions remain independent. No proration or currency conversion.",
        "resultBasis": "Complete contained observations" if selection["resultMode"] == "period-contained" else "Cumulative observations through period end",
        "publicationContext": publication_context}
    result["sha256"] = digest(result)
    return result


def publication_statement(model, report, entities, financial, context):
    result = statement(model, report, entities, financial, publication_context=dict(context))
    needs_review = (result["summary"]["reviewFinancialRows"] or result["summary"]["uncoveredFinancialRows"]
        or result["summary"]["unmatchedControls"] or result["summary"]["partialObservations"]
        or result["financialCoverage"] != "CURRENT_SELECTION"
        or any(line["status"] != "CURRENT" or any(group["status"] == "CONTROL_DIFFERENCE" for group in line["groups"])
               for line in result["lines"])
        or any(row["status"] not in {"CURRENT", "SEPARATE_OBSERVATIONS"} for row in result["results"]))
    require(not needs_review or result["selection"]["reviewNote"].strip(),
            "Retain a statement review note explaining missing, partial, unselected or differing items before submission",
            "DONOR_STATEMENT_REVIEW_REQUIRED", 409)
    return result


def read_statement(workspace, query):
    from programme_service import selection
    portfolio, model, envelope = selection(workspace, query, ("id",))
    report = next((row for row in model["records"]["reports"] if row["id"] == identifier(query.get("id"))), None)
    require(report is not None, "The original donor report was not found", "NOT_FOUND", 404)
    frozen = report.get("publication", {}).get("donorStatement")
    if frozen is not None:
        result = frozen
        require(digest({key: value for key, value in result.items() if key != "sha256"}) == result["sha256"],
                "The original published donor statement changed", "DONOR_STATEMENT_CHANGED", 409)
    else:
        require(not report.get("publication"),
                "This earlier submitted report retains its original cumulative position; create a following report for a donor statement",
                "DONOR_LEGACY_REPORT", 409)
        _, entities, financial = workspace._selected(portfolio["sources"])
        result = statement(model, report, entities, financial)
    return {**envelope, "report": report, "frozen": frozen is not None, "statement": result}
