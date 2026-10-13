# MPC managed SDK and customer-agent tools

The SDK borrows the existing MPC Recovery Operations Application. The same original model validates every command, complete snapshot, source file, proposal import and report. The SDK does not start a server and does not claim that any backup or restoration occurred outside the retained evidence.

## Open the selected store

Use the Application's private connection file and exact physical store ID/directory produced by creation. The SDK rechecks the current connection, original source digest and actual process identity before each request.

~~~js
import {createMpcRecoveryClient} from './products/mpc-recovery-operations/client.mjs';

const client = createMpcRecoveryClient({
  connectionFile: '/absolute/private/mpc-connection.json',
  storeId: 'replace-with-actual-store-uuid',
  storeDirectory: '/absolute/private/mpc-store'
});
try {
  const identity = await client.state();
  const saved = await client.branch(identity.defaultBranchId);
  const expected = {
    workspaceId: saved.workspaceId,
    revision: saved.revision,
    snapshotSha256: saved.snapshotSha256
  };
  const report = await client.report({
    id: saved.id, expected, kind: 'serviceReview',
    options: {from: saved.snapshot.workspace.createdAt,
      to: saved.snapshot.workspace.updatedAt, asOf: saved.snapshot.workspace.updatedAt}
  });
  for await (const page of client.history({id: saved.id, expected})) {
    consumeOriginalOperations(page.items);
  }
} finally {
  await client.close();
}
~~~

Replace the paths/UUID with actual creation results. The example's consumeOriginalOperations is the application's complete-history consumer. Reports without new observations retain the original model's unknown/incomplete findings. The SDK accepts one awaited call at a time. Closing drains this borrower; Applications owns service start/stop.

## Identity and original requests

A physical store has its own UUID and canonical directory. Each branch has a separate local ID. A portable snapshot preserves its original workspace ID, so received branches can share that logical ID. Select the physical store and branch explicitly.

Mutations bind the complete expected triple: workspaceId, revision and snapshotSha256. Save, command, proposal, history and export use that exact branch edition. Freeze the same triple for report deliveries.

The transport request UUID is separate from the original domain command ID. Retain both before dispatch. Repeating an exact transport request returns its first result even after later branch edits; read the branch again for current state. Exact original model commands also retain their first outcomes.

An uncertain response requires reconciliation through client.request(originalRequestId). If present, retain the returned original result. If absent and retrying, reuse exactly the same method arguments and UUID. The SDK snapshots caller-owned inputs before yielding. A paused history generator cannot change filters or revision because its caller later mutates an options object.

## Complete SDK reference

| Method | Original contract |
|---|---|
| state() | Authenticated physical store identity and application-source digest. |
| branches() | Current physical branch summaries. |
| branch(id) | Complete original validated snapshot and branch metadata. |
| request(requestId) | Retained normalized input, first result and request identity, or null. |
| createBranch({id,label,snapshot,origin,requestId}) | Create a distinct physical branch from a complete original snapshot. |
| saveSnapshot({id,expected,snapshot,requestId}) | Save a continuation preserving the original seed and full prior command/result prefix. Equal revision requires identical snapshot. |
| command({id,expected,command,requestId}) | Apply original {id,actor,at,expectedRevision,type,payload}. |
| importProposal({id,expected,input,requestId}) | Import original {id,actor,at,name,origin,content} through the unchanged proposal validator. |
| report({id,expected?,kind,options?}) | Run the original domain/proposal report. |
| historyPage({id,expected,offset?,limit?}) | Complete page of original commands/results; SDK limit 1–100. |
| history({id,expected,limit?}) | Iterate every history page against the same original expected triple. |
| exportBranch({id,expected}) | Full original portable snapshot envelope and checksum. |
| downloadSource({id,expected,sourceId,bytes,sha256},onChunk) | Every original source byte, verified against its size/hash and selected snapshot. |
| receiveFile({id,label,origin,requestId},file,{bytes,sha256}) | Verify and receive a complete host-selected portable/snapshot file as a distinct branch. |
| importSourceFile({id,expected,command,requestId},file,{bytes,sha256}) | Fill source.import with exact verified bytes, preserving selected metadata/encoding. |
| close() | Drain this borrower without stopping the Application. |

Original command types are source.import, plan.save, plan.approve, backup.import, backup.correct, recovery.record, recovery.correct, acceptance.record, acceptance.check, restoreSchedule.save, hurricane.record, hurricane.correct, incident.record, incident.correct, communication.record and incidentReport.record. Their full business bodies remain documented in the unchanged [domain guide](app/DOMAIN_GUIDE.md).

