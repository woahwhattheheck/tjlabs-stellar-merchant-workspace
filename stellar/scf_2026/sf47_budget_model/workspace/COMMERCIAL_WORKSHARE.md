# Commercial Workshare planning

This is the commercial proposal mode of the existing SF47 planning workspace. Open a complete source scenario with funding_mode COMMERCIAL_WORKSHARE and status PROPOSED_UNSIGNED through the original Import planning scenario or workspace control. The same saved-plan, revision, case-planning, Operations and export/receiving machinery remains authoritative.

A commercial proposal is not a grant request. Its customer fee and release conditions come from the complete retained dealscout.workshare-plan.v1. Delivery cost estimates are separate, independently entered assumptions. Neither saving a plan nor calculating its cash schedule records a signed agreement, customer acceptance, available funding, an invoice or a paid receipt.

## Complete source binding

The scenario retains commercial.workshare:

- case_id identifies the original proposed Workshare case.
- source_url locates the actual source.
- document_sha256 pins the complete original source document.
- plan_sha256 pins the full original Workshare plan.
- plan contains the complete original proposal, phases, effort, dependencies, commercial terms and payment conditions.

The Commercial overview shows these identities and the full original plan. Download original bound Workshare preserves the complete original binding and plan. The saved scenario JSON and whole planning ZIP retain the entire source, original inputs, calculation and revision history through the existing native export path.

The fixed proposal is deliberately read-only in normal planning edits. Changing the fee, phase count, original hours, required delivery or payment conditions requires a following complete original proposal and explicit source intake. The planner cannot turn a supplier estimate into a new proposed customer fee.

## Import and select the actual proposal

1. Use Import planning scenario or workspace and choose the complete source JSON or a previously exported native planning ZIP.
2. Review the proposed unsigned status, original Workshare case, document and plan digests, fee and all retained terms.
3. Check that every native phase is present. Each future_costs row retains the original phase ID as both id and phase_id, a null tranche and the original production hours.
4. Check the original duration and dependencies. A ten-active-business-day proposal uses day offsets 0 through 9; these offsets are not calendar dates.
5. Open the Source tables and Delivery commitments when the source includes supporting evidence. Do not replace selected source facts with a reconstructed summary.

There is no toggle that converts a saved grant plan into a commercial proposal. The mode follows the complete validated original source. Existing SCF scenarios continue to use the original grant calculation and controls.

## Enter meaningful delivery-cost assumptions

Phase cost assumptions displays every bound phase and its complete original scope.

Choose either a fixed supplier cost estimate or original hours multiplied by a supplier rate. Enter the cost evidence or assumption: a quote, an internal cost treatment, a source rate or an explicit zero-cost basis. Original production hours remain read-only. The cost category is a planning classification; it does not change the source scope.

Blank cost or rate values remain unknown. An entered 0 is an explicit zero-cost assumption and needs a basis. The proposed customer fee is never copied into costs and never automatically matched to their sum.

Start and finish are active-business-day offsets within the bound duration and dependency rules. Calculate draft checks these through the maintained native model. Invalid intermediate work remains editable until corrected; a failed calculation does not create a saved revision.

The report distinguishes:

- Proposed customer fee from the original Workshare.
- Known delivery-cost subtotal for entered estimates only.
- Complete estimated delivery cost, which remains unknown while any phase cost is missing.
- Known-cost peak requirement, clearly labeled as a subtotal.
- Complete cash requirement, which remains unknown until every cost estimate is present.
- Original production effort and unassigned effort.

The complete cash chart is withheld while costs are incomplete. A known subtotal is not presented as a full budget, profit estimate or total cash need.

## Review conditional fee timing

Fee conditions retains the original payment amounts and release conditions. Each row remains proposed, conditional and unpaid.

Only modeled timing assumptions are editable: START or FINISH as the schedule anchor and a lag in active business days. These values live in commercial.receipt_schedule and remain bound one-to-one to the original payment milestone index.

The source may contain two proposed payments of $2,880 against a $5,760 fee, but those figures are always read from that actual source. The planner does not manufacture standard percentages, grant tranches, paid states or acceptance dates.

A modeled payment day is an assumption for planning. The original Operations and financial record workflows remain the place for actual authorized agreements, receipts, invoices and payments.

## Supplier payments and staffing

Supplier payment timing applies only to delivery costs. Use the existing accrual, completion-plus-lag or explicit installment modes and retain the source/agreement note for the assumption. Every installment remains part of its phase’s complete estimate; changing payment timing does not change the bound customer fee.

