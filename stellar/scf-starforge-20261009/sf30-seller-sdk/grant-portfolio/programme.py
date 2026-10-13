"""MIT. Project, grant and results records in the original portfolio revision."""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, DecimalException, MAX_EMAX, MIN_EMIN, ROUND_HALF_EVEN, localcontext
from urllib.parse import urlsplit
import datetime as dt
import re

from domain import canonical, checked_ref, decimal_amount, digest, financial_totals, identifier, require, sha, shape, short

PROGRAMME_SCHEMA = "stellar-forge.grant-programme.v1"
COLLECTIONS = ("nodes", "partners", "grants", "milestones", "indicators", "observations",
               "risks", "issues", "documents", "reports", "closures")
PROGRAMME_TABLES = tuple("programme_" + name for name in COLLECTIONS) + (
    "programme_bindings", "programme_positions", "programme_results")
DOCUMENT_KINDS = ("alignment-evidence", "validation-minutes", "needs-assessment", "stakeholder-map", "lessons", "theory-of-change",
    "concept-note", "mel-plan", "data-management-plan", "risk-ser-plan",
    "communications-plan", "workplan-budget", "donor-due-diligence", "agreement",
    "amendment", "minutes", "report", "audit", "closure", "other")
META = {"id", "revision", "createdAt", "updatedAt", "updatedBy", "sha256",
        "archived", "archiveReason"}
COMMON = {"notes": "text", "sourceRefs": "sources"}
FIELDS = {
    "nodes": {"kind": ("portfolio", "programme", "project"), "code": "short", "title": "short",
        "parentId": "id?", "owner": "short", "division": "short?", "description": "text",
        "countries": "strings", "startDate": "date?", "endDate": "date?",
        "dataManagementRequired": "bool?", "dataManagementBasis": "text",
        "corporateProjectReference": "short?", "corporateRegistrationMode": ("unrecorded", "manual", "api"),
        "corporateRegistrationEvidence": "ids", "hrReference": "short?"},
    "partners": {"code": "short", "name": "short", "organizationIdentifier": "short?",
        "roles": "strings", "country": "short?", "contactName": "short?", "contactEmail": "email?",
        "dueDiligenceDocumentIds": "ids", "description": "text"},
    "grants": {"code": "short", "title": "short", "projectId": "id", "parentGrantId": "id?",
        "recipientId": "id?", "applicantIds": "ids", "owner": "short",
        "agreementId": "id?", "amendmentIds": "ids", "dueDiligenceDocumentIds": "ids",
        "startDate": "date?", "endDate": "date?", "award": "money?", "purpose": "text"},
    "milestones": {"nodeId": "id", "grantId": "id?", "code": "short", "title": "short",
        "owner": "short", "startDate": "date?", "dueDate": "date", "completedDate": "date?",
        "status": ("planned", "in-progress", "submitted", "complete", "cancelled"),
        "progress": "percent", "dependencyIds": "ids", "documentIds": "ids", "description": "text"},
    "indicators": {"nodeId": "id", "grantId": "id?", "code": "short", "title": "short",
        "owner": "short", "resultLevel": ("input", "output", "outcome", "impact"),
        "parentIndicatorId": "id?", "unit": "short", "aggregation": ("sum", "latest", "none"),
        "direction": ("increase", "decrease", "maintain"), "baseline": "points",
        "targets": "points", "methodology": "text", "documentIds": "ids"},
    "observations": {"indicatorId": "id", "periodStart": "date", "periodEnd": "date",
        "reportedDate": "date", "value": "decimal?", "dimensions": "dimensions",
        "status": ("reported", "withdrawn"), "documentIds": "ids", "collector": "short"},
    "risks": {"nodeId": "id", "grantId": "id?", "title": "short", "category": "short",
        "owner": "short", "likelihood": "positive", "impact": "positive",
        "residualLikelihood": "positive?", "residualImpact": "positive?",
        "reviewDate": "date", "status": ("open", "mitigating", "closed"),
        "mitigation": "text", "documentIds": "ids", "description": "text"},
    "issues": {"nodeId": "id", "grantId": "id?", "title": "short", "owner": "short",
        "severity": ("low", "medium", "high", "critical"), "dueDate": "date",
        "status": ("open", "in-progress", "resolved", "closed"),
        "action": "text", "resolution": "text", "documentIds": "ids"},
    "documents": {"nodeId": "id", "grantId": "id?", "title": "short",
        "category": DOCUMENT_KINDS, "owner": "short", "uri": "uri?", "object": "file?",
        "sourceEdition": "short?", "documentDate": "date?", "replacesId": "id?",
        "status": ("working", "current", "superseded"), "description": "text", "content": "text"},
    "reports": {"nodeId": "id", "grantId": "id?", "title": "short", "owner": "short",
        "periodStart": "date", "periodEnd": "date", "dueDate": "date",
        "status": ("draft", "submitted", "acknowledged"), "submittedDate": "date?",
        "recipient": "short?", "documentIds": "ids", "narrative": "text"},
    "closures": {"nodeId": "id", "grantId": "id?", "title": "short", "owner": "short",
        "closedDate": "date", "documentIds": "ids", "lessonDocumentIds": "ids",
        "remainingIssueIds": "ids", "summary": "text", "status": ("prepared", "recorded")},
}
REQUIRED = {
    "nodes": ("kind", "code", "title", "owner"),
    "partners": ("code", "name"),
    "grants": ("code", "title", "projectId", "owner"),
    "milestones": ("nodeId", "code", "title", "owner", "dueDate", "status"),
    "indicators": ("nodeId", "code", "title", "owner", "resultLevel", "unit", "aggregation", "direction"),
    "observations": ("indicatorId", "periodStart", "periodEnd", "reportedDate", "status", "collector"),
    "risks": ("nodeId", "title", "category", "owner", "likelihood", "impact", "reviewDate", "status"),
    "issues": ("nodeId", "title", "owner", "severity", "dueDate", "status"),
    "documents": ("nodeId", "title", "category", "owner", "status"),
    "reports": ("nodeId", "title", "owner", "periodStart", "periodEnd", "dueDate", "status"),
    "closures": ("nodeId", "title", "owner", "closedDate", "status"),
}
SETTINGS = {"asOf": "date", "riskScaleMaximum": "positive", "highRiskScore": "positive"}
GENERATED = {"reports": {"publication"}, "closures": {"positionAtRecording"}}
from donor_reporting import FIELDS as DONOR_FIELDS
FIELDS["reports"].update(DONOR_FIELDS)