Reports are overview, serviceReview, acceptance, recoveryOrder, restoreDue, hurricaneStatus, incidentStatus, proposals, proposalPlanDraft and proposalCompare. ServiceReview requires explicit from/to dates; asOf defaults to to. Event/incident/proposal reports require actual original IDs in options.

## Receive, edit and receive again

Choose a fresh physical branch ID, label and original transport UUID before receiving. The selected file's full bytes/hash are verified before dispatch. Its internal checksum and complete history are validated by the original model.

Repeating the original receive returns its first result and preserves subsequent edits. Read the returned branch ID for its current state. A following original model command uses that branch's current expected triple; its next export preserves original logical identity and history. No received branch silently replaces another branch's work.

## Configure customer-agent tools

Use a private configuration file. Relative paths resolve against its directory; create a private export directory in advance.

~~~json
{
  "schema": "stellar-forge.mpc-recovery-workspaces.v1",
  "storageDirectory": "./exports",
  "stores": {
    "primary": {
      "label": "MPC operating store",
      "connectionFile": "./mpc-connection.json",
      "storeId": "REPLACE-WITH-ACTUAL-CREATION-UUID",
      "storeDirectory": "./mpc-store"
    }
  },
  "files": {
    "received-workspace": {
      "path": "./MPC_Recovery_Workspace.json",
      "bytes": 0,
      "sha256": "REPLACE-WITH-ACTUAL-FULL-FILE-SHA256",
      "label": "Complete original portable workspace"
    }
  }
}
~~~

The example ID/size/hash are placeholders; use actual measured values. File aliases permit only host-declared complete files, not arbitrary tool-supplied paths. The provider checks exact size/hash again at use.

Pass this configuration through the existing merchant option mpcRecoveryConnection. Provider family is mpcRecovery; tools use prefix merchant_mpc_recovery_.

~~~js
import {MerchantMpcRecovery, readMpcRecoveryConfiguration} from './merchant.mjs';
const owner = new MerchantMpcRecovery({
  mpcRecovery: await readMpcRecoveryConfiguration('/absolute/private/mpc-tools.json')
});
try {
  const configured = await owner.call('merchant_mpc_recovery_stores', {});
  // Select an actual returned store and current branch basis.
} finally {
  await owner.close();
}
~~~

Every scoped tool includes store alias, storeId and storeDirectory. Branch tools also require branchId and the complete expected triple. The executable catalog in catalog.mjs contains exact required fields.

Stores/state/branch/records/history/request expose original state and complete records. Command/proposal/import_source retain original model semantics. Receive uses a complete configured portable file and new branch ID. Report returns the original result. File_read/file_release use the maintained RetainedFileReads owner.

## Complete file delivery

| File selection | Exact content |
|---|---|
| {kind:"portable"} | Full original portable workspace JSON. |
| {kind:"source",sourceId,bytes,sha256} | Every retained original source byte. |
| {kind:"report",reportKind,options} | Complete original report and branch basis in JSON. |
| {kind:"history"} | All original command inputs and first results from every history page. |

The first read freezes the selected branch/expected triple, materializes the complete file, fsyncs it, opens a read-only handle and unlinks the temporary filename. The existing reader owns the handle until release. Following chunks retain the same scope, selection, readId and checksum. Continue through the declared byte count; a first chunk is not a complete delivery.

Original source limits remain 8 MiB per source and 32 MiB total; complete workspaces are bounded at 96 MiB. HTTP JSON is bounded at 112 MiB; private reader files at 128 MiB. Capacity failures never silently truncate the record.

## Ownership and operation evidence

One managed Application owns the physical store's maintained kernel lease. SDK/agent instances borrow its service. Private connection files bind visible PID, namespace PID, boot identity, PID namespace and start ticks; they are excluded from customer reports. Applications stops the service, HTTP drains acquired handlers, then the store releases its lease.

The original offline app remains byte-for-byte available. Managed serving replaces only branch transport and physical-store display. Download application preserves the complete original source and independent browser branch store; portable deliveries remain editable without the managed service.

The original native 11912 receiving result remains the accepted input. Managed integration and its receiving course are later work. A merged release or source parse is not a new native result or pixel review. When the managed course runs, retain its actual results, complete reports, source and screenshots, and inspect the normal/narrow rendered views.
