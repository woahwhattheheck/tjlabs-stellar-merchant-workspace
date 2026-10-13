# Customer remittance receiving

Receive an original remittance CSV into the existing merchant receivables desk. The workflow matches exact saved customer references and invoice numbers, reuses an existing matching receipt or records an operator-entered receipt, previews every allocation, and saves the complete batch through the original accounting writer.

[Native MCP receiving](../../../../stellar-forge/mcp-merchant-operator/ACCOUNTING_REMITTANCES.md) provides the same complete workflow through configured source files, the typed accounting client, durable operation preparation and original source downloads.

## Open and receive

Start the maintained receivables application, then choose **Remittance receiving**:

    starforge receivables serve --directory /private/merchant/accounting --port 8448

The screen is also available at /receivables/remittances.html on that same local process. It inherits the original receivables listener, workspace lease, same-origin checks, request header and managed-application lifecycle.

1. Enter a stable source identifier, such as the merchant's internal account or remittance-system identifier. Retain the same identifier for later files from that source.
2. Choose the original UTF-8 CSV and enter the operator name. Review the proposed batch. The screen shows each customer, payment reference, payment amount and currency precision, invoice allocations, allocation dates, remaining receipt funds, and row conflicts.
3. Save the reviewed request JSON. It contains the original CSV, exact review digest, workspace identity, revision, operator and stable request identifier.
4. Receive the batch. Every receipt, allocation, affected invoice history and retained remittance record is saved in one original accounting operation.
5. Open the saved batch to download its exact source CSV, complete review JSON/CSV, full batch JSON and output manifest. Original invoices, receipts, credits, refunds and dated allocation history remain available in the existing desk.
6. After reopening, use **Find saved operation** with the original request identifier. Load the saved request JSON to retry its unchanged operation when necessary.

The browser preserves a failed receive request in the current page so it can be retried unchanged. The downloaded reviewed request is the portable recovery input. A stale revision requires a new review; a request already recorded in the original journal returns that saved result before revision checking.

## CSV contract

The CSV requires exactly these eleven unique headers. Their order may vary. A UTF-8 BOM, LF or CRLF line endings, quoted fields and doubled embedded quotes are supported. The source bytes are retained, including the BOM and original line endings.

| Column | Meaning |
| --- | --- |
| remittance_id | The source's stable identifier for this remittance, repeated on each invoice allocation line. |
| customer_reference | Exact reference of one existing accounting customer. Names are shown in the review after matching. |
| payment_reference | Original payment reference, using the existing receivables reference rules. |
| payment_method | Original method, matched case-insensitively as in the receipt identity. |
| payment_date | Receipt date, YYYY-MM-DD. |
| currency | Three-letter uppercase commercial currency code. |
| scale | Explicit currency precision, one digit from 0 through 6. |
| payment_amount | Full receipt amount, repeated on every line; positive exact decimal string. |
| invoice_number | Exact issued invoice number. |
| allocation_amount | Positive decimal amount to allocate to this invoice. |
| allocation_date | Date of this allocation, YYYY-MM-DD. |

Use one row for each invoice and list an invoice once per remittance. All rows with one remittance ID must repeat the same full customer/payment identity. To record unapplied funds, use one row with all three allocation columns empty. Partial and excess payments remain visible as available funds.

Use up to 1,000 data rows and 500,000 source bytes per batch. Numeric text is parsed with the original exact integer arithmetic. For example, USD at scale 2 accepts 125.00; a value with three fractional places is rejected. The import never combines different currency precisions or converts an asset amount into a commercial valuation.

## Existing receipts and Stellar payments

Matching uses the original payment method/reference identity. If a receipt exists, its customer, precision, amount, receipt date and current status must agree. The batch reuses its original ID and complete source record. Conflicting or ambiguous receipts appear in the preview and prevent the whole batch save.

A retained original Stellar settlement receipt therefore keeps its network, atomic asset amount, asset digest, transaction fingerprint, transfer evidence and explicit commercial valuation. The CSV allocates its already recorded commercial amount to the matched invoices.

When no matching receipt exists, receiving creates the same OPERATOR_RECORDED category used by the original manual-receipt action, with additive source identifier, remittance ID and CSV digest. Original chain receiving continues through the established **Import a Stellar settlement** and invoice-payment-request receiving workflows.

## Dated balances and corrections

