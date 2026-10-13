"""MIT. Independently receive the original Jobs package's editable pipeline project."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from contract import (RECEIVED, RESULT, MAX_EXPANDED, OUTPUT_LIMITS, OUTPUT_NAMES,
                      PreparationError, PipelineWorkspace, canonical, sha, need, checked,
                      read_json, write_new, destination_lock, publish_directory,
                      receive_project, verify_retained_execution)

MARKER = "commissioned-job.json"
TYPES = {"report": "text/html; charset=utf-8", "project": "application/zip",
         "execution": "application/json; charset=utf-8", "results": "application/zip"}


def validated_receipt(receipt):
    need(isinstance(receipt, dict) and
         receipt.get("schema") == "stellar-forge.job-result-receiving.v1" and
         receipt.get("complete") is True and isinstance(receipt.get("job"), dict) and
         re.fullmatch(r"[a-f0-9]{64}", receipt.get("manifestSha256", "")),
         "Receive the original complete Jobs output package before opening its editable project")
    files = receipt.get("files")
    need(isinstance(files, list) and all(isinstance(item, dict) for item in files),
         "Retain the original verified output file records")
    slots = {item.get("slot"): item for item in files}
    need(len(slots) == len(files) and {"report", "project", "execution"} <= set(slots) and
         set(slots) <= set(OUTPUT_NAMES), "Select this product's complete named output package")
    root = Path(receipt["directory"]).resolve(strict=True)
    for slot, item in slots.items():
        path = Path(item["path"])
        need(path.is_absolute() and path.resolve(strict=True).is_relative_to(root) and
             item.get("filename") == OUTPUT_NAMES[slot] and item.get("contentType") == TYPES[slot],
             "Each named output must retain its verified package path, filename and type")
        checked(path, item, OUTPUT_LIMITS[slot])
    result = read_json(slots["execution"]["path"], OUTPUT_LIMITS["execution"])
    need(isinstance(result, dict) and result.get("schema") == RESULT and
         result.get("job") == {"id": receipt["job"]["id"], "attemptId": receipt["job"]["attemptId"]},
         "The editable result belongs to another original job or attempt")
    state = result.get("status")
    need(state in {"COMPLETE", "REVIEW_REQUIRED"} and
         (state == "COMPLETE") == (result["execution"]["status"] == "COMPLETE") and
         ("results" in slots) == (state == "COMPLETE"),
         "The original execution status and complete result selection disagree")
    expected_slots = set(slots) - {"execution"}
    need(isinstance(result.get("files"), dict) and set(result["files"]) == expected_slots,
         "The complete execution metadata must describe every delivered product file")
    for slot in expected_slots:
        need(result["files"][slot] == {key: slots[slot][key] for key in ("bytes", "sha256")},
             "The execution metadata differs from the original named output identity")
    selection = result["selection"]
    need(sha(selection["definition"]) == selection["pipeline"]["sha256"] and
         selection["pipeline"]["id"] == result["execution"]["pipelineId"] and
         selection["pipeline"]["revision"] == result["execution"]["revision"] and
         selection["inputs"] == result["execution"]["inputs"] and
         canonical(selection["sourceRecords"]) == canonical(result["execution"]["inputOriginals"]),
         "The original executed pipeline or source editions differ from the approved selection")
    return result, slots


def receive(receipt_path, directory, action="receive"):
    os.umask(0o077)
    receipt = read_json(receipt_path)
    result, slots = validated_receipt(receipt)
    retained = {"schema": RECEIVED, "package": receipt["package"],
                "manifestSha256": receipt["manifestSha256"], "job": receipt["job"],
                "pipeline": result["selection"]["pipeline"], "executionId": result["execution"]["id"],
                "status": result["status"],
                "files": {slot: {key: item[key] for key in ("filename", "contentType", "bytes", "sha256")}
                          for slot, item in slots.items()}}
    with destination_lock(directory) as directory:
        reused = directory.exists()
        if reused:
            marker = read_json(directory / MARKER)
            need(canonical(marker) == canonical(retained),
                 "This independently editable directory belongs to another complete job delivery")
            workspace = PipelineWorkspace(directory)
            verify_retained_execution(workspace, result)
        else:
            need(action == "receive", "Reopen requires the original received editable workspace")
            with tempfile.TemporaryDirectory(dir=directory.parent, prefix=".pipeline-job-receive-") as temp:
                staging = Path(temp) / "workspace"
                receive_project(slots["project"]["path"], staging, max_bytes=MAX_EXPANDED)
                workspace = PipelineWorkspace(staging)
                verify_retained_execution(workspace, result)
                write_new(staging / MARKER, retained)
                publish_directory(staging, directory)
        return {**retained, "directory": str(directory),
                "files": receipt["files"], "reused": reused}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Receive or reopen the complete editable commissioned pipeline")
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--action", choices=("receive", "reopen"), default="receive")
    args = parser.parse_args()
    try:
        print(canonical(receive(args.receipt, args.directory, args.action)), flush=True)
    except (PreparationError, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr, flush=True)
        raise SystemExit(1)
