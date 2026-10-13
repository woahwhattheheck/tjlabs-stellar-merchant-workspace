"""Original BLS observations into complete saved county briefings."""
from __future__ import annotations
import csv
from decimal import Decimal, InvalidOperation, localcontext
import html
import io
import json

REPORT_SCHEMA = "stellar-forge.bls-labor-report.v1"
PROJECTIONS = ("laus", "qcew")
FILTER_COLUMNS = {
    "laus": ("county_fips", "measure_code", "year", "period", "seasonal", "value_status"),
    "qcew": ("area_fips", "ownership_code", "industry_code", "size_code",
             "year", "quarter", "metric", "value_status"),
}
PROVENANCE_COLUMNS = {"capture_id", "source_sha256", "source_row_sha256", "source_line",
                      "source_line_end", "source_file", "retrieved_at", "release_vintage",
                      "source_url", "definition_sources"}
DERIVED_COLUMNS = ("calculation", "comparison_observation_id", "comparison_period",
                   "comparison_value_raw", "change_decimal", "change_unit", "calculation_status")


def encoded(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def filters(value, projection):
    require(projection in PROJECTIONS, "Choose LAUS or QCEW.")
    require(isinstance(value, dict), "Use an object of exact source filters.")
    require(set(value) <= set(FILTER_COLUMNS[projection]), "A filter is not part of the original projection.")
    output = {}
    for key, values in value.items():
        require(isinstance(values, list) and 1 <= len(values) <= 200,
                "Each selected filter needs 1–200 original values.")
        if key in ("year", "quarter"):
            require(all(type(item) is int for item in values), "Years and quarters use integers.")
        else:
            require(all(isinstance(item, str) and len(item) <= 160 for item in values),
                    "Use original source codes or status strings.")
        require(len({encoded(item) for item in values}) == len(values), "A source filter contains a duplicate.")
        output[key] = list(values)
    return output


def matches(row, selected):
    return all(row.get(key) in values for key, values in selected.items())


def report_input(value):
    require(isinstance(value, dict), "Use a complete briefing request.")
    allowed = {"edition_id", "projection", "title", "narrative", "filters", "calculation"}
    require(set(value) <= allowed, "Unknown briefing field.")
    projection = value.get("projection")
    require(projection in PROJECTIONS, "Choose LAUS or QCEW.")
    title = value.get("title", "")
    narrative = value.get("narrative", "")
    require(isinstance(title, str) and 1 <= len(title.strip()) <= 250, "Enter a briefing title.")
    require(isinstance(narrative, str) and len(narrative) <= 40000, "Briefing commentary exceeds 40,000 characters.")
    calculation = value.get("calculation", "original")
    require(calculation in ("original", "year-change"), "Choose original values or exact annual change.")
    require(projection == "laus" or calculation == "original",
            "QCEW already supplies distinct original change metrics; select those original metrics.")
    return {**value, "title": title.strip(), "narrative": narrative,
            "filters": filters(value.get("filters", {}), projection), "calculation": calculation}


def year_change(row, originals):
    """Compare the exact same LAUS series and calendar period one year earlier."""
    result = {**row, "calculation": "year-change", "comparison_observation_id": "",
              "comparison_period": "", "comparison_value_raw": "", "change_decimal": "",
              "change_unit": "percentage_points" if row["unit"] == "percent" else row["unit"],
              "calculation_status": ""}
    previous = originals.get((row["series_id"], row["year"] - 1, row["period"]))
    if previous is None:
        result["calculation_status"] = "prior_source_period_absent"
        return result
    result.update(comparison_observation_id=previous["observation_id"],
                  comparison_period=str(previous["year"]) + "-" + previous["period"],
                  comparison_value_raw=previous["value_raw"])
    if row["value_status"] != "reported" or previous["value_status"] != "reported":
        result["calculation_status"] = "original_value_or_footnote_unavailable"
        return result
    if (row["period_kind"] != previous["period_kind"] or row["coverage_months"] != previous["coverage_months"]
            or row["basis"] != previous["basis"] or row["unit"] != previous["unit"]
            or row["seasonal"] != previous["seasonal"]):
        result["calculation_status"] = "source_coverage_or_definition_differs"
        return result
    try:
        with localcontext() as context:
            context.prec = 50
            current = Decimal(row["value_raw"].strip().replace(",", ""))
            prior = Decimal(previous["value_raw"].strip().replace(",", ""))
            require(current.is_finite() and prior.is_finite(), "Original values must be finite.")
            result["change_decimal"] = format(current - prior, "f")
    except (InvalidOperation, ValueError):
        result["calculation_status"] = "original_decimal_unavailable"
        return result
    result["calculation_status"] = "calculated"
    return result


def briefing_rows(rows, request, prior_rows=None):
    request = report_input(request)
    originals = {}
    if request["calculation"] == "year-change":
        for row in prior_rows if prior_rows is not None else rows:
            key = (row["series_id"], row["year"], row["period"])
            require(key not in originals, "Duplicate original LAUS observation.")
            originals[key] = row
    for row in rows:
        if matches(row, request["filters"]):
            yield year_change(row, originals) if request["calculation"] == "year-change" else dict(row)


def compare_observation(before, after):
    if before is None:
        return "added", sorted(set(after) - PROVENANCE_COLUMNS)
    if after is None:
        return "removed", sorted(set(before) - PROVENANCE_COLUMNS)
    keys = (set(before) | set(after)) - PROVENANCE_COLUMNS
    changed = sorted(key for key in keys if before.get(key) != after.get(key))
    return ("changed", changed) if changed else ("unchanged", [])


def methodology(projection, calculation):
    text = ("LAUS measures people at their place of residence. Original monthly observations and annual "
            "averages retain their separate period identities, adjustment, footnotes and coverage."
            if projection == "laus" else
            "QCEW measures jobs and wages at workplaces. Each original ownership, industry, establishment "
            "size, quarter and metric stays separate. Disclosure codes apply to their original metric families.")
    if calculation == "year-change":
        text += (" Change is the exact decimal difference from the same source series and calendar period "
                 "one year earlier. Rate differences are percentage points. Missing source periods, "
                 "unresolved footnotes and differing coverage produce an unavailable calculation. "
                 "The 2025 eleven-month annual average is not equated with a twelve-month annual average.")
    return text


def csv_text(rows, columns):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="raise", lineterminator="\r\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: encoded(value) if isinstance(value, (dict, list)) else value
                         for key, value in row.items()})
    return stream.getvalue()


