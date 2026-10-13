# Commissioning collections

Commissioning collections connects an original workshare scope to the customer accounting records that implement it. An operator selects the original projects and customers, assigns exact invoice-line and cash portions to milestones, and saves an immutable dated capture with the source files, customer accounts, cash advice and selected Xero cycles.

The same accounting workspace owns the invoices, receipts, allocations, credits and refunds. The commissioning register records the review and its source attribution. Original source stages, milestone conditions, proposed dates and commercial case references remain visible beside the actual dated ledger.

## Start the complete workspace

The selected product is `merchant-commissioning-collections`. It includes the original receivables and Xero workflows, the commissioning desk, native CLI and typed HTTP client.

```sh
starforge commissioning-collections serve --directory /private/accounting --port 8452
```

Open the URL printed at startup. The default commissioning desk is `http://127.0.0.1:8452/receivables/commissioning/` and its API is `/api/receivables/commissioning`. The original receivables and Xero routes share that same owner.

Use Node 22 or later and the existing accounting workspace. Initializing an owner also uses the original `--outbox`, `--proof-dir`, `--terms` and optional `--recovered-dir` inputs. The optional `--expected-workspace-id` and `--expected-sources-sha256` arguments bind the opened owner to its retained source identity. A live server already holds the original lease; use its HTTP client for work in that session.

Package examples below use `@tokenjunkielabs/starforge-merchant`. Check the name in the installed package manifest when using a renamed selected build. The installed dispatcher is `starforge`. The same selected build registers **Commissioning collections** in the managed Applications catalog, using the original accounting binding and observed local startup URL.

## Import the original commissioning source

The source is the complete UTF-8 `partner-commissioning-workshares/v1` JSON document, at most 8 MiB. Its original bytes, numeric lexemes, project identifiers, fee, currency, stage, owner, case, source references, milestone conditions and payment percentages are retained.

An inspection returns all normalized projects and the original file SHA-256. Each source currency needs an explicit accounting scale; the default map is EUR, GBP and USD at scale 2. Supply a complete `currencyScales` map for other source currencies. Original monetary precision is checked before the native model accepts the source.

Milestone percentages must total exactly 100. Where the source fee cannot divide evenly into currency minor units, the native model applies largest remainders with original source order breaking ties. Every milestone retains its original percentage and rounding adjustment, and the complete original fee is conserved.

A source-controls JSON can contain `currencyScales`, `expectedSha256`, `label`, `receivedAt` and `replacesSourceId`. The complete file can be supplied in that JSON as `{name,dataBase64}` or read with `--file`.

```sh
starforge commissioning-collections inspect \
  --directory /private/accounting \
  --file /private/workshares.json \
  --input /private/source-controls.json \
  --out /private/inspection.json

starforge commissioning-collections prepare \
  --action source-import \
  --file /private/workshares.json \
  --input /private/source-controls.json \
  --inspection /private/inspection.json \
  --actor operator \
  --out /private/source-operation.json

starforge commissioning-collections execute \
  --directory /private/accounting \
  --operation /private/source-operation.json \
  --out /private/source-result.json
```

Preparation saves the original source bytes, the inspected SHA, revision and stable request identifier in one private operation file. `execute` makes one native mutation. The returned source identifier selects this exact retained edition.

Import a later original source with `replacesSourceId` pointing at the preceding edition. Both editions and their captures remain available.

## Build the cohort from original records

Start with the source's project view and the original accounting candidate views:

```sh
starforge commissioning-collections source \
  --directory /private/accounting --source SOURCE_UUID --view projects --all true

starforge commissioning-collections candidates \
  --directory /private/accounting --view customers --search CUSTOMER_REFERENCE

starforge commissioning-collections candidates \
  --directory /private/accounting --view invoices \
  --source SOURCE_UUID --project SOURCE_PROJECT_ID \
  --customer CUSTOMER_UUID --as-of 2026-10-13 --all true
```

All candidate filters apply before pagination. The project filter uses the original source currency; the customer filter selects the existing accounting customer. The seven candidate views expose the fields needed for exact attribution:

