#!/usr/bin/env python3
"""Complete one original OData collection-comparison customer workflow."""
from __future__ import annotations
import argparse
import csv
from collections import Counter
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import zipfile

SCF = Path("stellar/scf-starforge-20261009")
EXAMPLES = SCF / "sf30-seller-sdk/odata/live/examples"
SCHEMA = "stellar-forge.odata-comparison-customer-analysis-operation.v1"
COLUMNS = ["entity_key", "entity_status", "field", "change", "before_state", "after_state",
           "before_type", "after_type", "before_value", "after_value", "typed_equal", "before_row", "after_row"]


def need(condition, message):
    if not condition:
        raise RuntimeError(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(path):
    with Path(path).open("rb") as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode), "Select a regular original file.")
        return {"bytes": info.st_size, "sha256": hashlib.file_digest(stream, "sha256").hexdigest()}


def private(path):
    path = Path(path).absolute()
    path.mkdir(parents=True, mode=0o700, exist_ok=True)
    info = path.lstat()
    need(path.resolve() == path and stat.S_ISDIR(info.st_mode) and not info.st_mode & 0o077,
         "Select a private original operation directory: " + str(path))
    return path


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def immutable(path, raw):
    path = Path(path)
    private(path.parent)
    expected = {"bytes": len(raw), "sha256": sha(raw)}
    if path.exists():
        need(identity(path) == expected, "A retained customer output changed: " + str(path))
    else:
        fd, name = tempfile.mkstemp(prefix=".odata-comparison-", dir=path.parent)
        temporary = Path(name)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, path)
            except FileExistsError:
                need(identity(path) == expected, "A different customer output already exists.")
        finally:
            temporary.unlink(missing_ok=True)
    final = path.lstat()
    for alias in path.parent.glob(".odata-comparison-*"):
        observed = alias.lstat()
        if stat.S_ISREG(observed.st_mode) and (observed.st_dev, observed.st_ino) == (final.st_dev, final.st_ino):
            alias.unlink()
    sync_directory(path.parent)
    return expected


