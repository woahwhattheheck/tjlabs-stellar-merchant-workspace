"""Programme commissioning on the original IATI Results workspace.

No database, HTTP client, provider mutation, XML reader or numerical engine is
created here. The caller retains the original document, preview and evidence
files in its existing full programme packet and mutation journal.
"""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
import hashlib
import json
import re

SCHEMA = "stellar-forge.iati-programme-commissioning.v1"
PREVIEW = "stellar-forge.iati-programme-commissioning-preview.v1"
COMPARISON = "stellar-forge.iati-programme-commissioning-comparison.v1"
MAX_DOCUMENT_BYTES = 16 * 1024 * 1024
MAX_EVIDENCE_BYTES = 32 * 1024 * 1024
MAX_EVIDENCE_FILE_BYTES = 8 * 1024 * 1024
MAX_PREVIEW_BYTES = 128 * 1024 * 1024
HEX = re.compile(r"[0-9a-f]{64}\Z")
REQUEST = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}\Z")
REFERENCES = {
    "inheritance": "https://akvo.freshdesk.com/support/solutions/articles/153000135498-rules-for-inheriting-a-results-framework-from-a-lead-project-",
    "aggregation": "https://akvo.freshdesk.com/support/solutions/articles/153000135482-aggregated-indicator-results-data-for-programs",
    "periods": "https://akvo.freshdesk.com/support/solutions/articles/153000135500-unlocking-reporting-periods",
    "permissions": "https://akvo.freshdesk.com/support/solutions/articles/153000135530-rsr-write-api",
}
CONTRACT = {
    "schema": "stellar-forge.iati-programme-commissioning-contract.v1",
    "results": "Original ws.results.preview/save and original mutation journal",
    "hierarchy": "Explicit native project IDs and source-bound activity keys; no title matching",
    "authority": "Field-specific review of declared RSR observations; native permissions remain authoritative",
    "approval": "A local Results review is distinct from the observed RSR approval",
    "aggregation": "Retain reported aggregates and components separately; no programme sum",
    "evidence": "Complete selected bytes and exact JSON-pointer facts when supplied; absence remains unknown",
    "references": REFERENCES,
}


class CommissioningError(ValueError):
    """Invalid or changed source-bound commissioning input."""


