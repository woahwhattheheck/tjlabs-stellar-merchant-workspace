#!/usr/bin/env python3
"""Receive two actual publisher export editions through the original IATI product.

This external operating programme uses the installed IatiWorkspace. It preserves
the original XML, native selectors, named decisions and complete source packages.
"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import fcntl
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile

SCHEMA = "devresults.export-review-intake.v1"
REVIEW_SCHEMA = "devresults.export-review-decisions.v1"

def need(value, message):
    if not value:
        raise ValueError(message)

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2,
                       allow_nan=False) + "\n").encode("utf-8")

def identity(path):
    digest = hashlib.sha256()
    count = 0
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            count += len(block)
            digest.update(block)
    return {"bytes": count, "sha256": digest.hexdigest()}

def original_file(path):
    path = Path(path).expanduser().absolute()
    need(path.is_file() and not path.is_symlink(), "Select an original regular file: " + str(path))
    return path

def private_directory(path):
    path = Path(path).expanduser().absolute()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    need(path.is_dir() and not path.is_symlink() and path.resolve() == path,
         "Use a real operation directory without symlink parents")
    os.chmod(path, 0o700)
    return path

def publish(path, data, replace=False):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    need(not path.is_symlink(), "Preserve the existing destination link")
    if path.exists() and not replace:
        need(path.is_file() and path.read_bytes() == data, "Preserve the different retained file: " + str(path))
        return
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".incoming-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            try:
                os.link(temporary, path)
            except FileExistsError:
                need(path.is_file() and not path.is_symlink() and path.read_bytes() == data,
                     "Another result already owns the retained file")
        directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)

def retain_json(path, value):
    publish(path, encoded(value))

def copy_original(source, target, expected=None):
    expected = expected or identity(source)
    if target.exists() or target.is_symlink():
        need(target.is_file() and not target.is_symlink() and identity(target) == expected,
             "The retained complete original differs: " + str(target))
        return expected
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix="." + target.name + ".incoming-", dir=target.parent)
    temporary = Path(temporary)
    try:
        with source.open("rb") as incoming, os.fdopen(fd, "wb") as outgoing:
            shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        need(identity(temporary) == expected, "The original changed during complete copying")
        try:
            os.link(temporary, target)
        except FileExistsError:
            need(target.is_file() and not target.is_symlink() and identity(target) == expected,
                 "The original destination changed")
        directory = os.open(target.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        return expected
    finally:
        temporary.unlink(missing_ok=True)

@contextmanager
def owned_operation(root):
    fd = os.open(root / ".export-review.lock",
                 os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)

def load_config(path):
    source = original_file(path)
    value = json.loads(source.read_bytes())
    need(value.get("schema") == SCHEMA, "Select the full export-review intake definition")
    need(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", value.get("operation", "")),
         "Use a stable operation identifier")
    need(isinstance(value.get("publisherIdentifier"), str) and value["publisherIdentifier"].strip(),
         "Name the actual publisher organisation identifier")
    need(isinstance(value.get("operator"), str) and value["operator"].strip(),
         "Name the actual operating person")
    need(isinstance(value.get("assessment"), dict), "Supply the original dated organisation assessment")
    editions = value.get("editions")
    need(isinstance(editions, list) and len(editions) == 2, "Select exactly two genuine publisher editions")
    ids = []
    for edition in editions:
        key = edition.get("id", "")
        need(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,39}", key), "Use an explicit edition identifier")
        need(key not in {"received-current", "edition-comparison", "intake-definition",
                         "review-definition", "HANDOVER", "index", "RECEIVING",
                         "receive_export_review", "Publisher_Financial_Review"},
             "Keep edition filenames distinct from the complete handover files")
        ids.append(key)
        need(isinstance(edition.get("scope"), dict) and bool(edition["scope"]),
             "Retain the actual export filters, results periods and financial coverage")
        need(isinstance(edition.get("selection"), dict), "Supply the explicit native activity portfolio selection")
        instant = edition.get("exportedAt")
        need(isinstance(instant, str), "Retain the observed original export time")
        parsed = datetime.fromisoformat(instant.replace("Z", "+00:00"))
        need(parsed.tzinfo is not None, "Use an original export time with timezone")
        for key in ("organisationFile", "activityFile"):
            candidate = Path(edition[key])
            edition[key] = str(original_file(candidate if candidate.is_absolute() else source.parent / candidate))
    need(len(set(ids)) == 2, "Keep the two original edition identities distinct")
    return value

def complete_catalog(engine, selector, section):
    rows = []
    snapshot = None
    total = None
    while total is None or len(rows) < total:
        request = {**selector, "section": section, "offset": len(rows), "limit": 250}
        if snapshot:
            request["expectedSnapshot"] = snapshot
        page = engine.catalog(request)
        if total is None:
            snapshot, total = page["snapshotSha256"], page["total"]
        need(page["snapshotSha256"] == snapshot and page["total"] == total
             and page["offset"] == len(rows), "Keep the original pinned financial catalog")
        need(page["rows"] or len(rows) == total, "The original catalog stopped before its end")
        rows.extend(page["rows"])
    need(len(rows) == total and len({row["id"] for row in rows}) == total,
         "Retain every unique native financial row")
    return {"snapshotSha256": snapshot, "total": total, "rows": rows}

def prepare(workspace_type, root, config):
    state_path = root / "intake.json"
    inputs = []
    for edition in config["editions"]:
        records = {}
        for kind, key in (("organisation", "organisationFile"), ("activity", "activityFile")):
            original = Path(edition[key])
            target = root / "inputs" / edition["id"] / (kind + ".xml")
            records[kind] = {"path": str(target.relative_to(root)),
                             **copy_original(original, target)}
        inputs.append({"edition": edition["id"], **records})
    need(inputs[0]["organisation"]["sha256"] != inputs[1]["organisation"]["sha256"]
         or inputs[0]["activity"]["sha256"] != inputs[1]["activity"]["sha256"],
         "Two repeated copies are one publication edition; choose the actual following export")
    contract = deepcopy(config)
    for edition in contract["editions"]:
        edition.pop("organisationFile")
        edition.pop("activityFile")
    binding = {"configuration": contract, "inputs": inputs}
    retain_json(root / "intake-definition.json", binding)
    outcome = {"schema": SCHEMA, "operation": config["operation"], "definition": binding,
               "state": "CATALOGS_PREPARED", "editions": []}
    sender = root / "sender-workspace"
    with workspace_type(sender, create=not sender.exists()) as workspace:
        for edition, inputs_row in zip(config["editions"], inputs):
            imported = {}
            for kind in ("organisation", "activity"):
                item = inputs_row[kind]
                with (root / item["path"]).open("rb") as source:
                    entry = workspace.add_source(source, edition["id"] + " original " + kind,
                                                 edition["id"] + "-" + kind + ".xml")
                need(entry["id"] == item["sha256"], "The native source differs from the complete export")
                imported[kind] = entry["id"]
            profile = workspace.organisation.profile(imported["organisation"])
            matches = [row for row in profile["organisations"]
                       if row["identifier"] == config["publisherIdentifier"]]
            need(len(matches) == 1, "Select one actual publisher from the complete organisation export")
            org_key = matches[0]["key"]
            prefix = config["operation"] + "-" + edition["id"]
            org_request = {"requestId": prefix + "-organisation",
                "name": edition.get("name", edition["id"]) + " — original organisation",
                "sourceId": imported["organisation"], "organisationKeys": [org_key],
                "assessment": deepcopy(config["assessment"]), "edits": [],
                "acquisition": {"notes": "Unedited original publisher export; publication time and selected scope are retained in the operating intake."},
                "actor": config["operator"], "notes": json.dumps(edition["scope"], ensure_ascii=False)}
            portfolio_request = {"requestId": prefix + "-activities",
                "name": edition.get("name", edition["id"]) + " — selected original activities",
                "notes": json.dumps(edition["scope"], ensure_ascii=False),
                "sources": [imported["activity"]], "selection": deepcopy(edition["selection"]),
                "review": {"status": "draft", "reviewer": "", "note": "Financial review follows in its named case."}}
            retain_json(root / "requests" / (prefix + "-organisation.json"), org_request)
            retain_json(root / "requests" / (prefix + "-activities.json"), portfolio_request)
            organisation = workspace.organisation.save(org_request)
            portfolio = workspace.save_portfolio(portfolio_request)
            selector = {"organisation": {"id": organisation["id"], "revision": organisation["revision"],
                                          "organisationKey": org_key},
                        "portfolios": [{"id": portfolio["id"], "revision": portfolio["revision"]}]}
            catalogs = {kind: complete_catalog(workspace.reconciliation, selector, kind)
                        for kind in ("organisation", "activity")}
            retain_json(root / "catalogs" / (edition["id"] + ".json"),
                        {"selector": selector, "scope": edition["scope"], **catalogs})
            retain_json(root / "organisation" / (edition["id"] + ".json"), organisation)
            retain_json(root / "portfolios" / (edition["id"] + ".json"), portfolio)
            outcome["editions"].append({"id": edition["id"], "sources": imported,
                                        "selector": selector, "scope": edition["scope"],
                                        "catalogs": {k: {"snapshotSha256": v["snapshotSha256"],
                                                         "total": v["total"]} for k, v in catalogs.items()}})
    retain_json(state_path, outcome)
    return outcome

def reports(engine, root, case, label):
    result = {}
    for kind, suffix in (("report", "html"), ("csv", "csv"), ("json", "json")):
        descriptor = engine.file({"id": case["id"], "revision": case["revision"], "kind": kind})
        target = root / "delivery" / (label + "." + suffix)
        expected = {key: descriptor[key] for key in ("bytes", "sha256")}
        copy_original(Path(descriptor["path"]), target, expected)
        result[kind] = {"path": str(target.relative_to(root)), **expected}
    return result

def prepare_review(workspace_type, root, config, intake, mapping_path):
    """Expose real comparison issues before a person supplies named decisions."""
    original = original_file(mapping_path)
    raw = original.read_bytes()
    mapping = json.loads(raw)
    need(mapping.get("schema") == "devresults.export-review-mapping.v1"
         and mapping.get("operation") == config["operation"],
         "Select this original operation's two-edition financial mapping")
    items = mapping.get("editions")
    need(isinstance(items, list) and [x.get("id") for x in items] ==
         [x["id"] for x in intake["editions"]], "Map both actual editions in their original order")
    mapping_sha = hashlib.sha256(raw).hexdigest()
    preview_root = root / "preview" / mapping_sha
    publish(preview_root / "mapping.json", raw)
    previews = []
    with workspace_type(root / "sender-workspace") as workspace:
        for item, edition in zip(items, intake["editions"]):
            definition = item.get("definition")
            need(isinstance(definition, dict) and not (set(definition) -
                 {"name", "notes", "comparisons", "decisions"})
                 and isinstance(definition.get("comparisons"), list)
                 and 1 <= len(definition["comparisons"]) <= 10,
                 "Map one to ten explicit native comparison lines per edition")
            report = workspace.reconciliation.preview({**deepcopy(definition), **edition["selector"]})
            retain_json(preview_root / "editions" / (edition["id"] + ".json"), report)
            previews.append({"id": edition["id"], "snapshotSha256": report["snapshotSha256"],
                             "definitionSha256": report["definitionSha256"],
                             "report": report})
    retained = {"schema": "devresults.export-review-previews.v1",
                "operation": config["operation"], "mappingSha256": mapping_sha,
                "editions": previews}
    retain_json(preview_root / "previews.json", retained)
    review = {"schema": REVIEW_SCHEMA, "operation": config["operation"],
              "mappingSha256": mapping_sha,
              "previews": [{k: item[k] for k in ("id", "snapshotSha256", "definitionSha256")}
                           for item in previews],
              "editions": deepcopy(items)}
    sections = []
    for index, (item, preview) in enumerate(zip(items, previews)):
        report = preview["report"]
        comparison_rows = []
        for row in report["comparisons"]:
            context = {"basis": row["basis"], "coverage": row["coverage"],
                       "period": row["period"], "currency": row["currency"],
                       "status": row["status"], "valueDatePolicy": row["valueDatePolicy"],
                       "valueDates": row["valueDates"], "scopeStatement": row["scopeStatement"],
                       "selected": row["selectedCount"], "included": len(row["includedRowIds"]),
                       "excluded": row["excludedCount"]}
            values = [json.dumps(context, ensure_ascii=False, indent=2),
                      row["organisationAmount"], row["selectedAmount"], row["difference"]]
            comparison_rows.append("<tr>" + "".join("<td><pre>" + html.escape(
                str(value) if value is not None else "Not comparable in this context") +
                "</pre></td>" for value in values) + "</tr>")
        issue_rows = []
        for issue in report["issues"]:
            ident = html.escape(issue["id"], quote=True)
            required = "true" if issue["severity"] != "information" else "false"
            issue_rows.append('<label class="issue"><input type="checkbox" data-required="' +
                              required + '" value="' + ident + '"><span><strong>' +
                              html.escape(issue["severity"] + " · " + issue["code"]) +
                              "</strong><br>" + html.escape(issue["message"]) +
                              '<br><code>' + ident + "</code></span></label>")
        sections.append('<section data-edition="' + str(index) + '"><h2>' + html.escape(
            item["id"]) + '</h2><p><a href="editions/' + html.escape(item["id"], quote=True) +
            '.json">Complete native preview and source rows</a> · Snapshot <code>' +
            html.escape(preview["snapshotSha256"]) + '</code></p><div class="table-wrap">'
            '<table><thead><tr><th>Actual context</th><th>Organisation</th><th>Selected cohort</th>'
            '<th>Difference</th></tr></thead><tbody>' + "".join(comparison_rows) +
            '</tbody></table></div><h3>Read and acknowledge the actual issues</h3>' +
            ("".join(issue_rows) or "<p>No comparison issues were reported.</p>") +
            '<label>Reviewer name<input name="actor" maxlength="160" required></label>'
            '<label>Decision<select name="decision" required><option value="">Choose your decision</option>'
            '<option value="approve">Approve this report</option><option value="request_changes">'
            'Request changes</option></select></label><label>Explanation<textarea name="note" '
            'maxlength="8000" required rows="4"></textarea></label></section>')
    script_data = json.dumps(review, ensure_ascii=False).replace("<", "\\u003c")
    page = """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Review actual publisher editions</title>
