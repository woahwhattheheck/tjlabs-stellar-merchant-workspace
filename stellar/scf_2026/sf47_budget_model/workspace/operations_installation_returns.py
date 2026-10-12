"""Return a complete customer Installation through the original Operations case.

The receiver freezes observations against one saved edition. The owner stages
explicit selections as evidence, then uses Installation preview/save unchanged.
The original workspace transaction, request journal and complete ZIP own custody.
"""
from __future__ import annotations

import base64
from copy import deepcopy
from html import escape
import hashlib
import json
import re
import uuid

from model import Problem, canonical, digest, now, text
import operations_domain as domain
import operations_installations as installations
import operations_installation_effort as installation_effort

SCHEMA = "stellar-forge.sf47-installation-return.v1"
PURPOSE = "INSTALLATION_RETURN"
STAGE_PURPOSE = "INSTALLATION_RETURN_REVIEW"
MAX_REVIEW = 8 * 1024 * 1024
MAX_REVIEWS = 200
OBSERVATION_KEYS = ("state", "operator", "observedAt", "note", "sourceIds",
                    "workIds", "purchaseIds", "outcomeIds")
DEFINITION_KEYS = ("id", "title", "criterion", "tranche", "required")
SOURCE_KEYS = ("id", "filename", "mediaType", "kind", "sourceUrl", "observedAt",
               "bytes", "sha256", "createdAt")


def fail(message, code="INVALID_INSTALLATION_RETURN", status=422):
    raise Problem(message, status, code)


def obj(value, fields, label):
    if not isinstance(value, dict) or set(value) - set(fields):
        fail("Use the complete declared " + label + " fields.")
    return value


def equal(left, right):
    # JSON equality must distinguish true from 1 in every nested value.
    return canonical(left) == canonical(right)


def ref(row):
    return {key: row[key] for key in ("id", "revision", "sha256")}


def review_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"review-[a-f0-9]{32}", value):
        fail("Select the original receiving review identity.")
    return value


def case_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"operation-[a-f0-9]{32}", value):
        fail("Select the original operating case identity.")
    return value


def bounded(value):
    if len(canonical(value).encode("utf-8")) > MAX_REVIEW:
        fail("This complete receiving review exceeds the original 8 MiB source bound. "
             "Keep the full returned case and review a supported installation scope.",
             "INSTALLATION_RETURN_SIZE", 413)
    return value


def context_view(context):
    return {"program": {key: deepcopy(context["program"][key])
                        for key in ("id", "name", "mode", "calendarStart", "version")},
            "plan": deepcopy(context["plan"]), "records": deepcopy(context["records"]),
            "sources": deepcopy(context["sources"])}


def review_context(row):
    snapshot = row["snapshot"]
    return {"program": {**deepcopy(snapshot["program"]), "version": row["version"] - 1},
            "plan": deepcopy(snapshot["plan"]), "records": deepcopy(snapshot["records"]),
            "sources": {item["id"]: deepcopy(item) for item in snapshot["sources"]}}


def checked_installation(row):
    if not isinstance(row, dict) or digest({key: value for key, value in row.items()
                                           if key != "sha256"}) != row.get("sha256"):
        fail("The original Installation edition changed.", "INSTALLATION_RETURN_CHANGED", 409)
    installations.identity(row.get("id"))
    installations.revision(row.get("revision"))
    value = row.get("preview", {})
    if value.get("schema") != installations.SCHEMA or digest({key: item for key, item in value.items()
            if key != "previewSha256"}) != value.get("previewSha256"):
        fail("The original Installation preview is incomplete.")
    snapshot, document = value["snapshot"], value["document"]
    if (not equal(installations.normalized(snapshot, document), document)
            or not equal(installations.capture(snapshot, document), snapshot)
            or not equal(installations.report(snapshot, document), value["report"])
            or value["source"] != installations._source(snapshot)
            or row["revision"] != value["expectedRevision"] + 1):
        fail("The original Installation no longer reconstructs from its complete snapshot.")
    return row


def selected_baseline(ops, context, selection):
    obj(selection, ("installationId", "revision", "sha256"), "saved Installation selection")
    row = installations.get(ops, context["program"]["id"], selection.get("installationId"),
                            selection.get("revision"))
    if row["sha256"] != domain.sha(selection.get("sha256"), "Selected Installation", False):
        fail("The selected saved Installation has changed.", "INSTALLATION_RETURN_BASELINE", 409)
    return checked_installation(row)


