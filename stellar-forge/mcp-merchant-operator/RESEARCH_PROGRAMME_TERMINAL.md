# Research programme terminal and SDK

The installed **research-quotes-remote** command operates the existing Research programme hosts from a terminal. It carries the complete original programme, asynchronous jobs, customer case and dossier handover between already configured source and receiving applications.

The terminal uses the same ResearchProgrammeOperations class as the Merchant’s twenty programme tools. The browser, original local Node CLI, Python programme and this terminal therefore meet at the same native job, CaseStore and dossier writers. Transfer uses the maintained programme archive/upload engines and their four MiB resumable chunks.

## Install and select the original hosts

The Research distribution contribution installs:

- Command **research-quotes-remote**.
- Package export **./merchant/mcp/research-programme-operator** with its declaration.
- This complete guide and the existing **RESEARCH_PROGRAMMES.md** guide.
- The static closure of the original programme owner, typed HTTP client and streaming transfer implementation.

From a source checkout:

~~~sh
node source/stellar-forge/mcp-merchant-operator/research-programme-cli.mjs help
~~~

In the installed product use its maintained dispatcher:

~~~sh
starforge research-quotes-remote help
~~~

Use the actual Research connection file produced by the existing application/Applications launch. Its private URL/token stays in that original file. Copy each authenticated Research workspace ID from the original application’s status or programme info. Source and receiving aliases may point to different instances; every configured expected workspace ID is enforced by the existing HTTP client.

Save a private configuration:

~~~json
{
  "schema": "stellar-forge.research-programme-operator.v1",
  "directory": "/private/research-programme-operations",
  "workspaces": [
    {
      "id": "source",
      "connectionFile": "/private/source.connection.json",
      "workspaceId": "research_REPLACE_WITH_ACTUAL_64_HEX"
    },
    {
      "id": "receiving",
      "connectionFile": "/private/receiving.connection.json",
      "workspaceId": "research_REPLACE_WITH_ACTUAL_64_HEX"
    }
  ],
  "sources": [
    {
      "id": "create-programme",
      "kind": "programme-input",
      "file": "/private/create-programme.json",
      "sha256": "REPLACE_WITH_ACTUAL_COMPLETE_FILE_SHA256"
    },
    {
      "id": "customer-archive",
      "kind": "programme-archive",
      "file": "/private/customer-programme.sf88q.gz",
      "sha256": "REPLACE_WITH_ACTUAL_COMPLETE_ARCHIVE_SHA256"
    }
  ]
}
~~~

These visible placeholders are deliberately invalid. Supply actual IDs, source paths and full digests. Keep this file mode0600 and all paths absolute and canonical. The retained operation root must be separate from configuration, connection and declared input files. Each workspace alias has its own child under the selected root. Preserve the same alias/root when reopening an existing local operation.

Run **configuration** to read and validate the complete setup without contacting a host. Run **info** against each alias to read its original authenticated programme configuration and native capabilities. Only connection file paths appear in this operator configuration; connection contents and bearer credentials are never copied into its command output.

## One complete command input

Every command accepts one full original JSON arguments file through **--arguments**. Add **--arguments-sha256** when pinning that exact file selection. Parameters are captured before asynchronous work.

~~~sh
starforge research-quotes-remote info \
  --configuration /private/programme-operator.json --workspace source
~~~

For native jobs, declare the complete original job input as a **programme-input** source. The small terminal arguments select that source:

~~~json
{"id":"REPLACE_WITH_ORIGINAL_JOB_UUID","source":"create-programme"}
~~~

The declared file contains the original job schema. For example, CREATE retains a native programme with an explicit source dossier/project/customer case:

~~~json
{
  "id": "REPLACE_WITH_ORIGINAL_JOB_UUID",
  "kind": "CREATE",
  "value": {
    "schema": "sf88-research-quotation-programme/v1",
    "id": "REPLACE_WITH_ORIGINAL_PROGRAMME_UUID",
    "name": "Reviewed customer evidence programme",
    "dossierId": "REPLACE_WITH_ACTUAL_DOSSIER_ID",
    "revision": 1,
    "projectId": "REPLACE_WITH_ACTUAL_PROJECT_UUID",
    "caseId": "REPLACE_WITH_ACTUAL_CASE_UUID",
    "caseMode": "EXISTING"
  }
}
~~~

