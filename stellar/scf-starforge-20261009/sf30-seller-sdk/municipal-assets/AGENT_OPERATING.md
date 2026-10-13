# Municipal asset agent operation

The installed municipal product exposes the original application through two interfaces:

- **./seller/municipal-assets/client** exports MunicipalAssetClient, an authenticated HTTP client of the existing managed application.
- **./merchant/municipal-assets/client** exports MunicipalAssetMerchantClient, a typed adapter over the existing merchant callTool transport.

Both operate the same saved SQLite projects and source sidecars. The original Python engine owns mapping, revision checks, accepted operations, work-order requests/returns, findings, repair proposals and releases. The merchant adapter supplies configured aliases, complete host-file intake, useful pages and retained downloads.

## Connect the actual managed instance

Complete the ordinary Applications Review, Save and Start course in OPERATING.md. Retain its original request and **application-url.original** startup record. The startup records the actual instance UUID, PID, bound port, selected source manifest and logical/physical database identity.

Create a private JSON connection file with schema **stellar-forge.municipal-asset-host.v1** and a **workspaces** object. Each named workspace has:

| Field | Value |
|---|---|
| label | Operator-facing name |
| actor | The exact original operator name, including for refresh/capture continuation |
| request | Complete original saved Applications request |
| startup | Complete original application-url.original |
| operationDirectory | An absolute private directory for original client requests and returned bytes |
| inputs | Named complete host files with path, sha256, kind, format, and optional label |

Input kinds are source_assets, target_assets, locations, requests, work_orders, returns, roundtrips, and maximo-result. Dataset formats are csv, json, jsonl, geojson, esri-json, belleville-capture and maximo-target; a maximo-result uses json and original roundtrips use jsonl. Selecting an input with input_id:null explicitly removes that selected edition through the native engine.

Keep the original private password in the workspace's operator-password.txt. The connection contains its original startup path, never the password. The managed readConnection verifies the full installed source, original physical database and authenticated live instance before the client signs in as the configured actor. Each meaningful request verifies that same managed instance. A restarted application requires its actual new startup record; it retains the original operation directory for the same physical workspace and actor.

In an application module beside the installed client.mjs:

~~~js
import { readMunicipalAssetConfiguration, MunicipalAssetClient } from './client.mjs';

const configuration = await readMunicipalAssetConfiguration('/absolute/private/municipal-connection.json');
const client = await MunicipalAssetClient.open(configuration.workspaces.city);
try {
  const current = await client.status();
  const project = current.projects.find(row => row.id === selectedOriginalProjectId);
  const page = await client.records({
    projectId: project.id, expectedRevision: project.revision,
    kind: 'source_assets', page: 0, pageSize: 50
  });
  // Inspect the returned original rows before selecting actual mapping fields.
} finally {
  await client.close();
}
~~~

An external consumer can use the selected installed package's **./seller/municipal-assets/client** export. Keep the actual original project ID. The input filename, hash and dataset kind are retained as part of each import; reusing a request ID with different bytes or revision is rejected.

## Merchant setup

Invoke **initializeMunicipalAssetMerchant({directory,connection,name?,releaseStore?})** from the exported **./merchant/municipal-assets/setup** module, or use the maintained merchant provider setup entry selecting municipal-assets. This calls the original release-store initializer and reads the normal merchant configuration. It prepares the existing merchant exports directory and records the absolute original connection-file path. An interrupted setup continues the same saved setup and release-store attempt.

For an existing merchant configuration, set **municipalAssetConnection** to the private connection file. The distribution contribution discovers the source-owned provider through the maintained merchant registry.

~~~js
import { MunicipalAssetMerchantClient } from './mcp-client.mjs';

const city = new MunicipalAssetMerchantClient(callTool, 'city');
const current = await city.status();
const selected = current.projects.find(row => row.id === selectedOriginalProjectId);
const input = await city.input({input:'source-original'});

const received = await city.importInput({
  projectId:selected.id,
  expectedRevision:selected.revision,
  requestId:'city-source-import-20261013-01',
  input:'source-original',
  expectedSha256:input.sha256
});
~~~

A tool argument cannot choose another URL, password, actor, filesystem path or source installation. Those come from the configured original host selection. Use the current project revision returned by each successful native change when preparing the next distinct edit.

## Complete work

