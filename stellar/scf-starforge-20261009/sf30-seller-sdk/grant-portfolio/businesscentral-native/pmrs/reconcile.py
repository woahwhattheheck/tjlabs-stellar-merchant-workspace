"""Exact native signed amounts, reviewed grant allocation and traceable reconciliation."""
import contextlib
import csv
import json
import os
import tempfile
from collections import defaultdict
from decimal import Decimal, Inexact, localcontext
from pathlib import Path
from .canonical import (date, decimal, decimal_text, digest, encode, full_sha, guid,
                        now, request_id, stable_text)
from .errors import PMRSError, require
from .source import Source

METRICS = {
    "budget_cost": {"family": "projectPlanningLines", "native_field": "totalCost", "meaning": "Budget/Both native total cost"},
    "billable_amount": {"family": "projectPlanningLines", "native_field": "lineAmount", "meaning": "Billable/Both native line amount"},
    "usage_cost": {"family": "projectLedgerEntries", "native_field": "totalCost", "meaning": "Usage native total cost"},
    "sale_amount": {"family": "projectLedgerEntries", "native_field": "lineAmount", "meaning": "Sale native line amount"},
}
BASIS = {"lcy": "Lcy", "project": ""}
ROW_SCHEMA = "commons.pmrs-finance-row.v1"

def mapping_profile(value, source_id):
    require(isinstance(value, dict) and value.get("schema") == "commons.pmrs-mapping.v1",
            "MAPPING_SCHEMA", "Use the project and grant mapping schema.")
    allowed = {"schema", "source_id", "label", "period", "rules", "exclusions",
               "currency_basis", "usage_multiplier", "sale_multiplier", "require_gl_links"}
    require(set(value) <= allowed and value.get("source_id") == full_sha(source_id),
            "MAPPING_SOURCE", "Mapping must bind to the exact retained source edition.")
    period = value.get("period")
    require(isinstance(period, dict) and set(period) == {"from", "to"}, "MAPPING_PERIOD", "Select both reconciliation dates.")
    start, finish = date(period["from"]), date(period["to"])
    require(start <= finish, "MAPPING_PERIOD", "Reconciliation period is reversed.")
    bases = value.get("currency_basis", ["lcy"])
    require(isinstance(bases, list) and bases and len(bases) <= 2
            and len(set(bases)) == len(bases) and all(b in BASIS for b in bases),
            "MAPPING_CURRENCY", "Select LCY and/or original project-currency views.")
    rules = value.get("rules")
    require(isinstance(rules, list) and 1 <= len(rules) <= 1000, "MAPPING_RULES", "Supply 1–1,000 reviewed allocation rules.")
    normalized, rule_ids, grant_labels = [], set(), {}
    for row in rules:
        require(isinstance(row, dict) and set(row) <= {
            "id", "project_id", "grant_key", "grant_label", "task_numbers", "posted_dimensions", "planning_scope", "note"},
            "MAPPING_RULE", "Unknown grant allocation field.")
        key = request_id(row.get("id"))
        require(key not in rule_ids, "MAPPING_DUPLICATE_RULE", "Allocation rule IDs must be unique.")
        rule_ids.add(key)
        tasks = row.get("task_numbers")
        require(tasks is None or isinstance(tasks, list) and tasks and len(set(tasks)) == len(tasks)
                and all(isinstance(t, str) and 0 < len(t) <= 20 for t in tasks),
                "MAPPING_TASKS", "Use exact task numbers or null for every task.")
        dimensions = row.get("posted_dimensions", {})
        require(isinstance(dimensions, dict) and len(dimensions) <= 20
                and all(isinstance(k, str) and 0 < len(k) <= 20
                        and isinstance(v, str) and len(v) <= 20 for k, v in dimensions.items()),
                "MAPPING_DIMENSIONS", "Posted dimensions require exact native codes and values.")
        planning_scope = row.get("planning_scope")
        require(planning_scope in {"project", "tasks", "none"}, "MAPPING_PLANNING",
                "Choose project, selected tasks, or no planning allocation explicitly.")
        require(planning_scope != "tasks" or tasks, "MAPPING_PLANNING", "Task planning allocation needs exact task numbers.")
        grant = stable_text(row.get("grant_key"), 200)
        require(bool(grant.strip()), "MAPPING_GRANT", "Select an explicit PMRS grant identity.")
        label = stable_text(row.get("grant_label", grant), 256)
        require(grant not in grant_labels or grant_labels[grant] == label,
                "MAPPING_GRANT_LABEL", "One grant identity must use one consistent label in this mapping.", grant_key=grant)
        grant_labels[grant] = label
        normalized.append({"id": key, "project_id": guid(row.get("project_id")),
                           "grant_key": grant, "grant_label": label,
                           "task_numbers": sorted(tasks) if tasks else None, "posted_dimensions": dimensions,
                           "planning_scope": planning_scope, "note": stable_text(row.get("note", ""), 4096)})
    exclusions, excluded_keys = [], set()
    for item in value.get("exclusions", []):
        require(isinstance(item, dict) and set(item) == {"family", "id", "note"}
                and item["family"] in {"projectPlanningLines", "projectLedgerEntries"},
                "MAPPING_EXCLUSION", "Exclusions need the exact native row and a note.")
        selected = (item["family"], guid(item["id"]))
        require(selected not in excluded_keys and bool(stable_text(item["note"], 4096).strip()),
                "MAPPING_EXCLUSION", "Every exclusion must be unique and explained.")
        excluded_keys.add(selected)
        exclusions.append({"family": selected[0], "id": selected[1], "note": item["note"]})
    result = {"schema": "commons.pmrs-mapping.v1", "source_id": source_id,
              "label": stable_text(value.get("label", "Project and grant reconciliation"), 256),
              "period": {"from": start, "to": finish}, "currency_basis": bases,
              "rules": normalized, "exclusions": exclusions,
              "require_gl_links": value.get("require_gl_links", True)}
    require(type(result["require_gl_links"]) is bool, "MAPPING_GL", "G/L link requirement must be explicit boolean.")
    for key in ("usage_multiplier", "sale_multiplier"):
        factor = value.get(key, "1")
        require(factor in {"1", "-1"}, "MAPPING_SIGN", "Select native signs (1) or an explicit reversed presentation (-1).")
        result[key] = factor
    return result

