# Collaborate on a captured merchant handover

The captured product combines a complete working edit with another operator’s
saved draft edition. Both operators keep the original draft and its immutable
history. The resulting edition continues through the existing merchant
preparation, publication, complete file transfer and receiving workflow.

Open **Merchant handover** from the original product browser or its saved
**Applications → Captured API merchant** entry. **Combine saved and working
edits** is the collaboration desk. The merchant tools, typed client and terminal
use the same reconciliation model and native draft writer.

## Combine two operators’ work

1. Open an outgoing or receiving draft and make the complete intended edit.
   The browser retains that form with the exact saved edition it came from.
2. Choose **Compare and combine current draft**. The native desk reads that
   original base and the current saved edition from the same immutable history.
3. Review **Combined changes**. Independent edits combine automatically. For
   example, one operator can add a merchant while another changes the collection
   label or a different selected source review.
4. For each conflicting row, inspect the complete **Original base**, **Current
   saved** and **Working edit** values. Choose **Current saved** or **Working
   edit**. A removed row is shown explicitly as absent.
5. Choose **Review resolved choices**. This binds the complete resulting form,
   every choice and the exact current edition. Inspect **Complete resulting
   draft form**, then choose **Save reconciled edition**.
6. Continue using the saved edition in the original workflow. For an outgoing
   collection, choose **Prepare complete collection**, inspect the native review
   and publish it. For receiving, inspect the complete handover, review names
   and receive the selected collection. Original native jobs keep their IDs,
   review hashes and complete source/package history.

A saved peer edit arriving during review leaves the original working form
available. **Review the latest saved edition** reads the new current edition
and carries forward choices only when that exact conflict’s base, current and
working values still match. Other choices become explicit again. A pending
save keeps its original request; it can be continued from **Continue an
original request**.

The saved result can differ from both input forms because it includes their
independent changes. The ordinary editor opens that exact saved result. If the
operator changed another working form while an earlier request was pending,
that newer form remains associated with its original saved base.

## How selections combine

| Selection | Native reconciliation |
| --- | --- |
| Collection label | A one-sided change combines with unrelated member changes; divergent edits require a choice. |
| Merchant packages | Rows are matched by their original merchant name. The complete selected manifest record stays together. |
| Captured sources | Rows are matched by original source kind and source ID. The selected review revision stays with that source. |
| Additions and removals | Independent changes combine. Removing a row that the other operator changed requires an explicit choice. |
| Selected order | Compatible ordering edits preserve every merged row; incompatible orders require an explicit order choice. |
| Duplicate or incomplete row identities | The complete array remains available for a whole-array choice. The model never silently collapses repeated rows. |
| Receiving names for the same manifest | Each original name is reconciled independently, including removal and conflicting destination names. |
| Receiving source changes | A different manifest combined with a divergent selection edit requires choosing the complete receiving selection: directory, manifest and names together. |
| Collection limits | A combined selection that exceeds the original collection limit requires a complete selection choice. |

Receiving-name conflicts in a saved draft and conflicts in the receiving
merchant directory are separate stages. The collaboration desk determines the
complete intended name map. The original receiving review then opens the actual
selected packages, manifests, source histories and destination directory and
applies its existing package/source rules.

The original handover compiler still validates the selected packages, source
reviews, names and complete files when preparation or receiving runs. Drafts
can remain incomplete while operators author their selections.

## Share a complete working-edit file

Choose **Export working edit** to download the complete JSON file. The file
contains these fields:

~~~json
{
  "schema": "stellar-forge.captured-working-edit.v1",
  "productId": "ORIGINAL_PRODUCT_SHA256",
  "draftId": "ORIGINAL_DRAFT_UUID",
  "kind": "OUTGOING",
  "baseRevision": "ORIGINAL_SAVED_EDITION_SHA256",
  "base": {
    "label": "Original collection",
    "packages": [],
    "sources": []
  },
  "working": {
    "label": "Edited collection",
    "packages": [],
    "sources": []
  }
}
~~~

The identity values in this illustration must be the actual native values.
The exported file supplies them automatically. It carries the complete base
and working forms, including selected package manifest hashes, source review
revisions or receiving names.

Another operator opens the same original product, selects that file in
**Original working edit JSON file**, and chooses **Review selected working
file**. The native host checks the file’s complete SHA and byte count, original
product and draft, and exact saved base form before reviewing it against the
current edition. The imported edit receives its own retained collaboration
review; the existing editor keeps its working form.

