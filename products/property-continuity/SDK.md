# Property continuity client and agent operations

The client attaches to the original managed Python HTTP application. It does not open SQLite or launch another server. Configure the exact private connection file and its original owner UUID/directory. The original app selection is **cf5e60ed049ee7584d389cc8d09b2a2e361c0fa37cf00fc41af496652f641b3a**.

## Open the actual service

Create or reopen the authorized original workspace and use Applications Review → Save → Connect → Start → Open. See OPERATING.md for exact settings. Python 3.11+ is required. The process, selected interpreter/source and private capability are checked at startup. Stop uses the same managed owner.

The package export is **./property-continuity/client**, with the complete TypeScript declaration **client.d.mts**. A source checkout can import the exact selected local module:

~~~js
import {createPropertyContinuityClient} from './products/property-continuity/client.mjs';
import {readFile,open} from 'node:fs/promises';

// This operator-authored JSON contains actual original paths and identities:
// {connectionFile,workspaceId,workspaceDirectory,selectedBranch?,timeoutMs?}
const options=JSON.parse(await readFile(process.argv[2],'utf8'));
const client=createPropertyContinuityClient(options);
try {
  const current=await client.state();
  console.log({branch:client.selectedBranch,revision:current.revision,sha256:current.sha256});
  for await(const page of client.pages('history')) {
    // Retain complete original envelopes and results; no row sample replaces history.
    process.stdout.write(JSON.stringify(page)+'\n');
  }
} finally { await client.close(); }
~~~

The connection URL stays in the private connection file. Public status contains original identity and source metadata. Each request authenticates exact loopback and uses the original token without following redirects. The selected workspace branch is the portable UUID **and** canonical physical directory. Received workspaces intentionally preserve the portable UUID.

Call branches() to inspect known physical branches, then openBranch({id,directory}) explicitly. Each client supports one in-flight operation; await it before another call. A browser selecting a different branch causes branch-bound requests to fail rather than act on that other directory.

## Complete command and source operations

Keep the operator's complete command JSON unchanged before dispatch. Domain commands retain their original UUID, kind, actor, observed time and body:

~~~js
const input=JSON.parse(await readFile(process.argv[3],'utf8'));
// input = {command:{requestId,kind,actor:{id,name},at,body},expectedRevision}
try {
  const outcome=await client.command(input.command,input.expectedRevision);
  console.log(outcome);
} catch (error) {
  console.error({code:error.code,status:error.status,uncertain:error.uncertain,
    operation:error.operation,result:error.result});
  // Reconcile using the saved request ID. Do not silently issue a new command.
  const retained=await client.request(input.command.requestId);
  console.log({retained});
}
~~~

An original response timeout may follow a committed command. Read request(requestId), preserve its first envelope/result, and continue through the original workspace rules. An empty read alone does not authorize a concurrent replay while the first request is still running. A definite rejected current revision needs the operator's reviewed next edit.

Source imports use the original **source.import** domain command after uploading complete source bytes. The original domain guide defines every family, schema, mapping, scope, decision and operational record. Monetary and other exact quantities remain the original decimal strings or preserved numberTokens. Do not recreate source bytes from parsed JavaScript numbers.

uploadFile('blob', absoluteOriginalFile, {bytes,sha256}) verifies the entire original file before transmitting it to the existing /api/blob endpoint. The server checks its full hash and retains it in the same native workspace. uploadBytes accepts a bounded exact Buffer. Neither upload changes an upstream platform.

## Method reference

| Method | Original operation |
| --- | --- |
| state() | Full current state/view/revision and exact selected directory |
| branches() | Known physical original/received branches and current selection |
| openBranch({id,directory}) | Explicit selection of an already known branch |
| history({offset,limit}) | Complete native command/result history page |
| request(requestId) | Original saved first command envelope and result |
| sourceRows(sourceId,{offset,limit}) | Full original rows plus numberTokens |
| reportRows(id,{offset,limit,status}) | Native reconciliation report page and report hash |
| findings(id,{offset,limit,severity}) | Every BLOCKING/REVIEW finding and numberTokens |
| pages(kind,id?,options) | Original page iterator; changing totals/report identity stop the traversal |
| command(command,expectedRevision) | Exact native domain envelope and CAS |
| uploadFile(kind,path,{bytes,sha256}) | Complete original host file to blob/archive |
| uploadBytes(kind,Buffer,{bytes,sha256}) | Complete bounded in-memory original bytes |
| exportWorkspace(publicationId,revision) | Frozen revision and complete archive descriptor |
| download(selection,onChunk) | All original bytes streamed with actual byte/hash result |
| receive({operationId,sha256,bytes,name}) | Original full archive into independent named receiver |
| close() | Drain this borrowed client only; original application remains open |

