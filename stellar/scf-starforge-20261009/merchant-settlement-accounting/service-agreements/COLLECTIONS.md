# Service agreement collections

Open the original **Service agreements** application and choose **Collections review**. The same accepted contract now leads from its billing schedule to the original invoices, effective receipt allocations, credit notes and remaining customer balance.

This view uses the accounting workspace’s existing receivables calculation. It introduces no financial records. Original invoice issue, payment allocation, allocation release, credit, collection and payment-plan operations continue in their established desks.

## Review the account

1. Open the merchant’s initialized accounting directory through the original Service agreements application. Keep its current workspace identity.
2. Choose the **As of** ledger date. Filter by customer, agreement status or original agreement/reference text.
3. Open **Collections review**. The result names the actual accounting revision, selected date and selected agreements.
4. Read each agreement’s issued totals. Currency codes and decimal precision are grouped separately; a two-place USD account is distinct from a three-place USD account.
5. Open each invoice’s original allocation, credit and billing history. Follow **Open this original invoice** to the same original invoice and date in Receivables.
6. Review unfinished billing requests and the separate quoted calendar. **Open agreement** retains the original agreement controls for billing continuation.
7. Download the complete selected report, or the all-files archive, and reopen its HTML and JSON beside the original account.

The invoice link carries the original accounting workspace ID, invoice UUID and ledger date. Receivables verifies that workspace and original invoice before opening it. An unfinished invoice editor is parked in its existing saved browser draft; its original pending request remains intact. Use **New invoice** or **Edit draft** to resume those retained edits.

Changing a filter selects complete agreements. Every linked invoice, allocation, credit and original calendar period for those agreements remains in the review and export. An empty selection means no agreements. The view does not silently change an empty selection into the whole customer account.

## Read the balances correctly

| Value | Original meaning |
| --- | --- |
| Document total | The actual retained invoice or draft total, including any reviewed changes made after quotation import |
| Allocated payments | Original receipt allocations effective on the selected date |
| Credit notes | Original credit documents effective on that date |
| Amount due | The native invoice’s positive remaining balance |
| Credit balance | The native invoice’s excess credit balance |
| Overdue | Positive amount due after the actual invoice due date |
| Draft | Original invoice is still unissued; shown separately and excluded from issued totals |
| Future | Original invoice has an issue date after the selected date; excluded from issued totals |
| Void | The original void date is effective; excluded from issued totals |
| Quoted calendar | Accepted quotation amounts and planned invoice/due dates, separately retained beside actual invoices |

A released allocation stops contributing on its original release date. A credit uses its credit date. A currently voided invoice can still be effective when reviewing a date before its void date. The existing receivables engine decides those states.

Each original invoice is counted once, while every retained agreement billing link is preserved. Superseded or voided invoices remain visible even when no current calendar period points to them. A prepared billing operation without its resulting invoice remains an original pending billing request; the view keeps its original request IDs.

The selected date applies to ledger effects and billing readiness. Current agreement terms, invoice versions and source records remain current retained records. To reopen a complete earlier editable workspace, use the original accounting backup. This dated view does not reconstruct an earlier revision of every contract edit.

Unallocated customer funds are not assigned to a contract. In the original Receivables desk, review those funds and apply them to the intended invoice through the established allocation operation.

## Complete files

| File | Contents |
| --- | --- |
| collections.html | Complete standalone readable review, all selected agreements and source history; no server or network required |
| collections.json | Complete selected record, invoice summaries, allocations, credit notes, billing links, original quotation source identities and periods |
| invoices.csv | One row per original linked invoice, actual dates/amounts/status, original billing links and current calendar associations |
| periods.csv | Every selected accepted-quote calendar period and its original invoice/source identifiers |
| activity.csv | Every retained allocation and credit, including later/released records and its selected-date effect |
| files.json | Original workspace, accounting revision, date, review digest, exact file lengths and SHA-256 identities |

The browser’s **All files** download is a TAR containing those six complete files. Native tools additionally expose that same archive as **collections.tar**. An individual HTML download is the same complete readable report, with all detail sections open for offline review and printing.

Each CSV repeats the original workspace, revision, ledger date, review digest and agreement identity. Decimal strings preserve the original precision. Known signed numeric amounts remain numeric text; formula-like free text is escaped for spreadsheet use.

The review digest identifies the complete JSON record before its sha256 field is added. It is stable for the same selected source records, date and agreement order. The report uses current account data; its original revision guard prevents a later download from silently replacing the displayed selection with changed financial records.