def date(value):
    require(isinstance(value, str) and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)),
            "Use a complete ISO calendar date")
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        require(False, "Invalid calendar date")
    return value


# Exact arithmetic is scoped to programme observations and target variances.
# Original decimal strings remain unchanged in their source records.
PROGRAMME_EXACT_MAX_DIGITS = 8192
PROGRAMME_EXACT_MAX_TERMS = 100000
PROGRAMME_DECIMAL_MAX_EXPONENT = 999999


def programme_decimal(value, name):
    require(isinstance(value, str) and len(value) <= 128,
            name + " requires its original decimal string, up to 128 characters")
    number = decimal_amount(value)
    require(number is not None, name + " requires an original decimal string")
    exponent = number.as_tuple().exponent
    require(-PROGRAMME_DECIMAL_MAX_EXPONENT <= exponent <= PROGRAMME_DECIMAL_MAX_EXPONENT
            and -PROGRAMME_DECIMAL_MAX_EXPONENT <= number.adjusted() <= PROGRAMME_DECIMAL_MAX_EXPONENT,
            name + " exceeds the supported decimal exponent range [-999999, 999999]",
            "PROGRAMME_DECIMAL_RANGE")
    return number


def programme_decimal_context(context, precision=128):
    require(type(precision) is int and 1 <= precision <= PROGRAMME_EXACT_MAX_DIGITS,
            "Programme exact arithmetic exceeds its 8192-digit span",
            "PROGRAMME_DECIMAL_RANGE")
    context.prec = precision
    context.Emin = MIN_EMIN
    context.Emax = MAX_EMAX
    context.rounding = ROUND_HALF_EVEN
    context.capitals = 1
    context.clamp = 0
    context.clear_flags()
    # No rounded digits, exponent clamping, underflow or other decimal signal
    # can silently change a result. This never modifies the caller's context.
    for signal in context.traps:
        context.traps[signal] = True


def _programme_exact_arithmetic(numbers, *, subtract=False):
    numbers = tuple(numbers)
    require(1 <= len(numbers) <= PROGRAMME_EXACT_MAX_TERMS
            and all(isinstance(number, Decimal) and number.is_finite() for number in numbers)
            and (not subtract or len(numbers) == 2),
            "Select the complete finite programme arithmetic operands",
            "PROGRAMME_DECIMAL_RANGE")
    components = [number.as_tuple() for number in numbers]
    lowest = min(value.exponent for value in components)
    nonzero = [value for number, value in zip(numbers, components) if not number.is_zero()]
    highest = max((value.exponent + len(value.digits) - 1 for value in nonzero), default=lowest)
    # Expressing every operand at the lowest original quantum needs
    # highest-lowest+1 coefficient digits. ceil(log10(nonzero terms)) more
    # covers every intermediate sum, irrespective of cancellation or ordering.
    # Zero operands preserve their quantum but do not create a carry.
    carry = len(str(len(nonzero) - 1)) if len(nonzero) > 1 else 0
    precision = max(1, highest - lowest + 1 + carry)
    require(precision <= PROGRAMME_EXACT_MAX_DIGITS,
            "Programme operands need an exact aligned span of " + str(precision)
            + " digits including carry; the supported maximum is 8192",
            "PROGRAMME_DECIMAL_RANGE")
    try:
        with localcontext() as context:
            programme_decimal_context(context, precision)
            if subtract:
                result = context.subtract(numbers[0], numbers[1])
            else:
                # Starting with the first original operand avoids inventing
                # Decimal(0)'s exponent zero for a scientific-notation sum.
                result = numbers[0]
                for number in numbers[1:]:
                    result = context.add(result, number)
            return str(result)
    except DecimalException as error:
        require(False,
                "Programme exact arithmetic could not retain every original digit ("
                + type(error).__name__ + "); no programme result was committed",
                "PROGRAMME_DECIMAL_INEXACT")


def programme_exact_sum(values):
    return _programme_exact_arithmetic(
        programme_decimal(value, "Observed result") for value in values)


def programme_exact_variance(actual, target):
    # actual is this projection's exact generated result and may contain more
    # than an original record's 128 characters. The source target keeps its
    # original normalizer; both operands share the same bounded exact kernel.
    return _programme_exact_arithmetic(
        (Decimal(actual), programme_decimal(target, "Result target")), subtract=True)


