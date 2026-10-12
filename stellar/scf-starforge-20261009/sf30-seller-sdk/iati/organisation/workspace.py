"""MIT. Organisation plans, immutable review and release in the original IatiWorkspace."""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime, timezone
import csv
import html
import io
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
from iati_source import InputError
from workspace import json_bytes, load_json, digest, checked_id, private_write, regular, file_digest, sync_dir
from publishing import REQUEST, csv_cell
from publishing_xml import text, MAX_EDIT_SOURCE
from .xml import OrganisationDocument, apply_edits
from .assessment import analyse, assessment_input, comparable_context, decimal_text
from .validation import code_lists, definition, validate_source

SCHEMA = "stellar-forge.iati-organisation-plan.v1"
MAX_METADATA = 64 * 1024 * 1024
KIND = {"source": ("application/xml", ".xml"), "candidate": ("application/xml", ".xml"),
        "report": ("text/html; charset=utf-8", ".html"), "budgets": ("text/csv; charset=utf-8", ".csv"),
        "documents": ("text/csv; charset=utf-8", ".csv")}
SAVE_FIELDS = {"requestId", "id", "expectedRevision", "name", "sourceId", "organisationKeys",
               "assessment", "acquisition", "edits", "notes", "actor"}
BINDING_FIELDS = ("name", "sourceId", "candidateSha256", "organisationKeys", "assessment", "acquisition",
                  "edits", "notes", "definition", "analysis", "sourceAnalysis", "validation")

def revision(value):
    if type(value) is not int or value < 1:
        raise InputError("Select a positive integer organisation revision")
    return value

def acquisition_input(raw):
    if raw is None:
        return {}
    if not isinstance(raw, dict) or set(raw) - {"sourceUrl", "retrievedAt", "licenceUrl", "licence", "notes"}:
        raise InputError("Unknown organisation acquisition fields")
    for key, value in raw.items():
        text(value, "Acquisition " + key, 32000, True)
        if key in {"sourceUrl", "licenceUrl"} and value:
            try:
                url = urlsplit(value)
                valid = url.scheme.lower() in {"http", "https"} and bool(url.hostname) and not url.username and not url.password
            except ValueError:
                valid = False
            if not valid:
                raise InputError("Use an original public HTTP(S) acquisition or licence URL")
    return deepcopy(raw)

def actor(raw, required=False):
    value = text(raw.get("actor", ""), "Named organisation operator", 160, not required)
    return value.strip()

def binding(plan):
    return digest(json_bytes({k: plan[k] for k in BINDING_FIELDS}))

def csv_data(rows, fields):
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: csv_cell(row.get(k, "")) for k in fields})
    return out.getvalue().encode()

def object_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)

