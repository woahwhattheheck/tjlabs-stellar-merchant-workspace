# Customer account delivery and response review through the merchant MCP

This workflow gives the merchant's existing accounting owner the complete customer account cycle: publish one dated account with its original documents; let the customer prepare invoice-specific responses in the included offline desk; receive that exact response file; and record a reviewed outcome through the original Collections writer. It joins the browser and native workflow in [Customer account responses](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/CUSTOMER_ACCOUNT_RESPONSES.md).

The full account, original invoice sources, customer identity, selected date and file identities remain bound to the saved publication. A response carries that publication's identity and original account hashes. The staff review compares each response entry with the published invoice and the current original invoice and case. A balance change requires explicit acknowledgment; current balance and case constraints still apply.

## Interfaces and original owner

Use the existing configured accounting workspace and token, described in [Receivables](ACCOUNTING_RECEIVABLES.md). The installed command is `starforge merchant-accounting-receivables`. The typed client remains `@tokenjunkielabs/starforge-merchant/merchant/accounting-receivables`; its durable prepare, execute and download helpers remain under the `/operations` export.

Every business tool below has the prefix `merchant_accounting_receivables_`.

| Tool suffix / CLI command | Complete native operation |
| --- | --- |
| `customer_account_list` / `customer-account-list` | Read saved publications and received-response progress, optionally by customer or search. |
| `customer_account_preview` / `customer-account-preview` | Review a new publication UUID, original customer and selected account date, including complete account and file identities. |
| `customer_account_publish` / `customer-account-publish` | Save that exact reviewed account and the complete customer package. |
| `customer_response_preview` / `customer-response-preview` | Review the original response text against its saved publication. |
| `customer_response_receive` / `customer-response-receive` | Retain the original reviewed text and normalized entries once. |
| `customer_response_detail` / `customer-response-detail` | Read the original response, staff decision history, account and current case references. |
| `customer_response_review_preview` / `customer-response-review-preview` | Review one entry, its current invoice and case, the explicit operator choices and proposed native operations. |
| `customer_response_review` / `customer-response-review` | Save the chosen outcome and original Collections changes in one accounting commit. |

All mutations include `workspaceId`, current `revision`, `actor`, stable `requestId` and the exact `reviewSha256`. The existing `request_lookup` tool and durable `reconcile` command recover those original request identities. The adapter calls the existing Receivables methods; admission, locking, maintenance, backup and commit uncertainty remain with the original accounting owner.

## Publish the complete customer package

Start with a saved customer UUID, generate one publication UUID, and choose the account date. A publication selection has this shape; use the actual original IDs:

```json
{
  "publicationId": "a82923de-42c6-4efa-95ad-4b9d349cb1a3",
  "customerId": "4155a0a3-3c25-4cc6-88df-1353e68c2b13",
  "asOf": "2026-10-13"
}
```

The publication date is optional in a new selection; the returned preview retains the actual selected date. Preparing from that full preview always supplies it explicitly.

Set up a private operation directory and the existing connection:

```bash
umask 077
ACCOUNT_WORK="$PWD/customer-account-work"
mkdir -p "$ACCOUNT_WORK"
rcv=(starforge merchant-accounting-receivables)
account_connection=(--url "$MERCHANT_MCP_URL" --workspace "$MERCHANT_WORKSPACE" --token-env MCP_ACCESS_TOKEN)

"${rcv[@]}" customer-account-preview "${account_connection[@]}" \
  --request "$ACCOUNT_WORK/publication.selection.json" \
  --out "$ACCOUNT_WORK/publication.preview.json"

"${rcv[@]}" prepare "${account_connection[@]}" \
  --dir "$ACCOUNT_WORK/publication-operation" --action customer-account-publish \
  --preview "$ACCOUNT_WORK/publication.preview.json" --actor "$MERCHANT_OPERATOR"

"${rcv[@]}" execute --dir "$ACCOUNT_WORK/publication-operation"
```

Review the complete preview before preparation. It carries the original account, its byte hash, invoice document identities, every source file identity and the workspace revision. The client validates those native seals before creating mutation arguments. A changed account or revision requires a fresh preview and a new reviewed operation.

Download the saved `account.tar` with the existing retained-file reader. The selection is:

```json
{
  "kind": "receivables-customer-account",
  "publicationId": "a82923de-42c6-4efa-95ad-4b9d349cb1a3",
  "file": "account.tar"
}
```

```bash
"${rcv[@]}" download "${account_connection[@]}" \
  --selection "$ACCOUNT_WORK/account-file.selection.json" \
  --out "$ACCOUNT_WORK/customer-account.tar"
```

Extract the complete package together so that `customer-account.html` can open its original invoice and account documents. The customer desk works offline and prepares notes, promises, disputes and reported-payment notices for specific published invoices. Each exported response has its own stable identity; editing an already exported response creates a successor response. The saved publication remains the dated source.

## Receive the original customer response

The intake selection contains only the original `publicationId` when using a local file. Keep the complete customer export as a private regular UTF-8 file. The CLI reads at most 1,500,000 bytes, preserves the exact text and includes it in the full saved preview:

```bash
"${rcv[@]}" customer-response-preview "${account_connection[@]}" \
  --request "$ACCOUNT_WORK/response.selection.json" \
  --source "$ACCOUNT_WORK/customer-response.json" \
  --out "$ACCOUNT_WORK/response.preview.json"

"${rcv[@]}" prepare "${account_connection[@]}" \
  --dir "$ACCOUNT_WORK/receive-operation" --action customer-response-receive \
  --preview "$ACCOUNT_WORK/response.preview.json" --actor "$MERCHANT_OPERATOR"

"${rcv[@]}" execute --dir "$ACCOUNT_WORK/receive-operation"
```

