"""Readable customer report and source-bound visitor handover files."""
import csv
import html
import io
import json


def report(capture, embedded=False):
    visitor = capture["visitor"]
    esc = lambda x: html.escape(str(x), quote=True)
    body = []
    for edition in visitor["editions"]:
        result = edition["result"]
        reviews = [r for r in visitor["reviews"] if r["edition_id"] == edition["id"]]
        latest = reviews[-1] if reviews else None
        body.append("<section><h2>" + esc(edition["label"]) + "</h2><dl>" +
                    "<dt>Site</dt><dd>" + esc(edition["project"]["value"]["base_url"]) + "</dd>" +
                    "<dt>Journey definition</dt><dd>" + esc(edition["set_id"]) + " · revision " + str(edition["set_revision"]) + "</dd>" +
                    "<dt>Captured edition</dt><dd><code>" + esc(edition["id"]) + "</code></dd>" +
                    "<dt>Source</dt><dd>" + esc(edition["source_mode"]) + " · " + esc(edition["created_at"]) + "</dd>" +
                    "<dt>Review</dt><dd>" + esc(latest["decision"] + " — " + latest["reason"] if latest else "Awaiting review") + "</dd></dl>")
        body.append("<p>" + esc(str(result["journey_count"]) + " journeys · " + str(result["page_count"]) +
                    " original pages · " + str(result["check_count"]) + " expected outcomes") + "</p>")
        for journey in result["journeys"]:
            body.append("<article><h3>" + esc(journey["name"]) + " <span>" + esc(journey["status"]) + "</span></h3><p>" + esc(journey["goal"]) + "</p>")
            for step in journey["steps"]:
                body.append("<h4>" + esc(step["label"]) + " · " + esc(step["status"]) + "</h4><p class=\"url\">" + esc(step["url"]) + "</p>")
                if step.get("error"):
                    body.append("<p>" + esc(step["error"]["message"]) + "</p>")
                body.append("<table><thead><tr><th>Expected outcome</th><th>Original result</th><th>Status</th></tr></thead><tbody>")
                for check in step["checks"]:
                    wanted = json.dumps(check["expected"], ensure_ascii=False) if not isinstance(check["expected"], str) else check["expected"]
                    actual = json.dumps(check["actual"], ensure_ascii=False)
                    body.append("<tr><td><strong>" + esc(check["kind"]) + "</strong><br>" + esc(wanted) +
                                "</td><td>" + esc(actual) + ("<br><small>" + esc(check["detail"]) + "</small>" if check.get("detail") else "") +
                                "</td><td>" + esc(check["status"]) + "</td></tr>")
                body.append("</tbody></table>")
            body.append("</article>")
        if reviews:
            body.append("<details><summary>Review history and accepted exceptions</summary><pre>" + esc(json.dumps(reviews, ensure_ascii=False, indent=2)) + "</pre></details>")
        body.append("<details><summary>Original page sources</summary><table><thead><tr><th>URL and observation</th><th>Source file</th><th>SHA-256</th></tr></thead><tbody>")
        for page in edition["pages"]:
            body.append("<tr><td>" + esc(page["url"]) + "<br>" + esc(page.get("observed_at", "")) + "</td><td>" +
                        esc(page.get("file_id", "Source acquisition failed")) + "</td><td><code>" + esc(page.get("sha256", "")) + "</code></td></tr>")
        body.append("</tbody></table></details></section>")
    if visitor["finding_history"]:
        body.append("<section><h2>Corrective work and history</h2><table><thead><tr><th>Work</th><th>Implementation</th><th>State</th></tr></thead><tbody>")
        for finding in visitor["finding_history"]:
            body.append("<tr><td>" + esc(finding["title"]) + "<br>" + esc(finding["entity_id"]) +
                        " · revision " + str(finding["revision"]) + "</td><td>" + esc(finding["action"]) +
                        "<br><small>" + esc(finding["note"]) + "</small></td><td>" + esc(finding["status"]) + "</td></tr>")
        body.append("</tbody></table></section>")
    if embedded:
        return ("<section><h2>Visitor journeys</h2>" + "".join(body) + "</section>").encode("utf-8")
    doc = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visitor journey handover</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f4f4;color:#202020;font:15px/1.55 system-ui,sans-serif}
