"""MIT. Source observations bound to original repository records and staff decisions."""
from __future__ import annotations
from copy import deepcopy
from datetime import date
import re
from urllib.parse import urlsplit
from bridge import InputError
from harvest import decode, jbytes, plain, sha, stamp, page_values
from marc import access, canonical, doi, normalize_record

SCHEMA = "stellar-forge.tind-source-cases.v1"
MAX_CASES = 250

def url_key(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value.strip())
        if parsed.scheme.lower() not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
            return None
        port = parsed.port
        authority = parsed.hostname.lower() + (":" + str(port) if port and port not in {80, 443} else "")
        return authority + (parsed.path.rstrip("/") or "/") + ("?" + parsed.query if parsed.query else "")
    except ValueError:
        return None

def urls(value, name, maximum=20):
    if not isinstance(value, list) or len(value) > maximum:
        raise InputError(name + " must be an array of at most " + str(maximum) + " original URLs")
    for item in value:
        plain(item, name, 8192)
        if url_key(item) is None:
            raise InputError("Use original HTTP or HTTPS URLs for " + name)
    return list(dict.fromkeys(value))

def orcid(value):
    if not value:
        return ""
    if not isinstance(value, str):
        raise InputError("Use the assigned author\'s complete ORCID")
    found = re.fullmatch(r"(?:https://orcid.org/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])", value)
    if not found:
        raise InputError("Use the assigned author's complete ORCID")
    digits = found[1].replace("-", "")
    total = 0
    for digit in digits[:15]:
        total = (total + int(digit)) * 2
    check = (12 - total % 11) % 11
    if digits[-1] != ("X" if check == 10 else str(check)):
        raise InputError("The retained ORCID check digit does not match")
    return "https://orcid.org/" + found[1]

