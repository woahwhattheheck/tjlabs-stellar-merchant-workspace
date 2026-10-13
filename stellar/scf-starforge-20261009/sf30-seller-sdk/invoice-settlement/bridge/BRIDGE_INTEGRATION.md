# Bridge provider acquisition for the original Bloccpay application

## Scope and current integration state

This contribution implements the current Bridge provider contract at the original application's acquisition boundary. It preserves full provider objects, validates endpoint and customer identity, classifies transfer and virtual-account observations, and walks complete provider history without moving a durable cursor ahead of retained source.

The implementation consists of `bridge-provider.mjs` and `bridge-webhook.mjs`, their complete TypeScript declarations, and `BRIDGE_PROVIDER_CONTRACT.json`. It does not introduce a database, scheduler, HTTP server, credential service, bank account, transaction signer or second customer ledger. The existing Bloccpay application continues to own those resources. Current source status is **ready for original-owner integration**, not a claim of a deployed webhook or completed customer settlement.

The commercial owner is 6BBB. The existing Horizon and invoice reconciliation source is owned by 6BA15. The complementary SDP recipient/batch/disbursement arm belongs to 8F43 root. This Bridge arm is 8F43 scout. The original source and application boundary request is in Sales parent `C0BTTA66TK3/1791867893.470099`, accepted joint TAKE `1791868940.412319`, followed by source request `1791869246.749249`. Do not create another customer operation or sender.

The original customer architecture acquisition is Zoho WorkDrive document `1ed7accebc449a6457b7e99a93fbe953d55c0daa5cd0221c8bf30db75c7e2c24`. Its actual backend, transaction API and approved provider bindings must be consumed before wiring production writes. This edition records that dependency explicitly.

## Complete source contracts

`describeTransfer(fullObject)` returns the full original object plus a derived observation. The observation retains original provider state, customer ID, client reference, source and destination, separate top-level and receipt amounts, timestamps, findings and provisional/final destination hashes. `payment_processed` is provider-delivered; this is not an instruction to credit the customer ledger. All observations return `ledgerAction: 'NONE'`.

`describeVirtualAccountActivity(fullObject)` keeps activity ID, customer ID, virtual-account ID and deposit ID distinct. Different activities for the same deposit remain separate immutable source records. Amount currency is the provider's explicit currency. The documented amount basis switches to destination currency only for `payment_submitted` and `payment_processed`. Source-currency subtotal/developer/exchange fees remain separate from destination-currency gas fees. A microdeposit or account lifecycle activity does not represent customer funding.

Unknown provider states and activity types remain explicit findings. The current overview still contains older `funding` and `drain` examples while the dedicated virtual-account pages describe `funds_received`, `payment_submitted` and `payment_processed`. This module does not silently treat those names as equivalent settlement authority.

`exactDecimal(text)` accepts a nonnegative decimal string with a bounded length and returns its unchanged text, a comparison-normalized representation, and a BigInt coefficient/scale. `compareDecimalText(a,b)` compares without floating-point conversion. Neither routine rounds, calculates an exchange rate, assumes a token peg, converts currency or changes the original request. Provider monetary values encoded as JSON numbers produce findings rather than an invented exact decimal.

The current Bridge precision page describes whole-cent processing, discarded fractional cents and upward fee rounding. That provider policy is a source observation; it does not authorize altering a retained Stellar amount. Reconciliation must compare the selected original amount and the actual receipt on their documented currency bases, preserving any difference for the original policy and operator.

## Raw webhook acquisition

The application's existing inbound HTTP owner must retain and pass the exact received bytes. Do not call `request.json()`, normalize whitespace or rebuild JSON before signature verification. Reject a duplicated signature header at the HTTP layer; `verifyBridgeDelivery` accepts exactly one string value.

Call `verifyBridgeDelivery` with:

- `rawBody`: the complete original Uint8Array body.
- `signatureHeader`: the original X-Webhook-Signature value.
- `publicKeyPem` and `endpointId`: the exact public key and ID returned for the selected original endpoint.
- `binding`: the existing developer ID, selected customer IDs and exact customer/virtual-account pairs.
- `receivedAtMs`: the receipt timestamp captured by the original HTTP owner.
- Optional explicit freshness and body bounds. Defaults are a ten-minute age window, sixty seconds of future skew and an eight-MiB application body limit.

Bridge's current signature scheme is endpoint-specific RSA. It is separate from SDP's webhook HMAC. The signed input is the timestamp, a dot and the original bytes. The documented scheme hashes that input first and then verifies that digest using RSA PKCS#1 v1.5 with SHA-256, producing the specified double-SHA-256 behavior. The implementation uses Node's maintained `node:crypto` functions and binds the key's complete SPKI SHA-256 in its result.

The verifier checks strict canonical base64, timestamp bounds, RSA key type, signature, complete UTF-8 and duplicate-free JSON before interpreting the event. JSON object keys such as `__proto__` are retained as ordinary own data properties. Unpaired surrogates, unsafe integers, excessive depth/nodes and trailing content fail explicitly. Monetary interpretation still requires decimal strings.

The event envelope must agree with its full object's ID and category. The selected developer, customer and virtual-account binding must match. Unsupported API versions or categories fail for explicit review. The full original body is retained in the successful result along with its SHA-256 and parsed object. The result is `VERIFIED_NOT_COMMITTED`; it must not be presented as accepted or settled.