<style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fff;color:#171717;
font:16px/1.5 system-ui,sans-serif}main{max-width:86rem;margin:auto;padding:2rem}section{border:1px solid #bbb;
padding:1.25rem;margin:1.5rem 0}h1{font-size:1.8rem}h2{font-size:1.4rem}a{color:inherit}
.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:42rem}th,td{border:1px solid #bbb;
padding:.7rem;text-align:left;vertical-align:top}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;
margin:0}code{overflow-wrap:anywhere}label{display:block;margin:1rem 0}input,select,textarea,button{font:inherit;
color:inherit;background:#fff;border:1px solid #777;padding:.6rem;max-width:100%}input[name],textarea{display:block;
width:100%}.issue{display:flex;align-items:flex-start;gap:.7rem}.issue input{margin-top:.4rem}
button{cursor:pointer;font-weight:600;background:#eee}#status{min-height:1.5rem}
@media(max-width:650px){main{padding:1rem}section{padding:.8rem}table{min-width:0}thead{display:none}
tr,td{display:block}td:before{display:block;font-weight:600;margin-bottom:.25rem}
td:nth-child(1):before{content:"Actual context"}td:nth-child(2):before{content:"Organisation"}
td:nth-child(3):before{content:"Selected cohort"}td:nth-child(4):before{content:"Difference"}
tr{margin-bottom:1rem}}</style><main><h1>Review actual publisher editions</h1>
<p>These amounts and issues come from the original financial engine. Choose your decision for each
actual edition. Approval requires acknowledging every noninformational issue. Your exported file
records your name, explanation, exact mapping and pinned preview; exporting this form does not
save a review in the application.</p><form id="review-form">""" + "".join(sections) + """
<button type="submit">Export named review decisions</button><p id="status" role="status"></p></form>
</main><script type="application/json" id="original-definition">""" + script_data + """</script><script>
'use strict';
const form=document.getElementById('review-form'),status=document.getElementById('status');
const original=JSON.parse(document.getElementById('original-definition').textContent);
form.addEventListener('submit',event=>{
 event.preventDefault();if(!form.reportValidity())return;
 const output=JSON.parse(JSON.stringify(original));
 for(const section of form.querySelectorAll('[data-edition]')){
  const index=Number(section.dataset.edition),decision=section.querySelector('[name=decision]').value;
  const checked=[...section.querySelectorAll('.issue input:checked')].map(x=>x.value);
  const missing=[...section.querySelectorAll('.issue input[data-required=true]')].filter(x=>!x.checked);
  const actor=section.querySelector('[name=actor]').value.trim(),note=section.querySelector('[name=note]').value.trim();
  if(!actor||!note){status.textContent='Enter the reviewer name and explanation for each edition.';return;}
  if(decision==='approve'&&missing.length){status.textContent='Read and acknowledge all noninformational issues for '+output.editions[index].id+'.';missing[0].focus();return;}
  output.editions[index].review={decision,actor,note,acknowledgedIssueIds:checked};
 }
 const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)+'\\n'],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='review.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 status.textContent='Exported your decisions. Continue the original programme with --review and this exact review.json.';
});
</script></html>
"""
    publish(preview_root / "review.html", page.encode("utf-8"))
    return {"state": "REVIEW_PREPARED", "operation": config["operation"],
            "mappingSha256": mapping_sha, "reviewPage": str(preview_root / "review.html")}

def handover(root, config, result):
    """Open both genuine editions and the independently received current report."""
    delivery = root / "delivery"
    references = []
    for edition in config["editions"]:
        label = edition["id"]
        for kind, suffix in (("report", "html"), ("csv", "csv"), ("json", "json")):
            name = label + "." + suffix
            references.append({"edition": label, "kind": kind, "file": name,
                               **identity(delivery / name)})
    for name in ("Publisher_Financial_Review.zip", "receive_export_review.py"):
        references.append({"kind": "native-package" if name.endswith(".zip") else "programme",
                           "file": name, **identity(delivery / name)})
    copy_original(root / "reports" / "edition-comparison.json",
                  delivery / "edition-comparison.json")
    copy_original(root / "intake-definition.json", delivery / "intake-definition.json")
    copy_original(root / "review-definition.json", delivery / "review-definition.json")
    decisions = json.loads((root / "review-definition.json").read_bytes())
    selected_preview = root / "preview" / decisions["mappingSha256"]
    preview_names = ["mapping.json", "previews.json", "review.html"] + [
        "editions/" + edition["id"] + ".json" for edition in config["editions"]]
    for name in preview_names:
        target = delivery / "preview" / name
        descriptor = copy_original(original_file(selected_preview / name), target)
        references.append({"kind": "review-preview", "file": "preview/" + name, **descriptor})
    description = {
        "schema": "devresults.export-review-handover.v1", "operation": config["operation"],
        "caseId": result["caseId"], "revision": result["revision"],
        "publisherIdentifier": config["publisherIdentifier"],
        "editionRevisions": result["editionRevisions"],
        "mappingSha256": decisions["mappingSha256"], "previews": decisions["previews"],
        "receiver": "Independent original workspace received and reopened this exact case.",
        "files": references,
        "scope": [{"id": x["id"], "exportedAt": x["exportedAt"], "scope": x["scope"]}
                  for x in config["editions"]],
    }
    rows = []
    for edition in config["editions"]:
        label = edition["id"]
        links = " · ".join('<a href="' + html.escape(label + "." + suffix, quote=True) +
                           '">' + title + "</a>"
                           for title, suffix in (("Report", "html"), ("CSV", "csv"), ("JSON", "json")))
        rows.append("<tr><th>" + html.escape(edition.get("name", label)) +
                    "</th><td>" + html.escape(edition["exportedAt"]) +
                    "</td><td>" + links + "</td></tr>")
    page = """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Publisher financial review</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fff;color:#171717;
