"""MIT. Versioned award administration inside the original portfolio transaction.

This module records supplied operator decisions and external payment evidence.
It authenticates no person, sends no money and defines no fund-specific policy.
"""
from __future__ import annotations

import copy
import json
import re
from decimal import Decimal, localcontext

from domain import canonical, checked_ref, digest, financial_totals, identifier, require, sha, shape, short
from programme import (normalize as programme_normalize, indexes as programme_indexes,
                       record_ref, ancestors, programme_decimal, programme_decimal_context,
                       _programme_exact_arithmetic)

AWARDS_SCHEMA = "stellar-forge.grant-awards.v1"
COLLECTIONS = ("rounds", "applications", "checks", "assignments", "assessments",
               "decisions", "agreements", "claims", "monitoring")
AWARDS_TABLES = tuple("awards_" + name for name in COLLECTIONS) + ("awards_positions", "awards_calculations")
COMMON = {"notes": "text", "sourceRefs": "sources", "evidenceIds": "ids", "supersedesId": "id?"}
FIELDS = json.loads("{\"rounds\":{\"code\":\"short\",\"title\":\"short\",\"programmeNodeId\":\"id\",\"owner\":\"short\",\"opensDate\":\"date?\",\"closesDate\":\"date?\",\"criteria\":\"criteria\",\"process\":\"text\",\"status\":[\"draft\",\"published\",\"closed\"],\"scoringMethod\":[\"none\",\"weighted-sum\"]},\"applications\":{\"roundId\":\"id\",\"partnerId\":\"id\",\"projectId\":\"id?\",\"reference\":\"short\",\"title\":\"short\",\"applicantProfile\":\"profile\",\"answers\":\"answers\",\"requestedAmount\":\"money?\",\"submittedDate\":\"date?\",\"status\":[\"draft\",\"submitted\",\"withdrawn\"]},\"checks\":{\"applicationId\":\"id\",\"kind\":[\"eligibility\",\"due-diligence\"],\"reviewer\":\"short\",\"outcome\":[\"undetermined\",\"pass\",\"fail\",\"query\"],\"items\":\"checkItems\",\"completedDate\":\"date?\",\"status\":[\"draft\",\"recorded\"]},\"assignments\":{\"applicationId\":\"id\",\"assessor\":\"short\",\"assignedBy\":\"short\",\"assignedDate\":\"date\",\"conflictDisclosure\":\"disclosure\",\"conflictResolution\":\"resolution\",\"status\":[\"draft\",\"confirmed\"]},\"assessments\":{\"assignmentId\":\"id\",\"assessor\":\"short\",\"scores\":\"scores\",\"recommendation\":\"text\",\"submittedDate\":\"date?\",\"status\":[\"draft\",\"submitted\"]},\"decisions\":{\"applicationId\":\"id\",\"assessmentIds\":\"ids\",\"checkIds\":\"ids\",\"panel\":\"panel\",\"outcome\":[\"award\",\"reject\",\"reserve\",\"defer\"],\"amount\":\"money?\",\"reasons\":\"text\",\"decisionDate\":\"date?\",\"status\":[\"draft\",\"recorded\"]},\"agreements\":{\"decisionId\":\"id\",\"grantId\":\"id\",\"agreementDocumentId\":\"id\",\"recipientPartnerId\":\"id\",\"amount\":\"money?\",\"startDate\":\"date?\",\"endDate\":\"date?\",\"acceptedBy\":\"short?\",\"acceptedDate\":\"date?\",\"conditions\":\"text\",\"status\":[\"draft\",\"recorded\"]},\"claims\":{\"agreementId\":\"id\",\"kind\":[\"submission\",\"review\",\"reconciliation\"],\"claimId\":\"id?\",\"owner\":\"short\",\"amount\":\"money?\",\"outcome\":[\"pending\",\"approved\",\"rejected\",\"query\",\"matched\",\"disputed\"],\"financialRefs\":\"financialRefs\",\"recordedDate\":\"date?\",\"narrative\":\"text\",\"status\":[\"draft\",\"recorded\"]},\"monitoring\":{\"agreementId\":\"id\",\"title\":\"short\",\"periodStart\":\"date\",\"periodEnd\":\"date\",\"reportedBy\":\"short\",\"observationIds\":\"ids\",\"milestoneIds\":\"ids\",\"outcome\":[\"undetermined\",\"on-track\",\"action-required\",\"complete\"],\"narrative\":\"text\",\"actions\":\"text\",\"status\":[\"draft\",\"recorded\"]}}")
REQUIRED = json.loads("{\"rounds\":[\"code\",\"title\",\"programmeNodeId\",\"owner\",\"criteria\",\"status\"],\"applications\":[\"roundId\",\"partnerId\",\"reference\",\"title\",\"applicantProfile\",\"status\"],\"checks\":[\"applicationId\",\"kind\",\"reviewer\",\"outcome\",\"status\"],\"assignments\":[\"applicationId\",\"assessor\",\"assignedBy\",\"assignedDate\",\"conflictDisclosure\",\"conflictResolution\",\"status\"],\"assessments\":[\"assignmentId\",\"assessor\",\"scores\",\"status\"],\"decisions\":[\"applicationId\",\"outcome\",\"reasons\",\"status\"],\"agreements\":[\"decisionId\",\"grantId\",\"agreementDocumentId\",\"recipientPartnerId\",\"status\"],\"claims\":[\"agreementId\",\"kind\",\"owner\",\"outcome\",\"status\"],\"monitoring\":[\"agreementId\",\"title\",\"periodStart\",\"periodEnd\",\"reportedBy\",\"outcome\",\"status\"]}")
NESTED = json.loads("{\"criteria\":{\"kind\":\"array\",\"fields\":{\"id\":\"criterionKey\",\"title\":\"short\",\"kind\":[\"score\",\"eligibility\"],\"required\":\"bool\",\"minimum\":\"decimal?\",\"maximum\":\"decimal?\",\"weight\":\"decimal?\",\"guidance\":\"text\"},\"required\":[\"id\",\"title\",\"kind\",\"required\"],\"notes\":\"Score criteria require minimum and maximum; optional positive weights are preserved explicitly. Eligibility criteria have no numeric range or weight.\"},\"profile\":{\"kind\":\"object\",\"fields\":{\"legalName\":\"short\",\"organisationIdentifier\":\"short?\",\"contactName\":\"short?\",\"contactEmail\":\"email?\",\"country\":\"short?\",\"summary\":\"text\"},\"required\":[\"legalName\"]},\"answers\":{\"kind\":\"array\",\"fields\":{\"criterionId\":\"criterionKey\",\"response\":\"text\"},\"required\":[\"criterionId\",\"response\"]},\"checkItems\":{\"kind\":\"array\",\"fields\":{\"criterionId\":\"criterionKey?\",\"title\":\"short\",\"outcome\":[\"undetermined\",\"pass\",\"fail\",\"query\"],\"reason\":\"text\",\"evidenceIds\":\"ids\"},\"required\":[\"title\",\"outcome\",\"reason\"]},\"disclosure\":{\"kind\":\"object\",\"fields\":{\"state\":[\"undisclosed\",\"none\",\"declared\"],\"details\":\"text\",\"evidenceIds\":\"ids\"},\"required\":[\"state\",\"details\"]},\"resolution\":{\"kind\":\"object\",\"fields\":{\"outcome\":[\"pending\",\"clear\",\"recused\"],\"decidedBy\":\"short?\",\"reason\":\"text\",\"date\":\"date?\"},\"required\":[\"outcome\",\"reason\"]},\"scores\":{\"kind\":\"array\",\"fields\":{\"criterionId\":\"criterionKey\",\"value\":\"decimal?\",\"reason\":\"text\",\"evidenceIds\":\"ids\"},\"required\":[\"criterionId\",\"value\",\"reason\"]},\"panel\":{\"kind\":\"array\",\"fields\":{\"member\":\"short\",\"role\":\"short\",\"conflictState\":[\"none\",\"declared\",\"recused\"],\"reason\":\"text\"},\"required\":[\"member\",\"role\",\"conflictState\",\"reason\"]},\"financialRefs\":{\"kind\":\"array\",\"fields\":{\"sourceId\":\"sha256\",\"rowKey\":\"sha256\",\"sha256\":\"sha256\"},\"required\":[\"sourceId\",\"rowKey\",\"sha256\"]},\"money\":{\"kind\":\"object\",\"fields\":{\"value\":\"decimal\",\"currency\":\"currency\"},\"required\":[\"value\",\"currency\"]}}")
FINAL = {"rounds": {"published", "closed"}, "applications": {"submitted", "withdrawn"},
         "checks": {"recorded"}, "assignments": {"confirmed"}, "assessments": {"submitted"},
         "decisions": {"recorded"}, "agreements": {"recorded"}, "claims": {"recorded"},
         "monitoring": {"recorded"}}


