# Merchant MCP: complete Support recovery

The merchant MCP Support provider exposes the existing SF74 recovery console and SF93 snapshot engine. An operator can retain a complete incident store, receive it under a named operation, open the received source through the same merchant owner, review the original notification queue, and continue using the usual incident, CKAN, case and watcher tools.

Source configuration and file selection stay with the original host. The MCP interface accepts names and exact revision/digest guards. Its received-source map selects the store that SF74 has already verified; original snapshot pins, request files, manifests, received state and reconciliation history remain the durable record.

## Host setup

Use the existing merchant Support connection and its original incident-source configuration. Initialize the incident store through the normal SF93 workflow, then configure a separate private recovery directory for that source. The two directories must be canonical, owned by the running host user, and private. The original console binds their filesystem identities during opening.

This is the incident-source file shape:

```json
{
  "schema": "stellar-forge.support-incident-sources.v1",
  "sources": [
    {
      "id": "svk",
      "label": "SVK merchant operations",
      "directory": "/srv/merchant/support/svk-incidents",
      "recoveryDirectory": "/srv/merchant/support/svk-recovery",
      "ckanWorkspaces": [
        {
          "id": "svk_ckan",
          "label": "Reviewed SVK publisher",
          "directory": "/srv/merchant/ckan/svk"
        }
      ]
    }
  ]
}
```

The normal source opening also includes CKAN registrations already saved in the original incident-store configuration. Received stores reconstruct those named CKAN and Object selections from the saved merchant registrations, using each saved merchant ID. In this example the saved CKAN merchant ID is also `svk_ckan`; a startup-only alias is available after receiving when it is part of the saved registration. An original selected CKAN registration retains its catalog origin, project creation identity and reviewed source, refresh and publication IDs.

Connect that source file through the original Support connection:

```json
{
  "schema": "stellar-forge.merchant-support-connection.v1",
  "casesDirectory": "./cases",
  "incidentSourcesFile": "./incident-sources.json",
  "defaultIncidentSource": "svk"
}
```

Paths are resolved by the existing host configuration loader. It reads the source file and retains its exact digest and original source ID/label/directory projection. The named-source connection uses `incidentSourcesFile`; the separate legacy single-store configuration uses `incidentsDirectory`. A single initial source is the default; for multiple initial sources, select an explicit `incidentSource` or use the host's configured default. Opening received sources leaves that default unchanged.

Start with `merchant_support_incident_sources`. Recovery-enabled entries include:

```json
{
  "id": "svk",
  "label": "SVK merchant operations",
  "recovery": {
    "enabled": true,
    "workspaceId": "<exact 64-character host workspace digest>",
    "restored": false,
    "baseSourceId": "svk"
  }
}
```

Read `merchant_support_recovery` for that source. Its `workspaceId` binds the original source and recovery directory identities. Every selected operation below requires that current value.

## Original tool contract

All tool arguments are flat JSON objects. `incidentSource` selects an initial configured source or a received source opened by this MCP owner. Names for snapshot, receive and reconciliation operations accept 1–96 characters: an initial letter or digit, followed by letters, digits, periods, underscores or hyphens. Digests are exact lowercase SHA-256 values.

| Tool | Required selection | Original result |
| --- | --- | --- |
| `merchant_support_recovery` | Optional `incidentSource`, `offset`, `limit` (1–20) | Source revision, workspace identity, current recovery/queue review, snapshot pins and paged saved or incomplete operations. |
| `merchant_support_recovery_snapshot` | `workspaceId`, `operationId`, `expectedRevision` | Complete original manifest, manifest digest, state revision, file inventory, source counts and pin-release outcome. |
| `merchant_support_recovery_inspect` | `workspaceId`, `snapshotName`, `expectedManifestSha256` | Verification of every original snapshot member, complete manifest and source identity. |
| `merchant_support_recovery_receive` | `workspaceId`, `operationId`, `snapshotName`, `expectedManifestSha256` | Original received receipt, current source view, retained receiving identity and `reused`. |
| `merchant_support_recovery_open` | `workspaceId`, `receiveName`, `expectedManifestSha256` | Verified received source, its stable `incidentSource`, its own `workspaceId`, original recovery state and exact `reopen` arguments. |
| `merchant_support_recovery_reconcile` | `workspaceId`, `operationId`, `expectedRecoveryId`, `expectedManifestSha256`, `expectedQueueSha256`, `expectedConfigHash`, `originalWriterStopped: true`, `by` | Original recorded queue/configuration review, operator details, timestamp and exact-request replay result. `notes` is optional. |
| `merchant_support_recovery_abandon` | `workspaceId`, `operationId`, `expectedPinSha256`, `by`, `notes` | Original incomplete-snapshot abandonment and pin-release record. `expectedPinSha256` is null only when the original snapshot has no retained pin. |

