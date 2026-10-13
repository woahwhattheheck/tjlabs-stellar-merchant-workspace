"""Execute and retain an explicitly reviewed native staff pilot in the original Workspace.

The programme never provisions a tenant or creates example projects. Its selected
CCS records and Climate Change Flagship already exist in the original portfolio
and target. Every staff mutation is the existing transactional Custom API, using
the actual selected actor profile and one deterministic original command ID.
"""
from __future__ import annotations

import json
import uuid
from dataverse_contract import (
    DataverseError, require, exact_keys, identifier, integer, guid, HASH, clone,
    identity, sha256, binary, pack, parse_json, public_profile, target_identity,
    validate_exchange, Csdl, MAX_XML,
)
from dataverse_client import DataverseClient, request_key, NativeResultUnknown
from dataverse_workspace import (
    initialize as initialize_native, WorkspaceJournal, selected_portfolio,
    observation, record, put_record, _value,
)
from staff_native import (
    READ_API, READ_SCHEMA, CAPTURE_SCHEMA, MEMBERS, MAX_STAFF, _parse, _canonical,
    _hash, _int, _plain, _pointer, _read_request, _response, verify_capture,
)
from domain import canonical as original_bytes, parse as original_parse, digest as original_identity

ACTIONS = ("dataverse.staff.programme",)
PROGRAMME_SCHEMA = "tjlabs.pmrs.staff-programme/v1"
RESULT_SCHEMA = "tjlabs.pmrs.staff-programme-result/v1"
COMMAND_API = "tjl_PMRSStaffCommand"
STAFF_ACTIONS = {
    "initialize", "evidence.record", "data-management.review", "validation.record",
    "gate0.decide", "design.submit", "qa.clearance", "qa.decide", "qa.withdraw",
    "condition.resolve", "correction.open", "correction.resolve", "design.reopen",
    "financial.review", "corporate.reference",
}
MAX_STEPS = 1000

def initialize(workspace):
    initialize_native(workspace)

def _text(value, name, limit=4000):
    require(type(value) is str and value.strip() and len(value) <= limit,
            "STAFF_PROGRAMME_TEXT", "Retain the complete actual " + name + ".")
    return value

def _sha(value):
    require(type(value) is str and HASH.fullmatch(value), "STAFF_PROGRAMME_SHA", "Use the exact original SHA-256.")
    return value

def _ref(value):
    exact_keys(value, ["sourceId", "entityKey", "sha256"], ["sourceId", "entityKey", "sha256"])
    return {k: _sha(value[k]) for k in ("sourceId", "entityKey", "sha256")}

def _review(value):
    exact_keys(value, ["actor", "at", "reason", "source_refs"], ["actor", "at", "reason", "source_refs"])
    for key in ("actor", "at", "reason"):
        _text(value[key], "programme review " + key)
    require(isinstance(value["source_refs"], list) and value["source_refs"],
            "STAFF_PROGRAMME_REVIEW", "Bind the actual pilot selection and intended actions to reviewed sources.")
    for item in value["source_refs"]:
        require(isinstance(item, dict) and item, "STAFF_PROGRAMME_REVIEW", "Retain complete explicit source references.")

def _binding(value):
    exact_keys(value, ["id_pointer", "revision_pointer", "snapshot_pointer"],
               ["id_pointer", "revision_pointer", "snapshot_pointer"])
    require(len(set(value.values())) == 3, "STAFF_PROGRAMME_BINDING", "Use distinct original portfolio pointers.")
    for pointer in value.values():
        require(type(pointer) is str and pointer.startswith("/"), "STAFF_PROGRAMME_BINDING", "Use RFC 6901 source pointers.")

