# Reviewed application CSV import sessions

This workflow imports one complete original application CSV through explicitly reviewed batches. It extends the existing grant-portfolio application exchange; it uses the original CSV parser, document object store, portfolio action, request history, retry/resume and workspace export/receive.

Use it when a complete mapped import would exceed the original 1 MiB action limit. The complete source may contain up to 25,000 data rows and 64 MiB. Sources above 2,000 rows have at most 50 columns; the existing smaller-source 1,000-column allowance remains available. A session contains 1–25,000 supplied batches, each with at most 2,000 selected rows and an action below 1 MiB. Existing single-import calls and retained sessions preserve their original identities and interpretation.

## What is retained

The original CSV is never split, rewritten or converted to a different financial representation. Every batch references that complete file's exact SHA-256 and byte count. The object store can reuse the same hash-addressed object; each batch records its own complete column mapping and exact selected source records in a distinct programme document. New sources above 2,000 rows retain compact half-open selected-row ranges [start, end) in that document; smaller sources retain their original explicit zero-based row-index representation. The saved session always keeps its full explicit batch row indexes. A row index counts CSV records after the header, including quoted multiline cells as one record.

The complete session records the original workspace UUID, initial portfolio revision/snapshot, published round edition, actor, column mapping, stable application/partner/project IDs, exact source identity, every supplied operation/document ID and a partition covering every source row exactly once. Each batch's initial action byte count is a planning check only.

Each actual batch is separately prepared against its current selected portfolio revision after all preceding original requests have completed. The saved batch contains its complete action and SHA-256, its historical basis and the exact earlier completion digests. A published round, selected organisation/project or undispatched application that changes requires explicit review of a successor session. Unrelated intervening portfolio edits are included only through an explicit fresh batch review.

A session is not a single atomic transaction across all batches. Every batch is one existing atomic portfolio.save. If batch 2 fails, batch 1 remains completed and preserved. No rollback, duplicate award, payment action or new financial ledger is introduced.

## Native API

Import from grant-portfolio/awards-import-session.mjs:

- proposeAwardCsvImportBatches(portfolio,input,{operationPrefix,documentIds,maxRows:1000}) returns a proposed complete partition using caller-supplied operation and document identities. It tries the selected row count, then reduces a batch only when the original action or mapping-size bounds require it. Mapping and identity errors remain errors. It performs no write and allocates no identity.
- prepareAwardCsvImportSession(portfolio,input) prepares the complete reviewed partition. It performs no network write.
- reviewAwardCsvSessionBatch(client,session,csv,index) reads the original session basis, preceding actual requests and the selected current basis. It returns {batch,request}; an already admitted operation returns its exact original plan.
- submitAwardCsvSessionBatch(client,session,batch,csv,options) dispatches only that saved batch. It returns an already RUNNING or COMPLETED request without sending it again. A FAILED request resumes only with resumeFailed:true and the original provider's retryable flag.
- inspectAwardCsvImportSession(client,session,csv) reads all original operation states without creating, uploading or resuming anything. It returns compact request identities and hashes; the original workspace retains their complete inputs/results.

Retain the complete session and every reviewed batch before dispatch. Keep the exact raw CSV and every actual returned request. Do not reconstruct operation IDs after an interruption. A transport error is not evidence of rejection: read the original request first.

The APIs borrow the existing GrantPortfolioClient. They do not stop its Console or change its credentials. Source input never contains an access token.

## Input selection

The prepare input is the original CSV mapping/identity shape with supplied sessionId and batches. workspaceId comes from the actual connected workspace in the CLI; csv comes from the selected complete file. The module API requires both explicitly.

Example shape (replace all example identities with the operator's actual selections):

~~~json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "filename": "original-applications.csv",
  "roundId": "22222222-2222-4222-8222-222222222222",
  "actor": "Actual recording operator",
  "status": "draft",
  "mapping": {
    "reference": "Reference",
    "title": "Title",
    "legalName": "Legal name",
    "partnerKey": "Organisation",
    "amount": "Requested amount",
    "currency": "Currency",
    "answers": {"actual-published-criterion-key": "Response"}
  },
  "identities": {
    "applications": {
      "APPLICATION-1": "33333333-3333-4333-8333-333333333333",
      "APPLICATION-2": "44444444-4444-4444-8444-444444444444"
    },
    "partners": {
      "ACTUAL-ORGANISATION": "55555555-5555-4555-8555-555555555555"
    }
  },
  "batches": [
    {
      "operationId": "institution-round-import-001",
      "documentId": "66666666-6666-4666-8666-666666666666",
      "rowIndexes": [0]
    },
    {
      "operationId": "institution-round-import-002",
      "documentId": "77777777-7777-4777-8777-777777777777",
      "rowIndexes": [1]
    }
  ]
}
~~~

