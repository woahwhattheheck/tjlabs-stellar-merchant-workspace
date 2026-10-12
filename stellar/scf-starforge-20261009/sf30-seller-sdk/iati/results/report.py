"""MIT. Complete readable results report, exact CSVs and source-bound interpretation."""
from __future__ import annotations

import csv
from html import escape
import io
import json

from iati_source import canonical
from workspace import json_bytes
from .model import CONTRACT

STYLE = """
@page{size:A4;margin:17mm 14mm}
*{box-sizing:border-box}html{color:#202326;background:#fff;font-family:Arial,Helvetica,sans-serif}
body{max-width:1200px;margin:0 auto;padding:28px;font-size:14px;line-height:1.48}
h1{font-size:28px;line-height:1.18;margin:8px 0 10px}h2{font-size:20px;margin:32px 0 12px;border-bottom:1px solid #777;padding-bottom:7px}
h3{font-size:16px;margin:24px 0 8px}h1,h2,h3{break-after:avoid}
p{margin:9px 0}.muted{color:#535960}.identity{font-family:monospace;font-size:12px;overflow-wrap:anywhere}
.notice{padding:12px 14px;border:1px solid #9ca2a8;background:#f5f6f7}.metrics{display:flex;flex-wrap:wrap;gap:10px}
.metric{border:1px solid #bcc1c6;padding:12px 16px;min-width:125px}.metric strong{display:block;font-size:23px;font-weight:600}
table{border-collapse:collapse;width:100%;font-size:12px;margin:10px 0 18px;table-layout:fixed}
th,td{vertical-align:top;border:1px solid #bac0c5;padding:7px;overflow-wrap:anywhere;text-align:left}
th{background:#edeff1;font-weight:600}thead{display:table-header-group}tr{break-inside:avoid}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.45}
dt{font-weight:bold;margin-top:7px}dd{margin:2px 0 8px;overflow-wrap:anywhere}details{margin:8px 0}
small{font-size:12px}.page-note{border-top:1px solid #a2a7ac;margin-top:28px;padding-top:12px}
a{color:inherit;text-underline-offset:3px}@media print{body{padding:0;font-size:10pt}.metric strong{font-size:16pt}
h1{font-size:22pt}h2{font-size:16pt}h3{font-size:12pt}table{font-size:8pt}.notice{background:#fff}details>*{display:block}}
"""


def display(value):
    if value is None:
        return "Not supplied"
    if type(value) is bool:
        return "true" if value else "false"
    return canonical(value) if isinstance(value, (dict, list)) else str(value)


def h(value):
    return escape(display(value), quote=True)


def table(columns, rows):
    output = ["<table><thead><tr>"] + ["<th>" + h(label) + "</th>" for _, label in columns]
    output.append("</tr></thead><tbody>")
    for row in rows:
        output.append("<tr>" + "".join("<td>" + h(row.get(key)) + "</td>" for key, _ in columns) + "</tr>")
    if not rows:
        output.append('<tr><td colspan="' + str(len(columns)) + '">No original records in this selection.</td></tr>')
    output.append("</tbody></table>")
    return "".join(output)


def properties(value):
    return "<dl>" + "".join("<dt>" + h(k) + "</dt><dd>" + h(v) + "</dd>" for k, v in value.items()) + "</dl>"


def csv_file(columns, rows):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\r\n")
    writer.writerow(columns)
    for row in rows:
        writer.writerow("" if row.get(key) is None else
                        canonical(row[key]) if isinstance(row[key], (dict, list)) else
                        "true" if row[key] is True else "false" if row[key] is False else row[key]
                        for key in columns)
    return stream.getvalue().encode("utf-8")