Unknown phase costs remain unknown under all schedules. Enter a complete estimate and its basis before relying on a complete cash calculation.

The existing Staffing section retains contributors, weekly capacities, notes and allocations. The commercial model uses the active-business-day basis rather than silently labeling its day offsets as calendar days. Assignments must preserve the phase’s original production hours. Record the source of each contributor-capacity assumption.

## Calendar and kickoff

Day 0 is the first active business day of proposed delivery. No calendar kickoff is invented.

Leave Selected kickoff date blank until a real calendar anchor is selected. If selecting a date, enter the explicit working weekdays, holiday dates and additional working dates needed by the native commercial calendar contract. Weekday indexes run from Monday 0 to Sunday 6. The actual calendar mapping is a planning assumption, not proof that work began.

Use Clear kickoff and calendar mapping to return to an explicitly undated proposal. Without a selected calendar, weekly requirement and overload are shown as not evaluated; they are not reported as zero.

The bound original active-business-day duration remains read-only. Scheduling outside the original duration or contrary to dependencies is rejected by the maintained native model.

## Save, reopen and preserve work

Calculate draft recalculates the complete scenario through the existing native model. Save revision requires the original revision note and creates the next retained version with the original request ID and concurrency guard.

When editing through an existing case, the original case-planning controller retains the complete working draft and pending save. Use its same-request receiving controls after a lost response; do not issue a fresh save while the original outcome is unresolved. Saved case planning work can be exported, reopened and returned through the existing case workflow.

Saved versions shows commercial fee, cost completeness, duration and original effort for commercial revisions. Restoring an earlier saved version appends a revision and preserves intervening history. It does not rewrite the original immutable source.

Changing plans, importing a source or restoring a revision follows the original unfinished-work confirmation and staff-role restrictions.

## Complete reports and downloads

The Commercial overview and Delivery commitments provide:

- The original saved daily CSV.
- The saved scenario JSON.
- The original native complete planning ZIP through Export planning workspace.
- A complete saved proposal HTML report.
- The full original bound Workshare JSON.

The HTML report uses the exact selected saved revision, not an unfinished draft. It includes the saved status, fee and conditional milestones; every phase, effort, interval, cost and basis; source identities; complete original Workshare; and complete saved scenario, planning inputs and native report. The download message identifies the saved revision and leaves unfinished edits in the workspace.

The readable report is plain grayscale HTML with responsive tables and complete source detail. It contains no external assets or scripts. It is a presentation of the saved native result, not a second calculator. No browser printing or file-URL capability is required by the planning application itself.

## Original Operations continuation

After the commercial plan and its assumptions are saved, open the original Delivery operations surface. Select the actual saved proposal/case through the maintained workflow. Research Installation source intake can then bind the exact real Workshare and full economic source files.

Keep proposed contract terms explicit. Saving an Installation, receipt or plan must not label the customer proposal as accepted, funded or paid. Research source-use rights, operator, host, acceptance conditions and actual payment authority remain separately reviewed original inputs.

Native whole-case exports and independent receiving preserve the same saved commercial scenario and its complete source. Reopening must show the original fee and source terms, all cost bases and unknown values, the explicit timing assumptions and the full retained revision history.

## Operating and rendered-product review

Use the existing equipped owner and original customer case. Do not start another business job or substitute a demonstration source for the selected proposal.

Before outgoing delivery, operate the complete current application at desktop and narrow widths. Open every important commercial view, inspect the actual downloaded report and complete original source files, export and independently receive the whole native planning/case archive, then reopen the saved proposal. Use supplied cost/timing review inputs when a genuine amendment is selected. If the source has unknown costs and no later cost review, preserve that meaningful state; do not invent rates or append a revision for the sake of the course. Record the actual producer view and customer/reopened view with screenshots through the existing browser owner.

Open the exact outgoing HTML and inspect its fee, conditional milestone amounts, missing-cost warnings, full phase scope and source identities. Confirm that a blank cost remains unknown across calculate/save/export/import, that a recorded zero retains its basis, and that a later saved revision preserves earlier work. This is one complete operated product course, not a separate mirrored test framework.

The browser implementation uses the existing grayscale application, keyboard focus and semantic controls. Commercial controls have at least 44-pixel touch targets. No color is used to imply a paid or approved state.


## Compare complete saved proposals

