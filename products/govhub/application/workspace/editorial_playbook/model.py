"""Native editorial inventory, explicit publishing responsibilities and receiving."""
from copy import deepcopy
from urllib.parse import urlsplit, urlunsplit
import hashlib
import json
import re


def fail(code, message, status=422):
    from govhub import GovHubError
    raise GovHubError(code, message, status)


def text(value, label, required=True):
    if not isinstance(value, str) or "\x00" in value:
        fail("PLAYBOOK_INPUT", label + " must be plain text.")
    value = value.strip()
    if required and not value:
        fail("PLAYBOOK_INPUT", "Supply " + label + ".")
    return value


def identity(value, label="Identifier"):
    value = text(value, label)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]*", value):
        fail("PLAYBOOK_ID", label + " uses letters, numbers, periods, colons, hyphens or underscores.")
    return value


def collection(value, label):
    if not isinstance(value, list):
        fail("PLAYBOOK_INPUT", label + " must be a complete list.")
    return value


def ids(value, label):
    return list(dict.fromkeys(text(item, label) for item in collection(value, label)))


def indexed(values, key, label):
    result = {}
    for value in collection(values, label):
        if not isinstance(value, dict):
            fail("PLAYBOOK_INPUT", label + " entries must be objects.")
        item_id = text(value.get(key), label + " " + key)
        if item_id in result:
            fail("PLAYBOOK_DUPLICATE", label + " repeats " + item_id + ".")
        result[item_id] = value
    return result


def inventory(data):
    if not isinstance(data, dict) or data.get("schema") != "govhub.editorial-inventory.v1":
        fail("PLAYBOOK_INVENTORY", "Select the original Drupal editorial inventory produced by native/inventory.php.")
    source = data.get("source")
    if not isinstance(source, dict):
        fail("PLAYBOOK_INVENTORY", "The native inventory needs its original source identity.")
    for key in ("site_uuid", "drupal_version", "observed_at", "environment_ref"):
        text(source.get(key), "Native source " + key)
    base = urlsplit(text(source.get("base_url"), "Native site URL"))
    if base.scheme not in ("http", "https") or not base.netloc:
        fail("PLAYBOOK_INVENTORY", "Retain the original absolute site URL.")
    bundles = indexed(data.get("bundles"), "id", "Content types")
    indexed(data.get("roles"), "id", "Native roles")
    indexed(data.get("entities"), "uuid", "Selected native content")
    indexed(data.get("configuration"), "name", "Native configuration")
    for bundle in bundles.values():
        indexed(bundle.get("fields"), "name", "Fields for " + bundle["id"])
    for entity in data["entities"]:
        if entity.get("bundle") not in bundles:
            fail("PLAYBOOK_INVENTORY", "Selected content references an absent native content type.")
    for config in data["configuration"]:
        raw = config.get("data_json")
        if not isinstance(raw, str) or hashlib.sha256(raw.encode("utf-8")).hexdigest() != config.get("sha256"):
            fail("PLAYBOOK_INVENTORY", "The original configuration bytes changed for " + config["name"] + ".", 409)
        try:
            json.loads(raw)
        except ValueError as error:
            fail("PLAYBOOK_INVENTORY", "Native configuration is not complete JSON: " + str(error))
    return deepcopy(data)


def suggested_definition(native, label, owner, environment_id):
    types, tasks = [], []
    for bundle in native["bundles"]:
        relevant = []
        for role in native["roles"]:
            permissions = role.get("permissions", [])
            if role.get("admin") or any(p in permissions for p in (
                    "administer nodes", "bypass node access", "create " + bundle["id"] + " content",
                    "edit any " + bundle["id"] + " content", "edit own " + bundle["id"] + " content")):
                relevant.append(role["id"])
        fields = [{"name": f["name"], "instruction": f.get("description", "") or f.get("label", f["name"]),
                   "source_reference": "", "notes": ""}
                  for f in bundle["fields"] if f.get("form_component") is not None and not f.get("read_only")]
        types.append({"bundle": bundle["id"], "owner": owner, "editor_role_ids": relevant,
                      "fields": fields, "notes": ""})
    for entity in native["entities"]:
        tasks.append({"id": "content-" + str(entity["id"]), "name": "Read " + entity["label"],
                      "goal": "Find and read " + entity["label"], "audience": "",
                      "bundle": entity["bundle"], "entity_uuid": entity["uuid"],
                      "route": entity["route"], "owner": owner, "visitor_set_version_id": "",
                      "journey_id": "", "notes": ""})
    return {"label": label, "owner": owner, "environment_id": environment_id,
            "source_reference": native["source"]["base_url"], "source_commit": "",
            "cohort_plan_ids": [], "content_mapping_ids": [], "content_types": types,
            "tasks": tasks, "notes": "Review the proposed task wording and assign the actual publishing responsibilities."}


