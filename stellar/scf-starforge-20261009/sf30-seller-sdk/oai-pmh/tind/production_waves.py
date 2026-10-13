"""MIT. Saved collection waves over the original TIND project and native batches."""
from __future__ import annotations
from collections import Counter
from bridge import InputError
from harvest import jbytes, decode, sha, stamp, plain, page_values
from marc import grouped

SCHEMA = "stellar-forge.tind-production-plan.v1"

def tables(owner):
    owner.db.executescript("""
        CREATE TABLE IF NOT EXISTS tind_production_plans(
            id TEXT PRIMARY KEY,project_id TEXT NOT NULL,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tind_production_waves(
            id TEXT PRIMARY KEY,plan_id TEXT NOT NULL,project_id TEXT NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS tind_production_wave_plan ON tind_production_waves(plan_id,ordinal);
        CREATE TABLE IF NOT EXISTS tind_production_members(
            plan_id TEXT NOT NULL,identifier TEXT NOT NULL,wave_id TEXT,body TEXT NOT NULL,
            PRIMARY KEY(plan_id,identifier));
        CREATE INDEX IF NOT EXISTS tind_production_wave_member ON tind_production_members(wave_id,identifier);
    """)

def get_plan(owner, project_id, identity):
    row = owner.db.execute("SELECT body FROM tind_production_plans WHERE id=? AND project_id=?",
                           (identity, project_id)).fetchone()
    if not row:
        raise InputError("Select a production plan in this original migration")
    return decode(row[0])

def get_wave(owner, project_id, identity):
    row = owner.db.execute("SELECT body FROM tind_production_waves WHERE id=? AND project_id=?",
                           (identity, project_id)).fetchone()
    if not row:
        raise InputError("Select a production wave in this original migration")
    return decode(row[0])

def save_wave(owner, value):
    owner.db.execute("UPDATE tind_production_waves SET body=? WHERE id=?", (jbytes(value).decode(), value["id"]))

def file_intent(entry):
    return {key: entry.get(key) for key in ("id", "filename", "sha256", "bytes", "role", "mediaType", "access")}

def desired(view):
    groups = grouped(view["proposed"])
    return {"action": view["action"], "targetId": view["targetId"], "access": view["access"],
            "fields": {key: value for key, value in groups.items() if key not in {"001", "005"} and not key.startswith("856")},
            "files": sorted((file_intent(row) for row in view["files"]), key=lambda row: row["id"])}

def signature(project, view):
    # Destination observations are included through the actual proposed merge,
    # while native file readback history remains distinct from intended content.
    return sha(jbytes({"observationId": view["observationId"], "desired": desired(view),
                      "staff": view["staff"], "profile": project["profile"]}))

def received(owner, project, view):
    if not view["deliveries"]:
        return False
    latest = max(view["deliveries"], key=lambda item: item.get("projectRevision", -1))
    row = owner.db.execute("SELECT body FROM tind_batch_records WHERE batch_id=? AND identifier=?",
                           (latest["batchId"], view["identifier"])).fetchone()
    if not row:
        return False
    frozen = decode(row[0])
    if frozen.get("status") != "confirmed":
        return False
    batch = owner.batch(latest["batchId"])
    if batch["profile"].get("instance") != project["profile"].get("instance"):
        return False
    wanted = desired(view)
    if frozen["action"] == "withdraw" and view["action"] == "withdraw":
        if view["destination"] is not None:
            return False
        # Successful withdrawal removes the target that preview normally requires.
        # Match its retained intention; disappearing destination-only fields are
        # expected, while new source, target, access or file choices remain work.
        current_decisions = view["staff"].get("decisions", {})
        original_decisions = frozen.get("staff", {}).get("decisions", {})
        return bool(view["staff"].get("reviewer")) and all((
            view["targetId"] == latest.get("nativeId") == frozen.get("targetId"),
            grouped(view["source"]) == grouped(frozen["sourceMapped"]),
            current_decisions in ({}, original_decisions),
            view["access"] == frozen["access"],
            wanted["files"] == sorted((file_intent(entry) for entry in frozen["files"]), key=lambda entry: entry["id"]),
        ))
    if not view["ready"]:
        return False
    old_groups = grouped(frozen["record"])
    prior = {"action": frozen["action"], "targetId": latest.get("nativeId"), "access": frozen["access"],
             "fields": {key: value for key, value in old_groups.items() if key not in {"001", "005"} and not key.startswith("856")},
             "files": sorted((file_intent(entry) for entry in frozen["files"]), key=lambda entry: entry["id"])}
    if prior != wanted:
        return False
    if view["action"] == "withdraw":
        return True
    from migration import file_receiving
    return all(file_receiving(entry, target_id=view["targetId"])["complete"] for entry in view["files"])