Every proposed allocation uses the original invoice amount due and receipt funds available on its selected date. The allocation date must be on or after the invoice issue date and the receipt's effective accounting date: its saved accounting date when present, otherwise its received date. A receipt's later allocations, dated refunds and refund reservations are checked across all affected intervals. An unreconciled verified outgoing refund return must be received through its original refund workflow before another allocation can use those funds.

The complete batch must be conflict-free. A valid earlier group in a CSV does not become a partial save when a later group conflicts. Preview runs against a copy of the original ledger. Apply checks the reviewed digest and current original workspace revision, then commits all changes together.

Correct an imported allocation with the original dated release and reason, then make its replacement allocation through the receivables desk. A previously imported remittance keeps its source and historical allocation identities. Reimporting it does not restore an allocation that the operator intentionally released.

## Duplicate receiving and source identity

The combination of stable source identifier and remittance ID identifies the imported instruction. A repeated instruction with unchanged normalized payment and invoice-allocation content appears as ALREADY_IMPORTED; it creates no additional receipt or allocation. The same identifier with changed content is a conflict, directing the operator to the existing correction history.

Duplicate allocation detection also crosses source identifiers and remittance IDs. An existing allocation with the same receipt, invoice, exact amount and allocation date produces an actionable conflict while that allocation remains active on its original date. The review identifies the original allocation. Use the existing manual allocation action for an intentional additional allocation.

A second file may contain both already imported instructions and new remittances. Only the new groups contribute ledger changes. Retained input references and complete original files remain independently available in the new batch.

The original request journal provides operation idempotency. Use the same reviewed request ID after an uncertain response. Reusing an ID for different contents is rejected by the original writer. The source and review digests are checked again when their retained files are downloaded.

## CLI

All commands reopen the same initialized accounting directory and use its existing lease:

    starforge receivables remittances --directory /private/merchant/accounting
    starforge receivables remittance-preview --directory /private/merchant/accounting --input /private/source.json --out /private/review.json
    starforge receivables remittance-apply --directory /private/merchant/accounting --input /private/reviewed-remittance.json
    starforge receivables remittance --directory /private/merchant/accounting --id BATCH_UUID
    starforge receivables remittance-operation --directory /private/merchant/accounting --request ORIGINAL_REQUEST_ID
    starforge receivables remittance-file --directory /private/merchant/accounting --id BATCH_UUID --name source.csv --out /private/new-source.csv

The preview input is a JSON object with workspaceId and source. The source object contains sourceId, filename and csv, where csv is the complete original UTF-8 text. Obtain the original workspace identity with the remittances command.

The preview response contains workspaceId, revision, source, review and reviewSha256. Keep workspaceId, revision, source and reviewSha256, then add actor and requestId for the apply input. Keep this exact JSON to recover the operation. Output paths are create-only mode-0600 files through the established CLI writer.

## HTTP and source interfaces

| Method | Relative to the original receivables API | Operation |
| --- | --- | --- |
| GET | /remittances | List saved batches and original workspace identity/revision. |
| POST | /remittances/preview | Preview a complete original CSV against current ledger state. |
| POST | /remittances | Apply the reviewed batch through the existing atomic writer. |
| GET | /remittances/{id} | Inspect its original review and affected record IDs. |
| GET | /remittances/operations/{requestId} | Recover a saved original operation. |
| GET | /remittances/{id}/files/{name} | Download a retained source, review, batch or manifest. |

The remittances.mjs module supplies the pure parser and planner. The remittances-workspace.mjs module composes it with ReceivablesWorkspace._mutate; it shares the existing durable writer and request journal. The remittances-client.mjs and remittances-client.d.ts files provide the reusable typed HTTP client.

All new saved state lives at workspace.json.receivables.remittanceBatches; receipts and allocations use their original arrays. The established accounting backup/restore carries the whole result and exact source CSV. Existing invoice and customer account exports automatically include the newly saved original ledger records.

## SCF product contribution

This joins the existing Stellar merchant payment and invoice tools to the daily bookkeeping task of applying one remittance across multiple customer invoices. It preserves chain-native evidence on reused receipts while giving the operator a complete review, atomic batch receiving, exception resolution, original-source export and request recovery.

The official SCF #46 page currently lists November 8, 2026 for Build submissions. The Build handbook calls for a technical roadmap, milestones, budget by tranche, current traction and team experience. This implementation supplies a concrete merchant receiving workflow for that product roadmap. Sources: [SCF #46](https://communityfund.stellar.org/awards/recxrSMYwAl8vcglg) and [Build Award handbook](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award).
