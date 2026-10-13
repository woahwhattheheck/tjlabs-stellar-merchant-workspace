"""MIT. Steering review, evaluation and management response in original portfolio revisions."""
from __future__ import annotations
import copy
import json
from domain import canonical, checked_ref, digest, identifier, require, shape, short
from programme import (normalize as programme_normalize, defaults, indexes as programme_indexes,
                       record_ref, descendants, ancestors, _publication, evidence_in_scope)

GOVERNANCE_SCHEMA = "stellar-forge.grant-governance.v1"
COMMON = json.loads("{\"nodeId\":\"id\",\"grantId\":\"id?\",\"title\":\"short\",\"owner\":\"short\",\"notes\":\"text\",\"sourceRefs\":\"sources\",\"documentIds\":\"ids\",\"supersedesId\":\"id?\",\"status\":[\"draft\",\"recorded\"],\"recordedDate\":\"date?\"}")
FIELDS = json.loads("{\"committees\":{\"terms\":\"text\",\"members\":\"members\",\"reviewFrequency\":\"text\",\"nextReviewDate\":\"date?\"},\"meetings\":{\"committeeId\":\"id\",\"kind\":[\"annual\",\"ordinary\",\"closure\",\"special\"],\"meetingDate\":\"date\",\"chair\":\"short\",\"attendees\":\"strings\",\"agenda\":\"text\",\"minutes\":\"text\",\"nextReviewDate\":\"date?\"},\"decisions\":{\"meetingId\":\"id\",\"topic\":\"short\",\"decision\":\"text\",\"rationale\":\"text\",\"responsible\":\"short\",\"dueDate\":\"date?\",\"outcome\":[\"agreed\",\"deferred\",\"noted\",\"rejected\"],\"issueIds\":\"ids\",\"milestoneIds\":\"ids\"},\"evaluations\":{\"kind\":[\"midterm\",\"terminal\",\"thematic\",\"other\"],\"stage\":[\"terms\",\"report\"],\"periodStart\":\"date?\",\"periodEnd\":\"date?\",\"commissionedBy\":\"short\",\"evaluators\":\"strings\",\"questions\":\"strings\",\"methodology\":\"text\",\"limitations\":\"text\",\"summary\":\"text\",\"issuedDate\":\"date?\"},\"findings\":{\"evaluationId\":\"id\",\"question\":\"short\",\"finding\":\"text\",\"recommendation\":\"text\",\"priority\":\"short?\",\"recommendationOwner\":\"short?\",\"dueDate\":\"date?\"},\"responses\":{\"findingId\":\"id\",\"respondent\":\"short\",\"outcome\":[\"accepted\",\"partially-accepted\",\"rejected\",\"deferred\"],\"response\":\"text\",\"actionPlan\":\"text\",\"responsible\":\"short?\",\"dueDate\":\"date?\",\"issueIds\":\"ids\",\"milestoneIds\":\"ids\"},\"followups\":{\"decisionId\":\"id?\",\"responseId\":\"id?\",\"reviewer\":\"short\",\"reviewDate\":\"date\",\"outcome\":[\"open\",\"in-progress\",\"complete\",\"not-required\",\"deferred\"],\"progress\":\"text\",\"verification\":\"text\",\"issueIds\":\"ids\",\"milestoneIds\":\"ids\",\"nextReviewDate\":\"date?\"}}")
REQUIRED = json.loads("{\"committees\":[\"terms\",\"members\"],\"meetings\":[\"committeeId\",\"kind\",\"meetingDate\",\"chair\"],\"decisions\":[\"meetingId\",\"topic\",\"decision\",\"responsible\",\"outcome\"],\"evaluations\":[\"kind\",\"stage\",\"commissionedBy\",\"questions\",\"methodology\"],\"findings\":[\"evaluationId\",\"question\",\"finding\",\"recommendation\"],\"responses\":[\"findingId\",\"respondent\",\"outcome\",\"response\"],\"followups\":[\"reviewer\",\"reviewDate\",\"outcome\",\"progress\"]}")
COLLECTIONS = tuple(FIELDS)
GOVERNANCE_TABLES = tuple("governance_" + name for name in COLLECTIONS) + ("governance_follow_through",)


