"""Complete Airflow source intake and preparation through the original Operations CLI.

Source mutation uses the original case command and stable request identity.
Inspection and preparation invoke the same native Airflow reader as the UI.
"""
from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

from model import Problem, canonical
import operations_airflow as airflow
import operations_airflow_sources as transport

ACTIONS = ("airflow-source-inspect", "airflow-source-member",
           "airflow-source-template", "airflow-source-prepare", "airflow-source-add")


def register(command, mutation):
    for action in ACTIONS[:-1]:
        target = command(action, "Read or prepare the complete original Airflow source", case=True, output=True)
        target.add_argument("--expected-version", required=True, type=int)
        target.add_argument("--source", required=True, help="Original Airflow source attachment ID")
        target.add_argument("--sha256", required=True, help="Exact original source SHA256")
        if action == "airflow-source-member":
            target.add_argument("--path", required=True, help="Exact member from the complete inventory")
            target.add_argument("--offset", type=int, default=0)
            target.add_argument("--limit", type=int, default=16000)
        if action in ("airflow-source-template", "airflow-source-prepare"):
            target.add_argument("--document", required=True, help="Complete native Installation document JSON")
        if action == "airflow-source-prepare":
            target.add_argument("--bindings", required=True, help="Complete selected profile bindings JSON")
            target.add_argument("--cohort-source", required=True)
            target.add_argument("--cohort-sha256", required=True)
    target = command("airflow-source-add", "Retain one complete Airflow handover in the original case", case=True)
    mutation(target, version=True, note_required=True)
    target.add_argument("--file", required=True)
    target.add_argument("--expected-sha256", required=True)
    target.add_argument("--observed-at", required=True, help="Original stable observation timestamp; preserve on retry")
    target.add_argument("--source-url", default="")
    target.add_argument("--receipt", required=True, help="Original receipt path; its .request.json is retained before mutation")


def operates(action):
    return action in ACTIONS


def fail(message, code="AIRFLOW_CLI_INPUT", status=422):
    raise Problem(message, status, code)


def document(path, read_bytes):
    try:
        value = json.loads(read_bytes(path).decode("utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise Problem("Use the complete original UTF-8 JSON document.", 422, "AIRFLOW_CLI_INPUT") from exc
    if not isinstance(value, dict):
        fail("Use the complete declared JSON object.")
    return value


def exact_output(path, raw, read_bytes, publish):
    target = Path(path).expanduser().absolute()
    if target.exists():
        if target.is_symlink() or read_bytes(str(target), transport.MAX_JSON_REQUEST) != raw:
            fail("This original output belongs to different complete bytes. Preserve it and use the same retained intent.",
                 "AIRFLOW_CLI_RECOVERY", 409)
        return {"path": str(target), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "recovered": True}
    try:
        return publish(str(target), raw)
    except Problem as exc:
        if exc.code != "OUTPUT_EXISTS":
            raise
        if target.is_symlink() or read_bytes(str(target), transport.MAX_JSON_REQUEST) != raw:
            raise
        return {"path": str(target), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "recovered": True}


def intake(ops, args, read_bytes, publish):
    raw = read_bytes(args.file, transport.MAX_SOURCE)
    actual = hashlib.sha256(raw).hexdigest()
    if actual != args.expected_sha256:
        fail("The complete selected Airflow source changed.", "AIRFLOW_SOURCE_CHANGED", 409)
    body = {"expectedVersion": args.expected_version, "requestId": args.request_id,
            "actor": args.actor, "note": args.note, "action": transport.ACTION,
            "data": {"filename": Path(args.file).name, "mediaType": "application/json",
                     "kind": "deployment", "sourceUrl": args.source_url, "observedAt": args.observed_at,
                     "expectedSha256": actual, "contentBase64": base64.b64encode(raw).decode("ascii")}}
    context = ops.read(args.case)["program"]
    prepared = {"schema": "stellar-forge.airflow-source-cli-request.v1",
                "caseId": args.case, "caseCreatedAt": context["createdAt"],
                "file": {"bytes": len(raw), "sha256": actual}, "body": body}
    request_path = str(Path(args.receipt).expanduser().absolute()) + ".request.json"
    request_output = exact_output(request_path, (canonical(prepared) + "\n").encode("utf-8"), read_bytes, publish)
    # The same original case journal reconciles a committed request before
    # evaluating its old expectedVersion; no alternate writer is introduced.
    result = ops.command(args.case, body)
    metadata, saved = ops.source(args.case, result["recordId"])
    if len(saved) != len(raw) or hashlib.sha256(saved).hexdigest() != actual or metadata["sha256"] != actual:
        fail("The committed original source differs from the selected complete file.", "AIRFLOW_CLI_RECOVERY", 409)
    receipt = {"schema": "stellar-forge.airflow-source-cli-receipt.v1",
               "caseId": args.case, "caseCreatedAt": context["createdAt"],
               "requestId": args.request_id, "source": metadata, "result": result,
               "requestSha256": request_output["sha256"]}
    output = exact_output(args.receipt, (canonical(receipt) + "\n").encode("utf-8"), read_bytes, publish)
    return {"source": metadata, "result": result, "request": request_output, "receipt": output}


def operate(ops, args, read_bytes, publish):
    if args.operation == "airflow-source-add":
        return intake(ops, args, read_bytes, publish)
    action = args.operation.removeprefix("airflow-source-")
    body = {"expectedVersion": args.expected_version, "sourceId": args.source,
            "expectedSourceSha256": args.sha256}
    if action == "member":
        body.update(path=args.path, offset=args.offset, limit=args.limit)
    if action in ("template", "prepare"):
        body["document"] = document(args.document, read_bytes)
    if action == "prepare":
        body.update(bindings=document(args.bindings, read_bytes),
                    cohortSourceId=args.cohort_source, expectedCohortSha256=args.cohort_sha256)
    result = airflow.perform(ops, args.case, action, body)
    if getattr(args, "output", None):
        raw = (canonical(result) + "\n").encode("utf-8")
        return {"output": exact_output(args.output, raw, read_bytes, publish)}
    return result
