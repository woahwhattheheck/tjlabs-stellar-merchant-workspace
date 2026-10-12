"""MIT. Source-preserving IATI-to-AMP financial commissioning and receiving."""
from __future__ import annotations
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import date
from decimal import Decimal, localcontext
import json
from urllib.parse import urlsplit
from iati_source import InputError, financial_dimensions
from .codec import (loads, dumps, normal, decimal, decimal_text, fingerprint, identity,
                    integer, text, fields)
from . import destination

SCHEMA = "stellar-forge.iati-amp-plan.v1"
CAPTURE = "stellar-forge.amp-native-capture.v1"
CONTRACT = "devgateway/amp@e067f9115fbe0ad0ef19bf5d9cc6fff061b8378e"
FAMILIES = ("commitments", "disbursements", "expenditures")
FLOW_TYPES = {"2": "commitments", "3": "disbursements", "4": "expenditures"}
DEFAULT_VALUE_FIELDS = ["fundings~donor_organization_id"] + [
    f"fundings~{family}~{field}" for family in FAMILIES for field in ("currency", "adjustment_type")
]


def endpoint(value):
    raw = text(value, "Original AMP REST base URL", 4096).rstrip("/")
    try:
        parsed = urlsplit(raw)
        valid = (parsed.scheme in {"https", "http"} and parsed.hostname and not parsed.username
                 and not parsed.password and not parsed.query and not parsed.fragment
                 and not any(part in {".", ".."} for part in parsed.path.split("/")))
    except ValueError:
        valid = False
    if not valid:
        raise InputError("Use the installed AMP HTTP(S) REST base URL without credentials or query parameters")
    return raw


def connection(raw):
    fields(raw, {"baseUrl", "workspaceId", "installedVersion"}, {"expectedUserId", "label"})
    result = {"baseUrl": endpoint(raw["baseUrl"]),
              "workspaceId": integer(raw["workspaceId"], "AMP workspace ID"),
              "installedVersion": text(raw["installedVersion"], "Installed AMP version", 160)}
    if raw.get("expectedUserId") is not None:
        result["expectedUserId"] = integer(raw["expectedUserId"], "AMP native user ID")
    result["label"] = text(raw.get("label", ""), "AMP connection label", 160, True)
    return result


def native_project(raw):
    if not isinstance(raw, dict):
        raise InputError("Retain each complete native project object")
    integer(raw.get("internal_id"), "Native project internal_id")
    if not isinstance(raw.get("activity_group"), dict) or "version" not in raw["activity_group"]:
        raise InputError("The complete native project must retain its activity_group/version")
    funds = raw.get("fundings", [])
    if not isinstance(funds, list):
        raise InputError("Native project fundings must remain the original array")
    for funding in funds:
        if not isinstance(funding, dict):
            raise InputError("Native funding records must be complete objects")
        for family in FAMILIES:
            if family in funding and not isinstance(funding[family], list):
                raise InputError("Native " + family + " must remain the original array")
    return raw


def field_index(raw):
    """Read the original APIField tree; retain all metadata in the native capture."""
    result = {}
    def visit(values, prefix=""):
        if isinstance(values, dict):
            if "field_name" in values:
                name = values["field_name"]
                if not isinstance(name, str):
                    raise InputError("Installed native field_name must be text")
                full = name if "~" in name else (prefix + "~" + name if prefix else name)
                result[full] = values
                visit(values.get("children", []), full)
            else:
                for value in values.values():
                    visit(value, prefix)
        elif isinstance(values, list):
            for value in values:
                visit(value, prefix)
    visit(raw)
    return result


def possible_ids(raw):
    result = set()
    def visit(value):
        if isinstance(value, dict):
            if type(value.get("id")) is int:
                result.add(value["id"])
            for key, item in value.items():
                if key in {"children", "values", "possible_values", "items"}:
                    visit(item)
        elif isinstance(value, list):
            for item in value:
                if type(item) is int:
                    result.add(item)
                else:
                    visit(item)
    visit(raw)
    return result


def values_at(capture, path):
    values = loads(capture["valuesJson"])
    return possible_ids(values.get(path, [])) if isinstance(values, dict) else set()


def validate_native_choice(capture, path, selected):
    fields_found = field_index(loads(capture["fieldsJson"]))
    if path not in fields_found:
        raise InputError("Installed AMP does not expose the selected field: " + path)
    if fields_found[path].get("importable") is not True:
        raise InputError("Installed AMP does not mark this field importable: " + path)
    if selected not in values_at(capture, path):
        raise InputError("Select the native ID from this installed field's retained possible values: " + path)


