"""MIT. Complete defect-support operations in the original portfolio SQLite workspace."""
from __future__ import annotations

from pathlib import Path
import datetime as dt
import json

from domain import InputError, canonical, digest, identifier, now, operation, require, sha, shape, short
from support_domain import (
    SCHEMA, CLASSIFICATIONS, SEVERITIES, OPEN_STATES, acknowledgement_due, add_months,
    calendar_spec, clone, clock_status, date_value, entitlement, evidence, instant,
    portfolio_ref, public_summary, record_ref, timestamp,
)

HERE = Path(__file__).resolve().parent
ACTIONS = (
    "support.contract.save", "support.contract.acceptance",
    "support.issue.open", "support.issue.triage", "support.issue.acknowledge",
    "support.issue.plan", "support.issue.workaround", "support.issue.correction",
    "support.issue.validate", "support.issue.close", "support.issue.reopen",
    "support.issue.note", "support.issue.clock-review",
    "support.delivery.prepare", "support.delivery.receive",
)


def initialize(workspace):
    with workspace.transaction():
        for sql in (
            "CREATE TABLE IF NOT EXISTS support_contracts(id TEXT NOT NULL,revision INTEGER NOT NULL,body_sha256 TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,revision))",
            "CREATE TABLE IF NOT EXISTS support_issues(id TEXT NOT NULL,revision INTEGER NOT NULL,contract_id TEXT NOT NULL,body_sha256 TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,revision))",
            "CREATE INDEX IF NOT EXISTS support_issues_contract ON support_issues(contract_id,id,revision)",
            "CREATE TABLE IF NOT EXISTS support_events(origin TEXT NOT NULL,operation_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,revision INTEGER NOT NULL,body_sha256 TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(origin,operation_id))",
            "CREATE TABLE IF NOT EXISTS support_deliveries(object TEXT PRIMARY KEY,body TEXT NOT NULL)",
        ):
            workspace.db.execute(sql)


def checked_record(value):
    require(value.get("schema") in (SCHEMA + ".contract", SCHEMA + ".issue"),
            "Select a complete support record")
    sha(value.get("sha256"))
    require(value["sha256"] == digest({k: v for k, v in value.items() if k != "sha256"}),
            "The retained support record changed", "SUPPORT_RECORD_CHANGED", 409)
    identifier(value["id"])
    require(type(value["revision"]) is int and value["revision"] > 0, "Invalid support revision")
    return value


def _record(workspace, kind, ident, revision=None, db=None, *, missing=False):
    identifier(ident)
    require(kind in ("contract", "issue"), "Select contract or issue")
    if revision is not None:
        require(type(revision) is int and revision > 0, "Select a positive support revision")
    if db is None:
        with workspace.reader() as reader:
            return _record(workspace, kind, ident, revision, reader, missing=missing)
    row = db.execute("SELECT body_sha256,body FROM support_" + ("contracts" if kind == "contract" else "issues")
                     + " WHERE id=?" + (" AND revision=?" if revision is not None else "")
                     + " ORDER BY revision DESC LIMIT 1",
                     (ident, revision) if revision is not None else (ident,)).fetchone()
    if row is None:
        require(missing, "The selected support record was not found", "SUPPORT_NOT_FOUND", 404)
        return None
    value = json.loads(row["body"])
    require(value["sha256"] == row["body_sha256"], "The support row identity changed", "SUPPORT_RECORD_CHANGED", 409)
    return checked_record(value)


def contract(workspace, ident, revision=None, db=None):
    return _record(workspace, "contract", ident, revision, db)


def issue(workspace, ident, revision=None, db=None):
    return _record(workspace, "issue", ident, revision, db)


def _expected(previous, expected):
    require(type(expected) is int and expected >= 0, "Retain the inspected support revision")
    require(expected == (previous["revision"] if previous else 0),
            "The support record changed; continue from its current complete revision",
            "SUPPORT_REVISION_CONFLICT", 409)


def _original(workspace, request):
    require(request["inputSha256"] == digest(request["input"])
            and request["input"]["operationId"] == request["id"]
            and request["action"] == request["input"]["action"],
            "Retain the original admitted support operation", "SUPPORT_OPERATION_CHANGED", 409)
    return request["input"]["payload"]


def _at(value, label, recorded_at, *, earliest=None):
    parsed = timestamp(value, label)
    require(parsed <= timestamp(recorded_at) + dt.timedelta(minutes=5),
            label + " cannot describe an unperformed future event")
    if earliest is not None:
        require(parsed >= timestamp(earliest), label + " precedes this report cycle")
    return value


def _portfolio(workspace, selected):
    portfolio_ref(selected)
    actual = workspace.portfolio(selected["id"], selected["revision"])
    require(actual["snapshot"] == selected["snapshot"], "The selected portfolio snapshot changed",
            "SUPPORT_PORTFOLIO_CHANGED", 409)
    return selected


