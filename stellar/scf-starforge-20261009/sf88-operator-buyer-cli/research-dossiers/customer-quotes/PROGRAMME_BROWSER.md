# Customer programme browser and complete receiving

Open **Customer programmes** from the existing quotation workspace, or open
`/customer-quote-programmes.html` on the same private Research listener. Use its
existing workspace token. The application operates the original saved
programme, commercial case, quotation, Research customer delivery and paid
publication. It keeps their native histories and exact request identities.

A complete delivery includes the selected case edition, original programme and
step inputs, all selected native operation files, every required completed paid
publication and the frozen customer handover. The downloadable archive contains
those complete files. A receiving workspace retains its own copy, presents its
actual native review, then receives through the original case and dossier
writers.

## Open and prepare the programme

1. Open the original Research workspace and its configured quotation desk.
   Open **Customer programmes**, then **New programme**.
2. Select the saved Research dossier and its actual customer project. The
   displayed Research edition becomes part of the programme's retained input.
3. Select an existing commercial case, or choose to create the case inside this
   programme. The latter retains the intended original case identity; use the
   original case form to create it.
4. Save the programme. **Operations** shows its retained native job. A browser
   can leave while that accepted job continues in the original host.
5. Open the completed programme and **Open original quotation forms**. Those
   existing forms now show the programme name and attach their original requests
   as saved steps. Their source, customer, scope, tariff, pricing, publication
   and actual payment semantics remain with the existing native engines.

The normal quotation page also remains usable independently. Programme context
is selected by its explicit URL and shown above its original forms. Working
forms and requests retain that context; reopening a request does not silently
move it to another programme.

The programme view shows all retained steps and their native state. Open a
step to read the complete original result. **Apply this exact reviewed selection**
uses that step's displayed native review SHA. **Replay the exact original
request in a new step** creates a distinct programme step while retaining the
original request and input. Reopening an interrupted job continues its same
job ID and native phase.

An operator can also supply a complete original JSON step input using
**Receive an original step input**. Select the original native command and, when
required, its case action or pricing profile. The complete input is retained
before dispatch. This includes the dedicated full CASE_TRANSFER input.

## Prepare the complete customer delivery

From the saved programme, prepare a handover:

- Select the saved native case edition.
- Select the original completed customer delivery and its Research edition.
- Include every completed programme step at the first capture, or select an
  explicit retained set.
- Select the existing literature workspace only when it belongs to the
  original customer delivery. Its library, actor and request remain explicit.

Saving retains this complete selection. The native exporter freezes the first
complete original capture. Replaying that same request reopens the same
selection after later case or customer work.

The completed job opens the full package. Its paged file browser shows each
original relative name, byte count and SHA256. The original manifest and every
member can be downloaded. **Prepare complete downloadable archive** makes one
immutable gzip archive from that complete package and the original manifest
file order.

The archive filename is
`research-programme-<full archive SHA256>.sf88q.gz`. Keep that full filename or
the original metadata when moving the file. The SHA identifies the complete
compressed archive; the manifest SHA identifies its complete original native
manifest. Both remain available in the original archive job.

The browser downloads the archive in verified 4 MiB ranges. Each range is read
from the same checked original archive and bound to its full ETag and chunk
checksum. Browsers supporting streamed file saving write those verified chunks
to the selected destination without collecting the entire archive in memory.
The fallback download supports files up to 256 MiB. For a larger archive, use a
browser supporting streaming file saving or the installed native typed client,
which streams the complete original response through its existing hash-checked
file publisher.

## Upload and inspect on the destination

1. Open **Receive a package** on the actual destination Research workspace.
2. Select the complete original archive. Its standard filename supplies the
   archive SHA. If renamed, enter the SHA from the original completed archive
   metadata. Optionally pin the original manifest SHA too.
3. Choose **Upload or resume the selected complete archive**. The browser
   retains its working selection before starting the upload.
4. If interrupted, reopen that same saved working form and select the same
   complete file. The native upload reports the exact retained offset and any
   partially written original chunk. That exact chunk is retried before the
   remaining bytes advance.
5. After every byte is present, native finish verifies the complete archive
   before exposing its completed path. Choose **Import the complete retained
   archive**.
6. Open the completed package and inspect its source selection and full file
   roster. The original native semantic inspector checks all programme steps,
   case and customer content, operation files and required paid publications.

Upload and import are transport operations. The separate destination review
below selects the local case revision and applies the incoming native histories.

