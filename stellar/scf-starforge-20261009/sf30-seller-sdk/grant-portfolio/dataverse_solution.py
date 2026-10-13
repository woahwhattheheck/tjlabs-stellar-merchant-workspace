"""Compile a complete native Dataverse solution from retained target evidence.

The compiler performs no network access or workspace mutation. It produces the
same ordered native component/actions plan that the ALM executor later retains
under the original workspace operation.
"""
from __future__ import annotations

import re
import uuid
from urllib.parse import quote
from dataverse_contract import (
    NS, HASH, MAX_COMPONENTS, SPEC_SCHEMA, PLAN_SCHEMA, DataverseError, Csdl,
    require, exact_keys, text, identifier, integer, guid, clone, binary, xml,
    identity, json_bytes, sha256, source_subset, merge_definition, is_reference,
    resource_rows, validate_snapshot, target_profile, route,
)

from dataverse_security import validate_role_constraints, constraint_queries, compile_constraint_observations

ROW_KINDS = {
    "publisher": "publishers", "solution": "solutions", "systemform": "systemforms",
    "savedquery": "savedqueries", "webresource": "webresources", "sitemap": "sitemaps",
    "appmodule": "appmodules", "pluginassembly": "pluginassemblies",
    "plugintype": "plugintypes", "sdkmessageprocessingstep": "sdkmessageprocessingsteps",
    "sdkmessageprocessingstepimage": "sdkmessageprocessingstepimages",
    "customapi": "customapis", "customapirequestparameter": "customapirequestparameters",
    "customapiresponseproperty": "customapiresponseproperties", "role": "roles",
    "environmentvariabledefinition": "environmentvariabledefinitions",
    "environmentvariablevalue": "environmentvariablevalues",
    "connectionreference": "connectionreferences",
}
METADATA_KINDS = {"table", "attribute", "relationship"}
UNPUBLISHED_KINDS = {"appmodule", "webresource", "systemform", "savedquery", "sitemap"}
KINDS = set(ROW_KINDS) | METADATA_KINDS
COMPONENT_NAMESPACE = uuid.UUID("273ba93d-8d26-4e5b-a4dc-184c125e7bf2")
COMPONENT_TYPE_QUERY = (
    "EntityDefinitions(LogicalName='solutioncomponent')/Attributes(LogicalName='componenttype')/"
    "Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet"
)

def _scalar(value):
    require(value is None or isinstance(value, (str, int, bool)), "MATCH_VALUE",
            "Identity predicates require explicit literal JSON scalars.")
    if isinstance(value, str):
        text(value, "native identity value", 4000, empty=True)
    return value

def literal(value):
    _scalar(value)
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    return "'" + value.replace("'", "''") + "'"