def normalize(value, spec, name):
    if isinstance(spec, list):
        require(value in spec, name + " must be one of: " + ", ".join(spec))
        return value
    if spec == "members":
        require(isinstance(value, list) and len(value) <= 500, "Retain up to 500 actual committee members")
        result, seen = [], set()
        for member in value:
            shape(member, ("name", "role", "organization", "notes"), ("name", "role"))
            row = {"name": short(member["name"], "Member name", 240),
                   "role": short(member["role"], "Member role", 240),
                   "organization": short(member.get("organization", ""), "Member organization", 240, empty=True),
                   "notes": short(member.get("notes", ""), "Member notes", 16000, empty=True)}
            key = (row["name"], row["role"], row["organization"])
            require(key not in seen, "The committee repeats a complete member identity")
            seen.add(key)
            result.append(row)
        return result
    return programme_normalize(value, spec, name)


def indexes(model):
    return {name: {row["id"]: row for row in model["records"][name]} for name in COLLECTIONS}


def ref(name, row):
    return {"collection": name, "id": row["id"], "revision": row["revision"], "sha256": row["sha256"]}


def _row(index, name, ident, *, final=False):
    row = index[name].get(ident)
    require(row is not None and not row["archived"], "Select the retained active " + name + " record",
            "GOVERNANCE_RELATION_MISSING", 409)
    require(not final or row.get("publication"), "Record the selected " + name + " edition first",
            "GOVERNANCE_DEPENDENCY_EDITION", 409)
    return row


def links(name, row):
    result = []
    target = {"meetings": ("committees", "committeeId"), "decisions": ("meetings", "meetingId"),
              "findings": ("evaluations", "evaluationId"), "responses": ("findings", "findingId")}
    if name in target:
        kind, key = target[name]
        result.append((kind, row[key]))
    if name == "followups":
        if row.get("decisionId"):
            result.append(("decisions", row["decisionId"]))
        if row.get("responseId"):
            result.append(("responses", row["responseId"]))
    if row.get("supersedesId"):
        result.append((name, row["supersedesId"]))
    return result


def _scope(row):
    return row["nodeId"], row.get("grantId")


def _programme_link(pindex, name, ident, row):
    original = pindex[name].get(ident)
    require(original is not None and not original["archived"], "Select a current original programme " + name + " record",
            "GOVERNANCE_PROGRAMME_RECORD", 409)
    if name == "documents":
        require(evidence_in_scope(pindex, "governance", row, original),
                "Select evidence in the original project/grant scope", "GOVERNANCE_SCOPE", 409)
    elif name in ("issues", "milestones"):
        require(original["nodeId"] in descendants(pindex, row["nodeId"]) and (
            row.get("grantId") is None or original.get("grantId") is not None and
            row["grantId"] in ancestors(pindex["grants"], original["grantId"], "parentGrantId")),
            "Follow-through must select the original project/grant's action", "GOVERNANCE_SCOPE", 409)
    return original


