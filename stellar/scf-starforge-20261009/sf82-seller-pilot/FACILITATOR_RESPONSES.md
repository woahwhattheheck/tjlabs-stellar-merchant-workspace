# Receive and use complete facilitator capability documents

A retained seller can review and stage a provider from a complete public
/supported response received by another host or retrieval tool. This closes the
gap between a working public source reader and an operator whose direct provider
read times out. The same installed x402 SDK interprets the response and builds
the original service's native payment requirements.

The document carries the original response bytes, endpoint, retrieval window,
content type and hashes. Publisher keeps that complete document inside its
ordinary durable review. Its existing source digest, provider declaration,
selection generation, native payment alternatives and stage/reopen lifecycle
continue to identify the change.

## The complete path

1. Retrieve the provider's complete public JSON body with an available authorized
   public source reader. Retain the full file and the actual retrieval times.
2. Use facilitator-response capture to produce its portable received document.
3. Choose the already configured provider and original retained source release.
4. Import the document in Publisher, through its CLI, or through the merchant
   MCP payload. Review it with the installed SDK.
5. Inspect every native payment alternative and stage the retained review.
6. Reopen the review, download its exact raw response or complete review, and use
   the existing release controls when selecting and starting the seller.

A received document describes that particular public observation. Its timestamps
stay visible when the document is reused. A new public observation produces
another document identity and another review. The supplied retrieval attribution
is recorded as metadata; the document hash establishes byte identity.

## Capture the full public response

Use the actual body file returned by your source reader. Record when that
retrieval started and completed in UTC. This example uses the public Vellar
endpoint; substitute the observed times and body path from your own retrieval.

~~~sh
starforge facilitator-response capture \
  --url https://vellar-facilitator-testnet-production.up.railway.app/supported \
  --body /srv/starforge/intake/vellar-supported.json \
  --started-at 2026-10-12T20:26:57Z \
  --completed-at 2026-10-12T20:27:17Z \
  --source "Public source reader, full response download" \
  --content-type application/json \
  --out /srv/starforge/intake/vellar-response.json
~~~

The source checkout command is:

~~~sh
node stellar/scf-starforge-20261009/sf82-seller-pilot/facilitator-supported.mjs \
  capture --url https://periplo-testnet.fly.dev/supported \
  --body /srv/starforge/intake/periplo-supported.json \
  --started-at 2026-10-12T20:27:20Z \
  --completed-at 2026-10-12T20:27:29Z \
  --source "Public source reader, full response download" \
  --out /srv/starforge/intake/periplo-response.json
~~~

The command writes a private create-only JSON document. Repeating the same
capture into the same filename returns its existing byte identity. A different
document uses another filename. The original body can be between 1 byte and
256 KiB; the complete portable document is limited to 384 KiB.

The schema is stellar-forge.facilitator-supported-response.v1:

| Field | Stored value |
| --- | --- |
| id | SHA-256 of the recursively ordered complete document content, excluding id |
| url | Canonical complete /supported URL |
| retrieved.startedAt | Original UTC retrieval start |
| retrieved.completedAt | Original UTC retrieval completion |
| retrieved.source | Source reader or transport attribution |
| body.encoding | base64 |
| body.bytes | Exact original response byte count |
| body.sha256 | SHA-256 of those original bytes |
| body.contentType | Original JSON media type |
| body.data | Complete original body encoded as base64 |

URLs are credential-free HTTPS, or explicit 127.0.0.1 HTTP for a declared local
facilitator. A received URL must exactly match the selected host profile's
endpoint plus /supported. Query strings, fragments and embedded credentials are
rejected. The document preserves source fields exactly and validates its byte
count, canonical base64, body hash and complete content hash on each use.

## Inspect with the original installed SDK

~~~sh
starforge facilitator-response inspect \
  /srv/starforge/intake/vellar-response.json
~~~

The result contains the received document identity and the original SDK's
normalized supported value. These are different representations. The raw body
keeps whitespace, unknown fields and all original bytes. The SDK applies its own
JSON parser, schema, defaults and field selection.

For example, the complete Vellar public document received on 2026-10-12 includes
catalogAssets. The installed x402 2.28.0 supported schema normalizes kinds,
extensions and signers; its normalized result omits catalogAssets. Publisher
retains both the complete original document and that actual normalized value.
A pubnet asset appearing only in catalogAssets does not become a matching
native payment kind.

Parsing runs in a dedicated Node worker. Its local fetch accepts exactly one
bodyless GET for the document's exact /supported URL and returns those received
bytes to the unmodified HTTPFacilitatorClient. It has no network fallback. The
host's fetch implementation remains unchanged. The local Response status used
to feed the SDK parser is not an assertion about an upstream HTTP status that a
separate source reader did not report.

The worker closes after parsing, cancellation, an error or its 30-second limit.
Native review then supplies that completed SDK value to the original seller
factory and native requirements builder. The receiving path constructs
requirements without executing a merchant handler, signer, verify or settlement.

## Publisher browser

Open the original Socrata workspace with the existing host profiles:

~~~sh
starforge socrata workspace \
  --directory /srv/starforge/hpd \
  --facilitators /srv/starforge/config/facilitators.json
