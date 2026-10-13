"""Saved regional analysis inside the original BLS workspace and operation history."""
from __future__ import annotations
import csv
import json
import os
from pathlib import Path
import zipfile
from regional import (SCHEMA, DEFINITION_SCHEMA, METHOD_VERSION, COLUMNS, analyze,
                      encoded, html_document, request_input, require, revision_changes)

REGIONAL_FILES = ("rows.jsonl", "report.csv", "report.json", "report.html",
                  "original-observations.jsonl", "regional-definition.json", "regional-changes.json", "analysis.zip")


def selection_rows(workspace, request, projection):
    if request[projection] is None:
        return iter(())
    selected = {"year": request["years"]}
    if projection == "laus":
        selected.update(county_fips=request["counties"], seasonal=[request["laus"]["seasonal"]])
    else:
        selected.update(area_fips=request["counties"], quarter=request["qcew"]["quarters"],
                        **{key: [request["qcew"][key]] for key in ("ownership_code", "industry_code", "size_code")})
    return workspace.row_iterator(request["edition_id"], projection, selected)


def selected_analysis(workspace, value):
    import capture
    request = request_input(value)
    edition = workspace._edition(request["edition_id"])
    require(set(request["counties"]) <= set(edition["data"]["manifest"]["selection"]["counties"]),
            "Choose counties in the complete retained source selection.")
    original = capture.load_source(workspace.directory / "sources" / edition["id"] / "source.json", workspace.contract)
    require(original["capture_sha256"] == edition["capture_hash"], "The selected original capture changed.")
    return edition, analyze(selection_rows(workspace, request, "laus"), selection_rows(workspace, request, "qcew"), request)


def _write(path, chunks):
    with path.open("w", encoding="utf-8", newline="") as stream:
        for chunk in chunks:
            stream.write(chunk)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(path, 0o600)


def _json_array(prefix, key, rows):
    yield prefix + '"' + key + '":['
    for index, row in enumerate(rows):
        yield ("," if index else "") + encoded(row)
    yield "]"


def _read_rows(workspace, report_id):
    path = workspace.file("report", report_id, "rows.jsonl")
    with path.open("r", encoding="utf-8") as source:
        return [json.loads(line) for line in source]


