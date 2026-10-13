"""Complete regional labor calculations from the retained original BLS observations.

LAUS definitions: https://www.bls.gov/lau/laufaq.htm
QCEW aggregation: https://www.bls.gov/opub/hom/cew/calculation.htm
QCEW wages: https://www.bls.gov/cew/news-release-technical-note.htm
"""
from __future__ import annotations
from collections import defaultdict
from decimal import Decimal, InvalidOperation, localcontext, ROUND_HALF_UP
from fractions import Fraction
import calendar
import csv
import hashlib
import html
import io
import json
import re

SCHEMA = "stellar-forge.bls-regional-analysis.v1"
DEFINITION_SCHEMA = "stellar-forge.bls-regional-definition.v1"
METHOD_VERSION = "2026-10-13.1"
MAX_COUNTIES = 200
MAX_YEARS = 80
MAX_OBSERVATIONS = 1000000
LAUS_MEASURES = {"03": ("unemployment_rate", "Unemployment rate", "percent"),
                 "04": ("unemployed", "Unemployed residents", "persons"),
                 "05": ("employed", "Employed residents", "persons"),
                 "06": ("labor_force", "Civilian labor force", "persons")}
QCEW_NAMES = {
    "qtrly_estabs": "Establishments",
    "month1_emplvl": "Covered employment", "month2_emplvl": "Covered employment",
    "month3_emplvl": "Covered employment", "total_qtrly_wages": "Total quarterly wages",
    "taxable_qtrly_wages": "Taxable quarterly wages", "qtrly_contributions": "Quarterly contributions",
    "avg_wkly_wage": "Average weekly wage", "quarter_average_employment": "Average monthly covered employment",
}
QCEW_ADDITIVE = ("qtrly_estabs", "month1_emplvl", "month2_emplvl", "month3_emplvl",
                 "total_qtrly_wages", "taxable_qtrly_wages", "qtrly_contributions")
