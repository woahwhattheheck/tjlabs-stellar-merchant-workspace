#!/usr/bin/env python3
"""Run one labelled native amendment case through complete receiving.

This operator uses the original Workspace and Operations APIs. All work, invoice
and cash rows are labelled WALKTHROUGH inputs; the public source plan is retained
unchanged. A saved request is replayed verbatim after interruption.
"""
from __future__ import annotations
import argparse, base64, csv, hashlib, io, json, os, sys, zipfile
from copy import deepcopy
from pathlib import Path

OPERATION = "SCF-GRANT-PLAN-AMENDMENT-018A-20261012-01"
ACTOR = "Internal engineering walkthrough"
DAY = "2026-10-12"
PREFIX = "amendment-receiving-018a-"
SOURCE_SHA = "79090013305fd4173413e7b2aad3b63c0ec696d1e8323c526eaea2c18d402ece"


def atomic(path, raw):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_name(path.name + ".incoming")
    with open(staging, "wb") as handle:
        handle.write(raw); handle.flush(); os.fsync(handle.fileno())
    os.replace(staging, path)


def main(root):
    root = Path(root).resolve()
    app = Path(__file__).resolve().parent
    sys.path.insert(0, str(app))
    from model import Workspace, Problem, canonical, digest
    from operations import Operations
    import operations_amendments as amendments

    output = root / "output"
    output.mkdir(parents=True, exist_ok=True)
    checkpoint = output / "amendment-receiving-checkpoint.json"
    journal = json.loads(checkpoint.read_bytes()) if checkpoint.exists() else {
        "schema": "stellar-forge.sf47-amendment-receiving.v1",
        "operationId": OPERATION, "issued": {}, "phases": {}, "artifacts": {}
    }
    if journal["operationId"] != OPERATION:
        raise RuntimeError("Keep the original receiving operation.")
    def persist():
        atomic(checkpoint, (canonical(journal) + "\n").encode())
    def retained(name, raw):
        path = output / name
        identity = {"path": str(path), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        if path.exists() and path.read_bytes() != raw:
            raise RuntimeError("The retained original output differs: " + name)
        if not path.exists(): atomic(path, raw)
        journal["artifacts"][name] = identity
        persist()
        return identity
    def retain_json(name, value):
        return retained(name, (canonical(value) + "\n").encode())
    def phase(name, callback):
        if name in journal["phases"]:
            return journal["phases"][name]
        journal["activePhase"] = name
        persist()
        value = callback()
        journal["phases"][name] = value
        journal.pop("error", None)
        persist()
        print(json.dumps({"phase": name, "status": "COMPLETE"}), flush=True)
        return value

    source = app.parent / "sf10_current_candidate.json"
    source_raw = source.read_bytes()
    if hashlib.sha256(source_raw).hexdigest() != SOURCE_SHA:
        raise RuntimeError("The selected complete public source changed.")
    handles = {}
    def opened(label):
        if label not in handles:
            workspace = Workspace(root / ("data-" + label), source)
            handles[label] = (workspace, Operations(workspace))
        return handles[label]
    def close(label):
        if label in handles:
            handles.pop(label)[0].close()
    def original():
        return opened("original")
    def current(ops=None, pid=None):
        ops = ops or original()[1]
        pid = pid or journal["caseId"]
        return ops.read(pid)
    def execute(key, action, data, note, ops=None, pid=None):
        ops = ops or original()[1]
        pid = pid or journal["caseId"]
        issued = journal["issued"].get(key)
        if issued is None:
            body = {"expectedVersion": current(ops, pid)["program"]["version"],
                    "requestId": PREFIX + key, "actor": ACTOR, "note": note,
                    "action": action, "data": deepcopy(data)}
            issued = {"caseId": pid, "request": body}
            journal["issued"][key] = issued
            persist()
        if issued["caseId"] != pid or issued["request"]["action"] != action:
            raise RuntimeError("The phase changed its original action identity.")
        if "result" in issued:
            return issued["result"]
        try:
            result = ops.command(pid, issued["request"])
        except Problem as error:
            issued["lastError"] = {"code": error.code, "status": error.status, "message": str(error)}
            persist()
            raise
        issued["result"] = result
        issued.pop("lastError", None)
        persist()
        return result

    def seed():
        workspace, ops = original()
        plan = workspace.read(workspace.list()[0]["id"], 1)
        body = {"planId": plan["id"], "selectedRevision": plan["revision"],
                "expectedContentSha256": plan["contentSha256"],
                "name": "Native amendment receiving — labelled internal walkthrough",
                "mode": "WALKTHROUGH", "calendarStart": DAY,
                "actor": ACTOR, "requestId": PREFIX + "create"}
        receipt = ops.create(body)
        journal["caseId"], journal["planId"] = receipt["id"], plan["id"]
        journal["source"] = {"sha256": SOURCE_SHA, "bytes": len(source_raw), "filename": source.name}
        journal["baselinePlan"] = {"revision": plan["revision"], "sha256": plan["contentSha256"]}
        persist()
        return {"case": receipt, "source": journal["source"]}
    def intake_work():
        workspace, ops = original()
        contributor = execute("contributor", "contributor.save", {
            "name": "Internal walkthrough source author", "kind": "ROLE",
            "note": "Labelled operating exercise; these entries are not customer invoices or payments."
        }, "Open the original native role for this WALKTHROUGH only.")["recordId"]
        plan = workspace.read(journal["planId"], journal["baselinePlan"]["revision"])
        costs = plan["scenario"]["future_costs"]
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(["externalId","contributor","costId","description","startDate","endDate","hours","fundingBasis"])
        writer.writerow(["walkthrough-work-1", contributor, costs[0]["id"], "Labelled amendment exercise: package implementation", DAY, DAY, "100", "INTERNAL"])
        writer.writerow(["walkthrough-work-2", contributor, costs[1]["id"], "Labelled amendment exercise: handover", DAY, DAY, "5", "INTERNAL"])
        raw = stream.getvalue().encode()
        retained("Walkthrough_Work_Source.csv", raw)
        upload = execute("work-source", "work-intake.upload", {
            "name": "Original labelled walkthrough work source", "kind": "WORK",
            "file": {"filename": "Walkthrough_Work_Source.csv", "mediaType": "text/csv",
                     "contentBase64": base64.b64encode(raw).decode()},
            "format": {}
        }, "Retain this complete internal exercise CSV through native work intake.")
        chosen = ops.work_intake(journal["caseId"], upload["recordId"])["intake"]
        if chosen["state"] == "APPLIED":
            accepted = journal["issued"]["work-source-apply"]["result"]
            journal["contributorId"] = contributor
            journal["costIds"] = [row["id"] for row in costs]
            persist()
            return {"intakeId": chosen["id"], "recordIds": accepted["createdRecordIds"], "rows": 2}
        view = ops.preview_work_intake(journal["caseId"], {
            "expectedVersion": current()["program"]["version"],
            "intakeId": chosen["id"], "revision": chosen["revision"], "document": chosen["document"]
        })
        if not view["summary"]["ready"]:
            raise RuntimeError("Native source mapping requires a decision: " + canonical(view))
        accepted = execute("work-source-apply", "work-intake.apply", {
            "intakeId": chosen["id"], "expectedRevision": chosen["revision"],
            "document": view["document"], "expectedPreviewSha256": view["previewSha256"]
        }, "Apply the two reviewed, labelled native work records once.")
        journal["contributorId"] = contributor
        journal["costIds"] = [row["id"] for row in costs]
        persist()
        return {"intakeId": chosen["id"], "recordIds": accepted["createdRecordIds"], "rows": 2}
    def invoice_and_cash():
        _, ops = original()
        records = current()["records"]
        work = next(row for row in records["work"] if row["costId"] == journal["costIds"][0])
        original_note = {"schema": "internal.walkthrough-ledger.v1", "purpose": "Native amendment receiving exercise",
                         "invoiceUsd": "10000.00", "cashOutUsd": "9500.00",
                         "notice": "Labelled simulated entries in a WALKTHROUGH case."}
        raw = (canonical(original_note) + "\n").encode()
        source_id = execute("ledger-source", "source.add", {
            "filename": "Walkthrough_Ledger_Source.json", "mediaType": "application/json", "kind": "other",
            "contentBase64": base64.b64encode(raw).decode()
        }, "Retain the original labelled exercise ledger input.")["recordId"]
        invoice = execute("invoice", "invoice.save", {
            "contributorId": journal["contributorId"], "number": "WALKTHROUGH-018A-001",
            "issuedDate": DAY, "dueDate": "2026-10-27",
            "lines": [{"id":"original-line-1", "costId": journal["costIds"][0],
                      "description": "Labelled operating exercise", "amountUsd": "10000.00", "workIds": [work["id"]]}],
            "sourceIds": [source_id], "sourceNote": original_note["notice"]
        }, "Retain the exercise invoice against its original work/package identities.")["recordId"]
        cash = execute("cash", "cash.record", {
            "direction": "OUT", "category": "INVOICE", "date": DAY, "currency": "USD",
            "amount": "9500.00", "externalRef": "WALKTHROUGH-018A-CASH-001",
            "allocations": [{"invoiceId": invoice, "amountUsd": "9500.00"}],
            "sourceIds": [source_id], "sourceNote": original_note["notice"]
        }, "Record the labelled exercise allocation without changing its invoice identity.")["recordId"]
        journal["ledgerSourceId"], journal["invoiceId"], journal["cashId"] = source_id, invoice, cash
        persist()
        return {"invoiceId": invoice, "cashId": cash, "sourceId": source_id}
    def old_forecast():
        _, ops = original()
        inputs = {"name": "Original pre-amendment walkthrough forecast", "asOfDate": DAY, "calendarStart": DAY,
                  "note": "Complete historical source snapshot retained before amendment."}
        preview = ops.preview_forecast(journal["caseId"], {"expectedVersion":current()["program"]["version"], "inputs":inputs})
        receipt = execute("old-forecast", "forecast.save", {"inputs":inputs,"expectedPreviewSha256":preview["previewSha256"]},
                          "Keep the original saved forecast and its full source snapshot.")
        original_forecast = ops.forecast(journal["caseId"], receipt["recordId"])
        retain_json("Original_Pre_Amendment_Forecast.json", original_forecast)
        return {"id":receipt["recordId"], "sha256":digest(original_forecast)}
    def save_selected_plan():
        workspace, ops = original()
        old = workspace.read(journal["planId"], journal["baselinePlan"]["revision"])
        fields = ("id","tranche","start_day","end_day","estimated_hours","assumed_hourly_rate_usd",
                  "amount_usd","category","remaining_work","measurable_proof")
        costs = [{key:deepcopy(row[key]) for key in fields if key in row} for row in old["scenario"]["future_costs"]]
        costs[0].update(estimated_hours=70, amount_usd=6650,
                        remaining_work=costs[0]["remaining_work"] + " Internal amendment walkthrough refinement.")
        costs[1].update(estimated_hours=50, amount_usd=4750)
        selected = workspace.save(journal["planId"], old["revision"],
            {"future_costs": costs}, old["planning"],
            "Labelled partial allocation change; exact package IDs and total original proposal remain.", PREFIX+"selected-plan")
        journal["selectedPlan"]={"revision":selected["revision"],"contentSha256":selected["contentSha256"]}
        persist()
        later = workspace.save(journal["planId"], selected["revision"],
            {"scenario_name": selected["scenario"]["scenario_name"] + " — later saved walkthrough label"},
            selected["planning"], "Retain a later native planner revision while selecting the earlier complete amendment.",
            PREFIX+"later-plan")
        journal["laterPlan"]={"revision":later["revision"],"contentSha256":later["contentSha256"]}
        persist()
        old_file = output / "Original_Pre_Amendment_Case.zip"
        original_archive = old_file.read_bytes() if old_file.exists() else ops.export(journal["caseId"])
        retained("Original_Pre_Amendment_Case.zip", original_archive)
        return {"selected":journal["selectedPlan"], "laterSaved":journal["laterPlan"]}
    def inputs():
        return {"selectedRevision":journal["selectedPlan"]["revision"],
                "expectedContentSha256":journal["selectedPlan"]["contentSha256"], "asOfDate":DAY,
                "reason":"Reallocate the two original first-tranche package estimates while retaining all recorded identities.",
                "basis":{"kind":"WALKTHROUGH","reference":OPERATION,"date":DAY,
                         "sourceIds":[journal["ledgerSourceId"]],"note":"Internal operating exercise; the original source plan remains retained."}}
    def proposal(key, ident=None, revision=0):
        _, ops = original()
        view = ops.preview_amendment(journal["caseId"], {"expectedVersion":current()["program"]["version"], "inputs":inputs()})
        if not view["compatibility"]["compatible"]:
            raise RuntimeError("The selected compatible amendment has conflicts: "+canonical(view["compatibility"]))
        retained_key = key + "-preview.json"
        retain_json(retained_key, view)
        receipt = execute(key,"amendment.save",{
            "amendmentId":ident,"expectedRevision":revision,"inputs":inputs(),
            "expectedPreviewSha256":view["previewSha256"]
        },"Save the full selected revision and original comparison.")
        return ops.amendment(journal["caseId"],receipt["recordId"],receipt["amendmentRevision"])["amendment"]
    def review(key, row):
        receipt=execute(key,"amendment.review",{
            "amendmentId":row["id"],"expectedRevision":row["revision"],"expectedAmendmentSha256":row["sha256"],
            "expectedPreviewSha256":row["preview"]["previewSha256"],"decision":"APPROVE",
            "statement":"Internal walkthrough review: package IDs, work, invoice allocation, payment clocks and original source remain; selected estimate overruns are visible.",
            "sourceIds":[journal["ledgerSourceId"]]
        },"Record the actual walkthrough operator's decision on this exact comparison.")
        return original()[1].amendment(journal["caseId"],receipt["recordId"],receipt["amendmentRevision"])["amendment"]
    def stale_proposal():
        _,ops=original()
        if "amendmentId" not in journal:
            row=proposal("proposal")
            journal["amendmentId"]=row["id"];persist()
        else:row=ops.amendment(journal["caseId"],journal["amendmentId"])["amendment"]
        if row["state"]=="PROPOSED":row=review("first-review",row)
        contributor=next(r for r in current()["records"]["contributors"] if r["id"]==journal["contributorId"])
        execute("later-contributor-note","contributor.save",{
            **{key:deepcopy(contributor[key]) for key in ("id","name","kind","contact","note","sourceIds","sourceNote")},
            "note":"Later retained case note entered after the first amendment review."
        },"Preserve the ordinary later case edit before any amendment application.")
        data={"amendmentId":row["id"],"expectedRevision":row["revision"],
              "expectedAmendmentSha256":row["sha256"],"acknowledgeBaselineChange":True}
        try: execute("stale-apply","amendment.apply",data,"Attempt the earlier exact review against the later case.")
        except Problem as error:
            if error.code!="AMENDMENT_SOURCE_CONFLICT":raise
            return {"code":error.code,"originalAmendmentId":row["id"],"laterEditRetained":True}
        raise RuntimeError("A stale reviewed amendment changed the baseline.")
    def apply_selected():
        _,ops=original()
        existing=ops.amendment(journal["caseId"],journal["amendmentId"])["amendment"]
        if "amendment-resave" not in journal["issued"]:
            row=proposal("amendment-resave",existing["id"],existing["revision"])
        else:
            receipt=journal["issued"]["amendment-resave"].get("result")
            if receipt is None:row=proposal("amendment-resave",existing["id"],existing["revision"])
            else:row=ops.amendment(journal["caseId"],receipt["recordId"],receipt["amendmentRevision"])["amendment"]
        row=review("final-review",row)
        before_file=output/"Reviewed_Pre_Apply_Case.json"
        before=json.loads(before_file.read_bytes()) if before_file.exists() else current()
        retain_json("Reviewed_Pre_Apply_Case.json",before)
        receipt=execute("apply","amendment.apply",{
            "amendmentId":row["id"],"expectedRevision":row["revision"],"expectedAmendmentSha256":row["sha256"],
            "acknowledgeBaselineChange":True
        },"Apply the exact reviewed earlier native revision to this same case.")
        accepted=current()
        if accepted["records"]!=before["records"] or accepted["sources"]!=before["sources"]:
            raise RuntimeError("Baseline application changed the retained original work or cash.")
        if accepted["program"]["planRevision"]!=journal["selectedPlan"]["revision"]:
            raise RuntimeError("Application selected the later planner head.")
        close("original")
        _,ops=original()
        replay=ops.command(journal["caseId"],journal["issued"]["apply"]["request"])
        if replay!=receipt or current()["program"]["version"]!=accepted["program"]["version"]:
            raise RuntimeError("Original application replay created another native event.")
        chosen=ops.amendment(journal["caseId"],row["id"])["amendment"]
        package=next(p for p in chosen["preview"]["exposure"]["selected"] if p["costId"]==journal["costIds"][0])
        if package["recordedInvoicesOverPlanUsd"]!="3350.00" or package["recordedPaymentsOverPlanUsd"]!="2850.00":
            raise RuntimeError("The retained invoice/payment exposure differs from the selected estimate.")
        if float(package["recordedHoursOverPlan"])!=30:
            raise RuntimeError("The selected package did not retain its recorded hour overrun.")
        return {"receipt":receipt,"exactReplay":replay,"exposure":package,
                "selectedRevision":accepted["program"]["planRevision"],"laterSavedRevision":journal["laterPlan"]["revision"]}
    def full_case():
        _,ops=original()
        r=execute("complete-review","review",{},"Complete internal receiving review of the amended case and unchanged source records.")
        full_file=output/"Amended_Complete_Case.zip"
        full=full_file.read_bytes() if full_file.exists() else ops.export(journal["caseId"])
        retained("Amended_Complete_Case.zip",full)
        document,files=ops._unpack(full)
        if len(document["amendments"])!=5 or "amendment-history.json" not in files or "amendment-changes.csv" not in files:
            raise RuntimeError("The complete native handover omitted amendment history.")
        retain_json("Amended_Complete_Case.json",document)
        return {"review":r,"editions":len(document["amendments"]),"members":sorted(files),
                "caseVersion":document["program"]["version"]}
    def receive_and_continue():
        workspace,ops=opened("receiver")
        full=(output/"Amended_Complete_Case.zip").read_bytes()
        receipt=ops.import_bundle(full,"Received native amendment walkthrough",PREFIX+"receive",ACTOR)
        journal["receiverId"]=receipt["id"];persist()
        initial_file=output/"First_Received_Case.json"
        imported=json.loads(initial_file.read_bytes()) if initial_file.exists() else ops.read(receipt["id"])
        retain_json("First_Received_Case.json",imported)
        original_doc=json.loads((output/"Amended_Complete_Case.json").read_bytes())
        if imported["records"]!=original_doc["records"] or imported["plan"]["contentSha256"]!=original_doc["plan"]["contentSha256"]:
            raise RuntimeError("Cold receiving changed native records or selected plan.")
        if imported["program"]["origin"]["programId"]!=journal["caseId"]:
            raise RuntimeError("Cold receiving lost its original case provenance.")
        received_history=amendments.load(ops,receipt["id"])
        if received_history!=original_doc["amendments"]:
            raise RuntimeError("Cold receiving changed the original amendment editions.")
        for source in imported["sources"]:
            metadata,raw=ops.source(receipt["id"],source["id"])
            if hashlib.sha256(raw).hexdigest()!=source["sha256"]:
                raise RuntimeError("Cold receiving lost an original source.")
        contributor=next(r for r in imported["records"]["contributors"] if r["id"]==journal["contributorId"])
        later=execute("received-later-note","contributor.save",{
            **{key:deepcopy(contributor[key]) for key in ("id","name","kind","contact","note","sourceIds","sourceNote")},
            "note":"Later receiving-office note must survive replay of the original complete import."
        },"Retain the receiving operator's later working change.",ops,receipt["id"])
        replay=ops.import_bundle(full,"Received native amendment walkthrough",PREFIX+"receive",ACTOR)
        if replay!=receipt or ops.read(receipt["id"])["program"]["version"]!=later["version"]:
            raise RuntimeError("Replaying a complete import replaced the later receiving work.")
        received_file=output/"Received_Complete_Case.zip"
        received_export=received_file.read_bytes() if received_file.exists() else ops.export(receipt["id"])
        retained("Received_Complete_Case.zip",received_export)
        close("receiver")
        _,ops=opened("receiver")
        reopened=ops.read(receipt["id"])
        if reopened["program"]["version"]!=later["version"]:
            raise RuntimeError("Reopen changed the original receiver version.")
        return {"receipt":receipt,"replayed":replay,"laterVersion":later["version"],
                "originalCaseId":journal["caseId"],"amendmentEditions":len(received_history)}
    def second_cold_receiving():
        _,ops=opened("second-receiver")
        raw=(output/"Received_Complete_Case.zip").read_bytes()
        receipt=ops.import_bundle(raw,"Second native receiving of original amendment history",PREFIX+"second-receive",ACTOR)
        state=ops.read(receipt["id"])
        if state["program"]["origin"]["programId"]!=journal["receiverId"] or len(amendments.load(ops,receipt["id"]))!=5:
            raise RuntimeError("The complete received case cannot continue through another native handover.")
        retain_json("Second_Received_Case.json",state)
        return {"receipt":receipt,"sourceCaseId":journal["receiverId"],"selectedRevision":state["program"]["planRevision"]}

    try:
        if journal.get("status")=="PASS":
            for value in journal["artifacts"].values():
                raw=Path(value["path"]).read_bytes()
                if len(raw)!=value["bytes"] or hashlib.sha256(raw).hexdigest()!=value["sha256"]:
                    raise RuntimeError("A retained completed artifact changed.")
            print(json.dumps({"status":"PASS","reused":True,"result":str(output/"amendment-receiving-result.json")}),flush=True)
            return journal
        phase("original_public_plan_and_case",seed)
        phase("original_work_file_native_intake",intake_work)
        phase("source_bound_invoice_and_cash",invoice_and_cash)
        phase("historical_forecast_snapshot",old_forecast)
        phase("selected_complete_native_revision",save_selected_plan)
        phase("later_case_change_requires_new_review",stale_proposal)
        phase("reviewed_apply_and_exact_replay",apply_selected)
        phase("complete_original_case_export",full_case)
        phase("cold_receive_replay_and_reopen",receive_and_continue)
        phase("received_case_complete_handover",second_cold_receiving)
        journal.pop("activePhase",None)
        result={"schema":"stellar-forge.sf47-amendment-receiving-result.v1","status":"PASS",
                "operationId":OPERATION,"source":journal["source"],"caseId":journal["caseId"],
                "receiverId":journal["receiverId"],"checks":journal["phases"],"artifacts":journal["artifacts"],
                "scope":"Labelled internal WALKTHROUGH using original public source, native intake, amendment, replay and complete receiving."}
        atomic(output/"amendment-receiving-result.json",(canonical(result)+"\n").encode())
        journal["status"]="PASS";persist()
        print(json.dumps({"status":"PASS","result":str(output/"amendment-receiving-result.json"),"phases":len(journal["phases"])}),flush=True)
        return result
    except BaseException as error:
        journal["error"]={"type":type(error).__name__,"message":str(error)}
        persist()
        raise
    finally:
        for workspace,_ in handles.values():workspace.close()


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--root",required=True)
    args=parser.parse_args()
    main(args.root)