### Commit and acknowledgement in the existing application

Use the application's original transaction boundary to retain the raw delivery, endpoint/key identity, signature, complete event and the existing business binding. Make the provider event ID unique in that original store. A redelivery of the same event must reopen that source record. Conflicting body bytes under one event ID must be retained as an incident, not overwrite accepted data.

Only the original transaction's durable success can authorize an HTTP200 response for a successfully acquired event. Bridge asks for prompt acknowledgements and retries failures for up to two days. Unknown but valid signed events can be durably quarantined according to the existing application's intake policy; there is no need to falsely classify them as settlements. Invalid signatures and freshness failures must not become customer entries. Retain the original request/error diagnostics through the existing private intake owner.

This module deliberately does not decide transaction atomicity, conflict responses, tenancy or acknowledgement status. Those must use the actual application contracts once acquired. In particular, the signature verifier returning successfully does not itself satisfy the durable acknowledgement condition.

## Complete history and interrupted acquisition

`inspectListPage` validates the full returned object and bounded `data` array. If present, `count` must equal the number of rows in that page. IDs must be unique within a page. A short nonempty page is not terminal; only an actual empty `data` page is completion evidence.

`acquireHistory` composes the existing HTTP and source-retention owners:

```js
const acquisition = await acquireHistory({
  readPage: originalProviderReader,
  retainPage: originalSourceWriter,
  initialCursor: selectedSavedCursor,
  limit: 100,
  signal: originalOperation.signal,
});
```

The example names represent callbacks supplied by the original application, not new APIs in this contribution. The TypeScript declarations give their full shapes. `readPage` must resolve only after its original HTTP body has drained or closed and must retain the full response/body identity for the source writer. `retainPage` must durably retain the complete response and return the existing application's receipt.

Each page is retained before the next cursor is selected. Signal checks occur before acquisition, after reading and after retention. A finite page bound, repeated row, repeated cursor, retention failure or cancellation stops that same acquisition. Already retained pages remain in the original store. The function does not advance a saved ingestion boundary or discard a partially acquired window.

The caller owns interruption/reentry. Freeze the original query and time window, then resume from the actual durable source receipt, retaining the query and last cursor together. Do not infer that an interrupted callback failed before retention; reread the original receipt before repeating its write. The optional `onPage` callback is awaited and its failure stops the course after retention; it must not be used as a second authoritative cursor publisher.

Transfer lists are ordered by creation time while old transfer objects can change. Use a selected updated-time window with `updated_after_ms` and `updated_before_ms`, preserve any overlap under the original deduplication policy, and acquire every page before advancing the committed update boundary. Periodically reconciling pending original transfer IDs remains necessary according to the application's approved schedule. The ten upcoming webhook events and recent webhook logs are not a complete historical source.

Virtual-account history uses the actual customer and virtual-account path. Bind both IDs to the original account registry. `deposit_id` and `deposit_ids` are alternative query forms; do not combine them. Older-direction `starting_after` and newer-direction `ending_before` are also mutually exclusive. This generic full older-direction reader intentionally does not guess those IDs or filters.

## Provider actions and uncertain results

This edition performs no POST, endpoint registration, activation, transfer creation, cancellation or refund. If the original application later uses its existing mutation transport, it must retain the exact original request and Idempotency-Key before dispatch. Bridge's documented POST retry contract is twenty-four hours; after that period the same key produces422. An uncertain result is not grounds for generating a fresh key and potentially moving funds twice.

The original application must reopen its request, provider ID, callback and full response. Provider search or a human decision can resolve uncertainty using that retained identity. A missing callback never establishes that an action failed, that funds were refunded or that a transfer can safely be replaced.

The original Bloccpay roadmap names NGN, KES and GHS off-ramp outcomes. The current published Bridge fiat-rail summary does not establish these specific routes. Country onboarding coverage is a different capability. Bind the selected account-approved rail, currency, destination and route evidence before exposing a route as available or making a delivery promise.

## Integration and receiving handover

The complete original SDK source and parent instructions must determine the final repository directory and exported entry points. Preserve the existing Horizon module `settlement-audit/horizon-native.mjs` (Git `c3628d5d4fff730091428a8cbe608637e0d5d671`) and invoice reconciliation module `invoice-settlement/reconciliation.mjs` (Git `8f50d92eb0200e7ba3f8489b3a571bc83665bea3`) when composing the integration. Their original runtime, account registry, source export and decimal conventions must remain authoritative.

Receiving should carry the complete selected source, full provider response/body records, source identities, binding/version, original request IDs, durable event conflicts and complete page receipts through the application's existing export/import. Keep credentials, session secrets and live endpoint mutation capability out of a source-only package. Customer financial payloads belong in the original private case, not a public source contribution.

The recipient should be able to reopen the same source and report the same observations without API access or new financial actions. An actual account binding or active endpoint must be adopted through the existing application protocol, not recreated from this report.

## Validation status

The full provider module and strict JSON parser have been evaluated in the available JavaScript engine. Focused checks cover decimal values above the JavaScript safe-integer range, provisional versus final transaction hashes, nonterminal short pages, malformed/duplicate JSON and original full-object retention. These are implementation checks, not a separate product.

Node RSA execution, the original customer integration, live provider acquisition and whole native receiving have not run in this edition. No production financial outcome is claimed. Complete source and current primary references are retained so those same original owners can finish the actual course once their source binding is supplied.