METHODS = [
    {"id": "laus", "url": "https://www.bls.gov/lau/laufaq.htm",
     "meaning": "Resident people. A regional rate uses 100 × total unemployed / total civilian labor force. Each original monthly or annual-average period retains its adjustment and coverage."},
    {"id": "qcew", "url": "https://www.bls.gov/opub/hom/cew/calculation.htm",
     "meaning": "Workplace jobs and wages. Only distinct counties within one ownership, industry and size selection are added. Suppressed members keep the requested regional calculation unavailable."},
    {"id": "wage", "url": "https://www.bls.gov/cew/news-release-technical-note.htm",
     "meaning": "Derived regional weekly wage is total quarterly wages / mean of three monthly employment totals / 13. It uses the available published source values; original county averages remain separate."},
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def unique_strings(value, name, maximum):
    require(isinstance(value, list) and 1 <= len(value) <= maximum, name + " must be a complete nonempty list.")
    require(all(isinstance(v, str) and 1 <= len(v) <= 160 for v in value), "Use original " + name + " strings.")
    require(len(set(value)) == len(value), name + " contains duplicates.")
    return list(value)


def request_input(value):
    require(isinstance(value, dict), "Use a complete regional analysis definition.")
    allowed = {"edition_id", "title", "region_name", "narrative", "counties", "years",
               "laus", "qcew", "chart_counties", "previous_report_id"}
    require(set(value) <= allowed, "Unknown regional analysis field.")
    require(isinstance(value.get("edition_id"), str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,99}", value["edition_id"]),
            "Select a retained source edition.")
    title = value.get("title", "")
    region = value.get("region_name", "Selected region")
    narrative = value.get("narrative", "")
    require(isinstance(title, str) and 1 <= len(title.strip()) <= 250, "Enter an analysis title.")
    require(isinstance(region, str) and 1 <= len(region.strip()) <= 160, "Name the selected region.")
    require(isinstance(narrative, str) and len(narrative) <= 40000, "Customer commentary can contain up to 40,000 characters.")
    counties = unique_strings(value.get("counties"), "county FIPS", MAX_COUNTIES)
    require(all(re.fullmatch(r"\d{5}", x) and not x.endswith("000") for x in counties),
            "Select distinct original county FIPS codes, without state or combined-area totals.")
    years = value.get("years")
    require(isinstance(years, list) and 1 <= len(years) <= MAX_YEARS and
            all(type(y) is int and 1900 <= y <= 2200 for y in years) and len(set(years)) == len(years),
            "Select distinct original observation years.")
    laus, qcew = value.get("laus"), value.get("qcew")
    require(laus is None or isinstance(laus, dict), "Use a LAUS selection object or null.")
    require(qcew is None or isinstance(qcew, dict), "Use a QCEW selection object or null.")
    require(laus is not None or qcew is not None, "Select resident labor, workplace observations, or both.")
    if laus is not None:
        require(set(laus) <= {"seasonal", "period_kinds"}, "Unknown resident-labor selection field.")
        require(laus.get("seasonal", "U") in ("U", "S"), "Use the original LAUS adjustment code.")
        kinds = unique_strings(laus.get("period_kinds", ["month", "annual_average"]), "period kinds", 2)
        require(set(kinds) <= {"month", "annual_average"}, "Select original monthly observations or annual averages.")
        laus = {"seasonal": laus.get("seasonal", "U"), "period_kinds": sorted(kinds)}
    if qcew is not None:
        require(set(qcew) <= {"ownership_code", "industry_code", "size_code", "quarters"},
                "Unknown workplace selection field.")
        require(all(isinstance(qcew.get(k), str) and re.fullmatch(r"[A-Za-z0-9-]{1,20}", qcew[k])
                    for k in ("ownership_code", "industry_code", "size_code")),
                "Select one original ownership, industry and size code.")
        quarters = qcew.get("quarters", [1, 2, 3, 4])
        require(isinstance(quarters, list) and 1 <= len(quarters) <= 4 and
                all(type(q) is int and 1 <= q <= 4 for q in quarters) and len(set(quarters)) == len(quarters),
                "Select distinct original quarters from 1 to 4.")
        qcew = {**qcew, "quarters": sorted(quarters)}
    charts = value.get("chart_counties", counties[:8])
    require(isinstance(charts, list) and len(charts) <= 8 and
            all(isinstance(x, str) and x in counties for x in charts) and len(set(charts)) == len(charts),
            "Choose up to eight selected counties for charts. Every county stays in the full tables.")
    previous = value.get("previous_report_id")
    require(previous is None or isinstance(previous, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,99}", previous),
            "Select an original saved regional analysis to revise.")
    return {"edition_id": value["edition_id"], "title": title.strip(), "region_name": region.strip(),
            "narrative": narrative, "counties": sorted(counties), "years": sorted(years),
            "laus": laus, "qcew": qcew, "chart_counties": charts, "previous_report_id": previous}


def rational(row):
    if row is None or row.get("value_status") != "reported":
        return None
    try:
        raw = Decimal(row["value_raw"].strip().replace(",", ""))
        return Fraction(raw) if raw.is_finite() else None
    except (KeyError, InvalidOperation, ValueError):
        return None


def number(value):
    if value is None:
        return {"value_decimal": None, "numerator": None, "denominator": None}
    with localcontext() as context:
        context.prec = 100
        decimal = Decimal(value.numerator) / Decimal(value.denominator)
        decimal = decimal.quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP)
    return {"value_decimal": format(decimal, "f").rstrip("0").rstrip(".") if decimal else "0",
            "numerator": str(value.numerator), "denominator": str(value.denominator)}


def from_number(row):
    return None if row.get("numerator") is None else Fraction(int(row["numerator"]), int(row["denominator"]))


def coverage(row):
    if row is None:
        return None
    excluded = row.get("excluded_months", "[]")
    try:
        excluded = tuple(sorted(json.loads(excluded))) if isinstance(excluded, str) else tuple(sorted(excluded))
    except (ValueError, TypeError):
        excluded = ("unresolved",)
    return (row.get("basis"), row.get("period_kind"), row.get("coverage_months"), excluded, row.get("seasonal", ""))


def record_id(projection, area, metric, year, period):
    return projection + ":" + area + ":" + metric + ":" + str(year) + ":" + period


def dates(year, period):
    if period == "M13":
        return str(year) + "-01-01", str(year) + "-12-31"
    if period.startswith("Q"):
        month = (int(period[1:]) - 1) * 3 + 1
        last = month + 2
        return f"{year:04d}-{month:02d}-01", f"{year:04d}-{last:02d}-{calendar.monthrange(year, last)[1]:02d}"
    month = int(period[1:])
    return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"


