# Service renewals through the merchant operator

The operational renewal tools work on the same original case directory as the
merchant support console and renewal CLI. They carry an agreement from an expiry
queue through reviewed continuation terms, a source-bound quotation, the original
customer response, activation and a complete financial handover. The case writer
retains the terms and renewal histories together.

## Host configuration and access

Select the existing support provider and configure its support connection file's
`casesDirectory` and the private export root as described in
[SUPPORT.md](SUPPORT.md). The distribution contribution remains
`merchant-provider-support`; the renewal tools belong to that same provider.
They appear in the operator's catalog only when support is configured.

Use the host's existing authenticated HTTP or stdio MCP session and its current
tool grants. Proposal, decision and file release are mutation tools; the other
six operations are declared read-only. The operator keeps its original provider
dispatch, mutation concurrency checks, request-size limit and shutdown lifecycle.
The tools accept original record identities and values, rather than host paths or
credentials. The existing support owner closes its shared retained-file reader.

| Tool | Purpose |
| --- | --- |
| `merchant_service_renewals_queue` | Page explicitly dated renewal work across the original case portfolio. |
| `merchant_service_renewals_read` | Open a case's terms, renewal history, eligible quotes and original customer responses. |
| `merchant_service_renewals_preview` | Review a continuation or quote attachment against current case and terms guards. |
| `merchant_service_renewals_propose` | Retain or revise that reviewed proposal, including its exact quotation attachment. |
| `merchant_service_renewals_decide` | Record acceptance, decline or closure through the original case writer. |
| `merchant_service_renewals_handover` | Return the complete validated handover object at a selected case revision. |
| `merchant_service_renewals_handover_file` | Receive that complete JSON in bounded, digest-pinned chunks. |
| `merchant_service_renewals_file_reads` | Inspect active handover reads for a case. |
| `merchant_service_renewals_file_release` | Release one unfinished read by its original read UUID. |

In the examples, `call(name, arguments)` means the existing MCP client's
`tools/call` operation with its original JSON result unwrapped. `caseId`,
`agreementId`, `actor`, `quoteId` and `continuationEndsAt` are the operator's
explicit selections. Generate new request and renewal identities with
`randomUUID()` from `node:crypto`.

## Inspect the full queue

```js
const selection = {
  asOf: new Date().toISOString(),
  noticeDays: 30,
  limit: 100
};
let offset = 0;
do {
  const page = await call('merchant_service_renewals_queue', {...selection, offset});
  await receiveRenewalRows(page.rows);
  offset = page.nextOffset;
} while (offset !== null);
```

Keep the same `asOf`, `through`, search and notice settings while paging.
The default horizon is 90 days after `asOf`; `through` can select another
exact UTC horizon. Times use the complete form `YYYY-MM-DDTHH:mm:ss.sssZ`.
Page size is 1–200, default 50. `q` searches case, agreement, merchant,
customer, owner, status and urgency fields.

The owner pages both the normal case index and archived cases before building
the queue. Expiring finite agreements appear as `unplanned` before a renewal
exists. Rows distinguish `expired`, `notice_due`, `upcoming` and
`resolved`; `caseStatus` preserves the original case metadata. A renewal's
retained notice date takes precedence over the default notice interval.
`includeClosed: true` includes closed renewals.

The returned summary describes the full dated portfolio before search and page
slicing. `total` describes the matching search result and `nextOffset`
continues that result. Inspect `unavailable` alongside the rows: it identifies
original case entries that could not be opened, with native failure details.

## Keep the four revision identities distinct

| Input or result | Meaning |
| --- | --- |
| Outer `id` | The original case UUID. |
| Outer `expectedRevision` | The current case SHA-256 revision required for a new change. |
| `input.id` | The selected renewal UUID, or a new UUID for a new renewal. |
| `input.expectedRevision` | The renewal edition number; explicit `null` creates a new renewal. |
| `input.termsId` | The original agreement's service-terms UUID. |
| `input.expectedTermsRevision` and `expectedTermsSha256` | The exact current service-terms edition and its retained SHA. |
| Outer `requestId` | A new UUID for one intended write, kept unchanged for every retry of that write. |

The wrapper binds the outer case revision and request ID into the complete
retained core request. Optional copies in `input.expectedCaseRevision` and
`input.requestId` must match the outer values. Most clients should supply
those values only at the outer level.

A current read exposes `case.revision` and `case.currentRevision`.
A historical read accepts `revision` and keeps the selected revision distinct
from the actual current head. New mutations always require the current head.

## Retain a reviewed continuation

Open the original case and inspect the exact agreement and any existing renewal
before choosing a new renewal UUID.