A completed upload remains available after the browser's file selection goes
away. A completed import retains its full package under the original import
operation and reopens it through the same native engine.

## Review and receive the destination

Choose **Prepare destination receiving** from the complete package.

The application displays the destination Research and commercial case-store
identities. If the original case already exists here, read its current saved
revision and explicitly select it. A new local case uses a null parent
revision. For a handover including an original literature workspace, provide the
required original source actor.

The resulting review shows the original source case, exact incoming customer
selection, destination identities, complete retained package and native
CASE_TRANSFER review. Read that actual review, then choose **Receive this exact
reviewed programme**. The job delegates to the original native case and
customer/dossier receiving writers.

The completed receiving record identifies the actual destination case revision,
dossier, customer project and frozen delivery. Continue the received Research
customer from that result, or reopen its exact receiving job and retained
package after closing the source and destination clients. Later destination
work remains in the original histories.

## Saved work and recovery

**Saved working forms** keeps complete programme creation, handover, upload and
destination-review forms. Export a complete working form, then receive it as a
separate saved form on the same workspace. Receiving a form preserves existing
work rather than replacing it. The form's original native IDs remain selected;
choose **Copy as a new request** to preserve the current complete values under a new native job ID. Creation also gives the new programme its own identity. An import copy keeps the original upload selection, so a corrected import can reuse the completed upload.

**Operations** shows the original native jobs:

| State | Operator action |
| --- | --- |
| READY | Resume the retained job if an earlier browser/host stopped before execution. |
| RUNNING | The same host owns its accepted native work. Read status or return later. |
| RETRY_REQUIRED | Read the saved failure, repair the actual input dependency, then resume that original job. |
| COMPLETE | Open the original full result, files, package or receiving completion. |

A browser request is saved before HTTP dispatch. An interrupted response keeps
that request for exact resubmission. Job input, compact request identity,
attempts, full first result and completion summary remain in the host's private
programme directory. Native phase replay resolves its original saved requests.

Closing the Research application denies new programme admission and drains its
accepted jobs while the original quote, commerce, dossier and listener owners
are still live. Failed original closers retain their handles for retry. The
borrowed HTTP client does not stop the listener itself.

The desk directory is
`<original Research directory>/customer-quote-programmes`, with original
`jobs/`, `programmes/`, `exports/`, `archives/`, `uploads/`, `imports/`
and `receiving/` directories. All native paths are derived from validated
original IDs. The authenticated browser cannot select an arbitrary host
destination. Preserve that original directory when backing up the operated
Research workspace.

## Typed client

Use the existing installed Research client and its same retained connection:

~~~js
import {ResearchWorkspaceClient} from './workspace-client.mjs';

const workspace = ResearchWorkspaceClient.fromFile(originalConnectionFile, {
  expectedWorkspaceId: originalResearchId,
});
try {
  await workspace.status();
  const programmes = workspace.customerQuoteProgrammes();
  const info = await programmes.info();
  const job = await programmes.submit({
    id: originalJobId,
    kind: 'CREATE',
    value: originalProgrammeInput,
  });

  // Save job.id and continue this same native operation.
  const current = await programmes.job(job.id);
  const complete = current.status === 'COMPLETE'
    ? await programmes.job(job.id, {result: true})
    : current;
  consumeOriginalResult(complete);
} finally {
  await workspace.close();
}
~~~

`submit()` returns the retained asynchronous job. Read its status explicitly;
`resume(id)` continues its original saved input. Every public method enters the
original client's admission once. Multi-stage metadata/download operations
remain admitted through the complete file write, even if client closure begins
between those stages.

Complete package and archive downloads use that original streaming writer:

~~~js
const programmes = workspace.customerQuoteProgrammes();
const archive = await programmes.archive(originalArchiveJobId);
const saved = await programmes.downloadArchive(originalArchiveJobId, {
  file: absoluteDestination,
  expectedBytes: archive.bytes,
  expectedSha256: archive.sha256,
});
~~~

The saved result includes the exact selected metadata. If publication completed
before an error, the error's original `file` also retains that metadata.
`download()` selects a package member; `downloadJobFile()` selects
`job-input.json`, `request.json` or `result.json`. Complete large case files
retain their native limit.

The upload client exposes the same retained native operation:

~~~js
let upload = await programmes.startUpload({
  id: originalUploadId,
  name: originalArchiveName,
  bytes: originalArchiveBytes,
  sha256: originalArchiveSha256,
});

