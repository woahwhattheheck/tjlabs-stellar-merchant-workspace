"""Run Billing evidence on the already-operated original receiving case.

This is an extension of the maintained correction/expense/hourly course. It uses
the supplied original Operations instances and creates no account or invoice.
"""
from __future__ import annotations
import base64
import hashlib
import json
from pathlib import Path
from model import Problem, canonical, digest
from operations_commercial_adapter import commercial_store

def run_billing_evidence_course(operations, receiving_operations, program_id, output,
                               *, period_start, period_end, as_of, actor,
                               request_prefix, account_key=None):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    commercial_store(operations)
    desk = operations.billing_evidence
    before = {"commercial": operations.commercial.export_rows(program_id),
              "changes": operations.commercial_changes.export_rows(program_id),
              "expense": operations.expense_billing.export_rows(program_id),
              "work": operations.work_billing.export_rows(program_id)}
    catalog = desk.catalog(program_id)
    candidates = []
    for account in catalog["accounts"]:
        rows = [r for r in catalog["items"] if r["accountKey"] == account["accountKey"]]
        if {r["domain"] for r in rows} >= {"MILESTONE", "EXPENSE", "WORK"}:
            candidates.append((account, rows))
    if account_key is not None:
        candidates = [pair for pair in candidates if pair[0]["accountKey"] == account_key]
    if len(candidates) != 1:
        raise ValueError("Select the one already-operated original customer with all three actual source journals.")
    account, rows = candidates[0]
    selection = {"title": "Original customer billing evidence",
        "accountKey": account["accountKey"], "endpointId": account["endpointId"], "customerId": account["customerId"],
        "periodStart": period_start, "periodEnd": period_end, "asOf": as_of,
        "explanation": "The reviewed original milestone, expense and hourly Work invoice chains for the explicitly selected service period. Original account movements remain authoritative.",
        "items": [{"key": row["key"], "expectedChainSha256": row["chainSha256"],
            "basis": "REVIEWED_INCLUSION",
            "reason": "Included by the producing operator for the same original customer and specified service period; original source dates and unknown dates remain visible without proration.",
            "customerExplanation": "Original " + row["domain"].lower() + " billing and its retained correction chain.",
            "shareDescriptions": False, "shareQuantities": row["domain"] == "WORK"} for row in rows]}
    body = {"expectedVersion": catalog["version"], "reviewId": None, "expectedRevision": 0, "selection": selection}
    preview = desk.preview(program_id, body)
    save_body = {**body, "requestId": request_prefix + "-save", "actor": actor,
                 "expectedPreviewSha256": preview["previewSha256"]}
    saved = desk.save(program_id, save_body)
    version_after = operations.read(program_id)["program"]["version"]
    replay = desk.save(program_id, save_body)
    if replay != saved or operations.read(program_id)["program"]["version"] != version_after:
        raise AssertionError("The original save request did not recover its exact retained result.")
    frozen = desk.get(program_id, saved["reviewId"], saved["revision"])
    artifacts = {}
    for audience in ("customer", "internal"):
        exported = desk.export_bundle(program_id, saved["reviewId"], saved["revision"], audience)
        raw = base64.b64decode(exported["contentBase64"], validate=True)
        if hashlib.sha256(raw).hexdigest() != exported["sha256"] or len(raw) != exported["bytes"]:
            raise AssertionError("The actual saved evidence download differs.")
        path = output / exported["filename"]
        path.write_bytes(raw)
        inspected = desk.inspect_bundle(raw)
        if inspected["report"] != frozen["report"] or inspected["audience"] != audience:
            raise AssertionError("The downloaded evidence did not reopen to the exact saved explanation.")
        artifacts[audience] = {"path": str(path), "bytes": len(raw), "sha256": exported["sha256"]}
        if audience == "internal":
            internal_raw = raw
    # Original Operations receiving performs all existing planner/source/journal
    # validation plus the new frozen source-event/history join before insertion.
    received = receiving_operations.import_bundle(internal_raw, "Received original billing evidence",
                                                  request_prefix + "-receive", actor)
    received_case = received["id"]
    received_review = receiving_operations.billing_evidence.get(received_case, saved["reviewId"], saved["revision"])
    if received_review["record"] != frozen["record"] or received_review["report"] != frozen["report"]:
        raise AssertionError("Independent receiving changed the original evidence source or explanation.")
    cold = receiving_operations.billing_evidence.export_bundle(received_case, saved["reviewId"], saved["revision"], "customer")
    if base64.b64decode(cold["contentBase64"], validate=True) != Path(artifacts["customer"]["path"]).read_bytes():
        raise AssertionError("Cold receiving did not retain the exact customer download bytes.")
    after = {"commercial": operations.commercial.export_rows(program_id),
             "changes": operations.commercial_changes.export_rows(program_id),
             "expense": operations.expense_billing.export_rows(program_id),
             "work": operations.work_billing.export_rows(program_id)}
    if after != before:
        raise AssertionError("Billing evidence changed an original billing or financial command journal.")
    result = {"schema": "commons.scf-billing-evidence-course.v1", "programId": program_id,
        "accountKey": account["accountKey"], "customerId": account["customerId"],
        "domains": sorted({r["domain"] for r in rows}), "saved": saved, "sameRequestReplay": replay,
        "receivedCase": received_case, "frozenReviewEqual": True, "customerBytesEqualAfterColdReceive": True,
        "originalFinancialJournalsUnchanged": True, "financialJournalSha256": digest(before), "artifacts": artifacts,
        "rendering": "Pending the existing producing browser course: operate Billing evidence, inspect exact downloaded report and all linked native documents at desktop/390px, LOOK at actual saved screenshots and reopen the complete downloads."}
    (output / "billing-evidence-result.json").write_text(canonical(result) + "\n", encoding="utf-8")
    return result
