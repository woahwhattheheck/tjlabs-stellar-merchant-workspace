#!/usr/bin/env python3
"""MIT. Reopen and export a complete donor statement from the original portfolio revision."""
from __future__ import annotations
import argparse
import html
import os
import tempfile
from pathlib import Path
from domain import canonical, require
from workspace import Workspace
from donor_reporting import read_statement


def report_html(value):
    statement = value["statement"]
    def escape(item):
        return html.escape(str(item if item is not None else ""))
    def table(headings, records):
        return "<table><thead><tr>" + "".join("<th>" + escape(h) + "</th>" for h in headings) + "</tr></thead><tbody>" + "".join(
            "<tr>" + "".join("<td>" + escape(canonical(cell).decode() if isinstance(cell, (dict, list)) else cell) + "</td>" for cell in row) + "</tr>"
            for row in records) + "</tbody></table>"
    body = "<h1>" + escape(statement["title"]) + "</h1><p>" + escape(statement["reportingPeriod"]["start"]) + " to " + escape(statement["reportingPeriod"]["end"]) + "</p>"
    body += "<p>" + escape(statement["recipient"]) + "</p><p>" + ("Submitted statement" if value["frozen"] else "Working statement") + "</p>"
    body += "<div class='text'>" + escape(statement["narrative"]) + "</div><h2>Financial basis</h2><p>" + escape(statement["financialBasis"]) + "</p>"
    for line in statement["lines"]:
        body += "<h3>" + escape(line["selection"]["title"]) + "</h3><p>" + escape(line["selection"]["basis"]) + "</p>"
        body += table(["Original dimensions", "Period total", "Control", "Variance", "State", "Group ID"],
            [[g["dimensions"], g["amount"], (g["control"] or {}).get("amount"), g["variance"], g["status"], g["id"]] for g in line["groups"]])
        body += "<h4>Every selected original row</h4>" + table(["Reference", "State", "Selected start", "Selected end", "Reason", "Complete source record"],
            [[r["reference"], r["status"], r["selectedStart"], r["selectedEnd"], r["reason"], r["record"]] for r in line["records"]])
    body += "<h2>Unselected original financial rows</h2>" + table(["Reference", "Reason", "Complete source record"],
        [[r["reference"], r["reason"], r["record"]] for r in statement["unselectedFinancialRows"]])
    body += "<h2>Results</h2><p>" + escape(statement["resultBasis"]) + "</p>" + table(["Indicator", "Dimensions", "Actual", "Target", "Variance", "Unit", "State"],
        [[r["title"], r["dimensions"], r["actual"], (r["target"] or {}).get("value"), r["variance"], r["unit"], r["status"]] for r in statement["results"]])
    body += "<h3>Every original observation</h3>" + table(["Reference", "State", "Complete observation"],
        [[r["reference"], r["status"], r["record"]] for r in statement["observations"]])
    body += "<h2>Review note</h2><div class='text'>" + escape(statement["selection"]["reviewNote"]) + "</div>"
    body += "<h2>Complete editable statement</h2><pre>" + escape(canonical(value).decode()) + "</pre>"
    return ("<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>" + escape(statement["title"]) + "</title><style>body{font:14px system-ui,sans-serif;color:#222;background:white;max-width:1200px;margin:32px auto;padding:0 20px}"
        "table{border-collapse:collapse;width:100%;table-layout:fixed;margin:16px 0}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}"
        "th{background:#eee}.text,pre{white-space:pre-wrap;overflow-wrap:anywhere}pre{font-size:11px}@media print{body{font-size:10px;margin:0}tr{break-inside:avoid}pre{font-size:8px}}</style>"
        + body + "</html>\n").encode("utf-8")


def save_exact(path, body):
    if path.exists() or path.is_symlink():
        require(not path.is_symlink() and path.is_file() and path.read_bytes() == body,
                "The export destination contains a different original edition")
        return
    fd, name = tempfile.mkstemp(prefix=".donor-report-", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            require(not path.is_symlink() and path.is_file() and path.read_bytes() == body,
                    "The export destination changed before publication")
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--portfolio", required=True)
    parser.add_argument("--revision", required=True, type=int)
    parser.add_argument("--report", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    destination = Path(args.out).expanduser().absolute()
    require(not destination.is_symlink(), "Use an original regular output directory")
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    with Workspace(args.workspace) as workspace:
        result = read_statement(workspace, {"portfolioId": args.portfolio, "revision": args.revision, "id": args.report})
    prefix = "donor-report-" + result["report"]["id"] + "-r" + str(result["report"]["revision"])
    save_exact(destination / (prefix + ".json"), canonical(result))
    save_exact(destination / (prefix + ".html"), report_html(result))
    descriptor = os.open(destination, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    print(canonical({"statement": result["statement"]["sha256"], "frozen": result["frozen"],
        "json": str(destination / (prefix + ".json")), "html": str(destination / (prefix + ".html"))}).decode(), end="")


if __name__ == "__main__":
    main()