def _release(workspace, selected, portfolio, *, installed=False):
    if selected is None:
        require(not installed, "Select the completed installation used for correction validation")
        return None
    ref = record_ref(selected)
    from dataverse_workspace import record
    from dataverse_contract import identity
    saved = record(workspace, ref["recordId"])
    require(identity(saved) == ref["recordSha256"], "The selected release record changed",
            "SUPPORT_RELEASE_CHANGED", 409)
    require(saved["portfolio"] and saved["portfolio"]["id"] == portfolio["id"]
            and saved["portfolio"]["revision"] <= portfolio["revision"],
            "The release belongs to another portfolio or a later unselected revision",
            "SUPPORT_RELEASE_SCOPE", 409)
    if installed:
        require(saved["kind"] == "import" and saved["value"].get("state") == "COMPLETE"
                and saved["value"].get("target_solution"),
                "Select the actual completed target installation and its verified solution")
    else:
        require(saved["kind"] in ("import", "export", "deployment", "configuration", "delivery", "receiving"),
                "Select the original delivered or installed release record")
    return ref


def _correction(workspace, value, portfolio):
    shape(value, ("correctionId", "operationId", "projectRecordId", "stateVersion", "historySha256"),
          ("correctionId", "operationId", "projectRecordId", "stateVersion", "historySha256"))
    identifier(value["correctionId"]), operation(value["operationId"])
    short(value["projectRecordId"], "Original project record", 300)
    require(type(value["stateVersion"]) is int and value["stateVersion"] >= 0, "Select the retained native history version")
    sha(value["historySha256"])
    resolver = getattr(workspace, "support_correction_resolver", None)
    require(callable(resolver), "Open the composed staff application to resolve this original correction",
            "SUPPORT_CORRECTION_RESOLVER", 409)
    resolved = resolver(clone(value))
    require(isinstance(resolved, dict) and resolved.get("reference") == value
            and isinstance(resolved.get("correction"), dict),
            "The staff correction resolver returned another original record",
            "SUPPORT_CORRECTION_CHANGED", 409)
    if resolved.get("portfolioId") is not None:
        require(resolved["portfolioId"] == portfolio["id"], "The correction belongs to another portfolio")
    return clone(value), clone(resolved["correction"])


def _project(value):
    if value is None:
        return None
    shape(value, ("projectRecordId", "nativeOperationId", "stateVersion", "sourceRefs"),
          ("projectRecordId", "sourceRefs"))
    short(value["projectRecordId"], "Original project record", 300)
    if value.get("nativeOperationId") is not None:
        operation(value["nativeOperationId"])
    if value.get("stateVersion") is not None:
        require(type(value["stateVersion"]) is int and value["stateVersion"] >= 0, "Invalid native history version")
    result = clone(value)
    result["sourceRefs"] = evidence(value["sourceRefs"])
    return result


def validate_action(workspace, value):
    action, payload = value["action"], value["payload"]
    require(action in ACTIONS and isinstance(payload, dict), "Select a supported complete support action")
    short(payload.get("actor"), "Actual operator label", 300)
    if action == "support.delivery.receive":
        shape(payload, ("actor", "object"), ("actor", "object"))
        sha(payload["object"])
    elif action == "support.delivery.prepare":
        shape(payload, ("actor", "contractId", "expectedContractRevision", "delivery"),
              ("actor", "contractId", "expectedContractRevision", "delivery"))
        identifier(payload["contractId"]), record_ref(payload["delivery"])
    elif action.startswith("support.contract."):
        identifier(payload.get("id"))
        require(type(payload.get("expectedContractRevision")) is int and payload["expectedContractRevision"] >= 0,
                "Retain the selected contract revision")
    else:
        identifier(payload.get("id"))
        if action != "support.issue.open":
            require(type(payload.get("expectedIssueRevision")) is int and payload["expectedIssueRevision"] > 0,
                    "Retain the selected issue revision")


def _cycle(received_at, reproduction, severity, selected_contract, source_refs, number):
    return {"number": number, "receivedAt": received_at, "reproduction": reproduction,
            "sourceRefs": clone(source_refs), "contractRevision": selected_contract["revision"],
            "acknowledgementClock": acknowledgement_due(received_at, severity, selected_contract.get("calendar")),
            "clockReviews": [], "acknowledgement": None, "plan": None, "workarounds": [],
            "correction": None, "validation": None, "closure": None}


def _updated(previous, value, request, kind):
    body = clone(value)
    body.pop("sha256", None)
    body.update(schema=SCHEMA + "." + kind, revision=(previous["revision"] if previous else 0) + 1,
                previousSha256=previous["sha256"] if previous else None,
                originWorkspaceId=request["context"]["supportWorkspaceId"],
                operationId=request["id"], inputSha256=request["inputSha256"],
                createdAt=previous["createdAt"] if previous else request["createdAt"],
                updatedAt=request["createdAt"], actor=request["input"]["payload"]["actor"].strip())
    body["sha256"] = digest(body)
    return body