def normalize(value, spec, name):
    if isinstance(spec, tuple):
        require(value in spec, name + " must be one of: " + ", ".join(spec))
        return value
    optional = spec.endswith("?")
    spec = spec.rstrip("?")
    if value is None and optional:
        return None
    if spec in ("short", "text"):
        return short(value, name, 240 if spec == "short" else 16000, empty=spec == "text")
    if spec == "donor-selection":
        from donor_reporting import normalize_selection
        return normalize_selection(value)
    if spec == "id":
        return identifier(value)
    if spec == "date":
        return date(value)
    if spec == "bool":
        require(type(value) is bool, name + " must be true or false")
        return value
    if spec == "positive":
        require(type(value) is int and 1 <= value <= 1000, name + " must be a positive integer up to 1000")
        return value
    if spec in ("decimal", "percent"):
        number = programme_decimal(value, name)
        if spec == "percent":
            require(0 <= number <= 100, name + " must be between zero and one hundred")
        return value
    if spec in ("ids", "strings"):
        require(isinstance(value, list) and len(value) <= 2000, name + " must be a complete list")
        result = [identifier(item) if spec == "ids" else short(item, name, 240) for item in value]
        require(len(set(result)) == len(result), name + " repeats a value")
        return sorted(result)
    if spec == "dimensions":
        require(isinstance(value, dict) and len(value) <= 32, "Use up to 32 named result dimensions")
        result = {}
        for key, item in sorted(value.items()):
            dimension = short(key, "Dimension name", 120)
            require(dimension not in result, "Result dimensions repeat a name after trimming")
            result[dimension] = short(item, "Dimension value", 500)
        return result
    if spec == "sources":
        require(isinstance(value, list) and len(value) <= 256, "Select up to 256 source records")
        result = []
        for ref in value:
            shape(ref, ("sourceId", "entityKey", "sha256"), ("sourceId", "entityKey", "sha256"))
            result.append({key: sha(ref[key]) for key in ("sourceId", "entityKey", "sha256")})
        require(len({(r["sourceId"], r["entityKey"]) for r in result}) == len(result),
                "A record repeats the same source entity")
        return sorted(result, key=lambda item: (item["sourceId"], item["entityKey"]))
    if spec == "money":
        shape(value, ("value", "currency"), ("value", "currency"))
        require(isinstance(value["currency"], str) and bool(re.fullmatch(r"[A-Z]{3}", value["currency"])),
                "Use the original three-letter currency")
        return {"value": normalize(value["value"], "decimal", name), "currency": value["currency"]}
    if spec == "points":
        require(isinstance(value, list) and len(value) <= 1000, "Use complete dated baseline or target points")
        result, seen = [], set()
        for point in value:
            shape(point, ("date", "value", "dimensions", "documentIds"), ("date", "value"))
            item = {"date": date(point["date"]), "value": normalize(point["value"], "decimal", name),
                    "dimensions": normalize(point.get("dimensions", {}), "dimensions", name),
                    "documentIds": normalize(point.get("documentIds", []), "ids", name)}
            key = (item["date"], digest(item["dimensions"]))
            require(key not in seen, "A baseline or target repeats its date and dimensions")
            seen.add(key)
            result.append(item)
        return sorted(result, key=lambda item: (item["date"], digest(item["dimensions"])))
    if spec == "uri":
        value = short(value, name, 4096)
        parsed = urlsplit(value)
        require(parsed.scheme == "https" and parsed.netloc and not parsed.username and not parsed.password,
                "Document links must be complete HTTPS URLs")
        return value
    if spec == "email":
        value = short(value, name, 254)
        require(bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value)), "Use a complete contact email")
        return value
    if spec == "file":
        shape(value, ("sha256", "bytes", "filename", "contentType"),
              ("sha256", "bytes", "filename", "contentType"))
        sha(value["sha256"])
        require(type(value["bytes"]) is int and 0 < value["bytes"] <= 4 * 1024 ** 3,
                "Select a retained document of one byte to 4 GiB")
        require(isinstance(value["filename"], str) and
                bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,199}", value["filename"])),
                "Use a simple complete document filename")
        require(isinstance(value["contentType"], str) and
                bool(re.fullmatch(r"[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*",
                                 value["contentType"])), "Use a media type without parameters")
        return dict(value)
    raise ValueError("Unknown programme field type: " + spec)


def defaults(specs):
    result = {}
    for key, spec in specs.items():
        if spec in ("ids", "strings", "sources", "points"):
            result[key] = []
        elif spec == "text":
            result[key] = ""
        elif spec == "dimensions":
            result[key] = {}
        elif isinstance(spec, str) and spec.endswith("?") and spec != "donor-selection?":
            # Original requests without this later optional selection must replay
            # to their exact original report body and complete portfolio snapshot.
            result[key] = None
    return result


def indexes(model):
    return {name: {row["id"]: row for row in model["records"][name]} for name in COLLECTIONS}


def record_ref(collection, row):
    return {"collection": collection, "id": row["id"], "revision": row["revision"], "sha256": row["sha256"]}


def descendants(index, ident, children=None):
    if children is None:
        children = defaultdict(list)
        for row in index["nodes"].values():
            children[row.get("parentId")].append(row["id"])
    output, pending = set(), [ident]
    while pending:
        value = pending.pop()
        if value in output:
            continue
        output.add(value)
        pending.extend(children.get(value, ()))
    return output


def ancestors(rows, ident, field):
    result = set()
    while ident is not None and ident not in result:
        result.add(ident)
        ident = rows[ident].get(field)
    return result


def record_scope(index, collection, row):
    if collection == "nodes":
        return row["id"], None
    if collection == "grants":
        return row["projectId"], row["id"]
    if collection == "observations":
        indicator = index["indicators"][row["indicatorId"]]
        return indicator["nodeId"], indicator.get("grantId")
    return row.get("nodeId"), row.get("grantId")


def evidence_in_scope(index, collection, row, document):
    node_id, grant_id = record_scope(index, collection, row)
    # A partner is shared across the portfolio. Its diligence can cover several
    # projects; each project/grant still selects its own scoped evidence.
    if node_id is None:
        return collection == "partners"
    if document["nodeId"] not in ancestors(index["nodes"], node_id, "parentId"):
        return False
    if document.get("grantId") is None:
        return True
    return grant_id is not None and document["grantId"] in ancestors(
        index["grants"], grant_id, "parentGrantId")


def _acyclic(rows, field, label):
    complete = set()
    for ident in rows:
        visiting, pending = set(), [(ident, False)]
        while pending:
            current, leaving = pending.pop()
            if leaving:
                visiting.discard(current)
                complete.add(current)
                continue
            if current in complete:
                continue
            require(current not in visiting, label + " cannot contain a cycle", "PROGRAMME_RELATION_CYCLE", 409)
            visiting.add(current)
            pending.append((current, True))
            targets = rows[current].get(field)
            targets = targets if isinstance(targets, list) else [targets] if targets else []
            pending.extend((target, False) for target in targets)


