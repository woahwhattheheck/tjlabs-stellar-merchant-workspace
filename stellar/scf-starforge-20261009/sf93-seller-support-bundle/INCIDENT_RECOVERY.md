# Complete incident-store recovery

Save a consistent SF93 incident store while its watcher continues running, inspect
every retained file, receive it into a separate private directory, and reopen it
through the existing SF74 Support console. The original incident store, capture
parser, notification queue and kernel leases remain the operating system for
this workflow.

This is a complete snapshot of the **retained incident store**: its exact
configuration and revisions, merchant observations, incident and acknowledgment
history, notification requests/attempts/receipts, every referenced capture, and
earlier recovery provenance. External buyer directories, merchant databases,
notification credentials and other applications' files remain their original
dependencies. A captured Object observation is evidence of that selected saved
session; it is not a second acquisition or a backup of the buyer's full workspace.

## Runtime and private placement

Use the existing installed `support-watch` command or its source entry
`sf93-seller-support-bundle/incident-cli.mjs`. The same `support-console`
application provides the browser controls. Requirements are Node 22 or newer,
Linux, util-linux `flock`, and Python 3. Directory publication calls the existing
SF88 `dataset-session-portable.py` `publish_absent` primitive, which uses
`renameat2(RENAME_NOREPLACE)`. Keep that original file in the installed source
closure. No additional dependency installation or service is introduced.

Directories must be canonical absolute paths, owned by the operating-system
user running the store, mode `0700`, on a local filesystem with working kernel
locks, hard links, no-replace rename and fsync. Files must be private regular
files with one link, normally mode `0600`. Symlink roots and changed identities
are rejected. The parent of each CLI output directory must already exist and be
private. A snapshot, receiving directory and source store must be separate;
neither may contain the other.

For the examples below, replace revision, digest and operation placeholders with
the actual values returned by the preceding command. Operation IDs contain
1–96 letters, digits, periods, underscores or hyphens and begin with a letter or
digit. Use a new ID for a genuinely new snapshot or receiving selection.

```bash
umask 077
mkdir -p /srv/stellar/operator/recovery
chmod 700 /srv/stellar/operator/recovery
SF93=stellar/scf-starforge-20261009/sf93-seller-support-bundle
SOURCE=/srv/stellar/operator/incidents
```

## Save a live snapshot

Read the whole-directory revision and select it explicitly:

```bash
node "$SF93/incident-cli.mjs" status --state "$SOURCE"
node "$SF93/incident-cli.mjs" snapshot --state "$SOURCE" \
  --out /srv/stellar/operator/recovery/snapshot-oct12 \
  --operation snapshot-oct12 --revision ACTUAL_DIRECTORY_REVISION
```

The operation first publishes its exact request in a new private directory.
Under the source's original short transaction lease it checks the reviewed
revision and durably pins the exact raw state plus its native capture references.
It then releases that source lease and copies the frozen files while the watcher
continues operating. Ordinary source retention includes active snapshot pins,
so advancing the live store cannot collect a capture that the snapshot still
needs.

A revision conflict before pin creation does not select a later revision
silently. Refresh the source and choose a new snapshot ID. The earlier selection
can be explicitly abandoned. Once a pin exists, repeating the exact original
command resumes its frozen revision even if the live store has advanced.

The snapshot directory contains:

| File or directory | Purpose |
|---|---|
| `request.json` | Exact operation, source directory and reviewed revision |
| `snapshot-pin.json` | Source pin identity, frozen state hash and configuration |
| `state.json` | Exact raw original state bytes |
| `captures/capture-SHA256.json` | Every capture referenced by that state, checked through the original native parser |
| `recovery/` | Exact earlier state/manifest/receipt provenance, when present |
| `manifest.json` | Sorted complete member inventory with byte counts and SHA-256; published last |

The returned `manifestSha256` identifies the exact manifest bytes. A successful
snapshot includes a full verification result and a matching source pin-release
receipt. If the process stops after manifest publication but before release, the
same snapshot command verifies the completed files and finishes that release.
Source-owned pin receipts remain with the original store.

An existing unrelated destination is never adopted or overwritten. A failed
first request write leaves an operation-specific prepared sibling that the same
request can finish; it does not leave an unidentifiable final directory. Partial
copy files remain part of the original operation and are rechecked on resume.

## Inspect, transfer and receive

A listing or manifest header is not proof that the capture files are available.
Run the complete inspector before receiving:

```bash
node "$SF93/incident-cli.mjs" inspect-snapshot \
  --snapshot /srv/stellar/operator/recovery/snapshot-oct12 \
  --manifest-sha ACTUAL_MANIFEST_SHA256
```

The inspector checks exact manifest encoding and digest, the complete native
reference inventory, every file's hash and length, private file identities, the
original state validator and the original capture parser. It returns the actual
source revision, configuration digest, merchant/incident/notification/capture
counts, file count and total bytes.

