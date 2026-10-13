# Offline implementation review and source-bound receiving

Use this workflow when a customer or technical colleague needs to inspect a saved merchant implementation away from the Support server and return their observations to the original case. The recipient receives the complete selected review packet in a self-contained HTML, works in a named local copy, and returns the original packet with explicit observations. The case operator compares that return with the current implementation and applies the complete reviewed observation set through the original case writer.

This complements [Implementation and receiving](IMPLEMENTATION.md), [Source bundle operations](SOURCE_BUNDLES.md) and [Complete case source packages](CASE_SOURCE_PACKAGE.md). Those original engines retain workorders, task definitions, native source files, technical and customer receiving, case history and complete portable handover.

## What remains authoritative

The originating saved case identifies the selected implementation and source. Workorder editions, task definitions, original files and earlier receiving observations remain unchanged inside the exported review packet. The offline copy holds the recipient's working observations. Opening a review, saving a browser copy or downloading its return does not change the originating case.

A recorded observation has a receiving kind and an outcome. Technical receiving and customer receiving are distinct. The four original outcomes are:

| Outcome | Use it for |
| --- | --- |
| accepted | The recorder actually inspected the stated subject and observed that it met the applicable criteria. |
| changes_required | The recorder observed a specific issue requiring a correction or additional work. |
| not_run | The stated inspection or receiving activity has not been performed. |
| not_applicable | The recorder explicitly determines that this receiving activity does not apply, with useful context. |

An implementation task's status is separate: planned, in_progress, ready, done or retired. A task marked done is not itself a receiving observation. A technical acceptance does not become customer acceptance. A prepared source package or a successful download is evidence of that operation, not evidence that the customer operated or accepted its contents.

Receiving records retain the actual observer, observed time, selected work, original files, notes and reference. The original host remains responsible for saving the observation in the selected current case. The workflow does not add a mandatory second reviewer; the operator may complete their own review and native receiving with accurate attribution.

## Start from the original saved case

Open the existing Support console using its configured private case directory. For a source installation, the original command is:

~~~sh
node stellar/scf-starforge-20261009/sf74-merchant-support-console/server.mjs \
  --cases-dir /absolute/private/merchant-cases \
  --port 8784
~~~

Use the actual local address printed by that process. Open the original merchant case and its **Implementation and receiving** desk. If the workorder has not yet been prepared, use the existing workorder preparation and **Use this workorder** flow. The source workorder, commercial terms and original retained files should describe the useful customer task being reviewed.

Open **Review an implementation** from the original Support application. The operator page is `/implementation-review`. Choose the **Saved case**, enter the **Operator applying a return**, and use **Refresh saved cases** when the original case list or saved implementation has changed.

Save outstanding case edits before preparing an offline review. A saved case has an outer SHA-256 revision; its implementation has its own integer revision. Both identify the selected work. A recipient should receive the intended saved implementation, not an unsaved browser draft.

Review the plan, task titles and acceptance criteria. Check which workorder edition is active and which original files belong to it. Original task dependencies are part of the delivered subject. Keep original source references and file identities; they explain what the recipient is being asked to inspect.

Under **Prepare recipient work**, enter the **Intended recipient**, select **Tasks to review**, and inspect **Additional and embedded materials**. Choose **Include this additional material** for an extra original and **Include its original bytes in the recipient HTML** only for the files that should travel inside the page. Choose **Prepare original review**, inspect **Complete original source selection**, then use **Download original packet** and **Download recipient editor**.

Prepare the complete review through the original implementation-review operator. Retain its returned source identity and download the self-contained recipient HTML. The prepared packet is the fixed comparison basis for that return. Preparing another packet later does not silently alter the earlier downloaded file.

For native originals referenced through SF49, keep their complete source package available through the original source/case handover. A filename or link in a review is not a replacement for the corresponding original bytes. The original complete case-package workflow carries all captured immutable history and referenced native archives, including attachments that were not assigned to a task.