def capture_input(raw):
    fields(raw, {"connection", "coverage", "fieldsJson", "valuesJson", "projectsJson", "acquisition"},
           {"sessionJson", "layoutJson", "exchanges", "name"})
    bound = connection(raw["connection"])
    coverage = raw["coverage"]
    fields(coverage, {"kind", "projectIds", "note"})
    if coverage["kind"] not in {"explicit-projects", "native-export"}:
        raise InputError("Bind an explicit project selection or complete native export")
    ids = coverage["projectIds"]
    if not isinstance(ids, list) or len(ids) > 10000 or len(set(ids)) != len(ids):
        raise InputError("Select at most 10,000 distinct original native project IDs")
    for ident in ids:
        integer(ident, "Selected native project ID")
    text(coverage["note"], "Country/programme coverage", 16000)
    projects = loads(raw["projectsJson"])
    if not isinstance(projects, list):
        raise InputError("Retain a complete JSON array of the selected full native projects")
    for project in projects:
        native_project(project)
    actual = [p["internal_id"] for p in projects]
    if len(set(actual)) != len(actual) or set(actual) != set(ids):
        raise InputError("The retained complete native records differ from the declared original project selection")
    if not field_index(loads(raw["fieldsJson"])):
        raise InputError("Retain the installed AMP field metadata")
    values = loads(raw["valuesJson"])
    if not isinstance(values, dict):
        raise InputError("Retain the complete native field-values response object")
    text(raw["acquisition"], "Original acquisition URL/time/method and selected scope", 32000)
    result = {k: deepcopy(v) for k, v in raw.items()}
    result["connection"] = bound
    result["name"] = text(raw.get("name", ""), "Capture name", 160, True)
    result["sessionJson"] = text(raw.get("sessionJson", "{}"), "Original native user response", 64000)
    result["layoutJson"] = text(raw.get("layoutJson", "{}"), "Original native layout response", 64000)
    session, layout = loads(result["sessionJson"]), loads(result["layoutJson"])
    if not isinstance(session, dict) or not isinstance(layout, dict):
        raise InputError("Native session and layout must be complete JSON objects")
    if "user-id" in session:
        integer(session["user-id"], "Captured AMP native user ID")
        if bound.get("expectedUserId") not in {None, session["user-id"]}:
            raise InputError("Captured AMP user differs from the selected native account")
        result["connection"]["expectedUserId"] = session["user-id"]
    if layout.get("ampVersion") is not None and layout["ampVersion"] != bound["installedVersion"]:
        raise InputError("Installed AMP version differs from the original selected native version")
    if layout.get("workspaceId") is not None and layout["workspaceId"] != bound["workspaceId"]:
        raise InputError("Captured native workspace differs from the selected AMP workspace")
    result["schema"] = CAPTURE
    result["destinationAnalysis"] = normal(destination.analyse_capture(result))
    return result


def project_index(capture):
    return {p["internal_id"]: p for p in loads(capture["projectsJson"])}


def source_rows(workspace, portfolio):
    """Use the original native CSV editions; no second XML parser or projection."""
    result, keys = [], set()
    for edition in portfolio["editions"]:
        source = edition["source"]
        for collection in ("transactions", "budgets"):
            for row in workspace._rows(edition[collection]):
                if row.get("activity_id") is None or row.get("row_id") is None:
                    raise InputError("Retain the original complete IATI financial mapping")
                publisher = row.get("reporting_org_ref", "")
                key = fingerprint([publisher, collection, row["activity_id"], row["row_id"]])
                if key in keys:
                    raise InputError("Selected portfolio contains duplicate financial identities; choose one edition per publisher/activity")
                keys.add(key)
                result.append({"key": key, "source": source, "collection": collection,
                               "sourceRowSha256": fingerprint(row), "publisherRef": publisher,
                               "activityId": row["activity_id"], "rowId": row["row_id"],
                               "identityBasis": row.get("identity_basis", ""),
                               "dimensions": financial_dimensions(row, collection), "row": dict(row)})
    return result


