# Research customer programmes through Merchant

The Research Merchant provider now operates the same saved customer programmes used by the installed browser, native terminal and Python client. It can retain a complete case and dossier handover, transfer its original archive between two attached Research applications, and continue the destination's original review and receiving jobs.

The Research application owns its listener, programme directories, native operations and customer case store. Merchant owns only its attachment, declared input handles, complete downloaded files, transfer selections and temporary file readers. This distinction lets an operator switch between the browser and agent without inventing a second case or programme.

## Install and attach the original applications

Use the existing Research Applications commissioning flow and original Research workspace declaration. Start the source and destination applications through their existing owners. Each needs the installed programme browser/desk, original quotation configuration and customer case store. The destination may use a different private store and pricing or merchant configuration; the receiving review checks its actual current native case state.

A Merchant Research declaration keeps the existing schema:

```json
{
  "schema": "stellar-forge.research-workspaces.v1",
  "workspaces": {
    "source": {
      "label": "Research delivery source",
      "consoleUrlFile": "/private/research-source/console.json",
      "directory": "/private/research-source/store",
      "sources": {
        "programme-request": {
          "kind": "programme-input",
          "file": "/private/research-inputs/programme-request.json",
          "sha256": "COMPLETE_ORIGINAL_FILE_SHA256"
        },
        "customer-archive": {
          "kind": "programme-archive",
          "file": "/private/research-inputs/customer-programme.sf88q.gz",
          "sha256": "COMPLETE_ORIGINAL_ARCHIVE_SHA256"
        }
      }
    },
    "destination": {
      "label": "Research receiving application",
      "consoleUrlFile": "/private/research-destination/console.json",
      "directory": "/private/research-destination/store",
      "sources": {}
    }
  }
}
```

The paths and hashes above are configuration placeholders. Use the actual original private files and complete hashes. The normal connection reader resolves relative declared paths against this configuration file. The application startup file supplies the authenticated listener; do not copy its bearer token into tool arguments.

The `programme-input` handle is a complete native desk-job JSON document. It is useful for large CASE_TRANSFER input and for retaining complete customer requests outside a tool message. A `programme-archive` is the original complete framed gzip archive. No tool accepts an arbitrary client-selected host path.

Call `merchant_research_workspaces`, then `merchant_research_attach` for each selected alias. Call `merchant_research_programme_info` on both. Save each returned `workspaceId`, the native case configuration and the original attachment IDs. Every subsequent programme tool requires its exact selected workspace identity. A changed alias cannot silently redirect the same programme operation into another store.

## Operate a whole source programme

### Select the original customer work

Read the Research dossier, project, requested-work edition and delivery history using the existing Research tools or browser. Read the original quotation case through `merchant_research_quote_case`. A programme selects those real IDs and revisions. It may create a new case or continue an existing case.

The existing programme input has:

```text
schema: sf88-research-quotation-programme/v1
id: original programme UUID
name: operator's programme name
dossierId: original dossier ID
revision: exact retained dossier revision
projectId: original customer project ID
caseId: chosen native case UUID
caseMode: CREATE or EXISTING
```

Create a complete desk job with its own stable UUID:

```text
id: original CREATE job UUID
kind: CREATE
value: the complete programme input above
```

Submit it using `merchant_research_programme_submit`, passing `id` equal to that job ID and exactly one of `input` or `source`. The source-handle variant reads the complete declared JSON and checks its SHA. Merchant retains the complete original source-file bytes and their SHA before publishing the normalized native input. A resumed request checks that normalized input against the retained original file before the application receives it, including after the donor file moves.

The reply is the native asynchronous job state: READY, RUNNING, RETRY_REQUIRED or COMPLETE. Read `merchant_research_programme_job` using the same ID. Resume an interrupted job with `merchant_research_programme_resume`; preserve its ID and complete input. The original native job owns its own accepted work.

### Add native quotation and delivery steps

Use `merchant_research_programme_submit` with a SUBMIT job:

```text
id: stable desk job UUID
kind: SUBMIT
programmeId: selected original programme UUID
stepId: stable operator step name
command: original native quotation command
value: complete original native request
action: only for the original native-case/pricing commands
profile: only for the original pricing command
```

The original commands include case creation and transfer, native commercial case actions, pricing, brief preparation, customer response preparation, publication preparation and realized reporting. Their complete contracts remain in `PROGRAMME.md`, `CASE_TRANSFER.md` and `OPERATING.md`. The programme adds retained identity around those engines; it does not substitute a new quote calculation or customer writer.

