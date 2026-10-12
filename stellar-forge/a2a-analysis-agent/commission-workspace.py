"""Commission the original AnalysisWorkspace from a complete native dataset package."""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import signal
import threading
import time

from stellar_forge_buyer.analysis_workspace import AnalysisWorkspace, serve
from stellar_forge_buyer.storage import dump, read, private_directory
from stellar_forge_buyer.response_documents import validate_manifest

OPERATION = "SCF-A2A-NATIVE-ANALYSIS-0C7A-20261012"


def checksum(raw):
    return hashlib.sha256(raw).hexdigest()


def logical_id(name):
    return checksum((OPERATION + "\n" + name).encode())[:32]


def load(path, maximum=32 * 1024 * 1024):
    return json.loads(read(Path(path), maximum))


def settle(workspace, kind, request):
    job = workspace.start(kind, request)
    while job["status"] == "RUNNING":
        time.sleep(0.1)
        job = workspace.job(job["id"])
    if job["status"] != "COMPLETE":
        raise RuntimeError("COMMISSION_ORIGINAL_JOB_" + job["status"] + ": " + str(job.get("error")))
    return job


def saved_query(workspace, name, sql, parameters_text="[]", max_rows=1000):
    selected = {"sql": sql, "parameters_text": parameters_text, "max_rows": max_rows}
    try:
        old = workspace.saved_query(name)
    except Exception as error:
        if str(error) != "ANALYSIS_QUERY_NOT_FOUND" and getattr(error, "code", None) != "ANALYSIS_QUERY_NOT_FOUND":
            raise
        return workspace.save_query(name, selected, expected_revision=0)
    if any(old.get(key) != value for key, value in selected.items()):
        raise RuntimeError("COMMISSION_SAVED_QUERY_CHANGED")
    return old


