# Explicit bridge funding in the original Forecast

The existing Forecast now accepts an optional set of named USD financing facilities. Enter existing principal, an outstanding-principal cap, original availability and maturity dates, planned draws, principal repayments, and separately entered interest and fees. Preview, save, workbook return, option comparison, full reports and cold case receiving use the original Forecast paths.

## Accounting and timing

Opening principal is debt already outstanding at the end of the as-of date. It does not create opening cash. If some borrowed proceeds remain available, include them once in the original opening-cash balance with that balance's original basis and source.

A DRAW adds cash and principal. A REPAYMENT reduces cash and principal without becoming operating expense. INTEREST and FEE reduce cash and appear as financing expenses without reducing principal. Enter their actual planned payment dates and explicit amounts. The calculator does not derive an interest rate, accrue interest, capitalize costs, assume a maturity repayment, infer a borrowing commitment, or record a payment.

All amounts in this optional schedule are explicitly USD. Preserve original foreign-currency loan documents as source evidence. Prepare and explain any USD schedule separately; never relabel a native amount as USD. The existing customer currency/FX model and original financial records remain unchanged.

The entered credit limit is an **outstanding-principal cap**, not a cumulative loan commitment. A repayment does not prove that a non-revolving loan can be drawn again. Review original utilization, draw conditions, lender availability and any extension in the retained source terms. WITHIN_ENTERED_OUTSTANDING_CAP describes the entered arithmetic and dates; it is not permission or confirmation to borrow.

For each day, the cap check uses opening principal plus **all same-day draws before any repayment**. A repayment therefore cannot conceal that day's required credit. Cash curves are end-of-day totals and do not establish intraday liquidity.

Principal at maturity is checked at that date, before later repayments. A known remaining balance produces PRINCIPAL_DUE_AT_MATURITY. An unknown balance remains unresolved. Draws before availability or after maturity are exceptions. A separately documented interest or fee payment after principal maturity produces a source-term review, since maturity alone does not establish that cost's billing date. Entered cash events remain intact for correction.

## Prepare the whole schedule

1. Open the original operating case and Forecast. Reforecast an existing immutable edition or continue its unfinished working state.
2. Open **Optional bridge funding**, add a named facility, and enter principal outstanding at the as-of date. Enter explicit zero if no principal is outstanding; blank means unknown.
3. Enter the outstanding-principal cap and original facility dates. Facility dates may precede the forecast as-of date. Future cash events must follow the as-of date and fit the original three-year forecast horizon.
4. Select Documented terms or Planning assumption and retain the explanatory note. Documented terms require an original case source attachment. Include outstanding utilization and draw conditions in the source review.
5. Add every planned draw, repayment, interest payment and fee as a distinct stable event. Dates and amounts can remain blank during drafting and preview. Those unknowns remain visible instead of becoming zero.
6. Preview the current case and review unfinanced cash, financed cash, ending principal, all event effects, daily cap progression and source/date findings together. Fix the original entered values directly in the same editor.
7. Save through the original Forecast save. Its existing case version, preview identity and retained request protect the complete source calculation. A reconnect resumes the original request and does not create another financial action.

The original operating report's scenarios, cash events, costs, work hours and customer reservations remain unchanged. The optional report.bridgeFunding is a separate overlay. Borrowing is never added to commercial revenue or used to erase original unpaid invoices. A financed pooled-cash result does not replace the independent customer-fund protection result.

## Unknowns and completeness

Cash-schedule completeness is distinct from debt and lending availability.

- Unknown opening principal or credit limit leaves the known dated cash schedule usable while debt or cap feasibility stays unresolved.
- Missing event dates or amounts make the complete financed result unresolved. Its knownDatedPortion remains an explicitly labeled partial calculation.
- Unknown principal changes prevent a complete liability result; principal repayment exceeding known debt preserves the entered cash outflow and reports the inconsistency instead of clipping it.
- Missing availability or maturity dates remain source-term decisions.
- All original native-currency coverage and undated delivery obligations stay visible beside the financing overlay.

An empty optional schedule is an explicit empty selection. Removing the optional schedule restores the input without bridgeFunding. Existing forecasts that never included bridgeFunding retain the same schema, engine version, normalization, report values and saved preview identity.

## Exact input contract

The optional top-level member is bridgeFunding:

~~~json
{
  "facilities": [{
    "id": "facility-example",
    "name": "Named facility",
    "currency": "USD",
    "openingPrincipalUsd": "200.00",
    "creditLimitUsd": "1000.00",
    "availableDate": "2026-10-01",
    "maturityDate": "2026-12-31",
    "termsBasis": "PLANNING_ASSUMPTION",
    "sourceIds": [],
    "note": "Explicit example schedule and outstanding-principal cap; review original contractual draw conditions.",
    "events": [
      {"id": "draw", "kind": "DRAW", "amountUsd": "400.00", "date": "2026-10-15", "note": "Entered draw assumption"},
      {"id": "repayment", "kind": "REPAYMENT", "amountUsd": "100.00", "date": "2026-10-16", "note": "Entered principal repayment"},
      {"id": "fee", "kind": "FEE", "amountUsd": "10.00", "date": "2026-10-16", "note": "Explicit fee"}
    ]
  }],
  "note": "Illustrative arithmetic, not an actual lending arrangement."
}
~~~

