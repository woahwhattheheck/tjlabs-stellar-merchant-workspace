"""MIT. Exact organisation budget contexts and dated methodology evidence, without inferred scores."""
from __future__ import annotations
from collections import defaultdict
from copy import deepcopy
from datetime import date, timedelta
from decimal import Decimal, localcontext, InvalidOperation
import calendar
import re
from urllib.parse import urlsplit
from iati_source import InputError
from workspace import json_bytes, digest
from publishing_xml import text, day
from .xml import FAMILIES, XML_LANG, issue

NUMBER = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)\Z")
METHODS = {"iati203", "fcdo2023", "pwyf2026"}

def add_year(value, years):
    try:
        return date(value.year + years, value.month, min(value.day, calendar.monthrange(value.year + years, value.month)[1]))
    except (ValueError, OverflowError) as error:
        raise InputError("Assessment years exceed the supported calendar") from error

def assessment_input(raw):
    if not isinstance(raw, dict) or set(raw) - {"asOf", "fiscalYearStart", "forwardYears", "methodology", "operatingCountries"}:
        raise InputError("Supply the complete dated assessment definition")
    as_of = day(raw.get("asOf")); start = day(raw.get("fiscalYearStart"))
    try:
        as_of + timedelta(days=960)
    except OverflowError as error:
        raise InputError("Assessment date exceeds forward calendar capacity") from error
    if type(raw.get("forwardYears")) is not int or not 1 <= raw["forwardYears"] <= 10:
        raise InputError("Choose 1 to 10 explicitly dated forward years")
    add_year(start, raw["forwardYears"])
    if raw.get("methodology") not in METHODS:
        raise InputError("Choose iati203, fcdo2023 or pwyf2026 methodology evidence")
    if "operatingCountries" in raw:
        countries = raw["operatingCountries"]
        if not isinstance(countries, list) or len(countries) > 1000 or any(not isinstance(c, str) or not re.fullmatch(r"[A-Z]{2}", c) for c in countries) or len(set(countries)) != len(countries):
            raise InputError("Use distinct explicit country codes for the reviewed operating-country denominator")
    return deepcopy(raw)

def decimal_token(value):
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if len(stripped) > 4096 or not NUMBER.fullmatch(stripped):
        return None
    try:
        return Decimal(stripped)
    except InvalidOperation:
        return None

def calendar_day(value):
    try:
        return day(value)
    except InputError:
        return None

def decimal_text(value):
    return format(value, "f")

def code_findings(row, value, name, field, codelists, required=False):
    if value is None or value == "":
        return [issue(row["id"], "missing-" + field, "The original " + field + " is missing or explicitly empty", "error", field)] if required else []
    listing = codelists.get(name)
    if listing is None:
        raise InputError("The exact original codelist is not installed: " + name)
    if value not in listing["entries"]:
        severity = "error" if listing["complete"] else "review"
        return [issue(row["id"], "codelist-" + field,
            value + " is absent from the retained " + name + (" codelist" if listing["complete"] else " incomplete codelist; absence does not establish invalidity"),
            severity, field)]
    if listing["entries"][value].get("status") in {"withdrawn", "deprecated"}:
        return [issue(row["id"], "withdrawn-" + field, "The original code has a withdrawn/deprecated status; retain and review its period of use", "review", field)]
    return []

def recipient_context(row):
    r = row.get("recipient")
    if r is None:
        return None
    # A referenced organisation uses its identifier. Unreferenced organisations
    # retain the exact multilingual description as their explicit context.
    return {k: r.get(k) for k in ("kind", "ref", "code", "vocabulary", "vocabularyUri")} | {
        "narratives": r.get("narratives") if r.get("kind") == "recipient-org" and not r.get("ref") else None}

def financial_context(row):
    return {"organisationKey": row["organisationKey"], "family": row["family"],
        "recipient": recipient_context(row), "status": row["status"]["effective"],
        "currency": row["value"]["currency"], "period": {k: row["period"][k] for k in ("start", "end")},
        "valueDate": row["value"]["valueDate"]}

def comparable_context(row):
    value = financial_context(row)
    value.pop("organisationKey")
    return value

