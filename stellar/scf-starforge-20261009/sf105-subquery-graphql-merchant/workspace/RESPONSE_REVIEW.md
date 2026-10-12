# Compare retained GraphQL responses and continue their review

The original GraphQL workspace can now retain a cohort of completed baseline and
candidate previews, compare every returned value, and preserve reviewer
decisions through project handover. This workflow reads existing preview
records. It does not call the GraphQL source, create a payment, or start a
merchant.

A comparison belongs to one original project and one immutable selection of
1–16 cases. Each case names two already completed preview UUIDs, a title and an
optional question. Each side keeps its original query, variables, source
schema identity, source endpoint, HTTP status, response bytes and preview
timestamps. Reviews append generations to that same comparison; they do not
replace its selected responses.

## Open and use the installed product

Use the existing GraphQL product installation and owner described in
[the packaging guide](../../../../products/graphql-workspace/PACKAGING.md).
Both the complete merchant edition and the graphql-workspace source selection
include the full SF105 workspace directory, these comparison modules and this
guide.

~~~sh
starforge graphql-product open --dir /srv/private/graphql-product
~~~

Open the returned original browser URL. In **Retained response comparison and
review**, add the cases and select their baseline and candidate preview UUIDs.
The preview labels show the actual operation, source draft revision and HTTP
status. Enter the question or expected behavior that makes each pair useful,
then prepare the comparison from the current saved project.

An unfinished query or plan can still be saved by the original raw editor.
Comparison preparation, review and recovery require a saved current revision,
so the browser preserves unsaved authoring fields until the operator saves
them. It never makes another provider request to fill a missing baseline.

Open the comparison to inspect each case:

- The summary shows value differences, byte equality and status changes.
- **Inspect case** pages all data, error, extension and envelope changes.
  Each JSON pointer opens the complete baseline and candidate value. Page
  excerpts are explicitly labeled when truncated.
- Original response downloads preserve the exact bytes, including non-JSON
  bodies. Query/variable/source context stays beside the response result.
- The reviewer can retain ACCEPTED, CHANGES_REQUESTED, NOT_APPLICABLE or
  UNREVIEWED for every case, with individual notes and an overall explanation.

The overall state is CHANGES_REQUESTED if any case requests changes; otherwise
UNREVIEWED if any case is unreviewed; otherwise ACCEPTED if at least one case
is accepted; otherwise NOT_APPLICABLE. A reviewer name is an entered label.
This product does not claim an authenticated signature or buyer agreement.

Opening another generation preserves an unsaved local review draft. When the
saved review has advanced, open its latest generation and explicitly choose
**Use opened generation as review basis** to keep the notes while accepting
the new basis. **Load saved review decisions** deliberately replaces local
notes only after confirmation.

## What the comparison means

| Surface | Exact behavior |
| --- | --- |
| Raw response bytes | SHA-256 and byte length remain attached to the original preview. Identical-byte and different-byte results are separate from semantic JSON comparison. |
| JSON numbers | One iterative source-token parser runs in Node and the offline/browser module. Decimal coefficients and exponents are compared as strings before any conversion to a JavaScript Number. Large integers and enormous exponents retain their original literals. |
| Equivalent numeric spellings | 1, 1.0 and 1e0 compare equally. Positive and negative zero compare equally. Their raw response bytes can still differ. |
| Objects | Member order is ignored. Duplicate member names follow JSON's common last-value interpretation, including escaped equivalent names. Earlier duplicate occurrences remain in the original bytes; this view is not a duplicate-key validator. |
| Arrays | Position and order are significant. The comparison makes no unrequested assumption about stable business keys. |
| Missing and null | An absent member differs from a present null. Added or removed subtrees are one change with their full subtree available. |
| GraphQL errors | Errors are compared as returned JSON alongside data and extensions. HTTP success alone does not imply a successful GraphQL result. |
| Non-JSON or invalid UTF-8 | Structured comparison is unavailable, with the actual condition shown. Original byte and HTTP observations remain available. |
| Different request or source context | Query text, semantic variables, original request bytes, operation names, endpoint and available source/schema hashes are compared explicitly. A changed value is not automatically attributed to code. |
| Timing | Original preview createdAt→completedAt intervals include preparation, transport and retention. Their observed difference is shown without a causal service, database or performance claim. Missing or invalid intervals remain unknown. |