| View | Original information |
| --- | --- |
| `customers` | Customer identity, reference and retained customer snapshot. |
| `invoices` | Dated invoice summary, exact `invoiceSha256`, original lines and source quote/reference. |
| `allocations` | Original invoice-to-receipt allocation, active state, release date and receipt successor/accounting lineage. |
| `credits` | Original credit lines, date, net/tax totals, invoice identity and retained credit JSON SHA. |
| `receipts` | Original receipt amount, allocation, available cash, refund reservation, physical date and accounting date. |
| `refunds` | Original refund state, dates, amount, selected funding and released allocation identities. |
| `xeroCycles` | Saved Xero cycle identity, organisation, original account date, findings status and review fingerprint. |

A selection contains `asOf`, `projectIds`, optional label/baseline, and one controls record per selected project. Project controls bind the original customer and identify exact milestone lines, allocation portions, credits, receipt portions, refund portions and saved Xero cycles.

```json
{
  "label": "Commissioning account review",
  "asOf": "2026-10-13",
  "projectIds": ["SOURCE_PROJECT_ID"],
  "projects": [{
    "projectId": "SOURCE_PROJECT_ID",
    "customerId": "CUSTOMER_UUID",
    "milestones": [{
      "index": 0,
      "acceptedDate": "2026-10-10",
      "plannedAcceptedDate": null,
      "invoiceDays": 14,
      "delayDays": 0,
      "invoiceLines": [{
        "invoiceId": "INVOICE_UUID",
        "invoiceSha256": "ORIGINAL_INVOICE_JSON_SHA256",
        "invoiceLineId": "ORIGINAL_LINE_ID",
        "netAmount": "100.00",
        "taxAmount": "20.00"
      }],
      "allocations": [{"allocationId": "ALLOCATION_UUID", "amount": "120.00"}],
      "credits": []
    }],
    "receipts": [{"receiptId": "RECEIPT_UUID", "amount": "120.00"}],
    "refunds": [],
    "xeroCycleIds": []
  }],
  "baselineCaptureId": null
}
```

This is an input-shape example. Replace its selectors and amounts with the original source and candidate records. Source project and invoice-line IDs keep their original stable spelling. Stored source, customer, invoice, receipt, allocation, refund, cycle and capture IDs come from the original owner.

The model checks each shared original amount across the complete selected cohort. Invoice net and tax have separate capacities. Allocation portions share the original allocation amount. Credit portions bind the original credited line. Receipt and refund portions share their original cash record. Overuse is attached to the original monetary identity and the affected project/milestone selections.

Milestones also check their own bound invoice capacity. Assigning an invoice-level payment to one milestone is an explicit attribution; its cash is not repeated across all milestones. Amounts are exact decimal strings in the source accounting currency.

## Review and save a dated capture

```sh
starforge commissioning-collections preview \
  --directory /private/accounting \
  --source SOURCE_UUID \
  --input /private/cohort-selection.json \
  --out /private/commissioning-preview.json

starforge commissioning-collections prepare \
  --action capture \
  --preview /private/commissioning-preview.json \
  --actor operator \
  --out /private/capture-operation.json

starforge commissioning-collections execute \
  --directory /private/accounting \
  --operation /private/capture-operation.json \
  --out /private/capture-result.json
```

The preview contains its exact normalized selection, complete review, workspace revision, source fingerprint, review SHA and output file inventory. Capture recomputes that native review under the original owner before saving it. If the source, ledger, selected bindings or baseline changed, review the current values and prepare a new operation.

A capture retains either `READY` or `REVIEW` with its complete findings. A source/customer binding that still needs work remains visible in the saved review. The immutable handover includes those findings.

### Reading the amounts and dates

