"""Complete saved billing evidence through the existing Operations CLI."""
import base64
import json
from model import Problem, canonical
from operations_commercial_adapter import commercial_store
from operations_billing_evidence import inspect_bundle


def register(command):
    for action in ("catalog", "preview", "save", "show", "compare", "export", "inspect"):
        parser = command("billing-evidence-" + action, "Review original billing evidence without financial changes", case=True, output=True)
        if action in ("show", "compare", "export"):
            parser.add_argument("--review", required=True)
            parser.add_argument("--revision", type=int)
        if action in ("preview", "save", "inspect"):
            parser.add_argument("--file", required=True, help="Complete JSON request, or original ZIP for inspect")
        if action == "export":
            parser.add_argument("--audience", choices=("internal", "customer"), default="internal")


def operate(operations, args, read_bytes, publish):
    if not args.operation.startswith("billing-evidence-"):
        return None
    commercial_store(operations)
    desk = operations.billing_evidence
    action = args.operation.removeprefix("billing-evidence-")
    if action == "catalog":
        result = desk.catalog(args.case)
    elif action in ("preview", "save"):
        try:
            body = json.loads(read_bytes(args.file))
        except (UnicodeError, ValueError) as exc:
            raise Problem("Use the complete original JSON evidence request.", 422, "BILLING_EVIDENCE_INVALID") from exc
        if not isinstance(body, dict):
            raise Problem("Use the complete original JSON evidence request.", 422, "BILLING_EVIDENCE_INVALID")
        result = getattr(desk, action)(args.case, body)
    elif action in ("show", "compare"):
        result = getattr(desk, "get" if action == "show" else "compare")(args.case, args.review, args.revision)
    elif action == "inspect":
        inspected = inspect_bundle(read_bytes(args.file))
        result = {key: value for key, value in inspected.items() if key != "operationsBytes"}
        result["canReceive"] = bool(inspected.get("operationsBytes"))
    elif action == "export":
        if not args.output:
            raise Problem("Choose --output for the complete evidence ZIP.", 422, "OUTPUT_REQUIRED")
        result = desk.export_bundle(args.case, args.review, args.revision, args.audience)
        return {"reviewId": args.review, "revision": args.revision, "audience": args.audience,
                "output": publish(args.output, base64.b64decode(result["contentBase64"], validate=True))}
    else:
        raise Problem("Billing evidence command not found.", 404, "NOT_FOUND")
    return {"output": publish(args.output, canonical(result).encode())} if args.output else result