## Hand the recipient a complete usable result

Give the recipient the generated HTML and the exact selected deliverables needed for the inspection. Keep the complete customer handover and original source package together when those files are part of the receiving task. Use the existing authorized delivery route and preserve the original company relationship.

Describe the actual task, receiving kind, relevant source edition and expected inspection. For example, asking a technical colleague to inspect an installation report differs from asking the customer to open the installed application and use its exported result. The recipient's observation should say what they actually did.

The offline file can be opened locally in a supported browser without starting the originating Support server. It contains the selected immutable packet and the offline application. Its original source section is read-only. It does not dispatch a merchant request, perform a payment, contact a target system or change the author's case.

## Open and choose a local copy

Open the exact HTML supplied for this review. Inspect the displayed case, workorder, plan and source identity before entering observations.

Choose **New local copy** and give it a name that makes its purpose recognizable. Named copies let the same recipient retain separate working reviews without overwriting another copy. Use **Refresh saved copies** to reread the browser's available copies, select the intended one and choose **Open saved copy**.

Browser storage belongs to that browser profile and origin. A different browser, a private window or another device need not see the same saved copies. Keep a downloaded recovery file when the work must travel or survive local browser-storage loss. Opening a second window on the same copy does not authorize it to overwrite later work from the first window.

The copy is a working review, not a new implementation case or a new workorder edition. Its immutable original packet remains the same while observations are edited. The application saves the working copy using a compare-and-swap revision so a stale window cannot silently replace the newer copy.

If a save reports that the copy changed elsewhere, preserve the visible work. Open or refresh the saved copy deliberately, or retain the visible work as a new local copy/recovery file. Do not repeatedly press a mutation button with newly invented identities to conceal an unresolved original save.

## Inspect the original material

Read the full plan and workorder context, the exact selected task title and acceptance criteria, prerequisites, and earlier observations. Use **Original materials** to inspect the actual original file list. Keep the file's source identity and content together when opening it.

The observation form separately names the **materials actually inspected**. Select the files you used in the review. Do not select every listed file merely because it appears in the packet. If the review did not inspect a relevant file or could not operate the required application, state that actual limitation in the observation.

Original source material, implementation deliverables, installation files, guides and observation files have distinct purposes. A screenshot or a log may establish one observation; it does not automatically establish that an entire delivered application operates correctly. For a full application receiving task, open the actual outgoing version and operate its important controls.

A complete customer-facing result should be inspected at a useful desktop width and a narrow/mobile width where applicable, with populated, empty, loading and error states. Download and reopen the actual output. For an archive, extract and open the contained deliverables and working project. Looking at a code listing, receiving HTTP 200, running a unit check or capturing an unseen screenshot does not substitute for viewing and using the delivered product.

## Add an explicit observation

Choose **Add observation**. Select the original work or tasks covered by the observation, the receiving kind and the actual outcome. Record the observer, when the inspection occurred, the materials actually inspected, a useful original record/reference and the complete notes.

Describe both the result and the scope of the inspection. Good notes identify the actual application/version, task or file, what was operated, and what happened. A changes_required observation should make the required correction concrete enough for the implementation owner to act on it. A not_run observation should remain not_run until there is a real later observation.

Use the actual UTC observation time accepted by the native model. Native receiving retains observed time separately from the time the host records the returned observation. Receiving an older observation today does not change when the work was actually inspected.

The native implementation permits an HTTP(S) reference, a URN or a plain original record identifier. It rejects credential-bearing URLs. Keep references meaningful and use the existing private source custody for any private files or connection configuration.

The offline editor retains unfinished form work in its named browser copy. Complete validation applies when preparing a valid returned review. Keep the recovery copy if unfinished or invalid text needs to be retained while it is corrected.

## Validate and download the whole returned review

Choose **Validate complete return** after completing the intended observations. Address every reported field, source or completeness error before exporting the final returned review.