Pages use native limits 1–100 and return nextOffset. Preserve returned source edition, report hash, counts, UNVERIFIED coverage and precise tokens. The client does not call a partial page a complete report.

## Frozen export and independent receiving

Choose an original publication UUID and exact saved revision before export. The same publication/ revision is reused after interruptions. Keep the whole returned native descriptor, including manifest/source identities and ZIP bytes/hash.

Download the archive with selection **{kind:'archive',id:publicationId,expectedSha256:descriptor.sha256,expectedBytes:descriptor.bytes}**. Supply an onChunk callback that writes every returned chunk. Treat the file as provisional until download resolves and its full hash/length checks pass. Publish it atomically only after that result. The callback is never given a substitute inventory or truncated body.

Full reports use **{kind:'report',id:reconciliationId,format:'json'|'html'|'csv'}**; downloads return the actual complete byte count and SHA. Original blobs use **{kind:'blob',id:sourceSha256,expectedBytes}**.

On the intended receiving service:

1. Upload the exact exported ZIP with uploadFile('archive', path, descriptor).
2. Call receive with the original operation UUID, descriptor hash/length and named destination.
3. Retain the complete original receiving result.
4. Inspect branches(), explicitly open the returned physical directory, and verify original identity/history.
5. Continue a legitimate supplied edit in that branch, then export its later revision.
6. Repeating the original receive into that same destination preserves later receiver edits.

Receiving does not automatically change the currently selected branch. Source and destination may share the portable ID; the physical directory remains authoritative for each operation. The original full source and business course in app/RECEIVING_PROGRAMME.md remains available.

## Host-selected merchant configuration

The contribution declares the provider **property-continuity-workspaces** with host configuration input **propertyContinuityConnection** and owner family **propertyContinuity**. Set that input to an existing private JSON file through the maintained Merchant configuration route. Its complete schema is:

~~~json
{
  "schema": "stellar-forge.property-continuity-workspaces.v1",
  "storageDirectory": "/absolute/private/retained-file-storage",
  "workspaces": {
    "selected": {
      "label": "Selected original property case",
      "connectionFile": "/absolute/private/workspace/property-continuity-connection.json",
      "workspaceId": "REPLACE_WITH_ORIGINAL_UUID",
      "workspaceDirectory": "/absolute/private/workspace",
      "timeoutMs": 300000
    }
  },
  "files": {
    "original_source": {
      "path": "/absolute/original/source-file.csv",
      "bytes": 0,
      "sha256": "REPLACE_WITH_ACTUAL_FULL_SHA256",
      "label": "Complete authorized source file"
    }
  }
}
~~~

Replace every placeholder and declared size with the actual retained original identity. The configuration file and storage directory are private and owned. The configuration permits 1–32 workspaces and up to 1,000 explicitly declared original files. Tools do not accept arbitrary host file paths.

The complete **merchant_property_continuity_** tool family mirrors the methods above: workspaces, branches, open, state, history, request, source_rows, report_rows, findings, command, upload, export, receive, file_read and file_release. Each branch-specific tool requires workspace alias, portable workspaceId and workspaceDirectory. Command parameters include the complete original envelope and expectedRevision.

file_read uses the existing Merchant **RetainedFileReads** implementation. It streams the original entire HTTP file to a private temporary descriptor, verifies its complete identity and returns bounded base64 chunks. Retain readId, returned file.sha256 and every nextOffset. Supply expectedSha256 after the first chunk and when resuming a later offset after a reader expires. The private reader has four concurrent file slots, closes completed/expired reads and drains its own descriptors at shutdown. It does not rerun a native exporter. file_release closes only this borrowed read.

Host shutdown drains pending calls and readers; it never stops the managed property application. Application Stop remains the original Applications owner's action.

## Source and operating evidence

The entire 22-file original application travels unchanged in app/. ADOPTION.json records every original path, length and hash against Commons merge a64e69c1. The additive managed lifecycle, client and agent source are separately reviewable here. The complete Installation profile and source chapter remain in the maintained SCF discovery paths.

Source syntax and interface review are distinct from operating evidence. The original Bluewave programme and actual image inspection remain with the one equipped receiving request. Continue that exact operation and preserve its original native results; a source merge is not a claim that a customer load, browser course or managed runtime has executed.