def validate_relations(model):
    idx = indexes(model)
    def link(collection, ident, label, optional=False):
        if ident is None and optional:
            return None
        require(ident in idx[collection], label + " selects a missing " + collection + " record",
                "PROGRAMME_RELATION_MISSING", 409)
        return idx[collection][ident]
    for name, rows in idx.items():
        codes = {}
        for row in rows.values():
            if row.get("code"):
                key = row["code"].casefold()
                require(key not in codes, "The " + name + " register repeats code " + row["code"],
                        "PROGRAMME_CODE_CONFLICT", 409)
                codes[key] = row["id"]
            for start, end in (("startDate", "endDate"), ("startDate", "dueDate"),
                               ("periodStart", "periodEnd")):
                require(not row.get(start) or not row.get(end) or row[start] <= row[end],
                        "The record end precedes its start")
            if "nodeId" in row:
                link("nodes", row["nodeId"], "Scope")
            if row.get("grantId"):
                grant = link("grants", row["grantId"], "Grant scope")
                require(grant["projectId"] == row["nodeId"], "The grant belongs to another project",
                        "PROGRAMME_SCOPE_CONFLICT", 409)
            for field in ("documentIds", "amendmentIds", "dueDiligenceDocumentIds",
                          "lessonDocumentIds", "corporateRegistrationEvidence"):
                for ident in row.get(field, []):
                    link("documents", ident, field)
    for row in idx["nodes"].values():
        parent = link("nodes", row.get("parentId"), "Parent node", True)
        require(row["kind"] != "portfolio" or parent is None, "A portfolio node is a hierarchy root")
        require(parent is None or parent["kind"] != "project" or row["kind"] == "project",
                "A project parent can contain only another project")
        require(row["kind"] == "project" or not row.get("corporateProjectReference"),
                "Corporate project registration belongs to a project")
        if row.get("corporateProjectReference"):
            require(row.get("corporateRegistrationMode") in {"manual", "api"} and
                    row.get("corporateRegistrationEvidence"),
                    "Retain the corporate registration method and its evidence")
    _acyclic(idx["nodes"], "parentId", "The programme hierarchy")
    for row in idx["grants"].values():
        project = link("nodes", row["projectId"], "Grant project")
        require(project["kind"] == "project", "A grant must select an original project")
        parent = link("grants", row.get("parentGrantId"), "Parent grant", True)
        require(parent is None or parent["projectId"] == row["projectId"],
                "A subgrant and its parent must select the same project")
        link("partners", row.get("recipientId"), "Grantee", True)
        for ident in row.get("applicantIds", []):
            link("partners", ident, "Applicant")
        agreement = link("documents", row.get("agreementId"), "Grant agreement", True)
        require(agreement is None or agreement["category"] == "agreement",
                "Select an agreement document")
    _acyclic(idx["grants"], "parentGrantId", "The grant hierarchy")
    for row in idx["milestones"].values():
        for ident in row.get("dependencyIds", []):
            target = link("milestones", ident, "Milestone dependency")
            require(target["nodeId"] == row["nodeId"], "Milestone dependencies must select the same project")
        if row["status"] == "complete":
            require(row.get("completedDate") and decimal_amount(row["progress"]) == 100,
                    "A completed milestone needs its completion date and 100 percent progress")
        else:
            require(not row.get("completedDate"), "Only a complete milestone has a completion date")
    _acyclic(idx["milestones"], "dependencyIds", "Milestone dependencies")
    for row in idx["indicators"].values():
        parent = link("indicators", row.get("parentIndicatorId"), "Parent result", True)
        require(parent is None or parent["nodeId"] == row["nodeId"],
                "Linked result levels must select the same project")
        for field in ("baseline", "targets"):
            for point in row[field]:
                for ident in point["documentIds"]:
                    link("documents", ident, "Baseline or target evidence")
    _acyclic(idx["indicators"], "parentIndicatorId", "The results chain")
    observation_keys = set()
    for row in idx["observations"].values():
        link("indicators", row["indicatorId"], "Observed indicator")
        if row["archived"] or row["status"] == "withdrawn":
            continue
        key = (row["indicatorId"], row["periodStart"], row["periodEnd"], digest(row["dimensions"]))
        require(key not in observation_keys, "Update the original observation for this period and dimensions",
                "PROGRAMME_OBSERVATION_CONFLICT", 409)
        observation_keys.add(key)
    maximum = model["settings"]["riskScaleMaximum"]
    for row in idx["risks"].values():
        for key in ("likelihood", "impact", "residualLikelihood", "residualImpact"):
            require(row.get(key) is None or row[key] <= maximum, "Risk value exceeds the selected scale")
        require((row.get("residualLikelihood") is None) == (row.get("residualImpact") is None),
                "Retain both residual risk dimensions")
    for row in idx["issues"].values():
        require(row["status"] not in {"resolved", "closed"} or row["resolution"].strip(),
                "A resolved issue needs its resolution")
    for row in idx["documents"].values():
        require(row.get("uri") or row.get("object") or row["content"].strip(),
                "Retain the structured record content, document link or original uploaded bytes")
        replaced = link("documents", row.get("replacesId"), "Earlier document edition", True)
        require(replaced is None or (replaced["nodeId"], replaced.get("grantId")) ==
                (row["nodeId"], row.get("grantId")), "Document editions must preserve their project/grant scope")
    _acyclic(idx["documents"], "replacesId", "Document editions")
    for row in idx["reports"].values():
        require(row["status"] == "draft" or row.get("submittedDate"),
                "A submitted report needs its original submission date")
    for name, rows in idx.items():
        for row in rows.values():
            document_ids = set()
            for field in ("documentIds", "amendmentIds", "dueDiligenceDocumentIds",
                          "lessonDocumentIds", "corporateRegistrationEvidence"):
                document_ids.update(row.get(field, ()))
            if row.get("agreementId"):
                document_ids.add(row["agreementId"])
            if name == "indicators":
                for point in row["baseline"] + row["targets"]:
                    document_ids.update(point["documentIds"])
            for ident in document_ids:
                document = link("documents", ident, "Evidence")
                require(evidence_in_scope(idx, name, row, document),
                        "The evidence belongs to another project or grant",
                        "PROGRAMME_SCOPE_CONFLICT", 409)
    for row in idx["closures"].values():
        selected_nodes = descendants(idx, row["nodeId"])
        for ident in row["remainingIssueIds"]:
            issue = link("issues", ident, "Remaining closure action")
            require(issue["nodeId"] in selected_nodes and
                    (row.get("grantId") is None or issue.get("grantId") is not None and
                     row["grantId"] in ancestors(idx["grants"], issue["grantId"], "parentGrantId")),
                    "A remaining closure action must belong to the selected project or grant",
                    "PROGRAMME_SCOPE_CONFLICT", 409)


    from donor_reporting import validate_reports
    validate_reports(model)


