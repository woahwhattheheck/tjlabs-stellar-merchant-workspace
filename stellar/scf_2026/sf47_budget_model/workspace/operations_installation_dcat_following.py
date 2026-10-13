"""Following DCAT scope through the original Source Desk and Installation transaction.

Original .ckanw bytes stay in Operations source custody. Complete canonical
proof strings verify the Node projection without changing numeric/text values.
No second database, native engine, network client or process is created here.
"""
from __future__ import annotations
from copy import deepcopy
import hashlib
import html
import json
import re
from pathlib import Path
from model import Problem, canonical, digest
import operations_dcat_sources as archives
import operations_installations as installations

SCHEMA = "stellar-forge.dcat-installation-following.v1"
SELECTION = SCHEMA + ".source-selection"
MAX = 8 * 1024 * 1024
QUALIFICATION = "Source scope review does not establish commissioned acceptance, completed work, eligibility, a new fee or payment."
SOURCE_QUALIFICATION = "All original archive bytes and outcomes remain retained. Selected scope and local catalogue/review decisions do not establish commissioned acceptance or payment."
FAMILIES = ("catalog", "migration-review", "release", "source", "acquisition",
            "correction", "correction-revision", "recipient-issue", "recipient-proposal",
            "recipient-decision", "semantic-profile", "semantic-run", "semantic-review",
            "semantic-comparison", "semantic-comparison-review")


def need(ok, message, status=422):
    if not ok:
        raise Problem(message, status, "DCAT_FOLLOWING_INVALID")


def same(left, right):
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, dict) or isinstance(right, dict):
        return isinstance(left, dict) and isinstance(right, dict) and set(left) == set(right) and all(same(left[k], right[k]) for k in left)
    if isinstance(left, list) or isinstance(right, list):
        return isinstance(left, list) and isinstance(right, list) and len(left) == len(right) and all(same(a, b) for a, b in zip(left, right))
    return left == right


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_json(raw):
    need(isinstance(raw, bytes) and 0 < len(raw) <= MAX, "Retain the complete following input within 8 MiB.", 413)
    return archives.json_value(raw)


def exact(value, keys, label):
    need(isinstance(value, dict) and set(value) == set(keys), "Retain the complete " + label + " fields.")


def text(value, label):
    need(isinstance(value, str) and 0 < len(value) <= 4000 and value.strip() and "\0" not in value,
         "Record the complete " + label + ".")


def engine():
    path = Path(__file__).resolve()
    raw = path.read_bytes()
    return {"kind": "dcat-following", "path": str(path), "bytes": len(raw), "sha256": sha(raw)}


def proof(value, expected_sha, label):
    need(isinstance(value, str), "Retain the original canonical " + label + " bytes.")
    raw = value.encode("utf-8")
    need(len(raw) <= MAX and sha(raw) == expected_sha, "The complete " + label + " proof differs.")
    return read_json(raw)


