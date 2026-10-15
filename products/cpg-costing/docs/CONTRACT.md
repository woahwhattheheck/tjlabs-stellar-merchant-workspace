# CPG Costing Rehearsal — complete domain contract

This module supports an owner-approved analytical review of supplier receipts, landed charges, recipe revisions, batch consumption and channel contribution. Retain original records, make calculation conventions explicit, and freeze named editions for comparison and independent reopening.

## Files and API

`costing/core.mjs` exports `createCostingAPI(runtime)`, `blankInput()`, `TABLE_FIELDS`, and `INPUT_SCHEMA`. Runtime supplies synchronous SHA-256 accepting UTF-8 strings or Uint8Array, strict UTF-8 encode/decode, and canonical Base64. The Node implementation is in `native/runtime.mjs`.

Factory methods are synchronous and pure:

- `createWorkspace({title,createdAt,id?})` returns the blank immutable workspace.
- `addSource(workspace,{name,mediaType,content_base64},meta)` returns `{workspace,sourceId}`.
- `readSource(workspace,sourceId)` returns the exact original record.
- `inspectSource(workspace,sourceId,{format,arrayPointer?})` returns original rows, columns and occurrence references.
- `mapTable(workspace,sourceId,{format,arrayPointer?,mapping})` maps explicit destination fields to source CSV headers or JSON pointers. It returns rows with original references. Missing fields are errors; map heterogeneous rows separately or author an explicit structured input.
- `analyse(input,workspace)` previews calculations without changing workspace.
- `saveEdition(workspace,{name,input,parentEditionId?,preparedBy?,note?},meta)` returns `{workspace,editionId,report}`. It can retain an incomplete edition and its findings.
- `review(workspace,{editionId,decision,reviewer,note},meta)` returns the new workspace directly. Decisions are approved or needs-work. Approval never removes findings or turns missing values into zero.
- `compare(workspace,leftEditionId,rightEditionId)` returns matched/unmatched rows, both metrics and qualified deltas.
- `exportWorkspace(workspace)` returns `{filename,content,sha256}`. `importWorkspace(content)` validates full operation replay, originals, report calculations and reviews.
- `parseJSON(content)` parses structured application inputs while rejecting duplicate members. Source JSON inspection additionally retains every numeric token as text.

Meta is `{operationId,expectedRoot,at}`. Exact same-operation replay is idempotent. Changed payload or stale root rejects before changing state.

## Input and units

Input schema `tjlabs.cpg-costing-input.v1` contains one selected currency, an ISO `asOf` date and all arrays in `costing/input-fields.json`. Amounts, quantities, percentages and weights are plain decimal strings, up to 60 digits and 24 decimal places. Blank or missing costs remain unknown. A declared zero is different.

Built-in units are kg, g, lb, oz, l, ml and each. Mass conversions are exact. Additional per-item conversion rows declare target units per one source unit. Conflicting paths, including contradictions with built-in conversions, make the edition incomplete. Item-specific pack/count-to-mass conversions are explicit; no density or pack size is inferred.

Receipt lots select either an invoice amount or a unit price with explicit price quantity and price unit. Both at once is an error. Receipt quantities must be positive. Each lot declares whether landed charges are complete. Shared charges use explicit amounts that exactly sum to the source charge, or positive owner-selected weights. Weighted allocations remain exact rational values; display rounding does not alter conservation.

Standard selections explicitly choose a cost lot for each item. Recipe revisions retain date intervals, output quantity/unit and separately declared standard additional costs, including zero. Each recipe line defaults to required input quantity. If `quantityBasis=net_before_loss`, its explicit yield percentage divides the line quantity. A required-input line cannot also apply a yield factor. Multi-level recipes resolve recursively and reject cycles. Recipe comparison uses selected as-of receipt costs; it is not a historical booked standard.

Actual batches refer to the appropriate recipe revision on their production date. They consume selected receipt lots or upstream batches, with explicit quantities and units. Additional costs, good output and reported scrap are separate. Aggregate consumption across all batches cannot exceed a receipt or upstream batch. Sales plus downstream consumption cannot exceed a batch's good output. Source records after the applicable date cannot create complete costs.

Output yield is good output divided by good plus reported scrap in compatible output units. It is not ingredient mass yield. Recipe quantities and actual consumption are not silently grossed up again.

## Revenue and fees

Each sale declares `revenueBasis=gross` or `net_realized`, a date range, units, quantity, currency and whether channel fees are complete.

Each fee declares `treatment=deduct` or `already_in_revenue`. Already-reflected amounts require net-realized revenue and are disclosed without being deducted again. A percentage fee explicitly declares `rateBase=recorded_revenue`; it uses this row's recorded revenue with no compounding. Fixed signed amounts can represent owner-selected credits or adjustments. No distributor code, tax treatment, refund policy or commission basis is inferred.

Reports preserve recorded revenue, attributed COGS, selected additional fees, contribution and percentage margin. Every amount includes a rounded display value, exact numerator/denominator, complete/estimated/incomplete status, missing reasons and original references. A known portion can be useful even when the total is incomplete. Global structural errors make derived cost and contribution metrics incomplete.

## Sources, comparison and history

Original bytes are retained in canonical Base64 with byte count/body hash and original name/type. CSV/TSV inspection preserves logical row occurrences, quoted delimiters and line breaks. JSON duplicate members reject; numeric tokens do not pass through binary floating point. Mapped source references resolve exact original pointers/rows/fields. Manual rows are visibly flagged. A source reference supplies provenance, not a guarantee that an owner-entered value was copied unchanged; the full selected input is retained for review.

Frozen editions retain all original input contexts. Comparisons require matching IDs, item/SKU, units and currency plus complete non-estimated amounts. Sale quantity, period, channel, batch and revenue basis must match for a like-for-like delta; changed batch output also disqualifies a paired unit-cost delta. The operator shows full contexts. Deltas do not prove operational improvement.

Admission is 20 MiB per original, 64 MiB originals per workspace, 10,000 rows per inspected table, 20,000 domain rows, and 128 MiB complete workspace. This is not a speed promise at maximum size. Start with a small agreed cohort and increase the scope only after measuring the complete workflow.

## Example and version handling

`examples/authored-input.json` and `costing/example.mjs` contain invented data only. The blank workspace is separate. Baseline contribution is exactly 440/3; a single oat invoice correction yields132. Both editions and originals remain reopenable.

Engine version1.1.0 records its calculation rules in every workspace. Import rejects an unsupported engine instead of silently recalculating a retained edition under changed rules. Keep the complete source used to create each working file.