def save_regional(workspace, operation_id, value, operation):
    from model import file_pin, write_json
    edition, result = selected_analysis(workspace, value)
    request = result["definition"]
    for row in result["rows"]:
        row.update(source_capture_sha256=edition["capture_hash"], source_sha256=edition["source_hash"])
    root = workspace._report_files(operation_id)
    previous_id = request["previous_report_id"]
    parent, changes = None, {"counts": {"added": len(result["rows"]), "removed": 0, "changed": 0, "unchanged": 0}, "rows": []}
    if previous_id:
        parent = workspace.report(previous_id)
        require(parent.get("schema") == SCHEMA and parent.get("kind") == "regional", "Revise an existing saved regional analysis.")
        changes = revision_changes(_read_rows(workspace, previous_id), result["rows"])
    metadata = {"schema": SCHEMA, "id": operation_id, "kind": "regional", "created_at": operation["created"],
                "title": request["title"], "narrative": request["narrative"], "edition_id": edition["id"], "projection": "combined",
                "request": request, "method_version": METHOD_VERSION, "methodology": result["methodology"],
                "counties": result["counties"], "source_counts": result["source_counts"], "status_counts": result["status_counts"],
                "row_count": result["row_count"], "original_observation_count": sum(result["source_counts"].values()),
                "analysis_revision": parent["analysis_revision"] + 1 if parent else 1,
                "previous_report_id": previous_id, "root_report_id": parent.get("root_report_id", previous_id) if parent else operation_id,
                "revision_changes": changes["counts"],
                "source": {"edition_id": edition["id"], "capture_sha256": edition["capture_hash"],
                           "source_sha256": edition["source_hash"], "manifest": edition["data"]["manifest"]}}
    _write(root / "rows.jsonl", (encoded(row) + "\n" for row in result["rows"]))
    _write(root / "original-observations.jsonl", (encoded(row) + "\n" for row in result["originals"]))
    with (root / "report.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\r\n")
        writer.writerow(COLUMNS)
        for row in result["rows"]:
            writer.writerow([encoded(row.get(key)) if isinstance(row.get(key), (dict, list)) else row.get(key, "") for key in COLUMNS])
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(root / "report.csv", 0o600)
    definition = {"schema": DEFINITION_SCHEMA, "source": {"workspace_id": workspace.marker["workspace_id"],
                    "edition_id": edition["id"], "capture_sha256": edition["capture_hash"], "source_sha256": edition["source_hash"]},
                  "analysis_id": operation_id, "method_version": METHOD_VERSION, "input": request}
    write_json(root / "regional-definition.json", definition)
    write_json(root / "regional-changes.json", {"schema": "stellar-forge.bls-regional-changes.v1",
                "before_report_id": previous_id, "after_report_id": operation_id, **changes})
    def full_json():
        yield '{"metadata":' + encoded(metadata) + ","
        yield from _json_array("", "rows", result["rows"])
        yield ","
        yield from _json_array("", "originals", result["originals"])
        yield ',"changes":' + encoded(changes) + "}\n"
    _write(root / "report.json", full_json())
    _write(root / "report.html", html_document(metadata, result["rows"], result["originals"], changes))
    metadata["files"] = {name: file_pin(root / name) for name in REGIONAL_FILES if name != "analysis.zip"}
    # The customer ZIP is a complete analysis with all original input observations.
    # The existing workspace ZIP also includes every raw capture and remains editable.
    package = root / "analysis.zip"
    temporary = root / ".analysis-writing.zip"
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as bundle:
        for name in REGIONAL_FILES:
            if name == "analysis.zip":
                continue
            require(file_pin(root / name) == metadata["files"][name], "The completed regional analysis changed during packaging.")
            bundle.write(root / name, name)
        start = ("REGIONAL LABOR ANALYSIS\n\nOpen report.html for the complete report and charts. report.csv contains all analysis values; "
                 "report.json retains their exact fractions, all original observations and the preceding analysis comparison. "
                 "original-observations.jsonl is the complete selected source population.\n\n"
                 "To revise the analysis, open the original BLS labor workspace, choose Regional analysis, and import regional-definition.json. "
                 "Its original source and workspace identity are checked. Receive the complete editable workspace ZIP on another host to continue "
                 "all original raw sources, saved reports, notes and publication work.\n")
        bundle.writestr("START_HERE.txt", start.encode("utf-8"))
    with temporary.open("rb") as stream:
        os.fsync(stream.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, package)
    metadata["files"]["analysis.zip"] = file_pin(package)
    write_json(root / "metadata.json", metadata)
    with workspace.db_lock:
        workspace.db.execute("INSERT OR REPLACE INTO reports VALUES(?,?,?,?,?,?)",
                             (operation_id, operation["created"], request["title"], edition["id"], "regional", encoded(metadata)))
    return metadata


def import_definition(workspace, document):
    require(isinstance(document, dict) and set(document) == {"schema", "source", "analysis_id", "method_version", "input"},
            "Import a complete exported regional definition.")
    require(document["schema"] == DEFINITION_SCHEMA, "Select an original regional analysis definition.")
    source = document["source"]
    require(isinstance(source, dict) and set(source) == {"workspace_id", "edition_id", "capture_sha256", "source_sha256"},
            "Retain the original regional source identity.")
    require(source["workspace_id"] == workspace.marker["workspace_id"],
            "Receive the original complete working project before revising this customer analysis.")
    edition = workspace._edition(source["edition_id"])
    require(source["capture_sha256"] == edition["capture_hash"] and source["source_sha256"] == edition["source_hash"],
            "The definition's selected original source differs from this workspace.")
    request = request_input(document["input"])
    require(request["edition_id"] == source["edition_id"], "Keep the analysis definition's original source edition.")
    prior = workspace.report(document["analysis_id"])
    require(prior.get("schema") == SCHEMA and prior["request"] == request and
            prior["method_version"] == document["method_version"], "The exported definition differs from the original saved analysis.")
    request["previous_report_id"] = document["analysis_id"]
    return {"schema": DEFINITION_SCHEMA, "input": request, "source": source, "previous_report_id": document["analysis_id"]}


def definition_request(workspace, document):
    """Read-only source-bound opening; edited values are saved by the original operation API."""
    return import_definition(workspace, document)
