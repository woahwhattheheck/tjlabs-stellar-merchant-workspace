"""Original Operations routes for frozen customer billing explanations."""
import base64
import binascii
import re
from urllib.parse import parse_qs, unquote
from model import Problem
from operations_commercial_adapter import commercial_store
from operations_billing_evidence import inspect_bundle

CASE = re.compile(r"operation-[a-f0-9]{32}")
REVIEW = re.compile(r"billing-evidence-[a-f0-9]{32}")


def revision(value):
    if value is None:
        return None
    if isinstance(value, bool) or not str(value).isdigit() or not 1 <= int(value) <= 10000000:
        raise Problem("Select an original saved evidence revision.", 422, "BILLING_EVIDENCE_INVALID")
    return int(value)


def handle(handler, parsed, operations, method):
    root = "/api/operations/"
    if not parsed.path.startswith(root):
        return False
    parts = [unquote(item) for item in parsed.path[len(root):].split("/")]
    if len(parts) < 2 or parts[1] != "billing-evidence":
        return False
    if not CASE.fullmatch(parts[0]):
        raise Problem("Billing evidence case not found.", 404, "NOT_FOUND")
    commercial_store(operations)
    desk, case_id, rest = operations.billing_evidence, parts[0], parts[2:]
    query = parse_qs(parsed.query, keep_blank_values=True)
    if any(len(v) != 1 for v in query.values()) or set(query) - {"revision", "audience"}:
        raise Problem("Use one saved revision and one export audience.", 422, "BILLING_EVIDENCE_INVALID")
    selected_revision = revision(query.get("revision", [None])[0])
    if method == "GET":
        if not rest:
            result = desk.catalog(case_id)
        elif len(rest) == 1 and REVIEW.fullmatch(rest[0]):
            result = desk.get(case_id, rest[0], selected_revision)
        elif len(rest) == 2 and REVIEW.fullmatch(rest[0]) and rest[1] == "export.zip":
            audience = query.get("audience", ["internal"])[0]
            if audience not in ("internal", "customer"):
                raise Problem("Choose internal or customer evidence.", 422, "BILLING_EVIDENCE_INVALID")
            result = desk.export_bundle(case_id, rest[0], selected_revision, audience)
            handler.send(200, base64.b64decode(result["contentBase64"], validate=True), result["mediaType"], result["filename"])
            return True
        else:
            raise Problem("Billing evidence page not found.", 404, "NOT_FOUND")
    elif method == "POST":
        body = handler.json_body()
        if rest in (["preview"], ["save"]):
            result = getattr(desk, rest[0])(case_id, body)
        elif len(rest) == 2 and REVIEW.fullmatch(rest[0]) and rest[1] == "compare":
            if not isinstance(body, dict) or set(body) - {"revision"}:
                raise Problem("Select only the saved evidence revision to compare.", 422, "BILLING_EVIDENCE_INVALID")
            result = desk.compare(case_id, rest[0], revision(body.get("revision")))
        elif rest == ["inspect"]:
            if not isinstance(body, dict) or set(body) != {"contentBase64"} or not isinstance(body["contentBase64"], str):
                raise Problem("Supply the complete original evidence ZIP.", 422, "BILLING_EVIDENCE_INVALID")
            try:
                raw = base64.b64decode(body["contentBase64"], validate=True)
            except (ValueError, binascii.Error) as exc:
                raise Problem("The evidence ZIP encoding is invalid.", 422, "BILLING_EVIDENCE_INVALID") from exc
            inspected = inspect_bundle(raw)
            result = {key: value for key, value in inspected.items() if key != "operationsBytes"}
            result["canReceive"] = bool(inspected.get("operationsBytes"))
        else:
            raise Problem("Billing evidence operation not found.", 404, "NOT_FOUND")
    else:
        return False
    handler.send(200, result)
    return True