Use actual native identities and the selected dossier revision. The host validates the full source, case and project. CREATE also supports the native CREATE case mode when that is the reviewed original workflow.

~~~sh
starforge research-quotes-remote submit \
  --configuration /private/programme-operator.json --workspace source \
  --arguments /private/submit-create.json --wait-ms 30000 \
  --out /private/create-response.json
~~~

The original Merchant operation owner retains the complete raw source file, normalized native input and selection before dispatch. Retrying the same job/source selection reopens that retained source if its donor moved. Changing the original source alias, path, full SHA or request under the same operation ID is rejected.

## Follow jobs, review and apply

Native jobs are asynchronous. The response includes the actual ID, request hash, state, summary and any retained error. **job** reopens an original job. **resume** retries that same native operation after its failure has been understood. Both use:

~~~json
{"id":"REPLACE_WITH_ORIGINAL_JOB_UUID"}
~~~

Optional **--wait-ms** follows submit/job/resume for up to900000 milliseconds. It stops at the actual current state or the requested duration. A wait timeout does not allocate another job. RETRY_REQUIRED is returned with its original error for an explicit resume decision.

**state** lists the programme’s retained native steps with a bound page snapshot. **step** returns one original step and its full-input file descriptor. Retained quotation reviews carry the exact original review SHA. Use an explicit APPLY job with that source step and SHA:

~~~json
{
  "id":"REPLACE_WITH_NEW_APPLY_JOB_UUID",
  "kind":"APPLY",
  "programmeId":"REPLACE_WITH_ORIGINAL_PROGRAMME_UUID",
  "sourceStepId":"REPLACE_WITH_REVIEWED_STEP_UUID",
  "stepId":"REPLACE_WITH_NEW_APPLY_STEP_UUID",
  "reviewSha256":"REPLACE_WITH_ACTUAL_REVIEW_SHA256"
}
~~~

SUBMIT carries the existing quote command and full native input. It supports original case creation, complete CASE_TRANSFER, brief review/application, pricing, customer response, paid publication and realized report commands. REPLAY selects an existing original source step and a distinct new step; its native request remains the original exact request. The host continues to own that distinction.

The browser’s existing quotation forms remain available against this same programme. The terminal’s source files give a retained complete input when automation or a large CASE_RECORD is more practical.

## Export the whole programme and archive

Submit the existing native EXPORT job with the source programme, exact case revision, selected customer delivery and dossier revision. Its completed summary identifies the full original bundle and manifest SHA.

Read **bundle** for the selected whole handover. Read **files** to enumerate its original complete member roster; later pages use the returned snapshot. **file-info** selects exact native member metadata.

Submit an ARCHIVE job bound to that bundle ID and manifest SHA. **archive** returns its actual whole gzip length, SHA, manifest identity and selection.

A complete archive is streamed throughout. The original native member count and CASE_RECORD limits remain in force. The terminal does not convert a large archive into a JSON/base64 control response.

## Move that archive into the receiving host

Create a complete transfer arguments file:

~~~json
{
  "operationId":"REPLACE_WITH_STABLE_TRANSFER_UUID",
  "archiveId":"REPLACE_WITH_ORIGINAL_ARCHIVE_JOB_UUID",
  "bytes":123,
  "sha256":"REPLACE_WITH_ACTUAL_ARCHIVE_SHA256",
  "manifestSha256":"REPLACE_WITH_ACTUAL_MANIFEST_SHA256",
  "destination":"receiving",
  "destinationWorkspaceId":"research_REPLACE_WITH_ACTUAL_RECEIVING_64_HEX",
  "uploadId":"REPLACE_WITH_STABLE_RECEIVING_UPLOAD_UUID"
}
~~~

~~~sh
starforge research-quotes-remote transfer \
  --configuration /private/programme-operator.json --workspace source \
  --arguments /private/source-to-receiving.json \
  --out /private/complete-transfer-response.json
~~~

Both original HTTP clients are admitted before transfer work starts. The client validates every exact range, archive total, content hash and returned chunk hash. The destination uses its original upload inode, immutable pending chunk and complete-file verification. A retry uses the same transfer/upload IDs and full archive pins. The completed original local result reopens before either host is needed.

