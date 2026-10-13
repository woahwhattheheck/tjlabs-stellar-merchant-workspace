# HILA receiving through the original application Page

This module completes the browser portion of the existing HILA receiving programme. It borrows the caller's actual HILA application Page and typed client, operates the existing review and receiving controls, and returns complete original downloads for the caller's independent CLI/client comparisons and final customer handover.

The module is used by the same installed receiving controller as the native model, Applications, CLI and typed-client stages. It does not start another workspace, server or browser. Its two exported functions are runHilaBrowserReceiving and inspectHilaReceivedPage.

## Selected source and original review

The interface was joined against the complete HILA UI, index and client at application commit 5ac4b2893d50a3dbc1ab08e9ecaf89463ec15baa:

| Original file | Complete Git blob |
| --- | --- |
| hila/public/app.js | d63d096703cab5b72b39d42bf5c169749d469b48 |
| hila/public/index.html | 9c29f2c889643631522979ac793f260650a914e2 |
| hila/client.mjs | e5ff6b5efe9b44a89ca561e4d163991ec6ac2d19 |

Paths in this guide are relative to stellar/scf-starforge-20261009/sf30-seller-sdk unless stated otherwise. The full HILA product, receiving controller and original runtime preparation guide remain authoritative for installation.

The source stage receives the complete saved revision-four review from the native model. It preserves its name, notes, editions, methodology/rules, source selection, named review, row decisions and cell decisions. For the original complete receiving case, all country, sector, organization and role selection arrays are empty. Existing exclusions and notes remain in the complete definition.

The original source review is 61014d248ba1ac501586aa6906f3b8d9d453525bee407b13fc79bd832a22c7b4, revision 4, with definition SHA-256 2122729ee5f7616477b5b0f98b568be9775005b34317ce36760953643f5b2c43. Those identities describe the established native receiving input. The API accepts the caller's entire verified original snapshot; it does not reconstruct a snapshot from these identifiers.

The native model's CSV/JSON respondent editions are explicitly synthetic engineering inputs built against the original public questionnaire. Browser completion is not evidence of a real respondent collection, an externally approved methodology or a customer acceptance.

## Source Page invocation

~~~js
import { runHilaBrowserReceiving } from './browser.mjs';

const sourceBrowser = await runHilaBrowserReceiving({
  page,                       // The existing application's actual Playwright Page.
  client,                     // Its original HilaClient.
  directory: sourceWorkspace, // Unchanged absolute workspace directory.
  outputDirectory: browserOutput,
  operationId: originalBrowserOperationId,
  actor: { id: '7108', label: '7108 HILA engineering operator' },
  before: completeRevisionFourReview,
  checkpoint: savedBrowserCheckpoint ?? null,
  retain: async fullCheckpoint => {
    await originalParentCheckpointWriter(fullCheckpoint);
  },
});
~~~

The caller creates outputDirectory as a real private directory and holds its original operation lease across the whole call. The Page must already be open at the root of the same HilaClient origin and must report the same workspace directory. The callback preserves those source, actor, directory and operation selections in immutable selection.json.

retain is the caller's serialized durable checkpoint writer. It receives the complete checkpoint and must finish saving it before returning. On continuation, provide the last retained checkpoint together with the same output directory. The module also reads its own complete local checkpoint and reconciles sequence numbers; equal sequence numbers must have identical complete content.

### Actual operator journey

The module reads the complete original report and actual coded-row pages. It chooses a consenting row, with sourceRow at least 10, that has no existing row decision. It opens that exact row in the original Page, verifies the entire displayed coded record, and adds one named note with decision note. It changes no answer, consent, inclusion decision, scoring rule or denominator.

The operator then supplies a named review note and reviewed status. All eight original definition fields and every pre-existing row/cell decision remain in the saved input. Native normalization determines the original ordering; the callback compares the complete saved definition, original creation time and exact next revision.

The actual Page's Download offline update control creates the full save input and its native request UUID. The module receives and validates that complete file, saves it before dispatch, and reopens it through the existing offline-update input. The callback does not generate an alternative native request ID or write browser IndexedDB.

A temporary route handler intercepts that exact original POST before the provider receives it. The handler checks the complete POST body against the retained input and the original IndexedDB operation, retains those records, and aborts the request. The callback reloads the Page, verifies the same pending UUID/body, and invokes the original Retry control. It then compares the complete original native request/result with the browser's saved result.

The source Page opens the saved revision-five review and complete report. Every original report edition, denominator, coded cell, comparison, source/rule reference and prior cell decision must remain equal to revision four. Only the selected row note and named review fields change. The full report hash must match the original saved review.

## Complete returned files

The result is:

~~~js
{
  request,    // The exact flat native save input generated by the actual Page.
  reviewed,   // The complete saved next-revision review.
  report,     // The complete original private analyst report.
  files,      // All five complete browser files, described below.
  receipt,    // Full semantic browser receiving result.
  checkpoint, // The complete durable continuation state.
}
~~~

files is an array of complete {name, path, bytes, sha256} descriptors:

| name | Original Page download | Meaning |
| --- | --- | --- |
| report.json | Analyst report JSON | Complete private report, including original denominators and comparison. |
| report.html | Offline HTML | Complete original offline analyst report. |
| report.zip | Report archive | Original complete report delivery. |
| review.zip | Editable private workspace archive | Full original source and review history for independent receiving. |
| public.zip | Public report archive | Original disclosure-controlled public delivery. |

The names are semantic roles. The path identifies the complete actual file saved under outputDirectory. The module creates no screenshots.

The full report JSON is compared as a parsed complete object and against the original canonical report SHA. The Page's downloaded pretty-printed JSON can have different whitespace from the native canonical report, so its own exact file SHA is retained separately. HTML and ZIP files retain their complete original bytes. Response content length, when provided, must match the received file length.

The installed parent independently downloads these same selected formats through HilaClient and exports them through the original CLI, then compares the full file identities. It receives the exact review.zip in the independent application, preserves the complete private source/report outputs, and applies the original product's public disclosure rules to public.zip.

## Interrupted download and request continuation

Every download has a retained selection before clicking. A complete download is written into a private unique stage, fsynced and read back. Its full receipt is saved before the final name is published. A continuation selects and verifies that original receipt and complete file before making any new click. If publication stopped after the receipt, the same verified stage supplies the final file. Partial stages remain available as private failure evidence.

The complete native save request is retained separately from browser progress. If a checkpoint save was interrupted, the original request and immutable companion records still select the same UUID/body. A completed native save is reconciled through the original request lookup. If a restarted application's origin has no old browser storage, the same complete offline-update file can reopen its retained native request. The callback refuses another pending browser operation.

Receiving a ZIP has a distinct original browser operation ID and a retained full Blob. If that receiving operation has been selected and the original IndexedDB profile is unavailable before completion, restore that original profile. The callback does not invent a replacement receive UUID.

Unknown or rejected operations retain their original input and actual failure. The callback does not bypass the original native request lookup, replay a changed body or create another workspace to make a failed stage appear complete.

## Independent received Page and cold reopen

The original installed controller closes the source application before opening the separate recipient application. It passes the exact complete source packet to the recipient Page:

~~~js
import { inspectHilaReceivedPage } from './browser.mjs';

const recipientBrowser = await inspectHilaReceivedPage({
  page: recipientPage,
  client: recipientClient,
  directory: recipientWorkspace,
  outputDirectory: recipientBrowserOutput,
  operationId: originalRecipientBrowserOperationId,
  actor: { id: '7108', label: '7108 HILA engineering operator' },
  review: sourceBrowser.reviewed,
  report: sourceBrowser.report,
  name: 'independent-received',
  receiveFile: sourceBrowser.files.find(file => file.name === 'review.zip'),
  checkpoint: savedRecipientCheckpoint ?? null,
  retain: async fullCheckpoint => {
    await originalParentRecipientCheckpointWriter(fullCheckpoint);
  },
});
~~~

With receiveFile, the callback operates the actual packet input and Receive form. It retains the complete file identity and original browser operation before the same pre-provider interception, reload and Retry sequence. The completed response must reconstruct the exact reviewed packet and preserve a local current revision at least as new as the packet. The callback opens the original selected revision and compares the complete report and full retained history.

For the final cold-reopened application, use a distinct named observation and its original output/checkpoint selection, omit receiveFile, and pass the complete selected review/report already retained by the parent. That call reads the same saved workspace through the actual Page; it does not import the packet again.

The independent result returns {reviewed, report, files: [], receipt, checkpoint}. Native independent receiving, repeat receiving, a later editable recipient revision and CLI cold reopen remain with the original installed controller. A browser observation of a selected historical review does not replace the recipient's current saved head.

## Ownership and failure handling

The caller retains Page, browser context, application, client, workspace and output-lease ownership. This module attaches and removes only its own page-error listener, route interception and event observers. It never calls Page.close, context.close or client.close.

Every response/download waiter receives a rejection observer immediately. Cancellation removes its event handlers and timer. Route removal waits for already-running owned handlers before the callback returns, so a timed-out observation cannot leave a later checkpoint write outside the caller's lease.

Only a fully retained download's Playwright temporary is released. An incomplete transfer retains its stage. On failure, the callback writes a complete private failure record when possible and propagates the actual error. The parent still owns all server/browser cleanup and retains the original input, progress and files for continuation.

A complete result reentry verifies its saved receipt, all five original files and the native request/result before returning the same checkpoint. It does not repeat an already-completed browser edit or download. The same rule applies to an independently completed received/reopened Page observation.

## Validation and current execution state

The complete module was parsed with the original JavaScript parser and joined against all three full current HILA UI/index/client bodies. Its source review covers original request envelopes, exact revision/definition/report bindings, complete file transfer, pending-operation reconciliation and borrowed Page cleanup.

The original native model has completed its source review, report/export, independent receive/replay, later recipient revision and cold reopen. The browser module is an executable receiving component for the installed parent. Its actual Page result is recorded by that parent when the full selected programme runs; source parsing alone is not a completed browser operation.
