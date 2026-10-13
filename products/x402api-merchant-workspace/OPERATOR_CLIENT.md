# Merchant operator client and CLI

The operator client connects to the existing x402api merchant application. It uses the application's authenticated HTTP API for the complete invoice, payment, retained-result, observation and project-export journey. The existing server continues to own SQLite, fulfillment reservations, payment receipts and the managed application lifecycle.

The installed command is `starforge x402api-merchant-operator`. The installed module is the installed package's `./merchant/x402api/operator` export; prefix that subpath with the package name in the installed distribution's package.json. In a source checkout, import `./products/x402api-merchant-workspace/operator-client.mjs` or run `node products/x402api-merchant-workspace/operator-cli.mjs`. The adjacent operator-client.d.mts describes the complete interface.

Use the distribution's supported Node runtime with built-in fetch, AbortSignal.any and node:sqlite; the maintained native receiving runtime is Node 24. No extra npm package is required by this client.

## Commission the actual application

Start the existing managed merchant or received-project review using OPERATING.md or RECEIVED_REVIEW.md. Obtain its URL and existing operator credential through that application configuration. Keep the credential in the existing private environment variable; the CLI accepts the variable's name and never writes the credential into connection JSON.

Create a private directory with mode 0700. For example, with the real operator credential already supplied in MERCHANT_OPERATOR:

```sh
umask 077
mkdir -p /private/merchant-operator
chmod 700 /private/merchant-operator
starforge x402api-merchant-operator connect \
  --url http://127.0.0.1:8764/ \
  --token-env MERCHANT_OPERATOR \
  --out /private/merchant-operator/connection.json
```

Replace /private with an existing real directory on your machine. Paths must be absolute, normalized and free of symlink parents. JSON inputs must be private ordinary files owned by the operator. Output directories must be private and owned by the operator.

Connect reads the actual register and retains its original store UUID and tenant UUID, application origin and environment-variable name. The saved connection has schema stellar-forge.merchant-operator-connection.v1. It does not retain the credential. The response reports whether the application is live or review and the saved file's bytes and SHA-256.

All subsequent commands validate this connection against the actual server before doing their work. Every authenticated request carries the expected store and tenant IDs. The server compares them before a mutation or read, then returns its owner IDs in response headers. A restarted URL pointing at another merchant is rejected. Existing browser and API callers remain compatible; they may omit these additive headers.

Use HTTPS for a remote application. HTTP is accepted only for localhost, 127.0.0.1 or ::1. Redirects are rejected. The configured URL is an origin, with no credentials, path, query or fragment. An older server without the owner-header contract must be upgraded to the same maintained source edition before commissioning this client.

For a retained connection pin, pass --connection-sha256 with the digest returned by connect. Changing the connection file then requires an explicit new selection. Use --timeout-ms (100–300000) for slower operations or downloads; the default is 30000. --maximum-download-bytes controls the byte ceiling, which defaults to 8 GiB.

## Review, page and export invoices

```sh
starforge x402api-merchant-operator register \
  --connection /private/merchant-operator/connection.json \
  --limit 50 --out /private/merchant-operator/register-page.json
starforge x402api-merchant-operator register-export \
  --connection /private/merchant-operator/connection.json \
  --register /private/merchant-operator/register-page.json \
  --format csv --out /private/merchant-operator/invoices.csv
```

A selection JSON file can contain q, state, from, to, assetId and network. Dates use YYYY-MM-DD in UTC, inclusive. Unknown fields are rejected. q searches the invoice UUID, reference and title. Asset and network filters match the same offered rail.

The register response retains normalized selection, store/history revision, page cursors, all original invoice projections and separate receipt/delivery outcomes. Pass --cursor and --revision from that response to inspect another page. Save subsequent pages under distinct names; an existing different destination is preserved.

Register-export consumes the saved actual register page and exports every invoice in that page's selection, across all pages. It uses the retained revision. If the store's history changed, it fails with INVOICE_REGISTER_CHANGED; read and review the current register before requesting a new export. CSV has one row per original offered rail. Atomic amounts remain canonical decimal strings; incompatible currencies and networks are never summed into a money total. JSON preserves the full selected projection.

The one-use download is verified against its prepared byte count and SHA-256. The client writes a private same-parent temporary file, verifies the entire response, fsyncs it and publishes it without overwriting another destination. Exact existing bytes are reused. A failed or interrupted transfer leaves the existing target intact. A consumed or expired export ticket can be prepared again against the same reviewed revision if that revision is still current.

## Original invoice and payment lifecycle

All mutation commands retain the original invoice UUID. Create requires the UUID to be present in the request JSON before the first send:

```json
{
  "id":"a9ea0b81-b039-4b37-8ba2-cd8e610b2178",
  "reference":"CUSTOMER-INVOICE-001",
  "title":"The configured retained deliverable",
  "prices":[{"assetId":"THE_CONFIGURED_ASSET_UUID","amountAtomic":"2500000"}]
}
```