def normalize_pack(raw):
    if not isinstance(raw, dict) or raw.get("schema") != SCHEMA:
        raise InputError("Receive a complete TIND source-cases document")
    if set(raw) - {"schema", "title", "observedOn", "context", "cases"}:
        raise InputError("Unknown source-cases document field")
    title = plain(raw.get("title"), "source-case collection title", 256)
    observed = raw.get("observedOn")
    if not isinstance(observed, str) or len(observed) != 10:
        raise InputError("Retain the original observation date as YYYY-MM-DD")
    date.fromisoformat(observed)
    context = raw.get("context", {})
    if not isinstance(context, dict):
        raise InputError("Source context must be an object")
    cases = raw.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= MAX_CASES:
        raise InputError("Receive 1–250 complete source cases per collection")
    normalized, seen = [], set()
    for original in cases:
        if not isinstance(original, dict) or set(original) - {
            "caseId", "title", "sourceUrls", "match", "facts", "proposedAccess", "proposedHierarchy",
            "people", "fields", "notes"
        }:
            raise InputError("Unknown source case field")
        item = deepcopy(original)
        case_id = plain(item.get("caseId"), "source case ID", 128)
        if case_id in seen:
            raise InputError("Source case IDs must be unique within a collection")
        seen.add(case_id)
        plain(item.get("title"), "original source title", 4096)
        item["sourceUrls"] = urls(item.get("sourceUrls", []), "source provenance")
        if not item["sourceUrls"]:
            raise InputError("Each case retains its original source page or export URL")
        match = item.get("match", {"urls": item["sourceUrls"]})
        if not isinstance(match, dict) or set(match) - {"identifiers", "urls", "dois"}:
            raise InputError("Match cases by original identifiers, landing URLs or DOIs")
        ids = match.get("identifiers", [])
        if not isinstance(ids, list) or len(ids) > 20:
            raise InputError("Use at most 20 exact original identifiers per case")
        for identity in ids:
            plain(identity, "original OAI identifier", 4096)
        doi_values = match.get("dois", [])
        if not isinstance(doi_values, list) or len(doi_values) > 20:
            raise InputError("Use at most 20 original DOIs per case")
        if any(not isinstance(value, str) or not doi(value) for value in doi_values):
            raise InputError("Use the complete original DOI")
        item["match"] = {"identifiers": list(dict.fromkeys(ids)),
                         "urls": urls(match.get("urls", []), "record matching"),
                         "dois": list(dict.fromkeys(doi(value) for value in doi_values))}
        if not any(item["match"].values()):
            raise InputError("Each case needs an exact original record identity")
        if not isinstance(item.get("facts", {}), dict):
            raise InputError("Keep original source facts in an object")
        item["facts"] = item.get("facts", {})
        if item.get("proposedAccess") is not None:
            item["proposedAccess"] = access(item["proposedAccess"])
        hierarchy = item.get("proposedHierarchy", {})
        if not isinstance(hierarchy, dict) or set(hierarchy) - {
            "journalTitle", "volume", "issue", "pages", "parentRecordId", "issn", "relationship"
        }:
            raise InputError("Use the existing journal hierarchy fields")
        for key, value in hierarchy.items():
            if value:
                plain(value, "source hierarchy " + key, 4096)
        item["proposedHierarchy"] = hierarchy
        fields = normalize_record({"fields": item.get("fields", [])})["fields"]
        if any(int(field["tag"]) < 10 or field["tag"] in {"856", "909"} for field in fields):
            raise InputError("Source supplements preserve native control, file and OAI identity fields")
        item["fields"] = fields
        people = item.get("people", [])
        if not isinstance(people, list) or len(people) > 1000:
            raise InputError("Retain at most 1,000 ordered people per case")
        for person in people:
            if not isinstance(person, dict) or set(person) - {"name", "aliases", "role", "orcid", "affiliation", "nameIndicator", "mainEntry"}:
                raise InputError("A source person has name, aliases, role, ORCID, affiliation and entry details")
            plain(person.get("name"), "original person name", 2048)
            plain(person.get("role"), "original person role", 256)
            aliases = person.get("aliases", [])
            if not isinstance(aliases, list) or len(aliases) > 20:
                raise InputError("Use at most 20 reviewed name spellings per person")
            for alias in aliases:
                plain(alias, "reviewed original name spelling", 2048)
            person["orcid"] = orcid(person.get("orcid", ""))
            if person.get("affiliation"):
                plain(person["affiliation"], "original affiliation", 2048)
            if person.get("nameIndicator", "1" if "," in person["name"] else "0") not in {"0", "1", "3"}:
                raise InputError("Choose the MARC personal-name entry indicator")
            if type(person.get("mainEntry", False)) is not bool:
                raise InputError("mainEntry must be true or false")
        item["people"] = people
        notes = item.get("notes", [])
        if not isinstance(notes, list) or len(notes) > 100:
            raise InputError("Use an ordered source notes array")
        for note in notes:
            plain(note, "source observation note", 8192)
        item["notes"] = notes
        normalized.append(item)
    result = {"schema": SCHEMA, "title": title, "observedOn": observed, "context": context, "cases": normalized}
    if len(jbytes(result)) > 8 * 1024 * 1024:
        raise InputError("The complete source-case document exceeds 8 MiB")
    return result

def source_tokens(observation):
    """Use actual identifier elements; a DOI quoted in an abstract is not a record identity."""
    yield ("identifier", observation["identifier"])
    pending = [observation.get("node")]
    while pending:
        node = pending.pop()
        if not isinstance(node, list) or len(node) != 3:
            continue
        name, attrs, content = node
        local = name.rsplit("}", 1)[-1].casefold()
        if local in {"identifier", "recordidentifier", "url", "uri"}:
            pieces, children = [], list(content)
            while children:
                child = children.pop(0)
                if isinstance(child, str):
                    pieces.append(child)
                elif isinstance(child, list) and len(child) == 3:
                    children[0:0] = child[2]
            value = "".join(pieces).strip()
            if value:
                yield ("identifier", value)
                if url_key(value):
                    yield ("url", url_key(value))
                if doi(value):
                    yield ("doi", doi(value))
        for child in reversed(content):
            if isinstance(child, list):
                pending.append(child)