def prepare_action(workspace, original):
    initialize(workspace)
    validate_action(workspace, original["input"])
    payload = _original(workspace, original)
    action, recorded_at = original["action"], original["createdAt"]
    if action == "support.delivery.prepare":
        from support_portable import prepare_delivery
        return prepare_delivery(workspace, original)
    if action == "support.delivery.receive":
        from support_portable import prepare_receiving
        return prepare_receiving(workspace, original)
    context = clone(original)
    context.setdefault("context", {})["supportWorkspaceId"] = workspace.marker["workspaceId"]
    kind = "contract" if action.startswith("support.contract.") else "issue"
    previous = _record(workspace, kind, payload["id"], missing=True)
    _expected(previous, payload.get("expectedContractRevision", 0) if kind == "contract"
              else payload.get("expectedIssueRevision", 0))
    if action == "support.contract.save":
        shape(payload, ("actor", "id", "expectedContractRevision", "portfolio", "label", "serviceOwner",
                        "componentOwners", "calendar", "plannedAcceptanceOn", "sourceRefs"),
              ("actor", "id", "expectedContractRevision", "portfolio", "label", "serviceOwner",
               "componentOwners", "calendar", "plannedAcceptanceOn", "sourceRefs"))
        selected = _portfolio(workspace, payload["portfolio"])
        if previous:
            require(previous["portfolio"]["id"] == selected["id"]
                    and selected["revision"] >= previous["portfolio"]["revision"],
                    "Continue the same contract and its original portfolio history")
        require(isinstance(payload["componentOwners"], dict) and len(payload["componentOwners"]) <= 100,
                "Retain the actual component-to-owner assignment")
        for component, owner in payload["componentOwners"].items():
            short(component, "Component", 200), short(owner, "Component owner", 300)
        date_value(payload["plannedAcceptanceOn"], "Planned final acceptance")
        result = {"id": payload["id"], "portfolio": selected, "label": short(payload["label"], "Contract label", 300),
                  "serviceOwner": short(payload["serviceOwner"], "Service coordinator", 300),
                  "componentOwners": clone(payload["componentOwners"]), "calendar": calendar_spec(payload["calendar"]),
                  "plannedAcceptanceOn": payload["plannedAcceptanceOn"], "warrantyMonths": 12,
                  "acknowledgementBusinessDays": {"critical": 1, "other": 2},
                  "sourceRefs": evidence(payload["sourceRefs"], required=True),
                  "acceptance": clone(previous.get("acceptance")) if previous else None}
    elif action == "support.contract.acceptance":
        require(previous, "Create the service contract before recording its acceptance")
        shape(payload, ("actor", "id", "expectedContractRevision", "acceptedAt", "supportEndsAt", "sourceRefs", "amendmentReason"),
              ("actor", "id", "expectedContractRevision", "acceptedAt", "sourceRefs"))
        if previous.get("acceptance") is not None:
            short(payload.get("amendmentReason"), "Reason for the sourced acceptance amendment", 12000)
        _at(payload["acceptedAt"], "Actual final acceptance", recorded_at)
        end = payload.get("supportEndsAt") or instant(add_months(payload["acceptedAt"], previous["warrantyMonths"]))
        require(timestamp(end) >= add_months(payload["acceptedAt"], previous["warrantyMonths"]),
                "The recorded support term must include the complete twelve-month obligation")
        result = clone(previous)
        result["acceptance"] = {"acceptedAt": payload["acceptedAt"], "supportEndsAt": end,
                                "sourceRefs": evidence(payload["sourceRefs"], required=True),
                                "recordedBy": payload["actor"], "recordedAt": recorded_at,
                                "amendmentReason": payload.get("amendmentReason"),
                                "previousAcceptanceRevision": previous["revision"] if previous.get("acceptance") else None}
    elif action == "support.issue.open":
        require(previous is None, "This original support report already exists", "SUPPORT_ISSUE_EXISTS", 409)
        shape(payload, ("actor", "id", "contractId", "expectedContractRevision", "title", "description",
                        "receivedAt", "severity", "reproduction", "component", "reporter",
                        "affectedRelease", "project", "sourceRefs"),
              ("actor", "id", "contractId", "expectedContractRevision", "title", "description",
               "receivedAt", "severity", "reproduction", "sourceRefs"))
        selected_contract = contract(workspace, payload["contractId"])
        _expected(selected_contract, payload["expectedContractRevision"])
        _at(payload["receivedAt"], "Original report receipt", recorded_at)
        require(payload["severity"] in SEVERITIES, "Select critical or other severity")
        refs = evidence(payload["sourceRefs"])
        result = {"id": payload["id"], "contractId": selected_contract["id"],
                  "title": short(payload["title"], "Report title", 500),
                  "description": short(payload["description"], "Complete report", 30000),
                  "reporter": short(payload.get("reporter", ""), "Reporter", 1000, empty=True),
                  "severity": payload["severity"], "classification": "investigating",
                  "component": short(payload.get("component", ""), "Component", 200, empty=True),
                  "owner": "", "state": "received", "sourceRefs": refs, "notes": [],
                  "affectedRelease": _release(workspace, payload.get("affectedRelease"), selected_contract["portfolio"]),
                  "project": _project(payload.get("project")),
                  "entitlement": entitlement(selected_contract, payload["receivedAt"]),
                  "cycles": [_cycle(payload["receivedAt"], short(payload["reproduction"], "Reproduction", 30000, empty=True),
                                    payload["severity"], selected_contract, refs, 1)]}
    else:
        require(previous is not None, "Open the original complete support report")
        result = clone(previous)
        selected_contract = contract(workspace, previous["contractId"])
        cycle = result["cycles"][-1]
        common = ("actor", "id", "expectedIssueRevision")
        require(action in ("support.issue.reopen", "support.issue.note") or previous["state"] != "closed",
                "Reopen this closed report before a new engineering action")
        if action == "support.issue.triage":
            shape(payload, (*common, "severity", "classification", "component", "owner", "reason",
                            "reproduction", "affectedRelease", "project", "sourceRefs"),
                  (*common, "severity", "classification", "component", "owner", "reason", "sourceRefs"))
            require(payload["severity"] in SEVERITIES and payload["classification"] in CLASSIFICATIONS,
                    "Select the reviewed severity and scope classification")
            for key, maximum in (("component", 200), ("owner", 300)):
                result[key] = short(payload[key], key, maximum)
            short(payload["reason"], "Triage reason", 12000)
            refs = evidence(payload["sourceRefs"], required=payload["classification"] not in ("investigating", "not-reproduced", "delivered-defect"))
            result.update(severity=payload["severity"], classification=payload["classification"],
                          state="triaged" if cycle["acknowledgement"] is None else result["state"])
            validation_basis = (cycle["reproduction"], clone(result.get("affectedRelease")))
            if "reproduction" in payload:
                cycle["reproduction"] = short(payload["reproduction"], "Reproduction", 30000, empty=True)
            if "affectedRelease" in payload:
                result["affectedRelease"] = _release(workspace, payload["affectedRelease"], selected_contract["portfolio"])
            if "project" in payload:
                result["project"] = _project(payload["project"])
            if validation_basis != (cycle["reproduction"], result.get("affectedRelease")) and cycle.get("validation"):
                # The performed test remains in the previous immutable revision;
                # it does not validate a subsequently changed reproduction/release.
                cycle["validation"] = None
                result["state"] = "in-correction" if cycle.get("correction") else ("acknowledged" if cycle["acknowledgement"] else "triaged")
            calendar = cycle["acknowledgementClock"].get("calendar") or selected_contract.get("calendar")
            revised_clock = acknowledgement_due(cycle["receivedAt"], result["severity"], calendar)
            if revised_clock != cycle["acknowledgementClock"]:
                cycle["clockReviews"].append({"at": recorded_at, "reason": payload["reason"], "sourceRefs": refs,
                                             "before": clone(cycle["acknowledgementClock"]), "after": clone(revised_clock)})
                cycle["acknowledgementClock"] = revised_clock
            result["entitlement"] = entitlement(selected_contract, cycle["receivedAt"])
        elif action == "support.issue.acknowledge":
            shape(payload, (*common, "at", "channel", "message", "sourceRefs"),
                  (*common, "at", "channel", "message", "sourceRefs"))
            require(cycle["acknowledgement"] is None, "This report cycle already retains its acknowledgement")
            _at(payload["at"], "Actual acknowledgement", recorded_at, earliest=cycle["receivedAt"])
            require(payload["channel"] in ("email", "portal", "phone", "meeting", "other"),
                    "Select the actual acknowledgement channel")
            cycle["acknowledgement"] = {"at": payload["at"], "channel": payload["channel"],
                                        "message": short(payload["message"], "Acknowledgement", 15000),
                                        "sourceRefs": evidence(payload["sourceRefs"], required=True),
                                        "recordedBy": payload["actor"]}
            if result["state"] in ("received", "triaged"):
                result["state"] = "acknowledged"
        elif action == "support.issue.plan":
            shape(payload, (*common, "agreedAt", "workaroundDueAt", "correctionDueAt", "agreement", "sourceRefs"),
                  (*common, "agreedAt", "agreement", "sourceRefs"))
            _at(payload["agreedAt"], "Actual correction agreement", recorded_at, earliest=cycle["receivedAt"])
            require(payload.get("workaroundDueAt") or payload.get("correctionDueAt"),
                    "Record the actual agreed workaround or correction target")
            plan = {"agreedAt": payload["agreedAt"], "agreement": short(payload["agreement"], "Agreed plan", 15000),
                    "sourceRefs": evidence(payload["sourceRefs"], required=True)}
            for key in ("workaroundDueAt", "correctionDueAt"):
                plan[key] = payload.get(key)
                if plan[key]:
                    require(timestamp(plan[key]) >= timestamp(cycle["receivedAt"]), "An agreed target precedes the original report")
            cycle["plan"] = plan
            result["state"] = "planned"
        elif action == "support.issue.workaround":
            shape(payload, (*common, "at", "description", "sourceRefs"), (*common, "at", "description", "sourceRefs"))
            _at(payload["at"], "Actual workaround", recorded_at, earliest=cycle["receivedAt"])
            cycle["workarounds"].append({"at": payload["at"], "description": short(payload["description"], "Workaround", 30000),
                                         "sourceRefs": evidence(payload["sourceRefs"], required=True), "actor": payload["actor"]})
        elif action == "support.issue.correction":
            shape(payload, (*common, "correction", "sourceRefs"), (*common, "correction", "sourceRefs"))
            pointer, resolved = _correction(workspace, payload["correction"], selected_contract["portfolio"])
            cycle["correction"] = {"reference": pointer, "linkedAt": recorded_at,
                                    "sourceRefs": evidence(payload["sourceRefs"]), "resolvedStatus": resolved.get("status")}
            cycle["validation"] = None
            result["state"] = "in-correction"
        elif action == "support.issue.validate":
            shape(payload, (*common, "installation", "testedAt", "outcome", "verification", "sourceRefs"),
                  (*common, "installation", "testedAt", "outcome", "verification", "sourceRefs"))
            require(cycle["correction"], "Link the original staff correction before validating its release")
            pointer, resolved = _correction(workspace, cycle["correction"]["reference"], selected_contract["portfolio"])
            require(resolved.get("resolution") and resolved["resolution"].get("outcome") == "corrected",
                    "The original staff correction must retain its actual corrected resolution")
            _at(payload["testedAt"], "Actual release validation", recorded_at, earliest=cycle["receivedAt"])
            require(payload["outcome"] in ("passed", "failed"), "Record the actual release validation outcome")
            installation = _release(workspace, payload["installation"], selected_contract["portfolio"], installed=True)
            cycle["validation"] = {"installation": installation, "correction": pointer, "testedAt": payload["testedAt"],
                                   "outcome": payload["outcome"], "verification": short(payload["verification"], "Release validation", 30000),
                                   "sourceRefs": evidence(payload["sourceRefs"], required=True), "actor": payload["actor"]}
            result["state"] = "ready-for-review" if payload["outcome"] == "passed" else "in-correction"
        elif action == "support.issue.close":
            shape(payload, (*common, "at", "outcome", "reason", "sourceRefs", "duplicateOf"),
                  (*common, "at", "outcome", "reason", "sourceRefs"))
            require(payload["outcome"] in ("corrected", "reviewed-no-change", "separately-scoped", "duplicate"),
                    "Select the actual reviewed closure outcome")
            require(cycle["acknowledgement"], "Record the actual customer acknowledgement before closing this report")
            _at(payload["at"], "Actual closure", recorded_at, earliest=cycle["acknowledgement"]["at"])
            refs = evidence(payload["sourceRefs"], required=True)
            if payload["outcome"] == "corrected":
                require(cycle["validation"] and cycle["validation"]["outcome"] == "passed",
                        "Complete the actual correction and target release validation before corrected closure")
                require(timestamp(payload["at"]) >= timestamp(cycle["validation"]["testedAt"]),
                        "Closure precedes the actual release validation")
            elif payload["outcome"] == "separately-scoped":
                require(result["classification"] in ("new-functionality", "material-enhancement", "new-integration",
                        "changed-requirement", "third-party-change"),
                        "A delivered defect cannot be closed as a separately charged enhancement")
            elif payload["outcome"] == "duplicate":
                other = issue(workspace, payload.get("duplicateOf"))
                require(other["id"] != result["id"] and other["contractId"] == result["contractId"],
                        "Link the actual distinct report in this same service contract")
            cycle["closure"] = {"at": payload["at"], "outcome": payload["outcome"],
                                "reason": short(payload["reason"], "Closure rationale", 15000),
                                "sourceRefs": refs, "actor": payload["actor"]}
            if payload["outcome"] == "duplicate":
                cycle["closure"]["duplicateOf"] = {"id": other["id"], "revision": other["revision"], "sha256": other["sha256"]}
            result["state"] = "closed"
        elif action == "support.issue.reopen":
            shape(payload, (*common, "receivedAt", "reason", "reproduction", "severity", "sourceRefs"),
                  (*common, "receivedAt", "reason", "reproduction", "severity", "sourceRefs"))
            require(previous["state"] == "closed", "Continue this open report through its existing cycle")
            _at(payload["receivedAt"], "Reopened report receipt", recorded_at,
                earliest=cycle["closure"]["at"])
            require(payload["severity"] in SEVERITIES, "Select the new report severity")
            refs = evidence(payload["sourceRefs"], required=True)
            short(payload["reason"], "Reopen reason", 15000)
            result["cycles"].append(_cycle(payload["receivedAt"], short(payload["reproduction"], "Reproduction", 30000, empty=True),
                                           payload["severity"], selected_contract, refs, cycle["number"] + 1))
            result.update(state="received", severity=payload["severity"], classification="investigating",
                          entitlement=entitlement(selected_contract, payload["receivedAt"]))
        elif action == "support.issue.note":
            shape(payload, (*common, "text", "sourceRefs"), (*common, "text", "sourceRefs"))
            result["notes"].append({"at": recorded_at, "actor": payload["actor"],
                                    "text": short(payload["text"], "Support note", 30000),
                                    "sourceRefs": evidence(payload["sourceRefs"])})
        elif action == "support.issue.clock-review":
            shape(payload, (*common, "expectedContractRevision", "reason", "sourceRefs"),
                  (*common, "expectedContractRevision", "reason", "sourceRefs"))
            _expected(selected_contract, payload["expectedContractRevision"])
            require(selected_contract.get("calendar") and selected_contract["calendar"]["state"] == "agreed",
                    "Select the actual agreed service calendar")
            reviewed = acknowledgement_due(cycle["receivedAt"], result["severity"], selected_contract["calendar"])
            cycle["clockReviews"].append({"at": recorded_at, "reason": short(payload["reason"], "Clock review", 12000),
                                         "sourceRefs": evidence(payload["sourceRefs"], required=True),
                                         "before": clone(cycle["acknowledgementClock"]), "after": clone(reviewed)})
            cycle["acknowledgementClock"] = reviewed
        else:
            raise InputError("This support action has no original handler")
    updated = _updated(previous, result, context, kind)
    event = {"schema": SCHEMA + ".event", "originWorkspaceId": workspace.marker["workspaceId"],
             "operationId": original["id"], "inputSha256": original["inputSha256"],
             "action": action, "actor": payload["actor"], "at": recorded_at, "kind": kind,
             "entityId": updated["id"], "revision": updated["revision"],
             "previousSha256": updated["previousSha256"], "recordSha256": updated["sha256"],
             "input": clone(original["input"])}
    return {"kind": kind, "record": updated, "event": event,
            "expectedPreviousSha256": previous["sha256"] if previous else None,
            "contractBinding": ({"id": selected_contract["id"], "revision": selected_contract["revision"],
                                 "sha256": selected_contract["sha256"]} if kind == "issue" else None)}