def _validate(index, pindex, name, row, *, freezing=False):
    node = _programme_link(pindex, "nodes", row["nodeId"], row)
    if row.get("grantId"):
        grant = _programme_link(pindex, "grants", row["grantId"], row)
        require(grant["projectId"] == node["id"], "The grant belongs to a different original project",
                "GOVERNANCE_SCOPE", 409)
    for target, ident in links(name, row):
        prior = _row(index, target, ident, final=freezing or ident == row.get("supersedesId"))
        require(_scope(prior) == _scope(row), "Governance links must retain their exact project/grant scope",
                "GOVERNANCE_SCOPE", 409)
    if row.get("supersedesId"):
        prior = _row(index, name, row["supersedesId"], final=True)
        require(prior["id"] != row["id"], "An edition cannot supersede itself")
        relation_fields = {"meetings": ("committeeId",), "decisions": ("meetingId",),
            "findings": ("evaluationId",), "responses": ("findingId",),
            "followups": ("decisionId", "responseId")}.get(name, ())
        require(all(prior[key] == row[key] for key in relation_fields),
                "A following edition preserves its original parent; use a new record for another scope")
    for field, target in (("documentIds", "documents"), ("issueIds", "issues"), ("milestoneIds", "milestones")):
        for ident in row.get(field, []):
            _programme_link(pindex, target, ident, row)
    if name == "evaluations":
        require(bool(row.get("periodStart")) == bool(row.get("periodEnd")),
                "Retain both original evaluation interval dates, or leave the interval unspecified")
    if row.get("periodStart") and row.get("periodEnd"):
        require(row["periodStart"] <= row["periodEnd"], "Evaluation period end precedes its start")
    if name == "followups":
        require(bool(row["decisionId"]) != bool(row["responseId"]),
                "A follow-through reviews exactly one original decision or management response")
    if name == "findings":
        evaluation = _row(index, "evaluations", row["evaluationId"])
        require(row["question"] in evaluation["questions"],
                "Select the exact original evaluation question; preserve new questions in a following evaluation")
    if not freezing:
        return
    require(row["recordedDate"], "Retain the actual date this edition was recorded")
    require(row["documentIds"] or row["sourceRefs"] or row["notes"].strip(),
            "Retain original evidence or an explicit contemporaneous source note")
    if name == "committees":
        require(row["terms"].strip() and row["members"], "A recorded committee needs actual terms and members")
    elif name == "meetings":
        require(row["minutes"].strip() and row["attendees"],
                "A recorded meeting needs actual minutes and attendees; no attendance is inferred")
        require(row["meetingDate"] <= row["recordedDate"], "The meeting occurs after its recording date")
    elif name == "decisions":
        require(row["decision"].strip() and row["rationale"].strip(),
                "Retain the actual decision and its reason")
        require(row["outcome"] != "agreed" or row.get("dueDate") or row["notes"].strip(),
                "Record an agreed action's due date or explain why none is selected")
    elif name == "evaluations":
        require(row["questions"] and row["methodology"].strip() and row["evaluators"],
                "Retain the actual evaluation questions, method and evaluators")
        if row["stage"] == "report":
            require(row["issuedDate"] and row["summary"].strip(),
                    "A recorded evaluation report requires its issue date and summary")
    elif name == "findings":
        require(row["finding"].strip() and row["recommendation"].strip(),
                "Retain the evaluator's finding and recommendation")
    elif name == "responses":
        require(row["response"].strip(), "Retain the accountable management response")
        if row["outcome"] in ("accepted", "partially-accepted"):
            require(row["responsible"] and row["dueDate"] and row["actionPlan"].strip(),
                    "Accepted recommendations require an accountable owner, due date and action plan")
    elif name == "followups":
        require(row["progress"].strip(), "Retain the original follow-through account")
        if row["outcome"] in ("complete", "not-required"):
            require(row["verification"].strip(), "A closed follow-through needs the explicit reviewer conclusion")
        # This is the supplied review outcome. Linked issue/milestone statuses
        # remain separately visible; the review never silently completes them.
        require(row["reviewDate"] <= row["recordedDate"], "The review occurs after its recording date")


def _snapshot(row):
    value = {key: copy.deepcopy(item) for key, item in row.items() if key != "publication"}
    if row.get("publication"):
        value["publicationSha256"] = digest(row["publication"])
    return value


