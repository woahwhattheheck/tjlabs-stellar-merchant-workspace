"""Retain the original project-scoped Dataverse staff history in the existing workspace.

This module creates no correction, business record, tenant or separate journal.
The only network action is the native read Custom API. Original browser commands
remain native Dataverse transactions. Support resolves a checked history pointer.
"""
from __future__ import annotations

import json
import re
from dataverse_contract import (
    DataverseError, require, clone, exact_keys, guid, identifier, integer, HASH,
    sha256, identity, json_bytes, parse_json, binary, validate_exchange,
    public_profile, target_identity, Csdl, MAX_XML,
)
from dataverse_client import DataverseClient, request_key
from dataverse_workspace import (
    initialize as initialize_native, WorkspaceJournal, selected_portfolio,
    record, put_record, observation, _value,
)

ACTIONS = ("dataverse.staff.capture",)
CAPTURE_SCHEMA = "tjlabs.pmrs.staff-history-capture/v1"
READ_SCHEMA = "tjlabs.pmrs.staff-read/v1"
READ_API = "tjl_PMRSStaffRead"
MEMBERS = ("before", "after", "sources", "policy", "receipt")
MAX_STAFF = 1024 * 1024
_NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z")

class _Number(str):
    """An original JSON token, not a binary floating-point value."""

def _pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "STAFF_JSON_DUPLICATE", "The original staff JSON repeats a member.", member=key)
        result[key] = value
    return result

def _parse(text):
    require(isinstance(text, str) and len(text.encode("utf-8")) <= MAX_STAFF,
            "STAFF_JSON_SIZE", "Retain the complete bounded original staff JSON.")
    try:
        return json.loads(text, parse_int=_Number, parse_float=_Number,
                          parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)),
                          object_pairs_hook=_pairs)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise DataverseError("STAFF_JSON", "The original staff JSON is not complete and exact.") from error

def _canonical(value, depth=0):
    """Exact C# StrictJson writer: original tokens, ordinal UTF-16 keys, no LF."""
    require(depth <= 64, "STAFF_JSON_DEPTH", "The original staff JSON exceeds 64 levels.")
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, _Number):
        require(_NUMBER.fullmatch(value) is not None, "STAFF_NUMBER", "The original numeric token is invalid.")
        return str(value)
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, str):
        try:
            value.encode("utf-8")
        except UnicodeError as error:
            raise DataverseError("STAFF_UNICODE", "An unpaired surrogate is not a native staff string.") from error
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(_canonical(x, depth + 1) for x in value) + "]"
    require(isinstance(value, dict) and all(isinstance(k, str) for k in value),
            "STAFF_JSON_TYPE", "Use the original staff JSON types.")
    return "{" + ",".join(_canonical(k) + ":" + _canonical(value[k], depth + 1)
                           for k in sorted(value, key=lambda x: x.encode("utf-16-be"))) + "}"

def _hash(value):
    return sha256(_canonical(value).encode("utf-8"))

def _int(value, name, minimum=0):
    require(isinstance(value, (_Number, int)) and not isinstance(value, bool)
            and re.fullmatch(r"-?(?:0|[1-9][0-9]*)", str(value)) is not None,
            "STAFF_INTEGER", "Use the original exact integer for " + name + ".")
    return integer(int(value), name, minimum)

def _plain(value):
    """A read projection only; the original token-preserving text remains retained."""
    return parse_json(_canonical(value).encode("utf-8"), MAX_STAFF)

def initialize(workspace):
    initialize_native(workspace)

def _selection(value):
    exact_keys(value, ["entity", "projectRecordId", "commandOperationId", "historyStateVersion"],
               ["entity", "projectRecordId", "commandOperationId", "historyStateVersion"])
    return {
        "entity": identifier(value["entity"]),
        "projectRecordId": guid(value["projectRecordId"]),
        "commandOperationId": guid(value["commandOperationId"]),
        "historyStateVersion": integer(value["historyStateVersion"], "history state version", 1),
    }