def _financial(row, codelists):
    r = deepcopy(row)
    findings = r["issues"]
    amount = decimal_token(r["value"]["text"])
    if amount is None:
        findings.append(issue(r["id"], "value-decimal", "The full amount must be a finite original XML decimal within the 4,096-character calculation capacity", "error", "value"))
    currency = r["value"]["currency"]
    findings.extend(code_findings(r, currency, "Currency", "currency", codelists, True))
    if r["family"] != "total-expenditure":
        findings.extend(code_findings(r, r["status"]["effective"], "BudgetStatus", "status", codelists, True))
    start, end = calendar_day(r["period"]["start"]), calendar_day(r["period"]["end"])
    value_date = calendar_day(r["value"]["valueDate"])
    if start is None or end is None:
        findings.append(issue(r["id"], "period-calendar-date", "Calendar calculations require exact YYYY-MM-DD start and end; original date tokens remain unchanged", "review", "period"))
    elif end <= start or end > add_year(start, 1):
        findings.append(issue(r["id"], "period-range", "The period end must follow its start by no more than one calendar year", "error", "period"))
    if value_date is None:
        findings.append(issue(r["id"], "value-calendar-date", "The exact value-date is required for compatible financial calculations", "review", "valueDate"))
    recipient = r["recipient"]
    if recipient:
        if recipient["kind"] == "recipient-country":
            findings.extend(code_findings(r, recipient["code"], "Country", "recipient-country", codelists, True))
        elif recipient["kind"] == "recipient-region":
            findings.extend(code_findings(r, recipient["vocabulary"], "RegionVocabulary", "region-vocabulary", codelists, True))
            if recipient["vocabulary"] == "1":
                findings.extend(code_findings(r, recipient["code"], "Region", "region-code", codelists, True))
            elif not recipient["code"] and not any(x["text"].strip() for x in recipient["narratives"]):
                findings.append(issue(r["id"], "region-identity", "Retain a region code or original narrative for this vocabulary", "error"))
            if recipient["vocabulary"] == "99" and not recipient["vocabularyUri"]:
                findings.append(issue(r["id"], "region-vocabulary-uri", "A reporting-organisation region vocabulary requires its original URI", "review"))
        elif not recipient["ref"] and not any(x["text"].strip() for x in recipient["narratives"]):
            findings.append(issue(r["id"], "recipient-org-identity", "Retain an organisation reference or original narrative", "error"))
    known_currency = currency in codelists["Currency"]["entries"]
    eligible = amount is not None and known_currency and start is not None and end is not None and value_date is not None and not any(x["severity"] == "error" for x in findings)
    r["calculation"] = {"eligible": eligible, "amount": decimal_text(amount) if eligible else None,
                        "context": financial_context(r)}
    lines = []
    for line in r["lines"]:
        value = line["value"]; item = decimal_token(value["text"])
        line_findings = []
        if value["count"] != 1 or item is None:
            line_findings.append("The line lacks one exact decimal value")
        if value["currency"] != currency or value["valueDate"] != r["value"]["valueDate"]:
            line_findings.append("Line currency/value-date differs from its parent; no conversion is inferred")
        if value["currency"] not in codelists["Currency"]["entries"] or calendar_day(value["valueDate"]) is None:
            line_findings.append("Line monetary context is incomplete")
        lines.append({**line, "calculation": {"eligible": not line_findings,
            "amount": decimal_text(item) if not line_findings else None, "findings": line_findings}})
    r["lines"] = lines
    complete = bool(lines) and all(x["calculation"]["eligible"] for x in lines)
    with localcontext() as ctx:
        ctx.prec = 8192
        subtotal = sum((Decimal(x["calculation"]["amount"]) for x in lines), Decimal(0)) if complete else None
        difference = amount - subtotal if eligible and subtotal is not None else None
    r["lineSummary"] = {"count": len(lines), "allListedLinesComparable": complete,
        "amount": decimal_text(subtotal) if subtotal is not None else None,
        "parentMinusListedLines": decimal_text(difference) if difference is not None else None,
        "meaning": "Listed budget/expense lines may be a partial breakdown. No equality or completeness is inferred."}
    return r

