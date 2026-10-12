#!/usr/bin/env python3
"""Operate the received Datactivist application through its complete Python customer interface."""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys

ORIGINAL_CSV = "fec6338a55ea2c4eaaa76d63e8e4d97d9c1e7d8d5666924b8a292eb58a830e05"
FIELDS = ["nom_commune", "cog_commune", "siren_commune", "nuance_politique", "famille_nuance"]

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(part)
    return digest.hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ["url", "application", "workspace", "node", "workspace-id", "publication-id", "snapshot", "label"]:
        parser.add_argument("--" + flag, required=True)
    args = parser.parse_args()
    application, workspace = Path(args.application).resolve(), Path(args.workspace).resolve()
    sdk = application / "stellar" / "scf-starforge-20261009" / "sf30-seller-sdk"
    sys.path.insert(0, str(sdk / "datagouv" / "python_customer"))
    from client import DatactivistClient, NativeDatasetSession, saved_rows, profile_query, value_counts, export_csv
    client = DatactivistClient(args.url)
    status = client.status()
    publication = client.dataset()
    require(status["workspace"]["id"] == args.workspace_id, "The received HTTP server opened another workspace.")
    require(publication.id == args.publication_id and publication.snapshot == args.snapshot,
            "The received HTTP server changed its original publication or snapshot.")
    selection = status["selection"]
    if not args.label or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in args.label):
        raise RuntimeError("Use the supplied local customer stage label.")
    out = workspace / "customer" / args.label
    out.mkdir(parents=True, exist_ok=True, mode=0o700)
    source = out / "original-resource.csv"
    if not source.exists():
        client.download_file("original", publication.publication["captureHash"], source)
    require(sha(source) == ORIGINAL_CSV, "The customer's full original CSV differs from the retained publication.")
    with source.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        require(reader.fieldnames == FIELDS, "The original source header changed.")
        original = list(reader)
    by_key = {row["cog_commune"]: row for row in original}
    require(len(original) == len(by_key) == 34844, "The original source rows and unique keys changed.")
    received = publication.download(out / "http-query", "limit=250")
    resumed = publication.download(out / "http-query", "limit=250")
    rows = list(saved_rows(out / "http-query"))
    require(received["rows"] == resumed["rows"] == len(rows) == 34844 and received["sha256"] == resumed["sha256"],
            "The full HTTP customer query did not reopen unchanged.")
    require(len({row["cog_commune"] for row in rows}) == 34844 and
            all(row == by_key.get(row["cog_commune"]) for row in rows),
            "An original row or cell changed in the received customer's query.")
    profile = profile_query(out / "http-query")
    classification = value_counts(out / "http-query", "famille_nuance")
    csv_path = out / "communes.csv"
    if not csv_path.exists():
        export_csv(out / "http-query", csv_path)
    with csv_path.open(encoding="utf-8", newline="") as stream:
        csv_rows = list(csv.DictReader(stream))
    require(len(csv_rows) == 34844 and all(row == by_key.get(row["cog_commune"]) for row in csv_rows),
            "The received customer's full CSV export changed original values.")
    leading = next(row for row in original if row["cog_commune"].startswith("0"))
    query = "where_cog_commune=" + leading["cog_commune"] + "&limit=250"
    require(publication.page(query)["rows"] == [leading], "The customer's HTTP filter lost a leading-zero code.")
    p = publication.publication
    config = workspace / p["nativePath"] / "runs" / p["runId"] / "dataset.json"
    digest, native_rows, native_pages = hashlib.sha256(), 0, 0
    with NativeDatasetSession(node=args.node, handler=sdk / "dataset-handler.mjs", config=config) as native:
        require(native.describe()["snapshot"] == args.snapshot and native.page(query)["rows"] == [leading],
                "The received native adapter opened another snapshot or changed the original code.")
        for page in native.pages("limit=250"):
            native_pages += 1
            for row in page["rows"]:
                require(row == by_key.get(row["cog_commune"]), "A received native row changed.")
                digest.update((json.dumps(row, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8"))
                native_rows += 1
    require(native_rows == 34844 and digest.hexdigest() == received["sha256"],
            "Complete native and HTTP customer receiving differ.")
    final_status = client.status()
    require(final_status["workspace"]["id"] == args.workspace_id and final_status["selection"] == selection,
            "The customer query changed the original workspace selection.")
    result = {
        "schema": "stellar-forge.datagouv-installed-customer-operated.v1",
        "operationId": "DATACTIVIST-PUBLISHER-OPERATING-018A-20261012-01",
        "complete": True, "label": args.label, "workspaceId": args.workspace_id,
        "publicationId": args.publication_id, "snapshot": args.snapshot,
        "sourceSha256": ORIGINAL_CSV, "allOriginalCellsCompared": True,
        "http": received, "native": {"rows": native_rows, "pages": native_pages, "sha256": digest.hexdigest()},
        "csv": {"path": str(csv_path), "rows": len(csv_rows), "bytes": csv_path.stat().st_size, "sha256": sha(csv_path)},
        "profile": profile, "classificationCounts": classification, "selection": selection,
        "leadingZeroQuery": leading["cog_commune"]
    }
    result_path = out / "installed-customer-result.json"
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"state": "INSTALLED_CUSTOMER_COMPLETE", "result": str(result_path),
                      "rows": 34844, "httpPages": received["pages"], "nativePages": native_pages,
                      "workspaceId": args.workspace_id, "publicationId": args.publication_id,
                      "snapshot": args.snapshot, "sha256": received["sha256"]}), flush=True)

if __name__ == "__main__":
    main()