def report_html(plan, baseline, candidate):
    esc = lambda x: html.escape(str(x if x is not None else ""), quote=True)
    parts = ["<!doctype html><html lang='en'><meta charset='utf-8'><title>Organisation planning review</title>",
        "<meta name='viewport' content='width=device-width,initial-scale=1'><style>body{font:15px system-ui;color:#202020;background:#fff;margin:2rem auto;padding:0 1rem;max-width:1100px}h1,h2{line-height:1.15}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #bbb;text-align:left;padding:8px;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:1rem}section{margin:2rem 0}.scroll{overflow:auto}td{min-width:80px}code{overflow-wrap:anywhere}summary{cursor:pointer}a{color:#222}@media print{details{display:block}.scroll{overflow:visible}body{max-width:none}tr{break-inside:avoid}}</style><body>",
        "<h1>" + esc(plan["name"]) + "</h1><p>Plan <code>" + esc(plan["id"]) + "</code>, revision " +
        str(plan["revision"]) + " · " + esc(plan["state"]) + "</p>",
        "<p>Assessment " + esc(plan["assessment"]["asOf"]) + " · " + esc(plan["assessment"]["methodology"]) +
        ". Original financial text and distinct monetary contexts are retained. This is an operator review, with no official Index score.</p>",
        "<h2>Source and acquisition</h2><pre>" + esc(object_text({"sourceId": plan["sourceId"],
            "candidateSha256": plan["candidateSha256"], "acquisition": plan["acquisition"],
            "definition": {"schemaManifestSha256": plan["definition"]["schemaManifestSha256"],
                           "methodologySha256": plan["definition"]["methodologySha256"]}})) + "</pre>"]
    for view, data in (("Source", baseline), ("Candidate", candidate)):
        parts += ["<section><h2>" + view + " organisation identity</h2>"]
        for org in data["organisations"]:
            if org["key"] in plan["organisationKeys"]:
                parts.append("<h3>" + esc(org["identifier"] or org["key"]) + "</h3><pre>" + esc(object_text(org)) + "</pre>")
        parts += ["<h2>" + view + " budgets and expenditure</h2><div class='scroll'><table><thead><tr>" +
            "".join("<th>" + x + "</th>" for x in ("Organisation", "Family / recipient", "Period", "Original amount", "Currency / status", "Complete record")) +
            "</tr></thead><tbody>"]
        for r in data["budgets"]:
            if r["organisationKey"] not in plan["organisationKeys"]:
                continue
            cells = [r["organisationKey"], r["family"] + " " + object_text(r["recipient"]),
                     object_text(r["period"]), r["value"]["text"],
                     object_text({"currency": r["value"]["currency"], "status": r["status"], "valueDate": r["value"]["valueDate"]})]
            parts.append("<tr>" + "".join("<td>" + esc(x) + "</td>" for x in cells) +
                         "<td><details><summary>Values, lines and findings</summary><pre>" + esc(object_text(r)) + "</pre></details></td></tr>")
        parts += ["</tbody></table></div><h2>" + view + " organisation documents</h2>"]
        for r in data["documents"]:
            if r["organisationKey"] in plan["organisationKeys"]:
                parts.append("<h3>" + esc(" | ".join(x["text"] for x in r["titles"]) or r["id"]) +
                    "</h3><p>Published URL: <code>" + esc(r["url"]) + "</code>. Access/content were not fetched by this report.</p><pre>" +
                    esc(object_text(r)) + "</pre>")
        parts.append("</section>")
    parts += ["<section><h2>Complete assessment evidence</h2><pre>" + esc(object_text(candidate["summary"])) +
        "</pre><h2>Complete source findings</h2><pre>" + esc(object_text(candidate["issues"])) +
        "</pre><h2>Validation and review</h2><pre>" + esc(object_text({"validation": plan["validation"],
        "review": plan["review"], "release": plan["release"], "notes": plan["notes"]})) +
        "</pre><h2>Exact corrections</h2><pre>" + esc(object_text(plan["changes"])) + "</pre></section>",
        "<p>IATI Standard (http://iatistandard.org/). The portable packet retains original schema, codelist, methodology and licence sources.</p></body></html>"]
    return "".join(parts).encode()

