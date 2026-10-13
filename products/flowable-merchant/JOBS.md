# Native job inspection and recovery

TJLabs adds this operating workflow to the original Flowable workspace. It uses
the selected process REST service, original connection records, immutable source
blobs, reviewed native operations and complete workspace receiving.

The native contract is Flowable 8.0.0 at source commit
0779d68e5a3385b74d8acb8bc37901ff54513249. Read the complete companion
`JOB_NATIVE_CONTRACT.md` under the original Flowable source directory for exact
REST paths, Java source links, response meanings and native queue behavior.

## Select the actual engine and capture its jobs

Open the existing private Flowable product URL and choose its saved **process
REST** connection. Select **Native jobs**, then **Refresh native jobs**.
The workspace retains all original pages, full job detail and available native
exception evidence. Each saved capture has its own record and revision.

The five captured collections are:

| Collection | Native work retained | Explicit native actions |
| --- | --- | --- |
| Executable jobs | Current executable job details and exception evidence | Execute, delete |
| Timer jobs | Timer details, due date and exception evidence | Move using native job type, reschedule, delete |
| Suspended jobs | Suspended job details and exception evidence | Delete |
| Dead-letter jobs | Failed job details and exception evidence | Move using native job type, move to history queue, delete |
| History jobs | Native history job details | Execute, delete |

A capture records the observations returned by each page and detail request.
The engine continues operating during capture. Read the displayed capture time
and selected revision; a saved capture is not an atomic lock on the live engine.
An interrupted capture retains its original journal and responses. Open that
saved record and use **Resume original capture** with its original request.

Choose a captured collection, search the original job, process, execution or
exception fields, and open **Inspect / prepare**. The table pages the retained
rows. The inspector shows the full original job object and complete exception
downloads, including source byte counts and hashes. History job detail is
retained even when its native list omits advanced handler configuration.

## Author a source-bound recovery draft

Opening a captured job creates an unfinished draft bound to that captured job,
queue, connection and exact portfolio revision. Choose the native action,
describe the corrective work in the operator note, and give the operation a
readable name. A timer reschedule additionally requires the exact intended
native due date text, including the intended timezone.

The engine owns retry policy and queue selection. The desk does not invent a
retry count. **Move using native job type** follows the original engine's
selected job type and configured retry behavior; a dead-letter move can route
to another native queue. The process engine's internal job type is not inferred
from an absent public field.

Executing a job asks the engine to perform that job now. Deleting removes the
selected native job; it does not prove that its process completed. Keep the
intended action and reason explicit in the retained review.

Each browser window owns a separate complete working copy. Changing between
captured jobs keeps the earlier unfinished draft in that copy. **Download
complete working file** retains all source-bound drafts and original pending
preparation inputs. **Open working file** verifies each selected captured source
against this workspace and opens an independent copy. **Earlier browser copy**
keeps earlier windows available for explicit recovery.

Opening another file first downloads the current copy. A browser storage failure
leaves the current draft visible and permits its complete working-file download.
Native preparation continues only after the original request can be durably
retained. Use the existing same-origin window or reopen the exact working file
after storage is available.

## Prepare, review and dispatch

**Prepare selected job recovery** first retains the exact preparation UUID and
input. The original server reads the selected job and its full exception again.
It saves the original native plan, source evidence, request body and current
preimage. An absent job stays a failed preparation with retained evidence.

The saved review shows the actual connection, queue, job ID, action, path,
request bytes, before state, exception sources and operator note. Preparation
does not execute the native recovery.

Use **Execute reviewed job recovery** for the chosen saved review. The original
writer checks its revision, native plan hash, connection and selected job
preimage immediately before dispatch. A changed preimage becomes **STALE**;
review the current source in a new preparation. The original request is
durably marked dispatched before the engine mutation, so an interrupted reply
does not authorize a second execution.

A successful native HTTP 204 acknowledges the requested action. The exact
original response and observed queues remain separate evidence. A move without
a visible destination is not presented as completed execution. An absent job
after a lost response is not sufficient evidence of success.

## Continue the exact original request

The existing **Recover the original request** area retains the request UUID and
complete arguments before sending it. **Read original result** reuses that same
request. Job preparation and dispatch notices preserve this continuation rather
than discarding the request identity.

When a dispatch has an uncertain outcome, open its saved operation and use
**Refresh native outcome**. This reads the original response journal and current
native state. It does not repeat the write. Review the exact resulting status,
source and destination observations, and retained failure evidence.

A preparation draft becomes frozen after its request is saved. Reopening its
working file preserves that request. **Keep original and author another review**
first reads the exact original preparation, then opens a new browser copy and
keeps the earlier request, source and draft in their own history.

## Installed command line and typed client

The original product remains the single workspace owner. Use its installed
client while it is open. Inputs are private original JSON files, with a saved
UUID for each distinct capture, prepare, dispatch or reconciliation operation.