A step should keep the exact observed customer and source revisions. Native request IDs inside `value` remain unchanged when the outer desk job is resumed. For the large case-transfer command, put the complete original CASE_RECORD packet in a declared `programme-input` file. The native dedicated case limit remains available; the ordinary Merchant message limit does not require placing that entire file inline.

Read `merchant_research_programme_step` for the exact request, native review and next action. A complete original input stays available through the job's `job-input.json` file. Read `merchant_research_programme_state` for the retained programme header and paged steps; retain `stepPage.snapshot` across pages. `nativeSnapshot` preserves the original complete programme snapshot.

### Apply an actual review

An APPLY job carries:

```text
id: stable APPLY job UUID
kind: APPLY
programmeId: original programme
sourceStepId: the step that returned the actual native review
stepId: a distinct retained application step name
reviewSha256: exact displayed review SHA
```

The original programme engine chooses the proper native apply command from that step. It validates the original review and current native writer conditions. A completed same-ID request reopens the saved first result.

A deliberate REPLAY is a distinct retained step:

```text
id: stable REPLAY job UUID
kind: REPLAY
programmeId: original programme
sourceStepId: the original retained step
stepId: a new replay step name
```

Resume the same REPLAY job after a lost reply. Creating another replay ID is a deliberate new invocation, not recovery of the previous one. The original browser and agent share this distinction.

## Freeze and inspect the complete customer package

Once the selected customer work and frozen delivery exist, create an EXPORT job. Its `programmeId` selects the original programme. Its complete `value` is the native handover request with `programmeDirectory` omitted; the desk supplies its own original programme directory.

The value includes the native handover schema, requestId, exact case revision, delivery ID, dossier revision, optional original source workspace and selected step IDs. The value's requestId must equal the desk job ID. Use the actual case revision and frozen delivery ID returned by the original writers.

The native exporter retains the whole programme and original case, full selected step inputs and replies, required native operation files, complete paid-publication handoffs and archives, editable dossier, work snapshot and frozen report bodies. The original semantic inspector verifies this complete selected set.

After the EXPORT job completes:

1. Call `merchant_research_programme_bundle` with its job ID and exact manifest SHA.
2. Page `merchant_research_programme_files` from offset zero, preserving the returned snapshot.
3. Use `merchant_research_programme_file_info` for a selected member's exact name, byte count and SHA.
4. Retain complete members with `merchant_research_programme_retain`, kind BUNDLE.
5. Read the retained file by exportId and verify its complete decoded length and SHA.

The bundle summary returns the actual selected case, dossier, delivery and publications plus the total member count. The paged file inventory contains every member. It does not replace the complete package with a table or summary.

For a job's complete original input, compact native request or result, select kind JOB and one of `job-input.json`, `request.json` or `result.json`. Full files remain separate from compact model-control replies.

## Create and transfer the original archive

Create an ARCHIVE job using a stable ID, the completed EXPORT or IMPORT bundle ID and exact manifest SHA. Read the completed job, then `merchant_research_programme_archive` with the ARCHIVE job ID.

The original archive metadata includes complete byte count, full SHA, manifest SHA and original source selection. These are the transfer inputs. The gzip framing preserves the complete native manifest and file order and supports the original native per-member limits. It is streamed; the Merchant operation does not assemble the complete archive in memory.

### Transfer between attached applications

Attach the receiving alias first and inspect its actual workspace identity. Call `merchant_research_programme_transfer` with:

```text
workspace / workspaceId: original source attachment and store
operationId: stable Merchant transfer UUID
archiveId: original completed ARCHIVE job UUID
sha256 / bytes / manifestSha256: exact original archive metadata
destination / destinationWorkspaceId: attached receiving alias and original store
uploadId: stable original destination upload UUID
```

The transfer retains this exact selection before dispatch. Both source and destination participate in the accepted operation's lifetime. Their original clients and attachments remain available until the accepted transfer drains.

The receiver uses its existing four-MiB upload protocol. It retains each pending chunk identity before appending. A stopped partial append continues from the same original prefix and SHA. The source Range request binds the original total bytes, ETag, complete hash and exact chunk hash.

If the call is interrupted, inspect `merchant_research_programme_transfer_status` using operationId and the destination `merchant_research_programme_upload` using uploadId. Continue the identical transfer selection. A retained completed result reopens before the donor archive is needed. An incomplete destination upload resumes its original verified prefix.

The transfer result contains the original source identity and the COMPLETE destination upload. It does not create a new customer case automatically; that remains the next explicit native import and receiving review.

### Receive a declared local archive

Use `merchant_research_programme_upload_source` for a configured `programme-archive` handle. Supply the complete SHA, bytes, stable operationId and uploadId. The file must match its declared source SHA.