def _insert_record(workspace, kind, value):
    checked_record(value)
    prior = _record(workspace, kind, value["id"], value["revision"], workspace.db, missing=True)
    require(prior is None or prior == value, "An original support revision conflicts with the incoming history",
            "SUPPORT_HISTORY_CONFLICT", 409)
    if prior is not None:
        return
    if kind == "contract":
        workspace.db.execute("INSERT INTO support_contracts VALUES(?,?,?,?)",
            (value["id"], value["revision"], value["sha256"], canonical(value).decode()))
    else:
        workspace.db.execute("INSERT INTO support_issues VALUES(?,?,?,?,?)",
            (value["id"], value["revision"], value["contractId"], value["sha256"], canonical(value).decode()))


def _insert_event(workspace, value):
    require(value["schema"] == SCHEMA + ".event" and value["inputSha256"] == digest(value["input"])
            and value["input"]["operationId"] == value["operationId"]
            and value["input"]["action"] == value["action"], "The original support operation history differs")
    digest_value = digest(value)
    prior = workspace.db.execute("SELECT body_sha256,body FROM support_events WHERE origin=? AND operation_id=?",
                                 (value["originWorkspaceId"], value["operationId"])).fetchone()
    require(prior is None or prior["body_sha256"] == digest_value and json.loads(prior["body"]) == value,
            "The original support event conflicts", "SUPPORT_EVENT_CONFLICT", 409)
    workspace.db.execute("INSERT OR IGNORE INTO support_events VALUES(?,?,?,?,?,?,?)",
        (value["originWorkspaceId"], value["operationId"], value["kind"], value["entityId"],
         value["revision"], digest_value, canonical(value).decode()))


