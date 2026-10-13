# Complete submission review rounds

Review the exact draft prepared in the existing Stellar Forge submission editor, return specific changes to its author, and receive the revised draft without losing the original review.

The workspace is at `/grant-review-round.html`. Open **Review prepared draft** from the application reader or submission editor. It uses the same browser draft store as Prepare submission and the other Stellar Forge workspaces.

A round keeps the complete original submission exports, not just copied answer snippets. Each decision is bound to its selected answer, issuer field, requirement or complete application. The original reviewer remains attached when another participant explicitly carries that decision to an unchanged revision.

## Complete operator journey

### 1. Prepare and open the original draft

Use the existing **Prepare submission** workspace to receive the complete application source, retain the actual issuer prompts and limits, and prepare the answers. The original native plan, source, handover and other extension fields remain part of that draft.

Choose **Download full draft** there. In Submission review, choose **Open submission draft**, select that complete JSON, enter a review name and the first reviewer's name, and choose plain text or Markdown. Alternatively, select **Review this saved submission** from the list of actual drafts in the same browser.

The selected format is retained for the whole round. A decision reviews exactly that format's output. Start another round if the review needs a different copy format.

The original application source files are checked against their complete UTF-8 byte counts, SHA-256 and Git blob identities. The complete native export is kept unchanged, including every retained source edition and native draft extension. A different logical submission draft starts a different round; it cannot silently replace this round's original draft.

### 2. Review the answers and issuer fields

The left navigation contains the complete application, all nine original answers, every native issuer-field identity and the original nine content requirements. Open a target and read its exact selected text.

Choose **Accepted for this review**, **Changes requested**, or **Not applicable — explain why**. Record the reviewer note and any supporting references. A reference can retain a complete HTTPS source URL, a written observation, or both. The review retains the full note and reference; it does not replace the underlying original source.

A specific change also records its title, priority, reason and an optional exact quotation. The quote must occur in the selected text. The request stays attached to that original target, export and reviewer even after the author receives another draft.

Decision, response and revision forms retain their exact unfinished values in this window's complete working copy, including invalid references or incomplete notes. The working copy automatically saves through the original browser draft store; read its separate save status. **Download complete working copy** retains those values and every selected original draft for another browser. The recorded-review downloads still require completed or explicitly discarded forms. **Discard unrecorded forms** clears only unfinished controls; recorded actions remain in the round. Unfinished text is never represented as a saved decision.

### 3. Record the author's response and the reviewer's resolution

Add the named author through **Add a named participant**, then select that person in **Person recording this action**. Names have stable identities within the round. Adding another person does not rewrite earlier attribution.

In **Changes and replies**, record an author response: addressed, declined with an explanation, or clarification requested. Then select the reviewer and record a separate resolution: resolved, deferred, or reopened.

The author response and reviewer resolution are separate retained actions. A response does not silently resolve its request. A deferred request remains outstanding. When the selected target changes in a later draft, a previously resolved request reopens and retains the earlier resolution.

Participant names identify responsibility within the file; the workspace does not authenticate a person or claim an issuer approval.

### 4. Receive a revised native draft

The author continues the same draft in Prepare submission, then downloads its complete new export. In the review, open **Compare a revision** and choose **Open revised full draft**.

The comparison retains both complete texts and their context. It shows changed, unchanged, added and removed targets. Identical visible text can still require a fresh review when its source baseline, issuer prompt, limit, selected answer mapping or form observation changes.

Choose what happens to **every** current decision:

- **Carry the original decision forward** is available only when the full target and source context are unchanged.
- **Reopen for a fresh review** preserves the earlier decision in history and leaves the new target unreviewed.
- **Carry all unchanged decisions forward** is an explicit operator choice. Changed or removed targets stay selected for reopening.

Record why this draft is being received, then choose **Receive this revised draft**. The selecting participant is retained separately from the original reviewer. The original reviewer identity and original decision identity remain in each carried decision.

A later source delivery never edits the original source body. The submission editor's source/version behavior remains authoritative; the review retains its entire returned draft.

### 5. Finish, export and reopen

Choose **Finish or reopen review**.

**Return requested changes to the author** can complete an editorial handover while work remains. The report lists the outstanding work.

