# Saved cash-plan realization

This operator reviews an immutable saved receipt-plan edition against the original receivables ledger. It retains the complete forecast, complete relevant original source, exact monetary values and the source revision used for the review. A following review is another immutable record in the same account.

## Operator journey

Open **Cash plans**, open the intended saved edition, and choose **Review actual receipts**. Select the review-through account date and write the review note. Recalculate and inspect the receipt performance, invoice balance bridge, dates, full receipt inventory and original allocation, credit and void history. Save the reviewed realization using the existing account operation flow.

The **Realized receipts** list remains on the same Cash plans page. Open any saved review to download its full JSON, readable HTML, invoice/date/event/receipt CSVs and manifest. **Following review of this original edition** retains the selected original forecast edition. It reads the newer original ledger only when recalculated. Changing a date or note invalidates the earlier preview. The original UI's pending request and journal reconciliation handle a lost save response.

Every amount is an exact decimal string interpreted in its currency's original scale. Currency totals remain separate. CSV uses the original account export escaping, including spreadsheet formula protection. The full JSON is the lossless source representation.

## Financial meaning

The saved plan's account date is its opening end-of-day balance. New incoming cash has a received date strictly after that date and no later than the selected review date. The expected receipts retain their original forecast dates and horizon. Review dates can extend beyond that horizon, up to 3,660 days after the opening.

**Attributed incoming cash** is new incoming receipt value actively allocated to the original planned invoices at the selected review date. Its chart date is the original received date. A payment received on Monday and allocated on Wednesday therefore remains Monday cash. An older receipt allocated after the opening remains separately visible as **earlier cash allocation change**. Individual forecast installment or promise rows do not receive invented cash matches.

The receipt inventory includes the selected invoices' original receipts and the same customers' receipts in the same currencies. It exposes gross incoming receipt value, allocations to planned invoices, allocations to other invoices, refunds and unused funds separately. A customer can pay without allocating the funds to the selected invoices; that receipt remains visible but does not count as attributed cash.

The exact invoice bridge is:

```
saved opening
+ opening correction
- allocation change
- credit change
+ lifecycle change
= current signed balance
```

Opening correction compares the frozen saved opening with the original ledger recomputed at that date. A later recorded backdated credit is therefore visible as an opening correction. Credits, allocation releases and invoice voids retain their own event kind and date. They do not become receipt cash. The current amount due and credit balance are also retained separately.

Receipt corrections use the original accounting-date and void sequence. A replacement with the same cash date becomes effective at its own original accounting date, and the reversed receipt ceases to contribute then. The full original source includes the native refund records required for cross-record adoption and transfer ownership. Refund changes, reservations and unreconciled refunds use the unchanged native receipt reader. Refunds are customer-receipt context; no invoice-specific refund attribution is inferred.

If an original planned invoice is absent or its customer/currency changed, the review requires repair of the original source. A changed immutable document or recomputed opening basis is explicitly reported. New invoices outside the saved plan never enter its selected invoice population.

## Source and immutable writer

`cash-realization.mjs` is the financial projection and full export implementation. `cash-realization-workspace.mjs` shares the original ReceivablesWorkspace, serialized writer, workspace revision and request journal. It creates no separate ledger.

A preview contains `workspaceId, revision, request, report, reviewSha256`. The SHA-256 covers the complete JSON basis in that order using the original account serializer. Save recalculates the full review inside the original mutation and requires that digest. Same request ID and exact intent replay the original result before revision checking, including after a lost response. A changed request under that ID conflicts.

The frozen review contains the complete saved plan edition and relevant raw source. Reprojecting `report.source` with `report.plan` and `request` reproduces the entire report. The source includes full original refund records because the native reader resolves cross-record dependencies. Each preview is capped at 32 MiB; receiving and client readers preserve the complete supported object.

## Original interfaces

HTTP routes under the existing receivables API:

| Method | Route | Result |
|---|---|---|
| GET | /cash-realizations?planId=UUID | Complete immutable review list |
| POST | /cash-realizations/preview | Full current preview of one saved edition |
| POST | /cash-realizations | Original journaled save |
| GET | /cash-realizations/UUID | Full frozen review |
| GET | /cash-realizations/UUID/files/NAME | Exact original report file |
| GET | /cash-realizations/operations/REQUEST_ID | Original operation and saved result |

The existing ReceivablesClient exposes `cashRealizations`, `previewCashRealization`, `cashRealization`, `saveCashRealization`, `cashRealizationFile` and `cashRealizationOperation`. Their inputs and complete results are declared in `cash-realization-types.d.ts` and the original client declarations.

