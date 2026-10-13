"""MIT. Freeze a complete selected pipeline order before the original checkout."""
from __future__ import annotations

import argparse
import html
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from contract import (PREPARED, MAX_PROJECT, MAX_SELECTION, MAX_EXPANDED, PreparationError,
                      PipelineWorkspace, canonical, need, identity, checked, read_json,
                      write_new, copy_checked, destination_lock, publish_directory,
                      receive_project, selected_order)

SCHEMA = PREPARED


def preflight_html(order, report_name):
    esc = lambda value: html.escape(str(value), quote=True)
    definition = order["definition"]
    sources = "".join(
        "<tr><th scope=row>" + esc(alias) + "</th><td>" + esc(source["label"]) +
        "</td><td>" + str(source["rows"]) + "</td><td>" + esc(source["originalName"]) +
        "</td></tr>" for alias, source in order["sourceRecords"].items())
    stages = "".join(
        "<section><h2>" + esc(stage["label"]) + "</h2><pre>" + esc(stage["sql"]) +
        "</pre><p>Saved parameters: <code>" + esc(canonical(stage["parameters"])) +
        "</code></p><p>Bindings: <code>" + esc(canonical(stage["bindings"])) +
        "</code></p></section>" for stage in definition["stages"])
    prior = order["reuseExecution"]
    reuse = ("Selected prior execution " + prior["id"] +
             ". The original engine decides which complete stages can be reused.") if prior else "Every stage is selected for native execution."
    return ("""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Pipeline order review</title>
<style>body{font:15px/1.6 system-ui,sans-serif;color:#222;background:white;max-width:1100px;margin:32px auto;padding:0 20px}h1{font-size:28px}h2{font-size:20px}section{border-top:1px solid #ccc;margin-top:24px;padding-top:16px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:16px}code{overflow-wrap:anywhere}.scroll{overflow:auto}a{color:inherit}</style>""" +
        "<h1>" + esc(report_name) + "</h1><p>" + esc(definition["label"]) +
        " · Saved edition " + str(definition["revision"]) + "</p><p>" + esc(reuse) +
        "</p><p>This preparation retains the complete selected project and source editions. "
        "Review the merchant's original quote and spending approval in the existing Request application before purchase.</p>"
        '<p><a href="input.json">Ordinary request input</a> · <a href="selection.json">Complete selection</a> · '
        '<a href="project.zip">Original project</a></p><h2>Original source editions</h2><div class="scroll">'
        "<table><thead><tr><th>Input</th><th>Source</th><th>Rows</th><th>Original file</th></tr></thead><tbody>" +
        sources + "</tbody></table></div>" + stages + "</html>\n").encode("utf-8")


def prepare(project, expected_sha256, directory, pipeline_id, revision, report_name, *, inputs=None, reuse=None):
    os.umask(0o077)
    project = Path(project).resolve()
    project_identity = identity(project, MAX_PROJECT)
    need(project_identity["sha256"] == expected_sha256, "The original project differs from its selected SHA-256")
    need(isinstance(report_name, str) and 1 <= len(report_name.strip()) <= 120 and "\x00" not in report_name,
         "Choose a report name of 1–120 nonempty characters")
    report_name.encode("utf-8")
    intent = {"schema": SCHEMA, "project": project_identity, "pipelineId": pipeline_id,
              "revision": revision, "reportName": report_name, "inputs": inputs, "reuseExecution": reuse}
    with destination_lock(directory) as directory:
        if directory.exists():
            saved = read_json(directory / "prepared.json")
            need(saved["intent"] == intent, "This preparation directory belongs to another complete selection")
            for name, record in saved["files"].items():
                checked(directory / name, record, MAX_PROJECT if name == "project.zip" else 4 * MAX_SELECTION)
            return saved
        with tempfile.TemporaryDirectory(dir=directory.parent, prefix=".pipeline-job-prepare-") as tmp:
            tmp = Path(tmp)
            prepared = tmp / "prepared"
            prepared.mkdir(mode=0o700)
            copy_checked(project, prepared / "project.zip", project_identity, MAX_PROJECT)
            received = tmp / "source"
            receive_project(prepared / "project.zip", received, max_bytes=MAX_EXPANDED)
            workspace = PipelineWorkspace(received)
            order = selected_order(workspace, project_identity, pipeline_id, revision, inputs=inputs, reuse=reuse)
            selection = write_new(prepared / "selection.json", order)
            need(selection["bytes"] <= MAX_SELECTION, "The complete order selection exceeds the 1 MiB input allowance")
            ordinary = {"reportName": report_name, "selectionSha256": selection["sha256"]}
            write_new(prepared / "input.json", ordinary)
            write_new(prepared / "review.html", preflight_html(order, report_name))
            files = {name: identity(prepared / name, MAX_PROJECT if name == "project.zip" else 4 * MAX_SELECTION)
                     for name in ("project.zip", "selection.json", "input.json", "review.html")}
            saved = {"schema": SCHEMA, "intent": intent, "functionId": "executePipeline",
                     "input": ordinary, "files": files,
                     "attachmentSlots": {"project": "project.zip", "selection": "selection.json"},
                     "pipeline": order["pipeline"], "sources": {
                         alias: {"id": value["id"], "label": value["label"], "rows": value["rows"]}
                         for alias, value in order["sourceRecords"].items()},
                     "outputs": order["definition"]["outputs"]}
            write_new(prepared / "prepared.json", saved)
            publish_directory(prepared, directory)
            return saved


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare and review the original saved pipeline before Jobs checkout")
    parser.add_argument("--project", required=True, type=Path)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--pipeline", required=True)
    parser.add_argument("--revision", required=True, type=int)
    parser.add_argument("--report", required=True)
    parser.add_argument("--inputs", type=Path)
    parser.add_argument("--reuse-execution")
    args = parser.parse_args()
    try:
        inputs = read_json(args.inputs) if args.inputs else None
        value = prepare(args.project, args.sha256, args.directory, args.pipeline, args.revision,
                        args.report, inputs=inputs, reuse=args.reuse_execution)
        print(canonical(value), flush=True)
    except (PreparationError, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr, flush=True)
        raise SystemExit(1)