def indexes(model):
    return {name: {row["id"]: row for row in model["records"][name]} for name in COLLECTIONS}


def _default(spec):
    if isinstance(spec, str):
        if spec in ("ids", "sources") or (spec in NESTED and NESTED[spec]["kind"] == "array"):
            return []
        if spec == "text":
            return ""
        if spec.endswith("?"):
            return None
    return ...


def _defaults(specs):
    return {key: value for key, spec in specs.items() if (value := _default(spec)) is not ...}


def normalize(value, spec, name):
    if isinstance(spec, list):
        require(value in spec, name + " must be one of: " + ", ".join(spec))
        return value
    if spec.endswith("?") and value is None:
        return None
    kind = spec.rstrip("?")
    if kind == "criterionKey":
        require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", value),
                "Use a stable criterion key with letters, numbers, dots, dashes or underscores")
        return value
    if kind == "sha256":
        return sha(value)
    if kind == "currency":
        require(isinstance(value, str) and re.fullmatch(r"[A-Z]{3}", value),
                "Keep the original three-letter currency")
        return value
    if kind in NESTED:
        definition = NESTED[kind]
        def item(raw):
            shape(raw, definition["fields"], definition["required"])
            result = _defaults(definition["fields"])
            result.update({key: normalize(selected, definition["fields"][key], key)
                           for key, selected in raw.items()})
            return result
        if definition["kind"] == "object":
            return item(value)
        require(isinstance(value, list) and len(value) <= 1000,
                "Supply at most 1,000 complete " + name + " entries")
        result = [item(row) for row in value]
        unique = {"criteria": ("id",), "answers": ("criterionId",), "scores": ("criterionId",),
                  "panel": ("member",), "financialRefs": ("sourceId", "rowKey")}.get(kind)
        if unique:
            require(len({tuple(row[key] for key in unique) for row in result}) == len(result),
                    name + " repeats an original identity")
        return result
    return programme_normalize(value, kind, name)