def frozen_member(project, view):
    return {"identifier": view["identifier"], "title": view["title"], "observationId": view["observationId"],
            "setSpecs": view["setSpecs"], "sourceDatestamp": view["sourceDatestamp"],
            "signature": signature(project, view), "action": view["action"], "ready": view["ready"],
            "issues": view["issues"], "disposition": "include", "history": [], "preparedBatchIds": []}

def assessment(owner, project, member, include_received=False):
    view = owner.preview(project, member["identifier"])
    current = signature(project, view)
    if member["disposition"] == "defer":
        status = "deferred"
    elif view["action"] == "exclude":
        status = "excluded"
    elif received(owner, project, view) and (not include_received or any(
            item["batchId"] in member.get("preparedBatchIds", []) for item in view["deliveries"])):
        status = "received"
    elif current != member["signature"]:
        status = "changed"
    elif not view["ready"]:
        status = "unresolved"
    else:
        status = "ready"
    if status == "ready":
        active = [owner.batch(key) for key in member.get("preparedBatchIds", [])
                  if owner.batch(key)["status"] not in {"received", "withdrawn"}]
        if active:
            status = "receiving" if active[-1]["status"] != "prepared" else "prepared"
    return {**member, "status": status, "currentSignature": current, "currentTitle": view["title"],
            "currentObservationId": view["observationId"], "currentIssues": view["issues"],
            "targetId": view["targetId"], "action": view["action"]}

def collection_inventory(owner, project_id):
    owner.project(project_id)
    counts, total, unassigned = Counter(), 0, 0
    for row in owner.db.execute("SELECT body FROM tind_records WHERE project_id=?", (project_id,)):
        body = decode(row[0])
        sets = set(body.get("setSpecs", []))
        total += 1
        if not sets:
            unassigned += 1
        for item in sets:
            counts[item] += 1
    return {"projectId": project_id, "records": total, "unassigned": unassigned,
            "collections": [{"set": key, "records": counts[key]} for key in sorted(counts)],
            "counting": "Records in multiple sets appear in each collection count and once in a selected plan."}

def list_plans(owner, project_id, offset=0, limit=50):
    page_values(offset, limit)
    total = owner.db.execute("SELECT COUNT(*) FROM tind_production_plans WHERE project_id=?", (project_id,)).fetchone()[0]
    rows = owner.db.execute("SELECT body FROM tind_production_plans WHERE project_id=? ORDER BY rowid DESC LIMIT ? OFFSET ?",
                            (project_id, limit, offset)).fetchall()
    return {"items": [decode(row[0]) for row in rows], "total": total, "offset": offset,
            "next": offset + len(rows) if offset + len(rows) < total else None}

def plan_view(owner, project_id, identity, offset=0, limit=50):
    page_values(offset, limit)
    plan = get_plan(owner, project_id, identity)
    rows = owner.db.execute("SELECT body FROM tind_production_waves WHERE plan_id=? ORDER BY ordinal LIMIT ? OFFSET ?",
                            (identity, limit, offset)).fetchall()
    items = []
    for row in rows:
        wave = decode(row[0])
        batches = [owner.batch(batch_id) for batch_id in wave["batchIds"]]
        items.append({**wave, "batchStates": [{"id": batch["id"], "status": batch["status"],
                      "counts": batch["counts"], "lastReconciliation": batch["reconciliations"][-1] if batch["reconciliations"] else None}
                     for batch in batches]})
    return {**plan, "waves": items, "offset": offset,
            "next": offset + len(rows) if offset + len(rows) < plan["waveCount"] else None}