Object-key ordering is deterministic and arrays are traversed lazily. The
native change API returns up to 100 differences per page, with a character
budget that may yield fewer. Use its returned nextOffset to continue. A page
contains labeled value excerpts; the browser and offline packet can show the
complete selected returned values.

The exact parser does not require JSON.parse reviver context.source.
JSON.parse is used only to decode individual quoted strings. Numeric response
tokens never fall back to rounded Number values. The installed product's
existing Node 22.16+ requirement remains; offline case pages use standard ES
modules, typed arrays and browser Blob downloads in a current browser.

## Retain a comparison through the CLI or agent

Use the actual saved project revision and original preview UUIDs. Retain a
private request file before dispatch. The following is a request template;
replace its IDs and revision with your selected original records:

~~~json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "project": "customer-queries",
  "expectedRevision": 12,
  "title": "Account query revision",
  "pairs": [
    {
      "id": "account-window",
      "title": "Account result and errors",
      "objective": "Review the selected account response after the query revision.",
      "baselineId": "22222222-2222-4222-8222-222222222222",
      "candidateId": "33333333-3333-4333-8333-333333333333"
    }
  ]
}
~~~

~~~sh
starforge graphql-product prepare-comparison \
  --dir /srv/private/graphql-product \
  --request /srv/private/comparison-request.json
~~~

This calls merchant_graphql_comparison_prepare through the original product
client. It adds only the configured workspace alias. The returned original
record contains the comparison UUID, generation, complete case definition and
analysis, source/admission hashes, and the newly saved project revision.

For inspection, retain a selection containing project, comparisonId and,
when needed, revision, generation and expectedRecordSha256:

~~~sh
starforge graphql-product comparison \
  --dir /srv/private/graphql-product --request /srv/private/comparison-selection.json

starforge graphql-product comparison-changes \
  --dir /srv/private/graphql-product --request /srv/private/case-selection.json
~~~

The case selection also contains pairId and optional offset/limit. These map
to merchant_graphql_comparison and merchant_graphql_comparison_changes.
Use merchant_graphql_project with collection comparisons to page the original
comparison references in any saved revision.

A review request retains a new caller UUID, original project/comparison IDs,
expectedRevision, expectedGeneration, expectedRecordSha256, reviewer, optional
overall notes and one decision for each original pairId:

~~~json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "project": "customer-queries",
  "comparisonId": "11111111-1111-4111-8111-111111111111",
  "expectedRevision": 13,
  "expectedGeneration": 1,
  "expectedRecordSha256": "REPLACE_WITH_THE_RETURNED_64_CHARACTER_SHA256",
  "reviewer": "Reviewing operator",
  "notes": "Describe the conclusion supported by these selected responses.",
  "decisions": [
    {
      "pairId": "account-window",
      "decision": "CHANGES_REQUESTED",
      "notes": "Describe the actual unresolved returned value or error."
    }
  ]
}
~~~

~~~sh
starforge graphql-product review-comparison \
  --dir /srv/private/graphql-product --request /srv/private/comparison-review.json
~~~

This maps to merchant_graphql_comparison_review. The original writer checks
the project revision and preceding generation/hash, retains the full request,
publishes an immutable next generation, then attaches it to a new original
project revision. The cohort stays unchanged. Select a new comparison UUID to
change its baseline/candidate cases.

JavaScript clients use the same original product:

~~~js
const comparison = await client.prepareComparison(originalRequest);
const inspected = await client.inspectComparison(originalSelection);
const differences = await client.comparisonChanges(originalCaseSelection);
const reviewed = await client.reviewComparison(originalReviewRequest);
~~~

Keep the exact request before each call. None of these methods retries a
mutation automatically, and reconnecting the product client does not replace
its bound product UUID or workspace alias.

## Recover the original finished work