def prepare(workspace, package):
    package = private_directory(package, create=False)
    receipt = load(package.parent / "dataset-receipt.json")
    config_raw = read(package / "dataset.json", 1024 * 1024)
    source_raw = read(package / "source.json", 4 * 1024 * 1024)
    csv_raw = read(package / "dataset.csv", 256 * 1024 * 1024)
    config, source = json.loads(config_raw), json.loads(source_raw)
    if (receipt.get("mode") != "ORIGINAL_SF30_DATASET"
            or receipt.get("csvSha256") != checksum(csv_raw)
            or receipt.get("sourceConfigSha256") != checksum(config_raw)
            or receipt.get("sourceManifestSha256") != checksum(source_raw)
            or source.get("editionId") != receipt.get("editionId")
            or source.get("rows") != receipt.get("rows")):
        raise RuntimeError("COMMISSION_ORIGINAL_DATASET_CHANGED")
    if config.get("schema") != "stellar-forge.csv-dataset.v1" or config.get("file") != "dataset.csv":
        raise RuntimeError("COMMISSION_ORIGINAL_DATASET_REQUIRED")
    if any(value != "string" for value in config["columns"].values()):
        raise RuntimeError("COMMISSION_ORIGINAL_STRING_COLUMNS_REQUIRED")
    with (package / "dataset.csv").open(encoding="utf-8", newline="") as stream:
        reader = csv.reader(stream, strict=True)
        columns = next(reader)
        count = 0
        for row in reader:
            if len(row) != len(columns):
                raise RuntimeError("COMMISSION_CSV_COLUMN_COUNT_CHANGED")
            count += 1
    if columns != list(config["columns"]) or count != receipt["rows"] or count != 660:
        raise RuntimeError("COMMISSION_COMPLETE_HAMBURG_EDITION_REQUIRED")

    document_root = private_directory(workspace.database.directory / "commission-source")
    selected_files, originals = {}, []
    def member(path, media_type, role=None, expected=None):
        path = Path(path)
        raw = read(path, 32 * 1024 * 1024 if role else 256 * 1024 * 1024)
        sha = checksum(raw)
        if expected and (expected["sha256"] != sha or expected["bytes"] != len(raw)):
            raise RuntimeError("COMMISSION_ORIGINAL_SOURCE_MEMBER_CHANGED")
        extension = "csv" if media_type == "text/csv" else "json" if media_type == "application/json" else "bin"
        relative = "files/" + sha + "." + extension
        selected_files[relative] = path
        return {"path": relative, "sha256": sha, "bytes": len(raw), "contentType": media_type,
                **({"role": role} if role else {})}
    document = member(package / "dataset.csv", "text/csv")
    originals.append(member(package / "dataset.json", "application/json", "native-dataset-configuration"))
    originals.append(member(package / "source.json", "application/json", "native-edition-source"))
    for index, item in enumerate(source["sourceFiles"]):
        relative = Path(item["path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise RuntimeError("COMMISSION_ORIGINAL_SOURCE_PATH_INVALID")
        path = package / relative
        if path.resolve() != path:
            raise RuntimeError("COMMISSION_ORIGINAL_SOURCE_PATH_CHANGED")
        originals.append(member(path, "application/json" if path.suffix == ".json" else "application/octet-stream",
                                "native-edition-member-" + str(index), item))
    manifest = validate_manifest({
        "schema": "stellar-forge.analysis-source-document.v1",
        "title": "Hamburg point 18571 retained observation edition",
        "format": "csv", "document": document, "originals": originals, "complete": True,
        "provenance": {
            "kind": "operator-file", "publisher": "Freie und Hansestadt Hamburg",
            "sourceUrl": "https://iot.hamburg.de/v1.1/",
            "capturedAt": receipt["createdAt"],
            "scope": "The exact accepted 660-row SensorThings source edition " + receipt["editionId"],
            "description": "Original SF30 dataset.csv and its complete retained edition, review, source bodies, "
                           "licence and semantics. All source fields remain strings. The edition's original "
                           "acquisition clocks, status interpretation and metadata observations travel in the "
                           "source members. This document records the complete local dataset package."
        }
    })
    manifest_file = document_root / "source.json"
    if manifest_file.exists():
        if load(manifest_file) != manifest:
            raise RuntimeError("COMMISSION_DOCUMENT_SELECTION_CHANGED")
    else:
        dump(manifest_file, manifest)
    registered = workspace.responses.register("hamburg_retained", "document", manifest=manifest_file,
                                              document_files=selected_files, format="csv", expected_revision=0)
    mapping = {"collection": "", "sse_data": "text",
               "columns": [{"name": name, "pointer": "/" + name.replace("~", "~0").replace("/", "~1"),
                            "type": "text", "missing": "error"} for name in columns]}
    preview = settle(workspace, "response-preview", {
        "id": logical_id("preview:" + receipt["editionId"]),
        "source": registered["name"], "source_revision": registered["revision"], "mapping": mapping})
    if preview["result"]["manifest"]["rows"] != count:
        raise RuntimeError("COMMISSION_ORIGINAL_PREVIEW_ROWS_CHANGED")
    imported = settle(workspace, "response-import", {
        "id": logical_id("import:" + receipt["editionId"]), "preview_id": preview["id"],
        "preview_sha256": preview["result"]["preview_sha256"], "allow_incomplete": False})
    version = imported["result"]["version"]
    current = workspace.database.current("observations")
    if current["version"] is None:
        workspace.database.activate("observations", version["version_id"], expected_revision=0)
    elif current["version"]["version_id"] != version["version_id"]:
        raise RuntimeError("COMMISSION_ORIGINAL_VIEW_CHANGED")

    saved_query(workspace, "observations_complete",
                "SELECT * FROM observations ORDER BY _sf_row_number", max_rows=25)
    saved_query(workspace, "observations_report",
                "SELECT * FROM observations ORDER BY _sf_row_number", max_rows=1000)
    saved_query(workspace, "retained_counts",
                "SELECT stream_id, COUNT(*) AS retained_observations FROM observations GROUP BY stream_id ORDER BY stream_id")
    saved_query(workspace, "parameter_exact",
                "SELECT CAST(:amount AS TEXT) AS exact_integer, COUNT(*) AS retained_rows FROM observations",
                parameters_text='{"amount":9223372036854775807}')
    report = workspace.reports.save("retained_observations", {
        "id": logical_id("report-definition:" + receipt["editionId"]), "expected_revision": 0,
        "title": "Hamburg retained observations",
        "introduction": "Complete selected source observations and their retained source-edition counts.",
        "sections": [
            {"title": "Retained observation counts", "note": "Count of rows in the selected complete local source edition.",
             "query_name": "retained_counts", "query_revision": 1},
            {"title": "Complete source rows", "note": "Original strings and separate value-state columns are preserved.",
             "query_name": "observations_report", "query_revision": 1}
        ]
    })
    result = {
        "schema": "stellar-forge.a2a-analysis-commission-source.v1",
        "operationId": OPERATION, "workspaceId": workspace.identity,
        "editionId": receipt["editionId"], "rows": count, "columns": columns,
        "datasetCsvSha256": checksum(csv_raw), "datasetSourceSha256": checksum(source_raw),
        "documentId": registered["document_id"], "source": registered["name"],
        "sourceRevision": registered["revision"], "previewId": preview["id"],
        "importId": imported["id"], "versionId": version["version_id"],
        "views": workspace.state()["views"], "reportRevision": report["revision"]
    }
    dump(workspace.database.directory / "commission-source.json", result)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-package", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--checkout", required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--ready", required=True)
    args = parser.parse_args()
    workspace = AnalysisWorkspace(args.database, checkout=args.checkout, node=args.node)
    server = None
    try:
        result = prepare(workspace, Path(args.dataset_package))
        server, control, url = serve(workspace)
        dump(Path(args.ready), {**result, "status": "ORIGINAL_WORKSPACE_LISTENING", "privateLaunch": str(control)})
        print(json.dumps({"event": "original_analysis_workspace_ready", "workspaceId": workspace.identity,
                          "rows": result["rows"]}), flush=True)
        def stop(_signal, _frame):
            threading.Thread(target=server.shutdown, daemon=True).start()
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        server.serve_forever()
    finally:
        if server:
            server.server_close()
        workspace.close()


if __name__ == "__main__":
    main()