def _json(value, maximum=MAX_DOCUMENT_BYTES):
    try:
        raw = json.dumps(value, ensure_ascii=False, sort_keys=True,
                         separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise CommissioningError("Use complete finite UTF-8 JSON values") from exc
    if len(raw) > maximum:
        raise CommissioningError("Complete commissioning JSON exceeds its explicit byte limit")
    return raw


def _sha(value, maximum=MAX_DOCUMENT_BYTES):
    return hashlib.sha256(_json(value, maximum)).hexdigest()


def _object(value, required, optional=(), name="object"):
    if (not isinstance(value, dict) or set(required) - set(value)
            or set(value) - set(required) - set(optional)):
        raise CommissioningError("Use the complete documented fields for " + name)
    return value


def _text(value, name, maximum=240, empty=False):
    if (not isinstance(value, str) or len(value) > maximum
            or (not empty and not value.strip())):
        raise CommissioningError(name + " requires bounded " + ("text" if empty else "nonempty text"))
    return value


def _id(value, name):
    return _text(value, name, 200)


def _hex(value, name):
    if not isinstance(value, str) or not HEX.fullmatch(value):
        raise CommissioningError(name + " requires a complete lowercase SHA256")
    return value


def _integer(value, name, maximum, minimum=0):
    if type(value) is not int or not minimum <= value <= maximum:
        raise CommissioningError(name + " is outside the documented integer limit")
    return value


def _array(value, name, maximum):
    if not isinstance(value, list) or len(value) > maximum:
        raise CommissioningError(name + " requires a complete bounded array")
    return value


def _distinct_strings(value, name, maximum=100000):
    items = _array(value, name, maximum)
    for item in items:
        _text(item, name, 200)
    if len(set(items)) != len(items):
        raise CommissioningError(name + " repeats an identity")
    return items


def _native_id(value, name):
    if type(value) is int and 0 <= value <= 2**63 - 1:
        return value
    return _id(value, name)


def _nullable_id(value, name):
    return None if value is None else _native_id(value, name)


def _enum(value, choices, name):
    if not isinstance(value, str) or value not in choices:
        raise CommissioningError("Choose a documented " + name)
    return value


def _issue(code, subject, message, severity="review", details=None):
    value = {"code": code, "subject": subject, "severity": severity,
             "message": message, "details": details or {}}
    value["id"] = _sha(value)
    return value


def _no_duplicate_keys(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise CommissioningError("The original evidence JSON has duplicate object keys")
        value[key] = item
    return value


def _evidence(document, supplied):
    records, loaded, total = {}, {}, 0
    supplied = {} if supplied is None else supplied
    if not isinstance(supplied, dict):
        raise CommissioningError("evidence_files must map declared evidence IDs to complete bytes")
    for item in _array(document["evidence"], "evidence files", 256):
        _object(item, {"id", "kind", "name", "sha256", "bytes", "observedAt"}, name="evidence file")
        ident = _id(item["id"], "Evidence ID")
        if ident in records:
            raise CommissioningError("An evidence ID is repeated")
        _enum(item["kind"], {"rsr-json", "rsr-ui", "framework", "operator-statement"}, "evidence kind")
        _text(item["name"], "Evidence original name", 500)
        _text(item["observedAt"], "Evidence original observation time", 160, True)
        _hex(item["sha256"], "Evidence original SHA256")
        size = _integer(item["bytes"], "Evidence original bytes", MAX_EVIDENCE_FILE_BYTES)
        total += size
        if total > MAX_EVIDENCE_BYTES:
            raise CommissioningError("Complete declared evidence exceeds 32 MiB; select an explicit bounded edition")
        records[ident] = deepcopy(item)
        if ident in supplied:
            raw = supplied[ident]
            if not isinstance(raw, bytes):
                raise CommissioningError("Supply immutable bytes for each complete evidence file")
            if len(raw) != size or hashlib.sha256(raw).hexdigest() != item["sha256"]:
                raise CommissioningError("The actual evidence bytes differ from the selected original: " + ident)
            parsed = None
            if item["kind"] == "rsr-json":
                try:
                    parsed = json.loads(raw.decode("utf-8-sig"),
                                        object_pairs_hook=_no_duplicate_keys,
                                        parse_constant=lambda _: (_ for _ in ()).throw(
                                            CommissioningError("Evidence JSON has a non-finite number")))
                except (ValueError, UnicodeError, RecursionError) as exc:
                    raise CommissioningError("Use the complete original valid RSR JSON: " + ident) from exc
            loaded[ident] = {"bytesVerified": True, "json": parsed}
    if set(supplied) - set(records):
        raise CommissioningError("Supplied evidence contains an undeclared original file")
    return records, loaded


def _pointer(value, pointer):
    if pointer == "":
        return True, value
    if not isinstance(pointer, str) or not pointer.startswith("/") or len(pointer) > 4000:
        raise CommissioningError("Use an exact RFC 6901 JSON pointer")
    parts = pointer[1:].split("/")
    if any(re.search(r"~(?![01])", raw) for raw in parts):
        raise CommissioningError("JSON-pointer tilde escaping is invalid")
    current = value
    for raw in parts:
        token = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict):
            if token not in current:
                return False, None
            current = current[token]
        elif isinstance(current, list):
            if not re.fullmatch(r"0|[1-9][0-9]*", token):
                return False, None
            index = int(token)
            if index >= len(current):
                return False, None
            current = current[index]
        else:
            return False, None
    return True, current



_SCOPE_OWNER = {"project": None, "result": "project", "indicator": "result",
                "period": "indicator", "actual": "period", "disaggregation": "indicator"}


def _joined_pointer(record_pointer, local_pointer):
    if not isinstance(local_pointer, str) or not local_pointer.startswith("/"):
        raise CommissioningError("A native record field needs a non-root relative JSON pointer")
    _pointer({}, local_pointer)
    return record_pointer + local_pointer


def _scopes(document, records, loaded):
    scopes = {}
    for item in _array(document["recordScopes"], "original RSR record scopes", 100000):
        _object(item, {"id", "kind", "objectId", "evidenceId", "pointer", "idPointer",
                       "ownerScopeId", "ownerPointer", "parentScopeId", "parentPointer"},
                name="original RSR record scope")
        ident = _id(item["id"], "Record scope ID")
        if ident in scopes:
            raise CommissioningError("A native record scope ID is repeated")
        kind = _enum(item["kind"], set(_SCOPE_OWNER), "native record kind")
        _nullable_id(item["objectId"], "Native record object ID")
        for key in ("ownerScopeId", "parentScopeId"):
            if item[key] is not None:
                _id(item[key], "Related original record scope")
        for key in ("pointer", "idPointer", "ownerPointer", "parentPointer"):
            if item[key] is not None:
                _pointer({}, item[key])
        if (item["ownerScopeId"] is None) != (item["ownerPointer"] is None):
            raise CommissioningError("An owner record link needs its selected scope and original field pointer together")
        if (item["parentScopeId"] is None) != (item["parentPointer"] is None):
            raise CommissioningError("An inherited parent link needs its selected scope and original field pointer together")
        if kind == "project" and item["ownerScopeId"] is not None:
            raise CommissioningError("A project scope has no container owner; programme parents use parentScopeId")
        evidence_id = item["evidenceId"]
        if evidence_id is not None:
            _id(evidence_id, "Record evidence ID")
        if evidence_id is not None and evidence_id not in records:
            raise CommissioningError("A record scope references undeclared evidence")
        observed, object_matched = None, False
        actual = loaded.get(evidence_id)
        if actual is not None and records[evidence_id]["kind"] == "rsr-json" and item["pointer"] is not None:
            present, observed = _pointer(actual["json"], item["pointer"])
            if present:
                if not isinstance(observed, dict):
                    raise CommissioningError("Select the complete native record object as the record scope")
                if item["objectId"] is not None and item["idPointer"] is not None:
                    _joined_pointer(item["pointer"], item["idPointer"])
                    id_present, actual_id = _pointer(observed, item["idPointer"])
                    if not id_present or _json(actual_id) != _json(item["objectId"]):
                        raise CommissioningError("The scoped original native record ID differs from its selected identity")
                    object_matched = True
        scopes[ident] = {**deepcopy(item), "objectMatched": object_matched,
                         "ownerMatched": False, "parentMatched": False,
                         "projectId": None, "_record": observed}
    for ident, scope in scopes.items():
        for relation in ("owner", "parent"):
            target_id = scope[relation + "ScopeId"]
            if target_id is None:
                continue
            if target_id not in scopes or target_id == ident:
                raise CommissioningError("Select a distinct existing original related record scope")
            target = scopes[target_id]
            required_kind = _SCOPE_OWNER[scope["kind"]] if relation == "owner" else scope["kind"]
            if target["kind"] != required_kind:
                raise CommissioningError("The native record relationship has an incompatible object kind")
            if scope["objectMatched"] and target["objectMatched"]:
                pointer = scope[relation + "Pointer"]
                _joined_pointer(scope["pointer"], pointer)
                present, original_id = _pointer(scope["_record"], pointer)
                if not present or _json(original_id) != _json(target["objectId"]):
                    raise CommissioningError("The original record's related ID differs from the selected related record")
                scope[relation + "Matched"] = True
    def project_of(scope, seen):
        if not scope["objectMatched"]:
            return None
        if scope["id"] in seen:
            raise CommissioningError("The native owner-record chain contains a cycle")
        if scope["kind"] == "project":
            return scope["objectId"]
        if not scope["ownerMatched"]:
            return None
        return project_of(scopes[scope["ownerScopeId"]], seen | {scope["id"]})
    for scope in scopes.values():
        scope["projectId"] = project_of(scope, set())
    return scopes


def _selected_scope(scopes, ident, kind, object_id):
    if ident is None:
        return None
    _id(ident, "Selected record scope")
    if ident not in scopes:
        raise CommissioningError("Select a declared original record scope")
    scope = scopes[ident]
    if scope["kind"] != kind:
        raise CommissioningError("The selected native record scope has another object kind")
    if scope["objectId"] is not None and _json(object_id) != _json(scope["objectId"]):
        raise CommissioningError("The selected native object ID and record scope disagree")
    return scope


def _fact_in_scope(fact, scope, *, identity=False):
    if fact is None:
        return
    _object(fact, {"evidenceId", "pointer", "expectedPresent", "expectedValue", "scopeId"}, name="evidence fact")
    if scope is None:
        if fact["scopeId"] is not None:
            raise CommissioningError("Select the same original scope for the subject and its supporting fact")
        return
    if fact["scopeId"] != scope["id"]:
        raise CommissioningError("Supporting facts must select the subject's exact original record scope")
    if identity and scope["pointer"] is not None and scope["idPointer"] is not None:
        if fact["pointer"] != _joined_pointer(scope["pointer"], scope["idPointer"]):
            raise CommissioningError("Use the identity field of that exact native record scope")


def _state_binding(state, kind, binding, fact):
    allowed = {"approval": {"unknown", "draft", "submitted", "approved", "rejected"},
               "period": {"unknown", "locked", "unlocked"},
               "permission": {"unknown", "allowed", "denied"}}
    _enum(state, allowed[kind], "declared " + kind + " state")
    if binding is None:
        return {"encoding": None, "state": state, "nativeValue": None,
                "stateMapped": False, "observed": False, "basis": "operator interpretation"}
    _object(binding, {"encoding", "nativeValue", "note"}, name="native state binding")
    encodings = {"canonical-text", "unmapped"}
    if kind == "permission":
        encodings.add("permission-boolean")
    if kind == "period":
        encodings.update({"locked-boolean", "unlocked-boolean"})
    encoding = _enum(binding["encoding"], encodings, "native state encoding")
    _text(binding["note"], "State encoding basis", 4000, encoding == "unmapped")
    raw = binding["nativeValue"]
    reference = fact["reference"]
    if reference is not None and (not reference["expectedPresent"] or
            _json(raw) != _json(reference["expectedValue"])):
        raise CommissioningError("The state binding's native value differs from the exact observed fact")
    decoded = None
    if encoding == "canonical-text" and isinstance(raw, str) and raw in allowed[kind]:
        decoded = raw
    elif encoding in ("permission-boolean", "locked-boolean", "unlocked-boolean"):
        if type(raw) is not bool:
            raise CommissioningError("The explicitly selected native boolean encoding needs an original boolean")
        pair = {"permission-boolean": ("denied", "allowed"),
                "locked-boolean": ("unlocked", "locked"),
                "unlocked-boolean": ("locked", "unlocked")}[encoding]
        decoded = pair[int(raw)]
    if decoded is not None and decoded != state:
        raise CommissioningError("The declared state contradicts the selected native value encoding")
    return {"encoding": encoding, "state": state, "nativeValue": deepcopy(raw),
            "stateMapped": decoded is not None, "observed": decoded is not None and
                state != "unknown" and fact["valueMatched"],
            "note": binding["note"],
            "basis": "scoped original observation" if decoded is not None and fact["valueMatched"]
                     else "operator interpretation; native state unestablished"}


def _fact(value, records, loaded, scopes):
    if value is None:
        return {"status": "unknown", "bytesVerified": False, "valueMatched": False,
                "reference": None}
    _object(value, {"evidenceId", "pointer", "expectedPresent", "expectedValue", "scopeId"}, name="evidence fact")
    ident = _id(value["evidenceId"], "Fact evidence ID")
    if ident not in records:
        raise CommissioningError("A fact references evidence outside the selected original set")
    if type(value["expectedPresent"]) is not bool:
        raise CommissioningError("Fact presence must be an explicit boolean")
    if not value["expectedPresent"] and value["expectedValue"] is not None:
        raise CommissioningError("An absent field retains expectedValue null")
    pointer = value["pointer"]
    if pointer is not None:
        _pointer({}, pointer)  # syntax check without accepting a missing source
    scope_id = value["scopeId"]
    if scope_id is not None:
        _id(scope_id, "Fact record scope ID")
    if scope_id is not None and scope_id not in scopes:
        raise CommissioningError("A fact names an undeclared original record scope")
    scope = scopes.get(scope_id)
    if scope is not None:
        if scope["evidenceId"] is not None and scope["evidenceId"] != ident:
            raise CommissioningError("Supporting facts must use the exact original scoped evidence file")
        if pointer is not None and scope["pointer"] is not None and not (
                pointer == scope["pointer"] or pointer.startswith(scope["pointer"] + "/")):
            raise CommissioningError("The selected fact is outside its original native record scope")
    actual = loaded.get(ident)
    base = {"reference": deepcopy(value), "evidence": deepcopy(records[ident]),
            "bytesVerified": actual is not None, "rawValueMatched": False,
            "scopeMatched": bool(scope and scope["objectMatched"]), "valueMatched": False}
    if actual is None:
        return {**base, "status": "unverified-reference"}
    if pointer is None or records[ident]["kind"] != "rsr-json":
        return {**base, "status": "verified-file-manual-interpretation"}
    present, observed = _pointer(actual["json"], pointer)
    same = present == value["expectedPresent"] and (
        not present or _json(observed) == _json(value["expectedValue"]))
    if not same:
        raise CommissioningError("An observed RSR field differs from its original selected JSON fact")
    scoped = bool(scope and scope["objectMatched"] and scope["pointer"] is not None)
    return {**base, "status": "original-json-fact-matched" if scoped else "original-json-fact-unscoped",
            "rawValueMatched": True, "valueMatched": scoped}


def _observation(value, records, loaded, scopes):
    _object(value, {"presence", "value", "fact"}, name="field observation")
    presence = _enum(value["presence"], {"unknown", "absent", "present"}, "field presence")
    if presence != "present" and value["value"] is not None:
        raise CommissioningError("Absent or unknown field values stay null")
    fact = _fact(value["fact"], records, loaded, scopes)
    if value["fact"] is not None and presence != "unknown":
        if value["fact"]["expectedPresent"] != (presence == "present"):
            raise CommissioningError("Field presence and selected evidence fact disagree")
        if presence == "present" and _json(value["value"]) != _json(value["fact"]["expectedValue"]):
            raise CommissioningError("Field value and selected evidence fact disagree")
    # A literal empty string is empty; zero, whitespace and null are never guessed empty.
    occupancy = ("unknown" if presence == "unknown" else
                 "absent" if presence == "absent" else
                 "empty-string" if value["value"] == "" else
                 "null-needs-native-meaning" if value["value"] is None else "populated")
    return {"presence": presence, "value": deepcopy(value["value"]),
            "occupancy": occupancy, "fact": fact}


def _source_index(preview):
    _object(preview, {"definition", "projections", "report"}, name="original Results preview")
    report = preview["report"]
    if report.get("schema") != "stellar-forge.iati-results-report.v1":
        raise CommissioningError("Use the actual original Results report")
    rows, activities, actuals = {}, {}, {}
    def add(row, kind, activity_key):
        key = _hex(row.get("key"), "Original " + kind + " key")
        if key in rows:
            raise CommissioningError("The native selected report repeats an original subject key")
        rows[key] = {"kind": kind, "activityKey": activity_key, "row": row}
    for activity in report["activities"]:
        add(activity, "activity", activity["key"])
        activities[activity["key"]] = activity
    for result in report["results"]:
        add(result, "result", result["activityKey"])
    for indicator in report["indicators"]:
        activity_key = indicator["activityKey"]
        add(indicator, "indicator", activity_key)
        for baseline in indicator["baselines"]:
            add(baseline, "baseline", activity_key)
        for period in indicator["periods"]:
            add(period, "period", activity_key)
            for target in period["targets"]:
                add(target, "target", activity_key)
            for actual in period["actuals"]:
                add(actual, "actual", activity_key)
                actuals[actual["key"]] = (indicator, period, actual)
    return rows, activities, actuals


def _source_pins(document, preview):
    selected = {}
    for pin in _array(document["sourcePins"], "source pins", 32):
        _object(pin, {"sourceId", "bytes", "projectionSha256"}, name="original source pin")
        source_id = _hex(pin["sourceId"], "Original source ID")
        _hex(pin["projectionSha256"], "Original projection SHA256")
        _integer(pin["bytes"], "Original source bytes", 256 * 1024 * 1024)
        if source_id in selected:
            raise CommissioningError("Original source pin is repeated")
        selected[source_id] = pin
    actual = {p["source"]["id"]: {"sourceId": p["source"]["id"],
               "bytes": p["source"]["bytes"], "projectionSha256": p["id"]}
              for p in preview["projections"]}
    if selected != actual:
        raise CommissioningError("The commissioning source/projection pins differ from the native selected edition")
    return [deepcopy(actual[key]) for key in sorted(actual)]


def _hierarchy(document, activities, records, loaded, scopes, findings):
    projects, assignments = {}, {}
    for item in _array(document["projects"], "programme projects", 512):
        _object(item, {"id", "parentId", "role", "activityKeys", "recordScopeId", "idFact", "parentFact", "note"}, name="programme project")
        ident = _native_id(item["id"], "Original RSR project ID")
        if ident in projects:
            raise CommissioningError("The selected hierarchy repeats an RSR project")
        parent = _nullable_id(item["parentId"], "Original parent project ID")
        if parent == ident:
            raise CommissioningError("A programme project cannot be its own parent")
        _enum(item["role"], {"core", "contributing", "sub-contributing", "standalone", "unknown"}, "project role")
        _text(item["note"], "Project mapping basis", 4000, True)
        keys = _distinct_strings(item["activityKeys"], "Original activity keys")
        for key in keys:
            if key not in activities:
                raise CommissioningError("A project maps an activity outside the selected source coverage")
            assignments.setdefault(key, []).append(ident)
        project_scope = _selected_scope(scopes, item["recordScopeId"], "project", ident)
        _fact_in_scope(item["idFact"], project_scope, identity=True)
        _fact_in_scope(item["parentFact"], project_scope)
        id_fact = _fact(item["idFact"], records, loaded, scopes)
        parent_fact = _fact(item["parentFact"], records, loaded, scopes)
        if item["idFact"] is not None and (not item["idFact"]["expectedPresent"] or
                _json(item["idFact"]["expectedValue"]) != _json(ident)):
            raise CommissioningError("The native project ID and selected ID fact disagree")
        if item["parentFact"] is not None and (
                (parent is not None and not item["parentFact"]["expectedPresent"]) or
                _json(item["parentFact"]["expectedValue"]) != _json(parent)):
            raise CommissioningError("The declared parent ID and selected parent fact disagree")
        projects[ident] = {**deepcopy(item), "idEvidence": id_fact,
                          "parentEvidence": parent_fact,
                          "roleMeaning": "Explicit operator mapping; not a new native role"}
        parent_link_matched = parent is None
        if parent is not None and project_scope and project_scope["parentMatched"]:
            parent_link_matched = _json(scopes[project_scope["parentScopeId"]]["objectId"]) == _json(parent)
            if not parent_link_matched:
                raise CommissioningError("The declared project parent differs from its scoped original parent relationship")
        projects[ident]["parentLinkMatched"] = parent_link_matched
        if not (id_fact["valueMatched"] and parent_fact["valueMatched"] and parent_link_matched):
            findings.append(_issue("hierarchy-evidence-unmatched", ident,
                "The declared project/parent mapping is retained without complete matching original JSON facts."))
    for ident, item in projects.items():
        parent = item["parentId"]
        if parent is not None and parent not in projects:
            raise CommissioningError("Select the complete declared parent chain; a parent is missing")
        seen, cursor = set(), ident
        while cursor is not None:
            if cursor in seen:
                raise CommissioningError("The declared programme hierarchy contains a cycle")
            seen.add(cursor)
            cursor = projects[cursor]["parentId"]
        if item["role"] in ("core", "standalone") and parent is not None:
            findings.append(_issue("project-role-parent", ident,
                "This core or standalone label has a parent; confirm the selected native hierarchy."))
        if item["role"] in ("contributing", "sub-contributing") and parent is None:
            findings.append(_issue("project-role-parent-unknown", ident,
                "This contribution has no selected parent; its programme relationship remains unresolved."))
    for key in activities:
        linked = assignments.get(key, [])
        if len(linked) != 1:
            findings.append(_issue("activity-project-unresolved", key,
                "The source activity needs an explicit unambiguous native project mapping.",
                details={"projectIds": linked}))
    cores = [ident for ident, item in projects.items() if item["role"] == "core"]
    if len(cores) > 1:
        findings.append(_issue("multiple-core-projects", document["programme"]["id"],
            "More than one core project is declared; retain the separate programme boundaries.",
            details={"projectIds": cores}))
    return projects, assignments


ALWAYS = {("result", "title"), ("result", "type"), ("result", "aggregation-status"),
          ("disaggregation", "title"), ("disaggregation", "value-name")}
EMPTY_ONLY = {("result", "description"),
              *{("indicator", field) for field in (
                  "title", "description", "baseline-year", "baseline-value",
                  "baseline-comment", "dimension", "dimension-value")},
              *{("period", field) for field in ("target-value", "target-comment", "actual-comment")}}
FIELDS = {
    "result": {"title", "type", "aggregation-status", "description"},
    "indicator": {"title", "description", "baseline-year", "baseline-value",
                  "baseline-comment", "dimension", "dimension-value"},
    "period": {"target-value", "target-comment", "actual-value", "actual-comment",
               "start", "end", "locked"},
    "disaggregation": {"title", "value-name"},
}


def _field_rule(entity, field, action, child, record_presence):
    if action == "inspect":
        return "inspection-only"
    if action == "child-change":
        return "explicit-child-change-needs-native-permission"
    if action == "initial-inherit":
        return ("target-not-inherited" if entity == "period" and field == "target-value"
                else "initial-framework-inheritance-needs-selected-native-evidence")
    if action == "reimport":
        if record_presence == "present":
            return "existing-child-records-and-data-preserved"
        if record_presence == "absent" and entity == "result":
            return "missing-parent-result-may-import"
        return "reimport-needs-native-result-identity"
    if (entity, field) in ALWAYS:
        return "parent-change-propagates"
    if (entity, field) in EMPTY_ONLY:
        if child["occupancy"] in ("absent", "empty-string"):
            return "parent-change-copies-to-empty-child"
        if child["occupancy"] == "populated":
            return "populated-child-value-preserved"
        return "child-emptiness-needs-native-evidence"
    return "no-general-inheritance-rule"


def _field_reviews(document, rows, projects, assignments, records, loaded, scopes, findings):
    output, seen = [], set()
    for item in _array(document["fields"], "field mappings", 20000):
        _object(item, {"id", "projectId", "subjectKey", "entity", "objectId",
                       "parentObjectId", "recordScopeId", "parentScopeId", "recordPresence", "recordFact", "field", "action", "child", "parent",
                       "permission", "note"}, name="field mapping")
        ident = _id(item["id"], "Field mapping ID")
        if ident in seen:
            raise CommissioningError("Field mapping ID is repeated")
        seen.add(ident)
        project = _native_id(item["projectId"], "Field original RSR project")
        if project not in projects:
            raise CommissioningError("A field mapping names an undeclared original project")
        subject = rows.get(item["subjectKey"])
        if subject is None:
            raise CommissioningError("Field mapping is outside the selected original Results subjects")
        if project not in assignments.get(subject["activityKey"], []):
            raise CommissioningError("Field subject and explicit activity/project mapping disagree")
        entity = _enum(item["entity"], set(FIELDS), "field entity")
        allowed_subjects = {"result": {"result"}, "indicator": {"indicator", "baseline"},
                            "period": {"period", "target", "actual"},
                            "disaggregation": {"indicator", "baseline", "target", "actual"}}
        if subject["kind"] not in allowed_subjects[entity]:
            raise CommissioningError("RSR field entity is incompatible with the selected source subject")
        field = _enum(item["field"], FIELDS[entity], "field name")
        action = _enum(item["action"], {"inspect", "initial-inherit", "parent-change", "reimport", "child-change"}, "field action")
        _nullable_id(item["objectId"], "Original RSR object ID")
        _nullable_id(item["parentObjectId"], "Original RSR parent object ID")
        record_scope = _selected_scope(scopes, item["recordScopeId"], entity, item["objectId"])
        parent_scope = _selected_scope(scopes, item["parentScopeId"], entity, item["parentObjectId"])
        _object(item["child"], {"presence", "value", "fact"}, name="child field observation")
        _object(item["parent"], {"presence", "value", "fact"}, name="parent field observation")
        _object(item["permission"], {"state", "fact", "binding"}, name="declared native permission")
        _fact_in_scope(item["recordFact"], record_scope, identity=item["recordPresence"] == "present")
        _fact_in_scope(item["child"]["fact"], record_scope)
        _fact_in_scope(item["parent"]["fact"], parent_scope)
        _fact_in_scope(item["permission"]["fact"], record_scope)
        record_presence = _enum(item["recordPresence"], {"unknown", "absent", "present"}, "original child-record presence")
        if record_presence == "present" and item["objectId"] is None:
            raise CommissioningError("A present child record needs its original native object ID")
        if record_presence == "absent" and item["objectId"] is not None:
            raise CommissioningError("An absent child record cannot have a selected existing object ID")
        record_fact = _fact(item["recordFact"], records, loaded, scopes)
        if item["recordFact"] is not None and record_presence != "unknown":
            if item["recordFact"]["expectedPresent"] != (record_presence == "present"):
                raise CommissioningError("Child-record presence and selected original evidence disagree")
            if record_presence == "present" and _json(item["recordFact"]["expectedValue"]) != _json(item["objectId"]):
                raise CommissioningError("Child-record ID and selected original evidence disagree")
        _text(item["note"], "Field review basis", 4000, True)
        child = _observation(item["child"], records, loaded, scopes)
        parent = _observation(item["parent"], records, loaded, scopes)
        permission = _object(item["permission"], {"state", "fact", "binding"}, name="declared native permission")
        _enum(permission["state"], {"unknown", "allowed", "denied"}, "declared permission")
        permission_fact = _fact(permission["fact"], records, loaded, scopes)
        permission_state = _state_binding(permission["state"], "permission", permission["binding"], permission_fact)
        record_project_matched = bool(record_scope and record_scope["projectId"] is not None and
                                      _json(record_scope["projectId"]) == _json(project))
        if record_scope and record_scope["projectId"] is not None and not record_project_matched:
            raise CommissioningError("The original scoped field belongs to another native project")
        rule = _field_rule(entity, field, action, child, record_presence)
        reasons = []
        if action != "inspect":
            if item["objectId"] is None:
                reasons.append("original-object-id-unknown")
            if permission["state"] != "allowed" or not permission_state["observed"] or not record_project_matched:
                reasons.append("native-object-permission-needs-confirmation")
            if not record_project_matched:
                reasons.append("original-record-project-link-unverified")
            if action in ("initial-inherit", "parent-change", "reimport") and not (
                    record_scope and parent_scope and record_scope["parentMatched"] and
                    record_scope["parentScopeId"] == parent_scope["id"]):
                reasons.append("original-record-parent-link-unverified")
            if parent_scope and parent_scope["projectId"] is not None and (
                    _json(parent_scope["projectId"]) != _json(projects[project]["parentId"])):
                raise CommissioningError("The selected parent field belongs to another programme parent project")
            if action in ("initial-inherit", "parent-change", "reimport") and (
                    projects[project]["parentId"] is None or item["parentObjectId"] is None):
                reasons.append("original-parent-link-unknown")
            if action == "parent-change" and not parent["fact"]["valueMatched"]:
                reasons.append("original-parent-field-unverified")
            if action == "parent-change" and not child["fact"]["valueMatched"]:
                reasons.append("original-child-field-unverified")
            if action == "reimport" and not record_fact["valueMatched"]:
                reasons.append("original-child-record-presence-unverified")
            if rule in ("child-emptiness-needs-native-evidence", "no-general-inheritance-rule",
                        "initial-framework-inheritance-needs-selected-native-evidence",
                        "reimport-needs-native-result-identity"):
                reasons.append("field-specific-native-rule-needs-review")
        if reasons:
            findings.append(_issue("field-authority-review", ident,
                "Retain the current child and parent observations before any separately authorized native change.",
                details={"reasons": reasons, "rule": rule}))
        output.append({"id": ident, "projectId": project, "subjectKey": item["subjectKey"],
            "source": subject["row"]["source"], "sourceSubjectSha256": _sha(subject["row"], MAX_PREVIEW_BYTES),
            "entity": entity, "field": field, "action": action,
            "objectId": item["objectId"], "parentObjectId": item["parentObjectId"],
            "recordPresence": record_presence, "recordEvidence": record_fact,
            "recordScopeId": item["recordScopeId"], "parentScopeId": item["parentScopeId"],
            "declaredParentProjectId": projects[project]["parentId"],
            "child": child, "parent": parent,
            "permission": {"state": permission["state"], "evidence": permission_fact,
                           "stateBinding": permission_state},
            "rule": rule, "reasons": reasons, "note": item["note"],
            "nativeMutationPrepared": False})
    return output


def _value_reviews(document, actuals, projects, assignments, records, loaded, scopes, findings):
    declared = {}
    for item in _array(document["values"], "approval and contribution mappings", 100000):
        _object(item, {"valueKey", "projectId", "objectId", "coreIndicatorId",
                       "recordScopeId", "periodScopeId", "periodObjectId",
                       "approval", "approvalFact", "approvalBinding", "periodState", "periodFact", "periodBinding",
                       "contributionRole", "aggregateGroup", "includesValueKeys", "note"},
                name="original actual-value mapping")
        key = _hex(item["valueKey"], "Original actual key")
        if key in declared or key not in actuals:
            raise CommissioningError("Map each selected original actual at most once")
        indicator, period, original = actuals[key]
        project = _nullable_id(item["projectId"], "Approval original project ID")
        if project is not None and (project not in projects or
                project not in assignments.get(indicator["activityKey"], [])):
            raise CommissioningError("An approval project differs from the explicit original activity mapping")
        _nullable_id(item["objectId"], "Original RSR actual ID")
        _nullable_id(item["coreIndicatorId"], "Original RSR core indicator ID")
        _enum(item["approval"], {"unknown", "draft", "submitted", "approved", "rejected"}, "observed approval")
        _enum(item["periodState"], {"unknown", "locked", "unlocked"}, "observed period state")
        _enum(item["contributionRole"], {"unknown", "standalone", "component", "aggregate"}, "contribution role")
        _nullable_id(item["aggregateGroup"], "Explicit aggregate group")
        included = _distinct_strings(item["includesValueKeys"], "Included original actual keys")
        if key in included or any(k not in actuals for k in included):
            raise CommissioningError("An aggregate must name other selected original actuals")
        if included and item["contributionRole"] != "aggregate":
            raise CommissioningError("Only an explicit reported aggregate declares included components")
        _text(item["note"], "Approval/contribution review basis", 4000, True)
        value_scope = _selected_scope(scopes, item["recordScopeId"], "actual", item["objectId"])
        _nullable_id(item["periodObjectId"], "Original RSR period object ID")
        period_scope = _selected_scope(scopes, item["periodScopeId"], "period", item["periodObjectId"])
        _fact_in_scope(item["approvalFact"], value_scope)
        _fact_in_scope(item["periodFact"], period_scope)
        scope_project_matched = bool(project is not None and value_scope and value_scope["projectId"] is not None and
                                     _json(value_scope["projectId"]) == _json(project))
        if value_scope and value_scope["projectId"] is not None and project is not None and not scope_project_matched:
            raise CommissioningError("The selected approval record belongs to another native project")
        scope_period_matched = bool(value_scope and period_scope and value_scope["ownerMatched"] and
                                    value_scope["ownerScopeId"] == period_scope["id"])
        if value_scope and period_scope and value_scope["ownerMatched"] and not scope_period_matched:
            raise CommissioningError("The selected approval and period facts belong to different native periods")
        approval_fact = _fact(item["approvalFact"], records, loaded, scopes)
        period_fact = _fact(item["periodFact"], records, loaded, scopes)
        approval_state = _state_binding(item["approval"], "approval", item["approvalBinding"], approval_fact)
        period_state = _state_binding(item["periodState"], "period", item["periodBinding"], period_fact)
        declared[key] = {**deepcopy(item), "approvalEvidence": approval_fact, "periodEvidence": period_fact,
                         "approvalStateBinding": approval_state, "periodStateBinding": period_state,
                         "recordProjectMatched": scope_project_matched, "recordPeriodMatched": scope_period_matched}
    output = []
    for key, (indicator, period, original) in actuals.items():
        item = declared.get(key)
        if item is None:
            item = {"valueKey": key, "projectId": None, "objectId": None, "coreIndicatorId": None,
                "recordScopeId": None, "periodScopeId": None, "periodObjectId": None,
                "approval": "unknown", "approvalFact": None, "approvalBinding": None,
                "periodState": "unknown", "periodFact": None, "periodBinding": None,
                "approvalStateBinding": {"observed": False}, "periodStateBinding": {"observed": False},
                "recordProjectMatched": False, "recordPeriodMatched": False,
                "contributionRole": "unknown", "aggregateGroup": None, "includesValueKeys": [], "note": "",
                "approvalEvidence": _fact(None, records, loaded, scopes), "periodEvidence": _fact(None, records, loaded, scopes)}
        original_context = {"source": original["source"], "originalSha256": original["originalSha256"],
            "activityKey": indicator["activityKey"], "indicatorKey": indicator["key"],
            "periodKey": period["key"], "periodStart": period["start"], "periodEnd": period["end"],
            "rawValuePresent": "value" in original["attributes"], "rawValue": original["rawValue"],
            "dimensions": deepcopy(original["dimensions"]), "locations": deepcopy(original["locations"]),
            "contextKey": original["contextKey"]}
        output.append({**item, "original": original_context,
            "approvalObservedFromVerifiedJSON": item["approvalStateBinding"]["observed"] and item["recordProjectMatched"],
            "periodStateObservedFromVerifiedJSON": item["periodStateBinding"]["observed"] and
                                                  item["recordProjectMatched"] and item["recordPeriodMatched"]})
        if item["approval"] != "unknown" and not output[-1]["approvalObservedFromVerifiedJSON"]:
            findings.append(_issue("approval-evidence-unverified", key,
                "The declared RSR approval is retained as an interpretation without a matching original JSON fact."))
        if item["contributionRole"] == "component" and (item["approval"] != "approved" or
                not output[-1]["approvalObservedFromVerifiedJSON"]):
            findings.append(_issue("contribution-approval-unresolved", key,
                "Upward programme aggregation requires approved contribution data; this record does not establish that state."))
        if item["contributionRole"] in ("component", "aggregate") and item["coreIndicatorId"] is None:
            findings.append(_issue("core-indicator-link-unknown", key,
                "Retain the explicit native core-indicator lineage before interpreting programme aggregation."))
    indexed = {item["valueKey"]: item for item in output}
    for item in output:
        key = item["valueKey"]
        for included_key in item["includesValueKeys"]:
            child = indexed[included_key]
            reasons = []
            if child["contributionRole"] != "component":
                reasons.append("included-record-is-not-declared-component")
            if item["coreIndicatorId"] is None or item["coreIndicatorId"] != child["coreIndicatorId"]:
                reasons.append("core-indicator-lineage-unresolved")
            if item["original"]["contextKey"] != child["original"]["contextKey"]:
                reasons.append("original-disaggregation-or-location-differs")
            if (item["original"]["periodStart"], item["original"]["periodEnd"]) != (
                    child["original"]["periodStart"], child["original"]["periodEnd"]):
                reasons.append("original-period-differs")
            cursor = child["projectId"]
            ancestors = []
            while cursor is not None:
                ancestors.append(cursor)
                cursor = projects[cursor]["parentId"] if cursor in projects else None
            if item["projectId"] is None or item["projectId"] not in ancestors[1:]:
                reasons.append("explicit-project-ancestry-unresolved")
            findings.append(_issue("aggregate-and-component-retained", key,
                "The reported parent aggregate and this component are both selected; keep them separate and do not add them.",
                details={"includedValueKey": included_key, "reviewReasons": reasons}))
    groups = {}
    for item in output:
        if item["aggregateGroup"] is not None:
            groups.setdefault(item["aggregateGroup"], []).append(item)
    for group, items in groups.items():
        if any(v["contributionRole"] == "aggregate" for v in items) and any(
                v["contributionRole"] == "component" for v in items):
            findings.append(_issue("aggregate-group-overlap", group,
                "This explicitly selected group contains both reported totals and components; no combined total is produced.",
                details={"valueKeys": [v["valueKey"] for v in items]}))
    return output


def _document(value):
    _object(value, {"schema", "programme", "definition", "sourcePins", "evidence", "recordScopes",
                    "projects", "fields", "values"}, name="commissioning document")
    if value["schema"] != SCHEMA:
        raise CommissioningError("Use the original programme commissioning schema")
    _object(value["programme"], {"id", "title", "organisationRef", "note"}, name="programme")
    _id(value["programme"]["id"], "Selected programme reference")
    _text(value["programme"]["title"], "Programme title", 500)
    _text(value["programme"]["organisationRef"], "Programme organisation reference", 200, True)
    _text(value["programme"]["note"], "Programme basis", 8000, True)
    _object(value["definition"], {"name", "sources"},
            {"notes", "selection", "interpretations", "bindings", "review"}, name="original Results definition")
    # Validate an exact serializable input before making any original projection call.
    _json(value)
    return deepcopy(value)



def load_commissioning_bytes(raw):
    """Parse a bounded original document without duplicate-key or UTF-8 repair."""
    if not isinstance(raw, bytes) or len(raw) > MAX_DOCUMENT_BYTES:
        raise CommissioningError("Select complete commissioning JSON bytes within 16 MiB")
    try:
        value = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=_no_duplicate_keys,
                           parse_constant=lambda _: (_ for _ in ()).throw(
                               CommissioningError("Commissioning JSON has a non-finite number")))
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise CommissioningError("Use the complete original valid commissioning JSON") from exc
    return _document(value)


