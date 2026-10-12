#!/usr/bin/env python3
"""Operate the original SCF case and its complete delivery-calendar handover."""
from __future__ import annotations
import argparse
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import zipfile
from copy import deepcopy
from datetime import date, timedelta

OPERATION = "SCF-GRANT-DELIVERY-CALENDAR-9125-20261012"
ACTOR = "CEDAR-8047-SCF"
ORIGINAL_CASE = "operation-6ee58b0295754b83b492112f68ab9c4c"
ORIGINAL_SHA = "c9205af40840c324222b47fc53b4dc83c2f55891c54b50b3a4b77e8af3266275"
SOURCE_REF = "e16268737dbeb1852861c30c3838e9118511973e"
NATIVE_PATH = Path("stellar/scf_2026/sf47_budget_model")

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_name(path.name + ".pending")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)

def material(path, raw):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_bytes(raw)
    os.chmod(path, 0o600)
    return {"filename": path.name, "bytes": len(raw), "sha256": digest(raw)}

def shift(anchor, days):
    return (date.fromisoformat(anchor) + timedelta(days=days)).isoformat()

def native_prepare(args, base, output):
    sys.path.insert(0, str(base / "workspace"))
    from model import Workspace, budget
    from operations import Operations
    from managed_launch import selection
    archive = args.archive.read_bytes()
    if digest(archive) != ORIGINAL_SHA:
        raise ValueError("Select the retained 7E4E payment-delay case archive with SHA-256 " + ORIGINAL_SHA)
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        original = json.loads(z.read("operations.json"))
    if original["program"]["id"] != ORIGINAL_CASE or original["program"]["version"] != 36:
        raise ValueError("The receiving operation requires the original case at retained version 36.")
    workspace_dir = output / "workspace"
    selected, selection_sha = selection(workspace_dir, base / "sf10_current_candidate.json", base / "workspace")
    source_manifest = {
        "declaredSourceCommit": args.source_commit,
        "repository": "woahwhattheheck/tjlabs-stellar-merchant-workspace",
        "selectionSha256": selection_sha,
        "sourceSha256": selected["sourceSha256"],
        "scenarioSha256": selected["scenarioSha256"],
    }
    save_json(output / "source-selection.json", source_manifest)
    identity = {"operationId": OPERATION, "actor": ACTOR, "originalCaseId": ORIGINAL_CASE,
                "originalArchiveSha256": ORIGINAL_SHA}
    journal_path = output / "native-inputs.json"
    journal = json.loads(journal_path.read_text()) if journal_path.exists() else {**identity, "commands": {}}
    if any(journal.get(k) != v for k, v in identity.items()):
        raise ValueError("This output directory already belongs to another receiving operation.")
    save_json(journal_path, journal)
    final_path = output / "native-result.json"
    if final_path.exists():
        final = json.loads(final_path.read_text())
        if final["originalArchiveSha256"] != ORIGINAL_SHA:
            raise ValueError("Retained native result belongs to another source archive.")
        return final
    workspace = Workspace(workspace_dir, base / "sf10_current_candidate.json")
    try:
        ops = Operations(workspace)
        received = ops.import_bundle(archive, "SCF retained grant case - calendar receiving",
                                    OPERATION + "-receive-CEDAR8047", ACTOR)
        actual = ops.read(received["id"])
        anchor = actual["program"].get("calendarStart") or actual["plan"]["planning"].get("calendarStart")
        if not anchor:
            raise ValueError("The retained SCF planning calendar has no original anchor.")
        as_of = shift(anchor, 206)
        baseline = ops.delivery_calendar(received["id"], as_of, received["version"])
        material(output / "retained-original-case.zip", archive)
        material(output / "received-original-case.zip", ops.export(received["id"]))
        save_json(output / "original-calendar.json", baseline)
        demo_body = {
            "planId": actual["program"]["planId"],
            "selectedRevision": actual["program"]["planRevision"],
            "expectedContentSha256": actual["plan"]["contentSha256"],
            "name": "SCF delivery calendar walkthrough - original grant plan",
            "mode": "WALKTHROUGH", "calendarStart": anchor, "actor": ACTOR,
            "requestId": OPERATION + "-walkthrough-CEDAR8047",
        }
        demo = ops.create(demo_body)
        case_id = demo["id"]
        notes = "Explicit calendar receiving walkthrough over the original retained grant plan."
        def command(label, action, data):
            key = ACTOR + "-" + label
            if key not in journal["commands"]:
                journal["commands"][key] = {
                    "expectedVersion": ops.read(case_id)["program"]["version"],
                    "requestId": key, "actor": ACTOR, "action": action, "data": data, "note": notes,
                }
                save_json(journal_path, journal)
            body = journal["commands"][key]
            result = ops.command(case_id, body)
            journal.setdefault("results", {})[key] = result
            save_json(journal_path, journal)
            return result
        example = {
            **identity, "purpose": "WALKTHROUGH", "calendarAnchor": anchor, "asOfDate": as_of,
            "paymentOffsets": [0, 105, 196, 317], "confirmationOffset": 75, "extendedDeadlineOffset": 104,
            "completedOffset": 70, "preparationOffset": 96, "formSubmissionOffset": 98,
            "issuerDecisionOffset": 100,
            "amountBasis": "Original Decimal calculator payout amounts from the retained plan.",
            "assignmentBasis": "Original tranche/cost identities with explicitly authored walkthrough dates and states.",
        }
        source = command("input-source", "source.add", {
            "filename": "calendar-walkthrough-inputs.json", "mediaType": "application/json", "kind": "grant",
            "contentBase64": base64.b64encode((json.dumps(example, indent=2) + "\n").encode()).decode(),
        })
        source_ids = [source["recordId"]]
        people = actual["records"]["contributors"]
        chosen = people[:2] if people else [
            {"name": "Engineering delivery owner", "kind": "ROLE"},
            {"name": "Grant operations owner", "kind": "ROLE"},
        ]
        owners = []
        for index, person in enumerate(chosen):
            receipt = command("owner-" + str(index), "contributor.save", {
                "name": person["name"], "kind": person.get("kind", "ROLE"),
                "contact": "", "note": notes, "sourceIds": source_ids, "sourceNote": notes,
            })
            owners.append(receipt["recordId"])
        amounts = {p["tranche"]: p["usd"] for p in budget.model(actual["plan"]["scenario"])["payouts"]}
        payments = {}
        for tranche, offset in enumerate((0, 105, 196, 317)):
            receipt = command("payment-" + str(tranche), "cash.record", {
                "direction": "IN", "category": "GRANT", "date": shift(anchor, offset),
                "currency": "USD", "amount": amounts[tranche], "tranche": tranche,
                "externalRef": ACTOR + "-WALKTHROUGH-PAYMENT-T" + str(tranche),
                "network": "", "asset": "", "sourceIds": source_ids, "sourceNote": notes,
            })
            payments[tranche] = receipt["recordId"]
        inputs_by_tranche = {}
        for tranche in (1, 2, 3):
            seed = ops.seed_completion(case_id, {
                "expectedVersion": ops.read(case_id)["program"]["version"], "tranche": tranche,
            })
            inputs = seed["inputs"]
            inputs["note"] = notes
            for index, item in enumerate(inputs["items"]):
                item.update(ownerIds=[owners[index % len(owners)]], sourceIds=source_ids,
                            workIds=[], deploymentIds=[], note=notes)
                if tranche == 1:
                    item.update(startDate=shift(anchor, 1), endDate=shift(anchor, 70), state="COMPLETE",
                                completedOn=shift(anchor, 70),
                                completionNote="Walkthrough retained completion for original work package " + item["costId"])
                elif tranche == 2:
                    item.update(startDate=shift(anchor, 106) if index % 2 == 0 else None,
                                endDate=None if index % 2 == 0 else shift(anchor, 174),
                                state="IN_PROGRESS", completedOn=None, completionNote="")
                else:
                    item.update(startDate=None if index == 0 else shift(anchor, 197),
                                endDate=None if index == 0 else shift(anchor, 266),
                                state="PLANNED", completedOn=None, completionNote="")
            command("assignments-" + str(tranche), "completion.save", {"inputs": inputs})
            inputs_by_tranche[str(tranche)] = deepcopy(inputs)
        extension = command("extension-1", "completion.extension", {
            "receiptId": payments[0], "confirmedOn": shift(anchor, 75), "deadlineOn": shift(anchor, 104),
            "reference": ACTOR + "-WALKTHROUGH-ISSUER-CONFIRMATION", "sourceIds": source_ids, "note": notes,
        })
        preview_data = {"receiptId": payments[0], "asOfDate": shift(anchor, 96),
                        "summary": "Walkthrough of the complete original tranche 1 assignments and issuer submission."}
        prepared_key = ACTOR + "-prepare-1"
        if prepared_key in journal["commands"]:
            prepare_data = journal["commands"][prepared_key]["data"]
        else:
            preview = ops.preview_completion(case_id, {
                "expectedVersion": ops.read(case_id)["program"]["version"], **preview_data,
            })
            save_json(output / "completion-preview.json", preview)
            if not preview["ready"]:
                raise ValueError("Native completion preparation needs: " + json.dumps(preview["issues"]))
            prepare_data = {**preview_data, "expectedPreviewSha256": preview["previewSha256"]}
        preparation = command("prepare-1", "completion.prepare", prepare_data)
        review = ops.review(case_id, preparation["recordId"])
        submission = command("submit-1", "completion.submit", {
            "reviewId": review["id"], "expectedReviewSha256": review["businessSha256"],
            "submittedOn": shift(anchor, 98), "formReference": ACTOR + "-WALKTHROUGH-FORM-T1",
            "sourceIds": source_ids, "sourceNote": notes,
        })
        command("issuer-decision-1", "completion.decision", {
            "outcomeId": submission["recordId"], "state": "ACCEPTED", "date": shift(anchor, 100),
            "sourceIds": source_ids, "sourceNote": notes,
        })
        current = ops.read(case_id)
        report = ops.delivery_calendar(case_id, as_of, current["program"]["version"])
        save_json(output / "calendar.json", report)
        save_json(output / "completion-calendar.json", ops.completion_calendar(case_id, as_of))
        save_json(output / "saved-assignments.json", current["completionPlans"])
        for fmt in ("ics", "csv"):
            material(output / ("calendar." + fmt), ops.export_delivery_calendar(
                case_id, as_of, fmt, current["program"]["version"]))
        material(output / "calendar-walkthrough-case.zip", ops.export(case_id))
        material(output / "prepared-completion.zip", ops.export_completion(case_id, review["id"]))
        deadlines = {row["sourceId"]: row for row in report["entries"] if row["kind"] == "SUBMISSION_DEADLINE"}
        if set(deadlines) != {payments[0], payments[1], payments[2]}:
            raise ValueError("The received native calendar must retain exactly T0/T1/T2 payment clocks.")
        if deadlines[payments[0]]["originalDeadlineOn"] != shift(anchor, 90):
            raise ValueError("The native original payment deadline changed.")
        if deadlines[payments[0]]["startDate"] != shift(anchor, 104) or deadlines[payments[0]]["status"] != "FORM_SUBMITTED":
            raise ValueError("The confirmed extension and native form submission do not join their original clock.")
        precisions = {row["datePrecision"] for row in report["entries"] + report["undated"] if row["kind"] == "DELIVERABLE"}
        result = {
            **identity, "stage": "NATIVE_COMPLETE", "declaredSourceCommit": args.source_commit,
            "receivedCaseId": received["id"], "receivedVersion": received["version"],
            "receivedPlanId": actual["program"]["planId"],
            "demoCaseId": case_id, "demoVersion": current["program"]["version"],
            "demoPlanId": current["program"]["planId"], "mode": current["program"]["mode"],
            "asOfDate": as_of, "calendarAnchor": anchor, "paymentIds": payments,
            "sourceId": source["recordId"], "extensionId": extension["extensionId"],
            "completionReviewId": review["id"], "outcomeId": submission["recordId"],
            "summary": report["summary"], "assignmentPrecisions": sorted(precisions),
            "nativeWorkspace": str(workspace_dir),
            "originalSavedForecasts": [row["id"] for row in actual["forecasts"]],
            "originalSavedPortfolios": [row["id"] for row in actual["portfolios"]],
            "sourceSelectionSha256": selection_sha,
        }
        save_json(final_path, result)
        return result
    finally:
        workspace.close()