def records_from_workbench(workbench, manifest):
    """Read original index entries only. All catalogue/member bytes stay native."""
    dcat = workbench.get("dcat")
    need(isinstance(dcat, dict) and dcat.get("schema") == "stellar-forge.dcat-workspace.v1",
         "Retain the original complete DCAT state.")
    members = manifest["files"]
    by_path = {r["path"]: r for r in members}
    indexed = {}
    def named(paths):
        return [by_path[p] for p in paths if p in by_path]
    def prefix(path):
        return [r for r in members if r["path"].startswith(path)]
    def add(family, row, files, owner=None):
        need(isinstance(row, dict) and isinstance(row.get("id"), str) and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", row["id"]), "Retain each original record identity.")
        key = family + "/" + ((owner + "/") if owner else "") + row["id"]
        need(key not in indexed, "The original catalogue repeats a record identity.")
        indexed[key] = {"family": family, "id": row["id"], "ownerId": owner, "metadata": row, "files": files}
    for family, field, directory in (("catalog", "catalogs", "catalogs"), ("release", "releases", "releases")):
        for row in dcat.get(field, []):
            paths = ["dcat/catalogs/" + row["id"] + "/catalog.json"] if family == "catalog" else ["dcat/releases/" + row["id"] + ".json"]
            add(family, row, named(paths))
    for family, field, directory in (("migration-review", "reviews", "reviews"), ("source", "sources", "sources"),
                                     ("acquisition", "acquisitions", "acquisitions")):
        for row in dcat.get(field, []):
            add(family, row, prefix("dcat/" + directory + "/" + row["id"] + "/"))
    corrections = dcat.get("corrections") or {}
    for draft in corrections.get("drafts", []):
        add("correction", draft, prefix("dcat/corrections/" + draft["id"] + "/"))
        for row in draft["revisions"]:
            add("correction-revision", row, prefix("dcat/corrections/" + draft["id"] + "/revisions/" + row["id"] + "/"), draft["id"])
    exchanges = corrections.get("exchanges") or {}
    for family, field in (("recipient-issue", "issues"), ("recipient-proposal", "proposals"), ("recipient-decision", "decisions")):
        for row in exchanges.get(field, []):
            add(family, row, prefix("dcat/corrections/exchanges/" + field + "/" + row["id"] + "/"))
    semantic = dcat.get("semantic") or {}
    for family, field, directory in (("semantic-profile", "profiles", "profiles"), ("semantic-run", "runs", "runs"),
                                     ("semantic-review", "reviews", "reviews"), ("semantic-comparison", "comparisons", "comparisons"),
                                     ("semantic-comparison-review", "comparisonReviews", "comparison-reviews")):
        for row in semantic.get(field, []):
            files = named(["dcat/semantic/" + directory + "/" + row["id"] + ".json"])
            if family == "semantic-profile":
                files += prefix("dcat/semantic/profile-files/" + row["id"] + "/")
            elif family in ("semantic-run", "semantic-comparison"):
                files += prefix("dcat/semantic/native/" + row["id"] + "/")
            add(family, row, files)
    key_for = lambda family, ident, owner=None: family + "/" + ((owner + "/") if owner else "") + ident if ident else None
    for key, entry in indexed.items():
        row, family, ident, owner = entry["metadata"], entry["family"], entry["id"], entry["ownerId"]
        links, extra = [], {}
        if family == "catalog":
            extra = {"documentSha256": row["sha256"], "documentBytes": row["bytes"]}
        elif family == "migration-review":
            links = [key_for("catalog", row.get(k)) for k in ("sourceId", "candidateId", "comparisonId")]
        elif family == "release":
            links = [key_for("migration-review", row.get("reviewId")), key_for("release", row.get("previousReleaseId")), key_for("release", row.get("restoredFromReleaseId"))]
            extra = {"active": ident == dcat.get("activeReleaseId")}
        elif family == "source":
            links = [key_for("catalog", row.get("latestCatalogId")), key_for("acquisition", row.get("latestAcquisitionId"))]
        elif family == "acquisition":
            links = [key_for("source", row.get("sourceId")), key_for("catalog", row.get("catalogId"))]
        elif family == "correction":
            selected = row.get("source") or {}
            links = [key_for("catalog" if selected.get("kind") == "catalog" else "migration-review", selected.get("id"))]
            links += [key_for("correction-revision", r["id"], ident) for r in row["revisions"]]
        elif family == "correction-revision":
            parent = indexed[key_for("correction", owner)]["metadata"]
            links = [key_for("correction", owner), key_for("correction-revision", row.get("previousRevisionId"), owner)]
            extra = {"revisionId": ident, "head": ident == parent.get("headRevisionId"),
                     "documentSha256": row["documentSha256"], "documentBytes": row["documentBytes"]}
        elif family == "recipient-issue":
            links = [key_for("correction", row.get("correctionId")), key_for("correction-revision", row.get("revisionId"), row.get("correctionId"))]
        elif family == "recipient-proposal":
            links = [key_for("recipient-issue", row.get("exchangeId")), key_for("correction", row.get("correctionId"))]
        elif family == "recipient-decision":
            links = [key_for("recipient-proposal", row.get("proposalId")), key_for("correction-revision", row.get("revisionId"), row.get("correctionId"))]
        elif family == "semantic-profile":
            links = [key_for("semantic-profile", row.get("supersedesProfileId"))]
        elif family == "semantic-run":
            selected = row.get("selection") or {}
            links = [key_for("semantic-profile", row.get("profileId")), key_for("catalog" if selected.get("kind") == "catalog" else "migration-review", selected.get("id"))]
        elif family == "semantic-review":
            links = [key_for("semantic-run", row.get("runId")), key_for("semantic-review", row.get("previousReviewId"))]
        elif family == "semantic-comparison":
            links = [key_for("semantic-run", (row.get(side) or {}).get("runId")) for side in ("before", "after")]
        elif family == "semantic-comparison-review":
            links = [key_for("semantic-comparison", row.get("comparisonId")), key_for("semantic-comparison-review", row.get("previousReviewId"))]
        entry["relationships"] = list(dict.fromkeys(link for link in links if link in indexed))
        entry["extra"] = extra
    return indexed


def inspected(desk, case_id, selected, supplied):
    metadata, raw = desk.ops.source(case_id, selected["sourceId"])
    need(len(raw) == selected["bytes"] and sha(raw) == selected["sha256"],
         "The complete original case-owned catalogue differs.", 409)
    detail = archives.inspect(raw, details=True)
    need(metadata.get("dcatWorkspace") == detail["transport"], "Retain the original DCAT source transport receipt.", 409)
    source = proof(supplied["canonical"], supplied["sourceSha256"], "DCAT source")
    need(source["schema"] == "stellar-forge.dcat-installation-source.v1" and source["archive"] ==
         {key: selected[key] for key in ("bytes", "sha256")} and source["manifest"] == detail["manifest"]
         and source["manifestSha256"] == detail["transport"]["manifestSha256"], "The complete source projection differs from its actual archive.", 409)
    state = detail["workbench"]
    need((state.get("operation") or {}).get("state") != "RUNNING", "Retain a completed original catalogue snapshot.")
    need(source["project"] == {"createdAt": state["createdAt"], "catalogOrigin": state["catalogOrigin"],
         "sourceKind": state.get("sourceKind", "ckan"), "originalDirectory": detail["manifest"]["source"]["directory"]},
         "The projected original project identity differs.")
    original = records_from_workbench(state, detail["manifest"])
    rows, proofs = source["records"], supplied["records"]
    need(isinstance(rows, list) and isinstance(proofs, list) and len(rows) == len(original) == len(proofs),
         "Retain every original catalogue record and its proof.")
    by_key = {r["key"]: r for r in rows}
    proof_map = {r["key"]: r for r in proofs}
    need(set(by_key) == set(proof_map) == set(original) and len(by_key) == len(rows), "Retain each original family, owner and record ID exactly once.")
    for key, original_row in original.items():
        row, captured = by_key[key], proof_map[key]
        record_body = proof(captured["canonical"], captured["sha256"], "DCAT record")
        need(row.get("recordSha256") == captured["sha256"] and
             {k: v for k, v in row.items() if k != "recordSha256"} == record_body,
             "A record differs from its retained canonical proof.")
        need(all(same(row.get(k), original_row[k]) for k in ("family", "id", "ownerId", "metadata")),
             "A source record differs from its complete original workbench entry.")
        metadata = original_row["metadata"]
        label = next((metadata[k] for k in ("label", "name", "note", "id") if metadata.get(k) is not None), "")
        need(isinstance(label, str) and row["label"] == label and row["state"] ==
             (metadata.get("status") if metadata.get("status") is not None else metadata.get("state"))
             and row["relationships"] == original_row["relationships"]
             and all(row.get(k) == v for k, v in original_row["extra"].items()),
             "The projected label, state, relationships or source revision differs.")
        need(set(row) == {"key", "family", "id", "label", "state", "metadata", "files", "relationships", "recordSha256"} |
             ({"ownerId"} if original_row["ownerId"] else set()) | set(original_row["extra"]),
             "The projected record includes unknown fields.")
        need([{k: v for k, v in f.items() if k != "mediaType"} for f in row["files"]] == original_row["files"],
             "A source record omits or changes original file membership.")
    def media(path):
        return ("application/x-ndjson" if path.endswith(".jsonl") else "application/json" if path.endswith(".json")
                else "text/html" if path.endswith(".html") else "text/turtle" if path.endswith(".ttl")
                else "application/n-triples" if path.endswith(".nt") else "application/octet-stream")
    for row in rows:
        need(all(f.get("mediaType") == media(f["path"]) and set(f) == {"path", "bytes", "sha256", "mediaType"}
                 for f in row["files"]), "The complete original member descriptor changed.")
    state_file = next(f for f in detail["manifest"]["files"] if f["path"] == "workbench.json")
    corrections = state["dcat"].get("corrections") or {}
    expected_pending = {"operation": state.get("operation"), "corrections": corrections.get("pending") or [],
                        "exchanges": (corrections.get("exchanges") or {}).get("pending") or []}
    expected_totals = {"members": len(detail["manifest"]["files"]), "bytes": detail["transport"]["unpackedBytes"],
                       "records": len(original), "families": {family: sum(r["family"] == family for r in rows) for family in FAMILIES}}
    need(set(source) == {"schema", "archive", "manifestSha256", "project", "workbench", "manifest", "records",
                         "pending", "totals", "qualification"} and source["workbench"] == {**state_file, "mediaType": media(state_file["path"])}
         and same(source["pending"], expected_pending) and same(source["totals"], expected_totals)
         and source["qualification"] == SOURCE_QUALIFICATION,
         "The complete source projection counts, pending history or original workbench differ.")
    source["sourceSha256"] = supplied["sourceSha256"]
    return source


def verify(desk, state, value, *, current=True):
    exact(value, ("schema", "following", "before", "after", "priorPreparation", "proofs"), "native following input")
    need(value["schema"] == SCHEMA + ".native-input", "Select the complete native following preparation.")
    following = value["following"]
    need(following.get("schema") == SCHEMA + ".prepared", "Retain the original following preparation.")
    basis = following["basis"]
    need(proof(value["proofs"]["following"], following["sha256"], "following preparation") ==
         {k: v for k, v in following.items() if k != "sha256"}, "The complete following preparation differs.")
    need(proof(value["proofs"]["comparison"], following["comparison"]["sha256"], "comparison") ==
         {k: v for k, v in following["comparison"].items() if k != "sha256"}, "The complete comparison differs.")
    need(proof(value["proofs"]["priorPreparation"], basis["priorPreparation"]["sha256"], "prior preparation") ==
         value["priorPreparation"] and value["priorPreparation"]["requestId"] == basis["priorPreparation"]["requestId"],
         "Retain the exact original prior preparation request and output.")
    need(proof(value["proofs"]["priorScope"], basis["priorScopeSha256"], "prior scope") ==
         following["previousScope"], "Retain the complete original prior scope.")
    need(basis["caseId"] == state["caseId"], "This following preparation belongs to another case.")
    installation = installations.get(desk.ops, state["caseId"], basis["installation"]["id"],
                                    None if current else basis["installation"]["revision"])
    reference = {key: installation[key] for key in ("id", "revision", "sha256")}
    need(reference == basis["installation"], "The original Installation changed. Preserve this preparation and reconcile its current edition.", 409)
    retained = {k: v for k, v in following["previousInstallation"].items() if k != "current"}
    need(same(retained, installation), "Preserve the exact saved original Installation and observations.", 409)
    context = desk.ops._context(state["caseId"])
    if current:
        need(context["program"]["version"] == following["currentCaseVersion"],
             "The original case changed. Prepare against its current source edition.", 409)
    before = inspected(desk, state["caseId"], basis["before"]["archive"], value["before"])
    after = inspected(desk, state["caseId"], basis["after"]["archive"], value["after"])
    for side, source in (("before", before), ("after", after)):
        need(basis[side]["sourceSha256"] == source["sourceSha256"] and basis[side]["manifestSha256"] == source["manifestSha256"],
             "The original following comparison source differs.")
    need(all(before["project"][key] == after["project"][key] for key in ("createdAt", "catalogOrigin", "sourceKind")),
         "Do not merge different catalogue projects or infer identity from names.")
    prior = value["priorPreparation"]
    prior_scope = following["previousScope"]
    need(prior.get("type") == "prepare" and prior.get("scope") == prior_scope
         and prior_scope["sourceSha256"] == before["sourceSha256"]
         and prior_scope["archive"] == basis["before"]["archive"],
         "Retain the original preparation, complete prior scope and archive.")
    need(prior_scope["originalCase"]["caseId"] == state["caseId"]
         and prior_scope["workshare"] == prior["installation"]["workshare"]
         and prior_scope["workshare"]["caseId"] == installation["preview"]["document"].get("workshare", {}).get("caseId"),
         "Keep this scope joined to its original commercial Workshare and case.")
    scope_meta, scope_raw = desk.ops.source(state["caseId"], prior_scope["selection"]["sourceId"])
    need(len(scope_raw) == prior_scope["selection"]["bytes"] and sha(scope_raw) == prior_scope["selection"]["sha256"],
         "The prior scope source bytes changed.", 409)
    original_scope = read_json(scope_raw)
    if original_scope.get("schema") == "stellar-forge.dcat-installation-selection.v1":
        prior_records = original_scope.get("records")
    elif original_scope.get("schema") == SCHEMA + ".review":
        prior_records = [{"key": d["key"], "recordSha256": d["afterSha256"],
                          "included": d["disposition"] == "included", "purpose": d["purpose"]}
                         for d in original_scope["decisions"] if d["afterSha256"] is not None]
    else:
        need(False, "Retain the complete original selected scope source.")
    need(prior_records == prior_scope["records"], "The saved prior scope differs from its original case source.")
    old = {r["key"]: r for r in before["records"]}
    new = {r["key"]: r for r in after["records"]}
    choices = {r["key"]: r for r in prior_records}
    need(set(choices) == set(old) and len(choices) == len(prior_records)
         and all(choices[k]["recordSha256"] == old[k]["recordSha256"] for k in old),
         "The complete prior scope and source records differ.")
    review = following["review"]
    meta, review_raw = desk.ops.source(state["caseId"], following["reviewSource"]["sourceId"])
    need(len(review_raw) == following["reviewSource"]["bytes"] and sha(review_raw) == following["reviewSource"]["sha256"]
         and read_json(review_raw) == review, "The actual reviewed source bytes differ.", 409)
    need(review["basis"] == basis and review["comparisonSha256"] == following["comparison"]["sha256"],
         "The complete review belongs to another comparison.")
    decisions = {r["key"]: r for r in review["decisions"]}
    keys = sorted(set(old) | set(new))
    need(set(decisions) == set(keys) and len(decisions) == len(review["decisions"]), "Review every original record once.")
    rows = following["comparison"]["rows"]
    need(isinstance(rows, list) and len(rows) == len(keys) and [r["key"] for r in rows] == keys,
         "Retain the whole original comparison in source identity order.")
    compared = {r["key"]: r for r in rows}
    records = []
    for key in keys:
        d, a, b = decisions[key], old.get(key), new.get(key)
        status = "NEW" if a is None else "MISSING" if b is None else "UNCHANGED" if a["recordSha256"] == b["recordSha256"] else "CHANGED"
        before_files = {r["path"]: r for r in (a["files"] if a else [])}
        after_files = {r["path"]: r for r in (b["files"] if b else [])}
        changed_files = []
        for path in sorted(set(before_files) | set(after_files), key=lambda p: p.encode("utf-16-be")):
            old_file, new_file = before_files.get(path), after_files.get(path)
            change = "NEW" if old_file is None else "MISSING" if new_file is None else "UNCHANGED" if old_file == new_file else "CHANGED"
            changed_files.append({"path": path, "status": change, "before": old_file, "after": new_file})
        need(compared[key] == {"key": key, "family": (b or a)["family"], "label": (b or a)["label"], "status": status,
             "before": {"recordSha256": a["recordSha256"], "state": a["state"]} if a else None,
             "after": {"recordSha256": b["recordSha256"], "state": b["state"]} if b else None,
             "previous": choices.get(key), "files": changed_files}, "The displayed comparison differs from the original whole sources.")
        exact(d, ("key", "beforeSha256", "afterSha256", "disposition", "purpose", "note", "reviewed"), "record decision")
        need(d["reviewed"] is True and d["beforeSha256"] == (a["recordSha256"] if a else None)
             and d["afterSha256"] == (b["recordSha256"] if b else None), "Review the exact original record editions.")
        need(d["disposition"] in (("included", "context") if b else ("missing",)), "A missing original record cannot be silently replaced.")
        text(d["purpose"], "scope purpose")
        need(isinstance(d["note"], str) and len(d["note"]) <= 4000 and "\0" not in d["note"], "Retain the complete decision note.")
        unchanged = a is not None and b is not None and a["recordSha256"] == b["recordSha256"]
        if not unchanged or d["disposition"] != ("included" if choices[key]["included"] else "context") or d["purpose"] != choices[key]["purpose"]:
            text(d["note"], "scope-change reason")
        if b:
            records.append({"key": key, "recordSha256": b["recordSha256"], "included": d["disposition"] == "included", "purpose": d["purpose"]})
    comparison = following["comparison"]
    expected_totals = {status: sum(r["status"] == status for r in rows) for status in ("UNCHANGED", "CHANGED", "NEW", "MISSING")}
    expected_families = [{"family": family, "records": sum(r["family"] == family for r in rows)} for family in FAMILIES]
    need(set(comparison) == {"schema", "basis", "rows", "totals", "families", "qualification", "sha256"}
         and comparison["schema"] == SCHEMA + ".comparison" and comparison["basis"] == basis
         and comparison["totals"] == expected_totals and comparison["families"] == expected_families
         and comparison["qualification"] == QUALIFICATION, "The complete displayed comparison differs from its original sources.")
    need(any(r["included"] for r in records), "Select a present catalogue record for continuing work.")
    document = deepcopy(installation["preview"]["document"])
    source_ids = set(document["source"]["sourceIds"] + document["receiving"]["sourceIds"])
    need({prior_scope["archive"]["sourceId"], prior_scope["selection"]["sourceId"]} <= source_ids,
         "The saved Installation does not own the prior archive and scope.")
    need(document["source"]["mode"] == "SNAPSHOT", "Preserve the original snapshot source behavior.")
    exact(review["amendments"], ("source", "receiving"), "scope amendment")
    allowed = {"source": ("reference", "population", "meaning", "authority", "changePolicy"),
               "receiving": ("application", "host", "operator", "acceptanceRule", "changeAndWithdraw", "recovery", "maintenance")}
    for section, keys in allowed.items():
        changed = review["amendments"][section]
        need(isinstance(changed, dict) and not set(changed) - set(keys), "Preserve all original commercial and operated fields.")
        for key, item in changed.items():
            text(item, section + "." + key)
        document[section].update(changed)
        document[section]["sourceIds"] = list(dict.fromkeys(document[section]["sourceIds"] + [
            prior_scope["archive"]["sourceId"], prior_scope["selection"]["sourceId"],
            basis["after"]["archive"]["sourceId"], following["reviewSource"]["sourceId"]]))
    need(same(document, following["document"]) and following["scope"]["records"] == records
         and following["scope"]["archive"] == basis["after"]["archive"]
         and following["scope"]["selection"] == following["reviewSource"],
         "The successor changed an unreviewed original field or scope.")
    expected_scope = {"schema": "stellar-forge.dcat-installation-scope.v1",
        "originalCase": installations._source(context), "workshare": deepcopy(document["workshare"]),
        "sourceSha256": after["sourceSha256"], "project": deepcopy(after["project"]),
        "manifestSha256": after["manifestSha256"], "archive": deepcopy(basis["after"]["archive"]),
        "selection": deepcopy(following["reviewSource"]), "records": records,
        "completeSource": {"records": len(after["records"]), "members": len(after["manifest"]["files"]),
                           "bytes": sum(f["bytes"] for f in after["manifest"]["files"])},
        "qualification": QUALIFICATION}
    # Historical receiving uses the frozen original case source; live Prepare
    # additionally binds it to the actual current original plan/version.
    if not current:
        successor = installations.get(desk.ops, state["caseId"], installation["id"], installation["revision"] + 1)
        need(same(successor["preview"]["document"], document),
             "The historical following scope differs from its original saved successor.")
        expected_scope["originalCase"] = deepcopy(successor["preview"]["source"])
        need(expected_scope["originalCase"]["caseId"] == state["caseId"] and
             expected_scope["originalCase"]["version"] == following["currentCaseVersion"],
             "Retain the original historical case source.")
    need(same(following["scope"], expected_scope), "The following scope provenance differs from its complete native source.")
    expected = {"expectedVersion": following["currentCaseVersion"], "installationId": installation["id"],
                "expectedRevision": installation["revision"], "document": document}
    need(following["preview"] == expected, "The native preview no longer identifies this same Installation.")
    return following, context


def prepare(desk, state, context, data):
    selection = state["selection"]
    exact(selection, ("schema", "inputFileId", "inputSha256"), "following source selection")
    need(selection["schema"] == SELECTION and data["expectedSelectionSha256"] == digest(selection),
         "Review and retain the complete following selection.", 409)
    receipt = engine()
    need(data["expectedEngineSha256"] == receipt["sha256"] and data["expectedProfiles"] == {},
         "Reopen the actual installed following preparation engine.", 409)
    file = next((f for f in state["files"] if f["id"] == selection["inputFileId"]), None)
    need(file is not None and file["sha256"] == selection["inputSha256"], "Select the exact native following input.")
    raw = desk._blob(state["caseId"], state["id"], file["sha256"])
    value = read_json(raw)
    following, native_context = verify(desk, state, value)
    preview = installations.preview(desk.ops, native_context, following["preview"])
    report = render_report(following)
    outputs = {
        "Dcat_Following_Native_Input.json": raw,
        "Dcat_Following_Review.json": (canonical(following["review"]) + "\n").encode(),
        "Dcat_Following_Preparation.json": (canonical(following) + "\n").encode(),
        "Dcat_Following_Differences.html": report,
        "installation-input.json": (canonical(following["document"]) + "\n").encode(),
        "installation-preview.json": (canonical(preview) + "\n").encode()}
    need(len(state["preparations"]) < 100, "Retain the original complete preparation history.")
    files = []
    for name, body in outputs.items():
        identity = desk._keep_blob(state["caseId"], state["id"], body)
        files.append({"filename": name, **identity, "mediaType": "text/html" if name.endswith(".html") else "application/json",
                      "sourceUrl": file["sourceUrl"], "observedAt": file["observedAt"]})
    ident = "preparation-" + digest({"draft": state["id"], "requestId": context["requestId"],
                                     "selectionSha256": digest(selection)})
    result = {"schema": "stellar-forge.installation-source-desk-preparation.v1",
              "id": ident, "caseId": state["caseId"], "draftId": state["id"], "draftRevision": state["revision"],
              "selectionSha256": digest(selection), "engine": receipt, "actor": context["actor"], "preparedAt": context["at"],
              "state": "PREPARED_SOURCE", "kind": "dcat-following", "report": following, "files": files,
              "nativePreview": preview, "nativeInputSha256": sha(raw), "caseSources": [
                  deepcopy(following["basis"][side]["archive"]) for side in ("before", "after")],
              "sourceRoles": {"commissioning": None, "packet": None}}
    desk.db.execute("INSERT INTO ops_installation_source_preparations VALUES(?,?,?,?)",
                    (state["caseId"], state["id"], ident, canonical(result)))
    state["preparations"].append({k: deepcopy(result[k]) for k in
                                 ("id", "draftRevision", "selectionSha256", "preparedAt", "state")})
    return result


def save(desk, state, context, data):
    exact(data, ("preparationId", "expectedPreviewSha256"), "same Installation save")
    prepared = desk._preparation(state["caseId"], state["id"], data["preparationId"])
    need(prepared.get("kind") == "dcat-following" and data["expectedPreviewSha256"] == prepared["nativePreview"]["previewSha256"],
         "Save the exact original native preview.", 409)
    raw = desk._blob(state["caseId"], state["id"], prepared["nativeInputSha256"])
    following, _ = verify(desk, state, read_json(raw))
    preview = prepared["nativePreview"]
    receipt = desk.ops.command(state["caseId"], {"requestId": context["requestId"],
        "expectedVersion": following["currentCaseVersion"], "actor": context["actor"], "note": context["note"],
        "action": "installation.save", "data": {"installationId": preview["installationId"],
        "expectedRevision": preview["expectedRevision"], "document": preview["document"],
        "expectedPreviewSha256": data["expectedPreviewSha256"]}}, _within_transaction=True)
    row = installations.get(desk.ops, state["caseId"], preview["installationId"], preview["expectedRevision"] + 1)
    result = {"schema": SCHEMA + ".saved", "state": "SAVED_DCAT_FOLLOWING", "preparationId": prepared["id"],
              "caseId": state["caseId"], "draftId": state["id"], "requestId": context["requestId"],
              "installation": {key: row[key] for key in ("id", "revision", "sha256")}, "receipt": receipt}
    state.setdefault("dcatFollowingSaves", []).append(deepcopy(result))
    return result


def verify_saved(desk, result):
    row = installations.get(desk.ops, result["caseId"], result["installation"]["id"], result["installation"]["revision"])
    need({key: row[key] for key in ("id", "revision", "sha256")} == result["installation"],
         "The accepted original following revision changed.", 409)
    return result


def render_report(following):
    esc = lambda v: html.escape(str(v), quote=True)
    decisions = {r["key"]: r for r in following["review"]["decisions"]}
    rows = []
    for row in following["comparison"]["rows"]:
        d = decisions[row["key"]]
        rows.append("<tr><td>" + esc(row["family"]) + "<br>" + esc(row["label"]) +
                    "</td><td>" + esc(row["status"]) + "</td><td>" + esc(d["disposition"]) +
                    "</td><td>" + esc(d["purpose"]) + "</td><td>" + esc(d["note"]) + "</td></tr>")
    return ("""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalogue following scope</title><style>body{font:16px/1.5 system-ui;color:#222;background:white;max-width:1150px;margin:auto;padding:24px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:10px;text-align:left;vertical-align:top}
.wrap{overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:650px){body{padding:12px}table{min-width:650px}}
@media print{body{font-size:10pt}.wrap{overflow:visible}tr{break-inside:avoid}}</style><h1>Catalogue following scope</h1>
<p>This source review preserves the same Installation and its prior observations. It does not create a new fee, certify acceptance or complete a check.</p>
<div class="wrap"><table><thead><tr><th>Original record</th><th>Source change</th><th>Decision</th><th>Purpose</th><th>Reason</th></tr></thead><tbody>"""
            + "".join(rows) + "</tbody></table></div><details><summary>Complete original comparison and preparation</summary><pre>" +
            esc(json.dumps(following, ensure_ascii=False, indent=2)) + "</pre></details></html>\n").encode("utf-8")


def export_custody(desk, case_id, draft_id, preparation_id, save_request_id, directory, scenario):
    """Freeze and cold-reopen the original complete workspace, using its maintained
    Source Desk receiving backup contract. Never restores over a live workspace."""
    import importlib.util
    import os
    import sqlite3
    import stat
    import uuid
    from model import Workspace
    from operations import Operations
    # Reuse the original receiving programme's exact typed logical identity.
    module_path = Path(__file__).with_name("installation-source-desk-receiving.py")
    spec = importlib.util.spec_from_file_location("_dcat_source_desk_receiving", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    root = Path(directory).expanduser().absolute()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = os.lstat(root)
    need(stat.S_ISDIR(info.st_mode) and root.resolve() == root and info.st_uid == os.getuid()
         and not (info.st_mode & 0o077), "Use an owned private custody directory without symbolic links.")
    live = Path(desk.workspace.root).resolve()
    need(root != live and live not in root.parents and root not in live.parents,
         "Keep the complete portable copy outside its original live workspace.")
    binding = {"schema": SCHEMA + ".custody", "caseId": case_id, "draftId": draft_id,
               "preparationId": preparation_id, "saveRequestId": save_request_id}
    prepared = desk.preparation(case_id, draft_id, preparation_id)
    accepted = desk.request(case_id, draft_id, save_request_id)
    need(prepared.get("kind") == "dcat-following" and accepted.get("state") == "RECORDED"
         and accepted["result"]["result"]["state"] == "SAVED_DCAT_FOLLOWING"
         and accepted["result"]["result"]["preparationId"] == preparation_id,
         "Select the original recorded following preparation and accepted save.")
    target = root / "complete-workspace.sqlite3"
    receipt_file = root / "DCAT_FOLLOWING_CUSTODY.json"
    def sync_file(path):
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            need(stat.S_ISREG(os.fstat(fd).st_mode), "Keep an original regular custody file.")
            os.fsync(fd)
        finally:
            os.close(fd)
        module.sync(path.parent)
    def db_identity(path):
        info = os.lstat(path)
        need(stat.S_ISREG(info.st_mode) and path.resolve() == path and not (info.st_mode & 0o077),
             "Keep a complete private original SQLite snapshot.")
        db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
        try:
            return module.logical_database(db)
        finally:
            db.close()
    if not target.exists():
        temporary = root / (".following-backup-" + uuid.uuid4().hex + ".sqlite3")
        fd = os.open(temporary, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        copied = sqlite3.connect(temporary)
        try:
            with desk.workspace.mutex:
                identity = module.logical_database(desk.db)
                desk.db.backup(copied)
                need(module.logical_database(copied) == identity, "The complete native workspace backup differs.")
        finally:
            copied.close()
        sync_file(temporary)
        try:
            os.link(temporary, target, follow_symlinks=False)
        except FileExistsError:
            need(db_identity(target) == db_identity(temporary), "A different original workspace copy already exists.")
        finally:
            os.unlink(temporary)
            module.sync(root)
    sync_file(target)
    identity = db_identity(target)
    # A prepared snapshot survives an interrupted receipt; verify its actual
    # original saved receipt before accepting it, never replace it with later data.
    restored = root / "workspace"
    restored.mkdir(mode=0o700, exist_ok=True)
    need(restored.resolve() == restored and stat.S_ISDIR(os.lstat(restored).st_mode),
         "Use the existing private receiving workspace.")
    destination = restored / "planning.sqlite3"
    if not destination.exists():
        # Stream complete bytes; no inline JSON/base64 expansion or case-cap change.
        temporary = restored / (".copy-" + uuid.uuid4().hex)
        source_fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        target_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            while True:
                raw = os.read(source_fd, 1048576)
                if not raw:
                    break
                view = memoryview(raw)
                while view:
                    count = os.write(target_fd, view)
                    need(count > 0, "The complete original copy did not advance.")
                    view = view[count:]
            os.fsync(target_fd)
        finally:
            os.close(source_fd)
            os.close(target_fd)
        try:
            os.link(temporary, destination, follow_symlinks=False)
        except FileExistsError:
            pass
        finally:
            os.unlink(temporary)
            module.sync(restored)
    first_receipt = None
    if receipt_file.exists():
        first_receipt = json.loads(module.regular(receipt_file))
        need(all(first_receipt.get(k) == v for k, v in binding.items()) and
             first_receipt.get("database", {}).get("logical") == identity,
             "Keep the same original portable workspace and custody receipt.")
    else:
        need(db_identity(destination) == identity,
             "The prepared first receiving snapshot differs; preserve it rather than overwrite it.")
    receiving_identity = db_identity(destination)
    receiver = Workspace(restored, scenario)
    try:
        from operations_installation_sources import SourceDesk
        other = SourceDesk(Operations(receiver))
        need(module.logical_database(receiver.db) == receiving_identity, "The complete original workspace changed on reopen.")
        need(same(other.preparation(case_id, draft_id, preparation_id), prepared)
             and same(other.request(case_id, draft_id, save_request_id), accepted),
             "The received original preparation/save receipt differs.")
        selected = accepted["result"]["result"]["installation"]
        row = installations.get(other.ops, case_id, selected["id"], selected["revision"])
        need(row["sha256"] == selected["sha256"], "The received saved Installation differs.")
        # Reparse both complete native archives and all frozen following metadata.
        frozen = read_json(other._blob(case_id, draft_id, prepared["nativeInputSha256"]))
        verify(other, {"caseId": case_id}, frozen, current=False)
    finally:
        receiver.close()
    need(db_identity(destination) == receiving_identity, "The original workspace changed during cold close.")
    result = {**binding, "state": "COMPLETE", "preparation": prepared, "save": accepted,
              "database": {**module.file_receipt(target, 8 * 1024 * 1024 * 1024), "logical": identity},
              "workspaceDirectory": str(restored), "renderedUse": False,
              "qualification": "Whole native state and both original archives are retained. Actual rendering and attachment use remain the producing operator's responsibility."}
    raw = (json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()
    if receipt_file.exists():
        prior = module.regular(receipt_file)
        need(prior == raw, "Keep the first complete custody receipt unchanged.")
    else:
        module.retain(receipt_file, raw)
    sync_file(receipt_file)
    return result