def validate_programme(value):
    exact_keys(value, ["schema", "id", "title", "policy_sha256", "actors", "projects", "flagship", "review"],
               ["schema", "id", "title", "policy_sha256", "actors", "projects", "flagship", "review"])
    require(value["schema"] == PROGRAMME_SCHEMA, "STAFF_PROGRAMME_SCHEMA", "Use the complete reviewed staff programme.")
    guid(value["id"]); _text(value["title"], "pilot title", 300); _sha(value["policy_sha256"]); _review(value["review"])
    actors = value["actors"]
    require(isinstance(actors, dict) and actors, "STAFF_PROGRAMME_ACTORS", "Choose the actual native users.")
    for key, actor in actors.items():
        identifier(key, "key")
        exact_keys(actor, ["user_id", "label"], ["user_id", "label"])
        guid(actor["user_id"]); _text(actor["label"], "native actor label", 300)
    projects = value["projects"]
    require(isinstance(projects, list) and 3 <= len(projects) <= 100,
            "STAFF_PROGRAMME_COHORT", "Select at least three real CCS project records for the issued pilot.")
    keys, native_ids, source_ids, total = set(), set(), set(), 0
    for project in projects:
        exact_keys(project, ["key", "label", "classification", "source", "entity", "record_id",
            "source_reference_pointer", "initial", "steps"],
            ["key", "label", "classification", "source", "entity", "record_id",
             "source_reference_pointer", "initial", "steps"])
        key = identifier(project["key"], "key"); _text(project["label"], "selected project label", 300)
        require(project["classification"] == "CCS", "STAFF_PROGRAMME_CCS", "Explicitly review each selected project as CCS.")
        ref = _ref(project["source"]); native = (identifier(project["entity"]), guid(project["record_id"]))
        require(key not in keys and native not in native_ids and (ref["sourceId"], ref["entityKey"]) not in source_ids,
                "STAFF_PROGRAMME_COHORT", "Each selected CCS project must be a distinct original source/native record.")
        keys.add(key); native_ids.add(native); source_ids.add((ref["sourceId"], ref["entityKey"]))
        _text(project["source_reference_pointer"], "native source reference pointer", 1000)
        require(project["source_reference_pointer"].startswith("/"), "STAFF_PROGRAMME_SOURCE", "Use the reviewed original source pointer.")
        initial = project["initial"]
        exact_keys(initial, ["row_version", "state_version", "source_sha256", "state_sha256"],
                   ["row_version", "state_version", "source_sha256", "state_sha256"])
        _text(initial["row_version"], "observed original row version", 200)
        _int(initial["state_version"], "initial native state version")
        _sha(initial["source_sha256"]); _sha(initial["state_sha256"])
        steps = project["steps"]
        require(isinstance(steps, list) and steps, "STAFF_PROGRAMME_STEPS", "Select the complete actual staff work for each project.")
        step_keys = set()
        for step in steps:
            exact_keys(step, ["key", "actor", "action", "payload", "expected_phase", "note"],
                       ["key", "actor", "action", "payload", "expected_phase", "note"])
            step_key = identifier(step["key"], "key")
            require(step_key not in step_keys and step["actor"] in actors and step["action"] in STAFF_ACTIONS,
                    "STAFF_PROGRAMME_STEP", "Use distinct steps and actual selected actors/actions.")
            step_keys.add(step_key)
            require(isinstance(step["payload"], dict), "STAFF_PROGRAMME_PAYLOAD", "Retain the complete actual command payload.")
            _text(step["note"], "step purpose", 4000)
            require(step["expected_phase"] in ("IDEA", "FORMULATION", "QA_SUBMITTED", "APPRAISED", "CLOSED_PIPELINE"),
                    "STAFF_PROGRAMME_PHASE", "Record the reviewed expected result phase.")
        total += len(steps)
    require(total <= MAX_STEPS, "STAFF_PROGRAMME_SIZE", "The programme exceeds the explicit 1,000-step receiving bound.")
    flagship = value["flagship"]
    exact_keys(flagship, ["label", "classification", "source", "actor", "entity_set", "record_id", "source_field",
        "source_reference_pointer", "portfolio_binding", "members_pointer", "members", "expected_source_sha256"],
        ["label", "classification", "source", "actor", "entity_set", "record_id", "source_field",
         "source_reference_pointer", "portfolio_binding", "members_pointer", "members", "expected_source_sha256"])
    require(flagship["classification"] == "Climate Change Flagship" and flagship["actor"] in actors,
            "STAFF_PROGRAMME_FLAGSHIP", "Select the actual reviewed Climate Change Flagship and native reader.")
    _text(flagship["label"], "selected Flagship label", 300); _ref(flagship["source"])
    for key in ("entity_set", "source_field"): identifier(flagship[key])
    guid(flagship["record_id"]); _sha(flagship["expected_source_sha256"]); _binding(flagship["portfolio_binding"])
    for key in ("source_reference_pointer", "members_pointer"):
        _text(flagship[key], "Flagship source pointer", 1000)
        require(flagship[key].startswith("/"), "STAFF_PROGRAMME_FLAGSHIP", "Use an actual original JSON pointer.")
    members = flagship["members"]
    require(isinstance(members, list) and 3 <= len(members) <= 1000,
            "STAFF_PROGRAMME_FLAGSHIP", "Retain the complete explicitly selected Flagship member list.")
    member_keys = []
    for member in members:
        ref = _ref(member); member_keys.append((ref["sourceId"], ref["entityKey"]))
    require(len(member_keys) == len(set(member_keys)) and source_ids <= set(member_keys),
            "STAFF_PROGRAMME_FLAGSHIP", "The actual Flagship aggregate must include the selected CCS project sources.")
    all_refs = {(x["sourceId"], x["entityKey"]): x for x in members}
    require(all(all_refs[(p["source"]["sourceId"], p["source"]["entityKey"])] == p["source"] for p in projects),
            "STAFF_PROGRAMME_FLAGSHIP", "Flagship membership must bind the same exact project editions.")
    require((flagship["source"]["sourceId"], flagship["source"]["entityKey"]) not in source_ids,
            "STAFF_PROGRAMME_FLAGSHIP", "The Flagship source is a separate actual aggregate record.")
    return value

