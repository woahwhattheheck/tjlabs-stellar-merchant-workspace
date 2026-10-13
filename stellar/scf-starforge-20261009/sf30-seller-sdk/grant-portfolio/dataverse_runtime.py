"""Apply the original compiled native solution, preserving request uncertainty.

All state is written through the existing workspace's operation journal. This
module creates no alternate workspace, tenant or business-state database.
"""
from __future__ import annotations

import re
from xml.sax.saxutils import escape
from dataverse_contract import (
    NS, MAX_JSON, DataverseError, require, clone, identity, guid, identifier,
    binary, parse_json, Csdl, resource_rows, source_subset, target_identity,
    validate_snapshot, json_bytes, api_root, pack,
)
from dataverse_solution import (
    verify_plan, resolve, component_route, filter_query, literal,
    METADATA_KINDS, _comparison, _metadata_payload,
)
from dataverse_client import NativeResultUnknown, request_key
from dataverse_security import observed_constraint, table_privilege_path

RUNTIME_SCHEMA = "tjlabs.pmrs.dataverse-deployment/v1"

def exchange_ref(exchange):
    return {"request_id": exchange["request_id"], "request_sha256": identity(exchange["request"]),
            "method": exchange["request"]["method"], "path": exchange["request"]["path"],
            "status": exchange["response"]["status"], "body_sha256": exchange["response"]["body"]["sha256"],
            "bytes": exchange["response"]["body"]["bytes"], "received_at": exchange["received_at"]}

def resource_ref(resource):
    return {"path": resource["path"], "complete": resource["complete"],
            "exchanges": [exchange_ref(x) for x in resource["exchanges"]]}

def lookup_property(csdl, entity_set, navigation):
    """Use the target's declared lookup constraint instead of guessing its name."""
    csdl.navigation(entity_set, navigation)
    current = csdl.type(csdl.entity_set(entity_set))
    found = []
    edm = "{http://docs.oasis-open.org/odata/ns/edm}"
    while current is not None:
        for prop in current.findall(edm + "NavigationProperty"):
            if prop.attrib.get("Name") == navigation:
                found.extend(x.attrib["Property"] for x in prop.findall(edm + "ReferentialConstraint"))
        parent = current.attrib.get("BaseType")
        current = csdl.type(parent) if parent else None
    require(len(found) == 1, "LOOKUP_CONTRACT", "The actual target does not expose one native lookup constraint.",
            entity_set=entity_set, navigation=navigation)
    return found[0]