def row_cells(row):
    return (row.get("area_name", ""), row.get("measure_name", row.get("metric", "")),
            row.get("period_start", ""), row.get("period_end", ""),
            row.get("value_raw", ""), row.get("unit", ""), row.get("value_status", ""),
            row.get("change_decimal", ""), row.get("calculation_status", ""))


def html_document(metadata, rows):
    """Stream a complete printable report; every original row remains inspectable."""
    esc = lambda value: html.escape(str(value), quote=True)
    yield "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    yield "<title>" + esc(metadata["title"]) + "</title><style>"
    yield ("body{font:15px/1.55 system-ui,sans-serif;max-width:1200px;margin:32px auto;padding:0 20px;color:#171717}"
           "h1{font-size:1.8rem}table{border-collapse:collapse;width:100%;font-size:13px}"
           "th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}th{background:#eee}"
           "pre{white-space:pre-wrap;overflow-wrap:anywhere}caption{text-align:left;margin:1rem 0}"
           ".meta{color:#444}details{margin:.5rem 0}@media print{body{margin:0}details{display:block}}")
    yield "</style><main><h1>" + esc(metadata["title"]) + "</h1>"
    yield "<p class=\"meta\">Saved " + esc(metadata["created_at"]) + " · Edition " + esc(metadata["edition_id"]) + "</p>"
    yield "<p>" + esc(metadata["methodology"]) + "</p>"
    for paragraph in metadata.get("narrative", "").split("\n\n"):
        if paragraph:
            yield "<p>" + esc(paragraph).replace("\n", "<br>") + "</p>"
    yield "<table><caption>" + str(metadata["row_count"]) + " complete selected observations</caption><thead><tr>"
    for label in ("Area", "Measure", "Period begins", "Period ends", "Original value", "Unit", "Source status", "Annual change", "Calculation"):
        yield "<th scope=\"col\">" + label + "</th>"
    yield "</tr></thead><tbody>"
    for row in rows:
        yield "<tr>" + "".join("<td>" + esc(value) + "</td>" for value in row_cells(row)) + "</tr>"
        yield "<tr><td colspan=\"9\"><details><summary>Original observation and source</summary><pre>"
        yield esc(json.dumps(row, ensure_ascii=False, indent=2, allow_nan=False))
        yield "</pre></details></td></tr>"
    yield "</tbody></table><h2>Original source selection</h2><pre>"
    yield esc(json.dumps(metadata["source"], ensure_ascii=False, indent=2, allow_nan=False))
    yield "</pre></main></html>"