def _documents(row, codelists):
    r = deepcopy(row)
    findings = r["issues"]
    findings.extend(code_findings(r, r["format"], "FileFormat", "document-format", codelists, True))
    if not r["url"]:
        findings.append(issue(r["id"], "document-url", "The original document URL is required", "error"))
    else:
        try:
            parsed = urlsplit(r["url"])
            public = parsed.scheme.lower() in {"http", "https"} and bool(parsed.hostname) and not parsed.username and not parsed.password
        except ValueError:
            public = False
        if not public:
            findings.append(issue(r["id"], "document-link-review", "The retained URL needs base-URI or publication review before it can be opened as a public HTTP link", "review"))
    if not r["categories"]:
        findings.append(issue(r["id"], "document-category", "No original document category is declared", "review"))
    for code in r["categories"]:
        findings.extend(code_findings(r, code, "DocumentCategory", "document-category", codelists, True))
    for code in r["languages"]:
        findings.extend(code_findings(r, code, "Language", "document-language", codelists, True))
    for country in r["recipientCountries"]:
        findings.extend(code_findings(r, country["code"], "Country", "document-country", codelists, True))
    if r["documentDate"] is not None and calendar_day(r["documentDate"]) is None:
        findings.append(issue(r["id"], "document-calendar-date", "Document date is retained; calendar review needs exact YYYY-MM-DD", "review"))
    r["accessState"] = "NOT_CHECKED"
    return r

def _forward(rows, assessment):
    as_of = day(assessment["asOf"])
    thresholds = [(as_of + timedelta(days=230 + 365 * i)).isoformat() for i in range(3)]
    grouped = defaultdict(list)
    for r in rows:
        if r["family"] == "total-expenditure":
            continue
        key = json_bytes({k: financial_context(r)[k] for k in ("organisationKey", "family", "recipient", "status", "currency")})
        grouped[key].append(r)
    result = []
    for key in sorted(grouped):
        selected = grouped[key]
        observed = sorted([{"rowId": r["id"], "start": r["period"]["start"], "end": r["period"]["end"],
                            "amount": r["value"]["text"], "eligible": r["calculation"]["eligible"]}
                           for r in selected if calendar_day(r["period"]["end"]) is not None],
                          key=lambda r: (r["end"], r["start"] or "", r["rowId"]))
        per_threshold = [{"notBefore": t, "observedRowIds": [r["rowId"] for r in observed if r["end"] >= t]}
                         for t in thresholds]
        separations = [{"beforeRowId": a["rowId"], "afterRowId": b["rowId"],
                        "endDays": (day(b["end"]) - day(a["end"])).days,
                        "nextStartDays": (day(b["start"]) - day(a["end"])).days if calendar_day(b["start"]) else None}
                       for a, b in zip(observed, observed[1:])]
        result.append({"context": __import__("json").loads(key), "observedPeriods": observed,
                       "thresholds": per_threshold, "consecutiveEvidence": separations,
                       "state": "MANUAL_REVIEW", "score": None})
    return {"assessmentDate": assessment["asOf"], "thresholdDates": thresholds,
            "groups": result, "state": "EVIDENCE_ONLY", "officialScore": None,
            "rule": "PWYF 2026 prose: first period end at least 230 days after the last test date; subsequent years 365 days later.",
            "limitation": "Interval and anchor selection are not fully specified. Later-threshold matches are not counted as distinct year coverage.",
            "exampleConflict": {"testDate": "2014-06-01", "firstPeriodEnd": "2014-12-31",
                                "actualDays": 213, "proseMinimumDays": 230,
                                "successiveExampleYearEndDays": [365, 366], "pdfPageIndex": 62, "humanPdfPage": 63}}

