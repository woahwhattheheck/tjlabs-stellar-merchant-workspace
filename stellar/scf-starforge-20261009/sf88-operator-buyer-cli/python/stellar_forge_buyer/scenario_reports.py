"""Complete reports from retained scenario rows, without rerunning any SQL."""
from __future__ import annotations

import csv
from datetime import datetime, timezone
import hashlib
import html
import io
import json
import os
from pathlib import Path
import tempfile
import zipfile

from .scenario_types import SCHEMA, checksum, encode, fail, file_digest, identifier, revision

STYLE = """
:root{font:14px/1.55 system-ui,Arial,sans-serif;color:#202020;background:white}
body{max-width:1180px;margin:40px auto;padding:0 24px}h1{font-size:30px;line-height:1.2}
h2{font-size:22px;margin-top:36px}h3{font-size:17px}p{white-space:pre-wrap}.muted{color:#626262}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:7px 9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{background:#eee}td.numeric{font-variant-numeric:tabular-nums;white-space:nowrap}.scroll{overflow:auto}
.note{border-left:3px solid #777;padding:10px 16px;background:#f6f6f6}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;background:#f6f6f6;padding:12px}
summary{cursor:pointer;font-weight:600;margin:12px 0}a{color:inherit}.pill{display:inline-block;border:1px solid #aaa;padding:3px 8px;margin-right:6px}
@media(max-width:600px){body{padding:0 14px;margin:24px auto}h1{font-size:25px}}
@media print{body{margin:0;padding:0;max-width:none}.scroll{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}h2,h3{break-after:avoid}details>*{display:block}}
"""


def escape(value):
    return html.escape(str(value), quote=True)


def scalar(cell):
    if cell is None:
        return "Not present"
    if cell["type"] == "null":
        return "Unreported"
    return str(cell.get("text", ""))


def reviewed_date(value):
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        return stamp.strftime("%b %d, %Y at %H:%M UTC")
    except (AttributeError, TypeError, ValueError):
        return "Review date unavailable"


def spreadsheet_cell(value):
    """Protect spreadsheet formula interpretation; typed JSON keeps exact text."""
    result = "" if value is None else str(value)
    stripped = result.lstrip(" \t\r\n")
    if stripped.startswith(("=", "+", "-", "@")) or result.startswith(("\t", "\r", "\n")):
        return "'" + result
    return result


def selected_report(workspace, run_id, review_revision):
    run = workspace.run(identifier(run_id))
    if run["status"] != "COMPLETE":
        fail("Finish this run before exporting a customer report.")
    revision(review_revision, zero=True)
    with workspace.database._connection(readonly=True) as db:
        review = (workspace._record(db.execute("SELECT * FROM sf_scenario_reviews WHERE run_id=? AND revision=?", (run_id, review_revision)).fetchone())
                  if review_revision else None)
    return {**run, "review": review, "review_revision": review_revision}


def _rows(workspace, db, run_id, table, index_name, index):
    for row in db.execute("SELECT * FROM " + table + " WHERE run_id=? AND " + index_name + "=? ORDER BY row_number", (run_id, index)):
        value = workspace._record(row)
        if table == "sf_scenario_rows":
            yield {"row_number": row["row_number"], "key": json.loads(row["key"]), "cells": value}
        else:
            yield {"row_number": row["row_number"], **value}


def write_json(workspace, report, output):
    metadata = {"schema": SCHEMA + "/customer-report", "report": report}
    output.write(encode(metadata)[:-1] + ',"case_results":[')
    with workspace.database._connection(readonly=True) as db:
        db.execute("BEGIN")
        for index, case in enumerate(report["cases"]):
            if index:
                output.write(",")
            output.write(encode(case)[:-1] + ',"rows":[')
            for ordinal, row in enumerate(_rows(workspace, db, report["id"], "sf_scenario_rows", "task", case["task"])):
                output.write(("," if ordinal else "") + encode(row))
            output.write("]}")
        output.write('],"comparison_results":[')
        for index, pair in enumerate(report["result"]["comparisons"]):
            if index:
                output.write(",")
            output.write(encode(pair)[:-1] + ',"rows":[')
            for ordinal, row in enumerate(_rows(workspace, db, report["id"], "sf_scenario_comparison_rows", "pair", pair["pair"])):
                output.write(("," if ordinal else "") + encode(row))
            output.write("]}")
    output.write("]}\n")


