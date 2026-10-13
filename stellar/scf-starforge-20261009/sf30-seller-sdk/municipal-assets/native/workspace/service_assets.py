"""Named source-bound service-request associations in the existing asset project."""
from __future__ import annotations
from collections import Counter
import copy
import hashlib
import json
import time
import uuid
from .adapters import InvalidData, canonical, mapped_rows

SCHEMA = "municipal-service-asset-review.v1"


def sha(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def selection(state):
    return {"request_input_id": state["inputs"].get("requests"),
            "inventory_input_id": state["inputs"].get("source_assets"),
            "work_order_input_id": state["inputs"].get("work_orders"),
            "work_order_mapping_sha256": sha(state["mappings"].get("work_orders")),
            "request_mapping_sha256": sha(state["mappings"].get("requests")),
            "inventory_mapping_sha256": sha(state["mappings"].get("source_assets"))}


def request_binding(workspace, state, row):
    raw = workspace.parsed(state["inputs"]["requests"])["rows"][row["_row"] - 1]
    return {**selection(state), "request_row": row["_row"], "request_id": row["id"],
            "request_row_sha256": sha(raw), "mapped_request_sha256": sha(row)}


def latest(state):
    rows = {}
    for item in state.get("service_links", []):
        rows[(item["binding"]["request_input_id"], item["binding"]["request_row"])] = item
    return rows


def projection(workspace, state, datasets):
    requests = datasets.get("requests", [])
    assets = datasets.get("source_assets", [])
    count = Counter(row["id"] for row in assets)
    index = {row["id"]: row for row in assets if row["id"] and count[row["id"]] == 1}
    orders = datasets.get("work_orders", [])
    order_counts = Counter(row["id"] for row in orders)
    order_index = {row["id"]: row for row in orders if row["id"] and order_counts[row["id"]] == 1}
    current = latest(state)
    result = []
    for row in requests:
        binding = request_binding(workspace, state, row)
        event = current.get((binding["request_input_id"], row["_row"]))
        status, reason = ("source", "The association comes from the original saved mapping.") if row["asset_id"] else ("unreviewed", "Choose an asset or record why this request remains unlinked.")
        if event:
            status, reason = event["decision"], event["note"]
            if event["binding"] != binding:
                status, reason = "stale", "The selected source, inventory or mapping differs from this saved review."
            elif event["decision"] == "linked":
                asset = index.get(event["asset_id"])
                if asset is None or sha(asset) != event["asset_row_sha256"] or event["asset_id"] in state["exclusions"]:
                    status, reason = "stale", "The selected asset changed, is ambiguous, absent or excluded."
                for order in event.get("work_orders", []):
                    found = order_index.get(order["id"])
                    if found is None or sha(found) != sha(order) or found["asset_id"] != event["asset_id"]:
                        status, reason = "stale", "A selected native work order changed or no longer belongs to this asset."
        result.append({"request": copy.deepcopy(row), "binding": binding, "binding_sha256": sha(binding),
                       "association": status, "explanation": reason, "review": event,
                       "asset": index.get(event["asset_id"]) if event and status == "linked" else None})
    return result


def apply(workspace, state, datasets, issues):
    # Called after ordinary mappings; this changes only the local association column.
    if not datasets.get("requests"):
        return
    orders_by_id = {row["id"]: row for row in datasets.get("work_orders", [])}
    for item in projection(workspace, state, datasets):
        row = datasets["requests"][item["request"]["_row"] - 1]
        event = item["review"]
        if item["association"] == "linked":
            row["asset_id"] = event["asset_id"]
        elif event and item["association"] in ("unlinked", "deferred"):
            row["asset_id"] = ""
        if item["association"] == "linked":
            chosen = {order["id"] for order in event.get("work_orders", [])}
            for order_id in chosen:
                orders_by_id[order_id]["request_id"] = row["id"]
        if item["association"] == "stale":
            # Keep an unrelated original CSV mapping intact; never reuse the stale override.
            issues.append({"kind": "requests", "row": row["_row"], "field": "asset_id",
                           "message": "Saved service-to-asset review is stale. Reopen its original source and review the current selection."})


def raw_datasets(workspace, state):
    data = {}
    for kind in ("requests", "source_assets", "work_orders"):
        mapping = state["mappings"].get(kind)
        if state["inputs"].get(kind) and mapping and mapping.get("confirmed"):
            rows, errors = mapped_rows(kind, workspace.parsed(state["inputs"][kind]), mapping["value"])
            if errors:
                raise InvalidData("Resolve the current " + kind + " mapping before reviewing an association")
            data[kind] = rows
        else:
            data[kind] = []
    return data


def view(workspace, project_id, query="", page=0, page_size=50, row_number=None):
    if type(page) is not int or page < 0 or type(page_size) is not int or not 1 <= page_size <= 200:
        raise InvalidData("Select a service-request page of 1–200 rows")
    project = workspace.project(project_id)
    state = project["state"]
    data = raw_datasets(workspace, state)
    rows = projection(workspace, state, data)
    counts = dict(Counter(row["association"] for row in rows))
    original = workspace.input(state["inputs"]["requests"], project_id) if state["inputs"].get("requests") else None
    if row_number is not None:
        if type(row_number) is not int or row_number < 1:
            raise InvalidData("Select an original service-request row")
        rows = [item for item in rows if item["request"]["_row"] == row_number]
        if not rows:
            raise InvalidData("The selected request is absent from this mapped source")
        row = rows[0]
        row["original_row"] = workspace.parsed(original["id"])["rows"][row_number - 1]
        row["review_history"] = [event for event in state.get("service_links", [])
                                 if event["binding"]["request_id"] == row["request"]["id"]]
        row["source_versions"] = None
        if original["format"] == "open311-collection":
            source = json.loads(original["body"])
            row["source_versions"] = next(item for item in source["observations"]
                                           if item["key"] == row["original_row"]["id"])
    if query:
        rows = [item for item in rows if query.casefold() in canonical(item).casefold()]
    return {"project_id": project_id, "revision": project["revision"], "page": page, "page_size": page_size,
            "total": len(rows), "rows": rows[page * page_size:(page + 1) * page_size],
            "counts": counts, "selection": selection(state),
            "source": {key: original[key] for key in ("id", "filename", "sha256", "row_count", "metadata")} if original else None,
            "mapped_inventory_rows": len(data["source_assets"]), "history_count": len(state.get("service_links", []))}


def review(workspace, project_id, expected_revision, actor, operation, request_row,
           binding_sha256, decision, note, asset_id=None, work_order_ids=None):
    if type(request_row) is not int or request_row < 1 or decision not in ("linked", "unlinked", "deferred"):
        raise InvalidData("Select the original request row and a declared association decision")
    if not isinstance(note, str) or not 1 <= len(note.strip()) <= 4000:
        raise InvalidData("Record a named review reason of 1–4,000 characters")
    if not isinstance(binding_sha256, str) or len(binding_sha256) != 64:
        raise InvalidData("Use the original displayed source-selection binding")
    work_order_ids = [] if work_order_ids is None else work_order_ids
    if not isinstance(work_order_ids, list) or len(work_order_ids) > 1000 or any(not isinstance(value, str) or not value for value in work_order_ids) or len(set(work_order_ids)) != len(work_order_ids):
        raise InvalidData("Select distinct original native work-order identities")
    if decision != "linked" and work_order_ids:
        raise InvalidData("Only a linked request can select native work orders")
    if decision == "linked":
        if not isinstance(asset_id, str) or not asset_id:
            raise InvalidData("Select the exact current asset identity")
    elif asset_id is not None:
        raise InvalidData("An unlinked or deferred review has no selected asset")

    def mutate(db, state, project):
        data = raw_datasets(workspace, state)
        projected = projection(workspace, state, data)
        selected = [item for item in projected if item["request"]["_row"] == request_row]
        if len(selected) != 1 or selected[0]["binding_sha256"] != binding_sha256:
            raise InvalidData("The original request/inventory selection changed; reopen the current source before reviewing")
        item = selected[0]
        if not item["request"]["id"].strip() or Counter(row["id"] for row in data["requests"])[item["request"]["id"]] != 1:
            raise InvalidData("Resolve the duplicate request identity before associating it")
        asset = None
        if decision == "linked":
            choices = [row for row in data["source_assets"] if row["id"] == asset_id]
            if len(choices) != 1 or asset_id in state["exclusions"]:
                raise InvalidData("Select exactly one current nonexcluded source asset")
            asset = choices[0]
        orders = []
        for order_id in work_order_ids:
            matches = [row for row in data["work_orders"] if row["id"] == order_id]
            if len(matches) != 1 or matches[0]["asset_id"] != asset_id:
                raise InvalidData("Select one unambiguous original work order already belonging to the selected asset")
            for other in projected:
                if other["request"]["_row"] != request_row and other["association"] == "linked" and any(
                    order["id"] == order_id for order in other["review"].get("work_orders", [])):
                    raise InvalidData("This work order already has an active named association to another request")
            orders.append(copy.deepcopy(matches[0]))
        event = {"schema": SCHEMA, "id": uuid.uuid4().hex, "binding": item["binding"],
                 "decision": decision, "asset_id": asset_id, "asset_row_sha256": sha(asset) if asset else None,
                 "asset_snapshot": copy.deepcopy(asset), "request_snapshot": item["request"],
                 "work_orders": orders,
                 "note": note.strip(), "actor": actor.strip(), "at": time.time()}
        state.setdefault("service_links", []).append(event)
        return {"review_id": event["id"], "request_id": item["request"]["id"], "decision": decision, "asset_id": asset_id}
    return workspace._change(project_id, expected_revision, actor, operation, "service_asset_review",
                             {"request_row": request_row, "binding_sha256": binding_sha256,
                              "decision": decision, "note": note, "asset_id": asset_id,
                              "work_order_ids": work_order_ids}, mutate)


def export(workspace, project):
    state = project["state"]
    output = {"service-assets/review-history.json": (json.dumps(
        {"schema": SCHEMA, "project_id": project["id"], "revision": project["revision"],
         "selection": selection(state), "reviews": state.get("service_links", [])},
        ensure_ascii=False, indent=2) + "\n").encode("utf-8")}
    # Include every original request edition referenced by a retained review,
    # as well as the selected edition. Whole database backup keeps all inputs.
    wanted = {event["binding"][field] for event in state.get("service_links", [])
              for field in ("request_input_id", "inventory_input_id", "work_order_input_id") if event["binding"].get(field)}
    if state["inputs"].get("requests"):
        wanted.add(state["inputs"]["requests"])
    manifest = []
    for input_id in sorted(wanted):
        source = workspace.input(input_id, project["id"])
        path = "service-assets/originals/" + input_id + "/" + source["filename"]
        output[path] = source["body"]
        manifest.append({key: source[key] for key in ("id", "kind", "filename", "format", "sha256", "row_count", "metadata")})
        manifest[-1]["path"] = path
    output["service-assets/source-editions.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return output
