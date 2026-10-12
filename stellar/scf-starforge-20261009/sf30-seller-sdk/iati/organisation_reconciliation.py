"""MIT. Organisation-to-activity financial coverage on retained IATI editions."""
from __future__ import annotations
from collections import defaultdict
from copy import deepcopy
from datetime import date
from decimal import Decimal, InvalidOperation, localcontext
import csv
import html
import io
import os
from pathlib import Path
import re
import shutil
import stat
import time
import zipfile

from iati_source import financial_dimensions
from iati_workspace import (
    InputError, MAX_PACKET, MAX_METADATA, REQUEST, checked_id, revision_number,
    short_text, json_bytes, load_json, digest, private_write, regular,
    file_digest, sync_dir, packet_write, export_lease,
)
from publishing import csv_cell

SCHEMA = "stellar-forge.iati-financial-reconciliation.v1"
REPORT = "stellar-forge.iati-financial-reconciliation-report.v1"
PACKET = "stellar-forge.iati-financial-reconciliation-packet.v1"
SELECTOR = {"organisation", "portfolios"}
DEFINITION = SELECTOR | {"name", "notes", "comparisons", "decisions"}
SOURCE_FILES = (
    "organisation_reconciliation.py", "organisation_reconciliation_http.py",
    "organisation_reconciliation_cli.py", "organisation_reconciliation_client.mjs",
    "organisation_reconciliation_client.d.mts", "organisation_reconciliation_mcp.mjs",
    "public/organisation_reconciliation_ui.mjs", "public/organisation_reconciliation.css",
    "ORGANISATION_RECONCILIATION.md", "reconciliation_receiving.py",
    "RECONCILIATION_RECEIVING.md",
)
MAX_ROWS = 1000000

def fields(raw, required=(), optional=()):
    if not isinstance(raw, dict) or set(required) - set(raw) or set(raw) - set(required) - set(optional):
        raise InputError("Use the complete financial comparison fields")

def positive(value):
    return revision_number(value)

def page_number(value, default, minimum, maximum=None):
    if value is None:
        return default
    if type(value) is not int or value < minimum or maximum is not None and value > maximum:
        raise InputError("Use an exact financial comparison page number")
    return value

def amount(value):
    if not isinstance(value, str) or len(value) > 8200 or not re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)", value):
        raise InputError("Use the original finite decimal amount")
    try:
        result = Decimal(value)
    except InvalidOperation as error:
        raise InputError("Invalid original financial decimal") from error
    if not result.is_finite():
        raise InputError("Use a finite original financial amount")
    return result

