#!/usr/bin/env python3
"""SCF Build speculative cash-gap model. Offline only; NEVER awards or moves funds.

Source rules: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines
This is a deterministic scenario calculator, NOT an eligibility or payout oracle.
"""
from __future__ import annotations

import argparse
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
import json
from pathlib import Path
import sys

AWARD_CAP = Decimal("150000")
SHARES = [Decimal("0.10"), Decimal("0.20"), Decimal("0.30"), Decimal("0.40")]
CATEGORIES = {"core-development", "frontend-ux", "verification", "release"}
EXCLUDED = {"past-work", "general-operations", "audit", "marketing", "acquisition",
            "legal", "entity-registration", "bounty", "prize-pool", "token-giveaway"}


def value(raw, field):
    try:
        number = Decimal(str(raw))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{field}: invalid decimal") from exc
    if not number.is_finite() or number < 0:
        raise ValueError(f"{field}: requires finite nonnegative decimal")
    return number


def cents(amount):
    return str(amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def whole_day(obj, field, lo=0, hi=500):
    v = obj[field]
    if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
        raise ValueError(f"{field}: requires integer between {lo} and {hi}")
    return v



def commercial_mode(data):
    return isinstance(data, dict) and data.get("funding_mode") == "COMMERCIAL_WORKSHARE"


def commercial_model(data):
    """Fee-funded proposed Workshare, using the same retained native calculator."""
    import hashlib
    if data.get("status") != "PROPOSED_UNSIGNED":
        raise ValueError("A commercial Workshare scenario remains PROPOSED_UNSIGNED.")
    if data.get("award_request_usd") is not None or data.get("milestones") not in (None, []):
        raise ValueError("A commercial proposal does not create grant requests or tranches.")
    selected = data.get("commercial")
    if not isinstance(selected, dict) or set(selected) != {"workshare", "receipt_schedule"}:
        raise ValueError("Retain the complete Workshare and explicit conditional receipt schedule.")
    source = selected["workshare"]
    if not isinstance(source, dict) or set(source) != {"case_id", "source_url", "document_sha256", "plan_sha256", "plan"}:
        raise ValueError("Retain the complete original commercial Workshare source.")
    import re
    for key in ("document_sha256", "plan_sha256"):
        if not isinstance(source[key], str) or re.fullmatch("[a-f0-9]{64}", source[key]) is None:
            raise ValueError("Retain the original Workshare SHA-256: " + key)
    for key in ("case_id", "source_url"):
        if not isinstance(source[key], str) or not source[key].strip() or len(source[key]) > 4000:
            raise ValueError("Retain the original Workshare " + key)
    plan = source["plan"]
    raw_plan = json.dumps(plan, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    if not isinstance(plan, dict) or plan.get("version") != "dealscout.workshare-plan.v1" or hashlib.sha256(raw_plan).hexdigest() != source["plan_sha256"]:
        raise ValueError("The complete original Workshare plan differs from its retained hash.")
    for key in ("title", "customer", "supplier", "outcome", "rights", "change_process"):
        if not isinstance(plan.get(key), str) or not plan[key].strip():
            raise ValueError("Retain the complete original Workshare " + key)
    quote = plan["commercial"]
    if quote.get("currency") != "USD" or quote.get("price_status") != "PROPOSED":
        raise ValueError("This native commercial mode preserves the original proposed USD Workshare.")
    fee = value(quote["amount"], "Proposed original fee")
    if fee <= 0 or fee != fee.quantize(Decimal("0.01")):
        raise ValueError("Retain the positive original fee in whole cents.")
    days = plan["schedule"]["business_days"]
    if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= 501:
        raise ValueError("Retain the original one-to-501 active-business-day delivery duration.")
    project_end = whole_day(data, "project_end_day", 0, 500)
    if project_end != days - 1:
        raise ValueError("Keep the original quoted business-day duration; revise original source to change scope.")
    phases = plan["phases"]
    if not isinstance(phases, list) or not 1 <= len(phases) <= 200:
        raise ValueError("Retain every original Workshare phase.")
    phase_map = {}
    for phase in phases:
        ident = phase["id"]
        if not isinstance(ident, str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}", ident) is None or ident in phase_map:
            raise ValueError("Retain unique original phase identities.")
        for key in ("title", "description", "acceptance", "owner"):
            if not isinstance(phase.get(key), str) or not phase[key].strip():
                raise ValueError("Retain each phase's original " + key)
        duration = phase["business_days"]
        if isinstance(duration, bool) or not isinstance(duration, int) or not 1 <= duration <= days:
            raise ValueError("Retain each original phase's active business-day duration.")
        hours = value(phase["production_hours"], "Original phase production hours")
        if hours <= 0:
            raise ValueError("Retain positive original phase production effort.")
        phase_map[ident] = phase
    for phase in phases:
        parents = phase.get("depends_on")
        if not isinstance(parents, list) or len(set(parents)) != len(parents) or any(p not in phase_map or p == phase["id"] for p in parents):
            raise ValueError("Retain the original distinct phase predecessors.")
    visiting, complete = set(), set()
    def visit(ident):
        if ident in visiting:
            raise ValueError("The original phase graph contains a cycle.")
        if ident in complete:
            return
        visiting.add(ident)
        for parent in phase_map[ident]["depends_on"]:
            visit(parent)
        visiting.remove(ident)
        complete.add(ident)
    for ident in phase_map:
        visit(ident)
    costs = data["future_costs"]
    if not isinstance(costs, list) or len(costs) != len(phases):
        raise ValueError("Retain one complete delivery-cost assumption row for every original phase.")
    normalized, selected_costs, unknown = [], {}, []
    total, total_hours = Decimal(0), Decimal(0)
    for item in costs:
        ident = item["id"]
        if ident not in phase_map or item.get("phase_id") != ident or ident in selected_costs or item.get("tranche") is not None:
            raise ValueError("Bind each commercial row to its original phase without grant tranches.")
        phase = phase_map[ident]
        start = whole_day(item, "start_day", 0, project_end)
        end = whole_day(item, "end_day", start, project_end)
        if end - start + 1 < phase["business_days"]:
            raise ValueError(ident + ": allow the original phase's full active business-day duration.")
        hours = value(item["estimated_hours"], ident + ".estimated_hours")
        if hours != value(phase["production_hours"], "Original effort"):
            raise ValueError("Keep original quoted phase effort; change its source to change scope.")
        total_hours += hours
        if not isinstance(item.get("cost_basis", ""), str) or len(item.get("cost_basis", "")) > 12000:
            raise ValueError("Retain a readable supplier-cost assumption basis.")
        raw = item.get("amount_usd")
        amount = None if raw is None else value(raw, ident + ".amount_usd")
        if amount is not None and (amount != amount.quantize(Decimal("0.01")) or not item.get("cost_basis", "").strip()):
            raise ValueError("An entered supplier cost needs whole cents and its explicit source/assumption basis.")
        if amount is None:
            unknown.append(ident)
        else:
            total += amount
        selected_costs[ident] = item
        normalized.append({"id": ident, "phase_id": ident, "amount": amount, "start": start, "end": end})
    for ident, item in selected_costs.items():
        if any(item["start_day"] <= selected_costs[p]["end_day"] for p in phase_map[ident]["depends_on"]):
            raise ValueError(ident + ": begin after all original predecessor phases complete.")
    milestones = quote["milestones"]
    schedule = selected["receipt_schedule"]
    if not isinstance(milestones, list) or not milestones or not isinstance(schedule, list) or len(schedule) != len(milestones):
        raise ValueError("Map every original proposed payment milestone once.")
    if sum((value(m["amount"], "Original milestone") for m in milestones), Decimal(0)) != fee:
        raise ValueError("The original payment milestones must sum to the original proposed fee.")
    payouts = []
    for index, (milestone, row) in enumerate(zip(milestones, schedule)):
        if not isinstance(row, dict) or set(row) != {"milestone_index", "anchor", "lag_days"} or isinstance(row["milestone_index"], bool) or row["milestone_index"] != index:
            raise ValueError("Retain one ordered original conditional-payment selection.")
        if row["anchor"] not in ("START", "FINISH"):
            raise ValueError("Select START or FINISH for the original payment condition.")
        lag = row["lag_days"]
        if isinstance(lag, bool) or not isinstance(lag, int) or not 0 <= lag <= 365:
            raise ValueError("Use an explicit payment-delay assumption from zero to365 active business days.")
        for key in ("label", "trigger"):
            if not isinstance(milestone.get(key), str) or not milestone[key].strip():
                raise ValueError("Retain each original proposed payment label and condition.")
        amount = value(milestone["amount"], "Original proposed milestone")
        if amount <= 0 or amount != amount.quantize(Decimal("0.01")):
            raise ValueError("Retain original positive whole-cent proposed milestones.")
        payouts.append({"milestone_id": "commercial-payment-" + str(index + 1), "milestone_index": index,
                        "label": milestone["label"], "usd": cents(amount),
                        "hypothetical_paid_day": (0 if row["anchor"] == "START" else project_end) + lag,
                        "release_condition": milestone["trigger"], "conditional": True})
    peak, worst, events = Decimal(0), 0, []
    cutoff = max(project_end, max(p["hypothetical_paid_day"] for p in payouts))
    event_days = {0, project_end, *[p["hypothetical_paid_day"] for p in payouts]}
    for offset in range(cutoff + 1):
        accrued = sum((c["amount"] * Decimal(max(0, min(offset, c["end"]) - c["start"] + 1)) /
                       Decimal(c["end"] - c["start"] + 1) for c in normalized if c["amount"] is not None), Decimal(0))
        receipts = sum((Decimal(p["usd"]) for p in payouts if p["hypothetical_paid_day"] <= offset), Decimal(0))
        gap = max(Decimal(0), accrued - receipts)
        if gap > peak:
            peak, worst = gap, offset
        if offset in event_days:
            events.append({"day": offset, "known_speculative_cost_usd": cents(accrued),
                           "cumulative_speculative_cost_usd": None if unknown else cents(accrued),
                           "conditional_fee_inflow_usd": cents(receipts),
                           "cash_gap_if_costs_incurred_usd": None if unknown else cents(gap)})
    return {"funding_mode": "COMMERCIAL_WORKSHARE", "status": "PROPOSED_UNSIGNED",
            "application_state": "NOT_APPLICABLE_COMMERCIAL_PROPOSAL",
            "award_request_usd": None, "proposed_fee_usd": cents(fee),
            "planned_future_costs_usd": None if unknown else cents(total),
            "known_future_costs_usd": cents(total), "cost_estimates_complete": not unknown,
            "unknown_cost_ids": unknown, "production_hours": str(total_hours), "project_end_day": project_end,
            "day_basis": "ACTIVE_BUSINESS_DAY", "workshare_case_id": source["case_id"],
            "workshare_plan_sha256": source["plan_sha256"],
            "model_assumptions": {"day_zero": "first active business day after actual agreed kickoff; no date selected by this model",
                 "accrual": "only explicitly entered supplier-cost estimates spread over each phase's active business days",
                 "release": "original proposed fee milestones conditional on their original trigger; not invoices, receipts or approval",
                 "no_assumed_award_or_team": "no grant, agreement, payment, staffing or unknown supplier costs are inferred"},
            "milestones": [{"phase_id": p["id"], "title": p["title"], "owner": p["owner"],
                            "submit_day": selected_costs[p["id"]]["end_day"], "deliverable": p["description"],
                            "proof": p["acceptance"]} for p in phases],
            "payouts": payouts, "cashflow_events": events,
            "peak_prefunding_gap_usd": None if unknown else cents(peak),
            "known_peak_prefunding_gap_usd": cents(peak), "peak_gap_day": None if unknown else worst,
            "xlm_price_scenarios_not_live_quotes": [],
            "critical_unknowns": ["Customer agreement and actual kickoff", "Actual receiving operator and host authorization",
                                 "Supplier-cost estimates for: " + (", ".join(unknown) if unknown else "all phases explicitly entered"),
                                 "Actual payment and acceptance observations"],
            "source_urls": [source["source_url"]]}

def model(data):
    if commercial_mode(data):
        return commercial_model(data)
    if data.get("funding_mode") not in (None, "SCF_GRANT"):
        raise ValueError("Use a supported explicit planning funding mode.")
    if data.get("status") != "ILLUSTRATIVE_UNSENT":
        raise ValueError("status must be ILLUSTRATIVE_UNSENT (not an award/application)")
    award = value(data["award_request_usd"], "award_request_usd")
    if not Decimal("0") < award <= AWARD_CAP:
        raise ValueError("award request must be greater than zero and <= USD 150,000")
    project_end = whole_day(data, "project_end_day", 1, 180)
    milestone_data = data["milestones"]
    if [m.get("tranche") for m in milestone_data] != [1, 2, 3]:
        raise ValueError("exactly three future, ordered milestone tranches #1, #2, #3 required")
    if not data.get("team_budget_inputs_are_hypothetical"):
        raise ValueError("example budget may not be presented as verified team costs")
    payment_days = [0]
    reviewed = []
    prior_submit = 0
    for m in milestone_data:
        submit = whole_day(m, "submit_day", 1, project_end)
        lag = whole_day(m, "review_and_payment_lag_days", 0, 90)
        if submit <= prior_submit:
            raise ValueError("milestone submission days must be strictly increasing")
        # This conservative cash-flow model releases tranches in sequence.
        # Later reviews cannot fund a milestone before its predecessor was paid.
        # Reject early-submission scenarios rather than displaying impossible
        # tranche receipt order or a misleading peak prefunding gap.
        if submit < payment_days[-1]:
            raise ValueError(
                f"tranche {m['tranche']}: submission day {submit} precedes "
                f"previous modeled payment day {payment_days[-1]}"
            )
        if submit - payment_days[-1] > 90:
            raise ValueError(f"tranche {m['tranche']} is >90 days after last modeled payment")
        if not str(m.get("measurable_proof", "")).strip() or not str(m.get("deliverable", "")).strip():
            raise ValueError("each tranche requires verifiable proof and deliverable")
        payment_days.append(submit + lag)
        reviewed.append({"tranche": m["tranche"], "submit_day": submit,
                         "hypothetical_paid_day": submit + lag,
                         "days_after_prior_payment": submit - payment_days[-2],
                         "proof": m["measurable_proof"], "deliverable": m["deliverable"]})
        prior_submit = submit
    if prior_submit != project_end:
        raise ValueError("tranche #3 must finish at the declared project end day")

    costs = data["future_costs"]
    if not costs:
        raise ValueError("at least one future deliverable cost required")
    seen = set()
    total = Decimal("0")
    normalized = []
    for item in costs:
        cid = str(item["id"])
        if cid in seen:
            raise ValueError(f"duplicate cost id: {cid}")
        seen.add(cid)
        cat = str(item["category"])
        if cat in EXCLUDED or cat not in CATEGORIES:
            raise ValueError(f"{cid}: category '{cat}' not eligible in this conservative model")
        start = whole_day(item, "start_day", 0, project_end)
        end = whole_day(item, "end_day", start, project_end)
        usd = value(item["amount_usd"], f"{cid}.amount_usd")
        if usd == 0:
            raise ValueError(f"{cid}: zero-cost rows obscure actual work")
        tranche = whole_day(item, "tranche", 1, 3)
        if not item.get("future_only", False):
            raise ValueError(f"{cid}: past/unverified work may not be reimbursed")
        if not str(item.get("measurable_proof", "")).strip():
            raise ValueError(f"{cid}: measurable proof required")
        if end > reviewed[tranche - 1]["submit_day"]:
            raise ValueError(f"{cid}: cost after its tranche deliverable deadline")
        total += usd
        normalized.append({"id":cid, "category":cat, "amount":usd,
                           "start":start, "end":end, "tranche":tranche})
    if total != award:
        raise ValueError(f"total modeled future costs USD {total} must equal requested {award} (no padding)")
    payments = [{"tranche":i, "usd":cents(award * SHARES[i]),
                 "hypothetical_paid_day":payment_days[i],
                 "release_condition":("award accepted" if i == 0 else
                                      f"tranche {i} deliverables reviewed and accepted")}
                for i in range(4)]
    # Even distribution of each speculative cost across its specified inclusive day span.
    # This is an assumed accrual profile, not actual time sheets, liabilities or provider invoices.
    def cost_accrued(day):
        acc = Decimal("0")
        for c in normalized:
            length = c["end"] - c["start"] + 1
            elapsed = max(0, min(day, c["end"]) - c["start"] + 1)
            acc += c["amount"] * Decimal(elapsed) / Decimal(length)
        return acc
    rows = []
    deficit_peak = Decimal("0")
    worst_day = 0
    events = set(payment_days + [m["submit_day"] for m in reviewed] + [0,project_end])
    cutoff = max(project_end, max(payment_days))
    for day in range(cutoff + 1):
        spent = cost_accrued(day)
        received = sum((award * SHARES[i] for i,p in enumerate(payment_days) if p <= day),
                       Decimal("0"))
        gap = max(Decimal("0"), spent - received)
        if gap > deficit_peak:
            deficit_peak, worst_day = gap, day
        if day in events:
            rows.append({"day":day, "cumulative_speculative_cost_usd":cents(spent),
                         "hypothetical_tranches_received_usd":cents(received),
                         "cash_gap_if_costs_incurred_usd":cents(gap)})
    sensitivities = []
    for raw in data.get("illustrative_xlm_usd_at_payment", []):
        price = value(raw, "illustrative_xlm_usd_at_payment")
        if price <= 0:
            raise ValueError("XLM price scenario must be positive")
        sensitivities.append({"illustrative_usd_per_xlm_NOT_QUOTE":str(price),
                              "xlm_by_tranche_if_that_price_applied": [
                                  str((award * share / price).quantize(Decimal("0.0000001"),
                                      rounding=ROUND_HALF_UP)) for share in SHARES]})
    return {
        "status":"ILLUSTRATIVE_UNSENT_NOT_GRANTED",
        "application_state":data.get("application_state", "NOT_REPORTED_BY_THIS_SCENARIO"),
        "award_request_usd":cents(award),
        "planned_future_costs_usd":cents(total),
        "project_end_day":project_end,
        "model_assumptions":{"day_zero":"hypothetical award acceptance, not actual",
                             "accrual":"each future cost incurred evenly through inclusive start/end days",
                             "release":"tranche 0 day 0; later payments after assumed review lag",
                             "no_assumed_award_or_team":"all costs and dates require human sourcing"},
        "milestones":reviewed,
        "payouts":payments,
        "cashflow_events":rows,
        "peak_prefunding_gap_usd":cents(deficit_peak),
        "peak_gap_day":worst_day,
        "xlm_price_scenarios_not_live_quotes":sensitivities,
        "critical_unknowns":data.get("planning_inputs_to_complete", [
            "award and milestone-specific acceptance terms",
            "actual contributor capacity, rates and incremental service costs",
            "actual review/payment lag and source of working capital",
            "calendar dates corresponding to modeled day offsets"]),
        "source_urls":[
            "https://stellar.gitbook.io/scf-handbook/scf-awards/build-award",
            "https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines",
            "https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/rfp-track"
        ]
    }


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("scenario", type=Path, help="local example/edited scenario JSON")
    p.add_argument("--out", type=Path, help="optional local output JSON (never submits)")
    args = p.parse_args(argv)
    try:
        result = model(json.loads(args.scenario.read_text(encoding="utf-8")))
        rendered = json.dumps(result, indent=2) + "\n"
        if args.out:
            args.out.write_text(rendered, encoding="utf-8")
            print(f"wrote {args.out}", file=sys.stderr)
        else:
            sys.stdout.write(rendered)
        return 0
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
        print(f"INVALID illustrative scenario: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