| Output | Meaning |
| --- | --- |
| `sourceFeeNet` | The original source fee or its conserved milestone share. |
| `invoicedNet` / `invoicedTax` | Effective original invoice-line portions at the account date. |
| `allocatedGross` | Effective original allocation portions attributed to these milestones. |
| `creditedNet` / `creditedTax` | Effective original credited-line portions. |
| `amountDueGross` / `creditBalanceGross` | The resulting balance of the bound invoice portions. |
| `receivedGross` | Effective original receipt portions attributed to the project. |
| `refundedGross` / `reservedRefundGross` | Actual and reserved original refund portions. |
| `netRecordedCash` | Attributed received cash less actual attributed refunds. |
| `reconciledNetCash` | The same net when the original outgoing cash and its attribution are reconciled; otherwise null with the original finding. |

These columns answer different questions. An allocation settles an invoice using a receipt; adding allocated and received totals would count that cash twice. Source fees, invoice net/tax and customer cash remain separate columns and are grouped by their original currency and precision.

The actual receipt date stays the factual bank date. An original correction can activate a successor receipt on a later accounting date without representing another bank inflow. Original allocation release, credit, refund and reversal dates govern the dated amounts.

Acceptance and planned acceptance are separate controls. Planned due/collection dates use the selected invoice term and delay; the review also retains original invoice due dates, allocation dates and receipt dates. Source contact stages remain the original commercial source values.

## Successive source editions and baselines

For the next capture, set `baselineCaptureId` to an earlier capture in this original workspace. The baseline may refer to an older source edition. Its original review, selected customer accounts and source identities are included in the new handover.

Changes identify source edition changes, projects added or no longer selected, project amounts, and milestone amounts/dates. The current capture keeps the preceding review SHA. Selected Xero cycles retain their own account dates and source observations, with an explicit same-date or saved-date scope in the project review.

## Complete private capture and selected reports

```sh
starforge commissioning-collections detail \
  --directory /private/accounting --capture CAPTURE_UUID

starforge commissioning-collections export \
  --directory /private/accounting --capture CAPTURE_UUID \
  --out /private/commissioning-handover.tar --format tar
```

Use `--format directory` for a new private directory containing each original file, or `--format json` for the complete capture detail. Individual source/capture file commands write the exact retained bytes to a new file.

The complete archive is the private internal capture. Its accounting snapshot contains the original receivables ledger and customer identities for the whole workspace, together with the original source document. The project HTML and CSV reports present the selected cohort and its original references.

The capture includes:

- The unchanged original workshare JSON, source normalization and original import receipt.
- The complete dated accounting snapshot and selected baseline.
- Original customer accounts, issued invoice/credit files, refund and bank cash advice, and selected immutable Xero cycle files.
- `commissioning-original-files.json`, which maps the retained original attachment names and hashes to their customer, document and cycle identities.
- `commissioning-review.json`, project/milestone/cash/finding CSV reports and the industrial printable HTML handover.
- The saved capture identity and complete file manifest.

Original attachments use stable hash-based filenames with their original names preserved in the file index. The native package limit is 128 MiB for the complete source, account and handover. Every retained file has an exact byte count and SHA-256; the existing native file reader validates those bytes.

## Durable operations and recovery

`prepare` writes a new file with mode 0600. It retains the action, source selector, complete original native request, request ID, revision, source/review SHA, request digest and workspace binding. It generates the request ID once unless `--request-id` supplies one.

`execute` submits that exact request once. `reconcile` looks up the same request in the original native operation journal and verifies its original action and intent SHA, including the source selector:

```sh
starforge commissioning-collections reconcile \
  --directory /private/accounting \
  --operation /private/capture-operation.json
```

An unknown response can be resolved through this original journal. If the native owner reports `WORKSPACE_COMMIT_UNKNOWN`, the HTTP client and CLI retain `outcomeUnknown`, `reopenRequired` and the exact `commitUncertainty` record. Reopen the original owner as its message directs and use the saved operation to retrieve or complete its original result. A changed request under the same identifier is rejected by the original journal.

A local output-file failure after a completed mutation reports `COMMISSIONING_RESULT_OUTPUT_FAILED` with the original operation and resulting source/capture IDs. The saved operation and native journal remain the recovery path. Output paths must be new, which keeps prior request and result files intact.

## Typed HTTP client

