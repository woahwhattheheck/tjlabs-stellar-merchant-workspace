# Grant Operations — complete application handoff

Use **starforge grant-application-handoff** to hand another operator one complete Grant Operations case together with the saved Application that opens its workspace. The receiving operator selects an installed runtime and private grant workspace, receives the original case through its native importer, reviews the destination Application, and saves it through the existing Applications writer.

The single **grant-handoff.json** file contains the original complete operating-case ZIP and complete Applications setup JSON. It carries the pinned plan, original records and attachments, history, forecasts, portfolios, installation editions, statement and billing source, and every other item included by the installed case export. Its source metadata identifies the selected application revision, case version, runtime edition and original grant service. The setup document keeps the original application settings and source catalog beside those case bytes.

The command is included in the **grant-operations** selected product. Its public API is **./grant/application-handoff**.

## 1. Choose the source and destination

Use the original runtime workspace containing the saved **Grant planning and delivery** Application. Read that application's ID and the case's current native ID/version from Applications and the grant operator. The source and receiving runtime workspaces each need an attached **READY** runtime containing Grant Operations.

A receiving operation names the private grant workspace explicitly. It can receive into a new workspace or into an existing one. The native importer creates its destination plan and case while preserving the original record, attachment and history identities. Existing cases stay available in the same workspace.

Use private, real directories owned by the operating account. Linux, Node.js, Python and flock follow the installed [Grant Operations operating requirements](OPERATING.md). Keep the operation directory under a private parent, and select an actual Python executable. The command loads the original Grant client from the selected installed runtime.

For an attached runtime, the original dispatcher can run the command:

~~~sh
node /absolute/maintained/distribution/runtime-install-cli.mjs run \
  --dir /absolute/installed/grant-runtime -- \
  grant-application-handoff --help
~~~

The examples below use **starforge** as the installed dispatcher. Replace uppercase identities with the actual values returned by your native workspace.

## 2. Export the complete source case and Application

Read the current case version, then select a new named operation directory:

~~~sh
starforge grant-application-handoff export \
  --workspace /srv/grant/private/runtime-workspace \
  --operation /srv/grant/private/handoffs/source-delivery-01 \
  --application APPLICATION_ID \
  --case ORIGINAL_CASE_ID \
  --expected-version CURRENT_CASE_VERSION \
  --name "Grant delivery handoff"
~~~

The source command borrows an already running original grant service. If this operation should start the original service when it is closed, add **--allow-start**. The command closes a service it started after export; borrowing an Application's existing listener leaves that Application in charge.

The exporter retains its source selection before native work. It captures the complete setup and native case ZIP together, checks that the selected case version and saved application revision stayed current during that capture, and atomically retains both originals. A completed capture is reused after interruption.

The output gives the complete package path, byte count and SHA-256:

~~~text
/srv/grant/private/handoffs/source-delivery-01/grant-handoff.json
~~~

Send this one file through the customer's agreed private delivery channel. It contains the full authorized case and its original attachments. Its complete operating-case ZIP remains available separately in the source operation's **captured/case.zip**, and the exact setup remains in **captured/setup.json**.

Inspect a received file without opening either runtime workspace:

~~~sh
starforge grant-application-handoff inspect \
  --package /srv/grant/private/incoming/grant-handoff.json
~~~

The inspection returns source identities, original file sizes and hashes, and the complete setup document. The original case archive supports up to 32 MiB; the complete setup supports up to 2 MiB. The enclosing file supports up to 48 MiB, including Base64 and metadata.

## 3. Write explicit destination bindings

Create a JSON file selecting the receiving host's actual runtime and paths:

~~~json
{
  "runtimeId": "DESTINATION_RUNTIME_ID",
  "label": "Received grant delivery",
  "settings": {
    "workspaceDirectory": "/srv/grant/private/received-delivery",
    "pythonExecutable": "/usr/bin/python3",
    "scenarioFile": "",
    "port": 8468
  },
  "caseName": "Received grant delivery",
  "actor": "Receiving operator",
  "allowStart": true
}
~~~

Use the destination runtime ID from the receiving runtime workspace. **settings** is the complete host configuration for the new Application; select its workspace, Python and desired port explicitly. An empty scenarioFile lets the installed original launcher choose its source scenario for an empty workspace. The received case retains its own pinned original plan and complete planning history.

**allowStart** controls the native Grant client used for case receiving. With true, this operation can start the original selected service and close its own service afterward. With false, it borrows a matching service already running on the selected destination workspace. It never replaces another service's launch selection.

Use the actual named receiving operator in actor. The caseName and actor form part of the original import request and are retained for response recovery.

## 4. Prepare and review the destination

~~~sh
starforge grant-application-handoff prepare \
  --workspace /srv/grant/private/receiver-runtime-workspace \
  --operation /srv/grant/private/handoffs/receive-delivery-01 \
  --package /srv/grant/private/incoming/grant-handoff.json \
  --bindings /srv/grant/private/receiver-bindings.json
~~~

Preparation retains the exact incoming package, both complete original files, full destination bindings, native source selection and stable import/Application request identities. It obtains the original Applications host review so invalid settings are reported before a case is imported.

Inspect the returned source case, target workspace, runtime edition, case name and recording operator together. The phase is **PREPARED**. The input files can subsequently move out of the incoming directory; the operation has retained their complete bytes.

For a resumed preparation, use the same operation:

~~~sh
starforge grant-application-handoff prepare \
  --workspace /srv/grant/private/receiver-runtime-workspace \
  --operation /srv/grant/private/handoffs/receive-delivery-01
