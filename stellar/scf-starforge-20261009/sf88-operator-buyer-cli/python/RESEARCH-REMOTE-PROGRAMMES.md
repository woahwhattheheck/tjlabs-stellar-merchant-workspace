# Remote Research programmes from installed Python

This is the installed Python route to the existing remote Research programme
operator. It uses the same configured Research hosts, original programme jobs,
CaseStore receiving, complete archive uploader, file publisher and transfer
owner as the maintained Node terminal and Merchant tools.

A Python journal retains each exact original call, raw argument file, selected
configuration, native attempt and complete response. Responses are file-backed.
A completed call can be verified and reopened without Node, a connection file,
either Research host or the original donor.

The local Python programme API remains available independently in
[RESEARCH-QUOTE-PROGRAMMES.md](RESEARCH-QUOTE-PROGRAMMES.md). Its native directory
bridge and this two-host remote facade use their original engines. This guide
covers the remote route and the complete phased receiving example.

## Install and select the existing application

Use the maintained Python package from the complete original distribution. The
module entry point works independently of any optional console alias:

~~~sh
python -m stellar_forge_buyer.research_cli --help
~~~

Global options precede the child command:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory /private/python-remote-journal \
  --checkout /actual/installed/source \
  --node node --timeout 360 \
  quotes-remote-info \
  --configuration /private/programme-operator.json \
  --workspace source --call-id source-info-001
~~~

Here **--directory** is the separate Python journal. **--checkout** selects the
actual installed original Node source that contains the research-programme-remote
Runtime target. **--configuration** and **--workspace** belong to the child
command. The facade creates no Research listener or replacement commercial
store. The two Research applications must already be configured by their
original owners for any fresh remote work.

Use Python 3.10 or later on the original supported POSIX host. Paths are absolute
and canonical. Keep the original operator configuration private, owned by the
operator and mode 0600. Do not place the Python journal above, below or at the
native operator directory.

## Declare the two original hosts and full sources

The configuration is the maintained ResearchProgrammeOperator schema:

~~~json
{
  "schema": "stellar-forge.research-programme-operator.v1",
  "directory": "/private/native-programme-operations",
  "workspaces": [
    {
      "id": "source",
      "connectionFile": "/private/source.connection.json",
      "workspaceId": "research_REPLACE_WITH_ACTUAL_SOURCE_64_HEX"
    },
    {
      "id": "receiving",
      "connectionFile": "/private/receiving.connection.json",
      "workspaceId": "research_REPLACE_WITH_ACTUAL_DESTINATION_64_HEX"
    }
  ],
  "sources": [
    {
      "id": "original-create-job",
      "kind": "programme-input",
      "file": "/private/original-create-job.json",
      "sha256": "REPLACE_WITH_COMPLETE_FILE_SHA256"
    },
    {
      "id": "original-archive",
      "kind": "programme-archive",
      "file": "/private/original.sf88q.gz",
      "sha256": "REPLACE_WITH_COMPLETE_ARCHIVE_SHA256"
    }
  ]
}
~~~

Replace every marked value with an actual selected identity. The connection files
use the original Research client schema and stay with their owner. Obtain each
expected workspace ID from the original authenticated host. The examples do not
supply an actual customer, grant, source permission or review approval.

The native operator directory stores original remote input, transfer and retained
file records. It must be distinct from all declared connection and source files.
The Python journal retains the entire original configuration bytes and their SHA.
A new call rejects a changed supplied configuration. Exact recovery uses its
retained selection; changing a donor's contents or replacing a workspace under
the same identity is not an upgrade mechanism.

Inspect the selected declaration without opening either host:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory /private/python-remote-journal \
  quotes-remote-configuration \
  --configuration /private/programme-operator.json
~~~

After the first selection is retained, the same command can omit
**--configuration**. This is a local configuration read, not an observation of
current host availability.

## Complete call, complete reply, original attempt