The existing receivables CLI exposes `cash-realizations`, `cash-realization-preview`, `cash-realization-save`, `cash-realization`, `cash-realization-file` and `cash-realization-operation`. Use its original global workspace, request-file, revision, actor and request-ID options shown by `--help`.

The Merchant MCP operation prefix remains `merchant_accounting_receivables_`. New suffixes are `cash_realization_list`, `cash_realization_preview`, `cash_realization_detail` and `cash_realization_save`. Detail selects `cashRealizationId`; preview/save retain `workspaceId, planId, editionId, through, note`; save also requires the original actor, request ID, revision and review digest. The file kind is `receivables-cash-realization` with `cashRealizationId,file`.

The existing accounting-receivables client validates the full preview digest, frozen edition and retained source before preparing a save. Its durable CLI supports:

```sh
node stellar-forge/mcp-merchant-operator/accounting-receivables-cli.mjs cash-realization-preview --url "$MCP_URL" --workspace "$ACCOUNT_ALIAS" --request /private/review-selection.json --out /private/review-preview.json
node stellar-forge/mcp-merchant-operator/accounting-receivables-cli.mjs prepare --url "$MCP_URL" --workspace "$ACCOUNT_ALIAS" --action cash-realization-save --preview /private/review-preview.json --actor "$OPERATOR" --request-id "$REQUEST_ID" --dir /private/original-operation
node stellar-forge/mcp-merchant-operator/accounting-receivables-cli.mjs execute --dir /private/original-operation
node stellar-forge/mcp-merchant-operator/accounting-receivables-cli.mjs reconcile --dir /private/original-operation
```

Use the original private-file modes required by that CLI. Its existing connection/token handling remains unchanged. No credential belongs in the preview, source export or receiving packet.

## Complete native and browser continuation

Import `receiveCashRealization` from `cash-realization-receiving.mjs` into the original account's existing receiving operation. Supply its already-open receivables controller or HTTP client, exact selected plan/edition/through/note, actor, stable operation ID and original durable `load(name)/save(name,value)` callbacks.

The function retains the input, complete preview and prepared save request before mutation. It saves once, replays the original native request, reads the immutable report, reproduces it from its full original source, receives and verifies all seven files, and confirms the unchanged forecast edition. File bytes are retained as exact base64 with size and SHA-256.

Supply `reopen` to drain/close and reopen the original accounting owner, returning its controller/client. The function then compares the entire frozen review and forecast, repeats the original request and verifies all file hashes. The outer owner retains responsibility for its actual server/lease. Without this callback the result accurately remains `NATIVE_COMPLETE_REOPEN_PENDING`.

A following review uses the same operation/plan/edition with an explicit new `reviewAttempt`. The original attempt's input and preview never change. This also provides the explicit path after a current-revision or changed-source rejection: recalculate a following attempt and preserve the earlier observation. The stable operation prefix is at most 120 characters and attempt at most 24, keeping the generated native request below its 160-character limit.

Import `receiveCashRealizationBrowser` with the same native result, already authenticated existing receivables page, original client and case save callback. It operates the actual desktop and 390-pixel view, checks the complete planned invoice population and exact amounts, captures both views, downloads the complete JSON, edits a following preview and checks that old approval is invalidated, then reloads the original saved report. It leaves the following review unsaved for inspection. The owner retains page/context/server cleanup and records any actual browser failure in the original case.

## Executed financial source course

`runCashRealizationCourse()` in `cash-realization-exercise.mjs` runs the unchanged original invoice, credit, receipt and cash-plan modules. Its two original invoices, earlier receipt, incoming receipt, release/reallocation, credit, invoice void, backdated correction, corrected receipt and refund exercise the whole reconciliation. Final exact figures are saved opening 400.00, opening correction -10.00, allocation change 75.00, credit change 20.00, lifecycle -100.00 and current balance 195.00. Gross incoming cash is 100.00, attributed incoming cash 60.00, prior-cash allocation change 15.00 and refund change 10.00. An earlier date review retains the earlier receipt state. Full source replay and all seven export identities agree after reopening the serialized record.

The source course does not create ledger entries in a customer workspace. The native continuation receives the actual original account and records its own exact outcomes.

## Compare complete saved actual-receipt reviews

Cash planning → Realized receipts → **Compare saved reviews** opens the original two-review selector. Choose an earlier and later review of the **same saved forecast edition**. The later through date must be on or after the earlier date. The original save times, actors and source revisions are shown separately; selecting a later through date does not imply that its source was recorded later.

