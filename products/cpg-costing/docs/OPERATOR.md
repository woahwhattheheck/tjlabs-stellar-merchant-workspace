# Supplier, batch and channel costing — operator guide

This independent offline desk follows selected original records from receipt cost to a chosen recipe, actual batch output and channel contribution. Open output/Costing_Desk.html in a current desktop browser. The initial workspace is blank. Open and restore provides a separate, clearly authored demonstration. Its quantities, suppliers and results describe a fictional operation.

## Start with the original records

In Original sources, select a CSV, TSV, JSON or supporting file. The desk retains exact file bytes, name, media type, byte count and SHA-256. Select the table format and, for JSON, the array pointer. Inspect the complete selected table before choosing its target. The table is paginated at 50 rows per view; the original and all mapped rows remain complete.

The supported source-table limit is 10,000 rows. A single original is limited to 20 MiB, with 64 MiB of originals in the domain workspace. Every saved change also measures the complete source, working JSON, editable HTML and original-file handover against 128 MiB and 2,000 members. An unsuccessful admission preserves the prior committed workspace.

Mapping JSON binds each target field to a source column name for CSV/TSV, or a JSON pointer within a source row for JSON:

    {"id":"Receipt ID","itemId":"Material SKU","quantity":"Received kg","unit":"Unit"}

For a JSON row, use pointers:

    {"id":"/receiptId","quantity":"/received/quantity","unit":"/received/unit"}

The "Fill column choices" action maps only exact matching headers. It does not guess a unit, currency, price, business identity or completeness statement. Preview the exact mapping. Then explicitly append its rows to the current draft table or replace that draft table. Replacement retains the complete previous input in Open and restore. The mapper supplies original source references. Keep these references when correcting a mapped row.

## Complete the selected cost model

Name the edition, identify its preparer and give a preparation or correction note. Select the currency and as-of date explicitly. All decimals are exact plain text, with at most 60 digits and 24 decimal places. The domain keeps rational numerators and denominators alongside its rounded display.

The record editor offers a table selector and individual scalar fields. Each row also has complete JSON for source references or additional retained fields. "Apply current record" updates only the input draft. An unfinished row is retained separately and must be applied or discarded before calculation. The complete input JSON is always available. Invalid JSON remains saved as raw draft text until corrected.

The tables have these roles:

| Table | Operator decision |
| --- | --- |
| Unit conversions | Explicit item-specific conversion factor and units. Standard compatible mass/volume/count conversions are handled by the domain. Cross-dimension conversions require a meaningful selected basis. |
| Lots | Original receipt identity, item, date, quantity/unit and currency. Select either an invoice amount or unit price with an explicit price quantity and unit; do not enter both. Mark whether landed charges are complete. |
| Charges | Separate landed charge, signed amount, currency, selected allocation method and evidence state. |
| Charge allocations | Exact charge/lot links. Explicit amounts must reconcile to the charge. Weighted allocations use the supplied positive weights. |
| Standard selections | Exact lot selected to supply the current standard unit cost for an item. |
| BOM revisions | Recipe identity, SKU, effective dates, recipe output quantity/unit, additional standard costs including declared zero, evidence and cost completeness. |
| BOM lines | Required item or nested BOM revision, quantity and unit. Select required_input or net_before_loss with an explicit yieldPercent. Nested component type is bom, and componentId identifies the exact child revision. |
| Batches | Actual batch and selected recipe, production date, good output, optional scrap context, and actual consumption/additional-cost completeness. |
| Consumption | Actual receipt or upstream batch consumed by a production batch. |
| Batch costs | Selected additional production costs and evidence. Avoid recording a cost a second time if it is already included in consumed inputs. |
| Sales | Batch, channel, quantity/unit, recorded revenue, explicit gross or net_realized basis, currency, period and fee completeness. |
| Fees | A signed amount or rate with treatment deduct or already_in_revenue. Already-reflected costs are disclosed without subtracting them again from net_realized revenue. A rate explicitly uses recorded_revenue. |

The required_input convention uses the entered recipe quantity directly. net_before_loss divides the quantity by the explicit yield fraction; it cannot also be applied to a required-input line. Actual batch consumption stays as recorded. Output yield compares good output with good output plus compatible reported scrap; it is not ingredient mass yield.

Use the current complete domain field contract in costing/input-fields.json. Review any recorded-revenue basis and the treatment of deductions already reflected in that amount. A channel result is contribution under the selected scope; accounting classification and commercial use remain a named review decision.

"yes" completeness flags mean the operator has confirmed the corresponding scope complete. "no" retains the known portion and explains what is missing. Evidence is confirmed, estimated or missing. A blank or missing amount is not zero.

## Preview and freeze

Preview complete calculation evaluates the current input against retained originals. The preview exposes all lot, BOM, batch and sale results, findings and assumptions. Every calculated amount retains display value, exact rational value, status, missing-input explanations and source references.

A change to the input, name, preparer, note, mapping or workspace invalidates the preview. Freeze only the current exact preview. The immutable edition retains its full input, report, source identities, preparer, parent edition and note.

For a correction, select a frozen edition and choose Use as corrected input. The previous unfinished draft is retained. The chosen edition becomes the parent; edit the new draft, preview and freeze it. Earlier results remain available.

## Compare editions and review

Select both the baseline and candidate explicitly. Read each complete input's currency, as-of date, quantity, period, recipe and source coverage together with the result difference. Candidate minus baseline is a calculated change. Changed production quantity, sold quantity, fee treatment or source completeness can explain it.

The comparison displays matched/unmatched rows and reasons when the domain cannot compare them. It does not decide that an increase or decrease is commercially better.

Named review records a reviewer, selected edition, decision and explanation of permitted use. Earlier decisions remain in the workspace. Approval does not rewrite the input or promote an estimated value into a confirmed original.

## Save, open and transfer

Save complete working JSON includes the domain workspace, unfinished complete input, mapping choices, pending row, review draft, selected edition/comparison and retained prior sessions. Save editable HTML carries the same complete session and the actual source application. Both reopen without an external service.

Save domain workspace contains the immutable domain originals, editions, reviews and operation history. It excludes the operator's unfinished drafts; use complete working JSON when handing off ongoing work.

Open and restore accepts the corresponding complete operator or domain JSON. A successful replacement first retains the complete previous session, including a new session containing only unfinished work. Failed validation leaves the current session open. Previous sessions are direct snapshots rather than recursively duplicated histories.

The browser copy is a convenience. Storage capacity or another opening can prevent an automatic save. The visible storage status reports this. Keep the current tab open and export working JSON. Open and restore lets you open the saved browser version or explicitly select the current version while retaining the other copy.

The complete handover ZIP includes source files, working JSON, editable HTML and all exact originals. Its original-file paths use source identity plus a safe filename; the source records retain the exact original name. Reports and comparisons export as full JSON or path/value/type CSV. CSV text that begins with a spreadsheet formula marker is prefixed for safe viewing; original and exact JSON values remain available separately.

## Rebuild from source

Use a current Node.js release. No third-party package installation or network request is required:

    node native/build-desk.mjs output/Costing_Desk.html

The builder reads source-manifest.json, verifies selected file identities and creates a new output file. It refuses to overwrite an existing destination. The output records exact source and HTML identities. The browser bundle embeds complete selected source and its manifest; Save full application source returns that source.

The authored domain exercise and the operator receiving course are supplied with this package. Their records state the runtime used. The browser receiving instructions exercise the actual interface, original retention, draft correction, preview/freeze, selected comparison, named review and cold JSON/HTML reopening as one complete workflow.