All native commands accept a whole JSON argument file:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory /private/python-remote-journal \
  --checkout /actual/installed/source \
  quotes-remote-state --workspace source \
  --configuration /private/programme-operator.json \
  --input /private/programme-state.json \
  --input-sha256 REPLACE_WITH_COMPLETE_ARGUMENT_FILE_SHA256 \
  --call-id source-state-001
~~~

For example, programme-state.json selects the actual original programme:

~~~json
{"programmeId":"REPLACE_WITH_ORIGINAL_PROGRAMME_UUID","offset":0,"limit":20}
~~~

Omitting **--input** supplies an empty object, useful for **info**. The exact raw
input is retained before dispatch. **--input-sha256** requires **--input**.
Python argument JSON is limited to 16 MiB; it is routing and selection data.
For a large original native job, declare a complete programme-input file in the
configuration and submit its source handle. The original native input and
CASE_RECORD limits remain authoritative; the Python wrapper does not put a
large archive into base64 JSON.

Default terminal output contains **record**, preserving the full request,
completion descriptor and any available native attempt. Open its
**record.result.file.path** to consume the complete JSON reply. The SHA and size
refer to the entire file. For an export, **record.result.exportedFile** points
to the complete original member/archive separately.

Use **--json** to also materialize and print the complete response. The default
printing limit is 16 MiB; **--json-limit BYTES** explicitly changes it up to the
SDK response limit. This option never truncates a reply. If the whole reply
exceeds the printing limit, the original complete call is already retained and
can be reopened with **saved** or the file-backed SDK.

A saved result may coexist with a later stdout, cleanup or runtime failure.
Inspect **record.attempt** as well as **record.result**. A saved response proves
that its complete bytes were retained; it does not erase a recorded native
output/close error or make an asynchronous job COMPLETE.

## Original command map

The child command prefix is **quotes-remote-**. CLI hyphens map to the unchanged
underscore names in ResearchRemoteProgrammes.invoke.

| Child suffix | Original arguments and result |
| --- | --- |
| info | Empty object; original programme desk configuration and capabilities. |
| jobs | offset/limit and optional snapshot/kind; complete native job page. |
| job | id; a snapshot of the original native job. |
| resume | id; explicitly resume the original failed/stopped native job. |
| state | programmeId plus optional page selection; original programme and step page. |
| step | programmeId/stepId; exact retained step and its original input-file metadata. |
| submit | id and exactly one of source/input; original asynchronous job admission. |
| receiving | id of the original RECEIVE_REVIEW job; full destination receiving view. |
| bundle | id and optional manifestSha256; complete original package selection. |
| files | id plus page/snapshot; exact original full member roster. |
| file-info | kind/id and exact name for JOB/BUNDLE; ARCHIVE omits name. |
| retain | kind/id/bytes/sha256 and member name where required; complete local original file. |
| retained | page/snapshot; original retained file inventory. |
| read | exportId, optional readId/offset/limit; original retained-reader chunk. |
| release | readId; close that original retained reader. |
| archive | id of a completed ARCHIVE job; actual whole archive and manifest pins. |
| upload | id; original upload state, receivedBytes, totalBytes and pending chunk. |
| upload-source | operationId/uploadId/source/bytes/sha256; stream a declared local archive. |
| transfer | operationId/archiveId/bytes/sha256/manifestSha256/destination/destinationWorkspaceId/uploadId. |
| transfer-status | operationId; retained original transfer selection/result. |
| export | Exact retain selection plus child --file; complete create-only local copy. |

Native paging uses its returned snapshot. Read all required pages, preserving
that snapshot, before claiming a complete inventory. A new original inventory
requires a new first-page selection.

### Submit the existing native programme phases

For a declared complete native job, the Python argument file is small:

~~~json
{"id":"REPLACE_WITH_ORIGINAL_JOB_UUID","source":"original-create-job"}
~~~