def validate_action(workspace, value):
    require(value["action"] in ACTIONS, "STAFF_ACTION", "Select the original staff history capture action.")
    payload = value["payload"]
    exact_keys(payload, ["actor", "portfolio", "profileId", "entity", "projectRecordId",
                         "commandOperationId", "historyStateVersion"],
               ["actor", "portfolio", "profileId", "entity", "projectRecordId",
                "commandOperationId", "historyStateVersion"])
    require(isinstance(payload["actor"], str) and 0 < len(payload["actor"].strip()) <= 300,
            "STAFF_ACTOR", "Retain the actual receiving operator.")
    identifier(payload["profileId"], "key")
    selected_portfolio(workspace, payload)
    _selection({key: payload[key] for key in ("entity", "projectRecordId", "commandOperationId", "historyStateVersion")})

def _read_request(selection, view, member=None):
    value = {"schema": READ_SCHEMA, "entity": selection["entity"],
             "record_id": selection["projectRecordId"], "view": view,
             "operation_id": selection["commandOperationId"]}
    if member is not None:
        value["member"] = member
    return value

def _response(exchange, selected_profile, request):
    validate_exchange(exchange)
    require(target_identity(exchange["profile"]) == target_identity(selected_profile),
            "STAFF_TARGET", "The actual staff history came from another target.")
    actual = exchange["request"]
    require(actual["method"] == "POST" and actual["path"] == READ_API,
            "STAFF_NATIVE_ROUTE", "Use the original native project-scoped read API.")
    body = parse_json(binary(actual["body"], "staff read request"))
    require(isinstance(body, dict) and set(body) == {"Request"}
            and body["Request"] == _canonical(request),
            "STAFF_READ_BINDING", "The original API request selects another project/history member.")
    require(exchange["response"]["status"] == 200, "STAFF_HTTP",
            "The original staff read has no complete success response.",
            status=exchange["response"]["status"], request_id=exchange["request_id"])
    outer = parse_json(binary(exchange["response"]["body"], "staff API return"))
    require(isinstance(outer, dict) and isinstance(outer.get("Response"), str),
            "STAFF_NATIVE_RETURN", "The native API did not return its complete Response string.")
    return _parse(outer["Response"])

def _pointer(value, pointer):
    require(isinstance(pointer, str) and pointer.startswith("/"), "STAFF_SOURCE_POINTER",
            "Use the reviewed RFC 6901 pointer into the original source JSON.")
    for encoded in pointer[1:].split("/"):
        require(re.search(r"~(?:[^01]|$)", encoded) is None, "STAFF_SOURCE_POINTER",
                "The original source pointer has an invalid escape.")
        key = encoded.replace("~1", "/").replace("~0", "~")
        if isinstance(value, dict):
            require(key in value, "STAFF_SOURCE_POINTER_MISSING", "The original source is missing the reviewed portfolio member.")
            value = value[key]
        elif isinstance(value, list):
            require(re.fullmatch(r"0|[1-9][0-9]*", key) is not None and int(key) < len(value),
                    "STAFF_SOURCE_POINTER_MISSING", "The original source pointer does not select an actual array member.")
            value = value[int(key)]
        else:
            raise DataverseError("STAFF_SOURCE_POINTER_MISSING", "The original source pointer does not select a portfolio identity.")
    return value