def _fiscal(rows, assessment):
    start = day(assessment["fiscalYearStart"])
    periods = []
    for i in range(assessment["forwardYears"]):
        low, high = add_year(start, i), add_year(start, i + 1) - timedelta(days=1)
        groups = defaultdict(list)
        for r in rows:
            a, b = calendar_day(r["period"]["start"]), calendar_day(r["period"]["end"])
            if a is None or b is None or b < low or a > high:
                continue
            context = financial_context(r)
            context.pop("period")
            groups[json_bytes(context)].append(r)
        values = []
        for key, selected in sorted(groups.items()):
            exact = [r for r in selected if r["period"]["start"] == low.isoformat() and r["period"]["end"] == high.isoformat()]
            usable = len(selected) == len(exact) == 1 and exact[0]["calculation"]["eligible"]
            values.append({"context": __import__("json").loads(key), "rowIds": [r["id"] for r in selected],
                           "state": "EXACT_PERIOD" if usable else "OVERLAP_OR_PARTIAL_REVIEW",
                           "amount": exact[0]["calculation"]["amount"] if usable else None})
        periods.append({"start": low.isoformat(), "end": high.isoformat(), "groups": values})
    return {"periods": periods, "rule": "Only one exact fiscal-period row supplies a fiscal amount. Partial/overlapping rows remain visible without proration or aggregation."}

