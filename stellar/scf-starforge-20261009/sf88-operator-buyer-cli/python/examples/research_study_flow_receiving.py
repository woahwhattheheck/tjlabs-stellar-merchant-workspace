#!/usr/bin/env python3
"""Receive the completed original Study Flow through its installed Python client.

Run only with the original receiving owner's live connection. This consumer
does not start a server/browser, create a dossier, or acquire evidence.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import tempfile
import threading
from datetime import datetime, timezone

from stellar_forge_buyer import ResearchWorkspace
from stellar_forge_buyer.storage import read

SCHEMA = "commons.study-flow-python-receiving/v1"
OPERATION = "STUDY-FLOW-ORIGINAL-RIS-63DD-20261012"


def need(value, message):
    if not value:
        raise RuntimeError(message)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2,
                       allow_nan=False) + "\n").encode("utf-8")


def digest(value):
    return hashlib.sha256(value).hexdigest()


def atomic(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    data = value if isinstance(value, bytes) else encoded(value)
    need(not file.is_symlink(), "Retained output must be a regular file")
    with tempfile.NamedTemporaryFile(prefix=".python-receiving-", dir=file.parent, delete=False) as handle:
        temporary = Path(handle.name)
        try:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, file)
    finally:
        temporary.unlink(missing_ok=True)


def stamp():
    return datetime.now(timezone.utc).isoformat()


def run(args):
    original = Path(args.operation_directory).resolve()
    out = Path(args.out).resolve()
    baseline_bytes = read(original / "result.json", 16 * 1024 * 1024)
    baseline = json.loads(baseline_bytes)
    need(baseline["operationId"] == OPERATION and baseline["native"]["revision"] == 15,
         "Select the completed original Study Flow operation")
    out.mkdir(parents=True, exist_ok=True)
    lockfd = os.open(out / ".receiving.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    cancel = threading.Event()
    handlers = {}
    try:
        fcntl.flock(lockfd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for event in (signal.SIGINT, signal.SIGTERM):
            handlers[event] = signal.signal(event, lambda *_: cancel.set())
        return operate(args, original, out, baseline_bytes, baseline, cancel)
    finally:
        for event, handler in handlers.items():
            signal.signal(event, handler)
        os.close(lockfd)


def operate(args, original, out, baseline_bytes, baseline, cancel):
    path = out / "operation.json"
    binding = {
        "schema": SCHEMA, "operationId": OPERATION,
        "originalResultSha256": digest(baseline_bytes),
        "dossierId": baseline["dossierId"], "revision": baseline["native"]["revision"],
        "flowId": baseline["native"]["updateFlowId"],
        "editionId": baseline["native"]["updateEditionId"],
        "checkout": str(Path(args.checkout).resolve()),
        "clientDirectory": str(Path(args.directory).resolve()),
    }
    journal = json.loads(read(path, 16 * 1024 * 1024)) if path.exists() else {
        **binding, "startedAt": stamp(), "steps": {}}
    for key, value in binding.items():
        need(journal.get(key) == value, "Original Python receiving binding changed: " + key)

    def checkpoint():
        atomic(path, journal)

    def phase(name, callback):
        need(not cancel.is_set(), "Python receiving cancelled")
        if journal["steps"].get(name, {}).get("complete"):
            return journal["steps"][name]["value"]
        journal["phase"] = name
        checkpoint()
        print(json.dumps({"phase": name, "state": "running"}), flush=True)
        value = callback()
        journal["steps"][name] = {"complete": True, "value": value, "completedAt": stamp()}
        checkpoint()
        return value

    def client():
        return ResearchWorkspace(checkout=args.checkout, node=args.node,
            connection_file=args.connection, directory=args.directory,
            timeout=args.timeout)

    revision = binding["revision"]
    selected = {"revision": revision, "flow_id": binding["flowId"], "edition_id": binding["editionId"]}
    with client() as workspace:
        status = workspace.status(cancel_event=cancel)
        identity = status["workspaceId"]
        need(journal.get("workspaceId", identity) == identity, "Original receiving workspace changed")
        journal["workspaceId"] = identity
        checkpoint()
        flow = workspace.study_flow(binding["dossierId"])
        overview = flow.read(cancel_event=cancel)
        need(overview["dossier"]["revision"] == revision, "Original saved dossier head changed")

        def source_phase():
            rows = list(flow.iter_sources(revision=revision, question_id=baseline["questionId"],
                                          limit=1, cancel_event=cancel))
            need(len(rows) == baseline["sourceOccurrences"] == 2, "Original sources changed")
            atomic(out / "original-sources.json", rows)
            return {"occurrences": len(rows), "sha256": digest(encoded(rows))}
        phase("original-sources", source_phase)

        result = flow.report(**selected, cancel_event=cancel)
        need(result["report"]["reportSha256"] == baseline["native"]["reportSha256"],
             "Original full report changed")
        need(result["report"]["summary"] == baseline["native"]["summary"],
             "Original report scope changed")

        def report_phase():
            counts = {}
            for section in ("records", "reports", "studies", "counts", "issues", "operations"):
                rows = list(flow.iter_records(**selected, section=section, limit=1, cancel_event=cancel))
                atomic(out / "sections" / (section + ".json"), rows)
                counts[section] = len(rows)
            atomic(out / "original-report.json", result)
            return {"rows": counts, "reportSha256": result["report"]["reportSha256"]}
        phase("original-report-and-pages", report_phase)

        def preview_phase():
            preview = flow.preview(result["report"]["definition"], expected_revision=revision,
                flow_id=binding["flowId"], source_mode="retained",
                basis_edition_id=binding["editionId"], cancel_event=cancel)
            need(preview["report"]["summary"] == result["report"]["summary"],
                 "Retained-definition preview changed")
            count_file = original / "inputs" / "selected-original-record-counts.csv"
            original_counts = read(count_file, 16 * 1024 * 1024)
            parsed = flow.import_counts_file(count_file, expected_revision=revision,
                reason="Receive the original retained automated metadata count input unchanged.",
                reference="Original Study Flow receiving input", cancel_event=cancel)
            atomic(out / "preview-and-counts.json", {"preview": preview, "import": parsed})
            return {"revision": preview["dossier"]["revision"],
                    "countFileSha256": digest(original_counts), "countFileBytes": len(original_counts)}
        phase("original-preview-and-counts", preview_phase)

        def replay_phase():
            operations = list(flow.iter_records(revision=revision, flow_id=binding["flowId"],
                                                section="operations", limit=100, cancel_event=cancel))
            matches = [item for item in operations if item["action"] == "review"
                       and item["result"]["review"]["editionId"] == binding["editionId"]]
            need(len(matches) == 1, "Select the actual single retained original review")
            request = matches[0]["request"]
            need(request["expectedRevision"] < revision, "The request is not the completed original review")
            atomic(out / "original-request.json", request)
            value = flow.review(request, resume=True, cancel_event=cancel)
            need(value["duplicate"] is True and value["operation"]["id"] == matches[0]["id"],
                 "Original review replay did not recover its saved operation")
            need(value["dossier"]["revision"] == revision, "Review replay changed the dossier")
            return {"requestId": request["requestId"], "operationId": value["operation"]["id"],
                    "duplicate": value["duplicate"]}
        replay = phase("original-review-recovery", replay_phase)

        # File checks intentionally run on resume as well. Existing matching
        # files are opened through the original FileDelivery without redownload.
        exports = []
        for item in baseline["native"]["files"]:
            filename = item["filename"]
            need(Path(filename).name == filename, "Original filename is not a leaf")
            if filename == "workspace.research.json":
                delivery = flow.export_portable(out / "exports" / filename, revision=revision,
                    format="json", expected_sha256=item["sha256"], cancel_event=cancel)
            else:
                flow_id = baseline["native"]["flowId"] if baseline["native"]["secondEditionId"] in filename else binding["flowId"]
                edition_id = baseline["native"]["secondEditionId"] if flow_id == baseline["native"]["flowId"] else binding["editionId"]
                format = Path(filename).suffix[1:]
                section = filename.rsplit("-", 1)[-1][:-4] if format == "csv" else None
                delivery = flow.export(out / "exports" / filename, revision=revision,
                    flow_id=flow_id, edition_id=edition_id, format=format, section=section,
                    expected_sha256=item["sha256"], cancel_event=cancel)
            need(delivery.delivery["bytes"] == item["bytes"], "Original downloaded length changed")
            exports.append(delivery.delivery)
        atomic(out / "exports.json", exports)
        need(flow.read(cancel_event=cancel)["dossier"]["revision"] == revision,
             "Receiving changed the original dossier")
    # A fresh client uses the same saved Python request journal and same listener.
    with client() as reopened:
        need(reopened.status(cancel_event=cancel)["workspaceId"] == identity, "Reopened workspace changed")
        again = reopened.study_flow(binding["dossierId"]).recover(replay["requestId"], cancel_event=cancel)
        need(again["duplicate"] is True and again["operation"]["id"] == replay["operationId"],
             "Original Python journal recovery changed")
        need(reopened.study_flow(binding["dossierId"]).read(cancel_event=cancel)["dossier"]["revision"] == revision,
             "Reopened dossier revision changed")
    journal.update(complete=True, completedAt=stamp(), exports=len(exports),
                   originalRevision=revision, finalRevision=revision,
                   actualScope=baseline["actualScope"])
    checkpoint()
    atomic(out / "result.json", journal)
    return journal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True)
    parser.add_argument("--connection", required=True)
    parser.add_argument("--directory", required=True, help="Existing/private Python client journal.")
    parser.add_argument("--operation-directory", required=True, help="Original received result.json and inputs.")
    parser.add_argument("--out", required=True, help="Owned resumable Python receiving output directory.")
    parser.add_argument("--node", default="node")
    parser.add_argument("--timeout", type=int, default=360)
    args = parser.parse_args()
    print(json.dumps(run(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
