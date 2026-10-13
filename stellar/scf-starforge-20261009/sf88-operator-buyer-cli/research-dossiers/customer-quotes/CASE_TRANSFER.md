# Transfer a complete editable Research quotation case

Use this workflow to move an original merchant case into another commissioned
Research installation, including its editable workspace, diagnostic sources,
metadata, runtime support attachment, commissioning events, service history,
quotation editions, customer responses and retained commercial source documents.

The full quotation-programme workflow composes this same receiver with the
original Research customer handover. See [PROGRAMME.md](PROGRAMME.md) for a
programme containing both the case and its dossier/project delivery. The commands
here are also useful when transferring a case independently.

## 1. Select the original saved case

Open the actual source Research connection and obtain the native cases workspace
identity and selected case revision:

~~~sh
research-client quotes-configuration \
  --connection-file /private/source/research-connection.json
research-client quotes-cases \
  --connection-file /private/source/research-connection.json
research-client quotes-case --case-id ORIGINAL_CASE_UUID \
  --connection-file /private/source/research-connection.json
~~~

Save this download selection as a private JSON file. Replace all capitalized
values with the actual values returned by that original workspace.

~~~json
{
  "kind": "CASE_RECORD",
  "revision": "ORIGINAL_SAVED_CASE_REVISION",
  "scope": {
    "workspaceId": "ORIGINAL_CASES_WORKSPACE_ID",
    "caseId": "ORIGINAL_CASE_UUID"
  }
}
~~~

Export the full selected case:

~~~sh
research-client quotes-download-case \
  --connection-file /private/source/research-connection.json \
  --case-id ORIGINAL_CASE_UUID \
  --input /private/source/case-record-selection.json \
  --run-directory /private/source/case-record-export \
  --out /private/source/original-case.json
~~~

The completed export retains the exact source request, selected revision, file
descriptor, complete file and result. Running it again with that same directory
reopens those originals. The file remains byte-identical for the selected
revision after later case edits; mutable currentRevision is excluded from the
exported packet. The source packet keeps the original Research workspace identity,
cases workspace identity and original case UUID.

CASE_RECORD needs no quoteId. It also works before the first quotation exists.

## 2. Select the actual receiving case state

Use the target installation's existing commissioned Research connection:

~~~sh
research-client quotes-configuration \
  --connection-file /private/target/research-connection.json
research-client quotes-cases \
  --connection-file /private/target/research-connection.json
~~~

A new target case uses expectedRevision:null. If the original case UUID already
exists in that installation, open it and select its actual current revision.
The original UUID is preserved because retained quotation and commercial
documents identify that case.

Create a complete transfer input with a new requestId and the full parsed
original-case.json object in source. This is an ordinary JSON file; source is an
object containing the complete native record, not a path, URL or summary.

~~~js
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const source=JSON.parse(await readFile('/private/source/original-case.json','utf8'));
const input={
  requestId:randomUUID(),
  caseId:source.source.caseId,
  expectedRevision:null,
  source
};
await writeFile('/private/target/case-transfer-selection.json',
  JSON.stringify(input)+'\n',{flag:'wx',mode:0o600});
~~~

For an existing local case, replace null with that target's selected revision.
This explicitly selects the receiving state; it does not use the source revision
as a target revision.

## 3. Prepare and review the complete receive

~~~sh
research-client quotes-prepare-case-transfer \
  --connection-file /private/target/research-connection.json \
  --input /private/target/case-transfer-selection.json \
  --run-directory /private/target/case-transfer-review
~~~

The result is the existing customer-quote operation envelope with kind
CASE_TRANSFER and status REVIEWED. Its review identifies the original source,
the selected local target, the incoming metadata, the native received workspace
digest, runtime digest, and whether commissioning or service history was merged.

The incoming case's metadata, name, diagnostic inputs and runtime attachment are
the selected values for the received revision. The original CaseStore writer
merges commissioning and service histories with the selected local case. Conflicts
retain the original native error and require a newly reviewed source or target.
Earlier local case revisions remain available in the original history.

The retained operation contains these complete files:

