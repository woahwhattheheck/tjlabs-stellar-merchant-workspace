"""MIT. Exact multi-year budgets and dated cash forecasts in portfolio history."""
from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, localcontext
import re

from domain import canonical, checked_ref, digest, identifier, require, sha, shape, short
from programme import ancestors, date, defaults, descendants, indexes as programme_indexes, normalize

PLANNING_SCHEMA = "stellar-forge.grant-budget-planning.v1"
COLLECTIONS = ("scenarios", "lines")
PLANNING_TABLES = tuple("planning_" + name for name in COLLECTIONS)
FIELDS = {
    "scenarios": {
        "code": "short", "title": "short", "nodeId": "id", "owner": "short",
        "startMonth": "month", "endMonth": "month", "description": "text",
        "openingBalances": "balances", "basedOn": "basis?",
        "reviewStatus": ("working", "reviewed"), "reviewer": "text", "reviewNote": "text",
        "documentIds": "ids", "sourceRefs": "sources", "notes": "text"},
    "lines": {
        "scenarioId": "id", "nodeId": "id", "grantId": "id?", "code": "short",
        "title": "short", "direction": ("inflow", "outflow"), "category": "short",
        "period": "budgetPeriod", "amount": "amount?", "currency": "currency",
        "classification": ("forecast", "committed"), "commitmentReference": "text",
        "cashDate": "date?", "milestoneId": "id?", "documentIds": "ids",
        "sourceRefs": "sources", "notes": "text"},
}
REQUIRED = {
    "scenarios": ("code", "title", "nodeId", "owner", "startMonth", "endMonth"),
    "lines": ("scenarioId", "nodeId", "code", "title", "direction", "category",
              "period", "currency", "classification"),
}
MAX_RECORDS = 10000


def amount(value, name="Amount", optional=False):
    if optional and value is None:
        return None
    require(isinstance(value, str) and len(value) <= 64 and
            bool(re.fullmatch(r"[+-]?(?:0|[0-9]+)(?:\.[0-9]{1,18})?", value)),
            name + " must retain a plain decimal string, up to 64 characters and 18 decimal places")
    return value


def currency(value):
    require(isinstance(value, str) and bool(re.fullmatch(r"[A-Z]{3}", value)),
            "Use a three-letter uppercase currency")
    return value


def month(value):
    require(isinstance(value, str) and bool(re.fullmatch(r"[0-9]{4}-[0-9]{2}", value)),
            "Use a complete YYYY-MM period")
    date(value + "-01")
    return value


def month_number(value):
    year, number = value.split("-")
    return int(year) * 12 + int(number) - 1


