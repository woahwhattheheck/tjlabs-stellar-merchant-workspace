"""Visitor workflow in GovHub's original objects, requests, worker and source store."""
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import copy
import json

from . import model
from . import transport


def current(workspace, db, kind, entity_id):
    key = "visitor." + kind + ":" + model.identifier(entity_id)
    pointer = workspace._setting(db, key)
    if not pointer:
        model.fail("VISITOR_NOT_FOUND", "The selected " + kind + " does not exist.", 404)
    return workspace._get(db, "visitor_" + kind, pointer["version_id"])


def save_version(workspace, kind, payload, actor):
    entity_id = model.identifier(payload.get("entity_id"))
    with workspace.connect(write=True) as db:
        request, fingerprint, prior = workspace._request(db, payload, actor)
        if prior:
            return prior
        key = "visitor." + kind + ":" + entity_id
        pointer = workspace._setting(db, key)
        revision = pointer["revision"] if pointer else 0
        if isinstance(payload.get("expected_revision"), bool) or payload.get("expected_revision") != revision:
            model.fail("VISITOR_REVISION", "The saved definition changed. Open its current revision before saving.", 409)
        if kind == "project":
            value = model.profile(payload.get("value"))
            parent = entity_id
            extra = {}
        else:
            project_id = model.identifier(payload.get("project_id"))
            project = current(workspace, db, "project", project_id)
            previous = workspace._get(db, "visitor_set", pointer["version_id"]) if pointer else None
            if previous and previous["project_id"] != project_id:
                model.fail("VISITOR_PROJECT", "A saved set keeps its original project. Create a new set to change ownership.", 409)
            value = model.cohort(payload.get("value"), project["value"])
            parent = entity_id
            extra = {"project_id": project_id, "project_version_id": project["id"]}
        version = workspace._object(db, "visitor_" + kind, {
            "entity_id": entity_id, "revision": revision + 1, "value": value, **extra,
            "change_note": model.string(payload.get("change_note", "Definition saved"), "Change note", 8000)},
            parent=parent, actor=actor["name"])
        workspace._set(db, key, {"version_id": version["id"], "revision": revision + 1})
        result = {kind: version}
        workspace._remember(db, request, fingerprint, result, actor)
        workspace._changed(db, actor, "Visitor " + kind + " saved", "visitor_" + kind, version["id"],
                           {"entity_id": entity_id, "revision": revision + 1})
        return result


def summaries(workspace, db):
    projects, sets = [], []
    for row in db.execute("SELECT key,value FROM govhub_settings WHERE key LIKE 'visitor.project:%' OR key LIKE 'visitor.set:%' ORDER BY key"):
        kind = "project" if row["key"].startswith("visitor.project:") else "set"
        version = workspace._get(db, "visitor_" + kind, json.loads(row["value"])["version_id"])
        summary = {key: version[key] for key in ("id", "entity_id", "revision", "created_at", "author")}
        summary["label"] = version["value"]["label"]
        if kind == "project":
            summary["base_url"] = version["value"]["base_url"]
            projects.append(summary)
        else:
            summary["project_id"] = version["project_id"]
            summary["journey_count"] = len(version["value"]["journeys"])
            sets.append(summary)
    editions = [{key: value[key] for key in ("id", "label", "set_id", "set_revision", "operation_id", "created_at",
                                            "author", "role", "summary", "project_id", "result_sha256")}
                for value in workspace._objects(db, "visitor_edition")]
    operations = [workspace._operation_summary(json.loads(row[0])) for row in
                  db.execute("SELECT data FROM govhub_operations ORDER BY rowid DESC")
                  if json.loads(row[0]).get("type") == "VISITOR_CAPTURE"]
    findings = []
    for row in db.execute("SELECT value FROM govhub_settings WHERE key LIKE 'visitor.finding:%' ORDER BY key"):
        findings.append(workspace._get(db, "visitor_finding", json.loads(row[0])["version_id"]))
    return {"projects": projects, "sets": sets, "editions": list(reversed(editions)),
            "operations": operations, "findings": findings}