**Ready for the final author check** requires a current acceptable decision for every complete target, resolved requests and the original native field checks. It does not submit the application. The applicant and actual issuer workflow remain with their original owners.

Use the three downloads:

| Download | Complete contents | How it is used |
| --- | --- | --- |
| Complete review | Every original native export, stable participants, full action inputs, earlier/current decisions, requests, references, author responses, resolutions and source selections | Open in Submission review to inspect or continue the entire round |
| Review report | Current decisions and references, complete request/reply/resolution history, all nine selected answers, every selected issuer field and the retained export identities | Read the full editorial handover without reconstructing the application from links |
| Selected original draft | The exact original native export, unchanged | Open in Prepare submission to continue the same draft |

A complete review can be imported into another browser and saved as a separate browser copy. Its logical review, submission, reviewer and field identities remain unchanged. A completed review must be explicitly reopened before recording another action or selecting another draft.

The browser store uses the original revision comparison. If another tab has advanced a record, the complete current review remains available in the page. **Save separate browser copy** preserves it under a new browser-record identity without replacing the other tab's work.

## Source and portable contracts

The new files do not replace the submission editor's model or database.

| Layer | Original or new contract |
| --- | --- |
| Submission draft | `stellar-forge.grant-submission-draft.v1` |
| Exact native export | `stellar-forge.grant-submission-export.v1` |
| Review round | `stellar-forge.grant-review-round.v1` |
| Complete review export | `stellar-forge.grant-review-round-export.v1` |
| Browser store | Existing `drafts.mjs` list/load/save and `DraftConflictError` behavior |
| Selected workflow | `SCF-SUBMISSION-REVIEW-ROUND-7108-20261012` |

A complete review export is:

```js
{
  schema: 'stellar-forge.grant-review-round-export.v1',
  exportedAt: 'complete UTC ISO time',
  sha256: 'SHA-256 of JSON.stringify(round)',
  round
}
```


The round retains its initial complete native capture, all received captures and an ordered event journal. Each event retains its original request ID, expected revision, actor, kind, complete input, timestamp and preceding event digest. Receiving verifies the full native sources and reconstructs the entire current state from those actions.

Calling the same request ID with the same original input returns the current complete round, preserving later work. Reusing it with different input is rejected. Hashes check retained content; they are not signatures authenticating the named participants.

`applyReviewAction(round, request, incomingCapture)` is the shared mutation entry. Request fields are `requestId`, `expectedRevision`, `actorId`, `kind`, `input`, and a complete UTC `at`. The incoming capture is supplied only with the explicit receive action.

Other exports from the complete browser model:

```js
readSubmissionExport(exportText, {fileName, receivedAt})
captureSubmissionDraft(nativeDraft, {fileName, receivedAt})
createReviewRound(capture, {id, title, reviewer, format, now})
validateReviewRound(round)
reviewRoundView(round, {editionId})
compareReviewDraft(round, incomingCapture)
exportReviewRound(round, {now})
importReviewRound(serialized)
reviewReport(round)
```


The original native draft allowance is 16 MiB. The complete review is limited to 64 MiB, at most 100 complete draft editions and 20,000 retained events. A complete full-history export that exceeds its allowance is rejected; the workspace does not silently truncate it.

### Shared reviewer composition

The existing serial composer owns the current application and source index. It imports the additive helper and applies it after the existing reviewer-entry and submission hooks, before serializing the original four reader outputs:

```js
import {
  attachGrantReviewRounds,
  registerGrantReviewRoundAssets,
  attachReviewRoundToSubmission
} from './grant-review-round.mjs';

const reviewed = attachGrantReviewRounds({templateHtml: html, sourceIndex: index});
html = reviewed.templateHtml;
index = reviewed.sourceIndex;
manifest = registerGrantReviewRoundAssets(manifest);
submissionHtml = attachReviewRoundToSubmission(submissionHtml);
```


The helper preserves the complete current template, native submission page and unrelated manifest routes. It adds a single navigation link per owned marker and declares the complete four review routes. The source-index entry retains the current original application SHA/Git identity and the complete native/review schemas.

