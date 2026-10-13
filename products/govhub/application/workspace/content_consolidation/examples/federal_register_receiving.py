#!/usr/bin/env python3
"""Run the original Federal Register receiving case through its complete lifecycle.

This composes the maintained receiving entrypoint and GovHub worker. It retains
the same selected target, source editions, review roles, native operations,
rollback maps and full editable handover on every continuation.
"""
from __future__ import annotations

import argparse
from contextlib import nullcontext
import json
import os
from pathlib import Path
import sys

APP = Path(__file__).resolve().parents[2]
if str(APP) not in sys.path:
    sys.path.insert(0, str(APP))

from server import add_paths, open_store
from content_consolidation.examples.native_receiving import (
    ReceivingCase, authenticate_user, compact, read_json, required,
    sha_json, write_json,
)


class NativePending(Exception):
    def __init__(self, result):
        self.result = result
        current = result["operation"]
        super().__init__("Continue original operation " + current["id"] + " from " + current["state"] + ".")


def complete_operation(case, begun, *, timeout, reason, progress=None):
    """Advance the original native row-boundary checkpoint, never a new import."""
    operation_id = begun["operation"]["id"]
    while True:
        current = case.wait(operation_id, timeout=timeout, progress=progress)
        value = current["operation"]
        if value["state"] == "COMPLETE":
            return current
        if value["state"] != "WAITING_NATIVE":
            raise NativePending(current)
        resumed = case.resume(operation_id, reason)
        required(resumed["operation"]["id"] == operation_id,
                 "The original continuation changed its native operation identity.")
        if resumed["operation"]["state"] not in {"QUEUED", "RUNNING", "COMPLETE"}:
            raise NativePending(resumed)


