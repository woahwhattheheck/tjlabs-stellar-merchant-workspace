"""Original material catalogue CLI intake, preparation and complete delivery."""
from __future__ import annotations
import base64
import hashlib
import json
from pathlib import Path
from model import Problem, canonical
import operations_material_catalogue as material
import operations_material_catalogue_sources as transport

ACTIONS = tuple("material-catalog-" + action for action in
                ("inspect", "rows", "member", "compare", "template", "prepare", "handover", "add"))

def register(command, mutation):
    for action in ACTIONS[:-1]:
        handover = action.endswith("-handover")
        target = command(action, "Read or prepare the original complete material catalogue",
                         case=True, output=not handover)
        if handover:
            target.add_argument("--output", required=True, help="New private complete customer ZIP filename")
            target.add_argument("--preparation-sha256", required=True,
                                help="Exact preparationSha256 from the reviewed original prepare response")
        target.add_argument("--expected-version", required=True, type=int)
        target.add_argument("--source", required=True, help="Original complete source attachment ID")
        target.add_argument("--sha256", required=True, help="Exact complete bundle SHA256")
        if action.endswith(("-rows", "-member", "-compare")):
            target.add_argument("--offset", type=int, default=0)
            target.add_argument("--limit", type=int, default=50 if not action.endswith("-member") else 65536)
        if action.endswith("-rows"):
            target.add_argument("--table", required=True, help="Exact retained catalogue table")
        if action.endswith("-member"):
            target.add_argument("--original-source", required=True, help="Original catalogue source ID")
        if action.endswith("-compare"):
            target.add_argument("--before-edition", required=True)
            target.add_argument("--after-edition", required=True)
        if action.endswith(("-template", "-prepare", "-handover")):
            target.add_argument("--document", required=True, help="Complete original native Installation document JSON")
            target.add_argument("--operation-id", required=True, help="Original customer preparation operation")
        if action.endswith(("-prepare", "-handover")):
            target.add_argument("--bindings", required=True)
            target.add_argument("--selection", required=True)
    target = command("material-catalog-add", "Retain the complete material catalogue in its original case", case=True)
    mutation(target, version=True, note_required=True)
    target.add_argument("--file", required=True)
    target.add_argument("--expected-sha256", required=True)
    target.add_argument("--observed-at", required=True, help="Original stable observation timestamp; preserve on retry")
    target.add_argument("--source-url", default="")
    target.add_argument("--receipt", required=True, help="Original receipt; its .request.json is retained before mutation")

def operates(action):
    return action in ACTIONS

def fail(message, code="MATERIAL_CATALOGUE_CLI_INPUT", status=422):
    raise Problem(message, status, code)


def document(path, read_bytes):
    try:
        value = json.loads(read_bytes(path).decode("utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise Problem("Use the complete original UTF-8 JSON document.", 422, "MATERIAL_CATALOGUE_CLI_INPUT") from exc
    if not isinstance(value, dict):
        fail("Use the complete declared JSON object.")
    return value


def exact_output(path, raw, read_bytes, publish, maximum=transport.MAX_JSON_REQUEST):
    target = Path(path).expanduser().absolute()
    if target.exists():
        if target.is_symlink() or read_bytes(str(target), maximum) != raw:
            fail("This original output belongs to different complete bytes. Preserve it and use the same retained intent.",
                 "MATERIAL_CATALOGUE_CLI_RECOVERY", 409)
        return {"path": str(target), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "recovered": True}
    try:
        return publish(str(target), raw)
    except Problem as exc:
        if exc.code != "OUTPUT_EXISTS":
            raise
        if target.is_symlink() or read_bytes(str(target), maximum) != raw:
            raise
        return {"path": str(target), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "recovered": True}


def intake(ops, args, read_bytes, publish):
    raw = read_bytes(args.file, transport.MAX_SOURCE)
    actual = hashlib.sha256(raw).hexdigest()
    if actual != args.expected_sha256:
        fail("The complete selected Material Catalog source changed.", "MATERIAL_CATALOGUE_SOURCE_CHANGED", 409)
    body = {"expectedVersion": args.expected_version, "requestId": args.request_id,
            "actor": args.actor, "note": args.note, "action": transport.ACTION,
            "data": {"filename": Path(args.file).name, "mediaType": "application/x-ndjson",
                     "kind": "deployment", "sourceUrl": args.source_url, "observedAt": args.observed_at,
                     "expectedSha256": actual, "contentBase64": base64.b64encode(raw).decode("ascii")}}
    context = ops.read(args.case)["program"]
    prepared = {"schema": "stellar-forge.material-catalog-source-cli-request.v1",
                "caseId": args.case, "caseCreatedAt": context["createdAt"],
                "file": {"bytes": len(raw), "sha256": actual}, "body": body}
    request_path = str(Path(args.receipt).expanduser().absolute()) + ".request.json"
    request_output = exact_output(request_path, (canonical(prepared) + "\n").encode("utf-8"), read_bytes, publish)
    # The same original case journal reconciles a committed request before
    # evaluating its old expectedVersion; no alternate writer is introduced.
    result = ops.command(args.case, body)
    metadata, saved = ops.source(args.case, result["recordId"])
    if len(saved) != len(raw) or hashlib.sha256(saved).hexdigest() != actual or metadata["sha256"] != actual:
        fail("The committed original source differs from the selected complete file.", "MATERIAL_CATALOGUE_CLI_RECOVERY", 409)
    receipt = {"schema": "stellar-forge.material-catalog-source-cli-receipt.v1",
               "caseId": args.case, "caseCreatedAt": context["createdAt"],
               "requestId": args.request_id, "source": metadata, "result": result,
               "requestSha256": request_output["sha256"]}
    output = exact_output(args.receipt, (canonical(receipt) + "\n").encode("utf-8"), read_bytes, publish)
    return {"source": metadata, "result": result, "request": request_output, "receipt": output}



def operate(ops, args, read_bytes, publish):
    if args.operation == "material-catalog-add":
        return intake(ops, args, read_bytes, publish)
    action = args.operation.removeprefix("material-catalog-")
    body = {"expectedVersion": args.expected_version, "sourceId": args.source,
            "expectedSourceSha256": args.sha256}
    if action in ("rows", "member", "compare"):
        body.update(offset=args.offset, limit=args.limit)
    if action == "rows":
        body["table"] = args.table
    if action == "member":
        body["originalSourceId"] = args.original_source
    if action == "compare":
        body.update(beforeEditionId=args.before_edition, afterEditionId=args.after_edition)
    if action in ("template", "prepare", "handover"):
        body.update(document=document(args.document, read_bytes), operationId=args.operation_id)
    if action in ("prepare", "handover"):
        body.update(bindings=document(args.bindings, read_bytes),
                    selection=document(args.selection, read_bytes))
    if action == "handover":
        body["expectedPreparationSha256"] = args.preparation_sha256
    result = material.perform(ops, args.case, action, body)
    if action == "handover":
        archive = result.pop("archive")
        result["output"] = exact_output(args.output, archive, read_bytes, publish, material.MAX_HANDOVER)
        return result
    if getattr(args, "output", None):
        raw = (canonical(result) + "\n").encode("utf-8")
        return {"output": exact_output(args.output, raw, read_bytes, publish, material.MAX_OUTPUT)}
    return result
