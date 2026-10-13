# Observe the original merchant workspace

The running merchant exposes a protected operational snapshot at `GET /api/observations`.
SF93 can retain this exact snapshot, track each original order, and carry an aged
payment or delivery condition into its existing incident workflow. The endpoint
reads the merchant application's existing SQLite store in one synchronous read
transaction. It does not open another store or call the provider or fulfillment
handler.

## Select the original running application

Use the existing merchant configuration, private directory and operator token.
When starting through the maintained `server.mjs serve` command, retain the
original reviewed `--expect-inputs-sha256` and `--input-files` selection. The
existing input reviewer verifies the complete configured input family before
the handler is loaded. The observation carries that exact `inputsSha256`,
the SHA-256 of the complete configuration-file bytes, and the original store UUID.

A server started without a reviewed input fingerprint continues to operate. Its
snapshot explicitly reports `configuration-file` and an unreviewed input binding.
Direct programmatic construction uses `programmatic-config` and the SHA-256 of
the original canonical configuration JSON. Neither substitutes a configuration
digest for the complete reviewed input family.

Read the endpoint with the same bearer token used by the operator API. The
existing origin checks, duplicate-header checks, no-query rule, response
`no-store` policy and shutdown draining remain in force. The endpoint accepts
GET at its exact path; it has no write or payment action.

For example, from the operator's private environment:

```sh
umask 077
curl --fail --silent --show-error \
  --header "Authorization: Bearer $MERCHANT_OPERATOR_TOKEN" \
  http://127.0.0.1:8764/api/observations \
  --output merchant-observations.json
```

Keep the resulting JSON with the protected operational capture. It contains
original order identifiers. Public metrics should use aggregate counts and
condition kinds; the original order references belong in the protected capture
and incident case.

## Binding and snapshot identity

The response schema is `merchant-workspace.observations.v1`. Its top-level
`capturedAt` is the merchant clock's UTC ISO timestamp for this read. The
collector's receive time is separate.

`source` contains these exact fields:

| Field | Meaning |
| --- | --- |
| `storeId` | UUID retained in the original merchant metadata across reopen |
| `tenantId` | Selected configured tenant |
| `resourceVersionId` | Selected configured resource version |
| `configSha256` | Complete raw configuration-file digest, or canonical programmatic-config digest as identified by `kind` |
| `inputsSha256` | Original verified input-family digest; null when no reviewed selection was supplied |
| `kind` | `reviewed-file-inputs`, `configuration-file`, or `programmatic-config` |
| `bindingSha256` | Digest over the six fields above |

To reproduce `bindingSha256`, SHA-256 the UTF-8 bytes of JavaScript
`JSON.stringify({storeId,tenantId,resourceVersionId,configSha256,inputsSha256,kind})`
with those keys in that order, nulls retained, and no trailing newline.
The snapshot exposes hashes and selected UUIDs; it does not expose the private
configuration path, credentials, webhook secrets or source-file paths.

`snapshot.historySequence` is the original merchant history high-water mark
read in the same transaction as the orders and counts.
`snapshot.revision` is `storeId + ":" + historySequence`.
A restart preserves the store identity and history. A lower sequence for the
same store requires review by the collector; a different store must not silently
replace the selected source. Multiple reads may legitimately share a sequence
and have different capture times.

The high-water mark covers the original order history. Standalone signed test
webhooks and runtime lease metadata are outside this endpoint's order scope.

## Counts, order rows and completeness

The snapshot counts all original orders and each known state:

`CREATED`, `CHARGE_UNCERTAIN`, `CHARGE_REJECTED`, `AWAITING_PAYMENT`,
`PAYMENT_PENDING`, `PAYMENT_UNCERTAIN`, `PAYMENT_FAILED`,
`SETTLEMENT_CONFIRMED`, `FULFILLMENT_PENDING`,
`FULFILLMENT_INTERRUPTED`, and `COMPLETE`.

`counts` carries `totalOrders`, `activeOrders`, `returnedOrders`,
`omittedOrders`, `unknownStateOrders`, and `states`.
Known-state counts and the unknown-state total are complete even when order rows
are truncated. `orders` includes all nonterminal orders, ordered by original
creation time and ID, up to 1,024 rows. The terminal states are `COMPLETE`,
`PAYMENT_FAILED`, and `CHARGE_REJECTED`.

