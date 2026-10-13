"""Compose the complete staff extension into the original Dataverse solution.

Pure source compilation. No table, application, role, tenant or project is created
by this module. Native execution uses the existing Dataverse ALM compiler/journal.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
from pathlib import Path
import re
import uuid
from xml.etree import ElementTree as ET

from dataverse_contract import (
    DataverseError, require, exact_keys, guid, identifier, integer, text, HASH,
    clone, identity, json_bytes, sha256, binary, parse_json, validate_snapshot, resource_rows,
)
from dataverse_solution import validate_spec, all_components, component_route, preflight_queries
from staff_native import _parse, _canonical, _pointer, _int

PROFILE_SCHEMA = "tjlabs.pmrs.staff-installation/v1"
POLICY_SCHEMA = "tjlabs.pmrs.staff-policy/v1"
ASSEMBLY = "TJLabs.GrantStaff"
POLICY_RESOURCE = "tjl_pmrs_staff_policy.json"
WEB_PREFIX = "tjl_/pmrs/staff/"
PLUGIN_TYPES = ("StaffCommand", "StaffRead", "StaffGuard")
INTERNAL_TABLES = {"staff_operation_table": "tjl_pmrsstaffoperation",
                   "staff_history_table": "tjl_pmrsstaffhistory"}
SOURCE_FILES = ("StrictJson.cs", "StaffContract.cs", "StaffWorkflow.cs", "StaffApi.cs")
WEB_FILES = {"staff-json.js": 3, "staff-form.js": 3, "staff.js": 3, "staff.css": 2, "staff.html": 1}
DENIED = ("Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share")
ACTION_ROLES = {
    "initialize": ["TL_PL"], "evidence.record": ["TL_PL", "MEL", "CFU", "FINANCE", "COMMS", "SER", "LEGAL", "TECHNICAL"],
    "data-management.review": ["TL_PL", "MEL"], "validation.record": ["TL_PL"],
    "gate0.decide": ["D_DD"], "design.submit": ["TL_PL"],
    "qa.clearance": ["MEL", "CFU", "FINANCE", "COMMS", "SER", "LEGAL", "TECHNICAL"],
    "qa.decide": ["TL_PL", "D_DD"], "qa.withdraw": ["TL_PL", "D_DD"],
    "condition.resolve": ["TL_PL", "D_DD"], "correction.open": ["TL_PL", "D_DD", "MEL", "CFU", "FINANCE", "COMMS", "SER", "LEGAL", "TECHNICAL"],
    "correction.resolve": ["TL_PL", "D_DD"], "design.reopen": ["TL_PL", "D_DD"],
    "financial.review": ["FINANCE", "TL_PL"], "corporate.reference": ["D_DD"],
}
# The issued Annex C is a starting register. The accepted inception review must
# bind actual roles, evidence and any explicit source-supported rule change.
RULES = (
    ("P1.01", "Project idea", "required", ["TL_PL"], "Idea and alignment"),
    ("P1.01b", "Indicative budget", "optional", ["TL_PL", "FINANCE"], "Idea and alignment"),
    ("P1.02", "Strategic alignment", "required", ["TL_PL"], "Idea and alignment"),
    ("P1.03", "Validation meeting and minutes", "required", ["TL_PL"], "Idea and alignment"),
    ("P1.G0", "Director / deputy pursue, park or drop decision", "reference-only", ["D_DD"], "Native gates"),
    ("P1.S1", "Original reference, owner and date", "reference-only", ["TL_PL"], "Native gates"),
    ("P1.S2", "Soft pipeline status; no corporate registration", "reference-only", ["D_DD"], "Native gates"),
    ("P1.04", "Needs and stakeholder assessment", "required", ["TL_PL", "TECHNICAL"], "Design"),
    ("P1.04b", "Lessons from previous work", "required", ["TL_PL", "MEL"], "Design"),
    ("P1.05", "Theory of change", "required", ["TL_PL", "MEL"], "Design"),
    ("P1.06", "Concept note", "required", ["TL_PL"], "Design"),
    ("P1.06b", "HR ticket reference", "reference-only", ["TL_PL"], "External references"),
    ("P1.07a", "Results framework and indicators", "required", ["MEL", "TL_PL"], "Design"),
    ("P1.07b", "Data management plan when donor or policy requires it", "data-management", ["MEL", "TL_PL"], "Design"),
    ("P1.08", "Risk, safeguards, communications and engagement", "required", ["SER", "COMMS", "TL_PL"], "Design"),
    ("P1.09", "Detailed budget and workplan", "required", ["FINANCE", "TL_PL"], "Design"),
    ("P1.10", "Donor engagement and due diligence", "required", ["CFU", "LEGAL", "TL_PL"], "Design"),
    ("P1.S3", "Completeness checks before submission", "reference-only", ["TL_PL"], "Native gates"),
    ("P1.S4", "Frozen QA pack", "reference-only", ["TL_PL"], "Native gates"),
    ("P1.G1", "Chair decision after all required clearances", "reference-only", ["TL_PL", "D_DD"], "Native gates"),
    ("P1.S5", "Decision minutes and conditions", "reference-only", ["TL_PL", "D_DD"], "Native gates"),
    ("P1.11", "Resolve endorsement conditions", "reference-only", ["TL_PL", "D_DD"], "External references"),
    ("P1.12", "Observed Business Central / Navision reference", "reference-only", ["D_DD"], "External references"),
)
CLEARANCES = (("MEL", "MEL"), ("CFU", "Central finance / grant function"),
              ("FINANCE", "Finance"), ("COMMS", "Communications"),
              ("SER", "Safeguards / social and environmental review"),
              ("LEGAL", "Legal"), ("TECHNICAL", "Technical review"))
PROJECT_MESSAGES = ("Create", "Update", "Delete", "Upsert", "Merge",
                    "CreateMultiple", "UpdateMultiple", "UpsertMultiple", "DeleteMultiple")
INTERNAL_MESSAGES = PROJECT_MESSAGES + ("Retrieve", "RetrieveMultiple", "Assign", "SetState")
FORM_NAMESPACE = uuid.UUID("d22e1329-0775-4816-a781-e95c453e426d")

def source_refs(value):
    require(isinstance(value, list) and value, "STAFF_SOURCE_REFS", "Retain the complete selected source references.")
    for row in value:
        exact_keys(row, ["kind", "label", "verification", "uri", "sha256", "sourceId",
                         "entityKey", "editionId", "row", "note"], ["kind", "label", "verification"])
        require(row["kind"] in ("native-record", "received-source", "document", "manual-attestation"),
                "STAFF_SOURCE_KIND", "Use the actual source kind.")
        require(row["verification"] in ("received", "native-reference", "reviewer-attestation", "unverified-link"),
                "STAFF_SOURCE_VERIFICATION", "Keep received, referenced and reviewed evidence distinct.")
        text(row["label"], "source label", 1000)
        if row.get("sha256") is not None:
            require(HASH.fullmatch(row["sha256"]), "STAFF_SOURCE_SHA", "Retain the original SHA-256.")
        if row["kind"] == "received-source":
            require(all(isinstance(row.get(k), str) and row[k] for k in ("sha256", "sourceId", "entityKey")),
                    "STAFF_SOURCE_MEMBERSHIP", "A received reference binds original source, entity and bytes.")
        if "row" in row:
            text(row["row"], "original row reference", 200)
        if "uri" in row:
            from urllib.parse import urlsplit, parse_qsl
            u = urlsplit(row["uri"])
            require(u.scheme in ("https", "urn") and u.username is None and u.password is None,
                    "STAFF_SOURCE_URI", "Use a stable HTTPS or URN source reference without credentials.")
            for key, _ in parse_qsl(u.query, keep_blank_values=True):
                require(key.lower() not in ("sig", "signature", "token", "access_token", "client_secret", "code", "sv", "se", "sp")
                        and not key.lower().startswith(("x-amz-", "x-goog-")),
                        "STAFF_SOURCE_URI", "Do not retain signed transfer or authorization values.")
    return clone(value)

def installation_template(project, source_references):
    """Return a complete editable draft, never a deployable made-up role profile."""
    source_refs(source_references)
    return {"schema": PROFILE_SCHEMA, "version": "1.0.0",
        "original_project_component": None, "original_app_component": None,
        "project": clone(project), "roles": {k: [] for k in sorted({r for rs in ACTION_ROLES.values() for r in rs})},
        "action_roles": clone(ACTION_ROLES),
        "step_overrides": [], "clearance_roles": {k: [k] for k, _ in CLEARANCES},
        "source_refs": clone(source_references),
        "review": {"actor": "", "at": "", "reason": "", "source_refs": clone(source_references), "status": "draft"},
        "business_role_ids": [], "administrative_role_exclusions": [], "native_guard_messages": {"project": [], "operation": [], "history": []},
        "update_policies": {},
        "labels": {"workflow": "Project initiation, formulation and review",
                   "gate0": "Pursue / park / drop", "gate1": "Endorse / revise / drop",
                   "source_scope": "The reviewed issued register and accepted inception rules; no Business Central or HR write."}}

def validate_installation(profile):
    exact_keys(profile, ["schema", "version", "original_project_component", "original_app_component",
        "project", "roles", "action_roles", "step_overrides", "clearance_roles", "source_refs",
        "review", "business_role_ids", "administrative_role_exclusions", "native_guard_messages", "update_policies", "labels"],
        ["schema", "version", "original_project_component", "original_app_component", "project", "roles",
         "action_roles", "step_overrides", "clearance_roles", "source_refs", "review", "business_role_ids",
         "administrative_role_exclusions", "native_guard_messages", "update_policies", "labels"])
    require(profile["schema"] == PROFILE_SCHEMA, "STAFF_PROFILE_SCHEMA", "Use the reviewed staff installation profile.")
    text(profile["version"], "policy version", 100)
    identifier(profile["original_project_component"], "key")
    identifier(profile["original_app_component"], "key")
    p = profile["project"]
    exact_keys(p, ["logical_name", "primary_name", "source_field", "financial_field", "state_field", "phase_field", "portfolio_binding"],
               ["logical_name", "primary_name", "source_field", "financial_field", "state_field", "phase_field", "portfolio_binding"])
    for key in ("logical_name", "primary_name", "source_field", "state_field", "phase_field"):
        identifier(p[key])
    if p["financial_field"] is not None:
        identifier(p["financial_field"])
    names = [p[x] for x in ("primary_name", "source_field", "financial_field", "state_field", "phase_field") if p[x] is not None]
    require(len(names) == len(set(names)) and not set(names) & {"ownerid", p["logical_name"] + "id"},
            "STAFF_OUTPUT_FIELDS", "Staff fields cannot replace original source, finance, name, identity or owner columns.")
    require(p["state_field"].startswith("tjl_") and p["phase_field"].startswith("tjl_"),
            "STAFF_PUBLISHER", "This authored extension uses its selected tjl publisher fields.")
    pointers = p["portfolio_binding"]
    exact_keys(pointers, ["id_pointer", "revision_pointer", "snapshot_pointer"],
               ["id_pointer", "revision_pointer", "snapshot_pointer"])
    require(len(set(pointers.values())) == 3 and all(isinstance(x, str) and x.startswith("/")
            and not re.search(r"~(?:[^01]|$)", x) for x in pointers.values()),
            "STAFF_PORTFOLIO_POINTERS", "Bind distinct valid RFC 6901 pointers in the original source JSON.")
    review = profile["review"]
    exact_keys(review, ["actor", "at", "reason", "source_refs", "status"], ["actor", "at", "reason", "source_refs", "status"])
    require(review["status"] == "accepted-for-selected-environment", "STAFF_RULE_REVIEW",
            "Complete the actual inception rule and target-role review before composition.")
    text(review["actor"], "actual rule reviewer", 300); text(review["at"], "actual review time", 100)
    text(review["reason"], "rule review reason", 4000); source_refs(review["source_refs"]); source_refs(profile["source_refs"])
    require(isinstance(profile["roles"], dict) and profile["roles"], "STAFF_NATIVE_ROLES", "Select the actual native role identities.")
    for key, ids in profile["roles"].items():
        text(key, "staff role label", 100)
        require(isinstance(ids, list) and 0 < len(ids) <= 100 and len(set(ids)) == len(ids),
                "STAFF_NATIVE_ROLES", "Each role label needs explicit distinct native role/root-role IDs.")
        for value in ids: guid(value)
    require(set(profile["action_roles"]) == set(ACTION_ROLES), "STAFF_ACTION_ROLES", "Review the complete authored action set.")
    for roles in list(profile["action_roles"].values()) + list(profile["clearance_roles"].values()):
        require(isinstance(roles, list) and roles and set(roles) <= set(profile["roles"]),
                "STAFF_ACTION_ROLES", "Every selected action/clearance role needs its actual native mapping.")
    require(set(profile["clearance_roles"]) == {k for k, _ in CLEARANCES},
            "STAFF_CLEARANCE_SET", "Retain the complete accepted clearance set.")
    require(isinstance(profile["business_role_ids"], list), "STAFF_BUSINESS_ROLES", "Select the complete business role IDs.")
    for role in profile["business_role_ids"]: guid(role)
    exclusions = profile["administrative_role_exclusions"]
    require(isinstance(exclusions, list), "STAFF_ROLE_EXCLUSIONS", "Retain explicit reviewed administrative exclusions.")
    seen = set()
    for item in exclusions:
        exact_keys(item, ["role_id", "actor", "reason", "source_refs"], ["role_id", "actor", "reason", "source_refs"])
        rid = guid(item["role_id"])
        require(rid not in seen, "STAFF_ROLE_EXCLUSIONS", "An administrative role exclusion must be unique.")
        seen.add(rid)
        text(item["actor"], "administrative scope reviewer", 300)
        text(item["reason"], "administrative exclusion reason", 4000)
        source_refs(item["source_refs"])
    exact_keys(profile["native_guard_messages"], ["project", "operation", "history"], ["project", "operation", "history"])
    for kind, allowed, mandatory in (("project", PROJECT_MESSAGES, {"Create", "Update", "Delete"}),
            ("operation", INTERNAL_MESSAGES, {"Create", "Update", "Delete", "Retrieve", "RetrieveMultiple"}),
            ("history", INTERNAL_MESSAGES, {"Create", "Update", "Delete", "Retrieve", "RetrieveMultiple"})):
        names = profile["native_guard_messages"][kind]
        require(isinstance(names, list) and len(names) == len(set(names)) and mandatory <= set(names) <= set(allowed),
                "STAFF_GUARD_MESSAGES", "Select all actually supported protected native messages.", table=kind)
    require(isinstance(profile["update_policies"], dict), "STAFF_UPDATES", "Retain explicit source-bound native update policies.")
    for key, policy in profile["update_policies"].items():
        identifier(key, "key")
        exact_keys(policy, ["mode", "expected_original_sha256"], ["mode", "expected_original_sha256"])
        require(policy["mode"] == "merge-selected" and HASH.fullmatch(policy["expected_original_sha256"]),
                "STAFF_UPDATE_SOURCE", "Updating an existing definition requires its full retained original hash.")
    return clone(profile)

def make_policy(profile):
    profile = validate_installation(profile)
    definitions = {}
    for key, label, requirement, actors, section in RULES:
        definitions[key] = {"id": key, "label": label, "requirement": requirement,
                            "actors": actors, "section": section, "source_refs": clone(profile["source_refs"])}
    seen = set()
    for change in profile["step_overrides"]:
        exact_keys(change, ["id", "label", "requirement", "actors", "source_refs", "notes"],
                   ["id", "source_refs", "notes"])
        key = change["id"]
        require(key in definitions and key not in seen, "STAFF_RULE_OVERRIDE", "Review each issued step change once.")
        seen.add(key); source_refs(change["source_refs"]); text(change["notes"], "accepted rule change reason", 4000)
        for name in ("label", "requirement", "actors", "source_refs", "notes"):
            if name in change: definitions[key][name] = clone(change[name])
    for row in definitions.values():
        require(row["requirement"] in ("required", "optional", "data-management", "reference-only"),
                "STAFF_RULE_REQUIREMENT", "Keep actual required, optional, conditional and external-reference meanings.")
        require(row["actors"] and set(row["actors"]) <= set(profile["roles"]),
                "STAFF_RULE_ROLE", "Map every accepted step to actual role labels.")
    return {"schema": POLICY_SCHEMA, "version": profile["version"], "project": profile["project"],
        "roles": profile["roles"], "actions": profile["action_roles"], "steps": list(definitions.values()),
        "clearances": [{"id": key, "label": label, "roles": profile["clearance_roles"][key],
                        "source_refs": clone(profile["source_refs"])} for key, label in CLEARANCES],
        "source_refs": profile["source_refs"], "review": profile["review"], "labels": profile["labels"]}

def resource(raw):
    require(isinstance(raw, bytes), "STAFF_RESOURCE", "Retain the complete authored file bytes.")
    return {"bytes": len(raw), "sha256": sha256(raw), "data_base64": base64.b64encode(raw).decode("ascii")}

def label(value):
    return {"LocalizedLabels": [{"Label": value, "LanguageCode": 1033}]}

def _column(name, title, kind="string", maximum=4000, primary=False):
    common = {"SchemaName": name, "LogicalName": name.lower(), "DisplayName": label(title),
              "RequiredLevel": {"Value": "ApplicationRequired" if primary else "None"}, "IsAuditEnabled": {"Value": True}}
    if kind == "integer":
        return {**common, "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
                "MinValue": 0, "MaxValue": 2147483647}
    if kind == "memo":
        return {**common, "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata", "MaxLength": maximum}
    return {**common, "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "MaxLength": maximum, "IsPrimaryName": primary, "FormatName": {"Value": "Text"}}

def _table(name, title):
    return {"@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata", "SchemaName": name, "LogicalName": name,
        "DisplayName": label(title), "DisplayCollectionName": label(title + " records"),
        "Description": label("Internal native command custody. Business roles have no direct table privileges."),
        "OwnershipType": "OrganizationOwned", "IsActivity": False, "HasActivities": False, "HasNotes": False,
        "IsAuditEnabled": {"Value": True}, "IsOptimisticConcurrencyEnabled": True,
        "Attributes": [_column("tjl_name", "Original operation", maximum=100, primary=True)]}

def _xml_id(value):
    return "{" + str(uuid.uuid5(FORM_NAMESPACE, value)) + "}"

def form_xml(policy):
    """Author a new main form on the original table; do not replace old forms."""
    project = policy["project"]
    root = ET.Element("form")
    tabs = ET.SubElement(root, "tabs")
    tab = ET.SubElement(tabs, "tab", {"name": "PMRS_Staff", "id": _xml_id("tab"), "showlabel": "true", "expanded": "true"})
    labels = ET.SubElement(tab, "labels"); ET.SubElement(labels, "label", {"description": "Project review", "languagecode": "1033"})
    columns = ET.SubElement(tab, "columns"); column = ET.SubElement(columns, "column", {"width": "100%"})
    sections = ET.SubElement(column, "sections")
    section = ET.SubElement(sections, "section", {"name": "PMRS_Staff_Section", "id": _xml_id("section"),
        "showlabel": "false", "showbar": "false", "columns": "1", "labelwidth": "115", "layout": "varwidth"})
    rows = ET.SubElement(section, "rows")
    row = ET.SubElement(rows, "row"); cell = ET.SubElement(row, "cell", {"id": _xml_id("name-cell"), "showlabel": "true"})
    labels = ET.SubElement(cell, "labels"); ET.SubElement(labels, "label", {"description": "Project", "languagecode": "1033"})
    ET.SubElement(cell, "control", {"id": project["primary_name"], "datafieldname": project["primary_name"],
                                  "classid": "{4273EDBD-AC1D-40D3-9FB2-095C621B552D}", "disabled": "true"})
    row = ET.SubElement(rows, "row"); cell = ET.SubElement(row, "cell", {"id": _xml_id("panel-cell"), "showlabel": "false", "rowspan": "30"})
    control = ET.SubElement(cell, "control", {"id": "WebResource_PMRSStaff",
        "classid": "{9FDF5F91-88B1-47F4-AD53-C11EFC01A01D}"})
    parameters = ET.SubElement(control, "parameters")
    for key, value in (("WebResourceName", WEB_PREFIX + "staff.html"), ("PassParameters", "false"),
                       ("Security", "false"), ("Scrolling", "auto"), ("Border", "false")):
        ET.SubElement(parameters, key).text = value
    libraries = ET.SubElement(root, "formLibraries")
    ET.SubElement(libraries, "Library", {"name": WEB_PREFIX + "staff-form.js", "libraryUniqueId": _xml_id("library")})
    events = ET.SubElement(root, "events"); event = ET.SubElement(events, "event", {"name": "onload", "application": "false", "active": "true"})
    handlers = ET.SubElement(event, "Handlers")
    ET.SubElement(handlers, "Handler", {"functionName": "TJLabsPMRSStaff.openPanel", "libraryName": WEB_PREFIX + "staff-form.js",
        "handlerUniqueId": _xml_id("onload"), "enabled": "true", "parameters": "", "passExecutionContext": "true"})
    return ET.tostring(root, encoding="utf-8", xml_declaration=False)

def selected_project_metadata(base_spec, installation, target_snapshot):
    """Bind authored forms to the actual retained original table, never a guess."""
    profile = validate_installation(installation)
    original = validate_spec(base_spec)
    snapshot = validate_snapshot(target_snapshot)
    components = {c["key"]: c for c in original["components"]}
    key = profile["original_project_component"]
    require(key in components and components[key]["kind"] == "table",
            "STAFF_ORIGINAL_PROJECT", "Select the original project table component.")
    component = components[key]
    require(component["match"]["LogicalName"] == profile["project"]["logical_name"],
            "STAFF_ORIGINAL_PROJECT", "The authored original table differs from the selected installation.")
    resource_key = "component:" + key
    entry = snapshot["resources"].get(resource_key)
    require(entry is not None and entry["path"] == component_route(component),
            "STAFF_PROJECT_SOURCE", "Retain the complete original project table through its actual ALM selector.")
    rows = resource_rows(entry, snapshot["profile"], resource_key)
    require(len(rows) == 1, "STAFF_PROJECT_SOURCE", "The original project table must already exist uniquely.")
    table = rows[0]
    require(table.get("LogicalName") == profile["project"]["logical_name"],
            "STAFF_PROJECT_SOURCE", "The returned table differs from its selected logical name.")
    metadata_id = guid(table.get("MetadataId"))
    primary_id = identifier(table.get("PrimaryIdAttribute"))
    primary_name = identifier(table.get("PrimaryNameAttribute"))
    require(primary_name == profile["project"]["primary_name"],
            "STAFF_PRIMARY_NAME", "Use the original native primary-name column.")
    code = integer(table.get("ObjectTypeCode"), "actual native object type code", 1, 2147483647)
    require(table.get("IsOptimisticConcurrencyEnabled") is True,
            "STAFF_NATIVE_CONCURRENCY", "The actual original table must support native optimistic concurrency.")
    attributes = table.get("Attributes")
    require(isinstance(attributes, list) and attributes and table.get("Attributes@odata.nextLink") is None,
            "STAFF_ATTRIBUTE_SOURCE", "Retain the complete original expanded attribute list before composing forms.")
    names = {}
    for attribute in attributes:
        require(isinstance(attribute, dict), "STAFF_ATTRIBUTE_SOURCE", "Retain each original native attribute object.")
        name = attribute.get("LogicalName")
        if name is not None:
            identifier(name)
            require(name not in names, "STAFF_ATTRIBUTE_SOURCE", "An original attribute occurs more than once.", field=name)
            names[name] = attribute
    require(primary_id in names and primary_name in names and "modifiedon" in names,
            "STAFF_ATTRIBUTE_SOURCE", "Retain the actual primary identity/name and modification-time columns.")
    for field in [primary_name, profile["project"]["source_field"]] + (
            [profile["project"]["financial_field"]] if profile["project"]["financial_field"] is not None else []):
        require(field in names and names[field].get("AttributeType") in ("String", "Memo")
                and names[field].get("IsValidForRead") is True,
                "STAFF_SOURCE_COLUMN", "The selected original source/name/finance column must be a readable native text column.",
                field=field)
    reserved = {primary_id, primary_name, "ownerid", "createdby", "modifiedby", "createdon", "modifiedon"}
    require(not {profile["project"]["state_field"], profile["project"]["phase_field"]} & reserved,
            "STAFF_OUTPUT_FIELDS", "The protected outputs cannot replace an original identity or native system column.")
    return {"schema": "tjlabs.pmrs.staff-original-project/v1",
        "target_snapshot_id": snapshot["id"], "profile": snapshot["profile"], "component_key": key,
        "metadata_id": metadata_id, "logical_name": table["LogicalName"], "primary_id": primary_id,
        "primary_name": primary_name, "object_type_code": code,
        "table_sha256": identity(table),
        "sources": [{"request_id": x["request_id"], "path": x["request"]["path"],
            "sha256": x["response"]["body"]["sha256"], "bytes": x["response"]["body"]["bytes"]}
            for x in entry["exchanges"]]}

def view_xml(policy, native_project):
    p = policy["project"]
    require(native_project["logical_name"] == p["logical_name"]
            and native_project["primary_name"] == p["primary_name"],
            "STAFF_VIEW_SOURCE", "Compose the view against the same actual retained table.")
    primary_id = identifier(native_project["primary_id"])
    object_type_code = integer(native_project["object_type_code"], "actual native object type code", 1, 2147483647)
    fetch = ET.Element("fetch", {"version": "1.0", "mapping": "logical", "distinct": "false"})
    entity = ET.SubElement(fetch, "entity", {"name": p["logical_name"]})
    for field in (primary_id, p["primary_name"], p["phase_field"], "modifiedon"):
        ET.SubElement(entity, "attribute", {"name": field})
    ET.SubElement(entity, "order", {"attribute": p["primary_name"], "descending": "false"})
    grid = ET.Element("grid", {"name": "resultset", "object": str(object_type_code), "jump": p["primary_name"],
                               "select": "1", "icon": "1", "preview": "1"})
    row = ET.SubElement(grid, "row", {"name": "result", "id": primary_id})
    for field, width in ((p["primary_name"], "350"), (p["phase_field"], "180"), ("modifiedon", "160")):
        ET.SubElement(row, "cell", {"name": field, "width": width})
    return ET.tostring(fetch, encoding="utf-8"), ET.tostring(grid, encoding="utf-8")

def verify_build(build, dll, source_root):
    exact_keys(build, ["schema", "state", "assembly", "dll", "sources", "commands", "files", "packages", "tool", "meaning"],
               ["schema", "state", "assembly", "dll", "sources", "commands", "files", "packages", "tool", "meaning"])
    require(build["schema"] == "tjlabs.pmrs.staff-build/v1" and build["state"] == "COMPLETE",
            "STAFF_BUILD_REQUIRED", "Build and inspect the actual signed native assembly before solution composition.")
    require(build["dll"]["bytes"] == len(dll) and build["dll"]["sha256"] == sha256(dll)
            and 0 < len(dll) < 16 * 1024 * 1024, "STAFF_BUILD_BYTES", "The complete original DLL differs.")
    a = build["assembly"]
    require(a["name"] == ASSEMBLY and re.fullmatch(r"\d+\.\d+\.\d+\.\d+", a["version"])
            and re.fullmatch(r"[a-f0-9]{16}", a["public_key_token"])
            and a["strong_name_signed"] is True, "STAFF_BUILD_IDENTITY", "Retain the actual assembly identity and signed PE flag.")
    require(set(a["plugin_types"]) >= {ASSEMBLY + "." + x for x in PLUGIN_TYPES},
            "STAFF_PLUGIN_TYPES", "The built assembly omits an original native plugin type.")
    root = Path(source_root)
    expected = {"powerplatform/staff/plugin/" + name for name in SOURCE_FILES}
    found = {}
    for row in build["sources"]:
        path = row["path"]
        require(isinstance(path, str) and path in expected and path not in found, "STAFF_BUILD_SOURCE", "Use each original plugin source once.")
        p = root / path
        require(p.is_file() and not p.is_symlink(), "STAFF_BUILD_SOURCE", "The complete original source is absent.", path=path)
        raw = p.read_bytes()
        require(len(raw) == row["bytes"] and sha256(raw) == row["sha256"], "STAFF_BUILD_SOURCE", "The built source differs from this release.", path=path)
        found[path] = row
    require(set(found) == expected, "STAFF_BUILD_SOURCE", "The build must retain all four complete source files.")
    require(build["commands"] and all(x.get("returncode") == 0 for x in build["commands"]),
            "STAFF_BUILD_RESULT", "The selected native build/inspection did not complete.")
    return clone(a)

def reviewed_app_role_scope(spec, profile, snapshot):
    """Cover selected and retained existing app roles without removing a grant."""
    app = profile["original_app_component"]
    business = {guid(x) for x in profile["business_role_ids"]}
    business.update(guid(x) for ids in profile["roles"].values() for x in ids)
    exclusions = {guid(x["role_id"]): clone(x) for x in profile["administrative_role_exclusions"]}
    require(business and not business.intersection(exclusions), "STAFF_ROLE_SCOPE",
            "A business role cannot be excluded from the internal-table privilege check.")
    groups = [(i, x) for i, x in enumerate(spec["app_roles"]) if x["app"] == app]
    require(groups, "STAFF_APP_ROLE_SCOPE", "Explicitly select the original application's actual app-role association.")
    selected, existing, original_refs = set(), set(), []
    for index, group in groups:
        selected.update(guid(x) for x in group["role_ids"])
        key = "app-roles:" + str(index)
        entry = snapshot["resources"].get(key)
        require(entry is not None, "STAFF_APP_ROLE_SOURCE",
                "Retain the full actual existing app-role association before staff composition.", source=key)
        rows = resource_rows(entry, snapshot["profile"], key)
        require(group.get("expected_original_sha256") == identity(rows), "STAFF_APP_ROLE_SOURCE",
                "The reviewed app-role selection must bind the complete original association.")
        for row in rows:
            require(isinstance(row, dict) and isinstance(row.get("roleid"), str),
                    "STAFF_APP_ROLE_SOURCE", "An original app-role row lacks its actual native role ID.")
            existing.add(guid(row["roleid"]))
        original_refs.append({"key": key, "rows_sha256": identity(rows), "entry_sha256": identity(entry)})
    scope = selected | existing
    require(not scope - business - set(exclusions), "STAFF_APP_ROLE_SCOPE",
            "Every selected or existing app role needs business restrictions or a reviewed administrative exclusion.",
            unclassified_role_ids=sorted(scope - business - set(exclusions)))
    require(set(exclusions) <= scope, "STAFF_ROLE_EXCLUSIONS",
            "An administrative exclusion must identify an actual selected or retained app role.")
    return {"app": app, "business_role_ids": sorted(business), "selected_app_role_ids": sorted(selected),
            "existing_app_role_ids": sorted(existing), "administrative_exclusions": list(exclusions.values()),
            "original_associations": original_refs,
            "meaning": "Explicit app-role scope only. Existing grants are preserved; platform-administrator effective access is not denied."}

def compose_staff_solution(base_spec, installation, target_snapshot, build, dll, source_root, build_root):
    """Return one complete additive spec, with guard-before-field dependencies."""
    profile = validate_installation(installation); policy = make_policy(profile)
    spec = validate_spec(base_spec)
    require(spec["publisher"]["customization_prefix"] == "tjl", "STAFF_PUBLISHER",
            "Select the original tjl publisher for this authored extension; do not rename installed components.")
    base = {x["key"]: x for x in spec["components"]}
    project_key, app_key = profile["original_project_component"], profile["original_app_component"]
    require(project_key in base and base[project_key]["kind"] == "table"
            and base[project_key]["match"]["LogicalName"] == policy["project"]["logical_name"],
            "STAFF_ORIGINAL_PROJECT", "Join the exact original project table component.")
    require(app_key in base and base[app_key]["kind"] == "appmodule",
            "STAFF_ORIGINAL_APP", "Select the maintained original staff application component.")
    native_project = selected_project_metadata(base_spec, installation, target_snapshot)
    role_scope = reviewed_app_role_scope(spec, profile, target_snapshot)
    from staff_build import verify_build_directory
    retained_build = verify_build_directory(build_root)
    require(retained_build == build, "STAFF_BUILD_SOURCE", "Use the original complete checked build directory.")
    assembly = verify_build(build, dll, source_root)
    spec = clone(spec)
    root = Path(source_root)
    prefix = "staff_"
    require(not any(x.startswith(prefix) for x in base), "STAFF_COMPONENT_COLLISION",
            "Compose this complete extension once; for a later edition use the original unextended base and explicit update policies.")
    resources = spec["resources"]
    def put(key, raw):
        require(key not in resources, "STAFF_RESOURCE_COLLISION", "The original source already owns this resource key.", key=key)
        resources[key] = resource(raw); return {"$resource": key, "as": "utf8"}
    def add(key, kind, match, definition, depends=()):
        require(key not in base, "STAFF_COMPONENT_COLLISION", "The original component key is already used.", key=key)
        item = {"key": key, "kind": kind, "match": match, "definition": definition,
                "depends_on": sorted(set(depends)), "source_refs": clone(profile["source_refs"])}
        if key in profile["update_policies"]: item["update_policy"] = profile["update_policies"][key]
        spec["components"].append(item); base[key] = item; return key
    put("staff_policy_source", _canonical(_parse(json.dumps(policy, ensure_ascii=False))).encode("utf-8"))
    put("staff_build_source", json_bytes(build))
    put("staff_assembly_source", dll)
    build_folder = Path(build_root).resolve(strict=True)
    for index, item in enumerate(build["packages"]):
        path = build_folder / item["path"]
        raw = path.read_bytes()
        require(len(raw) == item["bytes"] and sha256(raw) == item["sha256"],
                "STAFF_BUILD_PACKAGE", "A retained original build package differs.")
        put("staff_build_package_" + str(index), raw)
    for index, item in enumerate(x for x in build["files"] if x["path"].endswith("packages.lock.json")
            or x["path"].endswith(".csproj") or x["path"].endswith("/Inspect.cs")):
        raw = (build_folder / item["path"]).read_bytes()
        require(len(raw) == item["bytes"] and sha256(raw) == item["sha256"],
                "STAFF_BUILD_INPUT", "A retained original build input differs.")
        put("staff_build_input_" + str(index), raw)
    for name in SOURCE_FILES:
        put("staff_source_" + name.split(".")[0], (root / "powerplatform/staff/plugin" / name).read_bytes())
    add("staff_policy_resource", "webresource", {"name": POLICY_RESOURCE},
        {"name": POLICY_RESOURCE, "displayname": "Reviewed project staff policy", "webresourcetype": 3,
         "content": {"$resource": "staff_policy_source", "as": "base64"}}, [project_key])
    add("staff_assembly", "pluginassembly", {"name": ASSEMBLY, "version": assembly["version"],
        "publickeytoken": assembly["public_key_token"], "culture": assembly.get("culture") or "neutral"},
        {"name": ASSEMBLY, "version": assembly["version"], "publickeytoken": assembly["public_key_token"],
         "culture": assembly.get("culture") or "neutral", "isolationmode": 2, "sourcetype": 0,
         "content": {"$resource": "staff_assembly_source", "as": "base64"}})
    for kind in PLUGIN_TYPES:
        add("staff_type_" + kind.lower(), "plugintype",
            {"typename": ASSEMBLY + "." + kind, "_pluginassemblyid_value": {"$component": "staff_assembly", "select": "id"}},
            {"typename": ASSEMBLY + "." + kind, "friendlyname": ASSEMBLY + "." + kind,
             "pluginassemblyid@odata.bind": {"$bind": {"component": "staff_assembly", "entity_set": "pluginassemblies"}}},
            ["staff_assembly"])
    references = spec.setdefault("native_references", [])
    def guards(logical, group, table_key):
        results = []
        for message in profile["native_guard_messages"][group]:
            suffix = group + "_" + message.lower()
            mk, fk = "staff_message_" + suffix, "staff_filter_" + suffix
            references.extend([
                {"key": mk, "entity_set": "sdkmessages", "match": {"name": message}, "depends_on": []},
                {"key": fk, "entity_set": "sdkmessagefilters",
                 "match": {"primaryobjecttypecode": logical, "iscustomprocessingstepallowed": True,
                           "_sdkmessageid_value": {"$component": mk, "select": "id"}},
                 "depends_on": [table_key, mk]},
            ])
            key = "staff_guard_" + suffix
            add(key, "sdkmessageprocessingstep", {"name": ASSEMBLY + " guard " + logical + " " + message},
                {"name": ASSEMBLY + " guard " + logical + " " + message,
                 "description": "Protect the original project staff fields and fixed internal command custody.",
                 "stage": 10, "mode": 0, "rank": 1, "supporteddeployment": 0,
                 "asyncautodelete": False, "statecode": 0, "statuscode": 1,
                 "eventhandler_plugintype@odata.bind": {"$bind": {"component": "staff_type_staffguard", "entity_set": "plugintypes"}},
                 "sdkmessageid@odata.bind": {"$bind": {"component": mk, "entity_set": "sdkmessages"}},
                 "sdkmessagefilterid@odata.bind": {"$bind": {"component": fk, "entity_set": "sdkmessagefilters"}}},
                [table_key, "staff_policy_resource", "staff_type_staffguard", mk, fk])
            results.append(key)
        return results
    project_guards = guards(policy["project"]["logical_name"], "project", project_key)
    # Existing project guards precede *every* protected field creation.
    for key, field, title, kind, maximum in (
        ("staff_project_state", policy["project"]["state_field"], "Project review state", "memo", 1000000),
        ("staff_project_phase", policy["project"]["phase_field"], "Project review phase", "string", 100)):
        add(key, "attribute", {"table": policy["project"]["logical_name"], "LogicalName": field},
            _column(field, title, kind, maximum), [project_key, *project_guards])
    internal_guards = []
    for table_key, table in INTERNAL_TABLES.items():
        group = "operation" if table_key == "staff_operation_table" else "history"
        add(table_key, "table", {"LogicalName": table}, _table(table, "Project staff " + group), project_guards)
        internal_guards.extend(guards(table, group, table_key))
        fields = [("tjl_entity", "Original table", "string", 128), ("tjl_recordid", "Original project", "string", 36),
                  ("tjl_actorid", "Initiating native user", "string", 36), ("tjl_action", "Original action", "string", 100),
                  ("tjl_requestsha", "Original request SHA-256", "string", 64), ("tjl_staffversion", "Original revision", "integer", 0)]
        fields += ([("tjl_request", "Original request", "memo", 1000000), ("tjl_response", "Original returned receipt", "memo", 1000000)]
                   if group == "operation" else [(n, n[4:].title(), "memo", 1000000)
                       for n in ("tjl_before", "tjl_after", "tjl_sources", "tjl_policy", "tjl_receipt")])
        for name, title, kind, maximum in fields:
            add("staff_" + group + "_" + name[4:], "attribute", {"table": table, "LogicalName": name},
                _column(name, title, kind, maximum), [table_key])
    native_ready = [*project_guards, *internal_guards,
        "staff_project_state", "staff_project_phase",
        *[k for k in base if k.startswith(("staff_operation_", "staff_history_"))]]
    for name, cls in (("tjl_PMRSStaffCommand", "StaffCommand"), ("tjl_PMRSStaffRead", "StaffRead")):
        key = "staff_api_" + cls.lower()
        add(key, "customapi", {"uniquename": name}, {"uniquename": name, "name": name,
            "displayname": "Project staff " + ("command" if cls == "StaffCommand" else "read"),
            "description": "Original project-scoped staff action with native identity and access checks.",
            "bindingtype": 0, "isfunction": False, "isprivate": False, "allowedcustomprocessingsteptype": 0,
            "PluginTypeId@odata.bind": {"$bind": {"component": "staff_type_" + cls.lower(), "entity_set": "plugintypes"}}},
            [*native_ready, "staff_type_" + cls.lower()])
        for kind, unique, entity_set in (("customapirequestparameter", "Request", "customapirequestparameters"),
                                          ("customapiresponseproperty", "Response", "customapiresponseproperties")):
            definition = {"uniquename": unique, "name": name + "." + unique, "displayname": unique,
                "description": "Complete exact JSON in one string; original numeric tokens remain intact.", "type": 10,
                "CustomAPIId@odata.bind": {"$bind": {"component": key, "entity_set": "customapis"}}}
            if kind == "customapirequestparameter": definition["isoptional"] = False
            add(key + "_" + unique.lower(), kind,
                {"uniquename": unique, "_customapiid_value": {"$component": key, "select": "id"}}, definition, [key])
    web_keys = []
    for name, kind in WEB_FILES.items():
        raw = (root / "powerplatform/staff/web" / name).read_bytes()
        rk = "staff_web_source_" + name.replace(".", "_").replace("-", "_")
        put(rk, raw); key = "staff_web_" + name.replace(".", "_").replace("-", "_")
        add(key, "webresource", {"name": WEB_PREFIX + name},
            {"name": WEB_PREFIX + name, "displayname": "Project staff / " + name, "webresourcetype": kind,
             "content": {"$resource": rk, "as": "base64"}}, [*native_ready])
        web_keys.append(key)
    form = form_xml(policy); fetch, layout = view_xml(policy, native_project)
    put("staff_form_xml", form); put("staff_fetch_xml", fetch); put("staff_layout_xml", layout)
    add("staff_project_form", "systemform", {"uniquename": "tjl_PMRSStaffReview", "objecttypecode": policy["project"]["logical_name"]},
        {"uniquename": "tjl_PMRSStaffReview", "objecttypecode": policy["project"]["logical_name"], "name": "Project review",
         "description": "Complete original project initiation, QA, correction and financial-edition review.",
         "type": 2, "formactivationstate": 1, "formpresentation": 1,
         "formxml": {"$resource": "staff_form_xml", "as": "utf8"}},
        [project_key, *web_keys, "staff_api_staffcommand_request", "staff_api_staffcommand_response",
         "staff_api_staffread_request", "staff_api_staffread_response"])
    add("staff_project_view", "savedquery", {"name": "Project staff review", "returnedtypecode": policy["project"]["logical_name"], "querytype": 0},
        {"name": "Project staff review", "returnedtypecode": policy["project"]["logical_name"], "querytype": 0,
         "fetchxml": {"$resource": "staff_fetch_xml", "as": "utf8"},
         "layoutxml": {"$resource": "staff_layout_xml", "as": "utf8"}}, [project_key, "staff_project_phase"])
    members = [{"component": project_key, "entity_type": "entity", "id_field": "metadataid"},
               {"component": "staff_project_form", "entity_type": "systemform", "id_field": "formid"},
               {"component": "staff_project_view", "entity_type": "savedquery", "id_field": "savedqueryid"}]
    group = next((x for x in spec["app_components"] if x["app"] == app_key), None)
    if group is None:
        spec["app_components"].append({"app": app_key, "components": members})
    else:
        keys = {x["component"] for x in group["components"]}
        group["components"].extend(x for x in members if x["component"] not in keys)
    business_roles = role_scope["business_role_ids"]
    require(business_roles, "STAFF_BUSINESS_ROLES", "Select the actual non-administrative business-role scope.")
    review = {k: clone(profile["review"][k]) for k in ("actor", "reason", "source_refs")}
    spec.setdefault("role_constraints", []).extend({"table": key, "role_ids": business_roles, "forbid": list(DENIED), "review": review}
                                                   for key in INTERNAL_TABLES)
    spec["source_refs"].extend(clone(profile["source_refs"]))
    # The existing compiler validates all names, actual CSDL fields, native ID
    # references, role constraints and dependency ordering before any write.
    result = validate_spec(spec)
    ordered = [x["key"] for x in all_components(result)]
    require(all(ordered.index(g) < ordered.index(f) for g in project_guards for f in ("staff_project_state", "staff_project_phase")),
            "STAFF_GUARD_ORDER", "Every selected project guard must precede protected column creation.")
    return {"schema": "tjlabs.pmrs.staff-composition/v1", "spec": result, "policy": policy,
        "source": {"base_spec_sha256": identity(base_spec), "installation_sha256": identity(profile),
                   "build_sha256": identity(build), "dll_sha256": sha256(dll),
                   "native_project": native_project, "app_role_scope": role_scope},
        "meaning": "Complete authored extension of the original project/application. No deployment or acceptance is inferred from composition."}
