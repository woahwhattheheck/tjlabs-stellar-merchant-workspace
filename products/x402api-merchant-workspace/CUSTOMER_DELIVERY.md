# Deliver one original invoice to its customer

Customer delivery prepares the selected original invoice, its frozen payment options, available wallet request, complete delivered result and public activity as one standard ZIP. The customer extracts it and opens `index.html` in a browser. The included files work independently of the merchant server.

The original Merchant workspace remains responsible for creating charges, receiving the buyer's authorization, reconciling payment and fulfilling the order. This read-only delivery selects the existing invoice and records its current outcome. It also works from a received project's review application.

## Prepare and send from the merchant desk

1. Connect to the original Merchant application with its existing operator access.
2. Select the invoice. Read its reference, exact payment options and payment/delivery state.
3. Under **Customer delivery**, choose **Prepare customer delivery**. The review lists the selected invoice, offered amounts, original activity count and every file that will travel to the customer.
4. Choose **Download customer ZIP**. The server checks that the complete selected original record is still the edition you reviewed. If it changed, prepare its current delivery and inspect the updated content.
5. Extract the complete ZIP into one folder. Open `index.html`, use its actual file links, inspect the original result in its native application and follow the rendered inspection below before sending the exact package.

A draft or pending invoice includes its saved terms and any original wallet request that exists. A completed invoice additionally includes its whole original result. The package's displayed outcome is the selected recorded edition; later payment or delivery changes require another reviewed edition.

The browser clears the visible delivery review when a different invoice is selected or the operator disconnects. It validates the original store, tenant, invoice and reviewed revision in the returned download. A file generation/download failure can be retried from that same original edition because it performs no payment mutation.

Download links are private, temporary bearer links. They expire after two minutes and are consumed once by the original server. The browser streams the archive through the existing download endpoint. Keep the ZIP and its extracted customer files with the original recipient.

## Customer files

| File | Complete retained content |
| --- | --- |
| `index.html` | Standalone readable invoice, exact quoted amounts, recorded outcome, original identifiers, complete activity, original file links and receiving instructions. |
| `invoice.json` | Original public invoice projection, every frozen field, full original public activity, wallet envelope and exact selected record revision. |
| `payment-request.json` | Exact JSON bytes of the original available wallet request. Present after original charge creation. |
| `result/<original filename>` | Whole verified completed file. An unsafe original filename receives a safe local member name while its original filename stays recorded. |
| `README.txt` | Receiving instructions and original invoice/reference/state/revision. |
| `MANIFEST.json` | Original owner, invoice and revision plus byte length, SHA-256 and content type of every other member. |

All HTML text is escaped. Its local links point to the complete files in the same extracted folder. The document uses an industrial grayscale layout, narrow-screen wrapping and horizontally scrollable detail tables. Expand the original request, receipt and activity when reviewing their full content. Use the browser's normal Print command for a complete printed invoice. The included local, hash-authorized print handler opens the full frozen request, receipt verification and activity before printing, then restores their prior on-screen expanded/collapsed state. It makes no network request.

The archive retains the existing public invoice/history projection. Private operator credentials, buyer authorization bytes, other invoices and the merchant database remain in their existing private operating records.

## Typed client

Use the existing authenticated operator connection. The original store and tenant checks apply to every server response.

```js
import {createMerchantOperatorClient} from './operator-client.mjs';

const merchant = await createMerchantOperatorClient({
  url: originalServerURL,
  storeId: originalStoreId,
  tenantId: originalTenantId,
  operatorToken: originalOperatorToken,
  timeoutMs: 120000
});

const review = await merchant.previewInvoiceDelivery(originalInvoiceId);
// Examine review.reference, state, offers, result and members.
const ticket = await merchant.prepareInvoiceDelivery(
  review.invoiceId, review.revision
);
const saved = await merchant.downloadInvoiceDelivery(
  ticket, '/absolute/private/customer-delivery.zip'
);
```

The destination's parent must already be a private directory. The original verified-file receiver checks exact length and SHA-256 while streaming, stages privately and publishes the complete file without overwriting a different existing destination. An identical retained file is reopened by its original byte identity.

The snapshot revision is the SHA-256 of the complete canonical public invoice record, original history and envelope. It excludes export-time timestamps. The standard ZIP uses fixed member timestamps, stable member order and uncompressed streaming, so the same selected original record and file produce the same archive bytes.

A large complete result requires a suitable original connection timeout. The operator client accepts up to 300000 milliseconds and an explicit maximum download size. The server preserves the original configured result capacity, up to 1 GiB, and never collects that result into one memory buffer.

## CLI

The existing connection JSON contains the original URL/store/tenant and a private environment variable name. Its value stays in the original operator's environment.

