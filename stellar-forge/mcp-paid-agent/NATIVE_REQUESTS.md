# Native catalog requests and complete saved results

The native request workflow connects Bazaar browse/search to the original SF88
durable buyer inbox. Select an HTTP offer from any acquired catalog page, supply
the actual query and body, save a stable intent, review its original offer, run the
configured operator, and open the complete saved response. The operator console
and installed client use the same running MCP endpoint and original request IDs.

## Start with the configured workspace

Set up and serve the original native operator using [NATIVE_WORKSPACE.md](NATIVE_WORKSPACE.md).
The tool is **sf43_discover_review_and_pay**. Its new **request-workspace** action
reports the configured merchant origin, pathname, HTTP method, Content-Type,
payment network, scheme, asset, recipient and current maximum atomic amount.

The workspace also reports actual request, source-page, preparation and response
limits. Its response limit comes from the operator's original manifest. The
default saved-response limit is 64 MiB; an operator can configure another positive
safe-integer limit when initializing the native workspace.

A native workspace selects one route and one payment binding. Catalog search can
cover other resources, but native preparation requires this configured route and
a matching offered payment option. The existing standalone quote workflow remains
available on a broker workspace.

## Find an offer across the complete catalog

Use **bazaar_resources** for browsing or **bazaar_search** for text search.
The [discovery workflow](DISCOVERY.md) retains the complete provider pagination
object, source request, row coverage, partial-result flag and next tool arguments.
Follow the returned cursor or offset without changing filters.

The native broker privately retains the complete original provider page for each
current handle, together with its row and original payment-option indexes.
Selecting an offer from a later search or browse page therefore uses that exact
page. Native preparation does not run another first-page search to rediscover it.

Call **bazaar_describe** for the selected handle. The description includes the
original request schema, eligible payment options and page byte count/digest.
Use its query field descriptions and encoding rules to enter explicit values.
Payment indexes presented with a handle refer to its eligible **accepts** array;
the broker maps that selected index to the original upstream listing before
calling the maintained SF88 preparation module.

The broker's handles retain their existing expiry and capacity behavior. It also
limits retained complete page buffers to 16 MiB. If a handle has expired or its
original page is unavailable, discover and inspect the offer again. An already
saved native intent remains independent of that temporary handle.

## Prepare the original request

Send these tool arguments after selecting an actual handle:

~~~json
{
  "action": "request-prepare",
  "intentId": "weather-lagos-20261012-001",
  "handle": "HANDLE_RETURNED_BY_THIS_ENDPOINT",
  "acceptIndex": 0,
  "maxAtomic": "1000",
  "input": {
    "query": {
      "city": "Lagos"
    }
  }
}
~~~

The caller chooses a stable intent ID containing 1–128 letters, digits, periods,
underscores, colons or hyphens. Keep the same ID for every subsequent operation on
that request. The example values must be replaced with the selected offer's actual
inputs and original asset amount.

Queries accept explicit strings or arrays of strings. The advertised HTTP
serialization rules apply, including the existing form/explode codec. Fixed
values on the advertised URL remain unchanged. Required fields must appear in
the completed request URL.

For the configured POST, PUT, PATCH or DELETE route, **input.body** carries the
exact UTF-8 text. An empty body string is distinct from omitting a body. The
configured Content-Type comes from the original operator workspace. Body bytes
and their digest are retained with the original request.

Preparation validates the configured route and payment binding, preserves the
original page and chosen offer, calls the existing **prepareReview**, writes the
private request snapshot, and enqueues it through the original SF88 inbox.
The native signer, spending ledger and approval terminal are the original
workspace components.

The response includes:

| Field | Meaning |
| --- | --- |
| intentId, state, createdAt | Identity and current state in the original durable inbox |
| request | Complete URL, method, payment expectations, body size and digest |
| preparation.source | Original discovery source and request |
| preparation.pageSha256 | Digest of the retained complete provider page |
| preparation.rowIndex | Original provider page row |
| preparation.acceptIndex | Original listing's payment-option index |
| preparation.originalListing | Complete selected original listing |
| preparation.accepted | Selected original payment terms |
| preparation.body | Retained text, bytes, SHA-256 and Content-Type, or null |
| availableActions | Actions currently available for this intent |

Use the reported limits when entering data. The MCP HTTP handler accepts 128 KiB
for the entire encoded JSON request, including escaping and protocol envelope.
The original explicit-body limit is 1 MiB. The source-page and prepared-config
limits are separately reported: a smaller discovery page size can be needed for
large catalog rows.

## Review, execute and reopen

Use **request-review** with the stable intent ID to reopen the retained page,
offer, exact body and current actions. Review works after reconnect or restart.

~~~json
{"action":"request-review","intentId":"weather-lagos-20261012-001"}
~~~

Use the original **execute** action to invoke the existing operator:

~~~json
{"action":"execute","intentId":"weather-lagos-20261012-001"}
~~~

The original queue process runs its normal host-terminal approval, spend
reservation and native signer. The request desk's execution button invokes that
process. It does not carry an approval or wallet-secret field.

The result keeps the inbox state separate from **originalBuyer** and
**originalRecovery**. Those fields retain the original checkout and recovery
records. The **execution** field, when present, contains the original child's exit
status or **OPERATOR_BUSY**.