// For each original file slice, use pendingChunk first when present.
// Never advance over its partially written original payload.
upload = await programmes.appendUpload(originalUploadId, {
  offset: selectedOffset,
  data: completeOriginalSlice,
  sha256: originalSliceSha256,
});

upload = await programmes.finishUpload(originalUploadId);
~~~

A chunk is at most 4 MiB. Read `upload(id)` before resuming. Its fields are
`totalBytes`, `receivedBytes`, `chunkBytes`, `state` and optional
`pendingChunk`. The completed record adds the original `path`, `bytes`
and `sha256`. Import that completed upload using the original IMPORT job,
then prepare and apply destination receiving separately.

## Native job inputs

Every job has an original UUIDv4 `id` and one `kind`:

| Kind | Complete selected fields |
| --- | --- |
| CREATE | `value`: original programme input. |
| SUBMIT | `programmeId`, `stepId`, `command`, full `value`; original `action`/`profile` where required. |
| APPLY | `programmeId`, `sourceStepId`, distinct `stepId`, exact `reviewSha256`. |
| REPLAY | `programmeId`, `sourceStepId`, distinct `stepId`. |
| EXPORT | `programmeId`, full handover `value` with its `programmeDirectory` omitted; `value.requestId` equals job ID. |
| IMPORT | `uploadId`, optional original `manifestSha256`. |
| ARCHIVE | `bundleId`, original `manifestSha256`. |
| RECEIVE_REVIEW | `bundleId`, `manifestSha256`, full original receiving `value`; its request ID equals job ID. |
| RECEIVE | Original reviewed `receivingId`, exact `reviewSha256`. |

The maintained [programme guide](PROGRAMME.md) defines original full inputs.
[CASE_TRANSFER.md](CASE_TRANSFER.md) defines the complete original native case
packet and compact request identity. The installed Python
[programme guide](../../python/RESEARCH-QUOTE-PROGRAMMES.md) exposes the same
native workflow and four-phase receiving example.

## Original authenticated HTTP surface

All routes share the existing Research workspace's bearer token, origin/host
checks and workspace/instance identity headers.

| Method and route suffix under `/api/customer-quote-programmes` | Operation |
| --- | --- |
| GET `/info` | Original desk and quote configuration. |
| GET `/jobs` | Paged retained jobs, optional kind and snapshot. |
| POST `/jobs` | Retain and schedule one original job. |
| POST `/jobs/case-transfer` | SUBMIT of the original full CASE_TRANSFER request. |
| GET `/jobs/:id?result=true` | Exact retained job and optional full completed native result. |
| POST `/jobs/:id/resume` | Continue the same retained job. |
| GET `/jobs/:id/files?name=...&metadata=true` | Original input/request/result metadata; omit metadata for full body. |
| GET `/programmes/:id` | Native programme and original step summaries. |
| GET `/programmes/:id/steps/:stepId` | Selected original step and full native result. |
| GET `/bundles/:id` | Full inspected package selection. |
| GET `/bundles/:id/files` | Paged complete file roster, or selected name/body. |
| GET `/archives/:id?metadata=true` | Original full archive selection; omit metadata for body or Range. |
| POST `/uploads` | Retain one exact upload selection. |
| GET `/uploads/:id` | Original offset, state and pending chunk. |
| PUT `/uploads/:id?offset=...&sha256=...` | Exact original binary chunk. |
| POST `/uploads/:id/finish` | Complete original archive verification. |
| GET `/receiving/:id` | Original destination review and saved receiving state. |

Ordinary native inputs retain their 96 MiB plus 65,536-byte bound; CASE_TRANSFER
uses its dedicated 602,962,240-byte bound. The HTTP job wrapper has a separate
65,536-byte allowance. Package members retain the original file/case limits and
the complete 40,000-member roster limit. The archive limit is derived from those
native bounds and framing allowance. Limits do not truncate a valid selected
case or omit its full native files.

## Complete installed receiving journey

Use the original customer programme and native receiving operation. Open its
installed browser, save a programme, create or select its native case, and use
the existing quotation forms for the brief, customer response, frozen
publication and realized report. Open the resulting original step reviews,
apply their exact selections and replay a completed request in a distinct step.

Export that programme with its selected case and customer delivery. Download
the complete archive, upload it to the existing destination, reopen an
interrupted original chunk, import and inspect the full member roster, then
apply the actual destination receiving review. Reopen the saved result and
receiver-owned package after closing both borrowed clients. Preserve those
actual source, case, dossier, customer, request and output identities with the
same original operation.