def acceptance_basis(context, document):
    # Observation links and named results do not redefine the work being checked.
    selected = deepcopy(document)
    # Internal delivery effort and its source attachments do not redefine the
    # customer's acceptance criteria. The complete returned document retains it.
    selected.pop("effort", None)
    selected["checks"] = [{**{key: item[key] for key in DEFINITION_KEYS},
        "state": "OPEN", "operator": "", "observedAt": None, "note": "",
        "sourceIds": [], "workIds": [], "purchaseIds": [], "outcomeIds": []}
        for item in document["checks"]]
    snapshot = installations.capture(context, installations.normalized(context, selected))
    fields = ("merchantDeploymentId", "buyerDeploymentIds", "workorder", "task", "source",
              "payment", "receiving", "workshare", "workflowPeriods", "coordination")
    return {"definition": {key: deepcopy(document[key]) for key in fields if key in document},
            "plan": {key: snapshot["plan"][key] for key in ("revision", "contentSha256", "source")},
            "deployments": snapshot["records"]["deployments"], "sources": snapshot["sources"]}


def normalized_return(context, baseline, supplied):
    obj(supplied, ("installationId", "revision", "sha256", "name", "recipient",
                   "environment", "note", "observations"), "receiving return")
    if (supplied.get("installationId"), supplied.get("revision"), supplied.get("sha256")) != \
            (baseline["id"], baseline["revision"], baseline["sha256"]):
        fail("Keep the complete original saved edition selection.")
    originals = baseline["preview"]["document"]["checks"]
    observations = supplied.get("observations")
    if not isinstance(observations, list) or len(observations) != len(originals):
        fail("Record every original check, including unfinished or inapplicable work.")
    by_id = {}
    for value in observations:
        obj(value, ("id", *OBSERVATION_KEYS), "original check observation")
        ident = value.get("id")
        if ident in by_id or not any(item["id"] == ident for item in originals):
            fail("Keep each original check identity exactly once.")
        by_id[ident] = value
    document = deepcopy(baseline["preview"]["document"])
    document["checks"] = [{**{key: item[key] for key in DEFINITION_KEYS},
                            **{key: by_id[item["id"]].get(key) for key in OBSERVATION_KEYS}}
                           for item in originals]
    document = installations.normalized(context, document)
    return {"installationId": baseline["id"], "revision": baseline["revision"], "sha256": baseline["sha256"],
            "name": text(supplied.get("name"), "Receiving return name", 300, True),
            "recipient": text(supplied.get("recipient"), "Intended receiving owner", 500, True),
            "environment": text(supplied.get("environment"), "Actual application, host and configuration", 8000, True),
            "note": text(supplied.get("note"), "Whole receiving outcome and limitations", 12000, True),
            "observations": [{key: item[key] for key in ("id", *OBSERVATION_KEYS)} for item in document["checks"]]}, document


def seed(ops, context, body):
    obj(body, ("expectedVersion", "installationId", "revision", "sha256"), "return seed")
    installations._current(context, body.get("expectedVersion"))
    baseline = selected_baseline(ops, context, {key: body.get(key) for key in ("installationId", "revision", "sha256")})
    return {"schema": SCHEMA + ".seed", "source": installations._source(context), "baseline": ref(baseline),
            "inputs": {"installationId": baseline["id"], "revision": baseline["revision"], "sha256": baseline["sha256"],
                "name": baseline["preview"]["document"]["name"] + " — receiving return",
                "recipient": "", "environment": "", "note": "",
                "observations": [{"id": check["id"], "state": "OPEN", "operator": "", "observedAt": None,
                                 "note": "", "sourceIds": [], "workIds": [], "purchaseIds": [], "outcomeIds": []}
                                for check in baseline["preview"]["document"]["checks"]]},
            "checks": [{key: item[key] for key in DEFINITION_KEYS} for item in baseline["preview"]["document"]["checks"]]}


def evaluate_return(context, baseline, supplied):
    context, baseline = context_view(context), checked_installation(deepcopy(baseline))
    inputs, document = normalized_return(context, baseline, supplied)
    # Receiving changes the observations of this exact saved edition. Carry its
    # original effort source and peer allocation snapshot for deterministic
    # replay. The owner's eventual native Installation save captures current
    # Work and current peer heads after the explicit receiving choices.
    frozen_effort = baseline["preview"]["snapshot"].get(installation_effort.SNAPSHOT_KEY)
    selected = installations.capture(context, document, frozen_effort)
    original_basis = acceptance_basis(baseline["preview"]["snapshot"], baseline["preview"]["document"])
    receiving_basis = acceptance_basis(context, document)
    changes = installations.differences(original_basis, receiving_basis)
    report = installations.report(selected, document)
    result = {"schema": SCHEMA, "source": installations._source(context), "inputs": inputs,
              "baseline": baseline, "document": document, "snapshot": selected, "report": report,
              "receivingBasisChanges": changes, "basisUnchanged": not changes}
    result["previewSha256"] = digest(result)
    return bounded(result)


