# Complete humanitarian receiving through the original Page

This module operates the existing humanitarian application. It borrows the caller's original Playwright Page, authenticated HumanitarianClient, workspace and output lease. The installed receiving parent owns Applications, fixed local ports, persistent Chromium profiles, the browser context, the native CLI and final customer archive.

Source file: browser.mjs
Exports: runHumanitarianBrowserReceiving and inspectHumanitarianReceivedPage

## Required lifetime and inputs

Keep one stable local origin and one caller-owned persistent Chromium profile for each application. Reuse the recipient profile for its final cold reopen. The application retains complete mutation inputs and receiving Blobs in IndexedDB under the exact workspace path; changing the origin or discarding its profile discards that recovery state.

Pass an existing private, real, operator-owned outputDirectory under the parent's held original operation lease. The caller must serialize all access to this directory. The callback writes its own complete selection, checkpoint, intent, observation and result files there. Its retain callback must durably save the entire supplied checkpoint before resolving.

directory is the unchanged workspace path returned by the original application. operationId identifies this one selected browser operation. actor is the full named {id, label} operator. The callbacks require an open original Page at the same origin as client.origin. They do not navigate to another service or create, close or replace the caller's application, client, browser, context or Page.

## Source review

Call:

~~~js
const result = await runHumanitarianBrowserReceiving({
  page,
  client,
  directory,
  outputDirectory,
  operationId,
  actor,
  before,
  report,
  history,
  checkpoint: retainedCheckpoint || null,
  retain: async completeCheckpoint => {
    await originalParentCheckpointWriter(completeCheckpoint);
  },
});
~~~

before is the complete actual review at the selected original core revision, normally r2 of humanitarian-receiving-example. report is its complete original report object. history is the original full history envelope with id and revisions. Never manufacture these objects from totals or summaries.

The callback preserves the original ID, name, both source editions, mapping identities, alias decisions and row policy. It changes only the named reviewer and appends an explicit operator note. The derived reference remains in the saved review; the raw save input correctly omits that derived field. The native engine determines the resulting status and report.

The actual UI generates the new request identifier when its complete-input preview is selected. The callback retains that full preview and downloads the exact input through the real UI. It submits those original bytes through the application's existing exact-input form. Before provider dispatch, it verifies the application's retained IndexedDB operation, saves the full input and receipt, and deliberately aborts that one request. It reloads the same Page and selects Continue original operation. The application reconciles the original request before any dispatch and retains the original native response.

If execution stops after the UI retains its preview or operation but before the external checkpoint, the callback reconciles the complete original preview, pending operation and immutable companion files. It does not allocate a replacement request. A completed native response is checked against the full original input, request hash and saved result.

The selected next review must have exactly one new revision, the same administrative reference and counts, and only the planned reviewer/note change. The complete report retains its source editions, layouts, comparison, issues and logical row identity. Historical selection remains pinned through the operated revision even when a later compatible local head exists.

## Actual views and complete files

The callback opens the actual source inventories, complete reference, each selected mapping, named resolution decisions, review and history controls. It reads every normalized source row page, every reporting output page and every comparison page through the actual UI, comparing each full response with the original typed client.

The application provides four complete download actions:

| Returned name | Actual UI action | Complete content |
| --- | --- | --- |
| review.zip | Download complete workspace ZIP | Original sources, native builds, reference, mappings, decisions, original requests, review history and reporting files |
| report.zip | Download complete report ZIP | Complete SQLite, normalized JSONL, layouts, ordinary CSV, HXL, Excel-import CSV, comparison, Kobo tables and offline HTML |
| report.json | Download complete report JSON | The entire selected saved report |
| review-input.json | Download selected review input | The entire unchanged native save input with its original request identifier |

There is no history-download button. Complete history is retained through the original history API and the full workspace ZIP.

Every returned file descriptor is {name, path, bytes, sha256}. The source callback also returns eight PNG descriptors whose names begin with view-source-: sources, reference, mapping, resolution, review, results, phone and handover. Desktop views use a 1360 by 900 viewport; phone views use 390 by 844. Captures are ordinary bounded viewport images. All complete model, page and export checks remain independent of those images.