class NativeWorkflow:
    """The supplied journal retains immutable step results in the same operation.

    result(key) -> original value or None
    retain_result(key,value) -> the same immutable complete value
    New source reads carry observation_id; native write IDs remain stable across
    continuations. A completed step is historical evidence and is not rewritten
    to describe later target edits.
    """
    def __init__(self, client, operation_id, observation_id, *, csdl):
        self.client, self.journal, self.csdl = client, client.journal, csdl
        identifier(operation_id, "key")
        identifier(observation_id, "key")
        self.operation_id, self.observation_id = operation_id, observation_id
        for method in ("result", "retain_result"):
            require(callable(getattr(self.journal, method, None)), "JOURNAL_CONTRACT",
                    "The original workspace must retain native step results.", method=method)

    def result(self, key):
        return self.journal.result(request_key(self.operation_id, "step", key))

    def retain(self, key, value):
        original = self.journal.retain_result(request_key(self.operation_id, "step", key), clone(value))
        require(original == value, "STEP_IDENTITY", "The original native step result differs.", step=key)
        return clone(original)

    def read(self, key, path):
        resource = self.client.read_resource(
            request_key(self.operation_id, "read", key, self.observation_id), path)
        return resource, resource_rows(resource, self.client.profile, key)

    def get(self, key, path, *, statuses=(200, 404)):
        return self.client.json(request_key(self.operation_id, "get", key, self.observation_id),
                                "GET", path, statuses=statuses)

    def write_id(self, key):
        return request_key(self.operation_id, "write", key)

    def retained_request(self, key):
        return self.journal.request(self.write_id(key))

    def was_dispatched(self, key):
        retained = self.retained_request(key)
        return bool(retained and retained.get("state") not in ("RESERVED", "NOT_DISPATCHED"))

    def write(self, key, method, path, body, headers=None):
        return self.client.json(self.write_id(key), method, path, payload=body,
                                headers=headers or {}, statuses=(200, 201, 202, 204))

    def reconcile_observation(self, key, evidence, result):
        retained = self.retained_request(key)
        if retained and retained.get("exchange") is None and retained.get("state") not in ("RESERVED", "NOT_DISPATCHED"):
            self.journal.reconcile(self.write_id(key), clone(evidence), clone(result))
            return "TARGET_POSTCONDITION_OBSERVED_TRANSPORT_UNKNOWN"
        if retained and retained.get("exchange") is not None:
            status = retained["exchange"]["response"]["status"]
            return "NATIVE_RETURN_AND_TARGET_OBSERVED" if 200 <= status < 300 else "TARGET_OBSERVED_AFTER_NON_SUCCESS_RETURN"
        return "ALREADY_PRESENT_IN_TARGET"

    def action_with_readback(self, op, readback):
        existing = self.result(op["key"])
        if existing is not None:
            return existing
        before, satisfied = readback("before")
        if satisfied:
            result = {"key": op["key"], "state": "COMPLETE",
                      "transport": self.reconcile_observation(op["key"], before, {"postcondition": True}),
                      "before": before, "after": before}
            return self.retain(op["key"], result)
        write_exchange = None
        try:
            write_exchange, _ = self.write(op["key"], op["method"], op["path"], op["body"], op.get("headers"))
        except NativeResultUnknown:
            after, satisfied = readback("unknown-return")
            if not satisfied:
                raise
            result = {"key": op["key"], "state": "COMPLETE",
                      "transport": self.reconcile_observation(op["key"], after, {"postcondition": True}),
                      "before": before, "after": after}
            return self.retain(op["key"], result)
        after, satisfied = readback("after")
        require(satisfied, "NATIVE_POSTCONDITION", "The actual readback does not establish the requested native result.",
                step=op["key"], original_request_id=self.write_id(op["key"]), uncertain=True)
        return self.retain(op["key"], {"key": op["key"], "state": "COMPLETE",
                           "transport": "NATIVE_RETURN_AND_TARGET_OBSERVED",
                           "native_return": exchange_ref(write_exchange), "before": before, "after": after})

def _component_matches(description, row, desired, csdl):
    if description["kind"] in METADATA_KINDS:
        # Attributes in a table-creation body describe initial columns. The
        # target's complete generated attribute population is not that list.
        compare = _metadata_payload(row, desired, {**description, "key": description["key"]})
        return source_subset(row, compare)
    return _comparison(row, desired, csdl, description["entity_set"])

def _row_binding(description, row):
    return {"id": guid(row.get(description["id_field"])), "entity_set": description["entity_set"],
            "kind": description["kind"], "id_field": description["id_field"]}

def _single(workflow, key, path):
    require(path is not None, "NATIVE_REFERENCE_PENDING", "The native selector still needs an actual prerequisite ID.")
    resource, rows = workflow.read(key, path)
    require(len(rows) <= 1, "TARGET_AMBIGUOUS", "The target selector returned multiple original records.", path=path)
    return resource, rows[0] if rows else None