def source_bindings(model, entities):
    lookup = {(row["sourceId"], row["entityKey"]): row for row in entities}
    output = []
    for collection in COLLECTIONS:
        for row in model["records"][collection]:
            for selected in row["sourceRefs"]:
                current = lookup.get((selected["sourceId"], selected["entityKey"]))
                status = "CURRENT" if current and current["sha256"] == selected["sha256"] else (
                    "CHANGED" if current else "OUTSIDE_SELECTION")
                output.append({"id": digest([collection, row["id"], selected]),
                    "collection": collection, "recordId": row["id"], "recordRevision": row["revision"],
                    "recordSha256": row["sha256"], **selected, "status": status,
                    "title": row.get("title", row.get("name", row["id"])), "archived": row["archived"],
                    "current": None if current is None else
                        {key: current[key] for key in ("sourceId", "entityKey", "sha256")}})
    return sorted(output, key=lambda row: row["id"])


def indicator_results(model):
    idx = indexes(model)
    output, cutoff = [], model["settings"]["asOf"]
    observed_by_indicator = defaultdict(list)
    for observed in idx["observations"].values():
        if not observed["archived"] and observed["status"] == "reported" and observed["periodEnd"] <= cutoff:
            observed_by_indicator[observed["indicatorId"]].append(observed)
    with localcontext() as context:
        programme_decimal_context(context)
        for indicator in idx["indicators"].values():
            groups = defaultdict(list)
            for observed in observed_by_indicator[indicator["id"]]:
                groups[digest(observed["dimensions"])].append(observed)
            for point in indicator["targets"] + indicator["baseline"]:
                groups.setdefault(digest(point["dimensions"]), [])
            if not groups:
                groups[digest({})] = []
            for key, observations in sorted(groups.items()):
                observations.sort(key=lambda row: (row["periodEnd"], row["periodStart"], row["id"]))
                points = [p for p in indicator["targets"] + indicator["baseline"]
                          if digest(p["dimensions"]) == key]
                dimensions = observations[0]["dimensions"] if observations else points[0]["dimensions"] if points else {}
                relevant = observations
                state, actual = "NO_OBSERVATIONS", None
                if observations and indicator["aggregation"] == "none":
                    state = "SEPARATE_OBSERVATIONS"
                elif observations:
                    if indicator["aggregation"] == "latest":
                        latest = observations[-1]["periodEnd"]
                        relevant = [row for row in observations if row["periodEnd"] == latest]
                        state = "AMBIGUOUS_LATEST_PERIOD" if len(relevant) > 1 else "CURRENT"
                    else:
                        relevant = sorted(observations, key=lambda row: (row["periodStart"], row["periodEnd"]))
                        overlap = any(a["periodEnd"] >= b["periodStart"] for a, b in zip(relevant, relevant[1:]))
                        state = "OVERLAPPING_PERIODS" if overlap else "CURRENT"
                    if state == "CURRENT":
                        if any(row["value"] is None for row in relevant):
                            state = "MISSING_VALUES"
                        else:
                            actual = programme_exact_sum(row["value"] for row in relevant)
                target_points = [p for p in indicator["targets"] if digest(p["dimensions"]) == key and p["date"] <= cutoff]
                target = target_points[-1] if target_points else None
                baseline_points = [p for p in indicator["baseline"] if digest(p["dimensions"]) == key and p["date"] <= cutoff]
                baseline = baseline_points[-1] if baseline_points else None
                output.append({"id": digest([indicator["id"], dimensions]), "indicatorId": indicator["id"],
                    "nodeId": indicator["nodeId"], "grantId": indicator.get("grantId"),
                    "title": indicator["title"], "unit": indicator["unit"], "resultLevel": indicator["resultLevel"],
                    "aggregation": indicator["aggregation"], "direction": indicator["direction"],
                    "dimensions": dimensions, "asOf": cutoff, "actual": actual,
                    "baseline": baseline, "target": target,
                    "variance": None if actual is None or target is None else programme_exact_variance(actual, target["value"]),
                    "status": "ARCHIVED" if indicator["archived"] else state,
                    "observationIds": [row["id"] for row in relevant],
                    "observationRefs": [record_ref("observations", row) for row in relevant]})
    return sorted(output, key=lambda row: row["id"])


def projection_context(model, entities, financial):
    idx = indexes(model)
    node_children, grant_children, financial_by_entity = defaultdict(list), defaultdict(list), defaultdict(list)
    for row in idx["nodes"].values():
        node_children[row.get("parentId")].append(row["id"])
    for row in idx["grants"].values():
        grant_children[row.get("parentGrantId")].append(row["id"])
    for row in financial:
        for key in sorted({row["entityKey"], *row.get("relatedEntityKeys", [])}):
            financial_by_entity[(row["sourceId"], key)].append(row)
    return {"index": idx, "nodeChildren": node_children, "grantChildren": grant_children,
            "bindings": source_bindings(model, entities), "results": indicator_results(model),
            "financialByEntity": financial_by_entity}


