# Named PDF interpretation review and original Bank continuation

This workflow sends a complete original PDF working copy to a named reviewer,
retains their proposed interpretation and submitted editions, and lets the author
compare those proposals against the current original working copy. The author
explicitly keeps current or adopts returned fields. Accepted changes pass through
the existing PDF edit engine, retaining original PDF bytes, every extracted page,
text-item geometry, account and region decisions, complete history and prior Bank
imports.

The result is another complete original PDF working copy. Financial preview,
receiving, reconciliation, corrections and closing remain separate operations in
the maintained Bank application. Generic source collections and configured-source
preparations continue to reject PDF_REVIEW; use this dedicated PDF workflow.

## Installed entry points and authority

Install the complete merchant Bank PDF selection with its current review
contribution. The installed command is:

~~~sh
starforge merchant-accounting-bank-pdf-review --help
~~~

The contribution resolves this command to
stellar-forge/mcp-merchant-operator/accounting-bank-pdf-review-cli.mjs.
An unpacked complete source installation may invoke that exact file with Node.

The typed customer-agent entry point is
./merchant/accounting-bank-pdf-review. It exports the actual pure review-domain
functions and original PDF working-copy/source functions. It requires no separate
MCP service, session, API key or financial writer. Calling a function does not send
the resulting package to anyone.

| Source | Responsibility |
| --- | --- |
| bank-pdf/model.mjs | Original PDF identity, extraction, interpretation edits, exact amounts, history and Bank source |
| bank-pdf/review-model.mjs | Named issue, recipient record and editions, full return, comparison and explicit author decision |
| accounting-bank-pdf-review-client.mjs | Installed domain exports, complete-byte inspection and retained application verification |
| accounting-bank-pdf-review-client.d.mts | Typed complete source, proposal, comparison, decision and application contracts |
| accounting-bank-pdf-review-cli.mjs | Private complete files, original operation lock, deterministic application and existing export continuation |
| bank-pdf/cli.mjs | Original complete PDF extraction, all-page rendering and full account export |
| PDF_STATEMENTS.md, EXTRACTION.md, RECEIVING.md | Existing PDF operating and native receiving instructions |

The original complete source dependency is the 28-file DFF77 PDF edition in
Merchant blob 0718a840d5a9e4c862adf03ec204e5f3788a120c, 398,163 bytes, SHA-256
8702f8d9a5a053292cd08ff4fafd1edb32153be2d7d53054746034427d63a25f. The cumulative
publisher preserves later owner changes to those existing files. These installed
leaves add no replacement PDF parser, geometry model, money parser, posting engine
or generic collection conversion.

The reviewed named-exchange dependency is the complete source cohort
c2e154cedad8973e9e40f4d53cbc0e443165253b; review-model.mjs is 24,326 bytes,
SHA-256 b02c2119e2be3fb4047d86991725e40654bfea432820452f9b7d6db4a968521a.
It includes current-copy validation, exact decision identity checks and the
original engine's 4,000-character decision-reason limit. Install the cumulative
publisher's coherent source selection, preserving later reviewed owner fixes.

## Complete original preparation

Use an actual issuer PDF and the existing PDF extraction command, or reopen the
complete working-copy.json already retained by that original course. Review the
actual original pages in the PDF desk, including pages without extracted text,
other accounts, disclosures and repeated summaries. Retain its full extraction,
account mappings, row and balance interpretations and page decisions.

The existing original CLI remains:

~~~sh
starforge bank-pdf extract \
  --input /private/originals/statement.pdf \
  --out /private/pdf/initial-receiving
~~~

It uses the selected PDF.js 6.4.299 and @napi-rs/canvas 1.0.10 runtime on Node 22.13
or newer. The new review client does not require those dependencies merely to
inspect or reconcile already-extracted JSON. Full original rendering/export still
uses that exact runtime.

An encrypted source keeps its password in the original password environment
variable; the review issue, working copy, return and author decision never acquire
a password field. The full source bytes and interpretation are confidential
financial material. Keep them in the intended private recipient channel.

The CLI requires existing private parent directories (0700) and private input
files (0600). It rejects symlinked or changing source files. Outputs are
create-only. Use a new filename for each new recipient edition; preserve earlier
files. The CLI does not silently overwrite a prior source or working copy.

## Issue one named review

Choose the actual issuing author, named recipient and review purpose. Select a
review UUID and exact UTC timestamp once, retain them with the original operation,
and reuse that same issue for its continuation. A new review is a deliberate new
identity.