def preview(ops, context, body):
    obj(body, ("expectedVersion", "inputs"), "return preview")
    installations._current(context, body.get("expectedVersion"))
    supplied = body.get("inputs")
    if not isinstance(supplied, dict):
        fail("Use the complete receiving input.")
    baseline = selected_baseline(ops, context, {key: supplied.get(key) for key in ("installationId", "revision", "sha256")})
    return evaluate_return(context, baseline, supplied)


def row_summary(row):
    value = row["installationReturn"] if row["purpose"] == PURPOSE else row["installationReturnReview"]
    selection = value["baseline"] if row["purpose"] == PURPOSE else value["currentInstallation"]
    return {"id": row["id"], "version": row["version"], "purpose": row["purpose"],
            "businessSha256": row["businessSha256"], "sha256": row["sha256"],
            "previewSha256": value["previewSha256"],
            "installationId": selection["id"], "revision": selection["revision"],
            "name": value["inputs"]["name"], "createdAt": row["createdAt"], "actor": row["actor"]}


def save_row(ops, context, purpose, candidate, actor, version, note):
    count = ops.db.execute("SELECT COUNT(*) FROM ops_reviews WHERE program_id=?", (context["program"]["id"],)).fetchone()[0]
    if count >= MAX_REVIEWS:
        fail("The original case has reached its 200 retained review capacity.", status=413)
    snapshot = ops._business(context)
    field = "installationReturn" if purpose == PURPOSE else "installationReturnReview"
    row = {"id": "review-" + uuid.uuid4().hex, "version": version, "createdAt": now(), "actor": actor,
           "note": text(note, "Named receiving review note", 12000, True),
           "businessSha256": digest(snapshot), "snapshot": snapshot, "report": domain.report(**context),
           "purpose": purpose, field: candidate}
    row["sha256"] = digest(row)
    bounded(row)
    ops.db.execute("INSERT INTO ops_reviews VALUES(?,?,?)", (context["program"]["id"], row["id"], canonical(row)))
    return row


def record(ops, context, data, actor, version, note):
    obj(data, ("inputs", "expectedPreviewSha256"), "receiving return save")
    candidate = preview(ops, context, {"expectedVersion": context["program"]["version"], "inputs": data.get("inputs")})
    if candidate["previewSha256"] != domain.sha(data.get("expectedPreviewSha256"), "Reviewed return", False):
        fail("The receiving input or source case changed. Review the same saved draft.", "INSTALLATION_RETURN_PREVIEW", 409)
    row = save_row(ops, context, PURPOSE, candidate, actor, version, note)
    return {"before": None, "after": row_summary(row), "kind": "review", "recordId": row["id"],
            "reviewSha256": row["sha256"], "previewSha256": candidate["previewSha256"], "unchanged": False}


def validate_row_identity(row, purpose):
    if not isinstance(row, dict) or row.get("purpose") != purpose:
        fail("Select the original receiving review.", "INSTALLATION_RETURN_NOT_FOUND", 404)
    review_id(row.get("id"))
    domain.integer(row.get("version"), "Receiving review version", 2, 10000000)
    domain.timestamp(row.get("createdAt"), "Receiving review creation")
    text(row.get("actor"), "Named receiving operator", 300, True)
    text(row.get("note"), "Receiving review note", 12000, True)
    if digest({key: value for key, value in row.items() if key != "sha256"}) != row.get("sha256") or \
            digest(row.get("snapshot")) != row.get("businessSha256"):
        fail("The complete original receiving review changed.", "INSTALLATION_RETURN_CHANGED", 409)
    bounded(row)


def validate_return(row):
    validate_row_identity(row, PURPOSE)
    value = row.get("installationReturn", {})
    context = review_context(row)
    actual = evaluate_return(context, value.get("baseline"), value.get("inputs"))
    if not equal(actual, value) or not equal(domain.report(**context), row["report"]):
        fail("The receiving return differs from its original inputs, criterion or retained records.")
    if value["baseline"]["version"] >= row["version"]:
        fail("Receiving must follow its selected saved Installation.")
    return row


def validate_sources(context, files):
    for ident, metadata in context["sources"].items():
        if metadata.get("id") != ident:
            fail("A receiving source identity changed.")
        raw = files.get("sources/" + ident)
        if not isinstance(raw, bytes) or len(raw) != metadata["bytes"] or hashlib.sha256(raw).hexdigest() != metadata["sha256"]:
            fail("Retain every complete receiving source with its original hash.")