def new_commissioning_document(results, definition, programme):
    """Start a draft using actual native source pins and caller-selected programme.

    This selects no hierarchy, permission, approval, unit or numeric binding.
    The original definition is the caller's existing explicit Results selection.
    """
    native = results.preview(deepcopy(definition))
    document = {"schema": SCHEMA, "programme": deepcopy(programme),
                "definition": deepcopy(native["definition"]),
                "sourcePins": [{"sourceId": p["source"]["id"], "bytes": p["source"]["bytes"],
                                "projectionSha256": p["id"]} for p in native["projections"]],
                "evidence": [], "recordScopes": [], "projects": [], "fields": [], "values": []}
    return _document(document)


def preview_commissioning(results, document, *, evidence_files=None):
    """Validate a complete commissioning document against original Results.preview.

    evidence_files is an optional id -> complete bytes mapping from the caller's
    existing private file store. Its absence never becomes approval or authority.
    Original Results.preview may retain its normal derived source projection.
    """
    document = _document(document)
    input_sha = _sha(document)
    records, loaded = _evidence(document, evidence_files)
    scopes = _scopes(document, records, loaded)
    native = results.preview(deepcopy(document["definition"]))
    pins = _source_pins(document, native)
    rows, activities, actuals = _source_index(native)
    findings = []
    projects, assignments = _hierarchy(document, activities, records, loaded, scopes, findings)
    fields = _field_reviews(document, rows, projects, assignments, records, loaded, scopes, findings)
    values = _value_reviews(document, actuals, projects, assignments, records, loaded, scopes, findings)
    counts = {"activities": len(activities), "declaredProjects": len(projects), "fields": len(fields),
              "actuals": len(values), "approval": dict(Counter(v["approval"] for v in values)),
              "verifiedJSONApprovalObservations": sum(v["approvalObservedFromVerifiedJSON"] for v in values),
              "unknownApproval": sum(v["approval"] == "unknown" for v in values),
              "findings": len(findings), "nativeProviderMutations": 0}
    value = {"schema": PREVIEW, "inputSha256": input_sha, "document": document,
             "contract": deepcopy(CONTRACT), "sourcePins": pins, "nativePreview": native,
             "review": {"programme": document["programme"], "projects": list(projects.values()),
                "recordScopes": [{k: v for k, v in item.items() if k != "_record"} for item in scopes.values()],
                "fields": fields, "values": values, "findings": findings, "counts": counts,
                "evidence": [{**item, "bytesVerified": ident in loaded}
                             for ident, item in records.items()],
                "meaning": "Local commissioning interpretation; no RSR permission, approval, unlock or aggregate is created."}}
    value["sha256"] = _sha(value, MAX_PREVIEW_BYTES)
    return value