The session's canonical JSON remains bounded to 32 MiB. Complete successful client JSON responses and retained CLI JSON files allow 512 MiB, covering complete portfolio models and original request returns. The awards model allows 128 MiB; governance, programme and planning retain their own limits. Raw CSV has a separate 64 MiB bound; every action remains at most 1 MiB. Archive download, verification and upload use streamed bytes, with the existing 4 GiB archive bound.

Every batch index list must be nonempty and increasing. All lists together must partition the original data rows exactly once. Supply one application identity per original reference and one actual programme partner identity per mapped partner key. The API does not guess identities, convert currencies, infer eligibility or invent funding criteria. The optional proposer partitions rows for operator review; it never dispatches that proposed partition.

For submitted applications, select status submitted and map the original submission-date column. Otherwise applications remain drafts. Existing original drafts may be updated only when their exact reference and round match. Recorded or archived editions require their normal following-record workflow.

## Use the maintained Awards browser

Open the actual current portfolio's application CSV intake. Choose the complete original CSV and published round, map its exact columns, and select the original applicant organisations and stable application identities. Large source and application lists are paged and searchable; the complete source stays retained.

Choose **Maximum rows per reviewed batch** (1–2,000; default 1,000), then **Prepare reviewed batches**. Review the complete source SHA-256, row count, proposed original operations and selected row ranges. Use **Download complete session and reviewed batch** before saving. The browser downloads a `stellar-forge.awards-browser-session.v1` file containing the complete unchanged session and any currently reviewed batch; retain the original CSV separately.

Select **Review batch N**, inspect its complete application values, identities and current portfolio revision, and use **Download this original batch plan**. Only **Save reviewed batch** admits that specific reviewed operation through the original writer. Use **Inspect original operations** to reconcile a pending or interrupted outcome. Completed batches remain recorded; later batches require their own current review.

For continuation after closing or restarting the Console, reopen the same portfolio. Select the exact original CSV and the saved file under **Saved import plan**, then choose **Review original saved import**. The shared engine verifies the source and workspace identity, original session and current operation history. A changed selection requires an explicit new review. A received workspace can inspect its retained history and prepare its own following work; it cannot dispatch the source workspace's historical session.

The portable session and native wrapper use the same implementation. The file commands below provide the same proposal, preparation, review, save and outcome inspection for an operator who prefers complete files.

## File-based operator commands

Use the original running private Console's connection file. The CLI reads that existing connection through connectGrantPortfolio; it does not launch another server. Create a private operator-owned output directory using the normal workspace tooling. All supplied file paths must be absolute; output parents must be real private directories.

To prepare a proposed partition, provide the same complete selection without `batches` and add `proposal` containing the retained `operationPrefix`, up to 25,000 distinct allocated `documentIds`, and optional `maxRows` (default 1,000). Keep `sessionId` and every application identity in that original input. The command writes an ordinary complete prepare input containing the proposed `batches`; inspect it before calling prepare. Reuse the same prefix and allocated identities after an interruption.

~~~sh
node grant-portfolio/awards-import-session-cli.mjs propose \
  --connection /private/console.json \
  --portfolio ACTUAL_PORTFOLIO_UUID \
  --input /private/proposed-selection.json \
  --csv /private/original-applications.csv \
  --out /private/import/import-selection.json
~~~

~~~sh
node grant-portfolio/awards-import-session-cli.mjs prepare \
  --connection /private/console.json \
  --portfolio ACTUAL_PORTFOLIO_UUID \
  --input /private/import-selection.json \
  --csv /private/original-applications.csv \
  --out /private/import/session.json

node grant-portfolio/awards-import-session-cli.mjs review \
  --connection /private/console.json \
  --session /private/import/session.json \
  --csv /private/original-applications.csv \
  --index 0 \
  --out /private/import/batch-0.json
~~~

Read the saved batch's complete action, selected rows, source hash, mapping, original record IDs and exact revision before submitting:

~~~sh
node grant-portfolio/awards-import-session-cli.mjs submit \
  --connection /private/console.json \
  --session /private/import/session.json \
  --csv /private/original-applications.csv \
  --batch /private/import/batch-0.json \
  --out /private/import/batch-0-return-1.json

node grant-portfolio/awards-import-session-cli.mjs inspect \
  --connection /private/console.json \
  --session /private/import/session.json \
  --csv /private/original-applications.csv \
  --out /private/import/observation-1.json
~~~

The actual provider may return RUNNING. A repeated submit using the same saved batch reads that original request; it does not launch another action. Retain each changed return under a new filename, such as batch-0-return-2.json. Existing files are immutable and are only reused if their complete bytes match. A receipt write failure does not authorize replaying a provider write.

A completed first batch allows review of --index 1. Save that newly reviewed batch before submitting it. The tool never automatically starts it. To resume an actual retryable FAILED request, use the same command, same session and same batch with --resume-failed true. This flag is not an instruction to recreate an operation, rebase an action, or ignore a nonretryable conflict.

If the current portfolio changed after a batch review but before admission, preserve the old batch file and explicitly review again into a new file. The operation ID can retain a newly reviewed input only if the original request remains absent; once admitted, the original request's input is authoritative. A changed round, selected partner/project or application requires a successor session with new operation/document IDs for work not already completed.

## Complete delivery and independent receiving

After all original requests are COMPLETED, inspect reports COMPLETE and completedRows equals sourceRows. This means application-record import completed. It does not mean eligibility, funding approval, an award, payment or customer acceptance.

Use the original full portfolio export/receive for handover. That archive carries every portfolio revision, original request, complete programme document object and application edition. Deliver the raw CSV, session file, all reviewed batch files, actual request returns and the full original workspace export together. The ordinary application JSON/CSV export remains available through exportAwardApplications and the current Awards UI.

A received workspace has its own workspace identity. Historical session evidence remains valid provenance; dispatch is deliberately bound to the original workspace and cannot silently continue into the recipient's workspace. If the recipient has additional work, select its actual workspace and explicitly prepare its own successor session without resetting the received records.

## Execute the complete internal receiving course

Use the same selected product edition for two separate private workspaces and their original Console launch/binding workflow. The course borrows their connection files; its caller does not start, stop or replace either Console. The original accepting worker owns those processes and the existing process-family scope.

A fresh selection creates 25,000 internal applications from one 50-column CSV containing a UTF-8 BOM, quoted commas, quoted CRLF, non-ASCII text, and the exact amount `9007199254740993.0100`. All 43 unmapped columns remain in the complete original source. The proposed partition targets 1,000 rows per action and reduces only for an actual action or evidence-size limit. Previously retained v1 selections continue their original 240-row, two-batch course with the same source bytes and IDs.

Keep the same output directory and recording actor throughout. The fresh source-sized import has two deliberate continuation boundaries:

1. The first invocation returns `AWAITING_CONTINUATION` after the first original batch and its recovered outcome. Rerun the same import command; it reads the completed original operation and confirms that recovery added no revision.
2. Before the final batch it returns `AWAITING_COLD_REOPEN`. The existing owning worker stops and cold reopens the **same source workspace** through its original Console workflow. Rerun import with that Console's actual new connection file. The course verifies the changed process ID, unchanged workspace/revision and same session, then reviews and admits the final batch.
3. When import returns `COMPLETE`, run receive. Do not use a fresh selection, new output directory or replacement operation IDs for either boundary.

The course borrows actual connections and never launches a new Console or process controller.

~~~sh
node grant-portfolio/examples/awards/import-session-receiving.mjs \
  --phase import \
  --source-connection /private/source-console.json \
  --recipient-connection /private/recipient-console.json \
  --out /private/csv-session-receiving \
  --actor "Internal receiving operator"
~~~

After the first return, repeat that command. At the cold boundary, reopen the original source Console and pass its new connection file to the same command. Then receive the complete export using the current source connection:

~~~sh
node grant-portfolio/examples/awards/import-session-receiving.mjs \
  --phase receive \
  --source-connection /private/source-console-current.json \
  --recipient-connection /private/recipient-console.json \
  --out /private/csv-session-receiving \
  --actor "Internal receiving operator"
~~~