Select the real configured asset and amount from the merchant configuration. The example is a request shape, not a payment instruction. Store the request privately as mode 0600. Then run create with --request and --connection. The maintained server freezes the actual configured resource edition, rails and file binding.

| Command | Required selection | Behavior |
| --- | --- | --- |
| create | --request FILE containing original id | Create or recover that same invoice under the server's original identity checks. |
| invoice | --id UUID | Read the original invoice and complete history. |
| charge | --id UUID | Ask the existing owner to create or reconcile its provider charge. |
| envelope | --id UUID | Return the original payment request envelope. |
| authorize | --id UUID --request FILE | Submit the buyer's exact paymentSignature from a private one-field JSON object. |
| reconcile | --id UUID | Reconcile that original provider/payment state through the existing workspace. |
| result | --id UUID --out FILE | Inspect and download the original completed retained result, verifying exact bytes and SHA-256. |

The client does not create buyer signatures or silently select a new invoice identity. No mutation is automatically retried. Transport interruption, invalid successful response or an HTTP 5xx after a mutation is reported with outcome UNKNOWN and a concrete recovery selection. Inspect that original invoice, or that original project operation, before deciding the next action. The maintained server's business state determines whether the same operation should continue.

Mutation commands preflight a requested output path before sending and reject an existing mutation destination. If the server returned successfully but a later local write fails, the CLI emits the complete received response with outcome RECEIVED, saveError and its original recovery selection, then exits unsuccessfully. This preserves the known returned result and distinguishes a storage problem from an unknown server outcome.

A review application remains read-only. Its authenticated reads, register exports and retained downloads work; mutation attempts receive the existing review-mode rejection.

## Observation and complete project delivery

observation returns the maintained observation report. observation-summary returns its operational summary; --history-sequence binds the requested history projection when needed. These use the same private connection and original owner.

project describes the application's existing complete-project capability. Choose and retain a project-operation UUID before project-begin. The same operation can be inspected with project-status and project-manifest, then downloaded with project-download once COMPLETE. Pass --operation UUID for those commands and --out FILE for the complete ZIP.

The project download checks that the status belongs to the selected operation and store, converts its canonical byte-count string only when safely representable, then verifies the streamed archive. Project generation, source selection, original configuration, database and reservation capture remain in the maintained project implementation. If project support is not configured for that server, the existing API reports the configuration error.

## Node integration

```js
import {createMerchantOperatorClient, MerchantOperatorError}
  from './products/x402api-merchant-workspace/operator-client.mjs';

const client = await createMerchantOperatorClient({
  url: connection.url,
  storeId: connection.storeId,
  tenantId: connection.tenantId,
  operatorToken: process.env[connection.tokenEnvironment]
});
const reviewed = await client.readRegister({selection:{state:'COMPLETE'},limit:50});
for await (const page of client.registerPages({selection:reviewed.selection})) {
  for (const invoice of page.orders) console.log(invoice.id, invoice.delivery.state);
}
const ticket = await client.prepareRegisterExport({
  selection:reviewed.selection,revision:reviewed.source.revision,format:'json'
});
const saved = await client.downloadRegisterExport(ticket, '/private/merchant-operator/invoices.json');
console.log(saved.path, saved.bytes, saved.sha256);
```

registerPages establishes one revision on its first actual page and keeps it for the complete iteration. A concurrent history change rejects the iteration rather than blending editions. Call readRegister with explicit cursor and revision when resuming a previously retained page sequence.

Methods accept an AbortSignal. MerchantOperatorError exposes code and optional HTTP status; mutations with an uncertain outcome also expose recovery. The client returns full original server records for invoice inspection, payment envelope and observation so integrations retain all source fields. Monetary values should remain strings throughout downstream processing.

## Source and receiving

The contribution exports the operator module and installs the CLI command. Complete directory exports and original-case source receiving include operator-client.mjs, operator-client.d.mts, operator-cli.mjs and this guide. New complete project exports pin these source files; earlier complete projects preserve their original source edition and remain inspectable.

The server's new owner checks are additive and do not change the store schema, original payment receipts, fulfillment reservations or writer scope. The client never opens the merchant database. Commissioning the client and reading/exporting the existing five-invoice case can be done against the actual read-only application with the original business rows retained.

For customer operation, retain the connection descriptor, reviewed register page and exported/downloaded files together. Their bytes and digests identify the files that were received. Do not put operator credentials, buyer authorizations or one-use download URLs into shared messages.

## Complete invoice intake

The same owner-bound connection supports `intake-context`, `intakes`, `intake-prepare`, `intake-status`, `intake-run` and `intake-export`. Preparation retains original CSV/JSON bytes and a complete reviewed plan before invoice creation. Run uses that saved review digest; interruption recovery reads the same operation and original invoice IDs. See [INVOICE_INTAKE.md](./INVOICE_INTAKE.md) for the complete browser, CLI and typed client course.