def _row(index, collection, ident, *, live=False, final=False):
    row = index[collection].get(ident)
    require(row is not None, "The selected " + collection + " record is absent",
            "AWARDS_REFERENCE_MISSING", 409)
    if live:
        require(not row["archived"], "An archived record cannot authorize a following award step",
                "AWARDS_REFERENCE_ARCHIVED", 409)
    if final:
        require(row.get("publication") is not None,
                "Select the recorded original " + collection + " edition", "AWARDS_EDITION_REQUIRED", 409)
    return row


def _programme_row(index, collection, ident):
    row = index[collection].get(ident)
    require(row is not None,
            "Select an original programme " + collection + " record",
            "AWARDS_PROGRAMME_REFERENCE", 409)
    return row


def _application(index, collection, row):
    if collection == "rounds":
        return None
    if collection == "applications":
        return row
    if collection in ("checks", "assignments", "decisions"):
        return _row(index, "applications", row["applicationId"])
    if collection == "assessments":
        assignment = _row(index, "assignments", row["assignmentId"])
        return _row(index, "applications", assignment["applicationId"])
    if collection == "agreements":
        decision = _row(index, "decisions", row["decisionId"])
        return _row(index, "applications", decision["applicationId"])
    agreement = _row(index, "agreements", row["agreementId"])
    return _application(index, "agreements", agreement)


def _round(index, collection, row):
    if collection == "rounds":
        return row
    return _row(index, "rounds", _application(index, collection, row)["roundId"])


def _money_equal(left, right):
    return (left is None and right is None) or (left is not None and right is not None
        and left["currency"] == right["currency"]
        and programme_decimal(left["value"], "Amount") == programme_decimal(right["value"], "Amount"))


def _criteria(row):
    criteria = {item["id"]: item for item in row["criteria"]}
    require(criteria, "Publish the complete operator-approved criteria; no fund criteria are assumed")
    for item in criteria.values():
        if item["kind"] == "score":
            require(item["minimum"] is not None and item["maximum"] is not None,
                    "Every score criterion needs its explicit minimum and maximum")
            low = programme_decimal(item["minimum"], "Criterion minimum")
            high = programme_decimal(item["maximum"], "Criterion maximum")
            require(low <= high, "A score criterion minimum exceeds its maximum")
            if item["weight"] is not None:
                require(programme_decimal(item["weight"], "Criterion weight") > 0,
                        "A configured score weight must be positive")
        else:
            require(all(item[key] is None for key in ("minimum", "maximum", "weight")),
                    "Eligibility criteria do not silently become numeric scores")
    if row["scoringMethod"] == "weighted-sum":
        scored = [item for item in criteria.values() if item["kind"] == "score"]
        require(scored and all(item["weight"] is not None for item in scored),
                "Weighted-sum requires an explicit positive weight for every score criterion")
    return criteria


def _evidence_ids(row):
    values = set(row.get("evidenceIds", []))
    for name in ("scores", "items"):
        for item in row.get(name, []):
            values.update(item.get("evidenceIds", []))
    values.update(row.get("conflictDisclosure", {}).get("evidenceIds", []))
    if row.get("agreementDocumentId"):
        values.add(row["agreementDocumentId"])
    return sorted(values)


def _award_links(collection, row):
    links = []
    mapping = {
        "applications": (("rounds", "roundId"),),
        "checks": (("applications", "applicationId"),),
        "assignments": (("applications", "applicationId"),),
        "assessments": (("assignments", "assignmentId"),),
        "decisions": (("applications", "applicationId"),),
        "agreements": (("decisions", "decisionId"),),
        "claims": (("agreements", "agreementId"),),
        "monitoring": (("agreements", "agreementId"),)}
    for target, field in mapping.get(collection, ()):
        links.append((target, row[field]))
    if collection == "decisions":
        links.extend(("assessments", ident) for ident in row["assessmentIds"])
        links.extend(("checks", ident) for ident in row["checkIds"])
    if collection == "claims" and row.get("claimId"):
        links.append(("claims", row["claimId"]))
    if row.get("supersedesId"):
        links.append((collection, row["supersedesId"]))
    return links


def _programme_links(index, collection, row):
    round_row = _round(index, collection, row)
    application = _application(index, collection, row)
    # A claim or monitoring edition inherits its agreement's original parties
    # and programme scope; only its explicit new evidence is selected today.
    result = []
    if collection not in ("claims", "monitoring"):
        result.append(("nodes", round_row["programmeNodeId"]))
        if application:
            result.append(("partners", application["partnerId"]))
            if application.get("projectId"):
                result.append(("nodes", application["projectId"]))
    if collection == "agreements":
        result.extend([("grants", row["grantId"]), ("partners", row["recipientPartnerId"])])
    if collection == "monitoring":
        result.extend(("observations", ident) for ident in row["observationIds"])
        result.extend(("milestones", ident) for ident in row["milestoneIds"])
    result.extend(("documents", ident) for ident in _evidence_ids(row))
    return sorted(set(result))