def validate_return_in_case(row, context, events, saved_installations, files):
    validate_return(row)
    value = row["installationReturn"]
    baseline = value["baseline"]
    if not any(equal(item, baseline) for item in saved_installations):
        fail("The returned case lost its selected original Installation edition.")
    states = installations._record_matches(events, context["records"])
    for kind, values in value["snapshot"]["records"].items():
        for item in values:
            if item["version"] >= row["version"] or digest(item) not in states.get((item["id"], item["version"]), set()):
                fail("The receiving observation lost its original record history.")
    for ident, metadata in value["snapshot"]["sources"].items():
        if not equal(context["sources"].get(ident), metadata):
            fail("The receiving observation lost an original source identity.")
    event = events[row["version"] - 1]
    if (event.get("action") != "installation.return" or event.get("recordId") != row["id"]
            or not equal(event.get("after"), row_summary(row))
            or event.get("actor") != row["actor"] or event.get("note") != row["note"]):
        fail("The receiving return lost its exact original save event.")
    validate_sources({"sources": value["snapshot"]["sources"]}, files)


def proof_for(ops, program_id, selected_review):
    context = context_view(ops._context(case_id(program_id)))
    row = ops.review(program_id, review_id(selected_review))
    validate_return(row)
    events = [json.loads(value[0]) for value in ops.db.execute(
        "SELECT body_json FROM ops_events WHERE program_id=? ORDER BY version", (program_id,))]
    proof = {"schema": SCHEMA + ".original-case-evidence", "context": context,
             "installations": installations.load(ops, program_id), "events": events, "review": row}
    return bounded(proof)


def validate_proof(proof, files):
    obj(proof, ("schema", "context", "installations", "events", "review"), "complete original receiving evidence")
    if proof.get("schema") != SCHEMA + ".original-case-evidence":
        fail("Use the original returned case evidence.")
    context, events = proof["context"], proof["events"]
    if not equal(context_view(context), context) or set(context["records"]) != set(domain.KINDS):
        fail("The full receiving case selection is incomplete.")
    if not isinstance(events, list) or len(events) != context["program"]["version"]:
        fail("The complete original receiving history is required.")
    for number, event in enumerate(events, 1):
        if event.get("version") != number or digest({key: value for key, value in event.items() if key != "sha256"}) != event.get("sha256"):
            fail("An original receiving history event changed.")
    plan = context["plan"]
    if digest({"scenario": plan["scenario"], "planning": plan["planning"]}) != plan["contentSha256"]:
        fail("The selected original receiving plan changed.")
    for kind, values in context["records"].items():
        seen = set()
        if not isinstance(values, list):
            fail("The original receiving record collection is incomplete.")
        for record in values:
            if record.get("id") in seen:
                fail("The receiving case repeats an original record.")
            seen.add(record.get("id"))
            domain.integer(record.get("version"), "Receiving record version", 1, context["program"]["version"])
            prepared = domain.prepare(kind, record, {**context, "restoring": True}, record)
            if any(key != "state" and not equal(record.get(key), item) for key, item in prepared.items()):
                fail("An original receiving record differs from its normalized source.")
    validate_sources(context, files)
    installations.validate_import(context, proof["installations"], events, context["program"]["version"], files)
    validate_return_in_case(proof["review"], context, events, proof["installations"], files)
    return proof


def normalized_review(supplied, returned, current):
    obj(supplied, ("returnedCaseId", "reviewId", "reviewSha256", "installationId",
                   "expectedRevision", "name", "note", "choices"), "owner receiving review")
    case_id(supplied.get("returnedCaseId"))
    review_id(supplied.get("reviewId"))
    if supplied.get("reviewId") != returned["id"] or supplied.get("reviewSha256") != returned["sha256"]:
        fail("Keep the exact returned receiving review selection.", "INSTALLATION_RETURN_SELECTION", 409)
    if supplied.get("installationId") != current["id"] or supplied.get("expectedRevision") != current["revision"]:
        fail("The owner's Installation changed. Review its current edition.", "INSTALLATION_RETURN_CURRENT", 409)
    original = returned["installationReturn"]["document"]["checks"]
    wanted = {item["id"] for item in original}
    values, seen = supplied.get("choices"), set()
    if not isinstance(values, list) or len(values) != len(wanted):
        fail("Explicitly keep or apply every returned observation.")
    choices = {}
    for value in values:
        obj(value, ("id", "action", "note"), "owner check decision")
        if value.get("id") not in wanted or value["id"] in seen:
            fail("Keep each original returned check decision once.")
        seen.add(value["id"])
        choices[value["id"]] = {"id": value["id"],
            "action": domain.enum(value.get("action"), ("KEEP", "APPLY"), "Owner receiving choice"),
            "note": text(value.get("note"), "Owner decision reason", 8000, True)}
    return {"returnedCaseId": supplied["returnedCaseId"], "reviewId": returned["id"],
            "reviewSha256": returned["sha256"], "installationId": current["id"], "expectedRevision": current["revision"],
            "name": text(supplied.get("name"), "Owner review name", 300, True),
            "note": text(supplied.get("note"), "Owner receiving review scope", 12000, True),
            "choices": [choices[item["id"]] for item in original]}