def commit_action(workspace, original, prepared):
    """The original Workspace owns this transaction and all revision increments."""
    _original(workspace, original)
    if original["action"].startswith("support.delivery."):
        from support_portable import commit_delivery, commit_receiving
        return (commit_delivery(workspace, original, prepared) if original["action"].endswith(".prepare")
                else commit_receiving(workspace, original, prepared))
    kind, value = prepared["kind"], prepared["record"]
    previous = _record(workspace, kind, value["id"], db=workspace.db, missing=True)
    require((previous["sha256"] if previous else None) == prepared["expectedPreviousSha256"],
            "The support revision changed before the original operation committed", "SUPPORT_REVISION_CONFLICT", 409)
    if prepared["contractBinding"]:
        binding = prepared["contractBinding"]
        current = contract(workspace, binding["id"], db=workspace.db)
        require(current["revision"] == binding["revision"] and current["sha256"] == binding["sha256"],
                "The service contract changed before this operation committed", "SUPPORT_CONTRACT_CONFLICT", 409)
    _insert_record(workspace, kind, value)
    _insert_event(workspace, prepared["event"])
    return {"schema": SCHEMA + ".result", "kind": kind, "id": value["id"],
            "revision": value["revision"], "sha256": value["sha256"], "record": clone(value)}