def _reference(workflow, op, description, bindings):
    old = workflow.result(op["key"])
    if old is not None:
        return old
    path = filter_query(op["entity_set"], op["match"], bindings)
    resource, row = _single(workflow, op["key"], path)
    require(row is not None, "NATIVE_REFERENCE_PENDING",
            "The native reference is not exposed after its prerequisites; no replacement record was created.",
            reference=op["component"], source=resource_ref(resource))
    if description["native_id"] is not None:
        require(guid(row.get(description["id_field"])) == description["native_id"],
                "NATIVE_REFERENCE_CHANGED", "The original referenced record has been replaced.")
    # The full captured definition remains evidence. Referenced system records
    # may gain publisher metadata; the immutable selected identity is preserved.
    return workflow.retain(op["key"], {"key": op["key"], "state": "COMPLETE", "kind": "reference",
                           "binding": _row_binding(description, row), "original": clone(row),
                           "source": resource_ref(resource)})

def _component(workflow, op, description, bindings, resources):
    old = workflow.result(op["key"])
    if old is not None:
        return old
    desired = resolve(description["definition"], bindings, resources)
    selector = op["selector"]
    path = component_route(selector, bindings)
    source, current = _single(workflow, op["key"] + ":before", path)
    if current is not None and _component_matches(description, current, desired, workflow.csdl):
        if description["native_id"] is not None:
            require(guid(current.get(description["id_field"])) == description["native_id"],
                    "NATIVE_COMPONENT_REPLACED", "The selected existing component now has another identity.")
        if workflow.was_dispatched(op["key"]) and description["reserved_id"] is not None:
            require(guid(current.get(description["id_field"])) == description["reserved_id"],
                    "NATIVE_COMPONENT_ID", "A matching target record differs from the original dispatched create identity.")
        result = {"key": op["key"], "state": "COMPLETE", "binding": _row_binding(description, current),
                  "transport": workflow.reconcile_observation(op["key"], resource_ref(source), {"postcondition": True}),
                  "original_before": clone(current), "after": clone(current), "source": resource_ref(source)}
        return workflow.retain(op["key"], result)
    if workflow.was_dispatched(op["key"]):
        # Ask the original client for its original return. It can replay a
        # retained complete HTTP response, but cannot issue another write.
        retained = workflow.retained_request(op["key"])
        if retained.get("exchange") is None:
            raise NativeResultUnknown(workflow.write_id(op["key"]),
                                      "The target does not establish the original component write's postcondition.",
                                      source=resource_ref(source))
    if op["disposition"] == "REUSE":
        raise DataverseError("TARGET_CHANGED", "The previously matched target component changed before native adoption.",
                             component=description["key"], source=resource_ref(source))
    if op["disposition"] == "CREATE":
        require(current is None, "TARGET_COMPONENT_EXISTS",
                "A different target component now occupies the selected identity; it is preserved.",
                component=description["key"])
    else:
        require(current is not None and identity(current) == op["expected_original_sha256"],
                "TARGET_DEFINITION_CHANGED", "The original target definition changed before its selected update.",
                component=description["key"])
    body = resolve(op["body"], bindings, resources)
    # Revalidate the fully resolved native payload before the original write.
    native_type = description["definition"].get("@odata.type") if description["kind"] in METADATA_KINDS else workflow.csdl.entity_set(description["entity_set"])
    workflow.csdl.payload(native_type, body)
    exchange = None
    try:
        exchange, _ = workflow.write(op["key"], op["method"], op["path"], body, op["headers"])
    except NativeResultUnknown:
        after_source, after = _single(workflow, op["key"] + ":unknown-return", path)
        if after is None or not _component_matches(description, after, desired, workflow.csdl):
            raise
        if description["reserved_id"] is not None:
            require(guid(after.get(description["id_field"])) == description["reserved_id"],
                    "TARGET_COMPONENT_ID", "A matching target record has another reserved identity.")
        result = {"key": op["key"], "state": "COMPLETE", "binding": _row_binding(description, after),
                  "transport": workflow.reconcile_observation(op["key"], resource_ref(after_source), {"postcondition": True}),
                  "original_before": current, "after": after, "source": resource_ref(after_source)}
        return workflow.retain(op["key"], result)
    after_source, after = _single(workflow, op["key"] + ":after", path)
    require(after is not None and _component_matches(description, after, desired, workflow.csdl),
            "NATIVE_COMPONENT_READBACK", "The returned write has no matching complete target readback.",
            component=description["key"], request_id=workflow.write_id(op["key"]), uncertain=True)
    if description["reserved_id"] is not None:
        require(guid(after.get(description["id_field"])) == description["reserved_id"],
                "NATIVE_COMPONENT_ID", "The returned target record differs from its original reserved ID.")
    return workflow.retain(op["key"], {"key": op["key"], "state": "COMPLETE",
                           "binding": _row_binding(description, after), "transport": "NATIVE_RETURN_AND_TARGET_OBSERVED",
                           "native_return": exchange_ref(exchange), "original_before": current,
                           "after": after, "source": resource_ref(after_source)})