def evaluate_review(context, current, proof, supplied):
    context, current = context_view(context), checked_installation(deepcopy(current))
    returned = validate_return(proof["review"])
    baseline = returned["installationReturn"]["baseline"]
    if current["id"] != baseline["id"]:
        fail("Return this report to its original Installation identity.", "INSTALLATION_RETURN_BASELINE", 409)
    inputs = normalized_review(supplied, returned, current)
    if inputs["returnedCaseId"] != proof["context"]["program"]["id"]:
        fail("Keep the selected imported receiving case.")
    value = returned["installationReturn"]
    original_basis = acceptance_basis(baseline["preview"]["snapshot"], baseline["preview"]["document"])
    current_basis = acceptance_basis(context, current["preview"]["document"])
    basis_changes = installations.differences(original_basis, current_basis)
    current_checks = {item["id"]: item for item in current["preview"]["document"]["checks"]}
    choices = {item["id"]: item for item in inputs["choices"]}
    owner_records = {kind: {item["id"]: item for item in rows} for kind, rows in context["records"].items()}
    returned_records = {kind: {item["id"]: item for item in rows} for kind, rows in value["snapshot"]["records"].items()}
    comparisons = []
    for observation in value["document"]["checks"]:
        ident, present = observation["id"], current_checks.get(observation["id"])
        definition_changes = installations.differences(
            {key: observation[key] for key in DEFINITION_KEYS},
            {key: present[key] for key in DEFINITION_KEYS} if present else None)
        eligible = not basis_changes and not value["receivingBasisChanges"] and not definition_changes
        links = {}
        for field, kind in (("workIds", "work"), ("purchaseIds", "purchases"), ("outcomeIds", "outcomes")):
            matched, evidence = [], []
            for key in observation[field]:
                (matched if equal(owner_records[kind].get(key), returned_records[kind][key]) else evidence).append(key)
            links[field] = {"sameOwnerRecordIds": matched, "retainedAsEvidenceIds": evidence}
        selected = choices[ident]
        if selected["action"] == "APPLY" and not eligible:
            fail("This criterion or its source/configuration changed. Keep the original result and obtain fresh receiving: " + ident,
                 "INSTALLATION_RETURN_FRESH_REVIEW", 409)
        comparisons.append({"id": ident, "title": observation["title"], "eligible": eligible,
            "definitionChanges": definition_changes, "ownerObservation": deepcopy(present),
            "returnedObservation": deepcopy(observation), "decision": selected, "recordLinks": links})
    result = {"schema": SCHEMA + ".owner-preview", "source": installations._source(context), "inputs": inputs,
              "baseline": deepcopy(baseline), "currentInstallation": current, "returnedProof": deepcopy(proof),
              "basisChanges": basis_changes, "receivingBasisChanges": deepcopy(value["receivingBasisChanges"]),
              "checks": comparisons, "newOwnerChecks": [deepcopy(item) for item in current_checks.values()
                  if item["id"] not in {row["id"] for row in value["document"]["checks"]}],
              "sources": [deepcopy(item) for _, item in sorted(proof["context"]["sources"].items())],
              "appliedChecks": sum(item["decision"]["action"] == "APPLY" for item in comparisons)}
    result["previewSha256"] = digest(result)
    return bounded(result)


def review_preview(ops, context, body):
    obj(body, ("expectedVersion", "inputs"), "owner return preview")
    installations._current(context, body.get("expectedVersion"))
    supplied = body.get("inputs")
    if not isinstance(supplied, dict):
        fail("Use the complete owner receiving choices.")
    current = installations.get(ops, context["program"]["id"], supplied.get("installationId"))
    proof = proof_for(ops, supplied.get("returnedCaseId"), supplied.get("reviewId"))
    baseline = proof["review"]["installationReturn"]["baseline"]
    retained = installations.get(ops, context["program"]["id"], baseline["id"], baseline["revision"])
    if not equal(retained, baseline):
        fail("The receiving baseline is not the owner's retained original edition.", "INSTALLATION_RETURN_BASELINE", 409)
    files = {"sources/" + ident: ops.source(proof["context"]["program"]["id"], ident)[1]
             for ident in proof["context"]["sources"]}
    validate_proof(proof, files)
    return evaluate_review(context, current, proof, supplied)