def matches(workspace, project, pack):
    wanted, patterns = {}, set()
    for case in pack["cases"]:
        match = case["match"]
        keys = [("identifier", value) for value in match["identifiers"]]
        keys += [("url", url_key(value)) for value in match["urls"]]
        keys += [("doi", value) for value in match["dois"]]
        for key in keys:
            wanted.setdefault(key, set()).add(case["caseId"])
            patterns.add(key[1])
    result = {case["caseId"]: [] for case in pack["cases"]}
    seen = set()
    ordered = sorted(patterns)
    # Read possible original observations in bounded SQL groups, then compare their exact identifiers.
    for start in range(0, len(ordered), 64):
        part = ordered[start:start + 64]
        where = " OR ".join("(instr(o.body,?)>0 OR instr(lower(o.body),?)>0)" for _ in part)
        cursor = workspace.db.execute(
            "SELECT t.identifier,t.observation_id,t.body AS record_body,o.body AS original_body "
            "FROM tind_records t JOIN oai_observations o ON o.id=t.observation_id "
            "WHERE t.project_id=? AND (" + where + ")", [project["id"], *[item for value in part for item in (value, value.lower())]])
        for row in cursor:
            if row["identifier"] in seen:
                continue
            seen.add(row["identifier"])
            if len(seen) > 5000:
                raise InputError("Narrow these source identities; they select more than 5,000 possible original records")
            observation = decode(row["original_body"])
            found = {}
            for token in source_tokens(observation):
                for case_id in wanted.get(token, ()):
                    found.setdefault(case_id, set()).add(token)
            title = decode(row["record_body"]).get("title", row["identifier"])
            for case_id, reasons in found.items():
                result[case_id].append({"identifier": row["identifier"], "observationId": row["observation_id"],
                    "title": title, "sourceStatus": observation["status"],
                    "matched": [{"kind": kind, "value": value} for kind, value in sorted(reasons)]})
    for value in result.values():
        value.sort(key=lambda item: item["identifier"])
    return result

def name_key(value):
    return " ".join(sorted(re.findall(r"[^\W_]+", value.casefold(), re.UNICODE)))

def supplements(source, case):
    record, changes, warnings = deepcopy(source), [], []
    for person in case["people"]:
        aliases = {name_key(value) for value in [person["name"], *person.get("aliases", [])]}
        matching = [field for field in record["fields"] if field["tag"] in {"100", "700"} and
                    any(sub["code"] == "a" and name_key(sub["value"]) in aliases for sub in field.get("subfields", []))]
        if len(matching) > 1:
            warnings.append("Review repeated existing name entries for " + person["name"] + "; all original entries remain in the proposed record.")
            continue
        if matching:
            field = matching[0]
        else:
            tag = "100" if person.get("mainEntry") and not any(f["tag"] == "100" for f in record["fields"]) else "700"
            field = {"tag": tag, "ind1": person.get("nameIndicator", "1" if "," in person["name"] else "0"),
                     "ind2": " ", "subfields": [{"code": "a", "value": person["name"]}]}
            record["fields"].append(field)
            changes.append("Added " + person["role"] + ": " + person["name"])
        additions = [("e", person["role"])]
        if person.get("orcid"):
            prior = [s["value"] for s in field["subfields"] if s["code"] in {"0", "1"} and "orcid.org/" in s["value"]]
            if prior and person["orcid"] not in prior:
                warnings.append("Resolve the different retained ORCID for " + person["name"] + " in the complete staff record.")
            else:
                additions.append(("1", person["orcid"]))
        if person.get("affiliation"):
            additions.append(("u", person["affiliation"]))
        for code, value in additions:
            if not any(s["code"] == code and s["value"].strip().rstrip(".").casefold() == value.strip().rstrip(".").casefold()
                       for s in field["subfields"]):
                field["subfields"].append({"code": code, "value": value})
                changes.append("Added " + code + " to " + person["name"] + ": " + value)
    present = {canonical(field) for field in record["fields"]}
    for field in case["fields"]:
        key = canonical(field)
        if key not in present:
            record["fields"].append(deepcopy(field)); present.add(key)
            changes.append("Added source " + field["tag"] + " field")
    return normalize_record(record), changes, warnings