~~~sh
starforge merchant-accounting-bank-pdf-review issue \
  --working-copy /private/pdf/current-working-copy.json \
  --id SELECTED_REVIEW_UUID \
  --author "Statement author" \
  --recipient "Named reviewer" \
  --purpose "Review the selected printed date and balance interpretation against every original page." \
  --at SELECTED_UTC_TIMESTAMP \
  --out /private/pdf/issued-review.json
~~~

SELECTED_REVIEW_UUID and SELECTED_UTC_TIMESTAMP above are placeholders for actual
retained values, for example a UUID generated for this operation and an ISO UTC
timestamp with milliseconds. All later example identifiers select actual prior
outputs, rather than being regenerated by the command.

The issue includes the full original working copy: original PDF base64,
extraction, exact working-copy ID and revision, complete interpretation/history,
prior Bank imports and a hash of the whole issue. It also records its named parties
and purpose. The source PDF SHA alone is insufficient to select a review; the
working-copy identity, extraction, metadata and history are all bound.

Inspect the complete issue without changing it:

~~~sh
starforge merchant-accounting-bank-pdf-review inspect \
  --file /private/pdf/issued-review.json
~~~

The output identifies the actual original PDF, page and text-item count,
working-copy revision, account reconciliation and issue identity. It does not
print the original PDF body.

Open the dedicated PDF review interface at /bank-statements/pdf/review.html. Its tabs are Source and interpretation, Recipient editions, Author reconciliation, and Files and recovery. It opens that same issue. Its usable recipient
package and working record must be inspected as delivered, including the embedded
original PDF and every page. The CLI issue is complete JSON; it is not itself a
claim of a rendered PDF or ready browser product.

## Whole browser desk, offline HTML and source project

The browser's Files and recovery tab downloads a complete desk working record.
That wrapper contains the pure recipient record plus original incoming files,
selected current-author working copy, complete return and decision histories,
earlier records and recovery state. Its explicit export/reopen capacity is
768 MiB. The pure recipient record inside it remains limited to 512 MiB; issues
and returns remain 384 MiB, and every original PDF working copy remains 192 MiB.
The complete source project and offline HTML use the same 768 MiB boundary.

Reopen a desk working record or source project in the dedicated review browser.
The installed CLI's inspect command accepts a pure issue, recipient record,
return or original working copy; it does not unwrap the browser's larger desk
record. Download the specific full issue, submitted return, selected current
copy and decision through Files and recovery before retaining a CLI application.
Do not strip fields from the whole desk record to make a different format.

The offline HTML contains the exact original review modules, stylesheet, page and
guide through the full eight-source manifest, together with the whole selected
desk. It displays the embedded original PDF through the browser's native document
viewer alongside complete original text and geometry. If embedded display is
unavailable, open or download that same original PDF. The installed PDF desk
uses the original PDF.js renderer. Neither display path changes the recorded
extraction or interpretation.

Use Download whole working record for recovery, including a local rescue copy
when IndexedDB saving fails or another tab has changed the stored revision.
Keep a competing complete draft before deliberately adopting a newer current
record. The desk validates source/history on reopen and retains prior current
records when adopting a different full record. A portable project preserves the
entire source manifest; if the combined project exceeds capacity, the interface
directs separate complete working-record and source downloads rather than
shortening either one.

## Recipient interpretation and continuing editions

Create the recipient's full working record from the exact issue:

~~~sh
starforge merchant-accounting-bank-pdf-review open \
  --issue /private/pdf/issued-review.json \
  --id SELECTED_LOCAL_RECORD_UUID \
  --at SELECTED_UTC_TIMESTAMP \
  --out /private/pdf/recipient-record-0.json
~~~

The record retains its own local identity, the whole original issue, current
interpretation draft, all saved editions, author decisions and receiving
observations. The original PDF and extraction are never rewritten by an edit.

Two supported paths preserve the same interpretation engine.

1. Operate the original PDF desk on a complete working copy from this record, then
   receive that exact edited working copy back into the record.
2. Apply an explicit original edit operation using the installed pure client or
   the CLI edit command. The original model validates account, region, row,
   balance and page references and records the full before/after history.

Export the recipient's current full PDF working copy:

~~~sh
starforge merchant-accounting-bank-pdf-review working-copy \
  --record /private/pdf/recipient-record-0.json \
  --out /private/pdf/recipient-working-copy.json
~~~

