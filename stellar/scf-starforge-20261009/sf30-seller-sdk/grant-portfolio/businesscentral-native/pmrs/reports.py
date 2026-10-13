"""Complete, source-linked HTML and exact-text CSV delivery views."""
import csv
import html
import io
from .canonical import encode, now
from .errors import PMRSError, require

TOTAL_COLUMNS = ("group_key", "grant_key", "grant_label", "project_id", "project_number",
                 "currency_basis", "currency", "metric", "status", "native_total", "total",
                 "native_partial_total", "partial_total", "contributing_rows", "missing_rows",
                 "source_family", "source_field")
def totals_rows(body):
    for group in body["summary"]["totals"]:
        for name, metric in group["metrics"].items():
            yield {"group_key": group["key"], **{k: group[k] for k in (
                "grant_key", "grant_label", "project_id", "project_number", "currency_basis", "currency")},
                "metric": name, **{k: metric[k] for k in (
                    "status", "native_total", "total", "native_partial_total", "partial_total", "contributing_rows", "missing_rows")},
                "source_family": metric["definition"]["family"], "source_field": metric["definition"]["native_field"]}
def totals_csv(body):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=TOTAL_COLUMNS, lineterminator="\r\n", extrasaction="raise")
    writer.writeheader()
    for row in totals_rows(body): writer.writerow(row)
    return output.getvalue().encode("utf-8")
def dictionary():
    return {"schema": "commons.pmrs-report-columns.v1", "encoding": "UTF-8 CSV",
            "columns": {name: {"type": "integer" if name in {"contributing_rows", "missing_rows"}
                else "exact_decimal_text_or_empty" if "total" in name else "string"} for name in TOTAL_COLUMNS},
            "decimal_note": "Import totals as text or arbitrary-precision decimals. Empty complete total is not zero.",
            "financial_views": "Metric/currency-basis groups are separate. Budget and billable are overlapping views; posted and G/L are linked, never added.",
            "source_values": "Full native provider rows and original amounts remain in the source objects and audit JSONL."}
def _esc(value):
    return html.escape("" if value is None else str(value), quote=True)
def report_html(record):
    body, kind = record["body"], record["kind"]
    title = body.get("label", "PMRS finance handover")
    sections = ['<h1>' + _esc(title) + '</h1>',
                '<p class="subtitle">Project and grant finance · retained source and reviewed native delivery</p>',
                '<dl><dt>Record</dt><dd>' + _esc(record["id"]) + '</dd><dt>Kind</dt><dd>' + _esc(kind) +
                '</dd><dt>Created</dt><dd>' + _esc(body.get("created_at")) + '</dd></dl>']
    if kind == "reconciliation":
        summary = body["summary"]
        sections.append('<h2>Review status</h2><p class="' + ("good" if summary["ready"] else "hold") + '">' +
                        ("Ready for target review" if summary["ready"] else "Source or allocation findings require correction") + '</p>')
        sections.append('<p>Period: ' + _esc(summary["period"]["from"]) + ' through ' + _esc(summary["period"]["to"]) +
                        ', inclusive native planning/posting dates. Source capture: ' + _esc(body["source_id"]) + '</p>')
        sections.append('<p>Amounts retain native signs. Any selected presentation multiplier is recorded in the mapping and every contributing row. LCY and original project-currency views remain separate.</p>')
        sections.append('<h2>Financial totals</h2><div class="table"><table><thead><tr>' +
            ''.join('<th>' + _esc(c) + '</th>' for c in ("Project", "Grant", "Basis", "Currency", "Metric", "Native total", "Presented total", "Status", "Rows")) +
            '</tr></thead><tbody>')
        for row in totals_rows(body):
            sections.append('<tr>' + ''.join('<td>' + _esc(v) + '</td>' for v in (
                row["project_number"], row["grant_label"], row["currency_basis"], row["currency"],
                row["metric"], row["native_total"], row["total"], row["status"], row["contributing_rows"])) + '</tr>')
        sections.append('</tbody></table></div><h2>Findings</h2>')
        if not summary["findings"]: sections.append('<p>No blocking source or allocation findings.</p>')
        for finding in summary["findings"]:
            sections.append('<article><strong>' + _esc(finding["code"]) + '</strong><p>' + _esc(finding["message"]) +
                '</p><pre>' + _esc(encode({"row": finding["row"], "details": finding["details"]}).decode()) + '</pre></article>')
        sections.append('<h2>Source definitions</h2><p>Planning Budget/Both totalCost feeds budget cost; Billable/Both lineAmount feeds the billable view. Posted Usage totalCost and Sale lineAmount stay separate. The original fields, dimensions, currency context and page locators remain in rows.jsonl and the complete portable workspace.</p>')
    elif kind == "target-review":
        sections.append('<h2>Reviewed native changes</h2><p>Organization: ' + _esc(body["connection"]["organization_id"]) +
                        ' · Table: ' + _esc(body["entity"]["LogicalName"]) + '</p>')
        for row in body["rows"]:
            sections.append('<article><h3>' + _esc(row["mode"]) + ' · ' + _esc(row["record_id"]) +
                '</h3><p>' + _esc(row["disposition"]) + ' · exact request ' + _esc(row["payload_sha256"]) +
                '</p><pre>' + _esc(encode({"precondition": row["conditional_headers"], "before": row["before"],
                                        "payload": row["payload"], "columns": row["columns"]}).decode()) + '</pre></article>')
    elif kind == "delivery":
        sections.append('<h2>Native delivery results</h2><p>Original operation: ' + _esc(body["operation_id"]) +
            ' · Reviewed source: ' + _esc(body["review_id"]) + '</p>')
        for row in body["rows"]:
            sections.append('<article><h3>' + _esc(row["id"]) + ' · ' + _esc(row["state"]) +
                '</h3><pre>' + _esc(encode(row).decode()) + '</pre></article>')
        sections.append('<p>APPLIED has a retained native success response and matching readback. ACCEPTED_OBSERVATION records an explicit reviewer decision about matching observed values when native response attribution was unavailable.</p>')
    else:
        sections.append('<h2>Complete retained record</h2><pre>' + _esc(encode(body).decode()) + '</pre>')
    style = """body{font:16px/1.55 system-ui,sans-serif;color:#172638;max-width:1200px;margin:40px auto;padding:0 24px}h1{font-size:34px;line-height:1.15}h2{margin-top:36px;border-top:1px solid #dce5eb;padding-top:20px}.subtitle{color:#557082}dt{font-weight:650}dd{margin:0 0 12px;overflow-wrap:anywhere}.good{color:#13745a}.hold{color:#9b4e05}article{padding:16px;border:1px solid #dce5eb;border-radius:8px;margin:14px 0}.table{overflow:auto}table{border-collapse:collapse;width:100%}th,td{padding:10px;border-bottom:1px solid #dce5eb;text-align:left;vertical-align:top}th{background:#eff5f8}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;background:#f4f7f9;padding:14px}@media print{body{max-width:none;margin:0}.table{overflow:visible}th,td{font-size:10px;padding:4px}article{break-inside:avoid}}"""
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>' + _esc(title) + '</title><style>' + style + '</style><body>' + ''.join(sections) +
            '<footer><hr>PMRS integration · full source and immutable record identifiers accompany this report.</footer></body></html>').encode("utf-8")