def _evidence_scope(index, pindex, collection, row):
    if collection in ("claims", "monitoring"):
        agreement = _row(index, "agreements", row["agreementId"])
        if agreement.get("publication"):
            scope = agreement["publication"].get("evidenceScope")
            require(isinstance(scope, dict) and scope.get("grantId") == agreement["grantId"]
                    and scope.get("nodeId") in scope.get("nodeIds", [])
                    and scope["grantId"] in scope.get("grantIds", []),
                    "The recorded agreement's original evidence scope is unavailable",
                    "AWARDS_AGREEMENT_SCOPE_UNAVAILABLE", 409)
            return copy.deepcopy(scope)
        grant_id = agreement["grantId"]
    else:
        grant_id = row["grantId"] if collection == "agreements" else None
    application = _application(index, collection, row)
    node_id = (application.get("projectId") if application else None) or _round(
        index, collection, row)["programmeNodeId"]
    if grant_id:
        node_id = _programme_row(pindex, "grants", grant_id)["projectId"]
    return {"nodeId": node_id, "grantId": grant_id,
            "nodeIds": sorted(ancestors(pindex["nodes"], node_id, "parentId")),
            "grantIds": sorted(ancestors(pindex["grants"], grant_id, "parentGrantId")) if grant_id else []}


def _assessment_calculation(index, row):
    assignment = _row(index, "assignments", row["assignmentId"])
    application = _row(index, "applications", assignment["applicationId"])
    round_row = _row(index, "rounds", application["roundId"])
    criteria = _criteria(round_row)
    scores = {item["criterionId"]: item for item in row["scores"]}
    details, products, missing = [], [], []
    for ident, criterion in criteria.items():
        if criterion["kind"] != "score":
            continue
        score = scores.get(ident)
        value = score["value"] if score else None
        weighted = None
        if value is None:
            missing.append(ident)
        elif criterion["weight"] is not None:
            number = programme_decimal(value, "Score")
            weight = programme_decimal(criterion["weight"], "Weight")
            with localcontext() as context:
                programme_decimal_context(context, max(1, len(number.as_tuple().digits) + len(weight.as_tuple().digits)))
                product = context.multiply(number, weight)
            weighted = str(product)
            products.append(product)
        details.append({"criterionId": ident, "minimum": criterion["minimum"], "maximum": criterion["maximum"],
                        "weight": criterion["weight"], "value": value, "weighted": weighted})
    total = None
    if round_row["scoringMethod"] == "weighted-sum" and not missing and products:
        total = _programme_exact_arithmetic(products)
    return {"method": round_row["scoringMethod"], "criteriaRef": record_ref("rounds", round_row),
            "applicationRef": record_ref("applications", application),
            "assignmentRef": record_ref("assignments", assignment), "scores": details,
            "missingCriterionIds": missing, "weightedTotal": total,
            "ranking": None, "policy": "Only the published operator-selected arithmetic; no quorum or award decision."}