```sh
node products/x402api-merchant-workspace/operator-cli.mjs invoice-delivery \
  --connection /absolute/private/merchant-connection.json \
  --id ORIGINAL_INVOICE_UUID \
  --out /absolute/private/customer-review.json

node products/x402api-merchant-workspace/operator-cli.mjs invoice-delivery-download \
  --connection /absolute/private/merchant-connection.json \
  --request /absolute/private/customer-review.json \
  --timeout-ms 120000 \
  --out /absolute/private/customer-delivery.zip
```

Read the complete saved review before the second command. A changed invoice receives `INVOICE_DELIVERY_CHANGED`; save a new review for the actual current invoice instead of silently choosing another edition.

The returned CLI record identifies the complete saved ZIP, its original invoice and selected revision. Output publication uses the existing private file receiver. Subsequent identical downloads keep the original file; different bytes require a different destination.

## Independently receive a customer ZIP

The included helper checks every complete archive member, its original manifest, invoice/envelope/result identities and file hashes before publishing a new receiving directory.

```sh
python3 products/x402api-merchant-workspace/invoice_delivery_receive.py \
  --archive /absolute/private/customer-delivery.zip \
  --directory /absolute/private/opened-customer-delivery
```

Choose a new destination with an existing private parent. The helper rejects unsafe paths, duplicate/extra members, unsupported entries, changed member bytes and mismatched invoice or wallet records. The complete original ZIP remains available. The extracted delivery is staged privately and published together after verification. Open its actual `index.html` and result; byte verification alone does not constitute rendered inspection.

## Existing HTTP application

| Request | Original behavior |
| --- | --- |
| `GET /api/orders/:id/delivery` | Read one complete original invoice snapshot and return its reviewed revision, exact offered amounts and full member selection. |
| `GET /api/orders/:id/delivery/export?revision=SHA256` | Capture that same revision, verify its complete result, create the customer archive and return the existing temporary download ticket. |
| `GET /downloads/invoices/:ticket` | Stream the original complete archive with its length and SHA-256 through the existing one-use download path. |

Both API reads use the existing operator authentication, Origin check and original store/tenant headers. One synchronous original SQLite read binds invoice, history and envelope. The source result then passes the existing verified-file reader and a second streaming hash/stat check during ZIP construction. The final ZIP also passes that original reader.

At most eight invoice downloads/builds are retained by the existing server pool. Aborted exports stop and drain their child ZIP process before cleanup; completed tickets use the existing two-minute lifetime. Source and result changes fail the selected export while retaining the original operating case.

## Inspect the exact outgoing delivery

Bryce's rendered-product instruction of October 13 applies to every outgoing customer attachment and every usable artifact inside a ZIP or project. Before declaring this delivery ready, its producer must open, run or render the exact outgoing edition, actually LOOK at the real rendered screens/pages/images and use it normally. A successful capture, schema check, DOM count, HTTP result or peer source review is supporting evidence.

For this workflow:

1. Use the real selected invoice in the merchant desk at desktop and narrow width. Read the original state and amounts, prepare the customer files, download the selected archive and exercise relevant loading/error/disconnected states.
2. Extract the exact outgoing archive. Open its actual invoice HTML at desktop and phone width. Read its populated headings, original terms, state, amounts and full expanded detail tables. Operate every outgoing file link and reopen the page from the extracted folder.
3. Open the actual completed result in its native application. For documents/PDFs, render and visually read the applicable pages; for spreadsheets, inspect the actual sheets/tables/formulas; for usable software/projects, open and operate their important controls and lifecycle. Read structured/text attachments in an appropriate actual viewer. Keep the original file bytes with the delivery.
4. LOOK at the produced screenshots/images and actual rendered pages. Repair clipped or overlapping content, unreadable tables, missing files, wrong identities/amounts, incorrect actions or empty/error-state problems in the current source and regenerate this same selected delivery.
5. Keep internal inspection screenshots and private operating inputs with the original receiving operation. The customer's ZIP contains the invoice and complete original customer files listed in its manifest.

If an outgoing artifact includes video, use a high-quality generative TTS/media route, watch and listen to the actual final edition, and correct obvious audio/visual defects before sending.

## Complete original-case receiving

`installed-receiving.mjs` calls `invoice-delivery-receiving.mjs` inside the existing five-invoice installed/browser/cold-reopen course. It preserves the original commissioning archive, invoices, paid results, source operation and provider sentinel.

For every original completed invoice, the course reads the full typed review, creates/downloads the complete selected ZIP, downloads the same edition through the real browser desk and compares their exact bytes. It independently verifies/extracts every member, opens the actual outgoing HTML at desktop/narrow width, operates original record/manifest/wallet/result downloads and opens the complete original commissioned text result. It cold-reopens the extracted invoice and additionally receives the first invoice through the actual CLI.

Each receiving attempt retains its own private directory and all complete outputs. Those outputs join the existing installed course's full file inventory and cold-reopen checks. The returned `producerInspection` remains `AWAITING_PRODUCER_SCREEN_AND_ATTACHMENT_REVIEW` until the producer performs the actual rendered review above. Continue the original course and its retained case; do not manufacture another invoice or payment for receiving.