def wave_view(owner, project_id, identity, offset=0, limit=50):
    page_values(offset, limit)
    project = owner.project(project_id)
    wave = get_wave(owner, project_id, identity)
    plan = get_plan(owner, project_id, wave["planId"])
    counts, items = Counter(), []
    rows = owner.db.execute("SELECT body FROM tind_production_members WHERE wave_id=? ORDER BY identifier", (identity,))
    for index, row in enumerate(rows):
        item = assessment(owner, project, decode(row[0]), plan["selection"]["includeReceived"])
        counts[item["status"]] += 1
        if offset <= index < offset + limit:
            items.append(item)
    total = sum(counts.values())
    batches = [owner.batch(batch_id) for batch_id in wave["batchIds"]]
    active = [batch for batch in batches if batch["status"] not in {"received", "withdrawn"}]
    return {**wave, "counts": dict(counts), "items": items, "total": total, "offset": offset,
            "next": offset + len(items) if offset + len(items) < total else None,
            "currentProjectRevision": project["revision"], "currentEditionId": project["editionId"],
            "complete": not active and not any(counts[key] for key in ("ready", "changed", "unresolved", "deferred")),
            "batchStates": [{"id": batch["id"], "status": batch["status"], "counts": batch["counts"],
                            "lastReconciliation": batch["reconciliations"][-1] if batch["reconciliations"] else None} for batch in batches]}

def _reviewer(value):
    return plain(value.get("reviewer"), "responsible wave operator", 256), plain(value.get("note"), "wave decision and scope", 16384)

def _editable(owner, wave):
    for identity in wave["batchIds"]:
        if owner.batch(identity)["status"] not in {"received", "withdrawn"}:
            raise InputError("Finish or explicitly withdraw the original native batch before revising this wave")

def create_plan(owner, project, value, operation):
    reviewer, note = _reviewer(value)
    title = plain(value.get("title"), "production plan title", 256)
    selection = value.get("selection", {})
    if not isinstance(selection, dict):
        raise InputError("Select the complete source collections")
    sets = selection.get("sets", [])
    if not isinstance(sets, list) or len(sets) > 10000 or any(not isinstance(item, str) or not item or len(item) > 4096 for item in sets) or len(sets) != len(set(sets)):
        raise InputError("Select unique original repository set identifiers")
    all_records = selection.get("all", not sets)
    unassigned = selection.get("unassigned", False)
    include_received = selection.get("includeReceived", False)
    if any(type(item) is not bool for item in (all_records, unassigned, include_received)):
        raise InputError("Collection selection flags must be true or false")
    if all_records and (sets or unassigned):
        raise InputError("Choose all original records or explicit collections")
    if not all_records and not sets and not unassigned:
        raise InputError("Select an original collection or records without a collection")
    per_wave = value.get("recordsPerWave", 500)
    if type(per_wave) is not int or not 1 <= per_wave <= 10000:
        raise InputError("Choose one to ten thousand original records per wave")
    identity = sha(jbytes(["tind-production-plan", operation, project["id"]]))
    plan = {"schema": SCHEMA, "id": identity, "projectId": project["id"], "title": title,
            "editionId": project["editionId"], "projectRevision": project["revision"],
            "profileSha256": sha(jbytes(project["profile"])), "createdAt": stamp(), "reviewer": reviewer, "note": note,
            "selection": {"all": all_records, "sets": sets, "unassigned": unassigned, "includeReceived": include_received},
            "recordsPerWave": per_wave, "waveCount": 0, "selectedRecords": 0,
            "initialCounts": {"received": 0, "excluded": 0, "ready": 0, "unresolved": 0}}
    owner.db.execute("INSERT INTO tind_production_plans VALUES(?,?,?)", (identity, project["id"], jbytes(plan).decode()))
    available, current, observed_sets = {}, {}, set()
    selected_sets = set(sets)
    for source in owner.db.execute("SELECT identifier,body FROM tind_records WHERE project_id=? ORDER BY identifier", (project["id"],)):
        body = decode(source["body"])
        source_sets = set(body.get("setSpecs", []))
        observed_sets.update(source_sets)
        selected_matches = source_sets if all_records else source_sets & selected_sets
        if not all_records and not selected_matches and not (unassigned and not source_sets):
            continue
        view = owner.preview(project, source["identifier"])
        member = frozen_member(project, view)
        plan["selectedRecords"] += 1
        already_received = not include_received and received(owner, project, view)
        reason = "excluded" if view["action"] == "exclude" else "received" if already_received else None
        wave_id = None
        if reason:
            member["initialDisposition"] = reason
            plan["initialCounts"][reason] += 1
        else:
            key = sorted(selected_matches)[0] if selected_matches else ""
            wave = current.get(key)
            if wave is None or wave["records"] >= per_wave:
                plan["waveCount"] += 1
                wave_id = sha(jbytes([identity, plan["waveCount"]]))
                wave = {"id": wave_id, "planId": identity, "projectId": project["id"], "ordinal": plan["waveCount"],
                        "collection": key, "title": (key or "Unassigned collection") + " / " + str(available.get(key, 0) + 1),
                        "records": 0, "editionId": project["editionId"], "reviewer": reviewer, "note": note,
                        "createdAt": stamp(), "reviewedAt": stamp(), "batchIds": [], "history": []}
                available[key] = available.get(key, 0) + 1
                current[key] = wave
                owner.db.execute("INSERT INTO tind_production_waves VALUES(?,?,?,?,?)",
                                 (wave_id, identity, project["id"], wave["ordinal"], jbytes(wave).decode()))
            wave_id = wave["id"]
            wave["records"] += 1
            save_wave(owner, wave)
            plan["initialCounts"]["ready" if view["ready"] else "unresolved"] += 1
        owner.db.execute("INSERT INTO tind_production_members VALUES(?,?,?,?)",
                         (identity, view["identifier"], wave_id, jbytes(member).decode()))
    if selected_sets - observed_sets:
        raise InputError("The selected source edition does not contain these collections: " + ", ".join(sorted(selected_sets - observed_sets)))
    if not plan["selectedRecords"]:
        raise InputError("The selected original collection is empty")
    owner.db.execute("UPDATE tind_production_plans SET body=? WHERE id=?", (jbytes(plan).decode(), identity))
    return plan