Choose **Download returned review** to save the complete return. It carries the original immutable packet and the explicit observations, rather than only a list of notes detached from their source. Keep that file unchanged when transferring it to the case operator.

The native operator must consume the exact original File.text() string returned by the browser file reader. Do not parse and reserialize it in an intermediary, copy only selected observations into a new document, or recreate its request from a summary. The original full text is the receiving input and remains available for source-bound comparison and replay.

The returned review is not a complete replacement for the original CaseStore directory. Use the existing complete case-package export/receiving when transferring the whole implementation, native archives and saved case history to another installation.

## Recovery copies and separate working reviews

Choose **Download recovery copy** whenever the unfinished working review should be backed up or moved. Keep it with the original downloaded HTML. Recovery is for continuing the working copy, including its original source binding; the returned review is for native inspection and application of completed observations.

Use **Restore recovery JSON or reopen a returned review** to choose the original recovery or completed return file. The editor verifies its packet identity and opens a new named local copy. Its new return identity distinguishes this continued review from the prior returned file; the old copy remains available.

Use named copies to retain alternatives. Keep each original source packet attached to its own copy. Do not treat a return from another case, workorder or source selection as a compatible draft merely because the visible task names resemble the current review.

A local recovery or copied working file preserves the recipient's work. It does not prove that the native host received an observation or that a particular original request committed. Native completion is established by the returned case/implementation receipt and the saved history.

## Receive the returned file in the original case

Return to the original Support installation and open the actual current case. Save unrelated local edits first. Select **Original returned JSON file** in the implementation-review operator, inspect **Returned attribution and observations**, and choose **Compare with current case**.

The operator prepares a comparison between the immutable review basis, the returned observations and the current saved implementation. Inspect the complete task and file identity, the original source edition, receiving kind, actor/time, notes and the current receiving history. Review any changes in the delivered subject before applying a returned observation.

Receiving is bound to more than a case name or a selected filename. The original native subject includes:

- The receiving-relevant plan fields: customer task, merchant, buyer, source location, merchant host, buyer application and output definition.
- Each selected task's identifier, title, acceptance criteria and prerequisites.
- The selected materials and exact file hashes.
- Every relevant non-observation deliverable linked to the selected tasks for that workorder edition.

Changing only a task owner, due date, status or work notes does not change this delivery definition. Changing a task title, acceptance criteria, dependency, relevant plan field, or task-linked deliverable does. A return based on the earlier definition must remain visibly tied to that earlier work.

Do not silently convert a historical observation into acceptance of the new subject. Inspect the **Original receiving preview**. When every observation is ready, select **I reviewed these observations, their original source and the current case comparison**, then choose **Apply reviewed return**. Application saves the whole validated set in one native case change; it does not silently drop a stale row or partially apply only the rows that happen to pass. If the new delivery has not been inspected, record that actual state or obtain a new observation after the changed work is reviewed.

The complete review flow preserves original source identity, exact returned text, selected observation identity and current saved-case revision through preview and application. If the case changes after preview, refresh the comparison against its current state and review the resulting differences before a new intended application. Recovery of an already committed original request is separate and retains its original identity.

## Corrections and later changes

Original receiving corrections preserve the prior received task scope, relevant plan and delivered-file set. They can correct outcome, observation time, reference or notes, and may attach additional observation files. A different delivered subject requires a new observation.

The previous receiving record remains in the case and names its correction. Technical and customer receiving select their latest observed result independently. Earlier accepted observations whose delivery subject no longer matches remain historical; the desk reports that receiving needs updating rather than erasing the observation.

Restoring an older saved workplan also preserves later immutable workorder editions, deliverables, receiving records, measurements and operation identities. Later-only tasks remain available as retired history. The offline-return integration must use that original history-preserving save path.

These records are attributed observations. They do not create a payment, rewrite the original commercial agreement, deploy a merchant change or prove an issuer/grant outcome.

## Original-request recovery