def _solution_membership(workflow, op, bindings):
    component = op.get("component")
    if component is None:
        component = op["body"]["ComponentId"]["$component"]
    selected = bindings[component]["id"]
    solution_id = bindings["solution"]["id"]
    lookup = lookup_property(workflow.csdl, "solutioncomponents", "solutionid")
    query = filter_query("solutioncomponents", {lookup: {"$guid": solution_id}, "objectid": {"$guid": selected}})
    native_type = op.get("body", {}).get("ComponentType")
    def observe(phase):
        source, rows = workflow.read(op["key"] + ":" + phase, query)
        satisfied = any(guid(r.get("objectid")) == selected
                        and (native_type is None or r.get("componenttype") == native_type) for r in rows)
        return {"source": resource_ref(source), "rows": rows}, satisfied
    if op["kind"] == "solution_context_membership":
        old = workflow.result(op["key"])
        if old is not None:
            return old
        observed, complete = observe("context")
        require(complete, "SOLUTION_MEMBERSHIP_PENDING",
                "The target has not established selected solution membership; an explicit supported component type may be needed.",
                component=component, source=observed)
        return workflow.retain(op["key"], {"key": op["key"], "state": "COMPLETE",
                               "transport": "ACTUAL_CONTEXT_MEMBERSHIP", "after": observed})
    resolved = {**op, "body": resolve(op["body"], bindings, {})}
    return workflow.action_with_readback(resolved, observe)

def _app_membership(workflow, op, bindings):
    app_id = bindings[op["app"]]["id"]
    workflow.csdl.operation("RetrieveAppComponents", {"AppModuleId": app_id}, function=True)
    query = "RetrieveAppComponents(AppModuleId=" + app_id + ")"
    desired = []
    for member in op["selected_components"]:
        desired.append((member["id_field"], bindings[member["component"]]["id"], NS + "." + member["entity_type"]))
    def observe(phase):
        source, rows = workflow.read(op["key"] + ":" + phase, query)
        found = []
        for field, wanted, kind in desired:
            matches = [row for row in rows if row.get(field) == wanted
                       and (row.get("@odata.type") is None or workflow.csdl.derives(row["@odata.type"], kind))]
            found.append(bool(matches))
        return {"source": resource_ref(source), "rows": rows}, all(found)
    old = workflow.result(op["key"])
    if old is not None:
        return old
    if op["kind"] == "verify_app_members":
        after, complete = observe("published")
        require(complete, "PUBLISHED_APP_COMPONENTS", "The published app does not expose every selected native component.",
                source=after)
        return workflow.retain(op["key"], {"key": op["key"], "state": "COMPLETE", "after": after})
    before, complete = observe("before")
    if complete:
        return workflow.retain(op["key"], {"key": op["key"], "state": "COMPLETE",
                               "transport": workflow.reconcile_observation(op["key"], before, {"postcondition": True}),
                               "before": before, "after": before})
    try:
        exchange, body = workflow.write(op["key"], op["method"], op["path"],
                                        resolve(op["body"], bindings, {}), op.get("headers"))
    except NativeResultUnknown:
        after, complete = observe("unknown-return")
        if not complete:
            raise
        return workflow.retain(op["key"], {"key": op["key"], "state": "COMPLETE",
                               "transport": workflow.reconcile_observation(op["key"], after, {"postcondition": True}),
                               "before": before, "after": after})
    # Microsoft's component reader describes the published app. Preserve the
    # successful addition now, then require the complete published membership
    # after native validation and publication in a separate retained step.
    return workflow.retain(op["key"], {"key": op["key"], "state": "ACCEPTED_PENDING_PUBLICATION",
                           "native_return": exchange_ref(exchange), "response": body, "before": before})