def validate_action(workspace, value):
    require(value["action"] in ACTIONS, "STAFF_PROGRAMME_ACTION", "Select the maintained staff programme action.")
    p = value["payload"]
    exact_keys(p, ["actor", "portfolio", "programmeObject", "profileIds"],
               ["actor", "portfolio", "programmeObject", "profileIds"])
    _text(p["actor"], "receiving operator", 300); _sha(p["programmeObject"])
    selected_portfolio(workspace, p)
    path = workspace.object(p["programmeObject"])
    require(path.stat().st_size <= MAX_STAFF, "STAFF_PROGRAMME_SIZE", "Retain the full programme within 1 MiB.")
    raw = path.read_bytes()
    require(sha256(raw) == p["programmeObject"], "STAFF_PROGRAMME_OBJECT", "The retained original programme changed.")
    spec = validate_programme(_parse(raw.decode("utf-8")))
    require(isinstance(p["profileIds"], dict) and set(p["profileIds"]) == set(spec["actors"]),
            "STAFF_PROGRAMME_PROFILES", "Choose one explicit locally saved profile for every actual actor.")
    for name in p["profileIds"].values(): identifier(name, "key")

def _portfolio(selected):
    return {k: selected[k] for k in ("id", "revision", "snapshot")}

def _portfolio_from_source(source, binding):
    return {"id": _pointer(source, binding["id_pointer"]),
            "revision": _int(_pointer(source, binding["revision_pointer"]), "portfolio revision"),
            "snapshot": _pointer(source, binding["snapshot_pointer"])}

def _all_refs(spec):
    values = [p["source"] for p in spec["projects"]] + [spec["flagship"]["source"], *spec["flagship"]["members"]]
    output = {}
    for value in values:
        ref = _ref(value); key = ref["sourceId"] + ":" + ref["entityKey"]
        require(key not in output or output[key] == ref, "STAFF_PROGRAMME_SOURCE", "One source key names conflicting original editions.")
        output[key] = ref
    return output

def _details(workspace, selected, spec):
    result = {}
    for key, ref in _all_refs(spec).items():
        actual = workspace.detail(selected["id"], selected["revision"], ref["sourceId"], ref["entityKey"])
        result[key] = pack(original_bytes(actual))
    _verify_details(result, selected, spec)
    return result

def _verify_details(details, selected, spec):
    references = _all_refs(spec)
    require(isinstance(details, dict) and set(details) == set(references),
            "STAFF_PROGRAMME_ORIGINALS", "Retain the complete original detail for each selected source/member.")
    for key, ref in references.items():
        raw = binary(details[key], "original portfolio source detail")
        actual = original_parse(raw)
        require(original_bytes(actual) == raw and actual.get("portfolioId") == selected["id"]
                and actual.get("revision") == selected["revision"] and actual.get("snapshot") == selected["snapshot"],
                "STAFF_PROGRAMME_ORIGINALS", "An original detail belongs to another portfolio revision.")
        entity = actual.get("entity", {})
        require(all(entity.get(k) == v for k, v in ref.items())
                and original_identity(entity.get("original")) == ref["sha256"],
                "STAFF_PROGRAMME_ORIGINALS", "The complete original entity differs from its selected source identity.")

def _native_json(exchange, profile, method, path):
    validate_exchange(exchange)
    require(target_identity(exchange["profile"]) == target_identity(profile)
            and exchange["request"]["method"] == method and exchange["request"]["path"] == path
            and exchange["response"]["status"] == 200,
            "STAFF_PROGRAMME_NATIVE", "The original complete native return selects another target or request.")
    return parse_json(binary(exchange["response"]["body"], "original native return"))

def _identity_evidence(value, actor):
    p = value["profile"]
    who = _native_json(value["whoami"], p, "GET", "WhoAmI()")
    require(guid(who.get("OrganizationId")) == p["organization_id"]
            and guid(who.get("UserId")) == actor["user_id"],
            "STAFF_PROGRAMME_ACTOR", "The selected profile does not return the reviewed actual user and organization.")
    metadata = value["metadata"]; validate_exchange(metadata)
    require(target_identity(metadata["profile"]) == target_identity(p)
            and metadata["request"]["method"] == "GET" and metadata["request"]["path"] == "$metadata"
            and metadata["response"]["status"] == 200,
            "STAFF_PROGRAMME_METADATA", "Retain the complete actual metadata for the same actor target.")
    return Csdl(binary(metadata["response"]["body"], "staff target metadata", MAX_XML))

def _context_request(project):
    return {"schema": READ_SCHEMA, "entity": project["entity"], "record_id": project["record_id"], "view": "context"}