The declared source file carries the whole actual native job input. The same
original job ID appears in both selections. For a small job, use **input**
instead of **source**:

~~~json
{
  "id":"REPLACE_WITH_ORIGINAL_JOB_UUID",
  "input":{
    "id":"REPLACE_WITH_ORIGINAL_JOB_UUID",
    "kind":"ARCHIVE",
    "bundleId":"REPLACE_WITH_ORIGINAL_COMPLETE_EXPORT_JOB_UUID",
    "manifestSha256":"REPLACE_WITH_ACTUAL_MANIFEST_SHA256"
  }
}
~~~

The original native job kinds are CREATE, SUBMIT, APPLY, REPLAY, EXPORT, IMPORT,
ARCHIVE, RECEIVE_REVIEW and RECEIVE. Their unchanged validators determine the
complete inputs:

- CREATE retains the original programme and source case/project selection.
- SUBMIT retains a complete original quotation command in a native programme
  step. APPLY uses its displayed review SHA; REPLAY uses a distinct step with
  the original request.
- EXPORT freezes the selected original case revision, dossier/customer delivery,
  programme steps and complete native operation files.
- ARCHIVE frames that exact bundle, original manifest and all full member bytes.
- IMPORT inspects the destination's completed original upload into its own full
  retained package.
- RECEIVE_REVIEW binds that package to the actual destination workspace, case
  revision and customer/dossier selection.
- RECEIVE applies that explicitly reviewed SHA through the original writers.

Follow **submit** with fresh **job** observations until the original job reports
COMPLETE. READY/RUNNING means it remains active. RETRY_REQUIRED needs review of
its retained error and an explicit **resume** of the same job. A Python call
whose reply is complete can still contain READY, RUNNING or RETRY_REQUIRED.

## Fresh reads, recovery and replay

Every invoke, including a read, retains its first complete response.

| Intent | Correct operation |
| --- | --- |
| Reopen the same completed observation | saved with its original Python call ID. |
| Ask the host for its current state | Same read command with a new Python call ID. |
| Recover an incomplete Python/native bridge attempt | recover with the original Python call ID, or --resume on the exact original invocation. |
| Resume a native job reporting RETRY_REQUIRED | Native resume command with that original job ID; then fresh job observations. |
| Make a distinct local attempt of the exact retained underlying request | replay with source-call-id and a different call-id. |
| Create a new business request or programme step | Explicitly select new native IDs and input in the original engine. |

Examples:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory /private/python-remote-journal \
  quotes-remote-saved --call-id source-state-001

python -m stellar_forge_buyer.research_cli \
  --directory /private/python-remote-journal \
  --checkout /actual/installed/source \
  quotes-remote-recover --call-id original-transfer-call

python -m stellar_forge_buyer.research_cli \
  --directory /private/python-remote-journal \
  --checkout /actual/installed/source \
  quotes-remote-replay --source-call-id original-transfer-call \
  --call-id transfer-reopen-attempt-002

python -m stellar_forge_buyer.research_cli \
  --directory /private/python-remote-journal \
  quotes-remote-calls --offset 0 --limit 100
~~~

**saved**, **calls** and retained **configuration** do not require checkout.
**recover** is also lazy: an existing exact native completion can finish locally;
only an incomplete original operation needs the installed runtime and relevant
host. Keep the original journal and native operator directory together with their
full files when transferring operator custody. Copying a printed summary alone
does not preserve the journal.

The call listing's completed flag is a local receipt observation. **saved**
verifies the full response and any full exported file. Use it for custody
verification.

## Stream a complete source archive to the destination

Obtain the whole bytes/SHA and manifest SHA from the actual completed source
ARCHIVE job. Supply the same identities to the original transfer command:

