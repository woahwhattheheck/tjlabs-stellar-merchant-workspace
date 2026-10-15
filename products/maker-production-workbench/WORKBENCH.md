# Token Junkie Labs Maker Production Workbench

## Open and use the complete workbench

Open Maker_Production_Worked_Example.html to use the complete authored production course. It contains three immutable source editions: original declared process and deadlines; observed finished mug batch; corrected final unload. The initial selected edition is the latest recount. Choose declared / 2026-10-15 to inspect the original two orders, two batches and ten stages: two actual ready pieces, eighteen remaining, three overloaded resource days and one declared compatibility conflict. Choose the observed and recount editions to inspect how later actual stage snapshots change ready quantities while preserving earlier source.

Open Maker_Production_Workbench.html for an empty maker workspace. Both production files run locally as complete single-file applications. Browser storage is local to the browser and file origin; complete JSON export is the portable handover. Serve the generated directory from a local static server if that browser restricts storage for file URLs. No external application account is needed by these independent workbenches.

The production example is explicitly authored instructional data.

## Agree one real order or shop release

Record actual product and component identities, accepted order or internal release, deadline basis, authoritative order reference, sales-unit conversion, stock and batches, declared routes, yields, resources, calendars, compatibility and actual observations.

For plates sold in pairs, order quantity must be physical plates after a documented conversion. A mug-plus-lid set needs explicit component identities and routes; the current engine does not infer assembly dependencies from a product name. Use separate declared orders or component targets and record how they join. Individually photographed ready pieces must remain distinguishable in the maker's source register. A product ID is the maker's explicit planning identity, not a license to merge materially different pieces.

Choose ready for an internal ready-to-list, shop-release or stocking target, ship for an actual dispatch target, or delivery for an actual agreed arrival target. Ready and ship use zero transit days. Delivery subtracts the declared shipping calendar. Published request cutoffs, lead-time ranges and carrier estimates are qualification context until an accepted order fixes the dates.

## Receive all eight tables together

Expand Receive or revise all eight source tables. Import each original UTF-8 CSV or edit its complete text. Required columns and semantics are in INTAKE_CONTRACT.json and OPERATE_MAKER_PRODUCTION.md. Header-only optional tables are valid when there are no applicable rows.

| Table | Operational purpose |
| --- | --- |
| products | Explicit product/component identities and names |
| resources | Named resources, comparable capacity unit, baseline capacity and open weekdays |
| calendar | Dated resource capacity overrides with original source references |
| routes | Ordered stages, durations, calendar basis, resource, units per piece, yield and compatibility |
| orders | Physical-piece quantity, real target date/basis, transit and order reference |
| stock | Ready pieces, explicit order/batch links and count reference |
| batches | Explicit batch-to-order allocation and target good pieces |
| observations | Complete actual stage snapshots with timestamp, local date and count source |

Enter source snapshot date, shipping open weekdays (for example 1|2|3|4|5), exceptional shipping closures and source notes. Resource calendars are separate from shipping calendars. For shared studio capacity that exists only when booked, use baseline daily_capacity 0 and positive dated overrides for confirmed slots. Unknown or unconfirmed bookings stay outside usable capacity.

Create immutable source edition validates the eight files and settings atomically. A rejected row leaves all unfinished source text in the draft. Original file imports retain BOM and line endings exactly; text edits deliberately create a changed draft. The original download buttons recover each selected edition's source file. Copy selected originals into new draft makes a complete editable successor, preserving the selected edition unchanged.

## Read the calculation

Orders display actual ready/remaining and projected ready/shortfall separately. Production due retains its real ready/ship/delivery basis; shipBy is absent for an internal-ready target. Batch progress shows explicit targets, actual finished pieces, current stage and latest start. Stages show declared yield, required input/output, scheduled input, projected output, required dates and reserved dates.

Capacity uses the maker's declared comparable unit. It is not inferred from kiln volume, shelf arrangement, clay mass, electrical load, cone schedule or firing physics. Compatibility groups are also declared by the maker. An overload or incompatible group is a production review item; a clean resource table does not authorize equipment operation.

