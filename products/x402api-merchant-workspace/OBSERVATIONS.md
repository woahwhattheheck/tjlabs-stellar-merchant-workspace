# Operational observations

The running merchant serves two authorized observation routes from its existing
SQLite owner. The Support workflow uses the complete original metadata capture.
Its optional summary polling reads the same original records and supplies the
same seven incident conditions with bounded order details.

| Route | Useful result |
| --- | --- |
| `GET /api/observation` | Complete order, history, provider exchange, webhook and fulfillment metadata for the original incident and customer Support capture. |
| `GET /api/observation/summary` | Complete operational counts and original age anchors, with up to 1,024 condition-bearing order details. |

Both routes use the merchant's existing operator bearer authorization, origin
checks and no-query policy. Use the existing loopback host and original token
environment variable. Summary polling is available only on the running original
owner; the saved-invoice review facade does not operate it.

## Configure the existing x402 registration

Keep the existing SF93 x402 registration and its fixed
`http://127.0.0.1:PORT/api/observation` endpoint. The optional
`polling: "summary"` selection lets the collector derive the summary
route. Registrations without that option retain their original complete-capture
behavior and identity.

The existing expected source fields remain the original `storeId`,
`tenantId`, `resourceVersionId` and
`configurationSha256`. The configuration hash is SHA-256 over the
original canonical validated configuration, exactly as the complete observation
uses. It is distinct from the exact configuration-file byte hash.

The summary's `binding` also carries the reviewed input fingerprint when
the original launch selected `--expect-inputs-sha256`. An optional expected
`inputsSha256` on the x402 registration can bind this exact reviewed source.
A configuration-file launch without that selected review reports a null input
fingerprint. A programmatic launch identifies itself explicitly.

The loader returns its original configuration file and reviewed inputs together
with this immutable observation binding. It does not reopen the application,
load another database, call the provider, or begin payment or fulfillment work.

## Preserve the seven existing conditions

| Existing condition | Original source used by summary polling |
| --- | --- |
| Source unavailable | Unusable, stale or changed source, incomplete continuity, or a failed observation. |
| Identity changed | Selected original store, tenant, resource version, canonical configuration or an explicitly required input fingerprint differs. |
| Payment unresolved | The original analyzer's current state/signature condition until a retained receipt verification exists. The first event of that current unresolved episode supplies its age. |
| Verified receipt output pending | The original retained receipt verification exists, but a complete returned and recorded fulfillment result does not. Its first original receipt-verification event supplies the age. |
| Fulfillment interrupted | The original fulfillment row is interrupted. |
| Result contradiction | A completed order lacks a complete recorded/returned result, or a complete result disagrees with its receipt verification, payment ID, byte count or digest. Completed orders remain in this check. |
| Authority rejected | The original allowed authority-error codes on the order, or rejected bound webhook records before receipt verification. |

A complete HTTP 200, a saved payment ID, or a finalized webhook does not replace
the original verified-receipt predicate. An incomplete 200 can leave the original
order in SETTLEMENT_CONFIRMED; it remains unresolved according to the maintained
analyzer until its receipt verification exists. The summary reports merchant
records and does not make a new independent ledger or output-byte verification.

The current episode starts when the original history's state/signature predicate
becomes active after being inactive. Pending-to-uncertain updates do not reset
that episode. Receipt verification ends it. A missing usable timestamp produces
an unknown age, not zero.

## Complete totals with bounded details

The summary schema is
`stellar-forge.x402api-merchant-observation-summary.v1`.
Its coverage is COMPLETE only after every original order and all required event
and exchange counts have been processed in one consistent read transaction.
Unknown or disagreeing original order/history metadata rejects the observation.

The count names match the existing full analyzer:

- orders, receiptVerified, unresolved, receiptOutputPending;
- recordedResultComplete, resultProjectionPending, fulfillmentInterrupted;
- contradictions, authorityRejected, authorityRejectionRecords;
- providerExchanges, incompleteProviderExchanges, pendingWebhooks.

The two age groups are `ages.unresolved` and
`ages.receiptOutputPending`. Each contains requests, unknown,
oldestPendingSeconds and oldestSince. With zero requests, the age is zero and its
timestamp is null. If every requested age is unknown, both oldest fields are
null. Otherwise oldestSince is the earliest usable original timestamp and
oldestPendingSeconds uses the snapshot time. The original analyzer's five-second
clock tolerance is retained.

Every count and age group covers all orders. The `orders` array contains
only condition-bearing details, selected in original createdAt/ID order, up to
1,024 rows and the response-byte budget. Each uses the existing analyzer row
fields plus its own original frozen tenant/resource source. The
`details` object reports matchingOrders, returnedOrders, omittedOrders and
limit. Missing detailed rows cannot clear a condition whose complete aggregate
remains positive or unknown.

Old orders can retain an earlier resource version than the current runtime.
Attribute each detailed row to its frozen `source`, and retain
storeId plus order ID as its protected identity. The response does not include
original bodies, signatures, credentials, raw receipt envelopes, provider
responses or filesystem paths.

## Continue the original history

Send the previously accepted original history sequence as the single header
`X-Merchant-History-Sequence`. It is optional; a present value must be a
positive safe decimal integer. Duplicate headers, other syntax and query
parameters are rejected through the original server's validation.

The same snapshot returns:

- `historyBoundary`: the latest original history sequence and SHA-256 of
  that row's exact data_json, or null for an empty history;
- `continuity`: the requested sequence and its exact sourceSha256, or a
  null digest if that original sequence no longer exists. Without the header,
  continuity is null.

Compare the returned proof with the previously captured boundary before treating
absence as recovery. A missing, mismatched or regressed boundary is an unavailable
observation, not recovery. The checksum is the exact same source hash retained
in the complete observation's history. It is not a substitute for an entire
history capture.

The snapshot starts when the original metadata SELECT establishes SQLite's
consistent view. capturedAt records that snapshot time; all reported ages use
it. startedAt records entry into the observation. snapshotSha256 is SHA-256 over
UTF-8 JSON.stringify of the complete response before adding snapshotSha256,
without a trailing newline.

The binding hash uses that same UTF-8 JSON encoding over these keys in order:
storeId, tenantId, resourceVersionId, configurationSha256, kind, inputsSha256,
configFileSha256. Null values remain present. bindingSha256 is added afterward.

## Keep the complete Support capture

The maintained collector can use summaries for repeated operational polling and
request the original complete observation when incident state changes, the
selected source changes, or a periodic complete-capture interval expires. A
later full fetch is evaluated as its own later snapshot; it must never be labeled
as the earlier summary.

If the full metadata exceeds its original 8 MiB/100,000-record workload limit,
retain the complete summary capture and disclose why the full capture is
unavailable. Keep existing conditions and their original recovery rules.
Summary captures retain complete aggregate evidence and bounded details; the
original full capture retains its complete history for customer Support
comparison and export.

The summary reuses the original per-order sequence index and streams only state,
signature and receipt metadata required for the active episodes. It counts
events and provider exchanges without exporting their original payloads. It
does not create a second watcher, queue, MerchantStore, table or writer.

## Receive the complete application

The original complete project/source writer includes observation.mjs,
observation-summary.mjs and this guide alongside the unchanged store and
original application. Its existing source digest, private receiving,
installation and editable project handover remain the receiving contract.