def prepare_results_request(results, document, *, expected_preview_sha256, request_id,
                            project_id=None, expected_revision=None, evidence_files=None):
    """Emit the unchanged native Results.save payload after exact preview review.

    Persist this payload in the original caller journal BEFORE results.save.
    On recovery, replay that retained native payload before preparing anything new.
    """
    _hex(expected_preview_sha256, "Reviewed commissioning preview SHA256")
    if not isinstance(request_id, str) or not REQUEST.fullmatch(request_id):
        raise CommissioningError("Use the exact original Results request ID")
    if (project_id is None) != (expected_revision is None):
        raise CommissioningError("An edit needs the exact original project and expected revision together")
    if project_id is not None:
        _hex(project_id, "Original Results project ID")
        _integer(expected_revision, "Original Results revision", 2**63 - 1, 1)
    checked = preview_commissioning(results, document, evidence_files=evidence_files)
    if checked["sha256"] != expected_preview_sha256:
        raise CommissioningError("The exact reviewed commissioning source/evidence selection changed")
    payload = deepcopy(checked["nativePreview"]["definition"])
    note = payload.get("notes", "")
    reference = ("\n\n[Programme commissioning]\n"
                 "document_sha256=" + checked["inputSha256"] + "\n"
                 "preview_sha256=" + checked["sha256"] + "\n"
                 "Local review only; original RSR authority and approval remain separate.")
    if len(note + reference) > 16000:
        raise CommissioningError("Reserve space within original Results notes for the commissioning source reference")
    payload["notes"] = note + reference
    payload["requestId"] = request_id
    if project_id is not None:
        payload["id"], payload["expectedRevision"] = project_id, expected_revision
    return payload