This is a complete read-only financial workflow over the existing saved records. It does not create another plan, invoice, receipt, allocation, credit, refund, account writer or customer message. The original native owner and private receiving case remain in use.

### Three views explain every difference

The comparison retains both full original reviews and derives a third view with the unchanged financial projector:

1. **Earlier** is the complete first saved review.
2. **Restated earlier** uses the second review's complete retained source at the first review's through date, with the same original forecast.
3. **Later** is the complete second saved review.

For every shown amount:

`source change = restated earlier − earlier`

`period movement = later − restated earlier`

`total change = source change + period movement = later − earlier`

The source-change column isolates newly recorded or corrected source affecting the earlier date. The period column moves through time with the second source held fixed. It includes changes to allocation choices, releases, credits, invoice lifecycle, receipt reversals and refunds. **Period movement is not a new-cash total.** Incoming receipt value, cash allocated to the planned invoices, prior funds, unused customer funds and refunds remain separate named measures.

The exact native BigInt/currency arithmetic is reused. All original, restated and difference invoice/currency balance bridges are checked:

`saved opening + opening correction − allocation change − credit change + lifecycle change = current signed balance`

Currency code and explicit precision travel with every row. No currency conversion, inferred customer commitment, tax conclusion or accounting recognition is added.

The selected forecast population is fixed. Different forecast editions belong in the existing projected-plan comparison; this actual-review comparison rejects that mismatch. Daily tables show per-day amounts rather than cumulative differences. Each row explicitly says whether it was present in the earlier, restated and later views, so a missing source record is not displayed as an observed zero.

### Operate the complete tables and originals

The ordinary table form chooses currencies, invoices, dates or receipts and a named measure. It shows all six amounts for that measure, pages through the entire selected population in groups of100 and reports the complete row count. Changing table adjusts to its first available measure if the previous measure is not part of that table.

Original source changes cover invoices, receipts, allocations, credits and refunds. Open each source group, then a changed record to see both complete retained JSON values. Added/removed source records retain explicit absence. Original identities, changed top-level field names and exact stored JSON digests remain visible. The complete comparison includes JSON Pointers to those actual retained records; it does not replace records with a difference summary.

Source history can legitimately change independently of a through date. For example, a later-recorded backdated credit can change the opening basis without representing a cash receipt. A corrected receipt may preserve its cash date but enter accounting on its explicit replacement date. Both situations use the original financial reader and complete source, not a new timing convention.

### Native interfaces

On the already-open original `ReceivablesWorkspace` or `ReceivablesClient`:

```js
const selection = {leftId: EARLIER_SAVED_REVIEW_UUID, rightId: LATER_SAVED_REVIEW_UUID};
const report = await receivables.compareCashRealizations(selection);
const file = await receivables.cashRealizationComparisonFile('comparison.json', selection);
```

The HTTP client returns a normal Response for the file. The in-process workspace returns the original `{name,type,bytes}` descriptor. The receiver explicitly distinguishes these forms.

Read-only HTTP routes:

- `GET /api/receivables/cash-realizations/compare?leftId=UUID&rightId=UUID`
- `GET /api/receivables/cash-realizations/compare/files/NAME?leftId=UUID&rightId=UUID`

The original authenticated host, private workspace and route permissions remain authoritative. No additional service starts.

Original installed CLI:

```sh
starforge receivables cash-realization-compare --directory ORIGINAL_ACCOUNT --left EARLIER_UUID --right LATER_UUID --out NEW_COMPARISON_JSON
starforge receivables cash-realization-comparison-file --directory ORIGINAL_ACCOUNT --left EARLIER_UUID --right LATER_UUID --name comparison.html --out NEW_COMPARISON_HTML
```

The CLI preserves the existing lease, create-only private output and complete source. Use the actual original directory and two returned native UUIDs.

Original customer-agent operation:

`merchant_accounting_receivables_cash_realization_compare`

Arguments are the existing workspace alias plus `leftId` and `rightId`. The raw MCP operation returns bounded identity, population counts, comparison digest and the exact complete `comparison.json` selector. Its large original payload travels through the maintained retained-file reader, so an MCP wrapper's text/structured duplication cannot enlarge the response beyond the supported transport. The typed connected client retrieves that whole file, validates the original selection, workspace, full digest and every population count, then returns the same complete financial report. It exposes `compareCashRealizations({leftId,rightId})` and `cashRealizationComparisonFile({leftId,rightId,file})`. The original generic file route accepts kind `receivables-cash-realization-comparison` with exactly those two selectors and the file name. It uses the maintained retained-download engine, full-file hashes and original read lifecycle.