def tables(report):
    indicators, periods, observations, comparisons = [], [], [], []
    for item in report["indicators"]:
        indicators.append({"indicator_key": item["key"], "source_sha256": item["source"],
            "source_locator": item["locator"], "activity_id": item["activityId"],
            "reporting_org_ref": item["reportingOrgRef"], "result_key": item["resultKey"],
            "result_type": item["resultType"], "result_title": item["resultTitle"],
            "title": item["title"], "titles_json": item["titles"],
            "descriptions_json": item["descriptions"], "measure": item["measure"],
            "measure_label": item["measureLabel"], "ascending": item["ascending"],
            "aggregation_status": item["aggregationStatus"], "attributes_json": item["attributes"],
            "references_json": item["references"], "documents_json": item["documents"],
            "original_content_sha256": item["contentSha256"], "findings_json": item["findings"]})
        original_values = list(item["baselines"])
        for period in item["periods"]:
            periods.append({"period_key": period["key"], "indicator_key": item["key"],
                "source_sha256": item["source"], "source_locator": period["locator"],
                "start_original": period["startOriginal"], "end_original": period["endOriginal"],
                "start_calendar_day": period["start"], "end_calendar_day": period["end"],
                "calendar_comparable": period["calendarComparable"],
                "start_elements_json": period["startElements"], "end_elements_json": period["endElements"],
                "candidate_pairs_json": period["candidatePairs"], "findings_json": period["findings"]})
            original_values.extend(period["targets"] + period["actuals"])
        for value in original_values:
            observations.append({"value_key": value["key"], "indicator_key": item["key"],
                "period_key": value["periodKey"], "source_sha256": value["source"],
                "source_locator": value["locator"], "activity_id": item["activityId"],
                "kind": value["kind"], "measure": value["measure"],
                "raw_value_present": value["rawValue"] is not None, "raw_value": value["rawValue"],
                "arithmetic_decimal": value["decimal"], "year_original": value["year"],
                "date_original": value["isoDate"], "calendar_day": value["dateDay"],
                "context_key": value["contextKey"], "context_comparable": value["contextComparable"],
                "dimensions_json": value["dimensions"], "locations_json": value["locations"],
                "comments_json": value["comments"], "documents_json": value["documents"],
                "attributes_json": value["attributes"], "original_record_json": value["original"],
                "original_record_sha256": value["originalSha256"], "findings_json": value["findings"]})
    for value in report["comparisons"]:
        calculation = value["calculation"] or {}
        comparisons.append({"indicator_key": value["indicatorKey"], "period_key": value["periodKey"],
            "target_key": value["target"]["key"], "actual_key": value["actual"]["key"],
            "baseline_key": value["baseline"]["key"] if value["baseline"] else None,
            "operation": value["binding"]["operation"], "status": value["status"],
            "source_interpretation": value["interpretation"]["note"], "pair_basis": value["binding"]["note"],
            "unit_label": value["interpretation"]["unitLabel"], "direction": value["effectiveDirection"],
            "measure": value["measure"], "actual_minus_target": calculation.get("actualMinusTarget"),
            "difference_meaning": calculation.get("differenceMeaning"),
            "actual_minus_baseline": calculation.get("actualMinusBaseline"),
            "ratio_percent": calculation.get("ratioPercent"), "ratio_formula": calculation.get("ratioFormula"),
            "ratio_decimal_places": calculation.get("roundingDecimalPlaces"),
            "selected_target_relation": calculation.get("directionalTargetRelation"),
            "reasons_json": value["reasons"]})
    return {"activities": [{"activity_key": a["key"], "source_sha256": a["source"], "source_locator": a["locator"],
            "activity_id": a["activityId"], "reporting_org_ref": a["reportingOrgRef"], "title": a["title"],
            "titles_json": a["titles"], "descriptions_json": a["descriptions"], "attributes_json": a["attributes"],
            "locations_json": a["locations"], "reporting_organisations_json": a["reportingOrganisations"],
            "documents_json": a["documents"], "result_keys_json": a["resultKeys"]} for a in report["activities"]],
        "results": [{"result_key": r["key"], "source_sha256": r["source"], "source_locator": r["locator"],
            "activity_key": r["activityKey"], "activity_id": r["activityId"], "reporting_org_ref": r["reportingOrgRef"],
            "result_type": r["resultType"], "aggregation_status": r["aggregationStatus"], "attributes_json": r["attributes"],
            "title": r["title"], "titles_json": r["titles"], "descriptions_json": r["descriptions"],
            "references_json": r["references"], "documents_json": r["documents"],
            "indicator_keys_json": r["indicatorKeys"], "selected_indicator_keys_json": r["selectedIndicatorKeys"]} for r in report["results"]],
        "indicators": indicators, "periods": periods, "values": observations,
            "comparisons": comparisons, "findings": report["findings"]}