def bind_definition(definition, original_project, target_project, overrides):
    original = original_project["value"]
    target = target_project["value"]
    before_origin = model.origin(original["base_url"])
    after_origin = model.origin(target["base_url"])
    if overrides is None:
        overrides = {}
    if not isinstance(overrides, dict) or len(overrides) > model.MAX_PAGES:
        model.fail("VISITOR_BINDING", "URL overrides map explicit original step URLs to target URLs.")
    normalized = {model.url(k): model.url(v) for k, v in overrides.items()}
    original_urls = {step["url"] for j in definition["value"]["journeys"] for step in j["steps"]}
    if not set(normalized).issubset(original_urls):
        model.fail("VISITOR_BINDING", "Every URL override must name an original selected step.")
    def mapped(value):
        if value in normalized:
            return normalized[value]
        if model.origin(value) == before_origin:
            return after_origin + value[len(before_origin):]
        return value
    bound = copy.deepcopy(definition["value"])
    for journey in bound["journeys"]:
        for step in journey["steps"]:
            step["url"] = mapped(step["url"])
            if model.origin(step["url"]) not in target["allowed_origins"]:
                model.fail("VISITOR_BINDING", "A bound step is outside the selected target profile.")
            for key in ("links", "result_links"):
                for link in step["expect"].get(key, []):
                    if "url" in link:
                        link["url"] = mapped(link["url"])
                    if link.get("origin") == before_origin:
                        link["origin"] = after_origin
            if step["expect"].get("form", {}).get("action"):
                step["expect"]["form"]["action"] = mapped(step["expect"]["form"]["action"])
    return bound, normalized


def create_capture(workspace, payload, actor):
    from govhub import ident, now
    with workspace.connect(write=True) as db:
        key, fingerprint, prior = workspace._request(db, payload, actor)
        if prior:
            return prior
        definition = current(workspace, db, "set", payload.get("set_id"))
        if type(payload.get("expected_revision")) is not int or payload.get("expected_revision") != definition["revision"]:
            model.fail("VISITOR_REVISION", "Choose the current saved journey set revision.", 409)
        original_project = workspace._get(db, "visitor_project", definition["project_version_id"])
        project = current(workspace, db, "project", payload.get("project_id", definition["project_id"]))
        bound, overrides = bind_definition(definition, original_project, project, payload.get("url_overrides"))
        urls = sorted({step["url"] for journey in bound["journeys"] for step in journey["steps"]})
        role = payload.get("role", "BASELINE")
        if role not in {"BASELINE", "CANDIDATE", "CORRECTION"}:
            model.fail("VISITOR_CAPTURE_ROLE", "Choose BASELINE, CANDIDATE or CORRECTION.")
        supplied = payload.get("source_files")
        retained = {}
        if supplied is not None:
            if not isinstance(supplied, list):
                model.fail("VISITOR_SUPPLIED", "Supply a complete list of original URL-to-file bindings.")
            for item in supplied:
                if not isinstance(item, dict):
                    model.fail("VISITOR_SUPPLIED", "Each source binding must be an object.")
                address = model.url(item.get("url"))
                if address in retained or address not in urls:
                    model.fail("VISITOR_SUPPLIED", "Each binding names one unique selected source URL.")
                file = workspace._file_row(db, item.get("file_id"))
                workspace._verify_file(file)
                if file["bytes"] > project["value"]["max_page_bytes"]:
                    model.fail("VISITOR_PAGE_LIMIT", "A selected original file exceeds this capture's page limit.", 413)
                from govhub import instant
                retained[address] = {**{k: item[k] for k in ("status", "redirects", "final_url", "content_type", "elapsed_ms") if k in item},
                                     "url": address, "file_id": file["id"], "sha256": file["sha256"],
                                     "observed_at": instant(item.get("observed_at"), True),
                                     "acquisition": model.string(item.get("acquisition"), "Original acquisition", 2000)}
            if set(retained) != set(urls):
                model.fail("VISITOR_SUPPLIED", "The original source package must include every selected page or query.")
        stamp = now()
        value = {"id": ident("operation-"), "type": "VISITOR_CAPTURE", "state": "QUEUED",
                 "native_action": "visitor-source-capture", "plan_id": "", "plan_revision": "",
                 "environment_id": "visitor:" + project["entity_id"], "provider_environment_id": project["value"]["base_url"],
                 "environment": {"id": "visitor:" + project["entity_id"], "revision": project["id"],
                                 "data": {"name": project["value"]["label"], "source_kind": "visitor-http"}},
                 "profile": {"revision": project["sha256"], "config": {"environment_id": project["value"]["base_url"],
                             "source_kind": "visitor-http", **project["value"]}},
                 "source_snapshot_id": definition["id"], "source_snapshot_sha256": definition["sha256"],
                 "source_snapshot": None, "agency_ids": [], "created_at": stamp, "updated_at": stamp,
                 "author": actor["name"], "progress": {"completed": 0, "total": len(urls), "stage": "QUEUED",
                                                     "detail": "Original visitor pages queued"},
                 "error": None, "cancel_requested": False, "native_attempted": False,
                 "checkpoint": None, "resume_checkpoint": None, "native_capture_file_id": None,
                 "native_result": None, "actual_started_at": None, "actual_finished_at": None,
                 "visitor": {"label": model.string(payload.get("label"), "Capture name", 300),
                             "role": role, "definition": definition, "original_project": original_project,
                             "project": project, "bound": bound, "url_overrides": overrides,
                             "urls": urls, "supplied": retained, "source_mode": "SUPPLIED_ORIGINAL" if supplied is not None else "HTTP"}}
        operation = workspace._write_operation(db, value, actor, "Visitor capture queued",
                                               {"set_id": definition["entity_id"], "set_revision": definition["revision"], "pages": len(urls)})
        result = {"operation": operation}
        workspace._remember(db, key, fingerprint, result, actor)
    workspace._worker_wake.set()
    return result