def plan_definition(raw, capture, rows):
    fields(raw, {"name", "portfolio", "captureId", "activityLinks", "currencyLinks", "measureLinks", "decisions", "notes"},
           {"projectDrafts", "previousPlan", "correspondence"})
    fields(raw["portfolio"], {"id", "revision"})
    identity(raw["portfolio"]["id"]); integer(raw["portfolio"]["revision"], "Portfolio revision")
    identity(raw["captureId"])
    result = deepcopy(raw)
    result["name"] = text(raw["name"], "AMP commissioning name", 160)
    result["notes"] = text(raw["notes"], "Commissioning scope", 32000, True)
    projects = project_index(capture)
    drafts = raw.get("projectDrafts", {})
    if not isinstance(drafts, dict) or len(drafts) > 1000:
        raise InputError("Use explicit complete native project drafts")
    for draft_id, draft_json in drafts.items():
        text(draft_id, "Project draft ID", 160)
        project = loads(draft_json)
        if not isinstance(project, dict) or "internal_id" in project:
            raise InputError("A new native project draft is a complete object without an existing internal_id")
        if not isinstance(project.get("iati_identifier"), str) or not project["iati_identifier"]:
            raise InputError("Bind every new native project draft to its explicit IATI activity identifier")
        if not isinstance(project.get("fundings", []), list):
            raise InputError("Project draft fundings must be an array")
    activity_keys = set()
    if not isinstance(raw["activityLinks"], list):
        raise InputError("Use the complete explicit activity links")
    for link in raw["activityLinks"]:
        fields(link, {"publisherRef", "activityId", "note"}, {"projectId", "draftId"})
        text(link["publisherRef"], "Publisher reference", 1024)
        text(link["activityId"], "IATI activity identifier", 4096)
        text(link["note"], "Activity correspondence review", 16000)
        if ("projectId" in link) == ("draftId" in link):
            raise InputError("Link an IATI activity to one existing native project or one complete new draft")
        if "projectId" in link and link["projectId"] not in projects:
            raise InputError("The selected native project is absent from this complete capture")
        if "draftId" in link and link["draftId"] not in drafts:
            raise InputError("The selected native project draft is absent")
        key = (link["publisherRef"], link["activityId"])
        if key in activity_keys:
            raise InputError("An IATI publisher/activity has multiple destination links")
        activity_keys.add(key)
        project = projects[link["projectId"]] if "projectId" in link else loads(drafts[link["draftId"]])
        if project.get("iati_identifier") not in {None, "", link["activityId"]}:
            raise InputError("The native project identifies a different original IATI activity")
    currency_keys = set()
    if not isinstance(raw["currencyLinks"], list) or not isinstance(raw["measureLinks"], list):
        raise InputError("Use complete currency and financial-measure mapping lists")
    for link in raw["currencyLinks"]:
        fields(link, {"code", "nativeId", "note"})
        code = text(link["code"], "Original currency code", 12)
        integer(link["nativeId"], "Native currency ID")
        text(link["note"], "Currency correspondence review", 16000)
        if code in currency_keys:
            raise InputError("One source currency has multiple native currency mappings")
        currency_keys.add(code)
    measure_keys = set()
    for link in raw["measureLinks"]:
        fields(link, {"sourceType", "family", "adjustmentId", "meaning", "note"})
        if link["sourceType"] not in FLOW_TYPES or link["family"] != FLOW_TYPES[link["sourceType"]]:
            raise InputError("Map IATI outgoing commitment (2), disbursement (3), or expenditure (4) to its matching AMP family")
        if link["meaning"] != "actual":
            raise InputError("IATI reported transactions require the installed actual adjustment category")
        integer(link["adjustmentId"], "Native adjustment category ID")
        text(link["note"], "Source/installed adjustment-category interpretation", 16000)
        if link["sourceType"] in measure_keys:
            raise InputError("One IATI transaction type has multiple financial mappings")
        measure_keys.add(link["sourceType"])
        validate_native_choice(capture, f"fundings~{link['family']}~adjustment_type", link["adjustmentId"])
    indexed = {r["key"]: r for r in rows}
    decisions = raw["decisions"]
    if not isinstance(decisions, dict):
        raise InputError("Supply explicit decisions keyed by retained financial row identity")
    for key, decision in decisions.items():
        if key not in indexed:
            raise InputError("A financial decision selects a row outside the original portfolio")
        fields(decision, {"action", "sourceRowSha256", "note"}, {"fundingId", "donorId", "transactionId",
               "fundingJson", "transactionJson", "dateChoice"})
        if decision["sourceRowSha256"] != indexed[key]["sourceRowSha256"]:
            raise InputError("An IATI source row changed; review its complete current contents")
        if decision["action"] not in {"include", "exclude", "review"}:
            raise InputError("Select include, exclude or review for each source row")
        text(decision["note"], "Financial row decision", 16000)
        for name in ("fundingId", "donorId", "transactionId"):
            if decision.get(name) is not None:
                integer(decision[name], "Native " + name)
        if "fundingJson" in decision and not isinstance(loads(decision["fundingJson"]), dict):
            raise InputError("Complete funding configuration must be a native JSON object")
        if "transactionJson" in decision and not isinstance(loads(decision["transactionJson"]), dict):
            raise InputError("Complete transaction configuration must be a native JSON object")
        if decision.get("dateChoice", "transaction-date") not in {"transaction-date", "value-date"}:
            raise InputError("Select the exact reported transaction date or original value date")
    result["projectDrafts"] = deepcopy(drafts)
    pairs = raw.get("correspondence", [])
    if not isinstance(pairs, list):
        raise InputError("Use explicit prior/current financial-row correspondence")
    before_keys, after_keys = set(), set()
    for pair in pairs:
        fields(pair, {"before", "after", "note"})
        identity(pair["before"]); identity(pair["after"]); text(pair["note"], "Edition correspondence", 16000)
        if pair["before"] in before_keys or pair["after"] in after_keys or pair["after"] not in indexed:
            raise InputError("Use one-to-one explicit edition correspondence with original current rows")
        before_keys.add(pair["before"]); after_keys.add(pair["after"])
    result["correspondence"] = pairs
    if raw.get("previousPlan"):
        fields(raw["previousPlan"], {"id", "revision"})
        identity(raw["previousPlan"]["id"]); integer(raw["previousPlan"]["revision"], "Previous AMP plan revision")
    return result