Transfer the complete snapshot directory through your existing private file
transport when another host receives it. Preserve the full member paths and
permissions, then inspect the transferred directory against the same manifest
digest. Native lock inodes, live writer state outside the saved JSON, and active
source pins do not become authorities on the destination. The recipient runs
the receiving command with a new output directory:

```bash
node "$SF93/incident-cli.mjs" receive-snapshot \
  --snapshot /srv/stellar/operator/recovery/snapshot-oct12 \
  --state /srv/stellar/operator/recovery/received-oct12 \
  --operation received-oct12 --manifest-sha ACTUAL_MANIFEST_SHA256
node "$SF93/incident-cli.mjs" status \
  --state /srv/stellar/operator/recovery/received-oct12 --details
```

Receiving verifies the entire snapshot before publishing an operative store,
retains its original state and manifest as content-addressed provenance, and
copies all required captures. It preserves a single receiving timestamp through
interruptions. A final `received.json` receipt is prepared before `state.json`
makes the directory openable by the original store. The original worker and
transaction leases fence this publication.

Repeat the same receiving operation and manifest to continue an interrupted
copy. Reopening a completed operation verifies its original recovery identity
and returns the received store's **current** state; it does not overwrite live
changes made after receiving. A different operation, digest or destination
binding is rejected.

## Notification recovery without automatic replay

The new store retains each original notification ID, body and body hash,
destination/configuration binding, attempt count, Slack request/thread/message
identity, provider receipt and recorded retry/deadline history. Delivered,
exhausted and cancelled events keep their terminal state. Every unfinished
original event is individually paused, and the received store has a global
notification-delivery hold. Its old worker is retained as provenance rather
than started. Previous observation baselines and streaks are reset so a fresh
watch cannot derive recovery from an old cross-process interval.

Receiving, opening Support, and reconciling the hold send no notification.
An explicitly started watcher can collect fresh source observations while the
global hold remains. New events queued during that hold are also paused when
the operator reconciles it.

Before releasing the hold, stop the original writer through its own normal
control and review the actual destination, pending attempts and retained
receipts. This is a real operator acknowledgment; the receiving copy cannot
prove that an independent host stopped. The original attempt deadlines must
also have elapsed.

```bash
node "$SF93/incident-cli.mjs" recovery \
  --state /srv/stellar/operator/recovery/received-oct12
```

Save a private JSON review using that exact response:

```json
{
  "operationId": "reconcile-received-oct12",
  "expectedRecoveryId": "received-oct12",
  "expectedManifestSha256": "ACTUAL_MANIFEST_SHA256",
  "expectedQueueSha256": "ACTUAL_QUEUE_SHA256",
  "expectedConfigHash": "ACTUAL_CONFIG_SHA256",
  "originalWriterStopped": true,
  "by": "Named operator",
  "notes": "Original writer stopped through its existing control; retained attempts and receipts reviewed."
}
```

```bash
node "$SF93/incident-cli.mjs" reconcile-recovery \
  --state /srv/stellar/operator/recovery/received-oct12 \
  --input /srv/stellar/operator/reconcile-received-oct12.json
```

The operation compares the exact recovery, manifest, configuration and queue,
checks original deadlines, records the review and releases only the global
hold. Previously unfinished events still need their original individual
`retry` operation with the current attempt count and destination checks.
A changed review returns a conflict; an identical reconciliation request
returns its saved result. It never creates a replacement delivery identity.

The existing webhook transport remains at least once: a lost reply can mean
that a receiver accepted an attempt whose acknowledgment was not saved. Preserve
the event ID and receiver deduplication. A copied receipt, local reconciliation
or fresh observation is not new provider acceptance or independent financial
settlement.

## Release an incomplete snapshot deliberately

Inspect active source pins:

```bash
node "$SF93/incident-cli.mjs" snapshot-pins --state "$SOURCE"
```

Resume the original snapshot when it is still wanted. Otherwise provide its
exact pin digest and a private reason:

```bash
node "$SF93/incident-cli.mjs" abandon-snapshot --state "$SOURCE" \
  --out /srv/stellar/operator/recovery/snapshot-oct12 \
  --operation snapshot-oct12 --pin-sha ACTUAL_PIN_SHA256 \
  --by 'Named operator' --note-file /srv/stellar/operator/abandonment.txt
```

Only an interrupted selection that never created a source pin accepts explicit
`--pin-sha none`. A completed snapshot cannot be abandoned through this action.
The abandonment record precedes pin release; repeating its exact request
finishes release after a lost reply or process interruption. Partial output
files and the original request remain retained. This operation releases source
capture protection, not the snapshot's existing output directory.