For direct MCP or typed-client use, select exactly one of `responseText` or `responseSource`. `responseSource` is an existing host-configured `receivablesInputs` alias. The preview resolves that alias once through the original source reader and returns `source:{publicationId,responseText}` alongside the native intake review. The complete preview binds the original byte hash, normalized response and publication. Preparation retains the literal original text, so replay does not depend on a later source-file change. Omit both text and alias when the CLI's `--source` reads the local file.

Keep the saved preview and operation directories private: they contain the customer's exact original text. The receiving result provides the original response ID and revision. A duplicate source response is identified by the original native receiving rules.

## Review and act on an entry

Open `customer-response-detail` with `{"customerResponseId":"<original UUID>"}`. Select one original entry and the response's current version. A review selection contains:

- `customerResponseId`, `entryId` and `expectedVersion`.
- `disposition`: `RECORD`, `ACKNOWLEDGE`, `DECLINE` or `DEFER`.
- `effectiveDate` and a reason.
- For a new case, the requested title, owner, priority and next action date.
- The explicit flags needed for the current situation: `acknowledgeChanges`, `reopenCase`, `replaceOpenPromise` and `resolveOpenDispute`.

The preview returns the published and current invoice, changed fields, current case, normalized choice and proposed original operations. Review each of these before saving. An acknowledgment of changed balances does not permit a promise or dispute greater than the current eligible balance. Closed cases and existing promises or disputes require the corresponding explicit choice. Payment notices become inbound contact with their original amount, payment date and reference; the existing bank, remittance or wallet receipt workflow performs actual cash matching.

```bash
"${rcv[@]}" customer-response-review-preview "${account_connection[@]}" \
  --request "$ACCOUNT_WORK/review.selection.json" \
  --out "$ACCOUNT_WORK/review.preview.json"

"${rcv[@]}" prepare "${account_connection[@]}" \
  --dir "$ACCOUNT_WORK/review-operation" --action customer-response-review \
  --preview "$ACCOUNT_WORK/review.preview.json" --actor "$MERCHANT_OPERATOR"

"${rcv[@]}" execute --dir "$ACCOUNT_WORK/review-operation"
```

Preparing this operation retains every normalized operator choice from the full preview. The original response selector is passed to the existing native method, then reattached in the native intent's original field order for request reconciliation. A successful review increments the response version; refresh the next entry before preparing its decision.

## Recovery and full retained files

Use `reconcile --dir PRIVATE_OPERATION` after an uncertain return. It reads the original request journal, verifies the action, actor and exact native intent, and returns the committed original result when present. If the request remains unapplied, `execute` reuses the same saved bytes and request ID. A stale source or revision needs a fresh preview; preserve the prior operation and prepare the new reviewed choice in a new directory. When the original owner reports an uncertain durable commit, follow its existing reopen/reconciliation path before further writes.

The original retained-file lifecycle handles full bytes, chunk identity, expected SHA and release. These two additional file families join that reader:

| Kind | Original selector | Main complete files |
| --- | --- | --- |
| `receivables-customer-account` | `publicationId` | `account.tar`, `account.json`, `account.html`, `account-binding.json`, `customer-account.html`, `delivery-manifest.json` and original inventory members. |
| `receivables-customer-response` | `customerResponseId` | `response.tar`, `received-response.json`, `merchant-review.json`, `merchant-review.html`, `response-manifest.json` and original publication members. |

Use the exact original file names from the saved publication, including `documents/<filename>`. Account packages contain the selected customer's material. Response archives also contain the merchant's internal review and decision history; retain them with staff records. The original whole-workspace backup includes both the retained files and their accounting history.

## Typed operation

The existing client exposes all eight methods and both complete-file convenience methods:

```javascript
import {
  connectAccountingReceivablesClient,
  accountingCustomerResponseArguments,
  accountingCustomerResponseReviewArguments
} from '@tokenjunkielabs/starforge-merchant/merchant/accounting-receivables';

const client = await connectAccountingReceivablesClient({
  url: process.env.MERCHANT_MCP_URL,
  workspace: process.env.MERCHANT_WORKSPACE,
  tokenEnv: 'MCP_ACCESS_TOKEN'
});
try {
  await client.open();
  const intake = await client.previewCustomerResponse({
    publicationId,
    responseText: originalResponseText
  });
  // Review the complete intake, then retain the operation with the installed
  // /operations helper when it must survive a process interruption.
  const received = await client.receiveCustomerResponse(
    accountingCustomerResponseArguments(intake, {actor, requestId: receiveRequestId})
  );
  const customerResponseId = received.customerResponse.id;
  const detail = await client.customerResponse({customerResponseId});
  const review = await client.previewCustomerResponseReview({
    customerResponseId, entryId, expectedVersion: detail.response.version,
    disposition: 'ACKNOWLEDGE', effectiveDate, reason
  });
  const decision = await client.reviewCustomerResponse(
    accountingCustomerResponseReviewArguments(review, {actor, requestId: reviewRequestId})
  );
  const archive = await client.customerResponseFile({
    customerResponseId, file: 'response.tar'
  });
  // Persist archive.bytes using its returned file identity.
} finally {
  await client.disconnect();
}
```

The specific preview/binding helper exports are `/merchant/accounting-receivables/customer-responses` and `/merchant/accounting-receivables/customer-response-previews`. The typed client and CLI declaration files also expose the original native account, response, review and operation result types.

Authored by TokenJunkieLabs. MIT; retain existing third-party notices.
