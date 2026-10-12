"""Complete selected Research customer receiving on an existing listener."""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import signal
import sys

from stellar_forge_buyer.errors import StateError
from stellar_forge_buyer.research_workspace import ResearchWorkspace, _json
from stellar_forge_buyer.research_eligibility_delivery import (
    EligibilityDelivery, _immutable, _pin, _object,
)
from stellar_forge_buyer.storage import private_directory, lock, read, parse, write

SCHEMA = "stellar-forge.research-eligibility-customer.v1"
BUYER = Path("stellar/scf-starforge-20261009/sf88-operator-buyer-cli")
SOURCE_FILES = (
    "research-dossiers/dossier.mjs", "research-dossiers/eligibility-review.mjs",
    "research-dossiers/eligibility-routes.mjs", "research-dossiers/eligibility-consumer.mjs",
    "research-dossiers/report.mjs", "research-dossiers/server.mjs",
    "research-dossiers/workspace-client.mjs", "research-dossiers/workspace-protocol.mjs",
    "python/research-bridge.mjs", "python/research-eligibility-delivery.mjs",
    "python/stellar_forge_buyer/research_workspace.py",
    "python/stellar_forge_buyer/research_eligibility.py",
    "python/stellar_forge_buyer/research_eligibility_delivery.py",
    "python/examples/research_eligibility_customer.mjs",
    "python/examples/research_eligibility_customer.py",
)
MAXIMUM = 32 * 1024 * 1024


def need(condition, code):
    if not condition:
        raise StateError(code)


def pin(file, maximum=256 * 1024 * 1024):
    return _pin(Path(file), maximum)


def immutable_bytes(file, value):
    if file.exists() or file.is_symlink():
        need(read(file, max(1, len(value))) == value, "ELIGIBILITY_CUSTOMER_FILE_CHANGED")
    else:
        try:
            write(file, value, exclusive=True)
        except FileExistsError:
            need(read(file, max(1, len(value))) == value, "ELIGIBILITY_CUSTOMER_FILE_CHANGED")