The original source collector can remove newly unreferenced captures on its
next ordinary write or explicit `prune`. Files still referenced by live
incidents, current observations, unfinished notifications or another pin remain.
An abandoned/released snapshot ID cannot silently start a different snapshot.

## Use the existing Support console

Add an optional `recoveryDirectory` to the existing private incident-source
configuration. The directory must already exist and be separate from its source
store. Relative paths resolve beside the configuration file.

```json
{
  "schema": "stellar-forge.support-incident-sources.v1",
  "sources": [
    {
      "id": "merchant-operations",
      "label": "Merchant operations",
      "directory": "incidents",
      "recoveryDirectory": "recovery"
    }
  ]
}
```

Open the existing `support-console` with this configuration. Under the selected
source, expand **Snapshots and recovery**.

1. Refresh the source revision, choose a snapshot name and save the complete store.
2. Use **Verify and review** on its saved row to inspect every required file.
3. Review the manifest, counts and total size; choose a new received-store name.
4. Receive the snapshot, then explicitly **Open received store**.
5. The same original source selector opens the verified store. Review incidents,
   retained captures and the held queue; prepare, save and reopen a merchant
   case through the existing Support actions.
6. Confirm the original writer has stopped and reconcile the exact displayed
   queue. Retry only an individually selected original event when appropriate.

The browser selects names under the configured private root, never an arbitrary
filesystem path. Every action binds the current source and recovery directory
identities. Operation requests are retained before dispatch in a browser
namespace tied to that exact recovery workspace. A lost reply exposes
**Continue original request**. Saved incomplete rows independently expose the
original resume request after a new browser session; completed snapshots can
finish pin release, and recorded abandonments can finish their saved release.

Opening a received store adds a bounded profile to this running Support
instance. It starts no worker. After restarting Support, reopen that saved row
from the original configured source; the same directory and recovery identity
are selected. Up to eight received profiles and eight active console-owned
watchers are supported. Each configured base source has its own recovery root.

Transferred snapshots may be placed as complete private directories under the
configured root's `snapshots/` directory using the existing private transport,
then verified by their actual manifest. The console does not import a ZIP,
follow a URL or invent missing files. Its downloaded manifest is an inventory;
the complete transferable snapshot is the saved directory.

## Limits and capacity

| Bound | Value and behavior |
|---|---|
| Raw state | 16 MiB, same original store limit |
| One native capture | 12,000,000 bytes, same original parser limit |
| Snapshot members | At most 22,000, all selected references required |
| Complete member bytes | At most 768 MiB; no truncation |
| Earlier recovery history | At most 256 files, each at most 32 MiB |
| Active source pins | At most 8, each serialized pin at most 32 MiB |
| Console listing | 20 rows per page; at most 256 snapshot and 256 received names |
| Browser request history | At most 64 entries and 128 KiB |
| Operator notes | At most 2,000 UTF-8 bytes |

Pinned source captures count against the original capture-storage budget.
If a snapshot is interrupted, finish or deliberately abandon it before assuming
its source space is collectable. Copying requires additional actual filesystem
space for the full output. A failed allocation or file write keeps the original
operation; it does not justify deleting unrelated state or choosing a smaller,
incomplete snapshot.

## Public module and HTTP contract

The existing package export `merchant/incidents/operator` also exports:
`exportIncidentSnapshot`, `inspectIncidentSnapshot`,
`receiveIncidentSnapshot`, `inspectIncidentRecovery`,
`reconcileIncidentRecovery`, `listIncidentSnapshotPins` and
`abandonIncidentSnapshot`, plus `SNAPSHOT_SCHEMA` and `SNAPSHOT_LIMITS`.
The implementation module is `incident-recovery.mjs`; its arguments match the
CLI selections above and accept an optional `AbortSignal`.

The existing Support source controller adds:

| Method | Selected input | Result |
|---|---|---|
| `recoveryOverview(sourceId, {offset,limit})` | Configured source | Actual workspace identity, current source revision, pin metadata, paged saved entries and recovery view |
| `recoveryOperation(sourceId, action, {workspaceId,input})` | Exact current workspace identity and action-specific native input | Original snapshot, inspection, receiving, abandonment or reconciliation result |
| `recoveryOperation(sourceId, 'open', envelope)` | Received name and manifest digest | Verified derived source profile, original receipt and current recovery view; no worker startup |

Actions are `snapshot`, `inspect-snapshot`, `receive`, `open`,
`abandon-snapshot` and `reconcile`. They use the existing
`/api/incidents/:sourceId/recovery` routes, loopback Host/origin checks, bounded
JSON input, source capabilities and error mapping. Closing the original server
aborts the recovery signal and drains its tracked operations along with the
watchers it owns.

The source pin helper accepts only the caller's already-held original source
transaction lease. It does not acquire a nested lease or introduce a scheduler.
Snapshot operations keep their own destination lease, and receive uses the
original worker and state transaction leases before final publication.
