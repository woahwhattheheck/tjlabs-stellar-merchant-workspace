# API merchant operations for agents

The API merchant provider joins the existing merchant console to the original Starforge merchant MCP host. Its 33 tools cover source review, offer preparation and publication, existing application and paid-order adoption, purchased access, original execution recovery, complete usage/result exports and encrypted backup receiving. The browser, native CLI and agent attachment use the same saved console operations and original payment/application engines.

The typed JavaScript client supplies the same operations, complete revision-pinned inventory, terminal-operation waiting, full-file downloads, interrupted-download continuation and offline reopening. All exported bytes come from the console's immutable native export files. The retained file owner holds each original verified descriptor while transferring chunks.

## 1. Open and identify the original console

Follow [the merchant console guide](README.md) to select the actual Jobs merchant, checkout terms, API origin, backup application/data roots and private workspace. Start that console through Applications or its installed command:

~~~sh
starforge api-merchant-workspace serve \
  --config /srv/merchant/console-config/merchant.json --port 0
~~~

Keep the original process for browser and agent work. Its startup result and private launch file retain the actual workspace ID, configuration SHA256, original process identity and current private URL:

~~~text
/srv/merchant/api-console/api-merchant-launch.json
~~~

The agent connection selects this launch file. It authenticates to the existing loopback listener and checks the original workspace identity before sending native operations. A console restart updates its launch; the same attachment reads that current launch and verifies the new process against the selected workspace/configuration.

For original exports and standalone receiving, the console can be stopped. Those operations verify the retained workspace and original files directly. The separate merchant MCP host must remain available while a remote client receives files.

## 2. Declare the host selections

Create a private JSON connection file, for example /srv/merchant/agent/api-merchant-workspaces.json. Use the workspace ID and complete configuration SHA from the actual selected console. Replace the uppercase placeholders below with those original values:

~~~json
{
  "schema": "stellar-forge.sf101.api-merchant-mcp-connection.v1",
  "workspaces": {
    "primary": {
      "label": "Primary API merchant",
      "launchFile": "/srv/merchant/api-console/api-merchant-launch.json",
      "workspaceId": "ORIGINAL_WORKSPACE_UUID",
      "configSha256": "ORIGINAL_CONFIG_SHA256",
      "applications": {
        "existing": {
          "label": "Existing paid application",
          "profilePath": "/srv/merchant/existing/application.json",
          "planFile": "/srv/merchant/existing/api-pass.json",
          "profileFileSha256": "FULL_PROFILE_FILE_SHA256",
          "planFileSha256": "FULL_PLAN_FILE_SHA256"
        }
      },
      "receiving": {}
    }
  }
}
~~~

The applications selection is optional. Use it when adopting an existing application, with the exact original application profile and API plan files. Their hashes cover their complete bytes. The provider rereads these selections before adoption.

Aliases contain lower-case letters, digits, underscores or hyphens, start with a letter or digit, and contain at most 64 characters. Each connection has up to 32 distinct native workspaces, each with up to 32 named application and receiving selections. Give each original workspace one alias. Configuration and selected files must be canonical private paths owned by the operating user.

Inspect the selections through merchant_api_console_selections. It returns their full source hashes and byte counts. Application and receiving paths come from this host file; tool requests use the declared handles.

## 3. Register and start the existing MCP host

The source-owned declaration is provider api-merchant-workspaces, configuration field apiMerchantWorkspaceConnection and tool family apiMerchantWorkspaces. Installed commands discover this declaration from the original product distribution.

For an existing merchant MCP configuration, add apiMerchantWorkspaceConnection with the absolute path to the connection file, then restart that original MCP host. Preserve its existing release store, source aliases and other configured providers.

To initialize a dedicated attachment, create a private setup file:

~~~json
{
  "directory": "/srv/merchant/agent/mcp",
  "connection": "/srv/merchant/agent/api-merchant-workspaces.json",
  "name": "Primary API merchant"
}
~~~

Its parent must already exist and be private. The initializer creates the original empty release store and merchant configuration, or completes/reopens its own interrupted setup. Supply releaseStore in the setup file to select an existing original release store.