def _day(value):
    if not isinstance(value, str) or len(value) != 10:
        raise InputError("Select the complete original calendar date")
    try:
        result = date.fromisoformat(value)
    except ValueError as error:
        raise InputError("Select a valid original calendar date") from error
    if result.isoformat() != value:
        raise InputError("Calendar date must retain YYYY-MM-DD")
    return value


def native_context(capture):
    return {"fields": field_index(loads(capture["fieldsJson"])),
            "values": {k: possible_ids(v) for k, v in loads(capture["valuesJson"]).items()},
            "projects": project_index(capture)}


def native_choice(context, path, selected):
    field = context["fields"].get(path)
    if field is None or field.get("importable") is not True:
        raise InputError("The installed native field is absent or not importable: " + path)
    if selected not in context["values"].get(path, set()):
        raise InputError("Select a retained native possible-value ID for " + path)


def row_proposal(item, definition, capture, context=None):
    context = context or native_context(capture)
    row, decision = item["row"], definition["decisions"].get(item["key"])
    view = {k: item[k] for k in ("key", "source", "collection", "sourceRowSha256", "publisherRef",
                                 "activityId", "rowId", "identityBasis", "dimensions")}
    view.update({"sourceRow": row, "state": "review", "issues": [], "decision": decision, "proposal": None})
    if decision and decision["action"] == "exclude":
        view["state"] = "excluded"
        return view
    if item["collection"] == "budgets":
        view["issues"].append("This is an IATI budget period; retain it in the planning report and record its scope decision. It is not an AMP actual transaction.")
    if not decision or decision["action"] != "include":
        view["issues"].append("Record an explicit inclusion or exclusion decision for this source row.")
        return view
    if item["collection"] != "transactions":
        return view
    if row.get("financial_eligible") != "true":
        view["issues"].append("The original IATI financial projection marks this record ineligible: " + row.get("financial_issues_json", ""))
    links = [x for x in definition["activityLinks"]
             if x["publisherRef"] == item["publisherRef"] and x["activityId"] == item["activityId"]]
    currencies = [x for x in definition["currencyLinks"] if x["code"] == row.get("currency")]
    measures = [x for x in definition["measureLinks"] if x["sourceType"] == row.get("transaction_type")]
    if not links:
        view["issues"].append("Map this original publisher/activity to a captured native project or complete draft.")
    if not currencies:
        view["issues"].append("Map the original reported currency to its installed AMP currency ID.")
    if not measures:
        view["issues"].append("Review this IATI transaction type in its own native financial family.")
    if view["issues"]:
        return view
    link, currency, measure = links[0], currencies[0], measures[0]
    try:
        value = decimal(row.get("value_decimal"), "Original IATI amount")
        day_field = "value_day" if decision.get("dateChoice") == "value-date" else "transaction_day"
        day = _day(row.get(day_field, ""))
        family = measure["family"]
        native_choice(context, f"fundings~{family}~currency", currency["nativeId"])
        native_choice(context, f"fundings~{family}~adjustment_type", measure["adjustmentId"])
        projects = context["projects"]
        project = projects[link["projectId"]] if "projectId" in link else loads(definition["projectDrafts"][link["draftId"]])
        funding_id = decision.get("fundingId")
        if funding_id is not None:
            candidates = [f for f in project.get("fundings", []) if f.get("funding_id") == funding_id]
            if len(candidates) != 1:
                raise InputError("Select one original funding_id from this native project")
            funding = deepcopy(candidates[0])
            donor = funding.get("donor_organization_id")
            if decision.get("donorId") is not None and decision["donorId"] != donor:
                raise InputError("Selected donor differs from the retained original funding")
        else:
            funding = loads(decision.get("fundingJson", "{}"))
            donor = decision.get("donorId", funding.get("donor_organization_id"))
            integer(donor, "Explicit native donor organization ID")
            if funding.get("funding_id") is not None:
                raise InputError("Use fundingId to select an existing native funding record")
            if funding.get("donor_organization_id") not in {None, donor}:
                raise InputError("The complete funding JSON names a different donor")
            funding["donor_organization_id"] = donor
        integer(donor, "Native donor organization ID")
        native_choice(context, "fundings~donor_organization_id", donor)
        transactions = funding.get(family, [])
        selected = decision.get("transactionId")
        if selected is not None:
            candidates = [t for t in transactions if t.get("transaction_id") == selected]
            if len(candidates) != 1:
                raise InputError("Select the exact original transaction_id in this funding and financial family")
            transaction = deepcopy(candidates[0])
            if "transactionJson" in decision:
                correction = loads(decision["transactionJson"])
                if correction.get("transaction_id") not in {None, selected}:
                    raise InputError("The transaction correction selects a different native ID")
                transaction.update(correction)
        else:
            transaction = loads(decision.get("transactionJson", "{}"))
            if transaction.get("transaction_id") is not None:
                raise InputError("Use transactionId to select an existing native transaction")
        transaction.update({"transaction_amount": value, "currency": currency["nativeId"],
                            "adjustment_type": measure["adjustmentId"], "transaction_date": day})
        proposal = {"projectId": link.get("projectId"), "draftId": link.get("draftId"),
                    "fundingId": funding_id, "fundingJson": dumps(funding if funding_id is None else {k: v for k, v in funding.items() if k not in FAMILIES}), "donorId": donor,
                    "family": family, "transactionId": selected, "transactionJson": dumps(transaction),
                    "sourceAmount": row.get("value", ""), "amount": decimal_text(value),
                    "currency": row.get("currency"), "nativeCurrencyId": currency["nativeId"],
                    "dateChoice": day_field, "nativeDate": day, "adjustmentId": measure["adjustmentId"]}
        view["state"], view["proposal"] = "included", proposal
    except InputError as error:
        view["issues"].append(str(error))
    return view