Keep the same stable operation/request identifier and exact full input when a save or apply response is lost. The original native command digest binds its type, actor, payload and any deliberately supplied recordedAt value. Reusing that identifier with different content is a conflict.

The native commissioning engine looks for a retained matching operation before rejecting an old implementation revision. The case adapter permits that original replay, then lets the native digest establish whether the request is actually the same. An id-only match without the original body is insufficient.

Use **Original request recovery**, **Open retained request** and **Reconcile original request** to inspect the original request. **Download exact request** keeps its complete body and workspace identity. **Restore an exact request JSON** accepts that original request for the same workspace and compares it with any already-retained body. A confirmed committed result is adopted from the retained receipt. An uncertain transport result remains uncertain until the original request is reconciled. Do not start a second observation or select another case while treating the earlier unresolved apply as absent.

A rejected preparation may require corrected input; keep its original rejection and create the deliberate corrected request through the supported workflow. A malformed response or a dropped connection is not by itself proof that the native writer rejected the command.

## CLI: the same original preparation, comparison and application

The source entrypoint is `implementation-review-cli.mjs` in the SF74 directory. The maintained distribution registers `merchant-implementation-review`. Both call the same original case service.

~~~sh
starforge merchant-implementation-review --help
~~~

For a source checkout, replace that installed command with:

~~~sh
node stellar/scf-starforge-20261009/sf74-merchant-support-console/implementation-review-cli.mjs --help
~~~

All file and directory options use absolute paths. The JSON files below are request shapes: replace every `ACTUAL_...` value with a retained original value, including SHA-256 revisions, actual UTC timestamps and exact selected task/material IDs. Keep the final request files unchanged when recovering an operation.

### Prepare one complete original packet and HTML

Save the following shape as `/absolute/private/review-prepare.json`:

~~~json
{
  "caseId": "ACTUAL_CASE_ID",
  "revision": "ACTUAL_SAVED_CASE_SHA256",
  "reviewId": "original-review-unique-id",
  "createdAt": "ACTUAL_UTC_PREPARATION_TIME",
  "recipient": "Actual intended recipient",
  "taskIds": ["ACTUAL_TASK_ID"],
  "extraMaterialIds": [],
  "embedMaterialIds": []
}
~~~

The optional `editionId` selects a retained workorder; omitting it uses the selected saved case's active edition. A review without a workorder is limited to original operator-created tasks. The exact historical case revision is required.

~~~sh
starforge merchant-implementation-review prepare \
  --cases-dir /absolute/private/merchant-cases \
  --input /absolute/private/review-prepare.json \
  --out /absolute/private/Implementation_Review_Packet.json \
  --html /absolute/private/Implementation_Review.html
~~~

When embedding native source-bundle originals, also supply the original `--source-dir /absolute/private/source-bundles`. `--python /absolute/path/to/python` selects its existing source helper interpreter when required. Inline original files already in the case do not require another source-store copy.

The JSON output file contains the original packet. The command result records the packet hash, review identity, original case and output file identities. The HTML includes the installed complete model, recipient application and stylesheet. Repeating the exact preparation reopens only matching output bytes; different existing outputs are preserved and reported as a conflict.

### Inspect an offline return without opening a case store

~~~sh
starforge merchant-implementation-review inspect-return \
  --return /absolute/private/Implementation_Review_Return.json \
  --out /absolute/private/Implementation_Review_Inspection.json
~~~

This validates the complete returned structure, original packet digest and embedded-file hashes. It reports the source case, reviewer, observation set and original returned-text digest. It does not establish that the originating saved case exists locally or that its current delivery still matches; use native preview for that.

### Compare with the actual current original case

Save `/absolute/private/review-preview.json`:

~~~json
{"caseId":"ACTUAL_CASE_ID"}
~~~