### Complete exports and independent reopening

The eight files are:

| File | Complete content |
| --- | --- |
| comparison.json | Both original saved reviews, full original ledger source, restated earlier projection, all monetary/source comparisons and comparison digest |
| comparison.html | Readable whole comparison, every table, source-change inventory and interpretation |
| currencies.csv | Every measure for every currency and explicit precision |
| invoices.csv | Every original invoice measure and its six amounts |
| dates.csv | Every selected date/measure, with view presence |
| receipts.csv | Every retained customer receipt/measure, with view presence |
| source-changes.csv | Every added, removed or changed original source identity, field list, digest and exact JSON Pointer |
| manifest.json | Exact complete byte length and SHA256 of the preceding seven files, selected review UUIDs and comparison digest |

CSV uses the original formula-safe exporter. HTML contains all rows and has normal horizontal table scrolling. Individual file generation does not keep all other report byte buffers resident. The manifest computes each full file identity in sequence. The complete report is capped at112MiB, inside the original128,000,000-byte retained-file contract; the two original reviews keep their existing32MiB bounds. The raw MCP comparison response contains only the bounded original file reference; each retained-file chunk remains within the existing reader's transport contract. Ordinary account operation limits are unchanged.

`receiveCashRealizationComparison(value)` validates a downloaded JSON by reproducing the whole comparison from both original saved reviews. Each review's source digest, original preview digest and full financial replay are checked. The receiving function rejects changed content, foreign workspace, another forecast or reversed through-date ordering. Source and forecast objects remain complete; the restated view references the later retained source and original plan to avoid another full source duplicate.

### Continue the original native and browser course

The original C94/405F/2A51/F47A/SDK12 receiver already owns the opened accounting case. After its original realization course has produced two saved reviews, use the actual returned IDs:

```js
import {receiveCashRealizationComparisonNative}
  from './cash-realization-comparison-receiving.mjs';

const native = await receiveCashRealizationComparisonNative({
  receivables: originalOpenedClient,
  leftId: originalEarlierReviewId,
  rightId: originalLaterReviewId,
  operationId: originalOperationId,
  load: originalPrivateCaseRead,
  save: originalPrivateCaseWrite,
  reopen: originalOwnerReopen
});
```

The callback must persist complete JSON before resolving. The receiver retains one comparison subdirectory keyed by the two original UUIDs, fixes the existing operation/selection, checks complete native comparison against the full source, downloads and validates all eight files, then invokes the original owner's optional close/drain/reopen callback. It compares the two complete saved rows, all files and comparison after reopening. A missing reopen callback leaves the explicit `NATIVE_COMPLETE_REOPEN_PENDING` result. It performs no account mutation, host launch or duplicate customer operation.

Continue through the owner's existing isolated authenticated browser:

```js
import {receiveCashRealizationComparisonBrowser}
  from './cash-realization-comparison-browser.mjs';

await receiveCashRealizationComparisonBrowser({
  page: originalAuthenticatedPage,
  receivables: currentOriginalOpenedClient,
  nativeResult: native,
  save: originalPrivateBrowserCaseWrite
});
```

The course operates the actual two-review form, all four table groups and every page at1440px and390px; opens both sides of an actual changed source record; downloads and verifies all eight complete originals; and reloads the original operator. It retains actual rendered text, screenshots, complete downloaded bytes and final result. The caller keeps ownership of browser/context/server cleanup. The producing operator must LOOK at the actual saved wide/narrow views and open/use the full HTML, JSON and CSV/manifest attachments; a source-only result does not stand in for that operation. Keep any concrete source/UI correction in the same original case and source publication.

The full source operating course is `runCashRealizationComparisonCourse()` in `cash-realization-comparison-exercise.mjs`. It runs the complete maintained worked account with its real original modules. In that account, the earlier balance195.00 restates to185.00 and later returns to195.00: source change−10.00, period movement+10.00 and total change0.00. A same-date source comparison has−20.00 source change and zero period movement. Receipt replacement counts incoming cash once, the10.00 refund stays distinct, every original source pointer resolves exactly, all eight export files reopen identically and modified comparison content is rejected. These are worked source results, separate from the original customer's native/browser execution.

The typed-client source course also operates the complete original financial-control, receivables and maintenance client modules. Its135,089-byte worked comparison travels through three original65,536-byte-limit file requests with one retained read ID, validates exact complete SHA/digest and population, rejects a changed comparison and finishes with zero active file reads. The comparison kind is included in the maintained file reader's existing allowlist. This source execution is retained with the full original module closure; the equipped account owner's native/browser case remains the same operation.