def case_tables(workspace):
    workspace.db.executescript("""
        CREATE TABLE IF NOT EXISTS tind_source_cases(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tind_source_case_reviews(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,
            collection_id TEXT NOT NULL,body TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS tind_case_review_history ON tind_source_case_reviews(project_id,collection_id);
    """)

def collection(workspace, project_id, identity):
    item = workspace._get("tind_source_cases", identity)
    if item["projectId"] != project_id:
        raise InputError("Choose the source cases in this migration")
    pack = decode(workspace.object_path(item.get("normalized", item["original"])).read_bytes())
    return item, pack

def referenced_case(workspace, project_id, reference):
    if not isinstance(reference, dict) or set(reference) != {"collectionId", "caseId"}:
        raise InputError("A source supplement retains its collectionId and caseId")
    _, pack = collection(workspace, project_id, reference["collectionId"])
    case = next((item for item in pack["cases"] if item["caseId"] == reference["caseId"]), None)
    if case is None:
        raise InputError("Choose a retained source case for this supplement")
    return case

def import_cases(workspace, project, value, operation):
    if set(value) != {"document"}:
        raise InputError("Receive the complete source-case document")
    pack = normalize_pack(value["document"])
    candidates = matches(workspace, project, pack)
    identity = sha(jbytes(["tind-source-cases", operation]))
    item = {"schema": "stellar-forge.tind-source-case-intake.v1", "id": identity, "projectId": project["id"],
            "title": pack["title"], "observedOn": pack["observedOn"], "receivedAt": stamp(),
            "editionId": project["editionId"], "original": workspace.object(jbytes(value["document"])),
            "normalized": workspace.object(jbytes(pack)),
            "caseCount": len(pack["cases"]), "matches": candidates,
            "matchedCount": sum(len(rows) == 1 for rows in candidates.values()),
            "unmatchedCount": sum(not rows for rows in candidates.values()),
            "ambiguousCount": sum(len(rows) > 1 for rows in candidates.values())}
    workspace.db.execute("INSERT INTO tind_source_cases VALUES(?,?,?)", (identity, project["id"], jbytes(item).decode()))
    return {key: value for key, value in item.items() if key != "matches"}

def list_collections(workspace, project_id, offset=0, limit=50):
    page_values(offset, limit)
    workspace.project(project_id)
    total = workspace.db.execute("SELECT COUNT(*) FROM tind_source_cases WHERE project_id=?", (project_id,)).fetchone()[0]
    rows = workspace.db.execute("SELECT body FROM tind_source_cases WHERE project_id=? ORDER BY rowid DESC LIMIT ? OFFSET ?",
                                (project_id, limit, offset))
    items = [{key: value for key, value in decode(row[0]).items() if key != "matches"} for row in rows]
    return {"items": items, "offset": offset, "total": total, "next": offset + len(items) if offset + len(items) < total else None}

def view_collection(workspace, project_id, identity):
    item, pack = collection(workspace, project_id, identity)
    project = workspace.project(project_id)
    candidates = item["matches"] if item["editionId"] == project["editionId"] else matches(workspace, project, pack)
    return {**item, "matches": candidates, "document": pack, "currentEditionId": project["editionId"],
            "revision": project["revision"]}

