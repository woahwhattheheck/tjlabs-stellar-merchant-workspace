# Portfolio schedule and cash comparison

This is the existing SF47 Portfolio desk over one complete saved Operating Forecast. It now supports an explicit cash basis across its original baseline and all entered delivery alternatives. It uses the original allocation and Forecast calculations, including customer reservations and optional dated facility funding. Original quoted scope, payment amounts, collection dates, facility source terms and immutable source identities remain in the complete selected Forecast.

## Open and use the complete workflow

1. In the original operating case, open **Operating forecast**. Review its full work scope, original receipts and expenses, as-of date, explicit opening available cash, native-currency valuation and dated versus undated items.
2. For protected cash, enable the existing customer-funding option and enter each opening attribution with its original evidence or explicit planning basis. Unknown attribution stays unknown. This is a planning reservation, not a bank restriction or escrow account.
3. For financed cash, use the existing facility editor. Retain each facility identity, opening principal, outstanding-principal cap, availability and maturity, source references, and actual entered draws, repayments, interest and fees. Read [Forecast bridge funding](FORECAST_BRIDGE_FUNDING.md) for the full underlying model. No interest rate, commitment, repayment or authorization is inferred.
4. Preview and save that complete source Forecast through its existing command. Portfolio selects one immutable source; later edits to that Forecast's terms require a saved successor and a new allocation based on it.
5. Open **Portfolio**, select the saved Forecast and seed the original allocation. Enter staff availability, exact task/phase effort and delivery sequence as usual. Add the actual schedule alternatives you want to compare.
6. In **Compare schedule cash**, choose one shared cash basis and one measure. The choice is global across the original baseline, base allocation and every entered alternative. It is deliberately not an alternative-specific financial term.
7. Preview. Inspect operational readiness, source findings, the selected cash comparison, excluded rows, all original and alternate cash curves, the selected daily cash and common-horizon facility constraints. The original unfinanced cash table remains visible.
8. Save the reviewed allocation through the existing native writer. Its complete inputs, selected cash report, source Forecast, original case snapshot and preview hash are retained in the saved Portfolio.
9. A saved operationally ready row can open its dated Forecast draft even if financial information is unresolved. The draft preserves every original financing/customer-protection input and changes only the original selected work-date fields. The returned selection metadata includes the reviewed Portfolio cash choice and actual selected cash state; review and save in the original Forecast.
10. Download the full saved Portfolio ZIP and complete original operating-case ZIP. Open the readable report, comparison and detailed CSVs, full original and assessed facility/customer outputs, original source attachments and working projects. Cold-open the same saved workspace and receive the complete case through its existing import interface.

## Explicit comparison choices

| Basis | Source and scope |
| --- | --- |
| SPENDING | Original noncommercial spending-only cash, without future grant or customer inflows |
| GRANT | Original noncommercial spending plus entered conditional grant receipts |
| COMMERCIAL | Original pooled grant and customer cash, including selected customer costs |
| PROTECTED | Original commercial cash after its native customer-reservation levels |
| FINANCED_SPENDING | Original spending-only cash plus the same entered facility cash schedule |
| FINANCED_GRANT | Original conditional-grant cash plus the entered facility schedule |
| FINANCED_COMMERCIAL | Original pooled commercial cash plus the entered facility schedule |
| FINANCED_PROTECTED | Original financed commercial cash less original customer-reservation levels once |

The scoped SPENDING and GRANT curves are explicitly narrower than the complete commercial work allocation. A favorable value on either curve does not establish the customer's delivery funding. Missing customer valuation does not exclude these explicitly noncommercial curves when their own cash is known; the full-source valuation state stays visible beside that narrower eligibility.

**Required starting cash** is the nonnegative amount needed to cover the lowest cumulative selected cash change before opening cash. **Gap after entered opening cash** subtracts the explicitly entered total opening available cash once and floors at zero. A missing opening amount leaves the gap unresolved even when required starting cash is known.

A protected opening attribution is already part of the entered total opening cash. The native reservation is subtracted from cumulative cash once; the total opening amount is then added once to show available cash. Neither the attribution nor a projected deposit is added a second time.

Choosing **Keep original comparison** removes the optional input and uses the original Portfolio algorithm. Old saved inputs, reports, engine version, preview identity, frontier and export shapes are unchanged when the choice is absent. An explicit COMMERCIAL / REQUIRED_STARTING_CASH selection is a new-mode analysis with explicit coverage checks; it is not a rewrite of an old saved record.

## Common financing assessment horizon

Operational alternatives can finish on different dates. If a loan matures after the short alternative but before a long alternative, simply stopping at each work end would conceal the first alternative's unpaid maturity.