BROWSER = r"""
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const [configPath] = process.argv.slice(2);
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const {chromium} = require(config.playwright);
const native = JSON.parse(await fs.readFile(path.join(config.output, 'native-result.json'), 'utf8'));
const expected = JSON.parse(await fs.readFile(path.join(config.output, 'calendar.json'), 'utf8'));
const key = (await fs.readFile(path.join(native.nativeWorkspace, 'access.key'), 'utf8')).trim();
const browser = await chromium.launch({
  executablePath: config.chromium, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const findings = [], screenshots = [], downloads = [], errors = [];
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
};
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const idle = async page => {
  await page.waitForFunction(() => !document.querySelector('.grant-delivery-calendar[aria-busy="true"]'));
};
const screenshot = async (page, name) => {
  const filename = name + '.png';
  await page.screenshot({path:path.join(config.output, filename), fullPage:true});
  const width = await page.evaluate(() => ({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  if (width.document > width.viewport + 2)
    findings.push({kind:'horizontal-overflow',view:name,...width});
  screenshots.push(filename);
};
const openCase = async (page, id, planId) => {
  await page.goto(config.url + '/#access=' + key, {waitUntil:'domcontentloaded'});
  await page.locator('#plan-select option').first().waitFor({state:'attached'});
  await page.locator('#plan-select').selectOption(planId);
  await page.locator('[data-tab="operations"]').click();
  await page.locator('[name="caseSelect"]').selectOption(id);
  await page.locator('[data-ops-tab="calendar"]').click();
  await page.locator('[data-calendar-setting="asOfDate"]').fill(native.asOfDate);
  await page.locator('[data-calendar-setting="asOfDate"]').dispatchEvent('change');
  await idle(page);
  await page.locator('.calendar-source').waitFor();
};
const apiCalendar = async page => page.evaluate(async values => {
  const access=sessionStorage.getItem('sf47.access');
  const response=await fetch('/api/operations/'+values.caseId+'/delivery-calendar?asOfDate='+values.asOfDate,
    {headers:{Authorization:'Bearer '+access}});
  if(!response.ok)throw new Error('Calendar HTTP '+response.status);
  return response.json();
}, {caseId:native.demoCaseId,asOfDate:native.asOfDate});
let context;
try {
  context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page = await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await openCase(page, native.receivedCaseId, native.receivedPlanId);
  await screenshot(page,'original-retained-calendar-desktop');
  await openCase(page, native.demoCaseId, native.demoPlanId);
  const nativeResponse = await apiCalendar(page);
  requireValue(canonical(nativeResponse.entries) === canonical(expected.entries) &&
    canonical(nativeResponse.undated) === canonical(expected.undated),
    'Browser HTTP calendar differs from the complete native retained selection.');
  await screenshot(page,'calendar-agenda-desktop');
  const ownerOption = page.locator('[data-calendar-setting="owner"] option').nth(1);
  if(await ownerOption.count())await page.locator('[data-calendar-setting="owner"]').selectOption(await ownerOption.getAttribute('value'));
  for(const format of ['ics','csv','json']){
    const waiting = page.waitForEvent('download');
    await page.locator('[data-calendar-action="export-'+format+'"]').click();
    const download = await waiting;
    const filename = 'browser-calendar.' + format;
    await download.saveAs(path.join(config.output,filename));
    const raw = await fs.readFile(path.join(config.output,filename));
    downloads.push({filename,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')});
    await idle(page);
  }
  const exported = JSON.parse(await fs.readFile(path.join(config.output,'browser-calendar.json'),'utf8'));
  requireValue(canonical(exported.entries) === canonical(expected.entries) &&
    canonical(exported.undated) === canonical(expected.undated),
    'A screen owner filter changed the complete JSON download.');
  await page.locator('[data-calendar-action="clear-filters"]').click();
  await page.locator('[data-calendar-setting="view"]').selectOption('month');
  await page.locator('[data-calendar-action="month-today"]').click();
  for(let index=0;index<4;index++)await page.locator('[data-calendar-action="month-back"]').click();
  await screenshot(page,'calendar-month-desktop');
  await page.locator('[data-calendar-setting="view"]').selectOption('agenda');
  const entry=expected.entries.find(row=>row.kind==='SUBMISSION_DEADLINE'&&row.sourceId===native.paymentIds['0']);
  requireValue(!!entry,'The original extended clock is absent from the calendar.');
  await page.locator('[data-calendar-action="select"][data-calendar-id="'+entry.id+'"]').click();
  await page.locator('.calendar-detail [data-calendar-action="source"]').click();
  await page.locator('.completion-desk').waitFor();
  await page.locator('[name="completionTranche"]').waitFor();
  const reopened = await page.locator('[name="completionTranche"]').inputValue();
  const openedDate = await page.locator('[name="completionAsOfDate"]').inputValue();
  const openedReceipt = await page.locator('[name="completionReceipt"]').inputValue();
  requireValue(reopened==='1','Calendar source navigation opened a different tranche.');
  if(openedDate!==native.asOfDate || openedReceipt!==native.paymentIds['0'])
    findings.push({kind:'calendar-completion-context',expectedDate:native.asOfDate,
      openedDate,expectedReceipt:native.paymentIds['0'],openedReceipt});
  await page.locator('[name="completionAsOfDate"]').fill(native.asOfDate);
  await page.locator('[name="completionAsOfDate"]').dispatchEvent('change');
  await page.locator('[name="completionReceipt"]').selectOption(native.paymentIds['0']);
  await screenshot(page,'native-completion-desktop');
  await page.locator('[data-ops-tab="calendar"]').click();
  await idle(page);
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-calendar-setting="view"]').selectOption('agenda');
  await screenshot(page,'calendar-agenda-phone');
  await page.locator('[data-calendar-setting="view"]').selectOption('month');
  await screenshot(page,'calendar-month-phone');
  await context.close();context=null;
  const reopenedContext=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const reopenedPage=await reopenedContext.newPage();
  await openCase(reopenedPage,native.demoCaseId,native.demoPlanId);
  const retained=await apiCalendar(reopenedPage);
  requireValue(retained.case.id===native.demoCaseId && retained.case.version===native.demoVersion &&
    canonical(retained.entries)===canonical(expected.entries) && canonical(retained.undated)===canonical(expected.undated),
    'The saved case changed when reopened in a fresh browser session.');
  await screenshot(reopenedPage,'calendar-reopened-desktop');
  await reopenedContext.close();
  await fs.writeFile(path.join(config.output,'browser-result.json'),JSON.stringify({
    operationId:native.operationId,caseId:native.demoCaseId,version:native.demoVersion,
    browserVersion:browser.version(),screenshots,downloads,findings,pageErrors:errors,
    sourceContextNavigation:findings.some(row=>row.kind==='calendar-completion-context')?'REPAIR_REQUIRED':'COMPLETE',
    completeCalendarDownloads:true,savedCaseReopened:true,
  },null,2)+'\n');
}finally{
  if(context)await context.close();
  await browser.close();
}
"""