| File | Content |
| --- | --- |
| source-record.json | Stable original case metadata, source identity and full packet digest |
| source.workspace.json | Exact original workspace text, including original source bytes and commercial history |
| source.support.json | Exact original runtime attachment, when present |
| received.workspace.json | Exact candidate produced by the original native history mergers |
| native-request.json | Selected case, target revision, metadata and candidate file identities |
| request.json | Compact original request identity and source digest |
| review.json | Complete receiving review |
| result.json | Native receiving result after apply |

Export the operation through quotes-export-operation to obtain this entire
roster with its retained request and review. The native workspace and runtime
files are individually retained and verified; large content is not copied into
every status response.

## 4. Apply the exact retained review

Copy the returned operation id and review.reviewSha256 into a private apply
selection:

~~~json
{
  "id": "ORIGINAL_TRANSFER_REQUEST_UUID",
  "reviewSha256": "RETAINED_REVIEW_SHA256"
}
~~~

Apply it through the same target connection:

~~~sh
research-client quotes-apply-case-transfer \
  --connection-file /private/target/research-connection.json \
  --input /private/target/case-transfer-apply.json \
  --run-directory /private/target/case-transfer-apply
~~~

The COMPLETE result includes the actual target case id, revision, currentRevision,
name, metadata, workspace and support digests, plus the original source identity.
Receiving details identify the target Research/cases workspaces, expected
revision, unchanged result and native-history merge decisions.

The target's original case writer assigns the receiving revision and keeps its
own case-version chain. The original source revision and timestamps remain in
the retained source record. All commissioning/service/commercial events embedded
in that selected workspace travel with their unchanged material bytes.

## Continue after interruption

Repeat a command with its original run directory. A complete terminal result
reopens from retained local files before opening the connection. If the source
input file still exists, its complete original bytes must match. An incomplete
attempt retains its original UUID, source and reviewed selection.

The server similarly reopens its complete operation result before another native
save. If the native case save completed before the outer result was retained, it
searches the original native case history for the exact reviewed child of the
selected target, or that unchanged selected target. This can recover the actual
saved result after subsequent peer edits. An older unrelated matching edition
does not count as that receiving operation.

If the target changed before the reviewed save took place, prepare a new request
against the current target revision. The original incomplete attempt stays
inspectable. Explicit quotes-replay creates a separate terminal attempt with the
same original native request and keeps both terminal results.

## Node API

~~~js
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {inspectResearchCaseTransfer} from './case-transfer.mjs';

const packet=await inspectResearchCaseTransfer(parsedCaseRecord);
const client=new ResearchWorkspaceClient({
  connectionFile:'/private/target/research-connection.json'
});
try {
  const quotes=client.customerQuotes();
  const reviewed=await quotes.prepareCaseTransfer({
    requestId,caseId:packet.source.caseId,expectedRevision,source:packet
  });
  // Present reviewed.review in the operator's existing review flow.
  const completed=await quotes.applyCaseTransfer({
    id:reviewed.id,reviewSha256:reviewed.review.reviewSha256
  });
  console.log(completed.result.case);
} finally {
  await client.close();
}
~~~

The asynchronous inspector captures the complete caller-supplied packet before
its first await and validates it with the original native workspace and runtime
parsers. It checks metadata and all redundant summaries against those original
sources, along with the actual workspace, runtime and full-packet digests.

caseTransferSelection returns the compact operation request:
requestId, caseId, expectedRevision, original source identity and sourceSha256.
That digest is packet.sha256, the existing canonical Research fingerprint of
{schema,source,case}. Typed Node contracts are exported with the existing
customer-quotes client and case-transfer module.

## File and transport sizes

Original quotation inputs keep their 96 MiB plus65,536-byte budget. Ordinary
streamed quote files keep their256 MiB budget and JSON responses keep their64 MiB
budget. CASE_RECORD downloads and prepare-case-transfer use
QUOTE_CASE_TRANSFER_LIMIT, derived from the original SF74 MAX_HANDOFF_BYTES
plus65,536 bytes for the enclosing receiving selection.

This accommodates the original native workspace and192 MiB runtime attachment.
The dedicated limit follows the CASE_RECORD request through metadata, streaming,
local retention, copying, terminal resume, programme export and receiving. Each
original workspace/support file remains subject to its native parser limit.
The generic Research listener, merchant checkout and Buyer state keep their
existing ownership and operation lifetimes.
