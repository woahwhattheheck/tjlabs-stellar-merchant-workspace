"""Original Material Catalog HTTP intake through the existing SF47 case owner.

This module adds CLI commands only. The maintained catalogue owns mutation
identity and the original Operations source.add command owns case attachment.
"""
from __future__ import annotations
import base64
import hashlib
import json
from pathlib import Path
from model import Problem, canonical
import operations_material_supplier_intake as intake
import operations_material_catalogue_cli as source_cli
import operations_material_catalogue as material

PREFIX = "material-intake-"
ACTIONS = tuple(PREFIX + name for name in (
    "connections", "state", "catalog", "profile", "materials", "changes",
    "operation", "upload", "save", "preview", "select", "bundle"))
MUTATIONS = ("upload", "save", "preview", "select")
MAX_UPLOAD = 16 * 1024 * 1024
MAX_BUNDLE = 128 * 1024 * 1024
MAX_JSON = 1024 * 1024


def fail(message, code="MATERIAL_INTAKE_CLI_INPUT", status=422):
    raise Problem(message, status, code)


def register(command, mutation):
    for name in ACTIONS:
        action = name.removeprefix(PREFIX)
        target = command(name, "Use the selected original Material Catalog connection",
                         case=True, output=action not in MUTATIONS and action != "bundle")
        target.add_argument("--expected-version", required=True, type=int)
        if action != "connections":
            target.add_argument("--connection", required=True, help="Opaque server-owned connection ID")
            target.add_argument("--workspace-id", required=True, help="Actual original catalogue workspace ID")
            target.add_argument("--connection-sha256", required=True, help="Reviewed connection configuration SHA256")
        if action == "catalog":
            target.add_argument("--catalog", required=True)
        elif action == "profile":
            target.add_argument("--source", required=True)
        elif action in ("materials", "changes"):
            target.add_argument("--edition", required=True)
            target.add_argument("--offset", type=int, default=0)
            target.add_argument("--limit", type=int, default=50)
            if action == "materials":
                target.add_argument("--search", default="")
        elif action == "operation":
            target.add_argument("--request-id", required=True)
        elif action in MUTATIONS:
            target.add_argument("--native-request", required=True,
                                help="Exact original native request JSON; preserve its requestId on reconciliation")
            target.add_argument("--receipt", required=True,
                                help="Private original receipt base; request is durably retained before dispatch")
            if action == "upload":
                target.add_argument("--file", required=True, help="Complete original supplier file, at most 16 MiB")
        elif action == "bundle":
            target.add_argument("--catalog", required=True)
            target.add_argument("--catalog-revision", required=True, type=int)
            target.add_argument("--active-edition", required=True)
            target.add_argument("--tenant", required=True)
            target.add_argument("--mapping-sha256", required=True)
            target.add_argument("--output", required=True, help="Frozen complete original catalogue NDJSON")
            target.add_argument("--receipt", required=True, help="Original immutable capture receipt")


def operates(action):
    return action in ACTIONS


def encode(value):
    return (canonical(value) + "\n").encode("utf-8")


