"""MIT. Complete, escaped document evidence reports from immutable selected rows."""
from __future__ import annotations
import csv
from html import escape
import io
from workspace import json_bytes

def _text(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json_bytes(value).decode().strip()
    return str(value)

def _cell(value):
    return "<td>" + escape(_text(value)) + "</td>"

def _table(headers, rows):
    return "<div class='scroll'><table><thead><tr>" + "".join("<th>" + escape(h) + "</th>" for h in headers) + "</tr></thead><tbody>" + "".join(
        "<tr>" + "".join(_cell(v) for v in row) + "</tr>" for row in rows) + "</tbody></table></div>"

def register_csv(plan, rows):
    output = io.StringIO(newline="")
    fields = ["evidence_id", "evidence_revision", "organisation_plan", "organisation_revision",
        "source_id", "document_row_id", "organisation_key", "title", "published_url",
        "format", "categories", "languages", "observation_id", "state", "outcome",
        "http_status", "observed_at", "body_bytes", "body_sha256", "http_body_complete",
        "document_complete", "content_encoding", "review_decision", "reviewer",
        "review_note", "review_observation_id", "corrected_url"]
    writer = csv.writer(output)
    writer.writerow(fields)
    for row in rows:
        o, d = row.get("latestObservationSummary") or {}, row.get("decision") or {}
        body = o.get("body") or {}
        writer.writerow([plan["id"], plan["revision"], plan["selection"]["id"], plan["selection"]["revision"],
            plan["selection"]["sourceId"], row["id"], row["organisationKey"], _text(row.get("titles")),
            row.get("url", ""), row.get("format", ""), _text(row.get("categories")), _text(row.get("languages")),
            o.get("id", ""), o.get("state", "NOT_OBSERVED"), o.get("outcome", ""), o.get("status", ""),
            o.get("finishedAt", ""), body.get("bytes", ""), body.get("sha256", ""),
            body.get("complete", ""), o.get("documentComplete", ""), body.get("contentEncoding", ""),
            d.get("decision", ""), (plan.get("review") or {}).get("actor", ""), d.get("note", ""),
            d.get("observationId") or "", d.get("correctedUrl", "")])
    return output.getvalue().encode("utf-8")

def report_html(plan, rows, observations):
    review = plan.get("review") or {}
    html = ["<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
        "<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">",
        "<title>" + escape(plan["name"]) + " — document evidence</title>",
        "<style>body{font:15px/1.55 system-ui,sans-serif;color:#172b35;background:#f5f7f8;margin:0}main{max-width:1180px;margin:auto;padding:40px 24px}h1{font-size:34px;line-height:1.12}h2{margin-top:36px}h3{margin-top:24px}p{max-width:90ch}.kicker{letter-spacing:.12em;text-transform:uppercase;color:#48616a;font-size:12px}.card{background:white;border:1px solid #d5dfe3;border-radius:10px;padding:22px;margin:20px 0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #dce3e7;padding:10px;overflow-wrap:anywhere}th{background:#ecf1f3}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}dt{font-weight:650}dd{margin:0 0 10px;overflow-wrap:anywhere}.muted{color:#526973}@media print{body{background:white}main{padding:0}.card{break-inside:avoid}table{font-size:10px}}</style><main>",
        "<p class='kicker'>IATI • Publisher document evidence</p><h1>" + escape(plan["name"]) + "</h1>",
        "<p>Evidence edition " + str(plan["revision"]) + " · " + escape(plan["updatedAt"]) + " · " + escape(plan["state"]) + "</p>",
        "<p>" + escape(plan["notes"]) + "</p>",
        "<section class='card'><h2>Scope and interpretation</h2>",
        "<p>This report covers the exact selected organisation document links and observations below. A successful HTTP response does not establish relevance, accuracy, authenticity, licence or accessibility to every reader. The named review records those judgments explicitly. No publisher XML is changed by an acquisition or an evidence review.</p>",
        "<p>Body hashes describe the retained HTTP message bytes after transfer framing, before Content-Encoding decompression. Prefixes, failed transfers and HTTP ranges remain incomplete document evidence. A later observation is a separate explicit acquisition; previous evidence remains retained.</p>",
        "<dl><dt>Organisation plan and revision</dt><dd>" + escape(plan["selection"]["id"]) + " / " + str(plan["selection"]["revision"]) + "</dd>",
        "<dt>Selected source view</dt><dd>" + escape(plan["selection"]["view"]) + "</dd>",
        "<dt>Original publisher source</dt><dd>" + escape(plan["selection"]["sourceId"]) + "</dd>",
        "<dt>Evidence edition identity</dt><dd>" + escape(plan["recordSha256"]) + "</dd></dl></section>",
        "<h2>Complete selected document register</h2>"]
    table_rows = []
    for row in rows:
        observed, decision = row.get("latestObservationSummary") or {}, row.get("decision") or {}
        body = observed.get("body") or {}
        table_rows.append([_text(row.get("titles")), row["organisationKey"], row.get("url"), row.get("format"),
            _text(row.get("categories")), _text(row.get("languages")), observed.get("state", "NOT_OBSERVED"),
            observed.get("status"), "Yes" if observed.get("documentComplete") else "No",
            body.get("bytes"), body.get("sha256"), decision.get("decision", "Not reviewed"),
            decision.get("note"), decision.get("correctedUrl")])
    html.append(_table(["Title", "Organisation", "Published URL", "Declared format", "Categories", "Languages",
        "Latest observation", "HTTP status", "Full document response", "Bytes", "Body SHA256",
        "Named decision", "Review note", "Proposed URL"], table_rows))
    html.extend(["<section class='card'><h2>Named review</h2><p>" +
        ("Reviewer: " + escape(review["actor"]) + " · " + escape(review["at"]) if review else "No review has been recorded for this evidence edition.") + "</p><p>" +
        escape(review.get("note", "")) + "</p></section>", "<h2>Complete acquisition history</h2>"])
    for observed in observations:
        receipt = observed.get("fetch") or {}
        body = observed.get("body") or {}
        html.append("<section class='card'><h3>" + escape(observed["publishedUrl"]) + "</h3>")
        html.append(_table(["Observation", "Started", "Finished", "State", "Outcome", "HTTP status", "Body bytes",
            "Complete HTTP body", "Complete document", "Content-Encoding"],
            [[observed["id"], observed["startedAt"], observed["finishedAt"], observed["state"], observed["outcome"],
              receipt.get("status"), body.get("bytes"), body.get("complete"), observed["documentComplete"], body.get("contentEncoding")]]))
        if observed.get("interruption"):
            html.append("<p>" + escape(_text(observed["interruption"])) + "</p>")
        if receipt.get("error"):
            html.append("<p>" + escape(_text(receipt["error"])) + "</p>")
        for number, hop in enumerate(receipt.get("hops", []), 1):
            html.append("<h4>Observed HTTP hop " + str(number) + "</h4><pre>" + escape(_text(hop)) + "</pre>")
        html.append("</section>")
    html.extend(["<h2>Exact evidence and review record</h2><details><summary>Complete machine-readable plan</summary><pre>" +
        escape(_text(plan)) + "</pre></details>", "<p class='muted'>The portable packet retains original source, immutable revisions, full request identities, all declared response bodies and this installed operator source. No executable or active publisher document is embedded in this HTML report.</p></main></html>"])
    return "".join(html).encode("utf-8")
