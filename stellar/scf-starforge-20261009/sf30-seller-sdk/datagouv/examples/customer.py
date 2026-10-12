#!/usr/bin/env python3
"""Operate the Python customer against the original Datactivist publication."""
from __future__ import annotations
import argparse
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python_customer"))
from client import (DatactivistClient, NativeDatasetSession, saved_rows, profile_query,
                    value_counts, export_csv, CustomerError)

ORIGINAL_CSV = "fec6338a55ea2c4eaaa76d63e8e4d97d9c1e7d8d5666924b8a292eb58a830e05"
FIELDS = ["nom_commune", "cog_commune", "siren_commune", "nuance_politique", "famille_nuance"]


def need(condition, message):
    if not condition:
        raise CustomerError("CUSTOMER_OPERATING", message)


def sha(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as source:
        for part in iter(lambda: source.read(1024 * 1024), b""):
            result.update(part)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--application-root", required=True)
    parser.add_argument("--capture-manifest", required=True)
    parser.add_argument("--node", required=True)
    args = parser.parse_args()
    root, app = Path(args.root).resolve(), Path(args.application_root).resolve()
    manifest_file = Path(args.capture_manifest).resolve()
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    source_file = manifest_file.parent / "original" / "resource.csv"
    need(sha(source_file) == ORIGINAL_CSV and manifest["row_count"] == 34844 and manifest["header"] == FIELDS,
         "Use the exact original complete 34,844-row capture.")
    with source_file.open(encoding="utf-8-sig", newline="") as source:
        original = list(csv.DictReader(source))
    by_key = {row["cog_commune"]: row for row in original}
    need(len(by_key) == len(original) == 34844, "Original commune keys must be complete and unique.")
    inputs = json.loads((root / "operations" / "original-inputs.json").read_text(encoding="utf-8"))
    need(inputs["operationId"] == "DATACTIVIST-PUBLISHER-OPERATING-018A-20261012-01",
         "Continue the original publisher operation.")
    out = root / "workspace" / "customer"
    out.mkdir(parents=True, exist_ok=True, mode=0o700)
    client = DatactivistClient(args.url)
    status = client.status()
    published = client.dataset()
    start_selection = status["selection"]
    received = published.download(out / "http-query", "limit=250")
    reopened = published.download(out / "http-query", "limit=250")
    need(received["sha256"] == reopened["sha256"] and received["rows"] == 34844,
         "Complete Python HTTP receiving did not reopen the same original query.")
    rows = list(saved_rows(out / "http-query"))
    need(len(rows) == len(original) and len({row["cog_commune"] for row in rows}) == len(original),
         "Python customer receiving omitted or repeated an original row.")
    need(all(row == by_key.get(row["cog_commune"]) for row in rows),
         "Python customer receiving changed an original field.")
    profile = profile_query(out / "http-query")
    for field in FIELDS:
        measured = profile["fields"][field]
        need(measured["types"] == {"string": 34844} and measured["null"] == 0 and
             measured["empty_string"] == manifest["blank_cells"][field] and
             measured["leading_zero_strings"] == manifest["leading_zero_values"][field],
             "Python profiling changed original strings, blanks, or leading zeros: " + field)
    classifications = value_counts(out / "http-query", "famille_nuance")
    need(sum(item["rows"] for item in classifications["values"]) == 34844,
         "Customer classification counts omitted original rows.")
    csv_path = out / "communes.csv"
    if not csv_path.exists():
        csv_info = export_csv(out / "http-query", csv_path)
    else:
        csv_info = {"path": str(csv_path), "bytes": csv_path.stat().st_size, "sha256": sha(csv_path), "rows": len(rows)}
    with csv_path.open(encoding="utf-8", newline="") as source:
        csv_rows = list(csv.DictReader(source))
    need(len(csv_rows) == 34844 and all(row == by_key.get(row["cog_commune"]) for row in csv_rows),
         "Complete Python CSV export changed the original source values.")
    original_download = out / "original-resource.csv"
    if not original_download.exists():
        client.download_file("original", published.publication["captureHash"], original_download)
    need(sha(original_download) == ORIGINAL_CSV, "The full original provider download differs.")
    sdk = app / "stellar" / "scf-starforge-20261009" / "sf30-seller-sdk"
    config = root / "workspace" / published.publication["nativePath"] / "runs" / published.publication["runId"] / "dataset.json"
    leading = next(row for row in original if row["cog_commune"].startswith("0"))
    query = "where_cog_commune=" + leading["cog_commune"] + "&limit=250"
    need(published.page(query)["rows"] == [leading], "The real HTTP filter lost its original leading-zero code.")
    with NativeDatasetSession(node=args.node, handler=sdk / "dataset-handler.mjs", config=config) as native:
        need(native.describe()["snapshot"] == published.snapshot and native.page(query)["rows"] == [leading],
             "The Python native adapter did not open the exact published edition and code.")
        digest, native_rows, native_pages, native_bytes = hashlib.sha256(), 0, 0, 0
        for page in native.pages("limit=250"):
            native_pages += 1
            for row in page["rows"]:
                raw = (json.dumps(row, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8")
                digest.update(raw)
                native_rows += 1
                native_bytes += len(raw)
        native_received = {"rows": native_rows, "pages": native_pages, "bytes": native_bytes, "sha256": digest.hexdigest()}
    need(native_received["rows"] == 34844 and native_received["sha256"] == received["sha256"],
         "Native and HTTP Python receiving differ for the original complete edition.")
    compare_request = {"before": published.publication["captureHash"], "after": published.publication["captureHash"],
                       "keys": ["cog_commune"], "requestId": inputs["requests"]["compare"]}
    compared = client.continue_request("/api/compare", compare_request, request_file=out / "requests" / "comparison.json")
    comparison = client.comparison(compared["id"])
    need(comparison["complete"] and comparison["summary"]["unchanged"] == 34844 and comparison["changeCount"] == 0,
         "The full original unchanged-edition comparison did not reopen.")
    decision = client.continue_request("/api/decide", inputs["keep"], request_file=out / "requests" / "keep.json")
    need(decision["id"] == comparison["id"] and decision["state"] == "KEEP" and
         client.status()["selection"] == start_selection, "Continuing the original decision changed its recorded selection.")
    result = {"schema": "stellar-forge.datagouv-customer-operated.v1", "complete": True,
              "operationId": inputs["operationId"], "workspaceId": status["workspace"]["id"],
              "publicationId": published.id, "snapshot": published.snapshot, "originalSourceSha256": ORIGINAL_CSV,
              "http": received, "native": native_received, "csv": csv_info, "profile": profile,
              "classificationCounts": classifications, "allOriginalCellsCompared": True,
              "comparisonId": comparison["id"], "originalDecisionRequest": inputs["requests"]["keep"],
              "continuedSelection": start_selection, "completedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
    path = out / "customer-result.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"state": "DATACTIVIST_PYTHON_CUSTOMER_COMPLETE", "rows": 34844,
                      "httpPages": received["pages"], "nativePages": native_received["pages"],
                      "allOriginalCellsCompared": True, "result": str(path)}), flush=True)


if __name__ == "__main__":
    main()