def history(workspace, kind, ident, *, offset=0, limit=50):
    identifier(ident)
    require(kind in ("contract", "issue") and type(offset) is int and offset >= 0
            and type(limit) is int and 1 <= limit <= 250, "Use a valid history selection")
    table = "support_contracts" if kind == "contract" else "support_issues"
    with workspace.reader() as db:
        total = db.execute("SELECT COUNT(*) FROM " + table + " WHERE id=?", (ident,)).fetchone()[0]
        rows = [checked_record(json.loads(r["body"])) for r in db.execute(
            "SELECT body FROM " + table + " WHERE id=? ORDER BY revision LIMIT ? OFFSET ?", (ident, limit, offset))]
        events = [json.loads(r["body"]) for r in db.execute(
            "SELECT body FROM support_events WHERE kind=? AND entity_id=? AND revision>? AND revision<=? ORDER BY revision,origin,operation_id",
            (kind, ident, offset, offset + len(rows)))]
    return {"rows": rows, "events": events, "total": total, "offset": offset,
            "nextOffset": offset + len(rows) if offset + len(rows) < total else None}


def state(workspace, *, contract_id=None, issue_state=None, search="", offset=0, limit=50, as_of=None):
    require(type(offset) is int and offset >= 0 and type(limit) is int and 1 <= limit <= 250,
            "Use a valid support page")
    if contract_id:
        identifier(contract_id)
    if issue_state:
        require(issue_state in (*OPEN_STATES, "closed"), "Select an actual support status")
    short(search, "Support search", 1000, empty=True)
    at = as_of or now()
    timestamp(at)
    clauses, args = [], []
    if contract_id:
        clauses.append("i.contract_id=?")
        args.append(contract_id)
    if issue_state:
        clauses.append("json_extract(i.body,'$.state')=?")
        args.append(issue_state)
    if search:
        clauses.append("(instr(lower(json_extract(i.body,'$.title')),lower(?))>0 OR instr(lower(json_extract(i.body,'$.description')),lower(?))>0)")
        args.extend((search, search))
    query = (" FROM support_issues i JOIN (SELECT id,MAX(revision) r FROM support_issues GROUP BY id) h"
             " ON i.id=h.id AND i.revision=h.r" + (" WHERE " + " AND ".join(clauses) if clauses else ""))
    with workspace.reader() as db:
        totals = db.execute("SELECT COUNT(*) AS total,"
            "COALESCE(SUM(json_extract(i.body,'$.state')!='closed'),0) AS open,"
            "COALESCE(SUM(json_extract(i.body,'$.state')!='closed' AND json_extract(i.body,'$.severity')='critical'),0) AS critical,"
            "COALESCE(SUM(json_extract(i.body,'$.state')!='closed' AND json_type(i.body,'$.cycles[#-1].acknowledgement')='null'),0) AS awaiting"
            + query, args).fetchone()
        count = totals["total"]
        summary = {"total": count, "open": totals["open"], "critical": totals["critical"], "awaitingAcknowledgement": totals["awaiting"]}
        issues = [checked_record(json.loads(r["body"])) for r in db.execute(
            "SELECT i.body" + query + " ORDER BY json_extract(i.body,'$.updatedAt') DESC,i.id LIMIT ? OFFSET ?",
            [*args, limit, offset])]
        contracts = [checked_record(json.loads(r["body"])) for r in db.execute(
            "SELECT c.body FROM support_contracts c JOIN (SELECT id,MAX(revision) r FROM support_contracts GROUP BY id) h"
            " ON c.id=h.id AND c.revision=h.r ORDER BY json_extract(c.body,'$.label'),c.id")]
        revision = workspace.current_revision(db)
    current_contracts = {value["id"]: value for value in contracts}
    return {"schema": SCHEMA + ".state", "workspaceId": workspace.marker["workspaceId"], "revision": revision,
            "contracts": contracts, "rows": [public_summary(value, at, current_contracts[value["contractId"]]) for value in issues],
            "summary": summary, "total": count, "offset": offset, "nextOffset": offset + len(issues) if offset + len(issues) < count else None,
            "asOf": at}


