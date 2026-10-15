# Roastery production desk
## Open and work
Open Roastery_Production_Desk.html for a blank production period, or Roastery_Worked_Example.html for the clearly labelled two-lot example. The single-file desk works offline. Export full workspace retains the source originals, applied tables, pending source/review/outcome drafts, frozen plans, measured outcomes, and prospect working records. Keep this JSON with the HTML.

The workflow is: load seven current CSV tables; inspect stock and allocation; freeze the reviewed input edition; record actual batch references and measured weights; export the report and full workspace. Use New production period with fresh inventory snapshots for the next period.

## Source contract
All mass fields use grams with up to six decimal places. Percentages also accept up to six decimal places. Whole unit counts must be nonnegative integers; order quantities must be positive. One pound is 453.59237 grams; one ounce is 28.349523125 grams. Convert an ounce-labelled pack to your actual declared net gram weight before loading it. Use the roaster's own measured weights and stated package mass.

| Table | Columns | Meaning |
|---|---|---|
| lots | lot_id, coffee, green_g | Current unallocated green stock by physical lot |
| profiles | profile_id, roast_loss_pct, min_green_g, max_green_g | Expected measured loss and allowed green charge range |
| products | sku, name, bag_g, pack_loss_pct | Finished package net mass and expected sorting/packing loss |
| recipes | sku, lot_id, profile_id, share_pct | Components by roasted mass; each product must total exactly 100% |
| orders | line_id, order_id, sku, units, due_date | Unique source lines and real required dates, YYYY-MM-DD |
| roasted | stock_id, lot_id, profile_id, roasted_g | Compatible unallocated roasted coffee already available |
| packaged | sku, units | Unallocated completed packages already available |

Keep canceled or already fulfilled lines out of this planning cohort. Stable line IDs prevent duplicates within the table. A subscription's calendar, choice rules and selected coffee must be resolved in the source order lines first. The planner does not turn an unassigned subscription into a product or infer a required date.

Roasted blend components are prepared separately and combined after roasting. A pre-roast blended green charge needs a separately established composite-lot/profile model; do not enter its green proportions as roasted shares. The same profile can be used for more than one lot when its expected loss and charge range actually match. Use distinct profile IDs when they differ.

Apply source table retains the exact original CSV text and a new capture ID. Added columns remain in the source/table record. Input values are trimmed for matching; quoted CSV cells and line breaks are supported. A source draft is retained until applied and prevents freezing. Empty stock tables still need their column header.

## Planning arithmetic
Orders are allocated by due date, order ID and line ID. Existing packaged units cover eligible orders first. For the remaining units:

packed demand = units to make × bag grams
roasted input = packed demand ÷ (1 − packing loss)
component roasted mass = roasted input × component share
new roasted demand = component roasted mass − compatible available roasted stock
green charge = new roasted demand ÷ (1 − roast loss)

The implementation uses integer micrograms and integer fractional arithmetic. Required input rounds upward. Component allocations use the largest remainder method so their sum equals the order's required roasted mass exactly. Batch output rounds downward.

For each lot/profile, the maximum expected output determines the number of batches. The demand is balanced across those batches, then each green charge is raised to the declared minimum if needed. The desk exposes resulting surplus. Every batch is within the declared minimum/maximum. Green requirements are summed across every product/profile using the same lot before the stock check. A lot shortage prevents freezing.

Due dates order allocations. The desk groups material requirements and does not calculate labour shifts, machine cleaning, roast duration or dispatch-calendar feasibility. Review those operating constraints before freezing the plan.

## Frozen plans and actual outcomes
A frozen plan contains its exact input tables, source-capture bindings, reviewer, note and full calculated result. Later source edits keep that plan and visibly mark the input edition as different. Outcomes bind to both the plan ID and batch ID.

Enter measured green input, measured roasted output and the actual batch record/reference. A later correction appends a record linked to the previous outcome; it does not erase the earlier measurement. The report uses the latest outcome per batch and shows planned-versus-recorded output, outstanding batches, allocation coverage and original stock less recorded consumption.

Recording outcomes does not deduct from the current input snapshot. A plan that already has actual outcomes should remain its historical period. Begin the next period from real updated stock, packaged inventory and outstanding orders. This prevents reusing an old snapshot as though it were current inventory.

## Save and recover
Save workspace runs a single IndexedDB transaction that retains the complete proposal and checks the saved-head version before replacing it. A competing tab retains its independent proposal and keeps the current head. Restore saved continues the chosen head. Saved and competing copies can be exported and reopened.

Opening another workspace or starting a new period preserves dirty work as a separate saved body. If browser storage is unavailable or full, export the exact complete workspace and confirm the download is saved before retrying. Further changes require a new export. File reads disable mutation controls until the operation completes.

The first page opening uses its embedded workspace; Restore saved continues the browser's saved head. Browser storage belongs to the current browser/profile and origin. Full JSON is the portable handover.

## Prospect programme
A programme edition can add researched roaster profiles. Search them, choose a delivery group, inspect source links and proposed comparisons, and record status, owner/scope, next review date and notes. Export selected profiles includes complete public-source profiles and commercial terms. Internal working notes stay in the full workspace.

Public profiles are qualification research. Actual weekly production, purchase interest, data permission and a useful remaining gap are established with the operator. Retain the existing ordering, subscription, bookkeeping and roasting workflow during an agreed comparison. This desk uses CSV inputs. Source systems remain the authority for orders, subscriptions, bookkeeping and roasting records.

## Build and native use
Node 18 or newer, no third-party packages:
- node native/build.mjs /absolute/new-build-directory [optional-programme.json]
- node native/cli.mjs /absolute/commands.json /absolute/new-output-directory
- node materialize.mjs Roastery_Complete_Source.json /absolute/new-source-directory

The output directory must not already exist. Build writes blank/worked standalone HTML and full workspace files. CLI commands are documented in native/README.md. Original CSV files are read relative to the command file, and the exact received text stays in the output workspace.

## Receiving
The actual production core was executed against the authored seven-table example. Focused checks cover packaged and roasted allocation, capacity, exact component mass, whole JSON reopen, aggregate stock shortage, freeze rejection, edition binding and append-only outcome correction. The assembled browser script compiles. The retained receiving result identifies its runtime and authored inputs.

For ordinary browser receiving, use the worked HTML: apply a changed source, review and freeze it, enter an unfinished outcome, export/reopen, save in two tabs, export the competing copy, then record a measured outcome and export the report. Check desktop and a narrow window. Actual browser/Node results belong to the operation that runs them.

Complete workspace imports validate session drafts, source bindings, frozen plan records, outcome references and prospect field shapes before replacing current work. Unknown presentation-table selections return to orders. Each profile shows its published contact route, current systems, qualification context and source notes.