After both phases return COMPLETE, stop both Consoles through their original owning foreground and reopen the same two workspaces. Supply their actual new connection files to the final phase:

~~~sh
node grant-portfolio/examples/awards/import-session-receiving.mjs \
  --phase reopen \
  --source-connection /private/source-console-reopened.json \
  --recipient-connection /private/recipient-console-reopened.json \
  --out /private/csv-session-receiving \
  --actor "Internal receiving operator"
~~~

The final phase requires both recorded Console PIDs to differ from the earlier launches and their original workspace identities to remain unchanged. The source input, selection, action IDs, saved session and complete returns survive a restart in that same directory. An incomplete or failed original action is reconciled through its retained request; it is never replaced with a newly generated fixture.

The directory retains the complete original CSV, selection and session, every reviewed batch, actual request returns, first-batch continuation and pre-final cold-reopen evidence, all source-document downloads, application JSON/CSV, complete source and recipient ZIPs, and separate import/receive/final records. Archive identity is streamed; complete historical tables are compared page by page in their original order. Every revision, complete request and original document remains in the native archive. Deliver the whole directory with the selected source edition and the accepting worker's actual process-closure receipt. These instructions define the native receiving procedure; they do not claim it has run.

## Validation and commercial scope

The source adds a reusable import workflow, not a customer-specific bursary policy. Financial values remain original strings and use the maintained domain validation; round criteria, partner mappings and dates remain operator-supplied. No banking, payment provider, credit decision, institution login or customer tenant integration is present.

The receiving course uses explicit internal applications and the original Workspace/Console/client. For a fresh selection it exercises 25,000 records and 50 source columns, reviewed bounded batches, a first-batch continuation, a real cold reopen before the final batch, unchanged complete CSV evidence, exact decimal strings, all original revisions and requests, independent full export/receive, and another cold reopen of both workspaces. Existing v1 selections retain their original two-batch course. Report its actual execution result separately from publication. The existence of this source does not establish production throughput or acceptance of a proposed commercial scope.

## Retain source-row decisions and import accepted applications

The original complete-source v1 flow remains available. The following v2 flow
accounts for every original CSV data row before choosing the rows to write. Each
row is explicitly an accepted application, a reviewed exception, or an agreed
non-application. Every correction, exception and non-application requires a
recorded reason of at most 4,000 characters. A pending row blocks preparation;
it is never silently skipped.

Original source identity is the complete byte SHA-256 plus the zero-based data
row index and the hash of that row's ordered original headers and values. Row
positions always refer to the unfiltered source. The sealed review preserves
every decision, application UUID and literal working correction. It does not
rewrite the CSV, trim references, infer missing amounts or silently choose a
duplicate occurrence. Malformed CSV quoting/columns and invalid UTF-8 remain
source-level errors because skipping those records would change row identities.

### Browser: review, retain unfinished work, match, save and reopen

1. Open Application CSV intake, choose the original file and published round,
   and map the exact columns. Choose **Review original source rows**.
2. Inspect the paged original rows. Use **Inspect original row N** for every
   original cell and its optional literal working correction. Checked corrections
   affect the mapped application; the original column value remains visible.
   Unchecking a correction preserves its unfinished text in the working file.
   It stops applying that text to the sealed review; recheck it to use it again.
3. Choose each disposition and record the exception/agreement reason. **Accept
   pending rows with unique references** is an explicit bulk choice for those
   pending rows only. Duplicate or blank references remain for individual review.
   Accepted fields and identities are still validated against the published
   round and native record rules before preparation.
4. **Download unfinished source review** retains all decisions, literal
   corrections, column mappings, selected IDs and original source identity,
   including still-pending work. **Download original CSV** retains the complete
   companion. Neither command writes an application.
5. Reopen by selecting that same original CSV and the unfinished JSON under
   **Saved import plan**, then **Review original saved import**. The current
   portfolio must match its retained basis. A mismatched source or basis leaves
   the retained file intact; select its original revision rather than pretending
   the earlier review approved a changed programme.
6. **Match accepted programme records** shows only accepted effective keys and
   applications. Original source row numbers remain visible. Choose actual
   partners/projects and whether the selected accepted identity creates a record
   or updates an existing draft.
7. **Prepare reviewed batches** seals the complete row review and partitions
   only accepted original indexes. Download the complete session before saving.
   Review and save each batch through the existing native action controls.