def verify_capture(value, expected_portfolio=None):
    exact_keys(value, ["schema", "state", "selection", "profile", "whoami", "metadata", "exchanges",
                       "created_at", "observation_id", "meaning"],
               ["schema", "state", "selection", "profile", "whoami", "metadata", "exchanges",
                "created_at", "observation_id", "meaning"])
    require(value["schema"] == CAPTURE_SCHEMA and value["state"] == "COMPLETE",
            "STAFF_CAPTURE_STATE", "Use a complete retained original staff history capture.")
    selected = _selection(value["selection"])
    profile = value["profile"]
    for name in ("whoami", "metadata"):
        exchange = validate_exchange(value[name])
        require(target_identity(exchange["profile"]) == target_identity(profile)
                and exchange["request"]["method"] == "GET" and exchange["response"]["status"] == 200,
                "STAFF_SOURCE_IDENTITY", "The native identity/metadata return belongs to another selected target.", source=name)
    require(value["whoami"]["request"]["path"] == "WhoAmI()"
            and value["metadata"]["request"]["path"] == "$metadata",
            "STAFF_SOURCE_ROUTE", "The complete native identity and metadata paths changed.")
    who = parse_json(binary(value["whoami"]["response"]["body"], "WhoAmI"))
    require(isinstance(who, dict) and guid(who.get("OrganizationId")) == profile["organization_id"],
            "STAFF_ORGANIZATION", "The actual organization is not the selected original target.")
    Csdl(binary(value["metadata"]["response"]["body"], "target CSDL", MAX_XML)).operation(
        READ_API, {"Request": _canonical(_read_request(selected, "operation"))}, function=False)
    exchanges = value["exchanges"]
    exact_keys(exchanges, ["operation", *MEMBERS], ["operation", *MEMBERS])
    operation = _response(exchanges["operation"], profile, _read_request(selected, "operation"))
    require(operation.get("schema") == "tjlabs.pmrs.staff-operation-read/v1"
            and operation.get("found") is True
            and operation.get("operation_id") == selected["commandOperationId"],
            "STAFF_OPERATION_MISSING", "The original completed native command was not returned.")
    request, receipt = operation.get("request"), operation.get("result")
    require(isinstance(request, dict) and isinstance(receipt, dict),
            "STAFF_OPERATION_BODY", "The original native command or receipt is absent.")
    require(request.get("schema") == "tjlabs.pmrs.staff-command/v1"
            and request.get("operation_id") == selected["commandOperationId"]
            and request.get("entity") == selected["entity"]
            and request.get("record_id") == selected["projectRecordId"],
            "STAFF_COMMAND_BINDING", "The original command belongs to another project or operation.")
    require(receipt.get("schema") == "tjlabs.pmrs.staff-native-receipt/v1"
            and receipt.get("operation_id") == selected["commandOperationId"]
            and receipt.get("history_id") == selected["commandOperationId"]
            and receipt.get("entity") == selected["entity"]
            and receipt.get("record_id") == selected["projectRecordId"]
            and receipt.get("action") == request.get("action")
            and receipt.get("request_sha256") == _hash(request)
            and _int(receipt.get("after_state_version"), "after version", 1) == selected["historyStateVersion"]
            and _int(receipt.get("before_state_version"), "before version") + 1 == selected["historyStateVersion"]
            and _int(request.get("expected_state_version"), "expected version") == selected["historyStateVersion"] - 1,
            "STAFF_RECEIPT_BINDING", "The full native receipt differs from its original request/history revision.")
    members, member_refs = {}, {}
    for name in MEMBERS:
        output = _response(exchanges[name], profile, _read_request(selected, "history-member", name))
        text = output.get("text")
        require(output.get("schema") == "tjlabs.pmrs.staff-history-member/v1"
                and output.get("operation_id") == selected["commandOperationId"]
                and output.get("member") == name and isinstance(text, str)
                and _int(output.get("bytes"), "original member bytes") == len(text.encode("utf-8"))
                and output.get("sha256") == sha256(text.encode("utf-8")),
                "STAFF_HISTORY_MEMBER", "A complete original native history member changed.", member=name)
        parsed = _parse(text)
        require(_canonical(parsed) == text, "STAFF_HISTORY_CANONICAL",
                "The retained history does not match the original native writer.", member=name)
        members[name] = parsed
        member_refs[name] = {"bytes": len(text.encode("utf-8")), "sha256": output["sha256"],
                             "request_id": exchanges[name]["request_id"],
                             "exchange_sha256": identity(exchanges[name])}
    for name, field in (("before", "before_sha256"), ("after", "after_sha256"),
                        ("sources", "source_sha256"), ("policy", "policy_sha256")):
        require(member_refs[name]["sha256"] == receipt.get(field),
                "STAFF_HISTORY_RECEIPT", "The original native receipt names another complete history member.", member=name)
    require(members["receipt"] == receipt and _hash(receipt) == member_refs["receipt"]["sha256"],
            "STAFF_RECEIPT_MEMBER", "The original immutable receipt differs from the returned command result.")
    after, before = members["after"], members["before"]
    require(isinstance(after, dict) and after.get("schema") == "tjlabs.pmrs.staff-state/v1"
            and after.get("entity") == selected["entity"]
            and after.get("record_id") == selected["projectRecordId"]
            and _int(after.get("version"), "saved state version", 1) == selected["historyStateVersion"]
            and after.get("phase") == receipt.get("phase"),
            "STAFF_AFTER_BINDING", "The original saved state belongs to another native record/revision.")
    if before is None:
        require(selected["historyStateVersion"] == 1 and request.get("action") == "initialize",
                "STAFF_BEFORE_ABSENT", "Only the original initialization has an absent prior staff state.")
    else:
        require(isinstance(before, dict) and before.get("entity") == selected["entity"]
                and before.get("record_id") == selected["projectRecordId"]
                and _int(before.get("version"), "before state version", 1) == selected["historyStateVersion"] - 1,
                "STAFF_BEFORE_BINDING", "The original previous state differs.")
    policy = members["policy"]
    binding = policy.get("project", {}).get("portfolio_binding") if isinstance(policy, dict) else None
    exact_keys(binding, ["id_pointer", "revision_pointer", "snapshot_pointer"],
               ["id_pointer", "revision_pointer", "snapshot_pointer"])
    require(len(set(binding.values())) == 3, "STAFF_SOURCE_BINDING", "The reviewed portfolio pointers must be distinct.")
    source = members["sources"].get("source") if isinstance(members["sources"], dict) else None
    portfolio = {"id": _pointer(source, binding["id_pointer"]),
                 "revision": _int(_pointer(source, binding["revision_pointer"]), "original portfolio revision"),
                 "snapshot": _pointer(source, binding["snapshot_pointer"])}
    require(isinstance(portfolio["id"], str) and not isinstance(portfolio["id"], _Number)
            and isinstance(portfolio["snapshot"], str) and not isinstance(portfolio["snapshot"], _Number)
            and HASH.fullmatch(portfolio["snapshot"]), "STAFF_SOURCE_PORTFOLIO", "The retained native source lacks its original portfolio identity.")
    identifier(portfolio["id"], "key")
    if expected_portfolio is not None:
        exact_keys(expected_portfolio, ["id", "revision", "snapshot"], ["id", "revision", "snapshot"])
        require(portfolio == expected_portfolio, "STAFF_PORTFOLIO_BINDING",
                "The native staff action source belongs to another selected original portfolio revision.")
    return {"portfolio": portfolio, "selection": selected, "request": request, "receipt": receipt,
            "members": members, "member_refs": member_refs,
            "profile": clone(profile), "capture_sha256": identity(value)}