def document(path, read_bytes):
    try:
        value = json.loads(read_bytes(path, MAX_JSON).decode("utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise Problem("Select a complete bounded original UTF-8 JSON request.", 422,
                      "MATERIAL_INTAKE_CLI_INPUT") from exc
    if not isinstance(value, dict):
        fail("The original request must be an object.")
    return value


def identity(raw):
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def exact(path, raw, read_bytes, publish, maximum=MAX_JSON):
    # Reuse the original private create-only output writer and its replay check.
    return source_cli.exact_output(path, raw, read_bytes, publish, maximum)


def common(args):
    return {"expectedVersion": args.expected_version, "connectionId": args.connection,
            "expectedWorkspaceId": args.workspace_id,
            "expectedConnectionSha256": args.connection_sha256}


def context(ops, args):
    original = ops.read(args.case)["program"]
    return {"caseId": args.case, "caseCreatedAt": original["createdAt"]}


def check_wrapper(result):
    if not isinstance(result, dict) or result.get("schema") != "stellar-forge.material-catalogue-intake-result.v1":
        fail("The original connection returned an unknown response.", "MATERIAL_INTAKE_CLI_RESPONSE", 502)
    status = result.get("httpStatus")
    if status is None:
        local = result.get("localStatus")
        rejected = result.get("result")
        if (type(local) is not int or not 400 <= local <= 599 or not isinstance(rejected, dict)
                or rejected.get("dispatchStarted") is not False
                or rejected.get("dispatchScope") != "this-proxy-attempt"):
            fail("The local pre-dispatch result has no exact attempt boundary.", "MATERIAL_INTAKE_CLI_RESPONSE", 502)
    elif not isinstance(status, int) or isinstance(status, bool):
        fail("The original HTTP status is missing.", "MATERIAL_INTAKE_CLI_RESPONSE", 502)
    return status, result.get("result")


def selected_identity(body):
    return {"workspaceId": body["expectedWorkspaceId"], "catalogId": body["catalogId"],
            "revision": body["expectedCatalogRevision"],
            "activeEditionId": body["expectedActiveEditionId"],
            "tenantId": body["expectedTenantId"], "mappingSha256": body["expectedMappingSha256"]}


def validate_capture(captured, body):
    """Reuse the original reader/seal validator on the complete frozen bytes."""
    proof = material._engine({"action": "intake-custody",
                              "sourceBase64": base64.b64encode(captured).decode("ascii")})
    if (not isinstance(proof, dict) or proof.get("file") != identity(captured)
            or not isinstance(proof.get("header"), dict)
            or not isinstance(proof.get("catalogue"), dict)):
        fail("The frozen bundle has no complete original custody result.",
             "MATERIAL_INTAKE_CAPTURE_CHANGED", 409)
    header, catalog = proof["header"], proof["catalogue"]
    actual = {"workspaceId": header.get("sourceWorkspaceId"), "catalogId": catalog.get("id"),
              "revision": catalog.get("revision"), "activeEditionId": catalog.get("activeEditionId"),
              "tenantId": catalog.get("tenantId"), "mappingSha256": catalog.get("mappingSha256")}
    expected = selected_identity(body)
    if (actual != expected or header.get("catalogId") != expected["catalogId"]
            or header.get("catalogRevision") != expected["revision"]
            or header.get("tenantId") != expected["tenantId"]):
        fail("The complete frozen bundle differs from the original reviewed selection.",
             "MATERIAL_INTAKE_CAPTURE_CHANGED", 409)
    return actual


def same_json(left, right):
    """JSON semantic comparison with boolean/number type fidelity."""
    if isinstance(left, dict) and isinstance(right, dict):
        return set(left) == set(right) and all(same_json(left[key], right[key]) for key in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(same_json(a, b) for a, b in zip(left, right))
    if type(left) is bool or type(right) is bool:
        return type(left) is type(right) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    return type(left) is type(right) and left == right


def native_request_identity(action, request):
    # The original upload entry normalizes only its declared format/provenance
    # before reserving the journal. This comparison mirrors those defaults;
    # the original native parser still owns all validation and file semantics.
    if action != "upload":
        return request
    supplied = request.get("format", {})
    if not isinstance(supplied, dict):
        fail("Use the original declared upload format.")
    kind = supplied.get("kind", "csv")
    format_value = {"kind": kind}
    if kind in ("csv", "tsv"):
        format_value["delimiter"] = supplied.get("delimiter", "\t" if kind == "tsv" else ",")
        format_value["hasHeader"] = supplied.get("hasHeader") is not False
        if "columns" in supplied:
            format_value["columns"] = supplied["columns"]
            if "hasHeader" not in supplied:
                format_value["hasHeader"] = False
    elif kind == "json":
        format_value["rowsPath"] = supplied.get("rowsPath", "")
    provenance = request.get("provenance", {})
    if not isinstance(provenance, dict):
        fail("Use the original declared upload provenance.")
    return {key: request[key] for key in ("requestId", "name", "bytes", "sha256")} | {
        "format": format_value,
        "provenance": {key: provenance[key] for key in
                       ("url", "revision", "publisher", "kind", "note") if key in provenance}}


def capture_bundle(ops, args, body, read_bytes, publish):
    destination = Path(args.output).expanduser().absolute()
    receipt_path = Path(args.receipt).expanduser().absolute()
    if destination == receipt_path or destination == Path(str(receipt_path) + ".request.json"):
        fail("Use separate original bundle and receipt filenames.")
    request = {"schema": "stellar-forge.material-catalogue-capture-cli-request.v1",
               **context(ops, args), "body": body, "output": str(destination)}
    request_receipt = exact(str(receipt_path) + ".request.json", encode(request), read_bytes, publish)
    expected = selected_identity(body)
    if receipt_path.exists() or receipt_path.is_symlink():
        receipt = document(receipt_path, read_bytes)
        if (receipt.get("schema") != "stellar-forge.material-catalogue-capture-cli-receipt.v1"
                or receipt.get("requestSha256") != request_receipt["sha256"]
                or receipt.get("identity") != expected):
            fail("The saved capture belongs to another exact request.", "MATERIAL_INTAKE_CAPTURE_CHANGED", 409)
        captured = read_bytes(str(destination), MAX_BUNDLE)
        if identity(captured) != receipt["file"]:
            fail("The frozen original customer bundle changed.", "MATERIAL_INTAKE_CAPTURE_CHANGED", 409)
        verified = validate_capture(captured, body)
        if verified != expected:
            fail("The saved capture no longer matches its original catalogue selection.",
                 "MATERIAL_INTAKE_CAPTURE_CHANGED", 409)
        # Existing successful capture is reused without a new time-varying export.
        return {**receipt, "output": {"path": str(destination), **identity(captured)}, "recovered": True}
    if destination.exists() or destination.is_symlink():
        # Crash after durable bytes but before the final receipt: independently
        # validate those very bytes; never fetch another export to replace them.
        captured = read_bytes(str(destination), MAX_BUNDLE)
        verified = validate_capture(captured, body)
        if verified != expected:
            fail("The interrupted capture differs from the retained selection.",
                 "MATERIAL_INTAKE_CAPTURE_CHANGED", 409)
    else:
        result = intake.perform(ops, args.case, "bundle", body)
        if "archive" not in result:
            status, native = check_wrapper(result)
            failure = exact(str(receipt_path) + ".exchange-" + hashlib.sha256(encode(result)).hexdigest() + ".json",
                            encode(result), read_bytes, publish, MAX_BUNDLE)
            fail("The original export returned HTTP " + str(status) + "; inspect " + failure["path"],
                 "MATERIAL_INTAKE_NATIVE_ERROR", 409)
        captured = result["archive"]
        if (not isinstance(captured, bytes) or len(captured) > MAX_BUNDLE
                or result["sha256"] != identity(captured)["sha256"]
                or result["bytes"] != len(captured) or result["identity"] != expected):
            fail("The original captured catalogue identity differs.", "MATERIAL_INTAKE_CAPTURE_CHANGED", 409)
        exact(destination, captured, read_bytes, publish, MAX_BUNDLE)
        # Always reopen the installed bytes, including a concurrently completed
        # identical create-only output.
        captured = read_bytes(str(destination), MAX_BUNDLE)
        verified = validate_capture(captured, body)
        if verified != expected:
            fail("The installed capture differs from the selected catalogue.",
                 "MATERIAL_INTAKE_CAPTURE_CHANGED", 409)
    receipt = {"schema": "stellar-forge.material-catalogue-capture-cli-receipt.v1",
               **context(ops, args), "requestSha256": request_receipt["sha256"],
               "identity": expected, "file": identity(captured)}
    saved = exact(receipt_path, encode(receipt), read_bytes, publish)
    return {**receipt, "output": {"path": str(destination), **identity(captured)},
            "receipt": saved, "recovered": False}


def mutation(ops, args, action, body, read_bytes, publish):
    original = document(args.native_request, read_bytes)
    if not isinstance(original.get("requestId"), str) or not original["requestId"]:
        fail("Retain the original native requestId in the complete native request.")
    body = {**body, "nativeRequest": original}
    file = None
    if action == "upload":
        data = read_bytes(args.file, MAX_UPLOAD)
        file = identity(data)
        if not data or type(original.get("bytes")) is not int or original.get("bytes") != len(data) or original.get("sha256") != file["sha256"]:
            fail("The selected supplier file differs from the original metadata.",
                 "MATERIAL_INTAKE_SOURCE_CHANGED", 409)
        body["contentBase64"] = base64.b64encode(data).decode("ascii")
    retained_body = {key: value for key, value in body.items() if key != "contentBase64"}
    retained = {"schema": "stellar-forge.material-catalogue-native-cli-request.v1",
                **context(ops, args), "action": action, "body": retained_body, "file": file}
    request_path = str(Path(args.receipt).expanduser().absolute()) + ".request.json"
    request = exact(request_path, encode(retained), read_bytes, publish)
    # A matching original journal result wins on CLI recovery. This read may use
    # the retained old case version; an unrecorded mutation must still pass the
    # current case CAS in perform().
    lookup = intake.perform(ops, args.case, "operation", {**common(args), "requestId": original["requestId"]})
    status, native = check_wrapper(lookup)
    if status == 404:
        exchange = intake.perform(ops, args.case, action, body)
    elif status is not None and 200 <= status < 300 and isinstance(native, dict):
        saved_request = native.get("request")
        if not same_json(saved_request, native_request_identity(action, original)) or native.get("kind") != "catalog-" + action:
            fail("The native request ID belongs to different original inputs.",
                 "MATERIAL_INTAKE_NATIVE_REQUEST_CHANGED", 409)
        exchange = lookup
    else:
        # Preserve the exact original failure instead of silently dispatching.
        exchange = lookup
    status, native = check_wrapper(exchange)
    observed = {"schema": "stellar-forge.material-catalogue-native-cli-observation.v1",
                **context(ops, args), "requestSha256": request["sha256"], "action": action,
                "httpStatus": status, "localStatus": exchange.get("localStatus"), "native": native}
    observation = exact(str(Path(args.receipt).expanduser().absolute()) + "." +
                        hashlib.sha256(encode(observed)).hexdigest() + ".json",
                        encode(observed), read_bytes, publish, MAX_BUNDLE)
    state = native.get("state") if isinstance(native, dict) else None
    if status is None:
        expected_content = hashlib.sha256(body["contentBase64"].encode("ascii")).hexdigest() if action == "upload" else None
        if (native.get("caseId") != args.case or native.get("action") != action
                or native.get("requestId") != original["requestId"]
                or not same_json(native.get("requestBody"), retained_body)
                or native.get("contentBase64Sha256") != expected_content):
            fail("The pre-dispatch receipt belongs to different source inputs; inspect " + observation["path"],
                 "MATERIAL_INTAKE_LOCAL_RECEIPT_CHANGED", 409)
        fail("This proxy attempt was rejected before dispatch. Older uncertain attempts remain unresolved; "
             "reconcile the original native request before preparing a replacement. Observation: " + observation["path"],
             "MATERIAL_INTAKE_LOCAL_REJECTION", exchange["localStatus"])
    if not 200 <= status < 300:
        fail("The original native exchange returned HTTP " + str(status) +
             "; its exact response is retained at " + observation["path"] + ".",
             "MATERIAL_INTAKE_NATIVE_ERROR", 409)
    if state == "RUNNING":
        fail("The original native operation is still RUNNING. Reconcile the same request; observation: " +
             observation["path"], "MATERIAL_INTAKE_NATIVE_PENDING", 409)
    if state in ("FAILED", "INTERRUPTED"):
        fail("The original native operation is terminal " + state +
             ". Preserve it and prepare a new explicitly reviewed request; observation: " +
             observation["path"], "MATERIAL_INTAKE_NATIVE_TERMINAL", 409)
    if state != "COMPLETE":
        fail("The original mutation has no COMPLETE result; inspect " + observation["path"],
             "MATERIAL_INTAKE_NATIVE_RESPONSE", 502)
    receipt = {"schema": "stellar-forge.material-catalogue-native-cli-receipt.v1",
               **context(ops, args), "requestSha256": request["sha256"],
               "action": action, "operation": native}
    saved = exact(args.receipt, encode(receipt), read_bytes, publish, MAX_BUNDLE)
    return {"receipt": saved, "request": request, "exchange": exchange}


def operate(ops, args, read_bytes, publish):
    action = args.operation.removeprefix(PREFIX)
    body = {"expectedVersion": args.expected_version} if action == "connections" else common(args)
    if action in MUTATIONS:
        return mutation(ops, args, action, body, read_bytes, publish)
    if action == "catalog":
        body["catalogId"] = args.catalog
    elif action == "profile":
        body["sourceId"] = args.source
    elif action in ("materials", "changes"):
        body.update(editionId=args.edition, offset=args.offset, limit=args.limit)
        if action == "materials":
            body["search"] = args.search
    elif action == "operation":
        body["requestId"] = args.request_id
    elif action == "bundle":
        body.update(catalogId=args.catalog, expectedCatalogRevision=args.catalog_revision,
                    expectedActiveEditionId=args.active_edition, expectedTenantId=args.tenant,
                    expectedMappingSha256=args.mapping_sha256)
        return capture_bundle(ops, args, body, read_bytes, publish)
    result = intake.perform(ops, args.case, action, body)
    status, native = check_wrapper(result)
    if getattr(args, "output", None):
        return {"output": exact(args.output, encode(result), read_bytes, publish, MAX_BUNDLE)}
    return result
