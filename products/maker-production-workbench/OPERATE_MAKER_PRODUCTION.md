# Maker-declared production and receiving

This workbench connects an accepted order and a maker's own process declarations to a backward production plan, comparable resource reservations, actual batch-stage counts and source-bound review. It preserves all eight original CSV files in each named edition. A correction adds a new edition or a new review revision; prior sources and observations remain available.

The engine starts with an empty workspace. The included worked example is explicitly authored instructional data. It supplies no drying-time, kiln-size, firing-safety or ceramic compatibility defaults for a real studio. A maker must declare the relevant durations, yields, comparable units, calendars and compatibility groups.

## Establish one actual accepted order

Use the product and quantity the maker actually agreed to produce. A retail listing, a historic lead-time range or a wholesale policy page can inform qualification, but it is not a substitute for that accepted deadline.

Keep the order's due basis explicit:

- ship: the pieces must be ready by the declared ship date; transit_days must be zero.
- delivery: the carrier/transit allowance is declared separately and subtracted using the maker's explicit shipping calendar.
- ready: an internal stocking, shop-release or ready-to-list target; transit_days must be zero. Its production due date is retained and shipBy is null.

The shipping calendar is a list of open ISO weekdays and individually closed dates. It is used to count transit days backward from a delivery deadline. It does not confirm carrier collection, service availability or a customer's receipt. A ship or delivery date on an unusual day requires the actual service arrangement in the source notes.

All dates in the plan are local calendar dates. Stage durations and deadlines are day-granularity declarations, with a stage finishing by the end of its listed last date. The next stage starts on a later date. If a studio needs same-day or hourly operations, retain that requirement in its source notes and use an appropriate finer-grained scheduling tool; this model does not fabricate that timing.

## Choose comparable resource units

Every resource declares one capacity_unit, daily_capacity and explicit open_weekdays. The unit is a maker-defined reservation unit that can actually be compared across the products sharing that resource.

For example, if a maker has measured a mug as one shelf unit and a plate as two shelf units in a particular packing arrangement, a thirty-unit reservation can be evaluated using those declarations. The software must not infer that conversion from piece counts, photographs, dimensions or product names.

Each active stage reserves its whole declared batch input multiplied by units_per_piece on every occupied stage date. This is a batch-occupancy model. It is not a general labor-throughput model or a kiln-packing solver. If a thirty-piece task is actually completed as three independent ten-piece runs, record three separate batches with the relevant actual durations instead of assuming the engine will divide it automatically.

Resource calendars are explicit. ISO weekdays are Monday1 through Sunday7, pipe-delimited in the CSV. A dated calendar row overrides the regular capacity, with zero representing a closure. An absent calendar row uses the resource's declared regular capacity on its declared open weekdays and zero on its other weekdays. A zero regular baseline with positive dated overrides represents explicit reserved slots without inventing recurring access. A required stage with no usable prior date produces a calendar-search error, preserving the source draft for correction.

A stage may use:

- resource-open days: count only dates with positive capacity for that resource.
- calendar days: count consecutive dates, including days that may be closed for the resource.

Calendar-day occupancy on a zero-capacity date remains an overload requiring review. It is not silently moved or assumed safe. A passive drying shelf may have a declared seven-day calendar while a forming bench is open only on maker-selected workdays; these are separate inputs.

## Declare the process route and yields

Every product has a complete ordered route with sequence1 through its last stage, without gaps or duplicate stages. Stage names are maker-defined. The example uses form, dry, bisque, glaze and fire, but the engine is generic.

duration_days is a positive integer from1 to3650. yield_bps is a positive integer up to10000, where9000 means a declared90% expected good yield. This is a planning assumption supplied by the maker. It is not measured yield until actual counts support it.

Starting with the batch's required final good pieces, the engine works backward:

required input = ceil(required output × 10000 / yield_bps)

It repeats that calculation for each stage and places the stages backward from the production due date using each resource's calendar and declared duration. The earliest date of that result is the latest declared start, not a new accepted production commitment.

Remaining forward yield estimates use exact integer floors. Observed good and rejects remain actual quantities; the forecast from held pieces remains a declared-yield estimate. If actual losses leave fewer projected good pieces than the batch target, the shortage stays visible.

compatibility is a maker-declared group key for sharing a resource/day. Different keys on the same resource/day produce a conflict. The key is not a ceramic recipe, cone conversion or safety validation. Use a common declared key for genuinely compatible work and distinct keys where the maker requires separate loads. Real compatibility and firing decisions remain with the studio's own process and equipment instructions.

The workbench reports overload and group conflicts. It does not silently choose another kiln, change a firing, relax a date or optimize the schedule into an invented feasible result.

## Eight source tables

Every table requires its complete header, including an otherwise empty table. Original UTF-8 text, BOM, CRLF, filenames, byte counts and hashes are retained. Quoted CSV cells, embedded newlines and doubled quotes are supported. Duplicate or unknown headers, malformed CSV, wrong row lengths and invalid references reject the candidate before it can replace the current working source.