For a local original archive use **upload-source** with a declared **programme-archive** source, original byte count/SHA and stable upload/operation IDs. A completed destination upload reopens before a relocated donor file is opened.

**transfer-status** reads the retained local operation and its completed original result:

~~~json
{"operationId":"REPLACE_WITH_ORIGINAL_TRANSFER_UUID"}
~~~

## Receive the original case and customer dossier

Continue on the **receiving** alias.

1. Submit IMPORT with the completed original upload ID and manifest SHA.
2. Read its completed bundle identity. Submit RECEIVE_REVIEW with that bundle, exact manifest and full original receiving request. This request pins the destination Research and CaseStore identities, expected case revision and original source actor.
3. Read the returned native review. Submit RECEIVE using that exact review SHA and original receiving ID.
4. Use **receiving** to reopen the complete saved destination result, original case revision, source dossier/customer delivery and receiving package.

The complete CASE_RECORD stays with its original packet. Its native request identity is compact while the retained source includes full workspace/support records. Case histories, original commercial records and dossier/customer source histories continue through their maintained writers. A later destination edit does not turn an exact saved receiving retry into a new import.

No terminal step fabricates a review hash or converts an original failed/reviewed job into completion. All source, review and native receiving choices remain explicit inputs.

## Retain and copy complete files

**retain** saves one original job file, bundle member or archive under the configured immutable local file root. It requires kind, ID, full SHA and byte count, plus the exact native relative name for JOB/BUNDLE.

**export** uses that same original retained file and copies it to **--file**. Supply exactly the same file selection:

~~~json
{
  "kind":"BUNDLE",
  "id":"REPLACE_WITH_ORIGINAL_BUNDLE_UUID",
  "name":"REPLACE_WITH_EXACT_NATIVE_RELATIVE_NAME",
  "bytes":123,
  "sha256":"REPLACE_WITH_ACTUAL_COMPLETE_FILE_SHA256"
}
~~~

The destination is create-only. An existing complete file with the exact expected length/SHA reopens before host/donor access. Copies cannot be placed inside the original operator root or over declared configuration, connection or source paths. **--out** is a separate complete response file and follows the same source/output separation.

**retained**, **read** and **release** expose the same original local read inventory used by Merchant tools. Use **export** for complete local files; retained reader chunks are useful for another operator transport that already understands the original read contract.

## Recovery and shutdown

Preserve the configuration’s workspace aliases, expected IDs, declared source selections and local operation directory. Native jobs remain in the Research application; local original source/transfer/file records remain in the operator directory. Completed local files and transfer results reopen without a running host.

SIGINT/SIGTERM stops new terminal polling and drains the already admitted request or transfer. The terminal detaches its borrowed HTTP clients after original programme operations close. It does not stop the Research listener or cancel a separately running native job.

If an original local descriptor fails to close, the process retains that owner and reports a nonzero result; another signal retries the same close handles. Successful closes remain retired. Startup/output failures use that same acquired-owner cleanup boundary. Retain a complete output already published before an output or final-close error and reopen the same operation.

## Typed SDK

~~~js
import {ResearchProgrammeOperator} from
  './source/stellar-forge/mcp-merchant-operator/research-programme-operator.mjs';

const operator = await ResearchProgrammeOperator.fromFile(
  '/private/programme-operator.json'
);
try {
  const source = await operator.call('source', 'info', {});
  const receiving = await operator.call('receiving', 'info', {});
  const result = await operator.call('source', 'transfer', reviewedTransfer);
  const saved = await operator.call('source', 'transfer_status', {
    operationId: reviewedTransfer.operationId
  });
  // result and saved retain the actual same source/destination identities.
} finally {
  await operator.close();
}
~~~

Call names and arguments match the original twenty programme tools. exportFile adds complete local file copying over their existing retained file owner. The operator captures caller arguments before asynchronous work and preserves accepted cross-workspace continuations during close.

The complete installed source is in **stellar-forge/mcp-merchant-operator/research-programme-operator.mjs** and **research-programme-cli.mjs**. Original native programme, archive, upload, CaseStore and customer dossier modules remain their authoritative engines.