def save_mapping(store, operation_id, source_id, profile):
    source = Source(store, source_id); source.verify()
    profile = mapping_profile(profile, source_id)
    operation = store.operation(operation_id, "save-mapping", {"profile": profile})
    if operation.get("result"): return store.record(operation["result"]["record_id"], "mapping")
    with store.work(operation_id):
        operation = store.operation(operation_id, "save-mapping", {"profile": profile})
        if operation.get("result"): return store.record(operation["result"]["record_id"], "mapping")
        projects = {guid(item["native"]["id"]): item["native"] for item in source.rows("projects")}
        tasks = {(item["native"]["projectNumber"], item["native"]["number"]) for item in source.rows("projectTasks")}
        for rule in profile["rules"]:
            require(rule["project_id"] in projects, "MAPPING_PROJECT", "Allocation selects a project outside this source edition.")
            number = projects[rule["project_id"]]["number"]
            if rule["task_numbers"]:
                require(all((number, task) in tasks for task in rule["task_numbers"]),
                        "MAPPING_TASK", "An allocation task is absent from the selected native source.")
        result = store.add_record("mapping", {"schema": "commons.pmrs-saved-mapping.v1",
                "label": profile["label"], "source_id": source_id, "profile": profile, "created_at": operation["created_at"]})
        store.update_operation(operation_id, state="COMPLETE", result={"record_id": result["id"]})
        return result

def _finding(code, message, *, blocking=True, row=None, details=None):
    body = {"code": code, "message": message, "blocking": blocking, "row": row, "details": details or {}}
    return {"id": digest(body), **body}

def _period(value, profile):
    if not isinstance(value, str) or value in {"", "0001-01-01"}: return None
    date(value)
    return profile["period"]["from"] <= value <= profile["period"]["to"]

def _new_metric():
    return {"native_total": Decimal(0), "presented_total": Decimal(0),
            "contributing_rows": 0, "missing_rows": 0}