def prepare_action(workspace, original):
    initialize(workspace)
    validate_action(workspace, original["input"])
    payload = original["input"]["payload"]
    selected = selected_portfolio(workspace, payload)
    journal = WorkspaceJournal(workspace, original)
    complete_key = request_key(original["id"], "action-complete")
    previous = journal.result(complete_key)
    if previous is not None:
        saved = record(workspace, previous["id"], "staff-history")
        verify_capture(saved["value"], saved["portfolio"])
        return previous
    chosen_profile = _value(workspace, payload["profileId"], "profile", selected)["profile"]
    client = DataverseClient(chosen_profile, journal)
    # Explicit original-action continuation creates a new read observation.
    # Every unknown prior read remains in the SAME native journal. This method
    # never calls the staff command API or retries a write.
    obs = observation(workspace, original)
    selection = _selection({k: payload[k] for k in ("entity", "projectRecordId", "commandOperationId", "historyStateVersion")})
    prefix = request_key(original["id"], "staff-history", obs)
    whoami = client.whoami(request_key(prefix, "whoami"))
    metadata = client.request(request_key(prefix, "metadata"), "GET", "$metadata", headers={"Accept": "application/xml"})
    require(metadata["response"]["status"] == 200, "STAFF_METADATA_HTTP", "The actual target metadata read failed.")
    csdl = Csdl(binary(metadata["response"]["body"], "staff target CSDL", MAX_XML))
    exchanges = {}
    for name in ("operation", *MEMBERS):
        request = _read_request(selection, "operation" if name == "operation" else "history-member",
                                None if name == "operation" else name)
        payload_body = {"Request": _canonical(request)}
        csdl.operation(READ_API, payload_body, function=False)
        exchange, _ = client.json(request_key(prefix, name), "POST", READ_API, payload=payload_body, statuses=(200,))
        exchanges[name] = exchange
    value = {"schema": CAPTURE_SCHEMA, "state": "COMPLETE", "selection": selection,
             "profile": public_profile(chosen_profile), "whoami": whoami, "metadata": metadata,
             "exchanges": exchanges, "created_at": original["createdAt"], "observation_id": obs,
             "meaning": "Project-scoped reads of one completed immutable native staff action. No staff command, financial write, target import or customer acceptance is performed."}
    verify_capture(value, {"id": selected["id"], "revision": selected["revision"], "snapshot": selected["snapshot"]})
    result = put_record(workspace, original, "staff-history", value, selected)
    return journal.retain_result(complete_key, result)

