# Production run source contract

## Purpose and authority

This independent JavaScript module reconciles retained manual production records into a readable, reproducible run review. It never operates equipment, writes payroll/accounting/ERP records, infers sensor data, certifies production performance or releases a job. The blank input is the default. The complete two-line example is expressly authored and is not customer production data.

The commissioned scope can select one line/product flow, one agreed CSV/TSV/JSON layout per declared table set, up to 12 runs with 1,000 counter intervals each, one read-only export adapter and two written reviews. The engine's broader admission limits are not performance guarantees. Actual installed runtime, customer mappings and UI receiving remain acceptance work.

## Whole source and immutable lifecycle

createProductionAPI(runtime) uses explicit sha256, encode, decode, toBase64 and fromBase64 functions. The native runtime uses Node's built-in crypto and strict UTF-8. No external package is needed.

createWorkspace({title,createdAt,id?}) creates a deeply immutable blank working record. Every mutation takes {operationId,expectedRoot,at}. The same operation ID can replay only its exact payload, original prior root and timestamp. A changed payload or stale preview root is rejected.

addSource(workspace,{name,mediaType,content_base64},meta) retains every exact original byte and returns {workspace,sourceId}. Opaque originals can be retained; only exact UTF-8 tables can be inspected. A BOM may remain in the original and is removed only in the parser view. Originals with distinct names remain distinct source identities. Source intake is bounded to 20 MiB each and 64 MiB retained originals per workspace.

inspectSource(workspace,sourceId,{format:"csv"|"tsv"|"json",arrayPointer?}) returns all original rows, source references and fields. CSV headers are explicit, unique and nonempty; malformed row widths or quoting are rejected. JSON numbers preserve exact lexical strings, duplicate members are rejected, and an explicit array pointer is required for nested arrays. At most 50,000 rows per selected table are admitted. An empty JSON array is valid.

mapRows uses explicit target-field→source-column (CSV/TSV) or target-field→relative JSON pointer mappings. analyse(input,workspace) is read-only. Missing/invalid fields remain findings and original occurrences stay retained. No leading-zero ID, unit, currency, time or quantity coercion is inferred.

saveEdition(workspace,{name,input,parentEditionId?,preparedBy?,note?},meta) freezes the full input, report and source identities, including error findings. It returns {workspace,editionId,report}. A correction points to the prior edition; it does not replace an original. compare returns all changed rows and complete per-run basis/coverage context. propose freezes the exact comparison. review returns a workspace directly and binds comparisonSha256, named OPERATIONS/FINANCE discipline, approved/needs-work decision, reviewer and note. The latest decision for each required role determines source-review status. An invalid predecessor can be corrected and approved when the candidate has no source errors; baseline comparison caveats remain visible. REVIEW_COMPLETE concerns the review package, not operational release.

exportWorkspace returns compact complete JSON with filename and SHA. importWorkspace and validateWorkspace replay every retained operation, input, report, comparison and review against exact originals; changing a saved report fails. Own deeply frozen objects retain trusted identity for performance. External mutable inputs are always replayed. Complete compact working admission is 128 MiB.

## Explicit input tables

The schema is tjlabs.production-run-input.v1. Scope includes siteId, label, asOf and clock. Every table selects sourceId, format, arrayPointer and mapping. Blank tables can remain unselected, but required run/standard inputs and any explicitly claimed completeness must be supplied.

| Table | Required meaning |
|---|---|
| runs | ID, physical single-capacity lineId, SKU, start, optional end, standardId, output unit, currency, optional revenuePerGood, pipe-separated requiredCostCategories, explicit timeComplete/outputComplete/laborComplete/costComplete booleans, goodBasis first-pass or final-good |
| standards | Version ID, SKU, unit, effectiveFrom, optional effectiveTo, optional idealCycleSeconds, optional standardCycleSeconds and standardCrew |
| stops | ID, runId, start/end, kind stop or excluded, reason |
| labor | ID, runId, workerId, start/end, allocation fraction greater than zero and at most one, optional hourlyRate, currency |
| output | ID, runId, timestamp, mode delta or counter, counterId where applicable, total, good, explicit reset flag, resetTotal/resetGood where reset is true |
| charges | ID, runId, category, optional quantity/quantityUnit/unitCost, optional explicit amount, currency and note |

Exact decimals are text with at most 60 significant digits and bounded exponent. BigInt rational arithmetic preserves exact sums, products and ratios. Display values round to nine decimal places; each result also includes its exact numerator/denominator. Monetary values remain supplied currency amounts without an implicit FX rate or currency rounding policy. Count/production units are explicit; no kg/each or cycle-time conversion is inferred.

IDs must be unique within each table. All occurrences of a duplicate are retained and invalid; no row wins by order. A referenced run must resolve exactly once. An invalid unrelated source row remains a visible whole-source error and can conservatively withhold complete conclusions.

## Time, stops and standards

Timestamps use an explicit ISO date, T time, seconds, optional millisecond fraction and Z or numeric offset. Naive local timestamps are rejected unless one fixed UTC offset is explicitly selected. A fixed offset is not a named time zone and does not infer DST; split/map ambiguous clock periods upstream. Calendar dates are checked, and leap seconds are not silently normalized.