def _validate(index, pindex, collection, row, *, freezing=False, actor=None):
    round_row = _round(index, collection, row)
    application = _application(index, collection, row)
    programme_node = _programme_row(pindex, "nodes", round_row["programmeNodeId"])
    if application and collection not in ("claims", "monitoring"):
        _programme_row(pindex, "partners", application["partnerId"])
        if application.get("projectId"):
            project = _programme_row(pindex, "nodes", application["projectId"])
            require(project["kind"] == "project"
                    and programme_node["id"] in ancestors(pindex["nodes"], project["id"], "parentId"),
                    "The applicant project must belong to the round's selected programme scope")
    if collection == "rounds":
        _criteria(row)
        require(not row["opensDate"] or not row["closesDate"] or row["opensDate"] <= row["closesDate"],
                "The recorded round dates are reversed")
    else:
        _row(index, "rounds", round_row["id"], final=freezing)
    for target, ident in _award_links(collection, row):
        _row(index, target, ident, final=freezing)
    scope = _evidence_scope(index, pindex, collection, row)
    scope_grant = scope["grantId"]
    for target, ident in _programme_links(index, collection, row):
        selected = _programme_row(pindex, target, ident)
        if target == "documents":
            require(selected["nodeId"] in scope["nodeIds"],
                    "The evidence document is outside this application/programme scope")
            if selected.get("grantId"):
                require(scope_grant and selected["grantId"] in scope["grantIds"],
                        "The evidence document belongs to another grant")
        if target == "observations":
            indicator = _programme_row(pindex, "indicators", selected["indicatorId"])
            require(indicator["nodeId"] in scope["nodeIds"]
                    and (not indicator.get("grantId") or indicator["grantId"] == scope_grant),
                    "The monitored observation belongs to another project/grant")
        if target == "milestones":
            require(selected["nodeId"] in scope["nodeIds"]
                    and (not selected.get("grantId") or selected["grantId"] == scope_grant),
                    "The monitored milestone belongs to another project/grant")
    criteria = _criteria(round_row)
    if collection == "applications":
        answers = {item["criterionId"]: item for item in row["answers"]}
        require(set(answers) <= set(criteria), "An answer names a criterion outside the selected published round")
        if freezing:
            require(row["submittedDate"] and all(
                not item["required"] or (ident in answers and answers[ident]["response"].strip())
                for ident, item in criteria.items()), "Submit a dated application with all required original answers")
    elif collection == "checks":
        require(all(item["criterionId"] is None or item["criterionId"] in criteria for item in row["items"]),
                "A check names a criterion outside the selected round")
        if freezing:
            require(row["completedDate"] and row["reviewer"] == actor,
                    "The recorded check needs its dated, explicitly attributed reviewer")
    elif collection == "assignments":
        disclosure, resolution = row["conflictDisclosure"], row["conflictResolution"]
        if disclosure["state"] == "declared":
            require(disclosure["details"].strip(), "Record the disclosed conflict in full")
        if freezing:
            require(disclosure["state"] != "undisclosed" and resolution["outcome"] != "pending",
                    "A confirmed assignment requires an explicit disclosure and recorded resolution")
            require(resolution["decidedBy"] and resolution["date"] and resolution["reason"].strip(),
                    "Retain the conflict resolution actor, date and rationale")
            require(actor == resolution["decidedBy"], "The conflict disposition must be attributed to this recording actor")
            if disclosure["state"] == "declared" and resolution["outcome"] == "clear":
                require(resolution["decidedBy"] != row["assessor"],
                        "A declared conflict cannot be self-cleared for scoring")
    elif collection == "assessments":
        assignment = _row(index, "assignments", row["assignmentId"])
        require(assignment["assessor"] == row["assessor"], "The assessment must retain its assigned assessor")
        scores = {item["criterionId"]: item for item in row["scores"]}
        require(set(scores) <= {ident for ident, item in criteria.items() if item["kind"] == "score"},
                "A score names an unknown or non-score criterion")
        for ident, item in scores.items():
            if item["value"] is not None:
                value = programme_decimal(item["value"], "Score")
                require(programme_decimal(criteria[ident]["minimum"], "Minimum") <= value <=
                        programme_decimal(criteria[ident]["maximum"], "Maximum"),
                        "A score falls outside its exact published range")
            require(item["reason"].strip(), "Record the assessor's rationale, including a missing score")
        if freezing:
            require(row["submittedDate"] and row["assessor"] == actor,
                    "A submitted assessment needs its original assessor attribution and date")
            require(assignment["conflictResolution"]["outcome"] == "clear",
                    "A recused or unresolved assessor cannot submit scores")
            require(application["status"] == "submitted", "The original application is withdrawn or unsubmitted")
            require(all(not item["required"] or (ident in scores and scores[ident]["value"] is not None)
                        for ident, item in criteria.items() if item["kind"] == "score"),
                    "The submitted assessment is missing a required published score")
    elif collection == "decisions":
        for ident in row["assessmentIds"]:
            selected = _row(index, "assessments", ident)
            require(_application(index, "assessments", selected)["id"] == row["applicationId"],
                    "A decision includes another application's assessment")
        for ident in row["checkIds"]:
            require(_row(index, "checks", ident)["applicationId"] == row["applicationId"],
                    "A decision includes another application's check")
        if freezing:
            require(row["decisionDate"] and row["reasons"].strip() and row["panel"],
                    "Record the dated explicit panel decision, membership and rationale")
            require(row["outcome"] != "award" or any(member["conflictState"] != "recused" for member in row["panel"]),
                    "An entirely recused panel records no affirmative funding decision")
            require(all(member["conflictState"] == "none" or member["reason"].strip()
                        for member in row["panel"]), "Retain conflict and abstention reasons")
            require(row["outcome"] != "award" or row["amount"] is not None,
                    "An award decision requires its exact original amount and currency")
    elif collection == "agreements":
        decision = _row(index, "decisions", row["decisionId"])
        grant = _programme_row(pindex, "grants", row["grantId"])
        require(row["recipientPartnerId"] == application["partnerId"]
                and (not grant.get("recipientId") or grant["recipientId"] == row["recipientPartnerId"]),
                "The agreement recipient must match the selected applicant and original grant")
        require((not application.get("projectId") or grant["projectId"] == application["projectId"])
                and round_row["programmeNodeId"] in ancestors(pindex["nodes"], grant["projectId"], "parentId"),
                "The agreement grant is outside the selected applicant project/programme")
        require(not row["startDate"] or not row["endDate"] or row["startDate"] <= row["endDate"],
                "The agreement dates are reversed")
        if freezing:
            document = _programme_row(pindex, "documents", row["agreementDocumentId"])
            require(decision["outcome"] == "award" and _money_equal(row["amount"], decision["amount"]),
                    "Record an agreement against the exact explicit award amount and currency")
            require(row["acceptedBy"] and row["acceptedDate"] and document["category"] == "agreement"
                    and (document.get("object") or document.get("content", "").strip()),
                    "A recorded agreement requires executed acceptance attribution and retained agreement evidence")
    elif collection == "claims":
        agreement = _row(index, "agreements", row["agreementId"])
        if row["kind"] == "submission":
            require(row["claimId"] is None and row["outcome"] == "pending" and not row["financialRefs"],
                    "An original claim submission does not imply a review or payment")
        else:
            original = _row(index, "claims", row["claimId"])
            require(original["kind"] == "submission" and original["agreementId"] == row["agreementId"],
                    "A review/reconciliation must select the original claim in this agreement")
            allowed = ("approved", "rejected", "query") if row["kind"] == "review" else ("matched", "disputed")
            require(row["outcome"] in allowed, "Use the explicit outcome for this claim stage")
            if row["kind"] == "review":
                require(not row["financialRefs"], "A claim review is not an external payment reconciliation")
        if row["amount"] and agreement["amount"]:
            require(row["amount"]["currency"] == agreement["amount"]["currency"],
                    "Keep claim amounts in their original agreement currency; no implicit conversion")
        if freezing:
            require(row["recordedDate"] and row["owner"] == actor and row["narrative"].strip(),
                    "Retain the claim stage's actual date, recording actor and explanation")
            if row["kind"] == "submission":
                require(row["amount"] is not None, "A submitted claim needs its original amount")
            if row["kind"] == "reconciliation":
                require(row["financialRefs"] or row["evidenceIds"],
                        "A reconciliation requires selected external financial rows or original payment evidence")
    elif collection == "monitoring":
        require(row["periodStart"] <= row["periodEnd"], "The monitoring period is reversed")
        if freezing:
            require(row["reportedBy"] == actor and row["narrative"].strip(),
                    "Retain the monitoring reporter and original narrative")
    if row.get("amount"):
        require(programme_decimal(row["amount"]["value"], "Amount") >= 0, "Record a nonnegative amount")
    if row.get("requestedAmount"):
        require(programme_decimal(row["requestedAmount"]["value"], "Requested amount") >= 0,
                "Record a nonnegative requested amount")