def commit_action(workspace, original, prepared):
    return clone(prepared)

def _selected_correction(checked, chosen):
    corrections = checked["members"]["after"].get("corrections")
    require(isinstance(corrections, list), "STAFF_CORRECTIONS", "The original native history has no correction list.")
    found = [x for x in corrections if isinstance(x, dict) and x.get("id") == chosen["correctionId"]]
    require(len(found) == 1, "STAFF_CORRECTION_MISSING", "The actual original correction is absent or ambiguous.")
    correction = found[0]
    request, receipt = checked["request"], checked["receipt"]
    require(isinstance(request.get("payload"), dict)
            and request["payload"].get("id") == chosen["correctionId"],
            "STAFF_CORRECTION_COMMAND", "This native operation did not act on the selected correction.")
    if correction.get("status") == "resolved":
        resolution = correction.get("resolution")
        require(request.get("action") == "correction.resolve" and isinstance(resolution, dict)
                and resolution.get("operation_id") == chosen["operationId"]
                and resolution.get("actor_id") == receipt.get("actor_id")
                and resolution.get("at") == receipt.get("at")
                and resolution.get("outcome") in ("corrected", "reviewed-no-change")
                and resolution.get("outcome") == request["payload"].get("outcome"),
                "STAFF_CORRECTION_RESOLUTION", "The correction is not bound to its actual native resolution action.")
    else:
        require(correction.get("status") == "open" and correction.get("resolution") is None
                and request.get("action") == "correction.open"
                and correction.get("operation_id") == chosen["operationId"],
                "STAFF_CORRECTION_OPEN", "The correction is not bound to its actual native opening action.")
    return correction