Compare saved plans uses the original retained before/after revisions. Select the nearest retained revision below the current saved plan revision and compare it with the current revision. Comparing a revision with itself is valid when there is only one saved proposal. Keep the actual case-selected revision separately identified; a comparison never changes that selection. This records what was supplied without fabricating a later cost estimate or amendment.

The commercial comparison includes the complete bound funding and Workshare terms, conditional payment milestones, phase scope and timing, contributor allocation, full changes and daily cash rows. Missing costs remain null, with known subtotals labeled separately. Without an explicit working calendar, weekly capacity and overload totals remain not evaluated. A comparison between a commercial active-business-day proposal and an SCF calendar-day plan preserves each original day basis and leaves incompatible day deltas blank.

Inspect each view and its original paging controls. Download the complete report, changes CSV, impact CSV, daily CSV and comparison ZIP; the ZIP retains the selected original plan archives and their identities. Opening a comparison does not adopt a case amendment, change funding mode or mark a conditional amount as paid.

## Prepare the original commercial Operations case

Use the maintained source-native preparation entrypoint on the existing equipped owner:

```sh
python workspace/operations_commercial_workshare_case.py ABS_CONFIG.json
```

The configuration schema is `stellar-forge.commercial-workshare-case-preparation.v1`. Supply `operation`, `directory`, `actor`, `name` and `inputDirectory`, plus these exact original-file descriptors:

- `sourceSelection: {path: absolutePath, sha256: completeOriginalSha256}`
- `planningSource: {path: absolutePath, sha256: completeOriginalSha256}`
- `planningSettings: {path: absolutePath, sha256: completeOriginalSha256}`

Use `documentSelections` for explicit task, source, receiving and payment edits in the original Installation document. It may be `{}` for an unsigned proposal. Preserve the complete selected source and its real file hashes; the file names and paths refer to originals supplied for this operation, not substitute examples.

This command invokes the original SF49 `source-inputs.py`, saves the native commercial plan and actual Operations case, attaches every original and prepares an unsaved Workshare Installation. It exports the complete `Proposed_Operations_Case.zip`. It does not accept the proposal, record a payment or save an Installation.

`PREPARED_COMMERCIAL_CASE.json` returns the actual case archive, native case ID/version and full document. Use those exact outputs as the inputs to the existing Research Installation course. An original plan source and the case-selected saved revision remain distinct recorded identities throughout preparation and receiving.

## Run the commercial chapter in the same Research Installation course

The existing `workspace/operations_research_installation_browser.mjs` now includes `00-complete-commercial-proposal`. The native `operations_research_installation_course.py` phase `all` launches that maintained browser chapter in its usual operate and independent receive phases. Use the exact original case/archive and research-file configuration described in `RESEARCH_SOURCE_DESK.md`; no extra browser driver, server or business operation is needed.

The chapter runs only when the actual selected plan has funding mode `COMMERCIAL_WORKSHARE`. It records the copied or received plan ID, saved revision and source hash; the actual Operations case and case-selected plan revision; the original Workshare plan SHA; and the proposed fee/status. It never rewrites the case selection.

On the existing authenticated HTTP workspace, the chapter opens Commercial overview, Phase cost assumptions, Fee conditions, Staffing, Supplier payment timing, Delivery commitments and Saved revisions. It captures the important controls and the end of each view at 1440-pixel desktop and 390-pixel narrow widths, retaining complete original source/report files beside screenshots. Every bound phase ID and fixed scope is checked against the actual saved source.

The chapter downloads the actual saved daily CSV, scenario JSON, complete proposal HTML, full original Workshare JSON and native planning ZIP through their visible application controls. It opens the complete downloaded originals: HTML is rendered on the owned HTTP view, text is inspected without changing line endings, and large/binary files are read through exact first/last byte windows with the whole file retained.

It then compares the nearest earlier actual saved revision with the current revision (or the same revision when no earlier revision exists), inspects every view and page, and downloads/views all five comparison exports. A reload verifies that the entire scenario, planning inputs, native report and case-selected revision remain unchanged. The independent receiving phase performs the same review on the actual native received plan and source.

The retained browser report contains `commercialPlanningSelection` and `commercialPlanning` with the actual saved selection, comparison identity, complete download descriptors and screenshots. The existing course journal, original request keys, source-edition history and interruption recovery remain in force. Completed prior courses are not silently restarted. Native receiving continues through the original full Operations/Research archive workflow.