~~~sh
starforge flowable-product capture-jobs \
  --dir /actual/private/flowable-product \
  --request ORIGINAL_CAPTURE_UUID --connection ACTUAL_CONNECTION_RECORD_ID \
  --label "Native job recovery source"

starforge flowable-product job-portfolio \
  --dir /actual/private/flowable-product --id ACTUAL_CAPTURE_ID \
  --revision ACTUAL_CAPTURE_REVISION --collection deadLetterJobs \
  --offset 0 --limit 100

starforge flowable-product job \
  --dir /actual/private/flowable-product --portfolio ACTUAL_CAPTURE_ID \
  --revision ACTUAL_CAPTURE_REVISION --collection deadLetterJobs \
  --job ACTUAL_NATIVE_JOB_ID

starforge flowable-product prepare \
  --dir /actual/private/flowable-product --kind jobOperation \
  --request ORIGINAL_PREPARATION_UUID --connection ACTUAL_CONNECTION_RECORD_ID \
  --selection /actual/private/original-job-selection.json \
  --label "Reviewed native recovery" --note "Actual corrective work and reason"

starforge flowable-product review-operation \
  --dir /actual/private/flowable-product --kind jobOperation \
  --id ACTUAL_OPERATION_ID --revision ACTUAL_REVIEW_REVISION

starforge flowable-product dispatch \
  --dir /actual/private/flowable-product --kind jobOperation \
  --request ORIGINAL_DISPATCH_UUID --id ACTUAL_OPERATION_ID \
  --revision ACTUAL_REVIEW_REVISION --plan-sha256 ACTUAL_REVIEW_PLAN_SHA256

starforge flowable-product reconcile \
  --dir /actual/private/flowable-product --kind jobOperation \
  --request ORIGINAL_RECONCILIATION_UUID --id ACTUAL_OPERATION_ID \
  --revision ACTUAL_OBSERVED_REVISION
~~~

The literal original selection shape is:

~~~json
{"collection":"deadLetterJobs","jobId":"ACTUAL_NATIVE_JOB_ID","action":"move"}
~~~

A timer reschedule uses its actual queue and action plus `dueDate`. Keep
the exact selected text. The reference above is a format description; the
operating course consumes the actual selected job and approved action.

The typed `FlowableProductClient` exports `captureJobPortfolio`,
`readJobPortfolio`, `readJob`, `prepareJobOperation` and
`dispatchJobOperation`, plus original `readReview`,
`reconcileOperation`, `downloadSource` and complete handover methods.
The original `flowable-workspace call` command exposes the same declared
methods over the saved private URL, retaining workspace identity and exact input.

## Complete handover and cold receiving

Use the existing **Handover** page or installed export/download commands.
Job portfolios and operations are ordinary records in the same immutable
workspace. Complete original response bodies, exceptions, native plans,
request journals, preparation/dispatch/reconciliation revisions and source
resources travel in its full NDJSON archive.

On the receiving host, use the original inspect and adopt actions into its
selected workspace. Open the same captured job and operation revisions,
read every original exception and native response, and download the retained
source to compare its exact byte count and SHA-256. Receiving history does not
itself dispatch a native job. The recipient explicitly selects its own
authorized engine configuration before a later operation.

The selected distribution already includes both the complete original
`sf30-seller-sdk/flowable` directory and `products/flowable-merchant`.
The managed product source inventory binds the job adapter, operator module,
guide and current shared model. Install this complete selected source cohort
at the existing receiving owner's next compatible boundary.

## Complete native demonstration and receiving programme

The installed source includes the [complete native receiving guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/flowable/JOB_NATIVE_RECEIVING.md),
its Python coordinator, both native/browser modules and the full BPMN definitions.
Continue `FLOWABLE-NATIVE-JOB-RECOVERY-B43A-20261013` through the existing receiving
owner with its original installed Flowable release, retained WAR/runtime and
complete preceding workspace NDJSON.

The coordinator creates a separate private demonstration engine and retains the
same H2 database across its prepare, asynchronous-failure and operated-recovery
phases. It creates a genuine failed asynchronous job, retains its dead-letter
exception, operates timer/executable/history recovery, reopens unfinished browser
work, reconciles an interrupted original response, and cold-receives every
original and added workspace revision. It packages the closed native case,
complete selected source, workspace archives, visible downloads and browser
observations. The guide gives the exact original command and continuation paths.

## Producing operator: actual product and attachments

Continue the original Flowable engine/workspace/browser operation and its
selected native version. The complete native/browser chapter consumes an
explicit actual job selection and retained operation ID. It operates the
ordinary capture, source inspector, unfinished-file reopen, native preparation
and reviewed action, original lost-response reconciliation and full cold
handover. Keep the current host, credentials, source and workspace authoritative.

Read and apply the following standing owner instruction to the exact
outgoing application and every attachment. Source parsing and independent
source review remain distinct from this actual receiving result.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