### Products

product_id,name

Product IDs are exact. The name is a display label. A product sold in a set must be declared in consistent production-piece units across the accepted order, stock and batch allocations. If a two-plate retail set means two physical plates, record the accepted number of physical plates or explicitly define the product as the complete set and use matching normalization throughout. The engine does not infer set size from an item title.

### Resources

resource_id,name,capacity_unit,daily_capacity,open_weekdays

Daily capacity is a nonnegative integer in the declared comparable unit. Zero declares no recurring availability; positive dated calendar overrides can represent only confirmed shared-studio slots. Open weekdays must be an explicit unique list such as1|2|3|4|5. Blank calendars are rejected.

### Calendar overrides

resource_id,date,capacity,source_ref

One row per exact resource/date. Capacity is a nonnegative integer; zero closes the resource. Each override retains its actual source reference.

### Product routes

product_id,stage_id,sequence,duration_days,day_basis,resource_id,units_per_piece,yield_bps,compatibility

The route uses valid product/resource IDs. Sequence, duration and units per piece are positive integer strings. Stage IDs are unique within a product; sequence must be contiguous. All resource and yield arithmetic is exact within safe integer output bounds.

### Orders

order_id,product_id,quantity,due_date,due_basis,transit_days,source_ref

Quantity is a positive integer. Dates must be real ISO dates. due_basis is ship, delivery or ready. Transit days are an explicit nonnegative integer up to3650; ship and ready deadlines require zero.

### Ready stock

stock_id,product_id,quantity,order_id,batch_id,source_ref

Stock quantities are nonnegative integers. A blank order_id means unallocated stock, which does not satisfy any order automatically.

An independent stock row has a blank batch_id and represents already-ready stock outside the current production batches. Its explicit order allocation reduces that order's remaining production requirement.

If finished stock came from a batch included in this workspace, supply its batch_id and the same order/product. That stock is a subset of the batch's observed final good output, not additional supply. The engine counts the final output once and shows the linked stock separately. Total linked stock cannot exceed the batch's final actual good count at the selected date.

Do not duplicate the same physical inventory in independent and linked rows. Use source identifiers and counts that let the maker reconcile the two.

### Batches

batch_id,order_id,target_good,source_ref

Every batch explicitly belongs to one accepted order. target_good is the planned final good quantity allocated to that order. Batch targets are compared with the order quantity after independent ready stock. Both underallocation and overallocation remain attention items.

The model does not split or pool batches automatically. If a batch supplies several orders, the maker must establish an explicit allocation representation before using this one-order-per-batch contract.

### Observed stage snapshots

event_id,batch_id,stage_id,observed_at,local_date,status,input_qty,good_qty,reject_qty,held_qty,source_ref

Each row is a complete count snapshot for one batch/stage, not a movement to be added to earlier snapshots. Distinct event IDs preserve observation and correction history. The latest eligible snapshot drives current progress.

observed_at requires a full timestamp and UTC offset. local_date must match that timestamp's own date. The engine does not silently convert it into another studio timezone. Two snapshots of the same batch/stage at the exact same instant are ambiguous and rejected.

status is active or complete. Counts must conserve input exactly:

input_qty = good_qty + reject_qty + held_qty

A complete stage must have zero held pieces. A downstream observation requires an earlier completed upstream snapshot and cannot receive more pieces than the upstream good count. If a later correction to the upstream count makes an existing downstream count impossible, the source needs a coherent correction before it can be received.

Snapshot corrections do not add their counts. A final unload of10 good pieces followed by a corrected snapshot of9 good pieces yields9, with both source records retained.

## Source snapshot date and as-of review

Each edition declares settings.asOf and its shipping calendar. Independent ready stock is a source snapshot, not a dated movement ledger. Consequently plan.asOf may be that date or a later date, but cannot precede the edition's snapshot date.

Observations after the selected as-of date remain retained under futureObservations and do not drive current progress. Use an earlier source edition to review a genuinely earlier inventory state.

Completed stages release their future plan reservations. A batch with zero surviving input also reserves no downstream resource dates and contributes no compatibility group; its required dates and shortage remain visible for replanning. Active stages retain their current source snapshot and planned slots; the engine does not invent the remaining duration or re-time the batch merely because a partial count was entered.

An unstarted stage whose latest start is before asOf is explicitly late. A first retained active observation later than the planned start prompts review of the actual start and remaining duration. An active snapshot by itself does not prove when the work began. Late upstream completion also remains visible when it conflicts with the sequential planned downstream dates.

A passed due date with an observed remaining shortfall is a separate order attention item.

## Review decisions and corrected editions

A review targets an exact order, batch or resource/day within an edition and as-of selection. Allowed actions: revise-date, split-batch, reserve-capacity, recount, accept-risk and hold. Record the reviewer, reason and source/evidence reference.

