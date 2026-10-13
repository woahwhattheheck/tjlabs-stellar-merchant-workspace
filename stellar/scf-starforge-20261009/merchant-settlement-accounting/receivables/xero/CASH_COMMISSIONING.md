# Customer cash commissioning

Use **Cash commissioning** in the existing Xero customer handover desk to compare original Xero cash records with the original customer ledger, retain a reviewed cycle, and continue the next billing cycle from that saved baseline.

The desk shares the accounting workspace, customers, issued documents, receipts, allocations, credits, refunds, and original Xero document bindings. Each saved cycle retains the selected source packages, complete provider responses, customer account files, applicable customer cash advice, review, and file manifest.

## Open a package and select the cycle

Open a prepared Xero package, then choose **Cash commissioning**. Keep the package that opened the desk in the cohort. Add the earlier and current billing packages when the next cycle introduces new invoices or credits. All selected packages must use the same Xero organisation and accounting currency.

Enter a descriptive cycle label and the customer account date. The account date selects the dated native customer ledger. Choose an earlier saved commissioning cycle to compare the new cycle with that baseline.

| Selection | Meaning |
| --- | --- |
| Original package cohort | Issued invoices and credits already prepared through the Xero handover workflow, with their original mapping and document identities. |
| Customer account date | Date used to select the native ledger and applicable customer advice. |
| Saved baseline | An immutable earlier cycle in the same organisation and currency. Its customer accounts remain in the later comparison. |
| Original response observation time | When a complete provider response was observed. This is retained separately from the account date and the time the workspace recorded the cycle. |

A provider response describes the state it returned. Its observation time remains visible when comparing it with a dated customer account.

## Select complete original provider responses

The desk lists native JSON responses already retained with the selected package cohort. Select the responses relevant to the cycle. Their original filenames, byte counts, observation times, receipt times, and SHA-256 identities remain visible.

Use **Add complete original JSON files** for additional original Accounting API responses containing Invoices, CreditNotes, Payments, Prepayments, or Overpayments. Retain every relevant page as a complete response file. Each additional file may be up to 8 MiB; a cycle accepts up to 20 additional files. Correct the observation time if the response was obtained earlier than its addition to this desk.

The original numeric-token reader preserves decimal precision and rejects duplicate JSON keys. Original provider files are retained byte for byte. A cash source is associated with the original Xero document binding and customer mapping already held by the handover workspace.

For a prepayment or overpayment that needs an explicit customer association, use the displayed customer binding control. Save that association in the review selection so the next cycle can continue with the same decision.

## Review cash and document balances

Choose **Review cash cycle**. Review the source cash entries, native ledger rows, document balances, findings, and any comparison with the saved baseline.

The underlying economic movements have different meanings:

| Provider movement | Native comparison |
| --- | --- |
| Invoice payment | Customer receipt allocation to the original invoice. |
| Prepayment or overpayment applied to an invoice | Customer cash allocated from the earlier receipt to that invoice. |
| Credit note applied to an invoice | Original credit reduction associated with the issued invoice. |
| Customer refund | The corresponding native commercial refund and original receipt history. |
| Deleted payment or allocation | The retained source transition and the native release, correction, or reversal that applies to the account date. |

An original paid-invoice credit can release receipt funds that are then allocated to a later invoice. The review retains that credit disposition and its original allocation identities when Xero represents the movement as a credit-note allocation to the later invoice. An explicitly linked native candidate can therefore belong to the earlier source invoice while preserving the customer, currency, and shared amount capacity.

The review separates invoice payments, applications of earlier customer cash, and credit notes. A provider's bank-currency amount remains distinct from the amount denominated in the invoice currency. Its reconciliation indicator remains a separate source fact.

Use the source entry filters to locate a document, reference, identifier, amount, or outcome. Open a row's source details to inspect its original source pointers and retained native history.

### Match original ledger portions

Open the matching control for a source cash entry. Select the applicable original allocation, credit note, or refund rows and enter the exact portion of each row used by this source entry. The dialog limits choices by customer, currency, and document where applicable.

A match can contain several original ledger portions. Keep the total consistent with the original source movement. A row's native receipt, bank source coverage, and replacement lineage remain available for review. When an actual date difference needs explanation, enter its reason with the match.

Open **Retained review decisions** to inspect or remove a cash match or customer binding, including a decision whose source entry is absent from the current files.

Changing sources, customer bindings, dates, the package cohort, or matches invalidates the earlier review. Run **Review cash cycle** again before saving. Native cash corrections can change which allocation or receipt is current; reopen the displayed ledger match and review that original successor history.

## Save the reviewed cycle

Choose **Save reviewed cycle** after reviewing the current selection. The native workspace regenerates the complete review under the original accounting lease and compares it with the review selected by the operator.

