# Service renewals

Service renewals follow the original case, agreement terms, commercial quote, and customer response. The portfolio queue shows finite agreements approaching their notice or ending dates. Each retained proposal keeps the original agreement edition, its proposed continuation, the owner, the notice date, and the quotation of that exact continuation. An accepted renewal creates the next active terms edition using the latest accepted response to that quotation.

The case remains the storage and revision boundary. Renewals are retained in the optional `service.renewals` history inside the existing workspace. Support text, case metadata, and the other workspace sections continue through the original case writer.

## Operator workflow

1. Open the renewal queue at an explicit UTC time and choose an agreement. Read the selected case to obtain its current case revision and exact terms edition.
2. Prepare a continuation. Keep its original agreement ID and merchant/incident binding. The continuation begins at or after the source agreement ends. Enter its ending timestamp, or `null` for an open-ended continuation. A later beginning is recorded as a gap.
3. Preview and retain the proposal. This creates a proposed terms edition in the original agreement history. Assign a renewal UUID once and use a distinct request UUID for each intentional change.
4. Use the existing commercial desk to publish a quote of that exact proposed terms edition. Include a recurring-service line whose source points to the proposed edition and original agreement row. Return to the renewal, select that quote, and retain the attachment without changing its continuation.
5. Record the customer's response through the original commercial receiving workflow. Accept the renewal using the latest retained accepted response to its exact quote. The renewal decision's `observedAt` is the original response timestamp. The resulting active edition preserves the reviewed continuation's period and service commitments.
6. Export the handover for the financial workflow. It carries source, proposed, activated, and current terms; the original quote and response documents; exact material bytes; and their case, agreement, document, and hash joins.

Declining retains the proposal and the recorded decision. Closing records an explanatory note while preserving earlier decisions and acceptance. A terms amendment concurrent with an open proposal requires reopening the current terms before changing or accepting that proposal; closing remains available to resolve the old work.

## Case API

Create the desk with the original store and workspace identity:

~~~javascript
import {openCaseServiceRenewals} from './case-service-renewals.mjs';
import {commercialWorkspaceId} from './case-commercial.mjs';

const renewals = openCaseServiceRenewals({
  caseStore,
  workspaceId: commercialWorkspaceId(casesDirectory)
});
~~~

The factory also accepts the existing `commercialDesk` as an identity source when `workspaceId` is omitted.

| Method | Arguments | Result |
| --- | --- | --- |
| `queue` | `{asOf, through?, noticeDays?, offset?, limit?, q?, includeClosed?}` | Portfolio rows, urgency summary, pagination, and unavailable cases |
| `read` | `{id, revision?}` | Case, terms and renewal history, current editions, quotes, responses, and accepted-response choices |
| `preview` | `{id, expectedRevision, input}` | Core proposal preview and case summary |
| `propose` | `{id, expectedRevision, requestId, input}` | Saved case view, exact renewal, changed terms, and retry status |
| `decide` | `{id, expectedRevision, requestId, input}` | Saved case view, exact renewal, changed terms, and retry status |
| `handover` | `{id, revision?, renewalId}` | Complete original-case handover JSON with a content hash |

Here `id` is the case UUID. Inside `input`, `id` is the renewal UUID and `expectedRevision` is its integer edition, or `null` for a new proposal. The outer `expectedRevision` is the case's SHA-256 revision.

`read.terms` and `read.renewalHistory` carry full history. `read.termHeads` and `read.renewals` carry the latest editions. Quote choices retain the original quote fields and add `eligibleRenewalIds` and `latestResponseId`. Accepted-response rows retain the original document and add `latest`; only a latest accepted response is eligible for activation.

The queue scans both the ordinary and archived sections of the original case index before sorting, filtering, and paginating agreement rows. Each row includes its original case status; unreadable case IDs are deduplicated across pages. Search covers case, agreement, customer, owner, merchant, state, and urgency. The returned `summary` describes the full readable portfolio; `total` is the number of rows matching the search. `unavailable` identifies cases that could not be opened. The default page has 50 rows and the maximum is 200. An omitted horizon ends 90 days after `asOf`.

## Command line

Use the same case directory as the console. Output is JSON; redirect it to a file when needed.