def calendar(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return value if parsed.isoformat() == value else None

def row_list(value, name, allow_empty=False):
    if not isinstance(value, list) or not (0 if allow_empty else 1) <= len(value) <= MAX_ROWS:
        raise InputError("Select the complete " + name)
    result = [checked_id(v) for v in value]
    if len(set(result)) != len(result):
        raise InputError("The selected " + name + " contains a duplicate")
    return sorted(result)

def decode_association(raw, key):
    value = load_json(raw.get(key, "[]"))
    if not isinstance(value, list):
        raise InputError("The retained IATI recipient record is not a list")
    return value

def recipient_attributes(item):
    if not isinstance(item, dict) or not isinstance(item.get("attributes", {}), dict):
        return {}
    return item.get("attributes", {})

def region_identity(item):
    attributes = recipient_attributes(item)
    return (item.get("vocabulary", attributes.get("vocabulary", "1")),
            item.get("vocabularyUri", attributes.get("vocabulary-uri")) or None)

def complete_geography(associations, matches):
    """Return whether one recipient owns the entire reported amount.

    Countries participate in each region vocabulary's percentage context.
    Parallel region vocabularies describe the same amount, not added amounts.
    No classification percentages are used to manufacture a financial allocation.
    """
    if not associations:
        return False
    total, selected, selected_count = Decimal(0), Decimal(0), 0
    try:
        with localcontext() as context:
            context.prec = 16400
            for item in associations:
                attributes = recipient_attributes(item)
                if not attributes.get("code"):
                    return False
                percentage = attributes.get("percentage")
                if percentage is None:
                    if len(associations) != 1:
                        return False
                    share = Decimal(100)
                else:
                    share = amount(percentage)
                if not Decimal(0) <= share <= Decimal(100):
                    return False
                total += share
                if matches(item):
                    selected += share
                    selected_count += 1
        return total == Decimal(100) and selected == Decimal(100) and selected_count == 1
    except InputError:
        return False

def recipient_match(organisation_row, activity_row):
    recipient = organisation_row.get("recipient")
    if not recipient:
        return True
    kind = recipient.get("kind")
    if kind == "recipient-org":
        # Participation and receivers do not allocate an activity's budget.
        return False
    rec = activity_row["recipients"]
    transaction_countries, transaction_regions = rec["countries"], rec["regions"]
    activity_countries, activity_regions = rec["activityCountries"], rec["activityRegions"]
    if transaction_countries or transaction_regions:
        # IATI geography is selected jointly at one level. A transaction has
        # exactly one country OR region and cannot also use activity geography.
        if (activity_countries or activity_regions
                or len(transaction_countries) + len(transaction_regions) != 1):
            return False
        countries, regions = transaction_countries, transaction_regions
    else:
        countries, regions = activity_countries, activity_regions
    groups = defaultdict(list)
    for item in regions:
        if not isinstance(item, dict):
            return False
        groups[region_identity(item)].append(item)
    if kind == "recipient-country":
        matches = lambda item: item in countries and recipient_attributes(item).get("code") == recipient.get("code")
        # A country at 100% cannot also receive an unexamined positive region
        # share. Validate its whole allocation in every declared vocabulary.
        contexts = [countries + group for group in groups.values()] if groups else [countries]
        return all(complete_geography(context, matches) for context in contexts)
    if kind == "recipient-region":
        identity = (recipient.get("vocabulary") or "1", recipient.get("vocabularyUri") or None)
        selected = groups.get(identity, [])
        matches = lambda item: item in selected and recipient_attributes(item).get("code") == recipient.get("code")
        return complete_geography(countries + selected, matches)
    return False

def issue_record(code, message, comparison_id=None, row_ids=(), severity="review"):
    value = {"code": code, "message": message, "comparisonId": comparison_id,
             "rowIds": sorted(set(row_ids)), "severity": severity}
    return {"id": digest(json_bytes(value)), **value}

def compare_rows(definition, organisation, organisation_rows, activity_rows):
    org_by_id = {r["id"]: r for r in organisation_rows}
    act_by_id = {r["id"]: r for r in activity_rows}
    result, issues = [], []
    for selection in definition["comparisons"]:
        row_id = selection["organisationRowId"]
        if row_id not in org_by_id:
            raise InputError("An organisation budget is outside the selected immutable edition")
        org = org_by_id[row_id]
        selected_ids = selection["activityRowIds"]
        if set(selected_ids) - set(act_by_id):
            raise InputError("An activity financial row is outside the selected portfolio editions")
        selected = [act_by_id[x] for x in selected_ids]
        comparison_id = digest(json_bytes({"organisationRowId": row_id,
            "organisation": definition["organisation"], "scope": selection["scopeStatement"]}))
        local_issues, exclusions = [], defaultdict(list)
        def add(code, message, ids=(), severity="review", exclude=False):
            item = issue_record(code, message, comparison_id, ids, severity)
            local_issues.append(item)
            if exclude:
                for ident in ids:
                    exclusions[ident].append(code)

        calculation = org.get("calculation") or {}
        eligible_org = calculation.get("eligible") is True and calculation.get("amount") is not None
        org_amount = amount(calculation["amount"]) if eligible_org else None
        family = org["family"]
        basis = "activity-expenditure" if family == "total-expenditure" else "activity-budget"
        start, end = calendar(org["period"].get("start")), calendar(org["period"].get("end"))
        currency = org["value"].get("currency")
        org_value_date = org["value"].get("valueDate")
        org_status = (org.get("status") or {}).get("effective")
        reporter = (organisation.get("reportingOrg") or {}).get("ref") or organisation.get("identifier")
        if not eligible_org:
            add("organisation-ineligible", "The organisation engine excluded this financial record; its original assessment remains authoritative.",
                [row_id], "error")
        if not start or not end or start > end:
            add("organisation-period", "The organisation record needs a complete valid period before comparison.", [row_id], "error")
        if not selected:
            add("no-activity-selection", "No activity financial rows have been selected for this organisation record.", severity="review")
        if selection["coverage"] == "selected":
            add("selected-coverage", "The selected activity cohort covers only the scope described by the operator. The numerical difference is not an accounting error.",
                severity="information")
        if (org.get("recipient") or {}).get("kind") == "recipient-org":
            add("recipient-organisation-allocation", "Activity participation and transaction receivers do not allocate an activity budget to this recipient organisation. Retain a source-defined allocation before comparing.",
                [r["id"] for r in selected], "review", exclude=True)

        for row in selected:
            ident = row["id"]
            if not row["eligibility"]:
                add("activity-ineligible", "The original activity finance engine excluded this record.", [ident], exclude=True)
            if row["reportingOrgRef"] != reporter:
                add("reporting-organisation", "The activity and selected organisation record have different reporting organisations.", [ident], exclude=True)
            if not currency or row["currency"] != currency:
                add("currency", "Reported currencies differ or are missing. The comparison does not convert currencies.", [ident], exclude=True)
            if basis == "activity-budget":
                if row["collection"] != "budgets":
                    add("financial-basis", "An organisation budget compares to selected activity budgets, not transaction flows.", [ident], exclude=True)
                else:
                    period = row["period"]
                    rs, re_ = calendar(period.get("start")), calendar(period.get("end"))
                    if not start or not end or not rs or not re_ or not (start <= rs <= re_ <= end):
                        add("whole-budget-period", "The complete activity budget period is not contained in the organisation period. Its amount has not been prorated.", [ident], exclude=True)
                    if row["budgetStatus"] != org_status:
                        add("budget-status", "Indicative and committed budgets have different reported status.", [ident], exclude=True)
            elif row["collection"] != "transactions" or row["transactionType"] != "4":
                add("financial-basis", "Organisation expenditure compares only to activity expenditure transactions (type 4).", [ident], exclude=True)
            elif not start or not end or not calendar(row["transactionDate"]) or not start <= row["transactionDate"] <= end:
                add("expenditure-period", "The expenditure transaction date is outside the selected organisation period.", [ident], exclude=True)
            if row["valueDate"] != org_value_date:
                if selection["valueDatePolicy"] == "separate":
                    add("value-date", "Value dates differ. Select a separate context or explicitly compare reported nominal amounts.", [ident], exclude=True)
                else:
                    add("nominal-value-date", "The operator selected a nominal comparison of reported same-currency amounts with different value dates; all value dates are retained.",
                        [ident], "information")
            if not recipient_match(org, row):
                add("recipient-coverage", "The source does not provide one matching recipient at 100 percent in a consistent activity or transaction geography and the exact region vocabulary. Classification membership alone has not allocated the amount.",
                    [ident], exclude=True)
            if row["originalIssues"]:
                add("activity-source-review", "The retained activity row contains original publisher review issues.", [ident])
        for original in org.get("issues", []):
            add("organisation-source-review", str(original.get("message") or original.get("code") or "Original organisation issue"), [row_id])

        candidates = [r for r in selected if not exclusions.get(r["id"])]
        hierarchies = {r["hierarchy"] for r in candidates}
        if len(hierarchies) > 1:
            add("mixed-hierarchy", "The selected hierarchy levels may repeat parent and child finance. Select one explicit level for this comparison.",
                [r["id"] for r in candidates], exclude=True)
        # Two publisher editions of one activity are alternatives, not additive.
        by_activity = defaultdict(list)
        for row in candidates:
            by_activity[row["activityId"]].append(row)
        for rows in by_activity.values():
            if len({r["sourceId"] for r in rows}) > 1:
                add("activity-source-editions", "More than one publisher source edition is selected for the same activity. Select the intended edition.",
                    [r["id"] for r in rows], exclude=True)
        if basis == "activity-budget":
            for rows in by_activity.values():
                ordered = sorted(rows, key=lambda r: (r["period"]["start"], r["period"]["end"], r["id"]))
                active = []
                overlapping = set()
                for row in ordered:
                    active = [other for other in active if other["period"]["end"] >= row["period"]["start"]]
                    for other in active:
                        overlapping.update((row["id"], other["id"]))
                    active.append(row)
                if overlapping:
                    add("overlapping-budgets", "Budget periods overlap within an activity. Original and revised versions, and annual and quarterly budgets, have not been added together.",
                        overlapping, exclude=True)
            bases = {r["budgetType"] for r in candidates if not exclusions.get(r["id"])}
            if len(bases) > 1:
                add("mixed-budget-basis", "Original and revised budget bases are mixed across this selection. Choose a consistent basis or separate the comparison.",
                    [r["id"] for r in candidates if not exclusions.get(r["id"])], exclude=True)
        included = [r for r in selected if not exclusions.get(r["id"])]
        if basis == "activity-budget" and start and end:
            for activity_id in sorted({r["activityId"] for r in included}):
                periods = sorted((r["period"]["start"], r["period"]["end"]) for r in included if r["activityId"] == activity_id)
                cursor = date.fromisoformat(start).toordinal()
                missing = []
                for left, right in periods:
                    a, b = date.fromisoformat(left).toordinal(), date.fromisoformat(right).toordinal()
                    if a > cursor:
                        missing.append({"start": date.fromordinal(cursor).isoformat(), "end": date.fromordinal(a - 1).isoformat()})
                    cursor = max(cursor, b + 1)
                last = date.fromisoformat(end).toordinal()
                if cursor <= last:
                    missing.append({"start": date.fromordinal(cursor).isoformat(), "end": end})
                if missing:
                    add("period-coverage", "Activity " + activity_id + " does not cover the full organisation period: " +
                        "; ".join(x["start"] + " to " + x["end"] for x in missing),
                        [r["id"] for r in included if r["activityId"] == activity_id])
        with localcontext() as context:
            context.prec = 16400
            subtotal = sum((amount(r["amount"]) for r in included), Decimal(0))
            difference = org_amount - subtotal if org_amount is not None and included else None
        if selection["coverage"] == "complete" and difference is not None and difference != 0:
            add("declared-complete-difference", "The operator declared complete coverage and the reported amounts differ. Review the recorded scope and source editions before interpreting the difference.",
                [r["id"] for r in included])
        if selection["coverage"] == "complete":
            add("coverage-attestation", "Complete coverage is the named operator's scope statement; the software cannot infer unpublished or unselected activities.",
                severity="information")
        issues.extend(local_issues)
        result.append({
            "id": comparison_id, "organisationRowId": row_id, "family": family,
            "basis": basis, "coverage": selection["coverage"], "scopeStatement": selection["scopeStatement"],
            "valueDatePolicy": selection["valueDatePolicy"], "currency": currency,
            "organisationAmount": format(org_amount, "f") if org_amount is not None else None,
            "selectedAmount": format(subtotal, "f") if included else None,
            "difference": format(difference, "f") if difference is not None else None,
            "period": org["period"], "recipient": org.get("recipient"), "status": org_status,
            "reportingOrgRef": reporter, "hierarchies": sorted({r["hierarchy"] for r in included}),
            "valueDates": sorted({r["valueDate"] for r in included} | {org_value_date or ""}),
            "selectedCount": len(selected), "eligibleCount": len(included), "excludedCount": sum(bool(v) for v in exclusions.values()),
            "includedRowIds": [r["id"] for r in included],
            "excludedRows": [{"id": key, "reasons": sorted(set(value))} for key, value in sorted(exclusions.items()) if value],
            "issues": [i["id"] for i in local_issues],
        })
    unique = {i["id"]: i for i in issues}
    return result, [unique[k] for k in sorted(unique)]

class OrganisationReconciliation:
    def __init__(self, workspace):
        self.ws = workspace
        workspace.db.executescript("""
            CREATE TABLE IF NOT EXISTS iati_reconciliation_cases(
              id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL,
              PRIMARY KEY(id,revision));
            CREATE TABLE IF NOT EXISTS iati_reconciliation_requests(
              id TEXT PRIMARY KEY, request_sha TEXT NOT NULL, case_id TEXT NOT NULL,
              revision INTEGER NOT NULL, body TEXT NOT NULL);
        """)

    def _selector(self, raw):
        fields(raw, SELECTOR)
        org = raw["organisation"]
        fields(org, {"id", "revision", "organisationKey"})
        organisation = {"id": checked_id(org["id"]), "revision": positive(org["revision"]),
                        "organisationKey": checked_id(org["organisationKey"])}
        refs = raw["portfolios"]
        if not isinstance(refs, list) or not 1 <= len(refs) <= 32:
            raise InputError("Select 1–32 retained activity portfolio editions")
        portfolios = []
        for ref in refs:
            fields(ref, {"id", "revision"})
            portfolios.append({"id": checked_id(ref["id"]), "revision": positive(ref["revision"])})
        if len({(p["id"], p["revision"]) for p in portfolios}) != len(portfolios):
            raise InputError("Select each activity portfolio edition once")
        return {"organisation": organisation, "portfolios": sorted(portfolios, key=lambda p: (p["id"], p["revision"]))}

    def _definition(self, raw):
        fields(raw, {"name", "organisation", "portfolios", "comparisons"}, {"notes", "decisions"})
        value = {**self._selector({k: raw[k] for k in SELECTOR}),
                 "name": short_text(raw["name"], "Comparison name", 160),
                 "notes": short_text(raw.get("notes", ""), "Comparison notes", 16000, empty=True),
                 "comparisons": [], "decisions": []}
        comparisons = raw["comparisons"]
        if not isinstance(comparisons, list) or not 1 <= len(comparisons) <= 10000:
            raise InputError("Choose at least one organisation budget or expenditure comparison")
        seen = set()
        for item in comparisons:
            fields(item, {"organisationRowId", "activityRowIds", "coverage", "scopeStatement"}, {"valueDatePolicy"})
            ident = checked_id(item["organisationRowId"])
            if ident in seen:
                raise InputError("Use one explicit activity selection per organisation financial row")
            seen.add(ident)
            if item["coverage"] not in {"selected", "complete"}:
                raise InputError("Describe selected or complete activity coverage")
            policy = item.get("valueDatePolicy", "separate")
            if policy not in {"separate", "nominal"}:
                raise InputError("Keep value dates separate or explicitly compare nominal reported amounts")
            value["comparisons"].append({"organisationRowId": ident,
                "activityRowIds": row_list(item["activityRowIds"], "activity row identities", True),
                "coverage": item["coverage"], "valueDatePolicy": policy,
                "scopeStatement": short_text(item["scopeStatement"], "Coverage statement", 8000)})
        value["comparisons"].sort(key=lambda x: x["organisationRowId"])
        decisions = raw.get("decisions", [])
        if not isinstance(decisions, list) or len(decisions) > 10000:
            raise InputError("Use the complete named comparison decisions")
        seen = set()
        for item in decisions:
            fields(item, {"issueId", "decision", "actor", "note"})
            ident = checked_id(item["issueId"])
            if ident in seen or item["decision"] not in {"acknowledge", "follow-up"}:
                raise InputError("Use one named decision per comparison issue")
            seen.add(ident)
            value["decisions"].append({"issueId": ident, "decision": item["decision"],
                "actor": short_text(item["actor"], "Decision owner", 160),
                "note": short_text(item["note"], "Decision explanation", 8000)})
        value["decisions"].sort(key=lambda x: x["issueId"])
        return value

    def _catalog(self, selector):
        org = selector["organisation"]
        plan = self.ws.organisation.plan(org["id"], org["revision"])
        if org["organisationKey"] not in plan["organisationKeys"]:
            raise InputError("The organisation is outside the selected plan")
        query = {"id": org["id"], "revision": org["revision"], "view": "candidate",
                 "organisationKey": org["organisationKey"], "section": "budgets", "offset": 0, "limit": 250}
        org_rows, snapshot = [], None
        while True:
            if snapshot is not None:
                query["expectedSnapshot"] = snapshot
            page = self.ws.organisation.rows(query)
            snapshot = page["snapshotSha256"]
            org_rows.extend(page["rows"])
            if len(org_rows) >= page["total"]:
                break
            if not page["rows"] or len(org_rows) > MAX_ROWS:
                raise InputError("The complete organisation page sequence is unavailable")
            query["offset"] = len(org_rows)
        detail = self.ws.organisation.detail({"id": org["id"], "revision": org["revision"],
            "view": "candidate", "rowId": org["organisationKey"], "expectedSnapshot": snapshot})
        organisation = deepcopy(detail["row"])
        organisation.update({"sourceId": plan["sourceId"], "candidateSha256": plan["candidateSha256"],
                             "snapshotSha256": snapshot, "plan": {"id": plan["id"], "revision": plan["revision"]}})
        names = organisation.get("names") or []
        organisation["name"] = next((x.get("text") for x in names if x.get("text")), organisation.get("identifier", ""))
        activity, portfolios = {}, []
        for reference in selector["portfolios"]:
            p = self.ws.portfolio(reference["id"], reference["revision"])
            portfolios.append({"id": p["id"], "revision": p["revision"], "name": p["name"],
                               "definitionSha256": p["definitionSha256"], "selection": p["selection"]})
            for edition in p["editions"]:
                for collection in ("budgets", "transactions"):
                    build = edition[collection]
                    if build["source"] != edition["source"]:
                        raise InputError("The retained activity build has another source")
                    for raw in self.ws._rows(build):
                        ident = digest(json_bytes({"source": edition["source"], "collection": collection,
                                                  "nativeRowId": raw["row_id"]}))
                        dimensions = financial_dimensions(raw, collection)
                        row = {"id": ident, "nativeRowId": raw["row_id"], "sourceId": edition["source"],
                            "collection": collection, "activityId": raw["activity_id"], "title": raw.get("title", ""),
                            "reportingOrgRef": dimensions["reportingOrgRef"], "hierarchy": dimensions["hierarchy"],
                            "currency": dimensions["currency"], "valueDate": dimensions["valueDate"],
                            "amount": raw["value_decimal"] if raw["financial_eligible"] == "true" else None,
                            "eligibility": raw["financial_eligible"] == "true",
                            "period": {"start": dimensions.get("periodStart"), "end": dimensions.get("periodEnd")} if collection == "budgets" else None,
                            "transactionDate": raw.get("transaction_day"),
                            "budgetType": dimensions.get("budgetType"), "budgetStatus": dimensions.get("budgetStatus"),
                            "transactionType": dimensions.get("transactionType"),
                            "dimensions": dimensions, "originalIssues": load_json(raw["issues_json"]),
                            "recipients": {
                                "activityCountries": decode_association(raw, "activity_countries_json"),
                                "activityRegions": decode_association(raw, "activity_regions_json"),
                                "participatingOrgs": decode_association(raw, "participating_orgs_json"),
                                "countries": decode_association(raw, "countries_json"),
                                "regions": decode_association(raw, "regions_json"),
                                "receiverOrgs": decode_association(raw, "receiver_orgs_json"),
                            }}
                        if ident in activity:
                            if activity[ident]["row"] != row:
                                raise InputError("One retained activity identity has conflicting source content")
                            activity[ident]["builds"].add(build["id"])
                            activity[ident]["portfolios"].add((p["id"], p["revision"]))
                        else:
                            activity[ident] = {"row": row, "builds": {build["id"]},
                                              "portfolios": {(p["id"], p["revision"])}}
                        if len(activity) > MAX_ROWS:
                            raise InputError("The selected financial catalogue exceeds one million rows")
        rows = [{**v["row"], "buildIds": sorted(v["builds"]),
                 "portfolios": [{"id": i, "revision": r} for i, r in sorted(v["portfolios"])]}
                for _, v in sorted(activity.items())]
        result = {"selection": selector, "organisation": organisation, "organisationRows": org_rows,
                  "activityRows": rows, "portfolios": portfolios}
        return {**result, "snapshotSha256": digest(json_bytes(result))}

    def catalog(self, raw):
        fields(raw, SELECTOR | {"section"}, {"offset", "limit", "expectedSnapshot"})
        if raw["section"] not in {"organisation", "activity"}:
            raise InputError("Choose organisation or activity financial rows")
        with self.ws.mutex:
            selector = self._selector({k: raw[k] for k in SELECTOR})
            data = self._catalog(selector)
            if raw.get("expectedSnapshot") is not None and raw["expectedSnapshot"] != data["snapshotSha256"]:
                raise InputError("The selected financial catalogue changed")
            offset = page_number(raw.get("offset"), 0, 0)
            limit = page_number(raw.get("limit"), 50, 1, 250)
            rows = data["organisationRows" if raw["section"] == "organisation" else "activityRows"]
            return {"rows": rows[offset:offset + limit], "total": len(rows), "offset": offset, "limit": limit,
                    "snapshotSha256": data["snapshotSha256"], "organisation": data["organisation"],
                    "portfolios": data["portfolios"]}

    def preview(self, raw):
        with self.ws.mutex:
            definition = self._definition(raw)
            data = self._catalog({k: definition[k] for k in SELECTOR})
            comparisons, issues = compare_rows(definition, data["organisation"], data["organisationRows"], data["activityRows"])
            issue_ids = {i["id"] for i in issues}
            if {d["issueId"] for d in definition["decisions"]} - issue_ids:
                raise InputError("A decision belongs to an earlier source or comparison; review the current issues")
            decisions = {d["issueId"]: d for d in definition["decisions"]}
            issues = [{**i, "decision": decisions.get(i["id"])} for i in issues]
            result = {"schema": REPORT, **data, "comparisons": comparisons, "issues": issues,
                "decisions": definition["decisions"], "definitionSha256": digest(json_bytes(definition)),
                "summary": {"comparisons": len(comparisons), "organisationRows": len(data["organisationRows"]),
                    "activityRows": len(data["activityRows"]), "issues": len(issues),
                    "unresolved": sum(i["severity"] != "information" and
                        (not i["decision"] or i["decision"]["decision"] == "follow-up") for i in issues),
                    "includedRows": len({r for c in comparisons for r in c["includedRowIds"]}),
                    "excludedRows": len({r["id"] for c in comparisons for r in c["excludedRows"]})},
                "semantics": {
                    "coverage": "A selected activity cohort is not automatically the complete organisation budget.",
                    "amounts": "Original exact decimals; same currency; explicit nominal value-date choice; no currency conversion or proration.",
                    "versions": "Overlapping activity budget versions and parent/child hierarchies are kept separate.",
                    "recipients": "Country or region amounts require one matching recipient at 100 percent; no inferred organisation allocation.",
                    "sources": "The original organisation and activity engines retain eligibility, source editions and complete underlying output.",
                }}
            result["snapshotSha256"] = digest(json_bytes({k: v for k, v in result.items() if k != "snapshotSha256"}))
            if len(json_bytes(result)) > MAX_METADATA:
                raise InputError("The complete financial review exceeds the original 64 MiB metadata capacity")
            return result

    def plan(self, ident, revision=None):
        ident = checked_id(ident)
        with self.ws.mutex:
            if revision is None:
                row = self.ws.db.execute("SELECT body FROM iati_reconciliation_cases WHERE id=? ORDER BY revision DESC LIMIT 1", (ident,)).fetchone()
            else:
                row = self.ws.db.execute("SELECT body FROM iati_reconciliation_cases WHERE id=? AND revision=?", (ident, positive(revision))).fetchone()
            if row is None:
                raise InputError("Unknown retained financial comparison revision")
            return load_json(row["body"])

    def history(self, ident):
        with self.ws.mutex:
            self.plan(ident)
            return [load_json(row["body"]) for row in self.ws.db.execute(
                "SELECT body FROM iati_reconciliation_cases WHERE id=? ORDER BY revision", (ident,))]

    def status(self):
        with self.ws.mutex:
            cases = [load_json(row["body"]) for row in self.ws.db.execute("""
                SELECT p.body FROM iati_reconciliation_cases p JOIN
                (SELECT id,MAX(revision) revision FROM iati_reconciliation_cases GROUP BY id) q
                ON p.id=q.id AND p.revision=q.revision ORDER BY p.id""")]
            org_status = self.ws.organisation.status()
            plans = []
            for plan in org_status["plans"]:
                labels = []
                for key in plan["organisationKeys"]:
                    row = self.ws.organisation.detail({"id": plan["id"], "revision": plan["revision"],
                        "view": "candidate", "rowId": key})["row"]
                    labels.append({"key": key, "identifier": row.get("identifier"),
                        "reportingOrg": row.get("reportingOrg"), "names": row.get("names", [])})
                plans.append({**plan, "organisations": labels})
            return {"schema": SCHEMA,
                "cases": [{k: p[k] for k in ("id", "revision", "name", "review", "summary", "createdAt", "updatedAt")} for p in cases],
                "organisationPlans": plans,
                "activityPortfolios": [{k: p[k] for k in ("id", "revision", "name", "selection", "sources", "report")} for p in self.ws.portfolios()]}

    def request(self, request_id):
        if not isinstance(request_id, str) or not REQUEST.fullmatch(request_id):
            raise InputError("Use the original financial comparison request ID")
        with self.ws.mutex:
            row = self.ws.db.execute("SELECT * FROM iati_reconciliation_requests WHERE id=?", (request_id,)).fetchone()
            if not row:
                return {"state": "NOT_RECORDED"}
            return {"state": "RECORDED", "case": self.plan(row["case_id"], row["revision"])}

    def _replay(self, action, raw):
        request_id = raw.get("requestId")
        if not isinstance(request_id, str) or not REQUEST.fullmatch(request_id):
            raise InputError("Use a unique original financial comparison request ID")
        payload = {"action": action, "input": raw}
        request_sha = digest(json_bytes(payload))
        prior = self.ws.db.execute("SELECT * FROM iati_reconciliation_requests WHERE id=?", (request_id,)).fetchone()
        if prior:
            if prior["request_sha"] != request_sha:
                raise InputError("This request ID already belongs to a different financial comparison action")
            return self.plan(prior["case_id"], prior["revision"]), request_sha, payload
        return None, request_sha, payload

    def _persist(self, previous, definition, report, review, request_sha, payload):
        now = time.time()
        ident = previous["id"] if previous else digest(os.urandom(32))
        revision = previous["revision"] + 1 if previous else 1
        value = {"schema": SCHEMA, "id": ident, "revision": revision,
                 "previousRevision": previous["revision"] if previous else None,
                 "name": definition["name"], "definition": definition, "report": report,
                 "review": review, "summary": report["summary"],
                 "createdAt": previous["createdAt"] if previous else now, "updatedAt": now}
        encoded = json_bytes(value)
        if len(encoded) > MAX_METADATA:
            raise InputError("The complete retained comparison exceeds 64 MiB")
        with self.ws.db:
            self.ws.db.execute("INSERT INTO iati_reconciliation_cases VALUES(?,?,?)", (ident, revision, encoded.decode()))
            self.ws.db.execute("INSERT INTO iati_reconciliation_requests VALUES(?,?,?,?,?)",
                (payload["input"]["requestId"], request_sha, ident, revision, json_bytes(payload).decode()))
        return value

    def save(self, raw):
        fields(raw, {"requestId", "name", "organisation", "portfolios", "comparisons"},
               {"id", "expectedRevision", "notes", "decisions"})
        with self.ws.mutex:
            previous_reply, sha, payload = self._replay("save", raw)
            if previous_reply is not None:
                return previous_reply
            if ("id" in raw) != ("expectedRevision" in raw):
                raise InputError("An edit needs both the saved comparison ID and expected revision")
            previous = self.plan(raw["id"]) if "id" in raw else None
            if previous and positive(raw["expectedRevision"]) != previous["revision"]:
                raise InputError("The financial comparison changed; reopen its current revision")
            definition = self._definition({k: v for k, v in raw.items() if k in DEFINITION})
            report = self.preview(definition)
            return self._persist(previous, definition, report, None, sha, payload)

    def _review(self, raw, case):
        if raw["decision"] not in {"approve", "request_changes"}:
            raise InputError("Choose approval or request changes")
        acknowledged = row_list(raw["acknowledgedIssueIds"], "acknowledged issue identities", True)
        available = {i["id"] for i in case["report"]["issues"]}
        if set(acknowledged) - available:
            raise InputError("The review names issues from another source or comparison edition")
        required = {i["id"] for i in case["report"]["issues"] if i["severity"] != "information"}
        if raw["decision"] == "approve" and required - set(acknowledged):
            raise InputError("Review every noninformational comparison issue before approving this report")
        return {"decision": raw["decision"], "actor": short_text(raw["actor"], "Review owner", 160),
                "note": short_text(raw["note"], "Review explanation", 8000),
                "acknowledgedIssueIds": acknowledged,
                "reportSha256": case["report"]["snapshotSha256"]}

    def review(self, raw):
        fields(raw, {"requestId", "id", "expectedRevision", "decision", "actor", "note", "acknowledgedIssueIds"})
        with self.ws.mutex:
            prior, sha, payload = self._replay("review", raw)
            if prior is not None:
                return prior
            case = self.plan(raw["id"])
            if positive(raw["expectedRevision"]) != case["revision"]:
                raise InputError("The financial comparison changed before review")
            rebuilt = self.preview(case["definition"])
            if rebuilt != case["report"]:
                raise InputError("The retained source no longer reproduces this financial comparison")
            reviewed = self._review(raw, case)
            return self._persist(case, case["definition"], case["report"], reviewed, sha, payload)

    def rows(self, raw):
        fields(raw, {"id", "revision", "section"}, {"offset", "limit", "expectedSnapshot"})
        if raw["section"] not in {"comparisons", "activity", "issues", "decisions"}:
            raise InputError("Choose comparison, activity, issue or decision rows")
        with self.ws.mutex:
            case = self.plan(raw["id"], raw["revision"])
            report = case["report"]
            snapshot = digest(json_bytes({"id": case["id"], "revision": case["revision"],
                                          "reportSha256": report["snapshotSha256"]}))
            if raw.get("expectedSnapshot") is not None and raw["expectedSnapshot"] != snapshot:
                raise InputError("The selected financial review page changed")
            offset = page_number(raw.get("offset"), 0, 0)
            limit = page_number(raw.get("limit"), 50, 1, 250)
            key = "activityRows" if raw["section"] == "activity" else raw["section"]
            rows = report[key]
            return {"rows": rows[offset:offset + limit], "total": len(rows), "offset": offset,
                    "limit": limit, "snapshotSha256": snapshot}

    def compare(self, raw):
        fields(raw, {"before", "after"})
        with self.ws.mutex:
            for name in ("before", "after"):
                fields(raw[name], {"id", "revision"})
            before = self.plan(raw["before"]["id"], raw["before"]["revision"])
            after = self.plan(raw["after"]["id"], raw["after"]["revision"])
            def grouping(case):
                groups = defaultdict(list)
                for row in case["report"]["comparisons"]:
                    key = json_bytes({k: row[k] for k in ("family", "basis", "period", "recipient", "currency", "reportingOrgRef")}).decode()
                    groups[key].append(row)
                return groups
            left, right = grouping(before), grouping(after)
            added, removed, changed, ambiguous, unchanged = [], [], [], [], []
            for key in sorted(set(left) | set(right)):
                a, b = left.get(key, []), right.get(key, [])
                context = load_json(key)
                if len(a) > 1 or len(b) > 1:
                    ambiguous.append({"context": context, "before": a, "after": b})
                elif not a:
                    added.append(b[0])
                elif not b:
                    removed.append(a[0])
                else:
                    differences = {k: {"before": a[0].get(k), "after": b[0].get(k)}
                        for k in sorted(set(a[0]) | set(b[0])) if a[0].get(k) != b[0].get(k)}
                    if differences:
                        changed.append({"context": context, "before": a[0]["id"], "after": b[0]["id"], "fields": differences})
                    else:
                        unchanged.append(a[0]["id"])
            definition_changes = {key: {"before": before["definition"].get(key), "after": after["definition"].get(key)}
                for key in sorted(DEFINITION) if before["definition"].get(key) != after["definition"].get(key)}
            review_change = ({"before": before["review"], "after": after["review"]}
                             if before["review"] != after["review"] else None)
            issue_before = {item["id"]: item for item in before["report"]["issues"]}
            issue_after = {item["id"]: item for item in after["report"]["issues"]}
            issue_changes = {
                "added": [issue_after[key] for key in sorted(set(issue_after) - set(issue_before))],
                "removed": [issue_before[key] for key in sorted(set(issue_before) - set(issue_after))],
                "changed": [{"id": key, "before": issue_before[key], "after": issue_after[key]}
                            for key in sorted(set(issue_before) & set(issue_after))
                            if issue_before[key] != issue_after[key]],
            }
            return {"schema": SCHEMA + ".comparison", "before": raw["before"], "after": raw["after"],
                    "definitionChanges": definition_changes, "reviewChange": review_change,
                    "issueChanges": issue_changes,
                    "sourceChanges": {"before": {k: before["definition"][k] for k in SELECTOR},
                                      "after": {k: after["definition"][k] for k in SELECTOR}},
                    "added": added, "removed": removed, "changed": changed, "ambiguous": ambiguous,
                    "unchanged": unchanged, "summary": {"added": len(added), "removed": len(removed),
                        "changed": len(changed), "ambiguous": len(ambiguous), "unchanged": len(unchanged),
                        "definitionChanged": bool(definition_changes), "reviewChanged": review_change is not None,
                        "issuesAdded": len(issue_changes["added"]), "issuesRemoved": len(issue_changes["removed"]),
                        "issuesChanged": len(issue_changes["changed"])}}

    def _render(self, case):
        report = case["report"]
        out = io.StringIO(newline="")
        columns = ["family", "basis", "coverage", "scopeStatement", "currency", "organisationAmount",
            "selectedAmount", "difference", "selectedCount", "eligibleCount", "excludedCount",
            "period", "recipient", "valueDates", "valueDatePolicy", "reportingOrgRef", "hierarchies"]
        writer = csv.DictWriter(out, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        for item in report["comparisons"]:
            writer.writerow({key: csv_cell(json_bytes(item[key]).decode().strip()
                if isinstance(item[key], (dict, list)) else item[key] if item[key] is not None else "")
                for key in columns})
        esc = lambda value: html.escape(str(value if value is not None else ""), quote=True)
        content = ["<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
            "<title>" + esc(case["name"]) + "</title><style>body{font:15px system-ui;color:#222;background:white;max-width:1100px;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:.6rem;text-align:left;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere}.scroll{overflow:auto}h1,h2{line-height:1.2}tr{break-inside:avoid}@media print{.scroll{overflow:visible}}</style><body>",
            "<h1>" + esc(case["name"]) + "</h1><p>Revision " + str(case["revision"]) + " · " +
            esc((case["review"] or {}).get("decision", "draft")) + "</p>",
            "<p>" + esc(case["definition"]["notes"]) + "</p>",
            "<h2>Selected organisation and activity coverage</h2><p>" + esc(report["organisation"].get("name")) +
            " · " + esc(report["organisation"].get("identifier")) + "</p>",
            "<p>" + esc(report["semantics"]["coverage"]) + "</p><p>" + esc(report["semantics"]["amounts"]) + "</p>"]
        for row in report["comparisons"]:
            content += ["<section><h2>" + esc(row["family"].replace("-", " ").capitalize()) + "</h2>",
                "<p>" + esc(row["scopeStatement"]) + "</p><div class='scroll'><table><thead><tr>",
                "<th>Period</th><th>Currency</th><th>Organisation</th><th>Selected activities</th><th>Difference</th><th>Rows included / selected</th>",
                "</tr></thead><tbody><tr><td>" + esc(row["period"].get("start")) + " to " + esc(row["period"].get("end")) + "</td>",
                "<td>" + esc(row["currency"]) + "</td><td>" + esc(row["organisationAmount"]) + "</td>",
                "<td>" + esc(row["selectedAmount"]) + "</td><td>" + esc(row["difference"]) + "</td>",
                "<td>" + str(row["eligibleCount"]) + " / " + str(row["selectedCount"]) + "</td></tr></tbody></table></div>",
                "<p>Value dates: " + esc(", ".join(row["valueDates"])) + ". Policy: " + esc(row["valueDatePolicy"]) + ".</p>",
                "<p>Coverage: " + esc(row["coverage"]) + ". Excluded rows: " + str(row["excludedCount"]) + ".</p></section>"]
        content += ["<h2>Review decisions</h2>"]
        for item in report["issues"]:
            decision = item.get("decision")
            content += ["<section><h3>" + esc(item["code"].replace("-", " ").capitalize()) + "</h3><p>" + esc(item["message"]) + "</p>"]
            if decision:
                content += ["<p>" + esc(decision["actor"]) + " · " + esc(decision["decision"]) + ": " + esc(decision["note"]) + "</p>"]
            else:
                content += ["<p>Review status: " + ("information" if item["severity"] == "information" else "open") + "</p>"]
            content += ["</section>"]
        if case["review"]:
            content += ["<h2>Named review</h2><p>" + esc(case["review"]["actor"]) + " · " +
                esc(case["review"]["decision"]) + "</p><p>" + esc(case["review"]["note"]) + "</p>"]
        content += ["<h2>Source selections</h2><pre>" + esc(json_bytes({k: case["definition"][k] for k in SELECTOR}).decode()) + "</pre>",
            "<p>The complete JSON and receiving archive retain every selected record, source edition, issue and decision.</p></body></html>"]
        return {"report.json": json_bytes(case), "report.html": "".join(content).encode(),
                "comparisons.csv": out.getvalue().encode()}

    def file(self, raw):
        fields(raw, {"id", "kind"}, {"revision"})
        names = {"report": ("report.html", "text/html; charset=utf-8"),
                 "csv": ("comparisons.csv", "text/csv; charset=utf-8"),
                 "json": ("report.json", "application/json")}
        if raw["kind"] not in names:
            raise InputError("Choose the complete HTML, CSV or JSON financial review")
        with self.ws.mutex:
            case = self.plan(raw["id"], raw.get("revision"))
            name, media = names[raw["kind"]]
            body = self._render(case)[name]
            directory = self.ws.root / "comparisons" / "reconciliation"
            if not directory.exists():
                directory.mkdir(mode=0o700)
            if directory.is_symlink() or not directory.is_dir():
                raise InputError("The original financial report directory changed")
            path = directory / (digest(body) + "-" + name)
            if path.exists():
                if file_digest(path, MAX_METADATA) != digest(body):
                    raise InputError("A retained financial review file changed")
            else:
                private_write(path, body)
            return {"path": path, "name": "IATI_Financial_Comparison_r" + str(case["revision"]) + "_" + name,
                    "media": media, "bytes": len(body), "sha256": digest(body)}

    def _closure(self, history):
        org, activity = {}, {}
        for case in history:
            ref = case["definition"]["organisation"]
            org[ref["id"]] = max(org.get(ref["id"], 0), ref["revision"])
            for ref in case["definition"]["portfolios"]:
                activity[ref["id"]] = max(activity.get(ref["id"], 0), ref["revision"])
        return {"organisation": [{"id": ident, "revision": revision,
                    "packet": "sources/org-" + ident + "-" + str(revision) + ".zip"} for ident, revision in sorted(org.items())],
                "portfolios": [{"id": ident, "revision": revision,
                    "packet": "sources/activity-" + ident + "-" + str(revision) + ".zip"} for ident, revision in sorted(activity.items())]}

    def export(self, raw):
        fields(raw, {"id", "output"}, {"revision"})
        output = Path(raw["output"]).expanduser().absolute()
        with self.ws.mutex, self.ws.scratch() as temporary:
            case = self.plan(raw["id"], raw.get("revision"))
            history = [p for p in self.history(case["id"]) if p["revision"] <= case["revision"]]
            requests = [dict(row) for row in self.ws.db.execute(
                "SELECT * FROM iati_reconciliation_requests WHERE case_id=? AND revision<=? ORDER BY revision,id",
                (case["id"], case["revision"]))]
            closure = self._closure(history)
            expected = {"id": case["id"], "revision": case["revision"], "sourceRefs": closure}
            if output.exists() or output.is_symlink():
                with self.ws.scratch() as checked:
                    manifest = read_reconciliation_packet(output, checked)
                    if any(manifest.get(k) != v for k, v in expected.items()):
                        raise InputError("This output contains a different comparison edition")
                    if load_json((checked / "history.json").read_bytes()) != history or load_json((checked / "requests.json").read_bytes()) != requests:
                        raise InputError("This output contains a different retained comparison history")
                    for name, body in self._render(case).items():
                        if (checked / name).read_bytes() != body:
                            raise InputError("This output contains a different complete comparison report")
                    verify_installed_source(checked, manifest)
                    return {"state": "COMPLETE", "file": str(output), "bytes": output.stat().st_size,
                            "sha256": file_digest(output, MAX_PACKET), "reused": True, **expected}
            files = {}
            for name, value in (("history.json", history), ("requests.json", requests)):
                path = temporary / name
                private_write(path, json_bytes(value))
                files[name] = path
            for name, body in self._render(case).items():
                path = temporary / name
                private_write(path, body)
                files[name] = path
            (temporary / "sources").mkdir(mode=0o700)
            for ref in closure["organisation"]:
                path = temporary / ref["packet"]
                self.ws.organisation.export({"id": ref["id"], "revision": ref["revision"], "output": path})
                files[ref["packet"]] = path
            for ref in closure["portfolios"]:
                path = temporary / ref["packet"]
                self.ws.export_portfolio(ref["id"], path, ref["revision"])
                files[ref["packet"]] = path
            for name in SOURCE_FILES:
                source = Path(__file__).resolve().parent / name
                if not source.is_file() or source.is_symlink():
                    raise InputError("The complete installed comparison source is missing " + name)
                target = temporary / "installed" / name
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                private_write(target, source.read_bytes())
                files["installed/" + name] = target
            result = packet_write(output, files, PACKET, expected)
            return {"state": "COMPLETE", **result, **expected}

    def receive(self, raw):
        fields(raw, {"path"})
        with self.ws.mutex, self.ws.scratch() as temporary:
            manifest = read_reconciliation_packet(Path(raw["path"]), temporary)
            ident, last = checked_id(manifest["id"]), positive(manifest["revision"])
            verify_installed_source(temporary, manifest)
            history = load_json((temporary / "history.json").read_bytes())
            requests = load_json((temporary / "requests.json").read_bytes())
            if not isinstance(history, list) or len(history) != last or not isinstance(requests, list) or len(requests) != last:
                raise InputError("The complete comparison revision and request histories are required")
            required_case = {"schema", "id", "revision", "previousRevision", "name", "definition",
                             "report", "review", "summary", "createdAt", "updatedAt"}
            for revision, case in enumerate(history, 1):
                fields(case, required_case)
                if (case["schema"] != SCHEMA or case["id"] != ident or case["revision"] != revision
                        or case["previousRevision"] != (revision - 1 if revision > 1 else None)
                        or case["name"] != case["definition"].get("name")
                        or case["createdAt"] != history[0]["createdAt"]
                        or type(case["createdAt"]) not in {int, float} or type(case["updatedAt"]) not in {int, float}):
                    raise InputError("The financial comparison history has an invalid identity or sequence")
                existing = self.ws.db.execute("SELECT body FROM iati_reconciliation_cases WHERE id=? AND revision=?", (ident, revision)).fetchone()
                if existing and load_json(existing["body"]) != case:
                    raise InputError("The received financial comparison conflicts with a retained revision")
            closure = self._closure(history)
            if closure != manifest["sourceRefs"]:
                raise InputError("The archive does not carry the complete selected organisation and activity editions")
            expected_members = {"history.json", "requests.json", "report.json", "report.html", "comparisons.csv"}
            expected_members |= {"installed/" + name for name in SOURCE_FILES}
            expected_members |= {ref["packet"] for group in closure.values() for ref in group}
            if set(manifest["files"]) != expected_members:
                raise InputError("The receiving archive has missing or unrelated source members")

            # Domain inputs are restored through their own complete original
            # receivers. Reconciliation history is published only after rebuilding
            # the complete report and validating every original operation below.
            for ref in closure["organisation"]:
                result = self.ws.organisation.receive({"path": temporary / ref["packet"]})
                selected = result["plan"]
                if selected["id"] != ref["id"] or selected["revision"] != ref["revision"]:
                    raise InputError("A nested organisation packet selected another edition")
            for ref in closure["portfolios"]:
                result = self.ws.receive_portfolio(temporary / ref["packet"])
                selected = result["portfolio"]
                if selected["id"] != ref["id"] or selected["revision"] != ref["revision"]:
                    raise InputError("A nested activity packet selected another portfolio edition")

            if len({r.get("id") for r in requests if isinstance(r, dict)}) != len(requests):
                raise InputError("The receiving archive repeats an original request ID")
            by_revision = {}
            for request in requests:
                fields(request, {"id", "request_sha", "case_id", "revision", "body"})
                if (not isinstance(request["id"], str) or not REQUEST.fullmatch(request["id"])
                        or request["case_id"] != ident or type(request["revision"]) is not int
                        or not 1 <= request["revision"] <= last or request["revision"] in by_revision):
                    raise InputError("An original comparison request has invalid identity or revision")
                checked_id(request["request_sha"])
                payload = load_json(request["body"])
                fields(payload, {"action", "input"})
                if digest(json_bytes(payload)) != request["request_sha"] or payload["input"].get("requestId") != request["id"]:
                    raise InputError("An original request differs from its retained input")
                by_revision[request["revision"]] = (request, payload)
                previous_request = self.ws.db.execute("SELECT * FROM iati_reconciliation_requests WHERE id=?", (request["id"],)).fetchone()
                if previous_request and dict(previous_request) != request:
                    raise InputError("An original comparison request conflicts with existing work")
            for revision, case in enumerate(history, 1):
                definition = self._definition(case["definition"])
                if definition != case["definition"]:
                    raise InputError("The received comparison definition is not canonical")
                rebuilt = self.preview(definition)
                if rebuilt != case["report"] or rebuilt["summary"] != case["summary"]:
                    raise InputError("The complete comparison report does not reconstruct from its original editions")
                request, payload = by_revision[revision]
                action, original = payload["action"], payload["input"]
                previous = history[revision - 2] if revision > 1 else None
                if action == "save":
                    fields(original, {"requestId", "name", "organisation", "portfolios", "comparisons"},
                           {"id", "expectedRevision", "notes", "decisions"})
                    if self._definition({k: v for k, v in original.items() if k in DEFINITION}) != definition or case["review"] is not None:
                        raise InputError("A saved comparison differs from its original save command")
                    if previous:
                        if original.get("id") != ident or original.get("expectedRevision") != previous["revision"]:
                            raise InputError("The original comparison edit has a different predecessor")
                    elif "id" in original or "expectedRevision" in original:
                        raise InputError("The first comparison revision is not an original creation")
                elif action == "review":
                    fields(original, {"requestId", "id", "expectedRevision", "decision", "actor", "note", "acknowledgedIssueIds"})
                    if (previous is None or original["id"] != ident or original["expectedRevision"] != previous["revision"]
                            or previous["definition"] != definition or previous["report"] != case["report"]
                            or self._review(original, previous) != case["review"]):
                        raise InputError("The named review differs from its original command and report")
                else:
                    raise InputError("Unknown retained financial comparison action")
            for name, body in self._render(history[-1]).items():
                if (temporary / name).read_bytes() != body:
                    raise InputError("The complete HTML, CSV or JSON report differs after receiving")
            reused = self.ws.db.execute("SELECT 1 FROM iati_reconciliation_cases WHERE id=? AND revision=?", (ident, last)).fetchone() is not None
            with self.ws.db:
                for case in history:
                    self.ws.db.execute("INSERT OR IGNORE INTO iati_reconciliation_cases VALUES(?,?,?)",
                        (ident, case["revision"], json_bytes(case).decode()))
                for request in requests:
                    self.ws.db.execute("INSERT OR IGNORE INTO iati_reconciliation_requests VALUES(?,?,?,?,?)",
                        tuple(request[k] for k in ("id", "request_sha", "case_id", "revision", "body")))
            return {"state": "COMPLETE", "case": self.plan(ident, last), "currentCase": self.plan(ident),
                    "reused": reused, "revisions": len(history),
                    "organisationEditions": len(closure["organisation"]), "activityEditions": len(closure["portfolios"]),
                    "packet": {"bytes": regular(Path(raw["path"]), MAX_PACKET).st_size,
                               "sha256": file_digest(Path(raw["path"]), MAX_PACKET)}}

def verify_installed_source(directory, manifest):
    expected = {"installed/" + name for name in SOURCE_FILES}
    actual = {name for name in manifest["files"] if name.startswith("installed/")}
    if actual != expected:
        raise InputError("The complete comparison source selection is required")
    for name in SOURCE_FILES:
        path = Path(__file__).resolve().parent / name
        if not path.is_file() or path.is_symlink():
            raise InputError("Install the complete original financial comparison source before receiving")
        if path.read_bytes() != (directory / "installed" / name).read_bytes():
            raise InputError("Install the archived financial comparison edition before receiving: " + name)

def read_reconciliation_packet(path, temporary):
    regular(path, MAX_PACKET)
    permitted_fixed = {"history.json", "requests.json", "report.json", "report.html", "comparisons.csv"}
    permitted_source = {"installed/" + name for name in SOURCE_FILES}
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = [i.filename for i in infos]
        if len(names) != len(set(names)) or len(names) > 16384 or "manifest.json" not in names:
            raise InputError("The comparison archive has duplicate or missing members")
        total = 0
        for info in infos:
            name = info.filename
            permitted = name in permitted_fixed | permitted_source | {"manifest.json"} or bool(
                re.fullmatch(r"sources/(?:org|activity)-[0-9a-f]{64}-[1-9][0-9]*\.zip", name))
            if (not permitted or info.is_dir() or info.flag_bits & 1 or stat.S_ISLNK(info.external_attr >> 16)
                    or info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}
                    or info.file_size > (MAX_PACKET if name.endswith(".zip") else MAX_METADATA)):
                raise InputError("The comparison archive contains an invalid path, type or size")
            total += info.file_size
            if total > MAX_PACKET:
                raise InputError("The complete comparison archive exceeds 4 GiB expanded")
        manifest = load_json(archive.read("manifest.json"))
        fields(manifest, {"schema", "id", "revision", "sourceRefs", "files"})
        if manifest["schema"] != PACKET or not isinstance(manifest["files"], dict) or set(manifest["files"]) != set(names) - {"manifest.json"}:
            raise InputError("The comparison manifest does not name every archive member")
        checked_id(manifest["id"])
        positive(manifest["revision"])
        for info in infos:
            if info.filename == "manifest.json":
                continue
            target = temporary / info.filename
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            # The native packet writer already uses one full-file digest. Use
            # the same streamed digest here without expanding ZIP bodies in RAM.
            import hashlib
            checksum, size = hashlib.sha256(), 0
            with archive.open(info) as source, os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
                while data := source.read(65536):
                    size += len(data)
                    if size > info.file_size:
                        raise InputError("An archive member expanded beyond its declared size")
                    checksum.update(data)
                    output.write(data)
                output.flush()
                os.fsync(output.fileno())
            if manifest["files"][info.filename] != {"bytes": size, "sha256": checksum.hexdigest()}:
                raise InputError("An archive member differs from its original bytes")
        return manifest
