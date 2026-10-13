"""Exact original ROZO report intake; no provider call or payment is made here."""
from __future__ import annotations
import base64
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone

from domain import Problem, canonical, digest, text
from native_mcp import node_path, reader_path
import native

MAX_BYTES = 64 * 1024 * 1024
FEATURE = "original-rozo-report-v1"
FORMAT = "stellar-forge.rozo-finance-inspection.v1"
SELECTION = "stellar-forge.rozo-buyer-selection.v1"
HEX = re.compile(r"[0-9a-f]{64}")
READER_FILES = tuple("stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments/" + name for name in
    ("finance-reader.mjs", "finance-source.mjs", "finance-projection.mjs", "model.mjs", "reports.mjs"))


def original_bytes(payload):
    encoded, expected = payload.get("content_base64"), payload.get("source_sha256")
    if (not isinstance(encoded, str) or not encoded or len(encoded) > ((MAX_BYTES + 2) // 3) * 4 or
            not isinstance(expected, str) or not HEX.fullmatch(expected)):
        raise Problem("ROZO_SOURCE_BYTES", "Retain the complete original ROZO finance source and its exact SHA-256")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except ValueError as exc:
        raise Problem("ROZO_SOURCE_BYTES", "The original source must retain exact base64 bytes") from exc
    if not 0 < len(raw) <= MAX_BYTES or base64.b64encode(raw).decode() != encoded or hashlib.sha256(raw).hexdigest() != expected:
        raise Problem("ROZO_SOURCE_DIGEST", "The complete original source differs from the reviewed file")
    return raw


def inspect_original(raw, node=None):
    root = reader_path().parents[2]
    completed = subprocess.run([node_path(node), str(root / READER_FILES[0])], input=raw,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120, check=False,
        env={"LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"})
    if len(completed.stdout) > 128 * 1024 * 1024 or len(completed.stderr) > 1024 * 1024:
        raise Problem("ROZO_SOURCE_LIMIT", "The complete original source exceeds the intake capacity", 422)
    if completed.returncode:
        code = "ROZO_SOURCE_INVALID"
        try:
            selected = json.loads(completed.stderr.decode().splitlines()[-1]).get("code")
            if isinstance(selected, str) and re.fullmatch(r"[A-Z0-9_]{1,120}", selected):
                code = selected
        except (ValueError, UnicodeError, IndexError):
            pass
        raise Problem(code, "The original ROZO report or native source binding did not validate", 422)
    try:
        value = json.loads(completed.stdout)
        if (value["schema"] != FORMAT or value["sourceSha256"] != hashlib.sha256(raw).hexdigest() or
                value["sourceBytes"] != len(raw) or not HEX.fullmatch(value["sourceIdentitySha256"]) or
                not isinstance(value["movements"], list)):
            raise ValueError()
        return value
    except (ValueError, KeyError, TypeError) as exc:
        raise Problem("ROZO_SOURCE_READER", "The original reader did not return the complete bound source", 422) from exc


def selection_for(value, selection):
    if (not isinstance(selection, dict) or set(selection) != {"schema", "sourceId", "purchases"} or
            selection.get("schema") != SELECTION or selection.get("sourceId") != value["sourceId"] or
            not isinstance(selection.get("purchases"), list) or not 0 <= len(selection["purchases"]) <= 10000):
        raise Problem("ROZO_PURCHASE_SELECTION", "Explicitly select the buyer's original purchases from this source")
    movements = {row["id"]: row for row in value["movements"]}
    selected, seen = [], set()
    for item in selection["purchases"]:
        if not isinstance(item, dict) or set(item) != {"movementId", "basisSha256", "purchaseOwner", "purchaseReference", "reason"}:
            raise Problem("ROZO_PURCHASE_SELECTION", "Retain each purchase's complete reviewed identity and ownership")
        row = movements.get(item["movementId"])
        if not row or row["kind"] != "source_payment" or row["id"] in seen or item["basisSha256"] != row["basisSha256"]:
            raise Problem("ROZO_PURCHASE_CHANGED", "Choose each original source payment once and review its current financial basis", 409)
        seen.add(row["id"])
        normalized = dict(item)
        for field, maximum in (("purchaseOwner", 240), ("purchaseReference", 500), ("reason", 6000)):
            normalized[field] = text(item[field], field, maximum=maximum)
        selected.append((normalized, row))
    selected.sort(key=lambda pair: pair[0]["movementId"])
    return {"schema": SELECTION, "sourceId": value["sourceId"], "purchases": [item for item, _ in selected]}, selected


def asset_identity(asset):
    if not asset:
        return "", ""
    # Preserve all chain/network and contract/precision components. Token symbols
    # are display labels and never merge unrelated assets.
    js = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return "rozo:" + js([asset["chainId"], asset["network"]]), "rozo:" + js([asset["tokenAddress"], asset["decimals"]])


def project_original(value, selection, data_context):
    normalized, selected = selection_for(value, selection)
    rows, groups = [], {}
    for purchase, movement in selected:
        measured = movement.get("amount")
        network, asset = asset_identity(measured.get("asset") if measured else None)
        confirmed = movement["providerConfirmed"] and movement["amountObserved"] and movement.get("sourceDay") is not None
        actual = measured["units"] if confirmed else None
        reference = movement.get("receiptReference") or ""
        transfer = digest({"kind": "rozo_source_payment", "source_id": value["sourceId"], "payment_id": movement["paymentId"]})
        stable = {"movement_basis": movement["basisSha256"], "purchase": purchase, "data_context": data_context}
        detail = {"classification": "ROZO_PROVIDER_CONFIRMED_PURCHASE" if confirmed else "ROZO_PURCHASE_UNRESOLVED",
            "native_status": movement["providerStatus"], "data_context": data_context,
            "rozo_origin_id": value["originId"], "rozo_workspace_id": value["workspaceId"],
            "rozo_profile_id": value["profileId"], "rozo_report_id": value["reportId"],
            "rozo_report_sha256": value["reportSha256"], "rozo_source_sha256": value["sourceSha256"],
            "rozo_source_identity_sha256": value["sourceIdentitySha256"],
            "rozo_movement_id": movement["id"], "rozo_payment_id": movement["paymentId"],
            "rozo_app_id": movement["appId"], "rozo_order_id": movement["orderId"],
            "rozo_asset": measured.get("asset") if measured else None,
            "rozo_purchase": purchase, "rozo_movement": movement,
            "evidence_class": movement["evidenceClass"], "independent_chain_proof": False,
            "payer": None, "recipient": movement["observation"].get("address"),
            "transaction": reference or None, "transfer_identity": transfer,
            "observation_sha256": movement.get("sourceObservationSha256"),
            "quoted_amount": None, "result_file": None, "result_preview": None}
        row = {"request_id": movement["id"], "request_digest": digest({"source_id": value["sourceId"], "payment_id": movement["paymentId"]}),
            "actor": purchase["purchaseOwner"], "service": purchase["purchaseReference"], "network": network, "asset": asset,
            "scheme": "rozo-provider-report", "amount": measured.get("units") or "" if measured else "",
            "day": movement.get("sourceDay") or value["reportCreatedAt"][:10],
            "state": "settled" if confirmed else "rozo_unresolved", "actual": actual or "",
            "receipt_ref": reference, "proof_sha256": "", "settled_base_units": actual,
            "reserved_base_units": "0", "released_capacity_base_units": "0", "age_utc_days": None,
            "source_kind": "rozo_report",
            "native_date_basis": "Original ROZO provider creation day" if movement.get("sourceDay") else "Original report day; provider creation day unavailable",
            "native_detail": detail, "native_context_sha256": digest(stable)}
        rows.append(row)
        if network and asset:
            group = groups.setdefault((network, asset), {"network": network, "asset": asset, "requests": 0, "pending_requests": 0,
                "unresolved_operations": 0, "settled_base_units": 0, "accounted_base_units": 0,
                "reserved_base_units": "0", "released_capacity_base_units": "0"})
            group["requests"] += 1
            group["unresolved_operations"] += 0 if confirmed else 1
            group["settled_base_units"] += int(actual or "0")
            group["accounted_base_units"] += int(actual or "0")
    portfolio = [{**group, "settled_base_units": str(group["settled_base_units"]),
        "accounted_base_units": str(group["accounted_base_units"])} for _, group in sorted(groups.items())]
    return normalized, {"schema": "stellar-forge.rozo-buyer-statement.v1",
        "captured_at": value["reportCreatedAt"], "rows": rows, "portfolio": portfolio,
        "source": {"kind": "rozo_report", "records": len(rows), "record_kind": "explicitly selected ROZO purchases",
            "journal_events": None, "last_sequence": None, "projection_sha256": digest(rows),
            "source_sha256": value["sourceSha256"], "source_bytes": value["sourceBytes"],
            "report_id": value["reportId"], "report_sha256": value["reportSha256"], "origin_id": value["originId"],
            "profile_id": value["profileId"], "selection_sha256": digest(normalized)},
        "basis": "Exact original ROZO report and provider captures with explicit buyer ownership; provider confirmation is not independent chain proof",
        "date_basis": "Original provider creation day; operator recognition dates remain separately reviewed",
        "notes": ["Only explicitly selected original source payments are represented as purchases.",
            "Merchant fees and destination payouts are separate movements and are not additional buyer expenses.",
            "This report creates no spending reservation, native signer, payment or inferred foreign-exchange value.",
            "Provider-confirmed native units may be coded as reviewed purchase evidence; the proof SHA remains empty.",
            "Pending and unmeasured payments remain period exceptions until a reviewed original successor resolves them."]}


def capture_original(payload, node=None):
    raw = original_bytes(payload)
    inspected = inspect_original(raw, node)
    selection, report = project_original(inspected, payload.get("selection"), payload["data_context"])
    identity = {"kind": "rozo_report", "origin_id": inspected["originId"], "profile_id": inspected["profileId"]}
    return {"path": "rozo-report:" + inspected["sourceId"], "identity": identity,
        "snapshot": {"schema": FEATURE, "source_sha256": inspected["sourceSha256"], "source_bytes": len(raw),
            "content_base64": base64.b64encode(raw).decode(), "inspection": inspected, "selection": selection},
        "report": report}
