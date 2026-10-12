#!/usr/bin/env python3
"""Receive full CanadaBuys CSVs and save their complete compressed source delivery."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

HERE = Path(__file__).resolve().parent

def sha256(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--library-helper-directory", required=True,
                        help="Directory containing the three complete current Library upload helpers.")
    args = parser.parse_args()
    os.umask(0o077)
    root = Path(args.directory).expanduser().absolute()
    root.mkdir(parents=True, exist_ok=True)
    helper = Path(args.library_helper_directory).expanduser().resolve(strict=True)
    for name in ("library_upload.py", "library_hosted_apps.py", "library_file_transfer.py"):
        if not (helper / name).is_file():
            raise ValueError("Supply the complete current Library helper: " + name)

    receiving = subprocess.run([sys.executable, "-u", str(HERE / "receive-original-csvs.py"),
                                "--directory", str(root)], cwd=HERE)
    state_path = root / "source-receiving.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    deliveries = root / "deliveries"
    deliveries.mkdir(exist_ok=True)
    inputs = json.loads((HERE / "source-contract.json").read_text(encoding="utf-8"))
    requests, observations = [], []
    for selected in inputs["requested_csv_inputs"]:
        name = selected["id"]
        source = state["sources"].get(name, {})
        if source.get("status") != "COMPLETE":
            continue
        saved = source["csv"]
        path = root / saved["path"]
        if path.stat().st_size != saved["bytes"] or sha256(path) != saved["sha256"]:
            raise ValueError("Restore the complete retained original CSV: " + name)
        archive = deliveries / ("canadabuys-" + name + "-" + saved["sha256"][:12] + ".zip")
        if archive.exists():
            with zipfile.ZipFile(archive) as previous:
                if previous.testzip() is not None:
                    raise ValueError("Preserve and restore the earlier source archive.")
                with previous.open(path.name) as stream:
                    digest = hashlib.sha256()
                    for block in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(block)
                if digest.hexdigest() != saved["sha256"]:
                    raise ValueError("The earlier archive contains a different source.")
        else:
            temporary = archive.with_suffix(".zip.writing")
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as output:
                output.write(path, path.name)
                output.writestr("source-receiving.json", json.dumps({
                    "schema": state["schema"], "operation_id": state["operation_id"],
                    "source": name, "capture": source,
                }, ensure_ascii=False, indent=2) + "\n")
                body = source["response_body"]
                if body["sha256"] != saved["sha256"]:
                    original_body = root / body["path"]
                    if original_body.stat().st_size != body["bytes"] or sha256(original_body) != body["sha256"]:
                        raise ValueError("Restore the complete original HTTP body.")
                    output.write(original_body, "original.http-body")
            with zipfile.ZipFile(temporary) as complete:
                if complete.testzip() is not None:
                    raise ValueError("The complete source archive has a CRC difference.")
            os.replace(temporary, archive)
        observations.append({"source": name, "archive": str(archive), "archive_bytes": archive.stat().st_size,
                             "archive_sha256": sha256(archive), "csv_bytes": saved["bytes"],
                             "csv_sha256": saved["sha256"], "records": saved["records"],
                             "columns": saved["column_count"]})
        requests.append({"local_path": str(archive), "purpose": "create_library_file",
                         "library_artifact_type": "other"})
    if not requests:
        raise ValueError("The original source operation has no complete CSV to preserve.")

    source_archive = deliveries / "canadabuys-complete-source-acquisition.zip"
    source_manifest = json.loads((HERE / "source-manifest.json").read_text(encoding="utf-8"))
    source_names = [item["path"] for item in source_manifest["files"]]
    source_names.extend(["README.md", "source-contract.json", "source-manifest.json",
                         "receive-original-csvs.py", "preserve-original-csvs.py"])
    if (HERE / "native-source-observations.json").is_file():
        source_names.append("native-source-observations.json")
    with zipfile.ZipFile(source_archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for name in source_names:
            output.write(HERE / name, name)
    requests.extend([
        {"local_path": str(state_path), "purpose": "create_library_file", "library_artifact_type": "other"},
        {"local_path": str(source_archive), "purpose": "create_library_file", "library_artifact_type": "other"},
    ])
    # One ordered batch owns preparation, all transfers, finalization and local identity.
    sys.path.insert(0, str(helper))
    from library_upload import LibraryUploadWorkflow, SignedUrlUploader
    from library_file_transfer import LibraryFileMaterializer
    from library_hosted_apps import HostedAppsClient
    result_path = root / "source-library-delivery.json"
    prior = json.loads(result_path.read_text(encoding="utf-8")) if result_path.exists() else {}
    if prior.get("phase") == "SAVING":
        raise ValueError("Reconcile the retained pending Library request before continuing its save.")
    previous_results = {item["local_path"]: item for item in prior.get("result", {}).get("results", [])}
    previous_files = {item["local_path"]: item for item in prior.get("files", [])}
    selected_files, pending = [], []
    for item in requests:
        path = Path(item["local_path"])
        identity = {"local_path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
        selected_files.append(identity)
        previous = previous_results.get(str(path))
        if previous and previous.get("status") == "succeeded":
            if previous_files.get(str(path), {}).get("sha256") == identity["sha256"]:
                continue
            item = {"local_path": str(path), "purpose": "replace_library_file",
                    "library_file_id": previous["library_file_id"],
                    "version_reason": "Continue the same original CanadaBuys source receiving."}
            if previous.get("current_version_number") is not None:
                item["expected_current_version"] = previous["current_version_number"]
        pending.append(item)
    if not pending:
        print(json.dumps({"status": "COMPLETE", "retained_delivery": str(result_path),
                          "source_receiving_exit": receiving.returncode}), flush=True)
        return receiving.returncode
    record = {"phase": "SAVING", "operation_id": state["operation_id"],
              "source_receiving_exit": receiving.returncode, "archives": observations,
              "files": selected_files, "requests": pending,
              "result": {"results": list(previous_results.values())}}
    result_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "SAVING_COMPLETE_SOURCES", "archives": observations}), flush=True)
    saved = LibraryUploadWorkflow(HostedAppsClient(), LibraryFileMaterializer(),
                                  SignedUrlUploader(), state_parent=root).run({"uploads": pending})
    for item in saved["results"]:
        previous_results[item["local_path"]] = item
    record["phase"] = "RECEIVED"
    record["result"] = {"results": [previous_results[item["local_path"]] for item in selected_files]}
    result_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, ensure_ascii=False), flush=True)
    if any(item.get("status") != "succeeded" for item in record["result"]["results"]):
        return 2
    return receiving.returncode

if __name__ == "__main__":
    raise SystemExit(main())
