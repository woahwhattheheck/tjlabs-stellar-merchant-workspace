"""Complete delivery risk commands on the original Operations owner.

The shared CLI owns workspace open/close and atomic output publication. Reentry
uses the complete retained command, original request ID and original transaction.
"""
from __future__ import annotations

import json

from model import Problem, canonical
from operations_risks import ACTION
from operations import MAX_SOURCE

COMMANDS = {"risks", "risks-seed", "risks-preview", "risks-save", "risks-show",
            "risks-history", "risks-export", "risks-request", "risks-resume"}


def operates(action):
    return action in COMMANDS


def register(command, mutation):
    command("risks", "List complete immutable delivery risk register editions", case=True, output=True)
    target = command("risks-seed", "Open a complete editable register from its current or selected edition",
                     case=True, output=True)
    target.add_argument("--expected-version", type=int, required=True)
    target.add_argument("--review", help="Original review ID; omission selects the current register")
    target.add_argument("--document-only", action="store_true")
    for action in ("risks-preview", "risks-save"):
        target = command(action, "Review the complete register" if action == "risks-preview" else
                         "Save one reviewed register through the original request journal", case=True, output=True)
        target.add_argument("--document", required=True, help="Complete UTF-8 risk register document JSON")
        if action == "risks-save":
            mutation(target, version=True, note_required=True)
            target.add_argument("--expected-preview-sha256", required=True)
        else:
            target.add_argument("--expected-version", type=int, required=True)
    target = command("risks-show", "Read one complete retained edition and current source comparison", case=True, output=True)
    target.add_argument("--review", required=True)
    target = command("risks-history", "Read every retained assessment and action for an original risk", case=True, output=True)
    target.add_argument("--risk", required=True)
    target = command("risks-export", "Export the complete case, register, actions, sources and reading report", case=True)
    target.add_argument("--review", required=True)
    target.add_argument("--output", required=True, help="Create-only original case ZIP filename")
    for action in ("risks-request", "risks-resume"):
        target = command(action, "Read the exact original saved command receipt" if action == "risks-request" else
                         "Reconcile and resume the exact original retained command", case=True, output=True)
        target.add_argument("--command", required=True, help="Exact complete risk-register.save command JSON")


def document(filename, read_bytes, maximum=MAX_SOURCE):
    try:
        value = json.loads(read_bytes(filename, maximum))
    except (UnicodeError, ValueError) as exc:
        raise Problem("Use the complete UTF-8 delivery risk JSON object.", 422, "INVALID_RISK_REGISTER") from exc
    if not isinstance(value, dict):
        raise Problem("Use the complete delivery risk JSON object.", 422, "INVALID_RISK_REGISTER")
    return value


def operate(ops, args, read_bytes, publish):
    action = args.operation
    if action == "risks":
        result = ops.list_risks(args.case)
    elif action == "risks-seed":
        body = {"expectedVersion": args.expected_version}
        if args.review is not None:
            body["reviewId"] = args.review
        result = ops.seed_risks(args.case, body)
        if args.document_only:
            result = result["document"]
    elif action in ("risks-preview", "risks-save"):
        entered = document(args.document, read_bytes)
        if action == "risks-preview":
            result = ops.preview_risks(args.case, {"expectedVersion": args.expected_version, "document": entered})
        else:
            result = ops.command(args.case, {"action": ACTION, "expectedVersion": args.expected_version,
                "actor": args.actor, "note": args.note, "requestId": args.request_id,
                "data": {"document": entered, "expectedPreviewSha256": args.expected_preview_sha256}})
    elif action == "risks-show":
        result = ops.risk_register(args.case, args.review)
    elif action == "risks-history":
        result = ops.risk_history(args.case, args.risk)
    elif action == "risks-export":
        return {"caseId": args.case, "reviewId": args.review,
                "output": publish(args.output, ops.export_risks(args.case, args.review))}
    elif action in ("risks-request", "risks-resume"):
        command = document(args.command, read_bytes, MAX_SOURCE)
        result = ops.risk_request(args.case, {"command": command})
        if action == "risks-resume":
            result = result["result"] if result["found"] else ops.command(args.case, command)
    else:
        raise Problem("Unknown delivery risk command.", 422, "UNKNOWN_COMMAND")
    if getattr(args, "output", None):
        return {"output": publish(args.output, (canonical(result) + "\n").encode("utf-8"))}
    return result
