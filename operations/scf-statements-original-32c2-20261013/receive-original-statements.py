#!/usr/bin/env python3
"""Continue the original four-file Statements operation through the maintained Grant APIs.

Use the original installed source, loopback server, saved plan and private workspace.
The browser phase supplies its actual captured CSV request; continuation reuses it.
"""
from __future__ import annotations
import argparse
import base64
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import io
import zipfile
from pathlib import Path
import sys
from urllib.parse import urlencode, quote

ORIGINALS = {
 "operating-october.csv": (166, "a4842fa7fca43733098f34b27302fc198c86897d44949dd336250403e5ffbb86"),
 "bank-initial.ofx": (1043, "6bd9002109f50da20db02eff3483af48f3f471e9fb6d53370fc0ce40c781c68a"),
 "demo-final.mt940": (327, "2c555e06421b48bdc98755cd4229a20fdcdcdfa748a9a97198cdf2af854b0bc5"),
 "review-difference.mt940": (327, "a941a83af52647a0e62e10e40f9e0d8055a2526dae4508ea29bb5045618a15a7")
}
MT940 = {"profile":"TEXT_BODY","encoding":"UTF-8","debitCreditProfile":"CD_ONLY",
         "yearWindowStart":1970,"dateBasis":"VALUE_DATE","currencyScales":{"EUR":2}}