A decision documents the intended action; it does not change dates, resource capacity, observed quantities or orders. Receive new original CSVs and settings as a new edition to represent an actual correction.

Reuse a decision ID only to correct the same exact source/date/target. Current decisions use the latest revision, while decisionHistory and the ordinary decisions CSV retain every earlier version. The same ID cannot silently move to a later edition or another target.

The workspace retains every source edition, all original observations and full review history. Reopen recalculates source hashes, schema, references, observation conservation, edition identity and decision binding. UI adoption should occur only after reopen succeeds. Unfinished browser forms belong in the complete desk wrapper and remain separate from accepted core editions.

## Worked example and independent hand calculation

The example is explicitly authored. It declares two orders:12 mugs for delivery on2November2026 with two open shipping days of transit, and8 plates to ship29October. The shipping calendar is Monday–Friday, so the mug ship-by date is29October. Two ready mugs are allocated independently; one spare remains unallocated. The remaining batches target10 mugs and8 plates.

The mug route has yields100%,90%,90%,100%,90%. Backward input requirements for form/dry/bisque/glaze/fire are16,16,14,12,12. The plate route's corresponding requirements are12,12,10,9,9.

The declared calendar places form on21–22October, dry on23–25October, bisque26October, glaze27October and final fire28October. Drying includes the weekend because that shelf's dates are explicitly calendar-based. The model does not derive drying from ceramic wall thickness or humidity.

Mugs occupy one declared resource unit per piece; plates occupy two. Forming therefore reserves16+24=40 units on each of two dates against capacity30: two overloads of10. Bisque reserves14+20=34 against30: a third overload of4. Final firing reserves12+18=30, exactly at capacity, but the maker declared glaze-6 and glaze-10 as different compatibility groups, so that shared day remains a conflict.

The maker first records a load review to reserve a separate slot, then corrects the note to hold pending confirmation. Both decisions remain and the original conflict is unchanged.

In the observed edition the mug batch moves through dated count snapshots:16 formed with15 good,15 dried with14 good,14 bisqued with12 good,12 glazed, then12 unloaded with10 good and2 rejected. A stock record explicitly links those same10 finished mugs to the batch. The order is ready with2 independent mugs plus10 actual batch mugs, not22. Completed stages release remaining reservations; the plate batch still has late unstarted work.

A third edition corrects the final unload to9 good and3 rejected and the linked stock to9. The mug order now has11 actual ready and1 still required. The earlier unload remains in the source and is not added to the corrected snapshot. All earlier editions and load-review revisions remain portable.

## Native continuation and ordinary outputs

Requires Node.js18 or later; no dependency install is needed.

node run-course.mjs NEW_COURSE_DIRECTORY

This invokes the same maintained source course over the production engine and creates the complete result in a new directory. The delivered source course was executed against the production bodies in V8.

node cli.mjs receive --manifest examples/native-manifest.json --out NEW_PRODUCTION_DIRECTORY

The manifest names all eight CSV paths, workspace and edition metadata, settings and selected as-of. Source paths resolve relative to the manifest. Every file is read once, strictly decoded as UTF-8 with BOM preserved, and retained as the original for the received edition.

node cli.mjs receive --workspace PRIOR/workspace.json --manifest CORRECTED_MANIFEST.json --out NEW_CORRECTED_DIRECTORY

node cli.mjs decide --workspace PRIOR/workspace.json --decision DECISION.json --out NEW_REVIEW_DIRECTORY

node cli.mjs report --workspace PRIOR/workspace.json --selection SELECTION.json --out NEW_REPORT_DIRECTORY

The runner also accepts a complete browser wrapper with schema tjlabs.maker-production-desk.v1 and object workspace/session. It opens the authoritative core workspace and preserves the entire exact browser input as browser-input-workspace.json, including unfinished drafts. COMPLETE.json records that original's byte count and SHA-256. Pure core JSON remains supported.

Every output directory must be new. Outputs include full workspace.json, plan.json, report.html, five ordinary CSVs and all eight original tables for every edition. Metadata retains each source's original filename/hash and edition settings. COMPLETE.json is written last; an interrupted directory is kept and may be useful for recovery. Correct the problem and use a new destination. A native error returns a nonzero exit code.

The complete report contains the current full plan, original sources and retained workspace. It is a private operating artifact once real order and studio records are added.

## API and maintenance

The self-contained classic source defines createMakerProductionCore. The module exports the same factory. Orders and batches expose productionDue for every deadline basis; shipBy is populated only for ship/delivery orders. Its public methods are create, addEdition, plan, decide, reopen, csv and report, with columns, actions, sampleSources and sampleSettings for a compatible operator.

All production quantities originate in retained sources. Maker-profile research supplies qualification and commissioning prompts, not inventory or observed production. Reuse the engine by importing complete source editions and preserving exact reviewer context, rather than copying a worked example's figures into a real shop.