def stage_document(candidate, mappings, receipt_id):
    document = deepcopy(candidate["currentInstallation"]["preview"]["document"])
    checks = {item["id"]: item for item in document["checks"]}
    mapped = {item["original"]["id"]: item["retained"]["id"] for item in mappings}
    for row in candidate["checks"]:
        if row["decision"]["action"] != "APPLY":
            continue
        observation = row["returnedObservation"]
        target = checks[row["id"]]
        for key in ("state", "operator", "observedAt", "note"):
            target[key] = observation[key]
        target["sourceIds"] = list(dict.fromkeys([mapped[key] for key in observation["sourceIds"]] + [receipt_id]))
        for key in ("workIds", "purchaseIds", "outcomeIds"):
            target[key] = deepcopy(row["recordLinks"][key]["sameOwnerRecordIds"])
    return document


def receipt_body(candidate, mappings):
    return {"schema": SCHEMA + ".owner-evidence", "previewSha256": candidate["previewSha256"],
            "source": candidate["source"], "inputs": candidate["inputs"], "returnedProof": candidate["returnedProof"],
            "checks": candidate["checks"], "sourceMappings": mappings}


def stage(ops, context, data, actor, version, note):
    obj(data, ("inputs", "expectedPreviewSha256"), "owner receiving stage")
    candidate = review_preview(ops, context, {"expectedVersion": context["program"]["version"], "inputs": data.get("inputs")})
    if candidate["previewSha256"] != domain.sha(data.get("expectedPreviewSha256"), "Reviewed return selection", False):
        fail("The owner or returned case changed. Preview the original selection again.", "INSTALLATION_RETURN_PREVIEW", 409)
    sources = context["sources"]
    mappings, added = [], []
    for metadata in candidate["sources"]:
        original_meta, raw = ops.source(candidate["inputs"]["returnedCaseId"], metadata["id"])
        if not equal(original_meta, metadata):
            fail("The selected original receiving file changed.", "INSTALLATION_RETURN_SOURCE", 409)
        existing = sources.get(metadata["id"])
        if existing is not None and equal(existing, metadata):
            owner_metadata, owner_raw = ops.source(context["program"]["id"], metadata["id"])
            if owner_raw != raw:
                fail("The original shared source identity has different bytes.")
            retained = owner_metadata
        else:
            # Equivalent bytes do not erase differing source URLs, times or provenance.
            retained = ops._source_add(context["program"]["id"], {
                **{key: metadata[key] for key in ("filename", "mediaType", "kind", "sourceUrl", "observedAt")},
                "contentBase64": base64.b64encode(raw).decode("ascii")})
            added.append(retained)
        mappings.append({"original": deepcopy(metadata), "retained": deepcopy(retained), "copied": retained["id"] != metadata["id"]})
    raw = (canonical(bounded(receipt_body(candidate, mappings))) + "\n").encode("utf-8")
    receipt = ops._source_add(context["program"]["id"], {"filename": "installation-return-" + candidate["inputs"]["reviewId"] + ".json",
        "mediaType": "application/json", "kind": "other", "sourceUrl": "",
        "observedAt": candidate["returnedProof"]["review"]["createdAt"], "contentBase64": base64.b64encode(raw).decode("ascii")})
    added.append(receipt)
    document = installations.normalized(ops._context(context["program"]["id"]), stage_document(candidate, mappings, receipt["id"]))
    value = {**candidate, "schema": SCHEMA + ".owner-stage", "sourceMappings": mappings,
             "receipt": receipt, "document": document}
    row = save_row(ops, context, STAGE_PURPOSE, value, actor, version, note)
    return {"before": None, "after": row_summary(row), "kind": "review", "recordId": row["id"],
            "reviewSha256": row["sha256"], "previewSha256": candidate["previewSha256"],
            "installationId": candidate["currentInstallation"]["id"],
            "expectedRevision": candidate["currentInstallation"]["revision"],
            "document": document, "sourceChange": {"added": added}, "unchanged": False}