def common(projection, area, area_name, counties, metric, label, unit, year, period, kind, request):
    start, end = dates(year, period)
    return {"observation_id": record_id(projection, area, metric, year, period), "projection": projection,
            "area_key": area, "area_name": area_name, "county_fips": counties, "source_edition_id": request["edition_id"],
            "metric": metric, "measure_name": label, "unit": unit, "year": year, "period": period,
            "period_kind": kind, "period_start": start, "period_end": end,
            "basis": "place_of_residence" if projection == "laus" else "place_of_employment",
            "seasonal": request["laus"]["seasonal"] if projection == "laus" else "",
            "coverage_months": None, "excluded_months": [], "definition": {key: request["qcew"][key] for key in ("ownership_code", "industry_code", "size_code")} if projection == "qcew" else None}


def components(expected, *, resident=False, expected_unit=None):
    """Return complete source membership, including every unavailable original slot."""
    selected = [row for _, _, row in expected if row is not None]
    problems = []
    for county, metric, row in expected:
        if row is None:
            problems.append({"county_fips": county, "metric": metric, "reason": "source_observation_absent"})
        elif rational(row) is None:
            problems.append({"county_fips": county, "metric": metric, "reason": row.get("value_status") if row.get("value_status") != "reported" else "original_decimal_unavailable"})
        elif expected_unit is not None and row.get("unit") != expected_unit:
            problems.append({"county_fips": county, "metric": metric, "reason": "source_unit_differs"})
        elif row.get("basis") != ("place_of_residence" if resident else "place_of_employment"):
            problems.append({"county_fips": county, "metric": metric, "reason": "source_statistical_basis_differs"})
    if resident and selected:
        signatures = {coverage(row) for row in selected}
        if len(signatures) != 1 or any(row.get("coverage_months") is None for row in selected):
            problems.append({"county_fips": "", "metric": "", "reason": "source_period_coverage_differs"})
    return selected, problems


def finish(row, expected, value, formula, problems, *, original=False):
    rows = [item for _, _, item in expected if item is not None]
    row.update(number(None if problems else value))
    row.update(statistic="original" if original else "derived", formula=formula,
               calculation_status="source_unavailable" if problems else ("reported" if original else "calculated"),
               source_observation_ids=[item["observation_id"] for item in rows],
               expected_source_count=len(expected), received_source_count=len(rows),
               unavailable_members=problems)
    if row["projection"] == "laus" and rows:
        signatures = {coverage(item) for item in rows}
        if len(signatures) == 1:
            sig = next(iter(signatures))
            row["coverage_months"], row["excluded_months"] = sig[2], list(sig[3])
    return row


def original_row(raw, row, county, metric):
    expected = [(county, metric, raw)]
    _, problems = components(expected, resident=row["projection"] == "laus", expected_unit=row["unit"])
    if raw is not None:
        row["original_value_raw"] = raw["value_raw"]
        row["original_value_status"] = raw["value_status"]
        row["source_metric"] = raw.get("measure_code", raw.get("metric", metric))
        row["footnotes"] = raw.get("footnotes", "")
        row["disclosure_code"] = raw.get("disclosure_code", "")
    return finish(row, expected, rational(raw), "Original published observation", problems, original=True)