COLUMNS = {
    "activities": ["activity_key", "source_sha256", "source_locator", "activity_id", "reporting_org_ref", "title",
        "titles_json", "descriptions_json", "attributes_json", "locations_json", "reporting_organisations_json", "documents_json", "result_keys_json"],
    "results": ["result_key", "source_sha256", "source_locator", "activity_key", "activity_id", "reporting_org_ref",
        "result_type", "aggregation_status", "attributes_json", "title", "titles_json", "descriptions_json",
        "references_json", "documents_json", "indicator_keys_json", "selected_indicator_keys_json"],
    "indicators": ["indicator_key", "source_sha256", "source_locator", "activity_id", "reporting_org_ref",
        "result_key", "result_type", "result_title", "title", "titles_json", "descriptions_json",
        "measure", "measure_label", "ascending", "aggregation_status", "attributes_json",
        "references_json", "documents_json", "original_content_sha256", "findings_json"],
    "periods": ["period_key", "indicator_key", "source_sha256", "source_locator", "start_original", "end_original",
        "start_calendar_day", "end_calendar_day", "calendar_comparable", "start_elements_json",
        "end_elements_json", "candidate_pairs_json", "findings_json"],
    "values": ["value_key", "indicator_key", "period_key", "source_sha256", "source_locator", "activity_id",
        "kind", "measure", "raw_value_present", "raw_value", "arithmetic_decimal", "year_original",
        "date_original", "calendar_day", "context_key", "context_comparable", "dimensions_json",
        "locations_json", "comments_json", "documents_json", "attributes_json", "original_record_json",
        "original_record_sha256", "findings_json"],
    "comparisons": ["indicator_key", "period_key", "target_key", "actual_key", "baseline_key", "operation",
        "status", "source_interpretation", "pair_basis", "unit_label", "direction", "measure",
        "actual_minus_target", "difference_meaning", "actual_minus_baseline", "ratio_percent",
        "ratio_formula", "ratio_decimal_places", "selected_target_relation", "reasons_json"],
    "findings": ["source", "locator", "code", "severity", "message"],
}


def narrative_text(values):
    return "\n".join((v.get("language") or "language not supplied") + ": " + v.get("text", "") for v in values)