def copy_original(source, target):
    source, target = Path(source), Path(target)
    expected = identity(source)
    private(target.parent)
    if target.exists():
        need(identity(target) == expected, "An original output copy changed.")
        return expected
    fd, name = tempfile.mkstemp(prefix=".odata-comparison-", dir=target.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as out, source.open("rb") as stream:
            shutil.copyfileobj(stream, out, 1024 * 1024)
            out.flush()
            os.fsync(out.fileno())
        need(identity(temporary) == expected, "The selected original file changed during copying.")
        try:
            os.link(temporary, target)
        except FileExistsError:
            need(identity(target) == expected, "Another selected output differs.")
        sync_directory(target.parent)
    finally:
        temporary.unlink(missing_ok=True)
    return expected


def options():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--source-ref", required=True)
    parser.add_argument("--source-selection", required=True)
    parser.add_argument("--source-selection-sha256", required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--resume-source-from", help="Exact original selection SHA for the pre-Analysis concurrent-reader correction")
    return parser.parse_args()


def main():
    args = options()
    if args.resume_source_from is not None:
        need(args.resume and re.fullmatch(r"[a-f0-9]{64}", args.resume_source_from),
             "Use --resume and the exact original selection SHA for source continuation.")
    checkout = Path(args.checkout).absolute()
    need(checkout.resolve() == checkout and re.fullmatch(r"[a-f0-9]{40}", args.source_ref),
         "Choose the actual original source directory and immutable product commit.")
    source_raw = Path(args.source_selection).read_bytes()
    need(sha(source_raw) == args.source_selection_sha256, "The selected source inventory changed.")
    source_inventory = json.loads(source_raw)
    need(source_inventory["source_ref"] == args.source_ref, "The original runtime source commit changed.")
    names = set()
    for item in source_inventory["files"]:
        path = PurePosixPath(item["path"])
        need(not path.is_absolute() and ".." not in path.parts and str(path) == item["path"] and item["path"] not in names,
             "The original runtime inventory contains an invalid source path.")
        names.add(item["path"])
        raw = (checkout / str(path)).read_bytes()
        need(len(raw) == item["bytes"] and sha(raw) == item["sha256"] and
             hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == item["git_blob_sha"],
             "A selected original runtime source changed: " + str(path))
    for path in (EXAMPLES / "comparison-customer.mjs", EXAMPLES / "comparison-customer.py",
                 SCF / "sf30-seller-sdk/odata/live/collection-comparison.mjs",
                 SCF / "sf30-seller-sdk/odata/live/collection-comparison-engine.mjs",
                 SCF / "sf30-seller-sdk/odata/live/collection.mjs",
                 SCF / "sf88-operator-buyer-cli/python/stellar_forge_buyer/analysis_workspace.py"):
        need(str(path) in names, "The selected source omits an original operation dependency.")
    descriptor_raw = Path(args.input).read_bytes()
    descriptor = json.loads(descriptor_raw)
    need(descriptor["schema"] == "stellar-forge.odata-comparison-customer-input.v1", "Select the original comparison input.")
    baseline = descriptor["baseline"]
    need(identity(baseline["path"]) == {key: baseline[key] for key in ("bytes", "sha256")}, "The completed original collection workspace changed.")
    out = private(descriptor["outputDirectory"])
    lock = os.open(out / "comparison-customer.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(lock)
        raise RuntimeError("The original customer comparison operation is already running.") from None
    sys.path.insert(0, str(checkout / SCF / "sf88-operator-buyer-cli/python"))
    from stellar_forge_buyer.analysis_workspace import AnalysisWorkspace
    from stellar_forge_buyer.analysis_workbooks import WorkbookDelivery
    from stellar_forge_buyer.response_documents import document_path
    from stellar_forge_buyer.workspace_archive_receive import restore_archive
    from stellar_forge_buyer.storage import dump

    selection = {"operation_id": descriptor["operationId"], "input_sha256": sha(descriptor_raw),
                 "source_ref": args.source_ref, "source_selection_sha256": sha(source_raw)}
    selection_sha = sha(canonical(selection).encode())
    journal_path = out / "comparison-analysis-operation.json"
    journal = workspace = receiving = None

    def save():
        dump(journal_path, journal)

    def publish(name, value):
        immutable(out / name, encoded(value))
        return value

    def step_id(label, attempt=0):
        return sha((selection_sha + ":" + label + ":" + str(attempt)).encode())[:32]

    def progress(phase, **extra):
        print(json.dumps({"phase": phase, **extra}, ensure_ascii=False), flush=True)

    def run_job(ws, label, kind, request):
        entry = journal["steps"].get(label)
        if entry is None:
            entry = {"kind": kind, "request": request, "attempts": [{"id": step_id(label)}]}
            journal["steps"][label] = entry
            save()
        need(entry["kind"] == kind and entry["request"] == request, "The original job selection changed: " + label)
        attempt = entry["attempts"][-1]
        try:
            result = ws.job(attempt["id"])
        except Exception as error:
            if getattr(error, "code", None) != "ANALYSIS_JOB_NOT_FOUND":
                raise
            result = ws.start(kind, {"id": attempt["id"], **request})
        if result["status"] in {"FAILED", "INTERRUPTED", "CANCELLED"}:
            need(args.resume, "The original native job requires --resume: " + attempt["id"])
            attempt.update(status=result["status"], error=result.get("error"))
            attempt = {"id": step_id(label, len(entry["attempts"]))}
            entry["attempts"].append(attempt)
            save()
            result = ws.start(kind, {"id": attempt["id"], **request})
        deadline, announced = time.monotonic() + 900, time.monotonic()
        while result["status"] == "RUNNING":
            need(time.monotonic() < deadline, "The selected native job is still running: " + attempt["id"])
            time.sleep(0.2)
            result = ws.job(attempt["id"])
            if time.monotonic() - announced > 20:
                progress(label, id=attempt["id"], status=result["status"])
                announced = time.monotonic()
        attempt.update(status=result["status"], error=result.get("error"))
        save()
        need(result["status"] == "COMPLETE", "Original " + label + ": " + str(result.get("error")))
        result_sha = sha(canonical(result["result"]).encode())
        need(attempt.get("result_sha256", result_sha) == result_sha, "A completed native result changed.")
        attempt["result_sha256"] = result_sha
        save()
        progress(label, id=attempt["id"], status="COMPLETE")
        return result

    try:
        if journal_path.exists():
            need(args.resume, "Use --resume to continue the retained customer comparison.")
            journal = json.loads(journal_path.read_bytes())
            need(journal["schema"] == SCHEMA, "The retained original comparison operation differs.")
            if journal["selection"] != selection or journal["selection_sha256"] != selection_sha:
                previous = journal["selection"]
                need(args.resume_source_from == journal["selection_sha256"] == sha(canonical(previous).encode()),
                     "Select the exact original failed preparation with --resume-source-from.")
                need(journal["state"] == "NEEDS_ATTENTION" and journal["steps"] == {} and
                     previous["operation_id"] == selection["operation_id"] and
                     previous["input_sha256"] == selection["input_sha256"],
                     "Continue the original input before any Analysis jobs have started.")
                native = json.loads((out / "comparison-native.json").read_bytes())
                need(native["state"] == "NEEDS_ATTENTION" and native["steps"] == {} and
                     native["requests"] == {} and native.get("error", {}).get("code") == "RELEASE_BUSY" and
                     not (out / "comparison-prepared.json").exists(),
                     "This source correction belongs to the original concurrent-reader preparation.")
                old_raw = (out / "runtime-source-selection.json").read_bytes()
                need(sha(old_raw) == previous["source_selection_sha256"],
                     "The original complete runtime selection changed.")
                old_source = json.loads(old_raw)
                old_files = {item["path"]: item for item in old_source["files"]}
                new_files = {item["path"]: item for item in source_inventory["files"]}
                core = str(SCF / "sf30-seller-sdk/odata/live/collection-comparison.mjs")
                operator = str(EXAMPLES / "comparison-customer.py")
                guide = str(EXAMPLES / "COMPARISON_CUSTOMER.md")
                known_before = {core: "4b2d9b173f599b24240a8a4fbe505c3e83450886",
                                operator: "920c43d3f1f2d2801ba2a440bc0533930f56e3eb",
                                guide: "18c737a07a98de491676e00f3a54959686332026"}
                changed = {name for name in old_files if old_files[name] != new_files.get(name)}
                need(len(old_files) == len(old_source["files"]) and set(old_files) == set(new_files) and
                     changed.issubset(known_before) and {core, operator}.issubset(changed) and
                     all(old_files[name]["git_blob_sha"] == known_before[name] for name in changed) and
                     new_files[core]["git_blob_sha"] == "4b85eafdc472559f742e44dc1d3c2a95417ed015" and
                     old_source["runtime"] == source_inventory["runtime"] and
                     old_source["node_modules"] == source_inventory["node_modules"],
                     "Only the reviewed same-process reader queue and its original continuation may change.")
                old_name = "runtime-source-history/" + sha(old_raw) + ".json"
                immutable(out / old_name, old_raw)
                journal.setdefault("source_upgrades", []).append({
                    "selection": previous, "selection_sha256": journal["selection_sha256"],
                    "state": journal["state"], "error": journal.get("error"),
                    "source_file": {"name": old_name, "bytes": len(old_raw), "sha256": sha(old_raw)},
                    "changed_paths": sorted(changed), "source_selection_sha256": sha(source_raw),
                    "reason": "Serialize concurrent original comparison reads before the unchanged kernel lease",
                    "adopted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
                journal.update(selection=selection, selection_sha256=selection_sha, state="RUNNING")
                journal.pop("error", None)
                save()
                progress("original-comparison-source-continued", selection_sha256=selection_sha)
        else:
            journal = {"schema": SCHEMA, "selection": selection, "selection_sha256": selection_sha,
                       "state": "RUNNING", "steps": {}, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
            save()
        if journal["state"] == "COMPLETE":
            result = json.loads((out / "comparison-customer-result.json").read_bytes())
            need(identity(out / result["archive"]["name"]) == {key: result["archive"][key] for key in ("bytes", "sha256")},
                 "The completed customer comparison archive changed.")
            progress("comparison-customer", status="COMPLETE", **result["archive"])
            return
        source_file = out / "runtime-source-selection.json"
        if source_file.exists() and source_file.read_bytes() != source_raw:
            upgrade = journal.get("source_upgrades", [{}])[-1]
            need(upgrade.get("source_selection_sha256") == sha(source_raw) and
                 identity(source_file) == {key: upgrade["source_file"][key] for key in ("bytes", "sha256")} and
                 identity(out / upgrade["source_file"]["name"]) == identity(source_file),
                 "Preserve the exact original runtime while completing its selected source continuation.")
            # The journal selects the successor before this atomic replacement.
            # A stopped process reopens the same retained old inventory above.
            dump(source_file, source_inventory)
        immutable(source_file, source_raw)
        immutable(out / "customer-input.json", descriptor_raw)
        helper = checkout / EXAMPLES / "comparison-customer.mjs"
        subprocess.run([args.node, str(helper), "prepare", str(out / "customer-input.json")], check=True, pass_fds=(lock,))
        prepared = json.loads((out / "comparison-prepared.json").read_bytes())
        need(prepared["operationId"] == descriptor["operationId"] and prepared["before"]["rows"] == descriptor["expectedRows"],
             "The original comparison preparation changed.")
        edition = prepared["edition"]
        source_manifest = Path(edition["sourceManifest"])
        need(identity(source_manifest) == {key: edition[key] for key in ("bytes", "sha256")}, "The selected reviewed edition changed.")
        source = json.loads(source_manifest.read_bytes())
        document = source["document"]
        csv_path = source_manifest.parent / document["path"]
        need(identity(csv_path) == {key: document[key] for key in ("bytes", "sha256")}, "The complete comparison CSV changed.")
        with csv_path.open("r", encoding="utf-8", newline="") as stream:
            reader = csv.reader(stream)
            need(next(reader) == COLUMNS, "The native comparison column selection changed.")
            expected_rows = list(reader)
        expected_count = prepared["counts"]["changedCells"]
        need(len(expected_rows) == expected_count and all(len(row) == len(COLUMNS) for row in expected_rows),
             "The native comparison CSV is incomplete.")
        need(0 < expected_count <= 100000, "This customer operation selects at most 100,000 changed cells.")
        need(all(row[1] == "matched" and row[3] == "selection_changed" and row[5] == "field_not_selected" for row in expected_rows),
             "The original customer selection changed its source meaning.")
        expected_summary = Counter((row[2], row[3], row[4], row[5]) for row in expected_rows)
        expected_summary_rows = [[*key, value] for key, value in sorted(expected_summary.items())]

        workspace = AnalysisWorkspace(out / "analysis-workspace", checkout=checkout, node=args.node)
        mapping = prepared["mapping"]
        registered = workspace.responses.register(mapping["source"], "document", manifest=source_manifest,
                                                   format="csv", expected_revision=0)
        need(registered["revision"] == mapping["source_revision"], "Use the actual selected source alias revision.")
        preview = run_job(workspace, "comparison-response-preview", "response-preview", mapping)
        imported = run_job(workspace, "comparison-response-import", "response-import",
            {"preview_id": preview["id"], "preview_sha256": preview["result"]["preview_sha256"], "allow_incomplete": False})
        version = imported["result"]["version"]
        need(version["row_count"] == expected_count, "The original Analysis import changed the comparison row count.")
        view = "customer_order_comparison"
        active = workspace.database.current(view)
        if active["version"] is None:
            workspace.database.activate(view, version["version_id"], expected_revision=0)
        else:
            need(active["version"]["version_id"] == version["version_id"], "The customer's selected comparison view changed.")
        bindings = workspace.database.view_bindings()
        quote = lambda value: '"' + value.replace('"', '""') + '"'
        sql = "SELECT " + ",".join(map(quote, COLUMNS)) + ' FROM "' + view + '" ORDER BY ' + quote(version["row_order_column"])
        summary_sql = ('SELECT "field","change","before_state","after_state",COUNT(*) AS "changed_cells" '
                       'FROM "' + view + '" GROUP BY "field","change","before_state","after_state" '
                       'ORDER BY "field","change","before_state","after_state"')
        specs = [("customer_original_changed_cells", sql), ("customer_field_selection_summary", summary_sql)]
        jobs = []
        for name, statement in specs:
            request = {"sql": statement, "parameters_text": "[]", "max_rows": 100000}
            try:
                saved = workspace.saved_query(name, revision=1)
            except Exception as error:
                if getattr(error, "code", None) != "ANALYSIS_QUERY_NOT_FOUND":
                    raise
                saved = workspace.save_query(name, request, expected_revision=0)
            need(all(saved[key] == value for key, value in request.items()), "The customer's original saved query changed.")
            jobs.append(run_job(workspace, name, "query", {**request, "expected_views": bindings}))
        results = []
        for label, job, expected in zip(("Original_Changed_Cells", "Field_Selection_Summary"), jobs,
                                        (expected_rows, expected_summary_rows)):
            raw, _, _ = workspace.export_result(job["id"], "json")
            observed = json.loads(raw)
            need(observed["rows"] == expected and not observed["truncated"], "The complete customer query differs: " + label)
            results.append(observed)
            for format in ("json", "csv"):
                data, _, _ = workspace.export_result(job["id"], format)
                immutable(out / (label + "." + format), data)
        typed = run_job(workspace, "typed-comparison-query-export", "query-export",
            {"query_id": jobs[0]["id"], "result_sha256": results[0]["result_sha256"],
             "label": "Complete original OData field-selection changes with source values and state",
             "formats": ["jsonl", "csv", "sqlite"], "max_rows": 100000, "max_output_bytes": 128 * 1024 * 1024,
             "spreadsheet_safe": True, "timeout": 300})

        report_name = "customer_odata_comparison_report"
        workspace.reports.save(report_name, {"id": step_id("save-report"), "expected_revision": 0,
            "title": "Original Orders: full source and customer country projection",
            "introduction": "Both complete collections select the same 830 Orders from the original five response envelopes. "
                "The second collection retains OrderID and ShipCountry. Each changed cell records an explicit field-selection difference; "
                "the original before value, original key and null state remain retained. The two inputs and their acquisition query "
                "are delivered with the complete saved review history.",
            "sections": [
                {"title": "Complete changed cells", "note": "Every original key and changed field, including native value/null states.",
                 "query_name": specs[0][0], "query_revision": 1},
                {"title": "Changes by field and state", "note": "Complete counts from the same imported original comparison.",
                 "query_name": specs[1][0], "query_revision": 1}]})
        report_definition = workspace.reports.definition(report_name, revision=1)
        reported = run_job(workspace, "comparison-customer-report", "report",
            {"name": report_name, "revision": 1, "definition_sha256": report_definition["sha256"], "expected_views": bindings})
        report_result = workspace.reports.result(reported["id"])["report"]
        publication = workspace.reports.publish(reported["id"], {"id": step_id("publish-report"),
            "result_sha256": report_result["result_sha256"], "expected_revision": 0,
            "note": "The complete original pair, key/value/null states and five saved review versions accompany this customer report."})
        publications = workspace.reports.publications(name=report_name)["publications"]
        publication_sha = next(item["sha256"] for item in publications if item["publication"]["id"] == publication["id"])
        report_exports = []
        for format, suffix in (("html", "html"), ("json", "json"), ("csv", "zip")):
            exported = run_job(workspace, "comparison-report-" + format, "report-export",
                {"publication_id": publication["id"], "publication_sha256": publication_sha, "format": format})
            path, item = workspace.report_export_file(exported["id"])
            name = "OData_Comparison_Report." + suffix
            report_exports.append({"name": name, **copy_original(path, out / name)})

        sheets = []
        for name, selected_source in (
            ("Changed Cells", {"kind": "query-export", "id": typed["id"]}),
            ("Field Summary", {"kind": "report", "id": publication["id"], "section": 1})):
            original = workspace.workbooks.source(selected_source)
            sheets.append({"name": name, "source": {**selected_source, "sha256": original["sha256"]},
                "columns": [{"source": column, "header": column, "type": "native", "null": "text",
                             "null_text": "NULL", "precision": "preserve"} for column in original["columns"]]})
        workbook_name = "customer_odata_comparison_workbook"
        definition = workspace.workbooks.save(workbook_name, {"id": step_id("save-workbook"), "expected_revision": 0,
            "title": "Complete original Orders field-selection comparison",
            "notes": "Complete original changed cells and field/state summary. Original values remain text with explicit state.",
            "sheets": sheets})
        worked = run_job(workspace, "comparison-customer-workbook", "workbook",
            {"name": workbook_name, "revision": definition["revision"], "definition_sha256": definition["definition_sha256"]})
        workbook_directory = workspace.database.directory / "analysis-workbooks" / worked["id"]
        delivery = WorkbookDelivery(workbook_directory, expected_manifest_sha256=worked["result"]["manifest_sha256"])
        workbook_manifest = delivery.inspect()
        workbook_zip = out / "OData_Comparison_Workbook.zip"
        with workspace.workbooks.download(worked["id"], "handoff.zip") as (stream, record):
            copy_original(workbook_directory / "handoff.zip", workbook_zip)
            need(identity(workbook_zip) == {key: record[key] for key in ("bytes", "sha256")}, "The original workbook archive changed.")
        delivery.verify_archive(workbook_zip)
        copy_original(workbook_directory / "workbook.xlsx", out / "OData_Comparison_Workbook.xlsx")
        workbook_receiving = out / "received-workbook"
        if workbook_receiving.exists():
            workbook_received = WorkbookDelivery(workbook_receiving, expected_manifest_sha256=worked["result"]["manifest_sha256"])
        else:
            workbook_received = WorkbookDelivery.receive(workbook_zip, workbook_receiving,
                expected_sha256=identity(workbook_zip)["sha256"])
        need(workbook_received.inspect() == workbook_manifest, "The independently received original workbook changed.")
        archive_review = workspace.archives.review()
        need(archive_review["ready"], "The customer workspace omits retained files: " + canonical(archive_review["missing"]))
        archived = run_job(workspace, "complete-comparison-analysis-workspace", "workspace-export", {"include_previous_backups": False})
        archive_result = archived["result"]
        archive_file = next(item for item in archive_result["files"] if item["name"] == "workspace.zip")
        archive_path = out / "OData_Comparison_Analysis_Workspace.zip"
        copy_original(Path(archive_result["directory"]) / "workspace.zip", archive_path)
        source_state = workspace.state()
        workspace.close()
        workspace = None

        observed_restore = restore_archive(archive_path, out / "received-analysis-workspace",
            operation=step_id("receive-analysis-workspace"), expected_sha256=archive_file["sha256"])
        restore_identity = {key: value for key, value in observed_restore.items() if key != "reused"}
        selected_restore = journal.get("analysis_restore")
        if selected_restore is None:
            selected_restore = {"identity": restore_identity, "receipt": observed_restore}
            journal["analysis_restore"] = selected_restore
        else:
            need(selected_restore["identity"] == restore_identity, "The received Analysis workspace identity changed.")
        selected_restore["last_reused"] = observed_restore["reused"]
        save()
        receiving = AnalysisWorkspace(out / "received-analysis-workspace", checkout=checkout, node=args.node)
        need(receiving.state()["workspace_id"] == source_state["workspace_id"], "The received Analysis workspace changed identity.")
        replay = run_job(receiving, "received-original-comparison-rows", "query",
            {"sql": sql, "parameters_text": "[]", "max_rows": 100000, "expected_views": receiving.database.view_bindings()})
        replay_raw, _, _ = receiving.export_result(replay["id"], "json")
        need(json.loads(replay_raw)["rows"] == expected_rows, "The received original comparison values changed.")
        need(receiving.reports.result(reported["id"])["report"]["result_sha256"] == report_result["result_sha256"],
             "The restored published report changed.")
        restored_workbook = WorkbookDelivery(receiving.database.directory / "analysis-workbooks" / worked["id"],
            expected_manifest_sha256=worked["result"]["manifest_sha256"])
        need(restored_workbook.inspect() == workbook_manifest, "The full Analysis restore changed its workbook.")
        received_source = document_path(receiving.database.directory, registered["document_id"])
        need(identity(received_source)["sha256"] == edition["sha256"], "The Analysis-held source document changed.")
        received_descriptor = {**descriptor, "analysisManifest": str(received_source), "analysisSourceSha256": edition["sha256"]}
        immutable(out / "comparison-analysis-input.json", encoded(received_descriptor))
        subprocess.run([args.node, str(helper), "receive-analysis", str(out / "comparison-analysis-input.json")],
                       check=True, pass_fds=(lock,))
        native_received = json.loads((out / "comparison-analysis-received.json").read_bytes())
        receiving.close()
        receiving = None
        original_reviews = json.loads((out / "merchant-workspace/live/products" / descriptor["serviceId"] /
                                      "comparisons" / descriptor["comparisonId"] / "reviews.json").read_bytes())
        publish("Original_Comparison_Reviews.json", original_reviews)
        result = {"schema": "stellar-forge.odata-comparison-customer-result.v1",
            "operation_id": descriptor["operationId"], "source_ref": args.source_ref,
            "source_selection_sha256": sha(source_raw), "comparison_sha256": prepared["comparisonSha256"],
            "before": prepared["before"], "after": prepared["after"], "counts": prepared["counts"],
            "omitted_fields": prepared["omittedFields"], "review_revision": edition["reviewRevision"],
            "review_retry": prepared["originalReviewRetry"], "source_document_sha256": edition["sha256"],
            "analysis_workspace_id": source_state["workspace_id"], "dataset_version_id": version["version_id"],
            "report_id": reported["id"], "report_publication": publication, "report_sha256": report_result["result_sha256"],
            "workbook_id": worked["id"], "workbook_manifest_sha256": worked["result"]["manifest_sha256"],
            "analysis_restore": selected_restore["receipt"], "comparison_receiving": native_received,
            "original_workspace_restore": prepared["workspaceRestore"], "report_exports": report_exports,
            "browser_errors": prepared["browserErrors"]}
        publish("worked-comparison-customer.json", result)

        start = (
            "# Original Orders: complete customer comparison\n\n"
            "Open OData_Comparison_Report.html for the changed-cell report and field/state summary. "
            "Open OData_Comparison_Workbook.xlsx for the same two worked sheets. "
            "Original_Comparison_Reviews.json retains all four review scopes and the later handover note.\n\n"
            "Both collections use the same original 830 Orders and five response envelopes. "
            "The second selection retains OrderID and ShipCountry. Each reported change is an explicit field-selection "
            "difference with its original key, before value and value/null state. The complete original pair is retained "
            "in the OData workspace and the Analysis source document.\n\n"
            "## Open and continue the original operator\n\n"
            "This edition carries the complete exact selected source under SOURCE/. Its immutable product revision is "
            + args.source_ref + "; runtime-source-selection.json binds every source byte. Set DELIVERY to this "
            "extracted edition, SOURCE to DELIVERY/SOURCE, RECEIVING to a new private directory, and NODE to "
            "the selected Node24 executable. Use the original installed merchant dependencies and Python with "
            "openpyxl described by the bundled source.\n\n"
            "~~~sh\n"
            "umask 077\n"
            "\"$NODE\" \"$SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/cli.mjs\" "
            "--workspace \"$RECEIVING/odata\" restore --input \"$DELIVERY/OData_Comparison_Workspace.json\"\n"
            "\"$NODE\" \"$SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/cli.mjs\" "
            "--workspace \"$RECEIVING/odata\" serve --port 0\n"
            "~~~\n\n"
            "Open Live services, select orders, then inspect the saved comparison. The workspace Restore control "
            "received this entire workspace during the original customer operation. It preserves the baseline collection, "
            "narrower collection, all selected review history and both frozen analytical editions.\n\n"
            "## Restore the complete Analysis workspace\n\n"
            "~~~sh\n"
            "export PYTHONPATH=\"$SOURCE/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python\"\n"
            "python3 -B -m stellar_forge_buyer.workspace_archive_receive receive "
            "\"$DELIVERY/OData_Comparison_Analysis_Workspace.zip\" \"$RECEIVING/analysis\" --sha256 "
            + archive_file["sha256"] + "\n"
            "python3 -B -m stellar_forge_buyer.analysis_workspace --database \"$RECEIVING/analysis\" "
            "--checkout \"$SOURCE\" --node \"$NODE\" serve\n"
            "~~~\n\n"
            "The original source registration, imported dataset, two saved queries, published report and workbook reopen "
            "through that native receiver. OData_Comparison_Workbook.zip is the independently received workbook handover. "
            "worked-comparison-customer.json records the exact selected input/output identities and receiving results. "
            "The adjacent comparison-customer.py/mjs and COMPARISON_CUSTOMER.md in the original source describe continuation.\n")
        immutable(out / "START.md", start.encode())
        names = ["START.md", "worked-comparison-customer.json", "runtime-source-selection.json",
                 "comparison-input-scope.json", "Original_Comparison_Reviews.json", "Original_Cell_Review_Request.json",
                 "Original_Changed_Cells.json", "Original_Changed_Cells.csv", "Field_Selection_Summary.json", "Field_Selection_Summary.csv",
                 "OData_Comparison_Report.html", "OData_Comparison_Report.json", "OData_Comparison_Report.zip",
                 "OData_Comparison_Workbook.xlsx", "OData_Comparison_Workbook.zip",
                 "OData_Comparison_Analysis_Workspace.zip", "OData_Comparison_Workspace.json", "OData_Collection_Comparison.png"]
        selected_members = {name: {"path": out / name, **identity(out / name)} for name in names}
        for item in source_inventory["files"]:
            name = "SOURCE/" + item["path"]
            path = checkout / item["path"]
            expected = {key: item[key] for key in ("bytes", "sha256")}
            need(name not in selected_members and identity(path) == expected,
                 "The complete selected source changed before customer packaging: " + name)
            selected_members[name] = {"path": path, **expected}
        names = sorted(selected_members)
        files = [{"name": name, **{key: selected_members[name][key] for key in ("bytes", "sha256")}} for name in names]
        publish("comparison-customer-files.json", {"schema": "stellar-forge.odata-comparison-customer-files.v1", "files": files})
        selected_members["comparison-customer-files.json"] = {"path": out / "comparison-customer-files.json",
                                                             **identity(out / "comparison-customer-files.json")}
        names.append("comparison-customer-files.json")
        final = out / "OData_Complete_Comparison_Customer_Edition.zip"
        candidate = out / ".OData_Complete_Comparison_Customer_Edition.partial.zip"
        package_selection = {"target": final.name, "candidate": candidate.name, "files": files}
        need(journal.get("package", package_selection) == package_selection, "The original complete package selection changed.")
        journal["package"] = package_selection
        save()

        def verify_package(path):
            with zipfile.ZipFile(path) as package:
                entries = package.infolist()
                need(len(entries) == len(names) and {item.filename for item in entries} == set(names),
                     "The complete comparison customer member selection changed.")
                for name in names:
                    expected = selected_members[name]
                    with package.open(name) as stream:
                        need(package.getinfo(name).file_size == expected["bytes"] and
                             hashlib.file_digest(stream, "sha256").hexdigest() == expected["sha256"],
                             "A selected comparison customer member changed.")

        if not final.exists():
            if candidate.exists():
                try:
                    verify_package(candidate)
                except zipfile.BadZipFile:
                    with candidate.open("rb") as stream:
                        stream.seek(max(0, os.fstat(stream.fileno()).st_size - 65557))
                        tail = stream.read()
                    marker = tail.rfind(b"PK\x05\x06")
                    incomplete = marker < 0 or len(tail) < marker + 22
                    if not incomplete:
                        incomplete = len(tail) < marker + 22 + int.from_bytes(tail[marker + 20:marker + 22], "little")
                    need(incomplete, "A structurally complete customer candidate is damaged; preserve it for review.")
                    retained = identity(candidate)
                    journal.setdefault("retired_partials", []).append(retained)
                    save()
                    need(identity(candidate) == retained, "The selected partial candidate changed.")
                    candidate.unlink()
            if not candidate.exists():
                with zipfile.ZipFile(candidate, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as package:
                    os.chmod(candidate, 0o600)
                    for name in names:
                        package.write(selected_members[name]["path"], name)
                with candidate.open("rb") as stream:
                    os.fsync(stream.fileno())
            verify_package(candidate)
            os.link(candidate, final)
            candidate.unlink()
            sync_directory(out)
        verify_package(final)
        if candidate.exists():
            a, b = final.lstat(), candidate.lstat()
            if (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino):
                candidate.unlink()
                sync_directory(out)
        complete = {"schema": "stellar-forge.odata-comparison-customer-delivery.v1",
                    "archive": {"name": final.name, **identity(final)}, "files": files,
                    "source_rows": descriptor["expectedRows"], "changed_cells": expected_count,
                    "comparison_sha256": prepared["comparisonSha256"], "review_revision": edition["reviewRevision"],
                    "analysis_workspace_id": source_state["workspace_id"]}
        publish("comparison-customer-result.json", complete)
        journal["state"] = "COMPLETE"
        journal.pop("error", None)
        save()
        progress("comparison-customer", status="COMPLETE", **complete["archive"])
    except BaseException as error:
        if journal is not None:
            journal["state"] = "NEEDS_ATTENTION"
            journal["error"] = {"type": type(error).__name__, "message": str(error)}
            save()
        raise
    finally:
        if receiving is not None:
            receiving.close()
        if workspace is not None:
            workspace.close()
        os.close(lock)


if __name__ == "__main__":
    main()