def plan_case(workspace, project_id, identity, case_id, identifier, item=None):
    item = item if item is not None else view_collection(workspace, project_id, identity)
    case = next((case for case in item["document"]["cases"] if case["caseId"] == case_id), None)
    candidates = item["matches"].get(case_id, [])
    if case is None or identifier not in {candidate["identifier"] for candidate in candidates}:
        raise InputError("Bind this source case to one of its actual original record matches")
    project = workspace.project(project_id)
    view = workspace.preview(project, identifier)
    if view["sourceStatus"] == "deleted":
        raise InputError("Review this explicit source deletion in Records and decisions")
    staff = deepcopy(view["staff"])
    staff.setdefault("action", "migrate")
    staff.setdefault("reviewer", "")
    staff.setdefault("note", "")
    if case.get("proposedAccess") is not None:
        staff["access"] = deepcopy(case["proposedAccess"])
    else:
        staff.setdefault("access", deepcopy(view["access"]))
    staff["hierarchy"] = {**staff.get("hierarchy", {}), **case["proposedHierarchy"]}
    # Recreate hierarchy from the original mapping before supplementing an existing editable override.
    source = deepcopy(view["source"])
    if case["proposedHierarchy"]:
        from marc import mapped_record
        observation = workspace.ws.observation(view["observationId"])
        hierarchy_fields = [field for field in mapped_record(observation, project["profile"], staff)["fields"] if field["tag"] == "773"]
        existing = {canonical(field) for field in source["fields"]}
        source["fields"].extend(field for field in hierarchy_fields if canonical(field) not in existing)
    staff["sourceSupplement"] = {"collectionId": identity, "caseId": case_id}
    staff["mappedOverride"], changes, warnings = supplements(source, case)
    return {"collectionId": identity, "revision": project["revision"], "case": case,
            "currentStaff": view["staff"], "currentSource": view["source"], "changes": changes, "warnings": warnings,
            "currentFiles": view["files"],
            "review": {"caseId": case_id, "identifier": identifier, "observationId": view["observationId"], "staff": staff,
                "filePolicies": [{"fileId": entry["id"], "sha256": entry["sha256"], "bytes": entry["bytes"],
                    "role": entry["role"], "access": deepcopy(case.get("proposedAccess") or entry["access"]), "apply": False}
                    for entry in view["files"]]}}

def review_cases(workspace, project, value, operation):
    if set(value) != {"collectionId", "records"} or not isinstance(value["records"], list) or not 1 <= len(value["records"]) <= MAX_CASES:
        raise InputError("Choose the source collection and 1–250 complete reviewed records")
    item = view_collection(workspace, project["id"], value["collectionId"])
    cases, seen_cases, seen_records = {case["caseId"]: case for case in item["document"]["cases"]}, set(), set()
    retained = []
    for row in value["records"]:
        if not isinstance(row, dict) or set(row) - {"caseId", "identifier", "observationId", "staff", "filePolicies"} or not {"caseId", "identifier", "observationId", "staff"} <= set(row):
            raise InputError("A case decision retains caseId, identifier, observationId and complete staff")
        case_id, identifier = row["caseId"], row["identifier"]
        if case_id not in cases or case_id in seen_cases or identifier in seen_records:
            raise InputError("Choose one actual source record per distinct case in this operation")
        seen_cases.add(case_id); seen_records.add(identifier)
        if identifier not in {candidate["identifier"] for candidate in item["matches"][case_id]}:
            raise InputError("The selected case and original record identity do not match")
        original, body = workspace._record_row(project, identifier)
        if original["observation_id"] != row["observationId"]:
            raise InputError("The original source observation changed; reopen the source case")
        before = deepcopy(body.get("staff", {}))
        if not isinstance(row["staff"], dict):
            raise InputError("Keep the complete editable staff object")
        staff = deepcopy(row["staff"])
        expected_supplement = {"collectionId": item["id"], "caseId": case_id}
        if staff.get("sourceSupplement") != expected_supplement:
            raise InputError("Keep the original source-case reference on its complete reviewed staff record")
        observation = workspace.ws.observation(row["observationId"])
        automatic, _ = workspace._mapped_source(project, observation, staff)
        if staff.get("mappedOverride") is not None and canonical(normalize_record(staff["mappedOverride"])) == canonical(automatic):
            staff["mappedOverride"] = None
        result = workspace._review(project, {"identifier": identifier, "staff": staff}, operation)
        policies = row.get("filePolicies", [])
        if not isinstance(policies, list) or len(policies) > 5000:
            raise InputError("Use at most 5,000 selected file policies per source record")
        selected_files, policy_ids = [], set()
        for policy in policies:
            if not isinstance(policy, dict) or set(policy) != {"fileId", "sha256", "bytes", "role", "access", "apply"} or type(policy["apply"]) is not bool:
                raise InputError("A file policy retains fileId, sha256, bytes, role, access and an explicit apply choice")
            if policy["fileId"] in policy_ids:
                raise InputError("A source-case decision repeats a file")
            policy_ids.add(policy["fileId"])
            if not policy["apply"]:
                continue
            saved = workspace.db.execute("SELECT body FROM tind_files WHERE project_id=? AND identifier=? AND id=?",
                                          (project["id"], identifier, policy["fileId"])).fetchone()
            if saved is None:
                raise InputError("Choose an original file retained on this case record")
            entry = decode(saved["body"])
            if (entry["sha256"], entry["bytes"]) != (policy["sha256"], policy["bytes"]):
                raise InputError("The original case file changed; prepare its current policy again")
            before_policy = {"role": entry["role"], "access": deepcopy(entry["access"])}
            entry["role"] = plain(policy["role"], "reviewed source file role", 256)
            entry["access"] = access(policy["access"])
            source_file = {key: value for key, value in entry.items() if key not in {"verified", "destination"}}
            workspace._files(project, {"files": [source_file]}, operation)
            selected_files.append({"fileId": entry["id"], "sha256": entry["sha256"], "bytes": entry["bytes"],
                                   "before": before_policy, "role": entry["role"], "access": entry["access"]})
        retained.append({"caseId": case_id, "identifier": identifier, "observationId": row["observationId"],
                         "beforeStaff": before, "staff": result["staff"], "filePolicies": selected_files})
    identity = sha(jbytes(["tind-source-case-review", operation]))
    document = {"schema": "stellar-forge.tind-source-case-review.v1", "id": identity, "projectId": project["id"],
                "collectionId": item["id"], "collectionOriginal": item["original"], "operationId": operation,
                "editionId": project["editionId"], "reviewedAt": stamp(), "records": retained}
    record = {key: value for key, value in document.items() if key != "records"}
    record["recordCount"] = len(retained)
    record["original"] = workspace.object(jbytes(document))
    workspace.db.execute("INSERT INTO tind_source_case_reviews VALUES(?,?,?,?)",
                         (identity, project["id"], item["id"], jbytes(record).decode()))
    return record