def position(model, node_id, entities, financial, grant_id=None, *, prepared=None):
    prepared = prepared if prepared is not None else projection_context(model, entities, financial)
    idx, cutoff = prepared["index"], model["settings"]["asOf"]
    require(node_id in idx["nodes"], "Select an original programme node", "NOT_FOUND", 404)
    selected_nodes = descendants(idx, node_id, prepared["nodeChildren"])
    selected_grants = {row["id"] for row in idx["grants"].values() if row["projectId"] in selected_nodes}
    if grant_id is not None:
        require(grant_id in selected_grants, "Select a grant in this project", "PROGRAMME_SCOPE_CONFLICT", 409)
        selected_grants, pending = set(), [grant_id]
        while pending:
            ident = pending.pop()
            if ident not in selected_grants:
                selected_grants.add(ident)
                pending.extend(prepared["grantChildren"].get(ident, ()))
    def scoped(row):
        if row["archived"]:
            return False
        return row.get("nodeId") in selected_nodes and (
            grant_id is None or row.get("grantId") in selected_grants)
    selected_refs = {(r["sourceId"], r["entityKey"]) for r in prepared["bindings"]
        if r["status"] == "CURRENT" and (
            r["collection"] == "nodes" and grant_id is None and r["recordId"] in selected_nodes
            or r["collection"] == "grants" and r["recordId"] in selected_grants)}
    included, seen = [], set()
    for ref in sorted(selected_refs):
        for row in prepared["financialByEntity"].get(ref, ()):
            key = (row["sourceId"], row["rowKey"])
            if key not in seen:
                included.append(row)
                seen.add(key)
    milestones = [row for row in idx["milestones"].values() if scoped(row)]
    issues = [row for row in idx["issues"].values() if scoped(row)]
    risks = [row for row in idx["risks"].values() if scoped(row)]
    reports = [row for row in idx["reports"].values() if scoped(row)]
    results = [row for row in prepared["results"] if row["nodeId"] in selected_nodes and (
        grant_id is None or row.get("grantId") in selected_grants)]
    bindings = [row for row in prepared["bindings"] if
        row["collection"] == "nodes" and grant_id is None and row["recordId"] in selected_nodes or
        row["collection"] == "grants" and row["recordId"] in selected_grants]
    return {"id": digest([node_id, grant_id]), "nodeId": node_id, "grantId": grant_id,
        "title": idx["grants"][grant_id]["title"] if grant_id else idx["nodes"][node_id]["title"],
        "asOf": cutoff, "nodeIds": sorted(selected_nodes), "grantIds": sorted(selected_grants),
        "milestones": len(milestones), "completedMilestones": sum(row["status"] == "complete" for row in milestones),
        "overdueMilestoneIds": sorted(row["id"] for row in milestones
            if row["status"] not in {"complete", "cancelled"} and row["dueDate"] < cutoff),
        "openIssueIds": sorted(row["id"] for row in issues if row["status"] not in {"resolved", "closed"}),
        "overdueIssueIds": sorted(row["id"] for row in issues
            if row["status"] not in {"resolved", "closed"} and row["dueDate"] < cutoff),
        "highRiskIds": sorted(row["id"] for row in risks if row["status"] != "closed"
            and row["likelihood"] * row["impact"] >= model["settings"]["highRiskScore"]),
        "overdueReportIds": sorted(row["id"] for row in reports if row["status"] == "draft" and row["dueDate"] < cutoff),
        "sourceBindings": bindings, "financialRowRefs": [
            {"sourceId": row["sourceId"], "rowKey": row["rowKey"], "sha256": digest(row)}
            for row in sorted(included, key=lambda row: (row["sourceId"], row["rowKey"]))],
        "financialTotals": financial_totals(included), "financialRecordCount": len(included),
        "financialCoverage": "NO_SOURCE_BINDINGS" if not bindings else "SOURCE_REVIEW_REQUIRED"
            if any(row["status"] != "CURRENT" for row in bindings) else "CURRENT_SELECTION",
        "results": results}


def qa_pack(model, project_id, entities, financial):
    idx = indexes(model)
    require(project_id in idx["nodes"] and idx["nodes"][project_id]["kind"] == "project",
            "Select an original project for its QA workshop", "NOT_FOUND", 404)
    project = idx["nodes"][project_id]
    documents = [row for row in idx["documents"].values()
                 if row["nodeId"] == project_id and not row["archived"] and row["status"] == "current"]
    requirements = [
        ("P1.02", "alignment-evidence", True), ("P1.03", "validation-minutes", True),
        ("P1.04", "needs-assessment", True), ("P1.04", "stakeholder-map", True),
        ("P1.04b", "lessons", True), ("P1.05", "theory-of-change", True),
        ("P1.06", "concept-note", True), ("P1.07a", "mel-plan", True),
        ("P1.07b", "data-management-plan", project.get("dataManagementRequired")),
        ("P1.08", "risk-ser-plan", True), ("P1.08", "communications-plan", True),
        ("P1.09", "workplan-budget", True), ("P1.10", "donor-due-diligence", True)]
    checks = []
    for source_step, category, required in requirements:
        matching = [row for row in documents if row["category"] == category]
        checks.append({"id": source_step + ":" + category, "sourceStep": source_step,
            "category": category, "required": required,
            "status": "PRESENT" if matching else "POLICY_SELECTION_REQUIRED" if required is None
                else "MISSING" if required else "OPTIONAL",
            "documentRefs": [record_ref("documents", row) for row in matching]})
    relevant = {name: [record_ref(name, row) for row in idx[name].values()
        if not row["archived"] and (row.get("nodeId") == project_id or
                                   name == "grants" and row["projectId"] == project_id)]
        for name in ("grants", "milestones", "indicators", "risks", "issues", "documents", "reports", "closures")}
    return {"schema": PROGRAMME_SCHEMA + ".qa", "project": record_ref("nodes", project),
        "reference": project["code"], "title": project["title"], "asOf": model["settings"]["asOf"],
        "checks": checks, "records": relevant, "position": position(model, project_id, entities, financial),
        "requiredClearanceRoles": ["MEL", "Finance", "SER"],
        "dataManagementBasis": project.get("dataManagementBasis", ""),
        "corporateRegistration": {"reference": project.get("corporateProjectReference"),
            "mode": project.get("corporateRegistrationMode", "unrecorded"),
            "documentIds": project.get("corporateRegistrationEvidence", [])},
        "sourceSteps": {"readiness": "P1.S3", "pack": "P1.S4", "decision": "P1.G1", "minutes": "P1.S5"}}


