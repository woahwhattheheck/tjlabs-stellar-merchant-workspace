# x402api merchant workspace

A complete merchant application for variable-price invoices, wallet handoff,
payment reconciliation and paid file delivery. The operator works in one
plain gray interface. Each invoice retains its original request, charge,
authorization, payment identity and result.

For the maintained package, Node 24 profile and **Applications → Merchant invoices** workflow, see [Install and operate](OPERATING.md). [Installed receiving](INSTALLED_RECEIVING.md) opens the original completed five-invoice workspace through that same lifecycle.

## What an operator can do

- Create an invoice with exact prices on one or more configured payment rails.
- Create its immutable programmatic charge and download the wallet request.
- Receive the buyer's payment authorization and follow settlement progress.
- Accept the configured ownership challenge and authenticated webhook events.
- Verify a finalized payment receipt against separately configured signing-key
  fingerprints, the original order and the selected payment terms.
- Run the customer's fulfillment adapter once, reconcile interrupted work, and
  recover a previously returned result without rerunning the business operation.
- Download the retained result, with its size and SHA-256 checked on every read.

The server keeps the tenant credential and webhook secrets in its environment.
The browser uses a separate operator token. The wallet handoff contains the
original encoded payment requirement, protected request and charge digest.

## Source and runtime

Run from the complete repository or an installed distribution containing the
x402api-merchant contribution. This product reuses the existing SF31 response
writer, SF88 verified-file reader and Applications kernel lease.

Use Linux and the project's supported Node 24 runtime. The application uses
Node's built-in SQLite, HTTP and cryptography modules. Its lease uses the
existing runtime-workspace storage implementation and Linux's flock command
(from util-linux). No application npm installation is required.

From the repository root:

    node products/x402api-merchant-workspace/server.mjs doctor --config /srv/merchant/config.json
    node products/x402api-merchant-workspace/server.mjs serve --config /srv/merchant/config.json --directory /srv/merchant/state --host 127.0.0.1 --port 8764

The state directory must be private to its service account. The store creates
new directories and files with private modes and refuses an existing shared
state directory. Keep the complete source tree when moving the application;
its relative imports deliberately reference the maintained original modules.

## Configure a merchant

Start with config.example.json and replace its example values with the
merchant's actual active resource and wallet versions.

The required values are:

| Configuration | Source or purpose |
| --- | --- |
| tenantId | The existing tenant UUID |
| publicOrigin | The verified HTTPS origin used by buyers |
| template.resourceId | Stable resource UUID |
| template.resourceVersionId | Active resource-version UUID |
| template.resourceVersion | The version number signed in receipts |
| template.rails | Exact asset, network, recipient and version bindings |
| webhook.endpointId | Existing ownership-verified endpoint UUID |
| webhook.secretEnvironmentByVersion | Versioned webhook secret environment references |
| receiptFingerprintsByVersion | Separately obtained signing-key fingerprints |
| receiptPinSource | Provenance for those configured fingerprints |
| fulfillmentBinding | Customer delivery edition frozen into each new invoice |
| fulfillmentModule | Module implementing the fulfillment contract |
| fulfillmentOptions | That module's configuration |
| tenantCredentialEnv | Name of the server credential environment variable |
| operatorTokenEnv | Name of a separate operator-token environment variable |

This edition supports buyer_pays templates with webhook fulfillment. Every
configured rail includes its exact asset ID, issuer-native contract or mint,
recipient, asset version, wallet version, decimals and maximum timeout.
The application compares the offered amount to the returned challenge before
publishing it to a buyer.

Use a new resource or wallet version for new terms. Existing invoices retain
their own frozen configuration and original challenge. Retain any old
fulfillment editions and signing keys needed by outstanding invoices.

Set the named environment values through the service's existing secret
configuration. The operator token is a separate random value of at least
32 characters. Keep the tenant credential out of browser configuration.