~~~sh
starforge merchant-providers inspect api-merchant-workspaces
starforge merchant-providers init api-merchant-workspaces \
  --options /srv/merchant/agent/setup.json

starforge merchant-mcp serve \
  --config /srv/merchant/agent/mcp/merchant-mcp.json --port 3211
~~~

Supply the existing merchant MCP bearer token through MCP_ACCESS_TOKEN in the host environment; the original HTTP transport requires at least 24 characters. The console's private launch capability stays in its private launch file. The native application, checkout and recovery environments remain those selected by their original owners.

Connect the agent's Streamable HTTP MCP transport to the startup endpoint with its Authorization header. HTTP is for loopback; the original host can use its existing HTTPS deployment.

Metadata inspection lists the provider and tools without constructing native runtimes. Loading the attachment creates lightweight connections and retained-file owners. Native starts, stops, payments, access revisions and backups remain operations of the selected original console.

## 4. Follow the native operation sequence

Start with merchant_api_console_workspaces, select the returned alias and original workspace ID, and read merchant_api_console_view. Its revision belongs to the original saved workspace. Its counts cover every offer, order, operation, export, backup and function.

Read each needed collection with inventory. Carry the returned expectedRevision through subsequent pages. The typed client's allInventory performs that continuation and checks the original collection total and advancing cursor.

Every durable action requires:

| Field | Meaning |
| --- | --- |
| operationId | A fresh UUID retained with the reviewed complete request before dispatch. |
| expectedRevision | The workspace revision that was used to prepare this action. |
| Action fields | The exact offer, order, access revision, original request or selected backup. |

Generate the UUID with merchant_api_console_new_id, the native CLI new-id command, or the platform UUID generator. Record the full intended request. Native acceptance returns the same operation ID and requestSha256. The original queue owns dispatch and completion.

Read operation with that same ID after a lost response. A duplicate identical action returns its original saved acceptance; reusing the ID with different fields fails. An ATTENTION operation retains its original request and attempts. Repair its actual reported cause, then use resume with the same ID and original requestSha256. Cancelling a queued operation uses cancel with that same hash.

A terminal state is COMPLETED, ATTENTION or CANCELLED. The typed run method submits one native durable action and waits for that terminal record. It returns the complete record so the caller can inspect its outcome before choosing dependent work. Aborting a client request ends that wait; the original saved operation remains queryable.

### Publish a new offer

1. Inspect the configured source and complete functions collection. Choose actual callable function IDs and the worker/API ports appropriate to the original service.
2. Call preview with the title, purchased allowance, routes, workerPort and apiPort. Each route selects its actual function ID, unit price and timeout.
3. Retain the preview's sourceSha256. Submit offer_prepare with that expectedSourceSha256 and the exact same offer fields.
4. Read the completed operation result and offer. Submit offer_publish for that saved offer.
5. Prepare the original customer checkout with order_prepare using that offer and a stable orderReference. Receive all files from the returned native export.
6. Start the selected offer through start when its worker/gateway should serve. Finish the buyer's original checkout, then attach its original entitlement with attach_pass.

The native console guide describes the actual payment terms, customer handoff and purchased route behavior. Service startup preserves the selected original worker/gateway pair and native close sequence.

### Operate an existing paid application

Inspect selections, then use offer_adopt with the host-declared application handle and a label. This reads the actual profile and purchased plan. Use order_adopt with the saved offer, original order reference and label. The original checkout and access state remain authoritative for that order's purchased and consumed allowance.

Read order and continue its original nextAfter cursor for further calls. Read executions with the selected offer and native cursor, then execution for one retained execution's metadata. These operations inspect the actual saved application results.

Use access to suspend, resume, set expiry or clear expiry with the actual accessRevision. Supply expiresAt for expire. For call recovery, retain the actual offer/order/request ID, callRevision and reason, then use recover_call or release_call. The original recovery engine determines the resulting allowance and call state.

### Export usage and full execution results