def review_wave(owner, project, value, operation):
    reviewer, note = _reviewer(value)
    wave = get_wave(owner, project["id"], value.get("waveId"))
    _editable(owner, wave)
    changed = 0
    rows = owner.db.execute("SELECT identifier,body FROM tind_production_members WHERE wave_id=? ORDER BY identifier", (wave["id"],)).fetchall()
    for row in rows:
        old = decode(row["body"])
        view = owner.preview(project, row["identifier"])
        current = frozen_member(project, view)
        changed += current["signature"] != old["signature"]
        current["disposition"], current["history"] = old["disposition"], old["history"]
        current["preparedBatchIds"] = old.get("preparedBatchIds", [])
        current["history"].append({"operationId": operation, "reviewer": reviewer, "note": note, "at": stamp(),
                                   "beforeSignature": old["signature"], "afterSignature": current["signature"]})
        owner.db.execute("UPDATE tind_production_members SET body=? WHERE plan_id=? AND identifier=?",
                         (jbytes(current).decode(), wave["planId"], row["identifier"]))
    wave.update({"editionId": project["editionId"], "reviewer": reviewer, "note": note, "reviewedAt": stamp()})
    wave["history"].append({"kind": "review", "operationId": operation, "changedRecords": changed, "at": stamp(),
                            "reviewer": reviewer, "note": note, "projectRevision": project["revision"]})
    save_wave(owner, wave)
    return wave

def disposition(owner, project, value, operation):
    reviewer, note = _reviewer(value)
    wave = get_wave(owner, project["id"], value.get("waveId"))
    _editable(owner, wave)
    identifiers = value.get("identifiers", [])
    chosen = value.get("disposition")
    if chosen not in {"defer", "include"} or not isinstance(identifiers, list) or not 1 <= len(identifiers) <= 10000 or any(not isinstance(item, str) or not item for item in identifiers) or len(identifiers) != len(set(identifiers)):
        raise InputError("Choose unique wave records and include or defer them")
    for identifier in identifiers:
        row = owner.db.execute("SELECT body FROM tind_production_members WHERE wave_id=? AND identifier=?", (wave["id"], identifier)).fetchone()
        if not row:
            raise InputError("A selected record is outside this production wave")
        member = decode(row[0])
        member["history"].append({"kind": "disposition", "before": member["disposition"], "after": chosen,
                                  "operationId": operation, "reviewer": reviewer, "note": note, "at": stamp()})
        member["disposition"] = chosen
        owner.db.execute("UPDATE tind_production_members SET body=? WHERE plan_id=? AND identifier=?",
                         (jbytes(member).decode(), wave["planId"], identifier))
    wave["history"].append({"kind": "disposition", "operationId": operation, "records": len(identifiers),
                            "disposition": chosen, "reviewer": reviewer, "note": note, "at": stamp()})
    save_wave(owner, wave)
    return wave