def _role_constraints(workflow, op, bindings):
    # These reads are repeated for this actual continuation before any remaining
    # role writes/publication. A prior observation cannot certify later access.
    result_key = op["key"] + ":observation:" + workflow.observation_id
    old = workflow.result(result_key)
    if old is not None:
        return old
    observations = []
    for group in op["constraints"]:
        binding = bindings.get(group["table"])
        require(binding and binding["kind"] == "table", "ROLE_CONSTRAINT_TABLE_PENDING",
                "The guarded original internal table has no actual native component ID.")
        table_source, metadata_rows = workflow.read(op["key"] + ":table:" + group["table"],
                                                    table_privilege_path(group["logical_name"]))
        require(len(metadata_rows) == 1, "ROLE_CONSTRAINT_METADATA",
                "Read the complete actual native internal-table privilege population.")
        role_results, sources = {}, {}
        for role_id in group["role_ids"]:
            role_source, roles = workflow.read(op["key"] + ":role:" + role_id, "roles(" + role_id + ")")
            require(len(roles) == 1 and guid(roles[0].get("roleid")) == role_id,
                    "ROLE_CONSTRAINT_ROLE", "The reviewed native business role is absent.", role_id=role_id)
            privilege_source, rows = workflow.read(op["key"] + ":role-privileges:" + role_id,
                                                   "RetrieveRolePrivilegesRole(RoleId=" + role_id + ")")
            require(len(rows) == 1, "ROLE_CONSTRAINT_ROLE_UNKNOWN",
                    "Retain the complete selected role privilege return.", role_id=role_id)
            role_results[role_id] = rows[0]
            sources[role_id] = {"role": resource_ref(role_source), "privileges": resource_ref(privilege_source)}
        checked = observed_constraint(workflow.csdl, group, metadata_rows[0], role_results,
                                      logical_name=group["logical_name"], metadata_id=binding["id"])
        forbidden = {item["id"] for item in checked["native_privileges"]}
        for grants in op["planned_grants"]:
            if grants["role_id"] not in group["role_ids"]:
                continue
            conflict = sorted(forbidden.intersection(guid(item["PrivilegeId"]) for item in grants["privileges"]))
            require(not conflict, "ROLE_CONSTRAINT_PLANNED_GRANT",
                    "The reviewed plan would give a selected business role a forbidden internal-table privilege. No conflicting grant was dispatched.",
                    table=group["table"], role_id=grants["role_id"], privilege_ids=conflict)
        observations.append({**checked, "table_source": resource_ref(table_source), "role_sources": sources})
    return workflow.retain(result_key, {"key": op["key"], "state": "COMPLETE",
                           "observation_id": workflow.observation_id, "constraints": observations,
                           "planned_grants_checked": True,
                           "meaning": "Original same-continuation selected-role observations; no grant removal and no effective-access claim."})