def browser_run(args, base, output):
    sys.path.insert(0, str(base / "workspace"))
    from server import create_server
    server = create_server(output / "workspace", base / "sf10_current_candidate.json")
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.2}, daemon=True)
    thread.start()
    try:
        node = args.node or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
        playwright = args.playwright or (
            str(Path(os.environ["CODEX_PRIMARY_RUNTIME_NODE_MODULES"]) / "playwright")
            if os.environ.get("CODEX_PRIMARY_RUNTIME_NODE_MODULES") else "playwright")
        chromium = args.chromium or "/workspace/scratch/5403360e55a4/fleet-lightweight/shared/swarm/toolchains/browser/chromium-153.0.0/chromium"
        if not node or not Path(chromium).is_file():
            raise ValueError("Use the existing Node runtime and Chromium executable from the accepting host.")
        temp = output / "runtime"
        temp.mkdir(mode=0o700, exist_ok=True)
        driver = temp / "calendar-browser.mjs"
        driver.write_text(BROWSER)
        config = temp / "browser-config.json"
        save_json(config, {"url":server.origin,"output":str(output),"playwright":playwright,"chromium":chromium})
        result = subprocess.run([node,str(driver),str(config)],cwd=base,
                                env={**os.environ,"TMPDIR":str(temp)},text=True,capture_output=True)
        (output / "browser-process.log").write_text(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError("The complete calendar browser operation returned " + str(result.returncode) +
                               "; inspect browser-process.log and continue the same saved native case.")
    finally:
        server.shutdown()
        thread.join(timeout=10)
        server.server_close()
        server.workspace.close()

def finish(output):
    native = json.loads((output / "native-result.json").read_text())
    browser = json.loads((output / "browser-result.json").read_text())
    report = json.loads((output / "browser-calendar.json").read_text())
    with (output / "browser-calendar.csv").open(encoding="utf-8-sig",newline="") as stream:
        csv_rows = list(csv.DictReader(stream))
    if len(csv_rows) != len(report["entries"]) + len(report["undated"]):
        raise ValueError("CSV download lost retained calendar rows.")
    if {row["id"] for row in csv_rows} != {row["id"] for row in report["entries"] + report["undated"]}:
        raise ValueError("CSV download differs from the original calendar entry set.")
    ics = (output / "browser-calendar.ics").read_bytes()
    if ics.count(b"BEGIN:VEVENT\r\n") != len(report["entries"]):
        raise ValueError("iCalendar download lost retained dated events.")
    db_path = output / "workspace" / "planning.sqlite3"
    backup = output / "calendar-workspace.sqlite3"
    with sqlite3.connect(db_path) as original, sqlite3.connect(backup) as saved:
        original.backup(saved)
    summary = (
        "# SCF grant delivery calendar\n\n"
        "Operation: " + OPERATION + "\n\n"
        "The retained grant case and its saved forecasts are included with an explicit calendar walkthrough "
        "derived from the same original plan. The walkthrough retains all three tranche assignments, "
        "the native payment clocks, an issuer extension and the complete prepared/submitted tranche form. "
        "The original plan, source cost identities and native Decimal payout amounts are reused.\n\n"
        "The browser opened the original case, operated agenda and month views, followed the original "
        "completion clock, downloaded all three complete formats while an owner filter was selected, "
        "and reopened the saved case in a fresh session. Desktop and phone images accompany the handover.\n\n"
        "Open calendar-walkthrough-case.zip through the original Operations importer to continue editing. "
        "The retained-original-case.zip preserves 7E4E's original version 36. "
        "The calendar-workspace.sqlite3 backup can reopen both received cases with their current local IDs "
        "inside a new private workspace directory named planning.sqlite3. The native server will create "
        "a new local access key when opened.\n\n"
        "Complete native values: calendar.json. Browser downloads: browser-calendar.ics, "
        "browser-calendar.csv and browser-calendar.json. Original assignment source: saved-assignments.json. "
        "Native and browser receiving details: native-result.json and browser-result.json.\n")
    if browser["findings"]:
        summary += "\n## Integrated source findings\n\n" + "\n".join(
            "- " + json.dumps(row,ensure_ascii=False) for row in browser["findings"]) + "\n"
    (output / "README.md").write_text(summary)
    files = sorted(p for p in output.iterdir() if p.is_file() and p.suffix != ".pending"
                   and p.name not in ("receiving-package.zip","package-result.json","MANIFEST.json"))
    manifest = [{"filename":p.name,"bytes":p.stat().st_size,"sha256":digest(p.read_bytes())} for p in files]
    save_json(output / "MANIFEST.json",{"operationId":OPERATION,"files":manifest})
    archive = output / "receiving-package.zip"
    with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as bundle:
        for path in files + [output / "MANIFEST.json"]:
            bundle.write(path,path.name)
    result = {"operationId":OPERATION,"stage":"COMPLETE" if not browser["findings"] and not browser["pageErrors"] else "OPERATED_WITH_FINDINGS",
              "archive":str(archive),"bytes":archive.stat().st_size,"sha256":digest(archive.read_bytes()),
              "nativeCase":native["demoCaseId"],"nativeVersion":native["demoVersion"],
              "findings":browser["findings"],"pageErrors":browser["pageErrors"]}
    save_json(output / "package-result.json",result)
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",type=Path,required=True,help="Complete maintained Merchant checkout")
    parser.add_argument("--archive",type=Path,required=True,help="Original 7E4E version 36 case ZIP")
    parser.add_argument("--output",type=Path,required=True,help="Private directory retained across interruptions")
    parser.add_argument("--source-commit",default=SOURCE_REF,help="Original selected revision or author-integrated successor")
    parser.add_argument("--node")
    parser.add_argument("--playwright")
    parser.add_argument("--chromium")
    args = parser.parse_args()
    args.source=args.source.expanduser().resolve()
    args.archive=args.archive.expanduser().resolve()
    args.output=args.output.expanduser().resolve()
    args.output.mkdir(parents=True,exist_ok=True,mode=0o700)
    base=args.source/NATIVE_PATH
    if not (base/"workspace"/"operations_calendar.py").is_file():
        raise ValueError("Select the complete maintained Merchant checkout containing its native grant calendar.")
    result_path=args.output/"package-result.json"
    if result_path.exists():
        result=json.loads(result_path.read_text())
        if result["stage"]=="COMPLETE":
            print(json.dumps(result),flush=True)
            return 0
    native_prepare(args,base,args.output)
    browser_run(args,base,args.output)
    print(json.dumps(finish(args.output)),flush=True)
    return 0

if __name__=="__main__":
    raise SystemExit(main())