The original revision, operator, and request ID accompany the save. If the connection ends during the operation, the application's retained operation controls continue that same request. A changed accounting revision or review requires review of the updated source selection.

A cycle can preserve reviewed differences that need resolution. Its status, counts, findings, selected matches, original sources, and dated native snapshot are retained together. Saving a cycle establishes its original commissioning record.

## Continue the second billing cycle

Open the earlier cycle under **Saved commissioning cycles** and choose **Use as next baseline**. The desk carries forward its original package cohort, customer/source bindings, and ledger matching decisions. Add the next billing package and the new original provider responses, then set the later customer account date and cycle label.

Review changes from the baseline alongside the current document and cash reconciliation. Correct any matching decisions affected by a new allocation, refund, bank receipt correction, or changed provider record. Save the reviewed second cycle with its own operation.

A second operator can open either saved cycle, inspect the same retained review and files, and continue the next cycle in the received original accounting workspace. The current live review and each saved original cycle remain separately accessible.

## Deliver and reopen the original files

Open a saved cycle and choose **Download complete handover**, or download any listed file individually.

| Retained file | Contents |
| --- | --- |
| `cash-cycle.json` | Saved cycle identity, organisation, currency, cohort, account date, baseline, operator, time, and review identity. |
| `cash-review.json` | The immutable original commissioning review. |
| `cash-account-snapshot.json` | Dated original customer ledger, invoice and credit records, receipt and allocation history, refunds, dispositions, and referenced bank accounts. |
| `cash-source-index.json` | Original provider and package filenames, source identities, observation times, and their retained file mapping. |
| `cash-customer-files.json` | Index of exact original customer account files and applicable cash advice. |
| `cash-source-*.json` | Complete original provider response bytes. |
| `cash-package-*` | Original source package files, including retained document handover material. |
| `cash-account-*` and `cash-advice-*` | Original dated customer files and relevant bank/refund advice. |
| `cash-handover-manifest.json` | Cycle identity and retained file descriptors with names, roles, media types, byte counts, and SHA-256 values. |

Additional files supplied by the native cash compiler are listed in the same saved file table and handover. The complete retained cycle has a 128 MiB limit.

## Use the native client

The existing Xero HTTP client exposes the same cycle workflow. The following example assumes an initialized client, an original package ID, and a selection containing the original provider files or retained import IDs:

~~~js
const review = await client.cashPreview(packageId, selection);

const saved = await client.cashCapture(packageId, {
  ...selection,
  revision: review.revision,
  actor: operatorName,
  requestId: crypto.randomUUID(),
  previewSha256: review.previewSha256,
});

const cycleId = saved.cashCycle.id;
const reopened = await client.cashCycle(packageId, cycleId);
const archiveResponse = await client.cashExportFile(packageId, cycleId);
~~~

Retain the complete capture request until its result is known. Use the same request ID and original payload when continuing that operation.

All paths below are relative to `/api/receivables/xero`:

| Method | Path | Result |
| --- | --- | --- |
| POST | `/packages/:id/cash/preview` | Current review, accounting revision, and retained-file descriptors. |
| POST | `/packages/:id/cash/cycles` | Save the reviewed cycle through the original operation log. |
| GET | `/packages/:id/cash/cycles` | Saved cycles associated with the original package. |
| GET | `/packages/:id/cash/cycles/:cycleId` | Saved cycle, immutable review, selection, and file descriptors. |
| GET | `/packages/:id/cash/cycles/:cycleId/files/:name` | Exact retained file bytes. |
| GET | `/packages/:id/cash/cycles/:cycleId/export` | Original cycle export; the existing named-export convention selects its archive. |

The maintained `merchant-receivables-xero` distribution includes the domain, workspace, native client and commands, browser desk, and this guide. Follow the existing [installation and workspace guide](README.md) to build and receive the selected product.

## Original provider references

The source field contracts are documented by Xero:

- [Accounting API invoices](https://developer.xero.com/documentation/api/accounting/invoices)
- [Accounting API payments](https://developer.xero.com/documentation/api/accounting/payments)
- [Accounting API credit notes](https://developer.xero.com/documentation/api/accounting/creditnotes)
- [Accounting API prepayments](https://developer.xero.com/documentation/api/accounting/prepayments)
- [Accounting API overpayments](https://developer.xero.com/documentation/api/accounting/overpayments)
- [Original Xero Accounting OpenAPI definition used for this implementation](https://github.com/XeroAPI/Xero-OpenAPI/blob/fd9d44b04bf4934a7509b8e7ece51a9e0e462e4f/xero_accounting.yaml)

The original [native document receiving guide](NATIVE_RETURN.md) describes the existing document identity, validation, and source-file workflow used before cash commissioning.
