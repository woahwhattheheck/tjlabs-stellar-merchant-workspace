"""Complete portable operator report from an existing municipal workspace."""
from __future__ import annotations

from html import escape
import json


def source_geometry_map(rows):
    """Render every selected polyline in the portable report without remote tiles."""
    from .adapters import geometry, InvalidData
    selected, absent, unsupported = [], 0, 0
    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    for row in rows:
        if not row.get("geometry"):
            absent += 1
            continue
        try:
            value = geometry(row["geometry"])
            if value["type"] not in ("LineString", "MultiLineString"):
                unsupported += 1
                continue
            paths = [value["coordinates"]] if value["type"] == "LineString" else value["coordinates"]
        except (InvalidData, ValueError, KeyError, TypeError):
            unsupported += 1
            continue
        selected.append((row, paths))
        for path in paths:
            for position in path:
                x, y = position[:2]
                bounds = [min(bounds[0], x), min(bounds[1], y), max(bounds[2], x), max(bounds[3], y)]
    if not selected:
        return ""
    width, height = max(bounds[2] - bounds[0], .001), max(bounds[3] - bounds[1], .001)
    scale = min(930 / width, 430 / height)
    output = ['<section><h2>Complete source geometry</h2>',
              '<p>' + str(len(selected)) + ' mapped polylines across ' + str(len(rows))
              + ' selected records; ' + str(absent) + ' without geometry; '
              + str(unsupported) + ' other or invalid geometries outside this polyline view.</p>',
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" role="img" '
              'aria-label="All selected source polylines" style="width:100%;height:auto;max-height:650px;background:#f5f5f5;border:1px solid #ccc">']
    for row, paths in selected:
        title = escape(row["id"] + (" · " + row.get("label", "") if row.get("label") else ""))
        for path in paths:
            points = [str(round(35 + (p[0] - bounds[0]) * scale, 4)) + ","
                      + str(round(465 - (p[1] - bounds[1]) * scale, 4)) for p in path]
            output.append('<polyline points="' + " ".join(points)
                          + '" fill="none" stroke="#34383d" stroke-width="1.1"><title>'
                          + title + '</title></polyline>')
    output.extend(['</svg><p>WGS84 longitude/latitude geometry fitted to the full selected extent. '
                   'The retained source and GeoJSON keep the complete original coordinate values.</p></section>'])
    return "".join(output)