def _publish(index, programme, pindex, name, row, *, entities, financial, context, object_info):
    # Reuse the original programme position and full contributor traversal.
    selected_row = {**row, "closedDate": row.get("periodEnd") or row.get("meetingDate")
                    or row.get("reviewDate") or row["recordedDate"]}
    if not (row.get("periodStart") and row.get("periodEnd")):
        selected_row.pop("periodStart", None)
        selected_row.pop("periodEnd", None)
    basis = _publication(programme, selected_row, entities, financial, context)
    selected = {}
    for target, refs in basis["recordRefs"].items():
        for original_ref in refs:
            original = pindex[target][original_ref["id"]]
            selected[(target, original["id"], original["revision"], original["sha256"])] = original
    for key, target in (("documentIds", "documents"), ("issueIds", "issues"), ("milestoneIds", "milestones")):
        for ident in row.get(key, []):
            original = _programme_link(pindex, target, ident, row)
            selected[(target, original["id"], original["revision"], original["sha256"])] = original
    dependencies, pending, seen = [], list(links(name, row)), set()
    while pending:
        target, ident = pending.pop()
        if (target, ident) in seen:
            continue
        seen.add((target, ident))
        require(len(seen) <= 10000, "The complete governance dependency graph exceeds 10,000 records")
        original = _row(index, target, ident, final=True)
        dependencies.append({"collection": target, "record": _snapshot(original)})
        pending.extend(links(target, original))
    # Each immutable dependency's own publication stays in this same model.
    # Preserve its full original programme/document editions here as well.
    for dependency in dependencies:
        original = index[dependency["collection"]][dependency["record"]["id"]]
        for entry in original["publication"]["programmeRecords"]:
            r = entry["record"]
            selected[(entry["collection"], r["id"], r["revision"], r["sha256"])] = r
    lookup = {(item["sourceId"], item["entityKey"]): item for item in entities}
    source_records, bindings, documents = {}, {}, {}
    references = list(row["sourceRefs"])
    for original in selected.values():
        references.extend(original.get("sourceRefs", []))
    for reference in references:
        actual = lookup.get((reference["sourceId"], reference["entityKey"]))
        status = "CURRENT" if actual and actual["sha256"] == reference["sha256"] else (
            "CHANGED" if actual else "OUTSIDE_SELECTION")
        bindings[digest(reference)] = {"reference": copy.deepcopy(reference), "status": status}
        if status == "CURRENT":
            source_records[digest(reference)] = copy.deepcopy(actual)
    for (target, _, _, _), original in selected.items():
        if target == "documents" and original.get("object"):
            descriptor = original["object"]
            value = {"sha256": descriptor["sha256"], "bytes": descriptor["bytes"]}
            require(descriptor["sha256"] not in documents or documents[descriptor["sha256"]] == value,
                    "The original evidence descriptor differs")
            if object_info:
                require(object_info(descriptor["sha256"]) == value, "The original governance evidence bytes changed",
                        "GOVERNANCE_DOCUMENT_CHANGED", 409)
            documents[descriptor["sha256"]] = value
    return {"schema": "stellar-forge.governance-publication.v1", "basis": basis,
            "record": {"collection": name, "id": row["id"], "revision": row["revision"],
                       "contentSha256": row["sha256"]},
            "governanceRecords": sorted(dependencies, key=lambda v: (v["collection"], v["record"]["id"])),
            "programmeRecords": [{"collection": key[0], "record": copy.deepcopy(value)}
                                 for key, value in sorted(selected.items())],
            "sourceRecords": [source_records[key] for key in sorted(source_records)],
            "sourceBindings": [bindings[key] for key in sorted(bindings)],
            "documents": [documents[key] for key in sorted(documents)],
            "meaning": "Supplied governance and evaluator assertions with frozen original positions; no inferred quorum, authority, scoring, clearance or financial posting."}


