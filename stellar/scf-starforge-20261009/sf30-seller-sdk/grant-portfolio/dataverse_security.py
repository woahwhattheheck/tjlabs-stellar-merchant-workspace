"""Native role constraints over original Dataverse table privilege metadata.

Only observed native privilege IDs are compared. The compiler and executor do
not invent table privilege names, remove existing role grants, impersonate a
business user, or infer effective access from an app-role association.
"""
from __future__ import annotations

from dataverse_contract import (
    NS, MAX_COMPONENTS, require, exact_keys, text, identifier, guid, clone,
    identity, resource_rows,
)

PRIVILEGE_TYPES = ("Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share")
PRIMARY_SOURCES = (
    "https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitymetadata?view=dataverse-latest",
    "https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/securityprivilegemetadata?view=dataverse-latest",
    "https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveroleprivilegesrole?view=dataverse-latest",
)

def validate_role_constraints(value, components):
    require(isinstance(value, list) and len(value) <= MAX_COMPONENTS,
            "ROLE_CONSTRAINTS", "Declare a bounded complete table/role constraint list.")
    tables = {item["key"]: item for item in components if item["kind"] == "table"}
    seen, role_bindings = set(), 0
    for group in value:
        exact_keys(group, ["table", "role_ids", "forbid", "review"],
                   ["table", "role_ids", "forbid", "review"])
        require(group["table"] in tables, "ROLE_CONSTRAINT_TABLE",
                "Select the original authored table component.")
        require(isinstance(group["role_ids"], list) and 0 < len(group["role_ids"]) <= MAX_COMPONENTS,
                "ROLE_CONSTRAINT_ROLES", "Select the actual reviewed business-role GUIDs.")
        role_bindings += len(group["role_ids"])
        require(role_bindings <= MAX_COMPONENTS * 8, "ROLE_CONSTRAINT_ROLES",
                "The complete selected table/role binding population exceeds the retained source bound.")
        role_ids = [guid(item) for item in group["role_ids"]]
        require(role_ids == group["role_ids"] and len(role_ids) == len(set(role_ids)),
                "ROLE_CONSTRAINT_ROLES", "Use distinct canonical original role GUIDs.")
        forbid = group["forbid"]
        require(isinstance(forbid, list) and forbid and all(isinstance(item, str) for item in forbid)
                and len(forbid) == len(set(forbid))
                and set(forbid) <= set(PRIVILEGE_TYPES), "ROLE_CONSTRAINT_TYPES",
                "Select explicit native privilege operation types.")
        review = group["review"]
        exact_keys(review, ["actor", "reason", "source_refs"], ["actor", "reason", "source_refs"])
        text(review["actor"], "reviewing security operator", 300)
        text(review["reason"], "reviewed internal-table access constraint", 4000)
        require(isinstance(review["source_refs"], list), "ROLE_CONSTRAINT_SOURCE",
                "Retain the original reviewed role/table scope references.")
        signature = identity(group)
        require(signature not in seen, "ROLE_CONSTRAINT_DUPLICATE",
                "The same complete native security constraint occurs twice.")
        seen.add(signature)
    return clone(value)

def table_privilege_path(logical_name):
    logical_name = identifier(logical_name)
    return "EntityDefinitions(LogicalName='" + logical_name + "')?$select=MetadataId,LogicalName,Privileges"

def constraint_queries(spec):
    tables = {item["key"]: item for item in spec["components"] if item["kind"] == "table"}
    result = []
    for group in spec.get("role_constraints", []):
        logical_name = tables[group["table"]]["match"]["LogicalName"]
        result.append({"key": "role-constraint-table:" + group["table"],
                       "path": table_privilege_path(logical_name)})
        for role_id in group["role_ids"]:
            result.extend([
                {"key": "role:" + role_id, "path": "roles(" + role_id + ")"},
                {"key": "role-privileges:" + role_id,
                 "path": "RetrieveRolePrivilegesRole(RoleId=" + role_id + ")"},
            ])
    return result