def definition(value, native):
    if not isinstance(value, dict):
        fail("PLAYBOOK_DEFINITION", "Supply the complete editable playbook.")
    bundles = indexed(native["bundles"], "id", "Content types")
    roles = indexed(native["roles"], "id", "Roles")
    entities = indexed(native["entities"], "uuid", "Selected content")
    result = {key: text(value.get(key, ""), key.replace("_", " "), key not in ("notes", "source_commit"))
              for key in ("label", "owner", "environment_id", "source_reference", "source_commit", "notes")}
    if result["source_commit"] and not re.fullmatch(r"[0-9a-f]{40}", result["source_commit"]):
        fail("PLAYBOOK_SOURCE", "Use the complete selected source commit when it is available.")
    if result["environment_id"] != native["source"]["environment_ref"]:
        fail("PLAYBOOK_TARGET", "Bind the playbook to this native inventory's original environment reference.", 409)
    for key in ("cohort_plan_ids", "content_mapping_ids"):
        ids = [identity(x, key) for x in collection(value.get(key, []), key)]
        if len(ids) != len(set(ids)):
            fail("PLAYBOOK_DUPLICATE", "Select each original " + key + " once.")
        result[key] = ids
    types = indexed(value.get("content_types"), "bundle", "Publishing responsibilities")
    if not types:
        fail("PLAYBOOK_DEFINITION", "Select the content types covered by this playbook.")
    result["content_types"] = []
    for bundle_id, item in types.items():
        if bundle_id not in bundles:
            fail("PLAYBOOK_BUNDLE", "The original inventory has no content type " + bundle_id + ".")
        available = indexed(bundles[bundle_id]["fields"], "name", "Native fields")
        chosen_roles = [identity(r, "Editor role") for r in collection(item.get("editor_role_ids"), "Editor roles")]
        if len(chosen_roles) != len(set(chosen_roles)) or any(r not in roles for r in chosen_roles):
            fail("PLAYBOOK_ROLE", "Select each original editor role once.")
        fields = []
        for name, field in indexed(item.get("fields"), "name", "Publishing fields").items():
            if name not in available:
                fail("PLAYBOOK_FIELD", "The original inventory has no " + bundle_id + "." + name + ".")
            fields.append({"name": name, "instruction": text(field.get("instruction"), "Field instruction"),
                           "source_reference": text(field.get("source_reference", ""), "Field source", False),
                           "notes": text(field.get("notes", ""), "Field notes", False)})
        result["content_types"].append({"bundle": bundle_id, "owner": text(item.get("owner"), "Publishing owner"),
                                       "editor_role_ids": chosen_roles, "fields": fields,
                                       "notes": text(item.get("notes", ""), "Content type notes", False)})
    result["tasks"] = []
    for task_id, item in indexed(value.get("tasks", []), "id", "Visitor tasks").items():
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}", task_id):
            fail("PLAYBOOK_TASK", "Use a visitor-compatible task identifier of at most 120 characters.")
        bundle_id = identity(item.get("bundle"), "Task content type")
        if bundle_id not in types:
            fail("PLAYBOOK_TASK", "Each task refers to a selected publishing content type.")
        entity_uuid = text(item.get("entity_uuid", ""), "Original content UUID", False)
        if entity_uuid and (entity_uuid not in entities or entities[entity_uuid]["bundle"] != bundle_id):
            fail("PLAYBOOK_TASK", "Choose an original selected content UUID for this content type.")
        route = text(item.get("route"), "Visitor route")
        address = urlsplit(route)
        if not route.startswith("/") and (address.scheme not in ("http", "https") or not address.netloc):
            fail("PLAYBOOK_TASK", "Use the original relative route or absolute HTTP site URL.")
        set_id, journey_id = (text(item.get(k, ""), k, False) for k in ("visitor_set_version_id", "journey_id"))
        if bool(set_id) != bool(journey_id):
            fail("PLAYBOOK_TASK", "Bind both the retained visitor set version and its journey identifier.")
        result["tasks"].append({"id": task_id, "bundle": bundle_id, "entity_uuid": entity_uuid, "route": route,
                                "name": text(item.get("name"), "Task name"), "goal": text(item.get("goal"), "Task goal"),
                                "audience": text(item.get("audience", ""), "Task audience", False),
                                "owner": text(item.get("owner"), "Task owner"), "visitor_set_version_id": set_id,
                                "journey_id": journey_id, "notes": text(item.get("notes", ""), "Task notes", False)})
    return result