def run_operation(workspace, value):
    from govhub import now, packed
    operation_id = value["id"]
    directory = workspace.root / "native-operations" / operation_id
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.is_symlink() or not directory.resolve().is_relative_to(workspace.root):
        model.fail("VISITOR_DIRECTORY", "The original operation output directory changed.", 409)
    spec = value["visitor"]
    completed = {}
    checkpoint = value.get("checkpoint") or {}
    for page in checkpoint.get("pages", []):
        if page.get("error"):
            continue
        with workspace.connect(snapshot=True) as db:
            item = workspace._file_row(db, page["file_id"])
        workspace._verify_file(item)
        completed[page["url"]] = page
    with workspace.connect(write=True) as db:
        live = workspace._operation(db, operation_id)
        live["actual_started_at"] = live.get("actual_started_at") or now()
        live["native_attempted"] = False
        workspace._write_operation(db, live, live["author"], "Visitor source capture started")
    pages = dict(completed)
    cancelled = False
    for address in spec["urls"]:
        if workspace._cancelled(operation_id):
            cancelled = True
            break
        if address in completed:
            continue
        try:
            if spec["source_mode"] == "SUPPLIED_ORIGINAL":
                binding = spec["supplied"][address]
                with workspace.connect(snapshot=True) as db:
                    file = workspace._file_row(db, binding["file_id"])
                original_path = workspace._verify_file(file)
                page = transport.supplied(spec["project"]["value"], address, binding, original_path.read_bytes(), original_path)
            else:
                page = transport.acquire(spec["project"]["value"], address, directory)
            path = page.pop("body_path")
            with workspace.connect(write=True) as db:
                file = workspace._register(db, path, Path(path).name if spec["source_mode"] == "HTTP" else model.digest(address)[:24] + ".html",
                    value["author"], "Extract", "Original visitor page " + address, owner_kind="operation",
                    owner_id=operation_id, output_name=model.digest(address)[:24] + (".json" if "json" in page["content_type"] else ".html"),
                    expected_sha=page["sha256"])
                page["file_id"] = file["id"]
                page["error"] = None
        except Exception as error:
            page = {"url": address, "observed_at": now(), "error": {"code": getattr(error, "code", type(error).__name__),
                                                                  "message": str(error)[:2000]}}
        pages[address] = page
        with workspace.connect(write=True) as db:
            live = workspace._operation(db, operation_id)
            live["checkpoint"] = {"stage": "CAPTURE", "safe_to_retry": True, "pages": list(pages.values())}
            live["progress"] = {"completed": len(pages), "total": len(spec["urls"]), "stage": "CAPTURE",
                                "detail": str(len(pages)) + " of " + str(len(spec["urls"])) + " original pages retained"}
            workspace._write_operation(db, live, live["author"], "Visitor page outcome retained",
                                       {"url": address, "sha256": page.get("sha256"), "error": page.get("error")})
    results = model.evaluate(spec["bound"], list(pages.values()))
    status = "CANCELLED" if cancelled else "FAILED" if any(p.get("error") for p in pages.values()) else "COMPLETE"
    with workspace.connect(write=True) as db:
        live = workspace._operation(db, operation_id)
        edition = workspace._object(db, "visitor_edition", {
            "label": spec["label"], "role": spec["role"], "operation_id": operation_id,
            "set_id": spec["definition"]["entity_id"], "set_revision": spec["definition"]["revision"],
            "definition": spec["definition"], "project_id": spec["project"]["entity_id"],
            "project": spec["project"], "original_project": spec["original_project"],
            "url_overrides": spec["url_overrides"], "bound": spec["bound"],
            "source_mode": spec["source_mode"], "pages": list(pages.values()), "result": results,
            "result_sha256": model.digest(results), "summary": results["summary"], "capture_status": status,
            "source_file_ids": sorted({p["file_id"] for p in pages.values() if p.get("file_id")})},
            parent=spec["definition"]["entity_id"], actor=value["author"])
        live["native_result"] = {"status": status, "safe_to_retry": True, "edition_id": edition["id"],
                                 "result_sha256": edition["result_sha256"], "artifacts": [],
                                 "observations": {"pages": len(pages), **results["summary"]}}
        live.update(state=status, actual_finished_at=now(), result_edition_id=edition["id"])
        live["progress"] = {"completed": len(pages), "total": len(spec["urls"]), "stage": status,
                            "detail": "Original visitor source and reviewed-outcome results retained"}
        live["error"] = {"code": "VISITOR_CAPTURE_ERRORS", "message": "Some original sources could not be acquired. Resume this operation to retrieve those pages."} if status == "FAILED" else None
        workspace._write_operation(db, live, value["author"], "Visitor capture edition retained",
                                   {"edition_id": edition["id"], "result_sha256": edition["result_sha256"]})