Open that complete file in the original PDF desk at /bank-statements/pdf/. Operate
the actual page viewer and mapping controls. After saving the whole edited copy,
receive it into a new record:

~~~sh
starforge merchant-accounting-bank-pdf-review receive-working-copy \
  --record /private/pdf/recipient-record-0.json \
  --working-copy /private/pdf/recipient-edited-working-copy.json \
  --reviewer "Named reviewer" \
  --comment "The original printed page was inspected; preserve the described interpretation change." \
  --out /private/pdf/recipient-record-1.json
~~~

The received working copy must continue the recipient's complete prior history.
Every additional edit must replay through the original PDF engine. Replacing
source bytes, extraction, working-copy identity, metadata or prior history is
rejected. A recipient cannot insert a Bank import through this proposal path.

For an installed agent, a page-review edit file can use the original action:

~~~json
{
  "action": "PAGE_REVIEW",
  "value": {
    "page": 3,
    "disposition": "INFORMATION",
    "note": "This original page is a repeated summary; its cash rows were reviewed on the transaction pages."
  },
  "actor": "Named reviewer",
  "reason": "Document the inspected role of the original page."
}
~~~

The page number, disposition and reason must describe the actual selected PDF.
This example is a shape, not evidence about any specific source.

~~~sh
starforge merchant-accounting-bank-pdf-review edit \
  --record /private/pdf/recipient-record-1.json \
  --edit /private/pdf/page-review-edit.json \
  --out /private/pdf/recipient-record-2.json
~~~

Other allowed actions are ACCOUNT, REGION, ROWS and BALANCE. Each uses the
maintained model's complete input shape. Row/balance source references retain
the actual page, rectangle and original item IDs. Monetary values remain exact
decimal strings, with original raw text preserved. An exclusion requires its
reason. A region change deliberately marks affected existing rows for renewed
review in the original engine.

The installed edit command requires exact item IDs before dispatch, including every row in a ROWS edit. Use existing IDs for corrections. For a new item, choose and retain
its new ID in the intended edit request. The original engine's history retains
the actual resulting IDs. Do not repeat an unobserved edit as an invented new
operation; inspect the existing complete output and its history.

A raw browser edit that has not been applied remains a dirty draft and cannot
be silently converted into a submitted edition. Apply it through the original
review interface or retain the whole record for recovery before continuing.

Save an explicit edition, selecting the last observed edition SHA or none for
the first edition:

~~~sh
starforge merchant-accounting-bank-pdf-review edition \
  --record /private/pdf/recipient-record-2.json \
  --id SELECTED_EDITION_UUID \
  --status submitted \
  --reviewer "Named reviewer" \
  --comment "Completed the requested original-page interpretation review." \
  --at SELECTED_UTC_TIMESTAMP \
  --expected none \
  --out /private/pdf/recipient-record-submitted.json
~~~

A later edition supplies its actual predecessor SHA. The domain rejects stale
edition selection and repeated edition identities. Save status draft when work
is unfinished. Only a submitted edition can be exported as a return.

~~~sh
starforge merchant-accounting-bank-pdf-review return \
  --record /private/pdf/recipient-record-submitted.json \
  --edition SELECTED_EDITION_UUID \
  --out /private/pdf/recipient-return.json
~~~

The return retains the complete original issue and every edition through the
selected submitted edition. Later editions remain in the recipient's full record.
A submitted return is a proposal for author review, not a Bank acceptance.

## Compare against the current author working copy

Use the same issued review, complete recipient return and actual current author
working copy. The current copy may include later author edits and genuine Bank
import records, provided its full history continues the original issued copy.

~~~sh
starforge merchant-accounting-bank-pdf-review compare \
  --issue /private/pdf/issued-review.json \
  --returned /private/pdf/recipient-return.json \
  --current /private/pdf/current-author-working-copy.json \
  --out /private/pdf/return-comparison.json
~~~

For each proposed changed field, the comparison retains issued, current and
returned values and identifies a concurrent conflict or an already-current value.
It includes original account reconciliation for current and returned
interpretations. New interpreted items are compared as complete items.

The comparison covers accounts, regions, rows, balances and page reviews.
It does not replace the current financial import history with recipient data.
Original Bank effects are never performed by the comparison.

Choose keep or adopt explicitly for every comparison key, including apparently
nonconflicting or already-current changes. Copy each exact key from the complete
comparison JSON; do not construct keys from display labels. All keep preserves the
current working copy and its revision. Adoption may trigger original engine
invalidation, such as returning rows to review after a changed table region.