```js
const view = await call('merchant_service_renewals_read', {id: caseId});
const terms = view.termHeads.find(row => row.id === agreementId);
if (!terms) throw new Error('Choose a retained agreement in this case.');

const input = {
  id: randomUUID(),
  expectedRevision: null,
  termsId: terms.id,
  expectedTermsRevision: terms.revision,
  expectedTermsSha256: terms.sha256,
  continuation: {effectiveUntil: continuationEndsAt},
  actor,
  noticeDays: 30
};
const preview = await call('merchant_service_renewals_preview', {
  id: caseId,
  expectedRevision: view.case.currentRevision,
  input
});
const proposalRequest = {
  id: caseId,
  expectedRevision: view.case.currentRevision,
  requestId: randomUUID(),
  input: {...input, expectedPreviewSha256: preview.previewSha256}
};
const proposed = await call('merchant_service_renewals_propose', proposalRequest);
```

Retain `proposalRequest` before sending it. A new continuation requires an
explicit `effectiveUntil`; `null` selects an open-ended continuation.
For a normal active or ended finite agreement, omitted `effectiveFrom`
defaults to its original end. A later start is retained as an explicit gap.
Overlapping agreement periods are rejected.

The continuation can change title, customer, owner, dates, the complete service
calendar and response/recovery targets. Its incident-source identity, merchant
identity and merchant binding come from the original agreement. Preview returns
the exact continuation input, source/current term references, notice settings,
gap and `previewSha256`. Review those values before retaining the proposal.

A proposed continuation remains a distinct service-terms edition. Its original
source agreement and eventual activated continuation remain separate retained
editions under the same agreement identity.

## Quote the retained proposed edition

Use the existing `merchant_case_commercial` workflow to prepare, preview and
publish the quotation. Its `draft.serviceSourceId` must be the retained
continuation's `id + ':' + revision`. Include the original recurring service
line with `commitmentId` equal to that agreement UUID and the reviewed
quantity and monthly unit price. The native commercial desk captures the
complete service source binding, including the proposed terms SHA and snapshot.

Reopen `merchant_service_renewals_read` after publishing the quotation.
Each quote's `eligibleRenewalIds` identifies the proposed renewals to which
it actually binds. Attaching the quotation uses the current proposed terms
guards and omits continuation changes:

```js
const fresh = await call('merchant_service_renewals_read', {id: caseId});
const renewal = fresh.renewals.find(row => row.id === proposed.renewal.id);
const quote = fresh.quotes.find(row =>
  row.id === quoteId && row.eligibleRenewalIds.includes(renewal.id));
if (!quote) throw new Error('Choose the quotation of this retained continuation.');

const attachment = {
  id: renewal.id,
  expectedRevision: renewal.revision,
  termsId: renewal.continuationTerms.id,
  expectedTermsRevision: renewal.continuationTerms.revision,
  expectedTermsSha256: renewal.continuationTerms.sha256,
  actor,
  quoteId: quote.id,
  quoteSha256: quote.sha256
};
const review = await call('merchant_service_renewals_preview', {
  id: caseId, expectedRevision: fresh.case.currentRevision, input: attachment
});
const attachRequest = {
  id: caseId,
  expectedRevision: fresh.case.currentRevision,
  requestId: randomUUID(),
  input: {...attachment, expectedPreviewSha256: review.previewSha256}
};
const attached = await call('merchant_service_renewals_propose', attachRequest);
```

The native quotation controls remain `merchant_case_commercial_preview`,
`merchant_case_commercial_publish` and `merchant_case_commercial_receive`.
Keep the actual quotation and response request bodies for their existing replay
mechanism. Quote acceptance is recorded against that immutable quote before the
renewal decision activates its service terms.

Changing the continuation after a quote was attached creates a new proposed
edition. That edition needs a matching new quotation and original customer
response. The preceding quote's binding cannot authorize the changed terms.

## Record the original customer's decision

The commercial desk records the actual response, including its source and
observed time. Reopen the renewal view afterward. Accepted response options
carry `latest`; the decision must use the latest retained response for the
attached quotation, selected by observed time, recorded time and original ID.

```js
const current = await call('merchant_service_renewals_read', {id: caseId});
const selected = current.renewals.find(row => row.id === attached.renewal.id);
const response = current.acceptances.find(row =>
  row.latest &&
  row.payload.quoteId === selected.quote.id &&
  row.payload.quoteSha256 === selected.quote.sha256);
if (!response) throw new Error('Select the latest original accepted response.');

const acceptRequest = {
  id: caseId,
  expectedRevision: current.case.currentRevision,
  requestId: randomUUID(),
  input: {
    id: selected.id,
    expectedRevision: selected.revision,
    state: 'accepted',
    actor,
    acceptanceId: response.id,
    observedAt: response.payload.observedAt,
    reference: response.payload.source
  }
};
const accepted = await call('merchant_service_renewals_decide', acceptRequest);
```

Activation preserves the exact customer-reviewed dates, calendar, targets,
merchant binding and commercial material. The active terms become the next
edition immediately after the proposed continuation. The source, proposed and
activated editions remain in the original history.

The same decision tool records `declined` or `closed`, using the current
case and renewal guards and an original decision time. Closing requires a
nonempty `note`. A renewal may close after acceptance; its retained
`acceptedHead` still identifies the exact accepted edition for financial
receiving.