def receive_customer(*, checkout, connection, directory, dossier_id, review_id,
                     operation_id, revision=None, work_set_id=None, workspace_id=None,
                     node="node", timeout=900, replay_requests=()):
    """Borrow one original workspace and deliver its selected immutable review.

    The optional replay files must name operations already present in the selected
    review. No programme, source fetch, actor or new review decision is created.
    """
    need(isinstance(operation_id, str) and
         re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{7,119}", operation_id),
         "ELIGIBILITY_CUSTOMER_OPERATION_REQUIRED")
    checkout = Path(checkout).expanduser().resolve()
    root = private_directory(Path(directory))
    sources = {name: {key: value for key, value in pin(checkout / BUYER / name).items()
                     if key != "file"} for name in SOURCE_FILES}
    request_inputs = []
    for file in replay_requests:
        original = read(Path(file), 16 * 1024 * 1024)
        value = parse(original)
        need(isinstance(value, dict), "ELIGIBILITY_CUSTOMER_REQUEST_REQUIRED")
        request_inputs.append({"bytes": len(original), "sha256": hashlib.sha256(original).hexdigest(),
                               "value": value})
    request_pins = [{key: row[key] for key in ("bytes", "sha256")} for row in request_inputs]
    with lock(root):
        binding_file = root / "operation.json"
        prior = _object(binding_file) if binding_file.exists() else None
        if prior:
            need(prior.get("schema") == SCHEMA and prior.get("operationId") == operation_id and
                 prior.get("dossierId") == dossier_id and prior.get("reviewId") == review_id and
                 prior.get("workSetId") == work_set_id and prior.get("sourceFiles") == sources and
                 prior.get("replayInputs") == request_pins and
                 (revision is None or revision == prior.get("revision")) and
                 (workspace_id is None or workspace_id == prior.get("workspaceId")),
                 "ELIGIBILITY_CUSTOMER_SELECTION_CHANGED")
            revision = prior["revision"]
            workspace_id = prior["workspaceId"]
        with ResearchWorkspace(checkout=checkout, connection_file=connection,
                directory=root / "client", node=node, timeout=timeout,
                request_timeout_ms=min(timeout * 1000, 900000),
                expected_workspace_id=workspace_id) as workspace:
            workspace.status()
            review = workspace.eligibility(dossier_id)
            selected = review.read(review_id=review_id, work_set_id=work_set_id, revision=revision)
            revision = selected["dossier"]["revision"]
            need(selected.get("reviewId") == review_id, "ELIGIBILITY_CUSTOMER_REVIEW_CHANGED")
            binding = {"schema": SCHEMA, "operationId": operation_id,
                "workspaceId": workspace.workspace_id, "dossierId": dossier_id,
                "reviewId": review_id, "workSetId": work_set_id, "revision": revision,
                "sourceFiles": sources, "replayInputs": request_pins}
            _immutable(binding_file, binding)
            selection = review.delivery(root / "delivery", review_id=review_id,
                                        work_set_id=work_set_id, revision=revision)
            completed_file = root / "complete.json"
            if completed_file.exists():
                completed = _object(completed_file)
                need(completed.get("state") == "COMPLETE" and completed.get("binding") == binding,
                     "ELIGIBILITY_CUSTOMER_COMPLETION_CHANGED")
                selection.verify()
                for file in completed["files"]:
                    checked = pin(root / file["name"], 512 * 1024 * 1024)
                    need(checked["bytes"] == file["bytes"] and checked["sha256"] == file["sha256"],
                         "ELIGIBILITY_CUSTOMER_OUTPUT_CHANGED")
                return completed

            # Match every optional replay against the actual selected operation
            # before sending. The installed native parser supplies its digest.
            saved_operations = selection.selection["sections"]["operations"]
            replay_results = []
            requests_root = private_directory(root / "original-requests")
            for index, incoming in enumerate(request_inputs):
                original = incoming["value"]
                if original.get("schema") == "stellar-forge.research-eligibility-prepared.v1":
                    need(original.get("workspaceId") == workspace.workspace_id and
                         original.get("dossierId") == dossier_id,
                         "ELIGIBILITY_CUSTOMER_REQUEST_WORKSPACE_CHANGED")
                    normalized = review.validate(original.get("request"))
                    need(normalized["sha256"] == original.get("sha256"),
                         "ELIGIBILITY_CUSTOMER_PREPARED_REQUEST_CHANGED")
                else:
                    normalized = review.validate(original)
                request = normalized["request"]
                matches = [item for item in saved_operations if item.get("requestId") == request["requestId"]]
                need(len(matches) == 1 and matches[0].get("request") == request and
                     matches[0].get("requestSha256") == normalized["sha256"],
                     "ELIGIBILITY_CUSTOMER_COMMITTED_REQUEST_REQUIRED")
                expected = matches[0]
                _immutable(requests_root / (str(index + 1) + ".request.json"), request)
                result = review.submit(request, resume=True)
                need(result.get("duplicate") is True and result.get("operation") == expected,
                     "ELIGIBILITY_CUSTOMER_NATIVE_REPLAY_CHANGED")
                recovered = review.recover(request["requestId"])
                need(recovered.get("duplicate") is True and recovered.get("operation") == expected,
                     "ELIGIBILITY_CUSTOMER_CALL_RECOVERY_CHANGED")
                receipt = {"requestId": request["requestId"], "requestSha256": normalized["sha256"],
                           "operationId": expected["id"], "operationSha256": expected["sha256"]}
                _immutable(requests_root / (str(index + 1) + ".receipt.json"), receipt)
                replay_results.append(receipt)

            manifest = selection.export(review)
            selection.verify()
            receivers = selection.receive(root / "customer-workspaces", checkout=checkout,
                                          node=node, timeout=timeout)
            archive = selection.archive(root / "Eligibility_Delivery.zip")
            transferred = EligibilityDelivery.from_archive(
                archive["file"], root / "received-delivery", expected_sha256=archive["sha256"])
            need(transferred.verify() == manifest, "ELIGIBILITY_CUSTOMER_TRANSFER_CHANGED")

            # The received ZIP already contains the immutable receiving receipt.
            # Receive it through the same original readers into separate editable
            # workspaces, retaining the first sender's report/source identities.
            reopened = transferred.receive(root / "received-customer-workspaces",
                                           checkout=checkout, node=node, timeout=timeout)
            need(transferred.selection == selection.selection,
                 "ELIGIBILITY_CUSTOMER_RECEIVED_SELECTION_CHANGED")
            guide = (
                "# Eligibility customer handover\n\n"
                "This delivery retains dossier " + dossier_id + ", review " + review_id +
                ", revision " + str(revision) + ".\n\n"
                "Open Eligibility_Delivery.zip using the recorded SHA-256 and the installed "
                "eligibility-delivery-open command, then run eligibility-delivery-receive. "
                "The ZIP contains the complete dossier JSON and gzip, HTML and Markdown, "
                "eligibility JSON, seven CSV tables, original history and source bytes.\n\n"
                "The original receiving result names json-reader/workspace and "
                "stream-reader/workspace beneath the chosen destination. Start either with "
                "the installed Research workspace command, select the saved dossier and "
                "review, and continue at that receiver's current revision. Keep the new "
                "connection file and Python client directory private to that receiver. "
                "Reopening the same source preserves later compatible receiver history.\n\n"
                "The operation result carries original source file hashes, saved request "
                "identities, all twelve delivery members, the exact ZIP hash and every "
                "complete receiver result. Customer source files are complete; host "
                "connection tokens and Python call logs remain outside the ZIP.\n"
            ).encode("utf-8")
            immutable_bytes(root / "RECEIVING.md", guide)
            files = []
            for file in [binding_file, root / "RECEIVING.md", root / "Eligibility_Delivery.zip",
                         selection.selection_file, selection.directory / "delivery.json",
                         selection.directory / "receiving.json"]:
                checked = pin(file, 512 * 1024 * 1024)
                files.append({"name": file.relative_to(root).as_posix(),
                              "bytes": checked["bytes"], "sha256": checked["sha256"]})
            for row in manifest["files"]:
                files.append({"name": "delivery/files/" + row["name"],
                              "bytes": row["bytes"], "sha256": row["sha256"]})
            completed = {"schema": SCHEMA, "state": "COMPLETE", "binding": binding,
                "selection": {key: binding[key] for key in
                              ("workspaceId", "dossierId", "reviewId", "workSetId", "revision")},
                "selectedCounts": {name: len(rows) for name, rows in selection.selection["sections"].items()},
                "originalOperationIds": [row["id"] for row in saved_operations],
                "replayedRequests": replay_results, "archive": archive,
                "receivers": receivers, "transferredReceivers": reopened,
                "reportFiles": deepcopy(manifest["files"]), "files": files}
            _immutable(completed_file, completed)
            return completed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("checkout", "connection", "directory", "dossier-id", "review-id", "operation-id"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--revision", type=int)
    parser.add_argument("--work-set-id")
    parser.add_argument("--workspace-id")
    parser.add_argument("--node", default="node")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--replay-request", action="append", default=[])
    arguments = parser.parse_args()
    try:
        completed = receive_customer(
            checkout=arguments.checkout, connection=arguments.connection, directory=arguments.directory,
            dossier_id=arguments.dossier_id, review_id=arguments.review_id,
            operation_id=arguments.operation_id, revision=arguments.revision,
            work_set_id=arguments.work_set_id, workspace_id=arguments.workspace_id,
            node=arguments.node, timeout=arguments.timeout, replay_requests=arguments.replay_request)
        print(json.dumps({"schema": SCHEMA, "state": completed["state"],
            "file": str(Path(arguments.directory).expanduser().absolute() / "complete.json"),
            "selection": completed["selection"], "archive": completed["archive"],
            "receivers": {name: {"directory": value["directory"], "currentRevision": value["currentRevision"]}
                          for name, value in completed["transferredReceivers"].items()}}))
    except KeyboardInterrupt:
        print(json.dumps({"state": "INCOMPLETE", "error": "ELIGIBILITY_CUSTOMER_INTERRUPTED"}), file=sys.stderr)
        return 130
    except Exception as error:
        print(json.dumps({"state": "INCOMPLETE", "error": getattr(error, "code", type(error).__name__)}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    def stop(_signal, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)
    sys.exit(main())