main{max-width:1120px;margin:auto;padding:36px 24px}h1{font-size:30px;margin:0 0 12px}h2{font-size:24px}
h3{font-size:19px}h4{font-size:16px;margin-bottom:4px}section,article{background:#fff;border:1px solid #ccc;padding:24px;margin:22px 0}
article{padding:18px}span{font-size:12px;border:1px solid #aaa;padding:3px 7px;margin-left:10px}table{border-collapse:collapse;width:100%;table-layout:fixed}
th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th{background:#eee}
td:last-child,th:last-child{width:110px}dl{display:grid;grid-template-columns:165px 1fr;gap:8px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:15px}code,.url{overflow-wrap:anywhere}summary{cursor:pointer;margin-top:18px}
@media(max-width:600px){main{padding:18px 12px}section,article{padding:14px}dl{grid-template-columns:1fr}dt{margin-top:8px}th,td{padding:6px}td:last-child,th:last-child{width:80px}}
@media print{body{background:#fff}main{padding:0}section,article{break-inside:avoid}details{display:block}}
</style></head><body><main><h1>Visitor journey handover</h1>"""
    doc += "<p>" + esc(capture["name"]) + "</p><p>Original pages, reviewed visitor goals, retained findings and editable operating definitions.</p>"
    doc += "".join(body)
    doc += "<section><h2>Continue the work</h2><p>Open the editable GovHub backup with the included application. The original page files and manifests remain available in the handover archive. Choose a new target profile or source package to compare a candidate edition against these saved visitor goals.</p><p>HTML observations describe the retained document source. Keyboard, visual layout and assistive-technology reviews can be recorded alongside the relevant journey. Each source keeps its actual acquisition method and observation time.</p></section></main></body></html>"
    return doc.encode("utf-8")


def write_payload(write, capture):
    visitor = capture["visitor"]
    encode = lambda value: (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()
    write("visitor-journeys.json", encode(visitor))
    definitions = {item["definition"]["id"]: item["definition"] for item in visitor["editions"]}
    write("visitor-definitions.json", encode(list(definitions.values())))
    profiles = {item["project"]["id"]: item["project"] for item in visitor["editions"]}
    write("visitor-projects.json", encode(list(profiles.values())))
    rows = []
    for edition in visitor["editions"]:
        for journey in edition["result"]["journeys"]:
            for step in journey["steps"]:
                for check in step["checks"]:
                    rows.append({"edition_id": edition["id"], "role": edition["role"], "set_id": edition["set_id"],
                                 "set_revision": edition["set_revision"], "journey_id": journey["id"],
                                 "journey": journey["name"], "step_id": step["step_id"], "url": step["url"],
                                 "outcome": check["kind"], "expected": json.dumps(check["expected"], ensure_ascii=False),
                                 "actual": json.dumps(check["actual"], ensure_ascii=False), "status": check["status"],
                                 "page_sha256": step["page_sha256"], "detail": check.get("detail", "")})
    columns = ["edition_id", "role", "set_id", "set_revision", "journey_id", "journey", "step_id", "url",
               "outcome", "expected", "actual", "status", "page_sha256", "detail"]
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    for row in rows:
        # Spreadsheet software may execute formula-like text. Keep the complete
        # original value in JSON while making the human CSV safe to open.
        writer.writerow({key: "'" + str(value) if str(value).startswith(("=", "+", "-", "@", "\t", "\r")) else value
                         for key, value in row.items()})
    write("visitor-outcomes.csv", stream.getvalue().encode("utf-8-sig"))
    write("visitor-opening-guide.md", b"""# Visitor journey workspace

Open handover.html for the complete readable result. visitor-journeys.json retains
all selected source editions, expectations, decisions and corrective work history.
visitor-definitions.json and visitor-projects.json are editable operating inputs.
visitor-outcomes.csv provides one row for every captured expected outcome.
source-manifest.json binds every original page to its retained file and hash.

Use the included GovHub application and editable workspace backup to continue:
1. Open the restored workspace with server.py and its original private account.
2. Choose Visitor journeys and open the saved project and journey set.
3. Capture a new target or import its complete original source files.
4. Compare the exact saved editions. Changed criteria remain explicit.
5. Review outcomes, record corrective implementation, and retain a new handover.

Source HTML can contain scripts and external links. Inspect original source as
text or in a browser profile suited to that source. The operator's report renders
only escaped extracted values. Request-header environment values are supplied
at execution and are never part of the exported project configuration.
""")