def releases(workspace, contract_id, *, mode="affected", offset=0, limit=100):
    """List actual retained ALM records for a form without exposing native profiles."""
    require(mode in ("affected", "installation", "delivery") and type(offset) is int and offset >= 0
            and type(limit) is int and 1 <= limit <= 250, "Select an actual application release page")
    selected = contract(workspace, contract_id)
    from dataverse_contract import identity as native_identity, parse_json as native_parse_json
    kinds = (("import",) if mode == "installation" else ("delivery", "receiving") if mode == "delivery"
             else ("import", "export", "deployment", "configuration", "delivery", "receiving"))
    where = "portfolio_id=? AND portfolio_revision<=? AND kind IN (" + ",".join("?" for _ in kinds) + ")"
    args = [selected["portfolio"]["id"], selected["portfolio"]["revision"], *kinds]
    if mode == "installation":
        where += " AND json_extract(body,'$.value.state')='COMPLETE' AND json_type(body,'$.value.target_solution')='object'"
    elif mode == "delivery":
        where += " AND portfolio_revision=?"
        args.append(selected["portfolio"]["revision"])
    with workspace.reader() as db:
        total = db.execute("SELECT COUNT(*) FROM dataverse_records WHERE " + where, args).fetchone()[0]
        raw = db.execute("SELECT body,body_sha256 FROM dataverse_records WHERE " + where +
                         " ORDER BY json_extract(body,'$.created_at') DESC,id LIMIT ? OFFSET ?",
                         [*args, limit, offset]).fetchall()
        values = []
        for row in raw:
            saved = native_parse_json(row["body"])
            identity = native_identity(saved)
            require(identity == row["body_sha256"], "An original release row changed", "SUPPORT_RELEASE_CHANGED", 409)
            value = saved["value"]
            inspection = value.get("inspection") or {}
            solution = value.get("target_solution") or inspection.get("solution") or value.get("solution") or {}
            label = (solution.get("friendlyname") or solution.get("uniquename") or solution.get("unique_name")
                     or solution.get("name")) if isinstance(solution, dict) else None
            version = solution.get("version") if isinstance(solution, dict) else None
            values.append({"recordId": saved["id"], "recordSha256": identity, "kind": saved["kind"],
                           "createdAt": saved["created_at"], "state": value.get("state"),
                           "label": str(label or saved["kind"].replace("-", " ").title()),
                           "version": str(version) if version is not None else None,
                           "portfolio": clone(saved["portfolio"])})
    return {"rows": values, "total": total, "offset": offset,
            "nextOffset": offset + len(values) if offset + len(values) < total else None,
            "contractId": selected["id"], "contractRevision": selected["revision"], "mode": mode}