def edition(workspace, db, edition_id):
    value = workspace._get(db, "visitor_edition", edition_id)
    if model.digest(value["result"]) != value["result_sha256"]:
        model.fail("VISITOR_RESULT_CHANGED", "The original captured journey result changed.", 409)
    return value


def get_edition(workspace, payload):
    with workspace.connect(snapshot=True) as db:
        value = edition(workspace, db, payload.get("edition_id"))
        reviews = workspace._objects(db, "visitor_review", value["id"])
        findings = []
        for row in db.execute("SELECT value FROM govhub_settings WHERE key LIKE 'visitor.finding:%'"):
            item = workspace._get(db, "visitor_finding", json.loads(row[0])["version_id"])
            if item["edition_id"] == value["id"]:
                findings.append(item)
        return {"edition": value, "reviews": reviews, "findings": findings,
                "files": [workspace._file_row(db, file_id) for file_id in value["source_file_ids"]]}


def review(workspace, payload, actor):
    workspace._authorize(actor, "reviewer")
    with workspace.connect(write=True) as db:
        key, fingerprint, prior = workspace._request(db, payload, actor)
        if prior:
            return prior
        selected = edition(workspace, db, payload.get("edition_id"))
        if payload.get("result_sha256") != selected["result_sha256"]:
            model.fail("VISITOR_REVIEW_SOURCE", "Review the exact retained result shown in this edition.", 409)
        previous = workspace._objects(db, "visitor_review", selected["id"])
        if type(payload.get("expected_revision")) is not int or payload.get("expected_revision") != len(previous):
            model.fail("VISITOR_REVIEW_REVISION", "Another review was saved. Reopen this edition before saving.", 409)
        decision = payload.get("decision")
        if decision not in {"ACCEPT", "RETURN"}:
            model.fail("VISITOR_REVIEW", "Choose ACCEPT or RETURN.")
        exceptions = payload.get("exceptions", [])
        if not isinstance(exceptions, list):
            model.fail("VISITOR_EXCEPTIONS", "Exceptions are explicit journey identifiers and reasons.")
        chosen = {}
        ids = {j["id"] for j in selected["result"]["journeys"]}
        for item in exceptions:
            jid = model.identifier(item.get("journey_id"))
            if jid not in ids or jid in chosen:
                model.fail("VISITOR_EXCEPTIONS", "Select each original journey exception once.")
            chosen[jid] = model.string(item.get("reason"), "Exception reason", 8000)
        unresolved = {j["id"] for j in selected["result"]["journeys"] if j["status"] != "PASS"}
        if decision == "ACCEPT" and unresolved - set(chosen):
            model.fail("VISITOR_REVIEW_OUTCOME", "Accept unresolved outcomes only with an explicit reason for each original journey.", 409)
        value = workspace._object(db, "visitor_review", {
            "edition_id": selected["id"], "result_sha256": selected["result_sha256"], "revision": len(previous) + 1,
            "decision": decision, "reason": model.string(payload.get("reason"), "Review reason", 12000),
            "exceptions": [{"journey_id": k, "reason": v} for k, v in chosen.items()]},
            parent=selected["id"], actor=actor["name"])
        result = {"review": value}
        workspace._remember(db, key, fingerprint, result, actor)
        workspace._changed(db, actor, "Visitor capture reviewed", "visitor_review", value["id"], {"decision": decision})
        return result


