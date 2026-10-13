"""MIT. Revision-pinned budget reads and complete portable reports."""
from __future__ import annotations

import csv
from html import escape
import io
import json

from domain import canonical, identifier, require, shape
from programme_service import _version
from budget_planning import (COLLECTIONS, PLANNING_SCHEMA, indexes, planning_schema,
                             scenario_ref, summary)


def selection(workspace, query, extra=()):
    shape(query, ("portfolioId", "revision", *extra), ("portfolioId", "revision"))
    portfolio = workspace.portfolio(identifier(query["portfolioId"]), _version(query["revision"]))
    model = portfolio["definition"].get("planning")
    require(model is not None, "This saved portfolio has no budget scenarios", "PLANNING_NOT_PRESENT", 404)
    envelope = {"schema": PLANNING_SCHEMA, "portfolioId": portfolio["id"],
                "revision": portfolio["revision"], "snapshot": portfolio["snapshot"],
                "planningRevision": model["revision"]}
    return portfolio, model, envelope


def read_planning(workspace, route, query):
    if route == "schema":
        shape(query, ())
        return planning_schema()
    if route == "record":
        _, model, envelope = selection(workspace, query, ("collection", "id"))
        name, ident = query.get("collection"), identifier(query.get("id"))
        require(name in COLLECTIONS, "Select scenarios or lines")
        row = indexes(model)[name].get(ident)
        require(row is not None, "The budget record was not found", "NOT_FOUND", 404)
        return {**envelope, "collection": name, "record": row}
    if route == "history":
        portfolio, _, envelope = selection(workspace, query, ("collection", "id"))
        name, ident = query.get("collection"), identifier(query.get("id"))
        require(name in COLLECTIONS, "Select scenarios or lines")
        history, previous_hash = [], None
        for version in range(1, portfolio["revision"] + 1):
            earlier = workspace.portfolio(portfolio["id"], version)
            model = earlier["definition"].get("planning")
            row = indexes(model)[name].get(ident) if model else None
            if row and row["sha256"] != previous_hash:
                history.append({"portfolioRevision": version, "snapshot": earlier["snapshot"],
                                "operationId": earlier["operationId"], "record": row})
                previous_hash = row["sha256"]
        require(history, "The budget record was not found", "NOT_FOUND", 404)
        return {**envelope, "collection": name, "id": ident, "history": history}
    if route in {"summary", "report"}:
        portfolio, model, envelope = selection(workspace, query,
            ("scenarioId", "compareScenarioId", "granularity", *(("format",) if route == "report" else ())))
        scenario_id = identifier(query.get("scenarioId"))
        _, entities, _ = workspace._selected(portfolio["sources"])
        result, lines = summary(model, portfolio["definition"]["programme"], entities, scenario_id,
                                compare_id=query.get("compareScenarioId") or None,
                                granularity=query.get("granularity", "month"))
        output = {**envelope, "scenario": scenario_ref(result["scenario"]), "summary": result}
        if route == "report":
            output["lines"] = lines
            output["portfolioName"] = portfolio["name"]
            output["requirement"] = planning_schema()["requirement"]
            output["clearanceRole"] = "Finance TL"
        return output
    require(False, "The budget resource was not found", "NOT_FOUND", 404)