~~~sh
starforge merchant-implementation-review preview \
  --cases-dir /absolute/private/merchant-cases \
  --input /absolute/private/review-preview.json \
  --return /absolute/private/Implementation_Review_Return.json \
  --out /absolute/private/Implementation_Review_Preview.json
~~~

Read the complete preview. It identifies the current case revision, implementation revision, original source case, return digest, individual observation issues/warnings and `previewSha256`. A historical-correction warning does not transform that correction into acceptance of current changed work. Every observation must be ready for the whole new apply.

### Apply the exact reviewed return once

After reviewing the actual preview, save `/absolute/private/review-apply.json`:

~~~json
{
  "caseId": "ACTUAL_CASE_ID",
  "expectedRevision": "ACTUAL_PREVIEW_CASE_SHA256",
  "requestId": "original-review-apply-unique-id",
  "actor": "Actual importing operator",
  "recordedAt": "ACTUAL_UTC_IMPORT_TIME",
  "previewSha256": "ACTUAL_PREVIEW_SHA256"
}
~~~

~~~sh
starforge merchant-implementation-review apply \
  --cases-dir /absolute/private/merchant-cases \
  --input /absolute/private/review-apply.json \
  --return /absolute/private/Implementation_Review_Return.json \
  --out /absolute/private/Implementation_Review_Receipt.json
~~~

The service retains the original returned text as an observation material and associates that same file with every received row. Each row keeps its explicitly attributed observer, observed time and receiving kind. The importing operator is the attribution on the single original batch command. The original commissioning validator and case compare-and-swap save the complete result atomically.

If the first apply saved its receipt file but its response was lost, repeating the exact apply with the same `--out` preserves that first receipt after the CLI verifies its complete historical case, original event and result against the current store. The output entry reports `retained: true` and that existing file's actual byte count and SHA256. The current command result may report a later case revision or `replayed: true`; those changes do not replace the valid original receipt. An unrelated or altered existing output still conflicts.

An output-file conflict after the native save is not proof that the case mutation failed. Preserve the original request and returned file and inspect its native status. Choose a separate output destination for a new status report; do not overwrite a recipient-edited or unrelated file.

### Reconcile the same original request

Save `/absolute/private/review-status.json` using the exact original application request's identity and attribution:

~~~json
{
  "caseId": "ACTUAL_CASE_ID",
  "requestId": "original-review-apply-unique-id",
  "actor": "Actual importing operator",
  "recordedAt": "ACTUAL_UTC_IMPORT_TIME"
}
~~~

~~~sh
starforge merchant-implementation-review status \
  --cases-dir /absolute/private/merchant-cases \
  --input /absolute/private/review-status.json \
  --return /absolute/private/Implementation_Review_Return.json \
  --out /absolute/private/Implementation_Review_Status.json
~~~

`COMPLETE` is recovered from the original native event and exact command digest. `NOT_STARTED` means that exact event is absent in the read case; it does not authorize replacing a different retained return or inventing another application identity. The service reports a conflict if the same return was already retained under another request. If a retry is appropriate, repeat the exact original apply input and return. A changed current case requires a new preview for a new intended action; a completed original request still replays its original receipt.

## HTTP and original native integration

The configured local Support host exposes these routes under its existing host/origin protection:

| Method and route | Complete input or result |
| --- | --- |
| `GET /api/implementation-review/config` | Actual workspace identity and packet/return/request byte limits. |
| `POST /api/implementation-review/prepare` | The same prepare object as the CLI; returns `packet` and `packetSha256`. |
| `POST /api/implementation-review/preview` | `{caseId,returned}`; `returned` is the original full UTF-8 file text. |
| `POST /api/implementation-review/apply` | The exact apply object plus `returned`. |
| `POST /api/implementation-review/status` | The exact status object plus `returned`. |

POST requests use `application/json` and the actual same-origin local host. The browser retains its complete request under the configured workspace identity before dispatch. A received or different case-store location must use its own local workspace binding; old device requests are not silently reassigned.