class OrganisationPlanner:
    def __init__(self, original_iati_workspace):
        self.ws = original_iati_workspace
        self.root = self.ws.root / "organisation"
        self.root.mkdir(mode=0o700, exist_ok=True)
        self.assets = self.root / "assets"
        self.assets.mkdir(mode=0o700, exist_ok=True)
        for path in (self.root, self.assets):
            if path.is_symlink() or path.resolve() != path:
                raise InputError("Organisation storage must remain inside the original real workspace")
        self.ws.db.executescript("""
          CREATE TABLE IF NOT EXISTS iati_organisation_plans(
            id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id,revision));
          CREATE TABLE IF NOT EXISTS iati_organisation_requests(
            id TEXT PRIMARY KEY, input_sha TEXT NOT NULL, action TEXT NOT NULL, input TEXT NOT NULL,
            plan TEXT NOT NULL, revision INTEGER NOT NULL, result TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS iati_organisation_comparisons(id TEXT PRIMARY KEY, body TEXT NOT NULL);
        """)

    def _now(self):
        return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    def _source(self, source_id):
        self.ws.source(checked_id(source_id))
        path = self.ws.root / "sources" / (source_id + ".iati")
        if file_digest(path, MAX_EDIT_SOURCE) != source_id:
            raise InputError("Retained organisation source identity changed")
        return path.read_bytes()

    def _remember_source(self, raw, label):
        value = self.ws.add_source(io.BytesIO(raw), label, "organisation-" + digest(raw) + ".xml")
        if value["id"] != digest(raw):
            raise InputError("Original source intake returned a different identity")
        return value["id"]

    def _retain(self, raw, name, media):
        if not isinstance(raw, bytes) or len(raw) > MAX_METADATA:
            raise InputError("A complete organisation report or analysis exceeds 64 MiB")
        key = digest(raw)
        path = self.assets / (key + ".bin")
        if path.exists() or path.is_symlink():
            if file_digest(path, MAX_METADATA) != key:
                raise InputError("A retained organisation asset differs from its identity")
        else:
            # Original scratch/private-write/rename custody publishes only complete bytes.
            with self.ws.scratch() as temp:
                staged = temp / "asset.bin"
                private_write(staged, raw)
                os.replace(staged, path)
                sync_dir(self.assets)
        return {"sha256": key, "bytes": len(raw), "name": name, "media": media}

    def _asset_bytes(self, descriptor):
        path = self.assets / (checked_id(descriptor["sha256"]) + ".bin")
        if file_digest(path, MAX_METADATA) != descriptor["sha256"] or path.stat().st_size != descriptor["bytes"]:
            raise InputError("An immutable organisation report or analysis changed")
        return path.read_bytes()

    def _analysis(self, descriptor):
        return load_json(self._asset_bytes(descriptor))

    def _definition(self):
        return definition()

    def _validate(self, raw):
        return validate_source(raw)

    def _decode_plan(self, raw):
        p = load_json(raw)
        if not isinstance(p, dict) or p.get("schema") != SCHEMA:
            raise InputError("Unknown organisation plan schema")
        checked_id(p.get("id")); revision(p.get("revision"))
        seal = p.get("recordSha256")
        unsigned = {k: v for k, v in p.items() if k != "recordSha256"}
        if seal != digest(json_bytes(unsigned)):
            raise InputError("An immutable organisation revision changed")
        return p

    def plan(self, ident, revision=None):
        checked_id(ident)
        with self.ws.mutex:
            if revision is None:
                row = self.ws.db.execute("SELECT body FROM iati_organisation_plans WHERE id=? ORDER BY revision DESC LIMIT 1", (ident,)).fetchone()
            else:
                row = self.ws.db.execute("SELECT body FROM iati_organisation_plans WHERE id=? AND revision=?",
                                        (ident, globals()["revision"](revision))).fetchone()
            if row is None:
                raise InputError("Unknown retained organisation plan revision")
            return self._decode_plan(row["body"])

    def history(self, ident):
        self.plan(ident)
        with self.ws.mutex:
            return [self._decode_plan(r["body"]) for r in self.ws.db.execute(
                "SELECT body FROM iati_organisation_plans WHERE id=? ORDER BY revision", (ident,))]

    def status(self):
        with self.ws.mutex:
            plans = [self._decode_plan(r["body"]) for r in self.ws.db.execute("""
              SELECT p.body FROM iati_organisation_plans p JOIN
              (SELECT id,MAX(revision) revision FROM iati_organisation_plans GROUP BY id) q
              ON p.id=q.id AND p.revision=q.revision ORDER BY p.id""")]
            sources = []
            for row in self.ws.db.execute("SELECT * FROM sources ORDER BY created DESC"):
                value = dict(row)
                value["inventory"] = load_json(value["inventory"])
                if value["inventory"].get("kind") == "organisation" or value["inventory"].get("schema") == "stellar-forge.iati-organisation-inventory.v1":
                    sources.append(value)
            return {"workspaceSha256": self.ws.publishing.context()["workspaceSha256"],
                    "plans": plans, "sources": sources}

    def profile(self, sourceId):
        with self.ws.mutex:
            document = OrganisationDocument(self._source(sourceId), sourceId)
            profile = document.profile()
            source = self.ws.source(sourceId)
            profile["source"] = {k: source[k] for k in ("id", "label", "name", "bytes", "created")}
            return profile

    def _result(self, selected):
        if selected["kind"] == "comparison":
            return self._comparison(selected["id"])
        plan = self.plan(selected["id"], selected["revision"])
        if selected["kind"] == "release":
            return {"plan": plan, "release": plan["release"], "files": self._files(plan)}
        return plan

    def request(self, requestId):
        if not isinstance(requestId, str) or not REQUEST.fullmatch(requestId):
            raise InputError("Use the original stable request identifier")
        with self.ws.mutex:
            row = self.ws.db.execute("SELECT * FROM iati_organisation_requests WHERE id=?", (requestId,)).fetchone()
            if row is None:
                return {"requestId": requestId, "state": "NOT_RECORDED"}
            selected = load_json(row["result"])
            result = self._result(selected)
            plan = result.get("plan") if selected["kind"] == "release" else (result if selected["kind"] == "plan" else self.plan(row["plan"], row["revision"]))
            return {"requestId": requestId, "state": "RECORDED", "input": load_json(row["input"]),
                    "action": row["action"], "plan": plan, "result": result}

    def _request(self, action, raw, allowed):
        if not isinstance(raw, dict) or set(raw) - allowed:
            raise InputError("Unknown organisation " + action + " input fields")
        key = raw.get("requestId")
        if not isinstance(key, str) or not REQUEST.fullmatch(key):
            raise InputError("Use a stable original requestId of 1 to 160 identifier characters")
        body = json_bytes(raw)
        if len(body) > MAX_METADATA:
            raise InputError("Complete organisation request exceeds 64 MiB")
        prior = self.ws.db.execute("SELECT * FROM iati_organisation_requests WHERE id=?", (key,)).fetchone()
        if prior:
            if prior["input_sha"] != digest(body) or prior["action"] != action:
                raise InputError("This requestId belongs to a different complete input")
            return self._result(load_json(prior["result"]))
        return None

    def _previous(self, raw, creating=False):
        if creating and raw.get("id") is None:
            if raw.get("expectedRevision") is not None:
                raise InputError("A new plan has no previous revision")
            return None
        p = self.plan(raw.get("id"))
        if type(raw.get("expectedRevision")) is not int or raw["expectedRevision"] != p["revision"]:
            raise InputError("The organisation plan changed; reopen its latest revision")
        return p

    def _files(self, p):
        files = {}
        for kind in ("source", "candidate"):
            sid = p["sourceId"] if kind == "source" else p["candidateSha256"]
            raw = self._source(sid)
            files[kind] = {"path": str(self.ws.root / "sources" / (sid + ".iati")),
                "name": "organisation-" + kind + "-" + sid + ".xml", "media": KIND[kind][0],
                "bytes": len(raw), "sha256": sid}
        for kind, descriptor in p["files"].items():
            self._asset_bytes(descriptor)
            files[kind] = {**descriptor, "path": str(self.assets / (descriptor["sha256"] + ".bin"))}
        return files

    def file(self, raw):
        if not isinstance(raw, dict) or set(raw) - {"id", "revision", "kind"} or raw.get("kind") not in KIND:
            raise InputError("Select a retained source, candidate, report, budgets or documents file")
        with self.ws.mutex:
            return self._files(self.plan(raw.get("id"), raw.get("revision")))[raw["kind"]]

    def _finish(self, value, previous, raw, action, now):
        ident = previous["id"] if previous else digest(json_bytes({"sourceId": value["sourceId"], "requestId": raw["requestId"]}))
        number = previous["revision"] + 1 if previous else 1
        value.update(schema=SCHEMA, id=ident, revision=number,
            previousRevision=previous["revision"] if previous else None,
            previousSha256=previous["recordSha256"] if previous else None,
            createdAt=previous["createdAt"] if previous else now, updatedAt=now,
            lastAction={"kind": action, "requestId": raw["requestId"], "actor": actor(raw), "at": now})
        baseline, candidate = self._analysis(value["sourceAnalysis"]), self._analysis(value["analysis"])
        budget_rows, document_rows = [], []
        for view, data in (("source", baseline), ("candidate", candidate)):
            for r in data["budgets"]:
                if r["organisationKey"] in value["organisationKeys"]:
                    budget_rows.append({"view": view, "row_id": r["id"], "organisation_key": r["organisationKey"],
                        "family": r["family"], "period_start": r["period"]["start"], "period_end": r["period"]["end"],
                        "original_value": r["value"]["text"], "currency": r["value"]["currency"],
                        "value_date": r["value"]["valueDate"], "status": r["status"]["effective"],
                        "record_json": object_text(r)})
            for r in data["documents"]:
                if r["organisationKey"] in value["organisationKeys"]:
                    document_rows.append({"view": view, "row_id": r["id"], "organisation_key": r["organisationKey"],
                        "url": r["url"], "format": r["format"], "titles_json": object_text(r["titles"]),
                        "categories_json": object_text(r["categories"]), "record_json": object_text(r)})
        stem = "organisation-" + ident + "-r" + str(number)
        value["files"] = {
            "budgets": self._retain(csv_data(budget_rows, ["view", "row_id", "organisation_key", "family", "period_start", "period_end", "original_value", "currency", "value_date", "status", "record_json"]), stem + "-budgets.csv", KIND["budgets"][0]),
            "documents": self._retain(csv_data(document_rows, ["view", "row_id", "organisation_key", "url", "format", "titles_json", "categories_json", "record_json"]), stem + "-documents.csv", KIND["documents"][0]),
        }
        value["files"]["report"] = self._retain(report_html(value, baseline, candidate), stem + ".html", KIND["report"][0])
        value.pop("recordSha256", None)
        value["recordSha256"] = digest(json_bytes(value))
        if len(json_bytes(value)) > MAX_METADATA:
            raise InputError("The complete organisation revision exceeds 64 MiB")
        return value

    def _make_save(self, raw, previous, now):
        source_id = checked_id(raw.get("sourceId"))
        source = self._source(source_id)
        selected = raw.get("organisationKeys")
        if not isinstance(selected, list) or not selected or len(selected) > 100000 or any(not isinstance(x, str) for x in selected) or len(set(selected)) != len(selected):
            raise InputError("Select distinct original organisation keys")
        for key in selected:
            checked_id(key)
        assessment = assessment_input(raw.get("assessment"))
        acquisition = acquisition_input(raw.get("acquisition"))
        edits = raw.get("edits", [])
        if previous and previous["sourceId"] != source_id and edits:
            raise InputError("When selecting a new original source, save it with cleared prior edits first")
        candidate, changes = apply_edits(source, source_id, selected, edits)
        self._remember_source(candidate, "Organisation candidate")
        codes = code_lists()
        base_doc = OrganisationDocument(source, source_id)
        candidate_doc = OrganisationDocument(candidate, source_id)
        base_analysis = analyse(base_doc, assessment, selected, codes)
        candidate_analysis = base_analysis if candidate == source else analyse(candidate_doc, assessment, selected, codes)
        source_asset = self._retain(json_bytes(base_analysis), "organisation-source-analysis.json", "application/json")
        candidate_asset = source_asset if candidate_analysis is base_analysis else self._retain(json_bytes(candidate_analysis), "organisation-candidate-analysis.json", "application/json")
        value = {"name": text(raw.get("name"), "Organisation plan name", 160), "sourceId": source_id,
            "candidateSha256": digest(candidate), "organisationKeys": deepcopy(selected), "assessment": assessment,
            "acquisition": acquisition, "edits": deepcopy(edits), "changes": changes,
            "notes": text(raw.get("notes", ""), "Organisation plan notes", 32000, True),
            "sourceAnalysis": source_asset, "analysis": candidate_asset, "summary": candidate_analysis["summary"],
            "definition": self._definition(), "validation": self._validate(candidate),
            "review": None, "release": None, "state": "DRAFT", "lastEditor": actor(raw)}
        return self._finish(value, previous, raw, "save", now)

    def _make_review(self, raw, previous, now):
        who = actor(raw, True)
        decision = raw.get("decision")
        if decision not in {"approve", "request_changes"}:
            raise InputError("Choose approve or request_changes")
        note = text(raw.get("note"), "Review decision and evidence", 32000)
        acknowledgements = raw.get("acknowledgedIssueIds", [])
        if not isinstance(acknowledgements, list) or any(not isinstance(x, str) for x in acknowledgements) or len(set(acknowledgements)) != len(acknowledgements):
            raise InputError("Use distinct exact issue IDs for review acknowledgements")
        analysis = self._analysis(previous["analysis"])
        findings = {x["id"]: x for x in analysis["issues"]}
        if any(not isinstance(x, str) or x not in findings for x in acknowledgements):
            raise InputError("A review acknowledgement is not a finding in this exact candidate")
        if decision == "approve":
            if previous["validation"]["state"] != "VALID":
                raise InputError("Approval requires actual VALID original organisation XSD validation")
            if any(x["severity"] == "error" for x in findings.values()):
                raise InputError("Correct all complete-source errors before approving this release")
            required = {x["id"] for x in findings.values() if x["severity"] == "review"}
            if required - set(acknowledgements):
                raise InputError("Acknowledge every retained review finding explicitly")
        value = deepcopy(previous)
        review_id = digest(json_bytes({"request": raw, "binding": binding(previous)}))
        value["review"] = {"id": review_id, "decision": decision, "actor": who, "note": note,
            "acknowledgedIssueIds": deepcopy(acknowledgements), "at": now,
            "reviewedRevision": previous["revision"], "candidateSha256": previous["candidateSha256"],
            "definitionSha256": binding(previous), "schemaManifestSha256": previous["definition"]["schemaManifestSha256"]}
        value["release"] = None
        value["state"] = "REVIEWED" if decision == "approve" else "CHANGES_REQUESTED"
        return self._finish(value, previous, raw, "review", now)

    def _make_release(self, raw, previous, now):
        accepted = previous["review"]
        if previous["state"] != "REVIEWED" or not accepted or accepted["decision"] != "approve" or raw.get("reviewId") != accepted["id"]:
            raise InputError("Release the exact accepted review of this saved candidate")
        if accepted["definitionSha256"] != binding(previous):
            raise InputError("The reviewed candidate, acquisition or assessment binding changed")
        current_definition = self._definition()
        if current_definition != previous["definition"]:
            raise InputError("Installed schema/methodology changed; save and review a new exact revision")
        validation = self._validate(self._source(previous["candidateSha256"]))
        if validation["state"] != "VALID":
            raise InputError("The original current runtime must validate this complete candidate before release")
        value = deepcopy(previous)
        value["state"] = "RELEASED"
        value["release"] = {"id": digest(json_bytes({"plan": previous["id"], "revision": previous["revision"], "request": raw})),
            "reviewId": accepted["id"], "candidateSha256": previous["candidateSha256"],
            "definitionSha256": binding(previous), "releasedAt": now, "releasedBy": actor(raw),
            "validation": validation, "publicationState": "READY_FOR_PUBLISHER", "published": False}
        return self._finish(value, previous, raw, "release", now)

    def _act(self, action, raw, allowed):
        with self.ws.mutex:
            replayed = self._request(action, raw, allowed)
            if replayed is not None:
                return replayed
            previous = self._previous(raw, action == "save")
            now = self._now()
            value = {"save": self._make_save, "review": self._make_review, "release": self._make_release}[action](raw, previous, now)
            selected = {"kind": "release" if action == "release" else "plan", "id": value["id"], "revision": value["revision"]}
            with self.ws.db:
                if previous:
                    actual = self.ws.db.execute("SELECT MAX(revision) FROM iati_organisation_plans WHERE id=?", (value["id"],)).fetchone()[0]
                    if actual != previous["revision"]:
                        raise InputError("Organisation work changed during preparation")
                self.ws.db.execute("INSERT INTO iati_organisation_plans VALUES(?,?,?)",
                    (value["id"], value["revision"], json_bytes(value).decode()))
                self.ws.db.execute("INSERT INTO iati_organisation_requests VALUES(?,?,?,?,?,?,?)",
                    (raw["requestId"], digest(json_bytes(raw)), action, json_bytes(raw).decode(),
                     value["id"], value["revision"], json_bytes(selected).decode()))
            return self._result(selected)

    def save(self, raw):
        return self._act("save", raw, SAVE_FIELDS)

    def review(self, raw):
        return self._act("review", raw, {"requestId", "id", "expectedRevision", "decision", "actor", "note", "acknowledgedIssueIds"})

    def release(self, raw):
        return self._act("release", raw, {"requestId", "id", "expectedRevision", "reviewId", "actor"})

    def _selection(self, raw):
        if raw.get("sourceId") is not None:
            if raw.get("id") is not None or raw.get("revision") is not None or raw.get("view", "source") != "source":
                raise InputError("Choose original sourceId or an explicit saved-plan snapshot")
            sid = checked_id(raw["sourceId"])
            document = OrganisationDocument(self._source(sid), sid)
            profile = document.profile()
            data = {"organisations": profile["organisations"], "budgets": document.budgets,
                    "documents": document.documents, "issues": document.issues}
            snapshot = digest(json_bytes({"sourceId": sid, "view": "source"}))
            keys = list(document.org_nodes)
        else:
            if "revision" not in raw:
                raise InputError("Select an explicit immutable plan revision for record browsing")
            p = self.plan(raw.get("id"), raw.get("revision"))
            view = raw.get("view", "candidate")
            if view not in {"source", "candidate"}:
                raise InputError("Choose source or candidate record view")
            asset = p["sourceAnalysis"] if view == "source" else p["analysis"]
            data = self._analysis(asset)
            document = OrganisationDocument(self._source(p["sourceId"] if view == "source" else p["candidateSha256"]), p["sourceId"])
            snapshot = digest(json_bytes({"id": p["id"], "revision": p["revision"], "view": view,
                                          "analysisSha256": asset["sha256"], "organisationKeys": p["organisationKeys"]}))
            keys = p["organisationKeys"]
        if raw.get("expectedSnapshot") is not None and raw["expectedSnapshot"] != snapshot:
            raise InputError("The exact record snapshot changed; reopen the selected page")
        return document, data, snapshot, keys

    def rows(self, raw):
        allowed = {"sourceId", "id", "revision", "view", "section", "organisationKey", "offset", "limit", "expectedSnapshot"}
        if not isinstance(raw, dict) or set(raw) - allowed or raw.get("section") not in {"budgets", "documents", "issues"}:
            raise InputError("Select budgets, documents or issues in an exact source snapshot")
        offset, limit = raw.get("offset", 0), raw.get("limit", 50)
        if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 500:
            raise InputError("Use a nonnegative offset and a page size from 1 to 500")
        with self.ws.mutex:
            document, data, snapshot, keys = self._selection(raw)
            org = raw.get("organisationKey")
            if org is not None and org not in document.org_nodes:
                raise InputError("The selected organisation is absent from this snapshot")
            rows = data[raw["section"]]
            if raw["section"] != "issues":
                rows = [r for r in rows if r["organisationKey"] in keys]
            if org is not None:
                rows = [r for r in rows if r.get("organisationKey") == org]
            return {"rows": rows[offset:offset+limit], "total": len(rows), "offset": offset,
                    "limit": limit, "snapshotSha256": snapshot}

    def detail(self, raw):
        allowed = {"sourceId", "id", "revision", "view", "rowId", "organisationKey", "targetId", "expectedSnapshot"}
        if not isinstance(raw, dict) or set(raw) - allowed:
            raise InputError("Use an exact source/candidate row detail selector")
        with self.ws.mutex:
            document, data, snapshot, keys = self._selection(raw)
            value = document.detail(raw.get("rowId"), raw.get("targetId"))
            if value["row"]["organisationKey"] not in keys:
                raise InputError("This row is outside the saved organisation selection")
            if raw.get("organisationKey") is not None and raw["organisationKey"] != value["row"]["organisationKey"]:
                raise InputError("This row belongs to another original organisation")
            enriched = next((r for collection in ("organisations", "budgets", "documents")
                             for r in data[collection] if r["id"] == value["row"]["id"]), value["row"])
            return {**value, "row": enriched, "snapshotSha256": snapshot}

    def _comparison(self, ident):
        row = self.ws.db.execute("SELECT body FROM iati_organisation_comparisons WHERE id=?", (checked_id(ident),)).fetchone()
        if row is None:
            raise InputError("Unknown retained organisation comparison")
        return load_json(row["body"])

    def _make_comparison(self, raw, before, after):
        data_before, data_after = self._analysis(before["analysis"]), self._analysis(after["analysis"])
        left = {r["id"]: r for kind in ("budgets", "documents") for r in data_before[kind] if r["organisationKey"] in before["organisationKeys"]}
        right = {r["id"]: r for kind in ("budgets", "documents") for r in data_after[kind] if r["organisationKey"] in after["organisationKeys"]}
        pairs = raw.get("rowPairs")
        pairing = {"mode": "EXPLICIT", "reason": "Caller-selected one-to-one original rows"}
        if pairs is None:
            shared = 0
            for x, y in zip(before["edits"], after["edits"]):
                if x != y:
                    break
                shared += 1
            divergent = before["changes"][shared:] + after["changes"][shared:]
            # Byte-path identities survive scalar corrections and family-ordered
            # append. Removal or whole-organisation replacement may reassign an
            # ordinal to another original row, so require explicit pairing.
            structural = any(c["operation"] == "remove" or
                (c["operation"] == "replace" and re.fullmatch(
                    r"/iati-organisations\[1\]/iati-organisation\[[1-9][0-9]*\]", c["path"]))
                for c in divergent)
            if before["sourceId"] != after["sourceId"]:
                pairs = []
                pairing = {"mode": "UNPAIRED", "reason": "Different original sources require explicit row pairs"}
            elif structural:
                pairs = []
                pairing = {"mode": "UNPAIRED", "reason": "Divergent structural corrections require explicit row pairs"}
            else:
                pairs = [{"beforeRowId": k, "afterRowId": k} for k in sorted(set(left) & set(right))]
                pairing = {"mode": "SAME_SOURCE", "reason": "Original row paths retain identity across these cumulative corrections"}
        if not isinstance(pairs, list) or len(pairs) > 100000:
            raise InputError("Use explicit original one-to-one row pairings")
        used_left, used_right, rows = set(), set(), []
        from decimal import Decimal, localcontext
        for pair in pairs:
            if not isinstance(pair, dict) or set(pair) != {"beforeRowId", "afterRowId"}:
                raise InputError("Each row pairing binds two original row IDs")
            a, b = pair["beforeRowId"], pair["afterRowId"]
            if not isinstance(a, str) or not isinstance(b, str) or a not in left or b not in right or a in used_left or b in used_right:
                raise InputError("A comparison pairing is absent or not one-to-one")
            used_left.add(a); used_right.add(b)
            x, y = left[a], right[b]
            compatible = "family" in x and "family" in y and comparable_context(x) == comparable_context(y)
            # Organisation identity is explicit even when source-bound keys differ.
            xorg = next(o for o in data_before["organisations"] if o["key"] == x["organisationKey"])
            yorg = next(o for o in data_after["organisations"] if o["key"] == y["organisationKey"])
            compatible = compatible and xorg["identifier"] == yorg["identifier"] and xorg["reportingOrg"]["ref"] == yorg["reportingOrg"]["ref"]
            usable = compatible and x.get("calculation", {}).get("eligible") and y.get("calculation", {}).get("eligible")
            with localcontext() as ctx:
                ctx.prec = 8192
                delta = Decimal(y["calculation"]["amount"]) - Decimal(x["calculation"]["amount"]) if usable else None
            rows.append({"beforeRowId": a, "afterRowId": b, "before": x, "after": y,
                "changed": x["nodeSha256"] != y["nodeSha256"], "compatibleFinancialContext": bool(compatible),
                "delta": decimal_text(delta) if delta is not None else None})
        result = {"schema": "stellar-forge.iati-organisation-comparison.v1",
            "id": digest(json_bytes({"request": raw, "before": before["recordSha256"], "after": after["recordSha256"]})),
            "before": {**raw["before"], "sourceId": before["sourceId"], "recordSha256": before["recordSha256"]},
            "after": {**raw["after"], "sourceId": after["sourceId"], "recordSha256": after["recordSha256"]},
            "pairing": pairing, "rows": rows, "unpairedBefore": [left[k] for k in sorted(set(left)-used_left)],
            "unpairedAfter": [right[k] for k in sorted(set(right)-used_right)],
            "summary": {"pairs": len(rows), "financialDeltas": sum(r["delta"] is not None for r in rows),
                "unpairedBefore": len(left)-len(used_left), "unpairedAfter": len(right)-len(used_right),
                "rule": "Exact original contexts only; unpaired or incompatible values never become zero."},
            "actor": actor(raw), "notes": text(raw.get("notes", ""), "Comparison notes", 32000, True)}
        body = json_bytes(result)
        result["files"] = {"comparison": self._retain(body, "organisation-comparison-" + result["id"] + ".json", "application/json")}
        return result

    def compare(self, raw):
        allowed = {"requestId", "before", "after", "rowPairs", "actor", "notes"}
        with self.ws.mutex:
            replayed = self._request("compare", raw, allowed)
            if replayed is not None:
                return replayed
            for side in ("before", "after"):
                if not isinstance(raw.get(side), dict) or set(raw[side]) != {"id", "revision"}:
                    raise InputError("A comparison binds two explicit original plan revisions")
            before = self.plan(raw["before"]["id"], raw["before"]["revision"])
            after = self.plan(raw["after"]["id"], raw["after"]["revision"])
            result = self._make_comparison(raw, before, after)
            selected = {"kind": "comparison", "id": result["id"]}
            with self.ws.db:
                self.ws.db.execute("INSERT INTO iati_organisation_comparisons VALUES(?,?)", (result["id"], json_bytes(result).decode()))
                self.ws.db.execute("INSERT INTO iati_organisation_requests VALUES(?,?,?,?,?,?,?)",
                    (raw["requestId"], digest(json_bytes(raw)), "compare", json_bytes(raw).decode(),
                     after["id"], after["revision"], json_bytes(selected).decode()))
            return result

    def export(self, raw):
        from .portable import export_plan
        if not isinstance(raw, dict) or set(raw) - {"id", "revision", "output"}:
            raise InputError("Bind one retained organisation plan revision and the exact output path")
        with self.ws.mutex:
            return export_plan(self, self.plan(raw.get("id"), raw.get("revision")), raw.get("output"))

    def receive(self, raw):
        from .portable import receive_plan
        if not isinstance(raw, dict) or set(raw) != {"path"}:
            raise InputError("Supply the original complete organisation packet path")
        with self.ws.mutex:
            return receive_plan(self, raw["path"])
