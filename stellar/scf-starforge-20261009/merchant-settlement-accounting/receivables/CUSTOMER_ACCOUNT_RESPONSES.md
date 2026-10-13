# Customer accounts and reviewed responses

The Receivables **Customer accounts** desk publishes a complete dated account for one customer, gives that customer an offline response form, and brings their messages back into the original collection cases. Staff review each entry against the selected current invoice balance before saving its outcome.

## Staff: publish the customer account

1. Open the existing merchant workspace and choose **Receivables → Customer accounts**.
2. Set the operator, select **Publish account**, choose the customer and account date, then **Review complete operation**.
3. Check the invoice count, amounts by currency and original file count. Select **Publish reviewed account**.
4. Download **Complete customer account**. Extract the TAR into a new folder and open `customer-account.html`.
5. Deliver that complete folder or archive through the customer's usual approved channel. Keep its internal `documents/` folder and filenames intact.

The customer package includes the original dated account JSON, HTML and CSV reports; issued invoice and credit documents; original customer-specific payment, refund and bank information; a delivery manifest; and the offline response desk. Its account date and original source references stay fixed after publication. To communicate a later balance, publish another dated account.

The account is scoped through the existing customer export. Publication retains the exact original bytes before committing its record. A complete TAR is capped at 128 MB; a larger selected account must be narrowed to an earlier date before publication. Publication does not send a message.

## Customer: inspect and respond

Open `customer-account.html` in a current browser. The industrial, monochrome interface has five sections:

- **Account** shows balances separately for each currency.
- **Invoices and credits** shows original documents and a Respond action beside each invoice.
- **Payments** shows the retained original cash, allocation, refund and transfer information.
- **Respond** retains the customer's name, contact/reference, response date and invoice entries.
- **Original files** opens the original document bytes and their source identities.

Each invoice entry is one of:

| Entry | Customer information | Staff recording |
|---|---|---|
| Message | Complete invoice message | Original inbound contact activity |
| Payment promise | Exact invoice-currency amount and promised date | Original dated promise and invoice basis |
| Invoice dispute | Exact amount, category and message | Original dated dispute |
| Reported payment | Amount, payment date and payment reference | Original inbound contact for staff matching |

Save the open entry before selecting another invoice. **Keep editor for later** parks it on the same computer; **Respond** reopens it. Browser storage retains local entries when available. **Download complete response** saves the complete JSON to return through the usual merchant contact channel. A downloaded response can be reopened using the file selector. Editing a downloaded edition creates a following response with its own identifier and retains the preceding reference.

The offline desk makes no network requests. Its embedded account is fixed to the original publication. Moving the complete account folder to another computer preserves its original account and files; move the downloaded response JSON as well to continue a response there. Browser-local unsaved entries belong to the browser in which they were entered.

Response amounts use the original currency precision. A promise or dispute cannot exceed that invoice's published amount due. A reported payment retains the customer's stated amount for staff investigation. The response date is between the account date and today. A promised payment date is on or after the response date; a reported payment date is on or before it.

## Staff: receive and review the complete response

1. Choose **Receive response** and select the original downloaded customer JSON.
2. The desk selects its existing publication when that account is in the current list. Check the customer, account date, author and entry count, then receive the reviewed source.
3. Open the received response and choose **Review entry**.
4. Choose its effective date and outcome. Enter the operator's reason.
5. For **Record in the original collection case**, inspect the original customer account beside the invoice at the selected effective date. Explicitly acknowledge changed balances before recording.
6. Review the original case, promise and dispute. When appropriate, explicitly choose to reopen a closed case, withdraw an existing promise before replacement, or resolve an existing dispute before recording the new one.
7. Save the reviewed outcome. Its complete review, original source identities and resulting collection event references remain with the received response.

| Outcome | Result |
|---|---|
| Record | The selected entry becomes the original case activity; a new case is opened when required. |
| Acknowledge | The response and reason are retained as a final reviewed outcome. |
| Decline | The response and reason are retained as a final reviewed outcome. |
| Defer | The reason is retained and the entry remains available for a later decision. |