def reviews(workspace, project_id, collection_id, offset=0, limit=50):
    page_values(offset, limit)
    collection(workspace, project_id, collection_id)
    total = workspace.db.execute("SELECT COUNT(*) FROM tind_source_case_reviews WHERE project_id=? AND collection_id=?",
                                 (project_id, collection_id)).fetchone()[0]
    rows = workspace.db.execute("SELECT body FROM tind_source_case_reviews WHERE project_id=? AND collection_id=? ORDER BY rowid DESC LIMIT ? OFFSET ?",
                                (project_id, collection_id, limit, offset))
    items = [decode(row[0]) for row in rows]
    return {"items": items, "offset": offset, "total": total, "next": offset + len(items) if offset + len(items) < total else None}

def review_document(workspace, project_id, identity):
    item = workspace._get("tind_source_case_reviews", identity)
    if item["projectId"] != project_id:
        raise InputError("Choose a source-case review in this migration")
    result = decode(workspace.object_path(item["original"]).read_bytes())
    result["sourceCases"] = decode(workspace.object_path(result["collectionOriginal"]).read_bytes())
    return result

def plan_many(workspace, project_id, identity, choices):
    if not isinstance(choices, list) or not 1 <= len(choices) <= MAX_CASES:
        raise InputError("Choose 1–250 cases to prepare for staff review")
    item = view_collection(workspace, project_id, identity)
    seen_cases, seen_records, plans = set(), set(), []
    for choice in choices:
        if not isinstance(choice, dict) or set(choice) != {"caseId", "identifier"}:
            raise InputError("Each choice contains caseId and its actual original identifier")
        if choice["caseId"] in seen_cases or choice["identifier"] in seen_records:
            raise InputError("Choose distinct cases and original records")
        seen_cases.add(choice["caseId"]); seen_records.add(choice["identifier"])
        plans.append(plan_case(workspace, project_id, identity, choice["caseId"], choice["identifier"], item))
    return {"collectionId": identity, "revision": item["revision"], "plans": plans,
            "input": {"collectionId": identity, "records": [plan["review"] for plan in plans]}}