def laus_analysis(originals, request, names):
    lookup, periods = {}, set()
    for row in originals:
        key = (row["county_fips"], row["year"], row["period"], row["measure_code"])
        require(key not in lookup, "The selected LAUS source has duplicate county/period/measure observations.")
        lookup[key] = row
        periods.add((row["year"], row["period"], row["period_kind"]))
    result = []
    for year, period, kind in sorted(periods):
        for code, (metric, label, unit) in LAUS_MEASURES.items():
            for county in request["counties"]:
                raw = lookup.get((county, year, period, code))
                row = common("laus", county, names[county], [county], metric, label, unit, year, period, kind, request)
                result.append(original_row(raw, row, county, code))
            member_codes = ("04", "06") if code == "03" else (code,)
            expected = [(county, item, lookup.get((county, year, period, item)))
                        for county in request["counties"] for item in member_codes]
            selected, problems = components(expected, resident=True, expected_unit="persons")
            value = None
            formula = "100 × sum(unemployed residents) / sum(civilian labor force)" if code == "03" else "Sum of original county " + label.lower()
            if not problems:
                if code == "03":
                    unemployed = sum((rational(item) for item in selected if item["measure_code"] == "04"), Fraction())
                    labor = sum((rational(item) for item in selected if item["measure_code"] == "06"), Fraction())
                    formula = "100 × sum(unemployed residents) / sum(civilian labor force)"
                    if labor <= 0:
                        problems.append({"county_fips": "", "metric": "06", "reason": "nonpositive_regional_labor_force"})
                    else:
                        value = 100 * unemployed / labor
                else:
                    value = sum((rational(item) for item in selected), Fraction())
            row = common("laus", "region", request["region_name"], request["counties"], metric, label, unit,
                         year, period, kind, request)
            result.append(finish(row, expected, value, formula, problems))
    return result


def qcew_period(year, quarter, metric):
    match = re.search(r"month([123])_emplvl", metric)
    return ("M" + str((quarter - 1) * 3 + int(match[1])).zfill(2), "month", "covered_employment" if re.fullmatch(r"month[123]_emplvl", metric) else metric) if match else ("Q" + str(quarter), "quarter", metric)


def qcew_analysis(originals, request, names):
    lookup, periods, metrics = {}, set(), set()
    for raw in originals:
        key = (raw["area_fips"], raw["year"], raw["quarter"], raw["metric"])
        require(key not in lookup, "The selected QCEW county/quarter/metric is ambiguous.")
        lookup[key] = raw
        periods.add((raw["year"], raw["quarter"]))
        metrics.add(raw["metric"])
    output = []
    for year, quarter in sorted(periods):
        for metric in sorted(metrics):
            for county in request["counties"]:
                raw = lookup.get((county, year, quarter, metric))
                # A metric is emitted for an actual selected quarter, including unavailable county members.
                peer = raw or next((lookup.get((c, year, quarter, metric)) for c in request["counties"]
                                    if lookup.get((c, year, quarter, metric)) is not None), None)
                if peer is None:
                    continue
                period, kind, key = qcew_period(year, quarter, metric)
                row = common("qcew", county, names[county], [county], key, QCEW_NAMES.get(metric, metric),
                             peer["unit"], year, period, kind, request)
                output.append(original_row(raw, row, county, metric))
        for metric in QCEW_ADDITIVE:
            peer = next((lookup.get((county, year, quarter, metric)) for county in request["counties"]
                         if lookup.get((county, year, quarter, metric)) is not None), None)
            if peer is None:
                continue
            expected = [(county, metric, lookup.get((county, year, quarter, metric))) for county in request["counties"]]
            selected, problems = components(expected, expected_unit=peer["unit"])
            value = None if problems else sum((rational(row) for row in selected), Fraction())
            period, kind, key = qcew_period(year, quarter, metric)
            row = common("qcew", "region", request["region_name"], request["counties"], key,
                         QCEW_NAMES[metric], peer["unit"], year, period, kind, request)
            output.append(finish(row, expected, value, "Sum of the selected original county values", problems))
        for area, counties in [(c, [c]) for c in request["counties"]] + [("region", request["counties"])]:
            for metric in ("quarter_average_employment", "avg_wkly_wage"):
                if metric == "avg_wkly_wage" and area != "region":
                    continue  # Keep the actual published county average above.
                selected_metrics = ("month1_emplvl", "month2_emplvl", "month3_emplvl")
                if metric == "avg_wkly_wage":
                    selected_metrics += ("total_qtrly_wages",)
                expected = [(county, m, lookup.get((county, year, quarter, m))) for county in counties for m in selected_metrics]
                selected, problems = components(expected)
                for item in selected:
                    required_unit = "USD" if item["metric"] == "total_qtrly_wages" else "jobs"
                    if item.get("unit") != required_unit:
                        problems.append({"county_fips": item["area_fips"], "metric": item["metric"], "reason": "source_unit_differs"})
                value = None
                formula = ("3 × sum(total quarterly wages) / [13 × sum(the three monthly employment counts)]" if metric == "avg_wkly_wage"
                           else "(month 1 employment + month 2 employment + month 3 employment) / 3")
                if not problems:
                    jobs = sum((rational(row) for row in selected if row["metric"].startswith("month")), Fraction())
                    if metric == "quarter_average_employment":
                        value = jobs / 3
                    else:
                        wages = sum((rational(row) for row in selected if row["metric"] == "total_qtrly_wages"), Fraction())
                        formula = "3 × sum(total quarterly wages) / [13 × sum(the three monthly employment counts)]"
                        if jobs <= 0:
                            problems.append({"county_fips": "", "metric": metric, "reason": "nonpositive_employment_denominator"})
                        else:
                            value = wages * 3 / (jobs * 13)
                row = common("qcew", area, request["region_name"] if area == "region" else names[area],
                             counties, metric, QCEW_NAMES[metric], "jobs" if metric == "quarter_average_employment" else "USD_per_week",
                             year, "Q" + str(quarter), "quarter", request)
                output.append(finish(row, expected, value, formula, problems))
    return output