def _snapshot(row):
    # Publications contain their own complete evidence. A dependency embeds its
    # exact fields and the original publication digest, without recursive copies.
    result = {key: copy.deepcopy(value) for key, value in row.items() if key != "publication"}
    if row.get("publication"):
        result["publicationSha256"] = digest(row["publication"])
    return result


def _publish(index, pindex, collection, row, *, context, entities, financial, object_info):
    pending = _award_links(collection, row)
    selected, seen = [], set()
    while pending:
        name, ident = pending.pop(0)
        if (name, ident) in seen:
            continue
        seen.add((name, ident))
        require(len(seen) <= 10000, "The award publication exceeds 10,000 exact contributing editions")
        linked = _row(index, name, ident, final=True)
        selected.append((name, linked))
        pending.extend(_award_links(name, linked))
    # A later programme/profile/document correction must not replace a
    # contributor edition that an earlier submitted application already froze.
    programme_selected = {}
    source_records = {}
    for _, original in selected:
        publication = original["publication"]
        for entry in publication["programmeRecords"]:
            record = entry["record"]
            programme_selected[(entry["collection"], record["id"], record["revision"], record["sha256"])] = record
        for record in publication["sourceRecords"]:
            source_records[(record["sourceId"], record["entityKey"], record["sha256"])] = record
    scope = _evidence_scope(index, pindex, collection, row)
    programme_links = _programme_links(index, collection, row)
    if collection not in ("claims", "monitoring"):
        programme_links += [("nodes", ident) for ident in scope["nodeIds"]]
        programme_links += [("grants", ident) for ident in scope["grantIds"]]
    for target, ident in programme_links:
        original = _programme_row(pindex, target, ident)
        programme_selected[(target, ident, original["revision"], original["sha256"])] = original
    source_lookup = {(item["sourceId"], item["entityKey"]): item for item in entities}
    for reference in row["sourceRefs"]:
        _, original = checked_ref(reference, source_lookup)
        source_records[(reference["sourceId"], reference["entityKey"], reference["sha256"])] = original
    programme_source_bindings = []
    for original in programme_selected.values():
        for reference in original.get("sourceRefs", []):
            selected_source = source_lookup.get((reference["sourceId"], reference["entityKey"]))
            status = "OUTSIDE_SELECTION" if selected_source is None else (
                "MATCHED" if selected_source["sha256"] == reference["sha256"] else "CHANGED")
            programme_source_bindings.append({"reference": copy.deepcopy(reference), "status": status})
            if status == "MATCHED":
                source_records[(reference["sourceId"], reference["entityKey"], reference["sha256"])] = selected_source
    financial_lookup = {(item["sourceId"], item["rowKey"]): item for item in financial}
    financial_records = []
    for reference in row.get("financialRefs", []):
        original = financial_lookup.get((reference["sourceId"], reference["rowKey"]))
        require(original is not None and digest(original) == reference["sha256"],
                "The complete selected external financial row changed or is absent",
                "AWARDS_FINANCIAL_ROW_CHANGED", 409)
        financial_records.append(copy.deepcopy(original))
    documents = []
    for (name, _, _, _), original in programme_selected.items():
        if name == "documents" and original.get("object"):
            descriptor = original["object"]
            if object_info is not None:
                require(object_info(descriptor["sha256"]) ==
                        {"sha256": descriptor["sha256"], "bytes": descriptor["bytes"]},
                        "The selected original award evidence bytes changed", "AWARDS_DOCUMENT_CHANGED", 409)
            documents.append({"sha256": descriptor["sha256"], "bytes": descriptor["bytes"]})
    publication = {"schema": "stellar-forge.award-publication.v1", "at": context["at"],
        "operationId": context.get("operationId"),
        "portfolioId": context.get("portfolioId"), "portfolioRevision": context.get("portfolioRevision"),
        "record": {"collection": collection, "id": row["id"], "revision": row["revision"],
                   "contentSha256": row["sha256"]},
        "awardRecords": [{"collection": name, "record": _snapshot(original)}
                         for name, original in sorted(selected, key=lambda item: (item[0], item[1]["id"]))],
        "programmeRecords": [{"collection": name, "record": copy.deepcopy(original)}
                             for (name, _, _, _), original in sorted(programme_selected.items())],
        "sourceRecords": [copy.deepcopy(value) for _, value in sorted(source_records.items())],
        "programmeSourceBindings": programme_source_bindings,
        "financialRecords": financial_records, "financialTotals": financial_totals(financial_records),
        "evidenceScope": scope,
        "documents": sorted(documents, key=lambda item: item["sha256"]),
        "calculation": _assessment_calculation(index, row) if collection == "assessments" else None,
        "meaning": "Exact supplied editions and assertions; no payment instruction, fund policy or automatic award."}
    return publication