The source closure comprises the four review browser files, the helper, this guide and both receiving modules. Keep the current original `grant-submission-core.mjs` and all of its actual planning/handover dependencies, `drafts.mjs`, and the original application assets. Receive the complete source in the existing installed Developer portal contribution and browser manifest. A page that is present in Git but absent from the original server's manifest is not a complete installed integration.

The same full review JSON is suitable as explicitly selected evidence in the original submission-handover product. It should retain the exact JSON bytes and complete SHA, not summarize or rebuild its journal.

## Complete original-source receiving

`GRANT_REVIEW_ROUNDS_MODEL.mjs` exports:

```js
const model = await runGrantReviewModel({
  draft: originalNativeDraft,
  nextSource: originalNativeSource,
  operationId: 'your-original-model-operation',
  startedAt: 'your-retained-editorial-timeline-start',
  reviewer: {id: 'named-model-reviewer', label: 'Named automated model reviewer'},
  author: {id: 'named-model-author', label: 'Named automated model author'}
});
```


The caller supplies a real complete original native draft with a clearly labeled receiving-example field and a distinct real native source. The helper uses the original source/version/answer methods, keeps unknown native extensions, and exercises the complete review through changed-text rejection, explicit carry, author reply, source receiving, field-context reopening, completion, full export, independent receive/repeat and continued reopening.

It returns `{result, artifacts, fixtures}`. Each artifact has its complete content, relative path, byte count and SHA-256. The full result records the input source identities and every material receiving outcome. The isolated example decisions are labeled automated source-model observations, not human or issuer approval. Its caller-selected editorial timestamps form a deterministic exercise timeline; they do not claim new provider-acquisition times. Actual execution timestamps are reported separately.

The original completed receiving uses the retained 41,628-byte application (Git `ce32b5134a6c4a43b147959b90d952ae87ff64b5`) and its 25,397-byte later original front (Git `b56afba315258f4c099edecdc1ee73896e743b1f`). It preserves three exact native exports, nine full answers, the receiving-example field and four original author versions. All 33 recorded actions reconstruct, the complete received round matches the original, and explicit reopening adds its 34th action. These are retained source-model results; current canonical text continues to advance through its existing author.

## Browser receiving in the existing operation

`GRANT_REVIEW_ROUNDS_BROWSER.mjs` borrows an already-owned Playwright Page:

```js
const browser = await runGrantReviewBrowser({
  page: existingReceivingPage,
  baseUrl: actualOriginalReviewerBaseUrl,
  fixtures: model.fixtures,
  sourceFiles: selectedCompleteBrowserFileDescriptors,
  operationId: 'your-original-review-browser-operation',
  checkpoint: retainedCheckpointOrNull,
  retain: saveThroughTheExistingReceiver,
  timeoutMs: 60000
});
```


It does not launch a browser, listener, installer, issuer action or second native controller. The existing receiving owner keeps those lifetimes.

Each source descriptor is `{route, bytes, sha256, gitBlob}`. It must describe the actual selected source body, and the callback verifies the complete bytes served by the existing host. Required routes include all four review assets, the current native submission core and the original shared store. Also pass the actual native core's complete additional module closure from the selected original source manifest.

The callback performs the real UI sequence: open full native draft, name review, record decisions and a specific original quote, add/select the author, explicitly carry two unchanged decisions, respond, resolve, receive the newer source, observe the reopened request, return changes, and download every complete result. It then receives the exact full review into a separate browser record, reloads that record, checks both complete records, and explicitly reopens the received copy while preserving the original event prefix.

Desktop and 390-pixel mobile observations cover the actual side-by-side author comparison and final handover. The existing receiver retains those original PNGs for visual inspection. Customer artifacts are complete JSON and Markdown; the screenshots remain QA artifacts.

The checkpoint contains the exact source/input selection, original browser and logical round identities, full selected exported round, original download bodies, phase and complete file descriptors. The supplied `retain` callback must use the receiver's original atomic/CAS publication contract and preserve its returned outcomes. An unknown checkpoint write remains with that same writer.

A retry selects the same checkpoint and original browser record. Already recorded steps are found by their retained complete action and receiving marker before any new UI UUID is chosen. A frozen complete UI export and its artifacts are selected before repeating later receiving, preventing a new timestamp or screenshot from changing an already retained bundle. The independently received record has its own browser identity and the same logical review/source history.

