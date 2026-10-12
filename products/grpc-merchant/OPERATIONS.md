# gRPC operations and incident handling

Use this workbench to investigate the original workspace's saved calls and health
observations, keep reviewed decisions with their source records, and deliver a
complete incident to another operator. Capture reads those retained records and
creates an immutable selection. Existing upstream calls keep their original IDs
and outcomes.

## Open the same original product

Open the initialized product through Applications or the existing CLI:

~~~sh
starforge grpc-product open --dir /srv/private/service-product --port 0
~~~

The returned native browser contains **Operations**. The returned Merchant
Console contains **Customer files → gRPC / Customer workspace → Operations and
incidents**. Both operate on this product's configured original gRPC workspace.
The Console also saves the tool input, result and receiving history in its
existing private store.

Choose a time range, saved source revisions or native method paths when those
limits are useful. An empty selection includes the available original records.
**Capture original records** freezes the first completed capture under its saved
UUID. Reopening that UUID with its original selection returns the same capture.

## Read the captured service history

The five views expose calls, health observations, a combined timeline, method
cohorts and complete original source revisions. Search and phase filters apply to
the selected immutable capture. Each subsequent page uses its returned snapshot
SHA so a selection cannot silently change between pages.

Call outcomes retain the native attempt's `COMPLETED`,
`OUTCOME_UNCONFIRMED`, `NOT_STARTED` or `ATTEMPTED` state. A returned gRPC
error remains part of that original attempt. Recorded elapsed time includes the
native operation's acquisition and persistence; it is compared only where the
recorded start and finish exist. Method cohorts preserve source revision identity.
Health entries retain their exact captured journal prefix and native statuses.

Open a row to inspect or download the complete original record. Large records
have a bounded on-screen preview and an explicit full-record download. The
capture includes the selected source configuration, exact protobuf source and
merchant plan, plus retained preparations needed to understand the selected calls.

## Review an incident and its corrective actions

Create a case over the selected capture. Set its severity, operational state,
summary, impact and findings, then link the relevant original call, health or
source rows. Add actions with stable UUIDs, named owners, due dates, completion
state and notes. An action can be marked completed or cancelled while its earlier
state remains in the previous case revision.

Set the review to **reviewed**, name the reviewer and save its review note when
the material is ready. Each save carries a retained operation UUID and the
observed current case version. Exact retries return their original revision.
If another operator saved first, reopen that current revision and merge the
reviewed edit before saving with its new version.

History opens any saved revision. Editing from a historical revision prepares a
new revision against the currently observed version; it preserves the intervening
history. The case remains bound to its original capture throughout.

## Native CLI in this product

The installed wrapper resolves the original private console URL from the product.
Save each UUID and the exact input file before dispatch.

~~~sh
starforge grpc-product operations capture --dir /srv/private/service-product \
  --id CAPTURE_UUID --selection /srv/private/selection.json
starforge grpc-product operations read --dir /srv/private/service-product \
  --capture CAPTURE_UUID --section calls --limit 50
starforge grpc-product operations save --dir /srv/private/service-product \
  --case CASE_UUID --capture CAPTURE_UUID --operation SAVE_UUID \
  --expected-version 0 --edit /srv/private/incident.json
starforge grpc-product operations export --dir /srv/private/service-product \
  --case CASE_UUID --version 1 --directory /srv/private/incident-delivery
starforge grpc-product operations inspect --directory /srv/private/incident-delivery
~~~

For a later page, pass the first page's `--snapshot` and returned
`--offset`. `case --case CASE_UUID --version N` opens an exact revision.
`receive --operation RECEIVE_UUID --bundle /private/grpc-operations.json`
imports a complete original incident into the selected original workspace.

## Typed merchant client

The product client binds its first observed product UUID and workspace alias.
Every subsequent call rereads the original connection so reopening the same
product uses its current native listener.

~~~js
import { GrpcProductClient } from './products/grpc-merchant/client.mjs';

const client = new GrpcProductClient({ directory: '/srv/private/service-product' });
await client.ready();
const capture = await client.captureOperations({ captureId: saved.captureId,
  selection: saved.selection });
const calls = await client.readOperations({ captureId: saved.captureId,
  section: 'calls', limit: 50 });
const incident = await client.saveIncident({
  operationId: saved.saveId, caseId: saved.caseId, captureId: saved.captureId,
  expectedVersion: saved.expectedVersion, edit: saved.edit
});
const delivery = await client.exportIncident({
  caseId: saved.caseId, version: saved.version
});
~~~

Other typed methods are `operationsCaptures`, `incidents`, `incident`,
`receiveIncident`, `inspectExport` and `receive`. The complete original tool
definitions are available through `grpc-product tools` and `client.call`.
Large original results retain the existing complete-result export descriptor,
which the Console opens through the original file reader.

## Deliver all five files and continue receiving

The complete incident contains:

| File | Original content |
| --- | --- |
| `grpc-operations.json` | Full capture and every case revision through the selected version |
| `calls.csv` | Captured native call outcomes and recorded timings |
| `health.csv` | Captured native health observations and their exact prefixes |
| `actions.csv` | Selected reviewed corrective actions |
| `report.html` | Readable incident, source cohorts, review and actions |

The complete JSON preserves original record values. CSV text cells are quoted
and protected for spreadsheet opening. The HTML report is self-contained and
requires no scripts or external service.

For merchant receiving, save the returned original `exportId` and
`manifestSha256` before starting the transfer. Continue an interrupted transfer
with those same values and directory:

~~~sh
starforge grpc-product receive --dir /srv/private/service-product \
  --export-id ORIGINAL_EXPORT_SHA --manifest-sha256 ORIGINAL_MANIFEST_SHA \
  --out /srv/private/incident-merchant-delivery
starforge grpc-product inspect-received \
  --out /srv/private/incident-merchant-delivery \
  --export-id ORIGINAL_EXPORT_SHA --manifest-sha256 ORIGINAL_MANIFEST_SHA
~~~

The receiver uses the existing original file transport, validates the complete
five-file incident and retains its original capture and revision hashes. Offline
inspection works after the original listeners have closed. A newer incident
revision is a different export and receives its own selected directory.

To import through the merchant connection, use `receiveIncident` with one
host-declared `operations` file alias or one retained operations `exportId`,
and a saved receiving operation UUID. The native receiver preserves source,
call, health, incident and action IDs. A matching received history may extend
the local case; a shorter matching export retains the longer local history.
A conflicting revision stops that import for an explicit review.

## Reopen and transfer

Keep the original product, native workspace and receiving directories. Stopping
the product closes its native owner and Console through the existing lifecycle.
Opening the same product loads its saved captures and incident histories.
The source selection includes this complete workbench and receiving code in
the installed product.

Use the existing [product receiving guide](RECEIVING.md) for the original
customer source package, streams, upgrades and health snapshots, and the native
[operations receiving contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/operations/RECEIVING.md)
for exact capture/history and file identities.