Place the HTTP service behind the existing HTTPS proxy for publicOrigin.
Forward the original path, query, body and payment headers unchanged. The
public webhook route is POST /webhooks/x402api. The protected buyer route is
POST /orders/<merchant-order-UUID>/pay. The operator interface is at /.

For loopback commissioning only, the CLI accepts --allow-loopback. Production
configuration requires an HTTPS buyer origin.

Run doctor before serving. It validates local configuration and environment
references, loads the customer's handler, and runs its optional doctor method.
The included file adapter also reads and checks the selected source file.

## Deliver a retained file

The included fulfillment/file-delivery.mjs adapter sells an existing document
or other completed file. It uses a content-bound delivery edition, so replacing
a source file cannot silently change a previously created invoice.

Describe the intended file:

    node products/x402api-merchant-workspace/fulfillment/file-delivery.mjs --source /srv/merchant/products/report.pdf --type application/pdf --name report.pdf > /srv/merchant/file-description.json

The output has two fields: binding and manifest. Save the manifest object as
/srv/merchant/delivery-files.json and put binding in config.fulfillmentBinding.
Set fulfillmentModule to the absolute path of fulfillment/file-delivery.mjs
and fulfillmentOptions.manifest to /srv/merchant/delivery-files.json.

The file manifest has schema stellar-forge.merchant-file-delivery.v1 and a files
object indexed by the content-bound edition ID. Each entry has path, bytes,
sha256, contentType and fileName. Paths can be relative to the manifest.
When moving the application, update the path while retaining its original
content identity.

To add a later product edition, describe the new file and add its manifest
entry alongside the old ones. Select the new binding for subsequent invoices.
The old edition stays available to fulfill earlier paid invoices.

The adapter returns the exact selected file bytes. It has no external business
mutation: reconciliation reads the same pinned edition again and returns it as
the completed outcome.

## Add a customer fulfillment handler

A module can export fulfill and reconcile directly, or export an asynchronous
createFulfillment({configuration, baseDirectory}) factory that returns them.
The factory receives fulfillmentOptions and the config file's directory.

Both operations receive:

    {
      order,
      payment: { id },
      receipt,
      event,
      idempotencyKey
    }

order is the selected invoice with frozen business terms, including its
fulfillmentBinding. receipt has passed the full signed-receipt checks.
event is the retained authenticated finalized event. idempotencyKey is the
same original provider payment ID on every invocation.

fulfill(context) returns:

    {
      bytes: Uint8Array,
      contentType: "application/pdf",
      fileName: "report.pdf"
    }

Use the idempotency key in any downstream business system before making its
mutation. Retain the operation and returned output there so reconciliation
can recover it after a crash.

reconcile(context) returns one of:

| State | Meaning and fields |
| --- | --- |
| complete | The original work completed; include result with its original bytes, contentType and fileName |
| pending | The original downstream work is still active or its outcome is being resolved |
| absent | The original downstream authority confirms that this payment's business operation has not executed |

An absent result lets the application invoke fulfill with the same payment
idempotency key. Return it only from an authoritative lookup or an operation
that has no external side effects.

The application marks the attempt before calling the handler. After a
successful return it retains those exact bytes in SQLite before publishing
the result file. A later disk error resumes publication from that retained
return. A lost handler outcome goes through reconcile.

An optional doctor({binding}) can check customer dependencies at startup
configuration time. It should report the selected configuration without
creating an order, charge, payment or fulfillment.

## Operator workflow

1. Open the service and connect using its operator token.
2. Create an invoice with a business reference, description and exact prices.
3. Select Create payment request. Download the resulting wallet request.
4. Give that file to the buyer's compatible x402api wallet integration.
5. Receive the complete PAYMENT-SIGNATURE from the buyer and submit it, or let
   the buyer send the paid protected request directly.
6. Follow payment and delivery progress. Download the saved result when the
   invoice is Delivered.

The browser preserves a pending invoice creation in session storage so a
network interruption can retry the original UUID and details. It retains
the operator token only in memory. Disconnect clears that token.