def _role_privileges(workflow, op):
    old = workflow.result(op["key"])
    if old is not None:
        return old
    rid = op["role_id"]
    def observe(phase):
        source, rows = workflow.read(op["key"] + ":" + phase, "RetrieveRolePrivilegesRole(RoleId=" + rid + ")")
        require(len(rows) == 1 and isinstance(rows[0].get("RolePrivileges"), list),
                "ROLE_PRIVILEGES_RETURN", "The native role privilege return is incomplete.")
        actual = rows[0]
        desired = op["body"]["Privileges"]
        selected = {x["PrivilegeId"] for x in desired}
        for original in op["original"]["RolePrivileges"]:
            if original.get("PrivilegeId") not in selected:
                require(any(source_subset(x, original) for x in actual["RolePrivileges"]), "UNSELECTED_ROLE_CHANGED",
                        "The observed role population differs in an unselected original privilege.")
        return {"source": resource_ref(source), "original": actual}, all(
            any(source_subset(existing, wanted) for existing in actual["RolePrivileges"]) for wanted in desired)
    before, satisfied = observe("reviewed-before")
    if not satisfied:
        require(identity(before["original"]) == op["expected_original_sha256"], "ROLE_SOURCE_CHANGED",
                "The reviewed original role privilege population changed; no unreviewed role mutation was made.")
    return workflow.action_with_readback(op, observe)

def _app_roles(workflow, op, bindings):
    old = workflow.result(op["key"])
    if old is not None:
        return old
    app_id = bindings[op["app"]]["id"]
    path = "appmodules(" + app_id + ")/appmoduleroles_association"
    before, rows = workflow.read(op["key"] + ":before", path)
    key = workflow.csdl.key("roles")
    original_ids = {guid(x.get(key)) for x in rows}
    selected = set(op["role_ids"])
    if not selected <= original_ids and "expected_original_sha256" in op:
        require(identity(rows) == op["expected_original_sha256"], "APP_ROLES_CHANGED",
                "The target app-role population differs from its reviewed source.")
    links = []
    for role_id in sorted(selected):
        key_name = op["key"] + ":" + role_id
        def observe(phase, current_role=role_id, current_key=key_name):
            source, current = workflow.read(current_key + ":" + phase, path)
            ids = {guid(x.get(key)) for x in current}
            return {"source": resource_ref(source), "rows": current, "role_ids": sorted(ids)}, current_role in ids
        action = {"key": key_name, "method": "POST", "path": path + "/$ref", "headers": {},
                  "body": {"@odata.id": api_root(workflow.client.profile) + "roles(" + role_id + ")"}}
        links.append(workflow.action_with_readback(action, observe))
    after, current = workflow.read(op["key"] + ":after", path)
    actual_ids = {guid(x.get(key)) for x in current}
    require(original_ids | selected <= actual_ids, "APP_ROLE_READBACK",
            "The native app-role readback lost an existing association or omitted a selected role.")
    return workflow.retain(op["key"], {"key": op["key"], "state": "COMPLETE", "review": op["review"],
                           "before": {"source": resource_ref(before), "rows": rows},
                           "links": links, "after": {"source": resource_ref(after), "rows": current},
                           "meaning": "Native app-role associations are retained; this does not prove effective user access."})

def _validate_app(workflow, op, bindings):
    old = workflow.result(op["key"])
    if old is not None:
        return old
    app_id = bindings[op["app"]]["id"]
    exchange, body = workflow.get(op["key"], "ValidateApp(AppModuleId=" + app_id + ")", statuses=(200,))
    require(isinstance(body, dict) and isinstance(body.get("AppValidationResponse"), dict),
            "APP_VALIDATION_RETURN", "Retain the actual complete native AppValidationResponse.")
    validation = body["AppValidationResponse"]
    require(validation.get("ValidationSuccess") is True, "APP_VALIDATION_FAILED",
            "The target's native app validation did not succeed.", app=op["app"],
            source=exchange_ref(exchange), validation=validation)
    return workflow.retain(op["key"], {"key": op["key"], "state": "COMPLETE",
                           "source": exchange_ref(exchange), "response": body})