def prepare_wave(owner, project, value, operation):
    reviewer, note = _reviewer(value)
    wave = get_wave(owner, project["id"], value.get("waveId"))
    _editable(owner, wave)
    plan = get_plan(owner, project["id"], wave["planId"])
    ready_only = value.get("readyOnly", False)
    if type(ready_only) is not bool:
        raise InputError("Choose whether to prepare only ready records")
    selected, counts = [], Counter()
    for row in owner.db.execute("SELECT body FROM tind_production_members WHERE wave_id=? ORDER BY identifier", (wave["id"],)):
        item = assessment(owner, project, decode(row[0]), plan["selection"]["includeReceived"])
        counts[item["status"]] += 1
        if item["status"] == "changed":
            raise InputError("Review this wave's current source and staff changes before preparing it")
        if item["status"] == "unresolved" and not ready_only:
            raise InputError("Resolve the current wave or explicitly prepare its ready records while keeping exceptions")
        if item["status"] == "ready":
            selected.append(item["identifier"])
    if not selected:
        raise InputError("This wave has no reviewed ready records to prepare")
    batch = owner._prepare(project, {"identifiers": selected, "reviewer": reviewer, "note": note}, operation)
    batch["productionWaveId"], batch["productionPlanId"] = wave["id"], plan["id"]
    owner._save_batch(batch)
    wave["batchIds"].append(batch["id"])
    for identifier in selected:
        row = owner.db.execute("SELECT body FROM tind_production_members WHERE wave_id=? AND identifier=?", (wave["id"], identifier)).fetchone()
        member = decode(row[0])
        member.setdefault("preparedBatchIds", []).append(batch["id"])
        owner.db.execute("UPDATE tind_production_members SET body=? WHERE plan_id=? AND identifier=?",
                         (jbytes(member).decode(), wave["planId"], identifier))
    wave["history"].append({"kind": "prepare", "operationId": operation, "batchId": batch["id"], "at": stamp(),
                            "counts": dict(counts), "reviewer": reviewer, "note": note, "readyOnly": ready_only})
    save_wave(owner, wave)
    return {"wave": wave, "batch": batch}

def reconcile_wave(owner, project, value, operation):
    reviewer, note = _reviewer(value)
    wave = get_wave(owner, project["id"], value.get("waveId"))
    batch_id = value.get("batchId")
    if batch_id not in wave["batchIds"]:
        raise InputError("Choose one of this wave's original prepared batches")
    result = owner._reconcile(project, {"batchId": batch_id}, operation)
    wave["history"].append({"kind": "reconcile", "operationId": operation, "batchId": batch_id, "at": stamp(),
                            "counts": result["counts"], "reviewer": reviewer, "note": note})
    save_wave(owner, wave)
    return {"wave": wave, "receiving": result}

def export_plan(owner, project_id, identity, stream):
    """Write every original membership, decision and native reference without truncation."""
    with owner.mutex:
        plan = get_plan(owner, project_id, identity)
        project = owner.project(project_id)
        stream.write(jbytes({"type": "plan", "plan": plan, "currentProjectRevision": project["revision"],
                             "currentEditionId": project["editionId"]}))
        for row in owner.db.execute("SELECT body FROM tind_production_waves WHERE plan_id=? ORDER BY ordinal", (identity,)):
            wave = decode(row[0])
            stream.write(jbytes({"type": "wave", "wave": wave, "batches": [owner.batch(key) for key in wave["batchIds"]]}))
        for row in owner.db.execute("SELECT wave_id,body FROM tind_production_members WHERE plan_id=? ORDER BY identifier", (identity,)):
            member = decode(row["body"])
            current = assessment(owner, project, member, plan["selection"]["includeReceived"]) if row["wave_id"] else member
            stream.write(jbytes({"type": "member", "waveId": row["wave_id"], "member": current}))

def write_export(owner, project_id, identity, output):
    from pathlib import Path
    import os
    from migration import ArchiveWriter
    path = Path(output)
    opened = False
    try:
        with path.open("xb") as target:
            opened = True
            writer = ArchiveWriter(target)
            export_plan(owner, project_id, identity, writer)
            target.flush()
            os.fsync(target.fileno())
            return {"path": str(path), "bytes": writer.bytes, "sha256": writer.hash.hexdigest()}
    except BaseException:
        if opened:
            path.unlink(missing_ok=True)
        raise