If another writer amended the service proposal, reopen it before proceeding.
After the obsolete renewal is declined or closed, a new renewal can use that
current proposed amendment when the terminal renewal anchors the original
active or ended agreement. Select the current terms guards and explicitly
provide the continuation end. The replacement preserves amended owner, dates,
calendar and targets while retaining a fresh proposed edition. Quote and accept
that new edition through the original commercial desk.

## Recover an interrupted change

Retry the exact original `propose` or `decide` request, including its old
case revision, renewal edition, request UUID and complete input. A retained
matching request reopens its original result before later case/terms guards and
returns `reused: true`. A changed body under that UUID is a conflict.

For a new operation, refresh the case and use its current guards. If an original
writer is busy, allow that operation to finish and retry the exact intended
request. The original store owns its writer lease and merge behavior; the
adapter adds no second writer queue.

| Native outcome | Recovery |
| --- | --- |
| `CASE_CONFLICT` | A fresh request selected a stale case. Open the case and review a new request. |
| `CASE_STORE_BUSY` or `OPERATOR_BUSY` | Finish the in-flight original operation, then retry the exact intended request. |
| `SERVICE_RENEWAL_OPERATION_CONFLICT` | The retained request identity was reused with different input. Recover the original body. |
| `SERVICE_RENEWAL_TERMS_CONFLICT` | The terms edition changed. Reopen current terms before reviewing another continuation. |
| `SERVICE_RENEWAL_QUOTE_CHANGED` | Select the quotation bound to the retained proposed edition. |
| `SERVICE_RENEWAL_RESPONSE_CHANGED` | A later customer response superseded the selected acceptance. |
| `SERVICE_RENEWAL_PREVIEW_CHANGED` | Preview the current complete proposal and retain that new review hash. |

The original error codes and statuses pass through the adapter. Support storage
errors retain the existing operator's path-sanitizing error handling.

## Receive the complete handover

For an ordinary result, call `merchant_service_renewals_handover` with
`{id: caseId, revision, renewalId}`. Pin the exact saved case revision when
receiving or forwarding a handover. The complete envelope contains:

- The selected immutable case summary and both complete original history arrays.
- The current selected renewal plus its exact `acceptedHead` reference.
- Distinct source terms, proposed continuation, activated terms and current terms
  within that selected case revision.
- The original quotation and customer response documents, material identities,
  full base64 material bytes and each original byte count/SHA.
- Exact continuity timestamps and gap, the financial join references, and the
  canonical handover seal.

The sealed case summary omits the changing current case head. Reopening the
same selected historical revision therefore reproduces the same envelope and
file bytes after later case edits. The normal read view still reports the
actual current head.

For large handovers, use the complete file reader:

```js
const choice = {
  id: caseId,
  revision: accepted.case.revision,
  renewalId: accepted.renewal.id
};
let part = await call('merchant_service_renewals_handover_file', {
  ...choice, limit: 65536
});
const descriptor = part.file;
const chunks = [Buffer.from(part.data, 'base64')];
while (part.nextOffset !== null) {
  part = await call('merchant_service_renewals_handover_file', {
    ...choice,
    readId: part.readId,
    expectedSha256: descriptor.sha256,
    offset: part.nextOffset,
    limit: 65536
  });
  chunks.push(Buffer.from(part.data, 'base64'));
}
const bytes = Buffer.concat(chunks);
if (bytes.length !== descriptor.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256)
  throw new Error('The complete handover file did not match its descriptor.');
const renewalJson = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
```

`createHash` above comes from `node:crypto`. Chunk offsets are bytes, and
the maximum chunk is 196,608 bytes. The last chunk returns
`nextOffset: null` and closes its retained read automatically. File status
is available with `merchant_service_renewals_file_reads({id: caseId})`.
Release an unfinished read with its original case ID and returned `readId`.

Retain the selection, descriptor and last received byte offset alongside the
download. After a process restart, expiration or completed-read reply loss,
omit `readId` and reopen the same selection with the retained
`expectedSha256` and offset. The original reader rejects a mismatched
selection or digest. A file digest covers the complete UTF-8 JSON bytes; the
handover's internal `sha256` covers its canonical envelope and is a separate
identity.

## Join the original financial calendar

The financial service agreement create/amend workflow receives the complete
`renewalJson` string beside `quoteContent` and `responseContent`.
Decode those two UTF-8 source strings from the handover's original
`materials.quote.data` and `materials.acceptance.data`; retain their
original byte counts and SHA values. They are the actual retained commercial
documents, including their envelopes.

The financial importer validates the full handover using the original
`validateServiceRenewalHandover(value)` export from the service renewal
module. It checks accepted-head identity, exact material bytes, source binding,
history and accepted interval before retaining its financial linkage.
`financialJoin.agreementId` is the original operational service-terms UUID;
the financial agreement keeps its own original calendar UUID.

For an existing financial agreement, amend its native terms at the original
calendar end with the accepted continuation and then extend the same calendar
through its original renew operation. Keep billing periods within the accepted
service interval. The operational renewal tools activate service terms and
produce this complete join; the original financial product performs the
calendar and billing changes.