def _context(exchange, profile, project, selected, spec):
    output = _response(exchange, profile, _context_request(project))
    require(output.get("schema") == "tjlabs.pmrs.staff-context/v1"
            and output.get("entity") == project["entity"] and output.get("record_id") == project["record_id"],
            "STAFF_PROGRAMME_CONTEXT", "The actual staff context belongs to another original project.")
    require(output.get("policy_sha256") == spec["policy_sha256"]
            and _hash(output.get("policy")) == spec["policy_sha256"]
            and _hash(output.get("source_context")) == output.get("source_sha256"),
            "STAFF_PROGRAMME_CONTEXT", "The complete actual policy or source context changed.")
    original_source = output["source_context"].get("source")
    binding = output["policy"]["project"]["portfolio_binding"]
    require(_portfolio_from_source(original_source, binding) == selected
            and _ref(_pointer(original_source, project["source_reference_pointer"])) == project["source"],
            "STAFF_PROGRAMME_SOURCE", "The native project must bind its exact selected original portfolio/source edition.")
    return output

def _check_expected(context, expected):
    require(context["row_version"] == expected["row_version"]
            and _int(context["state_version"], "state version") == _int(expected["state_version"], "expected state version")
            and context["source_sha256"] == expected["source_sha256"]
            and _hash(context["state"]) == expected["state_sha256"],
            "STAFF_PROGRAMME_REVISION", "The actual project changed since this exact reviewed programme position.")

def _command_id(spec, project, step):
    return str(uuid.uuid5(uuid.UUID(spec["id"]), project["key"] + "/" + step["key"]))

def _command(spec, project, step, context):
    return {"schema": "tjlabs.pmrs.staff-command/v1", "operation_id": _command_id(spec, project, step),
            "entity": project["entity"], "record_id": project["record_id"], "action": step["action"],
            "expected_row_version": context["row_version"], "expected_state_version": context["state_version"],
            "expected_source_sha256": context["source_sha256"], "policy_sha256": spec["policy_sha256"],
            "payload": step["payload"]}

def _flagship_path(csdl, spec):
    f = spec["flagship"]; entity_type = csdl.entity_set(f["entity_set"])
    properties = csdl.properties(entity_type); key = csdl.key(f["entity_set"])
    require(properties.get(key, {}).get("Type") == "Edm.Guid"
            and properties.get(f["source_field"], {}).get("Type") == "Edm.String",
            "STAFF_PROGRAMME_FLAGSHIP_METADATA", "The actual aggregate requires its native GUID key and original source JSON string.")
    return f["entity_set"] + "(" + f["record_id"] + ")?$select=" + key + "," + f["source_field"], key

def _verify_flagship(value, spec, selected, actor_evidence):
    f = spec["flagship"]; actor = spec["actors"][f["actor"]]
    csdl = _identity_evidence(actor_evidence, actor)
    path, key = _flagship_path(csdl, spec)
    row = _native_json(value, actor_evidence["profile"], "GET", path)
    source_text = row.get(f["source_field"])
    require(guid(row.get(key)) == f["record_id"] and isinstance(source_text, str)
            and sha256(source_text.encode("utf-8")) == f["expected_source_sha256"],
            "STAFF_PROGRAMME_FLAGSHIP_SOURCE", "The actual native Flagship or its reviewed source text differs.")
    source = _parse(source_text)
    require(_portfolio_from_source(source, f["portfolio_binding"]) == selected
            and _ref(_pointer(source, f["source_reference_pointer"])) == f["source"]
            and _pointer(source, f["members_pointer"]) == f["members"],
            "STAFF_PROGRAMME_FLAGSHIP_MEMBERS", "The native aggregate must retain the full selected original member list.")
    return {"source": f["source"], "members": f["members"], "source_sha256": f["expected_source_sha256"],
            "native_record_id": f["record_id"], "exchange_sha256": identity(value)}

def _read(client, csdl, request_id, request):
    payload = {"Request": _canonical(request)}
    csdl.operation(READ_API, payload, function=False)
    exchange, _ = client.json(request_id, "POST", READ_API, payload=payload, statuses=(200,))
    return exchange

def _actor_evidence(client, key, actor):
    value = {"profile": public_profile(client.profile),
             "whoami": client.whoami(request_key(key, "whoami")),
             "metadata": client.request(request_key(key, "metadata"), "GET", "$metadata", headers={"Accept": "application/xml"})}
    _identity_evidence(value, actor)
    return value

def _capture(client, evidence, journal, parent, obs, project, command, operation_exchange):
    selection = {"entity": project["entity"], "projectRecordId": project["record_id"],
                 "commandOperationId": command["operation_id"],
                 "historyStateVersion": _int(command["expected_state_version"], "expected state version") + 1}
    csdl = Csdl(binary(evidence["metadata"]["response"]["body"], "native metadata", MAX_XML))
    exchanges = {"operation": operation_exchange}
    for name in MEMBERS:
        request = _read_request(selection, "history-member", name)
        exchanges[name] = _read(client, csdl, request_key(parent["id"], obs, command["operation_id"], name), request)
    return {"schema": CAPTURE_SCHEMA, "state": "COMPLETE", "selection": selection,
            "profile": evidence["profile"], "whoami": evidence["whoami"], "metadata": evidence["metadata"],
            "exchanges": exchanges, "created_at": parent["createdAt"], "observation_id": obs,
            "meaning": "Actual complete immutable native staff history from this reviewed programme; no customer acceptance or financial write is inferred."}