Use the complete handover archive workflow to move actual packages and sources
between products. A working-edit file identifies one original draft in its
existing product. Its source paths and selected identities refer to that
product’s retained work.

The portable file limit is 4 MiB. Export uses exact UTF-8 JSON with its byte
count and SHA-256. Import retains the supplied file bytes as the source identity.
The browser uses the original private session. Applications includes both the
shared model and collaboration controller in its selected-source binding.

## Continue retained reviews and requests

**Retained collaboration review** reopens a particular working form, original
base, conflict choices and saved result. Choosing another draft or review
preserves the prior working records. Explicit historical views remain
separate from working forms.

**Continue retained review** attempts the same selected current edition.
**Review the latest saved edition** opens a new current comparison. A review
that already owns an issued save request remains retained when a later review
is prepared.

Before sending a different save, continue an unresolved original save for the
same draft. A definitive stale-review rejection can be retained in local
rejected history while a new review proceeds. The original browser request
contains the complete body and UUID before its first POST.

A completed reconciliation is an ordinary immutable draft edition with a small
reconciliation record containing its original base, review SHA and request
SHA. Repeating its exact save request returns that edition even after further
draft edits. It does not recalculate the saved result against a later current
form.

## Merchant agent workflow

The existing declared HAR workspace selects the captured product. Start with
**merchant_handover_info**, then repeat its actual **expectedProductId** on each
further call.

| Tool | Complete operation |
| --- | --- |
| merchant_handover_draft | Read the original selected edition with view=form, or page its immutable history. |
| merchant_handover_merge_review | Review the complete working form against its original base and the current saved edition. |
| merchant_handover_merge_save | Save the exact READY review using a retained request UUID. |
| merchant_handover_working_export | Return the complete portable working file, native byte count and SHA. |
| merchant_handover_working_import | Verify exact file content and return the complete working form and original base. |

A review request contains:

~~~json
{
  "workspace": "merchant",
  "expectedProductId": "ORIGINAL_PRODUCT_SHA256",
  "id": "ORIGINAL_DRAFT_UUID",
  "baseRevision": "ORIGINAL_SAVED_EDITION_SHA256",
  "working": {
    "label": "Complete intended collection",
    "packages": [],
    "sources": []
  },
  "resolutions": {},
  "view": "summary"
}
~~~

Supply the entire intended form. Read the returned **currentRevision** and
**reviewSha256**. For further pages of the same review, repeat the complete
working form and resolutions, add **expectedCurrentRevision** with that
current revision and **expectedSnapshot** with that review SHA, and choose:

- **conflicts** for paged complete base/current/working values;
- **changes** for paged combined actions;
- **form** for the complete resulting form;
- **summary** for status and counts.

Pages contain 1–100 rows. Conflict IDs are opaque stable strings supplied by
the model. Add each intended resolution as that ID mapped to **CURRENT** or
**WORKING**, then request a new review. The changed choices produce a new
review SHA; use its new snapshot for subsequent pages.

When the review is **READY**, save these exact original fields:

~~~json
{
  "workspace": "merchant",
  "expectedProductId": "ORIGINAL_PRODUCT_SHA256",
  "id": "ORIGINAL_DRAFT_UUID",
  "requestId": "RETAINED_SAVE_UUID",
  "baseRevision": "ORIGINAL_SAVED_EDITION_SHA256",
  "expectedRevision": "REVIEWED_CURRENT_EDITION_SHA256",
  "working": {
    "label": "Complete intended collection",
    "packages": [],
    "sources": []
  },
  "resolutions": {},
  "reviewSha256": "COMPLETE_REVIEW_SHA256"
}
~~~

Use the review’s actual complete working form and resolutions. Preserve the
same request document and UUID if its reply is interrupted. The saved result
returns the original draft revision for PREPARE, INSPECT or REVIEW jobs.

Receiving working forms use **label**, **bundle**, **manifestSha256** and
**names**. These are the original complete draft fields returned by the native
draft or working-file reader. A normal first receiving selection still starts
with its completed original IMPORT job and **merchant_handover_receiving_save**.

## Typed client

The installed package exports the existing connection client:

~~~js
import {
  openCapturedHandoverClient,
} from '@tokenjunkielabs/starforge-merchant/products/captured-api/handover-client';
~~~

Open it with the original parsed HAR workspace definition and expected product
ID. Its new typed methods share that exact connection and accepted-operation
lifetime:

~~~js
const review = await client.reviewDraftMerge({
  id: originalDraft.id,
  baseRevision: originalDraft.revision,
  working: completeWorkingForm,
  resolutions: explicitChoices,
});

// Inspect review.merge.conflicts and the complete review.merge.form.
// Keep these exact fields for the original save request.
const saved = await client.saveDraftMerge({
  id: review.id,
  requestId: originalSaveId,
  baseRevision: review.baseRevision,
  expectedRevision: review.currentRevision,
  working: review.working,
  resolutions: review.resolutions,
  reviewSha256: review.reviewSha256,
});

const file = await client.exportWorkingEdit({
  id: originalDraft.id,
  baseRevision: originalDraft.revision,
  working: completeWorkingForm,
});

const imported = await client.importWorkingEdit({
  content: file.content,
  expectedSha256: file.sha256,
});
~~~

Save requires **review.merge.status === 'READY'**. All original unresolved
choices must be supplied before that save. The methods return native complete
records, including the saved edition and imported original base.

The pure model and declarations are also exported as
**@tokenjunkielabs/starforge-merchant/products/captured-api/draft-reconciliation**.
It has no filesystem, browser or network dependency. Browser previews use it
for pending choice edits; the native host recomputes the full review from its
original saved editions before writing.

The client captures input before asynchronous work and sends every request with
the original product identity. Closing it drains its accepted work through the
existing client lifetime. Whole archive transfers retain their original
streamed upload/download implementation.

## Terminal working files

Use the same private HAR connection file as the original handover terminal.
Read the actual product, draft and base IDs first. Put the complete intended
draft form in the selected private form file.

~~~sh
starforge captured-api handover remote working-export \
  --connection /private/merchant/har-connections.json \
  --workspace merchant --product ORIGINAL_PRODUCT_SHA256 \
  --draft ORIGINAL_DRAFT_UUID --base ORIGINAL_SAVED_EDITION_SHA256 \
  --form /private/work/complete-working-form.json \
  --directory /private/work/working-export
~~~

The original private publisher retains **operation.json**, the complete
**native-working.json** reply, exact **working-edit.json** and completed
**received.json**. The terminal prints the actual file path, bytes and SHA.
The source form is read as a private regular file.

Import the complete working file in the original product:

~~~sh
starforge captured-api handover remote working-import \
  --connection /private/merchant/har-connections.json \
  --workspace merchant --product ORIGINAL_PRODUCT_SHA256 \
  --file /private/shared/working-edit.json \
  --directory /private/work/working-import
~~~

This retains the exact source file, full native base verification,
**working-form.json**, and a complete **merge-review-command.json** using the
original tool schema and selected product. Continue that prepared command:

~~~sh
starforge captured-api handover remote call \
  --connection /private/merchant/har-connections.json \
  --request /private/work/working-import/merge-review-command.json \
  --result /private/work/first-merge-review
~~~

The command opens the first conflict page. Use the returned actual current
revision and review SHA for further pages, review the chosen resolutions, and
save with **merchant_handover_merge_save** in a complete retained command
document. The existing **call** result directory keeps each command and its
first reply; a new read or revised choice set uses a new result directory.

Repeat a working-export/import command with the same directory to finish its
original file publication or reopen its complete result. If the source file
is still present, its bytes must match the first request. If it has been moved
away, the original terminal request retains its exact complete bytes. Once a
native reply is retained, completing the same file publication and reopening
its result uses that reply even while the original host is stopped.

## Native API and storage

The routes live under the original authenticated
**/api/captured-handover/** host. Every response carries its captured product
identity. The four added POST routes are:

| Route | Body |
| --- | --- |
| draft/merge-review | id, baseRevision, working, optional resolutions and expectedCurrentRevision |
| draft/merge-save | id, requestId, baseRevision, expectedRevision, working, optional resolutions, reviewSha256 |
| draft/working-export | id, baseRevision, working |
| draft/working-import | content, optional expectedSha256 |

The native review includes the full original base/current forms, complete
working form, resolutions, model result and deterministic review SHA. The
save validates that exact review under the same per-draft writer used by
ordinary draft saves. An existing saved request resolves first.

All saved editions remain in the original
**PRODUCT/handover-desk/drafts/DRAFT_UUID/records/** history. Collections,
archives, uploads, native jobs and receiving operations continue to use the
paths and recovery behavior documented in [HANDOVER.md](HANDOVER.md).
The [complete agent guide](AGENT.md) follows the saved selection through native
publication, full archive transfer, receiving and reopened merchants.