For a new case, supply its owner, priority and next follow-up date. A new collection case requires an outstanding issued invoice at the selected effective date. An existing case can retain an inbound message after closure. A new promise or dispute on a closed case requires explicit reopening.

A customer's reported payment is retained as inbound information. Staff receive and allocate actual funds through the original receipt, remittance, bank or Stellar workflow. The response does not change the original invoice, cash or credit balances.

The review rechecks the original issued document, current account projection, response version, current case and workspace revision under the same accounting lease. Case opening, reopening, promise/dispute replacement and the new activity commit together with the saved response decision. The original Collections writer provides those events; its public methods keep their existing request journal and validation.

## Retained forms and interrupted replies

**Keep form for later** retains each staff form separately for the original operator and workspace. **Resume retained form** lists those saved forms. A response-entry form retains its original entry and displayed invoice; opening another response parks it.

Every write uses the existing Receivables pending-operation interface. Keep its original request after an interrupted reply and retry or reconcile that same request. A committed retry returns the original journal result before applying stale-revision or review checks. A definitively rejected request can return to its retained form; review the current account again before creating the corrected operation.

A changed response with the same response identifier and different bytes is rejected. A byte-identical file can be received again as the existing original response. Following customer editions remain separate so their authorship and contents are available for staff comparison.

## Complete files and operator archive

The staff desk downloads **Complete customer account** for customer delivery and **Complete operator archive** for internal account work.

| Route file | Contents |
|---|---|
| `account.tar` | Complete fixed customer delivery, including offline desk |
| `account-binding.json` | Publication, customer, workspace, account date and original source identities |
| `delivery-manifest.json` | Original customer file names, byte counts and SHA-256 identities |
| `received-response.json` | Exact customer-supplied response bytes |
| `merchant-review.json` | Complete received record, all decisions and retained review context |
| `merchant-review.html` | Readable invoice messages and staff outcomes |
| `response-manifest.json` | Complete current operator archive file identities |
| `response.tar` | Original customer account, exact received response and full staff review |

The operator archive contains staff reasons and collection details. Keep it with internal account records. Individual original files remain available through their exact names. The original TAR limit also applies to the complete operator archive; for a very large review history, retain its individual JSON/HTML/manifest and original account files.

All retained files are read from the original accounting export directories and checked against their saved byte counts and SHA-256 identities before download. The existing workspace backup/restore must include its export files alongside its state and journal.

## Typed HTTP client

The distribution exposes the `./merchant/receivables/customer-account-client` export under its installed package name. In a source checkout, import `./customer-account-client.mjs`. The module uses the original `ReceivablesClient` transport, error types, request header, same-origin credentials and redirect policy.

```js
import {createCustomerAccountResponseClient} from './customer-account-client.mjs';

const desk = createCustomerAccountResponseClient({
  baseUrl: 'http://127.0.0.1:YOUR_PORT/api/receivables'
});
const selection = {
  publicationId: crypto.randomUUID(),
  customerId: existingCustomerId,
  asOf: '2026-10-13'
};
const review = await desk.previewCustomerAccount(selection);
const request = {
  ...selection,
  workspaceId: review.workspaceId,
  revision: review.revision,
  reviewSha256: review.reviewSha256,
  actor: 'accounts-operator',
  requestId: crypto.randomUUID()
};
// Retain the complete request before sending it.
const result = await desk.publishCustomerAccount(request);
const archive = await desk.customerAccountFile(result.customerAccount.id, 'account.tar');
```

Use the actual port of the original running merchant workspace. For an endpoint requiring original source binding, supply both `expectedWorkspaceId` and `expectedSourcesSha256`. Existing server authentication and loopback/host rules apply.

| Method | Purpose |
|---|---|
| `customerAccountResponses(query)` | Existing publications and response review progress |
| `previewCustomerAccount(value)` | Complete original customer export selection |
| `publishCustomerAccount(value)` | Retain the reviewed account and offline desk |
| `previewCustomerResponse(value)` | Parse and bind exact received `responseText` |
| `receiveCustomerResponse(value)` | Retain the original response bytes |
| `customerResponse(id)` | Full response, decisions, original account and case references |
| `previewCustomerResponseReview(id, value)` | Current invoice/case review and explicit outcome |
| `reviewCustomerResponse(id, value)` | Commit the reviewed decision and original case activity |
| `customerAccountFile(id, name)` | Complete account TAR or original retained customer file |
| `customerResponseFile(id, name)` | Complete operator TAR or response/review file |
| `customerAccountOperation(requestId)` | Original saved accounting request and current result |

