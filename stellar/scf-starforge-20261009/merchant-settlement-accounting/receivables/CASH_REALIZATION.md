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