def require(condition, message):
    if not condition: raise ValueError(message)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "continue"))
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    source = Path(config["sourceDirectory"]).resolve()
    sys.path.insert(0, str(source))
    from operations_walkthrough import Receiving, atomic, encoded
    from operations_cash_accounts import INPUT_FIELDS

    output = Path(config["output"]).resolve()
    original_dir = Path(config["originals"]).resolve()
    client = Receiving(config["origin"], config["keyFile"], output, config["planId"])
    files = {}
    for name, (length, digest) in ORIGINALS.items():
        raw = (original_dir / name).read_bytes()
        require(len(raw) == length and hashlib.sha256(raw).hexdigest() == digest,
                "Select the complete unchanged original file: " + name)
        files[name] = raw
    if "statementsSourceObservation" not in client.state:
        client.state["statementsSourceObservation"] = datetime.now(timezone.utc).isoformat()
        client.state["statementsOriginals"] = {name: {"bytes": size, "sha256": digest}
                                             for name, (size, digest) in ORIGINALS.items()}
        client.save()
    require(client.state["statementsOriginals"] == {name: {"bytes": size, "sha256": digest}
            for name, (size, digest) in ORIGINALS.items()}, "Keep the original source selection.")

    def save(name, value):
        raw = value if isinstance(value, bytes) else encoded(value)
        path = output / name
        if path.exists():
            require(path.read_bytes() == raw, "Preserve the earlier original output: " + name)
        else:
            atomic(path, raw)
        return path

    def retained_read(name, path):
        saved = output / name
        if saved.exists():
            raw = saved.read_bytes()
            return raw if name.endswith(".zip") else json.loads(raw)
        value = client.read(path)
        save(name, value)
        return value

    def case_facts(value):
        return {key: deepcopy(value[key]) for key in ("program", "records", "sources")}

    def unwrap(value):
        return value["value"] if isinstance(value, dict) and "value" in value and len(value) <= 3 else value

    complete = output / "statements-result.json"
    if args.mode == "continue" and complete.exists():
        raw = complete.read_bytes()
        retained = client.state.get("statementsCompleted")
        require(retained and retained["sha256"] == hashlib.sha256(raw).hexdigest(),
                "Keep the original completed Statements result.")
        result = json.loads(raw)
        require(result["caseId"] == client.state["statementsCaseId"] and
                (not config.get("caseId") or config["caseId"] == result["caseId"]),
                "Resume the original completed Statements case.")
        for record in result["archives"].values():
            archive = (output / record["filename"]).read_bytes()
            require(len(archive) == record["bytes"] and hashlib.sha256(archive).hexdigest() == record["sha256"],
                    "Keep the complete original receiving archive: " + record["filename"])
        print(json.dumps(result))
        return

    def read_case():
        return client.read("/api/operations/" + case_id)

    def statement_source(name):
        return {"filename": name, "contentBase64": base64.b64encode(files[name]).decode("ascii"),
                "observedAt": client.state["statementsSourceObservation"], "sourceUrl": ""}

    original = client.read("/api/plans/" + config["planId"])
    if "statementsPlan" not in client.state:
        client.state["statementsPlan"] = {key: original[key] for key in ("id", "revision", "contentSha256")}
        client.save()
    selected = client.state["statementsPlan"]
    original = client.read("/api/plans/" + selected["id"] + "/revision/" + str(selected["revision"]))
    require(original["contentSha256"] == selected["contentSha256"], "Retain the original selected plan.")
    if config.get("caseId"):
        case_id = config["caseId"]
    else:
        made = client.step("statements-case", "/api/operations", lambda: {
            "planId": selected["id"], "selectedRevision": selected["revision"],
            "expectedContentSha256": selected["contentSha256"], "mode": "WALKTHROUGH",
            "name": "Original Account Statements receiving walkthrough", "calendarStart": "2026-10-12",
            "actor": "32C2 Statements operator", "requestId": client.prefix + "-statements-case"})
        case_id = made["id"]
    current = read_case()
    require(current["program"]["mode"] == "WALKTHROUGH", "Use the original disposable Statements walkthrough case.")
    if "statementsCaseId" in client.state:
        require(client.state["statementsCaseId"] == case_id, "Continue the original selected Statements case.")
    else:
        client.state["statementsCaseId"] = case_id
        client.save()
    case_prefix = "/api/operations/" + case_id

    if config.get("invoiceId"):
        invoice_id = config["invoiceId"]
        invoice = next(row for row in current["records"]["invoices"] if row["id"] == invoice_id)
    else:
        recipe = ("Original Account Statements receiving walkthrough\n"
                  "Supplier invoice: 250.00 USD. Original work order: "
                  "https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791831755980469\n"
                  "This document supplies the disposable walkthrough's invoice source.\n").encode()
        attached = client.command("statements-invoice-source", case_id, "source.add", {
            "filename": "statements-walkthrough-invoice.txt", "contentBase64": base64.b64encode(recipe).decode(),
            "mediaType": "text/plain", "kind": "other", "sourceUrl": "",
            "observedAt": client.state["statementsSourceObservation"]})
        provenance = {"sourceIds": [attached["recordId"]], "sourceNote": "Original disposable Statements receiving recipe."}
        supplier = client.command("statements-supplier", case_id, "contributor.save", {
            "name": "Statements walkthrough supplier", "kind": "PERSON", "contact": "", **provenance})
        invoice = client.command("statements-invoice", case_id, "invoice.save", {
            "contributorId": supplier["recordId"], "number": "STATEMENTS-WALKTHROUGH-250",
            "issuedDate": "2026-10-12", "dueDate": "2026-10-26",
            "lines": [{"id": "supplier", "costId": None, "description": "Original walkthrough supplier expense",
                       "amountUsd": "250.00", "workIds": []}], **provenance})
        invoice_id = invoice["recordId"]
        client.command("statements-invoice-review", case_id, "invoice.review", {"id": invoice_id})
    csv_inputs = {
        "sourceFormat": "CSV", "source": statement_source("operating-october.csv"),
        "accountId": "operating-usd", "accountLabel": "Operating USD", "currency": "USD",
        "format": {"delimiter": ",", "decimalMark": ".", "groupMark": "", "dateFormat": "YYYY-MM-DD",
                   "amountMode": "DEBIT_CREDIT", "positiveDirection": "IN"},
        "columns": {"date": "Date", "reference": "Reference", "description": "Description",
                    "debit": "Debit", "credit": "Credit", "currency": "Currency"},
        "defaultCategory": "OTHER", "openingBalance": "100.00", "closingBalance": "1100.00",
        "decisions": [
            {"rowNumber": 2, "action": "IMPORT", "category": "GRANT", "tranche": 1},
            {"rowNumber": 3, "action": "IMPORT", "category": "INVOICE",
             "allocations": [{"invoiceId": invoice_id, "amountUsd": "250.00"}]},
            {"rowNumber": 4, "action": "IMPORT", "category": "CUSTOMER"}]}
    browser_input = {"schema": "commons.grant.original-statements-browser-input.v1",
                     "caseId": case_id, "invoiceId": invoice_id,
                     "plan": selected, "inputs": csv_inputs, "originalFiles": client.state["statementsOriginals"]}
    save("browser-input.json", browser_input)
    save("original-csv-inputs.json", csv_inputs)
    if args.mode == "prepare":
        print(json.dumps({"state": "original-case-and-invoice-ready", "caseId": case_id,
                          "invoiceId": invoice_id, "browserInput": str(output / "browser-input.json")}))
        return

    browser_operation = json.loads((output / "browser-csv-operation.json").read_text())
    csv_body = browser_operation["input"]
    require(browser_operation["caseId"] == case_id and csv_body["action"] == "statement.receive",
            "Use the actual browser import from this original case.")
    actual_inputs = csv_body["data"]["inputs"]
    require(actual_inputs["source"]["contentBase64"] == csv_inputs["source"]["contentBase64"] and
            actual_inputs["source"]["filename"] == "operating-october.csv",
            "Keep the complete original CSV bytes selected in the browser.")
    for key in ("accountId", "currency", "format"):
        require(actual_inputs.get(key) == csv_inputs[key], "Keep the reviewed original CSV " + key + ".")
    for key, value in csv_inputs["columns"].items():
        require(actual_inputs.get("columns", {}).get(key) == value, "Keep the original source column " + key + ".")
    require(Decimal(actual_inputs["openingBalance"]) == Decimal("100.00") and
            Decimal(actual_inputs["closingBalance"]) == Decimal("1100.00"), "Keep the original CSV balances.")
    decisions = {row["rowNumber"]: row for row in actual_inputs["decisions"]}
    require(len(decisions) == 3 and set(decisions) == {2, 3, 4}, "Review all three original source rows.")
    for expected in csv_inputs["decisions"]:
        actual = decisions[expected["rowNumber"]]
        require(actual.get("action", "IMPORT") == "IMPORT" and actual["category"] == expected["category"],
                "Keep each source row's reviewed direction and classification.")
        if expected["category"] == "GRANT":
            require(actual["tranche"] == 1, "Retain the original first-tranche grant receipt.")
        if expected["category"] == "INVOICE":
            require(len(actual.get("allocations", [])) == 1 and
                    actual["allocations"][0]["invoiceId"] == invoice_id and
                    Decimal(actual["allocations"][0]["amountUsd"]) == Decimal("250.00"),
                    "Retain the original complete supplier invoice allocation.")
    csv_inputs = deepcopy(actual_inputs)
    csv_receipt = client.step("browser-csv-original-request", case_prefix + "/command", lambda: csv_body)
    if browser_operation.get("result") is not None:
        require(csv_receipt == browser_operation["result"], "The original CSV request returned another result.")
    save("browser-csv-native-receipt.json", csv_receipt)

    def preview(key, inputs):
        return unwrap(client.step(key, case_prefix + "/statement-preview",
                      lambda: {"expectedVersion": read_case()["program"]["version"], "inputs": inputs}))

    def receive(key, inputs):
        report = preview(key + "-preview", inputs)
        require(report["canImport"], key + ": complete the source row review: " + json.dumps(report["findings"]))
        result = client.step(key, case_prefix + "/command", lambda: {
            "expectedVersion": report["expectedVersion"], "requestId": client.prefix + "-" + key,
            "actor": "32C2 Statements operator", "note": "Received the complete original " + inputs["source"]["filename"],
            "action": "statement.receive", "data": {"inputs": inputs, "expectedPreviewSha256": report["previewSha256"]}})
        save(key + ".json", {"preview": report, "receipt": result})
        return report, result

    def refused(key, inputs, code=None):
        phases = client.state.setdefault("statementsRefusals", {})
        retained = phases.get(key)
        if retained and retained.get("completed"):
            save(key + ".json", retained["output"])
            return retained["output"]["preview"]
        report = preview(key + "-preview", inputs)
        require(not report["canImport"], key + ": the original conflict must remain visible.")
        if code:
            require(any(row.get("code") == code for row in report["findings"]),
                    key + ": retain the original finding " + code)
        if not retained:
            retained = {"before": case_facts(read_case())}
            phases[key] = retained
            client.save()
        result = client.step(key, case_prefix + "/command", lambda: {
            "expectedVersion": report["expectedVersion"], "requestId": client.prefix + "-" + key,
            "actor": "32C2 Statements operator", "note": "Original receiving conflict and rollback",
            "action": "statement.receive", "data": {"inputs": inputs, "expectedPreviewSha256": report["previewSha256"]}},
            expected=409)
        after = case_facts(read_case())
        require(retained["before"] == after, key + ": the failed receive changed the original case.")
        retained["output"] = {"preview": report, "result": result,
                              "retainedCaseVersion": after["program"]["version"]}
        retained["completed"] = True
        client.save()
        save(key + ".json", retained["output"])
        return report

    repeated, repeated_receipt = receive("csv-original-reimport", csv_inputs)
    require(repeated["summary"]["newCount"] == 0 and repeated["summary"]["existingCount"] == 3,
            "The unchanged CSV must resolve all three original movements.")
    overlap = deepcopy(csv_inputs)
    overlap["sourceReviewNote"] = "Second review of the complete original overlapping statement; retain existing payment identities."
    overlap_report, _ = receive("csv-overlapping-review", overlap)
    require(overlap_report["summary"]["newCount"] == 0, "The overlapping original review duplicated cash.")
    conflict = deepcopy(csv_inputs)
    conflict["decisions"] = [
        {"rowNumber": 3, "action": "IMPORT", "category": "OTHER"} if row["rowNumber"] == 3 else row
        for row in conflict["decisions"]]
    refused("csv-original-reference-conflict", conflict)

    correction_key = "csv-source-note-correction-preview"
    if correction_key not in client.state["steps"]:
        cash = next(row for row in read_case()["records"]["cash"]
                    if row.get("externalRef") == "TRX1002" and row["state"] == "OBSERVED")
        replacement = {key: deepcopy(cash[key]) for key in INPUT_FIELDS if key in cash}
        replacement["sourceNote"] = cash.get("sourceNote", "") + "\nSupplier allocation reviewed against the original 250 USD invoice."
        correction_input = {"expectedVersion": read_case()["program"]["version"], "originalCashId": cash["id"],
                            "replacement": replacement, "reason": "Retain the reviewed supplier allocation source note.",
                            "selection": {"startDate": "2026-10-12", "endDate": "2026-10-12",
                                          "network": "statement/operating-usd", "currency": "USD", "asset": "USD"}}
    else:
        correction_input = client.state["steps"][correction_key]["body"]
    correction_preview = client.step(correction_key, case_prefix + "/cash-correction-preview", lambda: correction_input)
    correction_body = {**correction_input, "expectedPreviewSha256": correction_preview["previewSha256"],
                       "actor": "32C2 Statements operator", "requestId": client.prefix + "-csv-source-note-correction"}
    correction = client.step("csv-source-note-correction", case_prefix + "/cash-correction", lambda: correction_body)
    replay = client.step("csv-source-note-correction-replay", case_prefix + "/cash-correction", lambda: correction_body)
    require(replay == correction, "Keep the original correction result on exact replay.")
    save("csv-source-note-correction.json", {"input": correction_body, "preview": correction_preview, "result": correction})
    corrected_overlap = deepcopy(csv_inputs)
    corrected_overlap["sourceReviewNote"] = "Original statement received through the retained source-note correction chain."
    corrected_preview, corrected_receipt = receive("csv-corrected-original-overlap", corrected_overlap)
    require(corrected_preview["summary"]["newCount"] == 0 and corrected_preview["summary"]["existingCount"] == 3,
            "Keep the original three cash identities through their retained correction.")

    def bank_inputs(key, filename, kind, account, currency):
        basic = {"sourceFormat": kind, "source": statement_source(filename)}
        if kind == "MT940": basic["statementOptions"] = deepcopy(MT940)
        inspection = unwrap(client.step(key + "-inspection", case_prefix + "/statement-inspect",
                    lambda: {"expectedVersion": read_case()["program"]["version"], "inputs": basic}))
        sections = [row for row in inspection["statements"] if row["cashEligible"] and row["currency"] == currency]
        require(len(sections) == 1, "Select the exact original account section from " + filename)
        selected_section = sections[0]
        values = {**basic, "statementId": selected_section["id"], "accountId": account,
                  "accountLabel": "Original " + currency + " bank account", "currency": currency,
                  "defaultCategory": "OTHER", "decisions": []}
        save(key + "-inspection.json", inspection)
        return values, selected_section

    ofx, ofx_section = bank_inputs("original-ofx", "bank-initial.ofx", "OFX", "ofx-usd", "USD")
    ofx_raw = preview("original-ofx-unrounded-preview", ofx)
    problem = [row for row in ofx_raw["rows"] if row["reference"] == "DEMO-RECEIPT-001"]
    require(len(problem) == 1 and problem[0]["status"] == "CONFLICT", "Retain the original 1250.005 USD precision conflict.")
    ofx["decisions"] = [{"rowNumber": problem[0]["rowNumber"], "action": "EXCLUDE",
                        "reason": "The original 1250.005 USD exceeds the cash currency precision; retain it for source correction."}]
    ofx_preview, ofx_receipt = receive("original-ofx-reviewed", ofx)
    require(ofx_preview["summary"]["newCount"] == 2 and ofx_preview["summary"]["excludedCount"] == 1,
            "Receive the original fee and older movement with the precision row explicitly excluded.")
    receive("original-ofx-reimport", ofx)
    renamed = deepcopy(ofx); renamed["accountId"] = "renamed-ofx-usd"
    refused("original-ofx-alias-duplicate", renamed, "BANK_SOURCE_ACCOUNT_ALIAS_CONFLICT")

    mt940, mt_section = bank_inputs("original-mt940", "demo-final.mt940", "MT940", "operating-eur", "EUR")
    mt940["openingBalance"] = mt_section["openingBalance"]["amount"]
    mt940["closingBalance"] = mt_section["closingBalance"]["amount"]
    require(Decimal(mt940["openingBalance"]) == Decimal("1500.00") and
            Decimal(mt940["closingBalance"]) == Decimal("1749.75"), "Use the source's original booked balances.")
    mt_preview, mt_receipt = receive("original-mt940-reviewed", mt940)
    receive("original-mt940-reimport", mt940)
    different, _ = bank_inputs("original-mt940-difference", "review-difference.mt940", "MT940", "operating-eur", "EUR")
    refused("original-mt940-booked-difference", different, "BOOKED_BALANCE_DIFFERENCE")

    for key, receipt, start, end in [
        ("csv", csv_receipt, "2026-10-12", "2026-10-12"),
        ("mt940", mt_receipt, "2026-09-16", "2026-09-16")]:
        reconciliation = {"expectedVersion": read_case()["program"]["version"], "reconciliationId": None,
            "expectedRevision": 0, "state": "CLOSED", "document": {"name": "Original " + key + " account period",
                "statementSourceId": receipt["recordId"], "periodStart": start, "periodEnd": end,
                "links": [], "exclusions": [], "outstanding": [], "note": "Complete original statement and native cash review."}}
        preview_key = key + "-reconciliation-preview"
        if preview_key in client.state["steps"]: reconciliation = client.state["steps"][preview_key]["body"]
        reviewed = client.step(preview_key, case_prefix + "/account-reconciliation-preview", lambda: reconciliation)
        body = {**reconciliation, "expectedPreviewSha256": reviewed["previewSha256"],
                "actor": "32C2 Statements operator", "requestId": client.prefix + "-" + key + "-period-close"}
        closed = client.step(key + "-period-close", case_prefix + "/account-reconciliation", lambda: body)
        save(key + "-period-close.json", {"preview": reviewed, "result": closed})
        original_inputs = retained_read(key + "-reopened-original-inputs.json",
            case_prefix + "/account-reconciliation-statements/" + receipt["recordId"] + "/inputs")

    current = retained_read("complete-operated-case.json", case_prefix)
    select = {"startDate": "2024-08-15", "endDate": "2026-10-12",
              "expectedVersion": current["program"]["version"]}
    account = retained_read("complete-cash-account.json", case_prefix + "/cash-account?" + urlencode(select))
    archive = retained_read("complete-statements-cash-account.zip", case_prefix + "/cash-account/export.zip?" +
                            urlencode({**select, "expectedReportSha256": account["reportSha256"]}))
    archive_path = output / "complete-statements-cash-account.zip"
    with zipfile.ZipFile(io.BytesIO(archive)) as package:
        complete_case = package.read("operations-case.zip")
    save("complete-original-operations-case.zip", complete_case)
    with zipfile.ZipFile(io.BytesIO(complete_case)) as package:
        original_operations = json.loads(package.read("operations.json"))
    save("complete-original-operations.json", original_operations)
    result = {"schema": "commons.grant.original-statements-result.v1", "state": "original-native-account-exported",
              "caseId": case_id, "caseVersion": current["program"]["version"], "invoiceId": invoice_id,
              "originalCsvRequestId": csv_body["requestId"], "originalCsv": csv_receipt,
              "correction": correction, "ofx": ofx_receipt, "mt940": mt_receipt,
              "archives": {
                  "cashAccount": {"filename": archive_path.name, "bytes": len(archive),
                                  "sha256": hashlib.sha256(archive).hexdigest()},
                  "completeCase": {"filename": "complete-original-operations-case.zip", "bytes": len(complete_case),
                                   "sha256": hashlib.sha256(complete_case).hexdigest()}},
              "originalFiles": client.state["statementsOriginals"]}
    client.state["statementsCompleted"] = {"sha256": hashlib.sha256(encoded(result)).hexdigest()}
    client.save()
    save("statements-result.json", result)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