def apply_awards(previous, incoming, *, context, programme, entities, financial, object_info=None):
    """Pure preparation for the original one-transaction portfolio.save."""
    shape(incoming, ("schema", "expectedAwardsRevision", "actor", "changes", "archive"),
          ("schema", "expectedAwardsRevision", "actor"))
    require(incoming["schema"] == AWARDS_SCHEMA, "Select the original awards schema")
    require(programme is not None, "Awards administration needs the selected original programme",
            "AWARDS_PROGRAMME_REQUIRED", 409)
    expected = previous["revision"] if previous else 0
    require(type(incoming["expectedAwardsRevision"]) is int and incoming["expectedAwardsRevision"] == expected,
            "The awards revision changed", "AWARDS_REVISION_CONFLICT", 409)
    actor = short(incoming["actor"], "Awards recording actor", 240)
    changes, archives = incoming.get("changes", []), incoming.get("archive", [])
    require(isinstance(changes, list) and isinstance(archives, list)
            and 0 < len(changes) + len(archives) <= 2000, "Supply a complete award administration change batch")
    model = {"schema": AWARDS_SCHEMA, "revision": expected + 1,
             "records": copy.deepcopy(previous["records"]) if previous else {name: [] for name in COLLECTIONS}}
    idx, pidx, touched, changed, freezing = indexes(model), programme_indexes(programme), set(), [], []
    source_lookup = {(row["sourceId"], row["entityKey"]): row for row in entities}
    for change in changes:
        shape(change, ("collection", "id", "expectedRevision", "fields"),
              ("collection", "id", "expectedRevision", "fields"))
        name, ident = change["collection"], identifier(change["id"])
        require(name in COLLECTIONS and (name, ident) not in touched, "Select each original award record once")
        touched.add((name, ident))
        before = idx[name].get(ident)
        require(type(change["expectedRevision"]) is int and
                change["expectedRevision"] == (before["revision"] if before else 0),
                "The award record changed", "AWARDS_RECORD_CONFLICT", 409)
        require(before is None or not before["archived"], "An archived award edition remains unchanged")
        specs = {**COMMON, **FIELDS[name]}
        shape(change["fields"], specs)
        require(change["fields"], "An award edit needs explicit fields")
        fields = {key: copy.deepcopy(before[key]) for key in specs if key in before} if before else _defaults(specs)
        fields.update({key: normalize(value, specs[key], key) for key, value in change["fields"].items()})
        if name == "rounds":
            fields.setdefault("scoringMethod", "none")
        require(set(REQUIRED[name]) <= fields.keys(), "Complete the required " + name + " fields")
        if before and before.get("publication"):
            permitted = (name == "rounds" and before["status"] in ("published", "closed")
                         and fields["status"] == "closed") or (
                         name == "applications" and before["status"] in ("submitted", "withdrawn")
                         and fields["status"] == "withdrawn")
            require(permitted and all(value == before[key] for key, value in fields.items() if key != "status"),
                    "A recorded edition is immutable; add a following record with supersedesId",
                    "AWARDS_PUBLISHED_EDITION_CHANGED", 409)
        if "sourceRefs" in change["fields"] or before is None:
            for reference in fields["sourceRefs"]:
                checked_ref(reference, source_lookup)
        row = {**fields, "id": ident, "revision": (before["revision"] if before else 0) + 1,
               "createdAt": before["createdAt"] if before else context["at"], "updatedAt": context["at"],
               "createdBy": before["createdBy"] if before else actor,
               "updatedBy": actor, "archived": False, "archiveReason": ""}
        if before and before.get("publication"):
            row["publication"] = copy.deepcopy(before["publication"])
        row["sha256"] = digest(row)
        idx[name][ident] = row
        changed.append((name, ident))
        if row["status"] in FINAL[name] and not row.get("publication"):
            freezing.append((name, ident))
    for change in archives:
        shape(change, ("collection", "id", "expectedRevision", "reason"),
              ("collection", "id", "expectedRevision", "reason"))
        name, ident = change["collection"], identifier(change["id"])
        require(name in COLLECTIONS and (name, ident) not in touched, "Select each original award record once")
        touched.add((name, ident))
        before = _row(idx, name, ident, live=True)
        require(before["status"] == "draft" and not before.get("publication"),
                "Only an unpublished draft can be archived; retain recorded editions and add a correction",
                "AWARDS_PUBLISHED_EDITION_CHANGED", 409)
        require(type(change["expectedRevision"]) is int and change["expectedRevision"] == before["revision"],
                "The award record changed", "AWARDS_RECORD_CONFLICT", 409)
        row = {**copy.deepcopy(before), "revision": before["revision"] + 1, "updatedAt": context["at"],
               "updatedBy": actor, "archived": True, "archiveReason": short(change["reason"], "Archive reason", 8000)}
        row.pop("sha256", None)
        row["sha256"] = digest(row)
        idx[name][ident] = row
    # Corrections link only complete prior editions, preserving a finite history.
    for name, ident in changed:
        row = idx[name][ident]
        if row["supersedesId"]:
            require(row["supersedesId"] != ident, "An award record cannot supersede itself")
            prior = _row(idx, name, row["supersedesId"], final=True)
            seen = {ident}
            while prior:
                require(prior["id"] not in seen, "Award correction history contains a cycle")
                seen.add(prior["id"])
                prior = idx[name].get(prior.get("supersedesId"))
        if not row.get("publication"):
            _validate(idx, pidx, name, row)
    # A batch may contain the complete round→application→decision chain. Resolve
    # dependencies in the existing preparation, without another transaction.
    pending = list(freezing)
    while pending:
        advanced = False
        for name, ident in list(pending):
            row = idx[name][ident]
            if any(not idx[target].get(key, {}).get("publication") for target, key in _award_links(name, row)):
                continue
            _validate(idx, pidx, name, row, freezing=True, actor=actor)
            row["publication"] = _publish(idx, pidx, name, row, context=context,
                                         entities=entities, financial=financial, object_info=object_info)
            row.pop("sha256", None)
            row["sha256"] = digest(row)
            pending.remove((name, ident))
            advanced = True
        require(advanced, "Finish the selected original dependencies before recording this award step",
                "AWARDS_DEPENDENCY_EDITION", 409)
    model["records"] = {name: sorted(rows.values(), key=lambda row: row["id"]) for name, rows in idx.items()}
    require(sum(len(rows) for rows in model["records"].values()) <= 100000,
            "The complete award administration exceeds 100,000 records")
    require(len(canonical(model)) <= 32 * 1024 * 1024, "The complete awards definition exceeds 32 MiB")
    return model