def _publication(model, row, entities, financial, context):
    selected_model = {**model, "settings": {**model["settings"],
        "asOf": row.get("periodEnd", row.get("closedDate", model["settings"]["asOf"]))}}
    selected = position(selected_model, row["nodeId"], entities, financial, row.get("grantId"))
    idx, nodes, grants = indexes(model), set(selected["nodeIds"]), set(selected["grantIds"])
    chosen = {name: set() for name in COLLECTIONS if name not in {"reports", "closures"}}
    pending = []

    def include(name, ident):
        if ident is not None and name in chosen and ident not in chosen[name]:
            require(ident in idx[name], "Publication selects a missing original record",
                    "PROGRAMME_RELATION_MISSING", 409)
            chosen[name].add(ident)
            pending.append((name, idx[name][ident]))

    def documents(item):
        for field in ("documentIds", "amendmentIds", "dueDiligenceDocumentIds",
                      "lessonDocumentIds", "corporateRegistrationEvidence"):
            for ident in item.get(field, ()):
                include("documents", ident)
        include("documents", item.get("agreementId"))

    for ident in nodes:
        if row.get("grantId") is None or ident == row["nodeId"]:
            include("nodes", ident)
    for ident in grants:
        include("grants", ident)
    for name in ("milestones", "indicators", "risks", "issues", "documents"):
        for item in idx[name].values():
            if not item["archived"] and item["nodeId"] in nodes and (
                    row.get("grantId") is None or item.get("grantId") in grants):
                include(name, item["id"])
    # The exact contribution set is carried by the dated result calculation.
    # An observation has no nodeId, and a shared partner has no project scope.
    for result in selected["results"]:
        include("indicators", result["indicatorId"])
        for ref in result["observationRefs"]:
            include("observations", ref["id"])
    documents(row)
    for ident in row.get("remainingIssueIds", ()):
        include("issues", ident)
    while pending:
        name, item = pending.pop()
        documents(item)
        if name == "nodes":
            include("nodes", item.get("parentId"))
        elif name == "grants":
            include("nodes", item["projectId"])
            include("grants", item.get("parentGrantId"))
            include("partners", item.get("recipientId"))
            for ident in item["applicantIds"]:
                include("partners", ident)
        elif name == "observations":
            include("indicators", item["indicatorId"])
        else:
            include("nodes", item.get("nodeId"))
            include("grants", item.get("grantId"))
        if name == "indicators":
            include("indicators", item.get("parentIndicatorId"))
            for point in item["baseline"] + item["targets"]:
                for ident in point["documentIds"]:
                    include("documents", ident)
        elif name == "milestones":
            for ident in item["dependencyIds"]:
                include("milestones", ident)
        elif name == "documents":
            include("documents", item.get("replacesId"))
    records = {name: [record_ref(name, idx[name][ident]) for ident in sorted(ids)]
               for name, ids in chosen.items()}
    source_refs = {digest(ref): ref for ref in row["sourceRefs"]}
    for name, ids in chosen.items():
        for ident in ids:
            for ref in idx[name][ident]["sourceRefs"]:
                source_refs[digest(ref)] = ref
    value = {"at": context["at"], "operationId": context["operationId"],
        "portfolioId": context["portfolioId"], "portfolioRevision": context["portfolioRevision"],
        "programmeRevision": model["revision"], "position": selected, "recordRefs": records,
        "evidenceSourceRefs": [source_refs[key] for key in sorted(source_refs)],
        "reportingPeriod": None if "periodStart" not in row else
            {"start": row["periodStart"], "end": row["periodEnd"]},
        "financialBasis": "Complete selected source positions, grouped by their original dimensions; source rows retain their own dates.",
        "resultBasis": "Indicator aggregation through the dated position; every contributing observation retains its reporting period."}
    if row.get("donorSelection") is not None:
        from donor_reporting import publication_statement
        value["donorStatement"] = publication_statement(model, row, entities, financial, context)
    value["sha256"] = digest(value)
    return value