The reference arithmetic with opening cash 50 and an original operating outflow 300 on October15 ends with cash 40 and principal 500 on October16. Original operating outflow remains 300; the 100 repayment is principal settlement and the 10 fee is financing expense. The 400 draw is cash from borrowing. This is a model example; actual native receiving must use the selected original case and separately identify any commissioning fixture.

Limits are 30 facilities and 200 events per facility, within the original three-year cash horizon. Stable facility and event IDs, sources, notes and explicit null/zero values survive every supported return.

## Workbooks and concurrent edits

New preparation workbooks retain bridgeFundingVersion:1 in their hidden Original source and include three additional worksheets:

| Sheet | Contents |
| --- | --- |
| Bridge settings | Optional presence and the whole-schedule note |
| Facilities | Stable facility ID, UPSERT/REMOVE, name, USD units, opening principal, outstanding cap, original dates, terms basis, source IDs and note |
| Facility events | Facility ID, stable event ID, UPSERT/REMOVE, kind, amount, date and note |

Bridge settings uses present / VALUE / true to include the schedule; present / MISSING / empty removes it. Blank money or dates remain unknown. Explicit zero remains zero. Source IDs are exact JSON arrays of attachments already retained by the original case.

A missing row preserves the original row; REMOVE explicitly removes it. Removing a facility also removes its dependent event rows from the adopted assumptions. Complete original inputs remain in the hidden Original sheet and original-forecast.json.

Old workbooks keep their original 13-sheet edition and exact retained return. They remain receivable and their old pending requests remain valid. To author facility sheets, export a current preparation workbook rather than adding new sheet names to an old baseline. Worksheet projection handles opening principal and cap as exact decimals, matching existing monetary fields.

The existing three-way return review merges facility and event rows by their stable IDs. Independently edited fields retain current-versus-returned choices. Applying a reviewed workbook retains its full source before preview; it does not write cash or debt records. Full working downloads retain incomplete fields, exact returned bytes, choices, displaced drafts and the original pending source/save request.

## Financing studies and saved comparisons

Capture full options from the original editor. Each option retains its whole facility schedule, original raw unfinished controls, history and original native preview.

The comparison displays the original unfinanced need alongside financed starting need, financed gap, ending cash, ending principal, explicit dated interest/fees and entered cap/date feasibility. Source context and selected work remain reviewable.

Planning limits adds Financed conditional grant cash and Financed combined pooled cash as explicit cash bases. Selecting one also checks whether the entered principal caps and dates are satisfied. Unknown facility terms remain unresolved. Optional maximum ending principal and explicit financing-cost limits allow borrowing and financing expense to be assessed beside cash and capacity. Blank limits are absent; zero is explicit. Earlier criteria without these fields recompute unchanged. Shortlists remain limited to matching original scope, capacity and relevant horizon, and do not constitute a loan approval.

Original saved Forecast comparison includes bridge facility rows, exact cash events, financed days, principal days and bridge impact measures only when one selected edition includes them. Both complete immutable originals remain included.

## Export, reopen and installation

The complete saved Forecast ZIP conditionally adds:

- bridge-funding.json
- bridge-facilities.csv
- bridge-cash-events.csv
- bridge-principal.csv
- bridge-financed-cash.csv
- bridge-issues.csv

The original manifest hashes every complete file. Original dated-cash and operating-cost exports retain their original meaning. The complete financing handover provides standalone readable tables and CSVs for every facility, event, principal day, financed cash day and exception, together with full input/report fields, editable study, source bytes and history.

Use the existing whole operations-case export/import to reopen the saved editions with their original source snapshots and attachments. Use the complete working file to resume an unfinished editor or the complete study to resume option analysis. Source collection uses managed-source.json, which now includes forecast_bridge_funding.py, forecast-bridge-funding.mjs and this guide; the original native HTTP preview/save/export routes are unchanged.

## Original native receiving continuation

Continue SCF-FORECAST-BRIDGE-FUNDING-675D-20261013 in the existing Forecast case-planning / financing receiving owner and directory. Preserve accepted original source selections, previous saved reports, case history, browser working state and pending requests.

Install the complete current source through the original managed source route. Reopen original saved forecasts without bridgeFunding and compare their complete preview/report identity. In a separately identified planning scenario, use the whole editor to add a facility, enter a missing amount/date, reopen the unfinished working file, complete the schedule, preview and save. Exercise workbook export/return with an independent field edit, captured financing options, explicit cash/debt/cost criteria, complete standalone report/ZIP, saved comparison and cold original-case receiving. Return the first actual exception to this feature's source owner.

Before any human-facing presentation, follow the repository's original owner instruction: open/run/render the exact outgoing version, LOOK at it and use it as its recipient would. View actual screenshots at desktop and a relevant narrow width; operate populated, empty, loading and error states, downloads and reopened exports. Open usable ZIP contents and every applicable report/PDF page and attachment. Fix clipping, overflow, unreadable tables or controls in the same source. Source review and a peer's approval do not replace that actual observation. The existing equipped receiver owns this native/rendered continuation; preserve the original operation and private case custody.