The output directory also contains private original input, full page observations, request/result receipts, download intents and checkpoints. The parent may select the public semantic records, complete downloads and PNGs for its complete engineering handover while preserving private connection information separately. No capability token is written into the selected browser input metadata.

A completed download is fully read, hashed and semantically checked before its immutable receipt is published. The receipt precedes final rename. Retry verifies that original receipt and full saved file, or finishes its retained complete stage, before another download click. Viewports follow the same receipt-before-rename rule. Partial stages stay private and are never accepted as completed files.

Source return:

~~~js
{
  reviewed,       // Complete saved next review
  report,         // Complete selected report
  request,        // Flat original UI-generated native save input
  files,          // Four complete downloads plus eight viewport descriptors
  receipt,        // Full operated-workflow receipt
  checkpoint,     // Complete latest checkpoint; also passed to retain
}
~~~

## Independent receiving and cold reopen

Stop the source application before the parent's original CLI and recipient stages. Use a separate operator-owned receiving workspace. The callback does not reuse or overwrite the core driver's separate practice workspace.

Call:

~~~js
const inspected = await inspectHumanitarianReceivedPage({
  page: receivedPage,
  client: receivedClient,
  directory: receivedDirectory,
  outputDirectory: receivedPageOutput,
  operationId,
  actor,
  review: sourceResult.reviewed,
  report: sourceResult.report,
  history: originalSelectedHistory,
  name: 'received',
  checkpoint: receivedCheckpoint || null,
  retain: originalRecipientCheckpointWriter,
  receiveFile: sourceResult.files.find(file => file.name === 'review.zip'),
});
~~~

name is a stable lowercase slug, at most forty letters, digits or hyphens, beginning with a letter or digit. Use a separate private output directory for each received or cold-reopened observation.

receiveFile selects the complete original ZIP by path, byte count and SHA-256. The Page submits it through the actual Receive complete package form. Before dispatch, the application has durably saved the entire Blob and its streaming digest. The callback verifies that retained Blob with the original operator's bounded streaming SHA-256 helper, records the complete operation, interrupts before provider dispatch, reloads the same original Page/profile and continues that operation.

The native receiving result must select the expected review ID and every revision through the selected revision. A later compatible local head is preserved. The callback then opens the explicitly selected historical revision and verifies its full original report and history. It operates all source/reference/mapping/decision/reporting/comparison views and retains the same eight desktop/phone observations.

For the final cold reopen, the parent first closes its owned application and client, performs its original native CLI reopen checks, then reopens the same workspace and persistent recipient profile. Call inspectHumanitarianReceivedPage again with a new observation name/outputDirectory and no receiveFile. This performs a read-only Page inspection of that actual retained revision.

Recipient return:

~~~js
{ files, receipt, checkpoint }
~~~

files contains the eight complete viewport PNG descriptors. The full original history and any actual receiving result remain in the receipt.

The full report's semantic identity excludes physical SQLite file descriptors. The corrected core verifies every original native/reporting database schema and logical record before receiving history. Independently rebuilt native SQLite bytes may differ between supported runtime versions. The parent must verify cross-workspace complete archives through original native receiving and full semantic membership, rather than assuming byte identity across platforms. Repeated exports from the same unchanged workspace retain their original exact bytes.

## Failure and continuation

Retain the complete callback output directory and caller checkpoint on any error. A rejected native input, different pending operation, changed original file or conflicting history is a real failure; do not clear browser storage, edit a retained request, replace its UUID or silently choose a new workspace.

Immediate rejection observers are attached to every event wait. Route handlers are drained and listeners removed before the callback returns. The caller then closes only resources it owns through its original lifecycle. The callbacks never terminate the borrowed application or Chromium process.

Full source has been parsed as an ECMAScript module and joined against the actual UI, client, native request/receive and history contracts. This source handover does not claim a browser result before the original installed parent executes it.