def months(start, end):
    return [str(number // 12).zfill(4) + "-" + str(number % 12 + 1).zfill(2)
            for number in range(month_number(start), month_number(end) + 1)]


def normalize_field(value, spec, name):
    if spec == "month":
        return month(value)
    if spec == "budgetPeriod":
        if isinstance(value, str) and re.fullmatch(r"[0-9]{4}", value):
            date(value + "-01-01")
            return value
        return month(value)
    if spec == "currency":
        return currency(value)
    if spec == "amount?":
        return amount(value, name, optional=True)
    if spec == "balances":
        require(isinstance(value, list) and len(value) <= 128, "Supply complete opening balances by currency")
        result = []
        for row in value:
            shape(row, ("currency", "value"), ("currency", "value"))
            result.append({"currency": currency(row["currency"]), "value": amount(row["value"], "Opening balance")})
        require(len({row["currency"] for row in result}) == len(result), "Opening balances repeat a currency")
        return sorted(result, key=lambda row: row["currency"])
    if spec == "basis?":
        if value is None:
            return None
        shape(value, ("id", "revision", "sha256"), ("id", "revision", "sha256"))
        require(type(value["revision"]) is int and value["revision"] > 0, "Select the original scenario revision")
        return {"id": identifier(value["id"]), "revision": value["revision"], "sha256": sha(value["sha256"])}
    return normalize(value, spec, name)


def indexes(model):
    return {name: {row["id"]: row for row in model["records"][name]} for name in COLLECTIONS}


def scenario_ref(row):
    return {key: row[key] for key in ("id", "revision", "sha256")}


def _rehash(row):
    row.pop("sha256", None)
    row["sha256"] = digest(row)


def _active(index, collection, ident, label):
    row = index[collection].get(ident)
    require(row is not None and not row["archived"], label + " selects an unavailable " + collection + " record",
            "PLANNING_SCOPE_CHANGED", 409)
    return row


def validate_relations(model, programme):
    idx, program = indexes(model), programme_indexes(programme)
    codes = set()
    for row in idx["scenarios"].values():
        if row["archived"]:
            continue
        node = _active(program, "nodes", row["nodeId"], "Scenario")
        key = row["code"].casefold()
        require(key not in codes, "Scenario codes must be distinct", "PLANNING_CODE_CONFLICT", 409)
        codes.add(key)
        require(0 <= month_number(row["endMonth"]) - month_number(row["startMonth"]) < 240,
                "A scenario must cover one to 240 complete months")
        require(row["reviewStatus"] != "reviewed" or row["reviewer"].strip() and row["reviewNote"].strip(),
                "Record the Finance team-lead reviewer and clearance note")
        allowed_documents = ancestors(program["nodes"], node["id"], "parentId")
        for ident in row["documentIds"]:
            doc = _active(program, "documents", ident, "Scenario document")
            require(doc["nodeId"] in allowed_documents and doc.get("grantId") is None,
                    "Scenario documents must cover the selected node", "PLANNING_SCOPE_CHANGED", 409)
    line_codes, currencies = set(), {}
    for row in idx["lines"].values():
        if row["archived"]:
            continue
        scenario = idx["scenarios"].get(row["scenarioId"])
        require(scenario is not None, "The budget line selects a missing scenario", "PLANNING_SCOPE_CHANGED", 409)
        # Archiving a complete scenario retains its original lines and evidence.
        if scenario["archived"]:
            continue
        _active(program, "nodes", row["nodeId"], "Budget line")
        require(row["nodeId"] in descendants(program, scenario["nodeId"]),
                "The budget line is outside its scenario", "PLANNING_SCOPE_CHANGED", 409)
        key = row["scenarioId"], row["code"].casefold()
        require(key not in line_codes, "Line codes must be distinct within a scenario",
                "PLANNING_CODE_CONFLICT", 409)
        line_codes.add(key)
        currencies.setdefault(row["scenarioId"], set()).add(row["currency"])
        require(len(currencies[row["scenarioId"]]) <= 128, "A scenario supports up to 128 separate currencies")
        period_start = row["period"] + "-01" if len(row["period"]) == 4 else row["period"]
        period_end = row["period"] + "-12" if len(row["period"]) == 4 else row["period"]
        require(scenario["startMonth"] <= period_start <= period_end <= scenario["endMonth"],
                "The complete budget period is outside its scenario")
        require(row["cashDate"] is None or
                scenario["startMonth"] <= row["cashDate"][:7] <= scenario["endMonth"],
                "The cash date is outside its scenario")
        require(row["classification"] != "committed" or row["commitmentReference"].strip(),
                "A committed amount needs its agreement, order, or other commitment reference")
        if row["grantId"]:
            grant = _active(program, "grants", row["grantId"], "Budget line")
            require(grant["projectId"] == row["nodeId"], "The budget line grant belongs to another project",
                    "PLANNING_SCOPE_CHANGED", 409)
        if row["milestoneId"]:
            milestone = _active(program, "milestones", row["milestoneId"], "Budget line")
            require(milestone["nodeId"] == row["nodeId"] and
                    (milestone.get("grantId") is None or milestone["grantId"] == row["grantId"]),
                    "The workplan milestone belongs to another project or grant",
                    "PLANNING_SCOPE_CHANGED", 409)
        for ident in row["documentIds"]:
            document = _active(program, "documents", ident, "Budget line document")
            require(document["nodeId"] in ancestors(program["nodes"], row["nodeId"], "parentId") and
                    (document.get("grantId") is None or row["grantId"] is not None and
                     document["grantId"] in ancestors(program["grants"], row["grantId"], "parentGrantId")),
                    "The budget line document is outside its project or grant",
                    "PLANNING_SCOPE_CHANGED", 409)


def apply_planning(previous, incoming, *, context, programme, entities):
    shape(incoming, ("schema", "actor", "expectedPlanningRevision", "changes", "archive"),
          ("actor", "expectedPlanningRevision"))
    require(incoming.get("schema", PLANNING_SCHEMA) == PLANNING_SCHEMA, "Select the budget planning schema")
    expected = previous["revision"] if previous else 0
    require(type(incoming["expectedPlanningRevision"]) is int and incoming["expectedPlanningRevision"] == expected,
            "The budget planning revision changed", "PLANNING_REVISION_CONFLICT", 409)
    actor = short(incoming["actor"], "Budget editor", 240)
    model = {"schema": PLANNING_SCHEMA, "revision": expected + 1,
             "records": deepcopy(previous["records"]) if previous else {name: [] for name in COLLECTIONS}}
    changes, archived = incoming.get("changes", []), incoming.get("archive", [])
    require(isinstance(changes, list) and isinstance(archived, list) and
            0 < len(changes) + len(archived) <= 2000, "Supply one to 2,000 complete record edits")
    idx, touched, affected, review_requests = indexes(model), set(), set(), set()
    old_idx = indexes(previous) if previous else {name: {} for name in COLLECTIONS}
    lookup = {(row["sourceId"], row["entityKey"]): row for row in entities}
    for change in changes:
        shape(change, ("collection", "id", "expectedRevision", "fields"),
              ("collection", "id", "expectedRevision", "fields"))
        name, ident = change["collection"], identifier(change["id"])
        require(name in COLLECTIONS, "Select scenarios or lines")
        require((name, ident) not in touched, "A planning batch repeats a record")
        touched.add((name, ident))
        before, specs = idx[name].get(ident), FIELDS[name]
        require(type(change["expectedRevision"]) is int and
                change["expectedRevision"] == (before["revision"] if before else 0),
                "The budget record changed", "PLANNING_RECORD_CONFLICT", 409)
        require(before is None or not before["archived"], "An archived budget record retains its original edition")
        shape(change["fields"], specs)
        require(change["fields"], "Supply the changed record fields")
        fields = {key: deepcopy(before[key]) for key in specs} if before else defaults(specs)
        if name == "scenarios":
            fields.setdefault("openingBalances", [])
            fields.setdefault("reviewStatus", "working")
        fields.update({key: normalize_field(value, specs[key], key)
                       for key, value in change["fields"].items()})
        require(set(REQUIRED[name]) <= fields.keys(), "Complete the required " + name + " fields")
        if "sourceRefs" in change["fields"] or before is None:
            for ref in fields["sourceRefs"]:
                checked_ref(ref, lookup)
        if name == "scenarios":
            if fields["basedOn"] is not None and (before is None or "basedOn" in change["fields"]):
                basis = old_idx["scenarios"].get(fields["basedOn"]["id"])
                require(basis is not None and scenario_ref(basis) == fields["basedOn"] and basis["id"] != ident,
                        "Copy the complete selected original scenario edition", "PLANNING_BASIS_CHANGED", 409)
            material = set(change["fields"]) - {"reviewStatus", "reviewer", "reviewNote"}
            if before and material and any(fields[key] != before[key] for key in material):
                affected.add(ident)
            if fields["reviewStatus"] == "reviewed" and change["fields"].get("reviewStatus") == "reviewed":
                require(before is not None, "Save the working scenario before recording Finance clearance")
                review_requests.add(ident)
            elif before and before["reviewStatus"] == "reviewed" and material:
                fields.update(reviewStatus="working", reviewer="", reviewNote="")
        else:
            affected.add(fields["scenarioId"])
            if before:
                affected.add(before["scenarioId"])
        row = {**fields, "id": ident, "revision": (before["revision"] if before else 0) + 1,
               "createdAt": before["createdAt"] if before else context["at"],
               "updatedAt": context["at"], "updatedBy": actor, "archived": False, "archiveReason": ""}
        _rehash(row)
        idx[name][ident] = row
    for change in archived:
        shape(change, ("collection", "id", "expectedRevision", "reason"),
              ("collection", "id", "expectedRevision", "reason"))
        name, ident = change["collection"], identifier(change["id"])
        require(name in COLLECTIONS and ident in idx[name], "Select an original budget record")
        require((name, ident) not in touched, "A planning batch repeats a record")
        touched.add((name, ident))
        row = idx[name][ident]
        require(type(change["expectedRevision"]) is int and change["expectedRevision"] == row["revision"],
                "The budget record changed", "PLANNING_RECORD_CONFLICT", 409)
        require(not row["archived"], "The budget record is already archived")
        if name == "lines":
            affected.add(row["scenarioId"])
        row.update(revision=row["revision"] + 1, updatedAt=context["at"], updatedBy=actor,
                   archived=True, archiveReason=short(change["reason"], "Archive reason", 8000))
        _rehash(row)
    require(not (review_requests & affected), "Save budget edits before recording their Finance clearance")
    for ident in affected:
        row = idx["scenarios"].get(ident)
        require(row is not None, "Select the original budget scenario")
        if row["archived"]:
            require(not old_idx["scenarios"].get(ident, {}).get("archived", False),
                    "An archived budget scenario retains its original lines")
            continue
        if row["reviewStatus"] == "reviewed":
            row.update(reviewStatus="working", reviewer="", reviewNote="", updatedAt=context["at"], updatedBy=actor)
            if ("scenarios", ident) not in touched:
                row["revision"] += 1
            _rehash(row)
    model["records"] = {name: sorted(rows.values(), key=lambda row: row["id"]) for name, rows in idx.items()}
    require(sum(map(len, model["records"].values())) <= MAX_RECORDS, "Budget planning exceeds 10,000 records")
    validate_relations(model, programme)
    require(len(canonical(model)) <= 16 * 1024 * 1024, "The complete budget model exceeds 16 MiB")
    return model



def _review_basis(scenario, lines, programme, cache):
    """Only programme records that contribute to this scenario and its report."""
    idx = cache["index"]
    chosen = {name: set() for name in ("nodes", "grants", "milestones", "documents")}
    def chain(name, ident, field):
        seen = set()
        while ident is not None and ident not in seen:
            seen.add(ident)
            chosen[name].add(ident)
            row = idx[name].get(ident)
            ident = row.get(field) if row else None
    chain("nodes", scenario["nodeId"], "parentId")
    chosen["documents"].update(scenario["documentIds"])
    for row in lines:
        chain("nodes", row["nodeId"], "parentId")
        if row["grantId"]:
            chain("grants", row["grantId"], "parentGrantId")
        if row["milestoneId"]:
            chosen["milestones"].add(row["milestoneId"])
        chosen["documents"].update(row["documentIds"])
    scope_key = scenario["nodeId"], scenario["startMonth"], scenario["endMonth"]
    if scope_key not in cache["workplans"]:
        scoped = descendants(idx, scenario["nodeId"], cache["children"])
        cache["workplans"][scope_key] = {
            row["id"] for row in idx["milestones"].values() if not row["archived"] and row["nodeId"] in scoped and
            scenario["startMonth"] <= row["dueDate"][:7] <= scenario["endMonth"]}
    chosen["milestones"].update(cache["workplans"][scope_key])
    # The report includes complete milestones, so their scope and evidence also
    # belong to the clearance even when no amount is linked to that milestone.
    for ident in list(chosen["milestones"]):
        row = idx["milestones"].get(ident)
        if row:
            chain("nodes", row["nodeId"], "parentId")
            if row.get("grantId"):
                chain("grants", row["grantId"], "parentGrantId")
            chosen["documents"].update(row["documentIds"])
    return {name: [(ident, idx[name].get(ident, {}).get("sha256")) for ident in sorted(ids)]
            for name, ids in chosen.items()}


def reconcile_planning(model, previous, programme, previous_programme, *, context, incoming=None, entities=()):
    """Preserve scope and update affected Finance clearances in the same writer."""
    validate_relations(model, programme)
    reviewed = [row for row in model["records"]["scenarios"]
                if not row["archived"] and row["reviewStatus"] == "reviewed"]
    if not reviewed or previous is None:
        return model
    old = indexes(previous)
    def cache(program):
        idx = programme_indexes(program)
        children = {}
        for row in idx["nodes"].values():
            children.setdefault(row.get("parentId"), []).append(row["id"])
        return {"index": idx, "children": children, "workplans": {}}
    before_cache, after_cache = cache(previous_programme), cache(programme)
    current_lines, earlier_lines = {}, {}
    for records, grouped in ((model["records"]["lines"], current_lines),
                             (previous["records"]["lines"], earlier_lines)):
        for row in records:
            if not row["archived"]:
                grouped.setdefault(row["scenarioId"], []).append(row)
    requested = {change["id"] for change in (incoming or {}).get("changes", [])
                 if change["collection"] == "scenarios" and change["fields"].get("reviewStatus") == "reviewed"}
    lookup = {(row["sourceId"], row["entityKey"]): row for row in entities}
    changed = {}
    for scenario in reviewed:
        prior = old["scenarios"].get(scenario["id"])
        if prior is None:
            continue
        lines = current_lines.get(scenario["id"], [])
        program_changed = _review_basis(prior, earlier_lines.get(prior["id"], []), previous_programme, before_cache) != \
                          _review_basis(scenario, lines, programme, after_cache)
        source_changed = any(lookup.get((ref["sourceId"], ref["entityKey"]), {}).get("sha256") != ref["sha256"]
                             for row in [scenario, *lines] for ref in row["sourceRefs"])
        if program_changed or source_changed:
            require(scenario["id"] not in requested,
                    "Save related program and source changes before recording Finance clearance",
                    "PLANNING_REVIEW_BASIS_CHANGED", 409)
            changed[scenario["id"]] = "Review returned to working because " + (
                "linked program records or workplan changed." if program_changed else "a supporting source reference changed.")
    if not changed:
        return model
    result = deepcopy(model)
    if result["revision"] == previous["revision"]:
        result["revision"] += 1
    for row in result["records"]["scenarios"]:
        if row["id"] not in changed:
            continue
        if row["revision"] == old["scenarios"][row["id"]]["revision"]:
            row["revision"] += 1
        row.update(reviewStatus="working", reviewer="", reviewNote=changed[row["id"]],
                   updatedAt=context["at"], updatedBy=short(context["actor"], "Program editor", 240))
        _rehash(row)
    require(len(canonical(result)) <= 16 * 1024 * 1024, "The complete budget model exceeds 16 MiB")
    return result


def derive_planning(model):
    require(model["schema"] == PLANNING_SCHEMA, "The retained budget planning schema differs")
    return {"planning_" + name: deepcopy(model["records"][name]) for name in COLLECTIONS}


def exact_sum(values):
    # At most 10,000 64-character plain decimals with 18 fractional digits.
    # 128 digits cover every aligned operand and the complete carry.
    with localcontext() as context:
        context.prec = 128
        return format(sum((Decimal(value) for value in values), Decimal(0)), "f")


def difference(left, right):
    with localcontext() as context:
        context.prec = 128
        return format(Decimal(left) - Decimal(right), "f")


def bucket(rows):
    known = [row["amount"] for row in rows if row["amount"] is not None]
    result = {"known": exact_sum(known), "missing": len(rows) - len(known), "count": len(rows)}
    for classification in ("forecast", "committed"):
        selected = [row for row in rows if row["classification"] == classification]
        values = [row["amount"] for row in selected if row["amount"] is not None]
        result[classification] = {"known": exact_sum(values), "missing": len(selected) - len(values),
                                  "count": len(selected)}
    return result


def projection(scenario, lines, granularity="month", cash=False):
    require(granularity in {"month", "year"}, "Select month or year")
    periods = months(scenario["startMonth"], scenario["endMonth"])
    if granularity == "year":
        periods = sorted({period[:4] for period in periods})
    currencies = sorted({row["currency"] for row in lines} |
                        {row["currency"] for row in scenario["openingBalances"]})
    grouped, annual = {}, {}
    for row in lines:
        if not cash and granularity == "month" and len(row["period"]) == 4:
            annual.setdefault((row["period"], row["currency"]), []).append(row)
            continue
        period = row["cashDate"][:7] if cash and row["cashDate"] else None if cash else row["period"]
        if period is not None:
            period = period[:4] if granularity == "year" else period
            grouped.setdefault((period, row["currency"]), []).append(row)
    openings = {row["currency"]: row["value"] for row in scenario["openingBalances"]}
    undated = {cur: any(row["currency"] == cur and row["cashDate"] is None for row in lines)
               for cur in currencies}
    uncertain = {cur: False for cur in currencies}
    output = []
    for period in periods:
        for cur in currencies:
            rows = grouped.get((period, cur), [])
            inflow = bucket([row for row in rows if row["direction"] == "inflow"])
            outflow = bucket([row for row in rows if row["direction"] == "outflow"])
            net = difference(inflow["known"], outflow["known"])
            complete = inflow["missing"] + outflow["missing"] == 0
            result = {"period": period, "currency": cur, "inflow": inflow, "outflow": outflow,
                      "netKnown": net, "complete": complete}
            if not cash:
                unallocated = len(annual.get((period[:4], cur), []))
                result.update(unallocatedAnnualCount=unallocated, complete=complete and unallocated == 0)
            if cash:
                opening = openings.get(cur)
                closing = exact_sum((opening, net)) if opening is not None else None
                uncertain[cur] = uncertain[cur] or not complete
                result.update(opening=opening, closingKnown=closing, missingOpening=opening is None,
                              complete=opening is not None and not uncertain[cur] and not undated[cur])
                if closing is not None:
                    openings[cur] = closing
            output.append(result)
    return output


def compare_rows(base, compared):
    left = {(row["period"], row["currency"]): row for row in base}
    right = {(row["period"], row["currency"]): row for row in compared}
    return [{"period": period, "currency": cur, "base": left.get((period, cur)),
             "compared": right.get((period, cur)),
             "netKnownDifference": difference(left[(period, cur)]["netKnown"], right[(period, cur)]["netKnown"])
                 if (period, cur) in left and (period, cur) in right else None,
             "complete": (period, cur) in left and (period, cur) in right and
                         left[(period, cur)]["complete"] and right[(period, cur)]["complete"]}
            for period, cur in sorted(left.keys() | right.keys())]


def summary(model, programme, entities, scenario_id, *, compare_id=None, granularity="month"):
    idx = indexes(model)
    scenario = idx["scenarios"].get(identifier(scenario_id))
    require(scenario is not None, "The selected budget scenario was not found", "NOT_FOUND", 404)
    lines = [row for row in idx["lines"].values()
             if row["scenarioId"] == scenario_id and not row["archived"]]
    result = {"scenario": scenario, "granularity": granularity,
              "rows": projection(scenario, lines, granularity),
              "cashRows": projection(scenario, lines, granularity, cash=True),
              "undatedCashRows": [row for row in lines if row["cashDate"] is None],
              "unallocatedBudgetRows": [row for row in lines if len(row["period"]) == 4] if granularity == "month" else [],
              "missingAmounts": [row for row in lines if row["amount"] is None],
              "comparison": None, "warnings": []}
    lookup = {(row["sourceId"], row["entityKey"]): row for row in entities}
    for row in [scenario, *lines]:
        for ref in row["sourceRefs"]:
            original = lookup.get((ref["sourceId"], ref["entityKey"]))
            if original is None or original["sha256"] != ref["sha256"]:
                result["warnings"].append({"code": "SOURCE_REFERENCE_CHANGED", "recordId": row["id"], "reference": ref})
    if compare_id is not None:
        other = idx["scenarios"].get(identifier(compare_id))
        require(other is not None, "The comparison scenario was not found", "NOT_FOUND", 404)
        require(other["nodeId"] == scenario["nodeId"], "Compare scenarios for the same programme scope")
        other_lines = [row for row in idx["lines"].values()
                       if row["scenarioId"] == compare_id and not row["archived"]]
        result["comparison"] = {"scenario": other,
            "rows": compare_rows(result["rows"], projection(other, other_lines, granularity)),
            "cashRows": compare_rows(result["cashRows"], projection(other, other_lines, granularity, cash=True))}
    nodes = descendants(programme_indexes(programme), scenario["nodeId"])
    result["workplan"] = [row for row in programme["records"]["milestones"]
                          if not row["archived"] and row["nodeId"] in nodes and
                          scenario["startMonth"] <= row["dueDate"][:7] <= scenario["endMonth"]]
    return result, lines


def planning_schema():
    return {"schema": PLANNING_SCHEMA, "collections": list(COLLECTIONS), "fields": FIELDS,
            "required": REQUIRED, "tables": list(PLANNING_TABLES),
            "maxRecords": MAX_RECORDS, "maxBatch": 2000, "maxMonths": 240,
            "actionMaxBytes": 1024 * 1024, "amountMaxCharacters": 64, "amountMaxFractionDigits": 18,
            "clearanceRole": "Finance TL", "clearanceIsProgrammeGate": False,
            "requirement": "P1.09 — Multi-year work plan and budget; annual work plan",
            "amountMeaning": "Original decimal text; null is missing; currencies remain separate.",
            "budgetPeriodMeaning": "YYYY annual or YYYY-MM monthly. Annual amounts have no inferred monthly allocation.",
            "cashMeaning": "Dated cash only; undated cash and missing opening balances remain explicit."}