If a connection is interrupted during a write, retain the intent ID and reopen
its status/review before deciding what to do. A recorded original attempt remains
the same attempt. The SDK attaches that intent and a status-call hint to mutation
errors while preserving the provider's code, details and recovery fields.

| Action | Arguments | Behavior |
| --- | --- | --- |
| request-workspace | None | Read current route, payment binding and configured limits |
| request-prepare | intentId, handle, maxAtomic, input; optional acceptIndex | Save the selected exact catalog request |
| request-review | intentId | Reopen the original saved preparation and available actions |
| execute | intentId | Invoke the original operator's approval and execution |
| status | intentId | Read original inbox state and outcome |
| history | Optional limit, cursor | Page through original saved requests |
| cancel | intentId | Cancel an unattempted intent or request interruption of an active child |
| recover | intentId | Run the original evidence-based recovery for that attempt |
| read | intentId; optional byteOffset, maxBytes | Read the original saved response file |

History accepts 1–100 records per page and returns its original cursor.
The SDK history iterator preserves that cursor and detects cycles. History is a
live inbox view, so totals can change as other requests are added.

## Open the complete saved result

Each **read** result identifies the same intent, original total bytes, SHA-256,
content type, requested byte offset, returned bytes and next offset. Ranges are
at most 65,536 bytes. The original reader checks the saved file's size, identity
and complete digest, and retains its original metadata checks across range reads.

The console follows every range, checks the completed SHA-256, and presents
structured JSON, exact UTF-8 text or file metadata. Downloads use the complete
verified bytes. Original large JSON numbers remain available in the response
text when JavaScript cannot represent them exactly.

The installed client offers:

- **read** for a selected verified range.
- **resultChunks** for a complete ordered stream with fixed file identity and an
  incremental digest. The complete digest is checked before yielding its final
  chunk.
- **downloadResult** for a complete local file. It writes a mode 0600 temporary
  file, verifies all original bytes and the complete digest, then publishes to a
  new absolute destination without replacing an existing file.

The default client download ceiling is the actual workspace response limit.
A caller can set **maxResultBytes** to its chosen local limit. File download uses
bounded memory. A browser's complete response view also depends on available
browser memory; the installed streaming client can write larger configured files.

All result reads use the existing saved response. They do not repeat the merchant
request.

## Installed TypeScript and JavaScript client

The installed export is **@tokenjunkielabs/starforge-merchant/buyer/mcp/native-requests**.
Its declarations describe the full discovery, preparation, inbox, recovery and
saved-result contracts.

~~~js
import { openNativeRequestClient } from
  '@tokenjunkielabs/starforge-merchant/buyer/mcp/native-requests';

const buyer = await openNativeRequestClient({
  url: 'http://127.0.0.1:3210/mcp',
  tokenEnv: 'MCP_ACCESS_TOKEN',
});

try {
  const workspace = await buyer.workspace();
  for await (const page of buyer.discovery.searchPages({
    query: 'weather',
    type: 'http',
    scheme: workspace.payment.scheme,
    network: workspace.payment.network,
    asset: workspace.payment.asset,
    payTo: workspace.payment.payTo,
    maxAmount: workspace.payment.maxAtomic,
    limit: 25,
  })) {
    console.log(JSON.stringify(page));
  }
} finally {
  await buyer.close();
}
~~~

After selecting and describing an actual current handle, use the same endpoint
to retain a request:

~~~js
const description = await buyer.discovery.describe(selectedHandle);
const prepared = await buyer.prepare({
  intentId: 'weather-lagos-20261012-001',
  handle: description.handle,
  acceptIndex: selectedPaymentIndex,
  maxAtomic: '1000',
  input: { query: { city: 'Lagos' } },
});
console.log(JSON.stringify(prepared));
~~~

The operator's explicit execution and result sequence is:

~~~js
const intentId = 'weather-lagos-20261012-001';
const review = await buyer.review(intentId);
console.log(JSON.stringify(review));

const executed = await buyer.execute(intentId);
console.log(JSON.stringify(executed));

const current = await buyer.review(intentId);
if (current.availableActions.includes('read')) {
  const saved = await buyer.downloadResult({
    intentId,
    destination: '/private/commerce/results/weather-lagos.json',
  });
  console.log(JSON.stringify(saved));
}
~~~

Run the latter snippets inside an open client lifetime. The destination's parent
directory must already exist. Both a fresh owned endpoint and an existing
authenticated **client: {endpoint, call}** are supported; discovery borrows the
same captured transport. Closing the native client aborts its own pending calls
and file downloads and waits for cleanup. A supplied transport stays with its
original owner.

Call options accept an AbortSignal and a 1–300,000 millisecond timeout. An
interrupted execution still uses the original durable intent. SDK methods never
retry a payment automatically.

## Operator console

Open the original authenticated console and inspect a discovered HTTP resource.
Its native form shows the configured route, original payment options, query
schema, explicit body mode and atomic ceiling. Saving records a durable intent
before execution. The **HTTP requests** view combines history, reopen, retained
source/body inspection, original execution/cancellation/recovery and complete
saved responses.

The console checks the current workspace's available actions and preserves
pending request IDs when responses are interrupted. Catalog discovery retains
the same complete cursor/offset workflow as the installed client.
