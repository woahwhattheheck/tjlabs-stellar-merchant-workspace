# Reviewed application CSV import sessions

This workflow imports one complete original application CSV through explicitly reviewed batches. It extends the existing grant-portfolio application exchange; it uses the original CSV parser, document object store, portfolio action, request history, retry/resume and workspace export/receive.

Use it when a complete mapped import would exceed the original 1 MiB action limit. The entire source remains limited to 8 MiB and 2,000 data rows. A session contains 1–128 supplied batches. These are supported input bounds, not a production-scale performance claim. Existing single-import calls without rowIndexes keep their original behavior.

## What is retained

The original CSV is never split, rewritten or converted to a different financial representation. Every batch references that complete file's exact SHA-256 and byte count. The object store can reuse the same hash-addressed object; each batch records its own complete column mapping and explicit zero-based data-row indexes in a distinct programme document. A row index counts CSV records after the header, including quoted multiline cells as one record.

The complete session records the original workspace UUID, initial portfolio revision/snapshot, published round edition, actor, column mapping, stable application/partner/project IDs, exact source identity, every supplied operation/document ID and a partition covering every source row exactly once. Each batch's initial action byte count is a planning check only.

Each actual batch is separately prepared against its current selected portfolio revision after all preceding original requests have completed. The saved batch contains its complete action and SHA-256, its historical basis and the exact earlier completion digests. A published round, selected organisation/project or undispatched application that changes requires explicit review of a successor session. Unrelated intervening portfolio edits are included only through an explicit fresh batch review.

A session is not a single atomic transaction across all batches. Every batch is one existing atomic portfolio.save. If batch 2 fails, batch 1 remains completed and preserved. No rollback, duplicate award, payment action or new financial ledger is introduced.

## Native API

Import from grant-portfolio/awards-import-session.mjs:

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

The session's canonical JSON is bounded to 32 MiB; retained indented session, batch and result files are read and written within the same 64 MiB file limit. The raw CSV and individual action retain their separate 8 MiB and 1 MiB limits.

Every batch index list must be nonempty and increasing. All lists together must partition the original data rows exactly once. Supply one application identity per original reference and one actual programme partner identity per mapped partner key. The API does not guess identities, split rows automatically, convert currencies, infer eligibility or invent funding criteria.

For submitted applications, select status submitted and map the original submission-date column. Otherwise applications remain drafts. Existing original drafts may be updated only when their exact reference and round match. Recorded or archived editions require their normal following-record workflow.

## File-based operator commands

Use the original running private Console's connection file. The CLI reads that existing connection through connectGrantPortfolio; it does not launch another server. Create a private operator-owned output directory using the normal workspace tooling. All supplied file paths must be absolute; output parents must be real private directories.

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

Run the import and receive phases against those actual connections. Keep the same output directory and recording actor throughout:

~~~sh
node grant-portfolio/examples/awards/import-session-receiving.mjs \
  --phase import \
  --source-connection /private/source-console.json \
  --recipient-connection /private/recipient-console.json \
  --out /private/csv-session-receiving \
  --actor "Internal receiving operator"

node grant-portfolio/examples/awards/import-session-receiving.mjs \
  --phase receive \
  --source-connection /private/source-console.json \
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

The directory retains the original CSV, selection and session, both reviewed batch files, actual request returns, source-evidence downloads, application JSON/CSV, complete source and recipient ZIPs, and separate import/receive/final records. Deliver the whole directory with the selected source edition and the accepting worker's actual process-closure receipt. These instructions define the native receiving procedure; they do not claim it has run.

## Validation and commercial scope

The source adds a reusable import workflow, not a customer-specific bursary policy. Financial values remain original strings and use the maintained domain validation; round criteria, partner mappings and dates remain operator-supplied. No banking, payment provider, credit decision, institution login or Blackbullion tenant integration is present.

The receiving course uses explicit internal applications and the original Workspace/Console/client. It checks an input whose combined action exceeds 1 MiB, two reviewed bounded batches, unchanged raw CSV evidence, exact decimal strings, original request replay, cold reopening and independent complete export/receive. Report its actual execution result separately from publication. The existence of this source does not establish production throughput or acceptance of a proposed commercial scope.