Use export_usage for the selected original order, or export_result for its actual saved execution. Wait for the original operation's completion and select its returned export ID.

Call manifest to inspect the full original member identities. Receive that complete export with the typed client. Native manifests preserve their original metadata, including native paths; the downloader writes members by their validated relative names.

## 5. Use the typed client

Import the installed client through the package export:

~~~js
import {randomUUID} from 'node:crypto';
import {connectApiMerchantWorkspaceClient} from
  '@tokenjunkielabs/starforge-merchant/merchant/api-merchant-workspace/client';

const client = await connectApiMerchantWorkspaceClient({
  url: 'http://127.0.0.1:3211',
  workspace: 'primary',
  tokenEnv: 'MCP_ACCESS_TOKEN',
});

try {
  const current = await client.view();
  const functions = await client.allInventory('functions');
  const offers = await client.allInventory('offers');

  // Select this actual existing order from the original inventory.
  const orders = await client.allInventory('orders');
  const selected = orders.items.find(order => order.orderReference === 'existing-order');
  if (!selected) throw new Error('Select the intended original order.');

  const latest = await client.view();
  const request = {
    operationId: randomUUID(),
    expectedRevision: latest.revision,
    orderReference: selected.orderReference,
  };
  // Save request in the caller's existing work record before dispatch.
  const completed = await client.run('export_usage', request);
  if (completed.status !== 'COMPLETED') {
    throw new Error('Inspect saved operation ' + completed.id);
  }
  // Read completed.result for the original returned export ID.
} finally {
  await client.disconnect();
}
~~~

The installed declaration file accompanies this module. The source checkout path is stellar-forge/mcp-merchant-operator/api-merchant-client.mjs.

connectApiMerchantWorkspaceClient reads the original provider's workspace list when workspaceId is omitted and binds the returned original ID. Supply that ID explicitly when reopening an established connection.

For an existing structured tool transport, use discoverApiMerchantWorkspaces({call}), then createApiMerchantWorkspaceClient({workspace, workspaceId, call, endpoint}). The call function receives the original full tool name, validated arguments and request options, and returns the structured tool result. The endpoint is the stable identity of that existing MCP connection.

The caller's disconnect waits for its accepted requests. It does not own the original merchant listener, gateway or worker. Stop the native service through its original console operation, and close Applications or its native serving process through their normal lifecycle.

## 6. Receive every export byte and reopen it offline

Use the returned original export ID and full manifest SHA. This example receives through the same bound client:

~~~js
const original = await client.manifest({exportId});
const originalEndpoint = client.endpoint;
const originalWorkspaceId = client.workspaceId;
const originalManifestSha256 = original.manifestFile.sha256;
const result = await client.downloadExport({
  exportId,
  directory: '/srv/received/api-export',
  expectedManifestSha256: original.manifestFile.sha256,
  onProgress: event => {
    // Feed event.file, event.bytes and event.total into the existing task UI.
  },
});
~~~

Retain client.endpoint, client.workspaceId, the export ID and original.manifestFile.sha256 in the existing delivery record with the receiving directory. Use the exact endpoint returned by the original transport, including its URL normalization or structured-transport identity.

The receiver writes private partial files and a durable download-state checkpoint. It verifies each complete file's length and SHA256 before publishing that member, and publishes the original completion manifest last. Every member can be up to 4 GiB; the original manifest can be up to 1 MiB. File chunks are at most 196,608 bytes. The original file reader permits four retained reads per workspace attachment and expires idle descriptors after 120 seconds.

Continue an interrupted download by calling the same method with the same directory, original export ID and manifest SHA. Retain the same endpoint, alias and original workspace ID. A client or MCP restart reopens a verified original read at its saved byte offset. A completed member is verified and reused. The console can stay stopped while its original export files are being received.

For standalone HTTP receiving, use downloadApiMerchantExport with url, workspace, workspaceId, exportId, directory and expectedManifestSha256. inspectApiMerchantExportDownload reads the complete original manifest without creating a download directory.

Reopen completed files with no network or running console:

~~~js
import {reopenApiMerchantExportDownload} from
  '@tokenjunkielabs/starforge-merchant/merchant/api-merchant-workspace/client';

const reopened = await reopenApiMerchantExportDownload({
  directory: '/srv/received/api-export',
  workspace: 'primary',
  workspaceId: originalWorkspaceId,
  expectedManifestSha256: originalManifestSha256,
  endpoint: originalEndpoint,
});
~~~

Offline reopen verifies the saved endpoint/alias/workspace binding, complete manifest and every original member. It returns the original export ID, kind, file count and complete byte total. The native source files remain independently retained at their original console.

## 7. Restore a complete encrypted backup

The backup action drains the selected original worker/gateway, captures the complete configured application/data roots, original merchant state, execution history and checkout outbox, then encrypts the receiving bundle. Its resumeService field selects whether the original service resumes afterward.

Receive the backup's complete native export. Keep its encrypted ZIP, companion backup.json and receiving guide together. Extract the ZIP into a private directory using the instructions in that original guide. The bundle includes encrypted native snapshot and sidecar material; the companion metadata fixes their exact identities.

For direct native receiving:

~~~sh
starforge api-merchant-workspace restore-bundle \
  --bundle /srv/received/backup/bundle \
  --metadata /srv/received/backup/backup.json \
  --out /srv/received/restored-runtime \
  --pass-env MERCHANT_RECOVERY_PASSPHRASE \
  --expected-metadata-sha256 FULL_BACKUP_JSON_SHA256
~~~

To expose this same receiving operation through MCP, add a named receiving selection to the original connection file:

~~~json
{
  "recovered": {
    "label": "Received original application",
    "bundle": "/srv/received/backup/bundle",
    "metadataFile": "/srv/received/backup/backup.json",
    "out": "/srv/received/restored-runtime",
    "passEnv": "MERCHANT_RECOVERY_PASSPHRASE",
    "metadataSha256": "FULL_BACKUP_JSON_SHA256"
  }
}
~~~

This object is the receiving field for the selected workspace. Restart the attachment to read the updated host selections. The output parent must exist and be private; each receiving handle selects its own destination. Supply the passphrase in the original host environment. Optional python selects the original Python executable.

Read selections to review its backup/offer IDs and complete metadata/snapshot/sidecar hashes. Call restore_bundle with workspace, receiving: "recovered" and that expectedMetadataSha256. This calls the same original direct restore command. It retains the original purchased plan, merchant state, application executions and captured checkout outbox, then returns the native receiving result.

Repeating a completed exact receiving selection reopens that same snapshot. An incomplete existing standalone destination is preserved and reported; use the original restore result and native recovery path to finish that actual receiving situation.

The console's separate restore action operates one of its own saved backups through the original durable operation queue. Its completed result includes actual order mappings. Orders whose current terms and original pass-store match the captured backup map to the restored offer. Newer or changed orders remain with their current offer.

## Complete tool catalog

All names start with merchant_api_console_.

| Tools | Original workflow |
| --- | --- |
| workspaces, new_id | Select a native workspace and allocate a retained operation UUID. |
| view, inventory, selections, preview | Review source, complete native collections and actual host selections. |
| source_refresh, offer_prepare, offer_publish, offer_adopt | Refresh selected source and operate prepared or existing offers. |
| order_prepare, order_adopt, attach_pass | Prepare original checkout delivery and use original purchased access. |
| start, stop | Own the original worker/gateway service pair through the console. |
| access, recover_call, release_call | Apply actual access and saved-call revisions. |
| operation, resume, cancel | Reopen and continue the original durable operation. |
| offer, order, executions, execution | Inspect original offers, allowance, call pages and execution metadata. |
| export_usage, export_result, backup, restore | Produce complete native deliveries and receive the console's saved backup. |
| manifest, file, file_release | Receive exact original native bytes through retained descriptors. |
| restore_bundle | Receive a host-declared extracted encrypted bundle using original full metadata. |

The provider configuration and types are source owned. The same runtime registration, native operation semantics, complete file contracts and original lifecycle are shared by the installed product, local structured callers and remote MCP clients.