def corrections(workspace, contract_id, *, offset=0, limit=100):
    require(type(offset) is int and offset >= 0 and type(limit) is int and 1 <= limit <= 100,
            "Select an actual staff correction page")
    selected = contract(workspace, contract_id)
    provider = getattr(workspace, "support_correction_options", None)
    require(callable(provider), "Open the composed staff application to select its saved correction history",
            "SUPPORT_CORRECTION_PROVIDER", 409)
    page = provider(selected["portfolio"]["id"], offset=offset, limit=limit)
    require(isinstance(page, dict) and isinstance(page.get("rows"), list)
            and page.get("offset") == offset and type(page.get("total")) is int and page["total"] >= 0
            and len(page["rows"]) <= limit, "The original staff correction page differs")
    for row in page["rows"]:
        require(isinstance(row, dict) and isinstance(row.get("reference"), dict)
                and isinstance(row.get("title"), str) and isinstance(row.get("status"), str),
                "A retained staff correction option is incomplete")
        _correction(workspace, row["reference"], selected["portfolio"])
    require(page.get("nextOffset") is None or
            type(page["nextOffset"]) is int and page["nextOffset"] == offset + len(page["rows"])
            and page["nextOffset"] > offset, "The staff correction page would skip original records")
    return {**clone(page), "contractId": selected["id"], "contractRevision": selected["revision"]}

def read_http(workspace, path, query):
    if not path.startswith("/api/support/"):
        return None
    def number(key, default=None):
        value = query.get(key)
        if value is None:
            return default
        require(isinstance(value, str) and value.isdigit(), "Invalid support " + key)
        return int(value)
    if path == "/api/support/state":
        shape(query, ("contractId", "state", "search", "offset", "limit", "asOf"))
        return {"kind": "json", "value": state(workspace, contract_id=query.get("contractId"),
            issue_state=query.get("state"), search=query.get("search", ""), offset=number("offset", 0),
            limit=number("limit", 50), as_of=query.get("asOf"))}
    if path in ("/api/support/contract", "/api/support/issue"):
        shape(query, ("id", "revision"), ("id",))
        return {"kind": "json", "value": _record(workspace, path.rsplit("/", 1)[-1], query["id"], number("revision"))}
    if path == "/api/support/history":
        shape(query, ("kind", "id", "offset", "limit"), ("kind", "id"))
        return {"kind": "json", "value": history(workspace, query["kind"], query["id"],
                                               offset=number("offset", 0), limit=number("limit", 50))}
    if path == "/api/support/corrections":
        shape(query, ("contractId", "offset", "limit"), ("contractId",))
        return {"kind": "json", "value": corrections(workspace, query["contractId"],
                offset=number("offset", 0), limit=number("limit", 100))}
    if path == "/api/support/releases":
        shape(query, ("contractId", "mode", "offset", "limit"), ("contractId",))
        return {"kind": "json", "value": releases(workspace, query["contractId"], mode=query.get("mode", "affected"),
                                                 offset=number("offset", 0), limit=number("limit", 100))}
    if path == "/api/support/delivery":
        shape(query, ("object",), ("object",))
        from support_portable import delivery_file
        return delivery_file(workspace, query["object"])
    raise InputError("Support route not found", "NOT_FOUND", 404)


def static_routes():
    return {"/support/": ("web/support.html", "text/html; charset=utf-8"),
            "/support/support.js": ("web/support.js", "text/javascript; charset=utf-8"),
            "/support/support.css": ("web/support.css", "text/css; charset=utf-8"),
            "/support/support-hash.js": ("web/support-hash.js", "text/javascript; charset=utf-8")}