The browser retains exact prepare/review/recovery requests before dispatch in
its local session. An uncertain response keeps that body and UUID, with
**Continue exact original request**, **Inspect retained generation** and
**Download original request** controls. A known returned error also keeps the
request because a generation may have been written before project attachment.

Prepare always creates generation 1. A review following generation N creates
N+1. Inspect that exact result, even when it is not attached:

~~~json
{
  "project": "customer-queries",
  "comparisonId": "11111111-1111-4111-8111-111111111111",
  "generation": 2
}
~~~

~~~sh
starforge graphql-product pending-comparison \
  --dir /srv/private/graphql-product --request /srv/private/original-result.json
~~~

The original merchant_graphql_comparison_pending returns its record/hash,
history, current project revision and attachment state. If the project moved
after generation publication, retain a recovery request containing project,
comparisonId, generation, expectedRecordSha256 and the current expectedRevision:

~~~sh
starforge graphql-product recover-comparison \
  --dir /srv/private/graphql-product --request /srv/private/comparison-recovery.json
~~~

The original predecessor must already be attached. Recovery preserves the
current project input and adds only the exact finished generation. If a
repeated original request is already represented in a later retained chain,
the writer returns the current project without replacing later edits or
review generations.

Browser local state belongs to its browser origin/session. Download an
unresolved request or review draft when transferring the operator to another
browser. The native completed generations and original request bodies are
also discoverable through comparison history and the manual UUID/generation
inspection after restart.

## Deliver the complete reviewer packet

In the browser, **Prepare complete comparison packet** selects the comparison
generation referenced by the currently saved project revision. The private
folder contains:

- index.html with the complete selected review, decisions, history and source
  links.
- pairs/<case-id>.html: self-contained offline case viewers containing both
  original completed preview records and the exact shared comparison parser.
- comparison.json and history/<generation>.json: unchanged original review
  records.
- previews/<uuid>.json and drafts/<revision>.json: unchanged original source
  preview and project-admission/draft records.

Open index.html in that complete folder. Each case page pages all differences,
opens complete returned values, downloads original response bytes and exports
all change locations. Case pages make no network requests. Individual browser
downloads remain useful on their own; keep the complete folder for all history
and draft links.

For another machine, use the same original selected-file transport. Retain a
selection with the actual project/revision/comparison ID:

~~~json
{
  "project": "customer-queries",
  "revision": 14,
  "kind": "comparison",
  "comparisonId": "11111111-1111-4111-8111-111111111111"
}
~~~

~~~sh
starforge graphql-product receive --dir /srv/private/graphql-product \
  --export-id customer-query-comparison-r14 \
  --selection /srv/private/comparison-file-selection.json \
  --out /srv/private/received-comparison

starforge graphql-product inspect-received \
  --dir /srv/private/received-comparison
~~~

The existing native workspace-files.json and graphql-export.json manifests,
chunked file reader, exact lengths/SHA-256s and saved byte-prefix continuation
remain the transfer authority. Retain the transfer alias, selected manifest
hash and output directory when continuing an interrupted receive.

The native file limits remain 512 generated files plus the transport
manifest, 8 MiB per generated file and 256 MB across the selected files.
A comparison has up to 16 cases and 256 immutable generations. Original
preview responses retain their existing 2 MiB limit. Exceeding a complete
packet's bound returns a concrete error; no source/history files are silently
omitted.

## Hand over the editable project

Select kind handover in the existing original file transport, or use the
browser's complete Project handover. It now includes every comparison
generation referenced by the selected committed project history, plus each
comparison's original preview/source/admission records. The original importer
verifies their byte identities, generation chain, full selection and recomputed
response analysis before publishing the project head.

The receiver retains the same project, comparison and preview UUIDs, every
original revision byte and all reviewer requests. Its local path resolver
joins them to the receiving writer without rewriting the historical source.
Open the received project, inspect its existing comparison, and save the next
review generation through the same browser/MCP/CLI. Merchant, evolution and
deployment receiving continue through their original implementations.

The complete operator and deployment instructions remain in
[OPERATING.md](../../../../products/graphql-workspace/OPERATING.md) and
[HANDOVER.md](../../../../products/graphql-workspace/HANDOVER.md).