8. The session shows accepted, exception and non-application counts separately
   from the number actually recorded. Download the complete sealed review,
   original source and reviewed batch/session files. Reopen them through the
   same saved-import route and **Inspect original operations** before resuming.

An all-exception/non-application review produces one evidence-only native
portfolio action. It saves the complete original CSV and sealed row-review JSON
as programme documents without adding an awards change. Thus a source with no
accepted applications still has a durable native record and full archive
reopening.

The original CSV object and complete canonical sealed review JSON are uploaded
and retained in the same native programme transaction as the accepted batch.
Application evidence references both objects. Batch mapping documents contain a
compact review identity; the complete reasons and corrections live in the
retained JSON object, not a truncated mapping string. Independent native
portfolio export/receive retains those original objects, every saved revision and
the original request results.

A sealed review/session is immutable. A different decision, correction, mapping
or programme basis requires an explicitly prepared successor and new native
operation/document identities. Never change a saved admitted action or reuse its
ID with a new decision. Previously saved applications remain authoritative; the
normal existing-draft rules still control any subsequent update.

### CLI: prepare a complete review without dispatch

Create a review input JSON with reviewId, filename, roundId, actor, status, the
exact mapping and programme identity maps, plus one decision per original row.
Each decision supplies rowIndex, disposition, reason and literal corrections;
accepted decisions also supply applicationId. Keep the separately selected
complete CSV.

```sh
node awards-import-session-cli.mjs review-rows \
--connection /ABSOLUTE/private/console-url.json \
--portfolio ORIGINAL_PORTFOLIO_UUID \
--input /ABSOLUTE/private/row-decisions.json \
--csv /ABSOLUTE/private/original.csv \
--out /ABSOLUTE/private/sealed-row-review.json
```

The command reads the current original portfolio and writes only the retained
sealed review file. It does not upload or dispatch an application. Pass that file
and one supplied stable evidence UUID to the existing proposal/prepare flow:

```sh
node awards-import-session-cli.mjs propose \
--connection /ABSOLUTE/private/console-url.json \
--portfolio ORIGINAL_PORTFOLIO_UUID \
--input /ABSOLUTE/private/proposal-input.json \
--csv /ABSOLUTE/private/original.csv \
--row-review /ABSOLUTE/private/sealed-row-review.json \
--review-document ROW_REVIEW_DOCUMENT_UUID \
--out /ABSOLUTE/private/proposed-batches.json
```

The proposal input retains the existing sessionId, filename, roundId, actor,
mapping, identities, status and supplied proposal operationPrefix/documentIds.
Its output includes the sealed review and evidence document identity. Use the
ordinary prepare command on that complete output, then review/submit/inspect as
above. Accepted original indexes can be noncontiguous; they are never renumbered.
The existing 64 MiB source, 25,000-row, 32 MiB canonical session and 1 MiB action
limits remain. All legacy v1 saved selections preserve their original bytes and
meaning.

## Complete saved intake work

The browser now retains named complete intake working copies in addition to the original saved plans and sessions. Open **Saved intake work** from Awards to inspect, restore or download a local copy. **Download complete working file** contains the exact original CSV, every active and inactive correction draft, row decisions, mappings, native identities, editor position, original session and reviewed batch, and all local checkpoints.

See [Saved Grant intake work](AWARDS_INTAKE_WORKING_FILES.md) for the full operator flow and storage recovery. The application also serves that guide from **Read saved-intake guide** in the intake panel.

Close/Escape finishes local retention before leaving. If storage fails, download the exact current complete working file and then Close; an edit after the download requires another complete download. Portable restoration branches into a new local copy and preserves displaced live work. Same-browser library restoration uses exact revision comparison before replacement. Native portfolio selection remains explicit; a saved session is reconciled against its original requests before continuation.

The saved-intake format does not change v1 plans, v1/v2 import sessions or native action bodies. Original source loading remains available while an original operation is pending, while new mapped preparation and writes retain the original current-selection/pending-operation guards. Opening or restoring working data does not submit applications.

## Resolve remaining original rows after a completed mixed intake

A completed intake may contain accepted applications, retained exceptions and agreed non-applications. Open its complete original session and CSV, inspect the native operations, then choose **Resolve remaining original rows**. The operator selects the latest original portfolio. Earlier accepted decisions stay accepted and read-only. Correct a remaining row explicitly, retain the reason, choose its disposition, and prepare reviewed batches. Only newly accepted original row indexes enter these new batches.