def apply_governance(previous, incoming, *, context, programme, entities, financial, object_info=None):
    shape(incoming, ("schema", "expectedGovernanceRevision", "actor", "changes", "archive"),
          ("schema", "expectedGovernanceRevision", "actor"))
    require(incoming["schema"] == GOVERNANCE_SCHEMA and programme is not None,
            "Select governance on an original programme")
    expected = previous["revision"] if previous else 0
    require(type(incoming["expectedGovernanceRevision"]) is int and incoming["expectedGovernanceRevision"] == expected,
            "The governance revision changed", "GOVERNANCE_REVISION_CONFLICT", 409)
    actor = short(incoming["actor"], "Governance recording actor", 240)
    changes, archives = incoming.get("changes", []), incoming.get("archive", [])
    require(isinstance(changes, list) and isinstance(archives, list) and
            0 < len(changes) + len(archives) <= 2000, "Supply the complete governance change batch")
    model = {"schema": GOVERNANCE_SCHEMA, "revision": expected + 1,
             "records": copy.deepcopy(previous["records"]) if previous else {name: [] for name in COLLECTIONS}}
    idx, pidx, touched, changed, freezing = indexes(model), programme_indexes(programme), set(), [], []
    lookup = {(row["sourceId"], row["entityKey"]): row for row in entities}
    for change in changes:
        shape(change, ("collection", "id", "expectedRevision", "fields"),
              ("collection", "id", "expectedRevision", "fields"))
        name, ident = change["collection"], identifier(change["id"])
        require(name in COLLECTIONS and (name, ident) not in touched, "Select each governance record once")
        touched.add((name, ident))
        before = idx[name].get(ident)
        require(type(change["expectedRevision"]) is int and change["expectedRevision"] == (before["revision"] if before else 0),
                "The governance record changed", "GOVERNANCE_RECORD_CONFLICT", 409)
        require(before is None or not before["archived"] and not before.get("publication"),
                "A recorded edition is immutable; add a new following edition", "GOVERNANCE_RECORDED_CHANGED", 409)
        specs = {**COMMON, **FIELDS[name]}
        shape(change["fields"], specs)
        require(change["fields"], "A governance edit needs explicit fields")
        fields = {key: copy.deepcopy(before[key]) for key in specs} if before else defaults(specs)
        if name == "committees":
            fields.setdefault("members", [])
        fields.update({key: normalize(value, specs[key], key) for key, value in change["fields"].items()})
        require(set(("nodeId", "title", "owner", "status", *REQUIRED[name])) <= fields.keys(),
                "Complete the required " + name + " fields")
        if "sourceRefs" in change["fields"] or before is None:
            for reference in fields["sourceRefs"]:
                checked_ref(reference, lookup)
        row = {**fields, "id": ident, "revision": (before["revision"] if before else 0) + 1,
               "createdAt": before["createdAt"] if before else context["at"], "updatedAt": context["at"],
               "createdBy": before["createdBy"] if before else actor, "updatedBy": actor,
               "archived": False, "archiveReason": ""}
        row["sha256"] = digest(row)
        idx[name][ident] = row
        changed.append((name, ident))
        if row["status"] == "recorded":
            freezing.append((name, ident))
    for change in archives:
        shape(change, ("collection", "id", "expectedRevision", "reason"),
              ("collection", "id", "expectedRevision", "reason"))
        name, ident = change["collection"], identifier(change["id"])
        require(name in COLLECTIONS and (name, ident) not in touched, "Select each governance record once")
        touched.add((name, ident))
        before = _row(idx, name, ident)
        require(before["status"] == "draft" and not before.get("publication"), "Only an unpublished draft can be archived")
        require(type(change["expectedRevision"]) is int and change["expectedRevision"] == before["revision"],
                "The governance record changed", "GOVERNANCE_RECORD_CONFLICT", 409)
        row = {**before, "revision": before["revision"] + 1, "updatedAt": context["at"], "updatedBy": actor,
               "archived": True, "archiveReason": short(change["reason"], "Archive reason", 8000)}
        row.pop("sha256", None)
        row["sha256"] = digest(row)
        idx[name][ident] = row
    for name, ident in changed:
        _validate(idx, pidx, name, idx[name][ident])
    # A complete atomic chain may be unordered in the batch, but must have one
    # finite original predecessor path and recorded parents before publication.
    pending = list(freezing)
    while pending:
        advanced = False
        for name, ident in list(pending):
            row = idx[name][ident]
            if any(not idx[target].get(key, {}).get("publication") for target, key in links(name, row)):
                continue
            _validate(idx, pidx, name, row, freezing=True)
            row["publication"] = _publish(idx, programme, pidx, name, row,
                entities=entities, financial=financial, context=context, object_info=object_info)
            row.pop("sha256", None)
            row["sha256"] = digest(row)
            pending.remove((name, ident))
            advanced = True
        require(advanced, "Record the complete original dependency editions without a cycle",
                "GOVERNANCE_DEPENDENCY_EDITION", 409)
    for name in COLLECTIONS:
        successors = {}
        for row in idx[name].values():
            if row.get("publication") and row.get("supersedesId"):
                require(row["supersedesId"] not in successors,
                        "A recorded edition already has a following edition; select the current end of that chain",
                        "GOVERNANCE_SUCCESSOR_CONFLICT", 409)
                successors[row["supersedesId"]] = row["id"]
    model["records"] = {name: sorted(values.values(), key=lambda row: row["id"]) for name, values in idx.items()}
    require(sum(map(len, model["records"].values())) <= 50000, "The complete governance definition exceeds 50,000 records")
    require(len(canonical(model)) <= 32 * 1024 * 1024, "The complete governance definition exceeds 32 MiB")
    return model


def current_records(model, name):
    rows = model["records"][name]
    replaced = {row["supersedesId"] for row in rows if row.get("publication") and row.get("supersedesId")}
    return [row for row in rows if not row["archived"] and row["id"] not in replaced]