The native engine checks operator strings in bytes: `by` is at most 160 bytes and `notes` at most 2,000 bytes. Snapshot abandonment requires both a named operator and a nonempty reason. Revision selection uses the exact positive original state revision.

## Receive one complete source

1. Read `merchant_support_recovery` and retain its workspace identity and original source revision. Keep a stable snapshot operation ID in the existing customer or operation record.
2. Call `merchant_support_recovery_snapshot` with that ID and revision. SF93 pins the exact original state bytes and their immutable capture references before copying. The completed manifest includes every selected capture and previous recovery-history member.
3. Call `merchant_support_recovery_inspect` with the returned manifest digest. A `SAVED` listing is an inventory entry; this inspection reads and validates every selected payload.
4. Call `merchant_support_recovery_receive` with a stable receiving operation ID, the snapshot name and the inspected digest. The original receiver publishes its prepared receipt and then the operative state through its existing leases.
5. Open that same receiving operation with `merchant_support_recovery_open`. Continue all existing Support work on the returned `incidentSource.id`.

For example, the original source `svk` can return a received selection such as:

```json
{
  "incidentSource": {
    "id": "recovered-<original 24-character identity>",
    "label": "SVK merchant operations · received svk-receive-20261012",
    "recovery": {
      "enabled": true,
      "workspaceId": "<received source workspace digest>",
      "restored": true,
      "baseSourceId": "svk"
    },
    "ckanWorkspaces": [
      { "id": "svk_ckan", "label": "Reviewed SVK publisher" }
    ]
  },
  "workspaceId": "<received source workspace digest>",
  "reopen": {
    "incidentSource": "svk",
    "workspaceId": "<original base workspace digest>",
    "receiveName": "svk-receive-20261012",
    "expectedManifestSha256": "<original snapshot manifest digest>"
  }
}
```

The two workspace digests have different roles. Use the received digest when reviewing or reconciling that received store. Retain the returned `reopen` object for selecting the same received source after an MCP restart. It is anchored at the configured base source, including when a received source is used to prepare another snapshot.

The received-source ID comes from the original SF74 owner. Reopening the same directory and manifest preserves it. The owner also verifies the original filesystem identity, current retained state, all referenced captures and recovery history. The MCP map becomes selectable only after those checks succeed.

## Continue ordinary Support work

Use the received `incidentSource.id` with:

- `merchant_support_profiles` to inspect the unchanged saved merchant registration and current configuration identity.
- `merchant_incidents`, `merchant_notifications` and `merchant_incident_view` to page or open original incidents, attempts and retained captures.
- `merchant_support_ckan_inspect` to inspect a named CKAN registration at its current configuration revision.
- `merchant_incident_case` to retain an exact incident and route through the original SF74 case writer and existing host workspace template.
- The existing watcher status/start/stop tools for the received source's actual owner and instance.

CKAN captures retain the complete three-file workbench cohort, the original source and reviewed comparison/publication bytes, and opaque JSON for exact numeric detail rendering. The original CKAN wrapper supports up to 36 MiB; other capture kinds keep their existing 12,000,000-byte limit. Snapshot and restore use the same original incident-store capture validator.

A selection-window change keeps its original comparison meaning. It is carried as the retained reviewed comparison rather than being reinterpreted as resource-wide deletion during receiving.

## Review notification recovery