font:16px/1.5 system-ui,sans-serif}main{max-width:76rem;margin:auto;padding:2rem}
h1{font-size:1.8rem}table{width:100%;border-collapse:collapse;text-align:left}
th,td{padding:.8rem;border:1px solid #bbb;overflow-wrap:anywhere}a{color:#171717;
text-decoration:underline}code{overflow-wrap:anywhere}.identity{padding:1rem;background:#f4f4f4;
border:1px solid #bbb}@media(max-width:650px){main{padding:1rem}table,tbody,tr,th,td{display:block}
td{border-top:0}tr{margin-bottom:1rem}}
</style><main><h1>Publisher financial review</h1><p>Two original export editions, named
decisions and independent receiving.</p><p class="identity">Publisher: <strong>""" + html.escape(
        config["publisherIdentifier"]) + "</strong><br>Case: <code>" + html.escape(
        result["caseId"]) + "</code><br>Revision: " + str(result["revision"]) + """</p>
<h2>Reviewed editions</h2><table><tbody>""" + "".join(rows) + """</tbody></table>
<h2>Changes and complete handover</h2><ul>
<li><a href="edition-comparison.json">Historical comparison</a></li>
<li><a href="received-current.html">Current report from the independent receiver</a></li>
<li><a href="Publisher_Financial_Review.zip">Complete native package with original source and history</a></li>
<li><a href="intake-definition.json">Original export scope and input identities</a></li>
<li><a href="review-definition.json">Named decisions and selected native rows</a></li>
<li><a href="preview/review.html">Original undecided form and the actual reviewed previews</a></li>
<li><a href="HANDOVER.json">Complete file identities</a></li>
<li><a href="RECEIVING.md">Receiving instructions</a></li>
</ul><p>Interpret each difference with its selected coverage, currency, financial basis,
period and value-date policy, all retained in the reports.</p></main></html>
"""
    publish(delivery / "index.html", page.encode("utf-8"))
    guide = """# Receive the complete original financial review