~~~json
{
  "operationId":"REPLACE_WITH_STABLE_TRANSFER_UUID",
  "archiveId":"REPLACE_WITH_ORIGINAL_ARCHIVE_JOB_UUID",
  "bytes":123,
  "sha256":"REPLACE_WITH_COMPLETE_ARCHIVE_SHA256",
  "manifestSha256":"REPLACE_WITH_COMPLETE_MANIFEST_SHA256",
  "destination":"receiving",
  "destinationWorkspaceId":"research_REPLACE_WITH_ACTUAL_DESTINATION_64_HEX",
  "uploadId":"REPLACE_WITH_STABLE_DESTINATION_UPLOAD_UUID"
}
~~~

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory /private/python-remote-journal \
  --checkout /actual/installed/source \
  quotes-remote-transfer --workspace source \
  --input /private/original-transfer.json --call-id original-transfer-call
~~~

Both original clients are admitted for the transfer. Source ranges and complete
archive identities are checked by the maintained transport; the native uploader
preserves its exact pending chunk and original file identity. Transfer retries
keep the same original operation/upload IDs. A completed retained transfer
reopens before host access. This wrapper does not introduce a second archive
or receiving format.

For a local complete archive, **upload-source** uses a declared
programme-archive source with the original whole SHA/length. For complete local
custody, **export** copies an archive or member to a new absolute path:

~~~json
{
  "kind":"ARCHIVE",
  "id":"REPLACE_WITH_ORIGINAL_ARCHIVE_JOB_UUID",
  "bytes":123,
  "sha256":"REPLACE_WITH_COMPLETE_ARCHIVE_SHA256"
}
~~~

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory /private/python-remote-journal \
  --checkout /actual/installed/source \
  quotes-remote-export --workspace source \
  --input /private/archive-selection.json --call-id original-archive-export \
  --file /private/delivery/complete-programme.sf88q.gz
~~~

A completed exact file reopens before donor access. Do not select the Python
journal, native operator root, configuration, connection or source files as
export destinations.

## Complete two-host receiving example

[examples/research_remote_programme_receiving.py](examples/research_remote_programme_receiving.py)
operates four explicit phases on the same original family. It begins with a real
completed source ARCHIVE job; use the original programme commands above to
produce that archive from actual source selections first.

The example does not generate business UUIDs or approve a review. Supply all
stable native IDs, both actual expected workspace IDs, the original full
receiving input and complete archive pins.

Create this plan with actual values:

~~~json
{
  "schema":"stellar-forge.research-remote-receiving-example.v1",
  "id":"REPLACE_WITH_STABLE_EXAMPLE_UUID_V4",
  "source":{
    "alias":"source",
    "workspaceId":"research_REPLACE_WITH_ACTUAL_SOURCE_64_HEX"
  },
  "destination":{
    "alias":"receiving",
    "workspaceId":"research_REPLACE_WITH_ACTUAL_DESTINATION_64_HEX"
  },
  "archive":{
    "id":"REPLACE_WITH_ORIGINAL_ARCHIVE_JOB_UUID_V4",
    "bytes":123,
    "sha256":"REPLACE_WITH_COMPLETE_ARCHIVE_SHA256",
    "manifestSha256":"REPLACE_WITH_COMPLETE_MANIFEST_SHA256"
  },
  "transferId":"REPLACE_WITH_STABLE_TRANSFER_UUID_V4",
  "uploadId":"REPLACE_WITH_STABLE_UPLOAD_UUID_V4",
  "importId":"REPLACE_WITH_STABLE_IMPORT_JOB_UUID_V4",
  "reviewId":"REPLACE_WITH_STABLE_REVIEW_JOB_UUID_V4",
  "receiveId":"REPLACE_WITH_STABLE_RECEIVE_JOB_UUID_V4",
  "receivingInput":{
    "path":"/private/reviewed-receiving-input.json",
    "sha256":"REPLACE_WITH_COMPLETE_RECEIVING_INPUT_SHA256"
  },
  "exportFile":"/private/delivery/complete-programme.sf88q.gz"
}
~~~