Native error responses contain `error` and `detail`, with `currentRevision` when supplied by the original case conflict. Preserve that complete response and the transport outcome. A JSON-looking error from another layer does not by itself establish a definitive native rejection.

The service calls the original `commissioningReceivingSubject` to derive delivery authority. The additive `record_receiving_batch` command adds the returned observation file and calls the existing receiving logic for each attributed row, validates the full next implementation once, and commits through the original CaseStore save. It does not keep a second observation database or replace the workorder, source-bundle, history-restore or case-package engines.

## File limits and complete source custody

The complete prepared packet and returned review each have a 24 MiB UTF-8 limit. Embedded file Base64, source definitions and review text all count toward that complete limit. The HTTP request envelope has a 64 MiB limit. These bounds are separate from the original implementation's 64 MiB state and 48 MiB inline-file bounds.

When original materials are too large to embed, retain their exact descriptors in the packet and deliver the complete originals through the existing source/case package. Choose the smaller set actually needed inside the offline HTML. Do not truncate a file or silently omit an originally declared embedded member.

The browser's recovery format has its own checked whole-file bound. If a working draft exceeds the supported recovery size, keep the visible draft, address the reported size issue and retain the intended source through the complete original case delivery. The editor must not emit a recovery file it cannot reopen.

The complete returned file is retained as an ordinary immutable observation material. This is why the existing complete case export, history preservation and independent receiving carry both the observations and their exact source input without a separate sidecar journal.


## Preserve and reopen the complete case

After applying and saving the selected observations, use the original full case export. The established implementation export command is:

~~~sh
starforge merchant-implementation export \
  --cases-dir /absolute/private/merchant-cases \
  --case ACTUAL_CASE_ID \
  --revision ACTUAL_SELECTED_CASE_SHA256 \
  --out /absolute/private/received-implementation
~~~

Use actual retained values. The complete export includes saved case metadata, exact workspace, implementation JSON, readable report, tasks CSV and original edition/input/material files. Source-backed native originals travel through their original SF49/case-package closure. The existing Handoffs and case-package receiving routes retain the full captured case history and original source archives.

Receive into the intended independent installation using its existing native receiver. Reopen the received case and inspect original source/working identities, task and receiving history, the returned-review attachment and its actual applied result. A receiving installation has its own local authorization and process context while retaining the original source lineage. Its received case may have a different local case UUID. Prepare a new recipient review from that actual received local case before recording new receiving there. An earlier returned review remains bound to its original source case; do not rewrite its embedded case identity to make it apply to the new one. Completed observations and their exact original return material remain part of the received history.

The useful proof of handover is an independently reopened, editable case with the whole original files and review history. Repeating an exact completed export should verify retained bytes. Different preexisting destination bytes remain a conflict rather than an invitation to overwrite another case.

## Complete original-case operating course

The full receiving continuation uses the existing operated Support case and its retained original source. It should:

1. Reopen the actual selected case and source edition, save intended implementation work, and prepare the complete review.
2. Open and LOOK at the generated offline HTML at desktop and narrow widths.
3. Inspect original tasks and materials, record actual technical/customer observations as appropriate, and retain unfinished work in a named copy.
4. Reopen that copy; exercise a second-window save conflict without losing the visible draft; download/reopen the complete recovery and returned-review files.
5. Change a real delivery-relevant task or linked deliverable in the original case and inspect the returned review against that changed subject.
6. Apply an explicitly selected current-compatible observation through the native case commands; preserve a deliberate lost response and recover that exact original request.
7. Inspect original receiving totals/history and the retained returned-file identity, including technical/customer separation and historical stale observations.
8. Export the complete customer case with every required source archive, receive it independently, open all outgoing deliverables and continue a real edit in that received case.

Retain actual source/runtime identities, command/result records, full output files and the screenshots that were actually viewed. State separately which portions ran and which are prepared source. Keep the accepted original operation and receiving owner; source publication does not require launching a duplicate native programme.