Open index.html to inspect both actual editions, the historical comparison, the
independently received report, and the retained scope and named decisions.
The preview/ directory retains the exact mapping, both full native previews and
the original undecided form. The saved named decisions are in review-definition.json;
opening that original form does not alter the saved review.

Publisher_Financial_Review.zip contains the original native financial history
and nested organisation/activity packages with their selected original source.
Use the matching complete IATI application edition. In its financial comparison
workspace, receive this ZIP, open the retained case/revision shown in
HANDOVER.json, and inspect both historical reviews and their comparison.

The command programme beside this guide operates new explicitly configured
publisher inputs. It is not needed merely to open the reports or receive the
native ZIP. Keep the original inputs and private working directories with their
authorized custodian; the original operation also retains all exact requests for
lost-acknowledgment readback. Do not edit a stored decision or reuse its request
identifier for a different instruction.

The receiving run checked both historical revisions, named review request
readback, byte-identical regenerated current HTML/CSV/JSON and reopening of the
independent saved case. The HTML opening page is generated here; its desktop and
phone presentation belongs to the receiving review for this customer edition.
"""
    publish(delivery / "RECEIVING.md", guide.encode("utf-8"))
    for name, kind in (("edition-comparison.json", "historical-comparison"),
                       ("intake-definition.json", "original-inputs"),
                       ("review-definition.json", "named-decisions"),
                       ("received-current.html", "received-report"),
                       ("received-current.csv", "received-csv"),
                       ("received-current.json", "received-json"),
                       ("index.html", "opening-page"), ("RECEIVING.md", "receiving-guide")):
        references.append({"kind": kind, "file": name, **identity(delivery / name)})
    retain_json(delivery / "HANDOVER.json", description)

def operate(workspace_type, root, config, intake, decision_path):
    decisions = json.loads(original_file(decision_path).read_bytes())
    need(decisions.get("schema") == REVIEW_SCHEMA and decisions.get("operation") == config["operation"],
         "Select this original operation's complete two-edition review")
    items = decisions.get("editions")
    need(isinstance(items, list) and [x.get("id") for x in items] ==
         [x["id"] for x in intake["editions"]], "Review both original editions in their original order")
    mapping_sha = decisions.get("mappingSha256", "")
    need(re.fullmatch(r"[0-9a-f]{64}", mapping_sha),
         "Prepare the actual comparison previews before collecting named decisions")
    preview_root = root / "preview" / mapping_sha
    mapping_file = original_file(preview_root / "mapping.json")
    need(identity(mapping_file)["sha256"] == mapping_sha, "Keep the original preview mapping")
    mapping = json.loads(mapping_file.read_bytes())
    need(mapping.get("operation") == config["operation"] and
         mapping["editions"] == [{k: item[k] for k in item if k != "review"} for item in items],
         "Named decisions must retain the exact original previewed definitions")
    previews = json.loads(original_file(preview_root / "previews.json").read_bytes())
    need(previews.get("schema") == "devresults.export-review-previews.v1"
         and previews.get("operation") == config["operation"]
         and previews.get("mappingSha256") == mapping_sha
         and [x.get("id") for x in previews.get("editions", [])] == [x["id"] for x in items],
         "Retain both complete previews for this operation and exact mapping")
    expected_previews = [{k: item[k] for k in ("id", "snapshotSha256", "definitionSha256")}
                         for item in previews["editions"]]
    need(decisions.get("previews") == expected_previews,
         "Review the exact pinned source previews retained by this original operation")
    reviewed = []
    saves = []
    reviews = []
    output = {"schema": REVIEW_SCHEMA, "operation": config["operation"], "files": {}}
    with workspace_type(root / "sender-workspace") as workspace:
        engine = workspace.reconciliation
        prepared = []
        # Complete both native validation passes before retaining the immutable
        # decisions or issuing either edition's financial save/review request.
        for item, edition in zip(items, intake["editions"]):
            definition = deepcopy(item["definition"])
            need(isinstance(definition, dict) and not (set(definition) -
                 {"name", "notes", "comparisons", "decisions"}),
                 "Use only the native financial definition; the original source selector is fixed")
            need(isinstance(definition.get("comparisons"), list) and 1 <= len(definition["comparisons"]) <= 10,
                 "Select one to ten explicit financial comparisons from the complete native catalogs")
            raw_review = item.get("review")
            need(isinstance(raw_review, dict) and set(raw_review) ==
                 {"decision", "actor", "note", "acknowledgedIssueIds"},
                 "Retain the complete original named review instruction")
            preview = engine.preview({**definition, **edition["selector"]})
            expected_preview = next(x for x in expected_previews if x["id"] == item["id"])
            need(all(preview[k] == expected_preview[k] for k in ("snapshotSha256", "definitionSha256")),
                 "The reviewed comparison differs from its original complete preview")
            # The original engine's side-effect-free review normalizer checks
            # actor/note lengths, list types, exact issue IDs and acknowledgments.
            # Its public review operation uses this same maintained helper.
            engine._review(raw_review, {"report": preview})
            prepared.append((item, edition, definition, raw_review))
        retain_json(root / "review-definition.json", decisions)
        current = None
        for item, edition, definition, raw_review in prepared:
            request = {**definition, **edition["selector"],
                       "requestId": config["operation"] + "-" + item["id"] + "-financial"}
            if current is not None:
                request.update(id=current["id"], expectedRevision=current["revision"])
            retain_json(root / "requests" / (item["id"] + "-financial.json"), request)
            current = engine.save(request)
            review = {**deepcopy(raw_review), "requestId": config["operation"] + "-" + item["id"] + "-review",
                      "id": current["id"], "expectedRevision": current["revision"]}
            retain_json(root / "requests" / (item["id"] + "-review.json"), review)
            current = engine.review(review)
            need(engine.save(request)["revision"] == review["expectedRevision"],
                 "The original save replay must return its historical response")
            need(engine.review(review) == current, "The original named review replay changed")
            retain_json(root / "reports" / (item["id"] + "-case.json"), current)
            output["files"][item["id"]] = reports(engine, root, current, item["id"])
            reviewed.append(current)
            saves.append(request)
            reviews.append(review)
        comparison_request = {"before": {"id": reviewed[0]["id"], "revision": reviewed[0]["revision"]},
                              "after": {"id": reviewed[1]["id"], "revision": reviewed[1]["revision"]}}
        comparison = engine.compare(comparison_request)
        retain_json(root / "reports" / "edition-comparison.json", comparison)
        packet = root / "delivery" / "Publisher_Financial_Review.zip"
        exported = engine.export({"id": current["id"], "revision": current["revision"],
                                  "output": packet})
        packet_identity = {k: exported[k] for k in ("bytes", "sha256")}
        need(exported["state"] == "COMPLETE" and Path(exported["file"]) == packet
             and identity(packet) == packet_identity,
             "Retain the complete original export at its verified native destination")
    receiver = root / "receiver-workspace"
    with workspace_type(receiver, create=not receiver.exists()) as workspace:
        result = workspace.reconciliation.receive({"path": packet})
        need(result["state"] == "COMPLETE" and result["case"] == reviewed[-1],
             "Receive the complete original reviewed case into the independent workspace")
        for case in reviewed:
            need(workspace.reconciliation.plan(case["id"], case["revision"]) == case,
                 "Keep both original reviewed edition revisions")
        for request, case in zip(reviews, reviewed):
            record = workspace.reconciliation.request(request["requestId"])
            need(record["state"] == "RECORDED" and record["case"] == case,
                 "Retain the original review request for lost-acknowledgment recovery")
        received_reports = reports(workspace.reconciliation, root, reviewed[-1], "received-current")
        expected = output["files"][items[-1]["id"]]
        need({k: {x: v[x] for x in ("bytes", "sha256")} for k, v in expected.items()} ==
             {k: {x: v[x] for x in ("bytes", "sha256")} for k, v in received_reports.items()},
             "The complete native reports must match after independent receiving")
    with workspace_type(receiver) as workspace:
        reopened = workspace.reconciliation.plan(reviewed[-1]["id"], reviewed[-1]["revision"])
        need(reopened == reviewed[-1], "Reopen the same saved receiving case")
    copy_original(Path(__file__).resolve(), root / "delivery" / "receive_export_review.py")
    output.update(state="COMPLETE", caseId=reopened["id"], revision=reopened["revision"],
                  editionRevisions=[{"id": item["id"], "revision": case["revision"]}
                                    for item, case in zip(items, reviewed)],
                  nativePacket={"path": str(packet.relative_to(root)), **packet_identity},
                  receiving=result, completedAt=datetime.now(timezone.utc).isoformat())
    handover(root, config, output)
    # The first complete identity remains the operation's result on replay.
    final = root / "receiving-result.json"
    if final.exists():
        old = json.loads(final.read_bytes())
        need({k: old[k] for k in ("caseId", "revision", "nativePacket", "files")} ==
             {k: output[k] for k in ("caseId", "revision", "nativePacket", "files")},
             "Preserve the original completed receiving result")
        return old
    retain_json(final, output)
    return output

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iati-source", type=Path, required=True)
    parser.add_argument("--configuration", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    course = parser.add_mutually_exclusive_group()
    course.add_argument("--mapping", type=Path, help="Actual native row mapping; prepares full previews and an undecided reviewer form.")
    course.add_argument("--review", type=Path, help="Actual named decisions exported from the retained preview form.")
    args = parser.parse_args()
    source = args.iati_source.expanduser().resolve()
    need((source / "iati_workspace.py").is_file(), "Use the complete original installed IATI source")
    sys.path.insert(0, str(source))
    from iati_workspace import IatiWorkspace
    os.umask(0o077)
    config = load_config(args.configuration)
    root = private_directory(args.output)
    need(root != source and source not in root.parents,
         "Keep the customer operation outside the installed product source tree")
    with owned_operation(root):
        intake = prepare(IatiWorkspace, root, config)
        result = (operate(IatiWorkspace, root, config, intake, args.review) if args.review else
                  prepare_review(IatiWorkspace, root, config, intake, args.mapping) if args.mapping else intake)
        print(json.dumps({"state": result["state"], "operation": config["operation"], "output": str(root),
                          **{k: result[k] for k in ("caseId", "revision", "nativePacket", "reviewPage", "mappingSha256") if k in result}},
                         ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