The service worker follows the provider's retry interval. Refresh payment
reconciles the same invoice and does not create a new charge or authorization.
A definitive failed authorization remains attached to its original invoice
for review.

## HTTP interface

All /api/ routes require Authorization: Bearer <operator token>. The token
belongs in a header, never a URL.

| Method and route | Operation |
| --- | --- |
| GET /api/state | Public operator configuration and invoice projections |
| POST /api/orders | Retain one invoice with its stable UUID and exact terms |
| GET /api/orders/:id | Invoice, progress and selected activity history |
| POST /api/orders/:id/charge | Create or reconcile its original charge |
| GET /api/orders/:id/envelope | Download the exact wallet request |
| POST /api/orders/:id/payment-authorization | Retain and submit the buyer's original signature |
| POST /api/orders/:id/reconcile | Reconcile the original payment and delivery |
| GET /api/orders/:id/result | Download the checked saved result |
| POST /orders/:id/pay | Exact protected buyer request |
| POST /webhooks/x402api | Ownership verification or signed webhook |
| GET /health | Process readiness |

POST /api/orders accepts id, reference, title and prices. Each price has assetId
and a positive canonical amountAtomic string. Convert decimal display values
with decimalToAtomic, not floating-point arithmetic.

POST /api/orders/:id/payment-authorization accepts paymentSignature as a string.
The server retains it before the first empty upstream payment request.

The buyer request must match the frozen method, URL, content type and exact
body bytes. Its first response carries the original payment-required header.
A completed paid replay returns the saved original result.

## Restart, backup and transfer

Stop the server gracefully before copying a workspace. The server drains
accepted requests and active fulfillment handlers before closing the store
and releasing its kernel lease. If a returned result cannot yet be retained,
the close operation remains retryable with those same bytes held in memory.

Copy the entire private state directory, its configuration, selected
fulfillment files and complete application source. Keep secret configuration
in the destination service's existing secret system. Start only one service
owner for a given state directory.

The store reclassifies a previous owner's unfinished handler attempt only
after acquiring the original kernel lease. Completed results are checked and
reused. Retained handler returns resume through the maintained SF31 writer.

Use RECEIVING.md for the complete local commissioning and customer receiving
procedure. Keep its actual native report with the corresponding source
edition and customer delivery.

## Source authority

The provider contract follows the original x402api agent-wallet merchant
integration guide and the live hosted API documentation:

- https://github.com/x402api-com/x402api-agent-wallet/tree/efcfda52a7f40df2732d713b50b501915af0f59e
- https://x402api.com/docs/payments/x402/programmatic-charges
- https://x402api.com/docs/payments/x402/resources
- https://x402api.com/docs/payments/x402/webhooks
- https://x402api.com/docs/payments/x402/receipts
- https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- https://nodejs.org/download/release/latest-v24.x/docs/api/http.html

protocol.mjs attributes the retained canonical JSON implementation to its
original wallet source. The original SF31 writer, SF88 reader and runtime
lease remain in their existing repository paths.

## Complete portable merchant

Use the same CLI to export the whole business workspace, inspect every retained file, open its offline invoice viewer, or restore a fresh working directory. [The complete handover guide](./PORTABLE.md) covers the original database, all fulfillment editions, local file relocation and the full original five-invoice receiving programme. The restored configuration can also be reviewed and opened through the maintained **Applications → Merchant invoices** workflow described in [Install and operate](./OPERATING.md).

## Read-only incident and customer Support workflow

The original running owner exposes authenticated GET /api/observation. Review it with support-watch review-x402, register the exact returned merchant identity, and use the existing Incident desk to retain an issue and prepare a customer Support case. Original receipt verification, unresolved payment age and fulfillment outcomes remain separate. The monitor reads complete bounded operational metadata and performs no payment or fulfillment.

See [Merchant payment and delivery support](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/X402_MERCHANT_SUPPORT.md) for the complete source registration, paged order review, before/after case, frozen HTML handover and fresh receiving workflow.
