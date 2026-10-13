# Native human-task forms

TJLabs adds complete native task-form authoring to the original Flowable
workspace. Capture the actual task and its returned form, edit explicit values,
retain unfinished work, prepare the exact native request, review it and
separately submit it. The native form endpoint completes the original task.

This workflow uses Flowable 8.0.0 at commit
0779d68e5a3385b74d8acb8bc37901ff54513249. The complete companion
[TASK_FORM_NATIVE_CONTRACT.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/flowable/TASK_FORM_NATIVE_CONTRACT.md)
retains the primary Java source links and exact endpoint/type semantics.
The original raw JSON claim, complete, delegate and resolve actions remain
available in **Human tasks**.

## Capture the actual task and form

Open the existing private installed product URL and select its original
process REST connection. In **Human tasks**, select **Capture / author form**
for an actual active task; or open **Task forms** and enter its exact native
task ID. Give the capture a readable label and note, then use **Capture native
task form**.

The existing workspace writer retains the runtime task, original GET
/form/form-data response, complete native state and every original exchange.
Read the capture time, engine and revision. These are sequential native
observations, not an atomic engine transaction.

The capture list retains interrupted and unavailable observations. Open the
original capture record to resume the same capture request. An unavailable
form or task remains inspectable with its full source; preparing a new
submission requires a live task and an available native form. Open all source
disclosures and download the complete originals when reviewing a capture.

The REST response omits unreadable properties. Hidden fields and hidden
default expressions are not reconstructed. A form key with no legacy
properties does not supply a modern Form Engine schema or an external form.

## Author explicit field values

Opening a saved capture creates a draft bound to its exact record, revision,
native task and engine. Each field displays its literal ID, label, type,
required/readable/writable flags, original value, date pattern and full options.
Read-only properties remain visible as source and are excluded from submission.

Each writable property has three explicit choices:

| Choice | Exact request |
| --- | --- |
| Omit this property | No row for the property |
| Submit exact text | A row with its exact string, including an empty string |
| Submit null | A row with value:null |

All properties initially remain omitted. The displayed original value may be
used as text only after explicitly choosing to submit it. This avoids treating
a displayed value as proof of a hidden native default.

Strings retain their complete entered text. Long integers remain decimal text,
including values beyond JavaScript's safe integer range; the adapter checks the
original signed 64-bit boundary without numeric rounding. Boolean choices are
literal true, false or empty text, plus the separate null choice. Enum choices
retain exact native option IDs. Date fields retain original text and the
server's Java date pattern: the browser does not apply its own date parser,
locale or timezone. Custom property types retain explicit native text, with
conversion left to the original engine.

Required omission is shown as guidance. The original engine checks key presence
or its unexposed default expression; it does not generally mean “nonempty
string.” Preparation does not invent default values. The native rejection,
when one occurs, is retained as the actual result.

## Complete unfinished work and reopen

Each browser window owns an independent working-copy identity. All captured
form drafts remain in that copy while switching among captures. Field edits
are saved through the original browser's IndexedDB. Earlier browser copies are
available for explicit recovery.

**Download complete working file** retains every selected source, unfinished
property choice, label, note, frozen capture/preparation input and exact native
submission request. **Open working file** checks every capture and reviewed
operation against this workspace before replacing the displayed copy, retains
the current copy, and opens a new browser-copy identity. Original request IDs
remain unchanged. Foreign workspace or changed source bytes are rejected before
adoption.

When IndexedDB is unavailable, download the complete current working file after
the exact request is frozen. Continuing that same request requires the exact
current file snapshot. Editing afterward invalidates that fallback until the
new complete copy is downloaded. The file remains necessary for reopening on a
different machine; saved capture and operation identities must first be present
in its received original workspace.

## Prepare, review and submit

**Prepare native form submission** freezes an original request UUID and the
complete input before calling the existing workspace writer. The writer checks
the exact selected capture revision and engine, builds the original native POST
body, and reads the current native task and form again.

If the task or form changed, the operation becomes **STALE**. Keep the old
draft/source and capture the current native form for another explicit review.
The original changed observations remain available in the saved record.

The prepared review displays the selected capture, task, native method/path,
exact string/null property array, warnings, full original request body and
native source. Use **Submit reviewed form and complete task** only after
reviewing that complete operation. The writer checks the saved revision,
plan hash, connection and current task/form state immediately before dispatch.

The task-form working copy retains the exact dispatch UUID, reviewed operation
and complete frozen arguments before sending. A missing response therefore
continues through **Read original submission result** with that same UUID.
Opening a working file never trusts its observed success/failure as permission
to create another native mutation.

**Refresh native outcome** reads the original saved dispatch and current/history
evidence. A successful HTTP 204 acknowledges the native form submission.
Confirmed completion additionally requires the actual matching completed task
history. Task disappearance or matching variables alone does not establish that
an uncertain POST succeeded and does not authorize an automatic replacement.

A preparation rejected before any record is created can be corrected through
**Keep original and author another review**. The current attempt must receive a
definitive structured input rejection and the exact derived original record
must still be absent. Unknown replies and existing incomplete requests continue
under their original ID. Earlier working copies preserve the rejected text and
request when the operator authors a corrected copy.