1. Read status and the original project. Page input editions, findings, mappings and records.
2. Import the exact source, target, location, request and work-order editions, then confirm their actual mappings. Explicitly save comparison fields, allowed status transitions and engagement references.
3. Retain review decisions and correction proposals. A corrected target edition is an actual separate import; the native project retains the original observations.
4. Request a work-order change using the observed revision. Import its full actual return and apply it through applyReturns. Preserve the returned conflict or rejection when that is the original adapter's result.
5. Use nativeCheck and release through the unchanged native checker and release engine. Download the complete report and selected release.
6. For public sources, refreshStart retains the original revision, page widths and source selection. Refresh operation IDs and sourceOperation are limited to the native 64 characters. Inspect paged refresh status. refreshResume keeps refreshOperation and actor, with a distinct durable client request ID for that explicit resume.
7. For Maximo, use the existing configured tenant profile. Start or resume the original full target capture, receive that capture, and prepare a load from its explicit mapping. Download the complete prepared load for the prime's existing native dispatcher. Receive its exact returned JSON host file, inspect every original result row, then acquire the actual following target edition.

The Maximo receiving client embeds the original UTF-8 envelope directly into the native request without parsing and reserializing its numeric payload. Its full request journal retains the original wire bytes. The original native handler remains responsible for interpreting the envelope.

## Interrupted writes

Before a mutating POST, the client atomically retains the complete method, path, headers, body, SHA-256, request ID, original physical workspace binding and actor. A process-level private lock serializes that workspace's client journal. Each actual invocation is recorded before sending; every complete returned response is saved in an immutable private response sidecar and referenced by its original attempt.

If a call is interrupted, use operation(requestId) to inspect its existing request. replayOperation(requestId) sends the retained exact original body. It preserves the original native operation ID and expected revision, allowing the native application's own operation table to return an already committed result. A completed client request returns its saved original result. Start a distinct request only for a distinct intended action.

A 202 response records acceptance of the original asynchronous source operation. Its eventual state belongs to refreshStatus or maximoStatus. An explicit resume uses a new client request ID and the original source/capture operation ID.

The local agent operation directory is separate from the native application directory. Retain it with the host connection for agent continuation. Native project history remains in the original SQLite backup and stopped-workspace handover.

## Full original files

file_read uses the maintained retained-file reader. Its first read acquires one immutable full snapshot. Subsequent reads retain the same selection, readId, expectedSha256 and byte offset; they do not rerun the exporter. The final chunk releases that reader. file_release cancels a selected reader.

| Kind | Selection |
|---|---|
| project / report | Original project ID and observed project revision |
| export | Original project ID, observed revision, optional original release ID |
| backup | Original SQLite workspace backup |
| refresh | Project ID, original refresh operation ID and native output name |
| refresh-status / maximo-status | Project ID; complete original source operation listing |
| maximo-capture / maximo-load / maximo-result | Project ID and original capture, preparation or receiving operation ID |
| operation | Original client request ID, complete request and every returned response sidecar |

The typed merchant client's downloadFile checks every original chunk, exact metadata, complete byte count and final SHA-256. Pass onChunk for a streaming sink or receive the complete Buffer. JSON views stay within 2 MiB; select a smaller page or a complete file when original values are larger. Retained originals support up to 256 MiB per selected transfer, input datasets up to the native 32 MiB limit and returned Maximo requests up to the native 16 MiB limit.

The ordinary project HTTP view exposes the original latest 100 history entries and latest 20 native runs. The client labels that window; the native SQLite backup retains full history. To carry public-refresh/capture journals and their actual retained files as well, stop the original application and use the full handover/receive course in OPERATING.md.

## Receiving this interface

Use the existing native product receiving operation. In its actual installed runtime:

- Import both exported client modules and discover the municipal provider through the normal merchant catalog.
- Open the original managed application through Applications and connect with its observed startup.
- Complete a source import, explicit mapping, records/findings inspection, repair proposal, native check and release using the original labelled development fixtures in a separate development workspace.
- Return the existing development project to its selected original revision through an explicit native restore action when demonstrating reversible edits.
- Read the full selected report and release through the actual merchant retained reader, independently reopen the outgoing files, and compare the complete returned SHA-256 and byte count.
- Continue one completed request and confirm the same native operation/result. An explicit changed-input reuse must report the original operation conflict.
- Keep the actual customer workspace and source operation distinct from the labelled development course; use its already selected actual source for target/source continuation.

The native/browser receiving owner carries this alongside the complete application and stopped-workspace handover course. Source review and parsing prepare that actual installed operation.