**reviewed-receiving-input.json** is the complete original
researchQuoteProgrammeReceivingInput accepted by the native programme engine,
not an abbreviated substitute. It must carry requestId equal to reviewId and
expectedWorkspaceId equal to the selected destination. Fill its real destination
case/create-or-merge choice, expected current revision, dossier/customer and
source actor/permissions according to the original [programme
guide](../research-dossiers/customer-quotes/PROGRAMME.md). The example retains
the entire raw file, including every actual source/destination selection, before
any remote operation.

The configuration's two aliases must match the plan. Use distinct native
operation/job IDs. Keep the example directory, exported archive and original
input paths separate; the SDK also enforces native output boundaries.

### 1. Retain and transfer the complete source

~~~sh
python examples/research_remote_programme_receiving.py source \
  --directory /private/two-host-course \
  --plan /private/two-host-plan.json \
  --configuration /private/programme-operator.json \
  --checkout /actual/installed/source
~~~

This retains the exact plan and complete destination input first. It verifies the
source archive metadata, exports the entire original archive locally, streams
the same source archive into the original destination upload, and confirms the
destination upload's complete SHA/length. Stable native and Python mutation IDs
are derived from the retained plan. The original client is closed before
phase-source.json is published.

### 2. Import and prepare the exact destination review

~~~sh
python examples/research_remote_programme_receiving.py prepare \
  --directory /private/two-host-course \
  --checkout /actual/installed/source
~~~

This verifies the preceding saved phase, submits IMPORT under the original
importId, waits for its actual completion, then submits RECEIVE_REVIEW with the
complete retained destination input. It retains the full native receiving view
and records its exact review SHA. The full view uses REMOTE_REPLY_LIMIT, allowing
the original complete source roster; the control plan and phase receipts retain
their 16 MiB bound.

Open the saved review call's complete reply.json. The phase record identifies
reviewCallId. You can read it with the installed SDK/CLI using the example's
journal directory:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory /private/two-host-course/journal \
  quotes-remote-saved --call-id ACTUAL_REVIEW_CALL_ID
~~~

Use explicit bounded **--json --json-limit BYTES** only if printing the entire
review is useful. The complete reply file already exists and is verified.

### 3. Apply the selected review

~~~sh
python examples/research_remote_programme_receiving.py receive \
  --directory /private/two-host-course \
  --checkout /actual/installed/source \
  --review-sha256 ACTUAL_DISPLAYED_REVIEW_SHA256
~~~

The example rejects a different SHA before dispatch. It uses the original
receivingId and original receiveId, follows actual native completion and retains
the complete destination receiving result. The original native CASE_TRANSFER
and customer/dossier writers enforce their expected revisions and source
bindings. A stopped retry does not create a second destination case or replace
the original source selection.

### 4. Verify the complete saved course offline

~~~sh
python examples/research_remote_programme_receiving.py reopen \
  --directory /private/two-host-course
~~~

No checkout, configuration or donor is needed. This verifies every saved call
referenced by the completed phase receipts, complete native reply files and the
whole locally exported source archive. It reports VERIFIED_SAVED, explicitly a
saved-state verification rather than a fresh observation of either host.

The destination's full imported/receiving package remains under the destination
application's original storage. This offline Python reopen does not claim to
have copied that entire destination directory locally. The complete transferred
archive and native receiving result are retained; use the original destination
backup/receiving workflow for that workspace's full subsequent custody.

### Stopped course and native retry

The example uses a new UUID **only for each new read observation**. Mutation,
transfer, upload, receiving and native job IDs remain unchanged. A completed
saved SUBMIT is an immutable older response; if it is not COMPLETE, the example
asks for a fresh job snapshot before classifying its status. Consequently a
long-running job can be observed after process restart without walking old
polls for the entire timeout.

--wait-seconds bounds this invocation's polling. Expiry does not cancel or
replace the original native job. Re-run the same phase to observe its current
state. --recover explicitly continues an incomplete Python call under its same
original IDs. It is not an automatic native RETRY_REQUIRED policy.