def validate_stage(row, context, events, saved_installations, files):
    validate_row_identity(row, STAGE_PURPOSE)
    value = row["installationReturnReview"]
    before = review_context(row)
    candidate = evaluate_review(before, value["currentInstallation"], value["returnedProof"], value["inputs"])
    expected_keys = set(candidate) | {"sourceMappings", "receipt", "document"}
    if set(value) != expected_keys or value.get("schema") != SCHEMA + ".owner-stage" or not equal(
            {**candidate, "schema": SCHEMA + ".owner-stage"}, {key: value[key] for key in candidate}):
        fail("The owner's staged return differs from its complete original preview.")
    if not equal(domain.report(**before), row["report"]):
        fail("The owner receiving business report changed.")
    available = {(item["id"], item["revision"], item["sha256"]): item for item in saved_installations}
    for item in (value["baseline"], value["currentInstallation"]):
        if not equal(available.get((item["id"], item["revision"], item["sha256"])), item) or item["version"] >= row["version"]:
            fail("The owner receiving review lost its exact earlier Installation.")
    mappings, originals = value["sourceMappings"], candidate["sources"]
    if not isinstance(mappings, list) or len(mappings) != len(originals):
        fail("The complete original receiving source mapping is required.")
    reconstructed, after_sources, added = {}, deepcopy(before["sources"]), []
    seen = set()
    for mapping, original in zip(mappings, originals):
        obj(mapping, ("original", "retained", "copied"), "receiving source mapping")
        retained = mapping["retained"]
        if not equal(mapping["original"], original) or retained["id"] in seen or not equal(context["sources"].get(retained["id"]), retained):
            fail("A complete receiving source mapping changed.")
        seen.add(retained["id"])
        if any(retained.get(key) != original.get(key) for key in ("filename", "mediaType", "kind", "sourceUrl", "observedAt", "bytes", "sha256")):
            fail("The owner must preserve each original file's complete meaning and bytes.")
        copied = retained["id"] != original["id"]
        if mapping.get("copied") is not copied:
            fail("The original source-copy observation changed.")
        if copied:
            if retained["id"] in before["sources"]:
                fail("A newly copied return source overwrites an earlier owner source.")
            added.append(retained)
        elif not equal(before["sources"].get(original["id"]), original):
            fail("The reused original source was not present before staging.")
        after_sources[retained["id"]] = retained
        raw = files.get("sources/" + retained["id"])
        if not isinstance(raw, bytes) or len(raw) != original["bytes"] or hashlib.sha256(raw).hexdigest() != original["sha256"]:
            fail("A returned original file is missing from the owner's full case.")
        reconstructed["sources/" + original["id"]] = raw
    validate_proof(candidate["returnedProof"], reconstructed)
    receipt = value["receipt"]
    if receipt["id"] in before["sources"] or receipt["id"] in seen or not equal(context["sources"].get(receipt["id"]), receipt):
        fail("The owner receiving receipt lost its distinct original identity.")
    raw = (canonical(receipt_body(candidate, mappings)) + "\n").encode("utf-8")
    if files.get("sources/" + receipt["id"]) != raw or receipt["bytes"] != len(raw) or receipt["sha256"] != hashlib.sha256(raw).hexdigest():
        fail("The full owner receiving receipt differs from the selected report and files.")
    after_sources[receipt["id"]] = receipt
    added.append(receipt)
    document = installations.normalized({**before, "sources": after_sources}, stage_document(candidate, mappings, receipt["id"]))
    if not equal(document, value["document"]):
        fail("The staged Installation document differs from the explicit owner choices.")
    states = installations._record_matches(events, context["records"])
    for rows in before["records"].values():
        for record in rows:
            if record["version"] >= row["version"] or digest(record) not in states.get((record["id"], record["version"]), set()):
                fail("The owner receiving selection lost its earlier original records.")
    event = events[row["version"] - 1]
    if (event.get("action") != "installation.return-stage" or event.get("recordId") != row["id"]
            or not equal(event.get("after"), row_summary(row)) or not equal(event.get("sourceChange"), {"added": added})
            or event.get("actor") != row["actor"] or event.get("note") != row["note"]):
        fail("The staged return does not match its original source and review event.")
    return row


def validate_import(context, reviews, events, saved_installations, files):
    wanted, found = {"installation.return": set(), "installation.return-stage": set()}, set()
    for row in reviews:
        if row.get("purpose") == PURPOSE:
            validate_return_in_case(row, context, events, saved_installations, files)
            wanted["installation.return"].add(row["id"])
        elif row.get("purpose") == STAGE_PURPOSE:
            validate_stage(row, context, events, saved_installations, files)
            wanted["installation.return-stage"].add(row["id"])
        else:
            continue
        if row["id"] in found:
            fail("The complete case repeats a receiving review.")
        found.add(row["id"])
    for action, ids in wanted.items():
        if {event.get("recordId") for event in events if event.get("action") == action} != ids:
            fail("The complete case lost an original Installation receiving review.")


def list_reviews(ops, context):
    result = []
    for raw in ops.db.execute("SELECT body_json FROM ops_reviews WHERE program_id=? ORDER BY rowid DESC",
                             (context["program"]["id"],)):
        row = json.loads(raw[0])
        if row.get("purpose") in (PURPOSE, STAGE_PURPOSE):
            result.append(row_summary(row))
    return {"schema": SCHEMA + ".reviews", "caseId": context["program"]["id"],
            "version": context["program"]["version"], "reviews": result}