def finding(workspace, payload, actor):
    entity_id = model.identifier(payload.get("entity_id"))
    with workspace.connect(write=True) as db:
        key, fingerprint, prior = workspace._request(db, payload, actor)
        if prior:
            return prior
        pointer = workspace._setting(db, "visitor.finding:" + entity_id)
        previous = workspace._get(db, "visitor_finding", pointer["version_id"]) if pointer else None
        revision = previous["revision"] if previous else 0
        if type(payload.get("expected_revision")) is not int or payload.get("expected_revision") != revision:
            model.fail("VISITOR_FINDING_REVISION", "The corrective work changed. Open its current revision.", 409)
        selected = edition(workspace, db, payload.get("edition_id"))
        jid = model.identifier(payload.get("journey_id"))
        if not any(j["id"] == jid for j in selected["result"]["journeys"]):
            model.fail("VISITOR_FINDING", "Select a journey in this captured edition.")
        if previous and (previous["edition_id"] != selected["id"] or previous["journey_id"] != jid):
            model.fail("VISITOR_FINDING", "Corrective work keeps its original captured journey.")
        state = payload.get("status", "OPEN")
        if state not in {"OPEN", "IN_PROGRESS", "RESOLVED", "EXPECTATION_CORRECTED", "ACCEPTED_RISK"}:
            model.fail("VISITOR_FINDING_STATE", "Choose a supported corrective work state.")
        resolution_id = payload.get("resolution_edition_id", "")
        if state == "RESOLVED":
            resolved = edition(workspace, db, resolution_id)
            matching = next((j for j in resolved["result"]["journeys"] if j["id"] == jid), None)
            if not matching or matching["status"] != "PASS":
                model.fail("VISITOR_FINDING_RESOLUTION", "Resolution references a passing captured outcome for the same visitor journey.")
            old_journey = next(j for j in selected["definition"]["value"]["journeys"] if j["id"] == jid)
            new_journey = next(j for j in resolved["definition"]["value"]["journeys"] if j["id"] == jid)
            if old_journey != new_journey:
                model.fail("VISITOR_FINDING_EXPECTATION", "Changed expectations use EXPECTATION_CORRECTED so the original customer outcome remains visible.")
        value = workspace._object(db, "visitor_finding", {
            "entity_id": entity_id, "revision": revision + 1, "edition_id": selected["id"], "journey_id": jid,
            "title": model.string(payload.get("title"), "Corrective work title", 500),
            "action": model.string(payload.get("action"), "Implementation action", 12000),
            "owner": model.string(payload.get("owner", ""), "Work owner", 300, False),
            "status": state, "resolution_edition_id": resolution_id,
            "note": model.string(payload.get("note", ""), "Change note", 8000, False)},
            parent=entity_id, actor=actor["name"])
        workspace._set(db, "visitor.finding:" + entity_id, {"version_id": value["id"], "revision": revision + 1})
        result = {"finding": value}
        workspace._remember(db, key, fingerprint, result, actor)
        workspace._changed(db, actor, "Visitor corrective work saved", "visitor_finding", value["id"], {"status": state})
        return result