A selection JSON contains:

~~~json
{
  "choices": {
    "[\"pageReviews\",\"3\",\"note\"]": "adopt"
  },
  "decisionId": "SELECTED_DECISION_UUID",
  "author": "Statement author",
  "reason": "Reviewed the actual original page and accepted the stated interpretation.",
  "createdAt": "SELECTED_UTC_TIMESTAMP"
}
~~~

Use the complete set of actual comparison keys. Empty choices are valid only when
that comparison has no proposed changes. The placeholders must be replaced with
the retained valid UUID and UTC timestamp.

~~~sh
starforge merchant-accounting-bank-pdf-review decide \
  --issue /private/pdf/issued-review.json \
  --returned /private/pdf/recipient-return.json \
  --current /private/pdf/current-author-working-copy.json \
  --preview /private/pdf/return-comparison.json \
  --selection /private/pdf/author-selection.json \
  --out /private/pdf/author-decision.json
~~~

The author decision reason is at most 4,000 characters, matching the original edit engine. Issue purpose and recipient edition comments support up to 8,000 characters. The complete domain recomputes the comparison before deciding. A changed issued,
returned or current working copy invalidates the old comparison. The decision
records exact choices, author/reason, original applied operations, resulting
revision, complete new history entries and the full resulting working-copy hash.
The command writes the complete decision; it leaves all input files unchanged. If the exact destination already contains a decision, the command verifies its complete source context, comparison, choices, ID, author, reason and timestamp, then returns that original output without regenerating edit timestamps.

## Retain and explicitly apply the original decision

Retain all four complete source files before application:

~~~sh
starforge merchant-accounting-bank-pdf-review retain \
  --issue /private/pdf/issued-review.json \
  --returned /private/pdf/recipient-return.json \
  --current /private/pdf/current-author-working-copy.json \
  --decision /private/pdf/author-decision.json \
  --dir /private/pdf/author-application
~~~

The local directory contains:

| Member | Meaning |
| --- | --- |
| issued.json | Exact original named issue bytes |
| returned.json | Exact complete submitted return bytes |
| current-working-copy.json | Exact current author source bytes |
| decision.json | Exact complete author decision bytes |
| binding.json | Hash-bound inventory, issue/decision/current/result identities |
| lease.lock | Original process-held private state lease |
| applied-working-copy.json | Created only by explicit apply; complete resulting original PDF working copy |
| application.json | Exact completed application receipt and full output pin |

Private original inputs are copied byte-for-byte. The binding is published after
all four files are retained. A partial local retention can resume only with those
same complete inputs. A differing existing file is preserved and rejected.

~~~sh
starforge merchant-accounting-bank-pdf-review inspect-retained \
  --dir /private/pdf/author-application

starforge merchant-accounting-bank-pdf-review apply \
  --dir /private/pdf/author-application
~~~

Inspect is read-only and does not repair files. Apply uses the original
process-held state lease, verifies every complete input and recomputes the exact
author decision through the maintained domain. The domain restores only the
decision's recorded edit timestamps and verifies its complete resulting hash.
Replaying the same application yields the same working-copy bytes and receipt;
it does not add another interpretation revision.

The current input is never overwritten. The complete applied-working-copy.json
can be opened in the original PDF desk, with its original ID, PDF, extraction,
full prior history, accepted new edits and genuine Bank imports intact.

Files are atomically linked from flushed private temporary files and the parent
directory is synced. An interrupted same-inode link is settled only by a mutating
command with the exact expected bytes; unknown or changed files are preserved.
If the output file was published but the final receipt was not, repeat apply.
It retains the exact decided output and completes the same receipt. If a known
output is missing after a completed receipt, apply can reconstruct only those
same verified bytes; inspect will report the missing file rather than claim a
complete result.

Keep the entire application directory and complete recipient record with the
original project. Do not reduce the return to a change list or keep only a
screenshot. The underlying PDF and extraction are required for future review.

## Continue through the original PDF engine

Prepare one account's exact original Bank preview envelope after explicit local
application:

~~~sh
starforge merchant-accounting-bank-pdf-review source \
  --dir /private/pdf/author-application \
  --account ACTUAL_ACCOUNT_ID \
  --out /private/pdf/applied-account-source.json
~~~

This calls the original pdfSourceInput function. It requires complete page
coverage, included-row decisions and selected opening/closing balances. It retains
the complete original PDF, reviewed working interpretation, CSV and mapping
identity in the maintained PDF_REVIEW source shape. The source command prepares
a file; it does not invoke the Bank service.

