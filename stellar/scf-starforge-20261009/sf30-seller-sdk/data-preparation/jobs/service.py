"""MIT. Run the approved saved pipeline inside the original paid Jobs process."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from contract import (REQUEST, RESULT, MAX_PROJECT, MAX_SELECTION, MAX_EXPANDED,
                      OUTPUT_LIMITS, OUTPUT_NAMES, PreparationError, PipelineWorkspace,
                      canonical, sha, need, checked, identity, read_json, write_new,
                      receive_project, validate_order, report, deliver_results, export_project)


def execute(request_path, directory):
    os.umask(0o077)
    request = read_json(request_path)
    need(isinstance(request, dict) and request.get("schema") == REQUEST,
         "Use the original Jobs pipeline request")
    job_id, attempt_id = request.get("jobId"), request.get("attemptId")
    need(all(isinstance(value, str) and 1 <= len(value) <= 256 and "\x00" not in value
             for value in (job_id, attempt_id)), "Retain the original job and attempt identifiers")
    ordinary, files = request.get("input"), request.get("files")
    need(isinstance(ordinary, dict) and set(ordinary) <= {"reportName", "selectionSha256", "$files"} and
         isinstance(ordinary.get("reportName"), str) and
         1 <= len(ordinary["reportName"].strip()) <= 120 and
         isinstance(ordinary.get("selectionSha256"), str) and
         re.fullmatch(r"[a-f0-9]{64}", ordinary["selectionSha256"]),
         "Use the complete prepared ordinary input")
    need(isinstance(files, dict) and set(files) == {"project", "selection"},
         "Seal both the complete project and approved selection")
    selected = {}
    for slot, maximum in (("project", MAX_PROJECT), ("selection", MAX_SELECTION)):
        item = files[slot]
        need(isinstance(item, dict) and isinstance(item.get("path"), str) and
             Path(item["path"]).is_absolute(), "Use the retained original sealed input path")
        selected[slot] = checked(item["path"], item["descriptor"], maximum)
    need(selected["selection"]["sha256"] == ordinary["selectionSha256"],
         "The sealed selection differs from the customer's ordinary approved request")
    order = read_json(files["selection"]["path"])
    directory = Path(directory).absolute()
    need(not directory.exists() and not directory.is_symlink(),
         "The native operation requires its own new private delivery directory")
    directory.mkdir(mode=0o700)
    workspace_path = directory / "workspace"
    receive_project(files["project"]["path"], workspace_path, max_bytes=MAX_EXPANDED)
    workspace = PipelineWorkspace(workspace_path)
    validate_order(workspace, order, selected["project"])
    prior = order["reuseExecution"]
    execution = workspace.enqueue(order["pipeline"]["id"], "commissioned-job:" + sha({"id": job_id}),
                                  revision=order["pipeline"]["revision"], inputs=order["inputs"],
                                  reuse_execution=prior["id"] if prior else None)
    execution = workspace.execute(execution["id"])
    need(execution["status"] in {"COMPLETE", "FAILED", "CANCELLED", "WAITING", "INTERRUPTED"},
         "The original pipeline did not reach a retained terminal or review state")
    outputs = directory / "outputs"
    outputs.mkdir(mode=0o700)
    report(workspace, execution["id"], outputs / OUTPUT_NAMES["report"], title=ordinary["reportName"])
    if execution["status"] == "COMPLETE":
        deliver_results(workspace, execution["id"], outputs / OUTPUT_NAMES["results"])
    export_project(workspace, outputs / OUTPUT_NAMES["project"])
    records = {slot: identity(outputs / OUTPUT_NAMES[slot], OUTPUT_LIMITS[slot])
               for slot in ("report", "project", "results") if (outputs / OUTPUT_NAMES[slot]).exists()}
    result = {"schema": RESULT, "job": {"id": job_id, "attemptId": attempt_id},
              "reportName": ordinary["reportName"],
              "status": "COMPLETE" if execution["status"] == "COMPLETE" else "REVIEW_REQUIRED",
              "selection": order, "selectionFile": selected["selection"],
              "execution": execution, "files": records}
    records = dict(records)
    records["execution"] = write_new(outputs / OUTPUT_NAMES["execution"], result)
    need(records["execution"]["bytes"] <= OUTPUT_LIMITS["execution"],
         "The complete original execution and selection exceed the 2 MiB result allowance")
    # The existing Jobs writer creates the final original settlement-bound package.
    return {"schema": RESULT, "job": result["job"], "status": result["status"],
            "files": {slot: {"path": str(outputs / OUTPUT_NAMES[slot]), **record}
                      for slot, record in records.items()}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Execute the complete commissioned pipeline through original Jobs")
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--directory", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(canonical(execute(args.request, args.directory)), flush=True)
    except (PreparationError, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr, flush=True)
        raise SystemExit(1)
