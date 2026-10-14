"""Explicit cash comparison over retained original Forecast projections.

This module selects existing cash curves; it does not create terms, rates,
receipts, debt, reservations or a second allocator. Absent selection is legacy.
"""
from __future__ import annotations
from copy import deepcopy
from decimal import Decimal, localcontext
from datetime import date, timedelta
from model import canonical, csv_bytes, text
import operations_domain as domain
import forecast_bridge_funding as bridge_source
import forecast_customer_funding as reservation_source

SCHEMA = "stellar-forge.portfolio-cash-comparison.v1"
BASES = {
    "SPENDING": "Original spending only",
    "GRANT": "Original spending with conditional grant",
    "COMMERCIAL": "Original pooled grant and customer cash",
    "PROTECTED": "Original customer-protected commercial cash",
    "FINANCED_SPENDING": "Financed spending only",
    "FINANCED_GRANT": "Financed conditional grant cash",
    "FINANCED_COMMERCIAL": "Financed pooled commercial cash",
    "FINANCED_PROTECTED": "Financed customer-protected commercial cash",
}
MEASURES = ("REQUIRED_STARTING_CASH", "GAP_AFTER_OPENING")
ZERO = Decimal("0")


def normalize(raw):
    if not isinstance(raw, dict) or set(raw) - {"basis", "measure", "note"}:
        domain.fail("Cash comparison: retain the declared basis, measure and note.", "INVALID_PORTFOLIO")
    return {"basis": domain.enum(raw.get("basis"), tuple(BASES), "Portfolio cash basis"),
            "measure": domain.enum(raw.get("measure"), MEASURES, "Portfolio cash measure"),
            "note": text(raw.get("note", ""), "Portfolio cash comparison decision", 8000)}


def money(value):
    return None if value is None else format(value.quantize(Decimal("0.01")), ".2f")


def minus(a, b):
    return None if a is None or b is None else money(Decimal(a) - Decimal(b))


def metrics(days, delta_key, opening, as_of):
    low, peak, complete = ZERO, as_of, bool(days)
    for row in days:
        value = row[delta_key]
        if value is None:
            complete = False
        elif Decimal(value) < low:
            low, peak = Decimal(value), row["date"]
    last = days[-1][delta_key] if days else None
    required = max(ZERO, -low)
    return {"requiredStartingCashUsd": money(required) if complete else None,
            "extraFundingAfterOpeningUsd": money(max(ZERO, required - Decimal(opening))) if complete and opening is not None else None,
            "peakNeedDate": peak if complete else None,
            "endDeltaUsd": last if complete else None,
            "endAvailableCashUsd": money(Decimal(opening) + Decimal(last)) if complete and opening is not None and last is not None else None,
            "datedCashComplete": complete}