For an inconsistent printed statement, an explicit
--acknowledge-balance-difference true retains that difference. No value is changed
to force reconciliation. Other original review problems remain blocking.

Pass the resulting complete input to the actual maintained Bank preview:

~~~sh
starforge bank-statements source-preview \
  --directory /private/accounting \
  --input /private/pdf/applied-account-source.json
~~~

Any subsequent receive-source operation uses the existing Bank engine, actual
workspace revision, source/account bindings, stable request ID and named actor.
A previously received interpretation follows the existing explicit supersedes
and correction-review flow. Existing matches, postings and closes remain in force
until their ordinary original undo/reopen/correction steps. This new CLI does not
automatically perform those effects or invent a second financial identity.

To produce the full original rendered package, invoke the original exporter
through the retained application:

~~~sh
starforge merchant-accounting-bank-pdf-review export \
  --dir /private/pdf/author-application \
  --out /private/pdf/applied-full-export \
  --account ACTUAL_ACCOUNT_ID
~~~

This delegates to the unchanged bank-pdf/cli.mjs export command. The complete
working copy is verified first. The original exporter produces the original PDF,
all extracted pages, all page renders, editable working copy, full interpretation
history, complete HTML report and manifest. With an account selected it also
writes the reviewed CSV, mapping, row map, reconciliation and source-input JSON.
The output directory must be new.

Optional --scale NUMBER, --password-env NAME and --pdfjs-root PATH are forwarded
to the original exporter. The new installed wrapper takes explicit Boolean values
for --text-only true|false and --acknowledge-balance-difference true|false.
Normal receiving renders every page. An explicit text-only export is identified
as such and cannot establish visual inspection.

The original exporter owns its PDF.js loading task and closes it in its existing
cleanup path. The installed wrapper holds only its original private state lease
and releases it on success or failure. It creates no browser server, worker
watcher or independent native receiving operation.

## Typed customer-agent use

Import from the installed package's declared
./merchant/accounting-bank-pdf-review export using its actual package name.
The functions operate complete JSON/domain values or Uint8Array inputs.

~~~js
const preview = await pdfReview.previewPdfReviewReturn({
  issue,
  returned,
  currentWorkingCopy
});

const { decision } = await pdfReview.decidePdfReviewReturn({
  issue,
  returned,
  currentWorkingCopy,
  preview,
  choices: exactChoicesFromTheCompleteComparison,
  decisionId: retainedDecisionId,
  author: decidingAuthor,
  reason: retainedReason,
  createdAt: retainedUtcTimestamp
});

const applied = await pdfReview.applyPdfReviewDecision({
  issue,
  returned,
  currentWorkingCopy,
  decision
});
~~~

Persist complete inputs and the full decision before relying on the result.
The installed CLI supplies that filesystem lifecycle. Programmatic consumers can
use verifyBankPdfReviewApplication with the complete issued, returned, current
and decision byte arrays to bind the same result. It does not contact a provider.

Types retain exact original working-copy, geometry, source reference, history,
account and prepared-source declarations. Amounts remain strings. Comparison
keys are opaque exact keys from the domain. Account and row IDs are original
model identifiers, not newly inferred financial IDs.

Issue, edit, edition and decision authoring are deliberate operations.
Select their IDs and timestamps once. Apply of a retained decision is the
deterministic recovery path. Receiving a return does not implicitly mark its
financial interpretation ready.

## Capacities and complete-file behavior

| Boundary | Existing limit |
| --- | ---: |
| Original PDF binary | 16,000,000 bytes |
| Original pages | 500 |
| Original extracted text items | 500,000 |
| Original review rows | 50,000 |
| Original complete working copy | 192 MiB |
| Named issue, return, preview or decision transfer | 384 MiB |
| Complete recipient working record | 512 MiB |
| Complete browser desk wrapper / source project / offline HTML | 768 MiB |
| Recipient editions | 256 |
| Complete interpretation history for this review | 20,000 operations |
| Editable raw text draft | 262,144 UTF-8 bytes |
| Complete original Bank preview request | 24,000,000 bytes |

Limits apply to complete serialized values and files. The filesystem application
directory retains four complete original inputs and its full result separately;
allow room for all of them. Its total disk usage can exceed one transfer's limit.
No file, page, extraction, history or edition is silently truncated to fit.

A large valid standalone review can exceed the existing Bank request limit.
Keep and operate its whole working copy. Use the original Bank guidance for an
issuer-provided source edition that fits the actual financial request boundary;
do not remove pages or history to manufacture a smaller statement.