def revise_definition(previous, before, native):
    """Prepare the next edition from native changes while carrying editorial work."""
    proposed = suggested_definition(native, previous["label"], previous["owner"], previous["environment_id"])
    result, changes = deepcopy(previous), []
    old_native = {b["id"]: b for b in before["bundles"]}
    new_native = {b["id"]: b for b in native["bundles"]}
    proposed_types = {b["bundle"]: b for b in proposed["content_types"]}
    old_types = {b["bundle"]: b for b in previous["content_types"]}
    roles = {role["id"] for role in native["roles"]}
    result["content_types"] = []
    for bundle_id, selected in old_types.items():
        if bundle_id not in new_native:
            changes.append("Content type " + bundle_id + " is absent from the new inventory; its earlier instructions remain in the previous edition.")
            continue
        updated = deepcopy(selected)
        fields = {field["name"] for field in new_native[bundle_id]["fields"]}
        old_fields = {field["name"] for field in old_native[bundle_id]["fields"]}
        removed_fields = [field["name"] for field in selected["fields"] if field["name"] not in fields]
        updated["fields"] = [field for field in updated["fields"] if field["name"] in fields]
        new_fields = [field for field in proposed_types[bundle_id]["fields"] if field["name"] not in old_fields]
        updated["fields"].extend(new_fields)
        if removed_fields:
            changes.append(bundle_id + ": earlier field instructions retained in history for " + ", ".join(removed_fields) + ".")
        if new_fields:
            changes.append(bundle_id + ": review proposed instructions for new fields " + ", ".join(field["name"] for field in new_fields) + ".")
        removed_roles = [role for role in updated["editor_role_ids"] if role not in roles]
        updated["editor_role_ids"] = [role for role in updated["editor_role_ids"] if role in roles]
        if removed_roles:
            changes.append(bundle_id + ": assign current editor roles in place of " + ", ".join(removed_roles) + ".")
        result["content_types"].append(updated)
    for bundle_id, selected in proposed_types.items():
        if bundle_id not in old_native:
            result["content_types"].append(selected)
            changes.append("Review the proposed publishing responsibilities for new content type " + bundle_id + ".")
    if not result["content_types"]:
        result["content_types"] = proposed["content_types"]
        changes.append("The earlier selected content types are absent. Review the proposed current native content types.")
    selected_bundles = {item["bundle"] for item in result["content_types"]}
    before_entities = {e["uuid"]: e for e in before["entities"]}
    after_entities = {e["uuid"]: e for e in native["entities"]}
    result["tasks"] = []
    from visitor_journeys.model import url
    for task in previous["tasks"]:
        if task["bundle"] not in selected_bundles:
            changes.append("Task " + task["id"] + " stays in the previous edition because its content type is absent.")
            continue
        updated = deepcopy(task)
        if task["entity_uuid"]:
            old, current = before_entities.get(task["entity_uuid"]), after_entities.get(task["entity_uuid"])
            if current is None or current["bundle"] != task["bundle"]:
                updated["entity_uuid"] = ""
                changes.append("Task " + task["id"] + ": choose its current content UUID or review it as an explicit route task.")
            elif old and url(task["route"], before["source"]["base_url"]) == url(old["route"], before["source"]["base_url"]):
                updated["route"] = current["route"]
                if task["route"] != updated["route"]:
                    changes.append("Task " + task["id"] + ": review the same content UUID's current canonical route.")
        result["tasks"].append(updated)
    task_ids = {task["id"] for task in result["tasks"]}
    for task in proposed["tasks"]:
        if task["bundle"] not in selected_bundles or task["entity_uuid"] in before_entities:
            continue
        if task["id"] in task_ids:
            task["id"] = "content-" + hashlib.sha256(task["entity_uuid"].encode("utf-8")).hexdigest()[:24]
        task_ids.add(task["id"])
        result["tasks"].append(task)
        changes.append("Review the proposed task for newly selected native content " + task["name"] + ".")
    return result, changes


def task_intent(task, native):
    """The task behavior that a retained visitor journey actually observes."""
    from visitor_journeys.model import url
    entity = next((e for e in native["entities"] if e["uuid"] == task["entity_uuid"]), None)
    return {**{key: task[key] for key in ("goal", "audience", "bundle", "entity_uuid")},
            "route": url(task["route"], native["source"]["base_url"]),
            "environment_ref": native["source"]["environment_ref"],
            "site_uuid": native["source"]["site_uuid"],
            "content_heading": entity["label"] if entity else ""}


def task_journey_issue(task, native, journey):
    """Keep a manual original binding usable when it describes this reader task."""
    from visitor_journeys.model import url
    if journey is None:
        return "Select an actual journey in the retained visitor set."
    if any(task[key] != journey.get(key, "") for key in ("goal", "audience")):
        return "Use the retained journey's reader goal and audience, or create visitor journeys for the revised task."
    intended = url(task["route"], native["source"]["base_url"])
    if intended not in {url(step["url"]) for step in journey["steps"]}:
        return "The retained journey must visit this task's original route. Create visitor journeys for the revised route."
    return ""


