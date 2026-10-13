#!/usr/bin/env python3
"""Offline vendor-authorized migration + GIS/API roundtrip evidence checker.

This program cannot authorize data access, attest a real integration, or sign for a City.
It is a deterministic control for evidence supplied under a real vendor engagement.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

SCHEMA = "mcpherson-modular-migration-acceptance-v1"


class InvalidPacket(ValueError):
    pass


def local_file(base: Path, name: str) -> Path:
    if not isinstance(name, str) or not name or "\\" in name:
        raise InvalidPacket("file path must be a nonempty POSIX-relative path")
    path = Path(name)
    if path.is_absolute() or any(part in ("..", ".") for part in path.parts):
        raise InvalidPacket("file path may not escape packet directory")
    obj = base
    for part in path.parts:
        obj = obj / part
        if obj.is_symlink():
            raise InvalidPacket("symlink input rejected")
    if not obj.is_file():
        raise InvalidPacket("input must be an existing regular file")
    return obj


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_text(obj: dict, key: str) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        raise InvalidPacket(f"missing nonempty {key}")
    return value.strip()


def read_rows(path: Path, key: str, fields: list[str]) -> tuple[dict[str, tuple[str, ...]], int]:
    rows: dict[str, tuple[str, ...]] = {}
    duplicates = 0
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, strict=True)
        header = reader.fieldnames
        if not header or len(header) != len(set(header)) or any(not x for x in header):
            raise InvalidPacket("missing or duplicate CSV column names")
        for col in [key, *fields]:
            if col not in header:
                raise InvalidPacket("configured source or target CSV column absent")
        for row in reader:
            if None in row or any(v is None for v in row.values()):
                raise InvalidPacket("CSV row has inconsistent field count")
            identity = row[key].strip()
            if not identity:
                raise InvalidPacket("CSV contains empty matching key")
            if identity in rows:
                duplicates += 1
            else:
                rows[identity] = tuple(row[f] for f in fields)
    if duplicates:
        raise InvalidPacket(f"duplicate row keys: {duplicates}")
    if not rows:
        raise InvalidPacket("CSV export has zero data rows")
    return rows, len(rows)


def read_roundtrips(path: Path, permitted: set[str], expected: set[str]) -> dict[str, int]:
    events: dict[str, dict[str, dict]] = {}
    count = 0
    with path.open("r", encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            count += 1
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise InvalidPacket("invalid JSONL event") from exc
            if not isinstance(item, dict):
                raise InvalidPacket("each event must be an object")
            corr = require_text(item, "correlation_id")
            asset = require_text(item, "asset_id")
            leg = require_text(item, "leg")
            require_text(item, "source_system")
            require_text(item, "destination_system")
            if asset not in permitted:
                raise InvalidPacket("roundtrip event references unrecognized asset")
            if leg not in ("request", "response"):
                raise InvalidPacket("event leg must be request or response")
            bucket = events.setdefault(corr, {})
            if leg in bucket:
                raise InvalidPacket("duplicate event leg for correlation ID")
            bucket[leg] = item
    if not events:
        raise InvalidPacket("zero observed GIS/API roundtrip events")
    if set(events) != expected:
        raise InvalidPacket(f"roundtrip correlation coverage differs: expected {len(expected)}, observed {len(events)}")
    for bucket in events.values():
        if set(bucket) != {"request", "response"}:
            raise InvalidPacket("incomplete request/response pair")
        req, resp = bucket["request"], bucket["response"]
        if req["asset_id"] != resp["asset_id"]:
            raise InvalidPacket("roundtrip asset ID changed")
        if req["source_system"] != resp["destination_system"] or req["destination_system"] != resp["source_system"]:
            raise InvalidPacket("roundtrip edge does not return to origin")
        if req.get("status") != "accepted" or resp.get("status") != "ok":
            raise InvalidPacket("roundtrip reported non-success status")
    return {"observed_events": count, "complete_roundtrip_pairs": len(events)}


def verify(manifest_file: Path) -> dict:
    if manifest_file.is_symlink() or not manifest_file.is_file():
        raise InvalidPacket("manifest must be a regular non-symlink file")
    try:
        packet = json.loads(manifest_file.read_text(encoding="utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise InvalidPacket("invalid manifest JSON") from exc
    if not isinstance(packet, dict) or packet.get("schema") != SCHEMA:
        raise InvalidPacket("unsupported acceptance manifest schema")
    auth = packet.get("attestation")
    if not isinstance(auth, dict):
        raise InvalidPacket("missing attestation records")
    for key in ("supplier_reviewer", "city_data_authorization_ref", "vendor_sow_ref"):
        require_text(auth, key)
    run_id = require_text(packet, "run_id")
    source = packet.get("source")
    target = packet.get("target")
    if not isinstance(source, dict) or not isinstance(target, dict):
        raise InvalidPacket("source and target mappings required")
    source_file = local_file(manifest_file.parent, require_text(source, "path"))
    target_file = local_file(manifest_file.parent, require_text(target, "path"))
    event_file = local_file(manifest_file.parent, require_text(packet, "roundtrip_jsonl"))
    if len({source_file, target_file, event_file, manifest_file}) != 4:
        raise InvalidPacket("source, target, roundtrip and manifest files must be distinct")
    fields = packet.get("field_pairs")
    if not isinstance(fields, list) or not fields or any(not isinstance(f, dict) for f in fields):
        raise InvalidPacket("at least one field-pair mapping required")
    src_columns = [require_text(p, "source") for p in fields]
    tgt_columns = [require_text(p, "target") for p in fields]
    if len(set(src_columns)) != len(src_columns) or len(set(tgt_columns)) != len(tgt_columns):
        raise InvalidPacket("duplicate configured field mapping")
    src_ids, src_count = read_rows(source_file, require_text(source, "key"), src_columns)
    tgt_ids, tgt_count = read_rows(target_file, require_text(target, "source_key"), tgt_columns)
    if type(packet.get("expected_source_rows")) is not int or type(packet.get("expected_target_rows")) is not int:
        raise InvalidPacket("expected exact source and target row counts must be integers")
    if (src_count, tgt_count) != (packet["expected_source_rows"], packet["expected_target_rows"]):
        raise InvalidPacket("actual export row count does not match declared full-export counts")
    exclusions = packet.get("approved_exclusions", [])
    if not isinstance(exclusions, list) or any(not isinstance(e, dict) for e in exclusions):
        raise InvalidPacket("approved_exclusions must be objects with key and reason")
    allowed = set()
    for excluded in exclusions:
        identity = require_text(excluded, "source_key")
        require_text(excluded, "reason")
        require_text(excluded, "approved_by")
        if identity in allowed:
            raise InvalidPacket("duplicate exclusion")
        allowed.add(identity)
    if not allowed.issubset(src_ids.keys()) or allowed.intersection(tgt_ids):
        raise InvalidPacket("exclusion does not describe an existing and omitted source row")
    expected_keys = set(src_ids) - allowed
    if set(tgt_ids) != expected_keys:
        missing = len(expected_keys - set(tgt_ids))
        orphan = len(set(tgt_ids) - expected_keys)
        raise InvalidPacket(f"migration coverage mismatch (missing={missing}, orphan={orphan}); individual IDs withheld")
    mismatches = sum(src_ids[k] != tgt_ids[k] for k in expected_keys)
    if mismatches:
        raise InvalidPacket(f"mapped fields differ on {mismatches} records; individual IDs withheld")
    expected_ids = packet.get("expected_correlation_ids")
    if not isinstance(expected_ids, list) or not expected_ids or any(not isinstance(x, str) or not x.strip() for x in expected_ids):
        raise InvalidPacket("must declare all expected roundtrip correlation IDs")
    if len(set(expected_ids)) != len(expected_ids):
        raise InvalidPacket("duplicate expected correlation ID")
    events = read_roundtrips(event_file, expected_keys, set(expected_ids))
    digests = {"manifest": file_digest(manifest_file), "source": file_digest(source_file),
               "target": file_digest(target_file), "roundtrip": file_digest(event_file)}
    receipt = {"schema": SCHEMA, "run_id": run_id, "result": "TECHNICAL_EVIDENCE_CONSISTENT",
               "vendor_or_city_acceptance": "NOT_ESTABLISHED", "attestation_fields_present_not_authenticated": True,
               "counts": {"source_rows": src_count, "target_rows": tgt_count,
                          "approved_exclusions": len(allowed), "mapped_pairs": len(fields), **events},
               "sha256": digests}
    receipt["receipt_sha256"] = hashlib.sha256(json.dumps(receipt,sort_keys=True,separators=(",", ":")).encode()).hexdigest()
    return receipt


def main() -> int:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("manifest", type=Path, help="vendor-authorized local JSON manifest")
    cli.add_argument("--output", type=Path, help="optional JSON receipt path (must be outside inputs)")
    args = cli.parse_args()
    try:
        result = verify(args.manifest)
        rendered = json.dumps(result, sort_keys=True, indent=2) + "\n"
        if args.output:
            with args.output.open("x", encoding="utf-8") as receipt_out:
                receipt_out.write(rendered)
        else:
            sys.stdout.write(rendered)
        return 0
    except (InvalidPacket, OSError, UnicodeError, csv.Error) as exc:
        print(f"INVALID: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
