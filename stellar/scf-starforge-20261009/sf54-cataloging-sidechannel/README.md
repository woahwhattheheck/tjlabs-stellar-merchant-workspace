# Bazaar settlement extension transport

This module reports the result of original SF25 Bazaar metadata validation to
the resource server through the x402 v2 `EXTENSION-RESPONSES` header. The header
contains base64-encoded JSON keyed by extension.

The [native catalog operating guide](../native-facilitator/CATALOG.md) describes
the complete SDK settlement, trusted merchant configuration, durable catalog,
discovery and gateway composition included in this workspace.

## Existing catalog validation and storage

`BazaarSettlementSidechannel` invokes `PaymentAutoCatalog`. That original
adapter checks the metadata schema, accepted terms, trusted settlement facts,
merchant authority and source provenance. The default synchronous catalog uses
the original atomic integration, catalog trust and lifecycle projections.

The native facilitator uses `processSettledAsync()` with the original SF60
journal. It waits for the durable commit before encoding the extension outcome.
Both processing methods share the same sibling-extension preflight.

| Catalog outcome | Bazaar header entry |
| --- | --- |
| Accepted catalog operation | `{"status":"success"}` |
| Exact replay of an accepted catalog operation | `{"status":"success"}` |
| Rejected metadata or catalog operation | `{"status":"rejected","rejectedReason":"STABLE_REASON"}` |
| Bazaar extension absent | No Bazaar entry |

Sibling extension outcomes come from the trusted facilitator. The adapter
snapshots and validates those fields before catalog ingestion and reserves
enough space for the longest sanitized Bazaar rejection reason. This prevents a
catalog commit from being followed by an avoidable header-serialization failure.

## Trusted in-process use

```js
import { BazaarSettlementSidechannel } from
  './stellar/scf-starforge-20261009/sf54-cataloging-sidechannel/sidechannel.mjs';

const adapter = new BazaarSettlementSidechannel({ catalog: originalCatalog });
const outcome = await adapter.processSettledAsync({
  paymentPayload: originalVerifiedPayload,
  settlement: originalSuccessfulSettlementFacts,
  sequence: originalSellerSequence,
  otherExtensionResponses: trustedExtensionOutcomes,
});
if (outcome.headerValue) {
  facilitatorResponse.setHeader(outcome.headerName, outcome.headerValue);
}
```

Use `processSettled()` for the original synchronous catalog contract.
`list()`, `search()`, `size` and `version` retain the underlying catalog's
interfaces. The adapter consumes trusted facilitator facts after settlement;
the native HTTP integration obtains those facts from the actual SDK result.

## HTTP transport

The header is for the facilitator-to-resource-server connection. Resource
servers consume its outcome internally and keep their buyer response under the
existing x402 payment-response contract.

`header.mjs` provides a dependency-free
`validatedExtensionResponsesHeader(value)` helper. It accepts canonical
base64 containing UTF-8 JSON with extension keys and a decoded size at most
16,384 bytes. SF58 uses it to preserve the trusted backend's original header.
A malformed optional header is dropped while the gateway returns the original
payment response bytes and status.

Source protocol: [x402 Foundation Bazaar settlement response sidechannel](https://github.com/x402-foundation/x402/blob/main/specs/extensions/bazaar.md#verify-and-settlement-response-sidechannel).