The same native upload engine owns pending chunks and final verification. A completed original destination upload can reopen after the donor file is moved. The local transfer owner retains any failed file closer and retries that owner during detach/Stop.

## Import and receive into the destination

On the destination alias, submit an IMPORT job:

```text
id: stable IMPORT job UUID
kind: IMPORT
uploadId: original COMPLETE destination upload UUID
manifestSha256: exact selected programme manifest SHA
```

The importer verifies the whole archive and native package and retains the complete package under its own operation. Read the resulting bundle and page its files. The receiver now owns complete source bytes for the following native review and saved receiving; it does not rely on the source host remaining online.

Create a RECEIVE_REVIEW job:

```text
id: stable receiving review UUID
kind: RECEIVE_REVIEW
bundleId: completed original IMPORT job ID
manifestSha256: exact imported manifest SHA
value:
  schema: sf88-research-quotation-programme-receiving/v1
  requestId: the same receiving review UUID
  expectedWorkspaceId: destination Research workspace ID
  expectedCasesWorkspaceId: destination original case-store ID
  expectedRevision: null for a new destination case, or its exact current revision
  sourceActor: selected original receiving actor, or null when allowed by the native source
```

Call `merchant_research_programme_receiving` with the original receiving review ID. Inspect the displayed native case-transfer review and complete customer source selection. The review binds the exact source case and destination revision. Keep the actual review SHA; it cannot be predicted from the source archive alone.

Submit RECEIVE with its own stable desk job ID, `receivingId` equal to the reviewed receiving operation, and the exact displayed `reviewSha256`. The original CASE_TRANSFER writer receives the full native case history and metadata, preserving destination-owned history through its native merge and revision checks. The original customer receiver adopts the complete editable dossier and frozen delivery.

Read the RECEIVE job's original result and retain its full `result.json`. Reopen the received dossier/case using the ordinary Research and quotation tools. The original Python receiving example and browser can read that same saved work.

After later destination edits, a retry keeps the original receiving IDs. Its saved first result resolves before current-source checks. A new reviewed delivery uses new operation IDs and the actual new destination revision.

## Complete file retention and reader recovery

`merchant_research_programme_retain` uses a content-addressed selection of original kind, job/bundle ID, member name, complete SHA and bytes. The same file reopens before a donor call when it is already retained. Its source metadata, selection and complete payload are private to the declared Merchant exports root.

`merchant_research_programme_retained` pages that durable inventory. Each exportId is sufficient to reopen its full native-descriptor reader after reattachment.

`merchant_research_programme_read` returns base64 chunks with readId, complete file metadata, offset, bytesRead and nextOffset. Continue with the same exportId/readId. After reader expiry or application restart, omit readId and keep exportId plus the original offset. The complete retained file remains available. Verify the final complete SHA and byte count in the consuming process.

Readers use the maintained immutable-file implementation. They hash the original read-only descriptor, check its identity while serving chunks and own that descriptor until release or completion. Large complete archives and case records use their original owner limits without copying the whole file into a model message.

Call `merchant_research_programme_release` when abandoning a temporary read. The payload and its durable selection remain.

## Tool surface

| Tool suffix | Purpose |
| --- | --- |
| info | Original application, workspace and programme capabilities |
| jobs / job / resume | Paged native jobs, exact saved job, original continuation |
| state / step | Paged programme steps and a complete selected step |
| receiving | Complete original destination review and saved receiving result |
| submit | Original CREATE/SUBMIT/APPLY/REPLAY/EXPORT/IMPORT/ARCHIVE/RECEIVE_REVIEW/RECEIVE jobs |
| bundle / files / file_info | Complete package identity, paged members and exact file selection |
| retain / retained | Complete source file retention and durable inventory |
| read / release | Original immutable file ranges and temporary reader disposal |
| archive / upload | Original source archive and destination upload state |
| upload_source | Host-declared original archive to the selected application |
| transfer / transfer_status | Two-attachment exact transfer and retained recovery |

Every suffix uses the `merchant_research_programme_` prefix.

## Ownership and Stop

Detach using the current original Research attachment ID. The host drains accepted calls and transfers, then attempts programme-owned file readers, local transfer closers, original commerce owners and the borrowed connection. Successful closes stay retired; failed owners remain available to the same retry. Detaching Merchant does not close the Applications-owned Research listener.

An interrupted tool reply is a request-recovery problem: inspect the same native job, transfer operation or receiving selection. The complete source inputs and original first results already belong to their native owners. Keep those IDs while continuing the customer programme.