def receiving_task_binding(task, original, received, edition):
    """Join the task to the capture's actual target, including native retargeting."""
    from visitor_journeys.model import origin, url
    source_url = url(task["route"], original["source"]["base_url"])
    original_origin = origin(original["source"]["base_url"])
    received_origin = origin(received["source"]["base_url"])
    internal = origin(source_url) == original_origin
    def receiving_url(value):
        value = url(value, original["source"]["base_url"])
        if origin(value) == original_origin:
            parsed, target = urlsplit(value), urlsplit(received_origin)
            return url(urlunsplit((target.scheme, target.netloc, parsed.path, parsed.query, "")))
        return value
    expected = {receiving_url(source_url)}
    original_journey = next((j for j in edition["definition"]["value"]["journeys"]
                             if j["id"] == task["journey_id"]), None)
    bound = next((j for j in edition.get("bound", {}).get("journeys", [])
                  if j["id"] == task["journey_id"]), None)
    observed = sorted({url(step["url"]) for step in bound["steps"]}) if bound else []
    observed_origin = origin(edition["project"]["value"]["base_url"])
    issue = task_journey_issue(task, original, original_journey)
    if task["entity_uuid"]:
        before = next((e for e in original["entities"] if e["uuid"] == task["entity_uuid"]), None)
        after = next((e for e in received["entities"] if e["uuid"] == task["entity_uuid"]), None)
        if after is None or after["bundle"] != task["bundle"]:
            issue = "This receiving inventory does not contain the task's selected content UUID and content type. Revise the playbook if the task has changed."
        elif before and source_url == url(before["route"], original["source"]["base_url"]):
            # Both the original reader route and the same UUID's received canonical
            # route can be observed. The original structural change remains explicit.
            expected.add(url(after["route"], received["source"]["base_url"]))
    if not issue and internal and observed_origin != received_origin:
        issue = "The visitor capture targets another environment. Capture this set on the received inventory's site."
    if not issue and (bound is None or not expected.intersection(observed)):
        issue = "The visitor capture does not visit this task's received route."
    return {"matched": not bool(issue), "expected_urls": sorted(expected), "observed_urls": observed,
            "expected_origin": received_origin if internal else origin(source_url),
            "observed_origin": observed_origin, "message": issue}


def compare(definition_value, before, after):
    """Compare the exact selected structural fields, roles, workflows and native routes."""
    findings = []
    def changed(kind, item_id, field, left, right):
        if left != right:
            findings.append({"kind": kind, "id": item_id, "field": field, "before": left, "after": right})
    left_bundles = indexed(before["bundles"], "id", "Original content types")
    right_bundles = indexed(after["bundles"], "id", "Received content types")
    left_roles, right_roles = (indexed(v["roles"], "id", "Roles") for v in (before, after))
    for selected in definition_value["content_types"]:
        bundle_id = selected["bundle"]
        if bundle_id not in right_bundles:
            changed("content_type", bundle_id, "present", True, False)
            continue
        left_fields, right_fields = (indexed(v[bundle_id]["fields"], "name", "Fields") for v in (left_bundles, right_bundles))
        for chosen in selected["fields"]:
            name = chosen["name"]
            if name not in right_fields:
                changed("field", bundle_id + "." + name, "present", True, False)
                continue
            for key in ("type", "required", "cardinality", "translatable", "read_only", "form_component"):
                changed("field", bundle_id + "." + name, key, left_fields[name].get(key), right_fields[name].get(key))
        for role_id in selected["editor_role_ids"]:
            changed("role", role_id, "definition", left_roles.get(role_id), right_roles.get(role_id))
    left_entities, right_entities = (indexed(v["entities"], "uuid", "Selected content") for v in (before, after))
    for task in definition_value["tasks"]:
        if task["entity_uuid"]:
            a, b = left_entities[task["entity_uuid"]], right_entities.get(task["entity_uuid"])
            for key in ("bundle", "route", "published", "moderation_state"):
                changed("content", task["entity_uuid"], key, a.get(key), b.get(key) if b else None)
    changed("site", after["source"]["site_uuid"], "site_uuid",
            before["source"]["site_uuid"], after["source"]["site_uuid"])
    changed("workflows", "selected", "configuration", before.get("workflows", []), after.get("workflows", []))
    # A role used by several bundles should appear once in the receiving comparison.
    unique = {json.dumps(f, sort_keys=True, ensure_ascii=False): f for f in findings}
    return list(unique.values())