def compare(workspace, payload):
    with workspace.connect(snapshot=True) as db:
        before = edition(workspace, db, payload.get("before_id"))
        after = edition(workspace, db, payload.get("after_id"))
    original_criteria = {j["id"]: j for j in before["definition"]["value"]["journeys"]}
    latest_criteria = {j["id"]: j for j in after["definition"]["value"]["journeys"]}
    old = {j["id"]: j for j in before["result"]["journeys"]}
    new = {j["id"]: j for j in after["result"]["journeys"]}
    rows = []
    for jid in sorted(set(old) | set(new)):
        a, b = old.get(jid), new.get(jid)
        relation = "ADDED" if a is None else "REMOVED" if b is None else "UNCHANGED" if a == b else "CHANGED"
        criteria_changed = original_criteria.get(jid) != latest_criteria.get(jid)
        rows.append({"journey_id": jid, "change": relation, "before": a, "after": b,
                     "criteria_changed": criteria_changed,
                     "regression": bool(not criteria_changed and a and b and a["status"] == "PASS" and b["status"] != "PASS"),
                     "improvement": bool(not criteria_changed and a and b and a["status"] != "PASS" and b["status"] == "PASS")})
    source_a = {p["url"]: p.get("sha256") for p in before["pages"]}
    source_b = {p["url"]: p.get("sha256") for p in after["pages"]}
    return {"before_id": before["id"], "after_id": after["id"],
            "definition_changed": before["definition"]["sha256"] != after["definition"]["sha256"],
            "target_changed": before["project"]["sha256"] != after["project"]["sha256"],
            "binding_changed": before["url_overrides"] != after["url_overrides"],
            "before_url_overrides": before["url_overrides"], "after_url_overrides": after["url_overrides"],
            "before_definition": before["definition"], "after_definition": after["definition"],
            "before_target": before["project"], "after_target": after["project"],
            "rows": rows, "source_changes": [{"url": address, "before": source_a.get(address), "after": source_b.get(address)}
                                            for address in sorted(set(source_a) | set(source_b))
                                            if source_a.get(address) != source_b.get(address)],
            "summary": {"regressions": sum(row["regression"] for row in rows),
                        "improvements": sum(row["improvement"] for row in rows),
                        "added": sum(row["change"] == "ADDED" for row in rows),
                        "removed": sum(row["change"] == "REMOVED" for row in rows)}}