If the native job reports RETRY_REQUIRED, inspect its exact saved error and
select its original job for an explicit native resume:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory /private/two-host-course/journal \
  --checkout /actual/installed/source \
  quotes-remote-resume --workspace receiving \
  --input /private/same-original-job-id.json \
  --call-id explicit-native-resume-001
~~~

The input is {"id":"ACTUAL_ORIGINAL_JOB_UUID"}. Then re-run the same example
phase; its fresh observation sees the resumed original job. A completed phase
reopens locally first. The example never resumes a failed native job or selects
an approval SHA automatically.

## File-backed Python SDK

~~~python
from stellar_forge_buyer import ResearchRemoteProgrammes

with ResearchRemoteProgrammes(
    directory="/private/python-remote-journal",
    checkout="/actual/installed/source",
    configuration_file="/private/programme-operator.json",
) as remote:
    result = remote.invoke(
        "source", "archive",
        {"id": actual_archive_job_id},
        call_id="archive-observation-001",
    )
    metadata = result.json(limit=1024 * 1024)
    receipt = result.record

# No host/runtime selection is needed for complete saved reopening.
with ResearchRemoteProgrammes(directory="/private/python-remote-journal") as saved:
    result = saved.saved("archive-observation-001")
    result.verify()
    with result.file.open() as stream:
        first_bytes = stream.read(65536)
~~~

The existing FileDelivery verifies the full selected file while preserving its
original descriptor. **result.json(limit=...)** is a deliberate complete
materialization. **result.exported_file** is the verified original complete
archive/member for export calls and None otherwise. Do not infer a full file
from first_bytes; consume the entire stream when copying or processing it.

ResearchRemoteError preserves **call_id**, **outcome_unknown**, the original
attempt **record**, native error and any known file descriptor. Keep these with
the original operation. A timeout or lost stdout after dispatch is not proof
that no remote action occurred. Recover the same request before deciding whether
new work is needed.

## Ownership, limits and delivery

The facade owns its lazy Runtime invocation and cancellation registrations.
The unchanged Node operator owns its acquired HTTP clients and transfer/file
handles. Both close through their original lifetime. SIGINT/SIGTERM requests
cancellation and drains that invocation; it does not take ownership of the
Research applications' listeners or substitute a new native operation.

The terminal closes its context before returning output to the existing parent
CLI. The example retains phase results before printing them. If output fails,
the full response and completed phase remain available for exact saved reopen.

Current limits are exported by the original SDK:

| Item | Bound |
| --- | ---: |
| Original private operator configuration | 1 MiB |
| Python raw routing arguments | 16 MiB |
| Complete native JSON reply | 603,027,776 bytes |
| Complete archive transport upper bound | 24,128,742,234,216 bytes |
| Native archive upload/range chunk | 4 MiB |

The archive bound is a protocol ceiling, not a claim of available disk, memory,
host quota or successful transfer. The original 40,000-member roster and per-file
native limits still apply. Archive transport streams; deliberately calling
json on a large reply materializes that full JSON in the current Python process.

Complete implementation files in this installed family:

- stellar_forge_buyer/research_remote_programmes.py: original retained call facade.
- research-programme-remote-bridge.mjs: full response-file publication over the
  original ResearchProgrammeOperator.
- stellar_forge_buyer/research_remote_programme_types.py: exact record, native
  descriptor, command argument and file-backed protocol annotations.
- stellar_forge_buyer/research_remote_programmes_cli.py: all 26 installed commands.
- examples/research_remote_programme_receiving.py: the complete four-phase course.
- Existing runtime, package exports, parent research_cli and distribution
  declarations retain their original ownership and add this one runtime target.

Source review covers complete API/receiving/lifetime composition. An actual
equipped runtime execution should be reported with its original operation,
selected installation, complete input/output files and actual result; source
review alone is not a native execution claim.