def analyse(rows, definition, capture):
    context = native_context(capture)
    views = [row_proposal(row, definition, capture, context) for row in rows]
    targets = {}
    for item in views:
        if item["state"] != "included":
            continue
        proposal = item["proposal"]
        if proposal["transactionId"] is not None:
            key = (proposal["projectId"], proposal["draftId"], proposal["fundingId"],
                   proposal["family"], proposal["transactionId"])
            if key in targets:
                for selected in (targets[key], item):
                    selected["state"] = "review"
                    message = "Another source row selects this same existing native transaction."
                    if message not in selected["issues"]:
                        selected["issues"].append(message)
            else:
                targets[key] = item
    totals = {}
    with localcontext() as context:
        context.prec = 4096
        for item in views:
            row = item["sourceRow"]
            if row.get("financial_eligible") != "true":
                continue
            dimensions = dict(item["dimensions"])
            dimensions["publisherRef"] = item["publisherRef"]
            dimensions["decision"] = item["state"]
            key = fingerprint(dimensions)
            if key not in totals:
                totals[key] = {"dimensions": dimensions, "count": 0, "amount": Decimal(0)}
            totals[key]["count"] += 1
            totals[key]["amount"] += decimal(row["value_decimal"])
    counts = dict(Counter(item["state"] for item in views))
    analysis = {"rows": views, "counts": counts,
                "financialGroups": [{**value, "amount": decimal_text(value["amount"])} for value in totals.values()],
                "sourceCount": len({row["source"] for row in rows}), "completeRowCount": len(rows),
                "ready": bool(counts.get("included")) and not counts.get("review", 0),
                "destinationReview": []}
    if analysis["ready"]:
        prepared = project_requests(analysis, definition, capture)
        analysis["destinationReview"] = [
            {"key": step["key"], "mode": step["mode"], "originalId": step["originalId"],
             "validation": step["destinationValidation"]} for step in prepared
        ]
        analysis["ready"] = all(step["destinationValidation"]["ready"] for step in prepared)
    return analysis


