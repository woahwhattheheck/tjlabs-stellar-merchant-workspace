"""Optional explicit USD bridge schedules over the unchanged operating forecast.

Amounts are entered assumptions or documented terms. This module never derives an
interest rate, writes a financial observation, or treats borrowed cash as revenue.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

import operations_domain as domain
from model import canonical, csv_bytes, short_id, text

SCHEMA = "stellar-forge.sf47-bridge-funding.v1"
ZERO = Decimal("0")
CENT = Decimal("0.01")
KINDS = ("DRAW", "REPAYMENT", "INTEREST", "FEE")


def money(value):
    return None if value is None else format(Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP), ".2f")


def obj(value, allowed, label):
    if not isinstance(value, dict) or set(value) - set(allowed):
        domain.fail(label + ": use the declared facility fields.", "INVALID_FORECAST_BRIDGE")
    return value


def rows(value, maximum, label):
    if not isinstance(value, list) or len(value) > maximum or any(not isinstance(r, dict) for r in value):
        domain.fail(label + ": use at most " + str(maximum) + " object rows.", "INVALID_FORECAST_BRIDGE")
    return value


def normalize(context, raw, as_of, last):
    obj(raw, ("facilities", "note"), "Bridge funding")
    result, seen = [], set()
    for row in rows(raw.get("facilities", []), 30, "Facilities"):
        obj(row, ("id", "name", "currency", "openingPrincipalUsd", "creditLimitUsd",
                  "availableDate", "maturityDate", "termsBasis", "sourceIds", "note", "events"), "Facility")
        ident = short_id(row.get("id"), "Facility identity")
        if ident in seen:
            domain.fail("Facility identities must be distinct.", "INVALID_FORECAST_BRIDGE")
        seen.add(ident)
        if row.get("currency") != "USD":
            domain.fail("This facility schedule is explicitly in USD. Retain other-currency terms as source evidence; do not relabel native amounts.", "INVALID_FORECAST_BRIDGE")
        def amount(value, label):
            return None if value in (None, "") else domain.usd(value, label)
        available = domain.calendar(row.get("availableDate"), "Facility availability date", True)
        maturity = domain.calendar(row.get("maturityDate"), "Facility maturity date", True)
        if available and maturity and maturity < available:
            domain.fail("A facility maturity date cannot precede its availability.", "INVALID_FORECAST_BRIDGE")
        events, event_ids = [], set()
        for event in rows(row.get("events", []), 200, "Facility events"):
            obj(event, ("id", "kind", "amountUsd", "date", "note"), "Facility event")
            eid = short_id(event.get("id"), "Facility event identity")
            if eid in event_ids:
                domain.fail("Event identities must be distinct within each facility.", "INVALID_FORECAST_BRIDGE")
            event_ids.add(eid)
            stamp = domain.calendar(event.get("date"), "Facility cash date", True)
            if stamp and not as_of < stamp <= last:
                domain.fail("Facility cash dates must follow the as-of date and remain within the original three-year horizon. Include existing principal in the opening balance.", "INVALID_FORECAST_BRIDGE")
            events.append({"id": eid,
                "kind": domain.enum(event.get("kind"), KINDS, "Facility event kind"),
                "amountUsd": amount(event.get("amountUsd"), "Explicit facility event amount"),
                "date": stamp, "note": text(event.get("note", ""), "Facility event basis", 4000)})
        basis = domain.enum(row.get("termsBasis", "NOT_ENTERED"),
            ("NOT_ENTERED", "DOCUMENTED_TERMS", "PLANNING_ASSUMPTION"), "Facility terms basis")
        sources = domain.reference_list(row.get("sourceIds", []), context["sources"], "Facility sources")
        note = text(row.get("note", ""), "Facility terms, currency and cost basis", 8000)
        opening = amount(row.get("openingPrincipalUsd"), "Principal outstanding at end of as-of date")
        limit = amount(row.get("creditLimitUsd"), "Stated outstanding-principal limit")
        if (opening is not None or limit is not None or available or maturity or events) and (basis == "NOT_ENTERED" or not note):
            domain.fail("Retain an explicit terms basis and note for each authored facility schedule.", "INVALID_FORECAST_BRIDGE")
        if basis == "DOCUMENTED_TERMS" and not sources:
            domain.fail("Documented facility terms need at least one retained original source.", "INVALID_FORECAST_BRIDGE")
        result.append({"id": ident, "name": text(row.get("name"), "Facility name", 200, True),
            "currency": "USD", "openingPrincipalUsd": opening, "creditLimitUsd": limit,
            "availableDate": available, "maturityDate": maturity, "termsBasis": basis,
            "sourceIds": sources, "note": note, "events": events})
    return {"facilities": result, "note": text(raw.get("note", ""), "Bridge funding note", 8000)}


def build(report, inputs, *, assessment_end=None):
    """Keep original cash/expense results intact; append an explicit financing view."""
    issues, facilities, events, debt_days = [], [], [], []
    grouped = defaultdict(lambda: defaultdict(lambda: ZERO))
    as_of = report["asOfDate"]
    all_stamps = [as_of, report["lastForecastDate"], *[e["date"] for f in inputs["facilities"] for e in f["events"] if e["date"]]]
    if assessment_end is not None:
        # Explicit caller window; absent keeps every original saved Forecast exact.
        stamp = domain.calendar(assessment_end, "Facility assessment end")
        if stamp < max(all_stamps):
            domain.fail("The facility assessment cannot omit original dated cash.", "INVALID_FORECAST_BRIDGE")
        all_stamps.append(stamp)
    cash_complete, debt_complete = True, True

    def issue(code, fid, message, eid=None):
        value = {"code": code, "id": fid, "message": message}
        if eid is not None:
            value["eventId"] = eid
        issues.append(value)

    for facility in inputs["facilities"]:
        fid = facility["id"]
        opening = None if facility["openingPrincipalUsd"] is None else Decimal(facility["openingPrincipalUsd"])
        limit = None if facility["creditLimitUsd"] is None else Decimal(facility["creditLimitUsd"])
        principal = opening
        complete = opening is not None
        dated_complete = True
        totals = {kind: ZERO for kind in KINDS}
        buckets = defaultdict(list)
        if opening is None:
            issue("OPENING_PRINCIPAL_REQUIRED", fid, "Opening outstanding principal is unknown; it is never inferred from opening cash.")
        if limit is None:
            issue("FACILITY_LIMIT_REQUIRED", fid, "The outstanding-principal limit is unknown; planned credit availability is unresolved.")
        if not facility["availableDate"]:
            issue("FACILITY_AVAILABILITY_REQUIRED", fid, "Availability is undated; entered draw dates remain assumptions and do not establish access to credit.")
        if not facility["maturityDate"]:
            issue("FACILITY_MATURITY_REQUIRED", fid, "Maturity is undated; remaining principal has no inferred repayment date.")
        peak, peak_date = opening, as_of
        breaches, overpayments = [], []
        if opening is not None and limit is not None and opening > limit:
            breaches.append(as_of)
            issue("FACILITY_LIMIT_EXCEEDED", fid, "Opening outstanding principal already exceeds the entered credit limit.")
        for entry in facility["events"]:
            event = {**deepcopy(entry), "facilityId": fid, "facilityName": facility["name"],
                "currency": "USD", "cashEffectUsd": None, "principalEffectUsd": None, "financingExpenseUsd": None}
            amount = None if entry["amountUsd"] is None else Decimal(entry["amountUsd"])
            stamp = entry["date"]
            if amount is None or stamp is None:
                dated_complete = False
                cash_complete = False
                if entry["kind"] in ("DRAW", "REPAYMENT"):
                    complete = False
                issue("FACILITY_EVENT_UNRESOLVED", fid, "Retain the missing cash date and/or explicit amount before treating the financing schedule as complete.", entry["id"])
            if amount is not None:
                sign = 1 if entry["kind"] == "DRAW" else -1
                event["cashEffectUsd"] = money(sign * amount)
                event["principalEffectUsd"] = money(amount if entry["kind"] == "DRAW" else -amount if entry["kind"] == "REPAYMENT" else ZERO)
                event["financingExpenseUsd"] = money(amount if entry["kind"] in ("INTEREST", "FEE") else ZERO)
            if stamp is not None:
                all_stamps.append(stamp)
                buckets[stamp].append(event)
                if amount is not None:
                    grouped[stamp][entry["kind"]] += amount
                    totals[entry["kind"]] += amount
                if entry["kind"] == "DRAW" and facility["availableDate"] and stamp < facility["availableDate"]:
                    issue("DRAW_BEFORE_AVAILABILITY", fid, "This draw precedes the entered availability date.", entry["id"])
                if facility["maturityDate"] and stamp > facility["maturityDate"]:
                    if entry["kind"] == "DRAW":
                        issue("DRAW_AFTER_MATURITY", fid, "This draw falls after the entered maturity; no extension is assumed.", entry["id"])
                    elif entry["kind"] in ("INTEREST", "FEE"):
                        issue("COST_AFTER_MATURITY_REVIEW", fid, "This explicitly entered financing cost is paid after principal maturity. Review its original billing terms; maturity alone does not determine the cost payment date.", entry["id"])
            events.append(event)
        # Unknown undated principal changes make every dated balance conditional.
        if any(e["kind"] in ("DRAW", "REPAYMENT") and e["date"] is None for e in facility["events"]):
            principal = None
        debt_days.append({"facilityId": fid, "date": as_of, "openingPrincipalUsd": money(opening),
            "drawUsd": "0.00", "repaymentUsd": "0.00", "peakBeforeRepaymentUsd": money(principal),
            "closingPrincipalUsd": money(principal), "creditLimitUsd": money(limit)})
        for stamp, day_events in sorted(buckets.items()):
            before = principal
            changes = [e for e in day_events if e["kind"] in ("DRAW", "REPAYMENT")]
            if any(e["amountUsd"] is None for e in changes):
                principal = None
            draw = sum((Decimal(e["amountUsd"]) for e in changes if e["kind"] == "DRAW" and e["amountUsd"] is not None), ZERO)
            repayment = sum((Decimal(e["amountUsd"]) for e in changes if e["kind"] == "REPAYMENT" and e["amountUsd"] is not None), ZERO)
            day_peak = None if principal is None else principal + draw
            if day_peak is not None:
                if peak is None or day_peak > peak:
                    peak, peak_date = day_peak, stamp
                if limit is not None and day_peak > limit:
                    breaches.append(stamp)
                    issue("FACILITY_LIMIT_EXCEEDED", fid, "Outstanding principal including all same-day draws exceeds the limit before repayments.")
                principal = day_peak - repayment
                if principal < ZERO:
                    overpayments.append(stamp)
                    issue("PRINCIPAL_REPAYMENT_EXCEEDS_DEBT", fid, "Entered repayment exceeds known outstanding principal; the cash outflow is retained and debt is unresolved from this date.")
                    principal = None
                    complete = False
            debt_days.append({"facilityId": fid, "date": stamp, "openingPrincipalUsd": money(before),
                "drawUsd": money(draw), "repaymentUsd": money(repayment), "peakBeforeRepaymentUsd": money(day_peak),
                "closingPrincipalUsd": money(principal), "creditLimitUsd": money(limit)})
        maturity_principal = None
        if facility["maturityDate"] and facility["maturityDate"] <= max(all_stamps):
            cutoff = max(as_of, facility["maturityDate"])
            at_maturity = [d for d in debt_days if d["facilityId"] == fid and d["date"] <= cutoff][-1]
            maturity_principal = money(opening) if facility["maturityDate"] <= as_of else at_maturity["closingPrincipalUsd"]
            if maturity_principal is None:
                issue("PRINCIPAL_AT_MATURITY_REVIEW", fid, "Outstanding principal at the entered maturity (or as-of date for an already matured facility) is unresolved. Retain an explicit repayment plan.")
            elif Decimal(maturity_principal) > ZERO:
                issue("PRINCIPAL_DUE_AT_MATURITY", fid, "Known principal remains at the entered maturity (or as-of date for an already matured facility). Later payments do not satisfy that original date; no extension or automatic payment is assumed.")
        if not complete:
            debt_complete = False
        facility_issues = [x for x in issues if x["id"] == fid]
        feasibility = "EXCEEDS" if breaches or overpayments or any(x["code"] in ("DRAW_BEFORE_AVAILABILITY", "DRAW_AFTER_MATURITY", "PRINCIPAL_DUE_AT_MATURITY") for x in facility_issues) else (
            "UNRESOLVED" if not complete or not dated_complete or limit is None or not facility["availableDate"] or not facility["maturityDate"] or any(x["code"] == "PRINCIPAL_AT_MATURITY_REVIEW" for x in facility_issues) else "WITHIN_ENTERED_OUTSTANDING_CAP")
        facilities.append({**deepcopy(facility), "datedCashComplete": dated_complete, "principalComplete": complete,
            "principalAtMaturityUsd": maturity_principal,
            "endingPrincipalUsd": money(principal) if complete else None,
            "knownDatedEndingPrincipalUsd": money(principal), "peakPrincipalUsd": money(peak) if complete else None,
            "peakPrincipalDate": peak_date if complete else None, "creditFeasibility": feasibility,
            "limitExceededDates": sorted(set(breaches)), "overpaymentDates": overpayments,
            "datedDrawUsd": money(totals["DRAW"]), "datedRepaymentUsd": money(totals["REPAYMENT"]),
            "datedInterestUsd": money(totals["INTEREST"]), "datedFeeUsd": money(totals["FEE"])})

    end = max(all_stamps)
    original_days = {row["date"]: row for row in report["days"]}
    opening_cash = report["openingCash"]["amountUsd"]
    opening_cash = None if opening_cash is None else Decimal(opening_cash)
    scenario_names = ("spendingOnly", "conditionalGrant", "commercial")
    native_complete = report.get("currencyValuation", {}).get("datedCashComplete", True)
    days, financing_delta = [], ZERO
    last_base = {key: ZERO for key in scenario_names}
    minima = {key: {"delta": ZERO, "date": as_of} for key in scenario_names}
    for offset in range((date.fromisoformat(end) - date.fromisoformat(as_of)).days + 1):
        stamp = (date.fromisoformat(as_of) + timedelta(days=offset)).isoformat()
        changes = grouped[stamp]
        financing_delta += changes["DRAW"] - changes["REPAYMENT"] - changes["INTEREST"] - changes["FEE"]
        original = original_days.get(stamp)
        row = {"date": stamp, "drawUsd": money(changes["DRAW"]), "repaymentUsd": money(changes["REPAYMENT"]),
            "interestUsd": money(changes["INTEREST"]), "feeUsd": money(changes["FEE"]), "financingDeltaUsd": money(financing_delta)}
        for key in scenario_names:
            if original:
                value = original.get("knownCommercialDeltaUsd") if key == "commercial" and "knownCommercialDeltaUsd" in original else original[key + "DeltaUsd"]
                if value is not None:
                    last_base[key] = Decimal(value)
            delta = last_base[key] + financing_delta
            if delta < minima[key]["delta"]:
                minima[key] = {"delta": delta, "date": stamp}
            valid = cash_complete and (key != "commercial" or native_complete)
            row[key + "UnfinancedDeltaUsd"] = money(last_base[key])
            row[key + "KnownFinancedDeltaUsd"] = money(delta)
            row[key + "FinancedDeltaUsd"] = money(delta) if valid else None
            row[key + "FinancedBalanceUsd"] = money(opening_cash + delta) if valid and opening_cash is not None else None
        days.append(row)
    scenarios = {}
    for key in scenario_names:
        delta = last_base[key] + financing_delta
        need = max(ZERO, -minima[key]["delta"])
        known = {"additionalCashNeededUsd": money(need),
            "gapAfterOpeningCashUsd": None if opening_cash is None else money(max(ZERO, need - opening_cash)),
            "peakNeedDate": minima[key]["date"], "endDeltaUsd": money(delta),
            "endBalanceUsd": None if opening_cash is None else money(opening_cash + delta)}
        valid = cash_complete and (key != "commercial" or native_complete)
        scenarios[key] = {**(known if valid else {k: None for k in known}), "datedCashComplete": valid,
            "knownDatedPortion": known, "unfinanced": deepcopy(report["scenarios"][key])}
    return {"schema": SCHEMA, "currency": "USD", "asOfDate": as_of, "lastForecastDate": end,
        "basis": "Entered USD schedules only. Opening principal is liability already outstanding and adds no cash. Draws add cash and principal; repayments reduce both; entered interest and fees reduce cash without reducing principal. Original operating revenue, expense and customer reservations remain unchanged.",
        "ordering": "Daily cash is end-of-day, not an intraday liquidity guarantee. Facility limits use opening principal plus ALL same-day draws BEFORE any repayment. No revolving redraw, rate, automatic interest, maturity payment, fee or commitment is inferred.",
        "datedCashComplete": cash_complete, "principalComplete": debt_complete,
        "openingPrincipalUsd": money(sum((Decimal(f["openingPrincipalUsd"]) for f in facilities), ZERO)) if all(f["openingPrincipalUsd"] is not None for f in facilities) else None,
        "endingPrincipalUsd": money(sum((Decimal(f["endingPrincipalUsd"]) for f in facilities), ZERO)) if debt_complete else None,
        "datedFinancingExpenseUsd": money(sum((Decimal(e["amountUsd"]) for e in events if e["kind"] in ("INTEREST", "FEE") and e["date"] and e["amountUsd"] is not None), ZERO)) if all(e["date"] and e["amountUsd"] is not None for e in events if e["kind"] in ("INTEREST", "FEE")) else None,
        "creditFeasibility": "EXCEEDS" if any(f["creditFeasibility"] == "EXCEEDS" for f in facilities) else "UNRESOLVED" if any(f["creditFeasibility"] == "UNRESOLVED" for f in facilities) else "WITHIN_ENTERED_OUTSTANDING_CAP",
        "availabilityBasis": "The entered limit is an outstanding-principal cap only. Being within that cap is not evidence of an available commitment or permission to reborrow; non-revolving historical utilization and draw conditions must be reviewed in the original source terms.",
        "facilities": facilities, "events": sorted(events, key=lambda e: (e["date"] or "", e["facilityId"], e["id"])),
        "principalDays": debt_days, "days": days, "scenarios": scenarios, "issues": issues,
        "note": inputs["note"]}


def export_files(report):
    if "bridgeFunding" not in report:
        return {}
    bridge = report["bridgeFunding"]
    return {
        "bridge-funding.json": (canonical(bridge) + "\n").encode(),
        "bridge-facilities.csv": csv_bytes(["id", "name", "currency", "termsBasis", "openingPrincipalUsd",
            "creditLimitUsd", "availableDate", "maturityDate", "endingPrincipalUsd", "peakPrincipalUsd",
            "peakPrincipalDate", "creditFeasibility", "datedDrawUsd", "datedRepaymentUsd",
            "datedInterestUsd", "datedFeeUsd", "note"], bridge["facilities"]),
        "bridge-cash-events.csv": csv_bytes(["facilityId", "facilityName", "id", "kind", "date", "amountUsd",
            "cashEffectUsd", "principalEffectUsd", "financingExpenseUsd", "note"], bridge["events"]),
        "bridge-principal.csv": csv_bytes(["facilityId", "date", "openingPrincipalUsd", "drawUsd",
            "repaymentUsd", "peakBeforeRepaymentUsd", "closingPrincipalUsd", "creditLimitUsd"], bridge["principalDays"]),
        "bridge-financed-cash.csv": csv_bytes(["date", "drawUsd", "repaymentUsd", "interestUsd", "feeUsd",
            "financingDeltaUsd", *[key + suffix for key in ("spendingOnly", "conditionalGrant", "commercial")
                for suffix in ("UnfinancedDeltaUsd", "KnownFinancedDeltaUsd", "FinancedDeltaUsd", "FinancedBalanceUsd")]], bridge["days"]),
        "bridge-issues.csv": csv_bytes(["code", "id", "eventId", "message"], bridge["issues"]),
    }