def comparable(a, b):
    keys = ("projection", "area_key", "county_fips", "metric", "unit", "basis", "seasonal",
            "period_kind", "coverage_months", "excluded_months", "definition")
    return all(a.get(key) == b.get(key) for key in keys)


def add_annual_changes(rows):
    lookup = {(r["projection"], r["area_key"], r["metric"], r["year"], r["period"]): r for r in rows}
    require(len(lookup) == len(rows), "A regional result has duplicate statistic identities.")
    for row in rows:
        prior = lookup.get((row["projection"], row["area_key"], row["metric"], row["year"] - 1, row["period"]))
        change = {"status": "prior_source_period_absent", "previous_observation_id": None,
                  "value_decimal": None, "percent_change_decimal": None}
        if prior is not None:
            change["previous_observation_id"] = prior["observation_id"]
            if not comparable(row, prior):
                change["status"] = "source_coverage_or_definition_differs"
            elif row["metric"].startswith(("oty_", "lq_")):
                change["status"] = "original_change_or_relative_metric_retained"
            elif from_number(row) is None or from_number(prior) is None:
                change["status"] = "source_value_unavailable"
            else:
                current, previous = from_number(row), from_number(prior)
                difference = number(current - previous)
                change.update(status="calculated", value_decimal=difference["value_decimal"],
                              numerator=difference["numerator"], denominator=difference["denominator"],
                              unit="percentage_points" if row["unit"] == "percent" else row["unit"])
                if previous:
                    percentage = number((current - previous) * 100 / abs(previous))
                    change.update(percent_change_decimal=percentage["value_decimal"],
                                  percent_numerator=percentage["numerator"], percent_denominator=percentage["denominator"])
                else:
                    change["percent_status"] = "zero_prior_denominator"
        row["annual_change"] = change


def analyze(laus_rows, qcew_rows, value):
    request = request_input(value)
    retained = []
    names, source_names = {}, defaultdict(lambda: defaultdict(set))
    selected_laus, selected_qcew = [], []
    seen_original = set()
    for projection, source in (("laus", laus_rows), ("qcew", qcew_rows)):
        if request[projection] is None:
            continue
        for row in source:
            require(isinstance(row, dict) and isinstance(row.get("observation_id"), str), "Keep each original BLS observation.")
            county = row.get("county_fips") if projection == "laus" else row.get("area_fips")
            if county not in request["counties"] or row.get("year") not in request["years"]:
                continue
            selection = request[projection]
            if projection == "laus":
                if (row.get("seasonal") != selection["seasonal"] or row.get("period_kind") not in selection["period_kinds"]
                        or row.get("measure_code") not in LAUS_MEASURES):
                    continue
            elif (row.get("quarter") not in selection["quarters"] or
                  any(row.get(k) != selection[k] for k in ("ownership_code", "industry_code", "size_code"))):
                continue
            identity = (projection, row["observation_id"])
            require(identity not in seen_original, "An original observation was received more than once.")
            seen_original.add(identity)
            require(len(retained) < MAX_OBSERVATIONS, "The complete selected analysis exceeds one million original observations.")
            original = dict(row)
            retained.append({"projection": projection, "observation": original})
            (selected_laus if projection == "laus" else selected_qcew).append(original)
            label = row.get("area_name") or county
            names.setdefault(county, label)
            source_names[county][projection].add(label)
    require(retained, "The complete source edition contains no observations for this regional selection.")
    for county in request["counties"]:
        names.setdefault(county, county)
    rows = []
    if request["laus"] is not None:
        rows.extend(laus_analysis(selected_laus, request, names))
    if request["qcew"] is not None:
        rows.extend(qcew_analysis(selected_qcew, request, names))
    rows.sort(key=lambda row: (row["projection"], row["metric"], row["period_kind"], row["year"], row["period"], row["area_key"]))
    add_annual_changes(rows)
    status = defaultdict(int)
    for row in rows:
        status[row["calculation_status"]] += 1
    return {"schema": SCHEMA, "method_version": METHOD_VERSION, "definition": request,
            "counties": [{"fips": c, "name": names[c], "source_names": {projection: sorted(labels) for projection, labels in source_names[c].items()}}
                         for c in request["counties"]],
            "source_counts": {"laus": len(selected_laus), "qcew": len(selected_qcew)},
            "row_count": len(rows), "status_counts": dict(status),
            "methodology": METHODS, "rows": rows, "originals": retained}