def field_path(value):
    text(value, "native identity field", 500)
    parts = value.split("/")
    require(all(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", x) for x in parts),
            "MATCH_FIELD", "Use actual native field/navigation names.")
    return value

def match_literal(value, bindings=None):
    if isinstance(value, dict) and set(value) == {"$guid"}:
        return guid(value["$guid"])
    if is_reference(value):
        require("$component" in value, "MATCH_REFERENCE", "Identity predicates may reference an actual component GUID.")
        key = value["$component"]
        if bindings is None or key not in bindings:
            return None
        return guid(bindings[key]["id"])
    return literal(value)

def filter_query(entity_set, match, bindings=None):
    identifier(entity_set)
    require(isinstance(match, dict) and match, "COMPONENT_MATCH", "Select the complete explicit component identity.")
    values = [(field_path(k), match_literal(v, bindings)) for k, v in sorted(match.items())]
    if any(v is None for _, v in values):
        return None
    parts = [k + " eq " + v for k, v in values]
    return route(entity_set + "?$filter=" + quote(" and ".join(parts), safe="'()/,$"))

def component_route(component, bindings=None):
    kind, match = component["kind"], component["match"]
    if kind == "table":
        exact_keys(match, ["LogicalName"], ["LogicalName"])
        name = identifier(match["LogicalName"])
        return "EntityDefinitions(LogicalName=" + literal(name) + ")?$expand=Attributes"
    if kind == "attribute":
        exact_keys(match, ["table", "LogicalName"], ["table", "LogicalName"])
        table, name = identifier(match["table"]), identifier(match["LogicalName"])
        return "EntityDefinitions(LogicalName=" + literal(table) + ")/Attributes(LogicalName=" + literal(name) + ")"
    if kind == "relationship":
        exact_keys(match, ["SchemaName"], ["SchemaName"])
        return filter_query("RelationshipDefinitions", {"SchemaName": identifier(match["SchemaName"], "schema")})
    path = filter_query(component["entity_set"] if kind == "reference" else ROW_KINDS[kind], match, bindings)
    if path is not None and kind in UNPUBLISHED_KINDS:
        base, query = path.split("?", 1)
        return base + "/" + NS + ".RetrieveUnpublishedMultiple()?" + query
    return path

def _references(value, found=None):
    found = set() if found is None else found
    if is_reference(value):
        if "$component" in value:
            found.add(value["$component"])
        elif "$bind" in value:
            found.add(value["$bind"]["component"])
    elif isinstance(value, dict):
        for item in value.values():
            _references(item, found)
    elif isinstance(value, list):
        for item in value:
            _references(item, found)
    return found

def _resource_references(value, found=None):
    found = set() if found is None else found
    if is_reference(value):
        if "$resource" in value:
            found.add(value["$resource"])
    elif isinstance(value, dict):
        for item in value.values():
            _resource_references(item, found)
    elif isinstance(value, list):
        for item in value:
            _resource_references(item, found)
    return found

def resolve(value, bindings, resources, allow_pending=False):
    if is_reference(value):
        if "$component" in value:
            key = value["$component"]
            if key not in bindings:
                require(allow_pending, "COMPONENT_PENDING", "The original native component ID has not been returned.", component=key)
                return clone(value)
            return guid(bindings[key]["id"])
        if "$bind" in value:
            key, entity_set = value["$bind"]["component"], value["$bind"]["entity_set"]
            if key not in bindings:
                require(allow_pending, "COMPONENT_PENDING", "The original related native component has not been returned.", component=key)
                return clone(value)
            require(bindings[key]["entity_set"] == entity_set, "COMPONENT_BINDING",
                    "The native relationship refers to another entity set.", component=key)
            return "/" + entity_set + "(" + guid(bindings[key]["id"]) + ")"
        key = value["$resource"]
        require(key in resources, "RESOURCE_MISSING", "The complete authored resource is absent.", resource=key)
        raw = binary(resources[key], key)
        if value["as"] == "base64":
            return resources[key]["data_base64"]
        try:
            return raw.decode("utf-8")
        except UnicodeError as exc:
            raise DataverseError("RESOURCE_UTF8", "The selected authored resource is not UTF-8.", resource=key) from exc
    if isinstance(value, dict):
        return {k: resolve(v, bindings, resources, allow_pending) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve(v, bindings, resources, allow_pending) for v in value]
    return clone(value)

def _policy(value):
    value = {"mode": "create-or-match"} if value is None else value
    exact_keys(value, ["mode", "expected_original_sha256"], ["mode"])
    require(value["mode"] in ("create-or-match", "merge-selected"), "UPDATE_POLICY",
            "Choose create-or-match or an explicit source-bound merge-selected update.")
    if value["mode"] == "merge-selected":
        require(isinstance(value.get("expected_original_sha256"), str) and HASH.fullmatch(value["expected_original_sha256"]),
                "UPDATE_SOURCE", "An update requires the exact original definition's canonical SHA-256.")
    return clone(value)

def validate_spec(value):
    exact_keys(value, ["schema", "name", "publisher", "solution", "resources", "components",
                       "app_components", "role_privileges", "app_roles", "deployment_settings",
                       "source_refs", "notes", "native_references", "role_constraints"],
               ["schema", "publisher", "solution", "resources", "components",
                "app_components", "role_privileges", "app_roles", "deployment_settings", "source_refs"])
    require(value["schema"] == SPEC_SCHEMA, "SPEC_SCHEMA", "Use the original native solution specification.")
    if "name" in value:
        text(value["name"], "solution work order", 300)
    publisher, solution = value["publisher"], value["solution"]
    exact_keys(publisher, ["unique_name", "customization_prefix", "customization_option_value_prefix", "definition", "update_policy"],
               ["unique_name", "customization_prefix", "customization_option_value_prefix", "definition"])
    identifier(publisher["unique_name"], "unique")
    prefix = publisher["customization_prefix"]
    require(isinstance(prefix, str) and re.fullmatch(r"[a-z][a-z0-9]{1,7}", prefix), "PUBLISHER_PREFIX",
            "Select the actual publisher customization prefix.")
    integer(publisher["customization_option_value_prefix"], "publisher option prefix", 10000, 99999)
    exact_keys(solution, ["unique_name", "version", "definition", "update_policy"],
               ["unique_name", "version", "definition"])
    identifier(solution["unique_name"], "unique")
    require(isinstance(solution["version"], str) and re.fullmatch(r"\d+\.\d+\.\d+\.\d+", solution["version"]),
            "SOLUTION_VERSION", "Use the complete four-part solution version.")
    for part in solution["version"].split("."):
        integer(int(part), "solution version part", 0, 65535)
    require(isinstance(value["resources"], dict), "RESOURCES", "Retain complete original solution resources.")
    for key, resource in value["resources"].items():
        identifier(key, "key")
        binary(resource, key)
    require(isinstance(value["components"], list) and 0 < len(value["components"]) <= MAX_COMPONENTS,
            "COMPONENTS", "Supply the complete bounded native component set.")
    keys = {"publisher", "solution"}
    result = clone(value)
    for component in result["components"]:
        exact_keys(component, ["key", "kind", "match", "definition", "depends_on", "update_policy",
                               "solution_component_type", "add_required_components", "source_refs"],
                   ["key", "kind", "match", "definition", "depends_on"])
        key = identifier(component["key"], "key")
        require(key not in keys, "COMPONENT_KEY", "Every native component key is unique.", key=key)
        keys.add(key)
        require(component["kind"] in KINDS - {"publisher", "solution"}, "COMPONENT_KIND",
                "Use a supported native component type.", kind=component["kind"])
        require(isinstance(component["definition"], dict) and component["definition"], "DEFINITION",
                "Retain the complete authored native fields.", component=key)
        require(isinstance(component["depends_on"], list), "COMPONENT_DEPENDENCIES", "Declare original component dependencies.")
        for dependency in component["depends_on"]:
            identifier(dependency, "key")
        component["update_policy"] = _policy(component.get("update_policy"))
        component_route(component)
        if "solution_component_type" in component:
            integer(component["solution_component_type"], "actual native solution component type", 1, 2147483647)
        if "add_required_components" in component:
            require(isinstance(component["add_required_components"], bool), "SOLUTION_DEPENDENCIES",
                    "Specify AddRequiredComponents as an explicit boolean.")
    for native, fields in ((publisher, {"uniquename": publisher["unique_name"],
                                      "customizationprefix": prefix,
                                      "customizationoptionvalueprefix": publisher["customization_option_value_prefix"]}),
                           (solution, {"uniquename": solution["unique_name"], "version": solution["version"]})):
        require(isinstance(native["definition"], dict), "DEFINITION", "Retain the native publisher/solution definition.")
        for key, expected in fields.items():
            require(native["definition"].get(key) == expected, "SOLUTION_IDENTITY",
                    "The native definition differs from its explicit solution identity.", field=key)
        _policy(native.get("update_policy"))
    require(isinstance(result.get("native_references", []), list), "NATIVE_REFERENCES", "Retain the complete read-only target reference list.")
    require(len(result.get("native_references", [])) <= MAX_COMPONENTS, "NATIVE_REFERENCES", "Bound the complete native reference list.")
    for reference in result.get("native_references", []):
        exact_keys(reference, ["key", "entity_set", "match", "depends_on", "source_refs"],
                   ["key", "entity_set", "match", "depends_on"])
        key = identifier(reference["key"], "key")
        require(key not in keys, "COMPONENT_KEY", "A native reference key must be unique.", key=key)
        keys.add(key)
        identifier(reference["entity_set"])
        require(isinstance(reference["depends_on"], list), "REFERENCE_DEPENDENCIES", "Declare the native reference prerequisites.")
        filter_query(reference["entity_set"], reference["match"])
    for component in result["components"] + result.get("native_references", []):
        dependencies = set(component["depends_on"]) | _references(component.get("definition", {})) | _references(component["match"])
        require(dependencies <= keys and component["key"] not in dependencies, "COMPONENT_DEPENDENCIES",
                "Every component reference must resolve in this same authored solution.", component=component["key"])
        component["depends_on"] = sorted(dependencies)
        require(_resource_references(component.get("definition", {})) <= set(value["resources"]), "RESOURCE_MISSING",
                "Every native resource reference requires the exact retained original.")
    for field in ("app_components", "role_privileges", "app_roles", "source_refs"):
        require(isinstance(value[field], list), "SPEC_ARRAY", "Use the complete " + field + " array.")
    for group in value["app_components"]:
        exact_keys(group, ["app", "components"], ["app", "components"])
        require(group["app"] in keys, "APP_COMPONENT", "Select the authored app.")
        require(isinstance(group["components"], list) and group["components"], "APP_COMPONENT", "Select complete app component records.")
        for member in group["components"]:
            exact_keys(member, ["component", "entity_type", "id_field"], ["component", "entity_type", "id_field"])
            require(member["component"] in keys, "APP_COMPONENT", "Select an original native component.")
            identifier(member["entity_type"])
            identifier(member["id_field"])
    for group in value["role_privileges"]:
        exact_keys(group, ["role_id", "privileges", "expected_original_sha256", "review"], ["role_id", "privileges", "expected_original_sha256", "review"])
        guid(group["role_id"])
        require(isinstance(group["expected_original_sha256"], str) and HASH.fullmatch(group["expected_original_sha256"]),
                "ROLE_SOURCE", "Bind changes to the original full role-privilege result.")
        require(isinstance(group["privileges"], list), "ROLE_PRIVILEGES", "Declare every desired native privilege.")
        for privilege in group["privileges"]:
            require(isinstance(privilege, dict) and {"PrivilegeId", "Depth"} <= set(privilege), "ROLE_PRIVILEGE",
                    "Each explicit native privilege needs its ID and depth.")
            guid(privilege["PrivilegeId"])
        _review(group["review"])
    for group in value["app_roles"]:
        exact_keys(group, ["app", "role_ids", "expected_original_sha256", "review"],
                   ["app", "role_ids", "review"])
        require(group["app"] in keys and isinstance(group["role_ids"], list), "APP_ROLES", "Select an authored app and actual roles.")
        for role_id in group["role_ids"]:
            guid(role_id)
        if "expected_original_sha256" in group:
            require(HASH.fullmatch(group["expected_original_sha256"]), "APP_ROLE_SOURCE", "Bind existing app role membership.")
        _review(group["review"])
    validate_role_constraints(result.get("role_constraints", []), result["components"])
    validate_settings(value["deployment_settings"])
    return result

def _review(value):
    exact_keys(value, ["actor", "reason", "source_refs"], ["actor", "reason", "source_refs"])
    text(value["actor"], "reviewing operator", 300)
    text(value["reason"], "explicit security mapping reason", 4000)
    require(isinstance(value["source_refs"], list), "SOURCE_REFS", "Retain original security mapping evidence.")

def validate_settings(value):
    exact_keys(value, ["EnvironmentVariables", "ConnectionReferences"], ["EnvironmentVariables", "ConnectionReferences"])
    seen = set()
    for field, names, identity_field in (
        ("EnvironmentVariables", ["SchemaName", "Value"], "SchemaName"),
        ("ConnectionReferences", ["LogicalName", "ConnectionId", "ConnectorId"], "LogicalName"),
    ):
        require(isinstance(value[field], list), "DEPLOYMENT_SETTINGS", "Retain complete native deployment setting arrays.")
        for item in value[field]:
            exact_keys(item, names, names)
            identifier(item[identity_field], "schema" if identity_field == "SchemaName" else "logical")
            key = (field, item[identity_field])
            require(key not in seen, "DEPLOYMENT_SETTINGS", "A selected target setting occurs twice.")
            seen.add(key)
            for name in names:
                text(item[name], "deployment " + name, 16000, empty=(name == "Value"))
    return clone(value)

def all_components(spec):
    spec = validate_spec(spec)
    publisher = {"key": "publisher", "kind": "publisher", "match": {"uniquename": spec["publisher"]["unique_name"]},
                 "definition": spec["publisher"]["definition"], "depends_on": [],
                 "update_policy": _policy(spec["publisher"].get("update_policy"))}
    solution_body = clone(spec["solution"]["definition"])
    binding = {"$bind": {"component": "publisher", "entity_set": "publishers"}}
    require("publisherid@odata.bind" not in solution_body or solution_body["publisherid@odata.bind"] == binding,
            "SOLUTION_PUBLISHER", "The solution must bind its selected publisher.")
    solution_body["publisherid@odata.bind"] = binding
    solution = {"key": "solution", "kind": "solution", "match": {"uniquename": spec["solution"]["unique_name"]},
                "definition": solution_body, "depends_on": ["publisher"],
                "update_policy": _policy(spec["solution"].get("update_policy"))}
    references = [{**clone(r), "kind": "reference", "definition": {}} for r in spec.get("native_references", [])]
    components = [publisher, solution] + clone(spec["components"]) + references
    for component in components[2:]:
        if component["kind"] != "reference":
            component["depends_on"] = sorted(set(component["depends_on"]) | {"solution"})
    remaining = {c["key"]: c for c in components}
    ordered, done = [], set()
    while remaining:
        ready = sorted(k for k, c in remaining.items() if set(c["depends_on"]) <= done)
        require(ready, "COMPONENT_CYCLE", "The complete native component dependencies are cyclic.")
        for key in ready:
            ordered.append(remaining.pop(key))
            done.add(key)
    return ordered

def preflight_queries(spec, bindings=None):
    spec = validate_spec(spec)
    result = []
    for component in all_components(spec):
        path = component_route(component, bindings)
        if path is not None:
            result.append({"key": "component:" + component["key"], "path": path})
    # Whole native component bodies are retained; capability queries establish
    # whether a selected ordinary table supports ETag-based updates.
    for name in sorted({c["kind"] for c in all_components(spec) if c["kind"] in ROW_KINDS}):
        result.append({"key": "capability:" + name,
                       "path": "EntityDefinitions(LogicalName=" + literal(name) + ")?$select=LogicalName,IsOptimisticConcurrencyEnabled"})
    if any("solution_component_type" in c for c in spec["components"]):
        result.append({"key": "solution-component-types", "path": COMPONENT_TYPE_QUERY})
    for group in spec["role_privileges"]:
        rid = guid(group["role_id"])
        result.extend([{"key": "role:" + rid, "path": "roles(" + rid + ")"},
                       {"key": "role-privileges:" + rid, "path": "RetrieveRolePrivilegesRole(RoleId=" + rid + ")"}])
        for privilege in group["privileges"]:
            pid = guid(privilege["PrivilegeId"])
            result.append({"key": "privilege:" + pid, "path": "privileges(" + pid + ")"})
    for index, group in enumerate(spec["app_roles"]):
        if bindings and group["app"] in bindings:
            result.append({"key": "app-roles:" + str(index),
                           "path": "appmodules(" + guid(bindings[group["app"]]["id"]) + ")/appmoduleroles_association"})
        for rid in group["role_ids"]:
            rid = guid(rid)
            result.append({"key": "role:" + rid, "path": "roles(" + rid + ")"})
    result.extend(constraint_queries(spec))
    unique = {}
    for item in result:
        require(item["key"] not in unique or unique[item["key"]] == item, "PREFLIGHT_QUERY",
                "A repeated preflight key must identify the same exact source route.")
        unique[item["key"]] = item
    return list(unique.values())

def _native_field(csdl, entity_set, path):
    current = csdl.entity_set(entity_set)
    parts = field_path(path).split("/")
    for index, name in enumerate(parts):
        props = csdl.properties(current)
        require(name in props, "MATCH_FIELD", "The target does not expose an authored identity field.",
                entity_set=entity_set, field=path)
        prop = props[name]
        if index < len(parts) - 1:
            require(prop["Kind"] == "NavigationProperty" and not prop["Type"].startswith("Collection("),
                    "MATCH_NAVIGATION", "Identity traversal requires an actual single-valued navigation.")
            current = prop["Type"]
    return prop

def _target_component(snapshot, component, bindings=None):
    key = "component:" + component["key"]
    expected_path = component_route(component, bindings)
    if expected_path is None:
        require(key not in snapshot["resources"], "PREFLIGHT_DEFERRED", "A deferred selector cannot claim an original target response.")
        return None
    require(key in snapshot["resources"], "PREFLIGHT_MISSING", "The selected component was not captured.", key=key)
    entry = snapshot["resources"][key]
    require(entry["path"] == expected_path, "PREFLIGHT_CHANGED", "The source route differs from the authored selector.", key=key)
    rows = resource_rows(entry, snapshot["profile"], key)
    require(len(rows) <= 1, "COMPONENT_AMBIGUOUS", "The actual target returned multiple component matches.",
            component=component["key"], occurrences=len(rows))
    return rows[0] if rows else None

def _body_source(snapshot, key):
    return [{"request_id": r["request_id"], "body_sha256": r["response"]["body"]["sha256"],
             "bytes": r["response"]["body"]["bytes"], "path": r["request"]["path"],
             "status": r["response"]["status"], "received_at": r["received_at"]}
            for r in snapshot["resources"].get(key, {}).get("exchanges", [])]

def _metadata_payload(original, desired, component):
    changes = clone(desired)
    if component["kind"] == "table" and "Attributes" in changes:
        # Initial table definitions include their primary name attribute. The
        # existing target's remaining attributes must never be replaced by it.
        requested = changes.pop("Attributes")
        require(isinstance(requested, list), "TABLE_ATTRIBUTES", "Retain the authored initial table attribute list.")
        observed = {x.get("LogicalName"): x for x in original.get("Attributes", [])}
        for attribute in requested:
            name = attribute.get("LogicalName")
            if name is None and isinstance(attribute.get("SchemaName"), str):
                name = attribute["SchemaName"].lower()
            require(name in observed and source_subset(observed[name], attribute),
                    "TABLE_ATTRIBUTE_CHANGE", "Change existing columns through their explicit attribute components.",
                    component=component["key"], attribute=name)
    return changes

def _comparison(actual, desired, csdl, entity_set):
    # Native lookup IDs are returned as computed fields rather than @odata.bind.
    requested = clone(desired)
    for key, value in list(requested.items()):
        if key.endswith("@odata.bind") and isinstance(value, str):
            nav = key[:-11]
            prop = csdl.navigation(entity_set, nav)
            element = csdl.type(csdl.entity_set(entity_set))
            candidates = []
            while element is not None:
                for item in element.findall("{http://docs.oasis-open.org/odata/ns/edm}NavigationProperty"):
                    if item.attrib.get("Name") == nav:
                        candidates.extend(x.attrib.get("Property") for x in item.findall(
                            "{http://docs.oasis-open.org/odata/ns/edm}ReferentialConstraint"))
                parent = element.attrib.get("BaseType")
                element = csdl.type(parent) if parent else None
            require(len(candidates) == 1, "LOOKUP_COMPARISON", "The actual target must expose a unique lookup constraint.", navigation=nav)
            match = re.fullmatch(r"/?([a-z][a-z0-9_]*)\(([0-9a-f-]{36})\)", value)
            require(match, "LOOKUP_COMPARISON", "Bind one actual target GUID.")
            requested.pop(key)
            requested[candidates[0]] = guid(match.group(2))
    return source_subset(actual, requested)

def _xml_resources(kind, desired):
    for field, root in {"formxml": "form", "fetchxml": "fetch", "layoutxml": "grid", "sitemapxml": "SiteMap"}.items():
        if field in desired and isinstance(desired[field], str):
            xml(desired[field], root)
    if kind == "pluginassembly":
        require(desired.get("sourcetype") == 0, "PLUGIN_SOURCE", "Register the actual retained database assembly.")
        require(isinstance(desired.get("content"), str), "PLUGIN_BUILD_PENDING", "A real complete built assembly is required before deployment.")
    if kind == "customapi":
        require(desired.get("isfunction") is False, "CUSTOM_API_METHOD", "State transitions must be explicit native actions.")
        require(desired.get("allowedcustomprocessingsteptype") == 0, "CUSTOM_API_EXTENSION",
                "Use the supplied main plugin without unrelated configurable processing steps.")

def compile_solution(spec, snapshot):
    spec = validate_spec(spec)
    snapshot = validate_snapshot(snapshot)
    csdl = Csdl(binary(snapshot["csdl"]["response"]["body"], "actual CSDL"))
    requested = {x["key"]: x["path"] for x in preflight_queries(spec)}
    for key, path in requested.items():
        require(key in snapshot["resources"] and snapshot["resources"][key]["path"] == path,
                "PREFLIGHT_MISSING", "Complete the actual source preflight for this specification.", key=key)
    ordered = all_components(spec)
    bindings, operations, components, issues = {}, [], [], []
    for component in ordered:
        original = _target_component(snapshot, component, bindings)
        kind, key = component["kind"], component["key"]
        if kind == "reference":
            entity_set = component["entity_set"]
            type_name, native_key = csdl.entity_set(entity_set), csdl.key(entity_set)
            for field in component["match"]:
                _native_field(csdl, entity_set, field)
            if original is not None:
                native_id = guid(original.get(native_key))
                bindings[key] = {"id": native_id, "entity_set": entity_set, "kind": kind, "id_field": native_key}
            else:
                require(component["depends_on"], "NATIVE_REFERENCE_MISSING",
                        "An existing native reference is absent; the compiler cannot create it.", reference=key)
                native_id = None
            components.append({"key": key, "kind": kind, "entity_set": entity_set, "id_field": native_key,
                               "disposition": "REFERENCE" if original is not None else "RESOLVE_AFTER_DEPENDENCIES",
                               "native_id": native_id, "reserved_id": None, "match": component["match"], "definition": {},
                               "original": original, "original_sha256": identity(original) if original is not None else None,
                               "source_refs": _body_source(snapshot, "component:" + key)})
            operations.append({"key": "reference:" + key, "kind": "reference", "component": key,
                               "entity_set": entity_set, "match": component["match"],
                               "expected_original_sha256": identity(original) if original is not None else None,
                               "depends_on": component["depends_on"]})
            continue
        if kind in METADATA_KINDS:
            entity_set = "EntityDefinitions" if kind == "table" else "RelationshipDefinitions" if kind == "relationship" else "Attributes"
            type_name = component["definition"].get("@odata.type")
            require(isinstance(type_name, str), "METADATA_TYPE", "Supply the actual complete native metadata type.", component=key)
            native_key = "MetadataId"
            csdl.type(type_name)
        else:
            entity_set = ROW_KINDS[kind]
            type_name = csdl.entity_set(entity_set)
            native_key = csdl.key(entity_set)
            if kind in UNPUBLISHED_KINDS:
                csdl.operation("RetrieveUnpublishedMultiple", {}, bound_type="Collection(" + type_name + ")", function=True)
            for field in component["match"]:
                _native_field(csdl, entity_set, field)
        if original is not None:
            require(native_key in original, "NATIVE_COMPONENT_ID", "The target response omitted its original component ID.", component=key)
            native_id = guid(original[native_key])
            bindings[key] = {"id": native_id, "entity_set": entity_set, "kind": kind, "id_field": native_key}
        desired = resolve(component["definition"], bindings, spec["resources"], allow_pending=True)
        csdl.payload(type_name, desired, allow_references=True)
        _xml_resources(kind, desired)
        if kind in ("table", "attribute"):
            authored_name = desired.get("LogicalName") or str(desired.get("SchemaName", "")).lower()
            require(authored_name == component["match"]["LogicalName"], "METADATA_NAME",
                    "The authored native name differs from its retained selector.", component=key)
        if kind == "relationship":
            require(desired.get("SchemaName") == component["match"]["SchemaName"], "METADATA_NAME",
                    "The authored relationship differs from its retained selector.")
        pending_refs = sorted(_references(desired) - set(bindings))
        metadata = kind in METADATA_KINDS
        comparable = desired if original is None or not metadata else _metadata_payload(original, desired, component)
        if original is not None and not pending_refs and (
            source_subset(original, comparable) if metadata else _comparison(original, comparable, csdl, entity_set)
        ):
            disposition, body, method = "REUSE", None, None
        elif original is None:
            disposition, body, method = "CREATE", clone(desired), "POST"
            if not metadata:
                # Client-selected IDs are reserved identities, not observed native
                # records. Only a returned/read-back record becomes a binding.
                reserved = str(uuid.uuid5(COMPONENT_NAMESPACE, identity({"spec": identity(spec),
                    "target": snapshot["profile"]["organization_id"], "component": key})))
                if native_key in body:
                    guid(body[native_key])
                    reserved = body[native_key]
                body[native_key] = reserved
        else:
            policy = component["update_policy"]
            require(policy["mode"] == "merge-selected", "EXISTING_COMPONENT_DIFFERS",
                    "An existing definition differs; retain it and author an explicit source-bound update.", component=key)
            require(policy["expected_original_sha256"] == identity(original), "ORIGINAL_DEFINITION_CHANGED",
                    "The selected update is bound to a different original target definition.", component=key)
            disposition, method = "UPDATE", "PUT" if metadata else "PATCH"
            body = merge_definition(original, comparable) if metadata else clone(comparable)
            if metadata:
                body.pop("@odata.context", None)
                body.pop("@odata.etag", None)
        if disposition == "CREATE":
            path = ("EntityDefinitions" if kind == "table" else "RelationshipDefinitions" if kind == "relationship"
                    else "EntityDefinitions(LogicalName=" + literal(component["match"]["table"]) + ")/Attributes"
                    if kind == "attribute" else entity_set)
        elif original is not None:
            path = ("EntityDefinitions(" + native_id + ")" if kind == "table"
                    else "RelationshipDefinitions(" + native_id + ")" if kind == "relationship"
                    else "EntityDefinitions(LogicalName=" + literal(component["match"]["table"]) + ")/Attributes(" + native_id + ")"
                    if kind == "attribute" else entity_set + "(" + native_id + ")")
        else:
            raise DataverseError("COMPONENT_PLAN", "The component has no native route.")
        original_sha = identity(original) if original is not None else None
        headers = {"MSCRM.SolutionUniqueName": spec["solution"]["unique_name"]} if key not in ("publisher", "solution") else {}
        if method == "PUT":
            headers["MSCRM.MergeLabels"] = "true"
            issues.append({"code": "METADATA_CHECK_THEN_PUT", "component": key,
                           "meaning": "The original definition is re-read before its full PUT; metadata has no assumed atomic ETag protection."})
        if method == "PATCH":
            capability = resource_rows(snapshot["resources"]["capability:" + kind], snapshot["profile"], "capability:" + kind)
            require(len(capability) == 1 and capability[0].get("IsOptimisticConcurrencyEnabled") is True
                    and isinstance(original.get("@odata.etag"), str), "CONCURRENCY_UNAVAILABLE",
                    "Updating this original ordinary row requires its actual supported ETag.", component=key)
            headers["If-Match"] = original["@odata.etag"]
        description = {"key": key, "kind": kind, "entity_set": entity_set, "id_field": native_key,
                       "disposition": disposition, "native_id": bindings.get(key, {}).get("id"),
                       "reserved_id": body.get(native_key) if disposition == "CREATE" and not metadata else None,
                       "match": component["match"], "definition": component["definition"],
                       "original": original, "original_sha256": original_sha,
                       "source_refs": _body_source(snapshot, "component:" + key)}
        components.append(description)
        operations.append({"key": "component:" + key, "kind": "component", "component": key,
                           "disposition": disposition, "method": method, "path": path, "headers": headers,
                           "body": body, "expected_original_sha256": original_sha,
                           "verification_query": component_route(component, bindings), "selector": clone(component),
                           "deferred_lookup": component_route(component, bindings) is None,
                           "depends_on": component["depends_on"]})
    allowed_types = set()
    if "solution-component-types" in snapshot["resources"]:
        rows = resource_rows(snapshot["resources"]["solution-component-types"], snapshot["profile"], "solution-component-types")
        require(len(rows) == 1 and isinstance(rows[0].get("OptionSet"), dict), "COMPONENT_TYPES",
                "The original target solution component option set is absent.")
        allowed_types = {x["Value"] for x in rows[0]["OptionSet"].get("Options", []) if isinstance(x, dict) and "Value" in x}
    for component in ordered:
        if component["kind"] in ("publisher", "solution", "reference"):
            continue
        if "solution_component_type" not in component:
            operations.append({"key": "solution-member:" + component["key"], "kind": "solution_context_membership",
                               "component": component["key"],
                               "meaning": "Verify actual membership created in SolutionUniqueName context; do not invent a component type."})
            continue
        native_type = component["solution_component_type"]
        require(native_type in allowed_types, "SOLUTION_COMPONENT_TYPE", "The target does not expose the selected solution component type.")
        body = {"ComponentId": {"$component": component["key"], "select": "id"},
                "ComponentType": native_type, "SolutionUniqueName": spec["solution"]["unique_name"],
                "AddRequiredComponents": component.get("add_required_components", False)}
        csdl.operation("AddSolutionComponent", body, allow_references=True)
        operations.append({"key": "solution-member:" + component["key"], "kind": "action", "method": "POST",
                           "path": "AddSolutionComponent", "headers": {}, "body": body, "readback": "solution_membership"})
    for index, group in enumerate(spec["app_components"]):
        members = []
        for item in group["components"]:
            native_type = NS + "." + item["entity_type"]
            member = {"@odata.type": native_type, item["id_field"]: {"$component": item["component"], "select": "id"}}
            csdl.payload(native_type, member, allow_references=True)
            members.append(member)
        body = {"AppId": {"$component": group["app"], "select": "id"}, "Components": members}
        csdl.operation("AddAppComponents", body, allow_references=True)
        operations.append({"key": "app-members:" + str(index), "kind": "action", "method": "POST",
                           "path": "AddAppComponents", "headers": {}, "body": body, "readback": "app_membership",
                           "app": group["app"], "selected_components": group["components"]})
    constraint_observations = compile_constraint_observations(spec, snapshot, csdl, bindings)
    table_components = {item["key"]: item for item in spec["components"] if item["kind"] == "table"}
    constraint_checks = [{**clone(group), "logical_name": table_components[group["table"]]["match"]["LogicalName"]}
                         for group in spec.get("role_constraints", [])]
    planned_grants = [{"role_id": guid(group["role_id"]), "privileges": clone(group["privileges"])}
                      for group in spec["role_privileges"]]
    if constraint_checks:
        operations.append({"key": "role-constraints:before-role-writes", "kind": "role_constraints",
                           "constraints": clone(constraint_checks), "planned_grants": clone(planned_grants)})
    for index, group in enumerate(spec["role_privileges"]):
        rid = guid(group["role_id"])
        role = resource_rows(snapshot["resources"]["role:" + rid], snapshot["profile"], "role:" + rid)
        source = resource_rows(snapshot["resources"]["role-privileges:" + rid], snapshot["profile"], "role-privileges:" + rid)
        require(len(role) == 1 and len(source) == 1 and isinstance(source[0].get("RolePrivileges"), list),
                "ROLE_SOURCE", "Retain the actual role and complete native privileges.")
        require(identity(source[0]) == group["expected_original_sha256"], "ROLE_SOURCE_CHANGED",
                "The reviewed role grants refer to another original privilege set.")
        additions = []
        for item in group["privileges"]:
            pid = guid(item["PrivilegeId"])
            actual = resource_rows(snapshot["resources"]["privilege:" + pid], snapshot["profile"], "privilege:" + pid)
            require(len(actual) == 1 and guid(actual[0]["privilegeid"]) == pid, "PRIVILEGE_SOURCE",
                    "A desired privilege is absent in the actual target.")
            csdl.payload(NS + ".RolePrivilege", item)
            if not any(source_subset(existing, item) for existing in source[0]["RolePrivileges"]):
                additions.append(clone(item))
        body = {"Privileges": additions}
        csdl.operation("AddPrivilegesRole", body, bound_type=csdl.entity_set("roles"))
        operations.append({"key": "role-grants:" + str(index), "kind": "role_privileges", "method": "POST",
                           "path": "roles(" + rid + ")/" + NS + ".AddPrivilegesRole", "headers": {},
                           "body": body, "role_id": rid, "original": source[0],
                           "expected_original_sha256": group["expected_original_sha256"],
                           "disposition": "ADD" if additions else "REUSE", "review": group["review"]})
    if constraint_checks:
        operations.append({"key": "role-constraints:before-publication", "kind": "role_constraints",
                           "constraints": clone(constraint_checks), "planned_grants": clone(planned_grants)})
    apps = sorted({c["key"] for c in ordered if c["kind"] == "appmodule"})
    for key in apps:
        csdl.operation("ValidateApp", {"AppModuleId": {"$component": key, "select": "id"}},
                       function=True, allow_references=True)
        operations.append({"key": "validate-app:" + key, "kind": "validate_app", "app": key})
    csdl.operation("PublishXml", {"ParameterXml": "<importexportxml />"})
    operations.append({"key": "publish-selected", "kind": "publish",
                       "tables": [c["match"]["LogicalName"] for c in ordered if c["kind"] == "table"],
                       "webresources": [c["key"] for c in ordered if c["kind"] == "webresource"], "apps": apps})
    for index, group in enumerate(spec["app_components"]):
        operations.append({"key": "verify-published-app-members:" + str(index), "kind": "verify_app_members",
                           "app": group["app"], "selected_components": clone(group["components"])})
    for index, group in enumerate(spec["app_roles"]):
        csdl.navigation("appmodules", "appmoduleroles_association", "Collection(" + NS + ".role)")
        role_source = "app-roles:" + str(index)
        if group["app"] in bindings:
            require(role_source in snapshot["resources"], "APP_ROLE_SOURCE", "Retain the actual original app-role associations.")
            original_roles = resource_rows(snapshot["resources"][role_source], snapshot["profile"], role_source)
            require(group.get("expected_original_sha256") == identity(original_roles), "APP_ROLE_SOURCE",
                    "Bind app-role additions to the canonical SHA of the complete original role row array.")
        operations.append({"key": "app-roles:" + str(index), "kind": "app_roles", **clone(group)})
    payload = {"schema": PLAN_SCHEMA, "spec": spec, "spec_sha256": identity(spec), "snapshot_id": snapshot["id"],
               "snapshot_sha256": identity(snapshot), "target": target_profile(snapshot["profile"]),
               "components": components, "bindings": bindings, "operations": operations,
               "issues": issues, "source_refs": clone(spec["source_refs"]),
               "meaning": "Native desired-state composition; a compiled plan is not an executed deployment or effective-ACL assessment."}
    if constraint_checks:
        payload["role_constraint_observations"] = constraint_observations
    return {"id": "solution-plan-" + identity(payload), **payload}

def verify_plan(value, spec, snapshot):
    expected = compile_solution(spec, snapshot)
    require(value == expected, "PLAN_CHANGED", "The retained solution plan differs from its original specification and source.")
    return clone(value)

def compiler_contract():
    return {
        "schema": "tjlabs.pmrs.dataverse-compiler/v1",
        "spec_schema": SPEC_SCHEMA, "plan_schema": PLAN_SCHEMA,
        "functions": ["validate_spec(spec)", "preflight_queries(spec)", "compile_solution(spec,snapshot)", "verify_plan(plan,spec,snapshot)"],
        "component_kinds": sorted(KINDS - {"publisher", "solution"}),
        "native_references": "Optional key/entity_set/match/depends_on selectors; read-only, never created or added to a solution.",
        "guid_match": {"$guid": "actual-native-guid"},
        "reference_forms": [{"$component": "component-key", "select": "id"},
                            {"$bind": {"component": "component-key", "entity_set": "actual_entity_set"}},
                            {"$resource": "resource-key", "as": "base64"},
                            {"$resource": "resource-key", "as": "utf8"}],
        "update_policy": {"default": "create-or-match",
                          "merge-selected": "Bind expected_original_sha256 to identity(the complete original native definition)."},
        "publication": "Validate each original app; publish only selected tables, webresources and apps; preserve unselected role bindings.",
        "role_constraints": {"fields": ["table", "role_ids", "forbid", "review"],
                             "forbid": ["Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share"],
                             "meaning": "Check actual native table privilege IDs against full selected business-role grants before role writes and publication. Conflicts are retained; existing grants are not removed."},
        "source": "Every target lookup retains complete actual HTTP bodies and continuation URLs; no test target or tenant is inferred."
    }