def _curve(report, choice, basis):
    financed = basis.startswith("FINANCED_")
    protected = basis in ("PROTECTED", "FINANCED_PROTECTED")
    scenario = {"SPENDING": "spendingOnly", "GRANT": "conditionalGrant"}.get(basis.removeprefix("FINANCED_"), "commercial")
    bridge = report.get("bridgeFunding")
    reservation = report.get("customerFunding")
    reasons = []
    def reason(code, message):
        reasons.append({"code": code, "message": message})
    available = True
    if financed and bridge is None:
        available = False
        reason("BRIDGE_NOT_SELECTED", "The original saved Forecast has no entered facility schedule. Save an explicit source successor before using a financed comparison.")
    if protected and (reservation is None or not reservation.get("enabled")):
        available = False
        reason("CUSTOMER_PROTECTION_NOT_ENABLED", "Enable and review original customer-funding protection in the source Forecast before comparing protected cash.")
    opening = report["openingCash"]["amountUsd"]
    days = []
    if available:
        source = bridge["days"] if financed else report["days"]
        reservations = {row["date"]: row for row in reservation["days"]} if protected else {}
        # Native reservation levels already include customer receipts and remaining
        # obligations. Carry levels, never receipts, through later financing dates.
        held, known_held = None, None
        for row in source:
            stamp = row["date"]
            if protected:
                current = reservations.get(stamp)
                if current is not None:
                    held, known_held = current["reservedCustomerFundsUsd"], current["knownReservedCustomerFundsUsd"]
            else:
                held, known_held = "0.00", "0.00"
            pooled = row[scenario + "FinancedDeltaUsd"] if financed else row[scenario + "DeltaUsd"]
            known = row[scenario + "KnownFinancedDeltaUsd"] if financed else row.get("knownCommercialDeltaUsd", pooled) if scenario == "commercial" else pooled
            delta = minus(pooled, held)
            known_delta = minus(known, known_held)
            days.append({"date": stamp, "cashBeforeReservationDeltaUsd": pooled,
                "knownCashBeforeReservationDeltaUsd": known,
                "reservedCustomerFundsUsd": held if protected else None,
                "knownReservedCustomerFundsUsd": known_held if protected else None,
                "selectedDeltaUsd": delta, "knownSelectedDeltaUsd": known_delta,
                "selectedAvailableCashUsd": money(Decimal(opening) + Decimal(delta)) if opening is not None and delta is not None else None,
                "financingDeltaUsd": row["financingDeltaUsd"] if financed else None,
                "drawUsd": row["drawUsd"] if financed else None,
                "repaymentUsd": row["repaymentUsd"] if financed else None,
                "interestUsd": row["interestUsd"] if financed else None,
                "feeUsd": row["feeUsd"] if financed else None})
    complete = metrics(days, "selectedDeltaUsd", opening, report["asOfDate"])
    known = metrics(days, "knownSelectedDeltaUsd", opening, report["asOfDate"])
    if available and not complete["datedCashComplete"]:
        reason("DATED_CASH_UNRESOLVED", "The original selected dated cash or customer reservation contains unknown amounts, dates or attribution. The known portion is not the complete requirement or a lower bound.")
    coverage = report.get("currencyValuation", {})
    scope_complete = coverage.get("complete", True)
    if not scope_complete and scenario == "commercial":
        reason("SCOPE_VALUATION_UNRESOLVED", "The original selected scope has incomplete currency or native-credit valuation.")
    commercial = scenario == "commercial"
    timing = report.get("eventTiming", {})
    undated = timing.get("undatedDeliveryCostUsd", "0.00")
    if commercial and (undated is None or timing.get("unvaluedDeliveryProjectIds")):
        reason("UNDATED_SCOPE_UNVALUED", "Original undated commercial delivery obligations have incomplete valuation; dated cash alone cannot establish the full requirement.")
    if commercial and undated is not None and Decimal(undated) > ZERO:
        reason("UNDATED_DELIVERY_COST", "Original selected commercial costs remain undated; the displayed cash covers dated events only.")
    if any(not event.get("date") and event.get("amountUsd") is not None and Decimal(event["amountUsd"]) < ZERO
           and (commercial or not event.get("commercialId")) for event in report["events"]):
        reason("UNDATED_CASH_OUTFLOW", "An original selected cash outflow remains undated; no payment date is inferred.")
    if protected and reservation and reservation.get("enabled") and reservation["summary"]["undatedRemainingObligationCustomerIds"]:
        reason("UNDATED_PROTECTED_OBLIGATION", "Protected customer obligations retain undated delivery costs; review their original work and payment dates.")
    if choice["measure"] == "GAP_AFTER_OPENING" and opening is None:
        reason("OPENING_CASH_NOT_ENTERED", "Enter an explicit total opening available cash amount in the source Forecast for a gap-after-opening comparison.")
    if financed and bridge is not None:
        if not bridge["principalComplete"]:
            reason("PRINCIPAL_UNRESOLVED", "The original facility principal is incomplete; its known dated cash remains visible separately.")
        if bridge["creditFeasibility"] == "EXCEEDS":
            reason("FACILITY_TERMS_EXCEEDED", "The original facility model reports an exceeded outstanding cap, availability date or principal maturity requirement.")
        elif bridge["creditFeasibility"] != "WITHIN_ENTERED_OUTSTANDING_CAP":
            reason("FACILITY_TERMS_UNRESOLVED", "The original outstanding cap, availability or maturity review is unresolved.")
    selected_key = "requiredStartingCashUsd" if choice["measure"] == "REQUIRED_STARTING_CASH" else "extraFundingAfterOpeningUsd"
    result = {"basis": basis, "label": BASES[basis], "available": available, **complete,
        "knownPortion": known, "scopeValuationComplete": scope_complete,
        "openingCashUsd": opening, "lastForecastDate": days[-1]["date"] if days else None,
        "comparisonValueUsd": complete[selected_key],
        "financialComparisonEligible": available and not reasons and complete[selected_key] is not None,
        "reasons": reasons,
        "principalComplete": bridge["principalComplete"] if financed and bridge else None,
        "endingPrincipalUsd": bridge["endingPrincipalUsd"] if financed and bridge else None,
        "datedFinancingExpenseUsd": bridge["datedFinancingExpenseUsd"] if financed and bridge else None,
        "creditFeasibility": bridge["creditFeasibility"] if financed and bridge else None}
    return result, days