## Interrupted work and stale decisions

- A repeated CLI edit with its same explicit item IDs verifies the existing output against the full prior record and original edit, preserving its actual history timestamp. A lost recipient save is recovered from the full local record or its complete
  downloaded working copy. The issue and prior editions remain intact.
- A dirty raw proposal must be explicitly applied or preserved before another
  operation. Unsaved text is not an accepted original-model edit.
- A stale edition SHA requires reopening the actual latest recipient record.
- A changed current author working copy requires a new full comparison and
  explicit author choices. The old return and old decision remain retained.
- A lost local application receipt resumes the same four-input directory and
  decision. No new review ID, result timestamp or history edition is generated.
- A partial original rendering/export remains with its existing complete files
  and failure output. Preserve it and follow the original CLI's new-output
  continuation guidance; do not call it a completed rendered package.
- An interrupted Bank request is reconciled through the original Bank request
  lookup and replay controls. This local review tool never guesses its outcome.

## Complete project delivery and original receiving ownership

Deliver the original PDF and full working copy, exact issued review, complete
recipient record and submitted return, author comparison/decision, retained
application directory, complete original exporter output and all actual Bank
source/operation receipts that were produced. Preserve the original model and
extractor source, review-domain/client/CLI source, installed declarations and
operating guides within the existing full distribution/project package.

The DFF77/RD12 original native PDF receiving course remains the sole execution
authority. This source contribution does not start another native operation,
browser or acquisition. It does not claim a rendered result from source parsing
or peer review.

Operate the exact cumulative outgoing edition through that existing equipped
receiver. View the actual PDF pages and wide/narrow browser screens, use the named
issue/recipient proposal/return/current-author controls, reopen full downloaded
records, inspect conflicts and error recovery, and open every delivered attachment
and usable archive/project. Preserve the original case, owner instructions,
source identities and all concurrent original-engine fixes.


## Additive browser course in the original PDF receiving operation

The callable `receive-review-browser.mjs` exports
`receiveBankPdfNamedReviewBrowser`. The original DFF77/RD12 receiver
passes its existing browser context and holds its original operation lease.
This function starts no browser process or server and performs no Bank mutation.

Supply the actual pinned `issuedReviewPath`, current author
`currentWorkingCopyPath`, complete installed
`sourceManifestPath`, original `operationId`,
`baseUrl` and retained `outDirectory`.
Its `proposal` is a deliberate original-engine
`{action,value,actor,reason}` edit. Retain every new or existing item
ID before dispatch. Select actual `editionReviewer` and
`editionComment`, then exact `decisionChoices`
from the same issued/current/returned comparison, with `decisionAuthor`
and a decision reason of at most 4,000 characters. The course invents no
financial facts or acceptance choices.

The course retains the complete input and exact source manifest, exercises raw
draft save/reload, recipient proposal and submitted return, author current
selection, explicit comparison and decision, original PDF pages and all four
tabs at desktop and 390-pixel width. It downloads the original PDF, whole
working record, complete source project and offline HTML and opens that HTML
again. All outputs stay in the original complete receiving directory.

Each local phase retains a whole working record and an unresolved intent before
dispatch. Resume with the same context/profile, source, operation and directory.
A completed retained phase is reused; an uncertain phase is reconciled against
its original saved case. If that case is unavailable or differs, preserve the
intent and live record and resolve the actual source before continuing. Do not
start a replacement review to conceal an unobserved local outcome.

Only the pages created by this helper are closed. The caller retains the original
context, server and lease. A closure failure returns a retryable closer for those
same pages; completion is published only after confirmed page closure. Include
the entire journal, request, working records, source, downloads and observed
screens in the original complete delivery. The screenshots must actually be
viewed and the exact outgoing attachments opened under the owner instruction
below. A captured screen or this prepared function is not a rendered acceptance.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949


### Literal attachment clarification

ALL ATTACHMENTS count. Literally open, view, play and use the final delivered HTML, PDF, report, slides, spreadsheet, map, image, video, audio, archive and project as its recipient would. For archives, extract and open the actual contained deliverables and working project. Tests, checklists and screenshots merely captured are not substitutes. Use available high-quality generative media models and natural voice generation/TTS for videos; avoid robotic default voices. Watch and listen to the final export for pronunciation, pacing, timing and audio alignment. Keep building and fixing; inspection is not review/test performance theatre.