A completed individual download is verified and reused before another download click, including interruption before the overall UI bundle is complete. Before either independent receiving or recovery creates a separate browser copy, the checkpoint writer retains the exact full copy input, original source record and pre-existing store identities. Continuation first reconciles the matching new record through the original store, or verifies its retained destination ID, before another Save copy action. This preserves one selected destination when a save succeeds but its reply or checkpoint continuation is lost.

On error, the callback leaves the original Page open and attaches `receivingCheckpoint` and browser observations to the error. When possible it reads the still-open complete review export and unrecorded form values into that same returned checkpoint. A saved newer native result is preserved as a separate browser copy on continuation, rather than replaying it under another request or overwriting a concurrent record. Preserve the original error and complete checkpoint; do not claim the browser journey passed from the source-model result alone.

Keep the original existing reviewer and Site publication operations. The source integration, browser receiving, issuer submission and Site publication remain separate facts in the final delivery.


## Complete working copies

A recorded review is an editorial journal. A working copy contains that entire journal plus the work needed to continue it: every unfinished decision, requested change, author response, reviewer resolution, receiving note and finish/reopen note; their exact original edition and participant; all unfinished supporting references; the complete selected incoming draft and carry choices; the complete starting draft and unfinished review name/person/format; the participant-name input; and current view selections.

Invalid text stays visible and downloadable. For example, an unfinished HTTP reference is retained exactly even though the original recorded-review action requires HTTPS. Only **Record decision**, **Record author reply**, or another original explicit action creates a journal entry. Working-copy persistence does not approve text, authenticate a person, finish a review or submit an application.

### Save, reload and separate windows

The page saves after a short pause and after completed staff actions using the original revision-checked IndexedDB store. **Save working copy now** waits for that store transaction. Read **Complete working copy saved** before closing the page. Pending or failed saves trigger the ordinary unload warning; a failed save keeps all current fields available for complete download.

Each page load has an independent working identity. Its URL selects the last complete working copy; reload verifies that saved original and opens a separate copy for this window. Opening the same link in another tab also creates an independent copy. Neither window silently overwrites the other's unfinished text. This deliberately retains earlier copies, which are listed under **Saved reviews → Complete working copies**.

Opening a saved working copy or receiving a working package gives its recorded review a new unsaved browser binding. An action continues the same logical review history in that separate native record. The original saved round remains available under **Saved review rounds**. Working-copy identity, native browser record identity and logical review identity have separate meanings.

**Save working as separate copy** retains local values after a conflict. **Open latest saved working version** first saves the local values independently, then opens the selected stored version as another independent copy. It never replaces the current fields until their complete local copy is durable. If storage is unavailable or full, download the complete working package and resolve storage before switching.

The original native review save continues to use its own expected browser revision. If another tab changed that native record, the existing conflict behavior keeps the complete local review and offers a separate saved record. A successful working save is not reported as a successful native-record overwrite.

### Download and receive all unfinished work

Use **Download complete working copy**, then **Open working package** on the receiving installation. The complete JSON includes the native review body and exact original start/incoming exports. Its whole-body SHA-256 is checked, every original native source is verified through the unchanged review/submission verifier, and each unfinished form retains its original source/participant context. The receiver validates everything before changing the open copy, and first saves the preceding local work.

A package does not import sender-local IndexedDB record IDs as a target for writes. Receiving creates a separate working identity and an unsaved native browser binding. The unchanged review engine validates any subsequent recorded action normally. Full working files support at most112 MiB; original recorded reviews retain their64 MiB limit and original submission drafts their16 MiB limit. Oversize source selection or unavailable storage does not truncate the selected work.

**Retained unfinished forms** exposes every unfinished form, including a form for an older received draft. Open its original context or read its exact raw values. A note from an older edition never becomes a decision about a new edition. Recording a revised draft does not erase unrelated older unfinished notes.

The three existing recorded downloads keep their original semantics: the complete native review, the readable recorded review report, and the selected exact original submission draft. They do not mislabel unfinished values as recorded decisions. Use the separate working package for unfinished work.

### Source and installation

The additive module is **dist/grant-review-working-copy.mjs**. Its exported contracts are:

- **newWorkingCopy** creates a complete empty working model.
- **validateWorkingCopy**, **exportWorkingCopy** and **importWorkingCopy** retain/verify the complete original sources and raw unfinished values.
- **forkWorkingCopy** creates a separate identity and by default clears sender-native record targeting.
- **saveWorkingCopy**, **loadWorkingCopy** and **listWorkingCopies** use the unchanged **drafts.mjs** transaction and revision contract.

The original review workspace and page integrate these controls. **grant-review-round.mjs** and **browser-assets.json** include the new browser route, so both the source server and original static-reader exporter ship the entire module. The canonical application, cumulative source package and existing native/Site operation remain with their original owners.

For actual browser receiving, use the existing review Page and original complete draft/round. Enter an unfinished decision note and reference, select a revised original draft and retain carry notes, then save/download the complete working copy. Reload and verify every unfinished value and both source identities. Open that exact package in a separate existing browser context, continue one original review action, download/reopen its whole native review, and confirm that the sender's working copy and original recorded history remain intact. Keep the actual browser result separate from source review and parsing; this source change starts no browser or listener.

### Actual source-function receiving

The complete original7108 artifact carrier (3,482,649 bytes, SHA-256 `bf7725ac65e96a69326d7df9536237982946a1c2c047b409124a864d1e49b4ae`) was received and verified. Its original review revision5 and complete returned author draft were opened through14 complete original modules in Functions V8 with UTF-8/SHA compatibility. The working export retained all seven unfinished form kinds, exact invalid reference text,2,000-character unfinished title and the full incoming draft. Independent import/fork retained everything; an explicit original review action created recipient revision6, and the whole native review reopened. The original review stayed exact. The complete source-function artifacts are in `operations/scf-submission-review-working-copies-5403-20261013/complete-source-receiving.json`.

This is a source-function result. IndexedDB, browser reload, native installation, deployed Site and issuer action remain separate actual receiving outcomes.

## Receive a colleague’s returned recorded review

This extends the same review round and its existing browser store. **Open review JSON** still opens an independent copy. **Returned reviews** compares a colleague’s complete recorded-review JSON with the author’s currently open round, retains the original returned file, and records explicit adoption choices through the original review journal. A returned working package still opens through **Open working package**; unfinished text is not converted into recorded decisions.

The original review and the returned copy must share their original round and recorded history. The comparison identifies their common immutable prefix, later author work, original participant attribution and exact source/content bindings. Matching names, copied text or an unrelated review ID do not establish that relationship.

### Complete operator course

1. Open the author’s current saved review, with its actual latest native browser revision. Retain any unfinished local forms through the existing working-copy save. If the complete review is currently unsaved, use its original save or **Save separate browser copy** before admitting a return.
2. Choose **Returned reviews → Open returned review JSON**. Select the colleague’s full **Download complete review** file. The original export and its complete digest, sources and action history are validated. The preceding working copy is saved independently before the returned selection is staged. Existing decision, requested-change, reply, resolution, revision-receiving and finish/reopen forms remain unchanged.
3. Read the common revision and the returned/current revisions. Search by the original action identity, actor, target, title or note, or filter eligible actions, conflicts and already retained work. The page shows 25 actions at a time and retains every action in the original file. Filtering changes the view, never the population that must receive a choice.
4. For an action you may adopt, use **Read full current and returned records**. Inspect the exact original input and the relevant current author decision or complete change discussion. The model’s eligibility and dependency explanation remains authoritative. A matching visible sentence is not sufficient when its original content or source binding changed.
5. Choose **Adopt this original action** or **Retain as history** for each returned action. No adoption is selected automatically. Explain retained actions. **Retain every unchosen action as history** is an explicit operator choice for the entire remaining population; review the resulting choices before continuing. Returned dependencies still need compatible explicit choices.
6. Enter why the complete return is being received, select the named person recording it, then choose **Record these return choices**. The workspace saves the exact request identity, original comparison, time, actor and all choices in the complete working copy before applying or saving its result. The original native browser revision check remains the writer.
7. Inspect the resulting **Answers and fields**, **Changes and replies**, **Review history** and **Returned reviews**. Adopted rows show their original returned actor, action, time and receiving action. The receiving operator does not become the author of the colleague’s original judgment. The original returned capture and every explicit choice remain available even when nothing was adopted.
8. Download the complete review and readable review report through the existing controls, and use **Download exact returned review** for the unchanged colleague file. Open the complete review in another existing browser installation, save an independent record, continue a normal review action and export/reopen it. Its full histories and returned captures travel with the same logical review. Continue using the original selected submission draft and original explicit source-receiving controls.