def revision_changes(before_rows, after_rows):
    previous = {row["observation_id"]: row for row in before_rows}
    current = {row["observation_id"]: row for row in after_rows}
    require(len(previous) == len(before_rows) and len(current) == len(after_rows), "Keep complete unique saved analysis rows.")
    output, counts = [], {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}
    for key in sorted(set(previous) | set(current)):
        before, after = previous.get(key), current.get(key)
        kind = "added" if before is None else "removed" if after is None else "unchanged" if before == after else "changed"
        counts[kind] += 1
        if kind != "unchanged":
            output.append({"observation_id": key, "change": kind, "before": before, "after": after,
                           "comparable": before is not None and after is not None and comparable(before, after)})
    return {"counts": counts, "rows": output}


COLUMNS = ("observation_id", "projection", "source_edition_id", "source_capture_sha256", "source_sha256",
           "area_name", "county_fips", "metric", "measure_name", "year",
           "period", "period_kind", "period_start", "period_end", "basis", "unit", "value_decimal",
           "numerator", "denominator", "statistic", "calculation_status", "formula", "coverage_months",
           "excluded_months", "seasonal", "definition", "annual_change", "source_observation_ids",
           "expected_source_count", "received_source_count", "source_metric", "original_value_raw",
           "original_value_status", "disclosure_code", "footnotes", "unavailable_members")


def csv_document(rows):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\r\n")
    writer.writerow(COLUMNS)
    for row in rows:
        writer.writerow([encoded(row.get(k)) if isinstance(row.get(k), (dict, list)) else row.get(k, "") for k in COLUMNS])
    return stream.getvalue()


def chart_index(row):
    if row["period_kind"] == "annual_average":
        return row["year"]
    if row["period"].startswith("Q"):
        return row["year"] * 4 + int(row["period"][1:]) - 1
    return row["year"] * 12 + int(row["period"][1:]) - 1