def run_case(workspace, definition, receipts, destination, accounts, *,
             name, review_reason, native_reason, recipient_note,
             timeout=600, own_worker=True, assessment_core=None, progress=None):
    """Complete initial import, enrichment, rollback, restoration and receiving.

    accounts supplies existing authenticated operator, reviewer and admin values.
    Its private passwords are consumed by the host authentication callback only.
    """
    stages = [stage["id"] for stage in definition["stages"]]
    required(stages == ["initial", "enrichment", "restored"],
             "Select the complete original Federal Register three-stage case.")
    required(len(definition.get("source_capture_ids", [])) == 2,
             "Retain both actual source capture identities.")
    selection = definition.get("rollback_selection")
    required(isinstance(selection, list) and selection,
             "Retain the case builder's exact original rollback selection.")
    required(all(isinstance(text, str) and text.strip()
                 for text in (name, review_reason, native_reason, recipient_note)),
             "Supply the operator's review, native activity and receiving instructions.")
    selected = {}
    for role in ("operator", "reviewer", "admin"):
        value = accounts.get(role)
        required(isinstance(value, dict) and isinstance(value.get("name"), str)
                 and isinstance(value.get("password"), str),
                 "Select the existing private " + role + " account.")
        selected[role] = authenticate_user(workspace, value["name"], value["password"])
    results = {"schema": "govhub.federal-register.receiving-workflow.v1",
               "case_id": definition["id"], "case_sha256": sha_json(definition),
               "source_capture_ids": definition["source_capture_ids"],
               "publication_date": definition["publication_date"],
               "stages": {}, "native_operations": []}
    with ReceivingCase(workspace, selected["operator"], definition, receipts) as case:
        family = case.family()
        results["family_id"] = family["id"]
        worker = case.worker() if own_worker else nullcontext()
        with worker:
            first = case.prepare("initial")
            required(not first["issues"], "Resolve the original initial mapping issues before review.")
            case.review("initial", first["mapping"]["sha256"],
                        review_reason + " Initial original source edition.", selected["reviewer"])
            imported = complete_operation(case, case.operation("initial", reason=native_reason),
                timeout=timeout, reason=native_reason + " Continue the original initial row checkpoint.",
                progress=progress)
            results["stages"]["initial"] = {"mapping_id": first["mapping"]["id"],
                "mapping_sha256": first["mapping"]["sha256"], "operation_id": imported["operation"]["id"]}
            results["native_operations"].append(imported)

            captured = complete_operation(case, case.capture_backup("enrichment"),
                timeout=timeout, reason=native_reason + " Continue the original target capture.", progress=progress)
            backup = case.backup_file(captured["operation"]["id"])
            results["target_capture"] = captured
            refreshed = case.prepare("enrichment")
            required(not refreshed["issues"], "Resolve the original refreshed mapping issues before review.")
            case.review("enrichment", refreshed["mapping"]["sha256"],
                        review_reason + " Retained source refresh and document-type enrichment.",
                        selected["reviewer"], backup["id"])
            enriched = complete_operation(case, case.operation("enrichment", reason=native_reason),
                timeout=timeout, reason=native_reason + " Continue the original enrichment row checkpoint.",
                progress=progress)
            results["stages"]["enrichment"] = {"mapping_id": refreshed["mapping"]["id"],
                "mapping_sha256": refreshed["mapping"]["sha256"],
                "operation_id": enriched["operation"]["id"], "source_comparisons": refreshed["comparisons"]}
            results["native_operations"].append(enriched)

            rolled_back = complete_operation(case,
                case.operation("enrichment", "CONTENT_ROLLBACK",
                    native_reason + " Roll back the case's explicitly selected original document and dependencies.",
                    selection=selection),
                timeout=timeout, reason=native_reason + " Continue the original selected rollback.", progress=progress)
            results["rollback_selection"] = selection
            results["native_operations"].append(rolled_back)

            restored = case.prepare("restored")
            required(not restored["issues"], "Resolve the original restoration mapping issues before review.")
            case.review("restored", restored["mapping"]["sha256"],
                        review_reason + " Restore the selected migration-owned source records.",
                        selected["reviewer"], backup["id"])
            restored_result = complete_operation(case, case.operation("restored", reason=native_reason),
                timeout=timeout, reason=native_reason + " Continue the original restoration row checkpoint.",
                progress=progress)
            results["stages"]["restored"] = {"mapping_id": restored["mapping"]["id"],
                "mapping_sha256": restored["mapping"]["sha256"],
                "operation_id": restored_result["operation"]["id"], "source_comparisons": restored["comparisons"]}
            results["native_operations"].append(restored_result)

        # Original worker lifecycle has released its lease before the full backup.
        case.user = selected["admin"]
        credentials = accounts["admin"]
        results["receiving"] = case.receive(destination, name,
            lambda receiver: authenticate_user(receiver, credentials["name"], credentials["password"]),
            recipient_note, assessment_core=assessment_core)
        results["status"] = "COMPLETE"
        write_json(case.directory / "federal-register-receiving.json", results)
        write_json(Path(destination) / "federal-register-receiving.json", results)
        return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_paths(parser)
    parser.add_argument("--case", type=Path, required=True)
    parser.add_argument("--receipts", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--accounts", type=Path, required=True,
                        help="Private existing operator/reviewer/admin names and passwords; never exported.")
    parser.add_argument("--name", required=True)
    parser.add_argument("--review-reason", required=True)
    parser.add_argument("--native-reason", required=True)
    parser.add_argument("--recipient-note", required=True)
    parser.add_argument("--timeout", type=float, default=600,
                        help="Seconds to await each original active operation before returning its saved state.")
    parser.add_argument("--existing-worker", action="store_true",
                        help="Submit to the original already-running GovHub worker.")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        required(args.timeout > 0, "Use a positive operation wait time.")
        result = run_case(open_store(args), read_json(args.case), args.receipts,
            args.destination, read_json(args.accounts), name=args.name,
            review_reason=args.review_reason, native_reason=args.native_reason,
            recipient_note=args.recipient_note, timeout=args.timeout,
            own_worker=not args.existing_worker, assessment_core=args.assessment_core,
            progress=lambda value: print(json.dumps(value, ensure_ascii=False), file=sys.stderr, flush=True))
        print(json.dumps({"status": result["status"], "case_id": result["case_id"],
            "family_id": result["family_id"], "publication_date": result["publication_date"],
            "native_operation_ids": [item["operation"]["id"] for item in result["native_operations"]],
            "receiving": compact(result["receiving"])}, ensure_ascii=False, allow_nan=False))
        return 0
    except NativePending as error:
        print(json.dumps(compact(error.result), ensure_ascii=False, allow_nan=False))
        return 3
    except Exception as error:
        print(json.dumps({"code": getattr(error, "code", "RECEIVING_ERROR"),
                          "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
