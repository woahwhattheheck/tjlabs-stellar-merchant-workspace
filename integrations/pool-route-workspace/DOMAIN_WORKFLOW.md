# Pool Route Workbench — complete source and operating guide

## Open and use the workbench

The worked workspace contains a complete authored operating day with nineteen original source tables and six retained source editions. Open the worked application to inspect the day, choose an edition and examine a pool, job, route stop, service record, report or delivery. The blank application starts a separate workspace for the operator's own exports. Preserve the complete workspace when transferring work between machines.

The current edition includes five pools, four actual completed visits and another scheduled visit at an already counted pool. The explicit expected visit for Pool E has no assigned job. Technician C's selected assignment changed after the original dispatch. The actual field completion retains the technician who did the work. The route comparison exposes observed arrivals in a different order without guessing travel time or geography.

## Complete source intake

Receive all nineteen CSV families with explicit headers, including headers for an empty table. Original CSV text, source filenames, byte lengths and hashes remain in every edition. Customer, pool and property identity must agree across the original pool master and each booking. Each imported pool has an explicit original system and identifier so that overlapping imports can be found before accepting an edition.

The generic booking and money families are resources, availability, booking_revisions, quoted_lines, completions, invoice_lines, payments and allocations. Domain families are pools, pool_statuses, expected_visits, route_stops, service_versions, readings, media, report_artifacts, report_deliveries, delivery_events and billing_periods. The accompanying contract gives every exact required column.

A completion table supplies one explicit current physical-work observation per job within an edition. Earlier physical-work snapshots remain in earlier complete editions. Booking revisions and service versions are separate histories: changing dispatch does not rewrite a technician's captured source body. All timestamps require seconds and an explicit UTC offset.

## Recurrence and route operations

An expected visit is an explicit source occurrence with its own stable occurrence ID, series ID, pool, permitted time interval and authority. The workbench does not manufacture dates from a word such as weekly. A selected route stop points to one exact booking revision and optionally to one exact expected occurrence. Revised stops retain their original counterparts.

The current selected stops are compared by declared route and technician. Planned stop sequence and actual arrival order remain separate. Duplicate source sequences, a changed actual technician, an expected occurrence with multiple active jobs, an expired occurrence without recorded completion, and a planned visit outside its original occurrence window appear as actionable records. These comparisons use supplied timestamps and identities; the application does not infer road distances or chemical actions.

## Offline service records and corrections

A service version retains its exact job and booking revision, captured time, observed time, complete work JSON, customer notes, internal notes, disposition and authorization. Corrected versions use a strictly ordered predecessor chain. Before the observed time, a source remains in the future-source section; after receipt it becomes visible without changing the time the work occurred.

The example's original JOB-A service was captured at 10:35 and observed at 12:30. Its original report preserves the pH transcription 7.8 and the original media ID. A corrected service version records pH 7.4 with its source method and units. The original report's digest and selected members stay intact, and a second report binds the corrected body. Source media and report artifact bodies are included under sample/artifacts so their hashes can be reproduced.

Readings retain the original analyte, literal value, units, method and measurement time. Media retain original source references and optional actual artifact hashes. A report names its exact selected reading IDs and media IDs; no report automatically acquires later source changes.

## Delivery and customer communication

A report delivery is its own authorized attempt, exact report, recipient, channel and submission observation. Each provider event retains both occurred time and observed time plus an evidence reference. Current delivery status follows the latest occurred event among events already observed. The latest transport status and the recipient acknowledgement each also retain their own event identity, evidence and occurred/observed times. A later transport observation leaves the earlier acknowledgement visible. Failure attention follows transport outcomes. This prevents an older delivered callback, received late, from replacing a newer bounce.

The example keeps the original report's bounce, a delayed older delivered callback, a separate retry of the same original report, and an independently acknowledged corrected report. Repeated attempts remain separate so an operator can inspect the actual communication history.

## Monthly subscription comparison

The Pool Route Monitor source rule defines an active pool through at least one scheduled or completed service during the current billing month and excludes paused or inactive pools at billing time. The contract records the explicit period, count observation, currency, supplied platform rate, supplied per-pool rate, excluded statuses and rule reference. An operator must provide the applicable rates and period; trial or partial-month rates require their own supplied proration reference.

At the example's explicit count time, pools A and C are active and eligible. A has two qualifying jobs and counts once. Pools B and D have qualifying work but are excluded by their observed paused/inactive states. Pool E has an expected occurrence without a job and does not qualify from recurrence alone. Supplied rates of USD 20.00 and USD 0.99 per counted pool produce USD 21.98. A missing eligible pool status yields an unresolved comparison with the known subtotal retained.

This monthly platform comparison is separate from customer invoice money. The example's independently supplied customer invoice is USD 60.00 with USD 20.00 explicitly applied, leaving USD 40.00. Another USD 15.00 remains authorized booking credit against a job with no supplied invoice. The workbench does not infer that the vendor implements customer invoicing from its subscription checkout.

Product rule sources: https://poolroutemonitor.com/ and https://poolroutemonitor.com/terms-of-service.html. The original public rule is technical provenance for the explicitly supplied authored comparison.

## Review, export and continuation

Each review binds its subject, exact edition source hash, reviewer, reason, evidence and predecessor. The eleven domain subject types are pool, poolStatus, expectedVisit, routeStop, serviceRecord, reading, media, reportArtifact, reportDelivery, deliveryEvent and billingPeriod. Complete histories survive reopening and can be inspected by edition.

CSV exports preserve all derived fields and original source fields. The complete HTML report includes every source table, attention record, full review history and a full core-workspace download. The browser/native desk wrapper additionally preserves its selection, draft inputs, accepted receiving records and user interface state; use that complete wrapper for continued desk work.

The executable operating course checks the full sequence from before offline synchronization through original report delivery, correction, bounce, delayed callback and later service upload. It also exercises all eleven domain review and export paths, monthly pool deduplication, independent customer money and an unresolved-status case. Actual artifact bodies accompany the authored example.

## API

Factory: createPoolRouteCore({codec}). Workspace schema: tjlabs.pool-route-study.v1. Desk wrapper schema: tjlabs.pool-route-desk.v1. The module provides create, reopen, receive, analyse, review, report, csv, hash, canonical and parseCSV. The runtime codec supplies UTF-8 and SHA-256 operations. Every analysis row has key. Additional analysis tables, review types, sample sources and sample settings are exposed by the module.

The primary operational result includes poolSummary and poolFuture, complete source-bound arrays for all eleven domain analyses, and the independent booking/resource/finance results. Monetary arithmetic uses integer minor units with explicit currencies. Source editions are immutable after receiving.