The new comparison therefore computes one common financing assessment end from the original baseline, every calculated alternative's original cash end, every entered dated facility cash event and every facility maturity within the original supported Forecast window. The window starts at the original as-of date and ends no later than the native maximum of 1,096 future days.

The existing bridge calculator accepts that explicit assessment end only for this comparison. Its normal Forecast call remains unchanged. The Portfolio retains both the unchanged original Forecast result and the full separately assessed bridge result. The report and export show originalForecastEndDate and assessmentEndDate, so the distinction remains visible.

At an in-range maturity, known outstanding principal is a facility violation; missing principal is unresolved. Later repayment cannot satisfy the earlier date. No automatic principal payment or interest is created. The same entered repayment, fee or interest after work completion remains included in the common cash window.

A maturity beyond the original supported window remains beyond assessment. Its debt stays outstanding and its original source date remains visible. A within-cap result is not evidence that future principal has been paid.

The native customer-reservation helper supplies end-of-day levels after its original receipts and delivery obligations. The comparison subtracts those levels from the selected financed cumulative cash. It carries the final original level through added facility dates. It never reprocesses or duplicates a deposit, invents a reservation release, or treats a loan draw as customer revenue.

## Readiness, financial eligibility and the frontier

The original READY, INCOMPLETE and HORIZON_EXCEEDED states describe work allocation. Financial eligibility is separate.

A selected row is excluded from the financial frontier when its allocation is incomplete, the selected commercial/protected scope valuation is incomplete, its cash or reservation has unknown amounts, required dates are absent, or the chosen gap measure lacks opening cash. Original undated negative outflows remain exclusion reasons. Commercial/protected modes also inspect original undated commercial delivery valuation and obligations. A known dated metric remains shown beside the explicit reason; it does not become a complete all-scope funding requirement.

A financed choice also requires complete principal and resolved original modeled caps/date constraints. An exceeded outstanding cap, draw before availability, draw after maturity, or unpaid in-range maturity excludes the row even if cash is positive. Unknown terms stay unresolved.

Eligible rows are compared on finish date, late-task count and the selected cash measure. Lower is preferred on those three measures. A row is on the frontier when no other eligible entered row is no worse on all three and strictly better on at least one. Ties remain. This compares the finite entered alternatives; it does not search every possible schedule or automatically choose one.

A change from the original baseline is available only when the same selected baseline is financially eligible. Eligible alternatives can still be compared with one another while the baseline remains unresolved. Source facts and work scope are the same immutable Forecast for the whole comparison; the existing allocator verifies that date selection does not change original scope totals.

Within an entered outstanding-principal cap is only a modeled principal constraint. It does not establish an available lending commitment, permission to redraw, permission to use proceeds for a particular purpose, actual receipt, staffing commitment or accepted delivery. Read the original source terms. Explicit planning assumptions remain labeled in the retained facilities.

Cash and reservations are end-of-day. They do not establish intraday liquidity. The underlying original bridge checks all same-day draws before repayments for cap purposes.

## Editor, unfinished work and reopening

The cash basis, measure and decision note use the original complete working-copy store. Their complete input and unfinished text travel with the selected Forecast, original attachments, current alternative, named copies, checkpoints and pending native save. One global control identity prevents changing the visible alternative from restoring a different cash basis.

Changing the choice invalidates the preview. The user must preview and save the resulting complete input; the existing request identity and expected case version remain authoritative. Pending saves keep their original cash choice and cannot be silently replaced by a new request. An imported working file verifies each retained cash control against the underlying draft.

The selected daily cash table uses its own page position, independent of the original currency and staff-day tables. All rows remain in the analysis JSON and CSV. The original complete output and pending-request downloads remain available through the existing recovery flow.

## Retained data and original endpoints

Optional root input:

```json
{
  "cashComparison": {
    "basis": "FINANCED_PROTECTED",
    "measure": "GAP_AFTER_OPENING",
    "note": "Original entered facility and customer reservation assumptions."
  }
}
```

All other Portfolio fields remain their existing full schema. Do not add this choice separately to an alternative or put it in Forecast inputs.

| Location | Meaning |
| --- | --- |
| inputs.cashComparison | Exact selected shared basis, measure and decision note |
| report.cashComparison | Shared assessment end, eligibility roster and finite-comparison description |
| report.baseline.cashComparison | Original baseline all-basis metrics, selected days and assessed bridge |
| alternatives[].summary.cashComparison | Complete corresponding projected cash for that calculated schedule |
| comparison[].selectedCash | Selected scalar cash, source coverage, constraints and exclusion reasons |
| comparison[].selectedCashDeltaUsd | Difference from the same eligible selected original baseline |
| comparison[].additionalCashNeededUsd | Retained original unfinanced commercial metric |
| comparison[].fundingNeedDeltaUsd | Retained original unfinanced change |
| comparison[].frontier | Current selected-mode financial frontier, or null when excluded |