def _dispatch_rows(journal, parent, command_id):
    output = []
    for index in range(MAX_STEPS + 1):
        key = request_key(parent["id"], "staff-attempt", command_id, index)
        descriptor = journal.result(key)
        if descriptor is None:
            return output
        row = journal.request(descriptor["request_id"])
        output.append({"descriptor": descriptor, "native": row})
    raise DataverseError("STAFF_PROGRAMME_ATTEMPTS", "The original logical command exceeded its explicit continuation bound.")

def _command_return(exchange, profile, command):
    outer = _native_json(exchange, profile, "POST", COMMAND_API)
    request_body = parse_json(binary(exchange["request"]["body"], "native command request"))
    require(request_body == {"Request": _canonical(command)} and isinstance(outer.get("Response"), str),
            "STAFF_PROGRAMME_COMMAND_RETURN", "The complete native command response belongs to another original request.")
    output = _parse(outer["Response"])
    require(output.get("schema") == "tjlabs.pmrs.staff-command-result/v1" and isinstance(output.get("result"), dict)
            and output["result"].get("request_sha256") == _hash(command),
            "STAFF_PROGRAMME_COMMAND_RETURN", "The native command did not return its original receipt.")
    return output["result"]

def _check_step(value, spec, project, step, selected, expected):
    exact_keys(value, ["schema", "project_key", "step_key", "actor", "before", "after", "command_text",
        "command_sha256", "capture", "dispatches", "reconciliations", "expected"],
        ["schema", "project_key", "step_key", "actor", "before", "after", "command_text",
         "command_sha256", "capture", "dispatches", "reconciliations", "expected"])
    require(value["schema"] == RESULT_SCHEMA + ".step" and value["project_key"] == project["key"]
            and value["step_key"] == step["key"], "STAFF_PROGRAMME_STEP", "A saved native step belongs to another programme position.")
    evidence = value["actor"]; actor = spec["actors"][step["actor"]]
    _identity_evidence(evidence, actor)
    before = _context(value["before"], evidence["profile"], project, selected, spec)
    after = _context(value["after"], evidence["profile"], project, selected, spec)
    require(guid(before.get("actor_id")) == actor["user_id"] and guid(after.get("actor_id")) == actor["user_id"],
            "STAFF_PROGRAMME_ACTOR", "The complete native context was not read as the selected user.")
    _check_expected(before, expected)
    require(value["expected"] == _plain(expected), "STAFF_PROGRAMME_STEP_CHAIN", "The saved expected programme position changed.")
    command = _parse(value["command_text"])
    require(_canonical(command) == value["command_text"] and _hash(command) == value["command_sha256"]
            and command == _command(spec, project, step, before),
            "STAFF_PROGRAMME_COMMAND", "The immutable command differs from the exact reviewed payload and observed revision.")
    checked = verify_capture(value["capture"], selected)
    require(checked["request"] == command and checked["receipt"].get("actor_id") == actor["user_id"]
            and checked["receipt"].get("phase") == step["expected_phase"]
            and target_identity(checked["profile"]) == target_identity(evidence["profile"])
            and checked["member_refs"]["before"]["sha256"] == _hash(before["state"])
            and checked["member_refs"]["after"]["sha256"] == _hash(after["state"])
            and after["source_sha256"] == checked["receipt"]["source_sha256"]
            and after["policy_sha256"] == checked["receipt"]["policy_sha256"]
            and _int(after["state_version"], "after state version") == checked["selection"]["historyStateVersion"],
            "STAFF_PROGRAMME_READBACK", "The command, immutable history and immediate actual readback do not agree.")
    require(isinstance(value["dispatches"], list) and isinstance(value["reconciliations"], list),
            "STAFF_PROGRAMME_DISPATCH", "Retain original command attempts and explicit recovery reads.")
    for index, item in enumerate(value["dispatches"]):
        descriptor, row = item["descriptor"], item["native"]
        require(descriptor["index"] == index and descriptor["command_sha256"] == _hash(command)
                and descriptor["request_id"] == request_key(descriptor["parent"], "staff-command", command["operation_id"], index),
                "STAFF_PROGRAMME_DISPATCH", "An original native dispatch has another logical command identity.")
        if row is None:
            continue
        require(row["request_id"] == descriptor["request_id"], "STAFF_PROGRAMME_DISPATCH", "The native request ID changed.")
        intent = row["intent"]
        require(target_identity(intent["profile"]) == target_identity(evidence["profile"])
                and intent["request"]["path"] == COMMAND_API and intent["request"]["method"] == "POST"
                and parse_json(binary(intent["request"]["body"], "original command")) == {"Request": value["command_text"]},
                "STAFF_PROGRAMME_DISPATCH", "The original dispatched command intent changed.")
        if row.get("exchange") is not None:
            exchange = validate_exchange(row["exchange"])
            require(exchange["request"] == intent["request"] and exchange["request_id"] == row["request_id"]
                    and target_identity(exchange["profile"]) == target_identity(evidence["profile"]),
                    "STAFF_PROGRAMME_DISPATCH", "A complete command response differs from its original dispatch.")
            if exchange["response"]["status"] == 200:
                require(_command_return(exchange, evidence["profile"], command) == checked["receipt"],
                        "STAFF_PROGRAMME_RECEIPT", "The original command return and captured history disagree.")
    op_request = _read_request(checked["selection"], "operation")
    for exchange in value["reconciliations"]:
        found = _response(exchange, evidence["profile"], op_request)
        require(found.get("schema") == "tjlabs.pmrs.staff-operation-read/v1"
                and found.get("operation_id") == command["operation_id"] and found.get("found") in (True, False),
                "STAFF_PROGRAMME_RECONCILIATION", "A saved lookup must identify the original logical command.")
        if found["found"]:
            require(found.get("request") == command and found.get("result") == checked["receipt"],
                    "STAFF_PROGRAMME_RECONCILIATION", "The recovered native operation differs from the original command.")
    return {"row_version": after["row_version"], "state_version": _int(after["state_version"], "after revision"),
            "source_sha256": after["source_sha256"], "state_sha256": _hash(after["state"])}

