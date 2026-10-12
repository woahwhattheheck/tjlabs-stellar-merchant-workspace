#!/usr/bin/env python3
"""MIT. Complete original-source results receiving on the maintained IATI workspace.

No publisher acquisition, provider request, payment or financial dataset build is
performed. Supply complete original XML and its observed identity in the config.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import traceback

HERE = Path(__file__).resolve().parent
# Direct script execution puts results/ first. Keep its workspace.py out of
# top-level imports so the original XML workspace remains the shared base.
if sys.path and Path(sys.path[0] or os.curdir).resolve() == HERE:
    sys.path[0] = str(HERE.parent)
else:
    sys.path.insert(0, str(HERE.parent))
from iati_source import InputError, fingerprint, MAX_SOURCE
from iati_workspace import IatiWorkspace
from workspace import json_bytes, load_json, file_digest, regular
from results import get_results
from results.model import CONTRACT

CONFIG = "stellar-forge.iati-results-receiving-selection.v1"
RESULT = "stellar-forge.iati-results-receiving-outcome.v1"
OPERATION = "IATI-RESULTS-RECEIVING"
MAX_CONFIG = 1024 * 1024


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(value, message):
    if not value:
        raise InputError(message)


def private_directory(path):
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or path.is_symlink() or path.resolve() != path
        or os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077)):
        raise InputError("Use a private original receiving directory without aliases: " + str(path))
    return path


def write_json(path, value, *, immutable=False):
    data = json_bytes(value)
    if immutable and path.exists():
        require(path.read_bytes() == data, "The retained receiving selection differs from this invocation")
        return
    fd, name = tempfile.mkstemp(prefix=".receiving-", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        if immutable:
            try:
                os.link(temporary, path)
            except FileExistsError:
                require(path.read_bytes() == data, "The original receiving selection already names other work")
        else:
            os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def checked_config(value):
    allowed = {"schema", "operationId", "root", "sources", "definition",
               "review", "coverageDefinition", "receivingReview"}
    require(isinstance(value, dict) and set(value) == allowed and value["schema"] == CONFIG,
            "Use the complete documented results receiving selection")
    from results.workspace import REQUEST, review
    require(isinstance(value["operationId"], str) and REQUEST.fullmatch(value["operationId"])
            and len(value["operationId"]) <= 120, "Use one original operation ID up to 120 characters")
    require(isinstance(value["root"], str) and Path(value["root"]).is_absolute(), "Select an absolute original receiving root")
    require(isinstance(value["sources"], list) and 1 <= len(value["sources"]) <= 32,
            "Select 1–32 complete original publisher documents")
    seen = set()
    for item in value["sources"]:
        require(isinstance(item, dict) and set(item) == {"path", "sha256", "bytes", "label", "name"},
                "Each original input needs path, sha256, bytes, label and name")
        from workspace import checked_id
        checked_id(item["sha256"])
        require(item["sha256"] not in seen, "Do not duplicate an original publisher source")
        seen.add(item["sha256"])
        require(isinstance(item["path"], str) and Path(item["path"]).is_absolute()
                and type(item["bytes"]) is int and 0 < item["bytes"] <= MAX_SOURCE,
                "Select each complete original source by absolute path and actual bytes")
        require(all(isinstance(item[k], str) and 0 < len(item[k]) <= 160 for k in ("label", "name")),
                "Keep source labels and names within the original workspace contract")
    for key in ("definition", "coverageDefinition"):
        require(isinstance(value[key], dict), "Supply complete original report definitions")
    for key in ("review", "receivingReview"):
        selected = review(value[key])
        require(selected["status"] == "reviewed", "This receiving programme needs explicit named reviewed interpretations")
    return deepcopy(value)


def source_manifest():
    selected = [
        HERE / "__init__.py", HERE / "model.py", HERE / "workspace.py",
        HERE / "report.py", HERE / "transfer.py", HERE / "receiving.py",
        HERE.parent / "iati_source.py", HERE.parent / "iati_workspace.py",
        HERE.parent.parent / "xml" / "xml_source.py",
        HERE.parent.parent / "xml" / "workspace.py",
    ]
    rows = {}
    for path in selected:
        raw = path.read_bytes()
        rows[str(path.relative_to(HERE.parent.parent))] = {"bytes": len(raw), "sha256": sha(raw)}
    return {"files": rows, "sha256": fingerprint(rows), "python": sys.version,
            "executable": sys.executable}


def existing(root):
    return IatiWorkspace(root, create=not (root / "workspace.json").exists())


def stable_state(workspace):
    view = workspace.state()
    return {"builds": len(view["builds"]), "plans": len(view["plans"]),
            "nativeComparisons": len(view["comparisons"]), "portfolios": len(view["portfolios"])}


def selected_definition(raw, source_ids):
    value = deepcopy(raw)
    require(set(value) <= {"name", "notes", "sources", "selection", "interpretations", "bindings", "review"}
            and "name" in value, "Use the original results definition fields")
    value.setdefault("sources", sorted(source_ids))
    require(set(value["sources"]) <= set(source_ids), "Report selection names a source outside this actual receiving input")
    return value


def file_identity(path):
    return {"file": str(path), "bytes": regular(path, 4 * 1024 * 1024 * 1024).st_size,
            "sha256": file_digest(path, 4 * 1024 * 1024 * 1024)}


def run(config):
    selected = checked_config(config)
    root = private_directory(Path(selected["root"]).absolute())
    exports = private_directory(root / "exports")
    selected_sha = sha(json_bytes(selected))
    selection_path = root / "receiving-selection.json"
    write_json(selection_path, selected, immutable=True)
    result_path = root / "result.json"
    if result_path.exists():
        prior = load_json(result_path.read_bytes())
        require(prior.get("schema") == RESULT and prior.get("selectionSha256") == selected_sha
                and prior.get("state") == "COMPLETE", "The existing receiving result names another selection")
        for item in prior["artifacts"].values():
            require(file_identity(Path(item["file"])) == item, "A completed original receiving artifact changed")
        with existing(root / "receiver") as workspace:
            api = get_results(workspace)
            edition = api.project(prior["project"], prior["receivingRevision"])
            require(edition["sha256"] == prior["receivingEditionSha256"], "The retained receiving edition changed")
        return prior

    manifest = source_manifest()
    progress_path = root / "progress.json"
    if progress_path.exists():
        progress = load_json(progress_path.read_bytes())
        require(progress.get("selectionSha256") == selected_sha, "Resume the original receiving input")
    else:
        progress = {"schema": "stellar-forge.iati-results-receiving-progress.v1",
                    "operationId": selected["operationId"], "selectionSha256": selected_sha,
                    "startedAt": now(), "executions": [], "stages": {}}
    execution = {"startedAt": now(), "source": manifest, "pid": os.getpid()}
    progress["executions"].append(execution)

    def checkpoint(name, value):
        progress["stages"][name] = value
        progress["updatedAt"] = now()
        write_json(progress_path, progress)
        print(json.dumps({"operationId": selected["operationId"], "stage": name,
                          "state": "COMPLETE", "at": progress["updatedAt"]}, separators=(",", ":")), flush=True)

    def key(suffix):
        return selected["operationId"] + "." + suffix

    try:
        actual_sources = []
        for item in selected["sources"]:
            path = Path(item["path"]).absolute()
            info = regular(path, MAX_SOURCE)
            require(info.st_size == item["bytes"] and file_digest(path, MAX_SOURCE) == item["sha256"],
                    "The selected complete original publisher bytes changed: " + item["name"])
            actual_sources.append(item)
        checkpoint("original-inputs", {"sources": actual_sources})

        with existing(root / "producer") as workspace:
            api = get_results(workspace)
            before_finance = stable_state(workspace)
            source_ids, source_views = [], []
            for item in actual_sources:
                with Path(item["path"]).open("rb") as original:
                    retained = workspace.add_source(original, item["label"], item["name"])
                require(retained["id"] == item["sha256"] and retained["bytes"] == item["bytes"],
                        "The original workspace retained another source identity")
                source_ids.append(retained["id"])
                source_views.append(api.project_source(retained["id"]))
            checkpoint("retained-original-projections", source_views)

            definition = selected_definition(selected["definition"], source_ids)
            definition["review"] = {"status": "draft", "reviewer": "", "note": "Original-source receiving selection prepared for the configured named review."}
            draft_input = {**definition, "requestId": key("draft")}
            draft = api.save(draft_input)
            project_id = draft["id"]
            checkpoint("draft", {"id": project_id, "revision": draft["revision"], "sha256": draft["sha256"]})

            reviewed_input = {**deepcopy(draft["definition"]), "id": project_id,
                              "expectedRevision": draft["revision"], "requestId": key("review"),
                              "review": selected["review"]}
            reviewed = api.save(reviewed_input)
            # A caller that lost this response resolves the original retained key.
            history_before = len(api.history(project_id)["editions"])
            replay = api.save(reviewed_input)
            retained_request = api.operation(reviewed_input["requestId"])
            require(replay == reviewed and retained_request["response"] == reviewed
                    and len(api.history(project_id)["editions"]) == history_before,
                    "Original request recovery created another review revision")
            checkpoint("reviewed-and-recovered", {"revision": reviewed["revision"], "sha256": reviewed["sha256"],
                       "request": reviewed_input["requestId"], "exactReplay": True,
                       "counts": reviewed["report"]["counts"]})

            scope_definition = selected_definition(selected["coverageDefinition"], source_ids)
            scope_definition["review"] = selected["review"]
            coverage_input = {**scope_definition, "id": project_id, "expectedRevision": reviewed["revision"],
                              "requestId": key("coverage")}
            coverage = api.save(coverage_input)
            comparison_input = {"requestId": key("compare-coverage"), "id": project_id,
                "beforeRevision": reviewed["revision"], "afterRevision": coverage["revision"], "pairs": []}
            comparison = api.compare(comparison_input)
            same_sources = reviewed["definition"]["sources"] == coverage["definition"]["sources"]
            if same_sources:
                require(all(not pair["originalValuesChanged"] for pair in comparison["comparison"]["pairs"]),
                        "A selection-only edit was incorrectly labelled a source value change")
            checkpoint("coverage-comparison", {"revision": coverage["revision"], "sha256": coverage["sha256"],
                       "comparison": comparison, "originalSourceValuesPreserved": same_sources})

            stale_input = {**deepcopy(draft["definition"]), "id": project_id,
                           "expectedRevision": draft["revision"], "requestId": key("delayed-tab")}
            recorded_cancel = api.operation(stale_input["requestId"])
            if not recorded_cancel["found"]:
                try:
                    api.save(stale_input)
                except InputError as error:
                    require("current head revision" in str(error), "The delayed tab failed for an unrelated reason")
                    stale_error = str(error)
                else:
                    raise InputError("The delayed tab replaced a later saved review")
                cancelled = api.cancel({"requestId": key("cancel-delayed-tab"), "targetKind": "save",
                    "targetInput": stale_input, "reason": "Receiving operator reconciled the delayed tab against the later review before correcting its draft."})
            else:
                require(recorded_cancel["state"] == "CANCELLED", "The delayed-tab request already committed other work")
                cancelled = recorded_cancel["response"]
                stale_error = "Recovered the original explicit cancellation."
            require(api.operation(stale_input["requestId"])["state"] == "CANCELLED"
                    and api.project(project_id)["revision"] == coverage["revision"],
                    "The original cancellation changed a committed review")
            checkpoint("delayed-tab-reconciliation", {"rejected": stale_error, "cancellation": cancelled,
                       "currentRevision": coverage["revision"]})

            project_packet = api.export(project_id, exports / "original-results-project.zip", coverage["revision"])
            report_packet = api.export(project_id, exports / "original-results-report.zip", coverage["revision"], report_only=True)
            replay_packet = api.export(project_id, exports / "original-results-project.zip", coverage["revision"])
            require(replay_packet["sha256"] == project_packet["sha256"]
                    and replay_packet["bytes"] == project_packet["bytes"] and replay_packet["reused"],
                    "Completed export recovery changed the full original packet")
            require(stable_state(workspace) == before_finance, "Results receiving changed the original financial/source-build workflow")
            original_edition_sha = coverage["sha256"]
            checkpoint("original-project-export", {"project": project_packet, "report": report_packet,
                       "financialNativeState": before_finance})

        with existing(root / "receiver") as workspace:
            api = get_results(workspace)
            receiver_before_finance = stable_state(workspace)
            receipt = api.receive(Path(project_packet["file"]), expected_sha256=project_packet["sha256"],
                                  expected_bytes=project_packet["bytes"])
            require(api.project(project_id, coverage["revision"])["sha256"] == original_edition_sha,
                    "Receiving changed the selected original edition")
            require(not api.operation(reviewed_input["requestId"])["found"],
                    "Receiving replayed a foreign original request into local operations")
            checkpoint("original-receiving", receipt)

            receiving_input = {**deepcopy(coverage["definition"]), "id": project_id,
                               "expectedRevision": coverage["revision"], "requestId": key("receiving-review"),
                               "review": selected["receivingReview"]}
            receiving = api.save(receiving_input)
            current_selection_request = api.operation(key("select-receiving-head"))
            if current_selection_request["found"]:
                # A completed command is history, not permission to replay its
                # earlier state transition after a later command already ran.
                selected_old = api.operation(key("inspect-historical-head"))["response"]
                selected_current = current_selection_request["response"]
                require(api.project(project_id)["revision"] == receiving["revision"],
                        "The receiving head changed after this programme's completed explicit selection")
                expected_local_head = receiving["revision"]
            else:
                selected_old = api.adopt({"requestId": key("inspect-historical-head"), "id": project_id,
                    "expectedRevision": receiving["revision"], "selectedRevision": reviewed["revision"],
                    "actor": selected["receivingReview"]["reviewer"],
                    "note": "Receiving operator explicitly selects the prior source review while retaining the later local review."})
                expected_local_head = reviewed["revision"]
            repeated_receipt = api.receive(Path(project_packet["file"]), expected_sha256=project_packet["sha256"],
                                          expected_bytes=project_packet["bytes"])
            require(repeated_receipt == receipt and api.project(project_id)["revision"] == expected_local_head,
                    "Repeated receiving replaced the explicitly selected local head")
            if not current_selection_request["found"]:
                selected_current = api.adopt({"requestId": key("select-receiving-head"), "id": project_id,
                    "expectedRevision": reviewed["revision"], "selectedRevision": receiving["revision"],
                    "actor": selected["receivingReview"]["reviewer"],
                    "note": "Receiving operator restores the completed local review after inspecting its historical source basis."})
            complete_packet = api.export(project_id, exports / "received-results-project.zip", receiving["revision"])
            complete_report = api.export(project_id, exports / "received-results-report.zip", receiving["revision"], report_only=True)
            receiving_edition_sha = receiving["sha256"]
            require(stable_state(workspace) == receiver_before_finance, "Receiving changed unrelated native financial work")
            checkpoint("receiving-review-and-head", {"review": receiving["revision"], "reviewSha256": receiving_edition_sha,
                       "historicalSelection": selected_old, "currentSelection": selected_current,
                       "sameOriginalReceipt": True, "project": complete_packet, "report": complete_report})

        with existing(root / "reopened") as workspace:
            api = get_results(workspace)
            second_receipt = api.receive(Path(complete_packet["file"]), expected_sha256=complete_packet["sha256"],
                                         expected_bytes=complete_packet["bytes"])
            final_edition = api.project(project_id)
            require(final_edition["sha256"] == receiving_edition_sha,
                    "Second receiving changed the exact later review")
            selected_report = api.report(project_id, receiving["revision"])
            require(selected_report["report"] == receiving["report"], "Full original report changed after independent receiving")
            snapshot = api.snapshot(project_id)
            require(snapshot["receipts"] and len(snapshot["editions"]) == len(api.history(project_id)["editions"]),
                    "Receiving omitted the original edition/receipt history")
            checkpoint("second-generation-receiving", {"receipt": second_receipt,
                       "editions": len(snapshot["editions"]), "reportSha256": selected_report["report"]["reportSha256"]})

        # Cold reopen through the same original workspace path and process lease.
        with existing(root / "receiver") as workspace:
            api = get_results(workspace)
            reopened = api.report(project_id, receiving["revision"])
            require(reopened["edition"]["sha256"] == receiving_edition_sha
                    and reopened["report"] == receiving["report"], "Cold reopen changed original results")
            final_history = api.history(project_id)
            final_request = api.operation(key("receiving-review"))
            require(final_request["found"] and final_request["response"]["sha256"] == receiving_edition_sha,
                    "The receiving operator's original request disappeared after reopen")
            checkpoint("cold-reopen", {"id": project_id, "revision": receiving["revision"],
                       "sha256": receiving_edition_sha, "reportSha256": reopened["report"]["reportSha256"]})

        artifacts = {name: file_identity(exports / filename) for name, filename in (
            ("originalProject", "original-results-project.zip"), ("originalReport", "original-results-report.zip"),
            ("receivingProject", "received-results-project.zip"), ("receivingReport", "received-results-report.zip"))}
        result = {"schema": RESULT, "state": "COMPLETE", "operationId": selected["operationId"],
            "selectionSha256": selected_sha, "startedAt": progress["startedAt"], "completedAt": now(),
            "project": project_id, "originalRevision": coverage["revision"],
            "originalEditionSha256": original_edition_sha, "receivingRevision": receiving["revision"],
            "receivingEditionSha256": receiving_edition_sha, "reportSha256": reopened["report"]["reportSha256"],
            "sources": actual_sources, "sourceCounts": [v["counts"] for v in source_views],
            "finalCounts": reopened["report"]["counts"],
            "originalRequestReplay": True, "foreignRequestsExecuted": False,
            "localHeadPreservedOnRepeatedReceiving": True, "coldReopen": True,
            "publisherRequests": 0, "providerRequests": 0, "financialDatasetBuilds": 0,
            "historyRevisions": [e["revision"] for e in final_history["editions"]],
            "artifacts": artifacts, "sourceExecutions": progress["executions"],
            "analysisContract": CONTRACT,
            "reviewMeaning": "The configured named local review is an authored receiving exercise on exact original publisher values; it is not a publisher endorsement or impact assurance."}
        write_json(result_path, result, immutable=True)
        return result
    except Exception as error:
        execution["failedAt"] = now()
        execution["error"] = {"type": type(error).__name__, "message": str(error)}
        progress["updatedAt"] = now()
        write_json(progress_path, progress)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description="Receive, review, export and reopen complete original IATI results")
    parser.add_argument("--config", required=True, help="Absolute original receiving-selection JSON")
    args = parser.parse_args(argv)
    config = Path(args.config).expanduser().absolute()
    require(config.is_file() and config.stat().st_size <= MAX_CONFIG, "Choose a complete receiving selection within 1 MiB")
    outcome = run(load_json(config.read_bytes()))
    print(json.dumps(outcome, ensure_ascii=False, separators=(",", ":"), allow_nan=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (InputError, OSError, ValueError) as error:
        print(json.dumps({"state": "INCOMPLETE", "error": str(error)}, separators=(",", ":")), file=sys.stderr, flush=True)
        raise SystemExit(2)