The type declarations describe all entry kinds, review choices, publication and response results. Exact decimal amounts remain strings. The API accepts the original response as `responseText` so its supplied bytes are retained.

## Native CLI and durable prepared operations

The package registers `customer-account`; from source run:

```sh
node stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/customer-account-cli.mjs --help
```

All commands use the original existing accounting directory under its original writer lease. Close another native writer before opening the same directory through this CLI.

Write `account-selection.json` with the actual customer and account date:

```json
{"customerId":"ORIGINAL_CUSTOMER_UUID","asOf":"2026-10-13"}
```

Prepare the complete account selection, inspect its saved review, then execute that unchanged request:

```sh
customer-account prepare-publication --directory EXISTING_ACCOUNT --input account-selection.json --actor accounts-operator --out prepared-publication.json
customer-account execute --directory EXISTING_ACCOUNT --input prepared-publication.json --out publication-result.json
customer-account account-file --directory EXISTING_ACCOUNT --id PUBLISHED_ACCOUNT_UUID --name account.tar --out customer-account.tar
```

Preparation creates the publication identifier, original request identifier, current workspace/revision binding and review hash. It retains the full review and request in the output file before any mutation.

For intake, write `received-input.json` with `publicationId` and the complete original response file text as `responseText`, preserving the original decoded UTF-8 string:

```sh
customer-account prepare-receive --directory EXISTING_ACCOUNT --input received-input.json --actor accounts-operator --out prepared-receive.json
customer-account execute --directory EXISTING_ACCOUNT --input prepared-receive.json --out receive-result.json
customer-account response --directory EXISTING_ACCOUNT --id RESPONSE_UUID --out response-detail.json
```

Use the response detail's version and an original entry identifier in the decision input:

```json
{
  "entryId":"ORIGINAL_ENTRY_UUID",
  "expectedVersion":1,
  "disposition":"RECORD",
  "effectiveDate":"2026-10-13",
  "reason":"Reviewed the original invoice and customer payment promise.",
  "owner":"accounts-operator",
  "priority":"NORMAL",
  "nextActionDate":"2026-10-14",
  "acknowledgeChanges":false,
  "reopenCase":false,
  "replaceOpenPromise":false,
  "resolveOpenDispute":false
}
```

```sh
customer-account prepare-decision --directory EXISTING_ACCOUNT --id RESPONSE_UUID --input decision-input.json --actor accounts-operator --out prepared-decision.json
customer-account execute --directory EXISTING_ACCOUNT --input prepared-decision.json --out decision-result.json
customer-account response-file --directory EXISTING_ACCOUNT --id RESPONSE_UUID --name response.tar --out operator-response.tar
```

After an interrupted execute, inspect the same original request:

```sh
customer-account recover --directory EXISTING_ACCOUNT --input prepared-decision.json --out recovered-decision.json
```

A saved operation validates its retained request identity and original response selector. Recovery also checks the original journal's action and intent. If recovery has no operation, execute the unchanged prepared request. If the current account has changed and execution returns a definitive stale-review/revision error, prepare a new reviewed request from refreshed inputs and retain the preceding request.

Output files are create-only and durably installed. Repeating an output with identical bytes reuses the existing file; different contents require a new output path. Raw commands also remain available: `list`, `publication-preview`, `publish`, `response-preview`, `receive`, `response`, `decision-preview`, `decide`, `account-file`, `response-file` and `operation`.

## Implementation and installation

The contribution manifest includes the native command, typed client and model/workspace exports, guide, offline source and browser assets. The existing Receivables asset manifest supplies the staff module and extra client through the same server route. The original HTML navigation includes Customer accounts.

Source modules are authored by TokenJunkieLabs under the repository's MIT terms. Original invoice, allocation, credit, refund, bank, Collections and accounting journal owners remain the sole financial writers used by this workflow.