def follow_through(model, programme):
    idx, pidx, output = indexes(model), programme_indexes(programme), []
    for name in ("decisions", "findings", "responses"):
        for row in current_records(model, name):
            followups = [r for r in current_records(model, "followups") if
                (name == "decisions" and r["decisionId"] == row["id"]) or
                (name == "responses" and r["responseId"] == row["id"])]
            responses = [r for r in current_records(model, "responses") if
                         name == "findings" and r["findingId"] == row["id"]]
            links_out = []
            for field, target in (("issueIds", "issues"), ("milestoneIds", "milestones")):
                for ident in row.get(field, []):
                    actual = pidx[target].get(ident)
                    links_out.append({"collection": target, "id": ident,
                        "current": copy.deepcopy(actual),
                        "frozen": [entry["record"] for entry in row.get("publication", {}).get("programmeRecords", [])
                                   if entry["collection"] == target and entry["record"]["id"] == ident]})
            output.append({"id": name + ":" + row["id"], "collection": name, "reference": ref(name, row),
                "nodeId": row["nodeId"], "grantId": row.get("grantId"), "title": row["title"],
                "owner": row.get("responsible") or row.get("recommendationOwner") or row["owner"],
                "dueDate": row.get("dueDate"), "recorded": bool(row.get("publication")),
                "responses": [ref("responses", r) for r in responses],
                "followups": [{"reference": ref("followups", r), "outcome": r["outcome"],
                              "recorded": bool(r.get("publication")), "reviewDate": r["reviewDate"]} for r in followups],
                "programmeActions": links_out,
                "state": "DRAFT" if not row.get("publication") else
                         "RESPONSE_REQUIRED" if name == "findings" and not any(r.get("publication") for r in responses) else
                         "REVIEW_REQUIRED" if name != "findings" and not any(r.get("publication") for r in followups) else
                         "REVIEW_RECORDED"})
    return sorted(output, key=lambda row: row["id"])


def governance_position(model, programme, node_id, grant_id=None):
    pidx = programme_indexes(programme)
    require(node_id in pidx["nodes"], "Select an original programme node")
    nodes = descendants(pidx, node_id)
    grants = set(pidx["grants"])
    if grant_id is not None:
        require(grant_id in pidx["grants"] and pidx["grants"][grant_id]["projectId"] == node_id,
                "Select the original grant in this project")
        grants = {ident for ident in grants if grant_id in ancestors(pidx["grants"], ident, "parentGrantId")}
    selected = lambda row: row["nodeId"] in nodes and (grant_id is None or row.get("grantId") in grants)
    return {"nodeId": node_id, "grantId": grant_id,
            "registers": {name: [copy.deepcopy(row) for row in model["records"][name] if selected(row)] for name in COLLECTIONS},
            "followThrough": [row for row in follow_through(model, programme) if selected(row)],
            "meaning": "Original recorded decisions and responses; current action progress is shown separately from frozen review evidence."}


def derive_governance(model, programme):
    require(model["schema"] == GOVERNANCE_SCHEMA, "The retained governance schema differs")
    return {**{"governance_" + name: copy.deepcopy(model["records"][name]) for name in COLLECTIONS},
            "governance_follow_through": follow_through(model, programme)}


def governance_objects(history):
    selected = {}
    for portfolio in history:
        model = portfolio["definition"].get("governance")
        if not model:
            continue
        for rows in model["records"].values():
            for row in rows:
                for descriptor in row.get("publication", {}).get("documents", []):
                    require(descriptor["sha256"] not in selected or selected[descriptor["sha256"]] == descriptor,
                            "A retained governance document has inconsistent lengths")
                    selected[descriptor["sha256"]] = descriptor
    return selected


def governance_schema():
    return {"schema": GOVERNANCE_SCHEMA, "collections": list(COLLECTIONS), "tables": list(GOVERNANCE_TABLES),
            "fields": {name: {**COMMON, **specs} for name, specs in FIELDS.items()},
            "required": {name: ["nodeId", "title", "owner", "status", *fields] for name, fields in REQUIRED.items()},
            "nested": {"members": {"name": "short", "role": "short", "organization": "text", "notes": "text"}},
            "edits": "Original portfolio.save payload.governance and optional same-transaction programme changes.",
            "recording": "A recorded edition is immutable. Use a following record with supersedesId; archive only a draft.",
            "authority": "Actors and named reviewers are supplied attribution, not a replacement for native staff identity or approval.",
            "position": "Original programme positions retain independent currencies, dimensions, dates and source meanings."}