Returned source selection, completion and reopening remain historical evidence. Receiving a colleague’s “ready” outcome never finishes the author’s current review, chooses a different submission source or submits the application. Use the existing **Compare a revision** and **Finish or reopen review** controls deliberately. The model refuses to retarget a decision or discussion when its necessary original binding no longer holds; retain that action and review the actual current content normally.

### Interrupted saves and later author work

A pending return exposes **Continue original return**, its actual retained error and **Exact original request**. Continue that request with the same selected capture and choices. Do not manufacture another UUID to hide an uncertain result. The full computed result is retained in the working copy before the original native save is attempted.

If another tab advances the selected browser record, the revision comparison refuses its overwrite. The full local result remains open. **Save separate browser copy** preserves that complete result under a new browser record; then **Continue original return** reconciles the same original action and finishes its retained save. A complete working-package download also preserves the original request, returned file, choices and current result for independent recovery.

A known validation rejection exposes **Return rejected choices to draft**. This is available only before that original return action appears in the recorded journal. The request and actual rejection are retained separately in the working copy; the operator can then revise the unfinished choices against current author work. This does not remove a recorded action or treat an uncertain save as a proved failure.

**Keep as saved copy and clear selection** first saves the entire preceding working copy, then opens a separate working identity without the selected return. All seven original unfinished form kinds, original round and unknown envelope metadata remain present. Recorded return history remains in the round. Opening another returned file likewise preserves the preceding complete working copy independently. Neither action deletes a prior browser record.

After reload or **Open working package**, the complete original capture is verified again and the current comparison is rebuilt. Raw unrecorded choices and the original pending request remain exact, even if later work makes them stale. Only the original model action may validate and adopt them; opening a file never silently updates a choice or retargets it to another edition.

### Data and operating limits

The existing recorded review remains limited to 64 MiB and the complete working copy to 112 MiB. Retained returned captures count toward those complete limits. If the full result cannot fit, it is rejected without truncating either history or replacing the existing native record. Keep both original downloads and the preceding saved working copy; a separate named review remains an explicit operator decision, not an automatic loss of history.

The working format remains stellar-forge.grant-review-working-copy.v1. Its optional returnedReview member contains the complete capture, raw choices and note, view selections, retained validation attempts and original pending request. Old working copies without this member keep their original representation. Sender-local browser IDs never authorize writes in an independent receiver.

The recorded review keeps its original event sequence, hash chain and native export contract. A return is a distinct original action containing its exact capture, comparison identity and all choices. The model reconstructs the adopted result from those retained originals during full receiving; it does not trust a summary or an operator-supplied replacement state. Participant labels and hashes remain local attribution and content checks, not authentication or issuer acceptance.

### Existing receiving owner: operate and inspect the complete return

Use the original 7108/5403 complete source-course records and the existing 22B7 receiving operation at its next deliberate source boundary. Keep the original frozen input/source selection and prior phase as history. This release starts no parallel browser, listener, native case or issuer operation.

On the exact outgoing installation, open the author’s current complete record and the independently edited returned record. Exercise an eligible decision, a real current conflict, a returned change with its reply/resolution dependency, a retained ineligible action and a later author edit. Read the actual before/current/returned details; verify the displayed original attribution. Retain an unfinished note/choice, reload, and reopen the downloaded working package. Continue one original pending request through the existing writer and inspect its saved result or actual conflict recovery.

At the intended desktop width and a relevant narrow/mobile width, LOOK at and operate the populated comparison, empty and filtered states, loading/error state, action pagination, original-request recovery and history details. Open every outgoing review JSON, original returned file, working package and readable report. Independently receive and continue the full result, preserving later recipient edits and exact replay of the original return. View the actual captured screenshots; repair any clipping, unreadable comparison or broken control within this same operation. Source-model checks alone do not establish native IndexedDB, rendered or customer-ready completion.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949