Time intervals are half-open [start,end). An open run or stop uses the explicit asOf cutoff. A run with a declared future end is reviewed only through asOf and marked partial. Input labor/stop intervals must fit that selected window; the engine requests an explicit split/correction rather than clipping silently. Output observations include the closing timestamp.

A physical line can have one active run at a time. Concurrent runs require distinct declared line IDs. The selected standard version must match the SKU/unit and remain effective for the whole evaluated window; a mid-run standard change requires a split.

Excluded intervals mean the owner did not intend production. Planned changeovers belong to stop time, unless the owner has deliberately classified their denominator otherwise. Stops and exclusions are unioned separately. Stops inside exclusions are removed from the stop denominator. Overlapping reasons remain retained; raw reason durations are not additive. Window minus exclusion union gives planned time; planned time minus applicable stop union gives run time.

Planning standard cycle time and ideal cycle time are different fields. Planning expected output uses planned time/standardCycleSeconds. OEE uses idealCycleSeconds. No field substitutes automatically for the other.

## Output evidence and counter resets

A run uses one delta stream or one physical cumulative counter. Mixing modes or counter IDs is an error. Delta records are explicit increments; duplicate timestamps require reconciliation rather than silent summation. A zero-production declaration requires an explicit zero record.

Cumulative records require a baseline exactly at run start and a final reading exactly at the selected cutoff. Baseline values are not production. Each interval normally contributes the difference between successive readings. A decrease is an error unless the next record has reset=true and complete immediately-before-reset resetTotal/resetGood values. Its interval increment is:

(before-reset terminal reading − prior reading) + new counter reading.

This convention assumes reset to zero; a nonzero restart baseline must be normalized into a separate owner-approved source. Before-reset values cannot be below the prior counter, and good increments cannot exceed total increments. Multiple resets between observations require an explicit upstream reconciled record or a split. Counter wrap is not guessed. Source rows and both sides of each derived interval are retained.

Good count must not exceed total. goodBasis=first-pass is required for OEE quality; final-good including rework remains a different convention. A counter/delta total alone does not prove its owner-declared coverage is complete.

## Labor, supplied costs and contribution

Worker allocation is a fraction of one named worker's time. The sweep checks all selected runs together: simultaneous allocations for a worker cannot sum above one. Adjacent intervals do not overlap. Valid allocations sum hours × allocation × supplied hourlyRate; they are not unioned into free labor. A missing wage is unknown, never zero. Staffed-run completeness requires at least one worker record; a fully unattended zero-labor model needs an agreed extension rather than invented workers.

Charges use an explicit amount or exact quantity × unitCost. If both are present they must match exactly. The quantity unit is mandatory for a rate extension. Labor cannot also appear as a charge category. Currency must match the run; explicit upstream conversion is needed otherwise. Every required charge category needs an explicit amount, including an explicit zero. Unlisted categories are shown and make declared cost coverage incomplete.

recordedOutputValue = good quantity × supplied revenuePerGood.
knownCostContribution = recordedOutputValue − known allocated labor − explicit charges.

This is a supplied-cost contribution against valued output, not an assertion of invoiced sales, cash, full business margin or net profit. completeContribution is available only when the candidate has no source errors, output is complete, all wages and declared categories are resolved and the owner explicitly marks cost coverage complete. The owner must define which material, overhead and other costs the agreed scope includes. Known values remain visible when completeness is false.

## Performance and comparison

Availability = run time / planned time.
Ideal performance = ideal seconds per unit × total output / run time.
First-pass quality = first-pass good / total.
OEE = availability × ideal performance × first-pass quality.

These conventional formulas are documented by Vorne at https://www.oee.com/calculating-oee/ and https://www.oee.com/oee-factors/. Positive denominators, complete declared time/output coverage, consistent source rows and an explicit ideal cycle are required. A calculated performance above one is exposed as an error with its unaccepted calculation; it is not capped or labeled complete. Zero output can be valid evidence but leaves the ratio decomposition unavailable.

The report does not average OEE across heterogeneous runs. Comparison retains changed source rows, actual run unit/currency, clock/cutoff, full standard version, time denominator, output convention and coverage. Paired deltas may be shown for inspection; different bases are flagged and do not establish improvement. A correction of bad records is not proof that physical production changed.

## Authored example and runtime evidence

Two authored four-hour runs use separate lines. RUN-A has two overlapping 30-minute stop records: 3,600 raw seconds become a 3,000-second union. A 15-minute excluded break leaves 13,500 planned seconds and 10,500 run seconds. Total900/good855 at ideal10s yields OEE19/30. Supplied labor200 + material180 + other20 gives400 known cost; good output valued855 gives455 contribution.

RUN-B's complete reset evidence yields total1000/good950, OEE19/27, labor160 + charges220 =380 known cost, output value950 and570 contribution. The received version instead overlaps one worker's allocation and omits reset evidence; three errors withhold complete metrics. Correction preserves all received originals.

The actual source course covers 25 meaningful preservation/arithmetic/review cases. The actual V8/pure-codec capacity course retained12 runs ×1000 intervals,12,072 original rows, two editions, full comparison/reviews and independent whole replay in105,845ms. Its complete workspace is26,210,772bytes. These timings are not native Node or browser claims. The actual large workspace is retained separately so operator handover can be measured without regenerating source data.