def handover_capture(workspace, db, payload, actor):
    from govhub import now
    ids = payload.get("visitor_edition_ids")
    if not isinstance(ids, list) or not 1 <= len(ids) <= 100 or len(set(ids)) != len(ids):
        model.fail("VISITOR_HANDOVER", "Choose one to 100 complete retained editions for this handover.")
    if not isinstance(payload.get("include_sources", True), bool):
        model.fail("VISITOR_HANDOVER", "Choose whether to include the original source bytes.")
    values = [edition(workspace, db, value) for value in ids]
    files = {}
    operations = []
    for value in values:
        for file_id in value["source_file_ids"]:
            file = workspace._file_row(db, file_id)
            workspace._verify_file(file)
            files[file_id] = file
        operation = workspace._operation(db, value["operation_id"])
        outputs = workspace._output_list(db, "operation", operation["id"])
        for output in outputs:
            file = workspace._file_row(db, output["file_id"])
            workspace._verify_file(file)
            files[file["id"]] = file
        if not any(item["operation"]["id"] == operation["id"] for item in operations):
            operations.append({"operation": operation, "events": workspace._objects(db, "operation_event", operation["id"]),
                               "observations": workspace._objects(db, "operation_observation", operation["id"]),
                               "files": outputs})
    settings = workspace._setting(db, "settings")
    if settings.get("scope_file_id"):
        file = workspace._file_row(db, settings["scope_file_id"])
        workspace._verify_file(file)
        files[file["id"]] = file
    visitor = {"format": model.FORMAT, "editions": values,
               "reviews": [r for value in values for r in workspace._objects(db, "visitor_review", value["id"])],
               "finding_history": [r for r in workspace._objects(db, "visitor_finding") if r["edition_id"] in ids]}
    return {"format": "govhub-cutover-handover/1", "name": model.string(payload.get("name"), "Handover name", 500),
            "observed_at": now(), "author": actor["name"], "workspace": workspace.meta(db)["workspace"],
            "workspace_head": workspace.meta(db)["head"], "settings": settings,
            "source": {"title": "Visitor journeys", "url": values[0]["project"]["value"]["source_reference"]},
            "core_sources": workspace.core_sources, "auditor_sha256": workspace.auditor_sha256,
            "include_sources": bool(payload.get("include_sources", True)), "plan_ids": [], "plans": [], "snapshots": [],
            "records": {"sites": [], "environments": [], "migration_issues": []}, "record_history": [],
            "operations": operations, "sources": list(files.values()), "visitor": visitor, "visitor_edition_ids": ids}


def dispatch(workspace, action, payload, actor):
    payload = dict(payload, visitor_action=action)
    if action in {"visitor.projects.save", "visitor.sets.save"}:
        return save_version(workspace, "project" if action == "visitor.projects.save" else "set", payload, actor)
    if action in {"visitor.projects.get", "visitor.sets.get"}:
        kind = "project" if action == "visitor.projects.get" else "set"
        with workspace.connect(snapshot=True) as db:
            value = current(workspace, db, kind, payload.get("entity_id"))
            return {kind: value, "history": workspace._objects(db, "visitor_" + kind, value["entity_id"])}
    if action == "visitor.snapshot":
        with workspace.connect(snapshot=True) as db:
            return summaries(workspace, db)
    if action in {"visitor.captures.create", "visitor.captures.import"}:
        if action.endswith(".import") and "source_files" not in payload:
            model.fail("VISITOR_SUPPLIED", "Select the complete original page-file bindings.")
        return create_capture(workspace, payload, actor)
    if action == "visitor.captures.get":
        return workspace._operations_get(payload)
    if action == "visitor.captures.resume":
        return workspace._operations_resume(payload, actor)
    if action == "visitor.captures.cancel":
        return workspace._operations_cancel(payload, actor)
    if action == "visitor.editions.get":
        return get_edition(workspace, payload)
    if action == "visitor.editions.compare":
        return compare(workspace, payload)
    if action == "visitor.reviews.save":
        return review(workspace, payload, actor)
    if action == "visitor.findings.save":
        return finding(workspace, payload, actor)
    if action == "visitor.exports.create":
        payload.pop("visitor_action")
        return workspace._exports_create(payload, actor)
    model.fail("VISITOR_ACTION", "The visitor workspace action does not exist.", 404)