def _verified_preview(value):
    if (not isinstance(value, dict) or value.get("schema") != PREVIEW
            or not HEX.fullmatch(str(value.get("sha256", "")))):
        raise CommissioningError("Select a complete retained commissioning preview")
    if value["sha256"] != _sha({k: v for k, v in value.items() if k != "sha256"}, MAX_PREVIEW_BYTES):
        raise CommissioningError("A retained commissioning preview changed")
    if value.get("inputSha256") != _sha(value["document"]):
        raise CommissioningError("The preview lost its complete original input identity")
    return value


def compare_commissioning(before, after):
    """Retain all commissioning changes; no source mapping or head is applied."""
    before, after = _verified_preview(before), _verified_preview(after)
    changes = []
    def visit(path, left_present, left, right_present, right):
        if not left_present or not right_present:
            changes.append({"path": path, "beforePresent": left_present, "before": deepcopy(left),
                            "afterPresent": right_present, "after": deepcopy(right)})
        elif isinstance(left, dict) and isinstance(right, dict):
            for key in sorted(set(left) | set(right)):
                token = key.replace("~", "~0").replace("/", "~1")
                visit(path + "/" + token, key in left, left.get(key), key in right, right.get(key))
        elif _json(left, MAX_PREVIEW_BYTES) != _json(right, MAX_PREVIEW_BYTES):
            changes.append({"path": path, "beforePresent": True, "before": deepcopy(left),
                            "afterPresent": True, "after": deepcopy(right)})
    for section in ("programme", "definition", "sourcePins", "evidence", "recordScopes", "projects", "fields", "values"):
        visit("/" + section, True, before["document"][section], True, after["document"][section])
    value = {"schema": COMPARISON, "beforeSha256": before["sha256"], "afterSha256": after["sha256"],
             "sourceSelectionChanged": before["sourcePins"] != after["sourcePins"],
             "nativeReportChanged": before["nativePreview"]["report"]["reportSha256"] !=
                                    after["nativePreview"]["report"]["reportSha256"],
             "evidenceVerificationChanged": before["review"]["evidence"] != after["review"]["evidence"],
             "changes": changes, "changeCount": len(changes),
             "meaning": "Complete declared commissioning changes; list order and original values are retained."}
    value["sha256"] = _sha(value, MAX_PREVIEW_BYTES)
    return value