def application_position(model, application_id):
    idx = indexes(model)
    application = _row(idx, "applications", application_id)
    selected = {name: [] for name in COLLECTIONS if name not in ("rounds", "applications")}
    for name in selected:
        for row in model["records"][name]:
            if _application(idx, name, row)["id"] == application_id:
                selected[name].append(copy.deepcopy(row))
    calculations = [{"assessmentId": row["id"], "assessmentRevision": row["revision"],
                     "calculation": copy.deepcopy(row["publication"]["calculation"])}
                    for row in selected["assessments"] if row.get("publication")]
    return {"application": copy.deepcopy(application),
            "round": copy.deepcopy(_row(idx, "rounds", application["roundId"])),
            **selected, "calculations": calculations,
            "counts": {name: len(rows) for name, rows in selected.items()}}


def round_position(model, round_id):
    idx = indexes(model)
    record = _row(idx, "rounds", round_id)
    selected = {name: [] for name in COLLECTIONS if name != "rounds"}
    for name in selected:
        for row in model["records"][name]:
            if _round(idx, name, row)["id"] == round_id:
                selected[name].append(copy.deepcopy(row))
    return {"record": copy.deepcopy(record), "queues": selected,
            "counts": {name: len(rows) for name, rows in selected.items()}}


def derive_awards(model, programme=None):
    require(model["schema"] == AWARDS_SCHEMA, "The retained awards schema differs")
    tables = {"awards_" + name: copy.deepcopy(model["records"][name]) for name in COLLECTIONS}
    idx = indexes(model)
    counts = {row["id"]: {name: 0 for name in COLLECTIONS if name not in ("rounds", "applications")}
              for row in model["records"]["applications"]}
    for name in COLLECTIONS:
        if name not in ("rounds", "applications"):
            for row in model["records"][name]:
                counts[_application(idx, name, row)["id"]][name] += 1
    tables["awards_positions"] = [{"id": row["id"], "roundId": row["roundId"], "status": row["status"],
        "counts": counts[row["id"]]} for row in model["records"]["applications"]]
    tables["awards_calculations"] = [{"id": row["id"], "assessmentId": row["id"],
        "assessmentRevision": row["revision"], "calculation": copy.deepcopy(row["publication"]["calculation"])}
        for row in model["records"]["assessments"] if row.get("publication")]
    return tables


def awards_objects(history):
    selected = {}
    for portfolio in history:
        model = portfolio["definition"].get("awards")
        if model is None:
            continue
        for rows in model["records"].values():
            for row in rows:
                for descriptor in row.get("publication", {}).get("documents", []):
                    value = {"sha256": descriptor["sha256"], "bytes": descriptor["bytes"]}
                    prior = selected.get(value["sha256"])
                    require(prior is None or prior == value, "An award document has inconsistent original lengths")
                    selected[value["sha256"]] = value
    return selected


def awards_schema():
    return {"schema": AWARDS_SCHEMA, "collections": list(COLLECTIONS), "tables": list(AWARDS_TABLES),
        "fields": {name: {**COMMON, **fields} for name, fields in FIELDS.items()},
        "required": REQUIRED, "nested": NESTED, "settings": {},
        "edits": "Original portfolio.save payload.awards, with original portfolio and awards revision guards.",
        "attribution": "Actor and independently named assessors are recorded; the existing staff layer authenticates and authorizes them.",
        "frozen": "Recorded editions retain exact contributor, criteria, evidence and calculation snapshots. Corrections are following records.",
        "financial": "Original external financial rows and their native grouped meaning; no payment initiation or new ledger.",
        "policy": "Operator-configured criteria and arithmetic only; no fund-specific weighting, quorum or approval policy."}