def report(project, inspected, originals):
    def text(value):
        if value is None:
            return "null"
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False, sort_keys=True)
        return str(value)
    def cell(value):
        return escape(text(value))
    def table(headings, rows):
        body = "".join("<tr>" + "".join("<td>" + cell(value) + "</td>" for value in row) + "</tr>" for row in rows)
        return '<div class="table"><table><thead><tr>' + "".join("<th>" + cell(value) + "</th>" for value in headings) +                "</tr></thead><tbody>" + body + "</tbody></table></div>"
    labels = {"development": "Development records", "public-reference": "Public reference records",
              "vendor-authorized": "Vendor-authorized records"}
    state = project["state"]
    parts = [
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
        "<title>" + cell(project["title"]) + " · Asset handoff</title>",
        """<style>body{font:15px/1.5 system-ui,sans-serif;color:#202327;background:#f4f5f6;margin:0}
main{max-width:1200px;margin:auto;padding:32px}h1{font-size:29px;margin-bottom:8px}h2{font-size:20px}
section{background:white;border:1px solid #cdd0d4;padding:20px;margin:20px 0}p{max-width:95ch}
small,.muted{color:#555d66}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #d2d5d9;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf0f2}.table{overflow:auto}td{max-width:38ch}code,pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#202327}details{margin:8px 0}
@media print{body{background:white}main{padding:0;max-width:none}section{break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid}.table{overflow:visible}td{max-width:none;font-size:10px}}</style><main>""",
        "<h1>" + cell(project["title"]) + "</h1><p>" + cell(labels.get(project["mode"], project["mode"])) +
        " · Selected revision " + cell(project["revision"]) + "</p>",
        "<p>This complete report follows the selected original inputs and saved mappings. The editable workspace backup retains every input version, decision and operation. Source identity and relationship labels are shown separately.</p>",
        "<section><h2>Selected population</h2>",
        table(["Dataset", "Mapped rows"], sorted((kind, len(rows)) for kind, rows in inspected["datasets"].items())),
        "<p>Current errors: " + cell(inspected["errors"]) + " · Current warnings: " + cell(inspected["warnings"]) + "</p></section>"
    ]
    for original in originals:
        metadata = original["metadata"]
        parts.extend(["<section><h2>Original input · " + cell(original["kind"]) + "</h2>",
                      table(["Property", "Value"], [
                          ("Filename", original["filename"]), ("Rows", original["row_count"]),
                          ("Original SHA256", original["sha256"]), ("Input ID", original["id"])]),
                      "<h3>Saved field mapping</h3>",
                      "<pre>" + cell(state["mappings"].get(original["kind"], {})) + "</pre>"])
        if metadata.get("format") in ("belleville-capture", "belleville-geometry-capture"):
            parts.extend(["<h3>Complete public source</h3>",
                "<p><a href=\"" + escape(metadata["source"], quote=True) + "\">Original Belleville Waterfront Trails layer</a></p>",
                table(["Property", "Value"], [(key.replace("_", " "), metadata.get(key)) for key in
                    ("identity_rule", "source_coverage", "original_requests", "original_files", "capture_sha256",
                     "attributes_sha256", "coordinate_system", "capture_started_utc", "capture_finished_utc", "consistency",
                     *(["geometry_capture_sha256", "geometry_original_requests", "geometry_original_files",
                        "geometry_paths", "geometry_positions", "geometry_absent_rows", "geometry_bbox",
                        "coordinate_operation", "geometry_finished_utc", "geometry_consistency"]
                       if metadata.get("geometry_included") else []))]),
                "<p>Repeated AM_ID, Asset_ID and Segment_ID values remain separate source records. Blank values and published risk/condition values retain their original meanings and types.</p>",
                table(["Field", "Blank / null", "Distinct nonblank", "Repeated occurrences"],
                      [(item["field"], item["blank_or_null"], item["distinct_nonblank"],
                        item["repeated_nonblank_occurrences"]) for item in metadata["field_observations"]]),
                "<details><summary>Original field definitions</summary><pre>" + cell(metadata["original_fields"]) + "</pre></details>"])
        parts.append("</section>")
    if any(item.get("metadata", {}).get("geometry_included") for item in originals):
        parts.append(source_geometry_map(inspected["datasets"].get("source_assets", [])))
    parts.extend(["<section><h2>Current findings and saved decisions</h2>",
        table(["Dataset", "Record / row", "Severity", "Finding", "Field", "Decision", "Note"],
              [(item["kind"], item.get("record_id") or item["row"], item["severity"], item["message"], item["field"],
                (item.get("decision") or {}).get("decision", ""), (item.get("decision") or {}).get("note", ""))
               for item in inspected["findings"]]), "</section>"])
    for kind, rows in inspected["datasets"].items():
        parts.append("<section><h2>" + cell(kind.replace("_", " ").title()) + " · " + str(len(rows)) + " records</h2>")
        columns = sorted({key for row in rows for key in row if key != "_row"})
        parts.append(table(columns, [[row.get(key, "") for key in columns] for row in rows]))
        parts.append("</section>")
    parts.extend(["<section><h2>Requested changes and returned outcomes</h2>",
                  table(["Change", "Work order", "Requested status", "Expected revision", "Outcome", "Original provider reference"],
                        [(row["id"], row["work_order_id"], row["status"], row["expected_revision"], row["state"],
                          row.get("provider_reference", "")) for row in state["changes"]]),
                  "<h3>Retained repair proposals</h3>",
                  table(["Dataset", "Original input", "Row", "Field", "Before", "Proposed", "Reason"],
                        [(row["kind"], row["input_id"], row["row"], row["field"], row["before"], row["after"], row["reason"])
                         for row in state["repairs"]]),
                  "<p>Repairs are proposed separately from the selected original source. Returned operational changes retain their actual provider reference and original request.</p></section>",
                  "</main></html>"])
    return "".join(parts).encode("utf-8")