def verify_programme(value, expected_portfolio=None):
    """No network and no writes: verify source selection, actual actors and every native step."""
    exact_keys(value, ["schema", "state", "portfolio", "programme", "programme_sha256", "source_details",
        "steps", "flagship", "created_at", "meaning"],
        ["schema", "state", "portfolio", "programme", "programme_sha256", "source_details",
         "steps", "flagship", "created_at", "meaning"])
    require(value["schema"] == RESULT_SCHEMA and value["state"] == "COMPLETE",
            "STAFF_PROGRAMME_STATE", "Use a complete retained original staff programme result.")
    selected = value["portfolio"]
    exact_keys(selected, ["id", "revision", "snapshot"], ["id", "revision", "snapshot"])
    identifier(selected["id"], "key"); integer(selected["revision"], "portfolio revision", 1); _sha(selected["snapshot"])
    if expected_portfolio is not None:
        require(selected == expected_portfolio, "STAFF_PROGRAMME_PORTFOLIO", "The result belongs to another receiving portfolio revision.")
    raw = binary(value["programme"], "reviewed original staff programme", MAX_STAFF)
    require(sha256(raw) == value["programme_sha256"], "STAFF_PROGRAMME_OBJECT", "The actual reviewed programme bytes changed.")
    spec = validate_programme(_parse(raw.decode("utf-8")))
    _verify_details(value["source_details"], selected, spec)
    expected_keys = [p["key"] + "/" + step["key"] for p in spec["projects"] for step in p["steps"]]
    require(isinstance(value["steps"], list) and len(value["steps"]) == len(expected_keys),
            "STAFF_PROGRAMME_STEPS", "Every explicitly reviewed original step must have its full native result.")
    positions, contexts, index, target = [], [], 0, None
    for project in spec["projects"]:
        expected = project["initial"]
        for step in project["steps"]:
            actual = value["steps"][index]; index += 1
            expected = _check_step(actual, spec, project, step, selected, expected)
            native_target = target_identity(actual["actor"]["profile"])
            target = native_target if target is None else target
            require(native_target == target, "STAFF_PROGRAMME_TARGET", "All selected pilot records must use the same actual target.")
            contexts.append(actual["capture"])
        positions.append({"project": project["key"], "source": _plain(project["source"]), "native": {
            "entity": project["entity"], "record_id": project["record_id"]}, "final": expected})
    f = value["flagship"]
    exact_keys(f, ["actor", "after_actor", "before", "after"], ["actor", "after_actor", "before", "after"])
    require(target_identity(f["actor"]["profile"]) == target, "STAFF_PROGRAMME_TARGET", "The Flagship must belong to the same original target.")
    before = _verify_flagship(f["before"], spec, selected, f["actor"])
    require(target_identity(f["after_actor"]["profile"]) == target, "STAFF_PROGRAMME_TARGET", "The final Flagship read must use the original target.")
    after = _verify_flagship(f["after"], spec, selected, f["after_actor"])
    return {"programmeId": spec["id"], "portfolio": clone(selected), "programmeSha256": value["programme_sha256"],
            "projectCount": len(positions), "completedStepCount": len(value["steps"]), "projects": positions,
            "flagship": _plain(after), "flagshipBefore": _plain(before),
            "nativeTarget": target, "customerAcceptance": "not established",
            "financialWrite": False, "resultSha256": identity(value)}