def project_validation(project_json, capture):
    result = destination.validate_project(project_json, capture)
    if not isinstance(result, dict) or type(result.get("ready")) is not bool:
        raise InputError("The complete destination validator did not return its declared validity result")
    return normal(result)


def project_requests(analysis, definition, capture):
    projects, changes, existing = {}, defaultdict(list), project_index(capture)
    new_fundings = {}
    for item in analysis["rows"]:
        if item["state"] != "included":
            continue
        p = item["proposal"]
        key = "project:" + str(p["projectId"]) if p["projectId"] else "draft:" + p["draftId"]
        if key not in projects:
            projects[key] = deepcopy(existing[p["projectId"]]) if p["projectId"] else loads(definition["projectDrafts"][p["draftId"]])
        project = projects[key]
        funds = project.setdefault("fundings", [])
        if p["fundingId"] is not None:
            funding = next(f for f in funds if f.get("funding_id") == p["fundingId"])
        else:
            # Share an explicitly identical new funding configuration; never split by an inferred donor.
            base = loads(p["fundingJson"])
            funding_key = (key, fingerprint(base))
            if funding_key not in new_fundings:
                new_fundings[funding_key] = deepcopy(base)
                funds.append(new_fundings[funding_key])
            funding = new_fundings[funding_key]
        transactions = funding.setdefault(p["family"], [])
        transaction = loads(p["transactionJson"])
        if p["transactionId"] is None:
            position = len(transactions)
            transactions.append(transaction)
        else:
            position = next(i for i, t in enumerate(transactions) if t.get("transaction_id") == p["transactionId"])
            transactions[position] = transaction
        changes[key].append({"rowKey": item["key"], "sourceRowSha256": item["sourceRowSha256"],
                             **p, "requestFundingIndex": next(i for i, item in enumerate(funds) if item is funding),
                             "requestTransactionIndex": position})
    result = []
    for key, project in projects.items():
        original_id = project.get("internal_id")
        before = existing[original_id] if original_id else None
        result.append({"key": key, "mode": "update" if before else "create",
                       "originalId": original_id,
                       "iatiIdentifier": project.get("iati_identifier"),
                       "preimageSha256": fingerprint(before) if before else None,
                       "preimageJson": dumps(before) if before else None,
                       "requestJson": dumps(project), "requestSha256": fingerprint(project),
                       "destinationValidation": project_validation(dumps(project), capture),
                       "changes": changes[key]})
    return result


def prepare(analysis, definition, capture):
    if not analysis["ready"]:
        raise InputError("Complete the source-row decisions, mappings and native project field review before preparing")
    result = project_requests(analysis, definition, capture)
    if any(not step["destinationValidation"]["ready"] for step in result):
        raise InputError("Open the complete native project field findings in the saved analysis before preparing")
    return result


def _native_path_values(value, path):
    if not path:
        return value if isinstance(value, list) else [value]
    if isinstance(value, list):
        return [item for child in value for item in _native_path_values(child, path)]
    if isinstance(value, dict) and path[0] in value:
        return _native_path_values(value[path[0]], path[1:])
    return []


def _possible_value_records(value):
    """Retain the full original selected provider records, including hierarchy."""
    result = {}
    def visit(item):
        if isinstance(item, dict):
            ident = item.get("id")
            if type(ident) in {str, int}:
                result[fingerprint(ident)] = item
            for key in ("children", "values", "possible_values", "items"):
                if key in item:
                    visit(item[key])
        elif isinstance(item, list):
            for child in item:
                if type(child) in {str, int}:
                    result[fingerprint(child)] = child
                else:
                    visit(child)
    visit(value)
    return result


def selected_value_changes(request_json, original_capture, current_values_json):
    """Catalog additions are harmless; changes to selected native meanings need review."""
    project = loads(request_json)
    original = loads(original_capture["valuesJson"])
    current = loads(current_values_json)
    metadata = field_index(loads(original_capture["fieldsJson"]))
    differences = []
    for path, field in metadata.items():
        source_path = path if path in original else field.get("common-possible-values")
        if not source_path or source_path not in original:
            continue
        before = _possible_value_records(original[source_path])
        if not before:
            continue
        current_path = path if path in current else source_path
        after = _possible_value_records(current.get(current_path, []))
        for selected in _native_path_values(project, path.split("~")):
            if type(selected) not in {str, int}:
                continue
            key = fingerprint(selected)
            if key in before and (key not in after or fingerprint(before[key]) != fingerprint(after[key])):
                differences.append({"path": path, "selected": normal(selected),
                                    "before": normal(before[key]), "after": normal(after.get(key)),
                                    "state": "missing" if key not in after else "changed"})
    return differences