def project(report, choice, bridge_inputs=None, assessment_end=None):
    with localcontext() as context:
        context.prec = 80
        assessed = None
        if bridge_inputs is not None:
            assessed = bridge_source.build(report, bridge_inputs, assessment_end=assessment_end)
            report = {**report, "bridgeFunding": assessed}
        curves, days = [], []
        for basis in BASES:
            curve, values = _curve(report, choice, basis)
            curves.append(curve)
            if basis == choice["basis"]:
                days = values
        return {"schema": SCHEMA, "choice": deepcopy(choice),
            "originalForecastEndDate": report["lastForecastDate"], "assessmentEndDate": assessment_end, "assessedBridge": assessed,
            "selected": deepcopy(next(row for row in curves if row["basis"] == choice["basis"])),
            "curves": curves, "days": days,
            "basis": "One entered cash basis and measure apply to the original baseline and every alternative. Original customer receipts, debt events and source terms retain their dates; only original work-date rules move with the schedule.",
            "reservationBasis": "Protected cash subtracts each original customer-reservation level once from the selected cumulative cash curve. The last original level continues through later facility dates; it is not another payment or new restriction.",
            "availabilityBasis": "Financial eligibility checks the entered dated cash and original modeled facility constraints. Within an entered outstanding-principal cap does not establish an available commitment, permission to reborrow or permission to use borrowed funds for a particular purpose.",
            "timingBasis": "All cash and customer reservations are end-of-day. Financed scenarios use one common assessment end for all entered alternatives, including every entered maturity inside the original three-year window and all dated facility events. No automatic maturity payment is created. Maturities beyond that window retain outstanding debt and are not assessed as paid. Original undated amounts and source assumptions remain in the complete Forecast."}