Receiving preserves original notification IDs, attempts, request hashes, provider receipts and any original in-flight deadlines. The SF93 receiver records each unfinished event's previous state and presents it for review. It also preserves incident history and resets consecutive-poll state for the received source's future observations.

Read `merchant_support_recovery` on the received source. Its `recovery` object supplies:

- The original recovery ID and manifest digest.
- Current configuration and queue digests.
- Original attempts whose retained deadlines are still in the future.
- The unfinished notification IDs and their original attempt counts.
- The existing reconciliation record, when one has already completed.

Finish the original writer through its actual owner before supplying `originalWriterStopped: true`. Then call `merchant_support_recovery_reconcile` with the exact selected recovery, queue and configuration hashes and one stable reconciliation operation ID.

The original engine retains this review and operator attribution. Use the existing per-notification retry/cancel operation and exact attempt count for subsequent event decisions. Start or stop a watcher through its original owned-instance lifecycle. The receipt and current recovery state remain available after reopening.

## Continue after an interrupted reply

The original recovery overview exposes incomplete operations and their retained `request`. Resume the same action and full input under the same workspace identity. A pinned snapshot continues from its original expected revision even if the live source has advanced; changing that revision would select a different request.

For a completed snapshot, retain its exact manifest digest and inspect it. For an interrupted receive, repeat its original operation ID, snapshot name and digest, then open the same receiving name. Completed receive replay keeps receiver changes already saved in its current state.

After an MCP restart, call `merchant_support_recovery_open` with the retained `reopen` object. The same received source becomes available to existing tools again. Source configuration, snapshot state and customer receiving files remain in the original stores.

For an interrupted reconciliation, inspect the received recovery state and replay the original full request. Its original queue/configuration selection remains the replay identity after completion.

To finish a chosen incomplete snapshot as abandoned, select the original operation and exact pin digest from the current overview, supply operator and reason, and call `merchant_support_recovery_abandon`. SF93 releases the corresponding pin and retains the partial files plus the abandonment record.

## Executable native receiving

`examples/mcp_recovery.mjs` exports `runSupportMcpRecovery`. It uses the current original merchant operator's decoded `call(name, arguments)` interface. The host provides its existing native journal, checkpoint function and owned close/reopen callback.

The example completes this single product journey:

- Pins and verifies a complete original snapshot.
- Receives and opens that same snapshot.
- Reads complete original incident and notification collections and the saved registration through ordinary Support tools.
- Confirms named CKAN registrations and original incident/capture/attempt identities.
- Records the exact received queue/configuration review.
- Replays completed receiving after that receiver edit and verifies the edit remains.
- Closes and reopens the original MCP owner through the caller's lifecycle callback, then opens the same received store and reads it again.

Integrate it into the existing native operation:

```js
import {runSupportMcpRecovery} from './examples/mcp_recovery.mjs';

nativeRecord.supportMcpRecovery ??= {};
await runSupportMcpRecovery({
  call: (name, args) => currentOperator.call(name, args),
  reopenOperator: async () => {
    await currentOperator.close();
    currentOperator = await openOriginalMerchantOperatorFromTheSameHostConfig();
    return (name, args) => currentOperator.call(name, args);
  },
  incidentSource: 'svk',
  snapshotId: 'svk-support-snapshot-20261012',
  receiveId: 'svk-support-receive-20261012',
  reconcileId: 'svk-support-reconcile-20261012',
  by: 'Original receiving operator',
  notes: 'Reviewed the received original incident and notification selection.',
  originalWriterStopped: true,
  record: nativeRecord.supportMcpRecovery,
  checkpoint: async () => saveOriginalNativeRecord(nativeRecord)
});
```

Here the host supplies its existing operator constructor and journal writer. For HTTP clients, pass the current decoded `tools/call` function and keep the original authentication, Accept and MCP protocol headers. The example creates neither a transport nor a parallel operation journal.

Every changing request is checkpointed before dispatch. Resume with the same journal object and inputs after an interruption. The final `COMPLETE` record includes the original snapshot identity, received source and configuration, incident/notification IDs, retained reconciliation and independently reopened source.