def html_report(edition, report, saved_comparisons=()):
    definition = edition["definition"]
    out = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
           "<title>" + h(definition["name"]) + " · IATI results</title><style>" + STYLE + "</style><body>",
           '<p class="muted">IATI 2.03 · retained results review</p><h1>' + h(definition["name"]) + "</h1>",
           "<p>" + h(definition["notes"]) + "</p>",
           '<div class="notice"><strong>' + h(definition["review"]["status"]) + "</strong> · revision " +
           h(edition["revision"]) + "<br>Named review records the operator's selected interpretation. "
           "Publisher values, source-validation findings and the selected arithmetic remain separate.</div>",
           '<p class="identity">Project ' + h(edition["id"]) + "<br>Edition " + h(edition["sha256"]) +
           "<br>Report " + h(report["reportSha256"]) + "</p>",
           properties({"Saved at": edition["savedAt"], "Reviewer": definition["review"]["reviewer"],
                       "Review note": definition["review"]["note"]}), '<div class="metrics">']
    for key, value in report["counts"].items():
        out.append('<div class="metric"><strong>' + h(value) + "</strong>" + h(key) + "</div>")
    out.extend(["</div><h2>Original publisher coverage</h2>",
        table([("name", "Original file"), ("source", "Source SHA256"), ("bytes", "Bytes"),
               ("counts", "Full source counts"), ("projection", "Projection identity")],
              [{"name": v["source"]["name"], "source": v["source"]["id"], "bytes": v["source"]["bytes"],
                "counts": v["sourceCounts"], "projection": v["projectionSha256"]} for v in report["coverage"]]),
        "<h2>Selection and meaning</h2>", properties(report["selection"]),
        "<p>" + h(report["aggregation"]) + "</p>",
        "<p>Each numeric comparison below binds the exact original target, actual and optional baseline. "
        "Source-code observations and qualitative narratives remain in the records and complete CSVs. "
        "A candidate pair is an available context match; it is not a selected performance conclusion.</p>"])
    meanings = {v["indicatorKey"]: v for v in report["interpretations"]}
    compared = {}
    for value in report["comparisons"]:
        compared.setdefault(value["indicatorKey"], []).append(value)
    out.append("<h2>Activity and result context</h2>")
    for activity in report["activities"]:
        out.append("<h3>" + h(activity["title"] or activity["activityId"] or "Unidentified original activity") + "</h3>")
        out.append(properties({"Activity": activity["activityId"], "Reporting organisation": activity["reportingOrgRef"],
            "Original titles": activity["titles"], "Original descriptions": activity["descriptions"],
            "Original location definitions": activity["locations"], "Original document links": activity["documents"]}))
        for parent in (r for r in report["results"] if r["activityKey"] == activity["key"]):
            out.append("<h4>" + h(parent["title"] or "Untitled original result") + "</h4>")
            out.append(properties({"Original result type": parent["resultType"],
                "Original result aggregation status": parent["aggregationStatus"],
                "Original titles": parent["titles"], "Original descriptions": parent["descriptions"],
                "References": parent["references"], "Document links": parent["documents"],
                "Selected indicator keys": parent["selectedIndicatorKeys"]}))
    out.append("<h2>Indicator records and selected comparisons</h2>")
    for number, item in enumerate(report["indicators"], 1):
        out.extend(["<section><h3>" + h(number) + ". " + h(item["title"] or "Untitled original indicator") + "</h3>",
            "<p>" + h(item["resultTitle"]) + "</p>",
            properties({"Activity": item["activityId"], "Reporting organisation": item["reportingOrgRef"],
                "Measure": item["measureLabel"] + " (" + item["measure"] + ")",
                "Original ascending": item["ascending"], "Original aggregation status": item["aggregationStatus"]}),
            '<p class="identity">' + h(item["source"]) + "<br>" + h(item["locator"]) + "<br>" + h(item["key"]) + "</p>"])
        if item["descriptions"]:
            out.append("<p>" + h(narrative_text(item["descriptions"])).replace("\n", "<br>") + "</p>")
        if item["key"] in meanings:
            out.append("<h4>Selected interpretation</h4>" + properties(meanings[item["key"]]))
        if item["baselines"]:
            out.append("<h4>Original baselines</h4>")
            out.append(table([("year", "Year"), ("isoDate", "Reported date"), ("rawValue", "Original value"),
                ("dimensions", "Dimensions"), ("locations", "Locations"), ("comments", "Comments")], item["baselines"]))
        for period in item["periods"]:
            out.append("<h4>Period " + h(period["startOriginal"] or "unplaced start") + " — " +
                       h(period["endOriginal"] or "unplaced end") + "</h4>")
            out.append(table([("kind", "Kind"), ("rawValue", "Original value"), ("dimensions", "Dimensions"),
                ("locations", "Locations"), ("comments", "Original comments")], period["targets"] + period["actuals"]))
            if not period["targets"] and not period["actuals"]:
                out.append("<p>The original period contains no target or actual observation.</p>")
        for value in compared.get(item["key"], []):
            out.append('<div class="notice"><strong>' + h(value["status"]) + "</strong>" +
                       properties({"Operation": value["binding"]["operation"], "Basis": value["binding"]["note"],
                       "Target key": value["target"]["key"], "Actual key": value["actual"]["key"],
                       "Baseline key": value["baseline"]["key"] if value["baseline"] else None,
                       "Effective direction": value["effectiveDirection"]}))
            out.append(properties(value["calculation"]) if value["calculation"] else
                       "<p>" + h("; ".join(value["reasons"]) or "Original observations retained for inspection.") + "</p>")
            out.append("</div>")
        out.append("</section>")
    if not report["indicators"]:
        out.append("<p>The complete selected original publisher source set contains no matching indicator records. "
                   "The source coverage and original XML remain part of the portable project.</p>")
    out.extend(["<h2>Retained source findings</h2>",
        table([("source", "Source"), ("locator", "Original locator"), ("code", "Finding"), ("message", "Meaning")],
              report["findings"])])
    if saved_comparisons:
        out.append("<h2>Following-source and revision comparisons</h2>")
        for value in saved_comparisons:
            out.append("<h3>Revision " + h(value["beforeRevision"]) + " → " + h(value["afterRevision"]) + "</h3>")
            out.append(properties({"Comparison": value["id"],
                "Before edition": value["beforeEditionSha256"], "After edition": value["afterEditionSha256"],
                "Selection changed": value["comparison"]["selectionChanged"],
                "Interpretation changed": value["comparison"]["interpretationChanged"],
                "Removed indicators": value["comparison"]["removedIndicators"],
                "Added indicators": value["comparison"]["addedIndicators"]}))
            out.append(table([("before", "Before key"), ("after", "After key"), ("note", "Explicit source mapping"),
                ("changedFields", "Changed metadata"), ("originalValuesChanged", "Complete original values changed"),
                ("selectedValuesChanged", "Selected values/coverage changed"),
                ("activityIdentityChanged", "Activity identity changed")], value["comparison"]["pairs"]))
    out.extend(['<div class="page-note"><h2>Files and reproducibility</h2>',
        "<p>The CSVs contain every selected record, including unplaced dates and source findings. "
        "JSON columns retain arrays and repeated records. An absent raw value is distinguished by raw_value_present; "
        "CSV cells are original data strings, without spreadsheet formula conversion. report.json and edition.json retain "
        "the complete selected review and exact arithmetic. The full receiving archive additionally includes the original "
        "publisher XML, all saved revisions, explicit comparisons and original receiving provenance.</p>",
        properties(CONTRACT), "</div></body></html>"])
    return "".join(out).encode("utf-8")


def report_files(edition, report, saved_comparisons=()):
    flat = tables(report)
    files = {
        "report.html": html_report(edition, report, saved_comparisons),
        "report.json": json_bytes(report),
        "edition.json": json_bytes(edition),
        "analysis-contract.json": json_bytes(CONTRACT),
        "revision-comparisons.json": json_bytes(list(saved_comparisons)),
    }
    for name, rows in flat.items():
        files[name + ".csv"] = csv_file(COLUMNS[name], rows)
    files["README.txt"] = (
        "IATI results review\n\n"
        "Open report.html for the complete printable report. The editable receiving archive "
        "uses the existing IATI workspace and source reader; it does not replay financial, "
        "provider or publication operations. The original source XML is authoritative.\n\n"
        "Values are preserved as strings. Every comparison names its original source-bound "
        "keys and explicit interpretation. Decimal differences are exact; percentage ratios "
        "are rounded to 12 decimal places. Percentage differences are percentage points. "
        "Nominal, ordinal and qualitative observations are retained without arithmetic totals.\n\n"
        "A named reviewed status is the recorded operator review, not independent assurance "
        "of publisher accuracy or programme impact. Source and interpretation changes remain "
        "separate in the complete revision comparison.\n"
    ).encode("utf-8")
    return files