def resolve_correction(workspace, reference):
    """Resolve Root support's exact original pointer, without network or writes.

    historySha256 is the full native AFTER member hash, equal to after_sha256
    on the same native receipt. A resolved correction must name its actual
    correction.resolve action, not a later unrelated project observation.
    """
    exact_keys(reference, ["correctionId", "operationId", "projectRecordId", "stateVersion", "historySha256"],
               ["correctionId", "operationId", "projectRecordId", "stateVersion", "historySha256"])
    chosen = {"correctionId": guid(reference["correctionId"]), "operationId": guid(reference["operationId"]),
              "projectRecordId": guid(reference["projectRecordId"]),
              "stateVersion": integer(reference["stateVersion"], "correction history revision", 1),
              "historySha256": reference["historySha256"]}
    require(chosen == reference and isinstance(chosen["historySha256"], str)
            and HASH.fullmatch(chosen["historySha256"]), "STAFF_CORRECTION_REFERENCE",
            "Use the exact canonical original correction/history pointer.")
    with workspace.reader() as db:
        rows = db.execute("SELECT id FROM dataverse_records WHERE kind=? ORDER BY rowid", ("staff-history",)).fetchall()
    matches = []
    for row in rows:
        saved = record(workspace, row["id"], "staff-history")
        value = saved["value"]
        selection = value.get("selection", {})
        if (selection.get("commandOperationId") != chosen["operationId"]
                or selection.get("projectRecordId") != chosen["projectRecordId"]
                or selection.get("historyStateVersion") != chosen["stateVersion"]):
            continue
        checked = verify_capture(value, saved["portfolio"])
        require(checked["member_refs"]["after"]["sha256"] == chosen["historySha256"],
                "STAFF_CORRECTION_HISTORY", "The selected native correction history hash differs.")
        correction = _selected_correction(checked, chosen)
        matches.append({"saved": saved, "checked": checked, "correction": correction})
    require(matches, "STAFF_CORRECTION_NOT_RETAINED",
            "Capture the actual native correction action/history in this original workspace before binding support.")
    first = matches[0]
    semantic = (_canonical(first["correction"]), _canonical(first["checked"]["receipt"]),
                first["saved"]["portfolio"], target_identity(first["checked"]["profile"]))
    require(all((_canonical(x["correction"]), _canonical(x["checked"]["receipt"]),
                 x["saved"]["portfolio"], target_identity(x["checked"]["profile"])) == semantic for x in matches),
            "STAFF_CORRECTION_AMBIGUOUS", "Multiple retained targets or portfolio bindings disagree on the selected correction.")
    saved, checked = first["saved"], first["checked"]
    return {"reference": clone(reference), "correction": _plain(first["correction"]),
            "portfolioId": saved["portfolio"]["id"],
            "source": {"recordId": saved["id"], "recordSha256": identity(saved),
                       "workspaceId": saved["workspace_id"], "portfolio": clone(saved["portfolio"]),
                       "target": clone(checked["profile"]), "captureSha256": checked["capture_sha256"],
                       "requestSha256": checked["receipt"]["request_sha256"],
                       "history": clone(checked["member_refs"]),
                       "equivalentCaptureRecordIds": [x["saved"]["id"] for x in matches]},
            "meaning": "The actual retained native correction and its original resolution evidence. Target deployment validation and customer acceptance remain separate."}

def support_correction_options(workspace, portfolio_id, offset=0, limit=100):
    """Read existing native correction pointers; never capture or alter a source."""
    identifier(portfolio_id, "key")
    integer(offset, "correction offset", 0)
    integer(limit, "correction page size", 1, 100)
    with workspace.reader() as db:
        rows = db.execute("SELECT id FROM dataverse_records WHERE kind=? ORDER BY rowid",
                          ("staff-history",)).fetchall()
    options = {}
    for row in rows:
        saved = record(workspace, row["id"], "staff-history")
        if not isinstance(saved.get("portfolio"), dict) or saved["portfolio"].get("id") != portfolio_id:
            continue
        checked = verify_capture(saved["value"], saved["portfolio"])
        request, receipt = checked["request"], checked["receipt"]
        if request.get("action") not in ("correction.open", "correction.resolve"):
            continue
        chosen = {"correctionId": guid(request.get("payload", {}).get("id")),
                  "operationId": guid(request["operation_id"]),
                  "projectRecordId": guid(request["record_id"]),
                  "stateVersion": _int(receipt["after_state_version"], "correction state version", 1),
                  "historySha256": checked["member_refs"]["after"]["sha256"]}
        correction = _selected_correction(checked, chosen)
        key = identity(chosen)
        source_key = (target_identity(checked["profile"]), saved["portfolio"], _canonical(correction))
        item = {"reference": chosen, "title": str(correction["title"]), "status": str(correction["status"]),
                "projectLabel": str(request["entity"]) + " / " + str(request["record_id"]),
                "recordedAt": str(receipt["at"])}
        if key in options:
            require(options[key]["source"] == source_key, "STAFF_CORRECTION_AMBIGUOUS",
                    "Retained native targets or portfolio sources disagree on this exact correction pointer.")
        else:
            options[key] = {"source": source_key, "row": item}
    values = sorted((x["row"] for x in options.values()),
                    key=lambda x: (x["recordedAt"], x["reference"]["projectRecordId"],
                                   x["reference"]["stateVersion"], x["reference"]["operationId"]), reverse=True)
    selected = values[offset:offset + limit]
    return {"rows": selected, "total": len(values), "offset": offset,
            "nextOffset": offset + len(selected) if offset + len(selected) < len(values) else None}