def analyse(document, assessment, organisation_keys, codelists):
    assessment = assessment_input(assessment)
    selected = set(organisation_keys)
    if not selected or selected - set(document.org_nodes):
        raise InputError("Select original organisation keys from this source")
    all_budgets = [_financial(r, codelists) for r in document.budgets]
    all_documents = [_documents(r, codelists) for r in document.documents]
    orgs = deepcopy(document.organisation_rows)
    for org in orgs:
        findings = org["issues"]
        if org["defaultCurrency"] is not None:
            findings.extend(code_findings(org, org["defaultCurrency"], "Currency", "default-currency", codelists, True))
        if org["defaultLanguage"] is not None:
            findings.extend(code_findings(org, org["defaultLanguage"], "Language", "default-language", codelists, True))
        findings.extend(code_findings(org, org["reportingOrg"]["type"], "OrganisationType", "reporting-org-type", codelists, True))
        if org["key"] in selected:
            budget_rows = [r for r in all_budgets if r["organisationKey"] == org["key"]]
            document_rows = [r for r in all_documents if r["organisationKey"] == org["key"]]
            if assessment["methodology"] == "fcdo2023":
                if not any(r["family"] == "total-budget" for r in budget_rows):
                    findings.append(issue(org["id"], "fcdo-total-budget-not-declared",
                        "No total-budget is declared. Review the relevant FCDO agreement clause and current/future budgets where known; this is not an XSD or automatic compliance finding.", "review"))
                if not document_rows:
                    findings.append(issue(org["id"], "fcdo-documents-not-declared",
                        "No organisation document is declared. Review applicable FCDO agreement requirements and the original documents; this is not an XSD or automatic compliance finding.", "review"))
            elif assessment["methodology"] == "pwyf2026":
                if not any(r["family"] == "total-budget" for r in budget_rows):
                    findings.append(issue(org["id"], "pwyf-total-budget-not-declared",
                        "No total-budget is declared for this organisation. Forward-budget evidence requires manual assessment against the dated methodology; no official score is inferred.", "review"))
                declared = {code for r in document_rows for code in r["categories"]}
                for code in ("B01", "B02", "B04", "B05", "B06"):
                    if code not in declared:
                        findings.append(issue(org["id"], "pwyf-document-not-declared-" + code,
                            "No " + code + " organisation document link is declared. Review the original manual document evidence and methodology; link absence is not an automatic official score.", "review"))
    contexts = defaultdict(list)
    for r in all_budgets:
        contexts[json_bytes(financial_context(r))].append(r)
    groups = []
    for key, entries in sorted(contexts.items()):
        unique = len(entries) == 1
        if not unique:
            for r in entries:
                r["issues"].append(issue(r["id"], "repeated-financial-context",
                    "Multiple original rows share this exact monetary context; they are not added or selected silently", "review"))
                r["calculation"]["eligible"] = False
                r["calculation"]["amount"] = None
        if entries[0]["organisationKey"] in selected:
            groups.append({"context": __import__("json").loads(key), "rowIds": [r["id"] for r in entries],
                "amount": entries[0]["calculation"]["amount"] if unique else None,
                "state": "EXACT" if unique and entries[0]["calculation"]["eligible"] else "UNRESOLVED"})
    issues = []
    for r in orgs + all_budgets + all_documents:
        for finding in r["issues"]:
            finding["organisationKey"] = r["organisationKey"]
            finding["selected"] = r["organisationKey"] in selected
            issues.append(finding)
    issues = list({x["id"]: x for x in issues}.values())
    budgets = [r for r in all_budgets if r["organisationKey"] in selected]
    documents = [r for r in all_documents if r["organisationKey"] in selected]
    categories = {}
    for org in (x for x in orgs if x["key"] in selected):
        docs = [x for x in documents if x["organisationKey"] == org["key"]]
        declared = defaultdict(list)
        for r in docs:
            for code in r["categories"]:
                declared[code].append(r["id"])
        categories[org["key"]] = {"declared": dict(declared),
            "manualDocuments": [{"category": code, "rowIds": declared.get(code, []),
                                 "state": "LINK_DECLARED_REVIEW_CONTENT" if declared.get(code) else "NO_LINK_DECLARED"}
                                for code in ("B01", "B02", "B04", "B05", "B06")]}
    country_codes = sorted({r["recipient"]["code"] for r in budgets
                            if r["family"] == "recipient-country-budget" and r["recipient"]["code"]})
    denominator = assessment.get("operatingCountries")
    denominator_source = "EXPLICIT_REVIEWED_OPERATING_COUNTRIES" if denominator is not None else "NOT_SUPPLIED"
    country_coverage = {"declaredCountryBudgetCodes": country_codes,
        "denominatorSource": denominator_source, "operatingCountries": denominator,
        "state": "COMBINED_INVENTORY_ONLY", "officialScore": None, "organisations": [],
        "semantics": "Combined country codes are source inventory, not an assessed numerator. Each organisation is compared separately with the explicitly reviewed denominator."}
    for org in (x for x in orgs if x["key"] in selected):
        codes = sorted({r["recipient"]["code"] for r in budgets
                        if r["organisationKey"] == org["key"] and r["family"] == "recipient-country-budget" and r["recipient"]["code"]})
        evidence = {"organisationKey": org["key"], "identifier": org["identifier"],
            "declaredCountryBudgetCodes": codes, "denominatorSource": denominator_source,
            "operatingCountries": deepcopy(denominator), "state": "MANUAL_REVIEW", "officialScore": None}
        if denominator is not None:
            evidence.update(denominatorCount=len(denominator),
                countriesWithDeclaredBudget=sorted(set(denominator) & set(codes)),
                countriesWithoutDeclaredBudget=sorted(set(denominator) - set(codes)))
        country_coverage["organisations"].append(evidence)
    summary = {"schema": "stellar-forge.iati-organisation-assessment.v1", "assessment": assessment,
        "counts": {"organisations": len(selected), "budgets": len(budgets), "documents": len(documents),
                   "issues": len(issues), "errors": sum(x["severity"] == "error" for x in issues)},
        "financialGroups": groups, "fiscalCoverage": _fiscal(budgets, assessment),
        "forwardBudget": _forward(budgets, assessment), "documentEvidence": categories,
        "countryCoverage": country_coverage,
        "methodology": {"selected": assessment["methodology"], "score": None,
            "fcdo": "Current/future budgets where known and organisation documents are required under the relevant funding-agreement clause; recipient-country and funded-organisation detail is optional. This profile does not impose an unconditional three-year mandate.",
            "pwyf": "Manual document tests, original country denominator and the dated technical paper remain separate evidence."},
        "semantics": ["No foreign-exchange conversion, missing-year interpolation or unreported amount is introduced.",
                      "The five financial families, recipient scopes, currencies, statuses, value dates and periods stay separate.",
                      "Line-item breakdowns may be partial. Document presence does not prove accessibility or content compliance.",
                      "Complete source findings include unselected organisations; editing scope does not hide their validation issues."]}
    return {"organisations": orgs, "budgets": all_budgets, "documents": all_documents, "issues": issues, "summary": summary}