def apply(result, saved, choice, max_days):
    """Replace only the selected-mode ranking; retain original cash summaries."""
    # Use one assessment window for the source and every candidate schedule.
    # A maturity cannot disappear just because one candidate finishes earlier.
    inputs = saved["inputs"].get("bridgeFunding")
    as_of = saved["report"]["asOfDate"]
    last = (date.fromisoformat(as_of) + timedelta(days=max_days)).isoformat()
    ends = [saved["report"]["lastForecastDate"], *[
        row["forecast"]["report"]["lastForecastDate"] for row in result["alternatives"] if row["forecast"]]]
    if inputs is not None:
        ends.extend(event["date"] for facility in inputs["facilities"] for event in facility["events"] if event["date"])
        ends.extend(facility["maturityDate"] for facility in inputs["facilities"] if
            facility["maturityDate"] and as_of <= facility["maturityDate"] <= last)
    assessment_end = max(ends)
    domain.calendar(assessment_end, "Portfolio cash assessment end")
    if not as_of <= assessment_end <= last:
        domain.fail("Retain the common cash assessment inside the original Forecast horizon.", "INVALID_PORTFOLIO")
    baseline = project(saved["report"], choice, inputs, assessment_end)
    result["baseline"]["cashComparison"] = baseline
    eligible = []
    by_id = {}
    for row in result["alternatives"]:
        projection = project(row["forecast"]["report"], choice, inputs, assessment_end) if row["forecast"] else None
        if row["summary"] is not None and projection is not None:
            row["summary"]["cashComparison"] = projection
        by_id[row["id"]] = projection
        if row["status"] == "READY" and projection and projection["selected"]["financialComparisonEligible"]:
            eligible.append(row)
    def vector(row):
        selected = by_id[row["id"]]["selected"]
        return (row["summary"]["finishDate"], row["summary"]["lateTasks"], Decimal(selected["comparisonValueUsd"]))
    base_selected = baseline["selected"]
    for compared in result["comparison"]:
        row = next(item for item in result["alternatives"] if item["id"] == compared["id"])
        projection = by_id[row["id"]]
        selected = projection["selected"] if projection else None
        valid = row in eligible
        compared.update({"cashBasis": choice["basis"], "cashMeasure": choice["measure"],
            "selectedCash": deepcopy(selected), "financialComparisonEligible": valid,
            "selectedCashDeltaUsd": None, "frontier": None})
        if valid:
            own = vector(row)
            compared["frontier"] = not any(other["id"] != row["id"] and all(a <= b for a, b in zip(vector(other), own))
                and any(a < b for a, b in zip(vector(other), own)) for other in eligible)
            if base_selected["financialComparisonEligible"]:
                compared["selectedCashDeltaUsd"] = money(Decimal(selected["comparisonValueUsd"]) - Decimal(base_selected["comparisonValueUsd"]))
            compared["financialComparisonReason"] = "Selected dated cash and modeled constraints are complete." if base_selected["financialComparisonEligible"] else "This alternative is comparable; the original selected baseline is unresolved, so its change is unavailable."
        else:
            compared["financialComparisonReason"] = ("Complete the original allocation first." if selected is None
                else " ".join(item["message"] for item in selected["reasons"]))
    result["comparisonBasis"] = (
        "Entered alternatives compared by finish date, late-task count and " + BASES[choice["basis"]] + " / "
        + ("required starting cash." if choice["measure"] == "REQUIRED_STARTING_CASH" else "gap after entered opening cash.")
        + " Only operationally ready alternatives with complete selected cash and resolved modeled constraints participate. This compares the entered alternatives, not every possible schedule or a lending commitment.")
    result["cashComparison"] = {"schema": SCHEMA, "choice": deepcopy(choice), "assessmentEndDate": assessment_end, "baselineEligible": base_selected["financialComparisonEligible"],
        "eligibleAlternativeIds": [row["id"] for row in eligible],
        "excludedAlternativeIds": [row["id"] for row in result["alternatives"] if row not in eligible],
        "basis": result["comparisonBasis"]}
    # A pre-existing currency-enabled report retains its original currency evidence,
    # but there is only one current frontier and eligibility roster.
    if "financialComparison" in result:
        result["financialComparison"].update({key: deepcopy(result["cashComparison"][key]) for key in
            ("baselineEligible", "eligibleAlternativeIds", "excludedAlternativeIds", "basis")})
    return result


def report_html(value, table):
    report = value["report"]
    if "cashComparison" not in report:
        return ""
    choice = report["cashComparison"]["choice"]
    from html import escape
    parts = ["<h2>Selected schedule and cash comparison</h2><p>" + escape(report["comparisonBasis"]) + "</p><p>" + escape(choice["note"]) + "</p>",
        "<p>Common financing assessment through <strong>" + escape(report["cashComparison"]["assessmentEndDate"]) + "</strong>. Original forecast cash ends " + escape(report["baseline"]["cashComparison"]["originalForecastEndDate"]) + ".</p>"]
    columns = [("label", "Cash basis"), ("requiredStartingCashUsd", "Required starting USD"), ("extraFundingAfterOpeningUsd", "Gap after opening USD"),
        ("endAvailableCashUsd", "Ending available USD"), ("financialComparisonEligible", "Comparable"), ("creditFeasibility", "Facility constraints")]
    projects = [("Original forecast", report["baseline"]["cashComparison"])] + [
        (row["name"], row["summary"]["cashComparison"]) for row in report["alternatives"] if row["summary"] and "cashComparison" in row["summary"]]
    for name, projection in projects:
        parts.append("<h3>" + escape(name) + "</h3><p>Original cash ends " + escape(projection["originalForecastEndDate"]) + "; common assessment ends " + escape(projection["assessmentEndDate"]) + ".</p>" + table(columns, [
            {**row, **{key: "Unresolved" if row[key] is None else row[key] for key in
                ("requiredStartingCashUsd", "extraFundingAfterOpeningUsd", "endAvailableCashUsd")}} for row in projection["curves"]]))
        selected = projection["selected"]
        parts.append("<p>Selected: " + escape(selected["label"]) + ". " + escape(" ".join(r["message"] for r in selected["reasons"])) + "</p>")
    parts.append("<p>" + escape(report["baseline"]["cashComparison"]["availabilityBasis"]) + "</p><p>" +
                 escape(report["baseline"]["cashComparison"]["reservationBasis"]) + "</p><p>" +
                 escape(report["baseline"]["cashComparison"]["timingBasis"]) + "</p>")
    return "\n".join(parts)