def prepare_action(workspace, original):
    initialize(workspace); validate_action(workspace, original["input"])
    payload = original["input"]["payload"]
    selected_full = selected_portfolio(workspace, payload); selected = _portfolio(selected_full)
    journal = WorkspaceJournal(workspace, original)
    complete_key = request_key(original["id"], "action-complete")
    previous = journal.result(complete_key)
    if previous is not None:
        saved = record(workspace, previous["id"], "staff-programme")
        verify_programme(saved["value"], saved["portfolio"])
        return previous
    raw = workspace.object(payload["programmeObject"]).read_bytes()
    spec = validate_programme(_parse(raw.decode("utf-8")))
    details_key = request_key(original["id"], "staff-source-details")
    details = journal.result(details_key)
    if details is None:
        details = journal.retain_result(details_key, _details(workspace, selected, spec))
    _verify_details(details, selected, spec)
    obs = observation(workspace, original)
    clients, actors, csdls = {}, {}, {}
    same_target = None
    for actor_key, actor in spec["actors"].items():
        chosen = _value(workspace, payload["profileIds"][actor_key], "profile", selected_full)["profile"]
        clients[actor_key] = DataverseClient(chosen, journal)
        evidence = _actor_evidence(clients[actor_key], request_key(original["id"], obs, actor_key), actor)
        actors[actor_key] = evidence; csdls[actor_key] = _identity_evidence(evidence, actor)
        current = target_identity(evidence["profile"])
        same_target = current if same_target is None else same_target
        require(current == same_target, "STAFF_PROGRAMME_TARGET", "The original cohort and actors must use the same actual target.")
    fkey = spec["flagship"]["actor"]; flagship_key = request_key(original["id"], "flagship-initial")
    flagship_initial = journal.result(flagship_key)
    if flagship_initial is None:
        path, _ = _flagship_path(csdls[fkey], spec)
        exchange = clients[fkey].request(request_key(original["id"], obs, "flagship-before"), "GET", path)
        _verify_flagship(exchange, spec, selected, actors[fkey])
        flagship_initial = journal.retain_result(flagship_key, {"actor": actors[fkey], "exchange": exchange})
    _verify_flagship(flagship_initial["exchange"], spec, selected, flagship_initial["actor"])
    all_steps = []
    for project in spec["projects"]:
        expected = project["initial"]
        for step in project["steps"]:
            command_id = _command_id(spec, project, step)
            step_key = request_key(original["id"], "staff-step-complete", command_id)
            completed = journal.result(step_key)
            if completed is not None:
                expected = _check_step(completed, spec, project, step, selected, expected)
                all_steps.append(completed)
                continue
            client, actor, csdl = clients[step["actor"]], actors[step["actor"]], csdls[step["actor"]]
            intent_key = request_key(original["id"], "staff-step-intent", command_id)
            intent = journal.result(intent_key)
            if intent is None:
                before_exchange = _read(client, csdl, request_key(original["id"], obs, command_id, "context-before"),
                                        _context_request(project))
                before = _context(before_exchange, actor["profile"], project, selected, spec)
                _check_expected(before, expected)
                require(guid(before.get("actor_id")) == spec["actors"][step["actor"]]["user_id"]
                        and step["action"] in before.get("available_actions", []),
                        "STAFF_PROGRAMME_PERMISSION", "The actual selected user has no advertised action permission.")
                command = _command(spec, project, step, before)
                intent = journal.retain_result(intent_key, {"before": before_exchange, "actor": actor,
                    "command_text": _canonical(command), "command_sha256": _hash(command), "expected": _plain(expected)})
            # Current credentials are checked above; the original actor remains fixed.
            require(target_identity(intent["actor"]["profile"]) == same_target
                    and _native_json(intent["actor"]["whoami"], intent["actor"]["profile"], "GET", "WhoAmI()")["UserId"]
                        == spec["actors"][step["actor"]]["user_id"], "STAFF_PROGRAMME_ACTOR", "The original command actor changed.")
            command = _parse(intent["command_text"])
            require(command == _command(spec, project, step,
                    _context(intent["before"], intent["actor"]["profile"], project, selected, spec)),
                    "STAFF_PROGRAMME_INTENT", "The original frozen command differs from the admitted programme.")
            selection = {"entity": project["entity"], "projectRecordId": project["record_id"],
                         "commandOperationId": command_id,
                         "historyStateVersion": _int(command["expected_state_version"], "expected revision") + 1}
            read_request = _read_request(selection, "operation")
            lookup = _read(client, csdl, request_key(original["id"], obs, command_id, "operation-before"), read_request)
            found = _response(lookup, actor["profile"], read_request)
            require(found.get("schema") == "tjlabs.pmrs.staff-operation-read/v1"
                    and found.get("operation_id") == command_id and found.get("found") in (True, False),
                    "STAFF_PROGRAMME_OPERATION", "The actual native original-operation lookup is incomplete.")
            lookups = [lookup]
            if found["found"]:
                require(found.get("request") == command and found.get("result", {}).get("actor_id") == spec["actors"][step["actor"]]["user_id"],
                        "STAFF_PROGRAMME_OPERATION", "The existing native operation has a different original request or actor.")
            else:
                attempts = _dispatch_rows(journal, original, command_id)
                # A returned failure remains explicit. An existing successful or
                # unknown attempt is resolved before any same-command repost.
                for item in attempts:
                    row = item["native"]
                    if row and row.get("exchange"):
                        status = row["exchange"]["response"]["status"]
                        require(status == 200, "STAFF_PROGRAMME_TERMINAL",
                                "The original command returned a terminal error; preserve it for operator correction.",
                                request_id=row["request_id"], status=status)
                        _command_return(row["exchange"], actor["profile"], command)
                        raise DataverseError("STAFF_PROGRAMME_READBACK_MISSING",
                            "The original success return has no matching visible immutable operation; do not replay.")
                check_exchange = _read(client, csdl, request_key(original["id"], obs, command_id, "context-resume"),
                                       _context_request(project))
                check = _context(check_exchange, actor["profile"], project, selected, spec)
                _check_expected(check, intent["expected"])
                if attempts and (attempts[-1]["native"] is None
                        or attempts[-1]["native"]["state"] in ("RESERVED", "NOT_DISPATCHED")):
                    descriptor = attempts[-1]["descriptor"]
                else:
                    index = len(attempts)
                    descriptor = {"index": index, "parent": original["id"], "command_sha256": _hash(command),
                                  "request_id": request_key(original["id"], "staff-command", command_id, index),
                                  "observation": obs}
                    journal.retain_result(request_key(original["id"], "staff-attempt", command_id, index), descriptor)
                if attempts and attempts[-1]["native"] is not None and attempts[-1]["native"]["state"] not in ("RESERVED", "NOT_DISPATCHED"):
                    require(attempts[-1]["descriptor"]["observation"] != obs,
                            "STAFF_PROGRAMME_RESUME", "An uncertain dispatch requires an explicit original-action continuation.")
                    journal.reconcile(attempts[-1]["native"]["request_id"],
                        {"operation_lookup": lookup, "current_context": check_exchange},
                        {"decision": "repeat-exact-idempotent-native-command", "command_sha256": _hash(command),
                         "same_operation_id": command_id,
                         "meaning": "Absence is not cancellation. The native unique command ID, actor binding and expected row version prevent a second business mutation."})
                body = {"Request": intent["command_text"]}
                csdl.operation(COMMAND_API, body, function=False)
                exchange, _ = client.json(descriptor["request_id"], "POST", COMMAND_API, payload=body, statuses=(200,))
                _command_return(exchange, actor["profile"], command)
                lookup = _read(client, csdl, request_key(original["id"], obs, command_id, "operation-after"), read_request)
                found = _response(lookup, actor["profile"], read_request); lookups.append(lookup)
                require(found.get("found") is True and found.get("request") == command,
                        "STAFF_PROGRAMME_READBACK", "The actual command requires its same immutable operation readback.")
            capture = _capture(client, actor, journal, original, obs, project, command, lookup)
            checked = verify_capture(capture, selected)
            require(checked["receipt"].get("actor_id") == spec["actors"][step["actor"]]["user_id"],
                    "STAFF_PROGRAMME_ACTOR", "The immutable action belongs to another native user.")
            # The original support resolver consumes these same complete captures.
            put_record(workspace, original, "staff-history", capture, selected_full)
            after = _read(client, csdl, request_key(original["id"], obs, command_id, "context-after"), _context_request(project))
            candidate = {"schema": RESULT_SCHEMA + ".step", "project_key": project["key"], "step_key": step["key"],
                "actor": intent["actor"], "before": intent["before"], "after": after,
                "command_text": intent["command_text"], "command_sha256": intent["command_sha256"],
                "capture": capture, "dispatches": _dispatch_rows(journal, original, command_id),
                "reconciliations": lookups, "expected": intent["expected"]}
            next_expected = _check_step(candidate, spec, project, step, selected, expected)
            completed = journal.retain_result(step_key, candidate)
            all_steps.append(completed); expected = next_expected
    # A final real aggregate read retains the unchanged original member/source
    # binding. Staff review does not invent or mutate a financial roll-up.
    path, _ = _flagship_path(csdls[fkey], spec)
    final_flagship = clients[fkey].request(request_key(original["id"], obs, "flagship-after"), "GET", path)
    _verify_flagship(final_flagship, spec, selected, actors[fkey])
    result_value = {"schema": RESULT_SCHEMA, "state": "COMPLETE", "portfolio": selected, "programme": pack(raw),
        "programme_sha256": sha256(raw), "source_details": details, "steps": all_steps,
        "flagship": {"actor": flagship_initial["actor"], "after_actor": actors[fkey], "before": flagship_initial["exchange"], "after": final_flagship},
        "created_at": original["createdAt"],
        "meaning": "Executed operator programme on explicitly selected original CCS and Flagship records. Actual native actions and identities are retained. Customer UAT acceptance, target solution import, managed/unmanaged delivery and Business Central posting are separate evidence."}
    verify_programme(result_value, selected)
    result = put_record(workspace, original, "staff-programme", result_value, selected_full)
    return journal.retain_result(complete_key, result)

def commit_action(workspace, original, prepared):
    return clone(prepared)