The resulting v3 session contains the whole current row review plus the complete prior session and original completion bindings. Each carried result names its source row hash, application ID and historical revision/SHA, original operation and request/input SHA, and resulting portfolio revision/snapshot. Preparing a continuation reads the actual original native requests and historical portfolio results. Imported JSON alone never establishes completion. Every prior batch must first be reconciled to COMPLETED; a running or failed batch continues under its original operation before a successor is prepared.

Previously accepted applications can have later legitimate editions. A submitted application that was subsequently withdrawn remains withdrawn. The successor verifies the original historical acceptance and the present application identity/round; it does not restore the old body or write that application again. The original published round, column meanings, submission status, accepted decisions and selected carried partner/project identities remain bound. A different source or reinterpretation is a separate intake.

### Native API

`readAwardCsvImportContinuation(client, previousSession, csv)` is read-only and returns `{continuation, portfolio}`. Use that current portfolio as the new row-review basis. Preserve every prior accepted row decision exactly, and include `previousReviewSha256: previousSession.input.rowReview.sha256` in the new review. Allocate fresh review/session/document IDs and a fresh operation prefix. Pass the complete `continuation` and a distinct `continuationDocumentId` alongside `rowReview` and `reviewDocumentId` to the existing proposer and session preparer.

The proposer computes new accepted indexes after subtracting carried accepted indexes. Its batches retain original CSV indexes, never filtered ordinals. A successor with no newly accepted rows uses one evidence-only action, retaining the new reviewed disposition record without rewriting awards. The original submission, review and inspection APIs operate the v3 session. Standalone single-import submission remains for v1/v2; continuation dispatch uses the complete session engine.

Each new batch stores the unchanged original CSV, the complete current review and a separate complete completion-history JSON object as native programme documents. Full workspace export/independent receive carries these objects and all native portfolio/request history. Observation distinguishes `completedRows` in this successor, `carriedRows`, `recordedRows` across generations and `newlyAcceptedRows`.

### CLI continuation

Use the same connection and retained original operation directory. These commands are source review/preparation until the existing explicit `submit` command is used:

```sh
node awards-import-session-cli.mjs continue --connection /absolute/source/console-url.json --session /absolute/work/original-session.json --csv /absolute/work/original.csv --out /absolute/work/completed-continuation.json
node awards-import-session-cli.mjs review-rows --connection /absolute/source/console-url.json --portfolio ORIGINAL_PORTFOLIO_UUID --input /absolute/work/successor-row-decisions.json --csv /absolute/work/original.csv --out /absolute/work/successor-review.json
node awards-import-session-cli.mjs propose --connection /absolute/source/console-url.json --portfolio ORIGINAL_PORTFOLIO_UUID --input /absolute/work/successor-proposal.json --csv /absolute/work/original.csv --row-review /absolute/work/successor-review.json --review-document NEW_REVIEW_DOCUMENT_UUID --continuation /absolute/work/completed-continuation.json --continuation-document NEW_HISTORY_DOCUMENT_UUID --out /absolute/work/successor-prepare-input.json
node awards-import-session-cli.mjs prepare --connection /absolute/source/console-url.json --portfolio ORIGINAL_PORTFOLIO_UUID --input /absolute/work/successor-prepare-input.json --csv /absolute/work/original.csv --out /absolute/work/successor-session.json
```

The row-decisions input is the complete original review input with a fresh reviewId, current explicit decisions, exact previousReviewSha256, and the original mapping/identities. The proposal retains a fresh sessionId and caller-allocated proposal.operationPrefix/documentIds/maxRows. The proposer output already contains the supplied review and continuation, so the subsequent prepare command does not supply them twice. Keep all generated files. Existing review/submit/inspect commands select the new complete session and retain each original batch.

### Bounds and compatibility

v1 and v2 saved sessions/actions keep their original schema and bytes. v3 keeps one complete predecessor per generation; the CSV is attached separately once by content identity. Earlier reviews/outcomes are retained in order, not replaced by a latest-only summary. The complete session remains bounded at 32 MiB, and the continuation carrier at 32 MiB; a size error preserves the original files and requires explicit scope handling. No history is silently truncated. The 64 MiB/25,000-row original source and original native action limits remain in force.