Each row contains its exact `orderId`, `state`, original `source`, `createdAt`,
`updatedAt`, original latest `historySequence`, `charge`, `payment`,
`settlement`, `fulfillment`, `delivery`, and `coverage`.
The row's `source.tenantId` and `source.resourceVersionId` are read from that
order's original frozen terms. Top-level `source` identifies the currently
selected runtime configuration. A store can retain active orders from older
configurations; those original rows remain included. Use `storeId + orderId`
for incident identity, and the row's source when describing its tenant or
resource version. Missing or malformed original UUIDs make the row unknown.

It omits title, customer reference, amount, wallet details, signatures, provider
headers or bodies, webhook bodies and returned file contents.

Top-level `coverage` explicitly describes the read:

| Field | Values |
| --- | --- |
| `status` | `complete` or `partial` |
| `stateCounts` | `complete` |
| `activeOrders` | `complete` or `truncated` |
| `transitionTimes` | `complete` or `incomplete` |
| `inputBinding` | `reviewed` or `unreviewed` |
| `reasons` | Any of `active-orders-truncated`, `unknown-order-state`, `required-transition-unavailable`, `inputs-not-reviewed` |

Per-order `coverage` is exactly `complete` or `unknown`. An unknown original
state, unavailable original source binding, an unavailable required transition time, or unconfirmed delivery
evidence makes that row unknown. An invalid or future transition timestamp is
reported as null; the original sequence remains available for investigation.

A partial snapshot can supply positive observations for the rows it actually
contains. An absent row in partial coverage must not close an existing incident.
A missing timestamp must not become age zero or the collector's current time.
The collector must match the selected source, enforce freshness and reject a
regressed history sequence before interpreting either positive or absent rows.

## Original condition ages

`charge` and `payment` each contain `active`, `firstRelevantAt`, and
`historySequence`.

The charge family contains `CHARGE_UNCERTAIN`. The payment family contains
`PAYMENT_PENDING` and `PAYMENT_UNCERTAIN`. For an active family, the endpoint
finds its first original state transition after the most recent departure from
that entire family. Retries, reconciliation schedules and transitions between
pending and uncertain payment preserve the same first time and sequence.
Leaving and later re-entering a family creates a new episode. This remains true
after reopening the application because the original history is durable.

An order merely awaiting a buyer's authorization has no active payment episode.
Inactive families carry null time and sequence. `updatedAt` is available for
inspection and must not be used as the incident age origin.

## Settlement and unfinished delivery

The endpoint describes the payment evidence already retained by the original
merchant application. It does not perform an independent network settlement
verification. The payment authority remains x402api.

`settlement` contains `observed`, `firstRelevantAt`,
`historySequence`, and `basis`. The first original qualifying history record
selects the anchor and one of these bases:

| Basis | Original retained event |
| --- | --- |
| `payment-response-200` | Original complete terminal HTTP 200 response with its validated, matching payment identity |
| `bound-finalized-webhook` | Signed finalized event after original tenant, order, resource, payment and frozen-rail binding checks |
| `verified-receipt` | Original receipt verification completed |
| `verified-fulfillment-claim` | Original paid fulfillment claim following receipt verification |

An incomplete HTTP 200, or a complete return without its original validated
payment identity, remains unconfirmed even when the original application state
is already `SETTLEMENT_CONFIRMED`. The observation preserves that state and
reports unknown delivery coverage. A payment HTTP 409 alone does not establish
settlement.
`FULFILLMENT_PENDING` alone also does not establish it: that state is used by
conflict and rejected-event reconciliation.

`delivery` contains `active`, `status`, `firstRelevantAt`, and
`historySequence`. For a nonterminal order with settlement evidence, status is
`pending`, active is true, and the delivery age starts at that same original
settlement anchor. Handler retries and result-file publication do not reset it.
A delivery-related state without qualifying evidence is `unconfirmed`; an
order outside delivery is `not_applicable`.

`fulfillment` is null when no original fulfillment exists. Otherwise it carries
only the original state, attempt count, and original claim time. Its states are
`CLAIMED`, `RUNNING`, `INTERRUPTED`, `RETURNED`, and `COMPLETE`.
A completed handler job can briefly coexist with a nonterminal order while the
original result publication finishes; the order remains in the snapshot until
the original application records its terminal completion.

## Join the retained SF93 workflow

Register the reviewed source with its exact store, tenant, resource version,
configuration and input-family digests. Set charge, payment and delivery age
thresholds for the original operation. SF93's merchant-workspace collector
retains the complete response and checks the binding, freshness, sequence and
coverage before advancing per-order condition episodes.

Keep independent network or delivery-provider checks in their own explicit
coverage. The protected merchant observation complements those checks and the
existing SF74 incident/support case; it does not replace their source or
verification authority.