```js
import {readFile, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {
  createCommissioningCollectionsClient,
  commissioningCaptureArguments,
} from '@tokenjunkielabs/starforge-merchant/merchant/receivables/commissioning/client';

const client = createCommissioningCollectionsClient({
  baseUrl: 'http://127.0.0.1:8452/api/receivables/commissioning',
});
const sourceId = process.env.COMMISSIONING_SOURCE_ID;
const selection = JSON.parse(await readFile('/private/cohort-selection.json', 'utf8'));
const preview = await client.preview(sourceId, selection);
const value = commissioningCaptureArguments(preview, {
  actor: 'operator', requestId: 'commissioning-' + randomUUID(),
});
await writeFile('/private/http-capture-request.json',
  JSON.stringify({sourceId, value}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
const result = await client.capture(sourceId, value);
const download = await client.file(result.capture.id, 'commissioning-review.json');
await writeFile('/private/saved-commissioning-review.json',
  new Uint8Array(await download.arrayBuffer()), {flag: 'wx', mode: 0o600});
```

`commissioningImportArguments(originalInput, inspection, {actor,requestId})` similarly binds the original file bytes to their inspection and expected source SHA.

| Client method | Result |
| --- | --- |
| `inspectSource(input)` | Complete source inspection and original file identity. |
| `importSource(input)` | Original operation, current revision and retained source. |
| `sources(query)` | Paged source summaries. |
| `source(id, query)` | Source summary or paged full project/history view and file inventory. |
| `sourceFile(id, name)` | Fetch `Response` with exact source-file bytes. |
| `candidates(query)` | Typed paged original customer/accounting candidates. |
| `preview(sourceId, selection)` | Complete source/selection/review/SHA/file inventory. |
| `capture(sourceId, request)` | Original operation, source and full immutable capture. |
| `captures(query)` | Paged capture summaries. |
| `detail(captureId)` | Full saved capture with review, selection and files. |
| `file(captureId, name)` | Fetch `Response` with the retained file. |
| `export(captureId)` | Complete capture JSON from the export route. |
| `exportFile(captureId, name?)` | Original named file or the complete default handover tar. |
| `request(requestId)` | Original source/capture journal result. |

Every method accepts a final `{signal}` option. Requests use the existing Xero workspace transport, JSON operator header and structured native error fields. Mutations have one explicit send.

## Source and native lifecycle

The maintained implementation is in [source.mjs](./source.mjs), [domain.mjs](./domain.mjs), [workspace.mjs](./workspace.mjs), [reports.mjs](./reports.mjs), [http.mjs](./http.mjs), [server.mjs](./server.mjs), [client.mjs](./client.mjs) and [cli.mjs](./cli.mjs).

The existing `XERO_CASH_CHECK.mjs` journey is extended for this complete commissioning lifecycle: source import and correction edition, explicit monetary attribution, capacity findings, baseline comparison, capture, exact files, original request recovery and workspace reopen. It shares the original accounting setup and cash checks with the prior Xero product.


The existing selected-package receiver also supports this product. From its complete maintained checkout, choose the actual commit and a new private output directory:

```sh
node SELECTED_RECEIVABLES_CHECK.mjs \
  --repo /private/merchant-workspace \
  --ref FULL_SOURCE_COMMIT \
  --out /private/commissioning-installation \
  --commissioning --offline
```

It invokes the original distribution builder, installs the produced archive using existing cached dependencies, opens the installed command help and actual exported modules, reads the installed browser assets, and retains the original source identities. The original Xero/commissioning journey exercises the private customer lifecycle; the selected-package receiver exercises the resulting installation. Preserve each program's complete output with that same source revision.

## Existing merchant agent interface

The selected product also includes the complete eleven-operation commissioning workflow through the existing accounting MCP owner. Use `starforge merchant-accounting-commissioning` for prepared remote operations and original downloads, or the typed `@tokenjunkielabs/starforge-merchant/merchant/accounting-commissioning` SDK. [Agent workflow and recovery](MCP.md) covers configured source aliases, retained inspected bytes, immutable previews, operation reconciliation, private exports and the original file-reader lifecycle.
