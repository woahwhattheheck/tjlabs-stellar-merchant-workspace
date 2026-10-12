# Service renewals through the merchant operator

Operate saved service agreements from expiry planning through continuation,
quotation, customer response, activation and financial handover using the
support console's case directory and writer.

## Configure and select the tools

Use the existing support connection file's `casesDirectory` and private export
root from [SUPPORT.md](SUPPORT.md). The nine tools belong to the existing
`merchant-provider-support` contribution and appear when support is configured.

Every call uses the existing authenticated MCP transport. With OAuth, the host
checks its common `requiredScopes` plus the exact tool's `toolScopes` entry
before dispatch; per-tool scope names remain host configuration. Hosts that
separate read and write grants should include the new exact tool names in that
existing mapping. The catalog's read-only annotations describe behavior; they
do not grant access.

| Tool | Operation |
| --- | --- |
| `merchant_service_renewals_queue` | Page a dated portfolio, including archived cases and agreements awaiting their first proposal. |
| `merchant_service_renewals_read` | Open current or historical terms, renewals, eligible quotes and original responses. |
| `merchant_service_renewals_preview` | Review a continuation or quote attachment under current case and terms guards. |
| `merchant_service_renewals_propose` | Retain or revise that proposal through the original writer. |
| `merchant_service_renewals_decide` | Record acceptance, decline or closure. |
| `merchant_service_renewals_handover` | Return the complete validated handover object. |
| `merchant_service_renewals_handover_file` | Receive its revision-pinned JSON in complete, digest-pinned chunks. |
| `merchant_service_renewals_file_reads` | Inspect this operator's active handover reads for a case. |
| `merchant_service_renewals_file_release` | Release one unfinished read by its original read UUID. |

Proposal, decision and file release are mutation tools; the other six are
read-only. The original operator still owns mutation concurrency, request
limits and shutdown. Its shared `RetainedFileReads` owner closes the file
reads; the adapter creates no additional store or worker.

## Queue and revision selection

Call `merchant_service_renewals_queue` with exact UTC `asOf`; `through`
defaults to 90 days later, `noticeDays` to 30 and `limit` to 50 (maximum 200).
Follow `nextOffset` until null with the same settings and `q` search.
`includeClosed: true` includes closed renewals. The full normal and archived
case indexes are included; finite agreements appear as `unplanned` before a
proposal exists. Rows preserve case status, notice date and urgency.

`summary` covers the portfolio before search/page slicing; `total` counts
matching rows, and `unavailable` identifies cases that could not be opened.

| Value | Identity |
| --- | --- |
| Outer `id` | Original case UUID. |
| Outer `expectedRevision` | Current case SHA-256 revision. |
| `input.id` | Renewal UUID; a new UUID creates a new renewal. |
| `input.expectedRevision` | Current renewal edition number, or explicit null for creation. |
| `input.termsId` | Original service-terms agreement UUID. |
| `input.expectedTermsRevision`, `expectedTermsSha256` | Exact current terms edition and retained SHA. |
| Outer `requestId` | UUID for one intended write, unchanged across its retries. |

A read's `case.revision` is its selected snapshot; `case.currentRevision`
is the actual current head required for fresh writes. The request stores the
outer case revision and request ID; optional copies inside `input` must match.

## Retain the continuation

In these examples, `call(name, args)` is the existing MCP client's
`tools/call` with its JSON result unwrapped. `caseId`, `agreementId`,
`actor`, `quoteId` and `continuationEndsAt` are explicit operator
selections; `randomUUID` and `createHash` come from `node:crypto`.

```js
const view = await call('merchant_service_renewals_read', {id: caseId});
const terms = view.termHeads.find(row => row.id === agreementId);
if (!terms) throw new Error('Choose a retained agreement in this case.');
const input = {
  id: randomUUID(), expectedRevision: null,
  termsId: terms.id,
  expectedTermsRevision: terms.revision,
  expectedTermsSha256: terms.sha256,
  continuation: {effectiveUntil: continuationEndsAt},
  actor, noticeDays: 30
};
const preview = await call('merchant_service_renewals_preview', {
  id: caseId, expectedRevision: view.case.currentRevision, input
});
const proposalRequest = {
  id: caseId, expectedRevision: view.case.currentRevision,
  requestId: randomUUID(),
  input: {...input, expectedPreviewSha256: preview.previewSha256}
};
const proposed = await call('merchant_service_renewals_propose', proposalRequest);
```

Retain the complete request before sending. New continuations require explicit
`effectiveUntil` (null means open-ended), with times in
`YYYY-MM-DDTHH:mm:ss.sssZ`. An omitted start defaults to the finite source end.
Review the preview's terms, notice and gap. The source, proposed and active
editions remain distinct. Calendar/target changes and replacement rules are
covered in the [native renewal guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/SERVICE_RENEWALS.md).

## Quote and attach the proposed edition

Publish through `merchant_case_commercial` with `draft.serviceSourceId` set
to the proposed continuation's `id + ':' + revision`. Its recurring service
line uses that agreement UUID as `commitmentId` and the reviewed quantity/price.
Reopen the renewal view; the quote's `eligibleRenewalIds` must include this
renewal. Attach its exact edition without continuation changes:

```js
const fresh = await call('merchant_service_renewals_read', {id: caseId});
const renewal = fresh.renewals.find(row => row.id === proposed.renewal.id);
const quote = fresh.quotes.find(row =>
  row.id === quoteId && row.eligibleRenewalIds.includes(renewal.id));
if (!quote) throw new Error('Choose this continuation edition\'s quotation.');
const attachment = {
  id: renewal.id, expectedRevision: renewal.revision,
  termsId: renewal.continuationTerms.id,
  expectedTermsRevision: renewal.continuationTerms.revision,
  expectedTermsSha256: renewal.continuationTerms.sha256,
  actor, quoteId: quote.id, quoteSha256: quote.sha256
};
const review = await call('merchant_service_renewals_preview', {
  id: caseId, expectedRevision: fresh.case.currentRevision, input: attachment
});
const attachRequest = {
  id: caseId, expectedRevision: fresh.case.currentRevision,
  requestId: randomUUID(),
  input: {...attachment, expectedPreviewSha256: review.previewSha256}
};
const attached = await call('merchant_service_renewals_propose', attachRequest);
```

The commercial tools are `merchant_case_commercial_preview`,
`merchant_case_commercial_publish` and `merchant_case_commercial_receive`.
A changed continuation needs its own matching quote and response.

## Activate, decline or close

Record the actual response, source and observed time through the commercial
desk. Activation selects its latest accepted response and exact observed time:

```js
const current = await call('merchant_service_renewals_read', {id: caseId});
const selected = current.renewals.find(row => row.id === attached.renewal.id);
const response = current.acceptances.find(row => row.latest &&
  row.payload.quoteId === selected.quote.id &&
  row.payload.quoteSha256 === selected.quote.sha256);
if (!response) throw new Error('Choose the latest original accepted response.');
const acceptRequest = {
  id: caseId, expectedRevision: current.case.currentRevision,
  requestId: randomUUID(),
  input: {
    id: selected.id, expectedRevision: selected.revision,
    state: 'accepted', actor, acceptanceId: response.id,
    observedAt: response.payload.observedAt, reference: response.payload.source
  }
};
const accepted = await call('merchant_service_renewals_decide', acceptRequest);
```

`declined` and `closed` use the same tool with current guards and a decision
time; closing requires a nonempty `note`. Closing after acceptance retains
`acceptedHead`. To replace a declined/closed obsolete proposal, reopen current
terms and use a new renewal UUID with an explicit end. The replacement keeps
the eligible amended values and requires its own quote and customer response.

## Recover the original request

After an interrupted `propose` or `decide`, retry the exact retained body
with its original request UUID, old case revision and renewal edition.
A matching saved request returns its original result with `reused: true`
before later head guards. Changing that body under the UUID is a conflict.

| Native outcome | Action |
| --- | --- |
| `CASE_CONFLICT` | Reopen the case and review a new request against its current head. |
| `CASE_STORE_BUSY`, `OPERATOR_BUSY` | Let the original in-flight operation finish, then retry the same intended request. |
| `SERVICE_RENEWAL_OPERATION_CONFLICT` | Recover the complete original body for that request UUID. |
| `SERVICE_RENEWAL_TERMS_CONFLICT` | Reopen the current terms before preparing another continuation. |
| `SERVICE_RENEWAL_QUOTE_CHANGED`, `SERVICE_RENEWAL_RESPONSE_CHANGED` | Select the current edition's bound quote and latest original response. |
| `SERVICE_RENEWAL_PREVIEW_CHANGED` | Review the current complete proposal and use its new preview hash. |

## Receive complete handover bytes

`merchant_service_renewals_handover({id, revision, renewalId})` returns complete
histories, `acceptedHead`, separate terms editions, quote/response documents
and bytes, continuity, financial references and a seal. Omitting the changing
current case head makes the selected historical envelope reproducible.

For large results, receive the complete UTF-8 JSON file:

```js
const choice = {
  id: caseId, revision: accepted.case.revision,
  renewalId: accepted.renewal.id
};
let part = await call('merchant_service_renewals_handover_file', {
  ...choice, limit: 65536
});
const descriptor = part.file;
const chunks = [Buffer.from(part.data, 'base64')];
while (part.nextOffset !== null) {
  part = await call('merchant_service_renewals_handover_file', {
    ...choice, readId: part.readId, expectedSha256: descriptor.sha256,
    offset: part.nextOffset, limit: 65536
  });
  chunks.push(Buffer.from(part.data, 'base64'));
}
const bytes = Buffer.concat(chunks);
if (bytes.length !== descriptor.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256)
  throw new Error('The complete handover file differs from its descriptor.');
const renewalJson = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
```

The maximum chunk is 196,608 bytes. `nextOffset: null` closes a completed
read. Inspect with `merchant_service_renewals_file_reads({id})` or release
with `merchant_service_renewals_file_release({id, readId})`. Retain the exact
selection, descriptor and byte offset. After restart, expiry or a lost final
reply, omit `readId` and reopen with that same `expectedSha256` and offset.
The descriptor SHA covers file bytes; the JSON's internal SHA seals its
canonical envelope.

## Receive into the original financial calendar

Pass complete `renewalJson` alongside `quoteContent` and `responseContent`
to financial agreement create/amend. Decode those two UTF-8 document strings
from `materials.quote.data` and `materials.acceptance.data`, preserving their
bytes. The importer uses `validateServiceRenewalHandover` and the accepted
active interval. `financialJoin.agreementId` is the operational service-terms
identity; the financial calendar retains its own UUID. Amend an existing
calendar at its original end, then use its renew operation to extend it;
billing periods stay within the accepted interval.