def _publish(workflow, op, bindings):
    old = workflow.result(op["key"])
    if old is not None:
        return old
    parts = ["<importexportxml>"]
    for wrapper, tag, names in (
        ("entities", "entity", op["tables"]),
        ("webresources", "webresource", [bindings[k]["id"] for k in op["webresources"]]),
        ("appmodules", "appmodule", [bindings[k]["id"] for k in op["apps"]]),
    ):
        if names:
            parts.append("<" + wrapper + ">")
            parts.extend("<" + tag + ">" + escape(name) + "</" + tag + ">" for name in names)
            parts.append("</" + wrapper + ">")
    parts.append("</importexportxml>")
    payload = {"ParameterXml": "".join(parts)}
    workflow.csdl.operation("PublishXml", payload)
    # Publication is complete only with the original native return. A later
    # metadata read does not establish that this particular publish finished.
    exchange, body = workflow.write(op["key"], "POST", "PublishXml", payload)
    return workflow.retain(op["key"], {"key": op["key"], "state": "COMPLETE",
                           "native_return": exchange_ref(exchange), "response": body, "payload": payload})

def apply_solution(client, plan, snapshot, operation_id, observation_id, *, created_at):
    snapshot = validate_snapshot(snapshot)
    verify_plan(plan, plan["spec"], snapshot)
    require(target_identity(client.profile) == target_identity(snapshot["profile"]), "TARGET_IDENTITY",
            "The selected native client belongs to another original environment.")
    workflow = NativeWorkflow(client, operation_id, observation_id,
                              csdl=Csdl(binary(snapshot["csdl"]["response"]["body"], "actual CSDL")))
    existing = workflow.result("deployment-complete")
    binding = {"operation_id": operation_id, "plan_id": plan["id"], "plan_sha256": identity(plan),
               "snapshot_id": snapshot["id"], "snapshot_sha256": identity(snapshot), "created_at": created_at}
    if existing is not None:
        require(existing["binding"] == binding, "DEPLOYMENT_IDENTITY", "The completed original deployment has another input.")
        return existing
    workflow.retain("deployment-intent", binding)
    client.whoami(request_key(operation_id, "apply-whoami", observation_id))
    components = {c["key"]: c for c in plan["components"]}
    bindings, results = {}, []
    for op in plan["operations"]:
        if op["kind"] in ("reference", "component"):
            require(set(op["depends_on"]) <= set(bindings), "DEPENDENCY_PENDING",
                    "Native component prerequisites have not completed.", step=op["key"])
            description = components[op["component"]]
            result = (_reference(workflow, op, description, bindings) if op["kind"] == "reference"
                      else _component(workflow, op, description, bindings, plan["spec"]["resources"]))
            bindings[op["component"]] = result["binding"]
        elif op["kind"] == "solution_context_membership" or op.get("readback") == "solution_membership":
            result = _solution_membership(workflow, op, bindings)
        elif op.get("readback") == "app_membership" or op["kind"] == "verify_app_members":
            result = _app_membership(workflow, op, bindings)
        elif op["kind"] == "role_constraints":
            result = _role_constraints(workflow, op, bindings)
        elif op["kind"] == "role_privileges":
            result = _role_privileges(workflow, op)
        elif op["kind"] == "app_roles":
            result = _app_roles(workflow, op, bindings)
        elif op["kind"] == "validate_app":
            result = _validate_app(workflow, op, bindings)
        elif op["kind"] == "publish":
            result = _publish(workflow, op, bindings)
        else:
            raise DataverseError("PLAN_OPERATION", "The original plan contains an unsupported native operation.", step=op["key"])
        results.append(result)
    payload = {"schema": RUNTIME_SCHEMA, "binding": binding, "target": plan["target"],
               "state": "COMPLETE", "bindings": bindings, "steps": results,
               "source_refs": clone(plan["source_refs"]), "issues": clone(plan["issues"]),
               "meaning": "Original native solution composition and selected publication; customer workflow UAT and effective access remain separate."}
    return workflow.retain("deployment-complete", {"id": "deployment-" + identity(payload), **payload})