def apply_programme(previous, incoming, *, context, entities, financial, object_info):
    """Called before the existing atomic portfolio commit; no I/O or second writer."""
    shape(incoming, ("schema", "expectedProgrammeRevision", "settings", "changes", "archive", "actor"),
          ("schema", "expectedProgrammeRevision", "actor"))
    require(incoming["schema"] == PROGRAMME_SCHEMA, "Select the original programme input schema")
    expected = previous["revision"] if previous else 0
    require(type(incoming["expectedProgrammeRevision"]) is int and incoming["expectedProgrammeRevision"] == expected,
            "The programme revision changed", "PROGRAMME_REVISION_CONFLICT", 409)
    actor = short(incoming["actor"], "Programme editor", 240)
    model = {"schema": PROGRAMME_SCHEMA, "revision": expected + 1,
        "settings": dict(previous["settings"]) if previous else
            {"asOf": context["at"][:10], "riskScaleMaximum": 5, "highRiskScore": 15},
        "records": {name: [dict(row) for row in previous["records"][name]] if previous else []
                    for name in COLLECTIONS}}
    settings = incoming.get("settings", {})
    shape(settings, SETTINGS)
    for key, value in settings.items():
        model["settings"][key] = normalize(value, SETTINGS[key], key)
    require(model["settings"]["highRiskScore"] <= model["settings"]["riskScaleMaximum"] ** 2,
            "The high risk score exceeds the configured scale")
    changes, archived = incoming.get("changes", []), incoming.get("archive", [])
    require(isinstance(changes, list) and isinstance(archived, list) and
            0 < len(changes) + len(archived) + len(settings) <= 2000,
            "Supply a complete programme change batch or dated reporting settings")
    idx, touched, publications = indexes(model), set(), []
    lookup = {(row["sourceId"], row["entityKey"]): row for row in entities}
    for change in changes:
        shape(change, ("collection", "id", "expectedRevision", "fields"),
              ("collection", "id", "expectedRevision", "fields"))
        name, ident = change["collection"], identifier(change["id"])
        require(name in COLLECTIONS, "Select a programme collection")
        require((name, ident) not in touched, "A change batch repeats a record")
        touched.add((name, ident))
        before = idx[name].get(ident)
        require(type(change["expectedRevision"]) is int and
                change["expectedRevision"] == (before["revision"] if before else 0),
                "The programme record changed", "PROGRAMME_RECORD_CONFLICT", 409)
        require(before is None or not before["archived"], "An archived record retains its original edition")
        specs = {**COMMON, **FIELDS[name]}
        shape(change["fields"], specs)
        require(change["fields"], "A record edit must contain changed fields")
        fields = {key: value for key, value in before.items() if key in specs} if before else defaults(specs)
        fields.update({key: normalize(value, specs[key], key) for key, value in change["fields"].items()})
        require(set(REQUIRED[name]) <= fields.keys(), "Complete the required " + name + " fields")
        if name == "nodes":
            fields.setdefault("corporateRegistrationMode", "unrecorded")
        if name == "milestones":
            fields.setdefault("progress", "0")
        if "sourceRefs" in change["fields"] or before is None:
            for selected in fields["sourceRefs"]:
                checked_ref(selected, lookup)
        if name == "documents" and fields.get("object"):
            descriptor = fields["object"]
            require(object_info(descriptor["sha256"]) ==
                    {"sha256": descriptor["sha256"], "bytes": descriptor["bytes"]},
                    "The selected complete document bytes differ", "PROGRAMME_DOCUMENT_CHANGED", 409)
        row = {**fields, "id": ident, "revision": (before["revision"] if before else 0) + 1,
               "createdAt": before["createdAt"] if before else context["at"],
               "updatedAt": context["at"], "updatedBy": actor, "archived": False, "archiveReason": ""}
        if name == "reports" and before and before.get("publication"):
            permitted = {"acknowledged"} if before["status"] == "acknowledged" else {"submitted", "acknowledged"}
            require(fields["status"] in permitted and
                    all(fields[key] == before[key] for key in fields if key != "status"),
                    "A submitted report retains its contents; create a following report for a correction",
                    "PROGRAMME_PUBLISHED_REPORT_CHANGED", 409)
            row["publication"] = before["publication"]
        elif name == "reports" and fields["status"] != "draft":
            publications.append((name, ident))
        if name == "closures" and before and before.get("positionAtRecording"):
            require(all(fields[key] == before[key] for key in fields),
                    "A recorded closure retains its original position", "PROGRAMME_RECORDED_CLOSURE_CHANGED", 409)
            row["positionAtRecording"] = before["positionAtRecording"]
        elif name == "closures" and fields["status"] == "recorded":
            publications.append((name, ident))
        row["sha256"] = digest(row)
        idx[name][ident] = row
    for change in archived:
        shape(change, ("collection", "id", "expectedRevision", "reason"),
              ("collection", "id", "expectedRevision", "reason"))
        name, ident = change["collection"], identifier(change["id"])
        require(name in COLLECTIONS and ident in idx[name], "Select an original record to archive")
        require((name, ident) not in touched, "A change batch repeats a record")
        touched.add((name, ident))
        before = idx[name][ident]
        require(type(change["expectedRevision"]) is int and change["expectedRevision"] == before["revision"],
                "The programme record changed", "PROGRAMME_RECORD_CONFLICT", 409)
        require(not before["archived"], "The original record is already archived")
        row = {**before, "revision": before["revision"] + 1, "updatedAt": context["at"], "updatedBy": actor,
               "archived": True, "archiveReason": short(change["reason"], "Archive reason", 8000)}
        row.pop("sha256", None)
        row["sha256"] = digest(row)
        idx[name][ident] = row
    model["records"] = {name: sorted(rows.values(), key=lambda row: row["id"]) for name, rows in idx.items()}
    require(sum(len(rows) for rows in model["records"].values()) <= 100000,
            "The programme exceeds 100,000 complete operating records")
    validate_relations(model)
    for name, ident in publications:
        row = idx[name][ident]
        row["publication" if name == "reports" else "positionAtRecording"] = _publication(
            model, row, entities, financial, context)
        row.pop("sha256", None)
        row["sha256"] = digest(row)
    require(len(canonical(model)) <= 16 * 1024 * 1024, "The complete programme exceeds 16 MiB")
    return model


def derive_programme(model, entities, financial):
    require(model["schema"] == PROGRAMME_SCHEMA, "The retained programme schema differs")
    tables = {"programme_" + name: [dict(row) for row in model["records"][name]] for name in COLLECTIONS}
    prepared = projection_context(model, entities, financial)
    tables["programme_bindings"] = prepared["bindings"]
    tables["programme_results"] = prepared["results"]
    tables["programme_positions"] = [position(model, row["id"], entities, financial, prepared=prepared)
        for row in model["records"]["nodes"] if not row["archived"]]
    for table in tables:
        tables[table].sort(key=lambda row: row["id"])
    return tables


def programme_objects(history):
    """All document editions in complete history, including subsequently archived records."""
    selected = {}
    for portfolio in history:
        model = portfolio["definition"].get("programme")
        if model is None:
            continue
        for row in model["records"]["documents"]:
            descriptor = row.get("object")
            if descriptor:
                prior = selected.get(descriptor["sha256"])
                require(prior is None or prior["bytes"] == descriptor["bytes"],
                        "The retained document identity has inconsistent lengths")
                selected[descriptor["sha256"]] = {"sha256": descriptor["sha256"], "bytes": descriptor["bytes"]}
    return selected


def programme_schema():
    return {"schema": PROGRAMME_SCHEMA, "collections": list(COLLECTIONS),
        "tables": list(PROGRAMME_TABLES), "fields": {name: {**COMMON, **specs} for name, specs in FIELDS.items()},
        "required": REQUIRED, "settings": SETTINGS,
        "edits": "portfolio.save payload.programme; original expected portfolio and programme revisions",
        "decisions": "The joined staff application enforces identity, roles and approval transitions.",
        "reporting": "Exact dated source records; independent financial currencies and measures."}