~~~

Open Publisher, then Releases. In Facilitator providers:

1. Select the host provider and retained source release.
2. Enter the proposed release ID and label.
3. Change Capability source to Use received public document.
4. Choose the complete response document file.
5. Inspect the original endpoint, retrieval window, body size and body SHA-256.
6. Choose Review received document.

The server verifies the complete capture and provider binding, then runs the
installed SDK. The native review table shows every ordered route/payment
alternative with its amount, asset, recipient, network and full native fields.
Its native supported hash identifies the SDK-normalized value. The separate
received-document section identifies the exact original bytes.

Stage reviewed release uses the displayed retained review ID. Changing the
provider, source release, proposed ID, label or received document requires a
matching new review. The current host declaration, source digest and selection
generation are checked again during staging.

Download complete review returns every review field and the full captured
document. Download received response returns the original body bytes with their
original JSON content type. The on-screen detail shows the document identity
without expanding its base64 body. History records whether each review used a
provider read or a received document and can reopen either form.

Read provider now remains available for a direct current read. A retained timeout
or incompatible review remains in the same history when a subsequent document
review succeeds.

## Publisher CLI

The existing Publisher CLI can read the complete document from its own file.
Put the provider and original release selection in review.json:

~~~json
{
  "provider": "periplo",
  "releaseId": "hpd-original",
  "id": "hpd-periplo-1",
  "label": "Original HPD service with Periplo"
}
~~~

Then invoke the maintained command:

~~~sh
starforge socrata-publisher \
  --dir /srv/starforge/hpd/publisher \
  publisher.facilitators.review \
  --facilitators /srv/starforge/config/facilitators.json \
  --input /srv/starforge/operations/review.json \
  --supported-response /srv/starforge/intake/periplo-response.json
~~~

The --supported-response flag is specific to publisher.facilitators.review.
It loads and validates the full document independently of the small selection
file. Supply the document in this file flag or in payload.response once.

Save the returned review ID and use the ordinary stage action:

~~~json
{"reviewId":"RETAINED_64_CHARACTER_REVIEW_ID"}
~~~

~~~sh
starforge socrata-publisher \
  --dir /srv/starforge/hpd/publisher \
  publisher.facilitators.stage \
  --facilitators /srv/starforge/config/facilitators.json \
  --input /srv/starforge/operations/stage.json
~~~

The source Socrata action dispatcher also accepts response inside the ordinary
review payload. Its original JSON input size limit still applies; use the
Publisher file flag or browser for a larger received document.

## JavaScript and merchant MCP

The installed export is:

~~~js
import {
  createSupportedResponse,
  readSupportedResponse,
  writeSupportedResponse,
  supportedResponseBytes,
  supportedResponseSummary,
  parseSupportedResponse
} from '@tokenjunkielabs/starforge-merchant/seller/facilitator-response';
~~~

readSupportedResponse and writeSupportedResponse validate the complete
document. createSupportedResponse accepts a complete UTF-8 body string or
Uint8Array with the source URL and retrieval fields. parseSupportedResponse
accepts an optional expectedUrl and AbortSignal.

For the existing merchant_socrata_publisher tool, use:

~~~json
{
  "workspace": "queens_housing",
  "action": "publisher.facilitators.review",
  "payload": {
    "provider": "periplo",
    "releaseId": "hpd-original",
    "id": "hpd-periplo-1",
    "response": {
      "...": "the complete received document object"
    }
  }
}
~~~

Replace response with the actual complete document. The merchant host still
declares provider aliases through facilitatorConnection. The received endpoint
must match the chosen declaration.

The existing merchant_socrata_file transport accepts kind facilitator-response
and the retained review ID to download the original raw body. Use
facilitator-review to receive the complete review including the document.
Continue the established readId, expectedSha256 and nextOffset sequence to EOF.
Both forms use the same authenticated Publisher export and complete byte
identity rules.

## Stage and resume the original service

For a new staged release, SF82 reinterprets the same received document with the
installed SDK and compares the current retained source, source digest, selection
generation, native supported hash and complete ordered payment requirements.
The source configuration and response remain separate parts of that binding.

An already committed release can reconcile through its original review ID
without repeating a provider read. Another review's proposed release ID,
changed source or changed host provider retains the original conflict behavior.
Capture and review files are create-only; interrupted publication can leave a
private predecessor while the next operation preserves the final existing
identity.

Staging retains a release. The existing release activation, rollback and seller
process controls still own the selected and running release. Starting a staged
seller performs the original live native initialization and requirements check.
The received review remains a useful retained source even when the live provider
has subsequently changed.

For two providers, use one original service release and a separate received
document and proposed release ID per host profile. Inspect all native
alternatives, stage each compatible change, and select the intended release
through the existing generation-aware control. The service route, source
edition, query contract and completed customer acquisitions remain in their
original stores.

See the [Publisher operating guide](../sf30-seller-sdk/socrata/FACILITATORS.md)
for the complete source, merchant operator and release lifecycle, and
[SF82 facilitator controls](FACILITATORS.md) for the original native contract.