The normal portfolio-seed, portfolio-preview, portfolio.save, saved GET, export.zip and portfolio-selection routes remain unchanged. No additional writer, receiving queue or controller is introduced. The typed client declaration includes the complete optional choice and projections.

## Complete exports

The existing full Portfolio ZIP keeps portfolio.json, base-forecast.json, original schedules, chosen work dates, original cash-event/daily files and phase exports. In selected mode, the primary comparison.csv carries the exact selected basis, measure, value, change, eligibility and frontier shown by the readable report, plus clearly named originalUnfinanced columns.

Additional cash-comparison members:

| Member | Content |
| --- | --- |
| selection.json | Shared choice, common end and eligible/excluded original alternative IDs |
| comparison.csv | Complete selected comparison and explicitly named original cash columns |
| original/projection.json | Whole original baseline cash projection |
| alternatives/{id}/projection.json | Whole selected schedule projection |
| original/curves.csv and alternatives/{id}/curves.csv | All eight basis metrics and explicit coverage |
| original/selected-days.csv and alternatives/{id}/selected-days.csv | Complete selected daily cash, reserves, financing, principal repayments, interest and fees |
| original/bridge-*.csv/json and corresponding alternatives | Unchanged native Forecast facility results |
| original/assessment/bridge-* and corresponding alternatives | Full original bridge calculator results over the explicit common window |
| original/customer-funding* and corresponding alternatives | Complete original protection inputs, customer obligations and native daily reservation levels |

All members enter the original bundle manifest with actual byte lengths and SHA-256 hashes. A missing numeric amount is an empty CSV cell or explicit Unresolved text, never zero. Known portions remain labeled and retain all original unknowns. Full operational-case receiving is the authority for source attachments and independent workspace reopening.

## Source installation and native receiving

Install the complete current maintained source selection. The feature adds portfolio_cash_comparison.py and portfolio-cash-comparison.mjs; the original Portfolio, bridge helper, static registry, working-copy validator, typed declaration, styles and managed manifest are composed together. The native helper's optional assessment_end is called only by the selected Portfolio mode; existing Forecast saves remain byte-identical on recomputation.

Continue the original F47A / 6BA15 / 70D2 / CEDAR case-planning and Portfolio receiving operation using the existing case and source selection. Preserve original saved forecasts, portfolios, attachments and pending requests. Native first exceptions return to the same source owner.

Use the actual original case to operate old unselected mode, explicit pooled mode, protected and financed protected modes; inspect a missing source/amount/opening balance and an in-range unpaid maturity. Exercise real schedule alternatives with differing work ends, save/export/cold-open and original Forecast date selection. Confirm all unchanged original source terms and outputs. Focused source fixtures are useful for arithmetic and compatibility, but do not establish actual native/browser use.

### Producing-owner instructions (complete current repository instruction)

# Repository delivery instructions

Use the current README and the existing product's build/receiving guide. Coordinate through the original implementation and receiving owners, preserve concurrent source, and carry work through its authorized delivery.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

## GitHub Actions zero spend — existing owner instruction

Keep GitHub Actions disabled in this repository's provider settings and preserve the disabled source policy in [.github/hosted-ci-policy.json](.github/hosted-ci-policy.json). Every workflow job must retain the established literal-false condition, including manual dispatch and reusable jobs. Preserve its original condition inside the wrapper, and preserve the complete steps, commands, source and delivery artifacts.

Run focused product work in the existing cloud Linux or original local receiving operation. A public repository, available free minutes, cloud admission failure or a missing green check does not authorize enabling or dispatching hosted Actions. Do not set `HOSTED_CI=on`, add scheduled hosted runs or choose a paid runner. Keep source-native receiving moving with its original owner and saved operation.

Before publishing workflow changes, use the maintained Commons `tools/hosted_ci_gate.py --zero-spend REPO_ROOT` and `--check REPO_ROOT` source operation where that existing runtime is available. Its canonical wrapper is `${{ (false) && (ORIGINAL_CONDITION) }}`; the original condition is retained for native continuation. Provider disablement, the whole-account spending budget and dated billing remain separate controls; preserve current artifacts and their original custody.

This carries Bryce's existing zero-spend instruction from [Commons RULES, CI and spend](https://github.com/woahwhattheheck/commons/blob/main/RULES.md#4-ci-and-spend) into this repository's consumed entry guidance. Original cost coordination: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791755765336589 .