def project(store, source_id, profile, write_row):
    """Pure projection of complete retained pages; writes rows in deterministic native order."""
    source = Source(store, source_id)
    source.verify()
    profile = mapping_profile(profile, source_id)
    source_period = source.body["profile"]
    if "from" in source_period:
        require(profile["period"]["from"] >= source_period["from"]
                and profile["period"]["to"] <= source_period["to"],
                "PERIOD_NOT_CAPTURED", "Reconciliation period exceeds the retained source capture.")
    projects = {item["native"]["number"]: item for item in source.rows("projects")}
    tasks = {(item["native"]["projectNumber"], item["native"]["number"]): item for item in source.rows("projectTasks")}
    project_ids = {guid(item["native"]["id"]): number for number, item in projects.items()}
    rules = defaultdict(list)
    for rule in profile["rules"]:
        require(rule["project_id"] in project_ids, "MAPPING_PROJECT", "Mapped project is absent from the source.")
        rules[project_ids[rule["project_id"]]].append(rule)
    setup = list(source.rows("generalLedgerSetup"))[0]
    lcy = setup["native"].get("localCurrencyCode")
    dimensions = defaultdict(dict)
    for item in source.rows("dimensionSetEntries"):
        native = item["native"]
        dimension_set = int(native["dimensionSetId"])
        code = native["dimensionCode"]
        require(code not in dimensions[dimension_set], "DIMENSION_DUPLICATE", "A native dimension set repeats a dimension code.")
        dimensions[dimension_set][code] = {"value": native["dimensionValueCode"], "source": item["source"], "id": native["id"]}
    gl = {int(item["native"]["entryNumber"]): item for item in source.rows("generalLedgerEntries")}
    current_project_dimensions, current_task_dimensions = defaultdict(list), defaultdict(list)
    for item in source.rows("projectDefaultDimensions"):
        current_project_dimensions[item["native"]["projectNumber"]].append(item)
    for item in source.rows("projectTaskDimensions"):
        row = item["native"]
        current_task_dimensions[(row["projectNumber"], row["taskNumber"])].append(item)
    exclusions = {(item["family"], item["id"]): item["note"] for item in profile["exclusions"]}
    seen_exclusions, seen_native, findings = set(), set(), []
    aggregates, output_rows = {}, 0
    counts = {"planning_rows": 0, "ledger_rows": 0, "outside_period": 0, "text_lines": 0,
              "explicitly_excluded": 0, "unallocated": 0, "multiply_allocated": 0}
    with localcontext() as context:
        context.prec = 512
        context.traps[Inexact] = True
        for family in ("projectPlanningLines", "projectLedgerEntries"):
            for item in source.rows(family):
                native = item["native"]; native_id = guid(native["id"])
                identity = {"family": family, "id": native_id}
                require((family, native_id) not in seen_native, "DUPLICATE_NATIVE_ROW", "A source row cannot contribute twice.")
                seen_native.add((family, native_id))
                planning = family == "projectPlanningLines"
                counts["planning_rows" if planning else "ledger_rows"] += 1
                record = {"schema": ROW_SCHEMA, "identity": identity, "source": item["source"],
                          "native_project_number": native.get("projectNumber"),
                          "native_task_number": native.get("taskNumber"),
                          "native_date": native.get("planningDate" if planning else "postingDate"),
                          "native_type": native.get("typeName"), "native_line_type": native.get("lineTypeName"),
                          "native_entry_type": native.get("entryTypeName"), "allocation": None, "values": []}
                if (family, native_id) in exclusions:
                    seen_exclusions.add((family, native_id)); counts["explicitly_excluded"] += 1
                    record.update({"disposition": "EXCLUDED_BY_REVIEW", "note": exclusions[(family, native_id)]})
                    write_row(record); output_rows += 1; continue
                if planning and native.get("typeName") == "Text":
                    counts["text_lines"] += 1; record["disposition"] = "NATIVE_TEXT_LINE"
                    write_row(record); output_rows += 1; continue
                in_period = _period(record["native_date"], profile)
                if in_period is False:
                    counts["outside_period"] += 1; record["disposition"] = "OUTSIDE_SELECTED_PERIOD"
                    write_row(record); output_rows += 1; continue
                if in_period is None:
                    findings.append(_finding("NATIVE_DATE_MISSING", "A financial row has no usable native period date.", row=identity))
                number, task = native.get("projectNumber"), native.get("taskNumber")
                require(number in projects and (number, task) in tasks, "SOURCE_RELATIONSHIP",
                        "A financial row has no exact captured project/task.", row=identity)
                record["project_id"] = guid(projects[number]["native"]["id"])
                record["task_id"] = guid(tasks[(number, task)]["native"]["id"])
                posted_dimensions = {} if planning else dimensions.get(int(native.get("dimensionSetId", 0)), {})
                record["dimensions"] = {
                    "basis": "none_on_native_planning_line" if planning else "posted_dimension_set",
                    "dimension_set_id": None if planning else native.get("dimensionSetId"),
                    "values": posted_dimensions,
                    "current_project_context": current_project_dimensions.get(number, []),
                    "current_task_context": current_task_dimensions.get((number, task), [])}
                if not planning and int(native.get("dimensionSetId", 0)) and not posted_dimensions:
                    findings.append(_finding("DIMENSION_SET_NOT_CAPTURED", "Posted dimension set is absent from the captured source.", row=identity))
                matches = []
                for rule in rules[number]:
                    if planning:
                        if rule["planning_scope"] == "none": continue
                        if rule["planning_scope"] == "tasks" and task not in (rule["task_numbers"] or []): continue
                    else:
                        if rule["task_numbers"] and task not in rule["task_numbers"]: continue
                        if any(posted_dimensions.get(code, {}).get("value") != value
                               for code, value in rule["posted_dimensions"].items()): continue
                    matches.append(rule)
                if len(matches) != 1:
                    key = "unallocated" if not matches else "multiply_allocated"
                    counts[key] += 1; record["disposition"] = key.upper()
                    findings.append(_finding("ALLOCATION_" + key.upper(),
                        "Every selected native financial row must match exactly one reviewed grant rule.",
                        row=identity, details={"rule_ids": [r["id"] for r in matches]}))
                    write_row(record); output_rows += 1; continue
                rule = matches[0]
                record["allocation"] = {k: rule[k] for k in ("id", "grant_key", "grant_label", "project_id")}
                record["disposition"] = "ALLOCATED"
                if planning:
                    require(native.get("lineTypeName") in {"Budget", "Billable", "Both Budget and Billable"},
                            "PLANNING_LINE_TYPE", "The native planning line type is not supported.", row=identity)
                    metrics = []
                    if native["lineTypeName"] in {"Budget", "Both Budget and Billable"}: metrics.append("budget_cost")
                    if native["lineTypeName"] in {"Billable", "Both Budget and Billable"}: metrics.append("billable_amount")
                else:
                    require(native.get("entryTypeName") in {"Usage", "Sale"},
                            "LEDGER_ENTRY_TYPE", "Native ledger entry type is not supported.", row=identity)
                    metrics = ["usage_cost" if native["entryTypeName"] == "Usage" else "sale_amount"]
                    if native.get("linkedLedgerEntryTypeName") == "G/L Account" and int(native.get("linkedLedgerEntryNumber", 0)):
                        linked = gl.get(int(native["linkedLedgerEntryNumber"]))
                        record["general_ledger_link"] = linked
                        if linked is None:
                            findings.append(_finding("GL_LINK_NOT_CAPTURED", "The selected native G/L entry-number relationship is not captured.",
                                blocking=profile["require_gl_links"], row=identity,
                                details={"entry_number": native["linkedLedgerEntryNumber"],
                                         "source_include_gl": source.body["profile"]["include_gl"]}))
                    else:
                        record["general_ledger_link"] = None
                for basis in profile["currency_basis"]:
                    currency = lcy if basis == "lcy" else native.get("currencyCode")
                    if basis == "project" and currency == "":
                        currency = lcy
                    valid_currency = isinstance(currency, str) and bool(currency.strip())
                    if not valid_currency:
                        findings.append(_finding("CURRENCY_UNRESOLVED", "The captured source does not identify this currency.",
                                                 row=identity, details={"basis": basis}))
                    currency = currency if valid_currency else None
                    group = {"grant_key": rule["grant_key"], "grant_label": rule["grant_label"],
                             "project_id": rule["project_id"], "project_number": number,
                             "currency_basis": basis, "currency": currency}
                    group_key = digest(group)
                    if group_key not in aggregates:
                        aggregates[group_key] = {"key": group_key, **group, "metrics": {m: _new_metric() for m in METRICS}}
                    for metric in metrics:
                        field = METRICS[metric]["native_field"] + BASIS[basis]
                        native_value = decimal(native.get(field), field=field, nullable=True)
                        multiplier = profile[{"usage_cost": "usage_multiplier", "sale_amount": "sale_multiplier"}[metric]] if metric in {"usage_cost", "sale_amount"} else "1"
                        presented = None if native_value is None else native_value * Decimal(multiplier)
                        complete = native_value is not None and valid_currency and in_period is True
                        aggregate = aggregates[group_key]["metrics"][metric]
                        if complete:
                            aggregate["native_total"] += native_value
                            aggregate["presented_total"] += presented
                            aggregate["contributing_rows"] += 1
                        else:
                            aggregate["missing_rows"] += 1
                            if native_value is None:
                                findings.append(_finding("NATIVE_AMOUNT_MISSING", "A selected native amount is null.",
                                                         row=identity, details={"field": field}))
                        record["values"].append({"metric": metric, "field": field, "basis": basis,
                            "currency": currency, "native_value": decimal_text(native_value),
                            "presentation_multiplier": multiplier, "value": decimal_text(presented), "complete": complete})
                write_row(record); output_rows += 1
        missing_exclusions = set(exclusions) - seen_exclusions
        require(not missing_exclusions, "EXCLUSION_NOT_FOUND", "A reviewed exclusion is absent from the selected source.")
        totals = []
        for key in sorted(aggregates):
            row = aggregates[key]
            for name, metric in row["metrics"].items():
                metric["status"] = "INCOMPLETE" if metric["missing_rows"] else ("COMPLETE" if metric["contributing_rows"] else "NO_ROWS")
                metric["native_partial_total"] = decimal_text(metric.pop("native_total"))
                metric["partial_total"] = decimal_text(metric.pop("presented_total"))
                metric["total"] = metric["partial_total"] if metric["status"] == "COMPLETE" else None
                metric["native_total"] = metric["native_partial_total"] if metric["status"] == "COMPLETE" else None
                metric["definition"] = METRICS[name]
            def difference(left, right):
                a, b = row["metrics"][left], row["metrics"][right]
                return {"formula": left + " - " + right, "value":
                    decimal_text(Decimal(a["total"]) - Decimal(b["total"]))
                    if a["status"] == b["status"] == "COMPLETE" else None}
            row["cost_variance"] = difference("budget_cost", "usage_cost")
            row["billable_difference"] = difference("billable_amount", "sale_amount")
            totals.append(row)
    unique_findings = {f["id"]: f for f in findings}
    return {"schema": "commons.pmrs-reconciliation-summary.v1", "source_id": source_id,
            "profile_sha256": digest(profile), "counts": counts, "row_count": output_rows,
            "totals": totals, "findings": [unique_findings[k] for k in sorted(unique_findings)],
            "ready": not any(f["blocking"] for f in unique_findings.values()),
            "period": profile["period"], "period_semantics": "inclusive_native_calendar_dates",
            "currency_context": setup, "aggregation": "native_rows_once_per_separate_metric_and_currency_basis",
            "source_consistency": source.body["consistency"]}