## Typed HTTP client

The existing typed client export remains **./merchant/service-agreements/client**.

~~~js
const state = await client.state({asOf: "2026-10-13"});
const selection = {
  workspaceId: state.workspaceId,
  expectedRevision: state.revision,
  asOf: state.asOf,
  agreementIds: state.agreements.map(row => row.id),
};
const report = await client.collections(selection);
const complete = await client.exportCollections({...selection, format: "tar"});
// complete.bytes is the entire file; retain complete.name and complete.type.
~~~

Omit agreementIds to select all original agreements; pass an empty array to select none. An explicit selection accepts up to 2,000 distinct original IDs. The browser sends the exact agreements shown by its filters.

The source controller exposes collections(options) and exportCollections(options) under the same original accounting serial lease. A stale expectedRevision or different workspaceId rejects the read before selecting another source. These operations leave the original financial state and request journal intact.

The original HTTP routes are:

~~~text
GET /api/service-agreements/collections
GET /api/service-agreements/collections/export
~~~

Their selectors are asOf, workspaceId, expectedRevision and agreementIds. The last is a complete JSON array encoded as one query value. Export also accepts format: tar, json, html, invoices, periods or activity. Unknown or repeated query keys are rejected. The typed client encodes these selectors.

## Installed command line

Use the same existing initialized accounting directory and the installed service-agreements command. Stop its currently owning browser or merchant-tool session before opening that directory through a standalone CLI.

~~~sh
starforge service-agreements collections \
  --directory /private/merchant/accounting \
  --as-of 2026-10-13

starforge service-agreements collections-export \
  --directory /private/merchant/accounting \
  --as-of 2026-10-13 \
  --out /private/customer-collections.tar \
  --format tar
~~~

For a selected review, supply --agreements with comma-separated original agreement UUIDs and --expected-revision with the revision returned by the first read. --expected-workspace-id retains the original account identity. Omit --agreements for all agreements; an explicitly empty value selects none.

Export supports tar, json, html, invoices, periods and activity. Output creation is exclusive, with private file permissions and file/directory synchronization. Use a new output path to retain another edition. No original report is overwritten.

## Existing merchant tools

Open the original configured accounting alias with merchant_service_agreements_open. The following additions use that same accounting owner and selected native controller:

| Tool | Operation |
| --- | --- |
| merchant_service_agreements_collections | Complete selected dated review |
| merchant_service_agreements_collections_export | Exact report file inventory and archive hashes |
| merchant_service_agreements_collections_file | Original retained full-file chunk reader |

Pass workspace, and optionally asOf, workspaceId, expectedRevision and agreementIds, to the first two. Retain the returned workspaceId, revision, asOf, agreementIds and original file inventory.

For collections_file, send workspace, workspaceId, expectedRevision, asOf, agreementIds, file and expectedSha256 from that exact inventory. Begin with offset 0. Continue each returned readId and nextOffset with the same original selectors and file hash. Concatenate decoded base64 chunks in order and verify the final byte count and SHA-256. Use merchant_service_agreements_file_release for an interrupted read.

A source change before the initial file snapshot requires a fresh review. Once the original retained read is open, its subsequent chunks come from that same complete snapshot. Closing the original account closes its retained reads; export the full current report again after reopening if a former read no longer exists.

## Continue the original customer operation

The accepting original 84DF / B57F / 2A51 financial operator keeps its existing merchant directory, customer, agreement, quotation, invoices and real recorded receipts. Extend that original programme with this complete workflow:

- Open the actual saved agreements at their original ledger dates. Inspect the agreement and original invoice identities alongside actual balance, payment, credit, release and void-date effects already recorded in that case.
- Review quoted periods, drafts, actual issued totals, pending original billing and any historical replaced invoices separately.
- Change customer/status/search and date selections. Follow an original invoice link, retain any unfinished invoice draft and pending request, then reopen the same work.
- Operate the complete desktop and narrow layouts and return the actual rendered frames for the producing peer to inspect.
- Open every delivered attachment. Read the full offline HTML, all three CSV files and complete JSON; receive the entire native archive through its original retained reader.
- Reopen the same account after its original export/backup and compare the selected source identities and financial records.

The source projection has a focused connected-source exercise using the actual invoiceSummary and decimal helpers through allocation, credit, release, effective void, distinct precision and original-link deduplication. Actual customer receiving and rendered output belong to the existing original operator’s returned run.