def chart_svg(rows, title):
    esc = lambda value: html.escape(str(value), quote=True)
    numeric = [float(row["value_decimal"]) for row in rows if row["value_decimal"] is not None]
    if not numeric:
        return "<p>No calculated or reported values are available for this chart. The complete table retains each source status.</p>"
    width, height, left, right, top, bottom = 800, 330, 88, 24, 26, 78
    positions = sorted({chart_index(row) for row in rows})
    low, high = min(numeric), max(numeric)
    if low == high:
        low -= max(abs(low) * .1, 1)
        high += max(abs(high) * .1, 1)
    gap = (high - low) * .08
    low, high = low - gap, high + gap
    x = lambda n: left + ((n - positions[0]) / (positions[-1] - positions[0]) if positions[-1] != positions[0] else .5) * (width - left - right)
    y = lambda n: top + (high - n) / (high - low) * (height - top - bottom)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{esc(title)}">',
             "<title>" + esc(title) + "</title>", '<rect width="100%" height="100%" fill="white"/>']
    for index in range(5):
        value = low + (high - low) * index / 4
        py = y(value)
        parts.append(f'<path d="M{left},{py:.2f}H{width-right}" stroke="#d5d5d5"/><text x="{left-8}" y="{py+4:.2f}" text-anchor="end" font-size="12" fill="#222">{esc(format(value, ".6g"))}</text>')
    labels = {}
    for row in rows:
        labels[chart_index(row)] = str(row["year"]) if row["period_kind"] == "annual_average" else str(row["year"]) + "-" + row["period"]
    ticks = sorted({round(i * (len(positions) - 1) / min(5, len(positions) - 1)) for i in range(min(5, len(positions) - 1) + 1)}) if len(positions) > 1 else [0]
    for index in ticks:
        pos = positions[index]
        parts.append(f'<text x="{x(pos):.2f}" y="{height-bottom+22}" text-anchor="middle" font-size="11" fill="#222">{esc(labels[pos])}</text>')
    areas = sorted({row["area_key"] for row in rows}, key=lambda key: (key != "region", key))
    dashes = ("", "7 3", "2 3", "9 3 2 3", "12 4", "2 2 6 2", "1 4", "6 2 1 2", "12 2 2 2")
    for index, area in enumerate(areas):
        selected = sorted([row for row in rows if row["area_key"] == area], key=chart_index)
        dash = dashes[index % len(dashes)]
        line, last = [], None
        for row in selected:
            position = chart_index(row)
            if row["value_decimal"] is None:
                last = None
                continue
            continuous = last is not None and chart_index(last) + 1 == position and comparable(row, last)
            px, py = x(position), y(float(row["value_decimal"]))
            line.append(("L" if continuous else "M") + f"{px:.2f},{py:.2f}")
            parts.append(f'<circle cx="{px:.2f}" cy="{py:.2f}" r="2.6" stroke="#111" fill="white"><title>{esc(row["area_name"]+" · "+labels[position]+" · "+row["value_decimal"]+" "+row["unit"])}</title></circle>')
            last = row
        parts.append('<path d="' + " ".join(line) + '" fill="none" stroke="#111" stroke-width="' + ("2.4" if area == "region" else "1.4") + '" stroke-dasharray="' + dash + '"/>')
        lx, ly = 22 + (index % 3) * 265, height - 42 + (index // 3) * 16
        parts.append(f'<path d="M{lx},{ly}h25" stroke="#111" stroke-width="2" stroke-dasharray="{dash}"/><text x="{lx+31}" y="{ly+4}" font-size="11" fill="#222">{esc(selected[0]["area_name"])}</text>')
    parts.append("</svg>")
    return "".join(parts)


def html_document(metadata, rows, originals, changes):
    esc = lambda value: html.escape(str(value), quote=True)
    request = metadata["request"]
    yield '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    yield "<title>" + esc(metadata["title"]) + "</title><style>"
    yield ("body{font:15px/1.5 system-ui,sans-serif;margin:32px auto;padding:0 22px;max-width:1180px;color:#171717}"
           "h1{font-size:2rem}h2{margin-top:2rem}h3{font-size:1.05rem}.meta{color:#444}p{max-width:90ch}"
           "table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}"
           "th{background:#eee}pre{white-space:pre-wrap;overflow-wrap:anywhere}.scroll{overflow:auto}details{margin:.5rem 0}"
           "svg{display:block;width:100%;height:auto}figure{margin:24px 0;border:1px solid #bbb;padding:12px;break-inside:avoid}"
           "figcaption{font-weight:600}a{color:inherit}nav a{margin-right:14px}@media print{body{margin:0;padding:0}.scroll{overflow:visible}table{font-size:10px}details>pre{display:block}nav{display:none}}")
    yield "</style><main><h1>" + esc(metadata["title"]) + "</h1>"
    yield '<p class="meta">' + esc(request["region_name"]) + " · saved " + esc(metadata["created_at"]) + " · analysis revision " + str(metadata["analysis_revision"]) + "</p>"
    yield '<nav><a href="#regional-charts">Charts</a><a href="#regional-values">All analysis values</a><a href="#regional-revisions">Revision comparison</a><a href="#regional-originals">Original observations</a></nav>'
    for paragraph in request["narrative"].split("\n\n"):
        if paragraph:
            yield "<p>" + esc(paragraph).replace("\n", "<br>") + "</p>"
    yield "<p>Selected counties: " + esc(", ".join(row["name"] + " (" + row["fips"] + ")" for row in metadata["counties"])) + ".</p>"
    yield "<p>Resident labor and workplace jobs retain separate populations. Regional figures are calculations from the retained published values. Each fraction keeps its exact numerator and denominator; displayed decimals round to twelve places. Rates and county averages keep their original published values alongside regional calculations.</p>"
    yield "<h2>Calculation methods</h2><ul>"
    for method in METHODS:
        yield "<li>" + esc(method["meaning"]) + ' <a href="' + esc(method["url"]) + '">Original BLS definition</a></li>'
    yield "</ul><p>Annual changes compare the same calendar period, county membership, statistical basis, adjustment and coverage. A missing or suppressed member leaves the requested regional value unavailable. Different annual coverage remains visible. Changes computed from released QCEW levels may differ from BLS news-release changes based on administratively adjusted prior data.</p>"
    yield '<h2 id="regional-charts">Regional and county series</h2>'
    chart_rows = [row for row in rows if row["area_key"] == "region" or row["area_key"] in request["chart_counties"]]
    groups = defaultdict(list)
    useful = set(LAUS_MEASURES[code][0] for code in LAUS_MEASURES) | set(QCEW_NAMES) | {"covered_employment"}
    for row in chart_rows:
        if row["metric"] in useful:
            groups[(row["projection"], row["metric"], row["period_kind"])].append(row)
    for key, group in sorted(groups.items()):
        title = key[0].upper() + " · " + group[0]["measure_name"] + " · " + key[2].replace("_", " ") + " · " + group[0]["unit"]
        yield "<figure><figcaption>" + esc(title) + "</figcaption>" + chart_svg(group, title) + "</figure>"
    yield '<p class="meta">Charts show the selected region and the chosen chart counties. Every selected county remains in the complete tables. Lines break at missing periods and changes in statistical coverage.</p>'
    yield '<h2 id="regional-values">All analysis values</h2><p>' + str(len(rows)) + " complete statistic rows.</p><div class=\"scroll\"><table><thead><tr>"
    for label in ("Area", "Measure", "Period", "Value", "Unit", "Annual difference", "Status", "Formula and complete source membership"):
        yield "<th>" + label + "</th>"
    yield "</tr></thead><tbody>"
    for row in rows:
        annual = row["annual_change"]
        yield "<tr>" + "".join("<td>" + esc(value) + "</td>" for value in (
            row["area_name"], row["measure_name"], str(row["year"]) + " " + row["period"],
            row["value_decimal"] if row["value_decimal"] is not None else "Unavailable", row["unit"],
            annual["value_decimal"] + " " + annual.get("unit", row["unit"]).replace("_", " ") if annual.get("value_decimal") is not None else annual["status"],
            row["calculation_status"]))
        yield "<td><details><summary>" + esc(row["formula"]) + "</summary><pre>" + esc(json.dumps(row, ensure_ascii=False, indent=2)) + "</pre></details></td></tr>"
    yield '</tbody></table></div><h2 id="regional-revisions">Saved analysis revision</h2>'
    if metadata.get("previous_report_id"):
        yield "<p>Continues " + esc(metadata["previous_report_id"]) + ". " + esc(encoded(changes["counts"])) + "</p>"
        for item in changes["rows"]:
            yield "<details><summary>" + esc(item["change"] + " · " + item["observation_id"]) + "</summary><pre>" + esc(json.dumps(item, ensure_ascii=False, indent=2)) + "</pre></details>"
    else:
        yield "<p>First saved analysis. Its definition can be reopened and revised in the original regional labor workspace.</p>"
    yield '<h2 id="regional-originals">Complete original observations</h2>'
    yield "<p>" + str(len(originals)) + " original source observations, retaining published raw values, source status, source rows and original dictionaries.</p>"
    for original in originals:
        row = original["observation"]
        yield "<details><summary>" + esc(original["projection"].upper() + " · " + row["observation_id"]) + "</summary><pre>" + esc(json.dumps(row, ensure_ascii=False, indent=2)) + "</pre></details>"
    yield "<h2>Saved source and definition</h2><pre>" + esc(json.dumps({"source": metadata["source"], "definition": request,
          "method_version": METHOD_VERSION}, ensure_ascii=False, indent=2)) + "</pre></main></html>"