## Installed SDK and typed actions

The installed FlowableProductClient exposes the same original methods:

- captureTaskForm({requestId,connectionId,taskId,label?,note?})
- readTaskForm({id,revision?})
- prepareTaskFormOperation({requestId,connectionId,captureId,captureRevision,
  selection:{taskId,properties:[{id,value:string|null}]},label?,note?})
- dispatchTaskFormOperation({requestId,id,expectedRevision,planSha256})

readTaskForm returns the complete capture reference, task, form, native state,
resource references and original capture/journal links. Record kinds are
taskFormCapture and taskFormOperation. The normal readReview,
reconcileOperation, exportWorkspace, inspectDelivery and adoptDelivery APIs
retain their original behavior.

Use the original private product and its saved UUIDs. The example shape below
shows the wire types; actual task/property IDs and values come from the selected
native form.

~~~json
{
  "taskId": "ACTUAL_NATIVE_TASK_ID",
  "properties": [
    {"id": "ACTUAL_STRING_PROPERTY", "value": ""},
    {"id": "ACTUAL_NULLABLE_PROPERTY", "value": null}
  ]
}
~~~

Keep the complete selection file and original request UUID with the operating
case. An omitted property has no row in that file.

## CLI operation and complete handover

From the selected installed source, the original CLI accepts:

~~~sh
node products/flowable-merchant/cli.mjs capture-task-form \
  --dir /absolute/private/product --request ORIGINAL_CAPTURE_UUID \
  --connection ORIGINAL_CONNECTION_RECORD --task ORIGINAL_NATIVE_TASK_ID \
  --label "Native form capture"

node products/flowable-merchant/cli.mjs task-form \
  --dir /absolute/private/product --id ORIGINAL_CAPTURE_RECORD --revision 2

node products/flowable-merchant/cli.mjs prepare-task-form \
  --dir /absolute/private/product --request ORIGINAL_PREPARATION_UUID \
  --connection ORIGINAL_CONNECTION_RECORD \
  --capture ORIGINAL_CAPTURE_RECORD --capture-revision 2 \
  --selection /absolute/private/form-selection.json \
  --label "Reviewed task-form submission" --note "Original operating context"

node products/flowable-merchant/cli.mjs review-operation \
  --dir /absolute/private/product --kind taskFormOperation \
  --id ORIGINAL_OPERATION_RECORD

node products/flowable-merchant/cli.mjs dispatch \
  --dir /absolute/private/product --kind taskFormOperation \
  --request ORIGINAL_DISPATCH_UUID --id ORIGINAL_OPERATION_RECORD \
  --revision ORIGINAL_REVIEW_REVISION --plan-sha256 ORIGINAL_REVIEW_SHA256

node products/flowable-merchant/cli.mjs reconcile \
  --dir /absolute/private/product --kind taskFormOperation \
  --request ORIGINAL_RECONCILIATION_UUID --id ORIGINAL_OPERATION_RECORD
~~~

Use the actual returned capture/review revision; the capture revision in the
example is a placeholder. The generic call command can retain a complete JSON
reply with --out, and the generic prepare command accepts --capture and
--capture-revision for taskFormOperation. Retrying uses the original UUID and
exact saved arguments.

The four merchant tool names are merchant_flowable_capture_task_form,
merchant_flowable_task_form, merchant_flowable_prepare_task_form and
merchant_flowable_dispatch_task_form. They use the same host-declared workspace,
original credentials, action validation and writer. Full-source agent downloads
use the existing retained-file manifest and range reader through EOF.

Export the complete original workspace using its existing export action or
handover page. Download its full NDJSON, inspect it in the original receiving
workspace and separately adopt the returned manifest/revision. Reopen the
received task-form captures and operations, read all source links, full native
request/response/history, and compare exact retained files. The receiver keeps
all inherited record revisions and source bytes.

Browser working files preserve unfinished edits; full NDJSON preserves the
native workspace. Retain both for an unfinished handoff. The installed source
distribution includes the native adapter, typed editor, client/types, CLI,
agent integration and complete operating/native-contract guides.

## Complete native/browser receiving programme

Run the complete [TASK_FORM_NATIVE_RECEIVING.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/flowable/TASK_FORM_NATIVE_RECEIVING.md) programme through the existing accepting Flowable receiver. Its original Python host helper, native journey, borrowed browser chapter and actual BPMN source are included in the installed package. Keep FLOWABLE-NATIVE-TASK-FORMS-B43A-20261013, the original artifact-lock/runtime, full prior NDJSON and private output path stable. The programme retains actual accepted, rejected and stale submissions, raw task compatibility, full original-source downloads, unfinished working recovery and every native workspace revision in independent receiving.

## Producing operator and actual receiving

Continue the existing Flowable native receiving owner with the selected
installed source, original artifact-lock/runtime and complete prior workspace
NDJSON. Its actual isolated demo task/form selection belongs to that retained
programme. The producing operator opens and uses the exact delivered source
and all attachments at desktop and narrow widths, then returns complete native
and cold-receiving evidence with the original request identities.

Source review and source parsing describe the implementation. Actual engine
and rendered-product results belong to the original receiving operation and
its complete returned artifacts.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