def export_files(value):
    report = value["report"]
    if "cashComparison" not in report:
        return {}
    files = {"cash-comparison/selection.json": (canonical(report["cashComparison"]) + "\n").encode()}
    rows = []
    for row in report["comparison"]:
        selected = row["selectedCash"] or {}
        rows.append({"id": row["id"], "name": row["name"], "status": row["status"],
            "finishDate": row.get("finishDate"), "lateTasks": row.get("lateTasks"),
            "basis": row["cashBasis"], "measure": row["cashMeasure"], "valueUsd": selected.get("comparisonValueUsd"),
            "baselineChangeUsd": row["selectedCashDeltaUsd"], "eligible": row["financialComparisonEligible"],
            "frontier": row["frontier"], "reason": row["financialComparisonReason"],
            "requiredStartingCashUsd": selected.get("requiredStartingCashUsd"), "extraFundingAfterOpeningUsd": selected.get("extraFundingAfterOpeningUsd"),
            "endingPrincipalUsd": selected.get("endingPrincipalUsd"), "creditFeasibility": selected.get("creditFeasibility"),
            "originalUnfinancedRequiredCashUsd": row.get("additionalCashNeededUsd"), "originalUnfinancedGapUsd": row.get("gapAfterOpeningCashUsd"),
            "originalUnfinancedChangeUsd": row.get("fundingNeedDeltaUsd"), "assessmentEndDate": report["cashComparison"]["assessmentEndDate"]})
    files["cash-comparison/comparison.csv"] = csv_bytes(["id", "name", "status", "finishDate", "lateTasks", "basis", "measure",
        "valueUsd", "baselineChangeUsd", "eligible", "frontier", "reason", "requiredStartingCashUsd",
        "extraFundingAfterOpeningUsd", "endingPrincipalUsd", "creditFeasibility", "originalUnfinancedRequiredCashUsd",
        "originalUnfinancedGapUsd", "originalUnfinancedChangeUsd", "assessmentEndDate"], rows)
    projects = [("original", value["baseForecastSnapshot"]["report"], report["baseline"]["cashComparison"])] + [
        ("alternatives/" + row["id"], row["forecast"]["report"], row["summary"]["cashComparison"])
        for row in report["alternatives"] if row["forecast"]]
    for key, original, projection in projects:
        prefix = "cash-comparison/" + key + "/"
        files[prefix + "projection.json"] = (canonical(projection) + "\n").encode()
        files[prefix + "curves.csv"] = csv_bytes(["basis", "label", "available", "datedCashComplete", "requiredStartingCashUsd",
            "extraFundingAfterOpeningUsd", "peakNeedDate", "endDeltaUsd", "endAvailableCashUsd", "comparisonValueUsd",
            "financialComparisonEligible", "endingPrincipalUsd", "creditFeasibility"], projection["curves"])
        files[prefix + "selected-days.csv"] = csv_bytes(["date", "cashBeforeReservationDeltaUsd", "knownCashBeforeReservationDeltaUsd",
            "reservedCustomerFundsUsd", "knownReservedCustomerFundsUsd", "selectedDeltaUsd", "knownSelectedDeltaUsd",
            "selectedAvailableCashUsd", "financingDeltaUsd", "drawUsd", "repaymentUsd", "interestUsd", "feeUsd"], projection["days"])
        files.update({prefix + name: data for name, data in bridge_source.export_files(original).items()})
        if projection["assessedBridge"] is not None:
            files.update({prefix + "assessment/" + name: data for name, data in bridge_source.export_files({"bridgeFunding": projection["assessedBridge"]}).items()})
        files.update({prefix + name: data for name, data in reservation_source.export_files(original).items()})
    return files