def csv_report(report):
    columns = ("record_type", "scenario_id", "portfolio_revision", "period", "currency",
               "line_code", "title", "direction", "classification", "amount", "cash_date",
               "commitment_reference", "node_id", "grant_id", "milestone_id",
               "inflow_known", "inflow_missing", "outflow_known", "outflow_missing",
               "net_known", "complete", "unallocated_annual_count", "opening", "closing_known", "document_ids",
               "source_refs", "notes", "record_json")
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=columns, lineterminator="\r\n", quoting=csv.QUOTE_ALL)
    writer.writeheader()
    def emit(kind, row, **fields):
        writer.writerow({"record_type": kind, "scenario_id": report["scenario"]["id"],
                         "portfolio_revision": report["revision"], **fields,
                         "record_json": json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))})
    selected = report["summary"]
    emit("scenario", selected["scenario"], title=selected["scenario"]["title"],
         notes=selected["scenario"]["notes"])
    for name, kind in (("rows", "budget_period"), ("cashRows", "cash_period")):
        for row in selected[name]:
            emit(kind, row, period=row["period"], currency=row["currency"],
                 inflow_known=row["inflow"]["known"], inflow_missing=row["inflow"]["missing"],
                 outflow_known=row["outflow"]["known"], outflow_missing=row["outflow"]["missing"],
                 net_known=row["netKnown"], complete="true" if row["complete"] else "false",
                 opening=row.get("opening"), closing_known=row.get("closingKnown"),
                 unallocated_annual_count=row.get("unallocatedAnnualCount", 0))
    for row in report["lines"]:
        emit("budget_line", row, period=row["period"], currency=row["currency"], line_code=row["code"],
             title=row["title"], direction=row["direction"], classification=row["classification"],
             amount=row["amount"], cash_date=row["cashDate"], commitment_reference=row["commitmentReference"],
             node_id=row["nodeId"], grant_id=row["grantId"], milestone_id=row["milestoneId"],
             document_ids=json.dumps(row["documentIds"]), source_refs=json.dumps(row["sourceRefs"]),
             notes=row["notes"])
    for row in selected["workplan"]:
        emit("workplan", row, period=row["dueDate"], title=row["title"], node_id=row["nodeId"],
             grant_id=row.get("grantId"), milestone_id=row["id"], notes=row.get("description", ""))
    if selected["comparison"]:
        emit("comparison_scenario", selected["comparison"]["scenario"])
        for name in ("rows", "cashRows"):
            for row in selected["comparison"][name]:
                emit("comparison_" + name, row, period=row["period"], currency=row["currency"],
                     net_known=row["netKnownDifference"], complete="true" if row["complete"] else "false")
    for warning in selected["warnings"]:
        emit("warning", warning)
    return output.getvalue().encode("utf-8")