def native_request_identity(step):
    """Identity of the exact native mutation, independent of local row/review labels."""
    return fingerprint({key: step[key] for key in
                        ("mode", "originalId", "preimageSha256", "requestJson")})


def native_request_set(connection, steps):
    return fingerprint({"baseUrl": connection["baseUrl"], "workspaceId": connection["workspaceId"],
                        "requests": sorted(native_request_identity(step) for step in steps)})


def corresponding_native_steps(current, original):
    """One-to-one correspondence, retaining duplicate identical requests as separate items."""
    order = lambda step: (native_request_identity(step), step["key"])
    left, right = sorted(current, key=order), sorted(original, key=order)
    if (len(left) != len(right)
            or any(native_request_identity(a) != native_request_identity(b) for a, b in zip(left, right))):
        raise InputError("The complete native request set differs from the original operation")
    return list(zip(left, right))


def _native_day(raw):
    if isinstance(raw, str) and len(raw) >= 10:
        try:
            return _day(raw[:10])
        except InputError:
            pass
    return raw


def _financial_rows(project):
    result = []
    for funding_index, funding in enumerate(project.get("fundings", [])):
        for family in FAMILIES:
            for transaction_index, transaction in enumerate(funding.get(family, [])):
                result.append({"fundingIndex": funding_index, "transactionIndex": transaction_index,
                    "fundingId": funding.get("funding_id"), "donorId": funding.get("donor_organization_id"),
                    "family": family, "transactionId": transaction.get("transaction_id"),
                    "currencyId": transaction.get("currency"), "adjustmentId": transaction.get("adjustment_type"),
                    "date": _native_day(transaction.get("transaction_date")),
                    "amount": decimal_text(transaction["transaction_amount"]) if transaction.get("transaction_amount") is not None else None,
                    "funding": {k: v for k, v in funding.items() if k not in FAMILIES}, "transaction": transaction})
    return result


def _received_collection_item(expected, actual, path, position, comparison):
    """Use the complete destination pairing and retain every original ordinal."""
    if (not isinstance(expected, list) or not isinstance(actual, list)
            or type(position) is not int or not 0 <= position < len(expected)):
        raise InputError("Prepared financial change must select its original full request position")
    pairs = [pair for pair in comparison["pairings"]
             if pair["path"] == path and pair["requestIndex"] == position]
    if len(pairs) > 1:
        raise InputError("The full destination comparison supplied conflicting collection pairings")
    if pairs:
        pair = pairs[0]
        index = pair["receivedIndex"]
        if type(index) is not int or not 0 <= index < len(actual):
            raise InputError("The full destination pairing selects an absent received record")
        return pair
    # A fully unchanged collection without configured pairings preserves its
    # exact original ordinals. Configured collections retain explicit pairings.
    if fingerprint(expected) == fingerprint(actual):
        return {"path": path, "requestIndex": position, "receivedIndex": position,
                "basis": "complete-unchanged-native-collection",
                "uniqueNativeLineage": False, "equivalentMultiplicity": False}
    return None


def _matches_financial_change(row, expected):
    return (row["family"] == expected["family"] and row["donorId"] == expected["donorId"]
            and row["currencyId"] == expected["nativeCurrencyId"]
            and row["adjustmentId"] == expected["adjustmentId"]
            and row["date"] == expected["nativeDate"] and row["amount"] == expected["amount"])