~~~sh
node service-renewals-cli.mjs ids
node service-renewals-cli.mjs queue \
  --cases-dir "$CASES_DIR" \
  --as-of 2026-10-12T12:00:00.000Z \
  --through 2027-01-10T12:00:00.000Z \
  --notice-days 30
node service-renewals-cli.mjs read \
  --cases-dir "$CASES_DIR" --case "$CASE_ID"
~~~

A new proposal's input file has the following structure. Replace the example IDs, hash, terms edition, dates, and reviewer with the selected case's original values.

~~~json
{
  "id": "1e836b1d-7f85-4550-9d67-7856c923c321",
  "expectedRevision": null,
  "termsId": "e37bf55b-126b-4dc7-bf03-0c45c1071932",
  "expectedTermsRevision": 1,
  "expectedTermsSha256": "<64-character original terms SHA-256>",
  "continuation": {
    "effectiveFrom": "2026-11-01T00:00:00.000Z",
    "effectiveUntil": "2027-11-01T00:00:00.000Z"
  },
  "noticeDays": 30,
  "owner": "Service owner",
  "actor": "Reviewer",
  "note": "Continue the reviewed service commitments for one year."
}
~~~

~~~sh
node service-renewals-cli.mjs preview \
  --cases-dir "$CASES_DIR" --case "$CASE_ID" \
  --expected-revision "$CASE_REVISION" --input proposal.json

node service-renewals-cli.mjs propose \
  --cases-dir "$CASES_DIR" --case "$CASE_ID" \
  --expected-revision "$CASE_REVISION" --request-id "$REQUEST_ID" \
  --input proposal.json
~~~

To bind a reviewed preview, add its `previewSha256` as `expectedPreviewSha256` in the proposal input. Publishing a quote changes the case revision; reopen the case before attaching it. For that attachment, use the same renewal ID, its current integer edition, the current proposed terms edition and hash, and the selected `quoteId` plus `quoteSha256`. Omit `continuation` so the attachment selects the already reviewed proposed edition.

A decision input contains the renewal ID and current integer edition, `state`, `actor`, `observedAt`, and a note or reference. Acceptance also selects the original `acceptanceId`. Run it with `decide` using the current case revision and a fresh request ID.

~~~sh
node service-renewals-cli.mjs decide \
  --cases-dir "$CASES_DIR" --case "$CASE_ID" \
  --expected-revision "$CASE_REVISION" --request-id "$REQUEST_ID" \
  --input decision.json

node service-renewals-cli.mjs handover \
  --cases-dir "$CASES_DIR" --case "$CASE_ID" --renewal "$RENEWAL_ID" \
  > renewal-handover.json
~~~

`--input -` reads JSON from standard input. `read` and `handover` accept `--revision` to open a retained case revision. Timestamps use exact UTC form with milliseconds. Input files and standard input accept at most 128 KiB of JSON. Argument and operation errors emit a structured error on standard error and exit with status 1.

## Retry and concurrent edits

Keep the original request ID, case revision, and complete input unchanged for a retry. The wrapper retains the outer case revision as `input.expectedCaseRevision` in the core request. Its digest binds that revision and every supplied input to the original request ID. A repeated request returns the original renewal edition with `reused: true` and the current readable case view, without another save.

Reusing a request ID with changed inputs is a conflict. A new change must use a fresh request ID and current case/renewal/terms revisions. The case writer guards the save against concurrent edits; if another attempt has already saved the identical request, the wrapper reopens it and returns that retained result.

## Handover contents

`financialJoin` includes the original case and agreement IDs, selected case revision, exact source/proposed/active terms references, quote ID and hash, accepted-response ID, and original acceptance time. `quoteDocument` and `acceptance` are the original decoded commercial documents. Each material entry carries its original ID, SHA-256, byte length, and base64-encoded bytes. The exporter verifies those bytes against their retained hash and size.

The complete original case terms and renewal histories are included as `termsHistory` and `renewalHistory`. `acceptedHead` selects the exact accepted renewal edition from that history, including after the current renewal has been closed; it is null before acceptance.

The handover's `sha256` is the service canonical hash of the complete object before adding that final field. A selected historical case revision produces the renewal and documents available at that revision. The export includes the current agreement head at that selected revision alongside the exact edition activated by this renewal.