def html_report(report):
    selected, scenario = report["summary"], report["summary"]["scenario"]
    def text(value):
        return escape("Missing" if value is None else str(value), quote=True)
    def table(headers, rows):
        return "<div class=\"table\"><table><thead><tr>" + "".join("<th>" + text(h) + "</th>" for h in headers) + \
               "</tr></thead><tbody>" + "".join("<tr>" + "".join("<td>" + text(c) + "</td>" for c in row) +
               "</tr>" for row in rows) + "</tbody></table></div>"
    blocks = ["<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" "
              "content=\"width=device-width,initial-scale=1\"><title>" + text(scenario["title"]) + "</title>",
              "<style>body{font:15px/1.5 system-ui,sans-serif;color:#202020;background:#fff;margin:32px;"
              "max-width:1400px}h1{font-size:26px}h2{font-size:19px;margin-top:32px}"
              ".table{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;"
              "padding:8px;text-align:left;vertical-align:top}th{background:#eee}p,td{overflow-wrap:anywhere}"
              ".meta{font-size:13px;color:#444}pre{white-space:pre-wrap}"
              "@media print{body{margin:12mm;font-size:10pt}thead{display:table-header-group}}"
              "</style><h1>" + text(scenario["title"]) + "</h1>",
              "<p>" + text(report["portfolioName"]) + " · " + text(scenario["startMonth"]) + " through " +
              text(scenario["endMonth"]) + " · " + text(selected["granularity"]) + " periods</p>",
              "<p>" + text(scenario["description"]) + "</p>",
              "<p>Owner: " + text(scenario["owner"]) + ". Finance TL clearance: " +
              text(scenario["reviewStatus"]) + ". Reviewer: " + text(scenario["reviewer"] or "Unrecorded") +
              ". " + text(scenario["reviewNote"]) + "</p>",
              "<p class=\"meta\">Portfolio revision " + text(report["revision"]) + "; planning revision " +
              text(report["planningRevision"]) + "; scenario revision " + text(scenario["revision"]) +
              ". Snapshot: " + text(report["snapshot"]) + "</p>",
              "<p>Amounts retain separate currencies. Known totals exclude missing amounts. Budget periods "
               "and cash dates are entered independently. Year-only budgets retain their annual total and remain "
              "unallocated in monthly views. Cash balances need an opening balance and dated, "
              "complete amounts. Missing values and undated cash remain visible.</p>"]
    for key, heading in (("rows", "Multi-year budget and annual workplan totals"), ("cashRows", "Dated cash forecast")):
        headers = ["Period", "Currency", "Inflow", "Outflow", "Net known", "Missing amounts", "Unallocated annual lines", "Complete"]
        if key == "cashRows":
            headers += ["Opening", "Closing known"]
        rows = []
        for row in selected[key]:
            values = [row["period"], row["currency"], row["inflow"]["known"], row["outflow"]["known"],
                      row["netKnown"], row["inflow"]["missing"] + row["outflow"]["missing"],
                      row.get("unallocatedAnnualCount", 0), "Yes" if row["complete"] else "No"]
            if key == "cashRows":
                values += [row["opening"], row["closingKnown"]]
            rows.append(values)
        blocks += ["<h2>" + heading + "</h2>", table(headers, rows)]
    blocks += ["<h2>Budget lines</h2>", table(
        ["Code", "Title", "Period", "Direction", "Currency", "Amount", "Classification", "Cash date", "Commitment"],
        [[row[key] for key in ("code", "title", "period", "direction", "currency", "amount",
                               "classification", "cashDate", "commitmentReference")] for row in report["lines"]]),
        "<p>Undated cash lines: " + text(len(selected["undatedCashRows"])) + ". Missing amounts: " +
        text(len(selected["missingAmounts"])) + ". Annual lines without a monthly allocation: " +
        text(len(selected["unallocatedBudgetRows"])) + ".</p>",
        "<h2>Workplan milestones</h2>", table(["Code", "Milestone", "Owner", "Start", "Due", "Status", "Description"],
        [[row.get(key) for key in ("code", "title", "owner", "startDate", "dueDate", "status", "description")]
         for row in selected["workplan"]])]
    if selected["comparison"]:
        blocks += ["<h2>Scenario comparison: " + text(selected["comparison"]["scenario"]["title"]) + "</h2>",
                   "<p>Differences are the selected scenario less the comparison scenario.</p>"]
        for name, heading in (("rows", "Budget comparison"), ("cashRows", "Cash comparison")):
            blocks += ["<h3>" + heading + "</h3>", table(["Period", "Currency", "Net known difference", "Complete"],
                [[row["period"], row["currency"], row["netKnownDifference"], "Yes" if row["complete"] else "No"]
                 for row in selected["comparison"][name]])]
    blocks += ["<h2>Source and document references</h2>",
               table(["Record", "Source references", "Document IDs", "Notes"],
               [[row.get("code", row["id"]), json.dumps(row["sourceRefs"], ensure_ascii=False),
                 ", ".join(row["documentIds"]), row["notes"]] for row in [scenario, *report["lines"]]])]
    if selected["warnings"]:
        blocks += ["<h2>Changed source references</h2>",
                   "<pre>" + text(json.dumps(selected["warnings"], ensure_ascii=False, indent=2)) + "</pre>"]
    return ("".join(blocks) + "</html>\n").encode("utf-8")


def planning_report(workspace, query):
    selected_format = query.get("format", "json")
    require(selected_format in {"json", "csv", "html"}, "Select JSON, CSV, or HTML")
    report = read_planning(workspace, "report", query)
    body = canonical(report) if selected_format == "json" else \
           csv_report(report) if selected_format == "csv" else html_report(report)
    media_type = {"json": "application/json", "csv": "text/csv", "html": "text/html"}[selected_format]
    return body, media_type + "; charset=utf-8", "budget-" + report["scenario"]["id"] + \
           "-r" + str(report["revision"]) + "." + selected_format