def write_html(workspace, report, output):
    spec, run_id = report["definition"], report["id"]
    cases = {c["name"]: c for c in spec["cases"]}
    measures = {m["name"]: m for m in spec["measures"]}
    output.write('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(spec["title"]) + '</title><style>' + STYLE + '</style><main>')
    output.write('<p class="muted">SCENARIO ANALYSIS · RETAINED RESULTS</p><h1>' + escape(spec["title"]) + '</h1><p>' + escape(spec["question"]) + '</p>')
    output.write('<p>Baseline: <strong>' + escape(cases[spec["baseline"]]["label"]) + '</strong> · ' + str(len(spec["cases"])) + ' scenarios · ' + str(len(spec["measures"])) + ' saved analyses · ' + str(report["result"]["total_result_rows"]) + ' complete result rows.</p>')
    output.write('<p class="muted">All cases use the same retained data selection. Differences describe these selected data and parameters; they are not forecasts of unobserved outcomes.</p>')
    review = report["review"]
    if review:
        chosen = cases[review["selected_case"]]["label"] if review["selected_case"] else "Decision left open"
        output.write('<section class="note"><h2>Operator review</h2><strong>' + escape(chosen) + '</strong><p>' + escape(review["note"]) + '</p><p class="muted">' + escape(review["reviewer"] or "Operator") + ' · ' + escape(reviewed_date(review["reviewed_at"])) + ' · Review ' + str(review["revision"]) + '</p></section>')
    output.write('<h2>Parameter scenarios</h2><div class="scroll"><table><thead><tr><th>Scenario</th><th>Purpose</th><th>Effective parameters by analysis</th></tr></thead><tbody>')
    for case in spec["cases"]:
        tasks = [r for r in report["cases"] if r["case"] == case["name"]]
        params = "\n".join(measures[r["measure"]]["title"] + ": " + r["parameters_text"] for r in tasks)
        output.write('<tr><td>' + escape(case["label"]) + '</td><td>' + escape(case["note"]) + '</td><td><pre>' + escape(params) + '</pre></td></tr>')
    output.write('</tbody></table></div><h2>Complete comparisons</h2><p class="muted">Percentage change is Δ ÷ |baseline| × 100, rounded to 28 significant decimal digits. A zero baseline or unreported value has no percentage. Added and removed rows keep their distinct status.</p>')
    with workspace.database._connection(readonly=True) as db:
        db.execute("BEGIN")
        for pair in report["result"]["comparisons"]:
            measure = measures[pair["measure"]]
            output.write('<h3>' + escape(measure["title"]) + ' · ' + escape(cases[pair["candidate"]]["label"]) + '</h3><p>' + ' · '.join(str(v) + ' ' + escape(k) for k, v in pair["counts"].items()) + '</p>')
            output.write('<div class="scroll"><table><thead><tr><th>Row key</th><th>Status</th><th>Metric</th><th>Baseline</th><th>Scenario</th><th>Δ</th><th>Δ / |baseline| (%)</th></tr></thead><tbody>')
            labels = {m["column"]: m["label"] + (" (" + m["unit"] + ")" if m["unit"] else "") for m in measure["metrics"]}
            for row in _rows(workspace, db, run_id, "sf_scenario_comparison_rows", "pair", pair["pair"]):
                key = " · ".join(scalar(c) for c in row["key"]) or "Single result"
                for metric in row["metrics"]:
                    values = (key, row["status"], labels[metric["column"]], scalar(metric["baseline"]), scalar(metric["candidate"]), metric["delta"] if metric["delta"] is not None else "Not available", metric["percent_of_absolute_baseline"] if metric["percent_of_absolute_baseline"] is not None else (metric["reason"] or "Not available"))
                    output.write('<tr>' + ''.join('<td>' + escape(v) + '</td>' for v in values) + '</tr>')
            output.write('</tbody></table></div>')
        output.write('<h2>Complete source results</h2>')
        for case in report["cases"]:
            output.write('<details><summary>' + escape(cases[case["case"]]["label"]) + ' · ' + escape(measures[case["measure"]]["title"]) + ' · ' + str(case["row_count"]) + ' rows</summary><div class="scroll"><table><thead><tr>')
            output.write(''.join('<th>' + escape(c) + '</th>' for c in case["columns"]) + '</tr></thead><tbody>')
            for row in _rows(workspace, db, run_id, "sf_scenario_rows", "task", case["task"]):
                output.write('<tr>' + ''.join('<td>' + escape(scalar(v)) + '</td>' for v in row["cells"]) + '</tr>')
            output.write('</tbody></table></div></details>')
    output.write('<details><summary>Saved SQL, source selection and retained identities</summary><pre>' + escape(encode(report)) + '</pre></details></main></html>\n')


def write_csv_bundle(workspace, report, destination):
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        archive.writestr("README.txt", "Complete retained scenario results. No SQL is rerun for this export.\nCSV text that could be interpreted as a spreadsheet formula is prefixed with an apostrophe.\nTyped rows, exact integer/decimal text, nulls, source selection and decisions are preserved in report.json.\nPercentages use 100 * delta / absolute baseline with 28 significant decimal digits; zero baseline is unavailable.\n")
        with archive.open("report.json", "w") as target:
            stream = io.TextIOWrapper(target, encoding="utf-8", newline="")
            write_json(workspace, report, stream)
            stream.flush()
            stream.detach()
        with workspace.database._connection(readonly=True) as db:
            db.execute("BEGIN")
            for case in report["cases"]:
                path = "results/" + case["case"] + "/" + case["measure"] + ".csv"
                with archive.open(path, "w") as target:
                    stream = io.TextIOWrapper(target, encoding="utf-8", newline="")
                    writer = csv.writer(stream)
                    writer.writerow([spreadsheet_cell(v) for v in case["columns"]])
                    for row in _rows(workspace, db, report["id"], "sf_scenario_rows", "task", case["task"]):
                        writer.writerow([spreadsheet_cell(scalar(v)) for v in row["cells"]])
                    stream.flush()
                    stream.detach()
            for pair in report["result"]["comparisons"]:
                path = "comparisons/" + pair["candidate"] + "/" + pair["measure"] + ".csv"
                with archive.open(path, "w") as target:
                    stream = io.TextIOWrapper(target, encoding="utf-8", newline="")
                    writer = csv.writer(stream)
                    writer.writerow(("key_json", "status", "baseline_row", "candidate_row", "metric", "baseline_type", "baseline", "candidate_type", "candidate", "delta", "percent_of_absolute_baseline", "reason"))
                    for row in _rows(workspace, db, report["id"], "sf_scenario_comparison_rows", "pair", pair["pair"]):
                        for m in row["metrics"]:
                            writer.writerow([spreadsheet_cell(v) for v in (encode(row["key"]), row["status"], row["baseline_row"], row["candidate_row"], m["column"], (m["baseline"] or {}).get("type", "missing"), scalar(m["baseline"]), (m["candidate"] or {}).get("type", "missing"), scalar(m["candidate"]), m["delta"], m["percent_of_absolute_baseline"], m["reason"])])
                    stream.flush()
                    stream.detach()


def export_report(workspace, value):
    if not isinstance(value, dict):
        fail("An export request is required.")
    export_id = identifier(value.get("id"))
    run_id = identifier(value.get("run_id"))
    format = value.get("format")
    if format not in ("json", "html", "csv"):
        fail("Choose HTML, JSON or the complete CSV bundle.")
    selected_revision = revision(value.get("review_revision", 0), zero=True)
    request = {"id": export_id, "run_id": run_id, "format": format,
               "review_revision": selected_revision, "result_sha256": value.get("result_sha256")}
    request_sha = checksum(request)
    with workspace.guard, workspace.database._connection() as db:
        row = db.execute("SELECT * FROM sf_scenario_exports WHERE id=?", (export_id,)).fetchone()
        if row:
            if row["request_sha256"] != request_sha:
                fail("This export identifier belongs to a different request.")
            retained = workspace._record(row)
            path = workspace.exports / retained["filename"]
            if path.is_symlink() or not path.is_file() or file_digest(path) != retained["sha256"]:
                fail("The retained export is unavailable or changed. Prepare a new export from the same saved result.")
            return retained
        report = selected_report(workspace, run_id, selected_revision)
        if report["result_sha256"] != request["result_sha256"]:
            fail("The reviewed result identity does not match.")
        extension = "zip" if format == "csv" else format
        filename = export_id + "." + extension
        final = workspace.exports / filename
        fd, temporary = tempfile.mkstemp(prefix=".report-", dir=workspace.exports)
        os.close(fd)
        try:
            if format == "csv":
                write_csv_bundle(workspace, report, temporary)
            else:
                with open(temporary, "w", encoding="utf-8", newline="") as stream:
                    (write_json if format == "json" else write_html)(workspace, report, stream)
            with open(temporary, "rb") as stream:
                os.fsync(stream.fileno())
            sha = file_digest(temporary)
            if final.exists():
                if final.is_symlink() or file_digest(final) != sha:
                    fail("An existing export file differs; prepare a new export identifier.")
            else:
                os.link(temporary, final)
            result = {"schema": SCHEMA + "/export", **request, "filename": filename,
                      "download_name": report["definition"]["name"] + "-review-" + str(selected_revision) + "." + extension,
                      "bytes": final.stat().st_size, "sha256": sha,
                      "content_type": {"html": "text/html; charset=utf-8", "json": "application/json", "csv": "application/zip"}[format]}
            raw = encode(result)
            db.execute("INSERT INTO sf_scenario_exports VALUES(?,?,?,?)", (export_id, request_sha, raw, hashlib.sha256(raw.encode()).hexdigest()))
            return result
        finally:
            Path(temporary).unlink(missing_ok=True)