The backward yield calculation rounds required input upward. Forward projected output is conservative to the declared integer yield. Actual complete observations take precedence for measured progress. Zero downstream input retains the required stage dates and shortage but reserves no nonexistent future pieces or compatibility load. Ready stock linked to a completed batch is counted once. Unallocated stock is shown separately.

Change Review as of only to a date at or after the source snapshot. Earlier stock state cannot be reconstructed from an undated snapshot. Future observations remain visible separately and do not contribute to current progress.

## Record an actual stage observation

Select the batch and stage. Confirm the product and source edition in the current plan. Enter a unique event ID, actual timestamp with timezone, actual local date, active or complete status, input/good/rejected/held counts and source reference. The counts must satisfy input = good + rejected + held. A completed stage has no held pieces. A downstream snapshot must occur after the preceding stage's completion and cannot consume more than its observed good output.

Retain observation in a new source edition appends the complete snapshot to a new observations source, copies the other seven original sources and settings, and validates the whole successor before adoption. The previous source edition and observation history stay intact. The form supplies no invented measured date, counts or result. An invalid form remains recoverable in the complete workspace download. A later correction is a later full snapshot with its own event ID/time/source, not deletion of the earlier count.

Batch/stage forms retain separate drafts per edition, review date and stage. Changing the selected source or stage therefore does not reassign a draft to another batch.

## Record the maker's decision

Choose an order, batch or exact resource-day review target. Record revise-date, split-batch, reserve-capacity, recount, accept-risk or hold with reviewer, reason and actual reference. A decision preserves what was agreed; it does not secretly change quantities, orders or resource availability. Receive the revised source as a new edition when the maker changes the plan.

Select a prior decision in Record or correct to append a correction with the same ID. The complete earlier decision remains available. Decisions bind the exact edition, review date, target and source hash.

## Save, hand over and recover

Save in browser stores an independent complete proposed copy and adopts the saved head through a transactional compare-and-swap. A competing tab's saved head is preserved; the proposal remains selectable. The recovery chooser lists independent complete versions. Opening a saved version or imported file validates it before replacing the current state and retains dirty work first.

If browser storage is full or unavailable, keep the tab open and Download complete workspace. Confirm that this exact file was saved before replacing the working copy. Any further edit invalidates that emergency replacement confirmation. Complete downloads preserve source drafts, observation drafts, decision drafts, all original editions, actual snapshots, decisions and current selection.

## Ordinary outputs and native use

Production exports include five CSVs (orders, stages, capacity, observations and decisions), a full readable report and complete JSON. A CSV/report describes the selected edition and review date; the complete JSON retains earlier states and unfinished forms.

Run the create-only native commands documented in README.md:
- node build-workbench.mjs NEW_BROWSER_DIRECTORY rebuilds both complete production applications from source.
- node run-course.mjs NEW_COURSE_DIRECTORY runs the complete authored domain course.
- node cli.mjs report --workspace Maker_Production_Complete_Workspace.json --selection SELECTION.json --out NEW_OUTPUT_DIRECTORY receives the full browser wrapper, preserves that exact original as browser-input-workspace.json and reopens the authoritative core. SELECTION.json contains the actual editionId and asOf, for example {"editionId":"recount","asOf":"2026-10-24"} for the delivered authored worked workspace.

The receive and decide commands are also documented in OPERATE_MAKER_PRODUCTION.md. The command does not infer a selected browser draft as accepted production source. Unfinished form contents remain in the retained original browser JSON.

## Receiving status and practical opening course

The production core's authored course has 24 material checks. Root independently exercised the zero-flow, internal-ready and confirmed-only dated-capacity cases. The production controller's retained source course passed eleven meaningful input/adoption/recovery joins using explicit DOM/storage/download adapters in V8. The complete generated scripts compile. These are source and handler results; the equipped rendered/browser/native receiving remains the existing owner's operation.

For actual receiving, open both HTML applications at desktop and 390px width and look at their presentation. Use the original declared/recount editions, inspect all tables, make a new source draft, record a real authored observation, retain a source-bound decision, export all outputs and reopen complete JSON. Exercise a full browser JSON through the native CLI. Repair the exact current files and return the complete source/result to the original operation.