def reconcile(store, operation_id, mapping_id):
    mapping = store.record(mapping_id, "mapping")
    request = {"mapping_id": mapping_id, "source_id": mapping["body"]["source_id"]}
    operation = store.operation(operation_id, "reconcile", request)
    if operation.get("result"): return store.record(operation["result"]["record_id"], "reconciliation")
    with store.work(operation_id):
        operation = store.operation(operation_id, "reconcile", request)
        if operation.get("result"): return store.record(operation["result"]["record_id"], "reconciliation")
        descriptor, path = tempfile.mkstemp(prefix="finance-rows-", dir=store.root / "exports")
        try:
            with os.fdopen(descriptor, "wb") as stream:
                summary = project(store, request["source_id"], mapping["body"]["profile"],
                                  lambda value: stream.write(encode(value) + b"\n"))
                stream.flush(); os.fsync(stream.fileno())
            rows = store.put_file(path)
            result = store.add_record("reconciliation", {"schema": "commons.pmrs-reconciliation.v1",
                "label": mapping["body"]["label"], "mapping_id": mapping_id, "source_id": request["source_id"],
                "rows": rows, "summary": summary, "created_at": operation["created_at"]})
            store.update_operation(operation_id, state="COMPLETE", result={"record_id": result["id"]},
                                   event={"kind": "RECONCILIATION_RETAINED", "ready": summary["ready"]})
            return result
        finally:
            try: os.unlink(path)
            except FileNotFoundError: pass


def verify_reconciliation(store, record_id):
    import hashlib
    record = store.record(record_id, "reconciliation")
    body = record["body"]
    mapping = store.record(body["mapping_id"], "mapping")
    hasher = hashlib.sha256()
    length = 0
    def consume(value):
        nonlocal length
        part = encode(value) + b"\n"
        hasher.update(part); length += len(part)
    summary = project(store, body["source_id"], mapping["body"]["profile"], consume)
    require(summary == body["summary"] and hasher.hexdigest() == body["rows"]["sha256"]
            and length == body["rows"]["bytes"], "RECONCILIATION_CHANGED",
            "The report does not recompute from its exact retained source and reviewed mapping.")
    store.verify_object(body["rows"])
    return record