def receiving(step, actual_json, capture):
    actual = native_project(loads(actual_json))
    if step.get("iatiIdentifier") and actual.get("iati_identifier") != step["iatiIdentifier"]:
        raise InputError("Received native project identifies a different IATI activity")
    expected_project = loads(step["requestJson"])
    complete_fields = destination.compare_project(step["requestJson"], actual_json, capture)
    if not isinstance(complete_fields, dict) or type(complete_fields.get("matched")) is not bool:
        raise InputError("The complete destination comparison did not return its declared matching result")
    candidates = _financial_rows(actual)
    candidate_index = {(row["fundingIndex"], row["family"], row["transactionIndex"]): row for row in candidates}
    rows, used = [], set()
    for expected in step["changes"]:
        funding_index = expected.get("requestFundingIndex")
        transaction_index = expected.get("requestTransactionIndex")
        funding_pair = _received_collection_item(
            expected_project.get("fundings", []), actual.get("fundings", []),
            "/fundings", funding_index, complete_fields)
        transaction_pair = None
        if funding_pair is not None:
            requested_funding = expected_project["fundings"][funding_index]
            returned_funding = actual["fundings"][funding_pair["receivedIndex"]]
            transaction_pair = _received_collection_item(
                requested_funding.get(expected["family"], []), returned_funding.get(expected["family"], []),
                "/fundings/" + str(funding_index) + "/" + expected["family"],
                transaction_index, complete_fields)
        selected_key = ((funding_pair["receivedIndex"], expected["family"], transaction_pair["receivedIndex"])
                        if funding_pair is not None and transaction_pair is not None else None)
        selected = candidate_index.get(selected_key)
        correspondence = {"requestFundingIndex": funding_index, "requestTransactionIndex": transaction_index,
                          "fundingPairing": funding_pair, "transactionPairing": transaction_pair}
        shared = {"rowKey": expected["rowKey"], "expected": expected, "correspondence": correspondence}
        if selected is None or selected_key in used or not _matches_financial_change(selected, expected):
            rows.append({**shared, "state": "lineage-review" if complete_fields["matched"] else "different",
                         "candidateRecords": [normal(row) for row in candidates if _matches_financial_change(row, expected)]})
            continue
        used.add(selected_key)
        ambiguous = (funding_pair.get("equivalentMultiplicity") is True
                     or transaction_pair.get("equivalentMultiplicity") is True)
        has_native_ids = (type(selected["fundingId"]) is int and selected["fundingId"] > 0
                          and type(selected["transactionId"]) is int and selected["transactionId"] > 0)
        if ambiguous or not has_native_ids:
            rows.append({**shared, "state": "lineage-review",
                         "candidateRecords": [normal(row) for row in candidates if _matches_financial_change(row, expected)],
                         "note": "The complete received contents are retained. Select the actual source-row/native identity before the next edition."})
        else:
            rows.append({**shared, "state": "received", "native": normal(selected)})
    intended_rows = Counter(fingerprint({k: row[k] for k in ("donorId", "family", "currencyId", "adjustmentId", "date", "amount")})
                            for row in _financial_rows(expected_project))
    actual_rows = Counter(fingerprint({k: row[k] for k in ("donorId", "family", "currencyId", "adjustmentId", "date", "amount")})
                          for row in candidates)
    complete_financial_match = intended_rows == actual_rows
    differences = {"missing": list((intended_rows - actual_rows).elements()),
                   "additional": list((actual_rows - intended_rows).elements())}
    return {"nativeId": actual["internal_id"], "ampId": actual.get("amp_id"),
            "activityGroup": normal(actual.get("activity_group")),
            "actualSha256": fingerprint(actual), "rows": rows,
            "rowLineageReviewCount": sum(row["state"] == "lineage-review" for row in rows),
            "completeFinancialMatch": complete_financial_match,
            "financialDifferences": differences,
            "destinationComparison": normal(complete_fields),
            "otherFieldDifferences": normal(complete_fields.get("differences", [])),
            "state": "received" if all(row["state"] in {"received", "lineage-review"} for row in rows)
                     and complete_financial_match and complete_fields["matched"] else "different"}


def compare(before_rows, after_rows, correspondence=()):
    before, after = {r["key"]: r for r in before_rows}, {r["key"]: r for r in after_rows}
    forward = {p["before"]: p["after"] for p in correspondence}
    if any(a not in before or b not in after for a, b in forward.items()):
        raise InputError("Edition correspondence must select rows in the retained before and after editions")
    paired, changes = set(), []
    for key, old in before.items():
        next_key = forward.get(key, key)
        new = after.get(next_key)
        if new is None:
            changes.append({"state": "removed", "before": old, "after": None})
        elif next_key in paired:
            raise InputError("Multiple prior rows select the same following-edition record")
        else:
            paired.add(next_key)
            changes.append({"state": "unchanged" if old["sourceRowSha256"] == new["sourceRowSha256"] else "changed",
                            "before": old, "after": new,
                            "explicitCorrespondence": key != next_key})
    changes.extend({"state": "added", "before": None, "after": row}
                   for key, row in after.items() if key not in paired)
    return {"counts": dict(Counter(row["state"] for row in changes)), "rows": changes,
            "sourceAmountsRemainSeparate": True}