def observed_constraint(csdl, group, metadata, role_results, *, logical_name, metadata_id=None):
    """Check one complete metadata row and each full native role return.

    Empty/malformed metadata is unknown, not a successful denial. The returned
    set names only privileges actually exposed by this exact target table.
    """
    require(isinstance(metadata, dict) and metadata.get("LogicalName") == logical_name,
            "ROLE_CONSTRAINT_METADATA", "The original native table privilege metadata differs.")
    actual_id = guid(metadata.get("MetadataId"))
    require(metadata_id is None or actual_id == guid(metadata_id), "ROLE_CONSTRAINT_TABLE_ID",
            "The privilege population belongs to another native table.")
    properties = csdl.properties(csdl.entity_set("EntityDefinitions"))
    require(csdl.qualified(properties.get("Privileges", {}).get("Type", "")) == "Collection(" + NS + ".SecurityPrivilegeMetadata)",
            "ROLE_CONSTRAINT_METADATA_CONTRACT",
            "The actual target CSDL does not expose the original table privilege collection.")
    privileges = metadata.get("Privileges")
    require(isinstance(privileges, list) and privileges, "ROLE_CONSTRAINT_PRIVILEGES_UNKNOWN",
            "A complete nonempty original native table privilege population is required.")
    by_id, by_type = {}, {}
    for original in privileges:
        require(isinstance(original, dict) and {"PrivilegeId", "PrivilegeType"} <= set(original),
                "ROLE_CONSTRAINT_PRIVILEGES_UNKNOWN", "A native table privilege omits its ID or operation type.")
        csdl.payload(NS + ".SecurityPrivilegeMetadata", original)
        privilege_id, operation = guid(original["PrivilegeId"]), original["PrivilegeType"]
        require(operation in PRIVILEGE_TYPES, "ROLE_CONSTRAINT_PRIVILEGE_TYPE",
                "An original native privilege type requires an explicit supported interpretation.",
                actual_type=operation)
        require(privilege_id not in by_id, "ROLE_CONSTRAINT_PRIVILEGE_DUPLICATE",
                "The original table privilege ID occurs twice.")
        by_id[privilege_id] = clone(original)
        by_type.setdefault(operation, []).append(privilege_id)
    require("Read" not in group["forbid"] or "Read" in by_type,
            "ROLE_CONSTRAINT_READ_UNKNOWN", "The actual original table Read privilege is not established.")
    forbidden = {privilege_id for operation in group["forbid"] for privilege_id in by_type.get(operation, [])}
    require(isinstance(role_results, dict) and set(role_results) == set(group["role_ids"]),
            "ROLE_CONSTRAINT_ROLE_CLOSURE", "Retain every selected role's complete original privilege return.")
    checked = []
    for role_id in group["role_ids"]:
        body = role_results[role_id]
        require(isinstance(body, dict) and isinstance(body.get("RolePrivileges"), list),
                "ROLE_CONSTRAINT_ROLE_UNKNOWN", "The native role privilege result is incomplete.", role_id=role_id)
        grants = []
        for original in body["RolePrivileges"]:
            require(isinstance(original, dict) and {"PrivilegeId", "Depth"} <= set(original),
                    "ROLE_CONSTRAINT_ROLE_UNKNOWN", "A retained native role grant omits its privilege ID or depth.",
                    role_id=role_id)
            csdl.payload(NS + ".RolePrivilege", original)
            grants.append(guid(original["PrivilegeId"]))
        conflict = sorted(forbidden.intersection(grants))
        require(not conflict, "ROLE_CONSTRAINT_VIOLATION",
                "A selected business role has a forbidden direct native privilege on an internal table. Retain the reviewed conflict; no grant is removed.",
                table=group["table"], logical_name=logical_name, role_id=role_id, privilege_ids=conflict)
        checked.append({"role_id": role_id, "original_sha256": identity(body),
                        "observed_grants": len(grants), "forbidden_direct_grants": []})
    return {"table": group["table"], "logical_name": logical_name, "metadata_id": actual_id,
            "metadata_sha256": identity(metadata), "forbid": clone(group["forbid"]),
            "native_privileges": [{"id": ident, "type": by_id[ident]["PrivilegeType"]}
                                  for ident in sorted(forbidden)],
            "unexposed_forbidden_types": sorted(set(group["forbid"]) - set(by_type)),
            "role_results": checked, "review": clone(group["review"]),
            "meaning": "No selected direct role privilege intersects this observed native table population. Other roles, teams, administrators and effective access remain separate."}

def compile_constraint_observations(spec, snapshot, csdl, bindings):
    """Retain actual preflight findings; new table privileges remain deferred."""
    tables = {item["key"]: item for item in spec["components"] if item["kind"] == "table"}
    result = []
    for index, group in enumerate(spec.get("role_constraints", [])):
        key = "role-constraint-table:" + group["table"]
        require(key in snapshot["resources"], "ROLE_CONSTRAINT_PREFLIGHT",
                "The original target table privilege query is absent.")
        entry = snapshot["resources"][key]
        logical_name = tables[group["table"]]["match"]["LogicalName"]
        require(entry["path"] == table_privilege_path(logical_name), "ROLE_CONSTRAINT_SOURCE",
                "The original target table privilege route differs from the authored table.")
        rows = resource_rows(entry, snapshot["profile"], key)
        require(len(rows) <= 1, "ROLE_CONSTRAINT_TABLE_AMBIGUOUS",
                "The exact original table privilege selector returned multiple rows.")
        roles = {}
        for role_id in group["role_ids"]:
            role_key = "role:" + role_id
            require(role_key in snapshot["resources"], "ROLE_CONSTRAINT_PREFLIGHT",
                    "A selected role's original record is absent.", role_id=role_id)
            role_rows = resource_rows(snapshot["resources"][role_key], snapshot["profile"], role_key)
            require(len(role_rows) == 1 and guid(role_rows[0].get("roleid")) == role_id,
                    "ROLE_CONSTRAINT_ROLE", "The original selected business role is absent.", role_id=role_id)
            privilege_key = "role-privileges:" + role_id
            require(privilege_key in snapshot["resources"], "ROLE_CONSTRAINT_PREFLIGHT",
                    "The selected role's original full privilege return is absent.", role_id=role_id)
            privilege_rows = resource_rows(snapshot["resources"][privilege_key], snapshot["profile"], privilege_key)
            require(len(privilege_rows) == 1 and isinstance(privilege_rows[0].get("RolePrivileges"), list),
                    "ROLE_CONSTRAINT_ROLE_UNKNOWN", "Retain the complete original role privilege return.")
            roles[role_id] = privilege_rows[0]
        if not rows:
            require(group["table"] not in bindings, "ROLE_CONSTRAINT_TABLE_MISSING",
                    "An existing selected table has no original privilege metadata.")
            result.append({"index": index, "table": group["table"], "state": "NATIVE_TABLE_PRIVILEGES_PENDING",
                           "role_ids": clone(group["role_ids"]),
                           "meaning": "The source table is absent. Its real native privilege IDs must be read after creation and checked before role writes/publication."})
            continue
        checked = observed_constraint(csdl, group, rows[0], roles, logical_name=logical_name,
                                      metadata_id=bindings.get(group["table"], {}).get("id"))
        result.append({"index": index, "state": "OBSERVED", **checked})
    return result