def readable(row):
    receiving = row["purpose"] == PURPOSE
    value = row["installationReturn"] if receiving else row["installationReturnReview"]
    esc = lambda value: escape(str(value if value is not None else ""), quote=True)
    pretty = lambda value: esc(json.dumps(value, ensure_ascii=False, indent=2))
    checks = value["document"]["checks"] if receiving else value["checks"]
    body = "<h1>" + esc(value["inputs"]["name"]) + "</h1><p>Recorded by " + esc(row["actor"]) + " at " + esc(row["createdAt"]) + ".</p>"
    body += "<p>" + esc(row["note"]) + "</p><p>Original case purpose: <strong>" + esc(value["source"]["mode"]) + "</strong>.</p>"
    body += "<h2>Selected Installation</h2><pre>" + pretty(ref(value["baseline"])) + "</pre>"
    body += "<h2>" + ("Receiving observations" if receiving else "Explicit owner decisions") + "</h2>"
    for item in checks:
        body += "<section><h3>" + esc(item.get("title") or item["id"]) + "</h3><pre>" + pretty(item) + "</pre></section>"
    body += "<h2>Complete selected input</h2><pre>" + pretty(value["inputs"]) + "</pre>"
    body += "<h2>Source or configuration changes</h2><pre>" + pretty(value.get("basisChanges", value.get("receivingBasisChanges"))) + "</pre>"
    if not receiving:
        body += "<h2>Complete file mapping</h2><pre>" + pretty(value["sourceMappings"]) + "</pre>"
    body += "<h2>Receiving and reopening</h2><p>Import this entire Operations ZIP. It preserves the original planning history, "
    body += "Installation editions, work and purchase observations, named reviews and every original attached file. "
    body += "Choose Receiving returns in the original Operations application. An owner first reviews the imported return, "
    body += "then stages explicit choices and previews/saves a new Installation through the original controls. "
    body += "Changed criteria require fresh receiving. Named statements are recorded observations; they do not create "
    body += "an external acceptance, payment or new accounting record.</p>"
    body += "<p>Review " + esc(row["id"]) + " · SHA-256 " + esc(row["sha256"]) + "</p>"
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'
            '<title>' + esc(value["inputs"]["name"]) + '</title><style>'
            'body{max-width:1100px;margin:auto;padding:28px;color:#202020;background:white;font:15px/1.6 system-ui}'
            'h1{font-size:28px}h2{margin-top:32px;border-bottom:1px solid #bbb}section{border:1px solid #ccc;padding:16px;margin:12px 0}'
            'pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace,monospace}'
            '@media(max-width:640px){body{padding:16px}}</style><body>' + body + '</body></html>\n').encode("utf-8")


def selected_files(context, reviews, selected):
    ident = review_id(selected)
    row = next((item for item in reviews if item.get("id") == ident and item.get("purpose") in (PURPOSE, STAGE_PURPOSE)), None)
    if row is None:
        fail("Select the original Installation return.", "INSTALLATION_RETURN_NOT_FOUND", 404)
    raw = readable(row)
    marker = {"schema": SCHEMA + ".selection", "caseId": context["program"]["id"],
              "caseVersion": context["program"]["version"], "review": row_summary(row),
              "document": {"path": "installation-return.html", "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}}
    return {"installation-return-selection.json": (canonical(marker) + "\n").encode("utf-8"),
            "installation-return.html": raw}


def selection_from_files(document, files):
    names = {"installation-return-selection.json", "installation-return.html"}
    if not names.intersection(files):
        return None
    if not names.issubset(files):
        fail("The complete receiving return selection is missing.")
    try:
        marker = json.loads(files["installation-return-selection.json"])
        selected = marker["review"]["id"]
        row = next((item for item in document["reviews"] if item.get("id") == selected
                    and item.get("purpose") in (PURPOSE, STAGE_PURPOSE)), None)
        raw = files["installation-return.html"]
        expected = {"schema": SCHEMA + ".selection", "caseId": document["program"]["id"],
                    "caseVersion": document["program"]["version"], "review": row_summary(row) if row else None,
                    "document": {"path": "installation-return.html", "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}}
        if not row or not equal(marker, expected):
            fail("The selected complete receiving return differs from its retained original.")
        raw.decode("utf-8")
    except (TypeError, ValueError, KeyError, UnicodeError) as exc:
        if isinstance(exc, Problem):
            raise
        raise Problem("The complete receiving return selection is unreadable.", 422, "INVALID_INSTALLATION_RETURN") from exc
    return row_summary(row)