~~~

## 5. Receive the original case

~~~sh
starforge grant-application-handoff receive \
  --workspace /srv/grant/private/receiver-runtime-workspace \
  --operation /srv/grant/private/handoffs/receive-delivery-01
~~~

Receiving opens the original selected Grant client and passes the complete unchanged ZIP to its native **importBundle('case')** operation. The native importer validates the full case and planning archive, records the original request and returns the actual destination case/plan identities.

The operation retains the exact native import result before advancing. It reads that case's original archive/program/plan association, then closes its owned receiving service and prepares the new Application against the destination workspace through the existing Applications setup operation.

The result contains:

| Field | Meaning |
| --- | --- |
| imported.result.id | Actual destination operating-case ID. |
| imported.result.planId | Actual destination plan ID selected by the native importer. |
| imported.result.version | Retained original case version at import. |
| imported.file | Exact native result file in this operation. |
| application.review | Original Applications review for the selected destination settings. |
| application.saveRequest | Retained original Application save request. |
| phase | APPLICATION_REVIEWED after case receiving and Application preparation complete. |

A new save uses the same original application request throughout recovery. The operation preserves the complete source setup in the child Application operation, including the source catalog and prior settings.

## 6. Save and open the receiving Application

Review the returned **application.review** and commit that prepared Application:

~~~sh
starforge grant-application-handoff save \
  --workspace /srv/grant/private/receiver-runtime-workspace \
  --operation /srv/grant/private/handoffs/receive-delivery-01
~~~

The phase becomes **APPLICATION_SAVED**. **application.result.applicationId** identifies the saved Application, and **imported.result.id** identifies the received operating case. Open that Application in the original runtime workspace, complete its normal Start review and Start/Open controls, and select the received case in Delivery operations.

The original Application writer retains the accepted save request and any managed-runtime connection operation. Its returned connection or connectionError remains available for the normal Applications connection/recovery controls. A later deliberate application edit remains current when an earlier accepted save is replayed.

Continue the received case through the normal grant operator. Its contributors, work, invoices, cash, sources, statements, billing, forecasts, portfolios, installations and reviews use their existing native controls and state transitions.

## 7. Recover the same operation

~~~sh
starforge grant-application-handoff status \
  --operation /srv/grant/private/handoffs/receive-delivery-01
~~~

Status reads the complete retained package and current original Application setup operation.

| Retained state | Continue |
| --- | --- |
| Source export interrupted before capture | Repeat export with the original workspace and operation. It reuses the original application/case selection. |
| Complete source capture retained | Export builds or returns the same complete handoff from those retained originals. |
| PREPARED | Repeat receive to execute or recover the original case import. |
| Import response lost | Repeat receive. The exact ZIP, name, actor and native request ID recover the importer's original result. |
| CASE_RECEIVED | Receive reopens the actual destination case and continues its Application preparation. |
| APPLICATION_REVIEWED | Inspect its review and run save. |
| Application save response lost | Repeat save. The original Applications writer returns the accepted result. |
| APPLICATION_SAVED | Use the saved Application and actual received case ID. |
| Incoming files removed | Resume with the operation directory; its private retained package and bindings remain sufficient. |
| A different source/runtime or host binding is supplied | Return to this operation's original selection. A deliberately different handoff has its own operation directory and intent. |

The same operation can be inspected at any time. Each committed stage persists before the next starts. An error retains its code and message beside the original request and source.

### Files kept with the operation

The source operation keeps **handoff/operation.json**, its atomic **captured/** source set and the complete **grant-handoff.json**.

The receiving operation keeps **handoff/grant-handoff.json**, **host-bindings.json**, **case.zip**, **application-setup.json**, **application-bindings.json**, **operation.json** and the actual **import-result.json**. Its **application/** child is the original Applications setup operation with complete source, review, save request and result.

These files let another authorized operator continue the same customer delivery without rebuilding inputs from a message or recreating business records.

## 8. Use the public API

~~~js
import {
  inspectGrantHandoff,
  exportGrantHandoff,
  prepareGrantHandoff,
  receiveGrantHandoff,
  saveGrantHandoffApplication,
  grantHandoffStatus,
} from '@tokenjunkielabs/starforge-merchant/grant/application-handoff';
~~~

The exported functions accept an opened original runtime-workspace model where required:

~~~js
const exported = await exportGrantHandoff(sourceModel, {
  operation: '/srv/grant/private/handoffs/source-01',
  applicationId,
  caseId,
  expectedVersion,
  name: 'Grant delivery',
  allowStart: false,
});
const inspected = await inspectGrantHandoff({
  package: '/srv/grant/private/incoming/grant-handoff.json',
});
const prepared = await prepareGrantHandoff(destinationModel, {
  operation: '/srv/grant/private/handoffs/receive-01',
  package: '/srv/grant/private/incoming/grant-handoff.json',
  bindings: '/srv/grant/private/receiver-bindings.json',
});
const received = await receiveGrantHandoff(destinationModel, {
  operation: prepared.operationDirectory,
});
const saved = await saveGrantHandoffApplication(destinationModel, {
  operation: prepared.operationDirectory,
});
~~~

Keep the returned full objects when integrating this workflow. The [Applications setup guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATION_SETUP.md) describes the underlying complete setup and its Review/Save recovery. The [Grant Operations operating guide](OPERATING.md) describes the received case's business workflow and original CLI/Merchant interfaces.
